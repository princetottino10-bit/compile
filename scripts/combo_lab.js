'use strict';
/*
 * コンボの実験台 — カードの効果を読んで挙げたコンボ (scripts/combo_cands.js) を、
 * 実戦の途中の盤面に植えて ORACLE 同士で打たせ、本当に得をするかを確かめる。
 *
 * 前の2回 (自動採掘・組の学習、docs/ai-combos.md) は「相手の手番を挟まない」か「統計で組を探す」だった。
 * ここでは組の候補は人が効果を読んで挙げ、検証だけを機械でやる:
 *
 *   1. コンボのプロトコルを含むデッキで ORACLE 同士の対戦を進め、途中の自分の手番で止める
 *   2. コンボの札を植える (場の札はそのプロトコルのラインの一番上、手札の札は手札へ)
 *   3. 同じ盤面から次の腕を打ち、相手の手番を H 回挟んだあとの勝つ見込み (data/valnet.json) を比べる
 *        forced    … コンボの手を打つ (選択は ORACLE が答える)
 *        free      … ORACLE が自分で選ぶ
 *        forcedA0  … 相方 (partner) を「効果の無い同じ値の札」にして、同じ手を打つ
 *        freeA0    … 相方を効果なしにして、ORACLE が自分で選ぶ
 *      forced − forcedA0 = その手が相方のおかげでどれだけ得になったか (組の効き目)
 *      forced − free     = ORACLE がその手を自分で選ばないことで逃している得
 *      自分で選んだ割合 = free の1手目がコンボの手と同じだった割合
 *
 *   node scripts/combo_lab.js --ids C001,C002 --n 40 --out _combo2/res
 *   node scripts/combo_lab.js --all --n 40 --out _combo2/res
 *
 * 結果は1コンボ1ファイル (<out>/<id>.json)。scripts/combo_db.js が data/combos.json と docs/combos.md にまとめる。
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const ROOT = path.join(__dirname, '..');
const ALL_PROTOS = ['DARKNESS', 'DEATH', 'FIRE', 'GRAVITY', 'LIFE', 'LIGHT', 'METAL', 'PLAGUE', 'PSYCHIC', 'SPEED', 'SPIRIT', 'WATER',
  'APATHY', 'HATE', 'LOVE', 'CHAOS', 'CLARITY', 'CORRUPTION', 'COURAGE', 'FEAR', 'ICE', 'LUCK', 'MIRROR', 'PEACE', 'SMOKE', 'TIME',
  'WAR', 'ASSIMILATION', 'DIVERSITY', 'UNITY'];

function parseArgs(argv) {
  const o = { ids: null, all: false, n: 40, horizon: 2, budget: 60, workers: 0, seed: 7300001, out: path.join(ROOT, '_combo2', 'res'), verbose: false, playout: false, reps: 1 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ids') o.ids = argv[++i].split(',');
    else if (a === '--all') o.all = true;
    else if (a === '--n') o.n = +argv[++i];
    else if (a === '--horizon') o.horizon = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else if (a === '--seed') o.seed = +argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--reps') o.reps = +argv[++i];   // 1つの腕の続きを何回打って平均するか (続きの打ち方のブレを減らす)
    else if (a === '--playout') o.playout = true;
    else if (a === '--demo') o.demo = argv[++i];   // 1盤面だけ植えて、コンボの手と続きのログを出す   // 見込みではなく決着まで打って勝ち負けで比べる (遅い)
    else { console.error('未知の引数: ' + a); process.exit(1); }
  }
  return o;
}

/* ---------- エンジンと評価 ---------- */
function loadEngine(src, cards, effects) {
  const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance, Math };
  ctx.globalThis = ctx;
  vm.runInNewContext(src, ctx, { filename: 'engine.js' });
  const E = ctx.module.exports;
  /* 効果を消した同じ値の札 (BL_<id>)。組の効き目を測るときに相方をこれに差し替える */
  const blanks = [];
  for (const p of cards.protocols) for (const c of p.cards) blanks.push({ id: 'BL_' + c.id, proto: p.name, value: c.value, eff: {} });
  E.init(cards, effects, blanks);
  E.setAiLevel(2); E.setAiBlunder(0); E.setAiOracle(true);
  return E;
}
function valnetLogit(E, model, st, me) {
  let h = E.ai.valnetFeatures(st, me);
  for (let i = 0; i < model.layers.length; i++) {
    const L = model.layers[i], out = new Array(L.b.length);
    for (let j = 0; j < L.b.length; j++) {
      const w = L.w[j];
      let v = L.b[j];
      for (let q = 0; q < h.length; q++) v += w[q] * h[q];
      out[j] = i < model.layers.length - 1 && v < 0 ? 0 : v;
    }
    h = out;
  }
  return h[0];
}
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/* 選択要求を ORACLE の答えで解決しきる。picker(q) が配列を返したらそれを使う (コンボの選択を決め打つとき) */
function resolveAll(E, res, picker) {
  for (let g = 0; g < 80 && res && !res.error && res.winner === null && res.requests.length; g++) {
    const q = res.requests[0];
    E.setAiSpecialist(true, q.player, 'dsh');
    let picks = picker ? picker(res.state, q) : null;
    let nx = null;
    if (picks) { try { nx = E.apply(res.state, { type: 'choose', id: q.id, picks }); } catch (e) { nx = null; } if (nx && nx.error) nx = null; }
    res = nx || E.apply(res.state, { type: 'choose', id: q.id, picks: E.ai.answer(res.state, q) });
  }
  return res;
}
function step(E, st, action, picker) {
  let res;
  try { res = E.apply(st, action); } catch (e) { return null; }
  if (res.error) return null;
  try { res = resolveAll(E, res, picker); } catch (e) { return null; }
  if (!res || res.error || (res.winner === null && res.requests.length)) return null;
  return res;
}
/* 盤面から、me の手番を horizon 回終えるまで (または決着まで) ORACLE 同士で進め、me の勝つ見込みを返す。
   playout なら決着まで進める */
