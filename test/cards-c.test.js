'use strict';
/* カード効果の検証 (APATHY / HATE / LOVE / CHAOS / CLARITY / CORRUPTION) — node --test test/cards-c.test.js
   各カードの文面どおりの結果になるかを、Engine.newPuzzle で組んだ盤面で確かめる。 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);

/* ---------- ヘルパ ---------- */

const SET_A = ['APATHY', 'HATE', 'LOVE'];          // line0=APATHY, line1=HATE, line2=LOVE
const SET_B = ['CHAOS', 'CLARITY', 'CORRUPTION'];  // line0=CHAOS, line1=CLARITY, line2=CORRUPTION
const OPP = ['DARKNESS', 'FIRE', 'WATER'];

/* 盤面を作る。s0/s1 は newPuzzle の side 仕様 (protos 省略時は既定) */
function pz(s0, s1, protos0) {
  const spec = { sides: [
    Object.assign({ protos: protos0 || SET_A, lines: [[], [], []], hand: [] }, s0),
    Object.assign({ protos: OPP, lines: [[], [], []], hand: [] }, s1 || {})
  ] };
  const res = Engine.newPuzzle(spec, { seed: 1 });
  assert.equal(res.error, null);
  return res;
}

const u0 = d => 'p0:' + d;
const u1 = d => 'p1:' + d;

/* 選択要求に answerer で答えながら完了まで進める。answerer が undefined を返したら失敗 */
function drive(res, answerer) {
  let n = 0;
  const seen = [];
  while (res.requests.length) {
    if (++n > 40) throw new Error('drive: 選択要求が収束しない');
    const req = res.requests[0];
    seen.push(req);
    const picks = answerer ? answerer(req, res) : undefined;
    if (picks === undefined) throw new Error('想定外の選択要求: ' + JSON.stringify(req));
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks });
    assert.equal(res.error, null, 'choose エラー: ' + res.error);
  }
  res.seen = seen;
  return res;
}

function play(res, defId, line, faceUp, extra) {
  const r = Engine.apply(res.state, Object.assign({ type: 'play', card: u0(defId), line, faceUp }, extra || {}));
  assert.equal(r.error, null, 'play エラー: ' + r.error);
  return r;
}

const faceUp = (st, uid) => st.cards[uid].faceUp;
const stack = (st, line, side) => st.lines[line][side].slice();

/* ---------- 「あなたは手札を1枚捨て札にする」だけのカード (値5) ---------- */

for (const [defId, protos, line] of [
  ['APATHY_6', SET_A, 0], ['HATE_6', SET_A, 1], ['LOVE_5', SET_A, 2],
  ['CHAOS_6', SET_B, 0], ['CLARITY_6', SET_B, 1], ['CORRUPTION_5', SET_B, 2]
]) {
  test(`${defId}: 中段で手札を1枚捨て札にする`, () => {
    const others = protos === SET_A ? ['HATE_1', 'LOVE_1'] : ['CHAOS_1', 'CLARITY_1'];
    let res = pz({ protos, hand: [defId].concat(others) });
    res = play(res, defId, line, true);
    res = drive(res, req => (req.kind === 'pickHand' && req.player === 0) ? [u0(others[0])] : undefined);
    const st = res.state;
    assert.deepEqual(st.players[0].hand, [u0(others[1])]);
    assert.ok(st.players[0].trash.includes(u0(others[0])));
    assert.equal(st.turn, 1);
  });
}

/* ---------- APATHY ---------- */

test('APATHY_1: このラインのあなたの合計値は裏向きのカード1枚ごとに+1 (両側の裏向きを数える)', () => {
  const res = pz(
    { lines: [[['HATE_2', false], ['APATHY_1', true]], [], []] },
    { lines: [[['FIRE_2', false]], [['FIRE_3', false]], []] }
  );
  const st = res.state;
  // 裏2 + APATHY_1(0) + ライン0の裏向き2枚 = 4
  assert.equal(Engine.lineTotal(st, 0, 0), 4);
  assert.equal(Engine.lineTotal(st, 0, 1), 2, '相手の合計値は変わらない');
  assert.equal(Engine.lineTotal(st, 1, 0), 0, '他のラインには効かない');
});

