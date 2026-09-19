'use strict';
/*
 * 悪手判定の再検証 — ai_blunders.js が拾った局面を、別のプレイアウト設定で測り直す。
 *
 * ai_blunders のプレイアウトは通常 AI (難易度1) 同士。難易度1が follow-up を活かせない手
 * (例: リフレッシュして手札を戻し、次のターンに強い手を打つ) は、実際より悪く出る。
 * ここでは同じ局面・同じ手を、指定した難易度・思考時間で打ち直して勝率を比べる。
 *
 * 使い方:
 *   node scripts/ai_replay_check.js --in _shots/blunders_new.jsonl --n 32 --level 2 --budget 80
 *   node scripts/ai_replay_check.js --in ... --only refresh      # リフレッシュ絡みだけ
 *
 * 出力: 局面ごとに [選んだ手 / 最良とされた手] の勝率を、元の測定値と並べて表示する。
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const o = { in: '_shots/blunders_new.jsonl', n: 32, level: 2, budget: 80, only: 'all', workers: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') o.in = argv[++i];
    else if (a === '--n') o.n = +argv[++i];
    else if (a === '--level') o.level = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--only') o.only = argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else { console.error('未知の引数: ' + a); process.exit(1); }
  }
  return o;
}

/* 表記 ("LUCK_4 表 L0" / "リフレッシュ") から legalActions の手を引き当てる */
function findAction(E, st, label) {
  if (/リフレッシュ/.test(label)) return { type: 'refresh' };
  const m = /^(\S+)\s+(表|裏)\s+L(\d)$/.exec(label);
  if (!m) return null;
  for (const a of E.legalActions(st)) {
    if (a.type !== 'play') continue;
    const def = st.cards[a.card].def;
    if (def !== m[1]) continue;
    if (!!a.faceUp !== (m[2] === '表')) continue;
    if (a.line !== +m[3]) continue;
    return a;
  }
  return null;
}

if (!isMainThread) {
  const { src, cards, effects, rows, cfg } = workerData;
  const load = () => {
    const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
    ctx.globalThis = ctx;
    vm.runInNewContext(src, ctx, { filename: 'engine.js' });
    const E = ctx.module.exports || ctx.CompileEngine;
    E.init(cards, effects);
    return E;
  };
  const Roll = load();
  Roll.setAiLevel(cfg.level);
  if (cfg.level >= 2) Roll.setAiThinkBudget(cfg.budget);

  const resolve = (res) => {
    let guard = 0;
    while (res && !res.error && res.requests.length && guard++ < 40) {
      const req = res.requests[0];
      res = Roll.apply(res.state, { type: 'choose', id: req.id, picks: Roll.ai.answer(res.state, req) });
    }
    return res;
  };
  const step = (res) => {
    if (res.requests.length) {
      const req = res.requests[0];
      return Roll.apply(res.state, { type: 'choose', id: req.id, picks: Roll.ai.answer(res.state, req) });
    }
    const a = Roll.ai.action(res.state);
    return a ? Roll.apply(res.state, a) : null;
  };
  const rollout = (st, side, action, salt) => {
    const view = Roll.ai.informationState(st, side, salt);
    const act = findAction(Roll, view, action);
    if (!act) return null;
    let res = resolve(Roll.apply(view, act));
    let guard = 0;
    while (res && !res.error && res.state.winner === null && guard++ < 500) res = step(res);
    if (!res || res.error) return null;
    const w = res.state.winner;
    return w === null ? 0.5 : (w === side ? 1 : 0);
  };

  for (const row of rows) {
    const out = { ply: row.ply, chosen: row.chosen, best: row.best, rates: {} };
    for (const label of [row.chosen, row.best]) {
      let sum = 0, n = 0, err = 0;
      for (let salt = 1; salt <= cfg.n; salt++) {
        const r = rollout(row.state, row.side, label, salt);
        if (r === null) { err++; continue; }
        sum += r; n++;
      }
      out.rates[label] = { rate: n ? sum / n : null, n, err };
    }
    parentPort.postMessage({ out });
  }
  parentPort.postMessage({ done: true });
  return;
}

const opt = parseArgs(process.argv.slice(2));
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');

let rows = fs.readFileSync(path.join(ROOT, opt.in), 'utf8').trim().split('\n')
  .map(JSON.parse).filter(r => r.flagged && r.best);
if (opt.only === 'refresh') rows = rows.filter(r => /リフレッシュ/.test(r.chosen) || /リフレッシュ/.test(r.best));
if (!rows.length) { console.error('対象の局面がありません'); process.exit(1); }

const workerCount = Math.max(1, Math.min(opt.workers || (os.cpus().length - 1), rows.length));
const chunks = Array.from({ length: workerCount }, () => []);
rows.forEach((r, i) => chunks[i % workerCount].push(r));

console.log('局面 ' + rows.length + ' / プレイアウト ' + opt.n + ' / 難易度 ' + opt.level
  + (opt.level >= 2 ? ' (思考 ' + opt.budget + 'ms)' : '') + ' / 並列 ' + workerCount);

const started = Date.now();
const results = [];
let finished = 0;
for (const chunk of chunks) {
  const w = new Worker(__filename, { workerData: { src, cards, effects, rows: chunk, cfg: opt } });
  w.on('message', (msg) => {
    if (msg.out) results.push(msg.out);
    else if (msg.done && ++finished === workerCount) report();
  });
  w.on('error', (e) => { console.error(e); process.exit(1); });
}

function pct(v) { return v === null || v === undefined ? ' - ' : (v * 100).toFixed(0) + '%'; }

function report() {
  const orig = new Map(rows.map(r => [r.ply + '|' + r.chosen, r]));
  results.sort((a, b) => a.ply - b.ply);
  console.log('');
  for (const r of results) {
    const o = orig.get(r.ply + '|' + r.chosen);
    const c = r.rates[r.chosen] || {}, b = r.rates[r.best] || {};
    const diff = (b.rate !== null && c.rate !== null) ? (b.rate - c.rate) * 100 : null;
    console.log('ply ' + r.ply);
    console.log('  選んだ手 ' + r.chosen + ': ' + pct(c.rate) + ' (元の測定 ' + pct(o && o.chosenRate) + ')');
    console.log('  最良の手 ' + r.best + ': ' + pct(b.rate) + ' (元の測定 ' + pct(o && o.bestRate) + ')');
    console.log('  差 ' + (diff === null ? '-' : diff.toFixed(0) + 'pt')
      + (diff !== null && diff < 10 ? '  → 悪手と言えない (プレイアウトを強くすると差が消える)' : ''));
  }
  console.log('\n所要 ' + ((Date.now() - started) / 60000).toFixed(1) + '分');
  process.exit(0);
}