function continueAndValue(E, model, st, me, horizon, playout, trace, picker) {
  /* 自分の手番が始まった回数はログの「--- P? のターン ---」で数える (コンパイルで手番が丸ごと過ぎることがある) */
  const mark = '--- P' + (me + 1) + ' のターン ---';
  let myStarts = 0, guard = 0, res = { state: st, winner: st.winner, requests: [] };
  while (res.winner === null && guard++ < 400) {
    const s = res.state;
    if (!playout && myStarts >= horizon && s.turn === me) break;
    E.setAiSpecialist(true, s.turn, 'dsh');
    const a = E.ai.action(s);
    if (!a) break;
    const r = step(E, s, a, picker);
    if (!r) return null;
    if (trace) trace.push(r.log.join(' / '));
    myStarts += r.log.filter(l => l === mark).length;
    res = r;
  }
  if (res.winner !== null) return res.winner === me ? 1 : 0;
  if (playout) return 0.5;
  return sigmoid(valnetLogit(E, model, res.state, me));
}

/* ---------- 盤面に札を植える ---------- */
function rm(a, x) { const i = a.indexOf(x); if (i >= 0) a.splice(i, 1); return i >= 0; }
function detach(st, uid) {
  for (const p of st.players) { rm(p.deck, uid); rm(p.hand, uid); rm(p.trash, uid); }
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) rm(st.lines[l][s], uid);
  rm(st.commitStack || [], uid);
}
function uidFor(st, side, def) {
  const pre = 'p' + side + ':' + def;
  return Object.keys(st.cards).find(u => u === pre || u.startsWith(pre + '~')) || null;
}
function lineOfProto(st, side, proto) { return st.players[side].protocols.findIndex(p => p.name === proto); }

/* spec.mine / spec.opp: [{ card, at: 'field'|'hand'|'trash'|'deckTop', faceUp, line: 'proto'|'other'|<protocol名>|'oppProto:X', over: <card> }]
   植えられないとき (デッキに無いプロトコルなど) は null */