test('APATHY_2: このラインにある他のすべての表向きのカード (覆われていても・相手側も) を反転', () => {
  let res = pz(
    { lines: [[['LOVE_6', true]], [['HATE_6', true]], []], hand: ['APATHY_2'] },
    { lines: [[['WATER_6', true], ['FIRE_6', true]], [['FIRE_3', true]], []] }
  );
  res = play(res, 'APATHY_2', 0, true);
  res = drive(res);
  const st = res.state;
  assert.equal(faceUp(st, u0('APATHY_2')), true, '自分自身は反転しない');
  assert.equal(faceUp(st, u0('LOVE_6')), false);
  assert.equal(faceUp(st, u1('WATER_6')), false, '覆われている相手のカードも');
  assert.equal(faceUp(st, u1('FIRE_6')), false);
  assert.equal(faceUp(st, u0('HATE_6')), true, '他のラインは対象外');
  assert.equal(faceUp(st, u1('FIRE_3')), true);
});

test('APATHY_3 上段: このラインのカードの中段コマンドは無視される (相手が表でプレイしても発動しない)', () => {
  let res = pz(
    { lines: [[['APATHY_3', true]], [], []], hand: ['HATE_6'] },
    { hand: ['DARKNESS_1', 'FIRE_6'] }
  );
  res = play(res, 'HATE_6', 2, false);   // 自分は裏向きで別ラインへ
  res = drive(res);
  assert.equal(res.state.turn, 1);
  const before = res.state.players[1].hand.length;
  res = Engine.apply(res.state, { type: 'play', card: u1('DARKNESS_1'), line: 0, faceUp: true });
  assert.equal(res.error, null);
  res = drive(res);
  const st = res.state;
  assert.deepEqual(stack(st, 0, 1), [u1('DARKNESS_1')]);
  // DARKNESS_1 の中段 (カードを3枚引く) は無視される
  assert.equal(st.players[1].hand.length, before - 1);
});

test('APATHY_3 下段: 覆われることになったとき、先にこのカードを反転させる', () => {
  let res = pz({ lines: [[['APATHY_3', true]], [], []], hand: ['HATE_6'] });
  res = play(res, 'HATE_6', 0, false);
  res = drive(res);
  const st = res.state;
  assert.deepEqual(stack(st, 0, 0), [u0('APATHY_3'), u0('HATE_6')]);
  assert.equal(faceUp(st, u0('APATHY_3')), false);
});

test('APATHY_4: 相手の表向きのカードを1枚反転させる (自分のカードは候補外)', () => {
  let res = pz(
    { lines: [[], [['HATE_6', true]], []], hand: ['APATHY_4'] },
    { lines: [[], [['FIRE_6', true]], [['WATER_6', true], ['WATER_3', false]]] }
  );
  res = play(res, 'APATHY_4', 0, true);
  res = drive(res, req => {
    if (req.kind !== 'pickCard') return undefined;
    assert.ok(!req.candidates.includes(u0('HATE_6')));
    assert.ok(!req.candidates.includes(u0('APATHY_4')));
    assert.ok(!req.candidates.includes(u1('WATER_3')), '裏向きは候補外');
    return [u1('FIRE_6')];
  });
  assert.equal(faceUp(res.state, u1('FIRE_6')), false);
});

test('APATHY_4: 候補が1枚なら自動で反転', () => {
  let res = pz({ hand: ['APATHY_4'] }, { lines: [[], [['FIRE_6', true]], []] });
  res = play(res, 'APATHY_4', 0, true);
  res = drive(res);
  assert.equal(faceUp(res.state, u1('FIRE_6')), false);
});

test('APATHY_5: 表向きで覆われている自分のカード1枚を反転できる (任意)', () => {
  const s0 = { lines: [[], [['HATE_6', true], ['HATE_1', false]], [['LOVE_6', true]]], hand: ['APATHY_5'] };
  const s1 = { lines: [[['FIRE_6', true], ['FIRE_3', false]], [], []] };
  let res = pz(s0, s1);
  res = play(res, 'APATHY_5', 0, true);
  res = drive(res, req => {
    if (req.kind !== 'pickCard') return undefined;
    assert.deepEqual(req.candidates, [u0('HATE_6')]);
    assert.equal(req.min, 0, '任意');
    return [u0('HATE_6')];
  });
  assert.equal(faceUp(res.state, u0('HATE_6')), false);
  assert.equal(faceUp(res.state, u0('LOVE_6')), true);

  let res2 = pz(s0, s1);
  res2 = play(res2, 'APATHY_5', 0, true);
  res2 = drive(res2, req => req.kind === 'pickCard' ? [] : undefined);
  assert.equal(faceUp(res2.state, u0('HATE_6')), true, '断れる');
});

