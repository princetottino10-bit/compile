'use strict';
/* 対戦者から教わった手筋 (docs/ai-combos.md) を AI が打てるか。
   1件ずつ、その手筋がはっきり最善になる局面を組み、AI の選択を確かめる。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
Engine.init(
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'))
);

const uidOf = (def, side) => 'p' + side + ':' + def;
function rm(a, x) { const i = a.indexOf(x); if (i >= 0) a.splice(i, 1); }
function detach(st, uid) {
  for (const p of st.players) { rm(p.deck, uid); rm(p.hand, uid); rm(p.trash, uid); }
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) rm(st.lines[l][s], uid);
}
function place(st, def, side, line, faceUp) {
  const uid = uidOf(def, side);
  detach(st, uid);
  st.lines[line][side].push(uid);
  Object.assign(st.cards[uid], { zone: 'field', faceUp: !!faceUp, knownTo: faceUp ? 3 : (1 << side) });
  return uid;
}
function setHand(st, side, defs) {
  const p = st.players[side];
  while (p.hand.length) { const u = p.hand.pop(); Object.assign(st.cards[u], { zone: 'deck' + side, knownTo: 0 }); p.deck.push(u); }
  for (const d of defs) {
    const u = uidOf(d, side);
    detach(st, u);
    Object.assign(st.cards[u], { zone: 'hand' + side, knownTo: 1 << side });
    p.hand.push(u);
  }
}
function game(p0, p1, seed) {
  const st = Engine.newGame({ p0, p1, seed: seed || 3, first: 0 }).state;
  st.turn = 0;
  st.phase = 'action';
  return st;
}
const faceUpOf = (st, side) => {
  let n = 0;
  for (let l = 0; l < 3; l++) for (const u of st.lines[l][side]) if (st.cards[u].faceUp) n++;
  return n;
};
/* AI の答えで選択要求を解決しきる。answers に [要求, 答え] を残す */
function resolveWithAi(res, answers) {
  for (let guard = 0; res && !res.error && res.requests.length && guard < 40; guard++) {
    const q = res.requests[0];
    const picks = Engine.ai.answer(res.state, q);
    if (answers) answers.push({ q, picks });
    res = Engine.apply(res.state, { type: 'choose', id: q.id, picks });
  }
  return res;
}
function aiAct(st) {
  Engine.setAiLevel(2);
  Engine.setAiThinkBudget(300);
  return Engine.ai.action(st);
}

/* ---------- M1: Fire0 を噛ませる ----------
   FIRE 0 (FIRE_1) は覆われることになったとき「先に1枚引き、他のカードを1枚反転」。
   FIRE の札を出すなら、FIRE 0 の上に表で重ねて効果を拾う (裏で別ラインに逃がさない) */
test('手筋 Fire0 を噛ませる: FIRE の札は FIRE 0 の上に表で重ねる', () => {
  const st = game(['FIRE', 'WATER', 'LIFE'], ['METAL', 'LIGHT', 'HATE']);
  place(st, 'FIRE_1', 0, 0, true);          // ライン0 の一番上に FIRE 0
  place(st, 'METAL_4', 1, 1, true);         // 相手の表向き (反転の的)
  /* 手札5枚はリフレッシュできない。FIRE の札だけで、出し方 (表で L0 / 裏で他) を選ばせる */
  setHand(st, 0, ['FIRE_3', 'FIRE_4', 'FIRE_5', 'FIRE_6', 'FIRE_2']);
  const act = aiAct(st);
  assert.ok(act && act.type === 'play', 'カードを出す (実際: ' + JSON.stringify(act) + ')');
  assert.ok(act.line === 0 && act.faceUp, 'FIRE 0 の上に表で重ねる (実際: ' + JSON.stringify(act) + ')');
});

/* ---------- M2: Fire0 + Water1 ----------
   WATER 1 (WATER_2) は他の各ラインに裏向きを置く。FIRE 0 のラインを最後にすると、
   FIRE 0 の「他の1枚を反転」で、先に撒いた裏向きを表にできる */
