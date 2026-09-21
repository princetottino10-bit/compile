'use strict';
/*
 * コンボ採掘 — 「2枚を続けて出すと、1枚ずつの合計より大きく得をする」組み合わせを探す。
 *
 * 前の版は「2ターン読んだ評価の差」で拾ったが、相手の応手のブレを拾ってしまい、
 * コンボでないものが大量に並んだ。ここでは相手の手番を挟まず、自分の2手だけを続けて指し、
 * 相互作用そのものを測る:
 *
 *   interaction(A,B) = V(A→B) − V(A) − V(B) + V(なし)
 *
 * 1枚ずつの効果を引いた残りなので、盤面の点数が増えるだけの手や、単体で強い手は消える。
 * 残るのは「Aを先に出したからBが活きた」ぶんだけ = 手筋。
 *
 * 自分の2手を続けて指すために、相手の手番は飛ばす (turn/phase を戻す)。
 * 相手の応手で結果が変わる影響を混ぜないための措置で、実戦の評価ではない。
 *
 * 使い方:
 *   node scripts/ai_combo_mine.js --games 40 --out _shots/combos.jsonl
 *   node scripts/ai_combo_mine.js --summary _shots/combos.jsonl
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
  /* 教わった手筋 (docs/ai-combos.md) のカードが揃う編成 */
  [['WATER', 'FIRE', 'LIFE'], ['GRAVITY', 'SPIRIT', 'DEATH']],
  [['GRAVITY', 'SPIRIT', 'PLAGUE'], ['FIRE', 'PSYCHIC', 'LIGHT']],
  [['PSYCHIC', 'DARKNESS', 'SPEED'], ['DEATH', 'GRAVITY', 'PLAGUE']],
];

function parseArgs(argv) {
  const o = { games: 40, workers: 0, seed: 20261101, budget: 900, every: 3, margin: 40,
    out: path.join(ROOT, '_shots', 'combos.jsonl'), summary: null, filter: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games') o.games = +argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else if (a === '--seed') o.seed = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--every') o.every = +argv[++i];        // 何手に1局面を調べるか
    else if (a === '--margin') o.margin = +argv[++i];      // 手筋とみなす相互作用の大きさ
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--summary') o.summary = argv[++i];
    else if (a === '--filter') o.filter = argv[++i].split(',').map(s => s.trim().toUpperCase());
    else { console.error('未知の引数: ' + a); process.exit(1); }
  }
  return o;
}

