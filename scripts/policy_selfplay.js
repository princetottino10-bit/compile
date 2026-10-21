'use strict';
/*
 * 方策モデル (手の選び方) のためのデータ集め: のぞき見の CPU 同士 (つよい・第1世代の学習モデル入り) をランダムな編成で戦わせ、
 * 手番の側が選んだ手を「見えている情報だけで作った候補の並び」の中の番号として書き出す。
 * 候補と入力の材料はエンジンの ai.policyCandidates (読みと同じ手順で各手を解決したもの) から取るので、
 * 学習の入力と、対戦中に方策モデルへ入る入力が同じになる。
 *
 *   node scripts/policy_selfplay.js --games 1000 --budget 600 --seed 2000001 --out _policy/data_001
 * 出力: <out>.w<番号>.jsonl (働き手ごと、1局終わるたびに追記するので途中で止めても残る)
 * 1行 = 1手: {"g":種,"t":手番,"b":打つ前の特徴量,"c":[[差の [番号,値] の並び, 手の種類のビット, 表で出すカード or null], ...],"y":選んだ候補,"v":[教師の読みの値 or null, ...],"w":勝ったか}
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { PROTOCOLS } = require('./valnet_features.js');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const o = { games: 100, budget: 600, seed: 2000001, out: '_policy/data', workers: 0, valnet: 'data/valnet.json', weight: 400, student: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games') o.games = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--seed') o.seed = +argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else if (a === '--valnet') o.valnet = argv[++i];
    else if (a === '--weight') o.weight = +argv[++i];
    else if (a === '--student') o.student = true;   // 見えない側の CPU が同じ盤面で選ぶ手も記録する (s、比べる用)
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

const key = (a) => JSON.stringify([a.type, a.card, a.line, !!a.faceUp, a.side === 0 || a.side === 1 ? a.side : -1]);
const r3 = (v) => Math.round(v * 1000) / 1000;
/* 見えない側の CPU (方策なし) が同じ盤面で選ぶ手 s と、根の各候補の値 sv。方策の重みを対戦なしで当たりをつける用 */
function studentPick(S, st, keys) {
  const rv = S.ai.rootValues(st);
  const vals = new Map(rv.candidates.map(c => [key(c.a), c]));
  return { s: rv.best ? keys.indexOf(key(rv.best)) : -1,
    sv: keys.map(k => (vals.has(k) ? [Math.round(vals.get(k).val), vals.get(k).val2 !== undefined ? 1 : 0] : null)) };
}

if (!isMainThread) {
  const { src, cards, effects, jobs, budget, valnet, weight, file, student } = workerData;
  const load = () => {
    const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
    ctx.globalThis = ctx;
    vm.runInNewContext(src, ctx, { filename: 'engine.js' });
    const e = ctx.module.exports;
    e.init(cards, effects); e.setAiLevel(2); e.setAiThinkBudget(budget);
    if (e.setAiSpecialist) e.setAiSpecialist(false, -1);
    e.setAiValueNet(valnet, weight);
    return e;
  };
  const T = load(), S = load();
  let rows = 0;
  for (const job of jobs) {
    const [p0, p1] = decks(job.seed);
    let res = T.newGame({ p0, p1, seed: job.seed, useControl: true });
    const out = [];
    let guard = 0;
    while (res.winner === null && guard++ < 700) {
      const st = res.state;
      if (res.requests.length) {
        const q = res.requests[0];
        T.setAiPeek(q.player);
        res = T.apply(st, { type: 'choose', id: q.id, picks: T.ai.answer(st, q) });
      } else {
        T.setAiPeek(st.turn);
        const pc = S.ai.policyCandidates(st);
        const rv = T.ai.rootValues(st);
        if (!rv.best) break;
        const keys = pc.cands.map(c => key(c.a));
        const y = keys.indexOf(key(rv.best));
        if (y >= 0 && pc.cands.length >= 2) {
          const vals = new Map(rv.candidates.map(c => [key(c.a), c.val]));
          out.push({ g: job.seed, t: st.turns || 0, side: st.turn, b: pc.before.map(r3),
            c: pc.cands.map(c => {
              const d = [];
              for (let i = 0; i < c.after.length; i++) { const v = r3(c.after[i] - pc.before[i]); if (v !== 0) d.push([i, v]); }
              return [d, c.flags.reduce((m, f, i) => m | (f ? 1 << i : 0), 0), c.def];
            }),
            y, v: keys.map(k => (vals.has(k) ? Math.round(vals.get(k)) : null)),
            ...(student ? studentPick(S, st, keys) : {}) });
        }
        res = T.apply(st, rv.best);
      }
      if (res.error) break;
    }
    if (res.winner === 0 || res.winner === 1) {
      fs.appendFileSync(file, out.map(r => { r.w = r.side === res.winner ? 1 : 0; delete r.side; return JSON.stringify(r); }).join('\n') + (out.length ? '\n' : ''));
      rows += out.length;
    }
  }
  parentPort.postMessage(rows);
  return;
}

const opt = parseArgs(process.argv);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const valnet = JSON.parse(fs.readFileSync(path.join(ROOT, opt.valnet), 'utf8'));
const jobs = Array.from({ length: opt.games }, (_, i) => ({ seed: opt.seed + i }));
const nW = opt.workers || Math.max(1, Math.min(os.cpus().length - 1, 12));
const chunks = Array.from({ length: nW }, () => []);
jobs.forEach((j, i) => chunks[i % nW].push(j));
fs.mkdirSync(path.dirname(path.join(ROOT, opt.out)), { recursive: true });
const t0 = Date.now();
Promise.all(chunks.map((c, wi) => c.length ? new Promise((resolve, reject) => {
  const file = path.join(ROOT, opt.out + '.w' + wi + '.jsonl');
  const w = new Worker(__filename, { workerData: { src, cards, effects, jobs: c, budget: opt.budget, valnet, weight: opt.weight, file, student: opt.student } });
  w.on('message', resolve); w.on('error', reject);
}) : 0)).then(parts => {
  const n = parts.reduce((s, v) => s + v, 0);
  console.log(opt.games + '局 → ' + n + ' 手  ' + Math.round((Date.now() - t0) / 1000) + 's  ' + opt.out + '.w*.jsonl');
}).catch(e => { console.error(e); process.exit(1); });