test('手筋 Fire0 + Water1: 裏向きを撒く順番を FIRE 0 のラインを最後にする', () => {
  const st = game(['FIRE', 'WATER', 'LIFE'], ['METAL', 'LIGHT', 'HATE']);
  place(st, 'FIRE_1', 0, 0, true);
  place(st, 'LIFE_3', 0, 2, true);
  setHand(st, 0, ['WATER_2']);
  const deckTop = st.players[0].deck.slice(0, 2);           // 撒かれる2枚
  const answers = [];
  const res = resolveWithAi(Engine.apply(st, { type: 'play', card: uidOf('WATER_2', 0), line: 1, faceUp: true }), answers);
  assert.equal(res.error, null);
  const order = answers.find(a => a.q.prompt === 'each-line-order');
  assert.ok(order, '撒く順番を聞かれる');
  assert.notEqual(order.picks[0], 0, 'FIRE 0 のライン (L0) を先にしない');
  const flip = answers.find(a => a.q.prompt === 'flip');
  assert.ok(flip, 'FIRE 0 の覆われたときの反転が起きる');
  assert.ok(deckTop.includes(flip.picks[0]), '先に撒いた裏向きを反転して表にする (選んだ: ' + flip.picks[0] + ')');
});

/* ---------- M2: Life3 + Life0 ----------
   LIFE 3 (LIFE_4) が覆われるときの「デッキの上を他の1ラインに裏向き」は LIFE 0 (LIFE_1) の
   中段より先に入る。カードの無いラインに置けば、LIFE 0 の「カードがある各ライン」が増える */
test('手筋 Life3 + Life0: LIFE 3 の上に LIFE 0 を出し、空いたラインにも裏向きを増やす', () => {
  const st = game(['LIFE', 'WATER', 'FIRE'], ['METAL', 'LIGHT', 'HATE']);
  place(st, 'LIFE_4', 0, 0, true);          // ライン1・2 は空
  setHand(st, 0, ['LIFE_1']);
  const res = resolveWithAi(Engine.apply(st, { type: 'play', card: uidOf('LIFE_1', 0), line: 0, faceUp: true }));
  assert.equal(res.error, null);
  /* LIFE 3 の1枚 + LIFE 0 の中段 (カードのある2ライン) = 裏向き3枚。
     LIFE 0 自身は自分の中段で覆われ、終了時に上段で削除される (ルールどおり) */
  const placed = res.log.filter(l => /カード をライン\d+に裏でプレイ/.test(l)).length;
  assert.ok(placed >= 3, '覆われたときの裏向きで空きラインを埋め、LIFE 0 の枚数を増やす (裏向き ' + placed + '枚)');
  /* 手札1枚だとリフレッシュが正解になりうるので、もう1枚持たせて選ばせる */
  setHand(st, 0, ['LIFE_1', 'WATER_4']);
  const act = aiAct(st);
  assert.ok(act && act.type === 'play', 'カードを出す (実際: ' + JSON.stringify(act) + ')');
  assert.equal(act.card, uidOf('LIFE_1', 0), 'LIFE 0 を出す (実際: ' + act.card + ')');
  assert.equal(act.line, 0, 'LIFE 3 の上に重ねる (実際: L' + act.line + ')');
});

/* ---------- M6: Spirit3 で Spirit1 を覆う ----------
   SPIRIT 1 (SPIRIT_2) の開始時「手札を1枚捨てるか、このカードを反転」は毎ターンの損。
   覆えば止まり、上段 (対応不問で表向きにプレイ) は覆われても効き続ける。
   AI は重みではなく、相手の手番のあと自分の開始フェイズまで実際に解決した盤面で評価する。
   ここでは、そのシミュレーションで「覆うと損が起きない」ことが見えているかを確かめる */
function startPhaseLog(st) {
  /* 自分の開始フェイズだけを解決する (相手の応手で盤面が変わる影響を混ぜない) */
  const s2 = structuredClone(st);
  s2.turn = 0;
  s2.phase = 'start';
  const log = [];
  let res = Engine.apply(s2, { type: '_begin' });
  for (let guard = 0; res && !res.error && guard < 20; guard++) {
    log.push(...res.log);
    if (!res.requests.length) break;
    const q = res.requests[0];
    res = Engine.apply(res.state, { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) });
  }
  assert.equal(res.error, null);
  return log;
}
test('手筋 Spirit1 を覆う: 開始フェイズを解決すると、覆ったときだけ損が起きない', () => {
  Engine.setAiLevel(1);
  const base = game(['SPIRIT', 'WATER', 'FIRE'], ['METAL', 'LIGHT', 'HATE']);
  place(base, 'SPIRIT_2', 0, 0, true);
  setHand(base, 0, ['WATER_4', 'FIRE_3']);
  const covered = structuredClone(base);
  place(covered, 'SPIRIT_4', 0, 0, true);    // SPIRIT 1 の上に重ねる
  const beside = structuredClone(base);
  place(beside, 'SPIRIT_4', 0, 1, true);     // 別のラインに出す (SPIRIT 1 は一番上のまま)
  const cost = (log) => log.some(l => /SPIRIT_2\] 下段/.test(l));
  assert.equal(cost(startPhaseLog(covered)), false, '覆われた SPIRIT 1 の開始時の損は起きない');
  assert.equal(cost(startPhaseLog(beside)), true, '一番上の SPIRIT 1 は開始時に損を払う');
});

