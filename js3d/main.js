/* =========================================================================
 * 3Dビュー: エントリポイント
 *   engine.js (window.CompileEngine) をルール担当として、描画と入力だけを担う。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { createStage } from './stage.js';
import { createBoard, visualFingerprint, locOf } from './board.js';
import { createControlMarker } from './control.js';
import { createPanels } from './panel.js';
import { runSetup } from './setup.js';
import { runTitle } from './title.js';
import * as ROOM from './room.js';
import { runRoomLobby } from './roomui.js';
import { reqText } from './prompts.js';
import { faceImageURL, activationImageURL, pruneFaceCache, ART_SETS } from './cardtex.js';
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
  ctrlMarker.group.visible = false;          // 対戦開始 (refreshHud) まで隠す
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

  /* 前の対局で使ったプロトコルのテクスチャを解放してから始める */
  const keepIds = ['__unknown__'];
  for (const name of p0.concat(p1)) {
    for (const id of Object.keys(defIndex)) if (defIndex[id].proto === name) keepIds.push(id);
  }
  pruneFaceCache(keepIds);
  const res = Engine.newGame({ seed: (Math.random() * 1e9) | 0, p0, p1, first: 0 });
  cur = res;
  window.__3d = {
    stage, board, THREE, LAYOUT,
    get cur() { return cur; },
    /* 動作確認用: 盤面をコードから進める */
    play: (uid, line, faceUp) => step({ type: 'play', card: uid, line, faceUp: faceUp !== false }),
    legal: () => Engine.legalActions(cur.state),
    diag: () => ({ busy, selectedUid, tweens: TW.activeCount(), marks: window.__bootMarks }),
    arrange: (req) => arrangeOnBoard(req),
    pickTest: (req) => pickOnBoard(req),
    fp: (st) => visualFingerprint(st),
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
    /* 盤面対象選択モード中はタップを選択として扱う。
       ラインの判定はメッシュに頼らず、盤面平面の座標から最寄りレーンを取る
       (パネルやパッドの当たり判定に依存しない) */
    const laneFromEvent = () => {
      const pt = planePoint(ev);
      if (!pt || Math.abs(pt.z) > 3.4) return null;
      let bl = null, bd = 1.1;
      BOARD.laneX.forEach((x, i) => {
        const dd = Math.abs(pt.x - x);
        if (dd < bd) { bd = dd; bl = i; }
      });
      return bl;
    };
    if (boardPick && boardPick.kind === 'free') {
      const uid2 = hit && hit.obj.userData.uid;
      if (uid2 && boardPick.byUid[uid2]) { tapFreePick({ uid: uid2 }); return; }
      if (boardPick.sel) {
        const line = laneFromEvent();
        if (line !== null) tapFreePick({ isPad: true, line });
      }
      return;
    }
    if (boardPick && boardPick.kind === 'line') {
      const line = laneFromEvent();
      if (line !== null && boardPick.lines.indexOf(line) >= 0) finishLinePick(boardPick.toPicks(line));
      return;
    }
    if (boardPick && hit && hit.obj.userData.uid) {
      toggleBoardPick(hit.obj.userData.uid);
      return;
    }
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
      return;
    }
    /* スタックが伸びるとパッドがカードに覆われてタップできないため、
       選択中は盤面カードへのタップも「そのラインへのプレイ」として扱う */
    if (selectedUid && ud.uid) {
      const loc = locOf(shown(), ud.uid);
      if (loc && loc.zone === 'field') {
        await dropOnPad({ line: loc.line, side: loc.side });
      }
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
    /* 存在するが見えないカード (相手の裏向き等) は「非公開」の案内を出す。
       無反応だと壊れて見えるため */
    if (card) {
      if (uid === previewUid) return;
      previewUid = uid;
      box.innerHTML = '<div class="pv-hidden"><b>FACE DOWN</b>' +
        '<span>非公開のカード</span><span>盤面では値2として扱う</span></div>';
      box.classList.add('show');
      return;
    }
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
  /* サーバー側の状態が進んだら、進行中の待ち受けUI (盤面ピック/並べ替え/
     モーダル) は破棄して取り直す (放置すると古い req.id で答えて desync する) */
  cancelPendingAsk();
  /* 続き再生は同じルームなら常に試す。従来は「自分宛リクエスト継続中」に
     限定していたため、相手の多段解決ではポーリングのたびにアクション頭から
     フル再生され、盤面が巻き戻って見えた。安全性は traceKey の前方一致が担保 */
  const mayContinue = !!(roomRm && roomRm.code === rm.code);
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
      UI.setPrompt(reqText(req, cardName) || '選択してください', 'ask');
      const picks = await askUser(req);
      UI.setPrompt('');
      if (picks === PICK_CANCEL) continue;   // 外部更新で取り直し
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
  const shownFp = visualFingerprint(prev);
  const steps = [];
  let last = shownFp;
  for (const t of res.trace) {
    if (!t.st) continue;
    const fp = visualFingerprint(t.st);
    if (fp === last) {
      /* 絵は変わらないが、発動カードの合図だけは拾っておく */
      if (t.uid && steps.length) steps[steps.length - 1].alsoUid = steps[steps.length - 1].alsoUid || t.uid;
      continue;
    }
    last = fp;
    steps.push({ st: t.st, fp, uid: t.uid, msg: t.msg });
  }
  /* 選択に答えると、エンジンはアクションを基準状態から再実行する。
     頭から再生すると盤面が巻き戻って見えるので、いま画面に出ている絵と
     一致する最後のステップまで早送りし、その続きだけを再生する */
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].fp === shownFp) return steps.slice(i + 1);
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
  /* 見る権利のないカード (相手の裏向きプレイ等) の正体をカットインで
     晒さない。演出はパルスだけに留める */
  const visible = card.faceUp || ((card.knownTo || 0) & (1 << ME));
  if (!visible) { await board.pulse(uid, def.color, 380); return; }
  /* trace のメッセージからどの段が発動したかを読み取る */
  const msg = step.msg || '';
  let zone = null;
  if (msg.indexOf('中段') >= 0) zone = 'middle';
  else if (msg.indexOf('上段') >= 0) zone = 'upper';
  else if (msg.indexOf('下段') >= 0) zone = 'lower';
  const text = zone ? def[zone] : (def.middle || def.upper || def.lower);
  if (text) {
    UI.showActivation({
      img: (zone && activationImageURL(def, zone)) || faceImageURL(def),
      text, zone, color: def.color
    });
  }
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
/* 選択リクエストをユーザーに聞く。盤面の直接タップを優先し、
   使えない状況ではモーダルにフォールバックする */
