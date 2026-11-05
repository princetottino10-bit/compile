/* ストーリーの★2・★3 の条件を決めるための試算: 主人公を「つよい」と「かんたん+3割でたらめ」で指させ、勝った局の手番の中央と★3 の届く割合を出す。
     node scripts/story_stars_sim.mjs <場面の id> [試合数=60] */
import { createRequire } from 'node:module';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const S = await import('../js3d/story.js');
function playOne(node, seed, heroLv, blunder) {
  const E = require('../engine.js');
  const head = node.head !== undefined ? node.head : 3 - node.win;
  let res = E.newGame({ seed, p0: node.me, p1: node.opp, first: 0, winCompilesBySide: [3, node.win], startCompiled: [head, 0],
    ...(node.tag ? { tag: { p0: node.tag.mate, p1: node.tag.oppMate } } : {}) });
  for (let i = 0; i < 6000 && res.state.winner === null; i++) {
    const st = res.state, q = res.requests && res.requests[0];
    const side = q ? q.player : st.turn;
    const hero = side === 0 && (!st.tag || st.tag.pilot[0] === 0);
    E.setAiLevel(hero ? heroLv : node.level); E.setAiBlunder(hero ? blunder : 0);
    const act = q ? { type: 'choose', id: q.id, picks: E.ai.answer(st, q) } : E.ai.action(st);
    res = E.apply(st, act);
    if (res.error) throw new Error(res.error);
  }
  const st = res.state, t = st.tally || {};
  return { win: st.winner === 0, turns: (st.turns || 0) + 1, opp: (t.compiles && t.compiles[1]) | 0, ref: (t.refreshes && t.refreshes[0]) | 0 };
}
if (isMainThread) {
  const [id, games] = [process.argv[2], +process.argv[3] || 60];
  const run = (lv, bl) => Promise.all([0,1,2,3].map(w => new Promise((ok, ng) => {
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { id, lv, bl, seeds: Array.from({ length: games / 4 }, (_, i) => 1000 + w * 1000 + i) } });
    wk.on('message', ok); wk.on('error', ng);
  }))).then(a => a.flat());
  const sum = (r, name) => {
    const w = r.filter(x => x.win), t = w.map(x => x.turns).sort((a, b) => a - b);
    const pct = f => Math.round(100 * w.filter(f).length / Math.max(1, w.length));
    return `${name}: win ${w.length}/${r.length} medTurns ${t[t.length >> 1]} (own ${Math.ceil(t[t.length >> 1] / 2)}) opp0 ${pct(x => x.opp === 0)}% opp<=1 ${pct(x => x.opp <= 1)}% noRef ${pct(x => x.ref === 0)}%`;
  };
  const a = await run(2, 0), b = await run(0, 0.3);
  console.log(id, '|', sum(a, 'つよい'), '|', sum(b, 'かんたん'));
} else {
  const fs = await import('node:fs'); const path = await import('node:path');
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const { buildRunDefs } = await import('../js3d/runcards.js');
  const { buildMobDefs } = await import('../js3d/mobcards.js');
  const E = require('../engine.js');
  const cards = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'cards.json'), 'utf8'));
  const effects = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'effects.json'), 'utf8'));
  E.init(cards, effects, buildRunDefs(cards, effects).engine.concat(buildMobDefs().engine));
  E.setTrace(false);
  const node = S.CHAPTERS.flatMap(c => c.nodes).find(n => n.id === workerData.id);
  parentPort.postMessage(workerData.seeds.map(s => playOne(node, s, workerData.lv, workerData.bl)));
}