/* ---------- M4: Fire3 + Plague④ ----------
   終了時に FIRE 3 (FIRE_4) で相手の表向きを裏返してから、PLAGUE 4 (PLAGUE_5) で
   「相手は自分の裏向きを1枚削除」させる。解決順を FIRE 3 → PLAGUE 4 にする */
test('手筋 Fire3 + Plague4: 終了時の解決順を FIRE 3 → PLAGUE 4 にして相手の札を落とす', () => {
  const st = game(['FIRE', 'PLAGUE', 'WATER'], ['METAL', 'LIGHT', 'HATE']);
  place(st, 'FIRE_4', 0, 0, true);
  place(st, 'PLAGUE_5', 0, 1, true);
  const target = place(st, 'METAL_6', 1, 0, true);   // 相手の表向き。裏向きは持っていない
  setHand(st, 0, ['FIRE_2', 'WATER_3']);
  /* 手を1枚出して終了フェイズへ */
  const res = resolveWithAi(Engine.apply(st, { type: 'play', card: uidOf('WATER_3', 0), line: 2, faceUp: true }));
  assert.equal(res.error, null);
  assert.ok(!res.state.lines[0][1].includes(target) && res.state.players[1].trash.includes(target),
    '相手の表向きを裏返して削除させる (METAL_6 の場所: ' + res.state.cards[target].zone + ')');
});

/* ---------- M7: Death1 で狙って壊す ----------
   DEATH 1 (DEATH_2) の開始時の削除は、相手のライン値を落として2ラインリードを作る対象を選ぶ */
test('手筋 Death1 で狙って壊す: 2ラインリードになる相手の札を削除する', () => {
  const st = game(['DEATH', 'WATER', 'FIRE'], ['METAL', 'LIGHT', 'HATE']);
  st.useControl = true;
  place(st, 'DEATH_2', 0, 0, true);
  place(st, 'WATER_4', 0, 1, true);          // 自分 L1: 3
  place(st, 'FIRE_5', 0, 2, true);           // 自分 L2: 4
  place(st, 'LIGHT_4', 1, 1, true);          // 相手 L1: 3 (同点) — これを消せばリード
  place(st, 'HATE_6', 1, 2, true);           // 相手 L2: 5 — 消しても 4 対 0 でリードは同じ1本増
  place(st, 'METAL_2', 1, 0, true);          // 相手 L0: 1
  /* 開始フェイズから回して、DEATH_2 の開始時効果を解決させる */
  st.phase = 'start';
  setHand(st, 0, ['WATER_3']);
  let res = Engine.apply(st, { type: '_begin' });
  if (res.error) {
    /* _begin を受け付けないときは、自分のターン開始から進める */
    st.phase = 'end'; st.turn = 1;
    res = Engine.apply(st, { type: 'refresh' });
  }
  res = resolveWithAi(res);
  assert.equal(res.error, null);
  const deleted = ['LIGHT_4', 'HATE_6', 'METAL_2'].filter(d => res.state.players[1].trash.includes(uidOf(d, 1)));
  assert.ok(deleted.length === 1, '相手の札を1枚削除する (' + deleted.join(',') + ')');
});

/* ---------- M3: 手札5枚以上はリフレッシュ不可 ----------
   コントロールを使えるのはコンパイルかリフレッシュのとき。コントロールを持つ相手の手札が
   5枚以上でコンパイルもできないなら、次のターンはこちらのリーチを並べ替えで崩せない。
   AI は相手の応手を合法手から実際に指して読むので、重みではなくシミュレーションで見える */