async function askUser(req) {
  if (req.kind === 'arrange' && Array.isArray(req.current) && req.current.length === 3) {
    for (let hop = 0; hop < 10; hop++) {
      const picks = await arrangeOnBoard(req);
      if (picks === PICK_CANCEL) return PICK_CANCEL;
      if (picks) return picks;
      const m = await UI.askChoice(req, choiceCtx());
      if (m !== '__board__') return m;      // 「盤面で選ぶに戻る」でループ
    }
  }
  if (req.kind === 'pickCard' || req.kind === 'pickHand' || req.kind === 'pickLine'
      || (req.kind === 'option' && req.prompt === 'play-dest')) {
    const picks = await pickOnBoard(req);
    if (picks === PICK_CANCEL) return PICK_CANCEL;
    if (picks) return picks;
  }
  return UI.askChoice(req, choiceCtx());
}

/* 対象選択を盤面の直接タップで行う。
   候補が盤面/手札のカードそのものなら、モーダルを出さずに
   候補をハイライトしてタップで選ばせる。null ならモーダルへ */
let boardPick = null;
const PICK_CANCEL = '__pickCancel__';   // 外部要因 (ポーリング等) による中断
let activeArrange = null;               // 表示中の並べ替えオーバーレイ

/* 表示中の待ち受けUI (盤面ピック / 並べ替え / モーダル) をすべて破棄する */
function cancelPendingAsk() {
  cancelBoardPick();
  if (activeArrange) activeArrange.cancel();
  UI.cancelChoice(PICK_CANCEL);
}

function cancelBoardPick() {
  if (!boardPick) return;
  const bp = boardPick;
  boardPick = null;
  board.clearCandidates();
  for (const pad of pads) pad.userData.hover = false;
  const el = document.getElementById('pickBar');
  if (el) el.remove();
  bp.resolve(PICK_CANCEL);
}

