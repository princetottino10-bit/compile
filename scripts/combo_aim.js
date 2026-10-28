'use strict';
/*
 * コンボを「揃えに行っているか」を数える。
 *   植えた盤面で1手を比べる scripts/combo_lab.js は「揃ったら打てるか」しか見ない。
 *   ここでは、コンボのプロトコルを持ったデッキで ORACLE 同士の対戦を最初から最後まで打ち、
 *   コンボの札の行方を1枚ずつ追う:
 *     揃った手番      … 回しが動いている自分の手番の数 (engine) / コンボを撃った回数 (burst)
 *     自分で潰した回数 … 相方がまだ生きているのに、自分の手でその札を捨てた・裏で出した・
 *                        自分の札で覆った・自分で裏返した・自分で戻した・自分で削除した
 *   同じ種で engine.js を2つ (--base と、いまの engine.js) 打ち比べ、手筋を足して揃えに行くようになったかを見る。
 *
 *   git show master:engine.js > _combo2/engine_master.js
 *   node scripts/combo_aim.js --combo warChaos --games 60 --base _combo2/engine_master.js
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const ROOT = path.join(__dirname, '..');
const ALL = ['DARKNESS', 'DEATH', 'FIRE', 'GRAVITY', 'LIFE', 'LIGHT', 'METAL', 'PLAGUE', 'PSYCHIC', 'SPEED', 'SPIRIT', 'WATER',
  'APATHY', 'HATE', 'LOVE', 'CHAOS', 'CLARITY', 'CORRUPTION', 'COURAGE', 'FEAR', 'ICE', 'LUCK', 'MIRROR', 'PEACE', 'SMOKE', 'TIME',
  'WAR', 'ASSIMILATION', 'DIVERSITY', 'UNITY'];

/* need: 場でどう居れば効くか ('top' = 一番上で表、'up' = 表なら覆われていてもよい、'cov' = 覆われた表、'play' = 表で出した瞬間に撃つ札) */
const COMBOS = {
  warChaos: { name: 'WAR 0 + CHAOS 0', protos: ['WAR', 'CHAOS'], pieces: { WAR_1: 'top', CHAOS_1: 'top' } },
  warChaosHate: { name: 'WAR 0 + CHAOS 0 + HATE 3', protos: ['WAR', 'CHAOS', 'HATE'], pieces: { WAR_1: 'top', CHAOS_1: 'top', HATE_4: 'up' } },
  warLove: { name: 'WAR 0 + LOVE 6 / LOVE 2', protos: ['WAR', 'LOVE'], pieces: { WAR_1: 'top', LOVE_6: 'play', LOVE_2: 'play' } },
  warFear: { name: 'WAR 0 + FEAR 1', protos: ['WAR', 'FEAR'], pieces: { WAR_1: 'top', FEAR_2: 'play' } },
  /* 覆われた表の PSYCHIC 1 は開始で裏返らず「相手は裏向きでのみ」が続く。METAL 2 / PLAGUE 0 と重ねて1ラインを締め出す */
  psyMetal: { name: '覆われた PSYCHIC 1 + METAL 2', protos: ['PSYCHIC', 'METAL'], pieces: { PSYCHIC_2: 'cov', METAL_3: 'up' } },
  psyPlague: { name: '覆われた PSYCHIC 1 + PLAGUE 0', protos: ['PSYCHIC', 'PLAGUE'], pieces: { PSYCHIC_2: 'cov', PLAGUE_1: 'top' } },
  spiritClarity: { name: 'SPIRIT 0 + CLARITY 0', protos: ['SPIRIT', 'CLARITY'], pieces: { SPIRIT_1: 'top', CLARITY_1: 'up' } },
  warAssim: { name: 'WAR 0 + ASSIMILATION 4', protos: ['WAR', 'ASSIMILATION'], pieces: { WAR_1: 'top', ASSIMILATION_4: 'play' } },
  plagueCourage: { name: 'PLAGUE 1 + COURAGE 0 + CORRUPTION 2', protos: ['PLAGUE', 'COURAGE', 'CORRUPTION'], pieces: { PLAGUE_2: 'up', COURAGE_1: 'top', CORRUPTION_3: 'up' } },
  warCourage: { name: 'WAR 3 + COURAGE 0', protos: ['WAR', 'COURAGE'], pieces: { WAR_4: 'top', COURAGE_1: 'top' } },
  war3Fear: { name: 'WAR 3 + FEAR 1', protos: ['WAR', 'FEAR'], pieces: { WAR_4: 'top', FEAR_2: 'play' } },
  spiritCorr: { name: 'SPIRIT 3 + CORRUPTION 2', protos: ['SPIRIT', 'CORRUPTION'], pieces: { SPIRIT_4: 'up', CORRUPTION_3: 'play' } },
  spiritPeace: { name: 'SPIRIT 3 + PEACE 1', protos: ['SPIRIT', 'PEACE'], pieces: { SPIRIT_4: 'up', PEACE_1: 'top' } },
  timeClarity: { name: 'TIME 2 + CLARITY 3', protos: ['TIME', 'CLARITY'], pieces: { TIME_3: 'up', CLARITY_4: 'play' } },
  corrPlague: { name: 'CORRUPTION 6 + CORRUPTION 2 + PLAGUE 1', protos: ['CORRUPTION', 'PLAGUE'], pieces: { CORRUPTION_6: 'up', CORRUPTION_3: 'up', PLAGUE_2: 'up' } },
  corrFearLove: { name: 'CORRUPTION 1 + FEAR 2 + LOVE 1', protos: ['CORRUPTION', 'FEAR', 'LOVE'], pieces: { CORRUPTION_2: 'top', FEAR_3: 'play', LOVE_1: 'play' } },
  psyPlague4: { name: '覆われた PSYCHIC 1 + PLAGUE 4', protos: ['PSYCHIC', 'PLAGUE'], pieces: { PSYCHIC_2: 'cov', PLAGUE_5: 'top' } },
  psyAssim: { name: '覆われた PSYCHIC 1 + ASSIMILATION 0', protos: ['PSYCHIC', 'ASSIMILATION'], pieces: { PSYCHIC_2: 'cov', ASSIMILATION_1: 'play' } },
  fire3Plague4: { name: 'FIRE 3 + PLAGUE 4', protos: ['FIRE', 'PLAGUE'], pieces: { FIRE_4: 'top', PLAGUE_5: 'top' } },
  /* SPEED 2 は1枚で効く: コンパイルするラインに表で居れば、削除されずに別のラインへ移る。数えるのは自分のコンパイルと生き残り */
  fire3Spirit: { name: 'FIRE 3 + SPIRIT 1 の回し', protos: ['FIRE', 'SPIRIT'], pieces: { FIRE_4: 'top', SPIRIT_2: 'loop' } },
  fire3SpiritCorr: { name: 'FIRE 3 + SPIRIT 1 + CORRUPTION 2', protos: ['FIRE', 'SPIRIT', 'CORRUPTION'], pieces: { FIRE_4: 'top', SPIRIT_2: 'loop', CORRUPTION_3: 'up' } },
  /* 裏で置いた中段の強い札を表にして撃つ。数えるのは、自分の手で自分の裏向きの撃つ札が表になった回数 (撃った) と、
     一番上に裏の撃つ札があり手札に表にする札がある手番 (揃った手番) */
  flipSpiritFire: { name: 'SPIRIT 2 で裏の FIRE 0 を表に', protos: ['SPIRIT', 'FIRE'], pieces: {}, flip: true },
  flipLoveLife: { name: 'LOVE 4 で裏の LIFE 0 を表に', protos: ['LOVE', 'LIFE'], pieces: {}, flip: true },
  flipWarGravity: { name: 'WAR 2 で裏の GRAVITY 1 を表に', protos: ['WAR', 'GRAVITY'], pieces: {}, flip: true },
  flipSmokeLuck: { name: 'SMOKE 1 で裏の LUCK 0 を表に', protos: ['SMOKE', 'LUCK'], pieces: {}, flip: true },
  speed2: { name: 'SPEED 2 (コンパイルで生き残る)', protos: ['SPEED'], pieces: { SPEED_3: 'up' }, solo: true }
};