test('手筋 手札5枚はリフレッシュ不可: 相手の応手にリフレッシュ (コントロールの使用) が無いことを読みが拾う', () => {
  Engine.setAiLevel(1);
  const base = game(['WATER', 'FIRE', 'LIFE'], ['METAL', 'LIGHT', 'HATE']);
  base.useControl = true;
  base.control = 1;
  place(base, 'WATER_6', 0, 0, true);
  place(base, 'WATER_5', 0, 0, true);
  place(base, 'WATER_4', 0, 0, true);        // 自分 L0: 12 — 次の自分の開始でコンパイル
  place(base, 'METAL_4', 1, 0, true);        // 相手 L0: 3
  base.turn = 1;                            // 次は相手の手番
  const five = structuredClone(base);
  setHand(five, 1, ['LIGHT_2', 'LIGHT_3', 'LIGHT_4', 'LIGHT_5', 'LIGHT_6']);
  const four = structuredClone(base);
  setHand(four, 1, ['LIGHT_2', 'LIGHT_3', 'LIGHT_4', 'LIGHT_5']);
  assert.ok(!Engine.legalActions(five).some(a => a.type === 'refresh'), '手札5枚ではリフレッシュできない');
  /* 手札4枚ならリフレッシュでコントロールを使い、こちらのプロトコルを並べ替えられる */
  let res = Engine.apply(four, { type: 'refresh' });
  const asked = [];
  for (let guard = 0; res && !res.error && res.requests.length && guard < 20; guard++) {
    const q = res.requests[0];
    asked.push(q.prompt);
    res = Engine.apply(res.state, { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) });
  }
  assert.ok(asked.includes('control-rearrange'), '手札4枚ならリフレッシュでコントロールを使える (' + asked.join(',') + ')');
});

/* ---------- M7: Spirit1 中の Death0 ----------
   SPIRIT 1 (SPIRIT_2) の上段が効いている間は、DEATH 0 (DEATH_1) をどのラインにも表で出せる。
   DEATH 0 は「他の各ラインのカードを1枚ずつ削除」なので、相手の札が並ぶ2ライン以外に出す */
test('手筋 Spirit1 中の Death0: 相手の札がある2ラインを消せるラインに DEATH 0 を出す', () => {
  const st = game(['SPIRIT', 'DEATH', 'WATER'], ['METAL', 'LIGHT', 'HATE']);
  place(st, 'SPIRIT_2', 0, 0, true);         // 対応不問で表向きにプレイできる
  place(st, 'WATER_4', 0, 0, true);          // SPIRIT 1 は覆われても上段が効く
  place(st, 'LIGHT_6', 1, 1, true);          // 相手 L1: 5
  place(st, 'HATE_6', 1, 2, true);           // 相手 L2: 5
  setHand(st, 0, ['DEATH_1', 'WATER_2', 'WATER_3', 'SPIRIT_5', 'DEATH_4']);
  const acts = Engine.legalActions(st).filter(a => a.card === uidOf('DEATH_1', 0) && a.faceUp);
  assert.ok(acts.some(a => a.line === 0), 'SPIRIT 1 の上段で L0 にも表で出せる前提');
  const act = aiAct(st);
  assert.equal(act && act.card, uidOf('DEATH_1', 0), 'DEATH 0 を出す (実際: ' + JSON.stringify(act) + ')');
  assert.ok(act.faceUp && act.line === 0, '相手の2ラインを消せる L0 に表で出す (実際: ' + JSON.stringify(act) + ')');
});

/* ---------- M1: Gravity の連鎖 ----------
   1. GRAVITY 2 (GRAVITY_3) の反転で、裏向きの GRAVITY 1 (GRAVITY_2) を表に → 中段で2枚
   2. その中段の移動で、第3のカードを GRAVITY 1 の上に移して覆う
   3. GRAVITY 2 の残りの移動で GRAVITY 1 を動かす → 覆いが外れて中段がもう一度 → さらに2枚 */
test('手筋 Gravity の連鎖: GRAVITY 1 の中段を2回撃って4枚引く', () => {
  const st = game(['GRAVITY', 'WATER', 'FIRE'], ['METAL', 'LIGHT', 'HATE']);
  const g1 = place(st, 'GRAVITY_2', 0, 1, false);   // L1 に裏向きの GRAVITY 1
  /* GRAVITY 1 の上に移す第3のカード。中段の無い FIRE 3 にして、再発動の影響を混ぜない */
  place(st, 'FIRE_4', 0, 2, true);
  setHand(st, 0, ['GRAVITY_3', 'WATER_2']);         // 4枚引いても手札上限 (5) に収まる
  const answers = [];
  const res = resolveWithAi(Engine.apply(st, { type: 'play', card: uidOf('GRAVITY_3', 0), line: 0, faceUp: true }), answers);
  assert.equal(res.error, null);
  const flip = answers.find(a => a.q.prompt === 'flip');
  assert.ok(flip, '反転の対象を聞かれる');
  assert.equal(flip.picks[0], g1, '裏向きの GRAVITY 1 を表にして中段を撃つ (選んだ: ' + flip.picks[0] + ')');
  const drawn = res.log.reduce((n, l) => { const m = /P1: (\d+)枚ドロー/.exec(l); return n + (m ? +m[1] : 0); }, 0);
  assert.equal(drawn, 4, '4枚引く (実際 ' + drawn + '枚。答え: ' + answers.map(a => a.q.prompt + '=' + JSON.stringify(a.picks)).join(' ') + ')');
});