function pickOnBoard(req) {
  const st = shown();
  /* ライン選択: パッドを光らせて直接タップ */
  if (req.kind === 'pickLine') {
    if (!Array.isArray(req.lines) || !req.lines.length) return Promise.resolve(null);
    return new Promise((resolve) => {
      boardPick = { kind: 'line', req, lines: req.lines.slice(), toPicks: (l) => [l], resolve };
      renderLinePick();
    });
  }
  /* option 型のプレイ先 (ライン×表裏の組合せ): レーンをタップし、表裏はトグルに従う */
  if (req.kind === 'option' && req.prompt === 'play-dest' && Array.isArray(req.faces) && req.faces.length) {
    const lines = [...new Set(req.faces.map(x => x.l))];
    const toPicks = (l) => {
      const want = !backFacing;
      let i = req.faces.findIndex(x => x.l === l && x.f === want);
      if (i < 0) i = req.faces.findIndex(x => x.l === l);
      return [i];
    };
    return new Promise((resolve) => {
      boardPick = { kind: 'line', req, lines, toPicks, resolve };
      renderLinePick();
    });
  }
  /* play-free (SPEED 0 等の「カードを1枚プレイする」): 通常プレイと同じ
     手札タップ → パッドタップ の2段で選ぶ */
  if (req.kind === 'pickCard' && req.prompt === 'play-free') {
    return new Promise((resolve) => {
      const byUid = {};
      for (const raw of req.candidates) {
        const parts = String(raw).split('|');
        (byUid[parts[0]] = byUid[parts[0]] || []).push({ line: +parts[1], face: parts[2], raw });
      }
      boardPick = { kind: 'free', req, byUid, sel: null, resolve };
      renderFreePick();
    });
  }
  const usable = Array.isArray(req.candidates) && req.candidates.length
    && req.candidates.every((u) => {
      if (typeof u !== 'string' || u.indexOf('|') >= 0) return false;
      const l = locOf(st, u);
      return l && (l.zone === 'field' || l.zone === 'hand' || l.zone === 'transit');
    });
  if (!usable) return Promise.resolve(null);
  const min = req.min === undefined ? 1 : req.min;
  const max = req.max === undefined ? 1 : req.max;
  return new Promise((resolve) => {
    boardPick = { req, min, max, chosen: [], resolve };
    renderBoardPick();
  });
}

function renderBoardPick() {
  const bp = boardPick;
  if (!bp) return;
  UI.hideActivation();
  board.markCandidates(bp.req.candidates, bp.chosen);
  let el = document.getElementById('pickBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pickBar';
    el.className = 'arr-bar';
    document.body.appendChild(el);
  }
  const instant = bp.max === 1 && bp.min >= 1;   // 1枚必須はタップで即決
  el.innerHTML =
    (instant ? '' :
      '<button class="arr-btn ok" id="pkOk" type="button"' +
        (bp.chosen.length < bp.min ? ' disabled' : '') + '>決定 (' +
        bp.chosen.length + '/' + bp.max + ')</button>') +
    '<button class="arr-btn" id="pkList" type="button">リストで選ぶ</button>';
  const ok = el.querySelector('#pkOk');
  if (ok) ok.onclick = () => finishBoardPick(bp.chosen.slice());
  el.querySelector('#pkList').onclick = () => finishBoardPick(null);
}

function renderFreePick() {
  const bp = boardPick;
  if (!bp) return;
  UI.hideActivation();
  if (bp.sel) {
    board.markCandidates([bp.sel], [bp.sel]);
    const lines = new Set(bp.byUid[bp.sel].map(o => o.line));
    for (const pad of pads) pad.userData.hover = pad.userData.side === ME && lines.has(pad.userData.line);
  } else {
    board.markCandidates(Object.keys(bp.byUid), []);
    for (const pad of pads) pad.userData.hover = false;
  }
  let el = document.getElementById('pickBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pickBar';
    el.className = 'arr-bar';
    document.body.appendChild(el);
  }
  el.innerHTML =
    (bp.sel ? '<button class="arr-btn" id="pkBack" type="button">カードを選び直す</button>' : '') +
    '<button class="arr-btn" id="pkList" type="button">リストで選ぶ</button>';
  const back = el.querySelector('#pkBack');
  if (back) back.onclick = () => { bp.sel = null; renderFreePick(); };
  el.querySelector('#pkList').onclick = () => finishFreePick(null);
}

function tapFreePick(hitUd) {
  const bp = boardPick;
  if (!bp) return;
  const uid = hitUd.uid;
  if (uid && bp.byUid[uid]) {
    bp.sel = (bp.sel === uid) ? null : uid;
    renderFreePick();
    return;
  }
  if (!bp.sel) return;
  /* パッド or ライン上のカードのタップで着地先を決める */
  let line = hitUd.isPad ? hitUd.line : null;
  if (line === null && uid) {
    const l = locOf(shown(), uid);
    if (l && (l.zone === 'field' || l.zone === 'transit')) line = l.line;
  }
  if (line === null) return;
  const opts = bp.byUid[bp.sel].filter(o => o.line === line);
  if (!opts.length) return;
  /* 表裏どちらも置けるラインは、表向き/裏向きトグルの状態に従う */
  const want = backFacing ? 'd' : 'u';
  const chosen = opts.find(o => o.face === want) || opts[0];
  finishFreePick([chosen.raw]);
}

