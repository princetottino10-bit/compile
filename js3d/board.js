/* =========================================================================
 * 3Dビュー: 盤面オブジェクトの管理と、状態遷移の演出
 *   - uid ごとに1つのカード Group を持ち回し、state に合わせて動かす。
 *   - applyTransition(prev, next, action) が差分から演出を組み立てる。
 *     カードプレイの着地は専用の演出パスを通る (最優先で作り込む箇所)。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { makeCard, setHighlight, clearHighlight, setDim, retexture, glowTexture } from './card.js';
import { spawnImpactRing, spawnFlashPillar } from './stage.js';
import * as FX from './fx.js';
import { sfx } from './audio.js';
import * as LAYOUT from './layout.js';
import { CARD, COLOR, TIMING, BOARD } from './theme.js';
import * as TW from './tween.js';

const UNKNOWN_DEF = {
  id: '__unknown__', proto: 'UNKNOWN', color: '#33405e',
  number: 0, value: 2, upper: '', middle: '', lower: '', effectTypes: []
};

/* uid の現在地を state から求める */
export function locOf(st, uid) {
  const c = st.cards[uid];
  if (!c) return null;
  if (c.zone === 'committed') {
    /* 移動中: 行き先ラインが決まっていれば上空にホバー表示する */
    const dest = c.commitDest;
    if (typeof dest === 'string' && dest.startsWith('line')) {
      return { zone: 'transit', line: +dest.slice(4), side: c.owner };
    }
    return { zone: 'limbo' };
  }
  if (c.zone === 'field') {
    for (let line = 0; line < 3; line++) {
      for (let side = 0; side < 2; side++) {
        const idx = st.lines[line][side].indexOf(uid);
        if (idx >= 0) return { zone: 'field', line, side, idx, len: st.lines[line][side].length };
      }
    }
    return { zone: 'limbo' };
  }
  const owner = c.owner;
  if (c.zone === 'hand' + owner) return { zone: 'hand', side: owner, idx: st.players[owner].hand.indexOf(uid) };
  if (c.zone === 'hand' + (1 - owner)) return { zone: 'hand', side: 1 - owner, idx: st.players[1 - owner].hand.indexOf(uid) };
  if (c.zone.startsWith('deck')) { const s = +c.zone.slice(4); return { zone: 'deck', side: s, idx: st.players[s].deck.indexOf(uid) }; }
  if (c.zone.startsWith('trash')) { const s = +c.zone.slice(5); return { zone: 'trash', side: s, idx: st.players[s].trash.indexOf(uid) }; }
  return { zone: 'limbo' };
}

/* 盤面の見た目に関わる部分だけを文字列化する。
   trace のステップ再生で「絵が変わらない中間状態」を飛ばすために使う。 */
export function visualFingerprint(st) {
  if (!st) return '';
  const parts = [];
  for (let line = 0; line < 3; line++) {
    for (let side = 0; side < 2; side++) {
      parts.push(st.lines[line][side].join(','));
    }
  }
  for (let p = 0; p < 2; p++) {
    parts.push(st.players[p].hand.join(','));
    parts.push(st.players[p].trash.length);
    parts.push(st.players[p].deck.length);
    parts.push(st.players[p].protocols.map(x => (x.compiled ? '1' : '0')).join(''));
  }
  const up = [];
  for (const uid of Object.keys(st.cards)) if (st.cards[uid].faceUp) up.push(uid);
  parts.push(up.sort().join(','));
  parts.push((st.commitStack || []).join(','));
  return parts.join('|');
}

/* カードが反転したか (前後で faceUp が変わったか) */
function faceChangedFor(prev, next, uid) {
  return !!(prev.cards[uid] && next.cards[uid] && prev.cards[uid].faceUp !== next.cards[uid].faceUp);
}

/* 位置キーが同じなら「動いていない」 */
function locKey(l) {
  if (!l) return 'none';
  if (l.zone === 'field') return 'field:' + l.line + ':' + l.side + ':' + l.idx;
  return l.zone + ':' + l.side + ':' + l.idx;
}

