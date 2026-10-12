'use strict';
/*
 * 学習モデルを混ぜた CPU (候補) と、混ぜない CPU (基準) を戦わせる。どちらもつよい (特化なし)・同じ思考時間。
 * 編成は種から決めたランダム (valnet_selfplay.js と同じ作り方、種は学習に使っていない範囲)。同じ種を候補の先手・後手で1回ずつ。
 *
 *   node scripts/valnet_arena.js --model _valnet/model.json --weight 150 --games 400 --budget 600
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { PROTOCOLS } = require('./valnet_features.js');

const ROOT = path.join(__dirname, '..');
function parseArgs(argv) {
  const o = { model: '_valnet/model.json', weight: 150, games: 400, budget: 600, seed: 500001, workers: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') o.model = argv[++i];
    else if (a === '--weight') o.weight = +argv[++i];
    else if (a === '--games') o.games = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--seed') o.seed = +argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else { console.error('未知の引数: ' + a); process.exit(1); }
  }
  return o;
}
function decks(seed) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pool = PROTOCOLS.slice();
  const pick = () => pool.splice(Math.floor(rnd() * pool.length), 1)[0];
  return [[pick(), pick(), pick()], [pick(), pick(), pick()]];
}

if (!isMainThread) {
  const { src, cards, effects, jobs, budget, model, weight } = workerData;
  const load = () => {
    const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
    ctx.globalThis = ctx;
    vm.runInNewContext(src, ctx, { filename: 'engine.js' });
    const e = ctx.module.exports;
    e.init(cards, effects); e.setAiLevel(2); e.setAiThinkBudget(budget);
    if (e.setAiSpecialist) e.setAiSpecialist(false, -1);
    return e;
  };
  const C = load(), B = load();
  C.setAiValueNet(model, weight);
  const out = [];
  for (const job of jobs) {
    const cs = job.cs;
    const ais = cs === 0 ? [C, B] : [B, C];
    const [p0, p1] = decks(job.seed);
    let res = C.newGame({ p0, p1, seed: job.seed, useControl: true });
    let guard = 0;
    while (res.winner === null && guard++ < 700) {
      const st = res.state;
      const side = res.requests.length ? res.requests[0].player : st.turn;
      const ai = ais[side];
      if (res.requests.length) { const q = res.requests[0]; res = C.apply(st, { type: 'choose', id: q.id, picks: ai.ai.answer(st, q) }); }
      else { const a = ai.ai.action(st); if (!a) break; res = C.apply(st, a); }
      if (res.error) break;
    }
    out.push({ seed: job.seed, cs, won: res.winner === cs, decided: res.winner === 0 || res.winner === 1 });
  }
  parentPort.postMessage(out);
  return;
}

const opt = parseArgs(process.argv);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const model = JSON.parse(fs.readFileSync(path.join(ROOT, opt.model), 'utf8'));
const jobs = Array.from({ length: opt.games }, (_, i) => ({ seed: opt.seed + Math.floor(i / 2), cs: i % 2 }));
const nW = opt.workers || Math.max(1, Math.min(os.cpus().length - 1, 12));
const chunks = Array.from({ length: nW }, () => []);
jobs.forEach((j, i) => chunks[i % nW].push(j));
const t0 = Date.now();
Promise.all(chunks.filter(c => c.length).map(c => new Promise((resolve, reject) => {
  const w = new Worker(__filename, { workerData: { src, cards, effects, jobs: c, budget: opt.budget, model, weight: opt.weight } });
  w.on('message', resolve); w.on('error', reject);
}))).then(parts => {
  const all = parts.flat().filter(g => g.decided);
  const n = all.length, w = all.filter(g => g.won).length, p = w / n, z = 1.96;
  const d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  console.log('重み ' + opt.weight + '  学習モデル入りの勝率 ' + (100 * p).toFixed(1) + '% (95%: ' + (100 * (c - h)).toFixed(1) + '〜' + (100 * (c + h)).toFixed(1) + '%)  ' + n + '戦  ' + Math.round((Date.now() - t0) / 1000) + 's');
}).catch(e => { console.error(e); process.exit(1); });
