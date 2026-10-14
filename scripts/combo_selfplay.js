'use strict';
/*
 * コンボ学習のためのデータ集め: CPU 同士 (つよい・特化なし) をランダムな編成で戦わせ、
 * 各手番の始めに「手番をとる側の持ち札」(combo_features.js のトークン) と、そのときの CPU の点数 (aiScore) を残す。
 * 最後にどちらが勝ったか (y) と、同じ側の次の手番の始めの点数 (sn、次の手番が無ければ null) を付けて書き出す。
 *
 * 学習モデル (valnet) のデータとは置き場所 (_combo/) と種の範囲 (既定 900001〜) を分けてある。上書きしない。
 *
 *   node scripts/combo_selfplay.js --games 600 --budget 150 --seed 900001 --out _combo/data_900001.jsonl
 * デッキを決めて集める (そのデッキの側の局面だけ残す。相手は残りからランダム、先手後手は対局ごとに入れ替え):
 *   node scripts/combo_selfplay.js --deck PSYCHIC,DARKNESS,FIRE --games 550 --seed 910001 --out _combo/pdf_910001.jsonl
 * 1行 = 1局面: {"k":[トークン...], "s":点数, "sn":次の手番の点数, "y":1/0, "g":対局番号, "t":手番, "p":[自分の3プロトコル]}
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { comboTokens } = require('./combo_features.js');
const { PROTOCOLS } = require('./valnet_features.js');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const o = { games: 200, budget: 150, seed: 900001, out: '_combo/data.jsonl', workers: 0, deck: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games') o.games = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--seed') o.seed = +argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else if (a === '--deck') o.deck = argv[++i].split(',').map(x => x.trim().toUpperCase());
    else { console.error('未知の引数: ' + a); process.exit(1); }
  }
  return o;
}

/* valnet_selfplay.js と同じ作り方のランダムな編成 */
function decks(seed, fixed) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pool = PROTOCOLS.slice();
  const pick = () => pool.splice(Math.floor(rnd() * pool.length), 1)[0];
  if (!fixed) return [[pick(), pick(), pick()], [pick(), pick(), pick()]];
  for (const p of fixed) pool.splice(pool.indexOf(p), 1);
  const opp = [pick(), pick(), pick()];
  return seed % 2 ? [fixed, opp] : [opp, fixed];
}

if (!isMainThread) {
  const { src, cards, effects, jobs, budget, deck } = workerData;
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
    const pr = decks(job.seed, deck);
    const keepSide = deck ? (job.seed % 2 ? 0 : 1) : -1;
    let res = E.newGame({ p0: pr[0], p1: pr[1], seed: job.seed, useControl: true });
    const rows = [];
    let lastTurn = -1, guard = 0;
    while (res.winner === null && guard++ < 700) {
      const st = res.state;
      if (!res.requests.length && (st.turns || 0) !== lastTurn) {
        lastTurn = st.turns || 0;
        if (keepSide < 0 || st.turn === keepSide) rows.push({ k: comboTokens(st, st.turn), side: st.turn, t: lastTurn, s: Math.round(E.ai.score(st, st.turn)) });
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
      rows.forEach((r, i) => {
        const nx = rows.slice(i + 1).find(q => q.side === r.side);
        out.push(JSON.stringify({ k: r.k, s: r.s, sn: nx ? nx.s : null, y: r.side === res.winner ? 1 : 0, g: job.seed, t: r.t, p: pr[r.side] }));
      });
    }
  }
  parentPort.postMessage(out);
  return;
}

const opt = parseArgs(process.argv);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const outPath = path.join(ROOT, opt.out);
if (fs.existsSync(outPath)) { console.error('もうあるので書きません (上書きしない): ' + opt.out); process.exit(1); }
const jobs = Array.from({ length: opt.games }, (_, i) => ({ seed: opt.seed + i }));
const nW = opt.workers || Math.max(1, Math.min(os.cpus().length - 1, 12));
const chunks = Array.from({ length: nW }, () => []);
jobs.forEach((j, i) => chunks[i % nW].push(j));
const t0 = Date.now();
Promise.all(chunks.filter(c => c.length).map(c => new Promise((resolve, reject) => {
  const w = new Worker(__filename, { workerData: { src, cards, effects, jobs: c, budget: opt.budget, deck: opt.deck } });
  w.on('message', resolve); w.on('error', reject);
}))).then(parts => {
  const lines = parts.flat();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(opt.games + '局 → ' + lines.length + ' 局面  ' + Math.round((Date.now() - t0) / 1000) + 's  ' + opt.out);
}).catch(e => { console.error(e); process.exit(1); });