/* ---------- HATE ---------- */

test('HATE_1: カードを1枚削除する (覆われていないカードのみ候補)', () => {
  let res = pz(
    { hand: ['HATE_1'] },
    { lines: [[], [['FIRE_6', false], ['FIRE_2', true]], [['WATER_6', true]]] }
  );
  res = play(res, 'HATE_1', 1, true);
  res = drive(res, req => {
    if (req.kind !== 'pickCard') return undefined;
    assert.ok(!req.candidates.includes(u1('FIRE_6')), '覆われているカードは候補外');
    return [u1('FIRE_2')];
  });
  const st = res.state;
  assert.ok(st.players[1].trash.includes(u1('FIRE_2')));
  assert.deepEqual(stack(st, 1, 1), [u1('FIRE_6')]);
});

test('HATE_2: 手札を3枚捨て札にし、カードを2枚削除する', () => {
  let res = pz(
    { hand: ['HATE_2', 'HATE_6', 'LOVE_6', 'APATHY_6'] },
    { lines: [[['DARKNESS_6', true]], [['FIRE_6', true]], [['WATER_6', true]]] }
  );
  res = play(res, 'HATE_2', 1, true);
  const dels = [u1('FIRE_6'), u1('WATER_6')];
  res = drive(res, req => {
    if (req.kind === 'pickHand' && req.player === 0) return req.candidates.slice(0, 3);
    if (req.kind === 'pickCard' && req.player === 0) return [dels.shift()];
    return undefined;
  });
  const st = res.state;
  assert.equal(st.players[0].hand.length, 0);
  for (const d of ['HATE_6', 'LOVE_6', 'APATHY_6']) assert.ok(st.players[0].trash.includes(u0(d)));
  assert.ok(st.players[1].trash.includes(u1('FIRE_6')));
  assert.ok(st.players[1].trash.includes(u1('WATER_6')));
  assert.deepEqual(stack(st, 0, 1), [u1('DARKNESS_6')]);
});

test('HATE_3: 自分の最大値の覆われていないカード、次に相手の最大値の覆われていないカードを削除', () => {
  let res = pz(
    { lines: [[['APATHY_2', false]], [], [['LOVE_6', true]]], hand: ['HATE_3'] },
    { lines: [[['DARKNESS_6', true], ['WATER_5', true]], [['FIRE_3', true]], []], hand: [] }
  );
  res = play(res, 'HATE_3', 1, true);
  res = drive(res);
  const st = res.state;
  assert.ok(st.players[0].trash.includes(u0('LOVE_6')), '自分の最大値 LOVE_6(6) を削除');
  assert.ok(st.cards[u0('HATE_3')].zone === 'field');
  // 相手: 覆われていない中で最大は WATER_5(4)。覆われている DARKNESS_6(5) は対象外
  assert.ok(st.players[1].trash.includes(u1('WATER_5')));
  assert.deepEqual(stack(st, 0, 1), [u1('DARKNESS_6')]);
  assert.deepEqual(stack(st, 1, 1), [u1('FIRE_3')]);
});

test('HATE_3: 自身が最大値なら自身を削除し、2文目は解決されない (裁定)', () => {
  let res = pz(
    { lines: [[['APATHY_1', true]], [], []], hand: ['HATE_3'] },
    { lines: [[['FIRE_6', true]], [], []] }
  );
  res = play(res, 'HATE_3', 1, true);
  res = drive(res);
  const st = res.state;
  assert.ok(st.players[0].trash.includes(u0('HATE_3')));
  assert.deepEqual(stack(st, 0, 1), [u1('FIRE_6')], '相手のカードは残る');
});

test('HATE_4 上段: あなたがカードを削除したあと、カードを1枚引く (覆われていても有効)', () => {
  let res = pz(
    { lines: [[], [['HATE_4', true]], []], hand: ['HATE_1'], deck: ['LOVE_1'] },
    { lines: [[['FIRE_6', true]], [], []] }
  );
  res = play(res, 'HATE_1', 1, true);
  res = drive(res, req => req.kind === 'pickCard' ? [u1('FIRE_6')] : undefined);
  const st = res.state;
  assert.ok(st.players[1].trash.includes(u1('FIRE_6')));
  assert.deepEqual(st.players[0].hand, [u0('LOVE_1')]);
});

