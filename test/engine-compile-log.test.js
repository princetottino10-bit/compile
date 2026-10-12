/* エンジンの集計: コンパイルの順番 (tally.compileLog)。決着の画面の「コンパイルの順番」に使う。
   前は盤面を比べて作っていて、コントロールの並べ替えで同じプロトコルを何度も数え、リコンパイルも拾えなかった */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');
const root = path.join(__dirname, '..');
E.init(JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'data/effects.json'), 'utf8')));

const DECKS = [
  [['FIRE', 'WATER', 'SPEED'], ['DARKNESS', 'HATE', 'PSYCHIC']],
  [['LIFE', 'GRAVITY', 'METAL'], ['LIGHT', 'DEATH', 'SPIRIT']],
  [['PLAGUE', 'LOVE', 'APATHY'], ['FIRE', 'GRAVITY', 'DARKNESS']]
];

function playOut(seed, p0, p1) {
  E.setTrace(false);
  E.setAiLevel(0);
  let res = E.newGame({ seed, p0, p1, first: seed % 2 });
  for (let k = 0; k < 600 && res.winner === null; k++) {
    const a = res.requests.length ? { type: 'choose', id: res.requests[0].id, picks: E.ai.answer(res.state, res.requests[0]) } : E.ai.action(res.state);
    if (!a) break;
    res = E.apply(res.state, a);
    assert.equal(res.error, null);
  }
  return res.state;
}

test('コンパイルの記録は回数と合い、初めての分はコンパイル済みのプロトコルと一致し、2回目からはリコンパイルの印が付く', () => {
  let sawRecompile = false;
  for (let seed = 1; seed <= 12; seed++) {
    const [p0, p1] = DECKS[seed % DECKS.length];
    const st = playOut(seed, p0, p1);
    const log = (st.tally && st.tally.compileLog) || [];
    for (let side = 0; side < 2; side++) {
      const mine = log.filter(e => e.p === side);
      assert.equal(mine.length, st.tally.compiles[side], 'seed ' + seed + ' の P' + (side + 1) + ' の回数');
      const firsts = mine.filter(e => !e.r).map(e => e.n).sort();
      const compiled = st.players[side].protocols.filter(p => p.compiled).map(p => p.name).sort();
      assert.deepEqual(firsts, compiled, 'seed ' + seed + ' の P' + (side + 1) + ' の初めてのコンパイル');
      /* リコンパイルは、そのプロトコルを先にコンパイルしてから */
      mine.forEach((e, i) => {
        if (!e.r) return;
        sawRecompile = true;
        assert.ok(mine.slice(0, i).some(x => x.n === e.n && !x.r), 'seed ' + seed + ' の ' + e.n + ' のリコンパイル');
      });
    }
    /* 手番の数は増えるだけ */
    for (let i = 1; i < log.length; i++) assert.ok(log[i].t >= log[i - 1].t);
  }
  assert.ok(sawRecompile, 'リコンパイルが1回は起きる組み合わせで確かめる');
});