/* ===================================================================== */
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
  const Sim = load();    // 相互作用の測定 (選択は通常 AI の答え)
  Play.setAiLevel(2); Play.setAiThinkBudget(cfg.budget);
  Sim.setAiLevel(1);

  const resolve = (E, res) => {
    let guard = 0;
    while (res && !res.error && res.requests.length && guard++ < 40) {
      const req = res.requests[0];
      res = E.apply(res.state, { type: 'choose', id: req.id, picks: E.ai.answer(res.state, req) });
    }
    return res;
  };
  const step = (E, res) => {
    if (res.requests.length) {
      const req = res.requests[0];
      return E.apply(res.state, { type: 'choose', id: req.id, picks: E.ai.answer(res.state, req) });
    }
    const a = E.ai.action(res.state);
    return a ? E.apply(res.state, a) : null;
  };
  const describe = (st, side, a) => {
    if (!a) return null;
    if (a.type === 'refresh') return 'リフレッシュ';
    const d = st.cards[a.card].def;
    return d + (a.faceUp ? ' 表' : ' 裏') + ' L' + a.line + (a.side !== undefined && a.side !== side ? ' (相手側)' : '');
  };

  /* 自分の1手を解決し、相手の手番を飛ばして「もう1手指せる状態」に戻す。
     相手の応手のブレを混ぜずに、2枚の組み合わせだけを測るための措置 */
  function myMoveOnly(st, me, action) {
    const res = resolve(Sim, Sim.apply(st, action));
    if (!res || res.error || res.requests.length) return null;
    const s = res.state;
    if (s.winner !== null) return { state: s, done: true };
    const next = structuredClone(s);
    next.turn = me;
    next.phase = 'action';
    return { state: next, done: false };
  }

  /* コンパイル圏 (10点以上でリード) に届いたラインの数。
     2枚で初めて届いたなら、効果の組み合わせではなく点数の足し算による手筋 */
  const compiledCount = (st, me) => st.players[me].protocols.filter(p => p.compiled).length;

  function reachCount(st, me) {
    let n = 0;
    for (let l = 0; l < 3; l++) {
      if (st.players[me].protocols[l].compiled) continue;
      const total = (side) => st.lines[l][side].reduce((v, u) => v + (st.cards[u].faceUp ? Sim.defs[st.cards[u].def].value : 2), 0);
      if (total(me) >= 10 && total(me) > total(1 - me)) n++;
    }
    return n;
  }

  function analyse(job, pos) {
    const { state: st, side: me } = pos;
    const view = Sim.ai.informationState(st, me);
    const v0 = Sim.ai.score(view, me);
    const plays = Sim.legalActions(view).filter(a => a.type === 'play');
    if (plays.length < 2) return [];

    /* 1手ずつの価値 */
    const single = [];
    for (const a of plays) {
      const r = myMoveOnly(view, me, a);
      if (!r) continue;
      single.push({ a, v: Sim.ai.score(r.state, me), reach: reachCount(r.state, me),
        comp: compiledCount(r.state, me), next: r.done ? null : r.state });
    }
    if (single.length < 2) return [];
    const best1 = Math.max(...single.map(x => x.v));
    const reach0 = reachCount(view, me);
    const comp0 = compiledCount(view, me);
    const byCard = new Map();
    for (const x of single) {
      const key = view.cards[x.a.card].def;
      if (!byCard.has(key) || byCard.get(key).v < x.v) byCard.set(key, { v: x.v, reach: x.reach, comp: x.comp });
    }

    const rows = [];
    for (const first of single) {
      if (!first.next) continue;
      for (const b of Sim.legalActions(first.next).filter(a => a.type === 'play')) {
        if (b.card === first.a.card) continue;
        const r2 = myMoveOnly(first.next, me, b);
        if (!r2) continue;
        const v2 = Sim.ai.score(r2.state, me);
        /* B 単体の価値は、同じカードを先に出したときの一番良い置き方で代表させる */
        const bDef = first.next.cards[b.card].def;
        const bAlone = byCard.get(bDef);
        if (!bAlone) continue;
        const vB = bAlone.v;
        const interaction = v2 - first.v - vB + v0;
        if (interaction < cfg.margin) continue;
        /* 2手で勝つ・負ける局面は評価が桁違い (±1e9) になる。
           実戦では間に相手の手番が入るので、組み合わせの力とは言えない */
        if ([v0, first.v, vB, v2].some(x => Math.abs(x) > 1e7)) continue;
        rows.push({
          flagged: true,
          game: { p0: job.p0, p1: job.p1, seed: job.seed }, ply: pos.ply, side: me,
          setupDef: view.cards[first.a.card].def, payoffDef: bDef,
          chosen: describe(view, me, first.a), best: describe(first.next, me, b),
          interaction: Math.round(interaction),
          /* 2枚で初めてコンパイル圏に届いたか (効果ではなく点数の足し算による手筋) */
          threshold: reachCount(r2.state, me) > Math.max(first.reach, bAlone.reach, reach0)
            || compiledCount(r2.state, me) > Math.max(first.comp, bAlone.comp, comp0),
          v: { none: Math.round(v0), a: Math.round(first.v), b: Math.round(vB), ab: Math.round(v2), best1: Math.round(best1) },
          state: st
        });
      }
    }
    /* 同じ組み合わせは一番大きいものだけ残す */
    const top = new Map();
    for (const r of rows) {
      const key = r.setupDef + '>' + r.payoffDef;
      if (!top.has(key) || top.get(key).interaction < r.interaction) top.set(key, r);
    }
    return [...top.values()];
  }

  for (const job of jobs) {
    let res = Play.newGame({ p0: job.p0, p1: job.p1, seed: job.seed, useControl: true });
    let decision = 0, guard = 0;
    while (res && !res.error && res.winner === null && guard++ < 700) {
      if (!res.requests.length && res.state.phase === 'action') {
        const me = res.state.turn;
        if (res.state.players[me].hand.length >= 2 && (decision++ % cfg.every) === job.offset) {
          for (const row of analyse(job, { state: structuredClone(res.state), side: me, ply: guard })) {
            parentPort.postMessage({ row });
          }
        }
      }
      res = step(Play, res);
    }
    parentPort.postMessage({ gameDone: true });
  }
  parentPort.postMessage({ done: true });
  return;
}

