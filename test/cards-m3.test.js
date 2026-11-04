'use strict';
/* カード効果の検証 (Main 3: AMBUSH / ENVY / FULCRUM / GLUTTONY / GREED / LUST / MOMENTUM / NOVA / OVERWHELM / PRIDE / SLOTH / WRATH)
   各カードの文面どおりの結果になるかを、Engine.newPuzzle で組んだ盤面で確かめる。
   node --test test/cards-m3.test.js */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);

const U0 = (d) => 'p0:' + d;
const U1 = (d) => 'p1:' + d;

function pz(s0, s1, extra) {
  const res = Engine.newPuzzle(Object.assign({ sides: [s0, s1] }, extra || {}), { seed: 1 });
  assert.equal(res.error, null);
  return res;
}

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

const P0 = ['AMBUSH', 'ENVY', 'FULCRUM'];
const P1 = ['GLUTTONY', 'GREED', 'LUST'];
const P2 = ['MOMENTUM', 'NOVA', 'OVERWHELM'];
const P3 = ['PRIDE', 'SLOTH', 'WRATH'];

test('Main 3: 12プロトコル72枚がそろい、値の並びは公式どおり', () => {
  const m3 = cards.protocols.filter(p => p.set === 'Main 3');
  assert.equal(m3.length, 12);
  const vals = Object.fromEntries(m3.map(p => [p.name, p.cards.map(c => c.value).join('')]));
  assert.equal(vals.LUST, '023456');
  assert.equal(vals.PRIDE, '023456');
  assert.equal(vals.MOMENTUM, '013456');
  assert.equal(vals.OVERWHELM, '123456');
  assert.equal(vals.ENVY, '012345');
});

/* ================= AMBUSH ================= */

test('AMBUSH_1: 3枚引き、自分の裏向きを1枚反転', () => {
  let res = pz({ protos: P0, lines: [[], [['ENVY_6', false]], []], hand: ['AMBUSH_1'], deck: ['ENVY_1', 'ENVY_2', 'ENVY_3'] },
    { protos: P1, lines: [[['GREED_6', false]], [], []] });
  res = drive(playUp(res, U0('AMBUSH_1'), 0), { discard: (req) => [req.candidates[0]] });
  assert.equal(res.state.cards[U0('ENVY_6')].faceUp, true, '自分の裏向きは1枚だけなので自動で反転');
  assert.equal(res.state.cards[U1('GREED_6')].faceUp, false);
  assert.equal(res.state.players[0].hand.length, 2, '3枚引き、表になった ENVY_6 の中段で1枚捨てた');
});

test('AMBUSH_2: 値0と1の自分の他のカードをすべて裏にし、その枚数引く', () => {
  let res = pz({ protos: P0, lines: [[['AMBUSH_1', true]], [['ENVY_2', true]], [['FULCRUM_3', true]]], hand: ['AMBUSH_2'] },
    { protos: P1, lines: [[['GLUTTONY_1', true]], [], []] });
  res = playUp(res, U0('AMBUSH_2'), 0);
  const st = res.state;
  assert.equal(st.cards[U0('AMBUSH_1')].faceUp, false, 'AMBUSH_1 (値0) は覆われていても裏になる');
  assert.equal(st.cards[U0('ENVY_2')].faceUp, false, 'ENVY_2 (値1)');
  assert.equal(st.cards[U0('FULCRUM_3')].faceUp, true, '値2は対象外');
  assert.equal(st.cards[U1('GLUTTONY_1')].faceUp, true, '相手のカードは対象外');
  assert.equal(st.cards[U0('AMBUSH_2')].faceUp, true, '自分自身は対象外');
  assert.equal(st.players[0].hand.length, 2);
});

test('AMBUSH_3: 値が最も小さい自分の覆われているカードを移動', () => {
  let res = pz({ protos: P0, lines: [[['AMBUSH_1', true], ['ENVY_6', true]], [], []], hand: ['AMBUSH_3'] },
    { protos: P1, lines: [[], [], []] });
  res = drive(playUp(res, U0('AMBUSH_3'), 0), { 'shift-dest': [2] });
  assert.deepEqual(stack(res.state, 2, 0), [['AMBUSH_1', true]]);
});

