/* =========================================================================
 * 3Dビュー: エントリポイント
 *   engine.js (window.CompileEngine) をルール担当として、描画と入力だけを担う。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { createStage } from './stage.js';
import { createBoard, visualFingerprint } from './board.js';
import { createControlMarker } from './control.js';
import { createPanels } from './panel.js';
import { runSetup } from './setup.js';
import { runTitle } from './title.js';
import * as ROOM from './room.js';
import { runRoomLobby } from './roomui.js';
import { faceImageURL, ART_SETS } from './cardtex.js';
import * as FX from './fx.js';
import { buildArena } from './arena.js';
import { initAudio, sfx, setMuted, isMuted, startBgm, stopBgm, setBgmTension, bgmActive } from './audio.js';
import { emblemDataURL } from './emblems.js';
import * as LAYOUT from './layout.js';
import { BOARD, CARD, COLOR, TIMING } from './theme.js';
import * as TW from './tween.js';
import * as UI from './ui.js';

const Engine = window.CompileEngine;
const ME = 0;      // 視点 = 人間プレイヤー
const AI = 1;

let stage, board, panels, defIndex = {}, protoIndex = {};
let cur = null;                 // { state, requests, log, winner }
let busy = false;               // 演出中はクリックを無視
let selectedUid = null;
let hoverUid = null;
let ctrlMarker = null;
let backFacing = false;         // Shift 相当: 裏向きでプレイ
let pads = [];                  // 着地パッド (line × side)
let demoMode = false;           // AI 同士の観戦 (?demo=1)
let roomMode = false;           // オンライン対戦 (secure-room)
let roomRm = null;              // 直近の publicState
let roomTracker = null;         // trace の差分追跡
let roomPollTimer = null;

/* 表示用の状態。
   engine は選択待ちで中断すると state に「アクション前の基準状態」を返し、
   途中経過は view に入れる。盤面の描画・HUD は必ずこちらを見る。
   一方 apply / legalActions に渡すのは基準状態 (cur.state) の方。 */
function shown() { return (cur && (cur.view || cur.state)) || null; }

/* 合法手: ソロはエンジン、ルームはサーバー提供値 */
function legalNow() {
  if (roomMode) return (roomRm && roomRm.legalActions) || [];
  if (!cur || cur.state.turn !== ME || cur.requests.length || cur.state.winner !== null) return [];
  return Engine.legalActions(cur.state);
}

/* ライン合計: ルーム状態はサーバー計算値 (_totals) を持つ */
function totalOf(st, line, side) {
  return st._totals ? st._totals[line][side] : Engine.lineTotal(st, line, side);
}

/* ---------- 起動 ---------- */
boot().catch((e) => {
  console.error(e);
  UI.toast('初期化に失敗: ' + e.message, 6000);
});