/* ---------- M1: Death1 の自壊 ----------
   DEATH 1 (DEATH_2) は開始時に「1枚引き、他のカードを1枚削除し、このカードを削除」。
   自分の表向きのカードの上に置いておけば、自壊で下のカードの中段がもう一度入る */
test('手筋 Death1 の自壊: 開始時に引いて削除し、自壊で下のカードの中段を再発動させる', () => {
  Engine.setAiLevel(1);
  const st = game(['DEATH', 'WATER', 'FIRE'], ['METAL', 'LIGHT', 'HATE']);
  place(st, 'WATER_3', 0, 1, true);          // 中段が再発動する札
  place(st, 'DEATH_2', 0, 1, true);          // その上に DEATH 1
  place(st, 'LIGHT_5', 1, 2, true);          // 削除の的
  setHand(st, 0, ['WATER_2', 'FIRE_2']);
  const log = startPhaseLog(st);
  assert.ok(log.some(l => /DEATH_2 を削除/.test(l)), 'DEATH 1 が自壊する');
  assert.ok(log.some(l => /\[WATER_3\] 中段コマンド解決 \(uncover\)/.test(l)), '下の WATER 2 の中段が再発動する');
});

/* ---------- M8: Gravity4 で構える ----------
   GRAVITY 4 (GRAVITY_4) の「裏向きのカードを1枚、このラインへと移動させる」で
   別ラインの自分の裏向きを呼び、コンパイル圏 (10点) に届かせる */
test('手筋 Gravity4 で構える: 別ラインの自分の裏向きを呼んで10点に届かせる', () => {
  const st = game(['GRAVITY', 'WATER', 'FIRE'], ['METAL', 'LIGHT', 'HATE']);
  place(st, 'GRAVITY_5', 0, 0, false);       // L0: 裏向き 2
  place(st, 'GRAVITY_2', 0, 0, false);       // L0: 裏向き 2 → 4
  place(st, 'WATER_2', 0, 1, false);         // L1 の自分の裏向き (呼ぶ札)
  place(st, 'METAL_3', 1, 0, true);          // 相手 L0: 2
  place(st, 'LIGHT_2', 1, 2, false);         // 相手の裏向き (呼ぶと相手の点になる)
  setHand(st, 0, ['GRAVITY_4', 'GRAVITY_6', 'WATER_3', 'FIRE_2', 'FIRE_3']);
  const answers = [];
  const res = resolveWithAi(Engine.apply(st, { type: 'play', card: uidOf('GRAVITY_4', 0), line: 0, faceUp: true }), answers);
  assert.equal(res.error, null);
  const l0 = res.state.lines[0][0].reduce((n, u) => n + (res.state.cards[u].faceUp ? Engine.defs[res.state.cards[u].def].value : 2), 0);
  assert.ok(l0 >= 10, '自分の裏向きを呼んで L0 を10点にする (L0 ' + l0 + '点。答え: '
    + answers.map(a => a.q.prompt + '=' + JSON.stringify(a.picks)).join(' ') + ')');
});

/* ---------- M1: Spirit0 で Spirit3 を2回動かす ----------
   SPIRIT 0 (SPIRIT_1) の「リフレッシュする。カードを1枚引く」で2回引く。
   SPIRIT 3 (SPIRIT_4) の上段「カードを引いたあと、このカードを移動させることができる」で
   2回とも動かし、そのたびに下にあった表向きのカードの中段を再発動させる */
