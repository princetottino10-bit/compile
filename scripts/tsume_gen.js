'use strict';
/* 詰めコンパイルの問題を自動で作る。
 *   node scripts/tsume_gen.js [試す盤面の数=3000] [最初の種=1] [出力=data/tsume.json]
 * 1手番で完結する問題。盤面をでたらめに作り、その手番の手と選択を全部調べて (解く仕組み)、
 *   - 解き方 (最初の1手) が 1〜2 通りしかない
 *   - 最初に打てる手は 10 通り以上ある (ひらめきが要る)
 *   - 解いたときに自分の効果でチェーンが 2 つ以上つながる (割り込みがいっぱい起きる)
 *   - 山札の並びを変えた 3 通りのどれでも解ける (見えない山札の運で解けてしまわない)
 * 解き方が相手の盤面も使う (相手の場のカードを動かす・反転する・削除する、または相手のカードの効果を発動させる) 問題には opp の印を付ける。
 * ものだけを残す。お題は3種類:
 *   ready     次のターンの開始でコンパイルできる状態にする
 *   emptyHand この手番の終わりに手札を0枚にする
 *   lineExact 指定のラインの合計を、手番の終わりにちょうど X 点にする
 * 手番中に相手が選ぶ場面がある盤面は使わない (相手の選び方で結果が変わるため)。相手の手札は空 (見えない情報を作らない) */
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');

const root = path.join(__dirname, '..');
const cards = JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8'));
E.init(cards, JSON.parse(fs.readFileSync(path.join(root, 'data/effects.json'), 'utf8')));
E.setTrace(true);                         // 手番を終えた時点の盤面を途中経過から取るため
E.setAiLevel(1);

