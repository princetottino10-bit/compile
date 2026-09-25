'use strict';
/* カード効果の検証 (COURAGE / FEAR / ICE / LUCK / MIRROR / PEACE) — node --test test/cards-d.test.js
   盤面は Engine.newPuzzle で作る。P1 (side 0) の手番の開始から始まる。
   相手 (side 1) の既定プロトコルは中段しか持たない DARKNESS / DEATH / WATER にして、余計な誘発を避ける */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);

/* ---------- ヘルパ ---------- */

const OPP = ['DARKNESS', 'DEATH', 'WATER'];

function side(protos, o) {
  return Object.assign({ protos, lines: [[], [], []], hand: [] }, o || {});
}

/* spec: { me: {...}, opp: {...} } */
function start(me, opp) {
  const res = Engine.newPuzzle({ sides: [me, opp || side(OPP)] }, { seed: 1 });
  assert.equal(res.error, null, 'newPuzzle: ' + res.error);
  return res;
}

function u(defId, s) { return 'p' + (s || 0) + ':' + defId; }

function play(res, defId, line, faceUp, s) {
  const out = Engine.apply(res.state, { type: 'play', card: u(defId, s), line, faceUp: faceUp !== false });
  assert.equal(out.error, null, 'play エラー: ' + out.error);
  return out;
}

/* requests に handlers で答えながら進める。handlers は prompt 名 (無ければ kind) → (req) => picks */
function drive(res, handlers) {
  let n = 0;
  const h = handlers || {};
  while (res.requests.length) {
    if (++n > 30) throw new Error('drive: 収束しない ' + JSON.stringify(res.requests[0]));
    const req = res.requests[0];
    const fn = h[req.prompt] || h[req.kind];
    if (!fn) throw new Error('予期しない要求: ' + JSON.stringify(req));
    const picks = fn(req, res);
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks });
    assert.equal(res.error, null, 'choose エラー: ' + res.error + ' / ' + JSON.stringify(req));
  }
  return res;
}

function defs(st, uids) { return uids.map(x => st.cards[x].def); }
function stackDefs(st, line, s) { return st.lines[line][s].map(x => st.cards[x].def); }
function hand(st, s) { return defs(st, st.players[s].hand); }
function trash(st, s) { return defs(st, st.players[s].trash); }
function faceUp(st, defId, s) { return st.cards[u(defId, s)].faceUp; }
function lineOf(st, defId, s) {
  const uid = u(defId, s);
  for (let l = 0; l < 3; l++) if (st.lines[l][s || 0].includes(uid)) return l;
  return -1;
}

/* ---------- COURAGE ---------- */

test('COURAGE_1 上段: 開始時に手札0枚なら1枚引く', () => {
  const res = start(side(['COURAGE', 'FEAR', 'ICE'], { lines: [[['COURAGE_1', true]], [], []], hand: [], deck: ['FEAR_6'] }));
  assert.deepEqual(hand(res.state, 0), ['FEAR_6']);
});

test('COURAGE_1 上段: 開始時に手札があれば引かない', () => {
  const res = start(side(['COURAGE', 'FEAR', 'ICE'], { lines: [[['COURAGE_1', true]], [], []], hand: ['ICE_5'], deck: ['FEAR_6'] }));
  assert.deepEqual(hand(res.state, 0), ['ICE_5']);
});

test('COURAGE_1 中段+下段: 1枚引き、終了時に1枚捨てれば相手も1枚捨てる', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['COURAGE_1', 'ICE_5'], deck: ['FEAR_6'] }),
    side(OPP, { hand: ['DEATH_4', 'WATER_4'] }));
  res = play(res, 'COURAGE_1', 0);
  res = drive(res, {
    'optional-discard': () => ['yes'],
    discard: (req) => req.player === 0 ? [u('ICE_5')] : [u('DEATH_4', 1)],
  });
  const st = res.state;
  assert.deepEqual(hand(st, 0), ['FEAR_6'], '中段で FEAR_6 を引き、ICE_5 を捨てた');
  assert.deepEqual(trash(st, 0), ['ICE_5']);
  assert.equal(st.players[1].hand.length, 1, '相手は1枚捨てた');
  assert.equal(st.players[1].trash.length, 1);
});

test('COURAGE_1 下段: 捨てなければ相手も捨てない', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['COURAGE_1', 'ICE_5'], deck: ['FEAR_6'] }),
    side(OPP, { hand: ['DEATH_4', 'WATER_4'] }));
  res = play(res, 'COURAGE_1', 0);
  res = drive(res, { 'optional-discard': () => [] });
  assert.equal(res.state.players[0].hand.length, 2);
  assert.equal(res.state.players[1].hand.length, 2);
  assert.equal(res.state.players[1].trash.length, 0);
});

