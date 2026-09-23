/* チュートリアル: 各レッスンが、想定した手でクリアでき、外れた手では失敗になること。
   盤面は Engine.newPuzzle で作り、相手の手番は CPU で進める (画面と同じ流れ) */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Engine = require('../engine.js');

Engine.init(
  JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects.json'), 'utf8'))
);
Engine.setTrace(true);
Engine.setAiLevel(0);

const loadTu = () => import('../js3d/tutorial.js');
const ME = 0;
const total = (st, line, side) => Engine.lineTotal(st, line, side);

/* 選択を答え切る。自分の選択は mine(req) で、相手の選択は AI で */
function drain(res, mine) {
  let guard = 0;
  while (res.requests.length && guard++ < 20) {
    const req = res.requests[0];
    const picks = req.player === ME ? mine(req) : Engine.ai.answer(res.state, req);
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks });
    assert.equal(res.error, null);
  }
  return res;
}

/* レッスンを1つ遊ぶ: 自分の手 → (続くなら) 相手の手番 → 判定。判定の結果を返す */
async function playLesson(lesson, action, mine = (req) => req.candidates.slice(0, req.min || 1)) {
  const { judgeStep } = await loadTu();
  let res = Engine.newPuzzle(lesson.spec, { seed: 1 });
  res = Engine.apply(res.state, action);
  assert.equal(res.error, null);
  res = drain(res, mine);
  for (let turn = 0; turn < 4; turn++) {
    const st = res.state;
    const result = judgeStep(lesson, { st, trace: res.trace, me: ME, total });
    if (result) return result;
    if (st.winner !== null || st.turn === ME) return null;
    /* 相手の手番を CPU で進める */
    res = Engine.apply(st, Engine.ai.action(st));
    assert.equal(res.error, null);
    res = drain(res, mine);
  }
  return null;
}

test('すべてのレッスンの盤面が作れて、自分の手番から始まる', async () => {
  const { LESSONS } = await loadTu();
  assert.ok(LESSONS.length >= 5);
  for (const lesson of LESSONS) {
    const res = Engine.newPuzzle(lesson.spec, { seed: 1 });
    assert.equal(res.error, null);
    assert.equal(res.state.turn, ME);
    assert.equal(res.state.phase, 'action');
    assert.equal(res.requests.length, 0);
    assert.ok(lesson.steps.length && lesson.task);
  }
});

test('案内は「次へ」なしで、選んだカード・求められた選択・待ちの状態から決まる', async () => {
  const { LESSONS, coachStep } = await loadTu();
  const c = (o) => ({ sel: null, ask: null, waiting: false, ...o });
  /* レッスン1: 何も選んでいない → SPEED 1 を選ぶ → 表を押す / 別のカードなら選び直し */
  assert.equal(coachStep(LESSONS[0], c({})), 0);
  assert.equal(coachStep(LESSONS[0], c({ sel: 'SPEED_2' })), 1);
  assert.equal(coachStep(LESSONS[0], c({ sel: 'FIRE_6' })), 2);
  assert.deepEqual(LESSONS[0].steps[1].focus, { line: 'SPEED', face: 'up' });
  /* レッスン2: 選んだら「裏」、手番を終えたらコンパイル待ち */
  assert.equal(coachStep(LESSONS[1], c({ sel: 'SPEED_3' })), 1);
  assert.equal(coachStep(LESSONS[1], c({ waiting: true })), 2);
  /* レッスン4: 捨てる選択 → 削除する選択 */
  assert.equal(coachStep(LESSONS[4], c({ ask: 'discard' })), 3);
  assert.equal(coachStep(LESSONS[4], c({ ask: 'delete' })), 4);
  /* レッスンが想定していない選択 (違うカードの効果) を求められたら汎用の案内 (-1) */
  assert.equal(coachStep(LESSONS[0], c({ ask: 'discard' })), -1);
  assert.equal(coachStep(LESSONS[4], c({ ask: 'shift' })), -1);
  /* どのレッスンも先頭の案内は条件なしで出せる */
  for (const lesson of LESSONS) assert.equal(lesson.steps[0].when, undefined);
});

test('レッスン1: SPEED 1 を SPEED のラインに表向きで置けばクリア、ほかは失敗', async () => {
  const { LESSONS } = await loadTu();
  const ok = await playLesson(LESSONS[0], { type: 'play', card: 'p0:SPEED_2', line: 0, faceUp: true });
  assert.equal(ok.ok, true);
  const ng = await playLesson(LESSONS[0], { type: 'play', card: 'p0:FIRE_6', line: 1, faceUp: true }, (req) => req.candidates.slice(0, 1));
  assert.equal(ng.ok, false);
});

