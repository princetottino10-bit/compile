/* エンジンの集計: 自分の効果で割り込んでつないだ一番長いチェーン (tally.chains) を、演出の記録を取らないときも数える */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../engine.js');
const root = path.join(__dirname, '..');
E.init(JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'data/effects.json'), 'utf8')));

const INIT = { seed: 3, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'HATE', 'PSYCHIC'], first: 0, winCompiles: 3 };

/* CPU 同士で1戦して、手順を残す (記録なし) */
function playOnce() {
  E.setTrace(false);
  E.setAiLevel(1);
  let res = E.newGame({ ...INIT });
  const actions = [];
  for (let k = 0; k < 400 && res.winner === null; k++) {
    const a = res.requests.length ? { type: 'choose', id: res.requests[0].id, picks: E.ai.answer(res.state, res.requests[0]) } : E.ai.action(res.state);
    if (!a) break;
    res = E.apply(res.state, a);
    assert.equal(res.error, null);
    actions.push(a);
  }
  return { chains: res.state.tally.chains, actions };
}

/* 同じ手順を、演出の記録を取りながらなぞる */
function replay(actions) {
  E.setTrace(true);
  let res = E.newGame({ ...INIT });
  for (const a of actions) res = E.apply(res.state, a);
  E.setTrace(false);
  return res.state.tally.chains;
}

test('チェーンの長さは記録の有無で変わらず、2以上の割り込みが数えられる', () => {
  const { chains, actions } = playOnce();
  assert.deepEqual(replay(actions), chains);
  assert.ok(Math.max(...chains) >= 2, JSON.stringify(chains));
});