test('COURAGE_2: 相手の合計値が大きいラインにある相手のカードだけを削除できる', () => {
  let res = start(
    side(['COURAGE', 'FEAR', 'ICE'], { lines: [[], [['FEAR_4', false], ['FEAR_5', false]], []], hand: ['COURAGE_2'] }),
    side(OPP, { lines: [[['DARKNESS_4', true]], [['DEATH_3', true]], [['WATER_4', true]]] }));
  res = play(res, 'COURAGE_2', 0);
  let cands = null;
  res = drive(res, { pickCard: (req) => { cands = req.candidates.slice().sort(); return [u('WATER_4', 1)]; } });
  assert.deepEqual(cands, [u('DARKNESS_4', 1), u('WATER_4', 1)].sort(), 'ライン1(自分4>相手2)の DEATH_3 は対象外');
  assert.deepEqual(trash(res.state, 1), ['WATER_4']);
  assert.deepEqual(stackDefs(res.state, 1, 1), ['DEATH_3']);
});

test('COURAGE_3: 1枚引き、終了時にこのラインで相手が上回っていればさらに1枚引く', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['COURAGE_3'] }),
    side(OPP, { lines: [[['DARKNESS_6', true]], [], []] }));
  res = play(res, 'COURAGE_3', 0);
  assert.equal(res.state.players[0].hand.length, 2);
});

test('COURAGE_3: このラインで相手が上回っていなければ終了時は引かない', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['COURAGE_3'] }),
    side(OPP, { lines: [[['DARKNESS_2', true]], [['DEATH_6', true]], []] }));
  res = play(res, 'COURAGE_3', 0);
  assert.equal(res.state.players[0].hand.length, 1);
});

test('COURAGE_4: 終了時、相手の最も大きい合計値のラインへ移動できる', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['COURAGE_4'] }),
    side(OPP, { lines: [[['DARKNESS_4', true]], [], [['WATER_6', true]]] }));
  res = play(res, 'COURAGE_4', 0);
  res = drive(res, { 'optional-shift': () => ['yes'], 'shift-dest': (req) => { assert.deepEqual(req.lines, [2]); return [2]; } });
  assert.equal(lineOf(res.state, 'COURAGE_4'), 2);
});

test('COURAGE_4: 移動は任意 (いいえならそのまま)', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['COURAGE_4'] }),
    side(OPP, { lines: [[['DARKNESS_4', true]], [], [['WATER_6', true]]] }));
  res = play(res, 'COURAGE_4', 0);
  res = drive(res, { 'optional-shift': () => [] });
  assert.equal(lineOf(res.state, 'COURAGE_4'), 0);
});

/* COURAGE_5 / FEAR_6 / ICE_5 / LUCK_6 / MIRROR_6 / PEACE_5 (手札を1枚捨てる) は末尾でまとめて検証 */

test('COURAGE_6: 終了時、このラインで相手が上回っていればこのカードを裏返す', () => {
  let res = start(
    side(['COURAGE', 'FEAR', 'ICE'], { lines: [[['COURAGE_6', true]], [], []], hand: ['ICE_5'] }),
    side(OPP, { lines: [[['DARKNESS_6', true], ['DARKNESS_5', true]], [], []] }));
  res = play(res, 'ICE_5', 2, false);
  assert.equal(faceUp(res.state, 'COURAGE_6'), false);
});

test('COURAGE_6: 相手が上回っていなければ表のまま', () => {
  let res = start(
    side(['COURAGE', 'FEAR', 'ICE'], { lines: [[['COURAGE_6', true]], [], []], hand: ['ICE_5'] }),
    side(OPP, { lines: [[['DARKNESS_6', true]], [], []] }));
  res = play(res, 'ICE_5', 2, false);
  assert.equal(faceUp(res.state, 'COURAGE_6'), true);
});

/* ---------- FEAR ---------- */

test('FEAR_1 上段: 自分の手番中、露出した相手のカードの中段は解決されない', () => {
  let res = start(
    side(['COURAGE', 'FEAR', 'ICE'], { lines: [[], [['FEAR_1', true]], []], hand: ['FEAR_3'] }),
    side(OPP, { lines: [[['DEATH_6', true], ['DARKNESS_4', true]], [], []], hand: ['WATER_1', 'WATER_2'] }));
  res = play(res, 'FEAR_3', 1);
  res = drive(res, { pickCard: () => [u('DARKNESS_4', 1)] });
  const st = res.state;
  assert.deepEqual(hand(st, 1).sort(), ['DARKNESS_4', 'WATER_1', 'WATER_2'].sort(), 'DEATH_6 の「手札を1枚捨てる」は起きない');
  assert.equal(st.players[1].trash.length, 0);
});

test('FEAR_1 上段 (対照): FEAR_1 が無ければ露出した相手の中段が解決される', () => {
  let res = start(
    side(['COURAGE', 'FEAR', 'ICE'], { hand: ['FEAR_3'] }),
    side(OPP, { lines: [[['DEATH_6', true], ['DARKNESS_4', true]], [], []], hand: ['WATER_1', 'WATER_2'] }));
  res = play(res, 'FEAR_3', 1);
  res = drive(res, { pickCard: () => [u('DARKNESS_4', 1)], pickHand: (req) => [req.candidates[0]], discard: (req) => [req.candidates[0]] });
  assert.equal(res.state.players[1].trash.length, 1);
});

