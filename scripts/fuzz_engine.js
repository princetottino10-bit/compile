'use strict';
/* エンジンの総当たり: CPU とでたらめな手を混ぜて大量に対戦させ、壊れ方を探す。
 *   node scripts/fuzz_engine.js [試合数=500] [最初の種=1] [出力=fuzz-report.json]
 * 一手ごとに確かめること:
 *   - 例外が出ない / エラーを返さない (でたらめな答えが弾かれるのは除く)
 *   - カードが消えたり増えたりしない (36枚が、山札・手札・捨て札・盤面・移動中のどこか1か所だけにある)
 *   - 手札・山札・捨て札・盤面にあるカードの持ち主が、その場所のプレイヤーと一致する
 *     (渡す・奪う効果や、相手の側に置いたときに持ち主は入れ替わる)
 *   - 盤面の並びとカードの居場所 (zone) が食い違わない
 *   - 必ず選ぶ選択なのに候補が足りない (答えようがなく止まる) ことがない
 *   - 決着がつかずに延々と続かない
 * 問題が起きた試合は、種と手順 (actions) を残すので、同じ試合を作り直して調べられる */
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');

const root = path.join(__dirname, '..');
const cards = JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8'));
E.init(cards, JSON.parse(fs.readFileSync(path.join(root, 'data/effects.json'), 'utf8')));
E.setTrace(false);
E.setAiLevel(1);

const GAMES = Number(process.argv[2]) || 500;
const SEED0 = Number(process.argv[3]) || 1;
const OUT = process.argv[4] || path.join(root, 'fuzz-report.json');
const MAX_STEPS = 3000;          // 1試合の手の上限 (これを超えたら「終わらない」)
const NAMES = cards.protocols.map(p => p.name);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
function sample(r, list, k) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}

/* でたらめな答え (形は正しいもの)。分からない種類は null (CPU に任せる) */
function randomAnswer(r, req) {
  const min = req.min !== undefined ? req.min : 1;
  const max = req.max !== undefined ? req.max : 1;
  switch (req.kind) {
    case 'pickCard': case 'pickHand': {
      const c = req.candidates || [];
      const k = Math.min(c.length, min + Math.floor(r() * (Math.min(max, c.length) - min + 1)));
      return sample(r, c, Math.max(0, k));
    }
    case 'pickLine': return [pick(r, req.lines)];
    case 'yesNo': return r() < 0.6 ? ['yes'] : [];
    case 'option': {
      const n = (req.options || []).length;
      if (req.optional && r() < 0.2) return [];
      return n ? [Math.floor(r() * n)] : null;
    }
    case 'arrange': return sample(r, [0, 1, 2], 3);
    default: return null;
  }
}

/* 状態の整合: 問題があれば文を返す */
function checkState(st) {
  const where = new Map();
  const put = (uid, loc) => {
    if (where.has(uid)) return 'カードが2か所にある: ' + uid + ' (' + where.get(uid) + ' と ' + loc + ')';
    where.set(uid, loc);
    return null;
  };
  for (let p = 0; p < 2; p++) {
    const pl = st.players[p];
    for (const [zone, list] of [['hand', pl.hand], ['deck', pl.deck], ['trash', pl.trash]]) {
      for (const uid of list) {
        const e = put(uid, zone + p); if (e) return e;
        const c = st.cards[uid];
        if (!c) return '存在しないカード: ' + uid;
        if (c.zone !== zone + p) return '居場所の食い違い: ' + uid + ' は ' + zone + p + ' の並びにいるが zone=' + c.zone;
        /* 渡す・奪う効果で持ち主は入れ替わる。手札・山札・捨て札にあるなら、そのプレイヤーの持ち物のはず */
        if (c.owner !== p) return '持ち主の食い違い: ' + uid + ' は ' + zone + p + ' にあるが owner=' + c.owner;
      }
    }
  }
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) {
    for (const uid of st.lines[l][s]) {
      const e = put(uid, 'line' + l + ':' + s); if (e) return e;
      const c = st.cards[uid];
      if (!c) return '存在しないカード: ' + uid;
      if (c.zone !== 'field') return '居場所の食い違い: ' + uid + ' は盤面の並びにいるが zone=' + c.zone;
    }
  }
  for (const uid of st.commitStack || []) {
    const e = put(uid, 'committed'); if (e) return e;
  }
  const all = Object.keys(st.cards);
  for (const uid of all) {
    if (!where.has(uid)) return 'どこにもいないカード: ' + uid + ' (zone=' + st.cards[uid].zone + ')';
  }
  if (all.length !== 36) return 'カードの総数が36枚でない: ' + all.length;
  /* 裁定: 相手の側に置いたカードは、置いた時点で相手のカードになる。なので盤面のカードの持ち主は、置かれている側と一致する */
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) {
    for (const uid of st.lines[l][s]) if (st.cards[uid].owner !== s) return '持ち主の食い違い: ' + uid + ' は ' + s + ' の側の盤面にあるが owner=' + st.cards[uid].owner;
  }
  if (st.winner !== null && st.winner !== 0 && st.winner !== 1) return '勝者の値が不正: ' + st.winner;
  return null;
}