test('手筋 Spirit0 で Spirit3 を2回動かす: 引くたびに動かして下のカードの中段を2回撃つ', () => {
  const st = game(['SPIRIT', 'WATER', 'FIRE'], ['METAL', 'LIGHT', 'HATE']);
  place(st, 'WATER_3', 0, 1, true);          // 1回目に外す札 (中段: 2枚引く + 並べ替え)
  place(st, 'SPIRIT_4', 0, 1, true);         // その上に SPIRIT 3
  place(st, 'FIRE_1', 0, 2, true);           // 2回目に外す札 (中段: 反転 + 2枚引く)
  setHand(st, 0, ['SPIRIT_1']);
  const answers = [];
  const res = resolveWithAi(Engine.apply(st, { type: 'play', card: uidOf('SPIRIT_1', 0), line: 0, faceUp: true }), answers);
  assert.equal(res.error, null);
  const again = res.log.filter(l => /中段コマンド解決 \(uncover\)/.test(l)).length;
  assert.ok(again >= 2, '下のカードの中段を2回再発動させる (' + again + '回。答え: '
    + answers.map(a => a.q.prompt + '=' + JSON.stringify(a.picks)).join(' ') + ')');
});

/* ---------- M3: 相手に強制コンパイルさせて行動を奪う ----------
   コンパイルは開始時に強制で、そのターンの行動を使い切る。移動効果で相手のカードを
   相手の済みラインへ寄せて10点以上にすると、相手は次のターンにリコンパイルするだけで何もできない。
   同じ1手で自分のラインを伸ばしておけば、こちらのコンパイルが確定で通る */
test('手筋 強制コンパイルで行動を奪う: 相手の裏向きを相手の済みラインへ寄せ、自分のコンパイルを通す', () => {
  const st = game(['WATER', 'FIRE', 'SPEED'], ['METAL', 'LIGHT', 'HATE']);
  st.players[1].protocols[0].compiled = true;   // 相手の METAL (L0) はコンパイル済み
  place(st, 'METAL_6', 1, 0, true);
  place(st, 'METAL_3', 1, 0, true);             // 相手 L0: 8 (あと2で10)
  const fd = place(st, 'LIGHT_2', 1, 1, false); // 相手 L1 の裏向き (値2) — これを L0 へ寄せる
  place(st, 'SPEED_6', 0, 2, true);
  place(st, 'SPEED_2', 0, 2, true);             // 自分 L2: 6 → SPEED 4 (値4) で 10
  place(st, 'HATE_3', 1, 2, true);              // 相手 L2: 2
  setHand(st, 0, ['SPEED_5', 'WATER_2', 'WATER_3', 'FIRE_2', 'FIRE_3']);
  setHand(st, 1, ['HATE_2', 'HATE_4', 'LIGHT_3']);   // 自由に動ければ HATE で崩しに来る手札
  const answers = [];
  const res = resolveWithAi(Engine.apply(st, { type: 'play', card: uidOf('SPEED_5', 0), line: 2, faceUp: true }), answers);
  assert.equal(res.error, null);
  const how = answers.map(a => a.q.prompt + '=' + JSON.stringify(a.picks)).join(' ');
  assert.ok(res.log.some(l => /P2: リコンパイル/.test(l)), '相手の裏向きを済みラインへ寄せて、リコンパイルさせる (答え: ' + how + ')');
  assert.ok(res.log.some(l => /P1: SPEED をコンパイル/.test(l)), '相手が動けない間に自分のコンパイルが通る (答え: ' + how + ')');
  assert.ok(res.state.lines[0][1].indexOf(fd) < 0, '寄せた裏向きはリコンパイルで消える');
  /* そもそもこの手を選ぶか */
  const act = aiAct(st);
  assert.ok(act && act.card === uidOf('SPEED_5', 0) && act.faceUp && act.line === 2,
    'SPEED 4 を自分のリーチのラインに表で出す (実際: ' + JSON.stringify(act) + ')');
});

/* ---------- 解決順もシミュレーションで選ぶ ----------
   同時に誘発した効果をどれから解くかは、以前は固定の順位で答えていた。
   候補が少ないときは実際に解決して、良いほうを選ぶ (orderSim)。
   ここでは両方の順番を自分で解決して、AI の答えが良いほうと一致することを確かめる */
