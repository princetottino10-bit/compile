'use strict';
/* サイキック① (PSYCHIC_2) の「覆って永続ロック」を AI が理解しているか。
   上段「相手はカードを裏向きでのみプレイできる」は覆われても有効で、
   下段「開始: このカードを反転させる」は覆われると止まる。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
Engine.init(
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'))
);

const uidOf = (def, side) => 'p' + side + ':' + def;
function rm(a, x) { const i = a.indexOf(x); if (i >= 0) a.splice(i, 1); }
function place(st, def, side, line, faceUp) {
  const uid = uidOf(def, side), p = st.players[side];
  rm(p.deck, uid); rm(p.hand, uid); rm(p.trash, uid);
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) rm(st.lines[l][s], uid);
  st.lines[line][side].push(uid);
  st.cards[uid].zone = 'field';
  st.cards[uid].faceUp = !!faceUp;
  st.cards[uid].knownTo = faceUp ? 3 : (1 << side);
  return uid;
}
function setHand(st, side, defs) {
  const p = st.players[side];
  while (p.hand.length) { const u = p.hand.pop(); st.cards[u].zone = 'deck' + side; st.cards[u].knownTo = 0; p.deck.push(u); }
  for (const d of defs) {
    const u = uidOf(d, side);
    rm(p.deck, u);
    st.cards[u].zone = 'hand' + side; st.cards[u].knownTo = 1 << side; p.hand.push(u);
  }
}
function game() {
  return Engine.newGame({ p0: ['PSYCHIC', 'DARKNESS', 'FIRE'], p1: ['METAL', 'LIGHT', 'WATER'], seed: 9, first: 0 }).state;
}

test('評価: 覆われて表向きのサイキック①は、覆われていないものより価値が高い', () => {
  const base = game();
  place(base, 'FIRE_2', 0, 0, false);

  const covered = structuredClone(base);
  place(covered, 'PSYCHIC_2', 0, 0, true);
  covered.lines[0][0].reverse();                    // サイキック①を下 (覆われる側) へ

  const uncovered = structuredClone(base);
  place(uncovered, 'PSYCHIC_2', 0, 0, true);        // 一番上 = 次の開始で裏返る

  const facedown = structuredClone(base);
  place(facedown, 'PSYCHIC_2', 0, 0, false);
  facedown.lines[0][0].reverse();

  const sCovered = Engine.ai.score(covered, 0);
  const sUncovered = Engine.ai.score(uncovered, 0);
  const sDown = Engine.ai.score(facedown, 0);
  assert.ok(sCovered - sUncovered > 100, `永続ロックは一時ロックより十分高い (差 ${Math.round(sCovered - sUncovered)})`);
  assert.ok(sUncovered > sDown, '一時ロックでも無いよりは良い');
  /* 相手側から見れば同じだけ痛い */
  assert.ok(Engine.ai.score(covered, 1) < Engine.ai.score(uncovered, 1) - 100, '相手にとっては永続ロックが最悪');
});

test('狙い: 覆われた裏向きのサイキック①を、ダークネス②で表にしてロックを完成させる', () => {
  const st = game();
  /* ライン1 (DARKNESS) の自分側: 裏向きのサイキック①が1枚。
     ダークネス②を上に出すと覆われ、それを表にできる。
     (覆われた裏向きが2枚あると、ダークネス②の「裏向きは値4」で
     ライン合計が10に届き、コンパイル目前との交換になって検証にならない) */
  const psy = place(st, 'PSYCHIC_2', 0, 1, false);
  setHand(st, 0, ['DARKNESS_3', 'FIRE_4', 'FIRE_5']);

  const act = Engine.ai.action(st);
  assert.equal(act.card, uidOf('DARKNESS_3', 0), 'ダークネス②を選ぶはず: ' + JSON.stringify(act));
  assert.equal(act.line, 1);
  assert.equal(act.faceUp, true);

  let res = Engine.apply(st, act);
  assert.equal(res.error, null);
  let guard = 0;
  while (res.requests.length && guard++ < 10) {
    const req = res.requests[0];
    const picks = Engine.ai.answer(res.state, req);
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks });
    assert.equal(res.error, null);
  }
  const fin = res.state;
  assert.equal(fin.cards[psy].faceUp, true, 'サイキック①が表になっている');
  /* 相手は裏向きでしか出せない */
  const oppActs = Engine.legalActions({ ...fin, turn: 1, phase: 'action' });
  assert.ok(oppActs.filter(a => a.type === 'play').every(a => !a.faceUp), '相手の表向きプレイが封じられている');
});

