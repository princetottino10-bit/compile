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
 * 特化 AI の計測 (候補側だけ setAiSpecialist を有効にし、固定デッキで戦わせる):
 *   node scripts/ai_arena.js --self --specialist psylock --deck PSYCHIC,DARKNESS,SPEED --opponent normal
 *   node scripts/ai_arena.js --self --specialist psylock --opponent dsh
 *   node scripts/ai_arena.js --self --specialist psylock --opponent same --weights spKeyHold=-20
 *   --opponent normal : 通常 AI・ランダム編成 (候補のプロトコルとは重ねない)
 *   --opponent dsh    : 最強 (dsh 特化 + DARKNESS,SPEED,HATE)
 *   --opponent psylock: ロック特化 (psylock 特化 + PSYCHIC,DARKNESS,SPEED)
 *   --opponent same   : 候補と同じ特化・同じデッキ (重みの比較用ミラー)
 *   --pool lock       : サイキック①ロックが起きやすい編成を対戦表に足す (--filter PSYCHIC と併用)
 *   --deck を省くと dsh は DARKNESS,SPEED,HATE、psylock は PSYCHIC,DARKNESS,SPEED
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
const DSH_DECK = ['DARKNESS', 'SPEED', 'HATE'];
const DEFAULT_DECK = { dsh: DSH_DECK, psylock: ['PSYCHIC', 'DARKNESS', 'SPEED'] };
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
/* サイキック① (PSYCHIC_2) と、覆われた裏向きを表にする手段 (DARKNESS_3 / TIME_2 / CHAOS_1)
   が揃う編成。通常の MATCHUPS ではロックがほぼ起きず係数の差が薄まるので、
   --pool lock のときだけ足す (既定の対戦表は変えない) */