function parseArgs(argv) {
  const o = { combo: 'warChaos', games: 60, budget: 80, seed: 2200001, base: null, workers: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--combo') o.combo = argv[++i];
    else if (a === '--games') o.games = +argv[++i];
    else if (a === '--budget') o.budget = +argv[++i];
    else if (a === '--seed') o.seed = +argv[++i];
    else if (a === '--base') o.base = argv[++i];
    else if (a === '--workers') o.workers = +argv[++i];
    else { console.error('未知の引数: ' + a); process.exit(1); }
  }
  return o;
}

function loadEngine(src, cards, effects) {
  const ctx = { module: { exports: {} }, exports: {}, console, structuredClone, performance, Math };
  ctx.globalThis = ctx;
  vm.runInNewContext(src, ctx, { filename: 'engine.js' });
  const E = ctx.module.exports;
  E.init(cards, effects);
  E.setAiLevel(2); E.setAiBlunder(0); E.setAiOracle(true);
  return E;
}

/* 札の居場所: 'hand' / 'deck' / 'trash' / 'top' (一番上で表) / 'covUp' (覆われた表) / 'down' (場で裏) / 'gone' (相手の手札など) */
function where(st, uid, me) {
  const c = st.cards[uid];
  if (!c) return 'gone';
  for (let l = 0; l < 3; l++) for (const s of [0, 1]) {
    const k = st.lines[l][s].indexOf(uid);
    if (k < 0) continue;
    if (s !== me) return 'gone';
    if (!c.faceUp) return 'down';
    return k === st.lines[l][s].length - 1 ? 'top' : 'covUp';
  }
  const P = st.players[me];
  if (P.hand.includes(uid)) return 'hand';
  if (P.deck.includes(uid)) return 'deck';
  if (P.trash.includes(uid)) return 'trash';
  return 'gone';
}
const live = (need, w) => need === 'top' ? w === 'top' : need === 'up' ? (w === 'top' || w === 'covUp') : need === 'cov' ? w === 'covUp' : need === 'loop' ? (w === 'top' || w === 'down') : false;
const alive = (w) => w !== 'trash' && w !== 'gone';
const FLIP_PAYLOAD = new Set(['LIFE_1', 'LIGHT_1', 'LUCK_1', 'SPEED_1', 'FIRE_1', 'HATE_1', 'GRAVITY_2', 'DARKNESS_1', 'WATER_2']);
const FLIP_ENABLER = new Set(['LOVE_4', 'WATER_1', 'SPIRIT_3', 'WAR_3', 'LIFE_2', 'SMOKE_2', 'METAL_1', 'GRAVITY_3', 'FEAR_1']);
function flipDown(st, me) {
  const out = [];
  for (let l = 0; l < 3; l++) for (const u of st.lines[l][me]) if (!st.cards[u].faceUp && FLIP_PAYLOAD.has(st.cards[u].def)) out.push(u);
  return out;
}