async function boot() {
  const T0 = performance.now();
  const mark = (label) => { window.__bootMarks = window.__bootMarks || []; window.__bootMarks.push(label + ':' + Math.round(performance.now() - T0)); };
  const [cards, effects] = await Promise.all([
    fetch('data/cards.json').then(r => r.json()),
    fetch('data/effects.json').then(r => r.json())
  ]);
  for (const p of cards.protocols) {
    protoIndex[p.name] = p;
    for (const c of p.cards) {
      defIndex[c.id] = {
        id: c.id, proto: p.name, color: p.color, number: c.number, set: p.set,
        value: c.value, upper: c.upper, middle: c.middle, lower: c.lower,
        effectTypes: c.effectTypes || []
      };
    }
  }
  mark('fetch');
  Engine.init(cards, effects);
  Engine.setAiLevel(1);
  /* trace を有効にすると、どのカードが効果を発動したかを演出に使える。
     AI 探索中は重くなるので、思考の直前だけ切る (withoutTrace)。 */
  Engine.setTrace(true);
  mark('engineInit');

  stage = createStage(document.getElementById('stage'));
  ctrlMarker = createControlMarker(stage.scene);
  stage.onFrame((dt) => ctrlMarker.tick(dt));
  board = createBoard(stage, defIndex, ME, {
    onCompile: async (info) => {
      /* まず盤上のプロトコルカードを "Compiled" 面へ裏返し、その後にカットイン */
      await panels.flipAt(info.line, info.side, true);
      await UI.compileCutIn({
        ...info,
        art: glitchArtUrl(info.name),
        emblem: emblemDataURL(info.name, info.color, 512, true)
      });
    }
  });
  buildArena(stage);
  FX.createDust(stage, 900);
  panels = createPanels(stage, ME);
  buildPads();
  bindInput();
  mark('stage');

  const params = new URLSearchParams(location.search);
  demoMode = params.get('demo') === '1';
  const pick = (key, fallback) => {
    const v = params.get(key);
    const list = v ? v.split(',').map(s => s.trim().toUpperCase()).filter(n => protoIndex[n]) : [];
    return list.length === 3 ? list : fallback;
  };
  let p0 = pick('me', null);
  let p1 = pick('ai', null);

  if (demoMode && !p0) {
    const pool = cards.protocols.map(x => x.name);
    const draw = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    p0 = [draw(), draw(), draw()];
    p1 = p1 || [draw(), draw(), draw()];
    document.body.classList.add('demo');
  }

  /* URL で指定がなければ、タイトル → 選択画面 (オンラインもここから) */
  if (!p0) {
    const bootEl0 = document.getElementById('boot');
    bootEl0.classList.add('gone');
    setTimeout(() => { bootEl0.style.display = 'none'; }, 800);
    if (params.get('title') !== '0') await runTitle(cards.protocols);
    for (;;) {
      const chosen = await runSetup(cards.protocols);
      if (!chosen.online) {
        p0 = chosen.me;
        p1 = p1 || chosen.ai;
        applyAiDifficulty(chosen.level);
        break;
      }
      /* オンライン対戦へ */
      try {
        await ROOM.roomLoadDeps();
      } catch (e) { UI.toast('オンライン機能を読み込めませんでした'); continue; }
      if (!ROOM.roomConfigured()) { UI.toast('オンライン対戦は未設定です (secure-room-config.js)'); continue; }
      const result = await runRoomLobby(cards.protocols);
      if (!result) continue;            // 戻る → ソロ設定へ
      document.getElementById('boot').style.display = 'none';
      await roomEnterGame(result.rm);
      return;                            // 以降はポーリング駆動
    }
  }

  const res = Engine.newGame({ seed: (Math.random() * 1e9) | 0, p0, p1, first: 0 });
  cur = res;
  window.__3d = {
    stage, board, THREE, LAYOUT,
    get cur() { return cur; },
    /* 動作確認用: 盤面をコードから進める */
    play: (uid, line, faceUp) => step({ type: 'play', card: uid, line, faceUp: faceUp !== false }),
    legal: () => Engine.legalActions(cur.state),
    diag: () => ({ busy, selectedUid, tweens: TW.activeCount(), marks: window.__bootMarks }),
    /* 演出だけを再生して確認する (盤面の状態は変えない) */
    testCompile: (line, side) => {
      const st = shown();
      const next = JSON.parse(JSON.stringify(st));
      next.players[side].protocols[line].compiled = true;
      return board.compileSequence(st, next, {
        side, line, name: st.players[side].protocols[line].name
      });
    },
    timing: TIMING,
    testResult: async (win) => { await finaleFx(!!win); await UI.resultCutIn(!!win); },
    /* 合成した publicState を流し込んでルーム描画経路を検証する (ポーリングなし) */
    testRoomView: async (rm, instant) => {
      roomMode = true;
      if (!roomTracker) roomTracker = ROOM.createTraceTracker();
      await roomApplyView(rm, instant !== false);
    },
    /* キャンバスを取り出す (記録・共有用)。
       preserveDrawingBuffer を有効にしてあるので、いつ呼んでも直前の描画が残っている。 */
    capture: (quality) => {
      const src = stage.renderer.domElement;
      if (quality === undefined) return src.toDataURL('image/png');
      const w = 960, h = Math.round(w * src.height / src.width);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(src, 0, 0, w, h);
      return cv.toDataURL('image/jpeg', quality);
    }
  };
  mark('newGame');
  board.syncInstant(shown());
  mark('sync');
  const bootEl = document.getElementById('boot');
  bootEl.classList.add('gone');
  /* タブが裏だと CSS トランジションが凍るので、確実に取り除く */
  setTimeout(() => { bootEl.style.display = 'none'; }, 800);

  await stage.home(0);
  refreshHud();
  await drainRequests();
  await afterTurn();
}

/* 着地パッドの意匠: 角丸の枠 + 内側のごく薄い塗り */
function padTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const pad = 10, r = 26, w = S - pad * 2;
  const round = (x, y, ww, hh, rr) => {
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
    ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
    ctx.arcTo(x, y + hh, x, y, rr);
    ctx.arcTo(x, y, x + ww, y, rr);
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  round(pad, pad, w, w, r); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = 7;
  round(pad, pad, w, w, r); ctx.stroke();
  /* 四隅のマーカー */
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 12;
  const c = 46;
  const corners = [[pad, pad, 1, 1], [S - pad, pad, -1, 1], [pad, S - pad, 1, -1], [S - pad, S - pad, -1, -1]];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * c, y);
    ctx.lineTo(x + dx * 14, y);
    ctx.moveTo(x, y + dy * c);
    ctx.lineTo(x, y + dy * 14);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* コンパイル面のアート (art/Fire_Glitched.webp 等)。未生成のプロトコルは null */
