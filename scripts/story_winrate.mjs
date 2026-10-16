/* ストーリーの対戦の勝ちやすさを試算する: 主人公を「かんたん」の CPU (level 0 + 3割でたらめ) にして、
   相手と味方の CPU は場面の level で指す (画面と同じ。タッグの味方も同じ強さ)。
     node scripts/story_winrate.mjs <場面の id> [試合数=40] [--opp A,B,C] [--oppmate A,B,C] [--head N] [--jobs 4]
   --opp / --oppmate: 相手 / 相手の相方のプロトコルを試しに替える (量産プロトコル MASS と元のデッキを比べるときなど)。--head N: はじめからコンパイル済みの数を試しに変える */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const S = await import('../js3d/story.js');
const { buildRunDefs } = await import('../js3d/runcards.js');
const { buildMobDefs } = await import('../js3d/mobcards.js');

function playOne(node, seed, headOverride) {
  const E = require('../engine.js');
  const head = headOverride !== null && headOverride !== undefined ? headOverride : node.head !== undefined ? node.head : 3 - node.win;
  let res = E.newGame({ seed, p0: node.me, p1: node.opp, first: 0, winCompilesBySide: [3, node.win], startCompiled: [head, 0],
    ...(node.tag ? { tag: { p0: node.tag.mate, p1: node.tag.oppMate } } : {}) });
  for (let i = 0; i < 6000 && res.state.winner === null; i++) {
    const st = res.state, q = res.requests && res.requests[0];
    const side = q ? q.player : st.turn;
    const hero = side === 0 && (!st.tag || st.tag.pilot[0] === 0);
    E.setAiLevel(hero ? 0 : node.level);
    E.setAiBlunder(hero ? 0.3 : 0);
    const act = q ? { type: 'choose', id: q.id, picks: E.ai.answer(st, q) } : E.ai.action(st);
    res = E.apply(st, act);
    if (res.error) throw new Error(res.error);
  }
  return res.state.winner;
}

if (isMainThread) {
  const args = process.argv.slice(2);
  const id = args[0];
  const games = Number(args[1]) > 0 ? Number(args[1]) : 40;
  const ji = args.indexOf('--jobs');
  const jobs = ji >= 0 ? Number(args[ji + 1]) : Math.max(1, os.cpus().length);
  const hi = args.indexOf('--head');
  const head = hi >= 0 ? Number(args[hi + 1]) : null;
  const node = S.CHAPTERS.flatMap(c => c.nodes).find(n => n.id === id && n.kind === 'battle');
  if (!node) { console.error('対戦の場面が無い: ' + id); process.exit(1); }
  const listArg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1].split(',') : null; };
  const opp = listArg('--opp'), oppMate = listArg('--oppmate');
  const seeds = Array.from({ length: games }, (_, i) => 1000 + i);
  const per = Array.from({ length: jobs }, (_, j) => seeds.filter((_, i) => i % jobs === j));
  const results = await Promise.all(per.filter(s => s.length).map(s => new Promise((ok, ng) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { id, seeds: s, head, opp, oppMate } });
    w.on('message', ok); w.on('error', ng);
  })));
  const all = results.flat();
  const wins = all.filter(w => w === 0).length;
  console.log(`${node.id} (${node.title}) level ${node.level} head ${head ?? node.head ?? 3 - node.win} 相手 ${(opp || node.opp).join('/')}${node.tag ? ' + ' + (oppMate || node.tag.oppMate).join('/') : ''}: 主人公 (かんたん) ${wins}/${all.length} 勝 (${(100 * wins / all.length).toFixed(1)}%)`);
} else {
  const E = require('../engine.js');
  const cards = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'cards.json'), 'utf8'));
  const effects = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'effects.json'), 'utf8'));
  E.init(cards, effects, buildRunDefs(cards, effects).engine.concat(buildMobDefs().engine));
  E.setTrace(false);
  const base = S.CHAPTERS.flatMap(c => c.nodes).find(n => n.id === workerData.id);
  const node = { ...base, opp: workerData.opp || base.opp, tag: base.tag && { ...base.tag, oppMate: workerData.oppMate || base.tag.oppMate } };
  parentPort.postMessage(workerData.seeds.map(seed => playOne(node, seed, workerData.head)));
}