const LOCK_MATCHUPS = [
  [['PSYCHIC', 'DARKNESS', 'FIRE'], ['METAL', 'LIGHT', 'WATER']],
  [['PSYCHIC', 'DARKNESS', 'SPEED'], ['DEATH', 'GRAVITY', 'PLAGUE']],
  [['PSYCHIC', 'TIME', 'WAR'], ['DARKNESS', 'HATE', 'LIFE']],
  [['CHAOS', 'PSYCHIC', 'ICE'], ['SPIRIT', 'LOVE', 'COURAGE']],
  [['PSYCHIC', 'DARKNESS', 'LUCK'], ['TIME', 'APATHY', 'FEAR']],
  [['PSYCHIC', 'SPEED', 'CHAOS'], ['DARKNESS', 'WATER', 'CORRUPTION']],
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
    else if (a === '--baseline-budget') o.baselineBudget = +argv[++i];
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
    else if (a === '--pool') o.pool = argv[++i];
    else if (a === '--specialist') o.specialist = argv[++i];
    else if (a === '--deck') o.deck = argv[++i].split(',').map(s => s.trim().toUpperCase());
    else if (a === '--opponent') o.opponent = argv[++i];
    else if (a === '--specialist-weights') o.specialistWeights = parseKv(argv[++i]);
    else if (a === '--baseline-specialist-weights') o.baselineSpecialistWeights = parseKv(argv[++i]);
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
function parseKv(text) {
  const out = {};
  for (const kv of text.split(',')) {
    const [k, v] = kv.split('=');
    if (k) out[k] = Number(v);
  }
  return out;
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
  /* --baseline-budget があれば基準側だけ別の思考時間にする (探索時間の効き目を測る) */
  const baseBudget = cfg.baselineBudget || cfg.budget;
  if (baseBudget && Base.setAiThinkBudget) Base.setAiThinkBudget(baseBudget);
  if (cfg.breadth && Cand.setAiBreadth) Cand.setAiBreadth.apply(null, cfg.breadth);
  if (cfg.pimc && Cand.setAiPimc) Cand.setAiPimc(cfg.pimc);
  if (cfg.baselinePimc && Base.setAiPimc) Base.setAiPimc(cfg.baselinePimc);
  if (cfg.baselineBreadth && Base.setAiBreadth) Base.setAiBreadth.apply(null, cfg.baselineBreadth);
  /* 打ち間違えた重みが黙って無視されると「差なし」と誤読するので、ここで止める */
  const checkUnknown = (label, unknown) => {
    if (Array.isArray(unknown) && unknown.length) throw new Error(label + ' に未知のキーか不正な値: ' + unknown.join(','));
  };
  if (cfg.weights && Cand.setAiWeights) checkUnknown('--weights', Cand.setAiWeights(cfg.weights));
  if (cfg.baselineWeights && Base.setAiWeights) checkUnknown('--baseline-weights', Base.setAiWeights(cfg.baselineWeights));
  if (cfg.specialistWeights) checkUnknown('--specialist-weights', Cand.setAiSpecialistWeights(cfg.specialistWeights));
  if (cfg.baselineSpecialistWeights) checkUnknown('--baseline-specialist-weights', Base.setAiSpecialistWeights(cfg.baselineSpecialistWeights));

  const out = [];
  for (const job of jobs) out.push(playGame(job));
  parentPort.postMessage(out);

  /* 覆われた表向きのサイキック① (= 永続ロック) を持っている側 */
  function permanentLocks(st) {
    const out = [false, false];
    for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) {
      const stack = st.lines[l][s];
      for (let i = 0; i < stack.length - 1; i++) {
        const c = st.cards[stack[i]];
        if (c.faceUp && c.def === 'PSYCHIC_2') out[s] = true;
      }
    }
    return out;
  }

  function playGame(job) {
    const cs = job.candidateSide;
    const ais = cs === 0 ? [Cand, Base] : [Base, Cand];
    /* 特化 AI は side 指定で有効にする (side 未指定だと探索中の相手手番まで特化扱いになる) */
    if (Cand.setAiSpecialist) Cand.setAiSpecialist(!!cfg.specialist, cs, cfg.specialist);
    if (Base.setAiSpecialist) Base.setAiSpecialist(!!job.baseSpecialist, 1 - cs, job.baseSpecialist);
    let res = Cand.newGame({ p0: job.p0, p1: job.p1, seed: job.seed, useControl: true });
    let guard = 0, error = null;
    const ms = [0, 0], moves = [0, 0];
    const locked = [false, false];
    while (res.winner === null && guard++ < 700) {
      if (cfg.trackLocks) {
        const lk = permanentLocks(res.state);
        if (lk[0]) locked[0] = true;
        if (lk[1]) locked[1] = true;
      }
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
    return {
      winner: res.winner, error,
      candidateLocked: locked[cs], baselineLocked: locked[1 - cs],
      candidateFirst: cs === 0,   // newGame は first 未指定なら p0 が先手
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
const BASE_POOL = opt.pool === 'lock' ? MATCHUPS.concat(LOCK_MATCHUPS) : MATCHUPS;
const POOL = opt.filter
  ? BASE_POOL.filter(m => opt.filter.some(p => m[0].indexOf(p) >= 0 || m[1].indexOf(p) >= 0))
  : BASE_POOL;
if (!POOL.length) { console.error('--filter に一致する編成がありません'); process.exit(1); }

if (opt.specialist && ['dsh', 'psylock'].indexOf(opt.specialist) < 0) {
  console.error('--specialist は dsh か psylock'); process.exit(1);
}
if (opt.opponent && ['normal', 'dsh', 'psylock', 'same'].indexOf(opt.opponent) < 0) {
  console.error('--opponent は normal / dsh / psylock / same'); process.exit(1);
}
const ALL_PROTOCOLS = [...new Set(MATCHUPS.flat(2))].sort();
const candidateDeck = opt.deck || (opt.specialist ? DEFAULT_DECK[opt.specialist] : null);
if (candidateDeck) {
  const bad = candidateDeck.filter(p => ALL_PROTOCOLS.indexOf(p) < 0);
  if (candidateDeck.length !== 3 || bad.length) {
    console.error('--deck は既知のプロトコル3つ (不明: ' + bad.join(',') + ')'); process.exit(1);
  }
}

/* 固定デッキ戦: 候補は常に candidateDeck。相手の編成は unit ごとに seed から決め、
   同じ (相手編成, seed) を候補の先手・後手で1回ずつ消化して先手有利を打ち消す */
function seededDeck(seed, exclude) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pool = ALL_PROTOCOLS.filter(p => exclude.indexOf(p) < 0);
  const out = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

const jobs = [];
if (candidateDeck) {
  const opponent = opt.opponent || 'normal';
  for (let i = 0; i < opt.games; i++) {
    const unit = Math.floor(i / 2);
    const seed = opt.seed + unit;
    let oppDeck, baseSpecialist = null;
    if (opponent === 'dsh' || opponent === 'psylock') { oppDeck = DEFAULT_DECK[opponent]; baseSpecialist = opponent; }
    else if (opponent === 'same') { oppDeck = candidateDeck; baseSpecialist = opt.specialist || null; }
    else oppDeck = seededDeck(seed * 7919 + 13, candidateDeck);
    const candidateSide = i % 2;
    jobs.push({
      p0: candidateSide === 0 ? candidateDeck : oppDeck,
      p1: candidateSide === 0 ? oppDeck : candidateDeck,
      candidateSide, seed, baseSpecialist,
    });
  }
} else for (let i = 0; i < opt.games; i++) {
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
if (candidateDeck) {
  console.log('候補の編成: ' + candidateDeck.join(',') + (opt.specialist ? ' / 特化 ' + opt.specialist : ' / 通常 AI')
    + (opt.specialistWeights ? ' specialistWeights=' + JSON.stringify(opt.specialistWeights) : ''));
  const opponent = opt.opponent || 'normal';
  console.log('相手: ' + (opponent === 'dsh' ? '最強 (dsh + ' + DSH_DECK.join(',') + ')'
    : opponent === 'psylock' ? 'ロック特化 (psylock + ' + DEFAULT_DECK.psylock.join(',') + ')'
    : opponent === 'same' ? '同じ特化・同じ編成 (ミラー)' : '通常 AI・ランダム編成'));
}
console.log('基準: ' + (opt.self ? 'working tree (既定設定)' : opt.baseline) + (opt.baselineBudget ? ' budget=' + opt.baselineBudget : '')
  + (opt.baselineWeights ? ' weights=' + JSON.stringify(opt.baselineWeights) : ''));
console.log('試合数 ' + opt.games + ' / 並列 ' + workerCount + ' worker\n');

const started = Date.now();
const results = [];
let done = 0;

for (const chunk of chunks) {
  const w = new Worker(__filename, {
    workerData: { candidateSrc, baselineSrc, cards, effects, jobs: chunk, cfg: {
      budget: opt.budget, baselineBudget: opt.baselineBudget, breadth: opt.breadth, weights: opt.weights,
      pimc: opt.pimc, baselinePimc: opt.baselinePimc,
      baselineBreadth: opt.baselineBreadth, baselineWeights: opt.baselineWeights,
      specialist: candidateDeck ? (opt.specialist || null) : null,
      specialistWeights: opt.specialistWeights, baselineSpecialistWeights: opt.baselineSpecialistWeights,
      trackLocks: true,
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
  const split = (pred) => {
    let w = 0, m = 0;
    for (const r of results) if (r.decided && pred(r)) { m++; if (r.candidateWon) w++; }
    return m ? (w / m * 100).toFixed(1) + '% (' + w + '/' + m + ')' : '-';
  };
  console.log('先手/後手      ' + split(r => r.candidateFirst) + ' / ' + split(r => !r.candidateFirst));
  const cl = results.filter(r => r.candidateLocked).length, bl = results.filter(r => r.baselineLocked).length;
  if (cl || bl) {
    console.log('永続ロック成立 候補 ' + cl + '戦 (勝率 ' + split(r => r.candidateLocked) + ') / 基準 '
      + bl + '戦 (候補勝率 ' + split(r => r.baselineLocked) + ')');
  }
  console.log('='.repeat(56));
  if (verdict.startsWith('⚪')) {
    const need = Math.ceil(n * Math.pow(halfWidth / 0.05, 2));
    console.log('※ 5pt の差を検出するには概算 ' + need + ' 戦必要です');
  }
}

function avg(v, c) { return c ? (v / c).toFixed(0) : '0'; }