test('AMBUSH_5: 覆われていない自分の裏向きがあれば1枚引く', () => {
  let res = pz({ protos: P0, lines: [[], [['ENVY_6', false]], []], hand: ['AMBUSH_5'] }, { protos: P1 });
  res = playUp(res, U0('AMBUSH_5'), 0);
  assert.equal(res.state.players[0].hand.length, 1);
  let r2 = pz({ protos: P0, lines: [[], [['ENVY_4', true]], []], hand: ['AMBUSH_5'] }, { protos: P1 });
  r2 = playUp(r2, U0('AMBUSH_5'), 0);
  assert.equal(r2.state.players[0].hand.length, 0);
});

/* ================= ENVY ================= */

test('ENVY_1: このラインの相手の最大値のカードの値だけ合計値が増える', () => {
  const res = pz({ protos: P0, lines: [[], [['ENVY_1', true]], []] },
    { protos: P1, lines: [[], [['GREED_6', true], ['GREED_3', true]], []] });
  assert.equal(Engine.lineTotal(res.state, 1, 0), 0 + 5);
});

test('ENVY_2: 開始時、相手がコントロールを持っていればコントロールを得る', () => {
  const res = pz({ protos: P0, lines: [[['ENVY_2', true]], [], []] }, { protos: P1 }, { useControl: true, control: 1 });
  assert.equal(res.state.control, 0);
});

test('ENVY_3: 相手の手札の枚数だけ引く', () => {
  let res = pz({ protos: P0, hand: ['ENVY_3'] }, { protos: P1, hand: ['GREED_1', 'GREED_2', 'GREED_3'] });
  res = playUp(res, U0('ENVY_3'), 1);
  assert.equal(res.state.players[0].hand.length, 3);
});

test('ENVY_4: 相手がこのラインにプレイしたあと、デッキの一番上をこのラインに裏向きでプレイ', () => {
  let res = pz({ protos: P1, hand: ['GREED_6'] },
    { protos: P0, lines: [[], [['ENVY_4', true]], []], deck: ['AMBUSH_1'] });
  res = playDown(res, U0('GREED_6'), 1);
  assert.deepEqual(stack(res.state, 1, 1), [['ENVY_4', true], ['AMBUSH_1', false]]);
});

test('ENVY_5: 相手のコンパイル済みが多いときだけ反転', () => {
  let res = pz({ protos: P0, hand: ['ENVY_5'] }, { protos: P1, lines: [[['GREED_6', true]], [], []], compiled: [true] });
  res = drive(playUp(res, U0('ENVY_5'), 1), { flip: [U1('GREED_6')] });
  assert.equal(res.state.cards[U1('GREED_6')].faceUp, false);
  let r2 = pz({ protos: P0, hand: ['ENVY_5'] }, { protos: P1, lines: [[['GREED_6', true]], [], []] });
  r2 = playUp(r2, U0('ENVY_5'), 1);
  assert.equal(r2.requests.length, 0, 'コンパイル済みの数が同じなら何もしない');
});

/* ================= FULCRUM ================= */

test('FULCRUM_1: 手札0枚なら相手は1枚捨てる。開始時は2枚', () => {
  let res = pz({ protos: P0, hand: ['FULCRUM_1'] }, { protos: P1, hand: ['GREED_1', 'GREED_2', 'GREED_3'] });
  res = drive(playUp(res, U0('FULCRUM_1'), 2), { discard: (req) => [req.candidates[0]] });
  assert.equal(res.state.players[1].hand.length, 2);
  const r2 = pz({ protos: P0, lines: [[], [], [['FULCRUM_1', true]]] }, { protos: P1, hand: ['GREED_1', 'GREED_2', 'GREED_3'] });
  const r3 = drive(r2, { discard: (req) => req.candidates.slice(0, 2) });
  assert.equal(r3.state.players[1].hand.length, 1);
});

