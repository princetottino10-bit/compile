'use strict';
/*
 * ORACLE に「この盤面で、どんなカードがあれば勝てるか」を考えさせる。
 *   対戦の途中の盤面 (ORACLE 同士の自己対戦から拾う) で、手番の側の手札に効果の候補を1枚足し、
 *   それを表で出したあと (効果の選択は ORACLE が答える) の勝つ見込みを学習モデル (data/valnet.json) で読む。
 *   同じ盤面で元の手札から一番いい手を打った見込みと比べ、「このカードがあればどれだけ局面が返るか」を数える。
 *   効果を足し算で強くすれば強くなるのは当たり前なので、候補は同じ大きさ (1命令) の効果どうしを、同じ値で比べる。
 *
 *   node scripts/card_oracle.js collect --games 40 --budget 100 --out _forge/states.json
 *   node scripts/card_oracle.js judge --states _forge/states.json --out _forge/judge.json
 *
 *   オリジナルカードはこのスクリプトの中だけで登録する (data/ や runcards.js には書かない)。通常の対戦・カードリストには出ない。
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const ROOT = path.join(__dirname, '..');

/* 効果の候補 (どれも1命令か、それと同じくらいの大きさ)。命令は data/effects.json に実在する書き方だけ */
const EFFECTS = [
  { key: 'draw2', text: 'カードを2枚引く。', ops: [{ op: 'draw', count: 2 }] },
  { key: 'delete', text: 'カードを1枚削除する。', ops: [{ op: 'delete' }] },
  { key: 'deleteDown', text: '裏向きのカードを1枚削除する。', ops: [{ op: 'delete', select: { facing: 'down' } }] },
  { key: 'flipOpp', text: '相手のカードを1枚反転させる。', ops: [{ op: 'flip', select: { owner: 'opp' } }] },
  { key: 'flipAny', text: '他のカードを1枚反転させる。', ops: [{ op: 'flip', select: { exclude: 'thisCard' } }] },
  { key: 'flipSelf', text: 'あなたの他のカードを1枚反転させる。', ops: [{ op: 'flip', select: { owner: 'self', exclude: 'thisCard' } }] },
  { key: 'return', text: 'カードを1枚戻す。', ops: [{ op: 'return' }] },
  { key: 'returnOpp', text: '相手のカードを1枚戻す。', ops: [{ op: 'return', select: { owner: 'opp' } }] },
  { key: 'shift', text: 'カードを1枚移動させる。', ops: [{ op: 'shift' }] },
  { key: 'shiftOpp', text: '相手のカードを1枚移動させる。', ops: [{ op: 'shift', select: { owner: 'opp' } }] },
  { key: 'oppDiscard2', text: '相手は手札を2枚捨て札にする。', ops: [{ op: 'discard', count: 2, player: 'opp' }] },
  { key: 'playDown', text: '他の1ラインにカードを裏向きで1枚プレイする。', ops: [{ op: 'play', source: 'hand', facing: 'down', dest: 'otherLine' }] },
  { key: 'play', text: 'カードを1枚プレイする。', ops: [{ op: 'play', source: 'hand' }] },
  { key: 'topDeckOthers', text: 'あなたのデッキの一番上のカードを、他の各ラインに裏向きで1枚ずつプレイする。', ops: [{ op: 'forEachLine', lines: 'otherLines', ops: [{ op: 'play', source: 'topDeck', facing: 'down', dest: 'currentLine' }] }] },
  { key: 'noCompile', text: '相手は次のターン、コンパイルできない。', ops: [{ op: 'noCompileNextTurn' }] }
];
let VALUES = [0, 2, 4];
let COMBO = null;   // --effects k1,k2,... --size 2: 効果を2つ (3つ) つないだ候補を作る

function parseArgs(argv) {
  const o = { mode: argv[2], deck: 'FIRE,WATER,SPEED', games: 40, budget: 100, answer: 40, seed: 1400001, take: 0.35, workers: 0,
    states: '_forge/states.json', out: null, max: 0, effects: null, size: 1, values: null };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--deck') o.deck = argv[++i];
    else if (a === '--games') o.games = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--answer-budget') o.answer = +argv[++i];
    else if (a === '--seed') o.seed = +argv[++i];
    else if (a === '--take') o.take = +argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else if (a === '--states') o.states = argv[++i];
    else if (a === '--max') o.max = +argv[++i];
    else if (a === '--effects') o.effects = argv[++i].split(',');
    else if (a === '--size') o.size = +argv[++i];
    else if (a === '--values') o.values = argv[++i].split(',').map(Number);
    else if (a === '--out') o.out = argv[++i];
    else { console.error('未知の引数: ' + a); process.exit(1); }
  }
  return o;
}