function plant(st, me, spec, rnd) {
  const op = 1 - me;
  const planted = {};
  const handBefore = [st.players[0].hand.length, st.players[1].hand.length];
  const pieces = [...(spec.mine || []).map(p => ({ ...p, side: me })), ...(spec.opp || []).map(p => ({ ...p, side: op }))];
  for (const pc of pieces) {
    const uid = uidFor(st, pc.side, pc.card);
    if (!uid) return null;
    planted[pc.card + (pc.side === op ? '@opp' : '')] = uid;
    detach(st, uid);
    const c = st.cards[uid];
    c.commitDest = null;
    if (pc.at === 'hand') {
      Object.assign(c, { zone: 'hand' + pc.side, faceUp: false, knownTo: 1 << pc.side });
      st.players[pc.side].hand.push(uid);
    } else if (pc.at === 'trash') {
      Object.assign(c, { zone: 'trash' + pc.side, faceUp: true, knownTo: 3 });
      st.players[pc.side].trash.push(uid);
    } else if (pc.at === 'deckTop') {
      Object.assign(c, { zone: 'deck' + pc.side, faceUp: false, knownTo: 0 });
      st.players[pc.side].deck.unshift(uid);
    } else {
      let line;
      const proto = (DEF_PROTO[pc.card] || '');
      if (pc.over) line = st.lines.findIndex(L => L[pc.side].includes(planted[pc.over + (pc.side === op ? '@opp' : '')]));
      else if (pc.line === undefined || pc.line === 'proto') line = lineOfProto(st, pc.side, proto);
      else if (typeof pc.line === 'number') line = pc.line;
      else if (pc.line === 'other') {
        const avoid = new Set(Object.values(planted).map(u => st.lines.findIndex(L => L[pc.side].includes(u))).filter(x => x >= 0));
        const opts = [0, 1, 2].filter(l => !avoid.has(l));
        line = opts.length ? opts[Math.floor(rnd() * opts.length)] : 0;
      } else line = lineOfProto(st, pc.side, pc.line);
      if (line < 0) return null;
      Object.assign(c, { zone: 'field', faceUp: pc.faceUp !== false, knownTo: pc.faceUp !== false ? 3 : (1 << pc.side) });
      st.lines[line][pc.side].push(uid);
      /* cover: 山札の札を1枚、裏で上に重ねる (覆われた表向きの札を作る) */
      if (pc.cover) {
        const deck = st.players[pc.side].deck;
        if (!deck.length) return null;
        const u2 = deck.splice(Math.floor(rnd() * deck.length), 1)[0];
        Object.assign(st.cards[u2], { zone: 'field', faceUp: false, knownTo: 1 << pc.side });
        st.lines[line][pc.side].push(u2);
      }
    }
  }
  /* 手札の枚数をもとに戻す (植えた札以外を山札へ) */
  const keep = new Set(Object.values(planted));
  for (const s of [0, 1]) {
    const want = Math.max(handBefore[s], pieces.filter(p => p.side === s && p.at === 'hand').length);
    const hand = st.players[s].hand;
    while (hand.length > want) {
      const cand = hand.filter(u => !keep.has(u));
      if (!cand.length) break;
      const u = cand[Math.floor(rnd() * cand.length)];
      rm(hand, u);
      Object.assign(st.cards[u], { zone: 'deck' + s, faceUp: false, knownTo: 0 });
      st.players[s].deck.splice(Math.floor(rnd() * (st.players[s].deck.length + 1)), 0, u);
    }
  }
  /* 植えたせいで10点以上 (コンパイル待ち) になったラインがあると話が変わるので外す */
  return planted;
}
let DEF_PROTO = {}, DEF_VALUE = {};

/* 手の記述 → エンジンの action。 { play: <card>, faceUp, line: 'proto'|'onto:<card>'|<protocol名>|'other'|<数>, side: 'opp' } / { refresh: true } */
function resolveAct(E, st, me, act, planted) {
  if (act.refresh) return { type: 'refresh' };
  const uid = planted[act.play];
  if (!uid) return null;
  let line;
  if (typeof act.line === 'number') line = act.line;
  else if (!act.line || act.line === 'proto') line = lineOfProto(st, me, DEF_PROTO[act.play]);
  else if (act.line.startsWith('onto:')) { const t = planted[act.line.slice(5)]; line = st.lines.findIndex(L => L[0].includes(t) || L[1].includes(t)); }
  else if (act.line === 'other') {
    const used = new Set(Object.values(planted).map(u => st.lines.findIndex(L => L[me].includes(u))).filter(x => x >= 0));
    line = [0, 1, 2].find(l => !used.has(l));
  } else line = lineOfProto(st, me, act.line);
  if (line === undefined || line < 0) return null;
  const a = { type: 'play', card: uid, line, faceUp: act.faceUp !== false };
  if (act.side === 'opp') a.side = 1 - me;
  const legal = E.legalActions(st).some(x => x.type === 'play' && x.card === a.card && x.line === a.line && x.faceUp === a.faceUp && (x.side === undefined ? a.side === undefined : x.side === a.side));
  return legal ? a : null;
}
const sameAct = (a, b) => a && b && a.type === b.type && (a.type !== 'play' || (a.card === b.card && a.line === b.line && a.faceUp === b.faceUp && (a.side || 0) === (b.side || 0)));