const TRIES = Number(process.argv[2]) || 3000;
const SEED0 = Number(process.argv[3]) || 1;
const OUT = process.argv[4] || path.join(root, 'data/tsume.json');
const SEEDS = [1, 2, 3];                  // 山札の並び (newPuzzle の種)
const NODE_LIMIT = 6000;
const MAX_SOLVE_RATE = 0.06;              // 手順の枝のうち解ける枝の割合の上限 (当てずっぽうで解けない)                  // 1つの盤面・1つの種で調べる局面の上限 (超えたら使わない)
const NAMES = cards.protocols.map(p => p.name);
const ME = 0;

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function sample(r, list, k) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}
function combos(list, k) {
  if (k === 0) return [[]];
  if (list.length < k) return [];
  const out = [];
  const rec = (i, cur) => {
    if (out.length > 60) return;
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let j = i; j < list.length; j++) { cur.push(list[j]); rec(j + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}
function perms3() { return [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]; }

/* 自分の選択のすべての答え */
function answers(req) {
  const min = req.min !== undefined ? req.min : 1;
  const max = req.max !== undefined ? req.max : 1;
  switch (req.kind) {
    case 'pickCard': case 'pickHand': {
      const c = req.candidates || [];
      let out = [];
      for (let k = min; k <= Math.min(max, c.length); k++) out = out.concat(combos(c, k));
      return out;
    }
    case 'pickLine': return (req.lines || []).map(l => [l]);
    case 'yesNo': return [['yes'], []];
    case 'option': {
      const out = (req.options || []).map((_, i) => [i]);
      if (req.optional) out.push([]);
      return out;
    }
    case 'arrange': return perms3();
    default: return null;
  }
}

class Reject extends Error {}

/* 手番を終えた時点の盤面 (途中経過で相手の手番に移った最初の盤面) */
function endState(res) {
  for (const t of (res.trace || [])) if (t.st && t.st.turn !== ME) return t.st;
  return res.state;
}

/* 1つの盤面 (1つの種) で、最初の1手ごとに、到達できる手番の終わりの結果を全部集める。
   結果 = { ready, hand, totals[3], chain }。戻り値 Map(手の文字列 → { action, outs: [結果...], path: [手順...] }) */
function oppMark(st) {
  const eff = ((st.tally && st.tally.effects) || [{}, {}])[1 - ME] || {};
  return JSON.stringify([0, 1, 2].map(l => st.lines[l][1 - ME].map(u => u + (st.cards[u].faceUp ? '+' : '-')))) + '|' +
    Object.values(eff).reduce((n, v) => n + (v | 0), 0);
}

/* 手番の記録から、連鎖の中身を数える。
   src = 効果が解決したカードの種類 (プレイしたカード自身は除く)
   ind = 誘発された効果 (カバーが外れた・反転した・「〜したとき」で発動した) の数 */
function chainOf(log, playedDef) {
  const src = new Set();
  let ind = 0;
  for (const line of log || []) {
    if (/^--- P\d/.test(line)) break;              // 相手の手番に入ったら終わり
    const m = String(line).match(/^\[([A-Z]+_\d)\]/);
    if (!m) continue;
    if (m[1] !== playedDef) src.add(m[1]);
    if (/\((uncover|flip)\)|効果が発動/.test(line)) ind++;
  }
  return { src: src.size, ind };
}

function explore(res0) {
  let nodes = 0;
  const oppStart = oppMark(res0.state);
  const firstMap = new Map();
  const visit = (res, first, pathActs, dec) => {
    if (++nodes > NODE_LIMIT) throw new Reject('局面が多すぎる');
    if (res.error) return;
    const st = res.state;
    const terminal = st.winner !== null || st.turn !== ME;
    if (terminal) {
      const es = endState(res);
      const out = {
        ready: E.compilableLines(es, ME).length > 0,
        hand: es.players[ME].hand.length,
        totals: [0, 1, 2].map(l => E.lineTotal(es, l, ME)),
        chain: ((st.tally && st.tally.chains) || [0, 0])[ME] | 0,
        won: st.winner === ME,
        /* 相手の盤面を使ったか: 相手の場が変わった、または相手のカードの効果が発動した (手番の終わりの時点で比べる) */
        opp: oppMark(es) !== oppStart,
        dec,
        ...chainOf(res.log, first.def)
      };
      const e = firstMap.get(first.key);
      e.outs.push({ ...out, path: pathActs });
      return;
    }
    if (res.requests.length) {
      const req = res.requests[0];
      if (req.player !== ME) throw new Reject('手番中に相手が選ぶ');
      const list = answers(req);
      if (!list) throw new Reject('調べられない選択: ' + req.kind);
      /* 2通り以上ある選択だけを「考える選択」として数える */
      const d = dec + (list.length >= 2 ? 1 : 0);
      for (const picks of list) {
        const a = { type: 'choose', id: req.id, picks };
        visit(E.apply(st, a), first, pathActs.concat([a]), d);
      }
      return;
    }
    throw new Reject('自分の手番の途中で手を待っている');
  };
  const legal = E.legalActions(res0.state);
  for (const a of legal) {
    const key = JSON.stringify(a);
    firstMap.set(key, { action: a, outs: [] });
    const def = a.card && res0.state.cards[a.card] ? res0.state.cards[a.card].def : null;
    visit(E.apply(res0.state, a), { key, def }, [a], 0);
  }
  return { firstMap, legalCount: legal.length };
}

/* でたらめな盤面 (spec)。自分の3プロトコルのカードから場と手札を作る。相手の手札は空 */
function randomSpec(r) {
  const protos = sample(r, NAMES, 6);
  const mine = protos.slice(0, 3), theirs = protos.slice(3);
  const pool = (ps) => sample(r, ps.flatMap(p => cards.protocols.find(x => x.name === p).cards.map(c => c.id)), 18);
  const myPool = pool(mine), opPool = pool(theirs);
  const lines = (poolArr, maxPer) => [0, 1, 2].map(() => {
    const n = Math.floor(r() * (maxPer + 1));
    return poolArr.splice(0, n).map(id => [id, r() < 0.75]);
  });
  const myLines = lines(myPool, 3);
  const handN = 3 + Math.floor(r() * 3);
  const hand = myPool.splice(0, handN);
  const opLines = lines(opPool, 3);
  return { sides: [{ protos: mine, lines: myLines, hand }, { protos: theirs, lines: opLines, hand: [] }] };
}

function levelOf(depth) {
  if (depth >= 9) return 3;
  if (depth >= 7) return 2;
  return 1;
}

/* 1つの盤面から作れる問題 (無ければ null) */
function tryBoard(spec) {
  const runs = [];
  for (const seed of SEEDS) {
    let res0;
    try { res0 = E.newPuzzle(spec, { seed }); } catch (e) { return null; }
    if (res0.error || res0.requests.length || res0.state.turn !== ME || res0.state.winner !== null) return null;
    /* 最初からコンパイルできる・相手が次にコンパイルできる盤面は使わない */
    if (E.compilableLines(res0.state, ME).length || E.compilableLines(res0.state, 1 - ME).length) return null;
    try { runs.push(explore(res0)); } catch (e) { if (e instanceof Reject) return null; throw e; }
  }
  const base = runs[0];
  if (base.legalCount < 10) return null;
  const start = E.newPuzzle(spec, { seed: SEEDS[0] }).state;
  const handStart = start.players[ME].hand.length;
  const totalsStart = [0, 1, 2].map(l => E.lineTotal(start, l, ME));

  /* お題ごとに「どの種でも成功する最初の1手」を数える */
  const goals = [
    { kind: 'ready', ok: (o) => o.ready || o.won },
    { kind: 'emptyHand', ok: (o) => o.hand === 0 && handStart >= 3 }
  ];
  /* ちょうど X 点: 最初の盤面と違う値で、10 未満 (コンパイルの判定と混ざらない) のもの */
  const seen = new Set();
  for (const e of base.firstMap.values()) for (const o of e.outs) o.totals.forEach((v, l) => {
    if (v !== totalsStart[l] && v >= 1 && v <= 12) seen.add(l + ':' + v);
  });
  for (const k of seen) {
    const [l, v] = k.split(':').map(Number);
    goals.push({ kind: 'lineExact', line: l, value: v, ok: (o) => o.totals[l] === v });
  }
  const leaves = [...base.firstMap.values()].reduce((n, e) => n + e.outs.length, 0);
  let best = null;
  for (const g of goals) {
    /* どの解き方でも連鎖を通る (素直な1手で片づく抜け道がない) こと、当てずっぽうでは解けないこと */
    const solving = [...base.firstMap.values()].flatMap(e => e.outs.filter(g.ok));
    if (!solving.length || solving.length / leaves > MAX_SOLVE_RATE) continue;
    const minSrc = Math.min(...solving.map(o => o.src));
    const minInd = Math.min(...solving.map(o => o.ind));
    const minDec = Math.min(...solving.map(o => o.dec));
    if (minSrc < 2 || minInd < 1 || minDec < 2) continue;
    const good = [];
    for (const [key, e] of base.firstMap) {
      if (!runs.every(run => (run.firstMap.get(key) || { outs: [] }).outs.some(g.ok))) continue;
      /* 解ける手はすべて数える。相手の盤面を使う解き方があればそれを模範解答にする */
      const oks = e.outs.filter(g.ok);
      const win = (oks.filter(o => o.opp).length ? oks.filter(o => o.opp) : oks).sort((a, b) => b.chain - a.chain)[0];
      if (!win) continue;
      good.push({ key, action: e.action, path: win.path, chain: win.chain, opp: !!win.opp });
    }
    if (good.length < 1 || good.length > 2) continue;
    const chain = minSrc + minInd;
    /* どの解き方も相手の盤面を使うなら「相手の盤面を使う問題」 */
    const opp = good.every(x => x.opp);
    const depth = chain + minDec;               // 読む量: 連鎖の長さ + 考える選択の数
    const cand = { goal: g, sols: good.length, chain, dec: minDec, depth, rate: solving.length / leaves, opp, solution: good[0].path, level: levelOf(depth) };
    const score = (c) => c.depth * 10 + (c.opp ? 5 : 0) - c.rate * 10;
    if (!best || score(cand) > score(best)) best = cand;
  }
  if (!best) return null;
  const g = best.goal;
  const goal = g.kind === 'lineExact' ? { kind: 'lineExact', line: g.line, value: g.value } : { kind: g.kind };
  return { spec, goal, level: best.level, chain: best.chain, dec: best.dec, depth: best.depth, rate: Math.round(best.rate * 1000) / 1000, opp: best.opp, solutions: best.sols, legal: base.legalCount, solution: best.solution };
}

const found = [];
const t0 = Date.now();
const r = rng(SEED0);
for (let i = 0; i < TRIES; i++) {
  const spec = randomSpec(r);
  const p = tryBoard(spec);
  if (p) {
    found.push(p);
    console.log('#' + found.length + ' level ' + p.level + ' ' + p.goal.kind + (p.goal.kind === 'lineExact' ? ' L' + p.goal.line + '=' + p.goal.value : '') +
      ' depth ' + p.depth + ' chain ' + p.chain + ' dec ' + p.dec + ' rate ' + p.rate + (p.opp ? ' opp' : '') + ' sols ' + p.solutions + ' legal ' + p.legal);
  }
  if ((i + 1) % 200 === 0) console.log((i + 1) + '/' + TRIES + ' 盤面, 見つけた ' + found.length + ', ' + Math.round((Date.now() - t0) / 1000) + 's');
}
fs.writeFileSync(OUT, JSON.stringify(found, null, 1));
console.log('done', found.length, 'puzzles ->', OUT);
