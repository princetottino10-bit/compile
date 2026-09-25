'use strict';
/* カード効果の検証 (SMOKE / TIME / WAR / ASSIMILATION / DIVERSITY / UNITY)
   各カードの文面どおりの結果になるかを、Engine.newPuzzle で組んだ盤面で確かめる。
   node --test test/cards-e.test.js */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);

/* ---------- ヘルパ ---------- */

const U0 = (d) => 'p0:' + d;
const U1 = (d) => 'p1:' + d;

/* 盤面を作る。P1 (side 0) のアクション待ちから始まる */
function pz(s0, s1) {
  const res = Engine.newPuzzle({ sides: [s0, s1] }, { seed: 1 });
  assert.equal(res.error, null);
  return res;
}

/* handlers: { prompt または kind: picks | (req, res) => picks }。想定外の要求は失敗させる */
function drive(res, handlers, maxSteps) {
  let n = 0;
  const seen = [];
  while (res.requests.length) {
    if (++n > (maxSteps || 40)) throw new Error('drive: 選択要求が収束しない: ' + JSON.stringify(res.requests[0]));
    const req = res.requests[0];
    seen.push(req);
    const h = (handlers || {})[req.prompt] !== undefined ? handlers[req.prompt] : (handlers || {})[req.kind];
    if (h === undefined) throw new Error('予期しない要求: ' + JSON.stringify(req));
    const picks = typeof h === 'function' ? h(req, res) : h;
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks });
    assert.equal(res.error, null, 'choose エラー: ' + res.error);
  }
  res.seen = seen;
  return res;
}

function act(res, action) {
  const r = Engine.apply(res.state, action);
  assert.equal(r.error, null, 'apply エラー: ' + r.error);
  return r;
}

const playUp = (res, uid, line) => act(res, { type: 'play', card: uid, line, faceUp: true });
const playDown = (res, uid, line) => act(res, { type: 'play', card: uid, line, faceUp: false });

const stack = (st, l, s) => st.lines[l][s].map(u => [st.cards[u].def, st.cards[u].faceUp]);
const defs = (st, uids) => uids.map(u => st.cards[u].def);
const faceUp = (st, uid) => st.cards[uid].faceUp;

/* ================= SMOKE ================= */

test('SMOKE_1: 裏向きのカードがある各ライン(相手側を含む)に、デッキの一番上を裏向きでプレイ', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [['TIME_6', false]], []], hand: ['SMOKE_1'], deck: ['TIME_1', 'TIME_2', 'TIME_3'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], [['UNITY_6', false]]], hand: ['UNITY_1'] });
  res = drive(playUp(res, U0('SMOKE_1'), 0), { 'each-line-order': (req) => [Math.min(...req.lines)] });
  const st = res.state;
  assert.deepEqual(stack(st, 0, 0), [['SMOKE_1', true]], '裏向きの無いライン0には置かない');
  assert.deepEqual(stack(st, 1, 0), [['TIME_6', false], ['TIME_1', false]]);
  assert.deepEqual(stack(st, 2, 0), [['TIME_2', false]], '相手側の裏向きカードも数える');
  assert.equal(st.players[0].deck[0], U0('TIME_3'));
});

test('SMOKE_2: 自分のカードを1枚反転させ、そのカードを移動できる', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [['SMOKE_3', false]], []], hand: ['SMOKE_2'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [['DIVERSITY_6', true]], []], hand: ['UNITY_1'] });
  res = playUp(res, U0('SMOKE_2'), 0);
  const req = res.requests[0];
  assert.ok(req.candidates.includes(U0('SMOKE_3')));
  assert.ok(!req.candidates.includes(U1('DIVERSITY_6')), '相手のカードは選べない');
  res = drive(res, {
    pickCard: [U0('SMOKE_3')],
    'optional-shift': ['yes'],
    'shift-dest': [2],
  });
  const st = res.state;
  assert.deepEqual(stack(st, 1, 0), []);
  assert.deepEqual(stack(st, 2, 0), [['SMOKE_3', true]], '反転して表になり、ライン2へ移動');
});

test('SMOKE_3: このラインの自分の合計値が、ラインの裏向きカード(両側)1枚ごとに+1', () => {
  const res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[['TIME_1', false], ['SMOKE_3', true]], [['TIME_2', false]], []], hand: [] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[['UNITY_1', false], ['UNITY_2', false]], [], []], hand: [] });
  const st = res.state;
  /* 裏(2) + SMOKE_3(2) + ライン0の裏向き3枚 */
  assert.equal(Engine.lineTotal(st, 0, 0), 2 + 2 + 3);
  assert.equal(Engine.lineTotal(st, 0, 1), 4, '相手側は増えない');
  assert.equal(Engine.lineTotal(st, 1, 0), 2, '別ラインは増えない');
});

test('SMOKE_4: 裏向きのカードがあるラインにだけ、手札を裏向きでプレイする', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], []], hand: ['SMOKE_4', 'TIME_6', 'WAR_6'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], [['UNITY_6', false]]], hand: ['UNITY_1'] });
  res = playUp(res, U0('SMOKE_4'), 0);
  let destLines = null;
  res = drive(res, {
    'play-card': [U0('TIME_6')],
    'play-dest': (req) => { destLines = req.lines; return [req.lines[0]]; },
  });
  const st = res.state;
  if (destLines) assert.deepEqual(destLines, [2]);
  assert.deepEqual(stack(st, 2, 0), [['TIME_6', false]]);
  assert.deepEqual(defs(st, st.players[0].hand), ['WAR_6']);
});