function finishFreePick(picks) {
  const bp = boardPick;
  boardPick = null;
  board.clearCandidates();
  for (const pad of pads) pad.userData.hover = false;
  const el = document.getElementById('pickBar');
  if (el) el.remove();
  bp.resolve(picks);
}

function renderLinePick() {
  const bp = boardPick;
  if (!bp) return;
  UI.hideActivation();
  for (const pad of pads) pad.userData.hover = bp.lines.indexOf(pad.userData.line) >= 0;
  let el = document.getElementById('pickBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pickBar';
    el.className = 'arr-bar';
    document.body.appendChild(el);
  }
  el.innerHTML = '<button class="arr-btn" id="pkList" type="button">リストで選ぶ</button>';
  el.querySelector('#pkList').onclick = () => finishLinePick(null);
}

function finishLinePick(picks) {
  const bp = boardPick;
  boardPick = null;
  for (const pad of pads) pad.userData.hover = false;
  const el = document.getElementById('pickBar');
  if (el) el.remove();
  bp.resolve(picks);
}

function toggleBoardPick(uid) {
  const bp = boardPick;
  if (!bp || bp.req.candidates.indexOf(uid) < 0) return;
  const i = bp.chosen.indexOf(uid);
  if (i >= 0) bp.chosen.splice(i, 1);
  else {
    if (bp.max === 1) bp.chosen.length = 0;
    bp.chosen.push(uid);
  }
  if (bp.max === 1 && bp.min >= 1 && bp.chosen.length === 1) {
    finishBoardPick(bp.chosen.slice());
    return;
  }
  renderBoardPick();
}

function finishBoardPick(picks) {
  const bp = boardPick;
  boardPick = null;
  board.clearCandidates();
  const el = document.getElementById('pickBar');
  if (el) el.remove();
  bp.resolve(picks);
}

/* 並べ替え: 対象側のプロトコルパネルにチップを重ね、2枚タップで入れ替える。
   exact === 'transposition' (1回だけ入れ替え) は2枚目のタップで即確定。
   戻り値は picks (新しい位置ごとの旧インデックス) か、null (モーダルへ)。 */
function arrangeOnBoard(req) {
  const targetSide = req.target !== undefined ? req.target : ME;
  const list = (panels && panels.panels || []).filter(p => p.side === targetSide);
  if (list.length !== 3 || !stage) return Promise.resolve(null);

  const ov = document.createElement('div');
  ov.id = 'arrOv';
  document.body.appendChild(ov);

  const rect = stage.renderer.domElement.getBoundingClientRect();
  const toScreen = (pos) => {
    const v = new THREE.Vector3(pos.x, pos.y, pos.z).project(stage.camera);
    return [rect.left + (v.x * 0.5 + 0.5) * rect.width,
            rect.top + (-v.y * 0.5 + 0.5) * rect.height];
  };

  const perm = [0, 1, 2];            // 位置 -> 旧インデックス
  const single = req.exact === 'transposition';
  let sel = -1;

  return new Promise((resolve) => {
    const onResize = () => render();
    window.addEventListener('resize', onResize);
    const finish = (picks) => {
      activeArrange = null;
      window.removeEventListener('resize', onResize);
      ov.remove();
      resolve(picks);
    };
    activeArrange = { cancel: () => finish(PICK_CANCEL) };

    const render = () => {
      const isIdentity = perm[0] === 0 && perm[1] === 1 && perm[2] === 2;
      ov.innerHTML =
        '<div class="arr-hint">' +
          (single ? '入れ替える2つのプロトコルをタップ' : 'タップで2つを入れ替え。よければ確定') +
        '</div>' +
        list.map((p) => {
          const line = p.line;
          const [x, y] = toScreen(p.group.position);
          const name = req.current[perm[line]];
          const done = req.compiled && req.compiled[perm[line]];
          return '<button type="button" class="arr-chip' + (sel === line ? ' on' : '') +
            (done ? ' done' : '') + '" data-line="' + line + '"' +
            ' style="left:' + x + 'px;top:' + y + 'px">' +
            (done ? '✓ ' : '') + name + '</button>';
        }).join('') +
        '<div class="arr-bar">' +
          (single ? '' : '<button type="button" class="arr-btn ok" id="arrOk"' + (isIdentity ? ' disabled' : '') + '>確定</button>') +
          '<button type="button" class="arr-btn" id="arrReset">やり直し</button>' +
          '<button type="button" class="arr-btn" id="arrList">リストで選ぶ</button>' +
        '</div>';

      ov.querySelectorAll('.arr-chip').forEach((b) => {
        b.onclick = () => {
          const line = +b.dataset.line;
          if (sel === -1) { sel = line; render(); return; }
          if (sel === line) { sel = -1; render(); return; }
          const t = perm[sel]; perm[sel] = perm[line]; perm[line] = t;
              sel = -1;
          if (single) { finish(perm.slice()); return; }
          render();
        };
      });
      const ok = ov.querySelector('#arrOk');
      if (ok) ok.onclick = () => finish(perm.slice());
      ov.querySelector('#arrReset').onclick = () => {
        perm[0] = 0; perm[1] = 1; perm[2] = 2; sel = -1; render();
      };
      ov.querySelector('#arrList').onclick = () => finish(null);
    };
    render();
  });
}