test('解決順: 両方の順番を試して、良いほうを選ぶ', () => {
  Engine.setAiLevel(1);
  const build = () => {
    const st = game(['FIRE', 'PLAGUE', 'WATER'], ['METAL', 'LIGHT', 'HATE']);
    place(st, 'FIRE_4', 0, 0, true);          // 終了: 手札を1枚捨てて、カードを1枚反転
    place(st, 'PLAGUE_5', 0, 1, true);        // 終了: 相手は自分の裏向きを1枚削除
    place(st, 'METAL_6', 1, 0, true);         // 相手の表向き (裏向きは持っていない)
    setHand(st, 0, ['FIRE_2', 'WATER_3', 'WATER_4']);
    return st;
  };
  /* 終了フェイズだけを解決する (手を出すと、その効果の選択が先に入るため) */
  const st0 = build();
  st0.turn = 0;
  st0.phase = 'end';
  let res = Engine.apply(st0, { type: '_begin' });
  const q = res.requests.find ? res.requests[0] : null;
  assert.ok(q && /(?:^|-)order$/.test(q.prompt || ''), '終了時の解決順を聞かれる (実際: ' + (q && q.prompt) + ')');
  assert.ok(q.candidates.length >= 2);

  /* それぞれの順番で最後まで解決して点数を出す */
  const scoreFor = (pick) => {
    let r = Engine.apply(res.state, { type: 'choose', id: q.id, picks: [pick] });
    for (let guard = 0; r && !r.error && r.requests.length && guard < 30; guard++) {
      const qq = r.requests[0];
      r = Engine.apply(r.state, { type: 'choose', id: qq.id, picks: Engine.ai.answer(r.state, qq) });
    }
    assert.equal(r.error, null);
    return Engine.ai.score(r.state, 0);
  };
  const scored = q.candidates.map(uid => ({ uid, s: scoreFor(uid) })).sort((a, b) => b.s - a.s);
  const picked = Engine.ai.answer(res.state, q);
  const pickedScore = scored.find(x => x.uid === picked[0]);
  assert.ok(pickedScore && pickedScore.s >= scored[0].s,
    '良いほうの順番を選ぶ (' + scored.map(x => res.state.cards[x.uid].def + ':' + Math.round(x.s)).join(' / ')
    + ' → 選んだ: ' + res.state.cards[picked[0]].def + ')');
});

/* ---------- 相手の手番の途中での選択 ----------
   相手がカードを表で出した処理の続きで自分のコンパイルが起き、コントロールの並べ替えを聞かれる場面。
   AI は相手の手札を推測し直した世界で試算するが、以前はその世界で「相手が出したカード」まで
   別のカードに振り直していて、試算のたびに相手の1手を再生するところで失敗していた。
   全部の試算が失敗すると先頭の答え (自分を並べ替える → 先頭の並べ方) に落ち、
   済みプロトコルがコンパイルするラインに来てリコンパイルに化けていた (実戦 60局で18回) */
test('コントロールの並べ替え: 相手の手番の途中でも、並べ替えでコンパイルをリコンパイルに化かさない', () => {
  Engine.setAiLevel(1);
  let res = Engine.newGame({ p0: ['DARKNESS', 'FIRE', 'WATER'], p1: ['DEATH', 'METAL', 'SPEED'], seed: 7000, useControl: true });
  let checked = 0;
  for (let guard = 0; res && !res.error && res.state.winner === null && guard < 700; guard++) {
    if (res.requests.length) {
      const q = res.requests[0];
      if (q.prompt === 'control-rearrange' && q.controlReason === 'compile') {
        const protos = res.state.players[q.player].protocols;
        const before = protos.filter(p => p.compiled).length;
        const willCompileNew = !protos[q.controlLine].compiled;
        /* AI の答えで最後まで解決して、コンパイルの本数を確かめる */
        let r = Engine.apply(res.state, { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) });
        for (let k = 0; r && !r.error && r.requests.length && k < 12; k++) {
          const qq = r.requests[0];
          r = Engine.apply(r.state, { type: 'choose', id: qq.id, picks: Engine.ai.answer(r.state, qq) });
        }
        assert.equal(r.error, null);
        if (willCompileNew && before > 0) {
          const after = r.state.players[q.player].protocols.filter(p => p.compiled).length;
          assert.ok(after > before, '未コンパイルのラインを並べ替えでリコンパイルに化かさない (' + before + '本 → ' + after + '本)');
          checked++;
        }
        res = r;
        continue;
      }
      res = Engine.apply(res.state, { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) });
      continue;
    }
    const a = Engine.ai.action(res.state);
    if (!a) break;
    res = Engine.apply(res.state, a);
  }
  assert.ok(checked >= 1, 'この対局で問題の場面が起きること (' + checked + '回)');
});

/* ---------- FIRE 0 + WATER 4 (対戦者から: 最強の FIRE/WATER/SPEED 用) ----------
   FIRE 0 (FIRE_1) の上に WATER 4 (WATER_5) を表で出すと、覆われる前に FIRE 0 が1枚引いて1枚反転。
   WATER 4 の中段で WATER 4 自身を戻すと、FIRE 0 の覆いが外れて中段 (1枚反転・2枚引く) がもう一度入る。
   合計 2枚反転・3枚ドロー、WATER 4 は手札に戻る。WATER 4 を表で出せるのは WATER のラインだけなので、
   FIRE 0 が WATER のラインに表で置かれていることが条件 */
