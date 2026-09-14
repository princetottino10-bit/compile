'use strict';
/*
 * AI 悪手マイニング — 実戦で AI が指した手より、明確に勝率の高い手があった局面を拾う。
 *
 * 1. 探索 AI (難易度2) 同士で対局し、手番の局面をサンプリングして保存する
 * 2. 各局面で「AI が選んだ手」と「1手読みで上位の候補」をそれぞれ終局までプレイアウトする
 *    - 相手の非公開カードは、手番側の aiInformationState を salt 違いでサンプリングした世界で打つ
 *      (AI が知り得ない正体で採点しない)。候補間で同じ salt を使い、比較のばらつきを抑える
 *    - プレイアウトは通常 AI (難易度1) 同士
 * 3. 選んだ手より勝率が threshold 以上高い候補があれば、追加のプレイアウトで確かめてから出力する
 *
 * 使い方:
 *   node scripts/ai_blunders.js --games 30 --out _shots/blunders.jsonl
 *   node scripts/ai_blunders.js --games 20 --pool lock --filter PSYCHIC
 *   node scripts/ai_blunders.js --summary _shots/blunders.jsonl      # 型ごとに集計して表示
 *
 * 出力 (JSONL): 1行 = 1局面。flagged=true が悪手候補。
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const ROOT = path.join(__dirname, '..');

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
  [['UNITY', 'DIVERSITY', 'ASSIMILATION'], ['FIRE', 'WATER', 'METAL']],
  [['UNITY', 'CHAOS', 'TIME'], ['DIVERSITY', 'LUCK', 'WAR']],
  [['DIVERSITY', 'MIRROR', 'PEACE'], ['UNITY', 'SMOKE', 'ICE']],
  [['UNITY', 'DIVERSITY', 'CLARITY'], ['DEATH', 'SPEED', 'DARKNESS']],
];
const LOCK_MATCHUPS = [
  [['PSYCHIC', 'DARKNESS', 'FIRE'], ['METAL', 'LIGHT', 'WATER']],
  [['PSYCHIC', 'DARKNESS', 'SPEED'], ['DEATH', 'GRAVITY', 'PLAGUE']],
  [['PSYCHIC', 'TIME', 'WAR'], ['DARKNESS', 'HATE', 'LIFE']],
  [['CHAOS', 'PSYCHIC', 'ICE'], ['SPIRIT', 'LOVE', 'COURAGE']],
  [['PSYCHIC', 'DARKNESS', 'LUCK'], ['TIME', 'APATHY', 'FEAR']],
  [['PSYCHIC', 'SPEED', 'CHAOS'], ['DARKNESS', 'WATER', 'CORRUPTION']],
];

function parseArgs(argv) {
  const o = {
    games: 20, workers: 0, seed: 20260915, budget: 590, every: 4,
    k: 4, m: 12, m2: 36, screen: 0.15, threshold: 0.2, out: path.join(ROOT, '_shots', 'blunders.jsonl'),
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games') o.games = +argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else if (a === '--seed') o.seed = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--every') o.every = +argv[++i];          // 何手に1局面を調べるか
    else if (a === '--k') o.k = +argv[++i];                  // 選んだ手を含む候補数
    else if (a === '--m') o.m = +argv[++i];                  // 候補ごとのプレイアウト数 (一次)
    else if (a === '--m2') o.m2 = +argv[++i];                // 追試のプレイアウト数
    else if (a === '--screen') o.screen = +argv[++i];        // 追試に回す勝率差
    else if (a === '--threshold') o.threshold = +argv[++i];  // 悪手と判定する勝率差
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--pool') o.pool = argv[++i];
    else if (a === '--filter') o.filter = argv[++i].split(',').map(s => s.trim().toUpperCase());
    else if (a === '--summary') o.summary = argv[++i];
    else { console.error('未知の引数: ' + a); process.exit(1); }
  }
  return o;
}

/* =====================================================================
 * Worker
 * ===================================================================== */
