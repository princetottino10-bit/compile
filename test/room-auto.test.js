'use strict';
/* 管理者の AUTO をオンラインで使う: サーバーが見せる盤面 (見えないカードの中身なし) から作った盤面で CPU が読み、
   その手・選択が本当の盤面でそのまま通る */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const Engine = require('../engine.js');
Engine.init(require('../data/cards.json'), require('../data/effects.json'));

/* supabase/functions/secure-room の publicGame・publicRequest と同じ見せ方 (カード名は対局内の別名 c0, c1, ...) */
function publicView(st, side, request) {
  const uids = Object.keys(st.cards).sort();
  const fwd = {}, rev = {};
  uids.forEach((uid, i) => { fwd[uid] = 'c' + i; rev['c' + i] = uid; });
  const alias = (v) => {
    if (typeof v !== 'string') return v;
    if (fwd[v]) return fwd[v];
    const i = v.indexOf('|');
    return i > 0 && fwd[v.slice(0, i)] ? fwd[v.slice(0, i)] + v.slice(i) : v;
  };
  const game = {
    turn: st.turn, phase: st.phase, control: st.control, winner: st.winner,
    protocols: st.players.map(p => p.protocols),
    totals: st.lines.map((_, line) => [Engine.lineTotal(st, line, 0), Engine.lineTotal(st, line, 1)]),
    counts: st.players.map(p => ({ hand: p.hand.length, deck: p.deck.length, trash: p.trash.length })),
    lines: st.lines.map(line => line.map((stack, owner) => stack.map(uid => {
      const c = st.cards[uid];
      const hidden = !c.faceUp && !((c.knownTo || 0) & (1 << side));
      return { uid: fwd[uid], owner, faceUp: c.faceUp, def: hidden ? null : c.def, value: Engine.cardValue(st, uid) };
    }))),
    hand: st.players[side].hand.map(uid => ({ uid: fwd[uid], def: st.cards[uid].def })),
    trash: st.players.map(p => p.trash.map(uid => ({ uid: fwd[uid], def: st.cards[uid].def }))),
    revealed: st.revealed ? { kind: st.revealed.kind, player: st.revealed.player, cards: (st.revealed.cards || []).slice() } : null, announce: null,
    committed: (st.commitStack || []).map(uid => {
      const c = st.cards[uid];
      if (!c || c.zone !== 'committed') return null;
      const hidden = !c.faceUp && !((c.knownTo || 0) & (1 << side));
      return { uid: fwd[uid], owner: c.owner, faceUp: c.faceUp, def: hidden ? null : c.def, commitDest: c.commitDest || null };
    }).filter(Boolean)
  };
  let req = null;
  if (request) {
    req = JSON.parse(JSON.stringify(request));
    if (Array.isArray(req.candidates)) req.candidates = req.candidates.map(alias);
    if (Array.isArray(req.focus)) req.focus = req.focus.map(alias);
    else if (req.focus) req.focus = alias(req.focus);
  }
  const legalActions = !request && st.phase === 'action' && st.winner === null
    ? Engine.legalActions(st).map(a => (a.card ? { ...a, card: fwd[a.card] } : { ...a })) : [];
  return { rm: { side, game, request: req, legalActions }, rev };
}

const unalias = (rev, v) => {
  if (typeof v !== 'string') return v;
  if (rev[v]) return rev[v];
  const i = v.indexOf('|');
  return i > 0 && rev[v.slice(0, i)] ? rev[v.slice(0, i)] + v.slice(i) : v;
};

