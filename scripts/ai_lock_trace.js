'use strict';
/*
 * ロックを作ったのに負けた試合を集める — サイキック① ロック (覆われた表向きの PSYCHIC_2) を
 * 作れた試合だけを残し、勝った試合と負けた試合で「ロックのあと何が起きたか」を比べる。
 *
 * ぱぱぱのぱは PSYCHIC / DARKNESS / WAR で最強 (FIRE / WATER / SPEED) に 87% 勝つが、
 * 同じデッキの CPU (psylock 特化) は 30%、ロックを作れた試合でも 41% しか勝てない。
 * ロックのあとの指し方の差を探すための材料を作る。
 *
 * 使い方:
 *   node scripts/ai_lock_trace.js --games 200 --deck WAR,DARKNESS,PSYCHIC --out _shots/lock_trace.jsonl
 *
 * 出力:
 *   - 画面: ロックあり勝ち / 負けの比較 (ロックを作った手番、そのときのコンパイル数、ロックが壊れたか など)
 *   - --out: ロックを作った試合ごとに1行 (seed・先後・全部の手・手番ごとの盤面の要約)
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const ROOT = path.join(__dirname, '..');
const OPP_DECK = ['FIRE', 'WATER', 'SPEED'];   // 最強 (dsh 特化)
const LOCK_CARD = 'PSYCHIC_2';                  // サイキック①

function parseArgs(argv) {
  const o = { games: 200, deck: ['WAR', 'DARKNESS', 'PSYCHIC'], out: '_shots/lock_trace.jsonl', seed: 20261005, workers: 0, budget: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games') o.games = +argv[++i];
    else if (a === '--deck') o.deck = argv[++i].split(',').map(s => s.trim().toUpperCase());
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--seed') o.seed = +argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--all') o.all = true;
    else if (a === '--engine') o.engine = argv[++i];  // 比べる用に別の engine.js を使う (例: git show HEAD:engine.js の書き出し)            // ロックを作れなかった試合も書き出す
    else { console.error('未知の引数: ' + a); process.exit(1); }
  }
  return o;
}

/* ===================================================================== Worker */
if (!isMainThread) {
  const { src, cards, effects, jobs, cfg } = workerData;
  /* 候補 (psylock) と最強 (dsh) は別々のエンジンにする (特化は1つのエンジンに1つ。ai_arena と同じ形) */
  const load = () => {
    const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
    ctx.globalThis = ctx;
    vm.runInNewContext(src, ctx, { filename: 'engine.js' });
    const e = ctx.module.exports || ctx.CompileEngine;
    e.init(cards, effects);
    e.setAiLevel(2);
    if (cfg.budget && e.setAiThinkBudget) e.setAiThinkBudget(cfg.budget);
    return e;
  };
  const E = load(), D = load();

  const out = [];
  for (const job of jobs) out.push(play(job));
  parentPort.postMessage(out);

  /* 覆われた表向きのサイキック① を持っている側 */
  function locks(st) {
    const res = [false, false];
    for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) {
      const stack = st.lines[l][s];
      for (let i = 0; i < stack.length - 1; i++) {
        const c = st.cards[stack[i]];
        if (c.faceUp && c.def === LOCK_CARD) res[s] = true;
      }
    }
    return res;
  }
  /* 盤面の要約: 各ラインの [自分の合計, 相手の合計]・コンパイル済み・手札と山札の枚数 */
  function snap(st) {
    const side = (s) => ({
      totals: [0, 1, 2].map(l => E.lineTotal(st, l, s)),
      compiled: st.players[s].protocols.map(p => !!p.compiled),
      hand: st.players[s].hand.length,
      deck: st.players[s].deck.length,
      cards: [0, 1, 2].map(l => st.lines[l][s].map(id => {
        const c = st.cards[id]; return (c.faceUp ? '' : '~') + c.def;
      }))
    });
    return { turn: st.turns || 0, who: st.turn, p: [side(0), side(1)], lock: locks(st) };
  }
  function label(st, a) {
    if (!a) return null;
    if (a.type === 'play') {
      const c = st.cards[a.card];
      return 'play ' + (c ? c.def : a.card) + (a.faceUp ? ' 表' : ' 裏') + ' L' + a.line;
    }
    if (a.type === 'choose') return 'choose ' + JSON.stringify(a.picks);
    return a.type + (a.line !== undefined ? ' L' + a.line : '');
  }

  function play(job) {
    const cs = job.candidateSide;
    E.setAiSpecialist(true, cs, 'psylock');
    D.setAiSpecialist(true, 1 - cs, 'dsh');
    const ais = cs === 0 ? [E, D] : [D, E];
    let res = E.newGame({ p0: cs === 0 ? cfg.deck : OPP_DECK, p1: cs === 0 ? OPP_DECK : cfg.deck, seed: job.seed, useControl: true });
    const log = [], snaps = [];
    let guard = 0, lastTurn = -1, lockTurn = null, lockBroken = false, compAtLock = null;
    while (res.winner === null && guard++ < 700) {
      const st = res.state;
      if ((st.turns || 0) !== lastTurn) { lastTurn = st.turns || 0; snaps.push(snap(st)); }
      const lk = locks(st);
      if (lk[cs] && lockTurn === null) {
        lockTurn = st.turns || 0;
        compAtLock = [st.players[cs].protocols.filter(p => p.compiled).length, st.players[1 - cs].protocols.filter(p => p.compiled).length];
      }
      if (lockTurn !== null && !lk[cs]) lockBroken = true;
      const side = res.requests.length ? res.requests[0].player : st.turn;
      const ai = ais[side];
      let a;
      if (res.requests.length) {
        const req = res.requests[0];
        a = { type: 'choose', id: req.id, picks: ai.ai.answer(st, req) };
        log.push([side, st.turns || 0, 'choose:' + (req.prompt || req.kind || ''), JSON.stringify(a.picks)]);
      } else {
        a = ai.ai.action(st);
        if (!a) break;
        log.push([side, st.turns || 0, label(st, a)]);
      }
      res = E.apply(st, a);
      if (res.error) return { seed: job.seed, cs, error: String(res.error) };
    }
    snaps.push(snap(res.state));
    return {
      seed: job.seed, cs, first: cs === 0, won: res.winner === cs, decided: res.winner !== null,
      lockTurn, lockBroken, compAtLock,
      endTurn: res.state.turns || 0,
      endComp: [res.state.players[cs].protocols.filter(p => p.compiled).length, res.state.players[1 - cs].protocols.filter(p => p.compiled).length],
      log, snaps
    };
  }
  return;
}

