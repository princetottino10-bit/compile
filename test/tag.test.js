'use strict';
/* タッグデュエル (2 対 2): 盤面は共有、手札・山札・捨て札は1人ずつ。手番を終えたら次に指す味方に替わる */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);
Engine.setAiLevel(1);

const ng = (seed) => Engine.newGame({ p0: ['DARKNESS', 'FIRE', 'WATER'], p1: ['DEATH', 'METAL', 'SPEED'], seed: seed || 7,
  tag: { p0: ['LIFE', 'LIGHT', 'GRAVITY'], p1: ['PLAGUE', 'PSYCHIC', 'SPIRIT'] } });

/* そのチームの 18 枚が、どこかにちょうど1回ずつある */
function assertCardsAccounted(st) {
  for (let p = 0; p < 2; p++) {
    const pl = st.players[p], b = st.tag.bench[p];
    const where = pl.hand.concat(pl.deck, pl.trash, b.hand, b.deck, b.trash);
    for (let l = 0; l < 3; l++) where.push(...st.lines[l][p]);
    where.push(...(st.commitStack || []).filter(u => st.cards[u].owner === p));
    const mine = Object.keys(st.cards).filter(u => st.cards[u].owner === p);
    assert.equal(new Set(where).size, where.length, 'P' + (p + 1) + ' の札が2か所にある');
    for (const u of mine) assert.ok(where.includes(u) || st.cards[u].zone === 'committed' || /^transit/.test(st.cards[u].zone), u + ' がどこにもない');
    for (const u of b.hand.concat(b.deck, b.trash)) assert.equal(st.cards[u].zone, 'bench' + p);
  }
}

test('タッグ: それぞれ自分の3つの 18 枚が山札。2人とも手札 5 枚から。ラインは複合プロトコル', () => {
  const st = ng().state;
  assert.ok(st.tag);
  assert.deepEqual(st.tag.pilot, [0, 0]);
  for (let p = 0; p < 2; p++) {
    assert.equal(st.players[p].hand.length, 5);
    assert.equal(st.players[p].deck.length, 13);
    assert.equal(st.tag.bench[p].hand.length, 5);
    assert.equal(st.tag.bench[p].deck.length, 13);
  }
  assert.deepEqual(st.players[0].protocols.map(p => p.name), ['DARKNESS+LIFE', 'FIRE+LIGHT', 'WATER+GRAVITY']);
  const benchProtos = new Set(st.tag.bench[0].hand.concat(st.tag.bench[0].deck).map(u => u.split(':')[1].split('_')[0]));
  assert.deepEqual([...benchProtos].sort(), ['GRAVITY', 'LIFE', 'LIGHT']);
  assertCardsAccounted(st);
});

test('タッグ: 複合プロトコルのラインには、どちらのプロトコルのカードも表で出せる', () => {
  const st = ng().state;
  const plays = Engine.legalActions(st).filter(a => a.type === 'play' && a.faceUp);
  /* 1人目の手札 (DARKNESS / FIRE / WATER) は、それぞれ自分のプロトコルが入ったラインに表で出せる */
  for (const a of plays) {
    const proto = a.card.split(':')[1].split('_')[0];
    assert.ok(st.players[0].protocols[a.line].names.includes(proto) || st.players[1].protocols[a.line].names.includes(proto), a.card + ' → ' + a.line);
  }
  assert.ok(plays.length > 0);
  assert.throws(() => Engine.newGame({ p0: ['DARKNESS', 'FIRE', 'WATER'], p1: ['DEATH', 'METAL', 'SPEED'], tag: { p0: ['FIRE', 'LIGHT', 'GRAVITY'], p1: ['PLAGUE', 'PSYCHIC', 'SPIRIT'] } }), /同じプロトコル/);
});

test('タッグ: 手番を終えたチームは次に指す味方に替わり、手札も替わる', () => {
  let res = ng();
  const first = res.state.turn;
  const benchHand = res.state.tag.bench[first].hand.slice();
  for (let i = 0; i < 40 && res.state.turn === first; i++) {
    const q = res.requests[0];
    const a = q ? { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) } : Engine.ai.action(res.state);
    res = Engine.apply(res.state, a);
    assert.equal(res.error, null);
  }
  assert.notEqual(res.state.turn, first);
  assert.equal(res.state.tag.pilot[first], 1);
  assert.deepEqual(res.state.players[first].hand.slice(0, benchHand.length).sort(), benchHand.slice().sort());
  assertCardsAccounted(res.state);
});

test('タッグ: CPU どうしで最後まで遊べて、札が消えたり増えたりしない', () => {
  for (const seed of [3, 11]) {
    let res = ng(seed);
    for (let i = 0; i < 2500 && res.state.winner === null; i++) {
      const q = res.requests[0];
      const a = q ? { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) } : Engine.ai.action(res.state);
      res = Engine.apply(res.state, a);
      assert.equal(res.error, null, 'seed ' + seed + ' step ' + i);
      if (!res.requests.length) assertCardsAccounted(res.state);
    }
    assert.notEqual(res.state.winner, null, 'seed ' + seed + ' で決着しない');
  }
});