const FWS = ['FIRE', 'WATER', 'SPEED'];
function withDsh(fn) {
  Engine.setAiSpecialist(true, 0, 'dsh');
  try { return fn(); } finally { Engine.setAiSpecialist(false); }
}
const lineOf = (st, uid) => [0, 1, 2].find(l => st.lines[l][0].includes(uid) || st.lines[l][1].includes(uid));

test('手筋 Fire0 + Water4: FIRE 0 (WATER ライン) の上に WATER 4 を表で出し、WATER 4 自身を戻す', () => withDsh(() => {
  const st = game(FWS, ['METAL', 'LIGHT', 'HATE']);
  place(st, 'FIRE_1', 0, 1, true);          // WATER ライン (1) に FIRE 0
  /* 反転の的 (相手の表向き2枚)。表に返し直しても害の無い札にする */
  place(st, 'METAL_5', 1, 0, true);
  place(st, 'LIGHT_6', 1, 1, true);
  setHand(st, 0, ['WATER_5', 'SPEED_2']);
  const act = aiAct(st);
  assert.ok(act.type === 'play' && st.cards[act.card].def === 'WATER_5' && act.line === 1 && act.faceUp,
    'WATER 4 を FIRE 0 の上に表で出す (実際: ' + JSON.stringify(act) + ')');
  const res = resolveWithAi(Engine.apply(st, act));
  assert.ok(res.state.players[0].hand.includes(uidOf('WATER_5', 0)), 'WATER 4 は自分自身を戻して手札に帰る');
  assert.equal(res.state.players[0].hand.length, 5, '1枚出して3枚引き、WATER 4 が戻る (2 → 5)');
}));

test('手筋 Speed0 → Water4: SPEED 0 の追加プレイで、FIRE 0 の上に WATER 4 を表で出す', () => withDsh(() => {
  const st = game(FWS, ['METAL', 'LIGHT', 'HATE']);
  place(st, 'FIRE_1', 0, 1, true);
  place(st, 'METAL_5', 1, 0, true);
  place(st, 'LIGHT_6', 1, 1, true);
  setHand(st, 0, ['SPEED_1', 'WATER_5', 'FIRE_6']);
  const act = aiAct(st);
  assert.ok(act.type === 'play' && st.cards[act.card].def === 'SPEED_1', 'SPEED 0 を出す (実際: ' + JSON.stringify(act) + ')');
  const answers = [];
  resolveWithAi(Engine.apply(st, act), answers);
  const free = answers.find(x => x.q.prompt === 'play-free');
  assert.ok(free, '追加プレイを聞かれる');
  assert.equal(free.picks[0], uidOf('WATER_5', 0) + '|1|u', '追加プレイは WATER 4 を FIRE 0 のライン (1) に表で');
}));

test('手筋 Water2 の並べ替え: WATER 4 を持っているとき、FIRE 0 のラインを WATER にする', () => withDsh(() => {
  const st = game(FWS, ['METAL', 'LIGHT', 'HATE']);
  place(st, 'FIRE_1', 0, 0, true);          // FIRE ライン (0) の FIRE 0。このままでは WATER 4 を表で重ねられない
  place(st, 'METAL_5', 1, 0, true);
  place(st, 'LIGHT_6', 1, 1, true);
  setHand(st, 0, ['WATER_3', 'WATER_5', 'FIRE_6']);
  const play = Engine.legalActions(st).find(a => a.type === 'play' && a.card === uidOf('WATER_3', 0) && a.line === 1 && a.faceUp);
  Engine.setAiLevel(2);
  Engine.setAiThinkBudget(300);
  const answers = [];
  const res = resolveWithAi(Engine.apply(st, play), answers);
  const arr = answers.find(x => x.q.kind === 'arrange');
  assert.ok(arr, '並べ替えを聞かれる');
  const line = lineOf(res.state, uidOf('FIRE_1', 0));
  assert.equal(res.state.players[0].protocols[line].name, 'WATER',
    'FIRE 0 のラインが WATER になる (並べ替え ' + JSON.stringify(arr.picks) + ' → ' + res.state.players[0].protocols.map(p => p.name).join('/') + ')');
}));