test('FEAR_1 中段: 反転を選ぶとカードを1枚反転させる', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['FEAR_1'] }),
    side(OPP, { lines: [[['DARKNESS_4', true]], [], []] }));
  res = play(res, 'FEAR_1', 1);
  res = drive(res, { choice: () => [1], pickCard: () => [u('DARKNESS_4', 1)] });
  assert.equal(faceUp(res.state, 'DARKNESS_4', 1), false);
});

test('FEAR_1 中段: 移動を選ぶとカードを1枚移動させる', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['FEAR_1'] }),
    side(OPP, { lines: [[['DARKNESS_4', true]], [], []] }));
  res = play(res, 'FEAR_1', 1);
  res = drive(res, { choice: () => [0], pickCard: () => [u('DARKNESS_4', 1)], 'shift-dest': () => [2] });
  assert.deepEqual(stackDefs(res.state, 2, 1), ['DARKNESS_4']);
  assert.equal(faceUp(res.state, 'DARKNESS_4', 1), true);
});

test('FEAR_2: 2枚引き、相手は手札をすべて捨てて (捨てた枚数-1) 枚引く', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['FEAR_2'] }),
    side(OPP, { hand: ['DEATH_1', 'DEATH_3', 'DEATH_4'] }));
  res = play(res, 'FEAR_2', 1);
  res = drive(res, {});
  const st = res.state;
  assert.equal(st.players[0].hand.length, 2);
  assert.deepEqual(trash(st, 1).sort(), ['DEATH_1', 'DEATH_3', 'DEATH_4']);
  assert.equal(st.players[1].hand.length, 2);
});

test('FEAR_3: 相手のカードを1枚手札に戻す', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['FEAR_3'] }),
    side(OPP, { lines: [[], [['DEATH_4', true]], []] }));
  res = play(res, 'FEAR_3', 1);
  res = drive(res, { pickCard: (req) => { assert.ok(!req.candidates.includes(u('FEAR_3'))); return [u('DEATH_4', 1)]; } });
  assert.deepEqual(hand(res.state, 1), ['DEATH_4']);
  assert.deepEqual(res.state.lines[1][1], []);
});

test('FEAR_4: このラインの相手のカードを、覆われていても1枚移動させる', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['FEAR_4'] }),
    side(OPP, { lines: [[['DARKNESS_3', true]], [['DEATH_4', true], ['DEATH_6', true]], []] }));
  res = play(res, 'FEAR_4', 1);
  let cands = null;
  res = drive(res, {
    pickCard: (req) => { cands = req.candidates.slice().sort(); return [u('DEATH_4', 1)]; },
    'shift-dest': () => [2],
  });
  assert.deepEqual(cands, [u('DEATH_4', 1), u('DEATH_6', 1)].sort(), '他ラインの DARKNESS_3 と自分のカードは対象外');
  assert.deepEqual(stackDefs(res.state, 1, 1), ['DEATH_6']);
  assert.deepEqual(stackDefs(res.state, 2, 1), ['DEATH_4']);
});

test('FEAR_5: 相手は手札からランダムに1枚捨てる', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['FEAR_5'] }),
    side(OPP, { hand: ['DEATH_1', 'DEATH_3', 'DEATH_4'] }));
  res = play(res, 'FEAR_5', 1);
  assert.equal(res.requests.length, 0, '相手に選択させない');
  assert.equal(res.state.players[1].hand.length, 2);
  assert.equal(res.state.players[1].trash.length, 1);
});

/* ---------- ICE ---------- */

test('ICE_1 中段: このカードを移動させることができる', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['ICE_1'] }));
  res = play(res, 'ICE_1', 2);
  res = drive(res, { 'optional-shift': () => ['yes'], 'shift-dest': () => [0] });
  assert.equal(lineOf(res.state, 'ICE_1'), 0);
});

test('ICE_1 下段: 相手がこのラインにプレイしたあと、相手は手札を1枚捨てる', () => {
  let res = start(
    side(['COURAGE', 'FEAR', 'ICE'], { lines: [[], [], [['ICE_1', true]]], hand: ['COURAGE_5'] }),
    side(OPP, { hand: ['WATER_4', 'DEATH_4', 'DEATH_3'] }));
  res = play(res, 'COURAGE_5', 0, false);
  assert.equal(res.state.turn, 1);
  res = play(res, 'WATER_4', 2, false, 1);
  res = drive(res, { discard: (req) => { assert.equal(req.player, 1); return [u('DEATH_4', 1)]; } });
  assert.deepEqual(trash(res.state, 1), ['DEATH_4']);
  assert.deepEqual(hand(res.state, 1).length, 1);
});

test('ICE_1 下段: 他のラインへのプレイでは発動しない', () => {
  let res = start(
    side(['COURAGE', 'FEAR', 'ICE'], { lines: [[], [], [['ICE_1', true]]], hand: ['COURAGE_5'] }),
    side(OPP, { hand: ['WATER_4', 'DEATH_4', 'DEATH_3'] }));
  res = play(res, 'COURAGE_5', 0, false);
  res = play(res, 'WATER_4', 1, false, 1);
  assert.equal(res.requests.filter(r => r.player === 1 && r.prompt === 'discard').length, 0);
  assert.equal(res.state.players[1].trash.length, 0);
});