test('SMOKE_5: 覆われている裏向きのカードを1枚移動させる (覆われていない/表向きは対象外)', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [['TIME_1', false], ['TIME_2', true]], [['WAR_1', false]]], hand: ['SMOKE_5'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [['DIVERSITY_1', true], ['DIVERSITY_6', true]], [['UNITY_4', false], ['UNITY_6', false]]], hand: ['UNITY_1'] });
  res = playUp(res, U0('SMOKE_5'), 0);
  const req = res.requests[0];
  assert.deepEqual(req.candidates.slice().sort(), [U0('TIME_1'), U1('UNITY_4')].sort());
  res = drive(res, { pickCard: [U0('TIME_1')], 'shift-dest': [0] });
  const st = res.state;
  assert.deepEqual(stack(st, 1, 0), [['TIME_2', true]]);
  assert.deepEqual(stack(st, 0, 0), [['SMOKE_5', true], ['TIME_1', false]]);
});

/* ================= 「あなたは手札を1枚捨て札にする」(値5) ================= */

for (const [card, protos, line] of [
  ['SMOKE_6', ['SMOKE', 'TIME', 'WAR'], 0],
  ['TIME_6', ['SMOKE', 'TIME', 'WAR'], 1],
  ['WAR_6', ['SMOKE', 'TIME', 'WAR'], 2],
  ['ASSIMILATION_5', ['ASSIMILATION', 'DIVERSITY', 'UNITY'], 0],
  ['DIVERSITY_5', ['ASSIMILATION', 'DIVERSITY', 'UNITY'], 1],
  ['UNITY_6', ['ASSIMILATION', 'DIVERSITY', 'UNITY'], 2],
]) {
  test(card + ': 手札を1枚捨て札にする', () => {
    const others = protos[0] === 'SMOKE' ? ['ASSIMILATION', 'DIVERSITY', 'UNITY'] : ['SMOKE', 'TIME', 'WAR'];
    const p = protos[0];
    const h1 = p + '_1', h2 = p + '_2';
    let res = pz(
      { protos, lines: [[], [], []], hand: [card, h1, h2] },
      { protos: others, lines: [[], [], []], hand: [others[0] + '_1'] });
    res = drive(playUp(res, U0(card), line), { discard: [U0(h1)] });
    const st = res.state;
    assert.deepEqual(defs(st, st.players[0].hand), [h2]);
    assert.deepEqual(defs(st, st.players[0].trash), [h1]);
  });
}

/* ================= TIME ================= */

test('TIME_1: 捨て札のカードを1枚プレイし、残りの捨て札をすべてデッキに戻す', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], []], hand: ['TIME_1'], trash: ['SMOKE_3', 'WAR_6'], deck: ['TIME_2'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], []], hand: ['UNITY_1'] });
  const deckBefore = res.state.players[0].deck.length;
  res = drive(playUp(res, U0('TIME_1'), 1), {
    'play-from-trash': [U0('SMOKE_3')],
    'play-dest': (req) => [req.faces.findIndex(f => f.l === 0 && f.f === true)],
  });
  const st = res.state;
  assert.deepEqual(stack(st, 0, 0), [['SMOKE_3', true]]);
  assert.deepEqual(st.players[0].trash, [], '捨て札は空');
  assert.ok(st.players[0].deck.includes(U0('WAR_6')), 'WAR_6 はデッキへ');
  assert.equal(st.players[0].deck.length, deckBefore + 1);
});

test('TIME_2: 覆われているカードを1枚反転させ、デッキをすべて捨て札にする', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], []], hand: ['TIME_2'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[['ASSIMILATION_3', false], ['ASSIMILATION_6', true]], [], []], hand: ['UNITY_1'] });
  const deckBefore = res.state.players[0].deck.slice();
  res = drive(playUp(res, U0('TIME_2'), 1), { pickCard: [U1('ASSIMILATION_3')] });
  const st = res.state;
  assert.equal(faceUp(st, U1('ASSIMILATION_3')), true, '覆われたカードが表に');
  assert.equal(faceUp(st, U1('ASSIMILATION_6')), true, '覆っているカードはそのまま');
  assert.equal(st.players[0].deck.length, 0);
  assert.deepEqual(st.players[0].trash.slice().sort(), deckBefore.slice().sort());
});

test('TIME_3 中段+上段: 捨て札をデッキに戻してシャッフルでき、そのあと1枚引いてこのカードを移動できる', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], []], hand: ['TIME_3'], trash: ['SMOKE_6', 'WAR_6'], deck: ['TIME_1'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], []], hand: ['UNITY_1'] });
  res = drive(playUp(res, U0('TIME_3'), 1), {
    yesNo: ['yes'],
    'shift-dest': [2],
  });
  const st = res.state;
  assert.deepEqual(st.players[0].trash, []);
  assert.equal(st.players[0].hand.length, 1, 'シャッフル後に1枚引く');
  assert.ok(st.players[0].deck.includes(U0('SMOKE_6')) || st.players[0].hand.includes(U0('SMOKE_6')), '捨て札はデッキへ');
  assert.deepEqual(stack(st, 2, 0), [['TIME_3', true]], 'このカードを移動');
});

