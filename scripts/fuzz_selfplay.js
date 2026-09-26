/* バグ探し: CPU どうしで大量に対戦させ、おかしな状態を見つける。
     node scripts/fuzz_selfplay.js [試合数] [はじめの種]
   見るもの:
     - apply が例外を投げる / error を返す (AI が出した手・答えが通らない)
     - 決着しない (手数の上限)
     - カードが消える・増える (各プレイヤー 18 枚が、山札・手札・捨て札・ラインのどこか1か所にだけある)
     - カードの zone の記録と、実際に置かれている場所が食い違う
     - 選ぶ要求なのに候補が足りない (min より少ない)
   見つけた試合は scripts/fuzz_out/<種>.json に、再現用の手順と一緒に残す。
   AI は速い段 (0 と 1) だけを使う。プロトコルは 30 から毎試合ランダム */
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');
const cards = require('../data/cards.json');
E.init(cards, require('../data/effects.json'));
E.setTrace(false);

const N = Number(process.argv[2] || 200);
const SEED0 = Number(process.argv[3] || 1);
const MAX_STEPS = 4000;
const OUT = path.join(__dirname, 'fuzz_out');
const PROTOS = cards.protocols.map(p => p.name);

function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/* 状態の食い違いを探す。見つけたら文言を返す */
function check(st) {
  const where = new Map();
  const put = (uid, place) => {
    if (where.has(uid)) return `${uid} が ${where.get(uid)} と ${place} の両方にある`;
    where.set(uid, place);
    return null;
  };
  for (let p = 0; p < 2; p++) {
    const pl = st.players[p];
    for (const zone of ['deck', 'hand', 'trash']) {
      for (const uid of pl[zone]) {
        const e = put(uid, zone + p);
        if (e) return e;
        if (!st.cards[uid]) return `${uid} (${zone}${p}) の札の記録がない`;
      }
    }
  }
  for (let l = 0; l < 3; l++) {
    for (let s = 0; s < 2; s++) {
      for (const uid of st.lines[l][s]) {
        const e = put(uid, `line${l}.${s}`);
        if (e) return e;
        if (!st.cards[uid]) return `${uid} (line${l}.${s}) の札の記録がない`;
      }
    }
  }
  for (const uid of Object.keys(st.cards)) {
    if (!where.has(uid)) return `${uid} がどこにもない (zone=${st.cards[uid].zone})`;
  }
  if (where.size !== 36) return `札が全部で ${where.size} 枚 (36 のはず)`;
  /* 置き場の持ち主と、札の持ち主がそろっているか (渡すと持ち主ごと移る) */
  for (const [uid, place] of where) {
    const side = /\d$/.test(place) ? Number(place.slice(-1)) : null;
    if (side !== null && st.cards[uid].owner !== side) return `${uid} (持ち主 P${st.cards[uid].owner}) が ${place} にある`;
  }
  return null;
}

/* 決着したときの集計 (実績・デイリーミッションが読む st.tally) が盤面と合っているか */
function checkTally(st) {
  const t = st.tally;
  if (!t) return 'tally がない';
  for (let p = 0; p < 2; p++) {
    const done = st.players[p].protocols.filter(x => x.compiled).length;
    const c = (t.compiles && t.compiles[p]) | 0;
    if (c < done) return `P${p} のコンパイル回数 ${c} が、コンパイル済みのプロトコル ${done} より少ない`;
    if (!Array.isArray(t.faceUp && t.faceUp[p])) return `P${p} の faceUp がない`;
    for (const id of t.faceUp[p]) if (!/^[A-Z]+_[1-6]$/.test(id)) return `P${p} の faceUp に変な id: ${id}`;
    if (new Set(t.faceUp[p]).size !== t.faceUp[p].length) return `P${p} の faceUp に重複`;
    const ch = (t.chains && t.chains[p]) | 0;
    if (ch < 0 || ch > 40) return `P${p} のチェーン ${ch} がおかしい`;
    for (const [k, v] of Object.entries((t.effects && t.effects[p]) || {})) {
      if (!/^[A-Z]+_[1-6]$/.test(k) || !(v > 0)) return `P${p} の効果回数 ${k}=${v} がおかしい`;
    }
  }
  const w = st.winner;
  const wc = st.players[w].protocols.filter(x => x.compiled).length;
  if (wc < (st.winCompiles || 3) && !st.resigned) return `勝者 P${w} のコンパイル済みが ${wc} (決着の条件 ${st.winCompiles || 3} に届かない)`;
  return null;
}

function checkRequest(q) {
  if (!q) return null;
  const min = q.min !== undefined ? q.min : 1;
  if ((q.kind === 'pickCard' || q.kind === 'pickHand') && Array.isArray(q.candidates) && q.candidates.length < min) {
    return `選ぶ要求 (${q.kind}) の候補 ${q.candidates.length} が min ${min} より少ない: ${q.prompt || ''}`;
  }
  if (q.kind === 'pickLine' && Array.isArray(q.lines) && q.lines.length === 0) return `ラインを選ぶ要求なのに候補がない: ${q.prompt || ''}`;
  return null;
}

function play(seed) {
  const r = rng(seed);
  const pick3 = () => { const s = PROTOS.slice().sort(() => r() - 0.5); return s.slice(0, 3); };
  const init = { seed, p0: pick3(), p1: pick3(), first: seed % 2 };
  const levels = [Math.floor(r() * 2), Math.floor(r() * 2)];
  const moves = [];
  let res = E.newGame(init);
  for (let step = 0; step < MAX_STEPS; step++) {
    const st = res.state;
    if (st.winner !== null) {
      const t = checkTally(st);
      return t ? { init, levels, moves, problem: '集計: ' + t } : null;
    }
    const bad = check(st);
    if (bad) return { init, levels, moves, problem: '状態: ' + bad };
    const q = res.requests && res.requests[0];
    const rq = checkRequest(q);
    if (rq) return { init, levels, moves, problem: rq };
    const who = q ? q.player : st.turn;
    E.setAiLevel(levels[who]);
    let act;
    try {
      act = q ? { type: 'choose', id: q.id, picks: E.ai.answer(st, q) } : E.ai.action(st);
    } catch (e) {
      return { init, levels, moves, problem: 'AI が例外: ' + (e && e.stack || e) };
    }
    if (!act) return { init, levels, moves, problem: 'AI が手を返さない (要求: ' + (q ? q.kind + ' ' + (q.prompt || '') : 'なし') + ')' };
    moves.push(act);
    try {
      res = E.apply(st, act);
    } catch (e) {
      return { init, levels, moves, problem: 'apply が例外: ' + (e && e.stack || e) };
    }
    if (res.error) return { init, levels, moves, problem: 'apply が error: ' + res.error + ' / 手: ' + JSON.stringify(act) };
  }
  return { init, levels, moves, problem: `${MAX_STEPS} 手で決着しない` };
}

fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
const kinds = new Map();
for (let i = 0; i < N; i++) {
  const seed = SEED0 + i;
  const f = play(seed);
  if (!f) continue;
  bad++;
  const key = f.problem.split('\n')[0].replace(/\d+/g, '#').slice(0, 120);
  kinds.set(key, (kinds.get(key) || 0) + 1);
  fs.writeFileSync(path.join(OUT, seed + '.json'), JSON.stringify(f));
  console.log(`[${seed}] ${f.init.p0.join('/')} vs ${f.init.p1.join('/')} lv${f.levels.join(',')}: ${f.problem.split('\n').slice(0, 3).join(' | ')}`);
}
console.log(`\n${N} 試合中 ${bad} 件`);
for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(`  ${n}x ${k}`);
