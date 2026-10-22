'use strict';
/*
 * ぱうぷると ORACLE の手がずれた手番で、どちらの手が勝ちやすいかを打ち切らずに最後まで打って確かめる。
 * 入力は paupuru_compare.js の出力 (_paupuru/compare.jsonl)。
 * 両方の手を指した直後の局面を、ぱうぷるから見えない札 (山札・相手の手札・裏の札) を振り直して R 通り作り
 * (2つの手で同じ振り直しを使う)、同じ AI 同士で最後まで打つ。勝率の差が「ぱうぷるの手のほうが良い」根拠になる。
 *
 *   node scripts/paupuru_rollout.js --rollouts 16 --budget 200 --top 200 --out _paupuru/rollout.jsonl
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { loadGames } = require('./paupuru_load.js');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const o = { dir: '_paupuru', input: '_paupuru/compare.jsonl', out: '_paupuru/rollout.jsonl', rollouts: 16, budget: 200, top: 200, workers: 0, pick: null, follow: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') o.dir = argv[++i];
    else if (a === '--in') o.input = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--rollouts') o.rollouts = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--top') o.top = +argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else if (a === '--follow') o.follow = +argv[++i];   // ぱうぷるの手のあと、実際に指した続きを何手番ぶん指すか
    else if (a === '--pick') o.pick = new Set(argv[++i].split(','));   // 局:手番 を並べて、その手番だけ打ち直す
    else { console.error('未知の引数: ' + a); process.exit(1); }
  }
  return o;
}

const sameAction = (a, b) => !!a && !!b && a.type === b.type &&
  (a.type !== 'play' || (a.card === b.card && a.line === b.line && !!a.faceUp === !!b.faceUp));
const label = (st, a) => (a.type === 'refresh' ? 'リフレッシュ' : a.type === 'play'
  ? st.cards[a.card].def + (a.faceUp ? ' 表 L' : ' 裏 L') + a.line : a.type);

function newGame(E, g) {
  const i = g.init;
  return E.newGame({ seed: i.seed, p0: i.p0, p1: i.p1, first: i.first, winCompiles: i.winCompiles || undefined,
    handSize: i.handSize, exclude: i.exclude, deckMods: i.deckMods, winCompilesBySide: i.winCompilesBySide, startCompiled: i.startCompiled });
}

if (!isMainThread) {
  const { src, cards, effects, jobs, rollouts, budget, valnet, follow } = workerData;
  const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
  ctx.globalThis = ctx;
  vm.runInNewContext(src, ctx, { filename: 'engine.js' });
  const E = ctx.module.exports;
  E.init(cards, effects);
  E.setTrace(false);
  /* 打ち切り役は両側とも同じ AI (つよい相当の読み + valnet)。特化や ORACLE の手筋は入れない
     (ORACLE の手筋が判定を自分寄りに曲げないように) */
  E.setAiLevel(2); E.setAiBlunder(0); E.setAiThinkBudget(budget); E.setAiPeek(-1);
  E.setAiSpecialist(false); E.setAiOracle(false); E.setAiValueNet(valnet, 400);

  /* 選択待ちを含めて最後まで打つ。手数が尽きたら引き分け扱い */
  /* plan: ぱうぷるが実際にこのあと指した手 (--follow 手番ぶん)。指せるうちはそれを指し、指せなければ AI に任せる。
     仕込みの手は続きを指してはじめて活きるので、続きを知らない AI に任せると仕込みが過小に出る */
  function playout(res, plan, side) {
    let guard = 0;
    plan = plan ? plan.slice() : [];
    while (res.winner === null && guard++ < 600) {
      const st = res.state;
      if (plan.length && !(res.requests && res.requests.length) && !st.pending && st.turn === side) {
        const p = plan.shift();
        const mv = E.legalActions(st).find(x => x.type === p.type &&
          (x.type !== 'play' || (st.cards[x.card].def === p.def && x.line === p.line && !!x.faceUp === p.faceUp)));
        if (mv) { res = E.apply(st, mv); if (res.error) return null; continue; }
      }
      if (res.requests && res.requests.length) {
        const req = res.requests[0];
        res = E.apply(res.state, { type: 'choose', id: req.id, picks: E.ai.answer(res.state, req) });
      } else {
        const a = E.ai.action(res.state);
        if (!a) break;
        res = E.apply(res.state, a);
      }
      if (res.error) return null;
    }
    return res.winner;
  }

  for (const job of jobs) {
    const { g, rows } = job;
    const want = new Map(rows.map(r => [r.turn, r]));
    const own = [null];   // own[手番] = ぱうぷるがその手番に指した手 (カードは def で持つ。振り直すと uid の中身が変わるため)
    if (follow) {
      let rs = newGame(E, g);
      for (const a of g.actions) {
        const st = rs.state;
        if ((a.type === 'play' || a.type === 'refresh') && st.turn === g.side && !st.pending)
          own.push(a.type === 'play' ? { type: 'play', def: st.cards[a.card].def, line: a.line, faceUp: !!a.faceUp } : { type: a.type });
        const nx = E.apply(st, a);
        if (nx.error) break;
        rs = nx;
      }
    }
    let res = newGame(E, g), turnNo = 0;
    for (const a of g.actions) {
      const st = res.state;
      if ((a.type === 'play' || a.type === 'refresh') && st.turn === g.side && !st.pending) {
        turnNo++;
        const r = want.get(turnNo);
        if (r) {
          E.setAiSpecialist(false); E.setAiOracle(false);
          const legal = E.legalActions(st);
          const human = legal.find(x => sameAction(x, a));
          const oracle = legal.find(x => label(st, x) === r.oracle);
          if (human && oracle) {
            const wins = [0, 0], done = [0, 0];
            for (let k = 1; k <= rollouts; k++) {
              /* 指す前の局面を振り直してから両方の手を指す (同じ世界で比べる) */
              const world = E.ai.informationState(st, g.side, k);
              [human, oracle].forEach((mv, j) => {
                const after = E.apply(world, mv);
                if (after.error) return;
                const w = playout(after, j === 0 ? own.slice(turnNo + 1, turnNo + 1 + follow) : null, g.side);
                if (w === null) return;
                done[j]++; if (w === g.side) wins[j]++;
              });
            }
            parentPort.postMessage({ row: { n: g.n, turn: r.turn, deck: r.deck, opp: r.opp, human: r.human, oracle: r.oracle,
              gap: r.gap, rank: r.rank, humanWin: wins[0], humanN: done[0], oracleWin: wins[1], oracleN: done[1] } });
          }
          want.delete(turnNo);
          if (!want.size) break;
        }
      }
      const nx = E.apply(st, a);
      if (nx.error) break;
      res = nx;
    }
  }
  parentPort.postMessage({ done: true });
} else {
  const o = parseArgs(process.argv);
  const src = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
  const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
  const valnet = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'valnet.json'), 'utf8'));
  const games = new Map(loadGames(path.join(ROOT, o.dir)).map(g => [g.n, g]));
  /* ずれた手番のうち、ORACLE が自信を持って違う手を選んだ (差の大きい) 順。勝ち負け確定の ±1e9 も含める */
  const rows = fs.readFileSync(path.join(ROOT, o.input), 'utf8').trim().split('\n').map(JSON.parse)
    .filter(r => !r.agree && r.rank !== 0 && (!o.pick || o.pick.has(r.n + ':' + r.turn)))
    .sort((a, b) => (b.gap ?? 1e12) - (a.gap ?? 1e12)).slice(0, o.top);
  const byGame = new Map();
  for (const r of rows) { if (!byGame.has(r.n)) byGame.set(r.n, []); byGame.get(r.n).push(r); }
  const jobs = [...byGame].map(([n, rs]) => ({ g: games.get(n), rows: rs })).filter(j => j.g);
  const nW = o.workers || Math.max(1, os.cpus().length);
  const buckets = Array.from({ length: nW }, () => []);
  jobs.sort((a, b) => b.rows.length - a.rows.length).forEach((j, i) => buckets[i % nW].push(j));
  const out = fs.createWriteStream(path.join(ROOT, o.out));
  let n = 0, alive = 0, hBetter = 0, oBetter = 0;
  const t0 = Date.now();
  for (const b of buckets) {
    if (!b.length) continue;
    alive++;
    const w = new Worker(__filename, { workerData: { src, cards, effects, jobs: b, rollouts: o.rollouts, budget: o.budget, valnet, follow: o.follow } });
    w.on('message', (m) => {
      if (m.row) {
        n++;
        const r = m.row, ph = r.humanWin / Math.max(1, r.humanN), po = r.oracleWin / Math.max(1, r.oracleN);
        if (ph > po) hBetter++; else if (po > ph) oBetter++;
        out.write(JSON.stringify(r) + '\n');
        if (n % 10 === 0) console.error(`${n}/${rows.length} ぱうぷるが上 ${hBetter} / ORACLE が上 ${oBetter} (${((Date.now() - t0) / 1000) | 0}秒)`);
      } else if (m.done && --alive === 0) {
        out.end();
        console.log(`手番 ${n}: ぱうぷるの手が勝ちやすい ${hBetter}、ORACLE の手が勝ちやすい ${oBetter}`);
      }
    });
    w.on('error', (e) => { console.error(e); process.exit(1); });
  }
}
