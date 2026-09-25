'use strict';
/* カード効果の検証 (METAL / PLAGUE / PSYCHIC / SPEED / SPIRIT / WATER)
   各カードのテキストが約束する結果を、Engine.newPuzzle で組んだ盤面で確かめる。
   node --test test/cards-b.test.js */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);

/* ---------- ヘルパ ---------- */

const u0 = (d) => 'p0:' + d;
const u1 = (d) => 'p1:' + d;

/* sides: [P1側, P2側] の {protos, lines, hand, trash, deck} */
function puzzle(s0, s1, useControl) {
  const res = Engine.newPuzzle({ sides: [s0, s1], useControl: !!useControl }, { seed: 1 });
  assert.equal(res.error, null, 'newPuzzle エラー: ' + res.error);
  return res;
}

function act(res, action) {
  const r = Engine.apply(res.state, action);
  assert.equal(r.error, null, 'apply エラー: ' + r.error);
  return r;
}

function play(res, def, line, faceUp, side) {
  const s = side === undefined ? 0 : side;
  return act(res, { type: 'play', card: 'p' + s + ':' + def, line, faceUp: faceUp !== false });
}

/* answers: 配列なら順に消費 (picks 配列 or (req)=>picks)。関数なら全要求に使う。
   配列の場合、要求が足りない/余るとテスト失敗 (エンジンが想定どおり尋ねたかも検証する) */
function answer(res, answers) {
  let i = 0;
  let n = 0;
  while (res.requests.length) {
    if (++n > 60) throw new Error('選択要求が収束しない');
    const req = res.requests[0];
    let a;
    if (typeof answers === 'function') a = answers;
    else {
      if (i >= answers.length) throw new Error('想定外の選択要求: ' + JSON.stringify(req));
      a = answers[i++];
    }
    const picks = typeof a === 'function' ? a(req, res.state) : a;
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks });
    assert.equal(res.error, null, 'choose エラー: ' + res.error + ' req=' + JSON.stringify(req));
  }
  if (Array.isArray(answers)) assert.equal(i, answers.length, '用意した回答が使われなかった (要求が来なかった)');
  return res;
}

const stack = (st, line, side) => st.lines[line][side].map(u => [st.cards[u].def, st.cards[u].faceUp]);
const handDefs = (st, side) => st.players[side].hand.map(u => st.cards[u].def).sort();
const trashDefs = (st, side) => st.players[side].trash.map(u => st.cards[u].def).sort();
const firstCand = (req) => [req.candidates[0]];

/* ======================= METAL ======================= */

test('METAL_1 上段: このラインでの相手の合計値は2減る (マイナスにもなる)', () => {
  const r = puzzle(
    { protos: ['METAL', 'WATER', 'SPIRIT'], lines: [[['METAL_1', true]], [], []], hand: [] },
    { protos: ['PLAGUE', 'SPEED', 'PSYCHIC'], lines: [[['PLAGUE_6', true]], [['PLAGUE_2', true]], []], hand: [] });
  assert.equal(Engine.lineTotal(r.state, 0, 1), 3, 'PLAGUE_6(5) - 2');
  assert.equal(Engine.lineTotal(r.state, 1, 1), 1, '他のラインには影響しない');
  assert.equal(Engine.lineTotal(r.state, 0, 0), 0, '自分の合計には影響しない');

  const r2 = puzzle(
    { protos: ['METAL', 'WATER', 'SPIRIT'], lines: [[['METAL_1', true]], [], []], hand: [] },
    { protos: ['PLAGUE', 'SPEED', 'PSYCHIC'], lines: [[['PLAGUE_2', true]], [], []], hand: [] });
  assert.equal(Engine.lineTotal(r2.state, 0, 1), -1, '1 - 2 = -1 (合計値はマイナスになる)');
});

