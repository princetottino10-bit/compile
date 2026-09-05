/* 可視性の不変条件スイープ (回帰テスト):
   node scripts/check_visibility.js   → 違反があれば exit 1

   (1) 手札のカードは、その手札の持ち主に knownTo が付いている
   (2) 自分側フィールドの裏向きカードは、その側のプレイヤーに knownTo が付いている
   (3) 表向きカードは両者に既知
   違反を「直前のログ行」つきで集計する */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, "..");
const E = require(path.join(ROOT, 'engine.js'));
const cards = JSON.parse(fs.readFileSync(path.join(ROOT,'data/cards.json'),'utf8'));
E.init(cards, JSON.parse(fs.readFileSync(path.join(ROOT,'data/effects.json'),'utf8')));
E.setAiLevel(1);
const PROTOS = cards.protocols.map(p=>p.name);
const viol = {};
let states = 0;

function check(st, lastLog) {
  states++;
  for (let p = 0; p < 2; p++) {
    for (const u of st.players[p].hand) {
      const c = st.cards[u];
      if (!((c.knownTo||0) & (1<<p))) hit('hand-not-known', st.cards[u].def, lastLog);
    }
  }
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) {
    for (const u of st.lines[l][s]) {
      const c = st.cards[u];
      if (c.faceUp && (c.knownTo||0) !== 3) hit('faceup-not-public', c.def, lastLog);
      if (!c.faceUp && !((c.knownTo||0) & (1<<s))) hit('facedown-own-side-hidden', c.def, lastLog);
    }
  }
}
function hit(kind, def, lastLog) {
  const key = kind + ' | ' + (lastLog||'').slice(0,60);
  viol[key] = (viol[key]||0) + 1;
}

for (let seed = 1; seed <= 150; seed++) {
  const rng = (() => { let a=(seed*2654435761)>>>0; return () => (a=(a*1664525+1013904223)>>>0)/2**32; })();
  const pool = PROTOS.slice(); const pick=()=>pool.splice(Math.floor(rng()*pool.length),1)[0];
  const p0=[pick(),pick(),pick()], p1=[pick(),pick(),pick()];
  let cur = E.newGame({ seed, p0, p1, first: seed&1 });
  let g = 0, last = '';
  while (cur.winner === null && g++ < 300) {
    if (cur.requests.length) {
      const r = cur.requests[0];
      cur = E.apply(cur.state, { type:'choose', id:r.id, picks:E.ai.answer(cur.state, r) });
    } else {
      const a = E.ai.action(cur.state); if (!a) break;
      cur = E.apply(cur.state, a);
    }
    if (cur.error) break;
    if (cur.log && cur.log.length) last = cur.log[cur.log.length-1];
    check(cur.state, last);
  }
}
console.log('states checked:', states);
const rows = Object.entries(viol).sort((a,b)=>b[1]-a[1]);
console.log('violations:', rows.reduce((a,[,n])=>a+n,0));
for (const [k,n] of rows.slice(0,25)) console.log(String(n).padStart(5), k);
process.exit(rows.length ? 1 : 0);