test('HATE_5 下段: 覆われることになったとき、先にこのラインで値が最も小さい覆われたカードを削除', () => {
  let res = pz(
    { lines: [[], [['HATE_2', false], ['HATE_5', true]], []], hand: ['HATE_6'] },
    { lines: [[], [['FIRE_2', true], ['FIRE_6', true]], []] }
  );
  res = play(res, 'HATE_6', 1, false);
  res = drive(res);
  const st = res.state;
  // 覆われたカード: 自分 HATE_2(裏=2) / 相手 FIRE_2(1) → FIRE_2 が最小
  assert.ok(st.players[1].trash.includes(u1('FIRE_2')));
  assert.deepEqual(stack(st, 1, 1), [u1('FIRE_6')]);
  assert.deepEqual(stack(st, 1, 0), [u0('HATE_2'), u0('HATE_5'), u0('HATE_6')]);
});

/* ---------- LOVE ---------- */

test('LOVE_1: 中段で相手のデッキの一番上を引き、終了時に手札1枚を与えて2枚引く', () => {
  let res = pz(
    { hand: ['LOVE_1', 'HATE_6'], deck: ['APATHY_6', 'HATE_1'] },
    { deck: ['FIRE_6'] }
  );
  res = play(res, 'LOVE_1', 2, true);
  res = drive(res, req => {
    if (req.kind === 'yesNo' && req.prompt === 'optional-give') return ['yes'];
    if (req.kind === 'pickHand' && req.player === 0) return [u0('HATE_6')];
    return undefined;
  });
  const st = res.state;
  assert.deepEqual(st.players[0].hand.slice().sort(), [u0('APATHY_6'), u0('HATE_1'), u1('FIRE_6')].sort());
  assert.ok(st.players[1].hand.includes(u0('HATE_6')));
});

test('LOVE_1 下段: 与えなければ引かない', () => {
  let res = pz({ hand: ['LOVE_1', 'HATE_6'], deck: ['APATHY_6'] }, { deck: ['FIRE_6'] });
  res = play(res, 'LOVE_1', 2, true);
  res = drive(res, req => (req.kind === 'yesNo' && req.prompt === 'optional-give') ? [] : undefined);
  const st = res.state;
  assert.deepEqual(st.players[0].hand.slice().sort(), [u0('HATE_6'), u1('FIRE_6')].sort());
  assert.equal(st.players[1].hand.length, 0);
});

test('LOVE_2: 相手はカードを1枚引き、あなたはリフレッシュする', () => {
  let res = pz({ hand: ['LOVE_2', 'HATE_6'] }, { hand: ['FIRE_6'] });
  res = play(res, 'LOVE_2', 2, true);
  res = drive(res);
  const st = res.state;
  assert.equal(st.players[1].hand.length, 2);
  assert.equal(st.players[0].hand.length, 5);
});

test('LOVE_3: 相手の手札からランダムに1枚引き、手札1枚を相手に与える', () => {
  let res = pz({ hand: ['LOVE_3', 'HATE_6'] }, { hand: ['FIRE_6'] });
  res = play(res, 'LOVE_3', 2, true);
  res = drive(res, req => (req.kind === 'pickHand' && req.player === 0) ? [u0('HATE_6')] : undefined);
  const st = res.state;
  assert.deepEqual(st.players[0].hand, [u1('FIRE_6')]);
  assert.deepEqual(st.players[1].hand, [u0('HATE_6')]);
});

test('LOVE_4: 手札1枚を公開し、カードを1枚反転させる', () => {
  let res = pz(
    { hand: ['LOVE_4', 'HATE_6', 'APATHY_6'] },
    { lines: [[['FIRE_6', true]], [], []] }
  );
  res = play(res, 'LOVE_4', 2, true);
  res = drive(res, req => {
    if (req.kind === 'pickHand' && req.prompt === 'reveal-hand-card') return [u0('HATE_6')];
    if (req.kind === 'pickCard') return [u1('FIRE_6')];
    return undefined;
  });
  const st = res.state;
  assert.ok(res.log.some(l => l.includes('HATE_6') && l.includes('公開')), '手札の公開がログに残る');
  assert.equal(faceUp(st, u1('FIRE_6')), false);
  assert.equal(st.players[0].hand.length, 2, '公開したカードは手札に残る');
});