test('METAL_1 中段: カードを1枚反転させる', () => {
  let r = puzzle(
    { protos: ['METAL', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['METAL_1'] },
    { protos: ['PLAGUE', 'SPEED', 'PSYCHIC'], lines: [[], [['SPEED_6', true]], []], hand: ['PLAGUE_6'] });
  r = play(r, 'METAL_1', 0);
  r = answer(r, [(req) => { assert.ok(req.candidates.includes(u1('SPEED_6'))); return [u1('SPEED_6')]; }]);
  assert.deepEqual(stack(r.state, 1, 1), [['SPEED_6', false]]);
});

test('METAL_2 中段: カードを2枚引き、相手は次の手番でコンパイルできない (その次はできる)', () => {
  const s0 = { protos: ['METAL', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['METAL_2', 'WATER_6'] };
  const s1 = { protos: ['PLAGUE', 'SPEED', 'PSYCHIC'],
    lines: [[['PLAGUE_6', true], ['PLAGUE_5', true], ['PLAGUE_2', true]], [], []], hand: ['SPEED_6'] };

  /* 対照: 裏向きでプレイすると相手はコンパイルする */
  let c = puzzle(s0, s1);
  c = play(c, 'METAL_2', 1, false);
  c = answer(c, () => [0]);
  assert.equal(c.state.players[1].protocols[0].compiled, true, '対照: METAL_2 がなければ相手はコンパイルする');

  let r = puzzle(s0, s1);
  r = play(r, 'METAL_2', 0);
  assert.equal(r.state.players[0].hand.length, 3, 'WATER_6 + 2枚ドロー');
  assert.equal(r.state.turn, 1);
  assert.equal(r.state.phase, 'action');
  assert.equal(r.state.players[1].protocols[0].compiled, false, '相手はこの手番でコンパイルできない');
  assert.equal(r.state.lines[0][1].length, 3);
  assert.ok(!Engine.legalActions(r.state).some(a => a.type === 'compile'));
  /* 相手の次の次の手番ではコンパイルできる */
  r = act(r, { type: 'refresh' });
  r = play(r, 'WATER_6', 2, false);
  r = answer(r, () => [0]);
  assert.equal(r.state.players[1].protocols[0].compiled, true, '効果は次の手番だけ');
});

test('METAL_3 上段: 相手はこのラインにカードを裏向きでプレイできない', () => {
  let r = puzzle(
    { protos: ['METAL', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['METAL_3'] },
    { protos: ['PLAGUE', 'SPEED', 'PSYCHIC'], lines: [[], [], []], hand: ['PLAGUE_6'] });
  r = play(r, 'METAL_3', 0);
  assert.equal(r.state.turn, 1);
  const acts = Engine.legalActions(r.state).filter(a => a.type === 'play');
  assert.deepEqual(acts.filter(a => !a.faceUp).map(a => a.line).sort(), [1, 2], '裏向きはライン0以外');
  assert.ok(acts.some(a => a.faceUp && a.line === 0), '表向きならこのラインにプレイできる');
  const bad = Engine.apply(r.state, { type: 'play', card: u1('PLAGUE_6'), line: 0, faceUp: false });
  assert.ok(bad.error, '裏向きでライン0へのプレイは拒否される');
});

test('METAL_4 中段: カードを1枚引き、8枚以上ある他の1ラインのカードをすべて削除する', () => {
  let r = puzzle(
    { protos: ['METAL', 'WATER', 'SPIRIT'],
      lines: [[], [['WATER_1', false], ['WATER_2', false], ['WATER_3', false], ['WATER_4', false]],
        [['SPIRIT_1', false], ['SPIRIT_2', false], ['SPIRIT_3', false], ['SPIRIT_4', false]]],
      hand: ['METAL_4'] },
    { protos: ['PLAGUE', 'SPEED', 'PSYCHIC'],
      lines: [[], [['SPEED_1', false], ['SPEED_2', false], ['SPEED_3', false], ['SPEED_4', false]],
        [['PSYCHIC_1', false], ['PSYCHIC_2', false], ['PSYCHIC_3', false]]],
      hand: [] });
  r = play(r, 'METAL_4', 0);
  r = answer(r, []);
  const st = r.state;
  assert.equal(st.lines[1][0].length + st.lines[1][1].length, 0, '8枚のラインは全削除 (覆われたカードも)');
  assert.equal(st.lines[2][0].length + st.lines[2][1].length, 7, '7枚のラインは残る');
  assert.equal(st.players[0].trash.length, 4);
  assert.equal(st.players[1].trash.length, 4);
  assert.equal(st.players[0].hand.length, 1, '1枚ドロー');
  assert.deepEqual(stack(st, 0, 0), [['METAL_4', true]]);
});

/* METAL_5 / PLAGUE_6 / PSYCHIC_6 / SPEED_6 / SPIRIT_6 / WATER_6: 「あなたは手札を1枚捨て札にする。」 */
for (const [proto, def] of [['METAL', 'METAL_5'], ['PLAGUE', 'PLAGUE_6'], ['PSYCHIC', 'PSYCHIC_6'],
  ['SPEED', 'SPEED_6'], ['SPIRIT', 'SPIRIT_6'], ['WATER', 'WATER_6']]) {
  test(def + ' 中段: あなたは手札を1枚捨て札にする', () => {
    const others = ['DARKNESS', 'FIRE'];
    const keep = 'DARKNESS_1', drop = 'FIRE_1';
    let r = puzzle(
      { protos: [proto].concat(others), lines: [[], [], []], hand: [def, keep, drop] },
      { protos: ['DEATH', 'LIFE', 'LIGHT'], lines: [[], [], []], hand: ['DEATH_6', 'LIFE_6'] });
    r = play(r, def, 0);
    r = answer(r, [(req) => {
      assert.equal(req.player, 0, '捨てるのは自分');
      assert.deepEqual(req.candidates.slice().sort(), [u0(drop), u0(keep)].sort());
      return [u0(drop)];
    }]);
    assert.deepEqual(handDefs(r.state, 0), [keep]);
    assert.deepEqual(trashDefs(r.state, 0), [drop]);
    assert.equal(r.state.players[1].hand.length, 2, '相手の手札は減らない');
  });
}

test('METAL_6 上段: 覆われることになったとき、先にこのカードを削除する', () => {
  let r = puzzle(
    { protos: ['METAL', 'WATER', 'SPIRIT'], lines: [[['METAL_6', true]], [], []], hand: ['WATER_6'] },
    { protos: ['PLAGUE', 'SPEED', 'PSYCHIC'], lines: [[], [], []], hand: ['PLAGUE_6'] });
  r = play(r, 'WATER_6', 0, false);
  r = answer(r, []);
  assert.deepEqual(stack(r.state, 0, 0), [['WATER_6', false]], 'METAL_6 は消え、置いたカードだけが残る');
  assert.deepEqual(trashDefs(r.state, 0), ['METAL_6']);
});

test('METAL_6 上段: 反転することになったとき、先にこのカードを削除する', () => {
  let r = puzzle(
    { protos: ['METAL', 'WATER', 'SPIRIT'], lines: [[], [['METAL_6', true]], []], hand: ['METAL_1'] },
    { protos: ['PLAGUE', 'SPEED', 'PSYCHIC'], lines: [[], [], []], hand: ['PLAGUE_6'] });
  r = play(r, 'METAL_1', 0);
  r = answer(r, [[u0('METAL_6')]]);
  assert.deepEqual(stack(r.state, 1, 0), [], '裏向きにならず削除される');
  assert.deepEqual(trashDefs(r.state, 0), ['METAL_6']);
});

/* ======================= PLAGUE ======================= */

test('PLAGUE_1 中段: 相手は手札を1枚捨て札にする / 下段: 相手はこのラインにプレイできない', () => {
  let r = puzzle(
    { protos: ['PLAGUE', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['PLAGUE_1'] },
    { protos: ['SPEED', 'METAL', 'PSYCHIC'], lines: [[], [], []], hand: ['SPEED_6', 'SPEED_5'] });
  r = play(r, 'PLAGUE_1', 0);
  r = answer(r, [(req) => { assert.equal(req.player, 1); return [u1('SPEED_6')]; }]);
  assert.deepEqual(handDefs(r.state, 1), ['SPEED_5']);
  assert.deepEqual(trashDefs(r.state, 1), ['SPEED_6']);
  assert.equal(r.state.turn, 1);
  const plays = Engine.legalActions(r.state).filter(a => a.type === 'play');
  assert.ok(plays.length > 0);
  assert.ok(!plays.some(a => a.line === 0), '表でも裏でもライン0にはプレイできない (SPEED_5 はライン0が一致)');
});

test('PLAGUE_2 中段: 相手は1枚捨てる → 上段: 相手が捨てたあとカードを1枚引く', () => {
  let r = puzzle(
    { protos: ['PLAGUE', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['PLAGUE_2', 'WATER_6'] },
    { protos: ['SPEED', 'METAL', 'PSYCHIC'], lines: [[], [], []], hand: ['SPEED_6', 'SPEED_5'] });
  r = play(r, 'PLAGUE_2', 0);
  r = answer(r, [[u1('SPEED_6')]]);
  assert.deepEqual(handDefs(r.state, 1), ['SPEED_5']);
  assert.equal(r.state.players[0].hand.length, 2, 'WATER_6 + 上段で1枚ドロー');
});

test('PLAGUE_2 上段: 覆われていても、相手が捨て札にしたあとカードを1枚引く', () => {
  let r = puzzle(
    { protos: ['PLAGUE', 'WATER', 'SPIRIT'], lines: [[['PLAGUE_2', true]], [], []], hand: ['PLAGUE_1'] },
    { protos: ['SPEED', 'METAL', 'PSYCHIC'], lines: [[], [], []], hand: ['SPEED_6', 'SPEED_5'] });
  r = play(r, 'PLAGUE_1', 0);
  r = answer(r, [[u1('SPEED_6')]]);
  assert.equal(r.state.players[0].hand.length, 1, '覆われた PLAGUE_2 の上段で1枚ドロー');
});

test('PLAGUE_3 中段: 自分が n 枚捨て、相手は n+1 枚捨てる', () => {
  let r = puzzle(
    { protos: ['PLAGUE', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['PLAGUE_3', 'WATER_6', 'SPIRIT_6'] },
    { protos: ['SPEED', 'METAL', 'PSYCHIC'], lines: [[], [], []],
      hand: ['SPEED_6', 'SPEED_5', 'SPEED_4', 'METAL_6', 'METAL_5'] });
  r = play(r, 'PLAGUE_3', 0);
  r = answer(r, [
    (req) => { assert.equal(req.player, 0); assert.equal(req.min, 1); return req.candidates.slice(); },
    (req) => { assert.equal(req.player, 1); assert.equal(req.min, 3); assert.equal(req.max, 3); return req.candidates.slice(0, 3); }
  ]);
  assert.equal(r.state.players[0].hand.length, 0);
  assert.equal(r.state.players[1].hand.length, 2, '5 - (2+1)');
});

test('PLAGUE_3 中段: 手札がなければ自分は捨てず、相手は 0+1 枚捨てる', () => {
  let r = puzzle(
    { protos: ['PLAGUE', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['PLAGUE_3'] },
    { protos: ['SPEED', 'METAL', 'PSYCHIC'], lines: [[], [], []], hand: ['SPEED_6', 'SPEED_5'] });
  r = play(r, 'PLAGUE_3', 0);
  r = answer(r, [(req) => { assert.equal(req.player, 1); assert.equal(req.min, 1); return [u1('SPEED_6')]; }]);
  assert.deepEqual(handDefs(r.state, 1), ['SPEED_5']);
});

test('PLAGUE_4 中段: 覆われていない表向きの他のカードをすべて反転させる', () => {
  let r = puzzle(
    { protos: ['PLAGUE', 'WATER', 'SPIRIT'],
      lines: [[], [['WATER_6', true]], [['WATER_5', true], ['WATER_4', true]]], hand: ['PLAGUE_4'] },
    { protos: ['SPEED', 'METAL', 'PSYCHIC'],
      lines: [[['SPEED_6', true]], [['SPEED_5', false]], [['SPEED_2', true], ['PSYCHIC_6', true]]], hand: [] });
  r = play(r, 'PLAGUE_4', 0);
  r = answer(r, firstCand);
  const st = r.state;
  assert.deepEqual(stack(st, 0, 0), [['PLAGUE_4', true]], 'このカードは反転しない');
  assert.deepEqual(stack(st, 1, 0), [['WATER_6', false]]);
  assert.deepEqual(stack(st, 2, 0), [['WATER_5', true], ['WATER_4', false]], '覆われたカードは反転しない');
  assert.deepEqual(stack(st, 0, 1), [['SPEED_6', false]]);
  assert.deepEqual(stack(st, 1, 1), [['SPEED_5', false]], '裏向きのカードはそのまま');
  assert.deepEqual(stack(st, 2, 1), [['SPEED_2', true], ['PSYCHIC_6', false]]);
});

test('PLAGUE_5 下段: 終了時、相手は自分の裏向きのカードを1枚削除し、あなたはこのカードを反転できる', () => {
  const s0 = { protos: ['PLAGUE', 'WATER', 'SPIRIT'], lines: [[['PLAGUE_5', true]], [], []], hand: ['WATER_6'] };
  const s1 = { protos: ['SPEED', 'METAL', 'PSYCHIC'], lines: [[], [['SPEED_5', false]], [['SPEED_6', false]]], hand: [] };
  let r = puzzle(s0, s1);
  r = play(r, 'WATER_6', 2, false);
  r = answer(r, [
    (req) => {
      assert.equal(req.player, 1, '削除するカードは相手が選ぶ');
      assert.deepEqual(req.candidates.slice().sort(), [u1('SPEED_5'), u1('SPEED_6')].sort(), '相手自身の裏向きのカードだけ');
      return [u1('SPEED_5')];
    },
    (req) => { assert.equal(req.player, 0); return [true]; }
  ]);
  assert.deepEqual(trashDefs(r.state, 1), ['SPEED_5']);
  assert.deepEqual(stack(r.state, 0, 0), [['PLAGUE_5', false]], '反転を選んだ');

  let r2 = puzzle(s0, s1);
  r2 = play(r2, 'WATER_6', 2, false);
  r2 = answer(r2, [[u1('SPEED_6')], []]);
  assert.deepEqual(trashDefs(r2.state, 1), ['SPEED_6']);
  assert.deepEqual(stack(r2.state, 0, 0), [['PLAGUE_5', true]], '反転しないことも選べる');
});

/* ======================= PSYCHIC ======================= */

test('PSYCHIC_1 中段: 2枚引く。相手は2枚捨て、そのあと手札を公開する', () => {
  let r = puzzle(
    { protos: ['PSYCHIC', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['PSYCHIC_1'] },
    { protos: ['SPEED', 'METAL', 'PLAGUE'], lines: [[], [], []], hand: ['SPEED_6', 'SPEED_5', 'SPEED_4'] });
  r = play(r, 'PSYCHIC_1', 0);
  r = answer(r, [(req) => {
    assert.equal(req.player, 1); assert.equal(req.min, 2); assert.equal(req.max, 2);
    return [u1('SPEED_6'), u1('SPEED_5')];
  }]);
  assert.equal(r.state.players[0].hand.length, 2);
  assert.deepEqual(handDefs(r.state, 1), ['SPEED_4']);
  assert.ok(r.log.some(l => l.includes('手札を公開') && l.includes('SPEED_4') && !l.includes('SPEED_6')), '捨てたあとの手札を公開');
});

test('PSYCHIC_2 上段: 相手はカードを裏向きでのみプレイできる', () => {
  let r = puzzle(
    { protos: ['PSYCHIC', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['PSYCHIC_2'] },
    { protos: ['SPEED', 'METAL', 'PLAGUE'], lines: [[], [], []], hand: ['SPEED_6', 'METAL_6'] });
  r = play(r, 'PSYCHIC_2', 0);
  assert.equal(r.state.turn, 1);
  const plays = Engine.legalActions(r.state).filter(a => a.type === 'play');
  assert.ok(plays.length > 0);
  assert.ok(plays.every(a => !a.faceUp), '表向きのプレイは出ない');
});

test('PSYCHIC_2 下段: 開始時、このカードを反転させる', () => {
  const r = puzzle(
    { protos: ['PSYCHIC', 'WATER', 'SPIRIT'], lines: [[['PSYCHIC_2', true]], [], []], hand: ['WATER_6'] },
    { protos: ['SPEED', 'METAL', 'PLAGUE'], lines: [[], [], []], hand: [] });
  assert.deepEqual(stack(r.state, 0, 0), [['PSYCHIC_2', false]]);
});

test('PSYCHIC_3 中段: 相手は2枚捨て、あなたは相手のプロトコルを並べ替える', () => {
  let r = puzzle(
    { protos: ['PSYCHIC', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['PSYCHIC_3'] },
    { protos: ['SPEED', 'METAL', 'PLAGUE'], lines: [[['SPEED_6', true]], [], []], hand: ['SPEED_5', 'SPEED_4', 'METAL_6'] });
  r = play(r, 'PSYCHIC_3', 0);
  r = answer(r, [
    (req) => { assert.equal(req.player, 1); assert.equal(req.min, 2); return [u1('SPEED_5'), u1('SPEED_4')]; },
    (req) => { assert.equal(req.kind, 'arrange'); assert.equal(req.player, 0); assert.equal(req.target, 1); return [1, 0, 2]; }
  ]);
  assert.deepEqual(handDefs(r.state, 1), ['METAL_6']);
  assert.deepEqual(r.state.players[1].protocols.map(p => p.name), ['METAL', 'SPEED', 'PLAGUE']);
  assert.deepEqual(r.state.players[0].protocols.map(p => p.name), ['PSYCHIC', 'WATER', 'SPIRIT'], '自分は変わらない');
  assert.deepEqual(stack(r.state, 0, 1), [['SPEED_6', true]], 'ラインのカードは動かない');
});

test('PSYCHIC_4 中段: 相手は1枚捨て、あなたは相手のカードを1枚移動させる', () => {
  let r = puzzle(
    { protos: ['PSYCHIC', 'WATER', 'SPIRIT'], lines: [[], [['WATER_6', true]], []], hand: ['PSYCHIC_4'] },
    { protos: ['SPEED', 'METAL', 'PLAGUE'], lines: [[['SPEED_6', true]], [], []], hand: ['SPEED_5', 'SPEED_4'] });
  r = play(r, 'PSYCHIC_4', 0);
  r = answer(r, [
    [u1('SPEED_5')],
    (req) => { assert.equal(req.kind, 'pickLine'); assert.equal(req.player, 0); return [2]; }
  ]);
  assert.deepEqual(handDefs(r.state, 1), ['SPEED_4']);
  assert.deepEqual(stack(r.state, 0, 1), []);
  assert.deepEqual(stack(r.state, 2, 1), [['SPEED_6', true]], '相手側の別ラインへ移動');
  assert.deepEqual(stack(r.state, 1, 0), [['WATER_6', true]], '自分のカードは対象外');
});

test('PSYCHIC_5 下段: 終了時、相手のカードを1枚戻せる。戻したらこのカードを反転', () => {
  const s0 = { protos: ['PSYCHIC', 'WATER', 'SPIRIT'], lines: [[['PSYCHIC_5', true]], [], []], hand: ['WATER_6'] };
  const s1 = { protos: ['SPEED', 'METAL', 'PLAGUE'], lines: [[], [['METAL_6', true]], []], hand: [] };
  let r = puzzle(s0, s1);
  r = play(r, 'WATER_6', 2, false);
  r = answer(r, [(req) => {
    assert.equal(req.player, 0);
    assert.deepEqual(req.candidates, [u1('METAL_6')], '相手のカードだけ');
    return [u1('METAL_6')];
  }]);
  assert.deepEqual(handDefs(r.state, 1), ['METAL_6']);
  assert.deepEqual(stack(r.state, 0, 0), [['PSYCHIC_5', false]]);

  let r2 = puzzle(s0, s1);
  r2 = play(r2, 'WATER_6', 2, false);
  r2 = answer(r2, [[]]);
  assert.deepEqual(stack(r2.state, 1, 1), [['METAL_6', true]]);
  assert.deepEqual(stack(r2.state, 0, 0), [['PSYCHIC_5', true]], '戻さなければ反転しない');
});

/* ======================= SPEED ======================= */

test('SPEED_1 中段: カードを1枚プレイする', () => {
  let r = puzzle(
    { protos: ['SPEED', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['SPEED_1', 'WATER_6', 'SPIRIT_6'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [], []], hand: [] });
  r = play(r, 'SPEED_1', 0);
  r = answer(r, [
    (req) => { assert.ok(req.candidates.includes(u0('WATER_6') + '|1|u')); return [u0('WATER_6') + '|1|u']; }
    // WATER_6 の中段 (1枚捨てる) は残り1枚なので自動
  ]);
  assert.deepEqual(stack(r.state, 1, 0), [['WATER_6', true]]);
  assert.deepEqual(trashDefs(r.state, 0), ['SPIRIT_6'], 'プレイしたカードの中段も解決される');
});

test('SPEED_2 中段: カードを2枚引く', () => {
  let r = puzzle(
    { protos: ['SPEED', 'WATER', 'SPIRIT'], lines: [[], [], []], hand: ['SPEED_2'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [], []], hand: [] });
  r = play(r, 'SPEED_2', 0);
  assert.equal(r.state.players[0].hand.length, 2);
});

test('SPEED_2 上段: キャッシュをクリアしたあとカードを1枚引く', () => {
  let r = puzzle(
    { protos: ['SPEED', 'WATER', 'SPIRIT'], lines: [[], [], []],
      hand: ['SPEED_2', 'WATER_6', 'WATER_5', 'SPIRIT_6', 'SPIRIT_5'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [], []], hand: [] });
  r = play(r, 'SPEED_2', 0);
  r = answer(r, [(req) => { assert.equal(req.prompt, 'clear-cache'); assert.equal(req.min, 1); return [u0('WATER_6')]; }]);
  assert.deepEqual(trashDefs(r.state, 0), ['WATER_6']);
  assert.equal(r.state.players[0].hand.length, 6, '4+2=6 → 5に減らす → 1枚引いて6');
  assert.equal(r.state.turn, 1);
});

test('SPEED_3 上段: コンパイルで削除されるとき、覆われていても代わりに移動する', () => {
  let r = puzzle(
    { protos: ['SPEED', 'WATER', 'SPIRIT'],
      lines: [[['SPEED_3', true], ['WATER_6', true], ['SPIRIT_6', true]], [], []], hand: ['WATER_5'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[['METAL_2', true]], [], []], hand: [] });
  r = answer(r, [(req) => { assert.equal(req.kind, 'pickLine'); assert.deepEqual(req.lines.slice().sort(), [1, 2]); return [2]; }]);
  const st = r.state;
  assert.equal(st.players[0].protocols[0].compiled, true, 'コンパイルは行われる');
  assert.deepEqual(stack(st, 0, 0), []);
  assert.deepEqual(stack(st, 2, 0), [['SPEED_3', true]], 'SPEED_3 だけ移動して残る');
  assert.deepEqual(trashDefs(st, 0), ['SPIRIT_6', 'WATER_6']);
  assert.deepEqual(trashDefs(st, 1), ['METAL_2'], '相手のカードは削除される');
});

test('SPEED_4 中段: あなたの他のカードを1枚移動させる', () => {
  let r = puzzle(
    { protos: ['SPEED', 'WATER', 'SPIRIT'], lines: [[], [['WATER_6', true]], []], hand: ['SPEED_4'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[['METAL_6', true]], [], []], hand: [] });
  r = play(r, 'SPEED_4', 0);
  r = answer(r, [
    (req) => { assert.equal(req.kind, 'pickLine'); return [2]; },
    [] // 終了時: 下段の任意の移動はしない
  ]);
  assert.deepEqual(stack(r.state, 1, 0), []);
  assert.deepEqual(stack(r.state, 2, 0), [['WATER_6', true]]);
  assert.deepEqual(stack(r.state, 0, 0), [['SPEED_4', true]], 'SPEED_4 自身は動かない');
  assert.deepEqual(stack(r.state, 0, 1), [['METAL_6', true]], '相手のカードは対象外');
});

test('SPEED_4 下段: 終了時、自分のカードを1枚移動できる。そうしたらこのカードを反転', () => {
  const s0 = { protos: ['SPEED', 'WATER', 'SPIRIT'], lines: [[['SPEED_4', true]], [['WATER_6', true]], []], hand: ['SPIRIT_6'] };
  const s1 = { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[['METAL_6', true]], [], []], hand: [] };
  let r = puzzle(s0, s1);
  r = play(r, 'SPIRIT_6', 2, false);
  r = answer(r, [
    (req) => {
      assert.equal(req.min, 0, '任意');
      assert.ok(!req.candidates.includes(u1('METAL_6')), '相手のカードは選べない');
      return [u0('WATER_6')];
    },
    [2]
  ]);
  assert.deepEqual(stack(r.state, 2, 0), [['SPIRIT_6', false], ['WATER_6', true]]);
  assert.deepEqual(stack(r.state, 0, 0), [['SPEED_4', false]], '移動したので反転');

  let r2 = puzzle(s0, s1);
  r2 = play(r2, 'SPIRIT_6', 2, false);
  r2 = answer(r2, [[]]);
  assert.deepEqual(stack(r2.state, 0, 0), [['SPEED_4', true]], '移動しなければ反転しない');
});

test('SPEED_5 中段: 相手の裏向きのカードを1枚移動させる', () => {
  let r = puzzle(
    { protos: ['SPEED', 'WATER', 'SPIRIT'], lines: [[], [['WATER_6', false]], []], hand: ['SPEED_5'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[['METAL_6', true]], [['PLAGUE_6', false]], []], hand: [] });
  r = play(r, 'SPEED_5', 0);
  r = answer(r, [(req) => { assert.equal(req.kind, 'pickLine'); return [2]; }]);
  assert.deepEqual(stack(r.state, 1, 1), []);
  assert.deepEqual(stack(r.state, 2, 1), [['PLAGUE_6', false]], '裏向きのまま移動');
  assert.deepEqual(stack(r.state, 0, 1), [['METAL_6', true]], '表向きは対象外');
  assert.deepEqual(stack(r.state, 1, 0), [['WATER_6', false]], '自分のカードは対象外');
});

/* ======================= SPIRIT ======================= */

test('SPIRIT_1 中段: リフレッシュして1枚引く / 下段: キャッシュの確認を省略 (手札6枚のまま)', () => {
  let r = puzzle(
    { protos: ['SPIRIT', 'WATER', 'SPEED'], lines: [[], [], []], hand: ['SPIRIT_1', 'WATER_6'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [], []], hand: [] });
  r = play(r, 'SPIRIT_1', 0);
  r = answer(r, []);
  assert.equal(r.state.turn, 1);
  assert.equal(r.state.players[0].hand.length, 6, '1 → 5 (リフレッシュ) → 6、捨て札にしない');
  assert.equal(r.state.players[0].trash.length, 0);
});

test('SPIRIT_2 上段: 表向きでプレイするとき、プロトコルを対応させずにプレイできる', () => {
  let r = puzzle(
    { protos: ['METAL', 'PLAGUE', 'SPIRIT'], lines: [[], [], []], hand: ['METAL_6'] },
    { protos: ['SPEED', 'PSYCHIC', 'WATER'], lines: [[], [], []], hand: ['SPEED_6'] });
  const before = Engine.legalActions(r.state).filter(a => a.type === 'play' && a.faceUp && a.card === u0('METAL_6')).map(a => a.line);
  assert.deepEqual(before, [0], '対照: 普段 METAL_6 を表でプレイできるのはライン0だけ');
  /* 場に表向きの SPIRIT_2 (開始時は捨て札を選んで表のまま残す) */
  let r2 = puzzle(
    { protos: ['METAL', 'PLAGUE', 'SPIRIT'], lines: [[], [], [['SPIRIT_2', true]]], hand: ['METAL_6', 'METAL_5'] },
    { protos: ['SPEED', 'PSYCHIC', 'WATER'], lines: [[], [], []], hand: [] });
  r2 = answer(r2, [
    (req) => { assert.equal(req.kind, 'option'); return [req.options.findIndex(o => o.includes('discard'))]; },
    [u0('METAL_5')]
  ]);
  const ups = Engine.legalActions(r2.state).filter(a => a.type === 'play' && a.faceUp && a.card === u0('METAL_6')).map(a => a.line).sort();
  assert.deepEqual(ups, [0, 1, 2], 'どのラインにも表でプレイできる');
  r2 = play(r2, 'METAL_6', 1);
  r2 = answer(r2, []);
  assert.deepEqual(stack(r2.state, 1, 0), [['METAL_6', true]]);
});

test('SPIRIT_2 中段: カードを2枚引く', () => {
  let r = puzzle(
    { protos: ['SPIRIT', 'WATER', 'SPEED'], lines: [[], [], []], hand: ['SPIRIT_2'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [], []], hand: [] });
  r = play(r, 'SPIRIT_2', 0);
  assert.equal(r.state.players[0].hand.length, 2);
});

test('SPIRIT_2 下段: 開始時、手札を1枚捨てるか、このカードを反転させる', () => {
  const s0 = { protos: ['SPIRIT', 'WATER', 'SPEED'], lines: [[['SPIRIT_2', true]], [], []], hand: ['WATER_6', 'WATER_5'] };
  const s1 = { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [], []], hand: [] };
  let r = puzzle(s0, s1);
  r = answer(r, [(req) => { assert.equal(req.options.length, 2); return [req.options.findIndex(o => o.includes('flip'))]; }]);
  assert.deepEqual(stack(r.state, 0, 0), [['SPIRIT_2', false]]);
  assert.equal(r.state.players[0].hand.length, 2);

  let r2 = puzzle(s0, s1);
  r2 = answer(r2, [(req) => [req.options.findIndex(o => o.includes('discard'))], [u0('WATER_5')]]);
  assert.deepEqual(stack(r2.state, 0, 0), [['SPIRIT_2', true]]);
  assert.deepEqual(handDefs(r2.state, 0), ['WATER_6']);
  assert.deepEqual(trashDefs(r2.state, 0), ['WATER_5']);

  /* 手札がなければ反転するしかない */
  const r3 = puzzle(Object.assign({}, s0, { hand: [] }), s1);
  assert.equal(r3.requests.length, 0);
  assert.deepEqual(stack(r3.state, 0, 0), [['SPIRIT_2', false]]);
});

test('SPIRIT_3 中段: カードを1枚反転させることができる', () => {
  const s0 = { protos: ['SPIRIT', 'WATER', 'SPEED'], lines: [[], [], []], hand: ['SPIRIT_3'] };
  const s1 = { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [['PLAGUE_6', true]], []], hand: [] };
  let r = puzzle(s0, s1);
  r = play(r, 'SPIRIT_3', 0);
  r = answer(r, [(req) => { assert.equal(req.min, 0); return [u1('PLAGUE_6')]; }]);
  assert.deepEqual(stack(r.state, 1, 1), [['PLAGUE_6', false]]);

  let r2 = puzzle(s0, s1);
  r2 = play(r2, 'SPIRIT_3', 0);
  r2 = answer(r2, [[]]);
  assert.deepEqual(stack(r2.state, 1, 1), [['PLAGUE_6', true]], '反転しないことも選べる');
});

test('SPIRIT_4 上段: カードを引いたあと、覆われていてもこのカードを移動できる', () => {
  let r = puzzle(
    { protos: ['SPIRIT', 'WATER', 'SPEED'], lines: [[['SPIRIT_4', true], ['WATER_6', false]], [], []], hand: ['WATER_5'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [], []], hand: [] });
  r = act(r, { type: 'refresh' });
  r = answer(r, [[true], (req) => { assert.equal(req.kind, 'pickLine'); return [1]; }]);
  assert.deepEqual(stack(r.state, 0, 0), [['WATER_6', false]]);
  assert.deepEqual(stack(r.state, 1, 0), [['SPIRIT_4', true]]);
  assert.equal(r.state.players[0].hand.length, 5);
});

test('SPIRIT_5 中段: あなたのプロトコルのうち2枚の位置を入れ替える', () => {
  let r = puzzle(
    { protos: ['SPIRIT', 'WATER', 'SPEED'], lines: [[], [['WATER_6', true]], []], hand: ['SPIRIT_5'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [], []], hand: [] });
  r = play(r, 'SPIRIT_5', 0);
  r = answer(r, [(req) => {
    assert.equal(req.kind, 'arrange'); assert.equal(req.target, 0); assert.equal(req.exact, 'transposition');
    return [0, 2, 1];
  }]);
  assert.deepEqual(r.state.players[0].protocols.map(p => p.name), ['SPIRIT', 'SPEED', 'WATER']);
  assert.deepEqual(r.state.players[1].protocols.map(p => p.name), ['METAL', 'PLAGUE', 'PSYCHIC']);
  assert.deepEqual(stack(r.state, 1, 0), [['WATER_6', true]], 'カードは動かない');
});

/* ======================= WATER ======================= */

test('WATER_1 中段: 他のカードを1枚反転させ、このカードを反転させる', () => {
  let r = puzzle(
    { protos: ['WATER', 'SPIRIT', 'SPEED'], lines: [[], [], []], hand: ['WATER_1'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [['PLAGUE_6', true]], []], hand: [] });
  r = play(r, 'WATER_1', 0);
  r = answer(r, []);
  assert.deepEqual(stack(r.state, 1, 1), [['PLAGUE_6', false]]);
  assert.deepEqual(stack(r.state, 0, 0), [['WATER_1', false]]);
});

test('WATER_2 中段: デッキの一番上のカードを、他の各ラインに裏向きで1枚ずつプレイする', () => {
  let r = puzzle(
    { protos: ['WATER', 'SPIRIT', 'SPEED'], lines: [[], [], []], hand: ['WATER_2'], deck: ['SPIRIT_6', 'SPEED_6', 'SPEED_5'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [], []], hand: [] });
  r = play(r, 'WATER_2', 0);
  r = answer(r, (req) => { assert.equal(req.kind, 'pickLine'); return [1]; });
  const st = r.state;
  assert.deepEqual(stack(st, 0, 0), [['WATER_2', true]]);
  assert.deepEqual(stack(st, 1, 0), [['SPIRIT_6', false]], '上から順に');
  assert.deepEqual(stack(st, 2, 0), [['SPEED_6', false]]);
  assert.equal(st.cards[st.players[0].deck[0]].def, 'SPEED_5');
});

test('WATER_3 中段: カードを2枚引き、あなたのプロトコルを並べ替える', () => {
  let r = puzzle(
    { protos: ['WATER', 'SPIRIT', 'SPEED'], lines: [[], [], []], hand: ['WATER_3'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [], []], hand: [] });
  r = play(r, 'WATER_3', 0);
  r = answer(r, [(req) => { assert.equal(req.kind, 'arrange'); assert.equal(req.target, 0); return [2, 0, 1]; }]);
  assert.equal(r.state.players[0].hand.length, 2);
  assert.deepEqual(r.state.players[0].protocols.map(p => p.name), ['SPEED', 'WATER', 'SPIRIT']);
  assert.deepEqual(stack(r.state, 0, 0), [['WATER_3', true]]);
});

test('WATER_4 中段: 1ラインを選び、そのラインの値が2のすべてのカード (覆われていても・両者) を戻す', () => {
  let r = puzzle(
    { protos: ['WATER', 'SPIRIT', 'SPEED'], lines: [[], [['SPIRIT_3', true], ['SPEED_3', true], ['SPIRIT_6', true]], []], hand: ['WATER_4'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [['METAL_3', true], ['PLAGUE_6', true]], [['PLAGUE_3', true]]], hand: [] });
  r = play(r, 'WATER_4', 0);
  r = answer(r, [(req) => { assert.equal(req.kind, 'pickLine'); return [1]; }]);
  const st = r.state;
  assert.deepEqual(stack(st, 1, 0), [['SPIRIT_6', true]]);
  assert.deepEqual(stack(st, 1, 1), [['PLAGUE_6', true]]);
  assert.deepEqual(handDefs(st, 0), ['SPEED_3', 'SPIRIT_3']);
  assert.deepEqual(handDefs(st, 1), ['METAL_3'], '相手のカードは相手の手札へ');
  assert.deepEqual(stack(st, 2, 1), [['PLAGUE_3', true]], '選ばなかったラインはそのまま');
});

test('WATER_4 中段: 裏向きのカード (値2) も戻す', () => {
  let r = puzzle(
    { protos: ['WATER', 'SPIRIT', 'SPEED'], lines: [[], [['SPIRIT_6', false], ['SPEED_6', true]], []], hand: ['WATER_4'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[], [['METAL_6', false]], []], hand: [] });
  r = play(r, 'WATER_4', 0);
  r = answer(r, []); // 値2のカードがあるのはライン1だけなので自動で選ばれる
  assert.deepEqual(stack(r.state, 1, 0), [['SPEED_6', true]]);
  assert.deepEqual(stack(r.state, 1, 1), []);
  assert.deepEqual(handDefs(r.state, 0), ['SPIRIT_6']);
  assert.deepEqual(handDefs(r.state, 1), ['METAL_6']);
});

test('WATER_5 中段: あなたのカードを1枚戻す', () => {
  let r = puzzle(
    { protos: ['WATER', 'SPIRIT', 'SPEED'], lines: [[], [['SPIRIT_6', true]], []], hand: ['WATER_5'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[['METAL_6', true]], [], []], hand: [] });
  r = play(r, 'WATER_5', 0);
  r = answer(r, [(req) => {
    assert.ok(!req.candidates.includes(u1('METAL_6')), '相手のカードは選べない');
    return [u0('SPIRIT_6')];
  }]);
  assert.deepEqual(handDefs(r.state, 0), ['SPIRIT_6']);
  assert.deepEqual(stack(r.state, 1, 0), []);
  assert.deepEqual(stack(r.state, 0, 0), [['WATER_5', true]]);
});

test('WATER_5 中段: 他に自分のカードがなければ、自分自身を戻す', () => {
  let r = puzzle(
    { protos: ['WATER', 'SPIRIT', 'SPEED'], lines: [[], [], []], hand: ['WATER_5'] },
    { protos: ['METAL', 'PLAGUE', 'PSYCHIC'], lines: [[['METAL_6', true]], [], []], hand: [] });
  r = play(r, 'WATER_5', 0);
  r = answer(r, []);
  assert.deepEqual(stack(r.state, 0, 0), []);
  assert.deepEqual(handDefs(r.state, 0), ['WATER_5']);
});