test('ICE_2: 他のカードを1枚移動させる (自分自身は対象外)', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { hand: ['ICE_2'] }),
    side(OPP, { lines: [[['DARKNESS_4', true]], [], []] }));
  res = play(res, 'ICE_2', 2);
  res = drive(res, {
    pickCard: (req) => { assert.ok(!req.candidates.includes(u('ICE_2'))); return [u('DARKNESS_4', 1)]; },
    'shift-dest': () => [1],
  });
  assert.deepEqual(stackDefs(res.state, 1, 1), ['DARKNESS_4']);
});

test('ICE_3: 終了時、覆われていればこのカードを移動させることができる', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { lines: [[], [], [['ICE_3', true], ['FEAR_5', false]]], hand: ['COURAGE_5'] }));
  res = play(res, 'COURAGE_5', 0, false);
  res = drive(res, { 'optional-shift': () => ['yes'], 'shift-dest': () => [1] });
  assert.deepEqual(stackDefs(res.state, 1, 0), ['ICE_3']);
  assert.deepEqual(stackDefs(res.state, 2, 0), ['FEAR_5']);
});

test('ICE_3: 覆われていなければ終了時に何もしない', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { lines: [[], [], [['ICE_3', true]]], hand: ['COURAGE_5'] }));
  res = play(res, 'COURAGE_5', 0, false);
  assert.equal(res.requests.length, 0);
  assert.equal(lineOf(res.state, 'ICE_3'), 2);
});

test('ICE_4: このカードは反転させることができないので、反転の候補に出ない', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { lines: [[], [], [['ICE_4', true]]], hand: ['FEAR_1'] }),
    side(OPP, { lines: [[['DARKNESS_4', true]], [], []] }));
  res = play(res, 'FEAR_1', 1);
  let offered = false;
  res = drive(res, { choice: () => [1], pickCard: (req) => { if (req.candidates.includes(u('ICE_4'))) offered = true; return [req.candidates[0]]; } });
  assert.equal(offered, false, '反転の候補に ICE_4 は入らない');
  assert.equal(faceUp(res.state, 'ICE_4'), true);
});

test('ICE_4 (対照): 同じ反転効果で他のカードは普通に反転する', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { lines: [[], [], [['ICE_4', true]]], hand: ['FEAR_1'] }),
    side(OPP, { lines: [[['DARKNESS_4', true]], [], []] }));
  res = play(res, 'FEAR_1', 1);
  res = drive(res, { choice: () => [1], pickCard: () => [u('DARKNESS_4', 1)] });
  assert.equal(faceUp(res.state, 'DARKNESS_4', 1), false);
  assert.equal(faceUp(res.state, 'ICE_4'), true);
});

test('ICE_6: 手札が1枚以上あるとカードを引けない', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { lines: [[], [], [['ICE_6', true]]], hand: ['COURAGE_3', 'FEAR_6'] }));
  res = play(res, 'COURAGE_3', 0);
  assert.deepEqual(hand(res.state, 0), ['FEAR_6']);
});

test('ICE_6: 手札0枚なら引ける', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { lines: [[], [], [['ICE_6', true]]], hand: ['COURAGE_3'] }));
  res = play(res, 'COURAGE_3', 0);
  assert.equal(res.state.players[0].hand.length, 1);
});

test('ICE_6: 手札0枚のリフレッシュはまとめて5枚引く (裁定)', () => {
  let res = start(side(['COURAGE', 'FEAR', 'ICE'], { lines: [[], [], [['ICE_6', true]]], hand: [] }));
  res = Engine.apply(res.state, { type: 'refresh' });
  assert.equal(res.error, null);
  res = drive(res, {});
  assert.equal(res.state.players[0].hand.length, 5);
});

/* ---------- LUCK ---------- */

const LUCK = ['LUCK', 'MIRROR', 'PEACE'];

test('LUCK_1: 値を宣言して3枚引き、その値のカードを公開してプレイできる', () => {
  let res = start(side(LUCK, { hand: ['LUCK_1'], deck: ['PEACE_3', 'MIRROR_1', 'LUCK_5'] }));
  res = play(res, 'LUCK_1', 0);
  const seen = [];
  let declared = null;
  res = drive(res, {
    'declare-value': (req) => { declared = req.options[3]; return [3]; },
    'reveal-hand-card': () => [u('PEACE_3')],
    'optional-play': () => ['yes'],
    'play-dest': (req) => [req.faces.findIndex(f => f.l === 0 && !f.f)],   // 裏向きでライン1へ (中段を起こさない)
  });
  assert.equal(String(declared), '3');
  const st = res.state;
  assert.equal(lineOf(st, 'PEACE_3'), 0, '宣言した値3の PEACE_3 をプレイした');
  assert.equal(faceUp(st, 'PEACE_3'), false);
  assert.deepEqual(hand(st, 0).sort(), ['LUCK_5', 'MIRROR_1'].sort());
});