test('LOVE_6: 相手はカードを2枚引く', () => {
  let res = pz({ hand: ['LOVE_6'] }, { hand: ['FIRE_6'] });
  res = play(res, 'LOVE_6', 2, true);
  res = drive(res);
  assert.equal(res.state.players[1].hand.length, 3);
});

/* ---------- CHAOS ---------- */

test('CHAOS_1 中段: 各ラインで覆われているカードを1枚ずつ反転 (覆われたカードの中段は発動しない)', () => {
  let res = pz(
    { protos: SET_B, lines: [[['CLARITY_6', true]], [], []], hand: ['CHAOS_1'] },
    { lines: [[], [['FIRE_6', false], ['FIRE_3', false]], [['WATER_6', true]]], hand: ['FIRE_2'] }
  );
  res = play(res, 'CHAOS_1', 0, true);
  res = drive(res, req => {
    if (req.kind === 'pickLine') return [req.lines[0]];
    if (req.kind === 'pickCard') return [req.candidates[0]];
    return undefined;
  });
  const st = res.state;
  assert.equal(faceUp(st, u0('CLARITY_6')), false);
  assert.equal(faceUp(st, u1('FIRE_6')), true);
  assert.equal(faceUp(st, u1('FIRE_3')), false, '覆われていないカードは反転しない');
  assert.equal(faceUp(st, u1('WATER_6')), true);
  assert.deepEqual(st.players[1].hand, [u1('FIRE_2')], 'FIRE_6 の中段 (捨て札) は発動しない');
});

test('CHAOS_1 下段: 開始時、相手のデッキの一番上を引き、相手はあなたのデッキの一番上を引く', () => {
  const res = pz(
    { protos: SET_B, lines: [[['CHAOS_1', true]], [], []], deck: ['CLARITY_6'] },
    { deck: ['FIRE_6'] }
  );
  const st = res.state;
  assert.deepEqual(st.players[0].hand, [u1('FIRE_6')]);
  assert.deepEqual(st.players[1].hand, [u0('CLARITY_6')]);
});

test('CHAOS_2: 自分と相手のプロトコルをそれぞれ並べ替える', () => {
  let res = pz({ protos: SET_B, hand: ['CHAOS_2'] });
  res = play(res, 'CHAOS_2', 0, true);
  const targets = [];
  res = drive(res, req => {
    if (req.kind !== 'arrange') return undefined;
    targets.push(req.target);
    return [2, 0, 1];
  });
  assert.deepEqual(targets, [0, 1]);
  const st = res.state;
  assert.deepEqual(st.players[0].protocols.map(p => p.name), ['CORRUPTION', 'CHAOS', 'CLARITY']);
  assert.deepEqual(st.players[1].protocols.map(p => p.name), ['WATER', 'DARKNESS', 'FIRE']);
});

test('CHAOS_3: 自分の覆われているカードを1枚移動させる', () => {
  let res = pz(
    { protos: SET_B, lines: [[], [['CLARITY_5', false], ['CLARITY_6', false]], []], hand: ['CHAOS_3'] },
    { lines: [[['FIRE_6', false], ['FIRE_3', false]], [], []] }
  );
  res = play(res, 'CHAOS_3', 0, true);
  res = drive(res, req => {
    if (req.kind === 'pickCard') { assert.deepEqual(req.candidates, [u0('CLARITY_5')]); return [u0('CLARITY_5')]; }
    if (req.kind === 'pickLine') { assert.ok(!req.lines.includes(1)); return [2]; }
    return undefined;
  });
  const st = res.state;
  assert.deepEqual(stack(st, 1, 0), [u0('CLARITY_6')]);
  assert.deepEqual(stack(st, 2, 0), [u0('CLARITY_5')]);
});