test('TIME_3 中段: 「することができる」なので断れば捨て札はそのまま', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], []], hand: ['TIME_3'], trash: ['SMOKE_6'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], []], hand: ['UNITY_1'] });
  res = drive(playUp(res, U0('TIME_3'), 1), { yesNo: [] });
  assert.deepEqual(defs(res.state, res.state.players[0].trash), ['SMOKE_6']);
  assert.equal(res.state.players[0].hand.length, 0);
});

test('TIME_3 上段: 覆われていても、デッキをシャッフルしたあとこのカードを移動できる (TIME_1 で覆う)', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [['TIME_3', true]], []], hand: ['TIME_1'], trash: ['WAR_6', 'SMOKE_6'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], []], hand: ['UNITY_1'] });
  const handBefore = 0;
  res = drive(playUp(res, U0('TIME_1'), 1), {
    'play-from-trash': [U0('WAR_6')],
    'play-dest': (req) => [req.faces.findIndex(f => f.l === 2 && f.f === false)],
    'optional-shift': ['yes'],
    'shift-dest': [0],
  });
  const st = res.state;
  assert.deepEqual(stack(st, 1, 0), [['TIME_1', true]]);
  assert.deepEqual(stack(st, 0, 0), [['TIME_3', true]], '覆われていた TIME_3 が移動');
  assert.equal(st.players[0].hand.length, handBefore + 1, '1枚引く');
});

test('TIME_4: 捨て札のカードを公開し、このカードとは別のラインに裏向きでプレイする', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], []], hand: ['TIME_4'], trash: ['WAR_6'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], []], hand: ['UNITY_1'] });
  let lines = null;
  res = drive(playUp(res, U0('TIME_4'), 1), { 'play-dest': (req) => { lines = req.lines; return [2]; } });
  const st = res.state;
  assert.deepEqual(lines, [0, 2], 'このカードのライン(1)は選べない');
  assert.deepEqual(stack(st, 2, 0), [['WAR_6', false]]);
  assert.deepEqual(st.players[0].trash, []);
});

test('TIME_5: カードを2枚引き、手札を2枚捨て札にする', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], []], hand: ['TIME_5', 'SMOKE_1'], deck: ['SMOKE_2', 'SMOKE_3'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], []], hand: ['UNITY_1'] });
  res = drive(playUp(res, U0('TIME_5'), 1), { discard: [U0('SMOKE_1'), U0('SMOKE_2')] });
  const st = res.state;
  assert.deepEqual(defs(st, st.players[0].hand), ['SMOKE_3']);
  assert.deepEqual(defs(st, st.players[0].trash).sort(), ['SMOKE_1', 'SMOKE_2']);
});

/* ================= WAR ================= */

test('WAR_1 上段: 自分がリフレッシュしたあと、このカードを反転できる', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], [['WAR_1', true]]], hand: [] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], []], hand: ['UNITY_1'] });
  res = drive(act(res, { type: 'refresh' }), { yesNo: ['yes'] });
  const st = res.state;
  assert.equal(st.players[0].hand.length, 5);
  assert.equal(faceUp(st, U0('WAR_1')), false, '反転して裏向き');
});

test('WAR_1 下段: 相手がカードを引いたあと、カードを1枚削除できる', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], [['WAR_1', true]]], hand: ['SMOKE_6', 'SMOKE_5'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[['ASSIMILATION_6', true]], [], []], hand: ['UNITY_1'] });
  res = playDown(res, U0('SMOKE_6'), 0);
  assert.equal(res.state.turn, 1);
  res = act(res, { type: 'refresh' });   // 相手 (side 1) がリフレッシュでカードを引く
  res = drive(res, {
    yesNo: ['yes'],
    pickCard: [U1('ASSIMILATION_6')],
  });
  const st = res.state;
  assert.equal(st.players[1].hand.length, 5);
  assert.deepEqual(stack(st, 0, 1), [], '相手のカードを削除');
  assert.ok(st.players[1].trash.includes(U1('ASSIMILATION_6')));
});

test('WAR_2 下段: 相手がリフレッシュしたあと、任意の枚数の手札を捨ててリフレッシュする', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], [['WAR_2', true]]], hand: ['SMOKE_6', 'SMOKE_5', 'SMOKE_4'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], []], hand: ['UNITY_1'] });
  res = playDown(res, U0('SMOKE_6'), 0);
  res = act(res, { type: 'refresh' });
  res = drive(res, { discard: [U0('SMOKE_5')] });
  const st = res.state;
  assert.deepEqual(defs(st, st.players[0].trash), ['SMOKE_5']);
  assert.equal(st.players[0].hand.length, 5, '捨てたあとリフレッシュで5枚');
  assert.ok(st.players[0].hand.includes(U0('SMOKE_4')));
});