test('LUCK_1: 公開・プレイできるのはこの効果で引いたカードだけ (裁定)', () => {
  let res = start(side(LUCK, { hand: ['LUCK_1', 'MIRROR_4'], deck: ['PEACE_3', 'MIRROR_1', 'LUCK_5'] }));
  res = play(res, 'LUCK_1', 0);
  res = drive(res, {
    'declare-value': () => [3],
    'reveal-hand-card': (req) => { assert.ok(!req.candidates.includes(u('MIRROR_4')), '元の手札の MIRROR_4 (値3) は対象外'); return [u('PEACE_3')]; },
    'optional-play': () => ['yes'],
    'play-dest': (req) => [req.faces.findIndex(f => f.l === 0 && !f.f)],
  });
  assert.equal(lineOf(res.state, 'PEACE_3'), 0);
  assert.ok(hand(res.state, 0).includes('MIRROR_4'));
});

test('LUCK_1: 宣言した値のカードを引かなければ何もプレイしない', () => {
  let res = start(side(LUCK, { hand: ['LUCK_1'], deck: ['PEACE_3', 'MIRROR_1', 'LUCK_5'] }));
  res = play(res, 'LUCK_1', 0);
  res = drive(res, { 'declare-value': () => [6] });
  assert.deepEqual(hand(res.state, 0).sort(), ['LUCK_5', 'MIRROR_1', 'PEACE_3'].sort());
  assert.deepEqual(stackDefs(res.state, 0, 0), ['LUCK_1']);
});

test('LUCK_2: デッキの一番上を裏向きでプレイして表にする (中段は無視)', () => {
  let res = start(side(LUCK, { hand: ['LUCK_2'], deck: ['PEACE_2', 'MIRROR_1'] }));
  res = play(res, 'LUCK_2', 0);
  res = drive(res, { pickLine: (req) => [req.lines.includes(1) ? 1 : req.lines[0]], 'play-dest': (req) => [req.lines.includes(1) ? 1 : req.lines[0]] });
  const st = res.state;
  const l = lineOf(st, 'PEACE_2');
  assert.ok(l >= 0, 'PEACE_2 が場に出た');
  assert.equal(faceUp(st, 'PEACE_2'), true);
  assert.equal(st.players[0].hand.length, 0, 'PEACE_2 の中段 (1枚引く・裏向きでプレイ) は起きない');
});

test('LUCK_3: デッキの一番上を捨て、その値の枚数だけ引く', () => {
  let res = start(side(LUCK, { hand: ['LUCK_3'], deck: ['PEACE_4', 'MIRROR_1', 'LUCK_5', 'LUCK_6', 'MIRROR_2', 'MIRROR_3'] }));
  res = play(res, 'LUCK_3', 0);
  res = drive(res, {});
  const st = res.state;
  assert.deepEqual(trash(st, 0), ['PEACE_4']);
  assert.deepEqual(hand(st, 0).sort(), ['LUCK_5', 'LUCK_6', 'MIRROR_1', 'MIRROR_2'].sort(), 'PEACE_4 の値4ぶん引く');
});

test('LUCK_4: 宣言したプロトコルが相手の一番上と一致すればカードを1枚削除する', () => {
  let res = start(side(LUCK, { hand: ['LUCK_4'] }),
    side(OPP, { lines: [[['DARKNESS_4', true]], [], []], deck: ['DEATH_5', 'WATER_1'] }));
  res = play(res, 'LUCK_4', 0);
  res = drive(res, {
    'declare-protocol': (req) => [req.options.indexOf('DEATH')],
    pickCard: () => [u('DARKNESS_4', 1)],
  });
  const st = res.state;
  assert.deepEqual(trash(st, 1).sort(), ['DARKNESS_4', 'DEATH_5'].sort());
});

test('LUCK_4: 一致しなければ削除しない (捨て札にはする)', () => {
  let res = start(side(LUCK, { hand: ['LUCK_4'] }),
    side(OPP, { lines: [[['DARKNESS_4', true]], [], []], deck: ['DEATH_5', 'WATER_1'] }));
  res = play(res, 'LUCK_4', 0);
  res = drive(res, { 'declare-protocol': (req) => [req.options.indexOf('WATER')] });
  const st = res.state;
  assert.deepEqual(trash(st, 1), ['DEATH_5']);
  assert.deepEqual(stackDefs(st, 0, 1), ['DARKNESS_4']);
});

test('LUCK_5: デッキの一番上を捨て、その値と同じ値のカードを覆われていても1枚削除する', () => {
  let res = start(side(LUCK, { hand: ['LUCK_5'], deck: ['PEACE_4'] }),
    side(OPP, { lines: [[['DARKNESS_4', true], ['DARKNESS_5', true]], [['DEATH_2', false]], [['WATER_6', true]]] }));
  // PEACE_4 の値は 4 → 値4のカード: DARKNESS_5 と、場に出た LUCK_5 自身 (値4)
  res = play(res, 'LUCK_5', 0);
  let cands = null;
  res = drive(res, { pickCard: (req) => { cands = req.candidates.slice(); return [u('DARKNESS_5', 1)]; } });
  assert.deepEqual((cands || []).slice().sort(), [u('DARKNESS_5', 1), u('LUCK_5')].sort());
  assert.deepEqual(trash(res.state, 0), ['PEACE_4']);
  assert.deepEqual(trash(res.state, 1), ['DARKNESS_5']);
});