function glitchArtUrl(protoName) {
  const cap = protoName.charAt(0) + protoName.slice(1).toLowerCase();
  return protoIndex[protoName] && ART_SETS.has(protoIndex[protoName].set)
    ? 'art/' + cap + '_Glitched.webp'
    : null;
}

/* 難易度 → エンジン設定。
   auto-play と同じく上位2段は探索AI。最強は思考時間増 + DSH特化戦略 */
function applyAiDifficulty(level) {
  if (level <= 0) {
    Engine.setAiLevel(1);                        // かんたん: ヒューリスティックのみ
  } else if (level === 1) {
    Engine.setAiLevel(2);                        // ふつう: 探索 590ms
  } else {
    Engine.setAiLevel(2);
    Engine.setAiThinkBudget(1200);               // つよい/最強: 思考時間2倍
  }
  if (Engine.setAiSpecialist) Engine.setAiSpecialist(level >= 3, 1);
}

/* ---------- 着地パッド (ラインの当たり判定 + 視覚) ---------- */
function buildPads() {
  const geo = new THREE.PlaneGeometry(CARD.w * 1.34, CARD.h * 1.2);
  geo.rotateX(-Math.PI / 2);
  const tex = padTexture();
  for (let line = 0; line < 3; line++) {
    for (let side = 0; side < 2; side++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: side === ME ? COLOR.mint : COLOR.pink,
        transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const pad = new THREE.Mesh(geo, mat);
      const stackLen = 0;
      const slot = LAYOUT.stackSlot(line, side, stackLen, ME);
      pad.position.set(slot.pos[0], 0.006, slot.pos[2]);
      pad.userData = { line, side, isPad: true, pulse: 0 };
      pad.renderOrder = 2;
      stage.scene.add(pad);
      pads.push(pad);
    }
  }
  stage.onFrame((dt, t) => {
    for (const pad of pads) {
      if (pad.userData.pulse <= 0) { pad.material.opacity += (0 - pad.material.opacity) * 0.2; continue; }
      const base = pad.userData.pulse;
      pad.material.opacity = pad.userData.hover
        ? 1.0
        : base * (0.62 + 0.38 * Math.sin(t * 4.4 + pad.userData.line));
      const s = pad.userData.hover ? 1.12 : 1;
      pad.scale.set(s, 1, s);
    }
  });
}

/* 選択中カードの着地候補を光らせる */
function updatePads() {
  const st = cur && cur.state;   // 合法手の判定は基準状態で行う
  for (const pad of pads) pad.userData.pulse = 0;
  if (!st || busy || selectedUid === null || cur.requests.length) return;
  if ((roomMode ? shown() : st).turn !== ME) return;

  for (const pad of pads) {
    const { line, side } = pad.userData;
    const ok = canPlaceHere(st, selectedUid, line, side);
    if (!ok) continue;
    pad.userData.pulse = ok === 'faceUp' ? 0.95 : 0.6;
    /* 積み上がった高さに追従させる */
    const idx = st.lines[line][side].length;
    const slot = LAYOUT.stackSlot(line, side, idx, ME);
    pad.position.set(slot.pos[0], 0.006 + idx * BOARD.coverLift, slot.pos[2]);
  }
}

function canPlaceHere(st, uid, line, side) {
  const acts = legalNow();
  for (const a of acts) {
    if (a.type !== 'play' || a.card !== uid || a.line !== line) continue;
    const aSide = a.side === undefined ? st.turn : a.side;
    if (aSide !== side) continue;
    if (a.faceUp && !backFacing) return 'faceUp';
    if (!a.faceUp && backFacing) return 'faceDown';
    if (a.faceUp) return 'faceUp';
  }
  return null;
}

