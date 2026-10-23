'use strict';
/*
 * 学習モデルを混ぜた CPU (候補) と、混ぜない CPU (基準) を戦わせる。どちらもつよい (特化なし)・同じ思考時間。
 * 編成は種から決めたランダム (valnet_selfplay.js と同じ作り方、種は学習に使っていない範囲)。同じ種を候補の先手・後手で1回ずつ。
 *
 *   node scripts/valnet_arena.js --model _valnet/model.json --weight 150 --games 400 --budget 600
 * --oracle で両者を ORACLE の設定 (自分の側だけ dsh 特化 + ORACLE の手筋) にする (思考時間は --budget 2400 と組む)。
 * --cweights _spsa/run.theta.json で候補の側だけ ai_spsa.js の重み (特化・ORACLE の o*・学習モデルの重み vnw) にする。
 * --base data/valnet.json を付けると、基準の側にも学習モデル (同じ重み) を入れる (世代どうしの対戦)。--save で1局ずつの結果を書き出す
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { PROTOCOLS } = require('./valnet_features.js');

const ROOT = path.join(__dirname, '..');
function parseArgs(argv) {
  const o = { model: '_valnet/model.json', weight: 150, games: 400, budget: 600, seed: 500001, workers: 0, base: '', save: '', pimc: 1, cweight: 0, oracle: false, cweights: '', cbudget: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') o.model = argv[++i];
    else if (a === '--weight') o.weight = +argv[++i];
    else if (a === '--games') o.games = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--seed') o.seed = +argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else if (a === '--base') o.base = argv[++i];
    else if (a === '--pimc') o.pimc = +argv[++i];        // 候補の側だけ、見えないカードの並びを何通りも振って多数決 (setAiPimc)
    else if (a === '--cweight') o.cweight = +argv[++i];  // 候補の側だけ学習モデルの重みを変える (0 なら --weight と同じ)
    else if (a === '--save') o.save = argv[++i];
    else if (a === '--oracle') o.oracle = true;
    else if (a === '--cweights') o.cweights = argv[++i];
    else if (a === '--cbudget') o.cbudget = +argv[++i];   // 候補の側だけ思考時間を変える (読みの時間が強さにどれだけ効くか)
    else if (a === '--by-proto') o.byProto = true;   // プロトコルごとの勝率も出す
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
  const { src, cards, effects, jobs, budget, model, weight, base, pimc, cweight, oracle, cweights, cbudget } = workerData;
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
  C.setAiValueNet(model, cweight || weight);
  if (pimc > 1) C.setAiPimc(pimc);
  if (base) B.setAiValueNet(base, weight);
  if (oracle) { C.setAiOracle(true); B.setAiOracle(true); }
  if (cbudget) C.setAiThinkBudget(cbudget);
  if (cweights) {
    const { vnw, ...w } = cweights.theta;
    C.setAiSpecialistWeights(w); C.setAiWeights(w);   // それぞれ知らない名前は飛ばす
    if (vnw) C.setAiValueNet(model, vnw);
  }
  const out = [];
  for (const job of jobs) {
    const cs = job.cs;
    const ais = cs === 0 ? [C, B] : [B, C];
    /* 特化は「どちらの側か」を持つので、局ごとに自分の側へ向け直す */
    if (oracle) { C.setAiSpecialist(true, cs, 'dsh'); B.setAiSpecialist(true, 1 - cs, 'dsh'); }
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
    out.push({ seed: job.seed, cs, won: res.winner === cs, decided: res.winner === 0 || res.winner === 1, mine: cs === 0 ? p0 : p1, theirs: cs === 0 ? p1 : p0 });
  }
  parentPort.postMessage(out);
  return;
}

const opt = parseArgs(process.argv);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const model = JSON.parse(fs.readFileSync(path.join(ROOT, opt.model), 'utf8'));
const base = opt.base ? JSON.parse(fs.readFileSync(path.join(ROOT, opt.base), 'utf8')) : null;
const jobs = Array.from({ length: opt.games }, (_, i) => ({ seed: opt.seed + Math.floor(i / 2), cs: i % 2 }));
const nW = opt.workers || Math.max(1, Math.min(os.cpus().length - 1, 12));
const chunks = Array.from({ length: nW }, () => []);
jobs.forEach((j, i) => chunks[i % nW].push(j));
const t0 = Date.now();
Promise.all(chunks.filter(c => c.length).map(c => new Promise((resolve, reject) => {
  const w = new Worker(__filename, { workerData: { src, cards, effects, jobs: c, budget: opt.budget, model, weight: opt.weight, base, pimc: opt.pimc, cweight: opt.cweight, oracle: opt.oracle, cbudget: opt.cbudget, cweights: opt.cweights ? JSON.parse(fs.readFileSync(path.join(ROOT, opt.cweights), 'utf8')) : null } });
  w.on('message', resolve); w.on('error', reject);
}))).then(parts => {
  if (opt.save) fs.writeFileSync(path.join(ROOT, opt.save), parts.flat().map(g => JSON.stringify(g)).join('\n') + '\n');
  const all = parts.flat().filter(g => g.decided);
  const n = all.length, w = all.filter(g => g.won).length, p = w / n, z = 1.96;
  const d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  /* プロトコルごと: 学習モデル入りの側がそのプロトコルを使った試合の勝率 */
  if (opt.byProto) {
    const rows = PROTOCOLS.map(pr => {
      const gs = all.filter(g => g.mine.includes(pr));
      return [pr, gs.length, gs.filter(g => g.won).length];
    }).sort((a, b) => b[2] / b[1] - a[2] / a[1]);
    for (const [pr, n2, w2] of rows) console.log('  ' + pr.padEnd(13) + ' ' + (100 * w2 / n2).toFixed(0).padStart(3) + '%  (' + w2 + '/' + n2 + ')');
  }
  console.log('重み ' + opt.weight + '  学習モデル入りの勝率 ' + (100 * p).toFixed(1) + '% (95%: ' + (100 * (c - h)).toFixed(1) + '〜' + (100 * (c + h)).toFixed(1) + '%)  ' + n + '戦  ' + Math.round((Date.now() - t0) / 1000) + 's');
}).catch(e => { console.error(e); process.exit(1); });