function playOne(seed) {
  const r = rng(seed);
  const decks = sample(r, NAMES, 6);
  const init = { seed, p0: decks.slice(0, 3), p1: decks.slice(3), first: r() < 0.5 ? 0 : 1, winCompiles: r() < 0.5 ? 3 : 2 };
  const aiRate = r();                          // この試合で CPU に任せる割合 (試合ごとに変える)
  let res = E.newGame({ ...init });
  const actions = [];
  const fail = (kind, msg, extra) => ({ kind, msg, seed, init, actions: actions.slice(-40), steps: actions.length, ...(extra || {}) });
  for (let step = 0; step < MAX_STEPS; step++) {
    if (res.winner !== null && res.winner !== undefined) return { ok: true, steps: step, winner: res.winner };
    let a;
    try {
      if (res.requests.length) {
        const req = res.requests[0];
        const min = req.min !== undefined ? req.min : 1;
        if ((req.kind === 'pickCard' || req.kind === 'pickHand') && (req.candidates || []).length < min) {
          return fail('stuck', '必ず選ぶのに候補が足りない', { req });
        }
        if (req.kind === 'pickLine' && !(req.lines || []).length) return fail('stuck', 'ラインの候補が空', { req });
        let picks = r() < aiRate ? null : randomAnswer(r, req);
        if (picks === null) picks = E.ai.answer(res.state, req);
        a = { type: 'choose', id: req.id, picks };
      } else {
        const legal = E.legalActions(res.state);
        if (!legal.length) return fail('stuck', '打てる手がない (選択待ちでもない)');
        a = r() < aiRate ? (E.ai.action(res.state) || pick(r, legal)) : pick(r, legal);
      }
      let nx = E.apply(res.state, a);
      if (nx.error && a.type === 'choose') {
        /* でたらめな答えが弾かれたら (形は正しくても条件で不可のことがある)、CPU の答えで進める */
        a = { type: 'choose', id: a.id, picks: E.ai.answer(res.state, res.requests[0]) };
        nx = E.apply(res.state, a);
      }
      if (nx.error) return fail('error', 'エンジンがエラーを返した: ' + nx.error, { action: a });
      actions.push(a);
      const bad = checkState(nx.state);
      if (bad) return fail('state', bad, { action: a });
      res = nx;
    } catch (e) {
      return fail('throw', '例外: ' + (e && (e.message || e.__err) || String(e)), { action: a, stack: e && e.stack && String(e.stack).split('\n').slice(0, 4).join(' | ') });
    }
  }
  return fail('endless', MAX_STEPS + '手を超えても決着しない');
}

const failures = [];
const t0 = Date.now();
let steps = 0, done = 0;
for (let g = 0; g < GAMES; g++) {
  const out = playOne(SEED0 + g);
  done++;
  if (out.ok) steps += out.steps; else failures.push(out);
  if ((g + 1) % 100 === 0) console.log((g + 1) + '/' + GAMES + ' 試合, 失敗 ' + failures.length + ', ' + Math.round((Date.now() - t0) / 1000) + 's');
}
const summary = { games: done, failures: failures.length, avgSteps: Math.round(steps / Math.max(1, done - failures.length)), seconds: Math.round((Date.now() - t0) / 1000),
  byKind: failures.reduce((m, f) => { m[f.kind] = (m[f.kind] || 0) + 1; return m; }, {}) };
fs.writeFileSync(OUT, JSON.stringify({ summary, failures }, null, 1));
console.log(JSON.stringify(summary));