/* ===================================================================== Main */
const opt = parseArgs(process.argv);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const src = fs.readFileSync(opt.engine ? path.resolve(opt.engine) : path.join(ROOT, 'engine.js'), 'utf8');

const jobs = [];
for (let i = 0; i < opt.games; i++) jobs.push({ seed: opt.seed + Math.floor(i / 2), candidateSide: i % 2 });
const nW = opt.workers || Math.max(1, Math.min(os.cpus().length - 1, 12));
const chunks = Array.from({ length: nW }, () => []);
jobs.forEach((j, i) => chunks[i % nW].push(j));

const t0 = Date.now();
Promise.all(chunks.filter(c => c.length).map(c => new Promise((resolve, reject) => {
  const w = new Worker(__filename, { workerData: { src, cards, effects, jobs: c, cfg: { deck: opt.deck, budget: opt.budget } } });
  w.on('message', resolve); w.on('error', reject);
}))).then(parts => {
  const all = parts.flat();
  const errs = all.filter(g => g.error);
  const games = all.filter(g => !g.error && g.decided);
  const locked = games.filter(g => g.lockTurn !== null);
  const won = locked.filter(g => g.won), lost = locked.filter(g => !g.won);
  const avg = (xs, f) => xs.length ? (xs.reduce((s, x) => s + f(x), 0) / xs.length).toFixed(1) : '-';
  const pct = (xs, f) => xs.length ? Math.round(100 * xs.filter(f).length / xs.length) + '%' : '-';
  console.log('デッキ ' + opt.deck.join('/') + ' (psylock) vs ' + OPP_DECK.join('/') + ' (dsh)  ' + games.length + '戦  ' + Math.round((Date.now() - t0) / 1000) + 's' + (errs.length ? '  エラー ' + errs.length : ''));
  console.log('全体の勝率 ' + pct(games, g => g.won) + '   ロックを作れた ' + locked.length + '戦 (勝率 ' + pct(locked, g => g.won) + ')   作れなかった ' + (games.length - locked.length) + '戦 (勝率 ' + pct(games.filter(g => g.lockTurn === null), g => g.won) + ')');
  const row = (name, xs) => console.log(name.padEnd(8) + ' n=' + String(xs.length).padStart(3) +
    '  ロックの手番 ' + avg(xs, g => g.lockTurn) + '  そのときのコンパイル 自' + avg(xs, g => g.compAtLock[0]) + ' 相' + avg(xs, g => g.compAtLock[1]) +
    '  壊された ' + pct(xs, g => g.lockBroken) + '  終わった手番 ' + avg(xs, g => g.endTurn) + '  先手 ' + pct(xs, g => g.first) +
    '  終局のコンパイル 自' + avg(xs, g => g.endComp[0]) + ' 相' + avg(xs, g => g.endComp[1]));
  row('勝ち', won); row('負け', lost);
  fs.mkdirSync(path.dirname(path.join(ROOT, opt.out)), { recursive: true });
  const outGames = opt.all ? games : locked;
  fs.writeFileSync(path.join(ROOT, opt.out), outGames.map(g => JSON.stringify(g)).join('\n') + '\n');
  console.log('書き出し: ' + opt.out + ' (' + (opt.all ? '全部 ' : 'ロックを作った ') + outGames.length + '戦)');
}).catch(e => { console.error(e); process.exit(1); });
