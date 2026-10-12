'use strict';
/*
 * 学習モデルのためのデータ集め: CPU 同士 (つよい・特化なし) をランダムな編成で戦わせ、
 * 各手番の始めの盤面を特徴量 (valnet_features.js) にして、最後にどちらが勝ったかを付けて書き出す。
 *
 * 使い方:
 *   node scripts/valnet_selfplay.js --games 2000 --budget 300 --seed 1 --out _valnet/data_001.jsonl
 * 1行 = 1局面: {"x":[...], "y":1 か 0 (見る側が勝ったか), "g":対局番号, "t":手番, "s":今の CPU の点数 (aiScore、比べる用)}
 * 手番をとる側から見た盤面だけを残す (同じ局面を両側から見た2行にはしない)。
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { features, FEATURE_SIZE, PROTOCOLS } = require('./valnet_features.js');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const o = { games: 200, budget: 300, seed: 1, out: '_valnet/data.jsonl', workers: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games') o.games = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--seed') o.seed = +argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else { console.error('未知の引数: ' + a); process.exit(1); }
  }
  return o;
}

/* 種から決まるランダムな編成 (6 つのプロトコルを重ならないように 3 つずつ) */
function decks(seed) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pool = PROTOCOLS.slice();
  const pick = () => pool.splice(Math.floor(rnd() * pool.length), 1)[0];
  return [[pick(), pick(), pick()], [pick(), pick(), pick()]];
}

if (!isMainThread) {
  const { src, cards, effects, jobs, budget } = workerData;
  const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
  ctx.globalThis = ctx;
  vm.runInNewContext(src, ctx, { filename: 'engine.js' });
  const E = ctx.module.exports;
  E.init(cards, effects);
  E.setAiLevel(2);
  E.setAiThinkBudget(budget);
  if (E.setAiSpecialist) E.setAiSpecialist(false, -1);
  const out = [];
  for (const job of jobs) {
    const [p0, p1] = decks(job.seed);
    let res = E.newGame({ p0, p1, seed: job.seed, useControl: true });
    const rows = [];
    let lastTurn = -1, guard = 0;
    while (res.winner === null && guard++ < 700) {
      const st = res.state;
      if (!res.requests.length && (st.turns || 0) !== lastTurn) {
        lastTurn = st.turns || 0;
        rows.push({ x: features(E, st, st.turn), side: st.turn, t: lastTurn, s: Math.round(E.ai.score(st, st.turn)) });
      }
      if (res.requests.length) {
        const req = res.requests[0];
        res = E.apply(st, { type: 'choose', id: req.id, picks: E.ai.answer(st, req) });
      } else {
        const a = E.ai.action(st);
        if (!a) break;
        res = E.apply(st, a);
      }
      if (res.error) break;
    }
    if (res.winner === 0 || res.winner === 1) {
      for (const r of rows) out.push(JSON.stringify({ x: r.x.map(v => Math.round(v * 1000) / 1000), y: r.side === res.winner ? 1 : 0, g: job.seed, t: r.t, s: r.s }));
    }
  }
  parentPort.postMessage(out);
  return;
}

const opt = parseArgs(process.argv);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const jobs = Array.from({ length: opt.games }, (_, i) => ({ seed: opt.seed + i }));
const nW = opt.workers || Math.max(1, Math.min(os.cpus().length - 1, 12));
const chunks = Array.from({ length: nW }, () => []);
jobs.forEach((j, i) => chunks[i % nW].push(j));
const t0 = Date.now();
Promise.all(chunks.filter(c => c.length).map(c => new Promise((resolve, reject) => {
  const w = new Worker(__filename, { workerData: { src, cards, effects, jobs: c, budget: opt.budget } });
  w.on('message', resolve); w.on('error', reject);
}))).then(parts => {
  const lines = parts.flat();
  fs.mkdirSync(path.dirname(path.join(ROOT, opt.out)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, opt.out), lines.join('\n') + '\n');
  console.log(opt.games + '局 → ' + lines.length + ' 局面 (特徴量 ' + FEATURE_SIZE + ' 個)  ' + Math.round((Date.now() - t0) / 1000) + 's  ' + opt.out);
}).catch(e => { console.error(e); process.exit(1); });