test('FULCRUM_2: 他の表向きをすべて裏にし、左右のスタックを入れ替える', () => {
  let res = pz({ protos: P0, lines: [[['AMBUSH_6', true]], [], [['ENVY_6', false]]], hand: ['FULCRUM_2'] },
    { protos: P1, lines: [[['GREED_6', true]], [], []] });
  res = playUp(res, U0('FULCRUM_2'), 2);
  const st = res.state;
  assert.equal(st.cards[U1('GREED_6')].faceUp, false);
  assert.deepEqual(stack(st, 0, 0), [['ENVY_6', false], ['FULCRUM_2', true]]);
  assert.deepEqual(stack(st, 2, 0), [['AMBUSH_6', false]]);
});

test('FULCRUM_3: 手札ちょうど2枚なら相手のカードを1枚削除', () => {
  let res = pz({ protos: P0, hand: ['FULCRUM_3', 'ENVY_1', 'ENVY_2'] }, { protos: P1, lines: [[['GREED_6', true]], [], []] });
  res = playUp(res, U0('FULCRUM_3'), 2);
  assert.deepEqual(res.state.lines[0][1], []);
});

test('FULCRUM_4: 1枚引き、左右のプロトコルを入れ替える', () => {
  let res = pz({ protos: P0, hand: ['FULCRUM_4'] }, { protos: P1 });
  res = playUp(res, U0('FULCRUM_4'), 2);
  assert.deepEqual(res.state.players[0].protocols.map(p => p.name), ['FULCRUM', 'ENVY', 'AMBUSH']);
});

/* ================= GLUTTONY ================= */

test('GLUTTONY_1: 他のカードを1枚戻して1枚引く', () => {
  let res = pz({ protos: P1, hand: ['GLUTTONY_1'] }, { protos: P0, lines: [[['AMBUSH_6', true]], [], []] });
  res = playUp(res, U0('GLUTTONY_1'), 0);
  assert.ok(res.state.players[1].hand.includes(U1('AMBUSH_6')));
  assert.equal(res.state.players[0].hand.length, 1);
});

test('GLUTTONY_2: キャッシュのクリアのあと、カードを1枚削除', () => {
  let res = pz({ protos: P1, lines: [[['GLUTTONY_2', true]], [], []], hand: ['GREED_1', 'GREED_2', 'GREED_3', 'GREED_4', 'GREED_5', 'GREED_6', 'LUST_1'] },
    { protos: P0, lines: [[], [['AMBUSH_6', true]], []] });
  res = drive(playDown(res, U0('LUST_1'), 1), { 'clear-cache': (req) => [req.candidates[0]], delete: [U1('AMBUSH_6')] });
  assert.deepEqual(res.state.lines[1][1], []);
});

test('GLUTTONY_4: 終了時、表向きに覆われていればそのカードを削除', () => {
  let res = pz({ protos: P1, lines: [[['GLUTTONY_4', true]], [], []], hand: ['GLUTTONY_6'] }, { protos: P0 });
  res = drive(playUp(res, U0('GLUTTONY_6'), 0), { discard: [] });
  assert.deepEqual(stack(res.state, 0, 0), [['GLUTTONY_4', true]]);
});

/* ================= GREED ================= */

test('GREED_2: 終了時、コンパイルできるラインを1つコンパイルする', () => {
  let res = pz({ protos: P1, lines: [[['GREED_2', true]], [['GREED_6', true], ['GREED_4', true]], []], hand: ['GLUTTONY_6'] }, { protos: P0 });
  res = drive(playDown(res, U0('GLUTTONY_6'), 1), {});
  assert.equal(res.state.players[0].protocols[1].compiled, true);
  assert.deepEqual(res.state.lines[1][0], []);
});

test('GREED_5: 手札をすべて捨てることを選べば1枚反転', () => {
  let res = pz({ protos: P1, hand: ['GREED_5', 'LUST_1'] }, { protos: P0, lines: [[['AMBUSH_6', true]], [], []] });
  res = drive(playUp(res, U0('GREED_5'), 1), { 'optional-discard': [true], flip: [U1('AMBUSH_6')] });
  assert.equal(res.state.players[0].hand.length, 0);
  assert.equal(res.state.cards[U1('AMBUSH_6')].faceUp, false);
});

/* ================= LUST ================= */

