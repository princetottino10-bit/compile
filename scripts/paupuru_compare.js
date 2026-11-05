'use strict';
/*
 * ぱうぷるの棋譜の各手番で、ORACLE (管理者の自動プレイと同じ読み) なら何を指すかを比べる。
 * 棋譜は scripts/paupuru_load.js の書式 (_paupuru/raw_*.txt、git に入れない)。
 * ルールが後から変わって途中で再生できなくなった局は、そこまでを使う。
 *
 *   node scripts/paupuru_compare.js --budget 1200 --out _paupuru/compare.jsonl
 *
 * 出力 (1行1手番): 局・手番・ぱうぷるの手・ORACLE の手・一致したか・ORACLE の根の候補の評価
 * (ぱうぷるの手が候補の何番目か、最良との差)。学習 (paupuru_train.py) にも使う
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { loadGames } = require('./paupuru_load.js');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const o = { dir: '_paupuru', budget: 1200, out: '_paupuru/compare.jsonl', workers: 0, only: null, features: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') o.dir = argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else if (a === '--only') o.only = argv[++i].split(',').map(Number);
    else if (a === '--features') o.features = true;   // 候補ごとに指した後の盤面の特徴 (valnet と同じ) も書く
    else { console.error('未知の引数: ' + a); process.exit(1); }
  }
  return o;
}

const isLockDeck = (protos) => protos.includes('PSYCHIC');   // aidecks.js の isLockDeck と同じ
const sameAction = (a, b) => !!a && !!b && a.type === b.type &&
  (a.type !== 'play' || (a.card === b.card && a.line === b.line && !!a.faceUp === !!b.faceUp));
const label = (st, a) => (a.type === 'refresh' ? 'リフレッシュ' : a.type === 'play'
  ? st.cards[a.card].def + (a.faceUp ? ' 表 L' : ' 裏 L') + a.line : a.type);

/* 手そのものの形 (学習の特徴): どのカードを・表か裏か・どのラインに・何を覆うか・そのラインの点数 */
function describe(E, st, a, me) {
  if (a.type !== 'play') return { refresh: 1, hand: st.players[me].hand.length };
  const stack = st.lines[a.line][me];
  const top = stack.length ? st.cards[stack[stack.length - 1]] : null;
  return {
    def: st.cards[a.card].def, up: a.faceUp ? 1 : 0, line: a.line, hand: st.players[me].hand.length,
    cover: top ? (top.faceUp ? top.def : 'down') : null,
    mine: E.lineTotal(st, a.line, me), theirs: E.lineTotal(st, a.line, 1 - me),
    compiled: st.players[me].protocols[a.line].compiled ? 1 : 0,
    own: E.defs[st.cards[a.card].def].proto === st.players[me].protocols[a.line].name ? 1 : 0
  };
}

function newGame(E, g) {
  const i = g.init;
  return E.newGame({ seed: i.seed, p0: i.p0, p1: i.p1, first: i.first, winCompiles: i.winCompiles || undefined,
    handSize: i.handSize, exclude: i.exclude, deckMods: i.deckMods, winCompilesBySide: i.winCompilesBySide, startCompiled: i.startCompiled });
}