test('CHAOS_4: プロトコルを対応させず表向きでプレイできる', () => {
  let res = pz({ protos: SET_B, hand: ['CHAOS_4', 'CLARITY_6'] });
  const acts = Engine.legalActions(res.state);
  const ups = acts.filter(a => a.type === 'play' && a.faceUp && a.card === u0('CHAOS_4')).map(a => a.line);
  assert.deepEqual(ups, [0, 1, 2]);
  const upsOther = acts.filter(a => a.type === 'play' && a.faceUp && a.card === u0('CLARITY_6')).map(a => a.line);
  assert.deepEqual(upsOther, [1], '他のカードは対応ラインのみ');
  res = play(res, 'CHAOS_4', 2, true);
  res = drive(res);
  assert.deepEqual(stack(res.state, 2, 0), [u0('CHAOS_4')]);
  assert.equal(faceUp(res.state, u0('CHAOS_4')), true);
});

test('CHAOS_5 下段: 終了時、手札をすべて捨て札にし、同じ枚数を引く', () => {
  let res = pz({
    protos: SET_B, lines: [[['CHAOS_5', true]], [], []],
    hand: ['CLARITY_6', 'CORRUPTION_5', 'CLARITY_4'], deck: ['CHAOS_6', 'CHAOS_1']
  });
  res = play(res, 'CLARITY_6', 2, false);
  res = drive(res, req => (req.kind === 'pickHand' && req.player === 0) ? req.candidates.slice() : undefined);
  const st = res.state;
  assert.deepEqual(st.players[0].hand.slice().sort(), [u0('CHAOS_6'), u0('CHAOS_1')].sort());
  assert.ok(st.players[0].trash.includes(u0('CORRUPTION_5')));
  assert.ok(st.players[0].trash.includes(u0('CLARITY_4')));
});

/* ---------- CLARITY ---------- */

test('CLARITY_1: このラインのあなたの合計値は手札1枚ごとに+1', () => {
  const res = pz({ protos: SET_B, lines: [[], [['CLARITY_1', true]], []], hand: ['CHAOS_6', 'CHAOS_5', 'CHAOS_4'] });
  assert.equal(Engine.lineTotal(res.state, 1, 0), 3);
  assert.equal(Engine.lineTotal(res.state, 0, 0), 0);
});

test('CLARITY_2 上段: 開始時にデッキの一番上を公開し、捨て札にできる', () => {
  const s0 = { protos: SET_B, lines: [[], [['CLARITY_2', true]], []], hand: ['CHAOS_5'], deck: ['CHAOS_6'] };
  let res = pz(s0);
  assert.equal(res.requests.length, 1);
  assert.equal(res.requests[0].kind, 'yesNo');
  let yes = drive(res, () => ['yes']);
  assert.ok(yes.state.players[0].trash.includes(u0('CHAOS_6')));
  assert.notEqual(yes.state.players[0].deck[0], u0('CHAOS_6'));
  let no = drive(pz(s0), () => []);
  assert.equal(no.state.players[0].deck[0], u0('CHAOS_6'));
  assert.equal(no.state.players[0].trash.length, 0);
});

test('CLARITY_2 中段: 相手は手札をすべて公開する', () => {
  let res = pz({ protos: SET_B, hand: ['CLARITY_2'] }, { hand: ['FIRE_6', 'WATER_3'] });
  res = play(res, 'CLARITY_2', 1, true);
  res = drive(res);
  assert.ok(res.log.some(l => l.includes('手札を公開') && l.includes('FIRE_6') && l.includes('WATER_3')));
});

test('CLARITY_2 下段: 覆われることになったとき、先にカードを3枚引く', () => {
  let res = pz({ protos: SET_B, lines: [[], [['CLARITY_2', true]], []], hand: ['CLARITY_6'], deck: ['CHAOS_6'] });
  res = drive(res, req => req.kind === 'yesNo' ? [] : undefined); // 開始時の公開は捨てない
  res = play(res, 'CLARITY_6', 1, false);
  res = drive(res);
  const st = res.state;
  assert.equal(st.players[0].hand.length, 3);
  assert.deepEqual(stack(st, 1, 0), [u0('CLARITY_2'), u0('CLARITY_6')]);
});