test('WAR_3 中段: カードを1枚反転させる', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], []], hand: ['WAR_3'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[['ASSIMILATION_6', true]], [], []], hand: ['UNITY_1'] });
  res = drive(playUp(res, U0('WAR_3'), 2), { pickCard: [U1('ASSIMILATION_6')] });
  assert.equal(faceUp(res.state, U1('ASSIMILATION_6')), false);
});

test('WAR_3 下段: 相手がコンパイルしたあと、相手は手札をすべて捨て札にする', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], [['WAR_3', true]]], hand: ['SMOKE_6'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[['ASSIMILATION_5', true], ['ASSIMILATION_6', true]], [], []], hand: ['UNITY_1', 'UNITY_3'] });
  res = playDown(res, U0('SMOKE_6'), 1);
  res = drive(res, {});
  const st = res.state;
  assert.equal(st.players[1].protocols[0].compiled, true, '相手が ASSIMILATION をコンパイル');
  assert.deepEqual(st.players[1].hand, [], '相手の手札はすべて捨て札');
  assert.ok(st.players[1].trash.includes(U1('UNITY_1')) && st.players[1].trash.includes(U1('UNITY_3')));
});

test('WAR_4 中段: カードを1枚引く', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], []], hand: ['WAR_4'], deck: ['TIME_1'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], []], hand: ['UNITY_1'] });
  res = drive(playUp(res, U0('WAR_4'), 2), {});
  assert.deepEqual(defs(res.state, res.state.players[0].hand), ['TIME_1']);
});

test('WAR_4 下段: 相手が手札を捨て札にしたあと、カードを裏向きで1枚プレイできる', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[['WAR_4', true]], [], []], hand: ['WAR_5', 'TIME_6'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], []], hand: ['UNITY_1', 'UNITY_2'] });
  res = playUp(res, U0('WAR_5'), 2);
  res = drive(res, {
    discard: [U1('UNITY_1')],
    'optional-play': ['yes'],
    'play-dest': [1],
  });
  const st = res.state;
  assert.deepEqual(defs(st, st.players[1].trash), ['UNITY_1']);
  assert.deepEqual(stack(st, 1, 0), [['TIME_6', false]], '裏向きでプレイ');
});

test('WAR_5: 相手は手札を1枚捨て札にする', () => {
  let res = pz(
    { protos: ['SMOKE', 'TIME', 'WAR'], lines: [[], [], []], hand: ['WAR_5'] },
    { protos: ['ASSIMILATION', 'DIVERSITY', 'UNITY'], lines: [[], [], []], hand: ['UNITY_1', 'UNITY_2'] });
  let chooser = null;
  res = drive(playUp(res, U0('WAR_5'), 2), { discard: (req) => { chooser = req.player; return [U1('UNITY_2')]; } });
  const st = res.state;
  assert.equal(chooser, 1, '相手が選ぶ');
  assert.deepEqual(defs(st, st.players[1].hand), ['UNITY_1']);
  assert.deepEqual(defs(st, st.players[1].trash), ['UNITY_2']);
});

/* ================= ASSIMILATION ================= */

const A = ['ASSIMILATION', 'SMOKE', 'TIME'];
const B = ['WAR', 'DIVERSITY', 'UNITY'];

test('ASSIMILATION_1: 相手の裏向きカード(覆われていても可)を1枚自分の手札に加える', () => {
  let res = pz(
    { protos: A, lines: [[], [], []], hand: ['ASSIMILATION_1'] },
    { protos: B, lines: [[], [['DIVERSITY_1', false], ['DIVERSITY_6', false]], [['UNITY_1', true]]], hand: ['UNITY_2'] });
  res = playUp(res, U0('ASSIMILATION_1'), 0);
  assert.deepEqual(res.requests[0].candidates.slice().sort(), [U1('DIVERSITY_1'), U1('DIVERSITY_6')].sort());
  res = drive(res, { pickCard: [U1('DIVERSITY_1')] });
  const st = res.state;
  assert.deepEqual(st.players[0].hand, [U1('DIVERSITY_1')]);
  assert.deepEqual(stack(st, 1, 1), [['DIVERSITY_6', false]]);
});

test('ASSIMILATION_2 中段: 手札を1枚捨ててリフレッシュ (下段の「誰かがリフレッシュ」も続けて起きる)', () => {
  let res = pz(
    { protos: A, lines: [[], [], []], hand: ['ASSIMILATION_2', 'SMOKE_1', 'SMOKE_2'], deck: ['TIME_1', 'TIME_2', 'TIME_3', 'TIME_4', 'TIME_5'] },
    { protos: B, lines: [[], [], []], hand: ['UNITY_2'], deck: ['WAR_1'] });
  res = drive(playUp(res, U0('ASSIMILATION_2'), 0), {
    discard: (req) => [req.candidates.includes(U0('SMOKE_1')) ? U0('SMOKE_1') : U0('TIME_1')],
    'discard-to-opp-trash': [U0('TIME_1')],
    pickHand: [U0('TIME_1')],
  });
  const st = res.state;
  assert.ok(st.players[0].trash.includes(U0('SMOKE_1')), '手札を1枚捨てる');
  assert.ok(st.players[0].hand.includes(U1('WAR_1')), '下段: 相手のデッキの一番上を引く');
  assert.ok(st.players[1].trash.includes(U0('TIME_1')), '下段: 捨てた札は相手の捨て札へ');
  assert.equal(st.players[0].hand.length, 5);
});