if (!isMainThread) {
  const { src, cards, effects, jobs, cfg } = workerData;
  const load = () => {
    const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
    ctx.globalThis = ctx;
    vm.runInNewContext(src, ctx, { filename: 'engine.js' });
    const E = ctx.module.exports || ctx.CompileEngine;
    E.init(cards, effects);
    return E;
  };
  const Play = load();   // 実戦 (探索 AI)
  const Roll = load();   // プレイアウト (通常 AI)
  Play.setAiLevel(2); Play.setAiThinkBudget(cfg.budget);
  Roll.setAiLevel(1);
  const D = Play.defs;

  for (const job of jobs) {
    const positions = playAndSample(job);
    for (const pos of positions) parentPort.postMessage({ row: evaluate(job, pos) });
    parentPort.postMessage({ gameDone: true });
  }
  parentPort.postMessage({ done: true });

  function step(E, res) {
    if (res.requests.length) {
      const req = res.requests[0];
      return E.apply(res.state, { type: 'choose', id: req.id, picks: E.ai.answer(res.state, req) });
    }
    const a = E.ai.action(res.state);
    return a ? E.apply(res.state, a) : null;
  }

  function playAndSample(job) {
    let res = Play.newGame({ p0: job.p0, p1: job.p1, seed: job.seed, useControl: true });
    const out = [];
    let decision = 0, guard = 0;
    while (res.winner === null && guard++ < 700) {
      if (!res.requests.length && res.state.phase === 'action') {
        const acts = Play.legalActions(res.state);
        if (acts.length > 1 && (decision++ % cfg.every) === job.offset) {
          /* ai.action (難易度2・PIMC 1) と同じ手順で選び、ルートの評価値も残す */
          const rv = Play.ai.rootValues(res.state);
          const a = rv.best;
          if (!a) break;
          out.push({ state: structuredClone(res.state), side: res.state.turn, chosen: a, ply: guard, root: rv.candidates });
          res = Play.apply(res.state, a);
          if (res.error) break;
          continue;
        }
      }
      res = step(Play, res);
      if (!res || res.error) break;
    }
    for (const p of out) p.winner = res ? res.winner : null;
    return out;
  }

  function resolve(E, res) {
    let guard = 0;
    while (res && !res.error && res.requests.length && guard++ < 40) {
      const req = res.requests[0];
      res = E.apply(res.state, { type: 'choose', id: req.id, picks: E.ai.answer(res.state, req) });
    }
    return res;
  }

  /* 手番側の情報状態 (salt) で action を指し、通常 AI 同士で終局まで打つ。勝ち=1 / 負け=0 / 未決着=0.5 */
  function rollout(st, side, action, salt) {
    const view = Roll.ai.informationState(st, side, salt);
    let res = resolve(Roll, Roll.apply(view, action));
    let guard = 0;
    while (res && !res.error && res.state.winner === null && guard++ < 500) {
      res = step(Roll, res);
    }
    if (!res || res.error) return null;
    const w = res.state.winner;
    return w === null ? 0.5 : (w === side ? 1 : 0);
  }

  function sameAction(a, b) {
    return a.type === b.type && a.card === b.card && a.line === b.line && !!a.faceUp === !!b.faceUp && a.side === b.side;
  }

  /* 候補: AI の選択 + 1手読み (情報状態・smartPicks 解決後の aiScore) の上位 */
  function candidates(st, side, chosen) {
    const view = Roll.ai.informationState(st, side);
    const scored = [];
    for (const a of Roll.legalActions(view)) {
      const res = resolve(Roll, Roll.apply(view, a));
      if (!res || res.error || res.requests.length) continue;
      scored.push({ a, s1: Roll.ai.score(res.state, side) });
    }
    scored.sort((x, y) => y.s1 - x.s1);
    const list = [{ a: chosen, chosen: true, s1: (scored.find(x => sameAction(x.a, chosen)) || {}).s1 }];
    for (const x of scored) {
      if (list.length >= cfg.k) break;
      if (!sameAction(x.a, chosen)) list.push({ a: x.a, chosen: false, s1: x.s1 });
    }
    return list;
  }

  function runBatch(c, st, side, from, count) {
    for (let salt = from; salt < from + count; salt++) {
      const r = rollout(st, side, c.a, salt);
      if (r === null) { c.errors = (c.errors || 0) + 1; continue; }
      c.sum = (c.sum || 0) + r; c.n = (c.n || 0) + 1;
    }
  }
  function rate(c) { return c.n ? c.sum / c.n : 0; }

  function evaluate(job, pos) {
    const { state: st, side, chosen } = pos;
    const cands = candidates(st, side, chosen);
    for (const c of cands) runBatch(c, st, side, 1, cfg.m);
    const ch = cands[0];
    let best = cands.slice(1).sort((x, y) => rate(y) - rate(x))[0];
    let confirmed = false;
    if (best && rate(best) - rate(ch) >= cfg.screen) {
      runBatch(ch, st, side, 1 + cfg.m, cfg.m2);
      runBatch(best, st, side, 1 + cfg.m, cfg.m2);
      confirmed = rate(best) - rate(ch) >= cfg.threshold;
    }
    return {
      flagged: confirmed,
      game: { p0: job.p0, p1: job.p1, seed: job.seed }, ply: pos.ply, side, winner: pos.winner,
      board: describeBoard(st, side),
      chosen: describe(st, side, ch.a), chosenRate: rate(ch), chosenN: ch.n,
      best: best ? describe(st, side, best.a) : null, bestRate: best ? rate(best) : null, bestN: best ? best.n : 0,
      candidates: cands.map(c => ({ act: describe(st, side, c.a), rate: +rate(c).toFixed(3), n: c.n, s1: c.s1 })),
      kind: best ? classify(st, side, ch.a, best.a) : null,
      /* 探索 AI がルートでつけた評価。空なら終盤の読み切りで決めた手 */
      root: (pos.root || []).slice().sort((x, y) => y.val - x.val).slice(0, 8).map(c => ({
        act: describe(st, side, c.a), val: Math.round(c.val), val1: Math.round(c.val1),
        val2: c.val2 === undefined ? null : Math.round(c.val2), bias: Math.round(c.bias),
      })),
      state: confirmed ? st : undefined,
    };
  }

  /* 表示用。手番側から見える情報だけを書く (相手の裏向きは ?) */
  function describeBoard(st, side) {
    const op = 1 - side;
    const lines = [];
    for (let l = 0; l < 3; l++) {
      const card = (uid, owner) => {
        const c = st.cards[uid];
        if (c.faceUp) return c.def;
        return owner === side ? c.def.toLowerCase() : '?';
      };
      const me = st.players[side].protocols[l], them = st.players[op].protocols[l];
      lines.push({
        line: l,
        mine: me.name + (me.compiled ? '*' : '') + ' ' + Play.lineTotal(st, l, side) + ' [' + st.lines[l][side].map(u => card(u, side)).join(',') + ']',
        theirs: them.name + (them.compiled ? '*' : '') + ' ' + Play.lineTotal(st, l, op) + ' [' + st.lines[l][op].map(u => card(u, op)).join(',') + ']',
      });
    }
    return {
      lines,
      hand: st.players[side].hand.map(u => st.cards[u].def),
      oppHand: st.players[op].hand.length,
      decks: [st.players[side].deck.length, st.players[op].deck.length],
      control: st.control === side ? 'me' : st.control === op ? 'opp' : null,
      trashTop: st.players[op].trash.slice(-3).map(u => st.cards[u].def),
    };
  }

  function describe(st, side, a) {
    if (!a) return null;
    if (a.type === 'play') {
      const d = st.cards[a.card].def;
      const target = a.side !== undefined && a.side !== side ? ' (相手側)' : '';
      return d + (a.faceUp ? ' 表' : ' 裏') + ' L' + a.line + target;
    }
    if (a.type === 'refresh') return 'リフレッシュ';
    return JSON.stringify(a);
  }

  /* 悪手の型: 何が違ったか */
  function classify(st, side, a, b) {
    if (a.type !== b.type) return a.type + '→' + b.type;
    if (a.type !== 'play') return 'other';
    const sameCard = a.card === b.card;
    const parts = [];
    if (!sameCard) parts.push('別カード');
    if (a.line !== b.line) parts.push('別ライン');
    if (!!a.faceUp !== !!b.faceUp) parts.push(a.faceUp ? '表→裏' : '裏→表');
    if (!parts.length) parts.push('相手側/自分側');
    /* 相手のコンパイル目前ラインを塞いだか、自分のコンパイル圏に入れたか */
    const op = 1 - side;
    const threat = (l) => !st.players[op].protocols[l].compiled && Play.lineTotal(st, l, op) >= 8
      && Play.lineTotal(st, l, op) >= Play.lineTotal(st, l, side);
    if (threat(b.line) && !threat(a.line)) parts.push('相手の10目前ライン');
    return parts.join('+');
  }
  return;
}