/* ---------- 入力 ---------- */
function bindInput() {
  const el = stage.renderer.domElement;
  /* 最初の操作で音声を解錠しBGMを開始 (ブラウザの自動再生制限) */
  window.addEventListener('pointerdown', () => {
    initAudio();
    if (!isMuted() && !bgmActive()) startBgm();
  }, { once: false });
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(ev) {
    const r = el.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, stage.camera);
    const hits = ray.intersectObjects([...board.hitList(), ...pads], true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.uid && !o.userData.isPad) o = o.parent;
      if (o) return { obj: o, point: h.point };
    }
    return null;
  }

  /* ---- ドラッグ&ドロップ ----
     押下で選択、8px 以上動いたら掴んで指に追従、パッド上で離すとプレイ。
     動かさず離せばクリック選択のまま (従来操作も生きる)。 */
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.05);   // y=1.05 の空中面
  const dragPt = new THREE.Vector3();
  let drag = null;   // { uid, sx, sy, moved, lastX }

  function planePoint(ev) {
    const r = el.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, stage.camera);
    return ray.ray.intersectPlane(dragPlane, dragPt) ? dragPt : null;
  }

  /* ドラッグ位置の直下にある着地候補パッド */
  function padUnder(pt) {
    if (!pt) return null;
    for (const pad of pads) {
      if (pad.userData.pulse <= 0) continue;
      if (Math.abs(pt.x - pad.position.x) < 0.85 && Math.abs(pt.z - pad.position.z) < 1.1) return pad;
    }
    return null;
  }

  el.addEventListener('pointermove', (ev) => {
    if (busy) return;

    /* 掴んでいる間: カードを指に追従させ、パッドをホバー強調 */
    if (drag) {
      const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (!drag.moved && dx * dx + dy * dy > 64) drag.moved = true;
      if (drag.moved) {
        const pt = planePoint(ev);
        const card = board.cards.get(drag.uid);
        if (pt && card) {
          card.position.set(pt.x, 1.05, pt.z);
          const tilt = Math.max(-0.4, Math.min(0.4, (ev.clientX - drag.lastX) * 0.02));
          card.rotation.set(0.5, 0, -tilt);
          card.scale.setScalar(1.18);
          card.renderOrder = 7;
        }
        drag.lastX = ev.clientX;
        const over = padUnder(pt);
        for (const pad of pads) pad.userData.hover = (pad === over);
        el.style.cursor = over ? 'copy' : 'grabbing';
      }
      return;
    }

    const hit = pick(ev);
    const uid = hit && hit.obj.userData.uid;
    const st = shown();
    const inMyHand = uid && st && st.players[ME].hand.includes(uid);
    const next = inMyHand ? uid : null;
    if (next !== hoverUid) {
      const prev = hoverUid;
      hoverUid = next;
      if (prev && prev !== selectedUid) restHandCard(prev);
      if (hoverUid && hoverUid !== selectedUid) raiseHandCard(hoverUid);
      el.style.cursor = uid ? 'pointer' : 'default';
    }
    /* 盤面のカードは向きが読みにくいので、余白に拡大プレビュー */
    showPreview(uid);
  });

  /* カーソルが盤面から出たらプレビューを消す */
  el.addEventListener('pointerleave', () => showPreview(null));

  el.addEventListener('pointerdown', async (ev) => {
    /* タップ環境はホバーが無いので、触れたカードをまずプレビューする。
       操作できない場面 (相手ターン・選択待ち) でもテキストは読めるようにする */
    const hit = pick(ev);
    showPreview((hit && hit.obj.userData.uid) || null);
    if (demoMode || busy || !cur || shown().winner !== null) return;
    if (cur.requests.length || shown().turn !== ME) return;
    if (!hit) { deselect(); return; }

    const ud = hit.obj.userData;
    if (ud.uid && shown().players[ME].hand.includes(ud.uid)) {
      select(ud.uid === selectedUid ? null : ud.uid);
      if (selectedUid) {
        drag = { uid: selectedUid, sx: ev.clientX, sy: ev.clientY, moved: false, lastX: ev.clientX };
        el.setPointerCapture && el.setPointerCapture(ev.pointerId);
      }
      return;
    }
    if (ud.isPad && selectedUid) {
      await dropOnPad(ud);
    }
  });

  el.addEventListener('pointerup', async (ev) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    for (const pad of pads) pad.userData.hover = false;
    el.style.cursor = 'default';
    if (!d.moved) return;             // ただのクリック → 選択のまま

    const pt = planePoint(ev);
    const over = padUnder(pt);
    if (over && selectedUid === d.uid) {
      await dropOnPad(over.userData);
    } else {
      /* 掴んだが置けない場所 → 手札へ戻す (選択は維持) */
      const card = board.cards.get(d.uid);
      if (card) { card.renderOrder = 0; raiseHandCard(d.uid); }
    }
  });

  el.addEventListener('pointercancel', () => {
    if (!drag) return;
    const card = board.cards.get(drag.uid);
    if (card) { card.renderOrder = 0; restHandCard(drag.uid); }
    drag = null;
    for (const pad of pads) pad.userData.hover = false;
  });

  async function dropOnPad(ud) {
    const mode = canPlaceHere(cur.state, selectedUid, ud.line, ud.side);
    if (!mode) { UI.toast('そのラインにはプレイできません'); return; }
    const uid = selectedUid;
    deselect();
    const card = board.cards.get(uid);
    if (card) card.renderOrder = 0;
    const action = { type: 'play', card: uid, line: ud.line, faceUp: mode === 'faceUp' };
    if (ud.side !== cur.state.turn) action.side = ud.side;
    await step(action);
  }

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Shift') { backFacing = true; updatePads(); syncFacingHint(); }
    if (ev.key === 'Escape') deselect();
  });
  window.addEventListener('keyup', (ev) => {
    if (ev.key === 'Shift') { backFacing = false; updatePads(); syncFacingHint(); }
  });

  const refreshBtn = document.getElementById('btnRefresh');
  if (refreshBtn) refreshBtn.onclick = async () => {
    if (busy || !cur || shown().turn !== ME || cur.requests.length) return;
    const ok = legalNow().some(a => a.type === 'refresh');
    if (!ok) { UI.toast('いまは補充できません'); return; }
    deselect();
    await step({ type: 'refresh' });
  };
  const leaveBtn = document.getElementById('btnLeave');
  if (leaveBtn) leaveBtn.onclick = async () => {
    if (!roomMode) return;
    const st = shown();
    if (st && st.winner === null) {
      if (!confirm('投了して退出しますか？')) return;
      try { await ROOM.roomApi('action', { code: roomRm.code, version: roomRm.version, action: { type: 'surrender' } }); }
      catch (e) { /* 決着はサーバー側で確定する */ }
    }
    location.reload();                  // シーンを作り直すのが最も確実
  };
  const muteBtn = document.getElementById('btnMute');
  if (muteBtn) muteBtn.onclick = () => {
    initAudio();
    setMuted(!isMuted());
    muteBtn.textContent = isMuted() ? '🔇' : '🔊';
    muteBtn.classList.toggle('on', isMuted());
    if (isMuted()) stopBgm();
    else startBgm();
  };
  const faceBtn = document.getElementById('btnFace');
  if (faceBtn) faceBtn.onclick = () => { backFacing = !backFacing; updatePads(); syncFacingHint(); };
}