if (!isMainThread) {
  const { src, cards, effects, games, budget, valnet, valnetLock, features } = workerData;
  const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance };
  ctx.globalThis = ctx;
  vm.runInNewContext(src, ctx, { filename: 'engine.js' });
  const E = ctx.module.exports;
  E.init(cards, effects);
  E.setTrace(false);
  for (const g of games) {
    const lock = isLockDeck(g.init['p' + g.side]);
    /* ORACLE の設定 (main.js の AUTO_AI、ロックのデッキなら aidecks.js の ORACLE_LOCK_AI) を、ぱうぷるの側に当てる */
    E.setAiLevel(2); E.setAiBlunder(0);
    E.setAiThinkBudget(lock ? Math.round(budget * 1.5) : budget);
    E.setAiSpecialist(true, g.side, lock ? 'psylock' : 'dsh');
    E.setAiPeek(-1);
    E.setAiValueNet(lock ? valnetLock : valnet, 400);
    E.setAiOracle(true);
    let res = newGame(E, g);
    let turnNo = 0;
    for (const a of g.actions) {
      const st = res.state;
      if ((a.type === 'play' || a.type === 'refresh') && st.turn === g.side && !st.pending) {
        turnNo++;
        const legal = E.legalActions(st);
        if (legal.length > 1 && legal.some(x => sameAction(x, a))) {
          const t0 = Date.now();
          const ai = E.ai.action(st);
          const rv = E.ai.rootValues(st);
          const cands = rv.candidates.map(c => ({ a: c.a, val: c.val, val1: c.val1, val2: c.val2, bias: c.bias }));
          cands.sort((x, y) => y.val - x.val);
          const rank = cands.findIndex(c => sameAction(c.a, a));
          const row = {
            n: g.n, turn: turnNo, side: g.side, deck: g.init['p' + g.side], opp: g.init['p' + (1 - g.side)], level: g.level,
            human: label(st, a), oracle: label(st, ai), agree: sameAction(a, ai),
            rank, nCand: cands.length, nLegal: legal.length,
            gap: rank >= 0 ? cands[0].val - cands[rank].val : null,
            cands: cands.slice(0, 12).map(c => ({ act: label(st, c.a), val: Math.round(c.val), val1: Math.round(c.val1), bias: Math.round(c.bias || 0), human: sameAction(c.a, a) })),
            ms: Date.now() - t0
          };
          if (features) {
            /* 候補ごとに指した後の盤面 (選択待ちは答えずにそのまま) の特徴。人の手が候補に無ければ足す */
            const acts = cands.map(c => c.a);
            if (rank < 0) acts.push(a);
            row.feats = acts.map(x => {
              const r = E.apply(st, x);
              const c = cands.find(c => sameAction(c.a, x));
              return { act: label(st, x), human: sameAction(x, a), val: c ? Math.round(c.val) : null, d: describe(E, st, x, g.side),
                f: r.error ? null : E.ai.valnetFeatures(r.state, g.side) };
            });
          }
          parentPort.postMessage({ row });
        }
      }
      const nx = E.apply(st, a);
      if (nx.error) { parentPort.postMessage({ stop: { n: g.n, at: turnNo, error: nx.error } }); break; }
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
  const valnetLock = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'valnet-lock.json'), 'utf8'));
  let games = loadGames(path.join(ROOT, o.dir)).filter(g => g.kind !== 'run');
  if (o.only) games = games.filter(g => o.only.includes(g.n));
  const nW = o.workers || Math.max(1, os.cpus().length);
  const buckets = Array.from({ length: nW }, () => []);
  /* 長い局が1つの作業に偏らないよう、手数の多い順に配る */
  games.slice().sort((a, b) => b.actions.length - a.actions.length).forEach((g, i) => buckets[i % nW].push(g));
  const out = fs.createWriteStream(path.join(ROOT, o.out));
  let rows = 0, agree = 0, alive = 0;
  const t0 = Date.now();
  for (const b of buckets) {
    if (!b.length) continue;
    alive++;
    const w = new Worker(__filename, { workerData: { src, cards, effects, games: b, budget: o.budget, valnet, valnetLock, features: o.features } });
    w.on('message', (m) => {
      if (m.row) {
        rows++; if (m.row.agree) agree++;
        out.write(JSON.stringify(m.row) + '\n');
        if (rows % 50 === 0) console.error(`${rows} 手番 一致 ${(100 * agree / rows).toFixed(1)}% (${((Date.now() - t0) / 1000) | 0}秒)`);
      } else if (m.stop) console.error(`局 ${m.stop.n}: ${m.stop.at} 手番目で再生できず (${m.stop.error})`);
      else if (m.done && --alive === 0) {
        out.end();
        console.log(`手番 ${rows}、ORACLE と一致 ${agree} (${(100 * agree / Math.max(1, rows)).toFixed(1)}%)`);
      }
    });
    w.on('error', (e) => { console.error(e); process.exit(1); });
  }
}
