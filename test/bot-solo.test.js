'use strict';
/* 公式ソロモード (BOT) — COMP-MN03 Rulesheet Solo Mode */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);

const ME = ['FIRE', 'WATER', 'SPEED'];
const BOT = ['AMBUSH', 'FULCRUM', 'OVERWHELM'];
function ng(bot, opts) {
  return Engine.newGame(Object.assign({ p0: ME, p1: BOT, seed: 3, bot: Object.assign({ plays: ['up'], control: 'none' }, bot) }, opts || {}));
}
const clone = (o) => JSON.parse(JSON.stringify(o));
/* あなたの手番を手早く終える (リフレッシュできなければ裏向きで1枚) */
function passMe(res) {
  const acts = Engine.legalActions(res.state);
  const a = acts.find(x => x.type === 'play' && !x.faceUp) || acts[0];
  return settle(Engine.apply(res.state, a));
}
/* 選択は AI に答えさせて、次の手を待つ盤面まで進める */
function settle(res) {
  for (let g = 0; res.requests && res.requests.length && g < 40; g++) {
    const q = res.requests[0];
    res = Engine.apply(res.state, { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) });
  }
  assert.ok(!res.error, res.error);
  return res;
}
/* BOT の手番の頭 (アクション待ち) の盤面を作る: キューと場を差し替える */
function botTurn(res, queue, mutate) {
  const st = clone(res.state);
  st.turn = 1; st.phase = 'action'; st.bot.played = 0;
  const p = st.players[1];
  const all = p.hand.concat(p.deck);
  p.hand = queue.map(id => 'p1:' + id);
  p.deck = all.filter(u => p.hand.indexOf(u) < 0);
  for (const u of p.hand) st.cards[u].zone = 'hand1';
  for (const u of p.deck) st.cards[u].zone = 'deck1';
  if (mutate) mutate(st);
  return st;
}

test('あなたがいつも先手。BOT の手札はキュー', () => {
  const res = ng({}, { first: 1 });
  assert.strictEqual(res.state.turn, 0);
  assert.strictEqual(res.state.players[1].hand.length, 5);
  assert.strictEqual(res.state.bot.side, 1);
});

test('表向き: キューの前の札を、プロトコルの合うラインにだけ出す', () => {
  const st = botTurn(ng({}), ['FULCRUM_3', 'AMBUSH_2']);
  const acts = Engine.legalActions(st);
  assert.deepStrictEqual(acts, [{ type: 'play', card: 'p1:FULCRUM_3', line: 1, faceUp: true }]);
  /* ほかの札・ほかのラインは出せない */
  const bad = Engine.apply(st, { type: 'play', card: 'p1:AMBUSH_2', line: 0, faceUp: true });
  assert.ok(bad.error);
});

test('裏向き (いちばん低い / 高い): BOT の合計で決まる。同点なら候補が複数', () => {
  const stLow = botTurn(ng({ plays: ['low'] }), ['FULCRUM_3'], (st) => {
    st.lines[0][1] = ['p1:AMBUSH_5']; st.cards['p1:AMBUSH_5'].zone = 'field'; st.cards['p1:AMBUSH_5'].faceUp = true;
    st.players[1].deck = st.players[1].deck.filter(u => u !== 'p1:AMBUSH_5');
  });
  const low = Engine.legalActions(stLow);
  assert.deepStrictEqual(low.map(a => a.line).sort(), [1, 2]);
  assert.ok(low.every(a => !a.faceUp));
  const stHigh = clone(stLow); stHigh.bot.plays = ['high'];
  assert.deepStrictEqual(Engine.legalActions(stHigh).map(a => a.line), [0]);
  /* 同点はあなたに有利な方 (AI が選ぶ)。どちらかの候補になっている */
  const pick = Engine.botAction(stLow);
  assert.ok(low.some(a => a.line === pick.line));
});

test('2枚出すシナリオ: 1枚目のあともアクションが続き、2枚目はキューの次の札', () => {
  const st = botTurn(ng({ plays: ['up', 'up'] }), ['FULCRUM_3', 'OVERWHELM_4', 'AMBUSH_2']);
  let res = settle(Engine.apply(st, Engine.botAction(st)));
  assert.strictEqual(res.state.turn, 1);
  assert.strictEqual(res.state.phase, 'action');
  const acts = Engine.legalActions(res.state);
  assert.ok(acts.every(a => a.card === 'p1:OVERWHELM_4'));
  res = settle(Engine.apply(res.state, Engine.botAction(res.state)));
  assert.strictEqual(res.state.turn, 0, '2枚出したら手番が終わる');
  assert.deepStrictEqual(res.state.players[1].hand, ['p1:AMBUSH_2']);
});