/* ---------- 拡大プレビュー (余白に固定表示) ---------- */
let previewUid = null;

function showPreview(uid) {
  const box = document.getElementById('preview');
  if (!box) return;
  const st = shown();
  const card = uid && st && st.cards[uid];
  const visible = card && card.def && (card.faceUp || ((card.knownTo || 0) & (1 << ME)));
  if (!visible) {
    if (previewUid !== null) { previewUid = null; box.classList.remove('show'); }
    return;
  }
  if (uid === previewUid) return;
  previewUid = uid;
  const def = defIndex[card.def];
  const url = def && faceImageURL(def);
  if (!url) { box.classList.remove('show'); return; }
  box.innerHTML = '<img alt="" src="' + url + '">';
  box.classList.add('show');
}

function syncFacingHint() {
  const b = document.getElementById('btnFace');
  if (b) {
    b.classList.toggle('on', backFacing);
    b.textContent = backFacing ? '裏向き' : '表向き';
  }
}

function raiseHandCard(uid) {
  const st = shown();
  const i = st.players[ME].hand.indexOf(uid);
  if (i < 0) return;
  const slot = LAYOUT.handSlotRaised(i, st.players[ME].hand.length);
  board.moveTo(board.cardOf(st, uid), slot, null, 150, TW.Ease.outCubic, 0);
}

function restHandCard(uid) {
  const st = shown();
  const i = st.players[ME].hand.indexOf(uid);
  if (i < 0) return;
  const slot = LAYOUT.handSlot(i, st.players[ME].hand.length);
  board.moveTo(board.cardOf(st, uid), slot, null, 170, TW.Ease.outCubic, 0);
}

function select(uid) {
  if (selectedUid && selectedUid !== uid) {
    board.clearHighlight(board.cardOf(shown(), selectedUid));
    restHandCard(selectedUid);
  }
  selectedUid = uid;
  if (uid) {
    sfx('select');
    raiseHandCard(uid);
    board.setHighlight(board.cardOf(shown(), uid), COLOR.cyan, 0.10, 0.55);
  }
  updatePads();
}

function deselect() { select(null); }

/* AI の思考中だけ trace を止める (state の clone が入って探索が重くなるため) */
function withoutTrace(fn) {
  Engine.setTrace(false);
  try { return fn(); } finally { Engine.setTrace(true); }
}

/* ==================== ルーム対戦 (オンライン) ==================== */

function roomValOf(defId) {
  const d = defId && defIndex[defId];
  return d ? d.value : 0;
}

/* サーバーの publicState を受けて、差分アニメ + HUD 更新まで行う */
async function roomApplyView(rm, instant) {
  const mayContinue = !!(roomRm && roomRm.code === rm.code && roomRm.request);
  const entries = roomTracker.take(rm, mayContinue, roomValOf);
  roomRm = rm;
  const prev = cur ? shown() : null;
  const st = ROOM.buildRoomState(rm, roomValOf);
  const nq = ROOM.normRequest(rm);
  cur = { state: st, requests: nq ? [nq] : [], log: rm.log || [], trace: entries, winner: st.winner, error: null };
  if (instant || !prev) {
    board.syncInstant(st);
  } else {
    busy = true;
    await replayResolution(prev, { trace: entries }, null);
    busy = false;
  }
  refreshHud();
  await afterTurn();          // roomMode 分岐: ターン告知と決着のみ
  await roomDrainRequest();
}