/* ---------- 実戦の盤面を作る ---------- */
function makeDeck(protos, rnd) {
  const deck = protos.slice();
  while (deck.length < 3) {
    const p = ALL_PROTOS[Math.floor(rnd() * ALL_PROTOS.length)];
    if (!deck.includes(p)) deck.push(p);
  }
  /* プロトコルの並び (ライン) もばらす */
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}
function snapshot(E, combo, seed, budget) {
  let r = seed >>> 0;
  const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  const mineP = makeDeck(combo.protos, rnd);
  const oppP = makeDeck(combo.oppProtos || [], rnd).filter(Boolean);
  if (oppP.some(p => mineP.includes(p)) && !combo.oppProtos) {
    /* 同じプロトコルどうしは山札の札が重なる (uid は p0:/p1: で分かれるので問題はないが、読みやすさのため避ける) */
  }
  const me = seed & 1;
  let res = E.newGame({ p0: me === 0 ? mineP : oppP, p1: me === 0 ? oppP : mineP, seed, useControl: true, first: (seed >> 1) & 1 });
  E.setAiThinkBudget(budget);
  const stopAt = 2 + Math.floor(rnd() * (combo.late ? 8 : 6)) + (combo.late ? 4 : 0);   // 自分の何手番目で止めるか
  let myTurn = 0, guard = 0, prev = -1;
  while (res.winner === null && guard++ < 300) {
    const s = res.state;
    if (s.turn === me && s.phase === 'action' && !res.requests.length && s.turn !== prev) {
      myTurn++;
      if (myTurn >= stopAt) return { st: s, me, rnd };
    }
    prev = s.phase === 'action' ? s.turn : prev;
    E.setAiSpecialist(true, s.turn, 'dsh');
    const a = E.ai.action(s);
    if (!a) return null;
    const nx = step(E, s, a);
    if (!nx) return null;
    res = nx;
  }
  return null;
}

/* ---------- 1盤面ぶんの実験 ---------- */
function trial(E, model, combo, seed, opt) {
  const snap = snapshot(E, combo, seed, opt.budget);
  if (!snap) return { skip: 'snapshot' };
  const { me, rnd } = snap;
  const base = structuredClone(snap.st);
  const planted = plant(base, me, combo.setup, rnd);
  if (!planted) return { skip: 'plant' };
  for (let l = 0; l < 3; l++) for (const s of [0, 1]) {
    /* 植えた盤面で既に 10 点を超えたラインがあると、コンボと関係なくコンパイルが起きる */
  }
  const forcedAct = resolveAct(E, base, me, combo.act, planted);
  if (!forcedAct) return { skip: 'illegal' };
  /* combo.picks: コンボを回す側の選択を決め打つ (null を返せば ORACLE に任せる)。forced の腕では続きの手番でも使う */
  const P = { planted, me, val: (s, u) => (s.cards[u].faceUp || String(s.cards[u].zone).startsWith('hand') ? (DEF_VALUE[String(s.cards[u].def).replace(/^BL_/, '')] || 0) : 2), def: (s, u) => s.cards[u].def };
  const picker = combo.picks ? (s, q) => (q.player === me ? combo.picks(s, q, P) : null) : null;
  const partners = (combo.partner || []).map(c => planted[c]).filter(Boolean);
  const blanked = (s) => { const t = structuredClone(s); for (const u of partners) t.cards[u].def = 'BL_' + t.cards[u].def; return t; };

  const out = { seed, me };
  E.setAiThinkBudget(opt.budget);
  const arm = (st, act, usePicker) => {
    let sum = 0, k = 0;
    for (let i = 0; i < (opt.reps || 1); i++) { const v = arm1(st, act, usePicker); if (v !== null) { sum += v; k++; } }
    return k ? sum / k : null;
  };
  const arm1 = (st, act, usePicker) => {
    const r = step(E, structuredClone(st), act, usePicker ? picker : null);
    if (!r) return null;
    if (r.winner !== null) return r.winner === me ? 1 : 0;
    const startsInStep = r.log.filter(l => l === '--- P' + (me + 1) + ' のターン ---').length;
    return continueAndValue(E, model, r.state, me, opt.horizon - startsInStep, opt.playout, null, usePicker ? picker : null);
  };
  E.setAiSpecialist(true, me, 'dsh');
  const freeAct = E.ai.action(structuredClone(base));
  out.aiPicked = sameAct(freeAct, forcedAct);
  out.freeAct = freeAct && (freeAct.type === 'play' ? base.cards[freeAct.card].def + '@' + freeAct.line + (freeAct.faceUp ? '↑' : '↓') : freeAct.type);
  out.forced = arm(base, forcedAct, true);
  out.free = out.aiPicked ? out.forced : (freeAct ? arm(base, freeAct, false) : null);
  if (partners.length) {
    const b = blanked(base);
    out.forcedA0 = arm(b, forcedAct, true);
    E.setAiSpecialist(true, me, 'dsh');
    const fa = E.ai.action(structuredClone(b));
    out.freeA0 = fa ? arm(b, fa, false) : null;
  }
  return out;
}