test('LUST_1: このラインの両者の合計値 +10、コントロールを得る、自分がコントロールを持てば相手はコンパイル不可', () => {
  let res = pz({ protos: P1, hand: ['LUST_1'] }, { protos: P0, lines: [[], [], [['FULCRUM_1', true]]] }, { useControl: true });
  res = playUp(res, U0('LUST_1'), 2);
  const st = res.state;
  assert.equal(Engine.lineTotal(st, 2, 0), 10);
  assert.equal(Engine.lineTotal(st, 2, 1), 10);
  assert.equal(st.control, 0);
});

test('LUST_1: コントロールを持つ側の LUST_1 があると、相手はコンパイルの確認で何もできない', () => {
  const res = pz({ protos: P0, lines: [[['AMBUSH_6', true], ['ENVY_6', true]], [], []] },
    { protos: P1, lines: [[], [], [['LUST_1', true]]] }, { useControl: true, control: 1 });
  assert.equal(res.state.phase, 'action', '値10で上回っていてもコンパイルしない');
  assert.equal(res.state.players[0].protocols[0].compiled, false);
});

test('LUST_2 lower: このスタックにはプロトコルを対応させずに表向きでプレイできる', () => {
  const res = pz({ protos: P1, lines: [[], [], [['LUST_2', true]]], hand: ['GREED_1'] }, { protos: P0 });
  const acts = Engine.legalActions(res.state);
  assert.ok(acts.some(a => a.card === U0('GREED_1') && a.line === 2 && a.faceUp));
  assert.ok(!acts.some(a => a.card === U0('GREED_1') && a.line === 0 && a.faceUp));
});

test('LUST_3: 相手の手札からランダムに1枚、相手側に裏向きでプレイ', () => {
  let res = pz({ protos: P1, hand: ['LUST_3'] }, { protos: P0, hand: ['AMBUSH_1'] });
  res = drive(playUp(res, U0('LUST_3'), 2), { 'play-dest': [1] });
  assert.deepEqual(stack(res.state, 1, 1), [['AMBUSH_1', false]]);
  assert.equal(res.state.players[1].hand.length, 0);
});

test('LUST_4: 相手はコントロールを失う。相手がコントロールを得たあと1枚引く', () => {
  let res = pz({ protos: P1, hand: ['LUST_4'] }, { protos: P0 }, { useControl: true, control: 1 });
  res = playUp(res, U0('LUST_4'), 2);
  assert.equal(res.state.control, -1);
});

test('LUST_6: 手札を1枚捨て、相手はこのラインに裏向きで1枚プレイ', () => {
  let res = pz({ protos: P1, hand: ['LUST_6', 'GREED_1'] }, { protos: P0, hand: ['AMBUSH_1', 'ENVY_1'] });
  res = drive(playUp(res, U0('LUST_6'), 2), { 'play-card': [U1('ENVY_1')] });
  assert.deepEqual(stack(res.state, 2, 1), [['ENVY_1', false]]);
  assert.equal(res.state.players[0].hand.length, 0);
});

/* ================= MOMENTUM ================= */

test('MOMENTUM_1: コンパイル済みのプロトコルがある各ラインに裏向きでプレイ', () => {
  let res = pz({ protos: P2, hand: ['MOMENTUM_1'], compiled: [false, true], deck: ['NOVA_1', 'NOVA_2'] },
    { protos: P0, compiled: [false, false, true] });
  res = drive(playUp(res, U0('MOMENTUM_1'), 0), { 'each-line-order': (req) => [Math.min(...req.lines)] });
  assert.deepEqual(stack(res.state, 1, 0), [['NOVA_1', false]]);
  assert.deepEqual(stack(res.state, 2, 0), [['NOVA_2', false]]);
});

test('MOMENTUM_2: プロトコルを並べ替えたあと、1枚捨てて1枚引く', () => {
  let res = pz({ protos: P2, lines: [[], [], [['MOMENTUM_2', true]]], hand: ['MOMENTUM_4', 'NOVA_6'] }, { protos: P0 });
  res = drive(playUp(res, U0('MOMENTUM_4'), 0), { rearrange: [1, 0, 2], discard: [U0('NOVA_6')] });
  assert.ok(res.state.players[0].trash.includes(U0('NOVA_6')));
  assert.equal(res.state.players[0].hand.length, 1);
});