/* 候補のカード: 効果 × 値 × デッキのプロトコル (どのラインに表で出せるかがプロトコルで決まるので、3つとも作って一番いいものを取る) */
function effectList() {
  if (!COMBO) return EFFECTS;
  const base = EFFECTS.filter(e => COMBO.keys.includes(e.key));
  let sets = base.map(e => [e]);
  for (let n = 1; n < COMBO.size; n++) sets = sets.flatMap(s => base.filter(e => base.indexOf(e) >= base.indexOf(s[s.length - 1])).map(e => s.concat([e])));
  return sets.map(s => ({ key: s.map(e => e.key).join('+'), text: s.map(e => e.text).join(''), ops: s.flatMap(e => e.ops) }));
}
function candidates(deck) {
  const out = [];
  for (const ef of effectList()) for (const v of VALUES) for (const proto of deck) {
    out.push({ id: 'XO_' + proto + '_' + ef.key + '_' + v, proto, value: v, key: ef.key, eff: { middle: { _text: ef.text, ops: ef.ops } } });
  }
  return out;
}

function loadEngine(src, cards, effects, defs) {
  const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance, Math };
  ctx.globalThis = ctx;
  vm.runInNewContext(src, ctx, { filename: 'engine.js' });
  const E = ctx.module.exports;
  E.init(cards, effects, defs);
  E.setAiLevel(2); E.setAiBlunder(0);
  E.setAiOracle(true);
  return E;
}

function logit(E, model, st, me) {
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

/* 手を打ち、効果の選択を ORACLE に答えさせて、相手の手番 (か決着) まで進める。勝つ見込み (me から見て) を返す */
function settle(E, model, st, action, me) {
  let res;
  try { res = E.apply(structuredClone(st), action); } catch (e) { return null; }
  let guard = 0;
  while (!res.error && res.winner === null && res.requests.length && guard++ < 60) {
    const q = res.requests[0];
    E.setAiSpecialist(true, q.player, 'dsh');
    try { res = E.apply(res.state, { type: 'choose', id: q.id, picks: E.ai.answer(res.state, q) }); } catch (e) { return null; }
  }
  if (res.error || res.requests.length) return null;
  if (res.winner !== null) return res.winner === me ? 1 : 0;
  return sigmoid(logit(E, model, res.state, me));
}

if (!isMainThread) {
  const w = workerData;
  if (w.mode === 'collect') {
    const E = loadEngine(w.src, w.cards, w.effects, []);
    E.setAiValueNet(w.model, 400); E.setAiThinkBudget(w.budget);
    const deck = w.deck;
    for (const seed of w.seeds) {
      let r = seed >>> 0;
      const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
      let res = E.newGame({ p0: deck, p1: deck, seed, useControl: true, first: seed & 1 });
      const got = [];
      let guard = 0;
      while (res.winner === null && guard++ < 700) {
        const st = res.state;
        const side = res.requests.length ? res.requests[0].player : st.turn;
        if (!res.requests.length && st.phase === 'action' && guard > 4 && rnd() < w.take) got.push(structuredClone(st));
        E.setAiSpecialist(true, side, 'dsh');
        if (res.requests.length) { const q = res.requests[0]; res = E.apply(st, { type: 'choose', id: q.id, picks: E.ai.answer(st, q) }); }
        else { const a = E.ai.action(st); if (!a) break; res = E.apply(st, a); }
        if (res.error) break;
      }
      /* 盤面にその試合の結果を添える (学習モデルの読みと実際の勝ち負けを突き合わせられる) */
      parentPort.postMessage({ states: got.map(s => ({ seed, winner: res.winner, st: s })) });
    }
    parentPort.postMessage({ done: true });
    return;
  }
  if (w.mode === 'judge') {
    const E = loadEngine(w.src, w.cards, w.effects, w.defs);
    E.setAiValueNet(w.model, 400); E.setAiThinkBudget(w.answer);
    for (const item of w.items) {
      const st = item.st, me = st.turn;
      const now = sigmoid(logit(E, w.model, st, me));
      /* 元の手札での一番いい手 (同じ1手読み) */
      let base = 0;
      for (const a of E.legalActions(st)) { const p = settle(E, w.model, st, a, me); if (p !== null && p > base) base = p; }
      /* 候補を1枚手札に足して、表で出す */
      const by = {};
      for (const d of w.defs) {
        const s2 = structuredClone(st);
        const uid = 'p' + me + ':' + d.id;
        s2.cards[uid] = { uid, def: d.id, owner: me, faceUp: false, zone: 'hand' + me, knownTo: 0 };
        s2.players[me].hand.push(uid);
        let best = null;
        for (const a of E.legalActions(s2)) {
          if (a.card !== uid || !a.faceUp) continue;
          const p = settle(E, w.model, s2, a, me);
          if (p !== null && (best === null || p > best)) best = p;
        }
        const k = d.key + '@' + d.value;
        if (best !== null && (by[k] === undefined || best > by[k])) by[k] = best;
      }
      parentPort.postMessage({ r: { idx: item.idx, winner: item.winner, me, now, base, by } });
    }
    parentPort.postMessage({ done: true });
  }
  return;
}

const opt = parseArgs(process.argv);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'valnet.json'), 'utf8'));
const deck = opt.deck.split(',');
if (opt.values) VALUES = opt.values;
if (opt.effects) COMBO = { keys: opt.effects, size: opt.size };
const nW = opt.workers || Math.max(1, os.cpus().length);
const t0 = Date.now();