test('レッスン2: FIRE のラインに裏向きで置くと、相手の手番のあとで FIRE がコンパイルされる', async () => {
  const { LESSONS } = await loadTu();
  const ok = await playLesson(LESSONS[1], { type: 'play', card: 'p0:SPEED_3', line: 1, faceUp: false });
  assert.equal(ok.ok, true, ok.text);
  const ng = await playLesson(LESSONS[1], { type: 'play', card: 'p0:SPEED_3', line: 0, faceUp: false });
  assert.equal(ng.ok, false);
});

test('レッスン3: リフレッシュすればクリア、カードを置くと失敗', async () => {
  const { LESSONS } = await loadTu();
  assert.equal((await playLesson(LESSONS[2], { type: 'refresh' })).ok, true);
  assert.equal((await playLesson(LESSONS[2], { type: 'play', card: 'p0:LIFE_2', line: 2, faceUp: false })).ok, false);
});

test('レッスン5: FIRE 1 で LIGHT の一番上を削除すればクリア、自分のカードを消すと失敗', async () => {
  const { LESSONS } = await loadTu();
  const target = (uid) => (req) => req.prompt === 'discard' || req.kind === 'pickHand'
    ? req.candidates.slice(0, 1)
    : [req.candidates.find(c => String(c).startsWith(uid))];
  const ok = await playLesson(LESSONS[4], { type: 'play', card: 'p0:FIRE_2', line: 1, faceUp: true }, target('p1:LIGHT_5'));
  assert.equal(ok.ok, true, ok.text);
  const ng = await playLesson(LESSONS[4], { type: 'play', card: 'p0:FIRE_2', line: 1, faceUp: true }, target('p0:LIFE_5'));
  assert.equal(ng.ok, false);
});

test('レッスン9: SPEED のラインに裏向きで置けば、次の手番の始めに3つ目がコンパイルされて勝つ', async () => {
  const { LESSONS } = await loadTu();
  const ok = await playLesson(LESSONS[8], { type: 'play', card: 'p0:FIRE_5', line: 0, faceUp: false });
  assert.equal(ok.ok, true, ok.text);
  const ng = await playLesson(LESSONS[8], { type: 'play', card: 'p0:SPEED_2', line: 0, faceUp: true });
  assert.equal(ng.ok, false);
});

test('レッスン4: FIRE 0 の上にカードを重ねれば (裏向きでも) クリア、ほかのラインに置くと失敗', async () => {
  const { LESSONS } = await loadTu();
  const ok = await playLesson(LESSONS[3], { type: 'play', card: 'p0:SPEED_3', line: 1, faceUp: false });
  assert.equal(ok.ok, true, ok.text);
  const ng = await playLesson(LESSONS[3], { type: 'play', card: 'p0:SPEED_3', line: 0, faceUp: false });
  assert.equal(ng.ok, false);
});

test('レッスン6: FIRE 0 を表向きで置き、引きすぎた手札を5枚まで捨てればクリア', async () => {
  const { LESSONS } = await loadTu();
  const ok = await playLesson(LESSONS[5], { type: 'play', card: 'p0:FIRE_1', line: 1, faceUp: true });
  assert.equal(ok.ok, true, ok.text);
  const ng = await playLesson(LESSONS[5], { type: 'play', card: 'p0:LIFE_3', line: 2, faceUp: false });
  assert.equal(ng.ok, false);
});

test('レッスン7: 2つ目のラインでリードすると、次の手番の始めにコントロールを取れる', async () => {
  const { LESSONS } = await loadTu();
  const ok = await playLesson(LESSONS[6], { type: 'play', card: 'p0:SPEED_6', line: 2, faceUp: false });
  assert.equal(ok.ok, true, ok.text);
  const ng = await playLesson(LESSONS[6], { type: 'play', card: 'p0:SPEED_6', line: 0, faceUp: false });
  assert.equal(ng.ok, false);
});

test('レッスン8: コントロールを使って相手の 13 点のラインをコンパイル済みの METAL に並べ替えればクリア', async () => {
  const { LESSONS } = await loadTu();
  const pick = (who, order) => (req) => req.prompt === 'control-rearrange' ? [who] : req.kind === 'arrange' ? order : req.candidates.slice(0, req.min || 1);
  const ok = await playLesson(LESSONS[7], { type: 'refresh' }, pick(1, [1, 0, 2]));
  assert.equal(ok.ok, true, ok.text);
  const ng = await playLesson(LESSONS[7], { type: 'refresh' }, pick(2, [1, 0, 2]));
  assert.equal(ng.ok, false);
});
