'use strict';
/* カード効果の検証 (DARKNESS / DEATH / FIRE / GRAVITY / LIFE / LIGHT) — node --test test/cards-a.test.js
   各カードのテキストが約束する結果を、Engine.newPuzzle で組んだ盤面から確かめる。
   カードIDは値+1 (例: FIRE_1 = Fire 0)。 */
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

/* 盤面を組む。s0/s1: { lines: [[[defId, faceUp],...] x3], hand, trash, deck, compiled } */
function setup(protos0, protos1, s0, s1) {
  const res = Engine.newPuzzle({
    sides: [Object.assign({ protos: protos0 }, s0 || {}), Object.assign({ protos: protos1 }, s1 || {})]
  }, { seed: 1 });
  assert.equal(res.error, null);
  return res;
}

/* requests に answerer で答えながら完了まで進める。answerer が undefined を返したら失敗 */
function drive(res, answerer, maxSteps) {
  let n = 0;
  while (res.requests && res.requests.length) {
    if (++n > (maxSteps || 50)) throw new Error('drive: 選択要求が収束しない: ' + JSON.stringify(res.requests[0]));
    const req = res.requests[0];
    const picks = answerer ? answerer(req, res) : undefined;
    if (picks === undefined) throw new Error('想定外の選択要求: ' + JSON.stringify(req));
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks });
    assert.equal(res.error, null, 'choose エラー: ' + res.error);
  }
  return res;
}

function play(res, defId, line, faceUp, answerer) {
  const r = Engine.apply(res.state, { type: 'play', card: u0(defId), line, faceUp: faceUp !== false });
  assert.equal(r.error, null, 'play エラー: ' + r.error);
  return drive(r, answerer);
}

const zoneOf = (st, uid) => st.cards[uid].zone;
const faceUp = (st, uid) => st.cards[uid].faceUp;
const noReq = () => undefined;

/* 「あなたは手札を1枚捨て札にする。」 (値5 の札たち) */
function discardOneTest(defId, proto) {
  test(defId + ': 手札を1枚捨て札にする', () => {
    const res = setup([proto, 'WATER', 'SPIRIT'], ['METAL', 'SPEED', 'PLAGUE'], {
      hand: [defId, 'WATER_2', 'WATER_3']
    });
    const fin = play(res, defId, 0, true, (req) => {
      if (req.kind === 'pickHand' && req.prompt === 'discard') {
        assert.equal(req.player, 0);
        return [u0('WATER_3')];
      }
    }).state;
    assert.deepEqual(fin.players[0].hand, [u0('WATER_2')]);
    assert.deepEqual(fin.players[0].trash, [u0('WATER_3')]);
    assert.equal(zoneOf(fin, u0(defId)), 'field');
  });
}

/* ================= DARKNESS ================= */

test('DARKNESS_1: 3枚引き、相手の覆われているカードを1枚移動させる', () => {
  const res = setup(['DARKNESS', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['DARKNESS_1']
  }, {
    lines: [[['LIFE_6', false], ['LIFE_5', false]], [], []]
  });
  const fin = play(res, 'DARKNESS_1', 0, true, (req) => {
    if (req.kind === 'pickLine') { assert.deepEqual(req.lines, [1, 2]); return [2]; }
  }).state;
  assert.equal(fin.players[0].hand.length, 3);
  assert.deepEqual(fin.lines[2][1], [u1('LIFE_6')], '覆われていたカードが移動');
  assert.deepEqual(fin.lines[0][1], [u1('LIFE_5')]);
});