function run(makeData, onMsg) {
  return Promise.all(Array.from({ length: nW }, (_, i) => makeData(i)).filter(Boolean).map(data => new Promise((resolve, reject) => {
    const wk = new Worker(__filename, { workerData: { src, cards, effects, model, deck, ...data } });
    wk.on('message', (m) => (m.done ? resolve() : onMsg(m)));
    wk.on('error', reject);
  })));
}

if (opt.mode === 'collect') {
  const seeds = Array.from({ length: opt.games }, (_, i) => opt.seed + i);
  const all = [];
  let games = 0;
  run((i) => { const s = seeds.filter((_, j) => j % nW === i); return s.length ? { mode: 'collect', seeds: s, budget: opt.budget, take: opt.take } : null; },
    (m) => { all.push(...m.states); if (++games % 5 === 0) console.error(games + '/' + opt.games + ' 試合 ' + all.length + '盤面 ' + Math.round((Date.now() - t0) / 1000) + 's'); })
    .then(() => {
      fs.mkdirSync(path.dirname(opt.out || opt.states), { recursive: true });
      fs.writeFileSync(opt.out || opt.states, JSON.stringify({ deck, states: all }));
      console.error(all.length + '盤面 ' + Math.round((Date.now() - t0) / 1000) + 's');
    }).catch(e => { console.error(e); process.exit(1); });
} else if (opt.mode === 'judge') {
  const data = JSON.parse(fs.readFileSync(opt.states, 'utf8'));
  let items = data.states.map((s, idx) => ({ idx, winner: s.winner, st: s.st }));
  if (opt.max) items = items.slice(0, opt.max);
  const defs = candidates(data.deck);
  const EFFS = effectList();
  const rows = [];
  run((i) => { const it = items.filter((_, j) => j % nW === i); return it.length ? { mode: 'judge', items: it, defs, answer: opt.answer } : null; },
    (m) => { rows.push(m.r); if (rows.length % 20 === 0) console.error(rows.length + '/' + items.length + ' 盤面 ' + Math.round((Date.now() - t0) / 1000) + 's'); })
    .then(() => {
      const keys = EFFS.flatMap(ef => VALUES.map(v => ef.key + '@' + v));
      const text = Object.fromEntries(EFFS.map(ef => [ef.key, ef.text]));
      /* 劣勢・五分 (元の手札で一番いい手でも 0.6 未満) の盤面で、そのカードがあれば 0.9 に届いた割合 */
      const hard = rows.filter(r => r.base < 0.6);
      const sum = keys.map(k => {
        const ok = rows.filter(r => r.by[k] !== undefined);
        const okHard = hard.filter(r => r.by[k] !== undefined);
        const gain = ok.reduce((s, r) => s + (r.by[k] - r.base), 0) / Math.max(1, ok.length);
        const to90 = okHard.filter(r => r.by[k] >= 0.9).length / Math.max(1, hard.length);
        const best = rows.filter(r => { let b = -1, bk = null; for (const kk of keys) if (r.by[kk] !== undefined && r.by[kk] > b) { b = r.by[kk]; bk = kk; } return bk === k; }).length;
        return { k, effect: text[k.split('@')[0]], value: +k.split('@')[1], gain, to90, best, n: ok.length };
      }).sort((a, b) => b.to90 - a.to90 || b.gain - a.gain);
      console.log('盤面 ' + rows.length + ' (うち元の手で 0.6 未満 ' + hard.length + ')  ' + Math.round((Date.now() - t0) / 1000) + 's');
      console.log('0.9到達  平均の上積み  一番だった盤面  効果 (値)');
      for (const s of sum) console.log(((100 * s.to90).toFixed(0) + '%').padStart(7) + ('+' + (100 * s.gain).toFixed(1)).padStart(9) + 'pt' + String(s.best).padStart(10) + '   ' + s.effect + ' (' + s.value + ')');
      if (opt.out) fs.writeFileSync(opt.out, JSON.stringify({ rows, sum }, null, 1));
    }).catch(e => { console.error(e); process.exit(1); });
} else {
  console.error('collect か judge を指定する');
  process.exit(1);
}