test('ASSIMILATION_2 下段: 相手がリフレッシュしたときも、相手のデッキの一番上を引き、手札1枚を相手の捨て札へ', () => {
  let res = pz(
    { protos: A, lines: [[['ASSIMILATION_2', true]], [], []], hand: ['SMOKE_1', 'SMOKE_2'] },
    { protos: B, lines: [[], [], []], hand: ['UNITY_2'], deck: ['WAR_1', 'WAR_2', 'WAR_3', 'WAR_4', 'WAR_5'] });
  res = playDown(res, U0('SMOKE_1'), 1);
  res = act(res, { type: 'refresh' });   // 相手のリフレッシュ: WAR_1..4 を引く
  res = drive(res, { discard: [U0('SMOKE_2')], pickHand: [U0('SMOKE_2')] });
  const st = res.state;
  assert.ok(st.players[0].hand.includes(U1('WAR_5')), '相手のデッキの一番上 (リフレッシュ後) を引く');
  assert.ok(st.players[1].trash.includes(U0('SMOKE_2')), '捨てた札は相手の捨て札置き場へ');
});

test('ASSIMILATION_3 下段: 終了時、相手のデッキの一番上をこのスタックに裏向きでプレイする', () => {
  let res = pz(
    { protos: A, lines: [[['ASSIMILATION_3', true]], [], []], hand: ['SMOKE_1'] },
    { protos: B, lines: [[], [], []], hand: ['UNITY_2'], deck: ['WAR_6', 'WAR_1'] });
  res = drive(playDown(res, U0('SMOKE_1'), 1), {});
  const st = res.state;
  assert.deepEqual(stack(st, 0, 0), [['ASSIMILATION_3', true], ['WAR_6', false]]);
  assert.equal(st.players[1].deck[0], U1('WAR_1'));
});

test('ASSIMILATION_4: 相手のデッキの一番上を引き、相手は自分のデッキの一番上を引く', () => {
  let res = pz(
    { protos: A, lines: [[], [], []], hand: ['ASSIMILATION_4'], deck: ['TIME_6'] },
    { protos: B, lines: [[], [], []], hand: ['UNITY_2'], deck: ['WAR_6'] });
  res = drive(playUp(res, U0('ASSIMILATION_4'), 0), {});
  const st = res.state;
  assert.deepEqual(st.players[0].hand, [U1('WAR_6')]);
  assert.ok(st.players[1].hand.includes(U0('TIME_6')));
});

test('ASSIMILATION_6 下段: 終了時、自分のデッキの一番上を相手側の任意のスタックに裏向きでプレイする', () => {
  let res = pz(
    { protos: A, lines: [[['ASSIMILATION_6', true]], [], []], hand: ['SMOKE_1'], deck: ['TIME_6'] },
    { protos: B, lines: [[['WAR_1', true]], [['DIVERSITY_1', true]], []], hand: ['UNITY_2'] });
  let lines = null;
  res = drive(playDown(res, U0('SMOKE_1'), 1), { 'play-dest': (req) => { lines = req.lines; return [1]; } });
  const st = res.state;
  assert.ok(lines && lines.length >= 2, '相手側のスタックを選べる');
  assert.deepEqual(stack(st, 1, 1), [['DIVERSITY_1', true], ['TIME_6', false]]);
});

/* ================= DIVERSITY ================= */

test('DIVERSITY_1 中段: フィールドに6種類のプロトコルがあれば DIVERSITY をコンパイル完了面にする', () => {
  let res = pz(
    { protos: ['DIVERSITY', 'SMOKE', 'TIME'], lines: [[], [['SMOKE_1', true]], [['TIME_2', true]]], hand: ['DIVERSITY_1'] },
    { protos: ['WAR', 'ASSIMILATION', 'UNITY'], lines: [[['WAR_2', true]], [['ASSIMILATION_2', true]], [['UNITY_4', true]]], hand: ['UNITY_2'] });
  res = drive(playUp(res, U0('DIVERSITY_1'), 0), { yesNo: [] });
  assert.equal(res.state.players[0].protocols[0].compiled, true);
});

test('DIVERSITY_1 中段: 5種類ではコンパイル完了面にならない', () => {
  let res = pz(
    { protos: ['DIVERSITY', 'SMOKE', 'TIME'], lines: [[], [['SMOKE_1', true]], [['TIME_2', true]]], hand: ['DIVERSITY_1'] },
    { protos: ['WAR', 'ASSIMILATION', 'UNITY'], lines: [[['WAR_2', true]], [['ASSIMILATION_2', true]], [['UNITY_4', false]]], hand: ['UNITY_2'] });
  res = drive(playUp(res, U0('DIVERSITY_1'), 0), { yesNo: [] });
  assert.equal(res.state.players[0].protocols[0].compiled, false);
});