test('LUCK_5: 覆われているカードも対象になる', () => {
  let res = start(side(LUCK, { hand: ['LUCK_5'], deck: ['PEACE_4'] }),
    side(OPP, { lines: [[['DARKNESS_5', true], ['DARKNESS_4', true]], [], []] }));
  res = play(res, 'LUCK_5', 0);
  res = drive(res, { pickCard: (req) => { assert.ok(req.candidates.includes(u('DARKNESS_5', 1))); return [u('DARKNESS_5', 1)]; } });
  assert.deepEqual(trash(res.state, 1), ['DARKNESS_5']);
  assert.deepEqual(stackDefs(res.state, 0, 1), ['DARKNESS_4']);
});

/* ---------- MIRROR ---------- */

test('MIRROR_1: このラインの自分の合計値は相手のカード1枚ごとに1増える', () => {
  const res = start(side(LUCK, { lines: [[], [['MIRROR_1', true]], []] }),
    side(OPP, { lines: [[], [['DEATH_1', true], ['DEATH_2', false], ['DEATH_3', true]], [['WATER_1', true]]] }));
  assert.equal(Engine.lineTotal(res.state, 1, 0), 3);
  assert.equal(Engine.lineTotal(res.state, 1, 1), 0 + 2 + 2, '相手側の合計は変わらない');
});

test('MIRROR_2: 終了時、相手のカード1枚の中段を自分のものとして解決できる', () => {
  let res = start(side(LUCK, { lines: [[], [['MIRROR_2', true]], []], hand: ['LUCK_6', 'PEACE_5', 'PEACE_6'] }),
    side(OPP, { lines: [[['DEATH_6', true]], [], []], hand: ['WATER_1', 'WATER_2'] }));
  res = play(res, 'LUCK_6', 0, false);
  res = drive(res, {
    'mirror-middle': (req) => req.kind === 'yesNo' ? ['yes'] : [u('DEATH_6', 1)],
    'optional-': () => ['yes'],
    discard: (req) => { assert.equal(req.player, 0, '自分が捨てる'); return [u('PEACE_5')]; },
  });
  const st = res.state;
  assert.deepEqual(trash(st, 0), ['PEACE_5']);
  assert.equal(st.players[1].hand.length, 2, '相手は捨てない');
});

// 裁定 (Mirror 1 / FEAR 0): 自分の手番中に FEAR_1 があると相手のカードには中段が「ない」ので写せない (以前はエンジンが写していた。直した)
test('MIRROR_2: 自分の FEAR_1 があると相手の中段は無いので写せない (裁定)', () => {
  let res = start(side(['MIRROR', 'FEAR', 'PEACE'], { lines: [[['MIRROR_2', true]], [['FEAR_1', true]], []], hand: ['PEACE_5', 'PEACE_6', 'MIRROR_6'] }),
    side(OPP, { lines: [[['DARKNESS_6', true]], [], []] }));
  res = play(res, 'PEACE_5', 2, false);
  res = drive(res, {
    'mirror-middle': (req) => req.kind === 'yesNo' ? ['yes'] : [u('DARKNESS_6', 1)],
    discard: (req) => [req.candidates[0]],
  });
  assert.equal(res.state.players[0].trash.length, 0, 'DARKNESS_6 の「手札を1枚捨てる」は解決されない');
  assert.equal(res.state.players[0].hand.length, 2);
});

// 「解決できる」なので断れる (以前はエンジンが断らせなかった。直した)
test('MIRROR_2: 写すかどうかは任意 (断れば何も起きない)', () => {
  let res = start(side(LUCK, { lines: [[], [['MIRROR_2', true]], []], hand: ['LUCK_6', 'PEACE_5', 'PEACE_6'] }),
    side(OPP, { lines: [[['DEATH_6', true]], [], []] }));
  res = play(res, 'LUCK_6', 0, false);
  let asked = false;
  res = drive(res, {
    'mirror-middle': (req) => { asked = true; return []; },
    yesNo: () => { asked = true; return []; },
    discard: (req) => [req.candidates[0]],
  });
  assert.ok(asked, '写すかどうかを尋ねる');
  assert.equal(res.state.players[0].trash.length, 0);
  assert.equal(res.state.players[0].hand.length, 2);
});