/* ===================================================================== */
const opt = parseArgs(process.argv);

if (opt.summary) {
  const rows = fs.readFileSync(path.resolve(ROOT, opt.summary), 'utf8').trim().split('\n').map(JSON.parse);
  const groups = { text: rows.filter(r => !r.threshold), threshold: rows.filter(r => r.threshold) };
  const summarise = (list, title) => {
  const pairs = new Map();
  for (const r of list) {
    const key = r.setupDef + ' → ' + r.payoffDef;
    const g = pairs.get(key) || { n: 0, sum: 0, best: null };
    g.n++; g.sum += r.interaction;
    if (!g.best || g.best.interaction < r.interaction) g.best = r;
    pairs.set(key, g);
  }
  console.log('\n## ' + title + ' — ' + list.length + '件 / ' + pairs.size + '種類 (先に出す → 次に出す)');
  for (const [key, g] of [...pairs.entries()].sort((a, b) => b[1].n - a[1].n || b[1].sum / b[1].n - a[1].sum / a[1].n).slice(0, 20)) {
    const b = g.best;
    console.log('  ' + String(g.n).padStart(3) + '回  平均 +' + Math.round(g.sum / g.n) + '  ' + key);
    console.log('        例 [' + b.game.p0.join('/') + ' vs ' + b.game.p1.join('/') + ' ply ' + b.ply + ' P' + (b.side + 1) + '] '
      + b.chosen + ' → ' + b.best + '  (なし ' + b.v.none + ' / A ' + b.v.a + ' / B ' + b.v.b + ' / AB ' + b.v.ab + ')');
  }
  };
  console.log('組み合わせ ' + rows.length + ' 件 (相互作用 = 2枚でやった得 − 1枚ずつの得)');
  summarise(groups.text, '効果の組み合わせ');
  summarise(groups.threshold, '点数の足し算でコンパイル圏に届く');
  process.exit(0);
}

const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');

const POOL = opt.filter ? MATCHUPS.filter(m => opt.filter.some(p => m[0].includes(p) || m[1].includes(p))) : MATCHUPS;
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

fs.mkdirSync(path.dirname(path.resolve(ROOT, opt.out)), { recursive: true });
const outFd = fs.openSync(path.resolve(ROOT, opt.out), 'a');
console.log('対局 ' + opt.games + ' / 並列 ' + workerCount + ' / ' + opt.every + '手に1局面 / 相互作用 ' + opt.margin + '以上 → ' + opt.out);

const started = Date.now();
let rows = 0, games = 0, finished = 0;
for (const chunk of chunks) {
  const w = new Worker(__filename, { workerData: { src, cards, effects, jobs: chunk, cfg: opt } });
  w.on('message', (msg) => {
    if (msg.row) {
      rows++;
      fs.writeSync(outFd, JSON.stringify(msg.row) + '\n');
    } else if (msg.gameDone) {
      games++;
      console.log('対局 ' + games + '/' + opt.games + ' — 組み合わせ ' + rows
        + ' / ' + ((Date.now() - started) / 60000).toFixed(1) + '分');
    } else if (msg.done && ++finished === workerCount) {
      console.log('完了: 組み合わせ ' + rows + ' 件');
      process.exit(0);
    }
  });
  w.on('error', (e) => { console.error(e); process.exit(1); });
}
