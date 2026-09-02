'use strict';
/*
 * AI 対戦アリーナ — 並列自己対戦で「強くなったか」を統計的に判定する。
 *
 * 従来の ai_benchmark.js は逐次実行で 16〜24 戦が限界だった。その試合数では
 * 5〜10pt の差はノイズに埋もれ、同じ設定が 68.8% と 45.8% を出すこともある。
 * ここでは worker_threads で並列化して数百戦を現実的な時間で回し、
 * Wilson 信頼区間で「有意に強い/弱い/判定不能」を明示する。
 *
 * 使い方:
 *   node scripts/ai_arena.js                       # working tree vs HEAD, 120戦
 *   node scripts/ai_arena.js --games 300
 *   node scripts/ai_arena.js --baseline 0d79422
 *   node scripts/ai_arena.js --budget 1000 --breadth 28,24,14   # 候補側の設定を変える
 *   node scripts/ai_arena.js --self --budget 1000              # 同一エンジンで設定だけ比較
 *
 * 判定: 候補の勝率の95%信頼区間が 50% を跨がなければ有意差あり。
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const ROOT = path.join(__dirname, '..');

/* ---------- 対戦カード(編成)。Main1/Main2/Aux を偏りなく混ぜる ---------- */
const MATCHUPS = [
  [['DARKNESS', 'FIRE', 'WATER'], ['DEATH', 'METAL', 'SPEED']],
  [['LIFE', 'LIGHT', 'PLAGUE'], ['PSYCHIC', 'SPIRIT', 'GRAVITY']],
  [['APATHY', 'HATE', 'LOVE'], ['DARKNESS', 'METAL', 'WATER']],
  [['CHAOS', 'CLARITY', 'LUCK'], ['CORRUPTION', 'COURAGE', 'FEAR']],
  [['ICE', 'MIRROR', 'TIME'], ['PEACE', 'SMOKE', 'WAR']],
  [['ASSIMILATION', 'DIVERSITY', 'UNITY'], ['CHAOS', 'CORRUPTION', 'MIRROR']],
  [['SPIRIT', 'HATE', 'GRAVITY'], ['LIGHT', 'LOVE', 'APATHY']],
  [['DEATH', 'LOVE', 'SPEED'], ['FIRE', 'LIFE', 'PSYCHIC']],
  [['LUCK', 'WAR', 'FEAR'], ['WATER', 'METAL', 'SPEED']],
  [['TIME', 'CLARITY', 'PEACE'], ['DARKNESS', 'PLAGUE', 'ICE']],
  // Aux 2 の代替コンパイル(UNITY/DIVERSITY)が絡む編成。--filter で狙い撃ちできる
  [['UNITY', 'DIVERSITY', 'ASSIMILATION'], ['FIRE', 'WATER', 'METAL']],
  [['UNITY', 'CHAOS', 'TIME'], ['DIVERSITY', 'LUCK', 'WAR']],
  [['DIVERSITY', 'MIRROR', 'PEACE'], ['UNITY', 'SMOKE', 'ICE']],
  [['UNITY', 'DIVERSITY', 'CLARITY'], ['DEATH', 'SPEED', 'DARKNESS']],
];

/* ---------- 引数 ---------- */
function parseArgs(argv) {
  const o = { games: 120, baseline: 'HEAD', workers: 0, self: false, budget: 0, breadth: null, seed: 20260801 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--self') o.self = true;
    else if (a === '--games') o.games = +argv[++i];
    else if (a === '--baseline') o.baseline = argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--seed') o.seed = +argv[++i];
    else if (a === '--breadth') o.breadth = argv[++i].split(',').map(Number);
    else if (a === '--pimc') o.pimc = +argv[++i];
    else if (a === '--baseline-pimc') o.baselinePimc = +argv[++i];
    else if (a === '--baseline-breadth') o.baselineBreadth = argv[++i].split(',').map(Number);
    // 特定プロトコルが絡む編成だけに絞る。全体では薄まる効果を狙い撃ちで測るのに使う
    else if (a === '--filter') o.filter = argv[++i].split(',').map(s => s.trim().toUpperCase());
    else if (a === '--weights') {
      // 例: --weights ctrlHold=80,oppLeadNoCtrl=90  (候補側の評価重みだけ差し替える)
      o.weights = {};
      for (const kv of argv[++i].split(',')) {
        const [k, v] = kv.split('=');
        if (k) o.weights[k] = Number(v);
      }
    }
    else if (a === '--baseline-weights') {
      o.baselineWeights = {};
      for (const kv of argv[++i].split(',')) {
        const [k, v] = kv.split('=');
        if (k) o.baselineWeights[k] = Number(v);
      }
    }
  }
  return o;
}