/* ---------- 実行 ---------- */
if (!isMainThread) {
  const w = workerData;
  const E = loadEngine(w.src, w.cards, w.effects);
  E.setAiValueNet(w.model, 400);
  DEF_PROTO = w.defProto; DEF_VALUE = w.defValue;
  const CANDS = require(path.join(ROOT, 'scripts', 'combo_cands.js'));
  parentPort.on('message', (job) => {
    if (!job) { process.exit(0); }
    const combo = CANDS.find(c => c.id === job.id);
    let r;
    try { r = trial(E, w.model, combo, job.seed, w.opt); } catch (e) { r = { skip: 'error', msg: String(e && e.stack || e).slice(0, 300) }; }
    parentPort.postMessage({ id: job.id, r });
  });
  parentPort.postMessage({ ready: true });
  return;
}

const opt = parseArgs(process.argv);
if (opt.demo) {
  const cardsJ = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
  const E = loadEngine(fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8'), cardsJ, JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8')));
  const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'valnet.json'), 'utf8'));
  E.setAiValueNet(model, 400);
  for (const p of cardsJ.protocols) for (const c of p.cards) { DEF_PROTO[c.id] = p.name; DEF_VALUE[c.id] = c.value; }
  const combo = require(path.join(ROOT, 'scripts', 'combo_cands.js')).find(c => c.id === opt.demo);
  for (let k = 0; k < 20; k++) {
    const snap = snapshot(E, combo, opt.seed + k, opt.budget);
    if (!snap) continue;
    const base = structuredClone(snap.st);
    const planted = plant(base, snap.me, combo.setup, snap.rnd);
    const act = planted && resolveAct(E, base, snap.me, combo.act, planted);
    if (!act) continue;
    const me = snap.me;
    const show = (s) => [0, 1, 2].map(l => 'L' + l + '(' + s.players[me].protocols[l].name + ') 自分[' + s.lines[l][me].map(u => s.cards[u].def + (s.cards[u].faceUp ? '' : '↓')).join(' ') + '] 相手[' + s.lines[l][1 - me].map(u => s.cards[u].def + (s.cards[u].faceUp ? '' : '↓')).join(' ') + ']').join('\n');
    console.log('seed ' + (opt.seed + k) + ' me=P' + (me + 1) + '\n' + show(base) + '\n手札 ' + base.players[me].hand.map(u => base.cards[u].def).join(' ') + ' / 相手 ' + base.players[1 - me].hand.map(u => base.cards[u].def).join(' '));
    console.log('手: ' + JSON.stringify(act));
    const P = { planted, me, val: (s, u) => (s.cards[u].faceUp || String(s.cards[u].zone).startsWith('hand') ? (DEF_VALUE[s.cards[u].def] || 0) : 2) };
    const picker = combo.picks ? (s, q) => (q.player === me ? combo.picks(s, q, P) : null) : null;
    const r = step(E, base, act, picker);
    console.log(r.log.join('\n'));
    const trace = [];
    const v = continueAndValue(E, model, r.state, me, opt.horizon, false, trace, picker);
    console.log(trace.join('\n---\n'));
    console.log('見込み ' + v);
    break;
  }
  process.exit(0);
}
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'valnet.json'), 'utf8'));
const defProto = {}, defValue = {};
for (const p of cards.protocols) for (const c of p.cards) { defProto[c.id] = p.name; defValue[c.id] = c.value; }
const CANDS = require(path.join(ROOT, 'scripts', 'combo_cands.js'));
const targets = opt.all ? CANDS : CANDS.filter(c => opt.ids && opt.ids.includes(c.id));
if (!targets.length) { console.error('--ids か --all を指定する'); process.exit(1); }
fs.mkdirSync(opt.out, { recursive: true });