test('MIRROR_3: 自分のスタック2つの中身を順番ごと入れ替える', () => {
  let res = start(side(LUCK, { lines: [[['LUCK_5', false], ['LUCK_6', true]], [], [['PEACE_5', false]]], hand: ['MIRROR_3'] }));
  res = play(res, 'MIRROR_3', 1);
  res = drive(res, {
    'swap-stack-1': (req) => [req.kind === 'pickLine' ? 0 : req.candidates[0]],
    'swap-stack-2': (req) => [req.kind === 'pickLine' ? 1 : req.candidates[0]],
  });
  const st = res.state;
  assert.deepEqual(stackDefs(st, 0, 0), ['MIRROR_3']);
  assert.deepEqual(stackDefs(st, 1, 0), ['LUCK_5', 'LUCK_6']);
  assert.deepEqual(stackDefs(st, 2, 0), ['PEACE_5']);
});

test('MIRROR_4: 自分のカードを1枚反転させ、同じラインの相手のカードを1枚反転させる', () => {
  let res = start(side(LUCK, { lines: [[], [], [['PEACE_4', true]]], hand: ['MIRROR_4'] }),
    side(OPP, { lines: [[['DARKNESS_4', true]], [], [['WATER_4', true]]] }));
  res = play(res, 'MIRROR_4', 1);
  let second = null;
  let n = 0;
  res = drive(res, {
    pickCard: (req) => {
      n++;
      if (n === 1) return [u('PEACE_4')];
      second = req.candidates.slice();
      return [u('WATER_4', 1)];
    },
  });
  const st = res.state;
  assert.equal(faceUp(st, 'PEACE_4'), false);
  assert.equal(faceUp(st, 'WATER_4', 1), false);
  assert.equal(faceUp(st, 'DARKNESS_4', 1), true);
  if (second) assert.deepEqual(second, [u('WATER_4', 1)], '同じライン (ライン2) の相手のカードだけ');
});

test('MIRROR_4: 自分自身を反転させたら2回目の反転は起きない (裁定)', () => {
  let res = start(side(LUCK, { hand: ['MIRROR_4'] }),
    side(OPP, { lines: [[], [['DEATH_4', true]], []] }));
  res = play(res, 'MIRROR_4', 1);
  res = drive(res, { pickCard: (req) => { assert.ok(req.candidates.includes(u('MIRROR_4'))); return [u('MIRROR_4')]; } });
  assert.equal(faceUp(res.state, 'MIRROR_4'), false);
  assert.equal(faceUp(res.state, 'DEATH_4', 1), true);
});

test('MIRROR_5: 相手がカードを引いたあと、1枚引く', () => {
  let res = start(side(LUCK, { lines: [[], [['MIRROR_5', true]], []], hand: ['LUCK_6', 'PEACE_5'] }),
    side(OPP, { hand: ['WATER_1', 'WATER_2'] }));
  res = play(res, 'LUCK_6', 0, false);
  assert.equal(res.state.players[0].hand.length, 1);
  res = Engine.apply(res.state, { type: 'refresh' });
  assert.equal(res.error, null);
  res = drive(res, {});
  assert.equal(res.state.players[1].hand.length, 5);
  assert.equal(res.state.players[0].hand.length, 2, 'MIRROR_5 で1枚引いた');
});

/* ---------- PEACE ---------- */

test('PEACE_1: 両プレイヤーが手札をすべて捨て、終了時に手札0枚なら1枚引く', () => {
  let res = start(side(LUCK, { hand: ['PEACE_1', 'LUCK_6', 'MIRROR_6'], deck: ['LUCK_2'] }),
    side(OPP, { hand: ['WATER_1', 'WATER_2'] }));
  res = play(res, 'PEACE_1', 2);
  res = drive(res, { 'discard-order': (req) => [req.options ? 0 : req.candidates[0]], option: () => [0] });
  const st = res.state;
  assert.deepEqual(trash(st, 0).sort(), ['LUCK_6', 'MIRROR_6'].sort());
  assert.deepEqual(trash(st, 1).sort(), ['WATER_1', 'WATER_2'].sort());
  assert.deepEqual(hand(st, 0), ['LUCK_2'], '終了時に1枚引く');
  assert.equal(st.players[1].hand.length, 0);
});

test('PEACE_1 下段: 手札があれば終了時に引かない', () => {
  let res = start(side(LUCK, { lines: [[], [], [['PEACE_1', true]]], hand: ['LUCK_6', 'MIRROR_6'] }));
  res = play(res, 'LUCK_6', 0, false);
  assert.deepEqual(hand(res.state, 0), ['MIRROR_6']);
});

test('PEACE_2: 1枚引き、カードを1枚裏向きでプレイする', () => {
  let res = start(side(LUCK, { hand: ['PEACE_2'], deck: ['LUCK_5'] }));
  res = play(res, 'PEACE_2', 2);
  res = drive(res, {
    pickHand: () => [u('LUCK_5')],
    'play-card': () => [u('LUCK_5')],
    pickLine: () => [1],
    'play-dest': () => [1],
  });
  const st = res.state;
  assert.equal(lineOf(st, 'LUCK_5'), 1);
  assert.equal(faceUp(st, 'LUCK_5'), false);
  assert.equal(st.players[0].hand.length, 0);
});