test('CLARITY_3: デッキから値1のカードを1枚引き、値1のカードを1枚プレイする', () => {
  let res = pz({
    protos: SET_B, hand: ['CLARITY_3'], trash: ['CHAOS_2', 'CORRUPTION_2']
  });
  res = play(res, 'CLARITY_3', 1, true);
  res = drive(res, req => {
    if (req.kind === 'pickCard' && req.prompt === 'play-free') {
      // 候補は「カード|ライン|表裏」。値1のカード (デッキから引いた CLARITY_2) だけが候補
      assert.ok(req.candidates.every(c => c.startsWith(u0('CLARITY_2') + '|')));
      return [u0('CLARITY_2') + '|1|u'];
    }
    return undefined;
  });
  const st = res.state;
  assert.deepEqual(stack(st, 1, 0), [u0('CLARITY_3'), u0('CLARITY_2')], '値1のカードが場に出ている');
  assert.equal(faceUp(st, u0('CLARITY_2')), true);
  assert.equal(st.players[0].hand.length, 0);
});

test('CLARITY_4: デッキから値5のカードを1枚引く', () => {
  let res = pz({ protos: SET_B, hand: ['CLARITY_4'], trash: ['CHAOS_6', 'CLARITY_6'] });
  const deckBefore = res.state.players[0].deck.length;
  res = play(res, 'CLARITY_4', 1, true);
  res = drive(res, req => req.kind === 'pickCard' ? [u0('CORRUPTION_5')] : undefined);
  const st = res.state;
  assert.deepEqual(st.players[0].hand, [u0('CORRUPTION_5')]);
  assert.equal(st.players[0].deck.length, deckBefore - 1);
});

test('CLARITY_5: 捨て札のすべてをデッキに戻してシャッフルできる (任意)', () => {
  const s0 = { protos: SET_B, hand: ['CLARITY_5'], trash: ['CHAOS_6', 'CHAOS_1'] };
  let res = pz(s0);
  const deckBefore = res.state.players[0].deck.length;
  res = play(res, 'CLARITY_5', 1, true);
  res = drive(res, req => req.kind === 'yesNo' ? ['yes'] : undefined);
  assert.equal(res.state.players[0].trash.length, 0);
  assert.equal(res.state.players[0].deck.length, deckBefore + 2);

  let r2 = play(pz(s0), 'CLARITY_5', 1, true);
  r2 = drive(r2, req => req.kind === 'yesNo' ? [] : undefined);
  assert.equal(r2.state.players[0].trash.length, 2, '断れる');
});

/* ---------- CORRUPTION ---------- */

test('CORRUPTION_1 上段: 開始時、このスタックの他の表向きのカード (覆われていても) を1枚反転', () => {
  const res = pz({
    protos: SET_B,
    lines: [[['CHAOS_6', true]], [], [['CLARITY_6', true], ['CORRUPTION_1', true], ['CHAOS_5', false]]]
  });
  const st = drive(res, req => req.kind === 'pickCard' ? [u0('CLARITY_6')] : undefined).state;
  assert.equal(faceUp(st, u0('CLARITY_6')), false);
  assert.equal(faceUp(st, u0('CORRUPTION_1')), true, '自分自身は対象外');
  assert.equal(faceUp(st, u0('CHAOS_6')), true, '他のスタックは対象外');
});

test('CORRUPTION_1 下段: プロトコルに対応させず、どちらのプレイヤー側にもプレイできる', () => {
  let res = pz({ protos: SET_B, hand: ['CORRUPTION_1'] });
  const acts = Engine.legalActions(res.state);
  const ups = acts.filter(a => a.type === 'play' && a.faceUp && a.card === u0('CORRUPTION_1')).map(a => a.line);
  assert.deepEqual([...new Set(ups)].sort(), [0, 1, 2]);
  res = play(res, 'CORRUPTION_1', 0, true, { side: 1 });
  res = drive(res);
  assert.deepEqual(stack(res.state, 0, 1), [u0('CORRUPTION_1')]);
  assert.equal(faceUp(res.state, u0('CORRUPTION_1')), true);
});

test('CORRUPTION_2: カードを1枚戻す。相手のカードは手札の代わりに相手のデッキの一番上へ裏向きで', () => {
  let res = pz({ protos: SET_B, hand: ['CORRUPTION_2'] }, { lines: [[['FIRE_6', true]], [], []] });
  res = play(res, 'CORRUPTION_2', 2, true);
  res = drive(res, req => req.kind === 'pickCard' ? [u1('FIRE_6')] : undefined);
  const st = res.state;
  assert.equal(st.players[1].deck[0], u1('FIRE_6'));
  assert.equal(faceUp(st, u1('FIRE_6')), false);
  assert.ok(!st.players[1].hand.includes(u1('FIRE_6')));
});