async function roomStep(action) {
  if (busy || !roomRm) return;
  busy = true;
  updatePads();
  try {
    const next = await ROOM.roomApi('action', { code: roomRm.code, version: roomRm.version, action });
    busy = false;
    await roomApplyView(next);
  } catch (e) {
    busy = false;
    UI.toast((e && e.message) || '通信エラー');
    await roomPoll(true);
  }
}

let roomAsking = false;
async function roomDrainRequest() {
  if (!roomMode || roomAsking) return;
  roomAsking = true;
  try {
    /* 選択に答えた直後にサーバが次のリクエストを返すことがあるため、
       尽きるまでループで処理する (roomStep 内からの再入は roomAsking が防ぐ) */
    let guard = 0;
    while (cur && cur.requests.length && shown().winner === null && guard++ < 40) {
      const req = cur.requests[0];
      UI.setPrompt(req.prompt || '選択してください', 'ask');
      const picks = await UI.askChoice(req, choiceCtx());
      UI.setPrompt('');
      await roomStep({ type: 'choose', id: req.id, picks });
    }
  } finally { roomAsking = false; }
}

async function roomPoll(force) {
  if (!roomMode || !roomRm) return;
  if (busy && !force) return;
  let next;
  try { next = await ROOM.roomApi('get', { code: roomRm.code }); } catch (e) { return; }
  if (next.version === roomRm.version && next.status === roomRm.status) {
    roomRm = next;
    await roomDrainRequest();          // 取りこぼしたリクエストの再開
    return;
  }
  await roomApplyView(next);
}

let roomResultShown = false;
async function roomMaybeFinish() {
  const st = shown();
  if (!st || st.winner === null || roomResultShown) return;
  roomResultShown = true;
  clearInterval(roomPollTimer);
  const win = st.winner === ME;
  UI.setPrompt(win ? 'あなたの勝ち' : '敗北', 'end');
  sfx(win ? 'win' : 'lose');
  await finaleFx(win);
  await UI.resultCutIn(win);
  UI.toast('決着。「退出」でロビーへ戻れます', 6000);
}

/* ロビーから playing の publicState を受けて対戦開始 */
async function roomEnterGame(rm) {
  roomMode = true;
  roomResultShown = false;
  lastTurn = null;
  roomTracker = ROOM.createTraceTracker();
  const leaveBtn = document.getElementById('btnLeave');
  if (leaveBtn) leaveBtn.style.display = '';
  await roomApplyView(rm, true);
  await stage.home(600);
  clearInterval(roomPollTimer);
  roomPollTimer = setInterval(() => { roomPoll(); }, 1300);
}

/* ---------- ターン / 効果の演出 ---------- */
let lastTurn = null;
let resultShown = false;

/* 決着の合図: 3ライン同時に光柱を立てて盤面を白く飛ばす */
async function finaleFx(win) {
  const accent = win ? COLOR.mint : COLOR.pink;
  /* 盤面中央を大きく回り込みながら締める */
  stage.cinematicHold(new THREE.Vector3(0, 0, 0), 3400, { radius: 5.2, height: 2.6, sweep: 1.5 });
  for (let i = 0; i < 3; i++) {
    FX.compilePillar(stage.scene, BOARD.laneX[i], accent, 1800);
  }
  FX.shockwave(stage.scene, new THREE.Vector3(0, 0, 0), accent, 9, 1200);
  FX.screenFlash(stage, win ? 0xffffff : 0xff3b9d, 760, 0.92);
  stage.shake(0.3, 900);
  await TW.wait(320);
}

async function announceTurn() {
  const st = shown();
  if (!st || st.winner !== null) return;
  if (st.turn === lastTurn) return;
  lastTurn = st.turn;
  sfx('turn');
  await UI.turnCutIn(st.turn === ME);
}

/* -------------------------------------------------------------------------
 * 効果解決のステップ再生
 *   engine の trace には各ログ時点の状態スナップショットが入っている。
 *   絵が変わるステップだけを拾って順に流すと、
 *   「反転 → 移動 → 削除」が一息に飛ばず、1つずつ見えるようになる。
 * ------------------------------------------------------------------------- */
const MAX_STEPS = 14;          // 長い連鎖はここで打ち切って最終状態へ飛ばす