function playGame(E, combo, seed, budget) {
  let r = seed >>> 0;
  const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  const pick = (ex) => { let p; do { p = ALL[Math.floor(rnd() * ALL.length)]; } while (ex.includes(p)); return p; };
  const mine = combo.protos.slice();
  while (mine.length < 3) mine.push(pick(mine));
  for (let i = 2; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [mine[i], mine[j]] = [mine[j], mine[i]]; }
  const opp = [];
  while (opp.length < 3) opp.push(pick(opp.concat(mine)));
  const me = seed & 1;
  let res = E.newGame({ p0: me === 0 ? mine : opp, p1: me === 0 ? opp : mine, seed, useControl: true, first: (seed >> 1) & 1 });
  E.setAiThinkBudget(budget);
  const ids = Object.keys(combo.pieces);
  const uid = (d) => 'p' + me + ':' + d;
  const engine = ids.filter(d => combo.pieces[d] !== 'play');
  const burst = ids.filter(d => combo.pieces[d] === 'play');
  const out = { myTurns: 0, readyTurns: 0, advanced: 0, compiles: 0, survived: 0, s2Field: 0, liveTurns: 0, fired: 0, wasted: {}, firstLive: null, win: null };
  let guard = 0;
  while (res.winner === null && guard++ < 500) {
    const st = res.state;
    E.setAiSpecialist(true, st.turn, 'dsh');
    const mover = res.requests.length ? null : st.turn;
    const before = Object.fromEntries(ids.map(d => [d, where(st, uid(d), me)]));
    const downBefore = combo.flip ? flipDown(st, me) : [];
    if (combo.flip && mover === me && st.phase === 'action') {
      out.myTurns++;
      const tops = [0, 1, 2].map(l => st.lines[l][me][st.lines[l][me].length - 1]).filter(Boolean);
      if (downBefore.length) out.readyTurns++;
      if (tops.some(u => downBefore.includes(u)) && st.players[me].hand.some(u => FLIP_ENABLER.has(st.cards[u].def))) out.liveTurns++;
    } else if (mover === me && st.phase === 'action') {
      out.myTurns++;
      /* 揃えられた手番: どの札も手札にあるか効く形で場にある (山札・捨て札・裏・覆われていない) */
      if (ids.every(d => before[d] === 'hand' || live(combo.pieces[d], before[d]))) out.readyTurns++;
      if (engine.every(d => live(combo.pieces[d], before[d]))) { out.liveTurns++; if (out.firstLive === null) out.firstLive = out.myTurns; }
    }
    const a = res.requests.length ? null : E.ai.action(st);
    if (process.env.AIM_DEBUG && mover === me && st.phase === 'action' && ids.every(d => before[d] === 'hand' || live(combo.pieces[d], before[d])) && !engine.every(d => live(combo.pieces[d], before[d])))
      (process.env.AIM_DUMP && fs.writeFileSync(process.env.AIM_DUMP + '_' + seed + '_' + out.myTurns + '.json', JSON.stringify(st))), console.error('ready seed ' + seed + ' t' + out.myTurns + ' ' + JSON.stringify(before) + ' hand=' + st.players[me].hand.map(u => st.cards[u].def).join(',') + ' -> ' + (a && (a.type === 'play' ? st.cards[a.card].def + '@L' + a.line + (a.faceUp ? '↑' : '↓') + ' (L' + a.line + '=' + st.players[me].protocols[a.line].name + ')' : a.type)) + ' 合法:' + E.legalActions(st).filter(x => x.type === 'play' && x.faceUp && ids.some(d => x.card === 'p' + me + ':' + d)).map(x => st.cards[x.card].def + '@L' + x.line).join(','));
    if (!res.requests.length && !a) break;
    let nx;
    try {
      nx = a ? E.apply(st, a) : res;
      for (let g = 0; g < 80 && !nx.error && nx.winner === null && nx.requests.length; g++) {
        const q = nx.requests[0];
        E.setAiSpecialist(true, q.player, 'dsh');
        nx = E.apply(nx.state, { type: 'choose', id: q.id, picks: E.ai.answer(nx.state, q) });
      }
    } catch (e) { break; }
    if (nx.error) break;
    /* 自分のコンパイルと SPEED 2 の生き残り (コンパイルは開始フェイズに起きるので、どちらの手番の手のログにも出る) */
    for (const l of nx.log || []) {
      if (l.startsWith('P' + (me + 1) + ': ライン') && l.endsWith('をコンパイル')) out.compiles++;
      if (/^SPEED_3 は削除の代わりに/.test(l)) out.survived++;
    }
    if (combo.solo && mover === me && st.phase === 'action' && alive(before.SPEED_3) && (before.SPEED_3 === 'top' || before.SPEED_3 === 'covUp')) out.s2Field++;
    if (combo.flip) {
      if (process.env.FLIP_DEBUG && mover === me && downBefore.length && a) console.error('seed', seed, 'down', downBefore.map(u => st.cards[u].def + (st.lines.some(L => L[me][L[me].length - 1] === u) ? '(top)' : '')), 'hand', st.players[me].hand.map(u => st.cards[u].def).join(','), '->', a.type === 'play' ? st.cards[a.card].def + '@' + a.line + (a.faceUp ? 'U' : 'D') : a.type, (nx.log || []).filter(l => /反転/.test(l)).join(' | '));
      if (mover === me) { const defs = new Set(downBefore.map(u => st.cards[u].def)); out.fired += (nx.log || []).filter(l => { const m = /^\[(\w+)\] 中段コマンド解決 \(flip\)/.exec(l); return m && defs.has(m[1]); }).length; }
      res = nx;
      continue;
    }
    if (mover === me) {
      const after = Object.fromEntries(ids.map(d => [d, where(nx.state, uid(d), me)]));
      /* 撃った: 回しの札が効く形で、撃つ札を表で出した */
      if (a && a.type === 'play' && a.faceUp && burst.includes(nx.state.cards[a.card] && nx.state.cards[a.card].def)
        && engine.every(d => live(combo.pieces[d], before[d]))) out.fired++;
      /* 揃えに行った: 揃えられた手番に、手札のコンボの札を効く形で出した (撃つ札なら撃てる形で出した) */
      if (ids.every(d => before[d] === 'hand' || live(combo.pieces[d], before[d])) && ids.some(d => before[d] === 'hand'
        && (live(combo.pieces[d], after[d]) || (combo.pieces[d] === 'play' && a && a.type === 'play' && a.faceUp && a.card === uid(d))))) out.advanced++;
      for (const d of ids) {
        const partnersAlive = combo.solo || ids.filter(x => x !== d).some(x => alive(before[x]));
        if (!partnersAlive) continue;
        const b = before[d], f = after[d];
        let why = null;
        if (b === 'hand' && f === 'trash') why = '捨てた';
        else if (b === 'hand' && f === 'down') why = '裏で出した';
        else if (live(combo.pieces[d], b) && f === 'covUp' && combo.pieces[d] === 'top') why = '覆った';
        else if ((b === 'top' || b === 'covUp') && f === 'down') why = '裏返した';
        else if ((b === 'top' || b === 'covUp' || b === 'down') && f === 'hand') why = '戻した';
        else if ((b === 'top' || b === 'covUp' || b === 'down') && f === 'trash') why = (nx.log || []).some(l => /コンパイル！/.test(l)) ? 'コンパイルで流した' : '削除した';
        if (why) { const k = d + ':' + why; out.wasted[k] = (out.wasted[k] || 0) + 1; }
      }
    }
    res = nx;
  }
  out.win = res.winner === null ? null : res.winner === me ? 1 : 0;
  return out;
}