test('備え: 相手のサイキック①が見えていない間は、相手の覆われた裏向きカードを脅威として見る', () => {
  const make = (psychicInTrash) => {
    const st = Engine.newGame({ p0: ['DARKNESS', 'FIRE', 'WATER'], p1: ['PSYCHIC', 'METAL', 'LIGHT'], seed: 9, first: 0 }).state;
    const p = st.players[1];
    const lock = uidOf('PSYCHIC_2', 1);
    rm(p.deck, lock); rm(p.hand, lock);
    if (psychicInTrash) { p.trash.push(lock); st.cards[lock].zone = 'trash1'; st.cards[lock].faceUp = true; st.cards[lock].knownTo = 3; }
    else { p.deck.push(lock); st.cards[lock].zone = 'deck1'; }
    /* 相手のライン0に裏向き2枚。下の1枚が「覆われた裏向き」 */
    for (const def of ['METAL_2', 'METAL_3']) {
      const u = uidOf(def, 1);
      rm(p.deck, u); rm(p.hand, u);
      st.lines[0][1].push(u); st.cards[u].zone = 'field'; st.cards[u].faceUp = false; st.cards[u].knownTo = 2;
    }
    return st;
  };
  const revealed = Engine.ai.score(make(true), 0);
  const hiddenSeed = Engine.ai.score(make(false), 0);
  assert.ok(hiddenSeed < revealed,
    `サイキック①が隠れている方が危険として低く評価される (${Math.round(hiddenSeed)} < ${Math.round(revealed)})`);
});

test('備え: ダークネスのラインに裏向きで置かれたカードは、一番上でも特に怪しい', () => {
  /* 相手 (side1) は PSYCHIC と DARKNESS を持つ。ライン1が相手の DARKNESS */
  const make = (line) => {
    const st = Engine.newGame({ p0: ['FIRE', 'WATER', 'METAL'], p1: ['PSYCHIC', 'DARKNESS', 'LIGHT'], seed: 9, first: 0 }).state;
    const p = st.players[1];
    const u = uidOf('LIGHT_3', 1);
    rm(p.deck, u); rm(p.hand, u);
    st.lines[line][1].push(u); st.cards[u].zone = 'field'; st.cards[u].faceUp = false; st.cards[u].knownTo = 2;
    return st;
  };
  const darknessLine = Engine.ai.score(make(1), 0);
  const otherLine = Engine.ai.score(make(2), 0);
  assert.ok(darknessLine < otherLine,
    `ダークネスのラインの裏向きの方が危険と見る (${Math.round(darknessLine)} < ${Math.round(otherLine)})`);
});

test('空撃ち: 自分の場が空なら、SPEED 3 (他のカードを移動) を表で出さずに温存する', () => {
  let wasted = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const st = Engine.newGame({ p0: ['SPEED', 'FIRE', 'WATER'], p1: ['METAL', 'LIGHT', 'DEATH'], seed, first: 0 }).state;
    setHand(st, 0, ['SPEED_4', 'SPEED_1', 'FIRE_4', 'WATER_3']);
    const act = Engine.ai.action(st);
    if (act && act.card === uidOf('SPEED_4', 0) && act.faceUp) wasted++;
  }
  assert.equal(wasted, 0, '対象の無い SPEED 3 を表で切った回数');
});

test('ロック特化: 何も仕込んでいない盤面では、サイキック①を裏でダークネスのラインへ置く', () => {
  Engine.setAiSpecialist(true, 0, 'psylock');
  try {
    const st = game();                           // p0: PSYCHIC / DARKNESS / FIRE
    setHand(st, 0, ['PSYCHIC_2', 'DARKNESS_3', 'FIRE_4', 'FIRE_5', 'PSYCHIC_4']);
    const act = Engine.ai.action(st);
    assert.equal(act.card, uidOf('PSYCHIC_2', 0), 'サイキック①を選ぶ: ' + JSON.stringify(act));
    assert.equal(act.faceUp, false, '裏向きで仕込む');
    const protos = [st.players[0].protocols[act.line].name, st.players[1].protocols[act.line].name];
    assert.ok(protos.includes('DARKNESS'), 'ダークネス②で拾えるラインに置く (実際: ' + protos.join('/') + ')');
  } finally {
    Engine.setAiSpecialist(false);
  }
});

test('ロック特化: 仕込んだ①の上にダークネス②を表で出して、永続ロックを完成させる', () => {
  Engine.setAiSpecialist(true, 0, 'psylock');
  try {
    const st = game();
    const psy = place(st, 'PSYCHIC_2', 0, 1, false);   // ライン1 = DARKNESS
    setHand(st, 0, ['DARKNESS_3', 'FIRE_4', 'FIRE_5', 'PSYCHIC_4']);
    const act = Engine.ai.action(st);
    assert.equal(act.card, uidOf('DARKNESS_3', 0), 'ダークネス②を選ぶ: ' + JSON.stringify(act));
    assert.equal(act.line, 1);
    assert.equal(act.faceUp, true);
    let res = Engine.apply(st, act);
    let guard = 0;
    while (res.requests.length && guard++ < 10) {
      const req = res.requests[0];
      res = Engine.apply(res.state, { type: 'choose', id: req.id, picks: Engine.ai.answer(res.state, req) });
      assert.equal(res.error, null);
    }
    assert.equal(res.state.cards[psy].faceUp, true, '覆われた①が表になり、ロックが完成する');
  } finally {
    Engine.setAiSpecialist(false);
  }
});