function meaningfulSteps(prev, res) {
  if (!res || !res.trace || !res.trace.length) return [];
  const steps = [];
  let last = visualFingerprint(prev);
  for (const t of res.trace) {
    if (!t.st) continue;
    const fp = visualFingerprint(t.st);
    if (fp === last) {
      /* 絵は変わらないが、発動カードの合図だけは拾っておく */
      if (t.uid && steps.length) steps[steps.length - 1].alsoUid = steps[steps.length - 1].alsoUid || t.uid;
      continue;
    }
    last = fp;
    steps.push({ st: t.st, uid: t.uid, msg: t.msg });
  }
  return steps;
}

/* そのステップの主役カードを光らせ、効果テキストを出す */
async function cueFor(step, st) {
  const uid = step.uid || step.alsoUid;
  if (!uid) return;
  const card = st.cards[uid];
  const def = card && defIndex[card.def];
  if (!def) return;
  const text = def.middle || def.upper || def.lower;
  if (text) UI.showEffect(def.proto + ' ' + def.value, text, def.color, def.effectTypes);
  await board.pulse(uid, def.color, 380);
}

async function replayResolution(prev, res, action) {
  const steps = meaningfulSteps(prev, res);
  const final = shown();

  /* ステップが多すぎるときは間引いて、テンポを保つ */
  window.__lastSteps = steps.length;
  const use = steps.length > MAX_STEPS
    ? steps.filter((_, i) => i % Math.ceil(steps.length / MAX_STEPS) === 0)
    : steps;

  let from = prev;
  let first = true;
  for (const step of use) {
    await board.applyTransition(from, step.st, first ? action : null, { speed: 0.72 });
    await cueFor(step, step.st);
    from = step.st;
    first = false;
  }
  /* 最後は必ず本物の状態へ合わせる */
  await board.applyTransition(from, final, first ? action : null, first ? null : { speed: 0.72 });
}

/* ---------- 進行 ---------- */
async function step(action) {
  if (roomMode) { await roomStep(action); return; }
  if (busy) return;
  busy = true;
  updatePads();
  const prev = shown();
  const res = Engine.apply(cur.state, action);
  if (res.error) {
    UI.toast(res.error);
    busy = false;
    return;
  }
  cur = res;
  if (!res.requests.length) UI.pushLog(res.log);
  await replayResolution(prev, res, action);
  refreshHud();
  busy = false;
  await drainRequests();
  await afterTurn();
}

/* 選択要求を処理し切る */
async function drainRequests() {
  if (roomMode) { await roomDrainRequest(); return; }
  let guard = 0;
  while (cur && cur.requests && cur.requests.length && guard++ < 80) {
    const req = cur.requests[0];
    let picks;
    if (req.player === ME && !demoMode) {
      UI.setPrompt(req.prompt || '選択してください', 'ask');
      picks = await UI.askChoice(req, choiceCtx());
    } else {
      UI.setPrompt('相手が選択しています…', 'wait');
      await TW.wait(260);
      picks = withoutTrace(() => Engine.ai.answer(cur.state, req));
    }
    const prev = shown();
    busy = true;
    const res = Engine.apply(cur.state, { type: 'choose', id: req.id, picks });
    if (res.error) { UI.toast(res.error); busy = false; break; }
    cur = res;
    if (!res.requests.length) UI.pushLog(res.log);
    await replayResolution(prev, res, null);
    busy = false;
    refreshHud();
  }
  UI.setPrompt('');
  await stage.home(TIMING.camEase);
}

/* AI のターンを回す */
async function afterTurn() {
  if (roomMode) { await announceTurn(); await roomMaybeFinish(); return; }
  await announceTurn();
  let guardAi = 0;
  while (cur && cur.state.winner === null && (demoMode || cur.state.turn === AI)
         && !cur.requests.length && guardAi++ < 40) {
    UI.setTurnBadge(demoMode ? 'DEMO 自動対戦' : '相手のターン', cur.state.turn === ME);
    await TW.wait(demoMode ? 420 : 260);
    const action = withoutTrace(() => Engine.ai.action(cur.state));
    if (!action) break;
    await step(action);
    return;   // step が再帰的に afterTurn を呼ぶ
  }
  refreshHud();
  if (cur.state.winner !== null && !resultShown) {
    resultShown = true;
    const win = cur.state.winner === ME;
    UI.setPrompt(win ? 'あなたの勝ち' : '敗北', 'end');
    sfx(win ? 'win' : 'lose');
    await finaleFx(win);
    await UI.resultCutIn(win);
    if (demoMode) {
      await TW.wait(900);
      location.reload();
    }
  }
}