test('CORRUPTION_2: 自分のカードは普通に自分の手札へ戻る', () => {
  let res = pz({ protos: SET_B, lines: [[['CHAOS_6', true]], [], []], hand: ['CORRUPTION_2'] });
  res = play(res, 'CORRUPTION_2', 2, true);
  res = drive(res, req => req.kind === 'pickCard' ? [u0('CHAOS_6')] : undefined);
  assert.deepEqual(res.state.players[0].hand, [u0('CHAOS_6')]);
});

test('CORRUPTION_3: カードを1枚引いて1枚捨てる。捨てたあと上段で相手も1枚捨てる', () => {
  let res = pz({ protos: SET_B, hand: ['CORRUPTION_3', 'CHAOS_5'], deck: ['CHAOS_6'] }, { hand: ['FIRE_6', 'FIRE_2'] });
  res = play(res, 'CORRUPTION_3', 2, true);
  res = drive(res, req => {
    if (req.kind === 'pickHand' && req.player === 0) return [u0('CHAOS_6')];
    if (req.kind === 'pickHand' && req.player === 1) return [u1('FIRE_2')];
    return undefined;
  });
  const st = res.state;
  assert.deepEqual(st.players[0].hand, [u0('CHAOS_5')]);
  assert.ok(st.players[0].trash.includes(u0('CHAOS_6')));
  assert.deepEqual(st.players[1].hand, [u1('FIRE_6')]);
  assert.ok(st.players[1].trash.includes(u1('FIRE_2')));
});

test('CORRUPTION_4: 覆われている表向きのカードを1枚反転できる (相手側も・任意)', () => {
  let res = pz(
    { protos: SET_B, lines: [[['CHAOS_6', true]], [['CLARITY_6', true], ['CLARITY_5', false]], []], hand: ['CORRUPTION_4'] },
    { lines: [[['FIRE_6', true], ['FIRE_3', false]], [], []] }
  );
  res = play(res, 'CORRUPTION_4', 2, true);
  res = drive(res, req => {
    if (req.kind !== 'pickCard') return undefined;
    assert.deepEqual(req.candidates.slice().sort(), [u0('CLARITY_6'), u1('FIRE_6')].sort());
    assert.equal(req.min, 0);
    return [u1('FIRE_6')];
  });
  assert.equal(faceUp(res.state, u1('FIRE_6')), false);
  assert.equal(faceUp(res.state, u0('CLARITY_6')), true);
});

test('CORRUPTION_6 上段: 終了時、手札を1枚捨てる', () => {
  let res = pz({ protos: SET_B, lines: [[], [], [['CORRUPTION_6', true]]], hand: ['CHAOS_6', 'CHAOS_5'] });
  res = play(res, 'CHAOS_6', 0, false);
  res = drive(res, req => {
    if (req.kind === 'option') return [0];
    if (req.kind === 'pickHand') return [u0('CHAOS_5')];
    return undefined;
  });
  const st = res.state;
  assert.ok(st.players[0].trash.includes(u0('CHAOS_5')));
  assert.deepEqual(stack(st, 2, 0), [u0('CORRUPTION_6')]);
});

test('CORRUPTION_6 上段: 終了時、このカードを削除すると覆っていたカードの中段が発動する (裁定)', () => {
  let res = pz(
    { protos: SET_B, lines: [[], [['CLARITY_2', true], ['CORRUPTION_6', true]], []], hand: ['CHAOS_6', 'CHAOS_5'] },
    { hand: ['FIRE_6', 'WATER_3'] }
  );
  res = drive(res, req => req.kind === 'yesNo' ? [] : undefined); // CLARITY_2 上段 (開始時の公開) は捨てない
  res = play(res, 'CHAOS_6', 0, false);
  res = drive(res, req => req.kind === 'option' ? [1] : undefined);
  const st = res.state;
  assert.ok(st.players[0].trash.includes(u0('CORRUPTION_6')));
  assert.deepEqual(stack(st, 1, 0), [u0('CLARITY_2')]);
  assert.deepEqual(st.players[0].hand, [u0('CHAOS_5')], '手札は捨てていない');
  assert.ok(res.log.some(l => l.includes('手札を公開') && l.includes('FIRE_6')), '覆われていた CLARITY_2 の中段が発動');
});
