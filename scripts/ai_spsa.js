'use strict';
/*
 * ORACLE の重み (特化 dsh の AI_DSH_W と ORACLE だけの o*、学習モデルの重み) を SPSA で少しずつ動かす。
 * 1組 = 全部の重みを同時に ±c だけ (対数で) ずらした θ+ と θ- を、同じ種の先手・後手で1回ずつ戦わせる。
 * 勝ち越した側の向きへ全部の重みを少しだけ動かす。1組では雑音だらけだが、何千組と重ねると効く向きだけが残る。
 * 前の座標上昇 (ai_weight_tune.js) は学習モデルが入る前の重みで、重み1000 の今は釣り合いが変わっているはず。
 *
 *   node scripts/ai_spsa.js --pairs 20000 --budget 400 --out _spsa/run1
 * 途中で止めても <out>.theta.json から続きを始める。<out>.log に組の区切りごとの重みを書く。
 * 確かめるときは valnet_arena.js --cweights <out>.theta.json --oracle (採用は 1,200戦で下限50%超)。
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { PROTOCOLS } = require('./valnet_features.js');

const ROOT = path.join(__dirname, '..');
/* 動かす重み。構造の値 (読みの幅・思考時間・有無の切り替え) は動かさない。割合は 1 を超えないもの */
const DSH = ['hate1Up', 'hate1Few', 'hate0Combo', 'hate0Self', 'hate1Reuse', 'hate1ReuseMaybe', 'hate1Expose',
  'ctrlHold', 'ctrlHoldLev', 'ctrlOpp', 'ctrlOppLev', 'leadGain', 'oppLeadGain', 'leadBonus', 'oppLeadBonus',
  'marginLead', 'marginTrail', 'refreshPerCard', 'refreshTempo', 'compileSafety', 'hateDownPenalty', 'speedDownPenalty',
  'speedPairKeep', 'fire0Water4Ready', 'recompile', 'midUp', 'refreshRecompile', 'comboDiscard', 'anyLineBase', 'anyLineGain',
  'uncoverBase', 'uncoverMid', 'emptyHand', 'lowHand', 'futureDiscount', 'refreshUrgency',
  'diversityReady', 'diversityLast', 'diversityEarly', 'diversityHoldLine', 'diversityKind', 'diversityWin', 'diversityNear', 'diversityKeep'];
const ORA = ['oThreatPrior', 'oLockVictim', 'oLockBreakLine', 'oKeep', 'oLockLinePlay', 'oHate1Maybe', 'oSelfFlip', 'oHate3',
  'oHateBack', 'oReplayMid', 'oPersist', 'oLowerTop', 'oPlayBoost', 'oHate1', 'oHate1Reuse', 'oSpirit1', 'oFireGuard'];
const CAP1 = new Set(['futureDiscount', 'oThreatPrior', 'oLockBreakLine', 'oHateBack']);

function parseArgs(argv) {
  const o = { pairs: 2000, budget: 400, seed: 7000001, out: '_spsa/run', workers: 0, c: 0.2, a: 0.002, vnw: 1000 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in o)) { console.error('未知の引数: ' + argv[i]); process.exit(1); }
    o[k] = k === 'out' ? argv[++i] : +argv[++i];
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

/* θ (名前 → 値) をエンジンに入れる */
function applyTheta(e, th, valnet) {
  const d = {}, o = {};
  for (const k of DSH) if (k in th) d[k] = th[k];
  for (const k of ORA) if (k in th) o[k] = th[k];
  e.setAiSpecialistWeights(d);
  e.setAiWeights(o);
  e.setAiValueNet(valnet, th.vnw);
}

if (!isMainThread) {
  const { src, cards, effects, budget, valnet } = workerData;
  const load = () => {
    const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
    ctx.globalThis = ctx;
    vm.runInNewContext(src, ctx, { filename: 'engine.js' });
    const e = ctx.module.exports;
    e.init(cards, effects); e.setAiLevel(2); e.setAiThinkBudget(budget); e.setAiOracle(true);
    return e;
  };
  const P = load(), M = load();
  /* 1局: plus が先手 (ps=0) か後手か。plus が勝てば 1、負けで -1、決着なし 0 */
  const game = (seed, ps) => {
    const ais = ps === 0 ? [P, M] : [M, P];
    P.setAiSpecialist(true, ps, 'dsh'); M.setAiSpecialist(true, 1 - ps, 'dsh');
    const [p0, p1] = decks(seed);
    let res = P.newGame({ p0, p1, seed, useControl: true });
    let guard = 0;
    while (res.winner === null && guard++ < 700) {
      const st = res.state;
      const side = res.requests.length ? res.requests[0].player : st.turn;
      const ai = ais[side];
      if (res.requests.length) { const q = res.requests[0]; res = P.apply(st, { type: 'choose', id: q.id, picks: ai.ai.answer(st, q) }); }
      else { const a = ai.ai.action(st); if (!a) break; res = P.apply(st, a); }
      if (res.error) break;
    }
    return res.winner === ps ? 1 : res.winner === 1 - ps ? -1 : 0;
  };
  parentPort.on('message', ({ plus, minus, seed }) => {
    applyTheta(P, plus, valnet); applyTheta(M, minus, valnet);
    parentPort.postMessage(game(seed, 0) + game(seed, 1));
  });
  return;
}