/* ---------- HUD ---------- */
function refreshHud() {
  const st = shown();
  if (ctrlMarker) {
    /* コントロール変種を使わない対戦ではマーカーを隠す */
    ctrlMarker.group.visible = st.useControl !== false;
    ctrlMarker.update(typeof st.control === 'number' ? st.control : -1, ME, true);
  }
  const rows = [];
  for (let line = 0; line < 3; line++) {
    rows.push({
      meTotal: totalOf(st, line, ME),
      oppTotal: totalOf(st, line, AI),
      meProto: st.players[ME].protocols[line].name,
      oppProto: st.players[AI].protocols[line].name,
      compiledMe: st.players[ME].protocols[line].compiled,
      compiledOpp: st.players[AI].protocols[line].compiled
    });
  }
  UI.renderLines(rows);
  UI.renderProgress(
    st.players[ME].protocols.filter(p => p.compiled).length,
    st.players[AI].protocols.filter(p => p.compiled).length
  );
  updateBgmTension(st);
  panels.update([0, 1, 2].map((line) => {
    const cell = (side) => {
      const proto = st.players[side].protocols[line];
      const meta = protoIndex[proto.name] || {};
      return {
        name: proto.name,
        total: totalOf(st, line, side),
        color: meta.color || '#63f3ff',
        set: meta.set,
        compiled: proto.compiled
      };
    };
    return [cell(0), cell(1)];
  }));
  UI.setCounts(
    { deck: st.players[ME].deck.length, trash: st.players[ME].trash.length, hand: st.players[ME].hand.length },
    { deck: st.players[AI].deck.length, trash: st.players[AI].trash.length, hand: st.players[AI].hand.length }
  );
  const mine = st.turn === ME && st.winner === null;
  const oppName = roomMode && roomRm && roomRm.names ? (roomRm.names[1 - roomRm.side] || '相手') : '相手';
  UI.setTurnBadge(st.winner !== null ? '決着' : (mine ? 'あなたのターン' : oppName + 'のターン'), mine);
  const oppLabel = document.querySelector('#oppCounts div:first-child');
  if (oppLabel) oppLabel.textContent = roomMode ? oppName : 'OPPONENT';
  syncFacingHint();

  const acts = mine && !cur.requests.length ? legalNow() : [];
  if (mine && !cur.requests.length) {
    const playable = new Set(acts.filter(a => a.type === 'play').map(a => a.card));
    board.highlightPlayable(st, Array.from(playable));
  } else {
    board.highlightPlayable(st, []);
  }

  /* 打てる札がなく補充しか残っていないときは、ボタンで誘導する */
  const refreshBtn = document.getElementById('btnRefresh');
  if (refreshBtn) {
    const onlyRefresh = acts.length > 0 && acts.every(a => a.type === 'refresh');
    refreshBtn.classList.toggle('urge', onlyRefresh);
    if (onlyRefresh) UI.setPrompt('プレイできるカードがありません。リフレッシュしてください', 'ask');
  }
  updatePads();
}

function cardName(idOrUid) {
  const st = shown();
  const d = defIndex[idOrUid] || (st.cards[idOrUid] && defIndex[st.cards[idOrUid].def]);
  /* 表記は cardlist.html / auto-play.html と揃える: プロトコル名 + 値 */
  return d ? d.proto + ' ' + d.value : null;
}

/* 盤面の切迫度から BGM の緊張度を決める:
   最大ライン合計が 10 に近いほど、コンパイル済みが多いほど高い */
function updateBgmTension(st) {
  if (!bgmActive()) return;
  let maxLine = 0, compiled = 0;
  for (let side = 0; side < 2; side++) {
    compiled += st.players[side].protocols.filter(p => p.compiled).length;
    for (let line = 0; line < 3; line++) maxLine = Math.max(maxLine, totalOf(st, line, side));
  }
  const t = Math.min(1, (maxLine / 10) * 0.6 + (compiled / 6) * 0.4);
  setBgmTension(t);
}

function choiceCtx() {
  return {
    cardName,
    cardLabel: (cand) => {
      /* play-free 等は "uid|line|facing" の複合候補 */
      if (String(cand).indexOf('|') >= 0) {
        const p = String(cand).split('|');
        const name = cardName(p[0]) || '裏向きのカード';
        return name + ' <small>→ ライン' + (+p[1] + 1) + ' / ' + (p[2] === 'u' ? '表向き' : '裏向き') + '</small>';
      }
      const c = shown().cards[cand];
      const d = c && defIndex[c.def];
      if (!d) return '裏向きのカード';
      return d.proto + ' ' + d.value;
    },
    lineLabel: (l) => shown().players[ME].protocols[l].name,
    protoName: (i) => shown().players[ME].protocols[i].name,
    onHoverCandidate: (cand, on) => {
      const uid = String(cand).split('|')[0];
      const card = board.cards.get(uid);
      if (!card) return;
      if (on) board.setHighlight(card, COLOR.gold, 0.28, 0.9);
      else board.clearHighlight(card);
    }
  };
}