if (!isMainThread) {
  const w = workerData;
  const E = loadEngine(w.src, w.cards, w.effects);
  E.setAiValueNet(w.model, 400);
  for (const seed of w.seeds) parentPort.postMessage({ seed, r: playGame(E, COMBOS[w.combo], seed, w.budget) });
  parentPort.postMessage({ done: true });
  return;
}

const opt = parseArgs(process.argv);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8'));
const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'valnet.json'), 'utf8'));
const engines = [['いま', fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8')]];
if (opt.base) engines.unshift(['基準', fs.readFileSync(opt.base, 'utf8')]);
const nW = opt.workers || os.cpus().length;
const seeds = Array.from({ length: opt.games }, (_, i) => opt.seed + i);

(async () => {
  for (const [label, src] of engines) {
    const rows = [];
    await Promise.all(Array.from({ length: nW }, (_, i) => new Promise((resolve, reject) => {
      const mine = seeds.filter((_, j) => j % nW === i);
      if (!mine.length) return resolve();
      const wk = new Worker(__filename, { workerData: { src, cards, effects, model, combo: opt.combo, budget: opt.budget, seeds: mine } });
      wk.on('message', (m) => (m.done ? resolve() : rows.push(m.r)));
      wk.on('error', reject);
    })));
    const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
    const wasted = {};
    for (const r of rows) for (const [k, v] of Object.entries(r.wasted)) wasted[k] = (wasted[k] || 0) + v;
    const liveGames = rows.filter(r => r.liveTurns > 0).length;
    console.log('[' + label + '] ' + COMBOS[opt.combo].name + ' ' + rows.length + '局  揃った局 ' + liveGames + ' (' + (100 * liveGames / rows.length).toFixed(0) + '%)'
      + '  揃えられた手番 ' + sum(r => r.readyTurns) + ' (うち揃えに行った ' + sum(r => r.advanced) + ')' + '  揃った手番 ' + sum(r => r.liveTurns) + ' / 自分の手番 ' + sum(r => r.myTurns)
      + '  撃った ' + sum(r => r.fired) + '  勝ち ' + sum(r => r.win || 0)
      + (COMBOS[opt.combo].solo ? '  自分のコンパイル ' + sum(r => r.compiles) + ' (SPEED 2 が生き残った ' + sum(r => r.survived) + ')  SPEED 2 が場で表の手番 ' + sum(r => r.s2Field) : ''));
    console.log('   自分で潰した (相方が生きているのに): ' + (Object.entries(wasted).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' / ') || 'なし'));
  }
})().catch(e => { console.error(e); process.exit(1); });