test('オンラインの AUTO: 見えている情報だけの盤面で読んだ手・選択が、サーバーの盤面で通る', async () => {
  const ROOM = await import('../js3d/room.js');
  Engine.setTrace(false);
  Engine.setAiLevel(2);
  Engine.setAiThinkBudget(15);
  Engine.setAiPeek(-1);
  const games = [
    { seed: 11, first: 0, p0: ['FIRE', 'WATER', 'LIFE'], p1: ['PSYCHIC', 'DARKNESS', 'HATE'] },
    { seed: 23, first: 1, p0: ['SPEED', 'LIGHT', 'SPIRIT'], p1: ['FIRE', 'WATER', 'LIFE'] },
    { seed: 37, first: 0, p0: ['PSYCHIC', 'DARKNESS', 'FIRE'], p1: ['PSYCHIC', 'DARKNESS', 'FIRE'] }
  ];
  let actions = 0, answers = 0, remembered = 0;
  for (const g of games) {
    let res = Engine.newGame(g);
    const mem = [null, null];
    for (let i = 0; i < 160 && res.winner === null; i++) {
      const st = res.state;
      const req = res.requests[0] || null;
      const side = req ? req.player : st.turn;
      /* 両方の側で、公開された相手の手札を覚える。覚えている札は、いつも相手の本当の手札の中にある */
      for (const k of [0, 1]) {
        mem[k] = ROOM.trackOppHand(mem[k], publicView(st, k, null).rm);
        const real = st.players[1 - k].hand.map(u => st.cards[u].def);
        for (const d of mem[k].defs) { const j = real.indexOf(d); assert.ok(j >= 0, '覚えた札 ' + d + ' が相手の手札にない'); real.splice(j, 1); }
        remembered += mem[k].defs.length;
      }
      const { rm, rev } = publicView(st, side, req);
      const ai = ROOM.buildRoomAiState(rm, Engine, null, mem[side].defs);
      assert.ok(ai, 'AUTO の盤面を作れる');
      /* 見えないカードの中身は、本当のものではなく仮のもの (名前も付け替えてある) */
      assert.ok(Object.keys(ai.state.cards).every(u => ai.state.cards[u].def), 'どのカードにも中身がある');
      let next;
      if (req) {
        const nq = ROOM.normRequest(rm);
        const picks = ai.picks(Engine.ai.answer(ai.state, ai.request(nq)));
        next = Engine.apply(st, { type: 'choose', id: req.id, picks: picks.map(p => (Array.isArray(p) ? p.map(x => unalias(rev, x)) : unalias(rev, p))) });
        assert.ok(!next.error, '選択が通る: ' + next.error + ' ' + JSON.stringify(req));
        answers++;
      } else {
        const legal = ROOM.normLegalActions(rm);
        const a = ai.action(Engine.ai.action(ai.state));
        const hit = ROOM.matchLegalAction(legal, a);
        assert.ok(hit, '手がサーバーの合法手にある: ' + JSON.stringify(a));
        const wire = ROOM.toRoomAction(hit, side);
        next = Engine.apply(st, wire.card ? { ...wire, card: unalias(rev, wire.card) } : wire);
        assert.ok(!next.error, next.error);
        actions++;
      }
      res = next;
    }
  }
  assert.ok(actions > 60 && answers > 5, `手 ${actions} / 選択 ${answers}`);
});

test('オンラインの AUTO: タッグの部屋では作らない', async () => {
  const ROOM = await import('../js3d/room.js');
  assert.equal(ROOM.buildRoomAiState({ mode: 'tag', side: 0, game: {} }, Engine), null);
});

test('オンラインの ORACLE: 公開された相手の手札は、出ていったカードが見えているあいだだけ覚えている', async () => {
  const ROOM = await import('../js3d/room.js');
  const view = (hand, deck, opFace, revealed) => ({ side: 0, game: {
    counts: [{ hand: 5, deck: 10 }, { hand, deck }],
    lines: [[[], opFace.map((def, i) => ({ uid: 'f' + i, def, faceUp: true }))], [[], []], [[], []]],
    trash: [[], []], revealed
  } });
  let m = ROOM.trackOppHand(null, view(3, 10, [], { kind: 'hand', player: 1, cards: ['FIRE_1', 'FIRE_2', 'WATER_1'] }));
  assert.deepEqual(m.defs, ['FIRE_1', 'FIRE_2', 'WATER_1']);
  m = ROOM.trackOppHand(m, view(4, 9, [], null));                     // 1枚引いた: 覚えた3枚はそのまま
  assert.deepEqual(m.defs, ['FIRE_1', 'FIRE_2', 'WATER_1']);
  m = ROOM.trackOppHand(m, view(3, 9, ['FIRE_2'], null));             // FIRE 2 を表で出した
  assert.deepEqual(m.defs, ['FIRE_1', 'WATER_1']);
  m = ROOM.trackOppHand(m, view(2, 9, ['FIRE_2'], null));             // 何かを裏で出した: どれか分からないので忘れる
  assert.deepEqual(m.defs, []);
});

test('オンラインの ORACLE: 覚えた相手の手札は、並べ替えずに本当の中身として読む', async () => {
  const ROOM = await import('../js3d/room.js');
  const res = Engine.newGame({ seed: 5, first: 0, p0: ['FIRE', 'WATER', 'LIFE'], p1: ['PSYCHIC', 'DARKNESS', 'HATE'] });
  const st = res.state;
  const { rm } = publicView(st, 0, null);
  const real = st.players[1].hand.map(u => st.cards[u].def);
  const ai = ROOM.buildRoomAiState(rm, Engine, null, real.slice(0, 2));
  const hand = ai.state.players[1].hand.map(u => ai.state.cards[u]);
  assert.deepEqual(hand.slice(0, 2).map(c => c.def), real.slice(0, 2));
  assert.ok(hand.slice(0, 2).every(c => c.knownTo === 3));
  assert.ok(hand.slice(2).every(c => c.knownTo === 2));
});