const opt = parseArgs(process.argv);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const valnet = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'valnet.json'), 'utf8'));
const thetaFile = path.join(ROOT, opt.out + '.theta.json');
const logFile = path.join(ROOT, opt.out + '.log');
fs.mkdirSync(path.dirname(thetaFile), { recursive: true });

/* 初期値は今のエンジンの値 (読み出し口が無く、モジュールの中に閉じているので、ソースの表をそのまま評価して読む) */
const table = (name) => {
  const i = src.indexOf('const ' + name + ' = {');
  return vm.runInNewContext('(' + src.slice(src.indexOf('{', i), src.indexOf('\n};', i) + 2) + ')');
};
const W0 = { AI_DSH_W: table('AI_DSH_W'), AI_LOCK_W: table('AI_LOCK_W') };
const init = { vnw: opt.vnw };
for (const k of DSH) init[k] = W0.AI_DSH_W[k];
for (const k of ORA) init[k] = W0.AI_LOCK_W[k];
for (const k in init) if (!(init[k] > 0)) { console.error('正でない初期値: ' + k + '=' + init[k]); process.exit(1); }
const saved = fs.existsSync(thetaFile) ? JSON.parse(fs.readFileSync(thetaFile, 'utf8')) : null;
const names = Object.keys(init);
const logT = {};
for (const k of names) logT[k] = Math.log(saved && saved.theta[k] > 0 ? saved.theta[k] : init[k]);
let done = saved ? saved.pairs : 0;
let net = saved ? saved.net : 0;

const toTheta = (lt, delta, sign) => {
  const th = {};
  for (const k of names) {
    let v = Math.exp(lt[k] + (delta ? sign * opt.c * delta[k] : 0));
    if (CAP1.has(k)) v = Math.min(v, 1);
    th[k] = v;
  }
  return th;
};
let rs = (opt.seed ^ done * 2654435761) >>> 0;
const rnd = () => { rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const nW = opt.workers || Math.max(1, Math.min(os.cpus().length - 1, 12));
const workers = Array.from({ length: nW }, () => new Worker(__filename, { workerData: { src, cards, effects, budget: opt.budget, valnet } }));
const run = (w, job) => new Promise((resolve, reject) => { w.once('message', resolve); w.once('error', reject); w.postMessage(job); });
const t0 = Date.now();

/* 働き手ごとに1組ずつ。組が終わるたびに重みを動かす (非同期で、少し古い θ から作った組が混ざるのは許す) */
async function loop(w) {
  while (done < opt.pairs) {
    const delta = {};
    for (const k of names) delta[k] = rnd() < 0.5 ? -1 : 1;
    const seed = opt.seed + done++;
    const score = await run(w, { plus: toTheta(logT, delta, 1), minus: toTheta(logT, delta, -1), seed });
    net += score;
    if (score) for (const k of names) logT[k] += opt.a * score * delta[k];
    if (done % 50 === 0) {
      const th = toTheta(logT);
      fs.writeFileSync(thetaFile, JSON.stringify({ pairs: done, net, theta: th }, null, 1));
      const moved = names.map(k => [k, th[k] / init[k]]).sort((x, y) => Math.abs(Math.log(y[1])) - Math.abs(Math.log(x[1]))).slice(0, 6);
      fs.appendFileSync(logFile, done + '組 ' + Math.round((Date.now() - t0) / 1000) + 's  大きく動いた: ' + moved.map(([k, r]) => k + '×' + r.toFixed(2)).join(' ') + '\n');
    }
  }
}
Promise.all(workers.map(loop)).then(() => {
  fs.writeFileSync(thetaFile, JSON.stringify({ pairs: done, net, theta: toTheta(logT) }, null, 1));
  console.log(done + '組 終わり ' + Math.round((Date.now() - t0) / 1000) + 's → ' + thetaFile);
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