test('DIVERSITY_1 下段: 終了時、このラインに DIVERSITY 以外のカードをプレイできる', () => {
  let res = pz(
    { protos: ['DIVERSITY', 'SMOKE', 'TIME'], lines: [[['DIVERSITY_1', true]], [], []], hand: ['SMOKE_1', 'DIVERSITY_5', 'TIME_6'] },
    { protos: ['WAR', 'ASSIMILATION', 'UNITY'], lines: [[], [], []], hand: ['UNITY_2'] });
  res = playDown(res, U0('SMOKE_1'), 1);
  let cands = null;
  res = drive(res, {
    'optional-play': ['yes'],
    'play-free': (req) => { cands = req.candidates; return [U0('TIME_6') + '|0|u']; },
  });
  const st = res.state;
  assert.ok(cands.every(c => !c.startsWith(U0('DIVERSITY_5'))), 'DIVERSITY は候補外');
  assert.ok(cands.every(c => c.split('|')[1] === '0'), 'このラインのみ');
  assert.deepEqual(stack(st, 0, 0), [['DIVERSITY_1', true], ['TIME_6', true]], 'プロトコル不一致でも表向きで置ける');
});

test('DIVERSITY_2: カードを1枚移動し、このラインの表向きカードのプロトコル種類数だけ引く (自身を移動)', () => {
  let res = pz(
    { protos: ['DIVERSITY', 'SMOKE', 'TIME'], lines: [[], [['SMOKE_1', true]], []], hand: ['DIVERSITY_2'], deck: ['TIME_1', 'TIME_2', 'TIME_3', 'TIME_4'] },
    { protos: ['WAR', 'ASSIMILATION', 'UNITY'], lines: [[], [['ASSIMILATION_2', true]], []], hand: ['UNITY_2'] });
  res = drive(playUp(res, U0('DIVERSITY_2'), 0), {
    pickCard: [U0('DIVERSITY_2')],
    'shift-dest': [1],
  });
  const st = res.state;
  assert.deepEqual(stack(st, 1, 0), [['SMOKE_1', true], ['DIVERSITY_2', true]]);
  assert.equal(st.players[0].hand.length, 3, 'SMOKE/ASSIMILATION/DIVERSITY の3種類');
});

/* 「このライン」はこのカード (DIVERSITY_2) のあるライン。別のカードを別ラインへ移動しても数えるのは DIVERSITY_2 のライン */
// 以前はエンジンが移動先のラインを数えていた (直した。engine.js の shift で、移動後のこのカード自身のラインを引き継ぐ)
test('DIVERSITY_2: 他のカードを別ラインへ移動したとき、数えるのは DIVERSITY_2 のライン', () => {
  let res = pz(
    { protos: ['DIVERSITY', 'SMOKE', 'TIME'], lines: [[], [], []], hand: ['DIVERSITY_2'], deck: ['TIME_1', 'TIME_2', 'TIME_3', 'TIME_4'] },
    { protos: ['WAR', 'ASSIMILATION', 'UNITY'], lines: [[['WAR_2', true]], [['ASSIMILATION_2', true]], [['UNITY_4', true]]], hand: ['UNITY_2'] });
  /* WAR_2 をライン0→ライン1へ。ライン0に残るのは DIVERSITY の1種類。ライン1は WAR/ASSIMILATION の2種類 */
  res = drive(playUp(res, U0('DIVERSITY_2'), 0), {
    pickCard: [U1('WAR_2')],
    'shift-dest': [1],
  });
  const st = res.state;
  assert.deepEqual(stack(st, 1, 1), [['ASSIMILATION_2', true], ['WAR_2', true]]);
  assert.equal(st.players[0].hand.length, 1, 'このライン(0)の種類数 = 1');
});

test('DIVERSITY_3: このスタックに DIVERSITY 以外の表向きカードがあれば、このラインの合計値+2', () => {
  const res = pz(
    { protos: ['DIVERSITY', 'SMOKE', 'TIME'], lines: [[['SMOKE_1', true], ['DIVERSITY_3', true]], [], []], hand: [] },
    { protos: ['WAR', 'ASSIMILATION', 'UNITY'], lines: [[], [], []], hand: [] });
  assert.equal(Engine.lineTotal(res.state, 0, 0), 0 + 3 + 2);
  const res2 = pz(
    { protos: ['DIVERSITY', 'SMOKE', 'TIME'], lines: [[['SMOKE_1', false], ['DIVERSITY_1', true], ['DIVERSITY_3', true]], [], []], hand: [] },
    { protos: ['WAR', 'ASSIMILATION', 'UNITY'], lines: [[['WAR_2', true]], [], []], hand: [] });
  assert.equal(Engine.lineTotal(res2.state, 0, 0), 2 + 0 + 3, '裏向きや DIVERSITY、相手側のカードでは増えない');
});