test('狙い (スピード③ルート): 終了時の移動で、表のサイキック①を覆ってロックを完成させる', () => {
  const st = Engine.newGame({ p0: ['PSYCHIC', 'DARKNESS', 'SPEED'], p1: ['METAL', 'LIGHT', 'WATER'], seed: 9, first: 0 }).state;
  /* 前のターンに出したスピード③ (ライン2・一番上) と、このターンに表で出したサイキック① (ライン0) */
  place(st, 'SPEED_4', 0, 2, true);
  const psy = place(st, 'PSYCHIC_2', 0, 0, true);
  setHand(st, 0, ['PSYCHIC_4', 'DARKNESS_2']);
  /* アクションは別のラインに裏で1枚。終了フェイズでスピード③の移動が来る */
  let res = Engine.apply(st, { type: 'play', card: uidOf('DARKNESS_2', 0), line: 1, faceUp: false });
  assert.equal(res.error, null);
  let guard = 0;
  while (res.requests.length && guard++ < 10) {
    const req = res.requests[0];
    const picks = Engine.ai.answer(res.state, req);
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks });
    assert.equal(res.error, null);
  }
  const fin = res.state;
  const stack = fin.lines[0][0];
  assert.ok(stack.indexOf(psy) >= 0 && stack.indexOf(psy) < stack.length - 1,
    'サイキック①が覆われている: ' + stack.map(u => fin.cards[u].def).join(','));
  assert.equal(fin.cards[psy].faceUp, true, '①は表のまま');
});

test('空撃ち判定は「置いたあと」の盤面で行う (ダークネス②以外も)', () => {
  const setup = (protos, defId) => {
    const st = Engine.newGame({ p0: protos, p1: ['DEATH', 'GRAVITY', 'SPIRIT'], seed: 3, first: 0 }).state;
    const p = st.players[0];
    const self = uidOf(defId, 0);
    const other = p.deck.find(u => u !== self);
    rm(p.deck, other); rm(p.hand, other);
    st.lines[0][0].push(other); st.cards[other].zone = 'field'; st.cards[other].faceUp = false; st.cards[other].knownTo = 1;
    rm(p.deck, self); rm(p.hand, self);
    st.cards[self].zone = 'hand0'; p.hand.push(self);
    return { st, self };
  };
  const fizz = (st, self, defId, line) => Engine.ai.middleFizzles(st, 0, { card: self, line, faceUp: true }, Engine.defs[defId]);

  /* タイム①「覆われているカードを1枚反転」: 上に置けば自分の1枚が覆われて対象になる */
  let t = setup(['TIME', 'FIRE', 'WATER'], 'TIME_2');
  assert.equal(fizz(t.st, t.self, 'TIME_2', 0), false, 'タイム①を上に置けば対象あり');
  assert.equal(fizz(t.st, t.self, 'TIME_2', 1), true, 'タイム①を別ラインに置くと覆われたカードが無い');

  /* スピード③「あなたの他のカードを1枚移動」: 唯一の自分のカードの上に置くと、それが覆われて動かせない */
  t = setup(['SPEED', 'FIRE', 'WATER'], 'SPEED_4');
  assert.equal(fizz(t.st, t.self, 'SPEED_4', 0), true, 'スピード③を唯一の札の上に置くと空撃ち');
  assert.equal(fizz(t.st, t.self, 'SPEED_4', 1), false, '別ラインに置けば動かせる');
});

test('ロック特化 (スピード③ルート): スピード③が構えていれば、①を表で別ラインに出す', () => {
  Engine.setAiSpecialist(true, 0, 'psylock');
  try {
    const st = Engine.newGame({ p0: ['PSYCHIC', 'DARKNESS', 'SPEED'], p1: ['METAL', 'LIGHT', 'WATER'], seed: 9, first: 0 }).state;
    place(st, 'SPEED_4', 0, 2, true);                    // 前のターンに出したスピード③
    setHand(st, 0, ['PSYCHIC_2', 'PSYCHIC_4', 'SPEED_2']);
    const act = Engine.ai.action(st);
    assert.equal(act.card, uidOf('PSYCHIC_2', 0), 'サイキック①を出す: ' + JSON.stringify(act));
    assert.equal(act.faceUp, true, '表で出す (終了時に覆う)');
    assert.notEqual(act.line, 2, 'スピード③を覆わないラインに出す');
  } finally {
    Engine.setAiSpecialist(false);
  }
});