/* ---------- 統計: Wilson score interval ---------- */
function wilson(wins, n, z) {
  if (!n) return [0, 0];
  z = z || 1.96;
  const p = wins / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/* =====================================================================
 * Worker
 * ===================================================================== */
if (!isMainThread) {
  const { candidateSrc, baselineSrc, cards, effects, jobs, cfg } = workerData;

  function loadEngine(source, filename) {
    const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
    ctx.globalThis = ctx;
    vm.runInNewContext(source, ctx, { filename });
    return ctx.module.exports || ctx.CompileEngine;
  }

  const Cand = loadEngine(candidateSrc, 'candidate.js');
  const Base = loadEngine(baselineSrc, 'baseline.js');
  Cand.init(cards, effects); Base.init(cards, effects);
  Cand.setAiLevel(2); Base.setAiLevel(2);
  // 候補側だけ探索設定を変えられる(設定そのものの比較に使う)
  if (cfg.budget && Cand.setAiThinkBudget) Cand.setAiThinkBudget(cfg.budget);
  if (cfg.budget && Base.setAiThinkBudget) Base.setAiThinkBudget(cfg.budget);
  if (cfg.breadth && Cand.setAiBreadth) Cand.setAiBreadth.apply(null, cfg.breadth);
  if (cfg.pimc && Cand.setAiPimc) Cand.setAiPimc(cfg.pimc);
  if (cfg.baselinePimc && Base.setAiPimc) Base.setAiPimc(cfg.baselinePimc);
  if (cfg.weights && Cand.setAiWeights) Cand.setAiWeights(cfg.weights);
  if (cfg.baselineBreadth && Base.setAiBreadth) Base.setAiBreadth.apply(null, cfg.baselineBreadth);
  if (cfg.baselineWeights && Base.setAiWeights) Base.setAiWeights(cfg.baselineWeights);

  const out = [];
  for (const job of jobs) out.push(playGame(job));
  parentPort.postMessage(out);

  function playGame(job) {
    const ais = job.candidateSide === 0 ? [Cand, Base] : [Base, Cand];
    let res = Cand.newGame({ p0: job.p0, p1: job.p1, seed: job.seed, useControl: true });
    let guard = 0, error = null;
    const ms = [0, 0], moves = [0, 0];
    while (res.winner === null && guard++ < 700) {
      const side = res.requests.length ? res.requests[0].player : res.state.turn;
      const ai = ais[side];
      const t = now();
      if (res.requests.length) {
        const req = res.requests[0];
        res = Cand.apply(res.state, { type: 'choose', id: req.id, picks: ai.ai.answer(res.state, req) });
      } else {
        const a = ai.ai.action(res.state);
        if (!a) break;
        res = Cand.apply(res.state, a);
        ms[side] += now() - t; moves[side]++;
      }
      if (res.error) { error = res.error; break; }
    }
    const cs = job.candidateSide;
    return {
      winner: res.winner, error,
      candidateWon: res.winner !== null && res.winner === cs,
      decided: res.winner !== null,
      candidateMs: ms[cs], candidateMoves: moves[cs],
      baselineMs: ms[1 - cs], baselineMoves: moves[1 - cs],
      turns: moves[0] + moves[1],
    };
  }
  function now() { return performance.now ? performance.now() : Date.now(); }
  return;
}

/* =====================================================================
 * Main
 * ===================================================================== */
const opt = parseArgs(process.argv);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const candidateSrc = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const baselineSrc = opt.self
  ? candidateSrc
  : execFileSync('git', ['show', opt.baseline + ':engine.js'], { cwd: ROOT, encoding: 'utf8' });

/* 対戦表を作る。1つの (編成, seed) につき4通り(先後 × 候補side)を必ず消化して
   先手有利と編成の偏りを打ち消す = 少ない試合数でも分散が小さくなる */
const POOL = opt.filter
  ? MATCHUPS.filter(m => opt.filter.some(p => m[0].indexOf(p) >= 0 || m[1].indexOf(p) >= 0))
  : MATCHUPS;
if (!POOL.length) { console.error('--filter に一致する編成がありません'); process.exit(1); }

const jobs = [];
for (let i = 0; i < opt.games; i++) {
  const unit = Math.floor(i / 4);
  const pair = POOL[unit % POOL.length];
  const variant = i % 4;
  const swap = variant >= 2;
  jobs.push({
    p0: swap ? pair[1] : pair[0],
    p1: swap ? pair[0] : pair[1],
    candidateSide: variant % 2,
    seed: opt.seed + unit,
  });
}

const workerCount = Math.max(1, Math.min(opt.workers || (os.cpus().length - 1), jobs.length));
const chunks = Array.from({ length: workerCount }, () => []);
jobs.forEach((j, i) => chunks[i % workerCount].push(j));

console.log('候補: working tree' + (opt.budget ? ' budget=' + opt.budget : '')
  + (opt.breadth ? ' breadth=' + opt.breadth.join('-') : '')
  + (opt.weights ? ' weights=' + JSON.stringify(opt.weights) : ''));
console.log('基準: ' + (opt.self ? 'working tree (既定設定)' : opt.baseline));
console.log('試合数 ' + opt.games + ' / 並列 ' + workerCount + ' worker\n');

const started = Date.now();
const results = [];
let done = 0;

for (const chunk of chunks) {
  const w = new Worker(__filename, {
    workerData: { candidateSrc, baselineSrc, cards, effects, jobs: chunk, cfg: {
      budget: opt.budget, breadth: opt.breadth, weights: opt.weights,
      pimc: opt.pimc, baselinePimc: opt.baselinePimc,
      baselineBreadth: opt.baselineBreadth, baselineWeights: opt.baselineWeights,
    } },
  });
  w.on('message', (rows) => {
    results.push.apply(results, rows);
    done++;
    if (done === workerCount) report();
  });
  w.on('error', (e) => { console.error('worker error:', e); process.exit(1); });
}

function report() {
  const elapsed = (Date.now() - started) / 1000;
  let cw = 0, bw = 0, draws = 0, errors = 0;
  let cMs = 0, cMv = 0, bMs = 0, bMv = 0, turns = 0;
  for (const r of results) {
    if (r.error) errors++;
    if (!r.decided) draws++;
    else if (r.candidateWon) cw++; else bw++;
    cMs += r.candidateMs; cMv += r.candidateMoves;
    bMs += r.baselineMs; bMv += r.baselineMoves;
    turns += r.turns;
  }
  const errorKinds = {};
  for (const r of results) if (r.error) errorKinds[r.error] = (errorKinds[r.error] || 0) + 1;
  const n = cw + bw;
  const rate = n ? cw / n : 0;
  const [lo, hi] = wilson(cw, n, 1.96);

  let verdict;
  if (!n) verdict = '判定不能 (決着なし)';
  else if (lo > 0.5) verdict = '✅ 有意に強い';
  else if (hi < 0.5) verdict = '❌ 有意に弱い';
  else verdict = '⚪ 判定不能 (差を検出できず)';

  // この試合数で検出できる最小の差(50%からCI半幅ぶん)
  const halfWidth = n ? (hi - lo) / 2 : 0;

  console.log('\n' + '='.repeat(56));
  console.log('候補 ' + cw + '勝 / 基準 ' + bw + '勝' + (draws ? ' / 引分 ' + draws : '') + (errors ? ' / エラー ' + errors : ''));
  console.log('勝率 ' + (rate * 100).toFixed(1) + '%   95%CI [' + (lo * 100).toFixed(1) + '%, ' + (hi * 100).toFixed(1) + '%]');
  console.log('判定 ' + verdict);
  console.log('-'.repeat(56));
  console.log('検出可能な差   ±' + (halfWidth * 100).toFixed(1) + 'pt (この試合数の限界)');
  console.log('思考時間/手    候補 ' + avg(cMs, cMv) + 'ms / 基準 ' + avg(bMs, bMv) + 'ms');
  console.log('平均手数       ' + (turns / Math.max(results.length, 1)).toFixed(1));
  console.log('所要           ' + elapsed.toFixed(0) + 's (' + (results.length / elapsed).toFixed(1) + ' 戦/秒)');
  if (errors) console.log('error kinds     ' + JSON.stringify(errorKinds));
  console.log('='.repeat(56));
  if (verdict.startsWith('⚪')) {
    const need = Math.ceil(n * Math.pow(halfWidth / 0.05, 2));
    console.log('※ 5pt の差を検出するには概算 ' + need + ' 戦必要です');
  }
}

function avg(v, c) { return c ? (v / c).toFixed(0) : '0'; }