test('DARKNESS_2: 相手のカードを1枚反転させ、そのカードを移動させることができる', () => {
  const res = setup(['DARKNESS', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['DARKNESS_2']
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = play(res, 'DARKNESS_2', 0, true, (req) => {
    if (req.kind === 'yesNo') return ['yes'];
    if (req.kind === 'pickLine') return [2];
    if (req.kind === 'pickCard') return [u1('LIFE_6')];
  }).state;
  assert.equal(faceUp(fin, u1('LIFE_6')), false, '反転された');
  assert.deepEqual(fin.lines[2][1], [u1('LIFE_6')], '移動した');
  assert.deepEqual(fin.lines[1][1], []);
});

test('DARKNESS_2: 移動は任意 (断れば反転のみ)', () => {
  const res = setup(['DARKNESS', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['DARKNESS_2']
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = play(res, 'DARKNESS_2', 0, true, (req) => {
    if (req.kind === 'yesNo') return [];
    if (req.kind === 'pickCard' && req.min === 0) return [];
    if (req.kind === 'pickCard') return [u1('LIFE_6')];
  }).state;
  assert.equal(faceUp(fin, u1('LIFE_6')), false);
  assert.deepEqual(fin.lines[1][1], [u1('LIFE_6')]);
});

test('DARKNESS_2: 自分のカードは反転対象にならない', () => {
  const res = setup(['DARKNESS', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['DARKNESS_2'],
    lines: [[], [['FIRE_6', true]], []]
  });
  const fin = play(res, 'DARKNESS_2', 0, true, noReq).state;
  assert.equal(faceUp(fin, u0('FIRE_6')), true);
  assert.equal(faceUp(fin, u0('DARKNESS_2')), true);
});

test('DARKNESS_3 上段: このスタックの裏向きカードの値はそれぞれ4', () => {
  const res = setup(['DARKNESS', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DEATH'], {
    lines: [[['FIRE_2', false], ['DARKNESS_3', true]], [['FIRE_3', false]], []]  // 合計10だと開始時にコンパイルされるので2枚
  });
  const st = res.state;
  assert.equal(Engine.lineTotal(st, 0, 0), 4 + 2);
  assert.equal(Engine.lineTotal(st, 1, 0), 2, '他のスタックの裏向きは2のまま');
});

test('DARKNESS_3 中段: このラインの覆われているカードを1枚反転できる (覆われた札の中段は発動しない)', () => {
  const res = setup(['DARKNESS', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['DARKNESS_3', 'WATER_2'],
    lines: [[['FIRE_6', false]], [], []]
  });
  const fin = play(res, 'DARKNESS_3', 0, true, (req) => {
    if (req.kind === 'pickCard') { assert.deepEqual(req.candidates, [u0('FIRE_6')]); return [u0('FIRE_6')]; }
  }).state;
  assert.equal(faceUp(fin, u0('FIRE_6')), true, '覆われた FIRE_6 が表になる');
  assert.deepEqual(fin.players[0].hand, [u0('WATER_2')], '覆われているので FIRE_6 の捨て札は起きない');
});

test('DARKNESS_3 中段: 反転は任意', () => {
  const res = setup(['DARKNESS', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['DARKNESS_3'],
    lines: [[['FIRE_6', false]], [], []]
  });
  const fin = play(res, 'DARKNESS_3', 0, true, (req) => (req.kind === 'pickCard' ? [] : undefined)).state;
  assert.equal(faceUp(fin, u0('FIRE_6')), false);
});

test('DARKNESS_4: 他の1ラインに手札を裏向きで1枚プレイする', () => {
  const res = setup(['DARKNESS', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['DARKNESS_4', 'FIRE_6']
  });
  const fin = play(res, 'DARKNESS_4', 0, true, (req) => {
    if (req.kind === 'pickHand') return [u0('FIRE_6')];
    if (req.kind === 'pickLine') { assert.ok(!req.lines.includes(0), '同じラインは選べない'); return [2]; }
  }).state;
  assert.deepEqual(fin.lines[2][0], [u0('FIRE_6')]);
  assert.equal(faceUp(fin, u0('FIRE_6')), false);
  assert.equal(fin.players[0].hand.length, 0);
});

test('DARKNESS_5: 裏向きのカードを1枚移動させる', () => {
  const res = setup(['DARKNESS', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['DARKNESS_5']
  }, {
    lines: [[['LIFE_6', false]], [['LIFE_5', true]], []]
  });
  const fin = play(res, 'DARKNESS_5', 0, true, (req) => {
    if (req.kind === 'pickLine') return [2];
  }).state;
  assert.deepEqual(fin.lines[2][1], [u1('LIFE_6')]);
  assert.deepEqual(fin.lines[1][1], [u1('LIFE_5')], '表向きは対象外');
});

discardOneTest('DARKNESS_6', 'DARKNESS');

/* ================= DEATH ================= */

test('DEATH_1: 他の各ラインにあるカードを1枚ずつ削除する (このラインは対象外)', () => {
  const res = setup(['DEATH', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['DEATH_1']
  }, {
    lines: [[['LIFE_6', true]], [['LIGHT_6', true]], [['DARKNESS_6', false]]]
  });
  const fin = play(res, 'DEATH_1', 0, true, (req) => {
    if (req.kind === 'pickLine') return [req.lines[0]];
    if (req.kind === 'pickCard') {
      assert.ok(!req.candidates.includes(u1('LIFE_6')), 'このラインのカードは候補にならない');
      return [req.candidates[0]];
    }
  }).state;
  assert.equal(zoneOf(fin, u1('LIGHT_6')), 'trash1');
  assert.equal(zoneOf(fin, u1('DARKNESS_6')), 'trash1');
  assert.equal(zoneOf(fin, u1('LIFE_6')), 'field');
  assert.equal(zoneOf(fin, u0('DEATH_1')), 'field');
});

test('DEATH_2 開始: 1枚引くことを選ぶと、他のカード1枚とこのカードを削除する', () => {
  const res = setup(['DEATH', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    lines: [[['DEATH_2', true]], [], []],
    hand: ['FIRE_6']
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = drive(res, (req) => {
    if (req.kind === 'yesNo' && req.prompt === 'optional-draw') return ['yes'];
    if (req.kind === 'pickCard') return [u1('LIFE_6')];
  }).state;
  assert.equal(fin.players[0].hand.length, 2, '1枚引いた');
  assert.equal(zoneOf(fin, u1('LIFE_6')), 'trash1', '他のカードを削除');
  assert.equal(zoneOf(fin, u0('DEATH_2')), 'trash0', 'このカードを削除');
});

test('DEATH_2 開始: 引かなければ何も削除しない', () => {
  const res = setup(['DEATH', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    lines: [[['DEATH_2', true]], [], []],
    hand: ['FIRE_6']
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = drive(res, (req) => (req.kind === 'yesNo' ? [] : undefined)).state;
  assert.equal(fin.players[0].hand.length, 1);
  assert.equal(zoneOf(fin, u1('LIFE_6')), 'field');
  assert.equal(zoneOf(fin, u0('DEATH_2')), 'field');
});

test('DEATH_3: 選んだラインの値1か2のカードを覆われていても裏向きでもすべて削除', () => {
  const res = setup(['DEATH', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['DEATH_3'],
    lines: [[], [['FIRE_2', true], ['FIRE_6', true]], []]
  }, {
    lines: [[], [['LIFE_3', true], ['LIFE_6', false]], [['LIGHT_2', true]]]
  });
  const fin = play(res, 'DEATH_3', 0, true, (req) => (req.kind === 'pickLine' ? [1] : undefined)).state;
  assert.equal(zoneOf(fin, u0('FIRE_2')), 'trash0', '覆われた値1');
  assert.equal(zoneOf(fin, u0('FIRE_6')), 'field', '値5は残る');
  assert.equal(zoneOf(fin, u1('LIFE_3')), 'trash1', '値2');
  assert.equal(zoneOf(fin, u1('LIFE_6')), 'trash1', '裏向き(値2)');
  assert.equal(zoneOf(fin, u1('LIGHT_2')), 'field', '選ばなかったライン');
  assert.equal(zoneOf(fin, u0('DEATH_3')), 'field');
});

test('DEATH_4: 裏向きのカードを1枚削除する', () => {
  const res = setup(['DEATH', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['DEATH_4']
  }, {
    lines: [[], [['LIFE_5', true]], [['LIFE_6', false]]]
  });
  const fin = play(res, 'DEATH_4', 0, true, noReq).state;
  assert.equal(zoneOf(fin, u1('LIFE_6')), 'trash1');
  assert.equal(zoneOf(fin, u1('LIFE_5')), 'field');
});

test('DEATH_5: 値が0か1のカードを1枚削除する', () => {
  const res = setup(['DEATH', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['DEATH_5']
  }, {
    lines: [[['LIGHT_6', true]], [['LIGHT_1', true]], [['LIFE_6', false]]]
  });
  const fin = play(res, 'DEATH_5', 0, true, noReq).state;
  assert.equal(zoneOf(fin, u1('LIGHT_1')), 'trash1');
  assert.equal(zoneOf(fin, u1('LIGHT_6')), 'field');
  assert.equal(zoneOf(fin, u1('LIFE_6')), 'field', '裏向き(値2)は対象外');
});

discardOneTest('DEATH_6', 'DEATH');

/* ================= FIRE ================= */

test('FIRE_1 中段: 他のカードを1枚反転させ、2枚引く', () => {
  const res = setup(['FIRE', 'DEATH', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['FIRE_1']
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = play(res, 'FIRE_1', 0, true, noReq).state;
  assert.equal(faceUp(fin, u1('LIFE_6')), false);
  assert.equal(faceUp(fin, u0('FIRE_1')), true, '自身は対象外');
  assert.equal(fin.players[0].hand.length, 2);
});

test('FIRE_1 下段: 覆われることになったとき、先に1枚引き他のカードを1枚反転', () => {
  const res = setup(['FIRE', 'DEATH', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['WATER_2'],
    lines: [[['FIRE_1', true]], [], []]
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = play(res, 'WATER_2', 0, false, noReq).state;
  assert.deepEqual(fin.lines[0][0], [u0('FIRE_1'), u0('WATER_2')]);
  assert.equal(fin.players[0].hand.length, 1, '1枚引いた');
  assert.equal(faceUp(fin, u1('LIFE_6')), false, '他のカードを反転');
  assert.equal(faceUp(fin, u0('FIRE_1')), true);
});

test('FIRE_2: 手札を1枚捨てたら、カードを1枚削除する', () => {
  const res = setup(['FIRE', 'DEATH', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['FIRE_2', 'WATER_2']
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = play(res, 'FIRE_2', 0, true, (req) => (req.kind === 'pickCard' ? [u1('LIFE_6')] : undefined)).state;
  assert.deepEqual(fin.players[0].trash, [u0('WATER_2')]);
  assert.equal(zoneOf(fin, u1('LIFE_6')), 'trash1');
});

test('FIRE_2: 手札が無ければ削除しない', () => {
  const res = setup(['FIRE', 'DEATH', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['FIRE_2']
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = play(res, 'FIRE_2', 0, true, noReq).state;
  assert.equal(zoneOf(fin, u1('LIFE_6')), 'field');
});

test('FIRE_3: 手札を1枚捨てたら、カードを1枚戻す (持ち主の手札へ)', () => {
  const res = setup(['FIRE', 'DEATH', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['FIRE_3', 'WATER_2']
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = play(res, 'FIRE_3', 0, true, (req) => (req.kind === 'pickCard' ? [u1('LIFE_6')] : undefined)).state;
  assert.deepEqual(fin.players[0].trash, [u0('WATER_2')]);
  assert.ok(fin.players[1].hand.includes(u1('LIFE_6')), '相手の手札に戻る');
  assert.deepEqual(fin.lines[1][1], []);
});

test('FIRE_3: 手札が無ければ戻さない', () => {
  const res = setup(['FIRE', 'DEATH', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['FIRE_3']
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = play(res, 'FIRE_3', 0, true, noReq).state;
  assert.equal(zoneOf(fin, u1('LIFE_6')), 'field');
});

test('FIRE_4 終了: 手札を1枚捨てることができ、そうしたらカードを1枚反転', () => {
  const res = setup(['FIRE', 'DEATH', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['WATER_2', 'WATER_3'],
    lines: [[['FIRE_4', true]], [], []]
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = play(res, 'WATER_2', 2, false, (req) => {
    if (req.kind === 'yesNo' && req.prompt === 'optional-discard') return ['yes'];
    if (req.kind === 'pickCard') return [u1('LIFE_6')];
  }).state;
  assert.deepEqual(fin.players[0].trash, [u0('WATER_3')]);
  assert.equal(faceUp(fin, u1('LIFE_6')), false);
});

test('FIRE_4 終了: 捨てなければ反転しない', () => {
  const res = setup(['FIRE', 'DEATH', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['WATER_2', 'WATER_3'],
    lines: [[['FIRE_4', true]], [], []]
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = play(res, 'WATER_2', 2, false, (req) => (req.kind === 'yesNo' ? [] : undefined)).state;
  assert.deepEqual(fin.players[0].hand, [u0('WATER_3')]);
  assert.equal(faceUp(fin, u1('LIFE_6')), true);
});

test('FIRE_4 終了: 覆われていれば発動しない (下段)', () => {
  const res = setup(['FIRE', 'DEATH', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['WATER_2', 'WATER_3'],
    lines: [[['FIRE_4', true], ['WATER_6', false]], [], []]
  });
  const fin = play(res, 'WATER_2', 2, false, noReq).state;
  assert.deepEqual(fin.players[0].hand, [u0('WATER_3')]);
});

test('FIRE_5: 1枚以上捨て、捨てた枚数+1枚引く', () => {
  const res = setup(['FIRE', 'DEATH', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['FIRE_5', 'WATER_2', 'WATER_3', 'WATER_4']
  });
  const fin = play(res, 'FIRE_5', 0, true, (req) => {
    if (req.kind === 'pickHand' && req.prompt === 'discard') {
      assert.equal(req.min, 1);
      return [u0('WATER_2'), u0('WATER_3')];
    }
  }).state;
  assert.equal(fin.players[0].trash.length, 2);
  assert.equal(fin.players[0].hand.length, 1 + 3, '残り1枚 + 3枚引く');
});

test('FIRE_5: 手札が無くても1枚引く (文ごとに解決)', () => {
  const res = setup(['FIRE', 'DEATH', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    hand: ['FIRE_5']
  });
  const fin = play(res, 'FIRE_5', 0, true, noReq).state;
  assert.equal(fin.players[0].hand.length, 1);
});

discardOneTest('FIRE_6', 'FIRE');

/* ================= GRAVITY ================= */

test('GRAVITY_1: ライン内のカード2枚ごとに、デッキトップをこのカードの下に裏向きでプレイ', () => {
  const res = setup(['GRAVITY', 'DARKNESS', 'FIRE'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['GRAVITY_1'],
    lines: [[['DARKNESS_6', false]], [], []],
    deck: ['GRAVITY_2', 'GRAVITY_3', 'GRAVITY_4']
  }, {
    lines: [[['LIFE_6', false], ['LIFE_5', false]], [], []]
  });
  /* ライン内: DARKNESS_6 + LIFE_6 + LIFE_5 + GRAVITY_1 = 4枚 → 2回 */
  const fin = play(res, 'GRAVITY_1', 0, true, noReq).state;
  const stack = fin.lines[0][0];
  assert.equal(stack.length, 4);
  assert.equal(stack[0], u0('DARKNESS_6'));
  assert.equal(stack[3], u0('GRAVITY_1'), 'GRAVITY_1 が一番上');
  assert.deepEqual(stack.slice(1, 3).sort(), [u0('GRAVITY_2'), u0('GRAVITY_3')]);
  assert.equal(faceUp(fin, u0('GRAVITY_2')), false);
  assert.equal(faceUp(fin, u0('GRAVITY_3')), false);
  assert.equal(zoneOf(fin, u0('GRAVITY_4')), 'deck0');
});

test('GRAVITY_1: ライン内が1枚 (自身のみ) ならプレイしない', () => {
  const res = setup(['GRAVITY', 'DARKNESS', 'FIRE'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['GRAVITY_1'],
    deck: ['GRAVITY_2']
  });
  const fin = play(res, 'GRAVITY_1', 0, true, noReq).state;
  assert.deepEqual(fin.lines[0][0], [u0('GRAVITY_1')]);
});

test('GRAVITY_2: 2枚引き、他ラインのカードをこのラインへ移動', () => {
  const res = setup(['GRAVITY', 'DARKNESS', 'FIRE'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['GRAVITY_2']
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = play(res, 'GRAVITY_2', 0, true, (req) => {
    if (req.kind === 'pickCard') return [u1('LIFE_6')];
    if (req.kind === 'pickLine') { assert.deepEqual(req.lines, [0], '他ラインからはこのラインへのみ'); return [0]; }
  }).state;
  assert.equal(fin.players[0].hand.length, 2);
  assert.deepEqual(fin.lines[0][1], [u1('LIFE_6')]);
});

test('GRAVITY_2: このラインから他ラインへ移動もできる', () => {
  const res = setup(['GRAVITY', 'DARKNESS', 'FIRE'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['GRAVITY_2']
  }, {
    lines: [[['LIFE_6', true]], [['LIFE_5', true]], []]
  });
  const fin = play(res, 'GRAVITY_2', 0, true, (req) => {
    if (req.kind === 'pickCard') return [u1('LIFE_6')];
    if (req.kind === 'pickLine') return [2];
  }).state;
  assert.deepEqual(fin.lines[2][1], [u1('LIFE_6')]);
});

test('GRAVITY_3: カードを1枚反転させ、そのカードをこのラインへ移動', () => {
  const res = setup(['GRAVITY', 'DARKNESS', 'FIRE'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['GRAVITY_3']
  }, {
    lines: [[], [], [['LIFE_6', true]]]
  });
  const fin = play(res, 'GRAVITY_3', 0, true, (req) => (req.kind === 'pickCard' ? [u1('LIFE_6')] : undefined)).state;
  assert.equal(faceUp(fin, u1('LIFE_6')), false);
  assert.deepEqual(fin.lines[0][1], [u1('LIFE_6')]);
  assert.deepEqual(fin.lines[2][1], []);
});

test('GRAVITY_4: 裏向きのカードを1枚このラインへ移動', () => {
  const res = setup(['GRAVITY', 'DARKNESS', 'FIRE'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['GRAVITY_4']
  }, {
    lines: [[], [['LIFE_5', true]], [['LIFE_6', false]]]
  });
  const fin = play(res, 'GRAVITY_4', 0, true, noReq).state;
  assert.deepEqual(fin.lines[0][1], [u1('LIFE_6')]);
  assert.deepEqual(fin.lines[1][1], [u1('LIFE_5')]);
});

discardOneTest('GRAVITY_5', 'GRAVITY');

test('GRAVITY_6: 相手は自分のデッキトップをこのラインに裏向きでプレイする', () => {
  const res = setup(['GRAVITY', 'DARKNESS', 'FIRE'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['GRAVITY_6']
  }, {
    deck: ['LIFE_2', 'LIFE_3']
  });
  const deck1 = res.state.players[1].deck.length;
  const fin = play(res, 'GRAVITY_6', 0, true, noReq).state;
  assert.deepEqual(fin.lines[0][1], [u1('LIFE_2')]);
  assert.equal(faceUp(fin, u1('LIFE_2')), false);
  assert.equal(fin.players[1].deck.length, deck1 - 1);
});

/* ================= LIFE ================= */

test('LIFE_1 中段: 自分のカードがある各ラインにデッキトップを裏向きでプレイ / 上段: 終了時に覆われていれば自身を削除', () => {
  const res = setup(['LIFE', 'DARKNESS', 'FIRE'], ['LIGHT', 'GRAVITY', 'DEATH'], {
    hand: ['LIFE_1'],
    lines: [[], [['DARKNESS_6', false]], []],
    deck: ['LIFE_2', 'LIFE_3', 'LIFE_4']
  });
  /* ライン1 を先に処理し、LIFE_1 自身のライン0 は最後にする */
  const fin = play(res, 'LIFE_1', 0, true, (req) => (req.kind === 'pickLine' ? [req.lines.includes(1) ? 1 : req.lines[0]] : undefined)).state;
  assert.deepEqual(fin.lines[1][0], [u0('DARKNESS_6'), u0('LIFE_2')]);
  assert.equal(faceUp(fin, u0('LIFE_2')), false);
  assert.deepEqual(fin.lines[0][0], [u0('LIFE_3')], 'LIFE_1 は覆われたので終了時に削除');
  assert.equal(faceUp(fin, u0('LIFE_3')), false);
  assert.equal(zoneOf(fin, u0('LIFE_1')), 'trash0');
  assert.deepEqual(fin.lines[2][0], [], '自分のカードが無いラインにはプレイしない');
});

test('LIFE_1 中段: 処理中に自身が覆われたら、残りのラインへのプレイは止まる (Codex)', () => {
  const res = setup(['LIFE', 'DARKNESS', 'FIRE'], ['LIGHT', 'GRAVITY', 'DEATH'], {
    hand: ['LIFE_1'],
    lines: [[], [['DARKNESS_6', false]], []],
    deck: ['LIFE_2', 'LIFE_3', 'LIFE_4']
  });
  const fin = play(res, 'LIFE_1', 0, true, (req) => (req.kind === 'pickLine' ? [0] : undefined)).state;
  assert.deepEqual(fin.lines[1][0], [u0('DARKNESS_6')], 'ライン1 にはプレイされない');
});

test('LIFE_1 上段: 覆われていなければ終了時に削除されない', () => {
  const res = setup(['LIFE', 'DARKNESS', 'FIRE'], ['LIGHT', 'GRAVITY', 'DEATH'], {
    hand: ['FIRE_6'],
    lines: [[['LIFE_1', true]], [], []]
  });
  const fin = play(res, 'FIRE_6', 2, false, noReq).state;
  assert.equal(zoneOf(fin, u0('LIFE_1')), 'field');
});

test('LIFE_2: カード1枚を反転させる、を2回', () => {
  const res = setup(['LIFE', 'DARKNESS', 'FIRE'], ['LIGHT', 'GRAVITY', 'DEATH'], {
    hand: ['LIFE_2']
  }, {
    lines: [[], [['LIGHT_6', true]], [['LIGHT_5', true]]]
  });
  let n = 0;
  const fin = play(res, 'LIFE_2', 0, true, (req) => {
    if (req.kind === 'pickCard') return [n++ === 0 ? u1('LIGHT_6') : u1('LIGHT_5')];
  }).state;
  assert.equal(faceUp(fin, u1('LIGHT_6')), false);
  assert.equal(faceUp(fin, u1('LIGHT_5')), false);
});

test('LIFE_3: 1枚引き、裏向きのカードを1枚反転できる', () => {
  const res = setup(['LIFE', 'DARKNESS', 'FIRE'], ['LIGHT', 'GRAVITY', 'DEATH'], {
    hand: ['LIFE_3']
  }, {
    lines: [[], [['LIGHT_2', false]], []]
  });
  const fin = play(res, 'LIFE_3', 0, true, (req) => (req.kind === 'pickCard' ? [u1('LIGHT_2')] : undefined)).state;
  assert.equal(fin.players[0].hand.length, 1);
  assert.equal(faceUp(fin, u1('LIGHT_2')), true);
});

test('LIFE_3: 反転は任意', () => {
  const res = setup(['LIFE', 'DARKNESS', 'FIRE'], ['LIGHT', 'GRAVITY', 'DEATH'], {
    hand: ['LIFE_3']
  }, {
    lines: [[], [['LIGHT_2', false]], []]
  });
  const fin = play(res, 'LIFE_3', 0, true, (req) => (req.kind === 'pickCard' ? [] : undefined)).state;
  assert.equal(fin.players[0].hand.length, 1);
  assert.equal(faceUp(fin, u1('LIGHT_2')), false);
});

test('LIFE_4 下段: 覆われることになったとき、先にデッキトップを他の1ラインに裏向きでプレイ', () => {
  const res = setup(['LIFE', 'DARKNESS', 'FIRE'], ['LIGHT', 'GRAVITY', 'DEATH'], {
    hand: ['LIFE_6'],
    lines: [[['LIFE_4', true]], [], []],
    deck: ['LIFE_2', 'LIFE_3']
  });
  const fin = play(res, 'LIFE_6', 0, true, (req) => {
    if (req.kind === 'pickLine') { assert.ok(!req.lines.includes(0)); return [2]; }
  }).state;
  assert.deepEqual(fin.lines[2][0], [u0('LIFE_2')]);
  assert.equal(faceUp(fin, u0('LIFE_2')), false);
  assert.deepEqual(fin.lines[0][0], [u0('LIFE_4'), u0('LIFE_6')]);
});

test('LIFE_5: 他のカードを覆っていれば1枚引く', () => {
  const res = setup(['LIFE', 'DARKNESS', 'FIRE'], ['LIGHT', 'GRAVITY', 'DEATH'], {
    hand: ['LIFE_5'],
    lines: [[['DARKNESS_6', false]], [], []]
  });
  const fin = play(res, 'LIFE_5', 0, true, noReq).state;
  assert.equal(fin.players[0].hand.length, 1);
});

test('LIFE_5: 何も覆っていなければ引かない', () => {
  const res = setup(['LIFE', 'DARKNESS', 'FIRE'], ['LIGHT', 'GRAVITY', 'DEATH'], {
    hand: ['LIFE_5']
  });
  const fin = play(res, 'LIFE_5', 0, true, noReq).state;
  assert.equal(fin.players[0].hand.length, 0);
});

discardOneTest('LIFE_6', 'LIFE');

/* ================= LIGHT ================= */

test('LIGHT_1: カードを1枚反転させ、反転後の値の枚数引く (表→裏で2枚)', () => {
  const res = setup(['LIGHT', 'DARKNESS', 'FIRE'], ['LIFE', 'GRAVITY', 'DEATH'], {
    hand: ['LIGHT_1']
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  const fin = play(res, 'LIGHT_1', 0, true, (req) => (req.kind === 'pickCard' ? [u1('LIFE_6')] : undefined)).state;
  assert.equal(faceUp(fin, u1('LIFE_6')), false);
  assert.equal(fin.players[0].hand.length, 2);
});

test('LIGHT_1: 裏→表なら表の値の枚数引く', () => {
  const res = setup(['LIGHT', 'DARKNESS', 'FIRE'], ['LIFE', 'GRAVITY', 'FIRE'], {
    hand: ['LIGHT_1']
  }, {
    lines: [[], [['FIRE_4', false]], []]
  });
  const fin = play(res, 'LIGHT_1', 0, true, (req) => (req.kind === 'pickCard' ? [u1('FIRE_4')] : undefined)).state;
  assert.equal(faceUp(fin, u1('FIRE_4')), true);
  assert.equal(fin.players[0].hand.length, 3);
});

test('LIGHT_2 終了: カードを1枚引く', () => {
  const res = setup(['LIGHT', 'DARKNESS', 'FIRE'], ['LIFE', 'GRAVITY', 'DEATH'], {
    hand: ['FIRE_6'],
    lines: [[['LIGHT_2', true]], [], []]
  });
  const fin = play(res, 'FIRE_6', 2, false, noReq).state;
  assert.equal(fin.players[0].hand.length, 1);
});

test('LIGHT_2 終了: 覆われていれば引かない (下段)', () => {
  const res = setup(['LIGHT', 'DARKNESS', 'FIRE'], ['LIFE', 'GRAVITY', 'DEATH'], {
    hand: ['FIRE_6'],
    lines: [[['LIGHT_2', true], ['DARKNESS_6', false]], [], []]
  });
  const fin = play(res, 'FIRE_6', 2, false, noReq).state;
  assert.equal(fin.players[0].hand.length, 0);
});

test('LIGHT_3: 2枚引き、裏向きカードを公開し、移動させることができる', () => {
  const res = setup(['LIGHT', 'DARKNESS', 'FIRE'], ['LIFE', 'GRAVITY', 'DEATH'], {
    hand: ['LIGHT_3']
  }, {
    lines: [[], [['LIFE_6', false]], []]
  });
  const fin = play(res, 'LIGHT_3', 0, true, (req) => {
    if (req.kind === 'option') return [req.options.findIndex(o => o.startsWith('shift'))];
    if (req.kind === 'pickLine') return [2];
  });
  assert.equal(fin.state.players[0].hand.length, 2);
  assert.deepEqual(fin.state.lines[2][1], [u1('LIFE_6')]);
  assert.equal(faceUp(fin.state, u1('LIFE_6')), false, '公開は向きを変えない');
  assert.ok(fin.log.some(x => x.includes('LIFE_6')), '公開でカード名が出る');
});

test('LIGHT_3: 公開したカードを反転させることもできる', () => {
  const res = setup(['LIGHT', 'DARKNESS', 'FIRE'], ['LIFE', 'GRAVITY', 'DEATH'], {
    hand: ['LIGHT_3']
  }, {
    lines: [[], [['LIFE_5', false]], []]
  });
  const fin = play(res, 'LIGHT_3', 0, true, (req) => {
    if (req.kind === 'option') return [req.options.findIndex(o => o.startsWith('flip'))];
  }).state;
  assert.equal(faceUp(fin, u1('LIFE_5')), true);
  assert.deepEqual(fin.lines[1][1], [u1('LIFE_5')]);
});

test('LIGHT_3: 移動も反転もしない選択ができる', () => {
  const res = setup(['LIGHT', 'DARKNESS', 'FIRE'], ['LIFE', 'GRAVITY', 'DEATH'], {
    hand: ['LIGHT_3']
  }, {
    lines: [[], [['LIFE_6', false]], []]
  });
  const fin = play(res, 'LIGHT_3', 0, true, (req) => (req.kind === 'option' ? [] : undefined)).state;
  assert.deepEqual(fin.lines[1][1], [u1('LIFE_6')]);
  assert.equal(faceUp(fin, u1('LIFE_6')), false);
});

test('LIGHT_4: このラインの裏向きカードすべて (覆われていても) を他の1ラインへ移動', () => {
  const res = setup(['LIGHT', 'DARKNESS', 'FIRE'], ['LIFE', 'GRAVITY', 'DEATH'], {
    hand: ['LIGHT_4'],
    lines: [[['DARKNESS_6', false]], [], []]
  }, {
    lines: [[['LIFE_6', false], ['LIFE_5', true]], [], []]
  });
  const fin = play(res, 'LIGHT_4', 0, true, (req) => (req.kind === 'pickLine' ? [2] : undefined)).state;
  assert.deepEqual(fin.lines[2][0], [u0('DARKNESS_6')]);
  assert.deepEqual(fin.lines[2][1], [u1('LIFE_6')]);
  assert.deepEqual(fin.lines[0][1], [u1('LIFE_5')], '表向きは残る');
  assert.deepEqual(fin.lines[0][0], [u0('LIGHT_4')]);
});

test('LIGHT_5: 相手は手札を公開する', () => {
  const res = setup(['LIGHT', 'DARKNESS', 'FIRE'], ['LIFE', 'GRAVITY', 'DEATH'], {
    hand: ['LIGHT_5']
  }, {
    hand: ['LIFE_2', 'DEATH_3']
  });
  const fin = play(res, 'LIGHT_5', 0, true, noReq);
  const line = fin.log.find(x => x.includes('手札を公開'));
  assert.ok(line, '公開のログ');
  assert.ok(line.includes('LIFE_2') && line.includes('DEATH_3'));
  assert.deepEqual(fin.state.players[1].hand, [u1('LIFE_2'), u1('DEATH_3')], '手札はそのまま');
});

discardOneTest('LIGHT_6', 'LIGHT');

/* ================= 追加の境界ケース (ルール/Codex 由来) ================= */

const ALL18 = (protos) => protos.flatMap(p => [1, 2, 3, 4, 5, 6].map(i => p + '_' + i));

test('DARKNESS_1: 自分の覆われているカードは移動対象にならない', () => {
  const res = setup(['DARKNESS', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DEATH'], {
    hand: ['DARKNESS_1'],
    lines: [[], [['FIRE_2', false], ['FIRE_3', false]], []]
  }, {
    lines: [[], [['LIFE_6', false], ['LIFE_5', false]], []]
  });
  const fin = play(res, 'DARKNESS_1', 0, true, (req) => {
    if (req.kind === 'pickCard') { assert.ok(!req.candidates.includes(u0('FIRE_2'))); return [u1('LIFE_6')]; }
    if (req.kind === 'pickLine') return [2];
  }).state;
  assert.deepEqual(fin.lines[1][0], [u0('FIRE_2'), u0('FIRE_3')]);
  assert.deepEqual(fin.lines[2][1], [u1('LIFE_6')]);
});

test('DARKNESS_3 上段: 覆われていても (表向きなら) このスタックの裏向きは値4', () => {
  const res = setup(['DARKNESS', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DEATH'], {
    lines: [[['FIRE_2', false], ['DARKNESS_3', true], ['WATER_2', false]], [], []]
  }, {
    /* 相手を上回らせて開始時のコンパイルを防ぐ */
    lines: [[['LIFE_6', true], ['LIFE_5', true], ['LIFE_4', true]], [], []]
  });
  assert.equal(Engine.lineTotal(res.state, 0, 0), 4 + 2 + 4);
});

test('DEATH_2 上段: 覆われていても開始時に発動する', () => {
  const res = setup(['DEATH', 'FIRE', 'WATER'], ['LIFE', 'LIGHT', 'DARKNESS'], {
    lines: [[['DEATH_2', true], ['WATER_2', false]], [], []],
    hand: ['FIRE_6']
  }, {
    lines: [[], [['LIFE_6', true]], []]
  });
  assert.ok(res.requests.length && res.requests[0].prompt === 'optional-draw', '開始時に引くか聞かれる');
  const fin = drive(res, (req) => {
    if (req.kind === 'yesNo') return ['yes'];
    if (req.kind === 'pickCard') return [u1('LIFE_6')];
  }).state;
  assert.equal(zoneOf(fin, u1('LIFE_6')), 'trash1');
  assert.equal(zoneOf(fin, u0('DEATH_2')), 'trash0', '覆われていても「このカード」は削除される');
});

test('GRAVITY_6: 相手のデッキが空ならプレイしない (シャッフルしない)', () => {
  const p1 = ['LIFE', 'LIGHT', 'DEATH'];
  const res = setup(['GRAVITY', 'DARKNESS', 'FIRE'], p1, {
    hand: ['GRAVITY_6']
  }, {
    trash: ALL18(p1)
  });
  const fin = play(res, 'GRAVITY_6', 0, true, noReq).state;
  assert.deepEqual(fin.lines[0][1], []);
  assert.equal(fin.players[1].trash.length, 18);
});

test('LIFE_1 中段: デッキが空ならプレイしない (シャッフルしない)', () => {
  const p0 = ['LIFE', 'DARKNESS', 'FIRE'];
  const res = setup(p0, ['LIGHT', 'GRAVITY', 'DEATH'], {
    hand: ['LIFE_1'],
    trash: ALL18(p0).filter(d => d !== 'LIFE_1')
  });
  const fin = play(res, 'LIFE_1', 0, true, noReq).state;
  assert.deepEqual(fin.lines[0][0], [u0('LIFE_1')]);
  assert.equal(fin.players[0].trash.length, 17);
});

test('LIGHT_1: 反転されそうになって自己削除した METAL_6 は捨て札での値6を引く (Codex)', () => {
  const res = setup(['LIGHT', 'DARKNESS', 'FIRE'], ['METAL', 'GRAVITY', 'DEATH'], {
    hand: ['LIGHT_1']
  }, {
    lines: [[], [['METAL_6', true]], []]
  });
  const fin = play(res, 'LIGHT_1', 0, true, (req) => {
    if (req.kind === 'pickCard') return [u1('METAL_6')];
    if (req.kind === 'pickHand' && req.prompt === 'clear-cache') return req.candidates.slice(0, req.min);
  });
  assert.equal(zoneOf(fin.state, u1('METAL_6')), 'trash1');
  /* 6枚引いて手札6 → キャッシュで1枚捨てて5 */
  assert.equal(fin.state.players[0].hand.length, 5);
  assert.equal(fin.state.players[0].trash.length, 1);
});

test('LIGHT_4: 同じスタックから動く裏向きカードは相対位置を保つ (Codex)', () => {
  const res = setup(['LIGHT', 'DARKNESS', 'FIRE'], ['LIFE', 'GRAVITY', 'DEATH'], {
    hand: ['LIGHT_4'],
    lines: [[['FIRE_2', false], ['DARKNESS_6', false]], [], []]
  });
  const fin = play(res, 'LIGHT_4', 0, true, (req) => {
    if (req.kind === 'pickLine') return [2];
    if (req.kind === 'pickCard') return undefined;
  }).state;
  assert.deepEqual(fin.lines[2][0], [u0('FIRE_2'), u0('DARKNESS_6')]);
  assert.deepEqual(fin.lines[0][0], [u0('LIGHT_4')]);
});

test('LIGHT_3: 覆われている裏向きカードは公開の対象にならない', () => {
  const res = setup(['LIGHT', 'DARKNESS', 'FIRE'], ['LIFE', 'GRAVITY', 'DEATH'], {
    hand: ['LIGHT_3']
  }, {
    lines: [[], [['LIFE_6', false], ['LIFE_5', true]], []]
  });
  const fin = play(res, 'LIGHT_3', 0, true, noReq).state;
  assert.equal(fin.players[0].hand.length, 2);
  assert.deepEqual(fin.lines[1][1], [u1('LIFE_6'), u1('LIFE_5')]);
});