test('DIVERSITY_4: フィールドのプロトコル種類数未満の値を持つカードだけを反転できる', () => {
  /* 表向き: DIVERSITY / SMOKE / WAR の3種類 → 値 0〜2 のみ対象 */
  let res = pz(
    { protos: ['DIVERSITY', 'SMOKE', 'TIME'], lines: [[], [['SMOKE_3', true]], []], hand: ['DIVERSITY_4'] },
    { protos: ['WAR', 'ASSIMILATION', 'UNITY'], lines: [[['WAR_4', true]], [['WAR_2', true]], []], hand: ['UNITY_2'] });
  res = playUp(res, U0('DIVERSITY_4'), 0);
  const req = res.requests[0];
  assert.deepEqual(req.candidates.slice().sort(), [U0('SMOKE_3'), U1('WAR_2')].sort(), 'SMOKE_3(2)/WAR_2(1)。WAR_4(3)・DIVERSITY_4(4)は対象外');
  res = drive(res, { pickCard: [U1('WAR_2')] });
  assert.equal(faceUp(res.state, U1('WAR_2')), false);
});

test('DIVERSITY_6 上段: 終了時、フィールドのプロトコル種類数が3以下ならこのカードを削除', () => {
  let res = pz(
    { protos: ['DIVERSITY', 'SMOKE', 'TIME'], lines: [[['DIVERSITY_6', true]], [['SMOKE_1', true]], []], hand: ['TIME_6'] },
    { protos: ['WAR', 'ASSIMILATION', 'UNITY'], lines: [[['WAR_2', true]], [], []], hand: ['UNITY_2'] });
  res = drive(playDown(res, U0('TIME_6'), 2), {});
  assert.deepEqual(stack(res.state, 0, 0), []);
  assert.ok(res.state.players[0].trash.includes(U0('DIVERSITY_6')));
});

test('DIVERSITY_6 上段: 4種類あれば削除されない', () => {
  let res = pz(
    { protos: ['DIVERSITY', 'SMOKE', 'TIME'], lines: [[['DIVERSITY_6', true]], [['SMOKE_1', true]], [['TIME_2', true]]], hand: ['TIME_6'] },
    { protos: ['WAR', 'ASSIMILATION', 'UNITY'], lines: [[['WAR_2', true]], [], []], hand: ['UNITY_2'] });
  res = drive(playDown(res, U0('TIME_6'), 2), {});
  assert.deepEqual(stack(res.state, 0, 0), [['DIVERSITY_6', true]]);
});

/* ================= UNITY ================= */

const UP = ['UNITY', 'SMOKE', 'TIME'];
const OP = ['WAR', 'ASSIMILATION', 'DIVERSITY'];

test('UNITY_1 中段: フィールドに他の UNITY カードがあれば、カードを1枚引く(または反転)', () => {
  let res = pz(
    { protos: UP, lines: [[], [['UNITY_4', true]], []], hand: ['UNITY_1'], deck: ['TIME_1'] },
    { protos: OP, lines: [[], [], []], hand: ['WAR_2'] });
  res = drive(playUp(res, U0('UNITY_1'), 0), { option: (req) => [req.options.length - 1] });
  assert.deepEqual(defs(res.state, res.state.players[0].hand), ['TIME_1']);
});

test('UNITY_1 中段: 他の UNITY カードが無ければ何もしない', () => {
  let res = pz(
    { protos: UP, lines: [[], [], []], hand: ['UNITY_1'], deck: ['TIME_1'] },
    { protos: OP, lines: [[], [], []], hand: ['WAR_2'] });
  res = drive(playUp(res, U0('UNITY_1'), 0), {});
  assert.equal(res.state.players[0].hand.length, 0);
  assert.equal(res.state.turn, 1);
});

test('UNITY_1 下段: UNITY カードに覆われることになったとき、先にカードを1枚引く(または反転)', () => {
  let res = pz(
    { protos: UP, lines: [[['UNITY_1', true]], [], []], hand: ['UNITY_5', 'SMOKE_1'], deck: ['TIME_1'] },
    { protos: OP, lines: [[], [], []], hand: ['WAR_2'] });
  res = drive(playUp(res, U0('UNITY_5'), 0), { option: (req) => [req.options.length - 1] });
  const st = res.state;
  assert.ok(st.players[0].hand.includes(U0('TIME_1')), '1枚引く');
  assert.deepEqual(stack(st, 0, 0), [['UNITY_1', true], ['UNITY_5', true]]);
});

test('UNITY_2 上段: 開始時、このカードが覆われていれば移動できる', () => {
  let res = pz(
    { protos: UP, lines: [[['UNITY_2', true], ['SMOKE_1', false]], [], []], hand: ['TIME_6'] },
    { protos: OP, lines: [[], [], []], hand: ['WAR_2'] });
  /* newPuzzle は P1 の開始フェイズから進む */
  res = drive(res, { 'optional-shift': ['yes'], 'shift-dest': [2] });
  const st = res.state;
  assert.deepEqual(stack(st, 0, 0), [['SMOKE_1', false]]);
  assert.deepEqual(stack(st, 2, 0), [['UNITY_2', true]]);
});

test('UNITY_2 中段: フィールドに UNITY が5枚以上あれば、UNITY をコンパイル完了面にし、そのラインのカードをすべて削除', () => {
  let res = pz(
    { protos: UP, lines: [[['UNITY_1', true]], [['UNITY_3', true]], [['UNITY_4', true], ['UNITY_5', true]]], hand: ['UNITY_2'] },
    { protos: OP, lines: [[['WAR_2', true]], [['ASSIMILATION_2', true]], []], hand: ['WAR_3'] });
  /* UNITY_1 を覆うので UNITY_1 下段が先に起きる (引く方を選ぶ) */
  res = drive(playUp(res, U0('UNITY_2'), 0), { choice: [1] });
  const st = res.state;
  assert.equal(st.players[0].protocols[0].compiled, true);
  assert.deepEqual(stack(st, 0, 0), [], 'UNITY のラインの自分側が削除');
  assert.deepEqual(stack(st, 0, 1), [], 'UNITY のラインの相手側も削除');
  assert.deepEqual(stack(st, 1, 1), [['ASSIMILATION_2', true]], '他のラインは残る');
});

