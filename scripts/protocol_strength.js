'use strict';
/*
 * プロトコルごとの強さの目安を測る (CPU のドラフトが使う)。
 *   ランダムな3つの編成どうしを通常 AI で戦わせ、そのプロトコルが入ったデッキの勝率を数える。
 *   同じ AI どうしなので「この AI が使ったときの強さ」の目安。
 *
 *   node scripts/protocol_strength.js --games 1500 --budget 60
 *   → js3d/protocol-strength.js を書き出す (勝率 0..1。試合数も添える)
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const ROOT = path.join(__dirname, '..');
const Engine = require('../engine.js');
const cards = require('../data/cards.json');
const effects = require('../data/effects.json');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

Engine.init(cards, effects);
Engine.setAiLevel(2);
Engine.setAiThinkBudget(isMainThread ? arg('--budget', 60) : workerData.budget);

function play(p0, p1, seed) {
  let result = Engine.newGame({ p0, p1, seed, useControl: true, first: seed & 1 });
  let guard = 0;
  while (result.winner === null && guard++ < 500) {
    if (result.requests.length) {
      const req = result.requests[0];
      result = Engine.apply(result.state, { type: 'choose', id: req.id, picks: Engine.ai.answer(result.state, req) });
    } else {
      result = Engine.apply(result.state, Engine.ai.action(result.state));
    }
    if (result.error) return null;
  }
  return result.winner;
}

if (!isMainThread) {
  parentPort.postMessage(workerData.jobs.map(job => ({ p0: job.p0, p1: job.p1, winner: play(job.p0, job.p1, job.seed) })));
} else {
  const names = cards.protocols.map(p => p.name);
  const games = Math.max(30, arg('--games', 1500));
  const budget = Math.max(1, arg('--budget', 60));
  const seed = arg('--seed', 20260923);
  const random = rng(seed);
  const draw3 = (exclude) => {
    const pool = names.filter(n => !exclude.includes(n));
    const out = [];
    while (out.length < 3) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    return out;
  };
  const jobs = [];
  for (let i = 0; i < games; i++) {
    const p0 = draw3([]);
    jobs.push({ p0, p1: draw3(p0), seed: seed + i });
  }
  const workerCount = Math.max(1, Math.min(arg('--workers', os.cpus().length - 1), jobs.length));
  const chunks = Array.from({ length: workerCount }, () => []);
  jobs.forEach((job, i) => chunks[i % workerCount].push(job));
  console.log(`protocol strength: ${games} games, ${budget}ms, ${workerCount} workers`);
  const started = Date.now();
  Promise.all(chunks.map(list => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { jobs: list, budget } });
    worker.once('message', resolve);
    worker.once('error', reject);
  }))).then(parts => {
    const tally = Object.fromEntries(names.map(n => [n, { w: 0, n: 0 }]));
    for (const row of parts.flat()) {
      if (row.winner === null) continue;
      row.p0.forEach(n => { tally[n].n++; if (row.winner === 0) tally[n].w++; });
      row.p1.forEach(n => { tally[n].n++; if (row.winner === 1) tally[n].w++; });
    }
    const ranked = names.map(n => ({ name: n, rate: tally[n].n ? tally[n].w / tally[n].n : 0.5, games: tally[n].n }))
      .sort((a, b) => b.rate - a.rate);
    for (const r of ranked) console.log(r.name.padEnd(14), (r.rate * 100).toFixed(1) + '%', r.games);
    const table = Object.fromEntries(ranked.map(r => [r.name, +r.rate.toFixed(3)]));
    const out = '/* プロトコルごとの強さの目安 (CPU のドラフトが使う)。scripts/protocol_strength.js が書き出す。\n' +
      '   ランダムな編成どうしの通常 AI 対戦 ' + games + ' 戦で、そのプロトコルが入ったデッキの勝率 */\n' +
      'export const PROTOCOL_STRENGTH = ' + JSON.stringify(table, null, 2) + ';\n';
    fs.writeFileSync(path.join(ROOT, 'js3d', 'protocol-strength.js'), out);
    console.log('wrote js3d/protocol-strength.js in', Math.round((Date.now() - started) / 1000) + 's');
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