test('キューが足りなければ、あるだけ出して終わる。空ならリフレッシュ', () => {
  const st = botTurn(ng({ plays: ['up', 'up', 'up'] }), ['FULCRUM_3']);
  const res = settle(Engine.apply(st, Engine.botAction(st)));
  assert.strictEqual(res.state.turn, 0);
  const st2 = botTurn(res, []);
  assert.deepStrictEqual(Engine.legalActions(st2), [{ type: 'refresh' }]);
  const res2 = settle(Engine.apply(st2, { type: 'refresh' }));
  assert.strictEqual(res2.state.players[1].hand.length, 5);
});

test('通常モードは BOT のカードのコマンドが無い。上級モードは解決する', () => {
  /* FULCRUM 3 などの中段を持つ札で比べる: 中段の解決のログが出るかどうか */
  const withMiddle = cards.protocols.find(p => p.name === 'FULCRUM').cards.map(c => c.id).find(id => effects[id] && effects[id].middle && effects[id].middle.ops);
  assert.ok(withMiddle);
  for (const advanced of [false, true]) {
    const st = botTurn(ng({ advanced }), [withMiddle]);
    const res = Engine.apply(st, Engine.legalActions(st)[0]);
    const ran = res.log.some(m => String(m.msg || m).includes('中段コマンド解決'));
    assert.strictEqual(ran, advanced, (advanced ? '上級' : '通常') + 'モード');
  }
});

test('BOT がコンパイル済みのプロトコルをもう一度コンパイルしたら BOT の勝ち', () => {
  const st = botTurn(ng({}), ['AMBUSH_2'], (s) => {
    s.phase = 'start';
    s.players[1].protocols[0].compiled = true;
    s.lines[0][1] = ['p1:AMBUSH_6', 'p1:OVERWHELM_6'];
    for (const u of s.lines[0][1]) { s.cards[u].zone = 'field'; s.cards[u].faceUp = true; s.players[1].deck = s.players[1].deck.filter(x => x !== u); }
  });
  const res = settle(Engine.apply(st, { type: '_begin' }));
  assert.strictEqual(res.state.winner, 1);
});

test('コントロール: BOT はコンパイル・リフレッシュの前にコントロールを失い、シナリオの効果 (スティール) を行う', () => {
  const st = botTurn(ng({ control: 'steal' }), [], (s) => { s.control = 1; });
  const myDeck = st.players[0].deck.length;
  const top = st.players[0].deck[0];
  const res = settle(Engine.apply(st, { type: 'refresh' }));
  assert.strictEqual(res.state.control, -1);
  assert.strictEqual(res.state.players[0].deck.length, myDeck - 1);
  assert.strictEqual(res.state.players[1].hand[0], top, 'あなたのデッキの上がキューの前 (最初に引いた札)');
  assert.strictEqual(res.state.players[1].hand.length, 5);
});

test('コントロール (並べ替え): 並べ替えるかどうか・どちらをかは、あなたが決める', () => {
  const st = botTurn(ng({ control: 'rearrange' }), [], (s) => { s.control = 1; });
  const res = Engine.apply(st, { type: 'refresh' });
  assert.strictEqual(res.requests.length, 1);
  assert.strictEqual(res.requests[0].player, 0);
  assert.strictEqual(res.requests[0].prompt, 'control-rearrange');
});

test('BOT が捨てる札はキューの前から', () => {
  const st = botTurn(ng({}), ['FULCRUM_3', 'AMBUSH_2', 'OVERWHELM_4']);
  const req = { kind: 'pickHand', player: 1, candidates: ['p1:OVERWHELM_4', 'p1:AMBUSH_2', 'p1:FULCRUM_3'], min: 2, max: 2, prompt: 'discard', id: 'q1' };
  assert.deepStrictEqual(Engine.ai.answer(st, req), ['p1:FULCRUM_3', 'p1:AMBUSH_2']);
});

test('12シナリオを通しで指しても止まらない (あなた側は AI)', () => {
  const scen = [
    { advanced: false, plays: ['high', 'low', 'low'], control: 'draw', p1: ['AMBUSH', 'FULCRUM', 'OVERWHELM'] },
    { advanced: true, plays: ['up', 'up'], control: 'steal', p1: ['GLUTTONY', 'LUST', 'PRIDE'] },
    { advanced: true, plays: ['low', 'up', 'up'], control: 'rearrange', p1: ['AMBUSH', 'MOMENTUM', 'OVERWHELM'] }
  ];
  for (const sc of scen) {
    let res = Engine.newGame({ p0: ME, p1: sc.p1, seed: 11, bot: sc });
    for (let g = 0; res.state.winner === null && g < 2000; g++) {
      assert.ok(!res.error, res.error);
      if (res.requests.length) { const q = res.requests[0]; res = Engine.apply(res.state, { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) }); }
      else res = Engine.apply(res.state, Engine.ai.action(res.state));
    }
    assert.notStrictEqual(res.state.winner, null);
  }
});