/* 盤面の作り直しや植えられない盤面があるので、1コンボあたり n の 2.5 倍の種を用意して、n 件そろったら打ち切る */
const jobs = [];
for (const c of targets) {
  if (fs.existsSync(path.join(opt.out, c.id + '.json')) && !opt.verbose) continue;
  for (let i = 0; i < Math.ceil(opt.n * 2.5); i++) jobs.push({ id: c.id, seed: opt.seed + i * 7 + (parseInt(c.id.replace(/\D/g, ''), 10) || 0) * 1000 });
}
const nW = opt.workers || Math.max(1, os.cpus().length);
const got = {}, skips = {};
const t0 = Date.now();
function summarize(id) {
  const rows = (got[id] || []).filter(r => r.forced !== null && r.free !== null && r.forced !== undefined);
  const mean = (k) => { const v = rows.map(r => r[k]).filter(x => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const diff = (a, b) => {
    const v = rows.filter(r => r[a] !== null && r[a] !== undefined && r[b] !== null && r[b] !== undefined).map(r => r[a] - r[b]);
    if (!v.length) return null;
    const m = v.reduce((x, y) => x + y, 0) / v.length;
    const sd = Math.sqrt(v.reduce((x, y) => x + (y - m) * (y - m), 0) / Math.max(1, v.length - 1));
    return { mean: m, se: sd / Math.sqrt(v.length), n: v.length };
  };
  return {
    id, n: rows.length, skips: skips[id] || {},
    forced: mean('forced'), free: mean('free'), forcedA0: mean('forcedA0'), freeA0: mean('freeA0'),
    synergy: diff('forced', 'forcedA0'), missed: diff('forced', 'free'), pairValue: diff('free', 'freeA0'),
    aiPicked: rows.length ? rows.filter(r => r.aiPicked).length / rows.length : null,
    opt: { horizon: opt.horizon, budget: opt.budget, playout: opt.playout, reps: opt.reps }, rows
  };
}
const pending = {};
for (const j of jobs) pending[j.id] = (pending[j.id] || 0) + 1;
const done = new Set();
function finish(id) {
  if (done.has(id)) return;
  done.add(id);
  const s = summarize(id);
  fs.writeFileSync(path.join(opt.out, id + '.json'), JSON.stringify(s, null, 1));
  const f = (x) => x === null ? '  -  ' : (100 * x.mean).toFixed(1).padStart(6) + '±' + (100 * x.se).toFixed(1);
  console.log(id.padEnd(6) + ' n=' + String(s.n).padStart(3) + '  組の効き目 ' + f(s.synergy) + '  逃している得 ' + f(s.missed) + '  自分で選ぶ ' + (s.aiPicked === null ? '-' : (100 * s.aiPicked).toFixed(0) + '%') + '  skip ' + JSON.stringify(s.skips) + '  ' + Math.round((Date.now() - t0) / 1000) + 's');
}
/* ジョブはコンボ順に並べ、ワーカーは共有の列から1件ずつ取る (n 件そろったコンボの残りは飛ばす) */
let cursor = 0;
function nextJob() {
  while (cursor < jobs.length) {
    const j = jobs[cursor++];
    if ((got[j.id] || []).length >= opt.n) { if (--pending[j.id] === 0) finish(j.id); continue; }
    return j;
  }
  return null;
}
let alive = 0;
for (let i = 0; i < nW; i++) {
  alive++;
  const wk = new Worker(__filename, { workerData: { src, cards, effects, model, defProto, defValue, opt } });
  const feed = () => { const j = nextJob(); if (j) wk.postMessage(j); else wk.postMessage(null); };
  wk.on('message', (m) => {
    if (m.ready) return feed();
    if (m.r.skip) { skips[m.id] = skips[m.id] || {}; skips[m.id][m.r.skip] = (skips[m.id][m.r.skip] || 0) + 1; if (opt.verbose && m.r.msg) console.error(m.id, m.r.msg); }
    else (got[m.id] = got[m.id] || []).push(m.r);
    if (--pending[m.id] === 0) finish(m.id);
    feed();
  });
  wk.on('exit', () => { if (--alive === 0) for (const id of Object.keys(pending)) finish(id); });
  wk.on('error', (e) => console.error(e));
}