/* =====================================================================
 * Main
 * ===================================================================== */
const opt = parseArgs(process.argv);

if (opt.summary) {
  const rows = fs.readFileSync(opt.summary, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  const flagged = rows.filter(r => r.flagged);
  console.log('局面 ' + rows.length + ' / 悪手候補 ' + flagged.length + ' (' + (flagged.length / Math.max(1, rows.length) * 100).toFixed(1) + '%)');
  const byKind = {};
  for (const r of flagged) (byKind[r.kind] = byKind[r.kind] || []).push(r);
  for (const [kind, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
    const gap = list.reduce((s, r) => s + (r.bestRate - r.chosenRate), 0) / list.length;
    console.log('\n## ' + kind + ' — ' + list.length + '件 (平均勝率差 ' + (gap * 100).toFixed(0) + 'pt)');
    for (const r of list.slice(0, 6)) {
      console.log('  [' + r.game.p0.join('/') + ' vs ' + r.game.p1.join('/') + ' seed ' + r.game.seed + ' ply ' + r.ply + ' P' + (r.side + 1) + ']'
        + ' 選択 ' + r.chosen + ' ' + (r.chosenRate * 100).toFixed(0) + '% → ' + r.best + ' ' + (r.bestRate * 100).toFixed(0) + '%');
    }
  }
  process.exit(0);
}

const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');

const BASE = opt.pool === 'lock' ? MATCHUPS.concat(LOCK_MATCHUPS) : MATCHUPS;
const POOL = opt.filter ? BASE.filter(m => opt.filter.some(p => m[0].includes(p) || m[1].includes(p))) : BASE;
if (!POOL.length) { console.error('--filter に一致する編成がありません'); process.exit(1); }

const jobs = [];
for (let i = 0; i < opt.games; i++) {
  const pair = POOL[i % POOL.length];
  const swap = (i >> 1) % 2 === 1;
  jobs.push({ p0: swap ? pair[1] : pair[0], p1: swap ? pair[0] : pair[1], seed: opt.seed + i, offset: i % opt.every });
}
const workerCount = Math.max(1, Math.min(opt.workers || (os.cpus().length - 1), jobs.length));
const chunks = Array.from({ length: workerCount }, () => []);
jobs.forEach((j, i) => chunks[i % workerCount].push(j));

fs.mkdirSync(path.dirname(opt.out), { recursive: true });
const outFd = fs.openSync(opt.out, 'a');
console.log('対局 ' + opt.games + ' / 並列 ' + workerCount + ' / ' + opt.every + '手に1局面 / 候補 ' + opt.k
  + ' / プレイアウト ' + opt.m + '+' + opt.m2 + ' / 判定差 ' + opt.threshold + ' → ' + opt.out);

const started = Date.now();
let rows = 0, flagged = 0, games = 0, finished = 0;
for (const chunk of chunks) {
  const w = new Worker(__filename, { workerData: { src, cards, effects, jobs: chunk, cfg: opt } });
  w.on('message', (msg) => {
    if (msg.row) {
      rows++;
      if (msg.row.flagged) {
        flagged++;
        const r = msg.row;
        console.log('悪手候補 [' + r.kind + '] ' + r.chosen + ' ' + (r.chosenRate * 100).toFixed(0) + '% → ' + r.best + ' ' + (r.bestRate * 100).toFixed(0) + '%');
      }
      fs.writeSync(outFd, JSON.stringify(msg.row) + '\n');
    } else if (msg.gameDone) {
      games++;
      console.log('対局 ' + games + '/' + opt.games + ' 済 — 局面 ' + rows + ' / 悪手候補 ' + flagged + ' / ' + ((Date.now() - started) / 60000).toFixed(1) + '分');
    } else if (msg.done && ++finished === workerCount) {
      fs.closeSync(outFd);
      console.log('完了: 局面 ' + rows + ' / 悪手候補 ' + flagged);
    }
  });
  w.on('error', (e) => { console.error('worker error:', e); process.exit(1); });
}
