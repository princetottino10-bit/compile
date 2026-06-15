'use strict';
/* ランダム自動対戦のストール再現用デバッグスクリプト */
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);

const seed = +process.argv[2] || 11;
const rng = (function (a) { return function () { a = a * 1103515245 + 12345 & 0x7fffffff; return a / 0x7fffffff; }; })(seed);

let res = Engine.newGame({ p0: ['DARKNESS', 'FIRE', 'WATER'], p1: ['DEATH', 'METAL', 'SPEED'], seed });
let steps = 0;
let prev = null;
while (res.winner === null && steps < 600) {
  steps++;
  prev = res;
  if (res.requests.length) {
    const req = res.requests[0];
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks: ans(req) });
  } else {
    const acts = Engine.legalActions(res.state);
    if (!acts.length) { console.log('no legal actions, stop'); break; }
    const a = acts[Math.floor(rng() * acts.length)];
    res = Engine.apply(res.state, a);
  }
  if (res.error) {
    console.log('ERROR at step', steps, ':', res.error);
    dump(prev.state);
    console.log('--- last log of failing apply ---');
    console.log(res.log.slice(-40).join('\n'));
    process.exit(1);
  }
}
console.log('finished. steps=', steps, 'winner=', res.winner);

function ans(req) {
  switch (req.kind) {
    case 'pickCard': case 'pickHand': {
      const min = req.min !== undefined ? req.min : 1;
      const max = req.max !== undefined ? req.max : 1;
      const n = min + Math.floor(rng() * (Math.min(max, req.candidates.length) - min + 1));
      const pool = req.candidates.slice(); const picks = [];
      for (let i = 0; i < n; i++) picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      return picks;
    }
    case 'pickLine': return [req.lines[Math.floor(rng() * req.lines.length)]];
    case 'option': return req.optional && rng() < 0.3 ? [] : [Math.floor(rng() * req.options.length)];
    case 'yesNo': return rng() < 0.5 ? ['yes'] : [];
    case 'arrange': return req.exact === 'transposition' ? [1, 0, 2] : [1, 2, 0];
  }
}

function dump(st) {
  console.log('turn=P' + (st.turn + 1), 'phase=', st.phase, 'control=', st.control);
  for (let p = 0; p < 2; p++) {
    const pl = st.players[p];
    console.log(`P${p + 1}: deck=${pl.deck.length} hand=${pl.hand.length} trash=${pl.trash.length}`,
      'protocols=', pl.protocols.map(x => x.name + (x.compiled ? '*' : '')).join('/'),
      'cannotCompile=', pl.cannotCompile);
    console.log('  hand:', pl.hand.map(u => st.cards[u].def).join(','));
  }
  for (let l = 0; l < 3; l++) {
    for (let s = 0; s < 2; s++) {
      const stk = st.lines[l][s];
      if (stk.length) console.log(`line${l} P${s + 1}:`, stk.map(u => st.cards[u].def + (st.cards[u].faceUp ? '↑' : '↓')).join(' '),
        'total=', Engine.lineTotal(st, l, s));
    }
  }
  console.log('legalActions=', JSON.stringify(Engine.legalActions(st)).slice(0, 400));
}