async function drainRequests() {
  if (roomMode) { await roomDrainRequest(); return; }
  let guard = 0;
  while (cur && cur.requests && cur.requests.length && guard++ < 80) {
    const req = cur.requests[0];
    let picks;
    if (req.player === ME && !demoMode) {
      UI.setPrompt(reqText(req, cardName) || '選択してください', 'ask');
      picks = await askUser(req);
    } else {
      UI.setPrompt('相手が選択しています…', 'wait');
      await TW.wait(260);
      picks = withoutTrace(() => Engine.ai.answer(cur.state, req));
    }
    if (picks === PICK_CANCEL) continue;
    const prev = shown();
    busy = true;
    const res = Engine.apply(cur.state, { type: 'choose', id: req.id, picks });
    if (res.error) { UI.toast(res.error); busy = false; continue; }   // 再質問へ
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

/* 手札公開 (PSYCHIC 0 等): st.revealed の変化を検知して公開ハンドを見せる */
let lastRevealTag = '';
function checkRevealed(st) {
  const r = st && st.revealed;
  if (!r || r.player === ME || !Array.isArray(r.cards)) return;
  const tag = r.player + ':' + r.cards.join(',');
  if (tag === lastRevealTag) return;
  lastRevealTag = tag;
  UI.showRevealedHand(r.cards.map((id) => {
    const d = defIndex[id];
    return d ? { img: faceImageURL(d), label: d.proto + ' ' + d.value } : null;
  }).filter(Boolean));
}

/* 画面リサイズ/回転: カメラは stage が追従するが、手札や山札の実配置は
   状態遷移時にしか書き直されないため、ここで取り直す */
let relayoutTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(relayoutTimer);
  const attempt = (n) => {
    const st = shown();
    if (st && board && !busy) { board.syncInstant(st); return; }
    if (n < 20) relayoutTimer = setTimeout(() => attempt(n + 1), 300);   // 演出中は後で再試行
  };
  relayoutTimer = setTimeout(() => attempt(0), 220);
});

/* ---------- HUD ---------- */
function refreshHud() {
  const st = shown();
  checkRevealed(st);
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
  /* uid 指定は可視性を確認してから実名を出す (def ID 直指定は公開情報) */
  const c = st.cards[idOrUid];
  if (c) {
    const visible = c.faceUp || ((c.knownTo || 0) & (1 << ME));
    if (!visible) return null;
  }
  const d = defIndex[idOrUid] || (c && defIndex[c.def]);
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
      const st = shown();
      const c = st.cards[cand];
      const d = c && defIndex[c.def];
      const visible = c && (c.faceUp || ((c.knownTo || 0) & (1 << ME)));
      if (!d || !visible) {
        /* 中身は伏せたまま、どのカードかは位置で区別できるようにする */
        const l = locOf(st, cand);
        if (l && l.zone === 'field') {
          const proto = st.players[l.side].protocols[l.line];
          return '裏向きのカード <small>' + (l.side === ME ? '自分' : '相手') + 'の ' +
            (proto ? proto.name : 'ライン' + (l.line + 1)) + '・下から' + (l.idx + 1) + '枚目</small>';
        }
        return '裏向きのカード';
      }
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