test('MOMENTUM_6: いずれかのプレイヤーがコンパイルしたあと、このカードを削除', () => {
  const res = pz({ protos: P2, lines: [[['NOVA_6', true], ['OVERWHELM_6', true]], [['MOMENTUM_6', true]], []] }, { protos: P0 });
  assert.equal(res.state.players[0].protocols[0].compiled, true);
  assert.deepEqual(res.state.lines[1][0], [], 'コンパイルのあとに自分を削除');
  assert.ok(res.state.players[0].trash.includes(U0('MOMENTUM_6')));
});

/* ================= NOVA ================= */

test('NOVA_2: 相手はこのスタックの枚数だけ捨てる', () => {
  let res = pz({ protos: P2, lines: [[], [['NOVA_6', false]], []], hand: ['NOVA_2'] }, { protos: P0, hand: ['AMBUSH_1', 'AMBUSH_2', 'AMBUSH_3'] });
  res = drive(playUp(res, U0('NOVA_2'), 1), { discard: (req) => req.candidates.slice(0, 2) });
  assert.equal(res.state.players[1].hand.length, 1);
});

test('NOVA_3: NOVA を覆っていればプロトコルを並べ替えてよい / そうでなければコントロールを得る', () => {
  let res = pz({ protos: P2, hand: ['NOVA_3'] }, { protos: P0 }, { useControl: true });
  res = playUp(res, U0('NOVA_3'), 1);
  assert.equal(res.state.control, 0);
  let r2 = pz({ protos: P2, lines: [[], [['NOVA_6', true]], []], hand: ['NOVA_3'] }, { protos: P0 }, { useControl: true });
  r2 = drive(playUp(r2, U0('NOVA_3'), 1), { 'optional-rearrange': [true], rearrange: [2, 1, 0], 'optional-shift': [] });
  assert.deepEqual(r2.state.players[0].protocols.map(p => p.name), ['OVERWHELM', 'NOVA', 'MOMENTUM']);
  assert.equal(r2.state.control, -1);
});

test('NOVA_4: このスタックの枚数より値が小さいカードだけ移動できる', () => {
  let res = pz({ protos: P2, lines: [[], [['NOVA_6', false], ['NOVA_2', true]], []], hand: ['NOVA_4'] },
    { protos: P0, lines: [[['AMBUSH_6', true]], [['ENVY_2', true]], []] });
  res = drive(playUp(res, U0('NOVA_4'), 1), { 'shift-dest': [2] });
  assert.deepEqual(stack(res.state, 2, 1), [['ENVY_2', true]], '値1 < 3 なので ENVY_2 だけが候補');
  assert.deepEqual(stack(res.state, 0, 1), [['AMBUSH_6', true]], '値5 は対象外');
});

test('NOVA_1 lower: 終了時、覆われていない自分の NOVA の下にデッキの一番上を置く', () => {
  let res = pz({ protos: P2, lines: [[], [['NOVA_1', true]], []], hand: ['MOMENTUM_6'], deck: ['OVERWHELM_6'] }, { protos: P0 });
  res = drive(playDown(res, U0('MOMENTUM_6'), 0), {});
  assert.deepEqual(stack(res.state, 1, 0), [['OVERWHELM_6', false], ['NOVA_1', true]]);
});

/* ================= OVERWHELM ================= */

test('OVERWHELM_2: 相手は各ラインにデッキの一番上を裏向きでプレイ', () => {
  let res = pz({ protos: P2, hand: ['OVERWHELM_2'] }, { protos: P0, deck: ['AMBUSH_1', 'AMBUSH_2', 'AMBUSH_3'] });
  res = drive(playUp(res, U0('OVERWHELM_2'), 2), { 'each-line-order': (req) => [Math.min(...req.lines)] });
  for (let l = 0; l < 3; l++) assert.equal(res.state.lines[l][1].length, 1);
});

test('OVERWHELM_4: 場のカードが多ければ、相手の最小値の覆われているカードを削除', () => {
  let res = pz({ protos: P2, lines: [[['OVERWHELM_6', true]], [['NOVA_6', true]], []], hand: ['OVERWHELM_4'] },
    { protos: P0, lines: [[['AMBUSH_1', true], ['AMBUSH_6', true]], [], []] });
  res = playUp(res, U0('OVERWHELM_4'), 2);
  assert.deepEqual(stack(res.state, 0, 1), [['AMBUSH_6', true]]);
});