test('UNITY_2 中段: UNITY が4枚以下なら何もしない', () => {
  let res = pz(
    { protos: UP, lines: [[['UNITY_1', true]], [['UNITY_3', true]], [['UNITY_4', true]]], hand: ['UNITY_2'] },
    { protos: OP, lines: [[['WAR_2', true]], [], []], hand: ['WAR_3'] });
  res = drive(playUp(res, U0('UNITY_2'), 0), { choice: [1] });
  assert.equal(res.state.players[0].protocols[0].compiled, false);
  assert.equal(res.state.lines[0][0].length, 2);
});

test('UNITY_2 下段: このラインには UNITY カードを表向きでプレイできる', () => {
  const res = pz(
    { protos: UP, lines: [[], [['UNITY_2', true]], []], hand: ['UNITY_6', 'TIME_6'] },
    { protos: OP, lines: [[], [], []], hand: ['WAR_2'] });
  const acts = Engine.legalActions(res.state);
  const ups = (uid) => acts.filter(a => a.type === 'play' && a.card === uid && a.faceUp).map(a => a.line).sort();
  assert.deepEqual(ups(U0('UNITY_6')), [0, 1], 'SMOKE のライン1にも UNITY を表で出せる');
  assert.deepEqual(ups(U0('TIME_6')), [2], 'UNITY 以外は通常どおり');
});

test('UNITY_3: フィールドにある UNITY カードの枚数だけ引く', () => {
  let res = pz(
    { protos: UP, lines: [[], [['UNITY_1', true]], [['UNITY_4', false]]], hand: ['UNITY_3'], deck: ['TIME_1', 'TIME_2', 'TIME_3'] },
    { protos: OP, lines: [[['DIVERSITY_1', true]], [], []], hand: ['WAR_2'] });
  res = drive(playUp(res, U0('UNITY_3'), 0), {});
  assert.equal(res.state.players[0].hand.length, 2, 'UNITY_3 + UNITY_1 (表向き) の2枚');
});

test('UNITY_4: 他の UNITY カードがあれば、表向きのカードを1枚反転できる', () => {
  let res = pz(
    { protos: UP, lines: [[], [['UNITY_1', true]], []], hand: ['UNITY_4'] },
    { protos: OP, lines: [[['WAR_2', true]], [['ASSIMILATION_1', false]], []], hand: ['WAR_3'] });
  res = playUp(res, U0('UNITY_4'), 0);
  let cands = null;
  res = drive(res, { yesNo: ['yes'], pickCard: (req) => { cands = req.candidates; return [U1('WAR_2')]; } });
  assert.ok(cands && !cands.includes(U1('ASSIMILATION_1')), '裏向きは対象外');
  assert.equal(faceUp(res.state, U1('WAR_2')), false);
});

test('UNITY_4: 他の UNITY カードが無ければ反転しない', () => {
  let res = pz(
    { protos: UP, lines: [[], [], []], hand: ['UNITY_4'] },
    { protos: OP, lines: [[['WAR_2', true]], [], []], hand: ['WAR_3'] });
  res = drive(playUp(res, U0('UNITY_4'), 0), {});
  assert.equal(faceUp(res.state, U1('WAR_2')), true);
});

test('UNITY_5 上段: 終了時に手札が0枚なら、デッキの UNITY カードをすべて引いてシャッフル', () => {
  let res = pz(
    { protos: UP, lines: [[['UNITY_5', true]], [], []], hand: ['TIME_6'], deck: ['SMOKE_1', 'UNITY_1', 'TIME_2', 'UNITY_3', 'UNITY_6'] },
    { protos: OP, lines: [[], [], []], hand: ['WAR_2'] });
  res = drive(playDown(res, U0('TIME_6'), 2), {});
  const st = res.state;
  /* spec に書かなかった UNITY_2 / UNITY_4 もデッキにある */
  assert.deepEqual(defs(st, st.players[0].hand).sort(), ['UNITY_1', 'UNITY_2', 'UNITY_3', 'UNITY_4', 'UNITY_6']);
  assert.ok(st.players[0].deck.every(u => !st.cards[u].def.startsWith('UNITY')));
});

test('UNITY_5 上段: 手札があれば何もしない', () => {
  let res = pz(
    { protos: UP, lines: [[['UNITY_5', true]], [], []], hand: ['TIME_6', 'SMOKE_1'], deck: ['UNITY_1'] },
    { protos: OP, lines: [[], [], []], hand: ['WAR_2'] });
  res = drive(playDown(res, U0('TIME_6'), 2), {});
  assert.deepEqual(defs(res.state, res.state.players[0].hand), ['SMOKE_1']);
});