test('PEACE_3: 1枚捨てることができ、手札の枚数より値が大きいカードを1枚反転させる', () => {
  let res = start(side(LUCK, { hand: ['PEACE_3', 'LUCK_6', 'MIRROR_6'] }),
    side(OPP, { lines: [[['DARKNESS_2', true]], [['DEATH_4', true]], [['WATER_3', true]]] }));
  res = play(res, 'PEACE_3', 2);
  let cands = null;
  res = drive(res, {
    'optional-discard': () => ['yes'],
    discard: () => [u('LUCK_6')],
    pickCard: (req) => { cands = req.candidates.slice().sort(); return [u('DEATH_4', 1)]; },
  });
  const st = res.state;
  assert.deepEqual(trash(st, 0), ['LUCK_6']);
  // 手札1枚 → 値が1より大きい: DEATH_4(3), WATER_3(2), PEACE_3(3)。DARKNESS_2(1) は対象外
  assert.ok(cands, '反転対象の選択がある');
  assert.ok(!cands.includes(u('DARKNESS_2', 1)), '値1は対象外');
  assert.ok(cands.includes(u('WATER_3', 1)) && cands.includes(u('DEATH_4', 1)));
  assert.equal(faceUp(st, 'DEATH_4', 1), false);
});

test('PEACE_3: 捨てなければ手札2枚 → 値2のカードは対象外', () => {
  let res = start(side(LUCK, { hand: ['PEACE_3', 'LUCK_6', 'MIRROR_6'] }),
    side(OPP, { lines: [[['DARKNESS_2', true]], [['DEATH_4', true]], [['WATER_3', true]]] }));
  res = play(res, 'PEACE_3', 2);
  let cands = null;
  res = drive(res, {
    'optional-discard': () => [],
    pickCard: (req) => { cands = req.candidates.slice().sort(); return [u('DEATH_4', 1)]; },
  });
  assert.ok(!cands.includes(u('WATER_3', 1)));
  assert.ok(cands.includes(u('DEATH_4', 1)));
  assert.equal(faceUp(res.state, 'DEATH_4', 1), false);
});

test('PEACE_4: 相手の手番中に自分が捨てたあと、1枚引く', () => {
  let res = start(side(LUCK, { lines: [[], [], [['PEACE_4', true]]], hand: ['LUCK_6', 'MIRROR_6', 'MIRROR_5'] }),
    side(['FEAR', 'DEATH', 'WATER'], { hand: ['FEAR_5', 'WATER_1'] }));
  res = play(res, 'LUCK_6', 0, false);
  assert.equal(res.state.players[0].hand.length, 2);
  res = play(res, 'FEAR_5', 0, true, 1);
  res = drive(res, {});
  const st = res.state;
  assert.equal(st.players[0].trash.length, 1, 'ランダムに1枚捨てた');
  assert.equal(st.players[0].hand.length, 2, 'PEACE_4 で1枚引いた');
});

test('PEACE_4: 自分の手番中に捨てても引かない', () => {
  let res = start(side(LUCK, { lines: [[], [], [['PEACE_4', true]]], hand: ['LUCK_6', 'MIRROR_6', 'MIRROR_5'] }));
  res = play(res, 'LUCK_6', 0);
  res = drive(res, { discard: () => [u('MIRROR_6')] });
  assert.deepEqual(hand(res.state, 0), ['MIRROR_5']);
});

test('PEACE_6: 手札が2枚以上あればこのカードを裏返す', () => {
  let res = start(side(LUCK, { hand: ['PEACE_6', 'LUCK_6', 'MIRROR_6'] }));
  res = play(res, 'PEACE_6', 2);
  assert.equal(faceUp(res.state, 'PEACE_6'), false);
});

test('PEACE_6: 手札が1枚なら表のまま', () => {
  let res = start(side(LUCK, { hand: ['PEACE_6', 'LUCK_6'] }));
  res = play(res, 'PEACE_6', 2);
  assert.equal(faceUp(res.state, 'PEACE_6'), true);
});

/* ---------- 「あなたは手札を1枚捨て札にする」 (値5の札) ---------- */

for (const [card, protos, line] of [
  ['COURAGE_5', ['COURAGE', 'FEAR', 'ICE'], 0],
  ['FEAR_6', ['COURAGE', 'FEAR', 'ICE'], 1],
  ['ICE_5', ['COURAGE', 'FEAR', 'ICE'], 2],
  ['LUCK_6', LUCK, 0],
  ['MIRROR_6', LUCK, 1],
  ['PEACE_5', LUCK, 2],
]) {
  test(card + ': 自分の手札を1枚捨てる', () => {
    const other = protos[0] === 'LUCK' ? ['MIRROR_1', 'PEACE_2'] : ['COURAGE_1', 'FEAR_2'];
    let res = start(side(protos, { hand: [card].concat(other) }), side(OPP, { hand: ['WATER_1'] }));
    res = play(res, card, line);
    res = drive(res, { discard: (req) => { assert.equal(req.player, 0); return [u(other[1])]; } });
    assert.deepEqual(trash(res.state, 0), [other[1]]);
    assert.deepEqual(hand(res.state, 0), [other[0]]);
    assert.equal(res.state.players[1].trash.length, 0);
  });
}