test('OVERWHELM_6: 開始時、相手がこのラインで上回っていればこのカードを裏返す', () => {
  const res = pz({ protos: P2, lines: [[], [], [['OVERWHELM_6', true]]] }, { protos: P0, lines: [[], [], [['FULCRUM_6', true], ['FULCRUM_5', true]]] });
  assert.equal(res.state.cards[U0('OVERWHELM_6')].faceUp, false);
});

/* ================= PRIDE ================= */

test('PRIDE_2: 自分が上回るラインの数だけ引く', () => {
  let res = pz({ protos: P3, lines: [[['PRIDE_6', true]], [['SLOTH_6', true]], []], hand: ['PRIDE_2'] }, { protos: P0 });
  res = playUp(res, U0('PRIDE_2'), 0);
  assert.equal(res.state.players[0].hand.length, 2);
});

test('PRIDE_6: 相手がコントロールを持っていれば、このカードを反転させる', () => {
  let res = pz({ protos: P3, hand: ['PRIDE_6'] }, { protos: P0 }, { useControl: true, control: 1 });
  res = playUp(res, U0('PRIDE_6'), 0);
  assert.equal(res.state.cards[U0('PRIDE_6')].faceUp, false);
});

test('PRIDE_6 upper: 相手がコントロールを得たあと、このカードを反転させる', () => {
  let res = pz({ protos: P0, lines: [[['AMBUSH_6', true]], [['ENVY_6', true]], []], hand: ['FULCRUM_6'] },
    { protos: P3, lines: [[], [], [['PRIDE_6', true]]] }, { useControl: true });
  assert.equal(res.state.control, 0, '2ラインで上回ってコントロールを得た');
  assert.equal(res.state.cards[U1('PRIDE_6')].faceUp, false);
});

/* ================= SLOTH ================= */

test('SLOTH_1: SLOTH カードに覆われていれば、このラインの合計値 +5', () => {
  const res = pz({ protos: P3, lines: [[], [['SLOTH_1', true], ['SLOTH_4', true]], [['SLOTH_2', false]]] }, { protos: P0 });
  assert.equal(Engine.lineTotal(res.state, 1, 0), 0 + 3 + 5);
});

test('SLOTH_2: 自分のカードを戻したらリフレッシュする', () => {
  let res = pz({ protos: P3, lines: [[['PRIDE_6', true]], [], []], hand: ['SLOTH_2'] }, { protos: P0, lines: [[], [], [['AMBUSH_6', true]]] });
  res = drive(playUp(res, U0('SLOTH_2'), 1), { return: [U0('PRIDE_6')] });
  assert.equal(res.state.players[0].hand.length, 5);
});

test('SLOTH_3 lower: 開始時、手札1枚をデッキの一番下に置ける', () => {
  const res0 = pz({ protos: P3, lines: [[], [['SLOTH_3', true]], []], hand: ['PRIDE_1'] }, { protos: P0 });
  const res = drive(res0, { 'hand-to-deck-bottom': [U0('PRIDE_1')] });
  const deck = res.state.players[0].deck;
  assert.equal(deck[deck.length - 1], U0('PRIDE_1'));
});

/* ================= WRATH ================= */

test('WRATH_1: このラインの値が最も大きいカードは合計値に入らない', () => {
  const res = pz({ protos: P3, lines: [[['WRATH_1', true], ['WRATH_6', true]], [], []] },
    { protos: P0, lines: [[['AMBUSH_6', true], ['AMBUSH_3', true]], [], []] });
  assert.equal(Engine.lineTotal(res.state, 0, 0), 0, '値5 は数えない');
  assert.equal(Engine.lineTotal(res.state, 0, 1), 2);
});