export function createBoard(stage, defIndex, me, hooks) {
  const onCompile = (hooks && hooks.onCompile) || (() => Promise.resolve());
  const scene = stage.scene;
  const cards = new Map();       // uid -> THREE.Group
  const group = new THREE.Group();
  scene.add(group);

  /* ---------- 床に落とす光輪 ----------
     カードの子にすると、傾いたときにカード面に重なって色を潰してしまう。
     常に水平・床の高さに置き、カードの真下へ毎フレーム追従させる。 */
  const glowGeo = new THREE.PlaneGeometry(CARD.w * 2.3, CARD.h * 1.9);
  glowGeo.rotateX(-Math.PI / 2);
  const glows = new Map();       // uid -> THREE.Mesh

  function glowFor(uid) {
    let g = glows.get(uid);
    if (!g) {
      g = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
        map: glowTexture(),
        transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      g.renderOrder = 1;
      g.visible = false;
      scene.add(g);
      glows.set(uid, g);
    }
    return g;
  }

  stage.onFrame(() => {
    for (const [uid, card] of cards) {
      /* 手札のように宙にあるカードは床に光を落とさない (演出中は例外) */
      const grounded = card.userData.glowAlways || card.position.y < 0.42;
      const want = (card.visible && grounded) ? (card.userData.glowStrength || 0) : 0;
      const g = glows.get(uid);
      if (!want && !g) continue;
      const mesh = glowFor(uid);
      mesh.visible = want > 0.001;
      if (!mesh.visible) continue;
      mesh.material.opacity = want;
      if (card.userData.glowColor) mesh.material.color.copy(card.userData.glowColor);
      mesh.position.set(card.position.x, 0.008, card.position.z);
      const s = 0.75 + card.position.y * 0.35;   // 浮くほど広がる
      mesh.scale.set(s, 1, s);
    }
  });

  /* ---------- カードの生成・テクスチャ ---------- */
  function defFor(st, uid) {
    const c = st.cards[uid];
    if (!c) return UNKNOWN_DEF;
    const known = c.faceUp || ((c.knownTo || 0) & (1 << me));
    return known ? (defIndex[c.def] || UNKNOWN_DEF) : UNKNOWN_DEF;
  }

  function cardOf(st, uid) {
    let card = cards.get(uid);
    if (!card) {
      card = makeCard(defFor(st, uid));
      card.userData.uid = uid;
      card.userData.shownDef = card.userData.def.id;
      cards.set(uid, card);
      group.add(card);
    }
    const want = defFor(st, uid);
    if (card.userData.shownDef !== want.id) {
      retexture(card, want);
      card.userData.shownDef = want.id;
    }
    return card;
  }

  /* ---------- 目標スロットの決定 ---------- */
  function slotFor(st, uid) {
    const l = locOf(st, uid);
    if (!l) return null;
    if (l.zone === 'field') return LAYOUT.stackSlot(l.line, l.side, l.idx, me);
    if (l.zone === 'transit') return LAYOUT.transitSlot(l.line, l.side, me);
    if (l.zone === 'hand') {
      const n = st.players[l.side].hand.length;
      return l.side === me ? LAYOUT.handSlot(l.idx, n) : LAYOUT.oppHandSlot(l.idx, n);
    }
    if (l.zone === 'deck') return LAYOUT.pilePos('deck', l.side, me, Math.min(l.idx, 14));
    if (l.zone === 'trash') return LAYOUT.pilePos('trash', l.side, me, Math.min(l.idx, 14));
    return null;
  }

  /* 表向き/裏向きを rotation.x で表す (0=表, PI=裏) */
  function facingX(st, uid) {
    const c = st.cards[uid];
    const l = locOf(st, uid);
    if (l && l.zone === 'hand') return null;           // 手札は傾き優先
    if (l && (l.zone === 'deck')) return Math.PI;
    if (l && l.zone === 'trash') return 0;
    return c && c.faceUp ? 0 : Math.PI;
  }

  function place(card, slot, faceX) {
    card.position.set(slot.pos[0], slot.pos[1], slot.pos[2]);
    card.rotation.set(faceX === null ? slot.rot[0] : faceX, slot.rot[1], slot.rot[2]);
    const s = slot.scale || 1;
    card.scale.set(s, s, s);
  }

  /* ---------- 一括同期 (演出なし) ---------- */
  function syncInstant(st) {
    const seen = new Set();
    for (const uid of Object.keys(st.cards)) {
      const slot = slotFor(st, uid);
      if (!slot) continue;
      const card = cardOf(st, uid);
      const l = locOf(st, uid);
      const faceX = l.zone === 'hand' ? slot.rot[0] : facingX(st, uid);
      if (l.zone === 'hand' && l.side !== me) {
        card.rotation.set(slot.rot[0], slot.rot[1], slot.rot[2]);
        card.position.set(...slot.pos);
        card.scale.setScalar(slot.scale || 1);
      } else {
        place(card, slot, l.zone === 'hand' ? null : faceX);
        if (l.zone === 'hand') card.rotation.x = slot.rot[0];
      }
      card.visible = true;
      seen.add(uid);
    }
    for (const [uid, card] of cards) if (!seen.has(uid)) card.visible = false;
  }

  /* ---------- 汎用の移動トゥイーン ---------- */
  function moveTo(card, slot, faceX, ms, ease, arcH) {
    const from = card.position.clone();
    const to = new THREE.Vector3(...slot.pos);
    const r0 = { x: card.rotation.x, y: card.rotation.y, z: card.rotation.z };
    const r1 = {
      x: faceX === null ? slot.rot[0] : faceX,
      y: slot.rot[1],
      z: slot.rot[2]
    };
    const s0 = card.scale.x, s1 = slot.scale || 1;
    const h = arcH || 0;
    const tmp = new THREE.Vector3();
    return TW.tween(ms, (t) => {
      TW.arcPoint(tmp, from, to, t, h);
      card.position.copy(tmp);
      card.rotation.x = TW.lerpAngle(r0.x, r1.x, t);
      card.rotation.y = TW.lerpAngle(r0.y, r1.y, t);
      card.rotation.z = TW.lerpAngle(r0.z, r1.z, t);
      card.scale.setScalar(TW.lerp(s0, s1, t));
    }, ease || TW.Ease.inOutCubic);
  }

  /* ---------- カードプレイの着地演出 (最優先の手触り) ---------- */
  async function playLanding(next, uid, opts) {
    const card = cardOf(next, uid);
    let slot = slotFor(next, uid);
    /* プレイ直後は効果解決までエンジン上 committed (移動中) になるが、
       手札からのプレイは最初からスタックへ着地して見せたい */
    const l = locOf(next, uid);
    if (l && l.zone === 'transit') {
      const side = opts.actor;
      slot = LAYOUT.stackSlot(l.line, side, next.lines[l.line][side].length, me);
    }
    if (!slot) return;
    const faceUp = !!next.cards[uid].faceUp;
    const byMe = opts.actor === me;
    const accent = new THREE.Color(next.cards[uid].faceUp
      ? (defIndex[next.cards[uid].def] || UNKNOWN_DEF).color
      : (opts.actor === me ? COLOR.self : COLOR.opp));

    group.attach(card);
    card.renderOrder = 6;
    card.userData.glowAlways = true;
    /* 演出中は他カードの強調を落として、動いている1枚に視線を集める */
    for (const [, other] of cards) if (other !== card) clearHighlight(other);

    const target = new THREE.Vector3(...slot.pos);
    const endRotX = faceUp ? 0 : Math.PI;
    setHighlight(card, accent, 0.14, 0.5);

    /* ドラッグでパッド上まで運ばれたカードは、その場から真下へ叩きつける。
       画面中央の「構え」へ引き戻すと不自然なため、経路を分ける */
    const dx = card.position.x - target.x;
    const dz = card.position.z - target.z;
    const nearDrop = Math.hypot(dx, dz) < 1.7 && card.position.y > 0.45;

    if (nearDrop) {
      stage.focusOn(target, 260, 0.6);
      const from = card.position.clone();
      const r0 = { x: card.rotation.x, y: card.rotation.y, z: card.rotation.z };
      const apex = new THREE.Vector3(target.x, Math.max(from.y, 1.35), target.z);
      /* ひと呼吸ためて真上へ */
      await TW.tween(150, (t) => {
        card.position.lerpVectors(from, apex, t);
        card.rotation.x = TW.lerpAngle(r0.x, endRotX * t + 0.3 * (1 - t), t);
        card.rotation.y = TW.lerpAngle(r0.y, slot.rot[1], t);
        card.rotation.z = TW.lerpAngle(r0.z, slot.rot[2], t);
        card.scale.setScalar(TW.lerp(card.scale.x, 1.18, t));
      }, TW.Ease.outQuad);
      /* 叩きつけ */
      await TW.tween(130, (t) => {
        card.position.y = TW.lerp(apex.y, target.y, t);
        card.rotation.x = TW.lerpAngle(card.rotation.x, endRotX, t);
        card.scale.setScalar(TW.lerp(1.18, 1, t));
      }, TW.Ease.inQuad);
    } else {
      /* クリック/AIプレイ: 構え → 弧 → 着地 */
      const holdPos = byMe
        ? new THREE.Vector3(card.position.x * 0.34, 2.45, 2.45)
        : new THREE.Vector3(card.position.x * 0.34, 2.55, -1.95);
      const from = card.position.clone();
      const r0 = { x: card.rotation.x, y: card.rotation.y, z: card.rotation.z };
      const holdRotX = byMe ? -0.34 : -0.34 + Math.PI;
      sfx('lift');

      await TW.tween(TIMING.playLift, (t) => {
        card.position.lerpVectors(from, holdPos, TW.Ease.outCubic(t));
        card.rotation.x = TW.lerpAngle(r0.x, holdRotX, t);
        card.rotation.y = TW.lerpAngle(r0.y, byMe ? 0 : Math.PI, t);
        card.rotation.z = TW.lerpAngle(r0.z, 0, t);
        card.scale.setScalar(TW.lerp(card.scale.x, 1.34, t));
      }, TW.Ease.outCubic);

      /* カメラを着地点へ寄せる (移動と並行) */
      stage.focusOn(target, TIMING.playArc * 0.82, 0.78);

      /* 弧を描いて落ちる。放物線の頂点を前半に置き、後半は素直に落下させる
         (以前は落下カーブに二重補間が入っていて、フワッと落ちて最後に
         カクッと吸い付く違和感があった)。裏向きプレイは空中で裏返る */
      const spinDir = byMe ? 1 : -1;
      const p0 = card.position.clone();
      await TW.tween(TIMING.playArc, (raw) => {
        const th = TW.Ease.inOutQuad(raw);                  // 水平は緩→急→緩
        card.position.x = TW.lerp(p0.x, target.x, th);
        card.position.z = TW.lerp(p0.z, target.z, th);
        /* 垂直: 出発高度から頂点(+0.55)を経て、sin一発で滑らかに接地。
           sin は t=1 で速度が残るため「落ち切って当たる」感じが出る */
        const peak = Math.sin(Math.PI * Math.min(1, raw * 1.12)) * 0.55;
        card.position.y = TW.lerp(p0.y, target.y, TW.Ease.inQuad(raw)) + peak;
        card.rotation.x = TW.lerpAngle(holdRotX, endRotX, TW.Ease.inOutCubic(raw));
        card.rotation.y = slot.rot[1] + spinDir * Math.PI * (1 - TW.Ease.outCubic(raw));
        card.rotation.z = TW.lerp(card.rotation.z, slot.rot[2], raw);
        card.scale.setScalar(TW.lerp(1.34, 1, TW.Ease.outQuad(raw)));
      }, TW.Ease.linear);
    }

    /* 着地の瞬間 */
    card.position.set(...slot.pos);
    card.rotation.set(endRotX, slot.rot[1], slot.rot[2]);
    card.scale.setScalar(1);
    spawnImpactRing(scene, target, accent, 4.2);
    spawnFlashPillar(scene, target, accent);
    sfx('land');
    stage.shake(0.085, 300);
    setHighlight(card, accent, 0.42, 0.95);

    /* 着地のつぶれ + 沈み込み + 発光の減衰 */
    const baseY = slot.pos[1];
    await TW.tween(TIMING.playSettle + 240, (t) => {
      const k = Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t);
      card.position.y = baseY - k * 0.028;
      card.scale.set(1 + k * 0.07, 1, 1 - k * 0.05);       // 接地面方向につぶす
      setHighlight(card, accent, 0.42 * (1 - t), 0.95 * (1 - t));
    }, TW.Ease.outCubic);
    card.scale.setScalar(1);
    clearHighlight(card);
    card.userData.glowAlways = false;
    card.position.y = baseY;
    card.renderOrder = 0;
  }

  /* ---------- コンパイル演出 ----------
     ライン上のカードは差分移動ではなく、その場で砕いて散らす。 */
  function detectCompiles(prev, next) {
    /* ライン位置ではなくプロトコル名で比較する。
       並べ替えでコンパイル済みが別ラインへ移っても誤発火しない */
    const out = [];
    for (let side = 0; side < 2; side++) {
      const before = {};
      for (const pr of prev.players[side].protocols) before[pr.name] = pr.compiled;
      next.players[side].protocols.forEach((pr, line) => {
        if (pr.compiled && before[pr.name] === false) {
          out.push({ side, line, name: pr.name });
        }
      });
    }
    return out;
  }

  async function compileSequence(prev, next, ev) {
    const laneX = BOARD.laneX[ev.line];
    const proto = defIndex[ev.name + '_1'];
    const accent = (proto && proto.color) || (ev.side === me ? COLOR.self : COLOR.opp);
    const center = new THREE.Vector3(laneX, 0, 0);

    /* 1) チャージ: ラインが白熱し、カメラがレーンへ低く回り込む */
    sfx('charge');
    stage.cinematicHold(center, 2100, { radius: 3.9, height: 2.0, sweep: 0.85 });
    await FX.laneCharge(scene, laneX, accent, 620);

    /* 2) 解放: 光柱 + 衝撃波 + 画面フラッシュ */
    FX.compilePillar(scene, laneX, accent, 1500);
    FX.compileBurst(scene, laneX, accent, ev.name, 1500);
    FX.shockwave(scene, center, accent, 6.5, 900);
    FX.screenFlash(stage, 0xffffff, 620, 0.9);
    sfx('boom');
    stage.shake(0.24, 700);

    /* 3) そのラインにあったカードを砕く */
    const doomed = [];
    for (let side = 0; side < 2; side++) {
      for (const uid of prev.lines[ev.line][side]) {
        const card = cards.get(uid);
        if (card && card.visible) doomed.push(card);
      }
    }
    if (doomed.length) setTimeout(() => sfx('shatter'), 160);
    doomed.forEach((card, i) => {
      setTimeout(() => FX.shatterCard(scene, card, accent, 950), i * 45);
    });

    /* 4) カットイン (DOM 側) */
    await TW.wait(180);
    await onCompile({
      line: ev.line,
      side: ev.side,
      name: ev.name,
      color: accent instanceof THREE.Color ? '#' + accent.getHexString() : accent,
      mine: ev.side === me,
      remaining: next.players[ev.side].protocols.filter(p => !p.compiled).length
    });

    await stage.home(420);
  }

  /* ---------- 状態遷移の適用 ---------- */
  async function applyTransition(prev, next, action, opts) {
    const speed = (opts && opts.speed) || 1;
    const ms = (v) => Math.max(60, v * speed);
    /* プレイされたカードは専用演出 */
    const played = action && action.type === 'play' ? action.card : null;
    if (played) {
      await playLanding(next, played, { actor: prev.turn });
    }

    /* コンパイルが起きたラインは、通常の移動ではなく崩壊させる */
    const compiles = detectCompiles(prev, next);
    const shattered = new Set();
    for (const ev of compiles) {
      for (let side = 0; side < 2; side++) {
        for (const uid of prev.lines[ev.line][side]) shattered.add(uid);
      }
      await compileSequence(prev, next, ev);
    }

    /* 残りは差分でまとめて移動 */
    const jobs = [];
    for (const uid of Object.keys(next.cards)) {
      if (uid === played) continue;
      if (shattered.has(uid)) continue;
      const a = prev.cards[uid] ? locOf(prev, uid) : null;
      const b = locOf(next, uid);
      const faceChanged = !prev.cards[uid] || prev.cards[uid].faceUp !== next.cards[uid].faceUp;
      if (locKey(a) === locKey(b) && !faceChanged) continue;
      jobs.push({ uid, a, b });
    }
    if (!jobs.length) {
      syncInstant(next);
      if (played) await stage.home(TIMING.camEase);
      return;
    }

    /* 移動の種類ごとに1回だけ鳴らす (連打で音の壁にしない) */
    const kinds = new Set();
    for (const { uid, a, b } of jobs) {
      if (a && a.zone === 'deck' && b.zone === 'hand') kinds.add('draw');
      else if (b.zone === 'trash') kinds.add('trash');
      else if (a && (a.zone === 'field' || a.zone === 'transit') && (b.zone === 'field' || b.zone === 'transit')
        && (a.line !== b.line || a.side !== b.side || a.zone !== b.zone)) kinds.add('shift');
      else if (prev.cards[uid] && next.cards[uid] && prev.cards[uid].faceUp !== next.cards[uid].faceUp) kinds.add('flip');
    }
    let sDelay = 0;
    for (const k of kinds) { setTimeout(() => sfx(k), sDelay); sDelay += 90; }

    const anims = jobs.map(({ uid, a, b }) => {
      const card = cardOf(next, uid);
      const slot = slotFor(next, uid);
      if (!slot) { card.visible = false; return Promise.resolve(); }
      /* 前の状態に存在しなかったカード (ルームの秘匿→公開) は、
         持ち主の山札 (自分) / 手札の弧 (相手) から湧かせる */
      if (!a && !prev.cards[uid]) {
        const owner = next.cards[uid].owner;
        if (owner === me) {
          const pp = LAYOUT.pilePos('deck', me, me, 8);
          card.position.set(pp.pos[0], pp.pos[1], pp.pos[2]);
          card.rotation.set(Math.PI, 0, 0);
        } else {
          card.position.set(0, 1.02, -4.25);
          card.rotation.set(-2.42, 0, 0);
        }
      }
      card.visible = true;
      const l = b;
      const faceX = l.zone === 'hand' ? null : facingX(next, uid);

      let dur = TIMING.shift, ease = TW.Ease.inOutCubic, arc = 0.2;
      const accent = new THREE.Color((defIndex[next.cards[uid].def] || UNKNOWN_DEF).color);
      const toPos = new THREE.Vector3(...slot.pos);
      if (a && a.zone === 'deck' && l.zone === 'hand') {
        dur = TIMING.drawFly; arc = 0.75; ease = TW.Ease.outCubic;
        FX.fxDrawTrail(scene, card.position.clone(), toPos, COLOR.cyan);
      } else if (l.zone === 'trash') {
        dur = TIMING.toTrash; arc = 0.9; ease = TW.Ease.inQuad;
        /* 盤面からトラッシュ=削除。赤い飛散を出す */
        if (a && a.zone === 'field') FX.fxDeleteBurst(scene, card.position.clone(), 0xff4d5e);
      } else if (a && (a.zone === 'field' || a.zone === 'transit') && (l.zone === 'field' || l.zone === 'transit')) {
        dur = TIMING.shift; arc = l.zone === 'transit' ? 0.3 : 0.55;
        FX.fxShiftStreak(scene, card.position.clone(), toPos, accent);
        /* 残像は出発時 (盤面から浮いた瞬間) だけ */
        if (a.zone === 'field') FX.fxMoveGhost(scene, card.position.clone(), card.rotation.y, accent);
      } else if (!a || a.zone === l.zone) { dur = TIMING.handSort; arc = 0.06; }

      /* 反転したカードは着地後に閃光 */
      if (faceChangedFor(prev, next, uid)) {
        setTimeout(() => FX.fxFlipFlash(scene, toPos, accent), ms(dur) * 0.5);
      }

      return moveTo(card, slot, faceX, ms(dur), ease, arc);
    });

    await Promise.all(anims);
    /* 演出の誤差が積もらないよう、最後に必ず正しい配置へ収束させる */
    syncInstant(next);
    if (played) await stage.home(TIMING.camEase);
  }

  function refreshVisibility(st) {
    for (const [uid, card] of cards) {
      const l = locOf(st, uid);
      card.visible = !!(l && l.zone !== 'limbo');
      /* 山札は上から数枚だけ見せる */
      if (l && l.zone === 'deck') {
        const n = st.players[l.side].deck.length;
        card.visible = l.idx >= n - 14;
      }
      if (l && l.zone === 'trash') {
        card.visible = l.idx >= st.players[l.side].trash.length - 10;
      }
    }
  }

  /* ---------- ハイライト ----------
     プレイできる札を光らせるより、できない札を沈める方がアートが濁らない。 */
  function highlightPlayable(st, uids) {
    const set = new Set(uids);
    const myHand = new Set(st.players[me].hand);
    for (const [uid, card] of cards) {
      if (!card.userData.locked) clearHighlight(card);
      setDim(card, myHand.has(uid) && set.size > 0 && !set.has(uid));
    }
  }

  /* 効果発動: そのカードだけ浮き上がって発光する */
  function pulse(uid, colorHex, ms) {
    const card = cards.get(uid);
    if (!card || !card.visible) return Promise.resolve();
    const c = colorHex || COLOR.gold;
    const baseY = card.position.y;
    const baseS = card.scale.x;
    card.userData.glowAlways = true;
    card.renderOrder = 5;
    sfx('effect');
    FX.shockwave(scene, card.position, c, 2.6, (ms || 620) * 0.7);
    return TW.tween(ms || 620, (t) => {
      const k = Math.sin(Math.PI * t);
      card.position.y = baseY + k * 0.42;
      card.scale.setScalar(baseS * (1 + k * 0.12));
      setHighlight(card, c, k * 0.34, k * 0.95);
    }, TW.Ease.linear, () => {
      clearHighlight(card);
      card.userData.glowAlways = false;
      card.position.y = baseY;
      card.scale.setScalar(baseS);
      card.renderOrder = 0;
    });
  }

  return {
    /* 対象選択モード: 候補を光らせ、他を沈める */
    markCandidates(uids, chosen) {
      const cset = new Set(uids), chset = new Set(chosen || []);
      for (const [uid, card] of cards) {
        if (!card.visible) continue;
        if (chset.has(uid)) {
          setHighlight(card, new THREE.Color(0xefd06c), 0.5, 1.0);
          setDim(card, false);
        } else if (cset.has(uid)) {
          setHighlight(card, new THREE.Color(0x63f3ff), 0.24, 0.7);
          setDim(card, false);
        } else {
          if (!card.userData.locked) clearHighlight(card);
          setDim(card, true);
        }
      }
    },
    clearCandidates() {
      for (const [, card] of cards) {
        if (!card.userData.locked) clearHighlight(card);
        setDim(card, false);
      }
    },
    group, cards, cardOf, slotFor, syncInstant, applyTransition,
    moveTo, highlightPlayable, pulse, locOf, playLanding,
    setHighlight, clearHighlight, detectCompiles, compileSequence, visualFingerprint,
    hitList() { return Array.from(cards.values()).filter(c => c.visible); }
  };
}