test('WRATH_5: コントロールを失ったら相手は2枚捨てる / 持っていなければ何もしない', () => {
  let res = pz({ protos: P3, hand: ['WRATH_5'] }, { protos: P0, hand: ['AMBUSH_1', 'AMBUSH_2'] }, { useControl: true, control: 0 });
  res = playUp(res, U0('WRATH_5'), 2);
  assert.equal(res.state.control, -1);
  assert.equal(res.state.players[1].hand.length, 0);
  let r2 = pz({ protos: P3, hand: ['WRATH_5'] }, { protos: P0, hand: ['AMBUSH_1', 'AMBUSH_2'] }, { useControl: true });
  r2 = playUp(r2, U0('WRATH_5'), 2);
  assert.equal(r2.state.players[1].hand.length, 2);
});

test('WRATH_3: カードが最も多いラインの表向きをすべて裏にする', () => {
  let res = pz({ protos: P3, lines: [[['PRIDE_6', true]], [], []], hand: ['WRATH_3'] },
    { protos: P0, lines: [[['AMBUSH_6', true], ['AMBUSH_5', true]], [['ENVY_6', true]], []] });
  res = playUp(res, U0('WRATH_3'), 2);
  const st = res.state;
  assert.equal(st.cards[U0('PRIDE_6')].faceUp, false);
  assert.equal(st.cards[U1('AMBUSH_6')].faceUp, false);
  assert.equal(st.cards[U1('ENVY_6')].faceUp, true);
});

/* ================= 全体 ================= */

test('Main 3 どうしのランダム対戦がエラーなく最後まで進む', () => {
  const sets = [P0, P1, P2, P3, ['LUST', 'NOVA', 'WRATH'], ['PRIDE', 'ENVY', 'MOMENTUM']];
  for (let g = 0; g < 24; g++) {
    let res = Engine.newGame({ p0: sets[g % sets.length], p1: sets[(g + 1) % sets.length], seed: 100 + g, useControl: true });
    let rng = 7 + g;
    const rnd = (n) => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng % n; };
    for (let step = 0; step < 400 && res.state.winner === null; step++) {
      if (res.requests.length) {
        const req = res.requests[0];
        const picks = Engine.randomPicksFor ? Engine.randomPicksFor(req) : null;
        res = Engine.apply(res.state, { type: 'choose', id: req.id, picks: picks || pickAny(req, rnd) });
      } else {
        const acts = Engine.legalActions(res.state);
        res = Engine.apply(res.state, acts[rnd(acts.length)]);
      }
      assert.equal(res.error, null, `game ${g} step ${step}: ${res.error}`);
    }
  }
});

function pickAny(req, rnd) {
  const k = req.kind;
  if (k === 'pickCard' || k === 'pickHand') {
    const min = req.min !== undefined ? req.min : 1;
    const c = req.candidates.slice();
    const out = [];
    while (out.length < Math.max(min, 1) && c.length && out.length < (req.max !== undefined ? req.max : 1)) out.push(c.splice(rnd(c.length), 1)[0]);
    return out.slice(0, Math.max(min, out.length));
  }
  if (k === 'pickLine') return [req.lines[rnd(req.lines.length)]];
  if (k === 'option') return [rnd(req.options.length)];
  if (k === 'yesNo') return rnd(2) ? [true] : [];
  if (k === 'arrange') return req.exact === 'transposition' ? [1, 0, 2] : [2, 0, 1];
  return [];
}

test('ENVY_2: 相手がコントロールを持っていなければ、開始で取らず「発動」とも出さない', () => {
  for (const control of [-1, 0]) {
    const res = pz({ protos: P0, lines: [[['ENVY_2', true]], [], []] }, { protos: P1 }, { useControl: true, control });
    assert.equal(res.state.control, control);
    assert.ok(!res.state.actionLog.some(m => /ENVY_2\] 下段効果が発動/.test(m)), '条件を満たさないのに発動と出た');
  }
});

test('ふつうのコントロール確認で取ったときは、理由をログに書く (直前の誘発で取ったと見間違えない)', () => {
  const res = pz({ protos: P0, lines: [[['ENVY_2', true]], [['ENVY_6', true]], []] }, { protos: P1 }, { useControl: true, control: -1 });
  assert.equal(res.state.control, 0);
  assert.ok(res.state.actionLog.some(m => m === 'P1: コントロールを獲得 (2ライン以上で上回った)'));
  assert.ok(!res.state.actionLog.some(m => /ENVY_2\] 下段効果が発動/.test(m)));
});
