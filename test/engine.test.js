'use strict';
/* engine.js の単体テスト — node --test test/ で実行 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);

/* ---------- ヘルパ ---------- */

function ng(opts) {
  return Engine.newGame(Object.assign({
    p0: ['DARKNESS', 'FIRE', 'WATER'],
    p1: ['DEATH', 'METAL', 'SPEED'],
    seed: 7
  }, opts || {}));
}

function uidOf(defId, side) { return 'p' + side + ':' + defId; }
function sideOfUid(uid) { return +uid[1]; }

/* テスト用: カードをどこからでも引き抜いて場に直接置く */
function place(st, defId, side, line, faceUp) {
  const uid = uidOf(defId, side);
  const p = st.players[side];
  rm(p.deck, uid); rm(p.hand, uid); rm(p.trash, uid);
  st.lines[line][side].push(uid);
  st.cards[uid].zone = 'field';
  st.cards[uid].faceUp = !!faceUp;
  return uid;
}

/* テスト用: 手札を指定カードだけにする(残りはデッキの底へ) */
function setHand(st, side, defIds) {
  const p = st.players[side];
  while (p.hand.length) {
    const u = p.hand.pop();
    st.cards[u].zone = 'deck' + side;
    p.deck.push(u);
  }
  for (const d of defIds) {
    const uid = uidOf(d, side);
    rm(p.deck, uid);
    st.cards[uid].zone = 'hand' + side;
    p.hand.push(uid);
  }
}

function rm(arr, x) { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); }

/* requests に answerer で答えながら完了まで進める */
function drive(res, answerer, maxSteps) {
  let n = 0;
  while (res.requests.length) {
    if (++n > (maxSteps || 50)) throw new Error('drive: 選択要求が収束しない: ' + JSON.stringify(res.requests[0]));
    const req = res.requests[0];
    const picks = answerer(req, res);
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks });
    assert.equal(res.error, null, 'choose エラー: ' + res.error);
  }
  return res;
}

function countAll(st) {
  let n = st.players[0].deck.length + st.players[0].hand.length + st.players[0].trash.length
        + st.players[1].deck.length + st.players[1].hand.length + st.players[1].trash.length;
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) n += st.lines[l][s].length;
  return n;
}

/* ---------- 基本フロー ---------- */

test('初期状態: 手札5枚・デッキ13枚・P1のアクション待ち', () => {
  const r = ng();
  assert.equal(r.error, null);
  assert.equal(r.requests.length, 0);
  const st = r.state;
  assert.equal(st.turn, 0);
  assert.equal(st.phase, 'action');
  for (let p = 0; p < 2; p++) {
    assert.equal(st.players[p].hand.length, 5);
    assert.equal(st.players[p].deck.length, 13);
  }
  assert.equal(countAll(st), 36);
});

test('合法手: 表向きは一致ラインのみ・裏向きは全ライン・手札5枚未満ならリフレッシュ可', () => {
  const r = ng();
  const st = r.state;
  setHand(st, 0, ['DARKNESS_1']);
  const acts = Engine.legalActions(st);
  const ups = acts.filter(a => a.type === 'play' && a.faceUp).map(a => a.line);
  const downs = acts.filter(a => a.type === 'play' && !a.faceUp).map(a => a.line);
  assert.deepEqual(ups, [0]);          // DARKNESS は P1 の line0 のみ
  assert.deepEqual(downs, [0, 1, 2]);
  assert.ok(acts.some(a => a.type === 'refresh'));
});

test('手札0枚: リフレッシュのみ合法、実行で5枚になる', () => {
  const r = ng();
  setHand(r.state, 0, []);
  const acts = Engine.legalActions(r.state);
  assert.deepEqual(acts, [{ type: 'refresh' }]);
  let res = Engine.apply(r.state, { type: 'refresh' });
  assert.equal(res.error, null);
  assert.equal(res.state.players[0].hand.length, 5);
  assert.equal(res.state.turn, 1); // ターンが渡った
});

test('裏向きプレイ: 効果は発動せずターンが渡る', () => {
  const r = ng();
  setHand(r.state, 0, ['DARKNESS_1']);
  const res = Engine.apply(r.state, { type: 'play', card: uidOf('DARKNESS_1', 0), line: 1, faceUp: false });
  assert.equal(res.error, null);
  assert.equal(res.requests.length, 0);
  const st = res.state;
  assert.equal(st.turn, 1);
  assert.deepEqual(st.lines[1][0], [uidOf('DARKNESS_1', 0)]);
  assert.equal(st.cards[uidOf('DARKNESS_1', 0)].faceUp, false);
  assert.equal(st.players[0].hand.length, 0);
});

/* ---------- カード効果 ---------- */

test('DARKNESS_1: 3枚ドロー + 相手の覆われたカードを移動', () => {
  const r = ng();
  const st = r.state;
  place(st, 'DEATH_1', 1, 0, false);   // 下 (covered になる)
  place(st, 'DEATH_4', 1, 0, false);   // 上
  setHand(st, 0, ['DARKNESS_1']);
  let res = Engine.apply(st, { type: 'play', card: uidOf('DARKNESS_1', 0), line: 0, faceUp: true });
  assert.equal(res.error, null);
  // 移動先ライン選択 (1 or 2) が要求される
  assert.equal(res.requests.length, 1);
  assert.equal(res.requests[0].kind, 'pickLine');
  res = drive(res, req => [req.lines[req.lines.length - 1]]);
  const st2 = res.state;
  assert.equal(st2.players[0].hand.length, 3);                  // 3枚ドロー
  assert.deepEqual(st2.lines[2][1], [uidOf('DEATH_1', 1)]);     // 覆われていたカードが移動
  assert.deepEqual(st2.lines[0][1], [uidOf('DEATH_4', 1)]);
});

test('FIRE_2: 捨て札にした場合のみ削除 (そうした場合)', () => {
  const r = ng();
  const st = r.state;
  place(st, 'DEATH_4', 1, 0, false);
  setHand(st, 0, ['FIRE_2', 'FIRE_6']);
  let res = Engine.apply(st, { type: 'play', card: uidOf('FIRE_2', 0), line: 1, faceUp: true });
  assert.equal(res.error, null);
  // 手札1枚なので自動で捨て札 → 削除対象の選択 (DEATH_4 と FIRE_2 自身)
  assert.equal(res.requests.length, 1);
  assert.equal(res.requests[0].kind, 'pickCard');
  res = drive(res, req => [uidOf('DEATH_4', 1)]);
  assert.equal(res.state.players[0].trash.length, 1); // FIRE_6
  assert.equal(res.state.players[1].trash.length, 1); // DEATH_4
});

test('FIRE_2: 手札がなければ削除は発動しない', () => {
  const r = ng();
  const st = r.state;
  place(st, 'DEATH_4', 1, 0, false);
  setHand(st, 0, ['FIRE_2']);
  const res = Engine.apply(st, { type: 'play', card: uidOf('FIRE_2', 0), line: 1, faceUp: true });
  assert.equal(res.error, null);
  assert.equal(res.requests.length, 0);
  assert.deepEqual(res.state.lines[0][1], [uidOf('DEATH_4', 1)]); // 無傷
  assert.equal(res.state.players[1].trash.length, 0);
});

test('キャッシュ確認: 手札6枚で1枚捨てる要求', () => {
  const r = ng({ p1: ['SPEED', 'METAL', 'LIFE'] });
  const st = r.state;
  setHand(st, 1, ['SPEED_2', 'METAL_5', 'LIFE_6', 'LIFE_2', 'METAL_1']);
  setHand(st, 0, ['DARKNESS_6']);
  // P1: 裏でプレイしてターンを渡す
  let res = Engine.apply(st, { type: 'play', card: uidOf('DARKNESS_6', 0), line: 0, faceUp: false });
  assert.equal(res.error, null);
  // P2: SPEED_2 をプレイ (line0 = SPEED) → 2枚ドロー → 手札6枚 → キャッシュ
  res = Engine.apply(res.state, { type: 'play', card: uidOf('SPEED_2', 1), line: 0, faceUp: true });
  assert.equal(res.error, null);
  assert.equal(res.requests.length, 1);
  assert.equal(res.requests[0].kind, 'pickHand');
  assert.equal(res.requests[0].prompt, 'clear-cache');
  res = drive(res, req => req.candidates.slice(0, 1));
  // キャッシュクリアで5枚 → 場の SPEED_2 上段「キャッシュをクリアしたあと: 1枚引く」で6枚
  assert.equal(res.state.players[1].hand.length, 6);
  assert.equal(res.state.players[1].trash.length, 1);
});

test('コンパイル: 値10以上かつ相手超過で強制コンパイル・コントロール獲得も確認', () => {
  const r = ng();
  const st = r.state;
  // P1 line2 (WATER) に合計12を構築
  place(st, 'WATER_4', 0, 2, true);  // 3
  place(st, 'WATER_5', 0, 2, true);  // 4
  place(st, 'WATER_6', 0, 2, true);  // 5
  setHand(st, 0, ['DARKNESS_6']);
  setHand(st, 1, []);
  // P1: 裏向きプレイで自分のターンを終える (line0 → 2ライン優勢になる)
  let res = Engine.apply(st, { type: 'play', card: uidOf('DARKNESS_6', 0), line: 0, faceUp: false });
  assert.equal(res.error, null);
  // P2: リフレッシュのみ
  res = Engine.apply(res.state, { type: 'refresh' });
  assert.equal(res.error, null);
  // P1 のターン開始: コントロール獲得 → コンパイル → コントロール消費の並べ替え選択
  assert.equal(res.requests.length, 1);
  assert.equal(res.requests[0].prompt, 'control-rearrange');
  res = drive(res, req => [2]); // 並べ替えない
  const st2 = res.state;
  assert.equal(st2.players[0].protocols[2].compiled, true);
  assert.equal(st2.lines[2][0].length, 0);
  assert.equal(st2.control, -1);                       // 消費されて中立
  assert.ok(st2.players[0].trash.length >= 3);
  assert.equal(countAll(st2), 36);
});

test('METAL_6: 反転されそうになると先に自己削除し、反転は消費される', () => {
  const r = ng();
  const st = r.state;
  place(st, 'METAL_6', 1, 1, true);
  setHand(st, 0, ['WATER_1']);
  const res = Engine.apply(st, { type: 'play', card: uidOf('WATER_1', 0), line: 2, faceUp: true });
  assert.equal(res.error, null);
  assert.equal(res.requests.length, 0);
  const st2 = res.state;
  assert.deepEqual(st2.players[1].trash, [uidOf('METAL_6', 1)]);  // 自己削除
  assert.equal(st2.cards[uidOf('WATER_1', 0)].faceUp, false);     // 自身は裏に反転
});

test('FIRE_1 下段: 覆われる直前に先へドロー (committed カードは対象外)', () => {
  const r = ng();
  const st = r.state;
  place(st, 'FIRE_1', 0, 1, true);
  setHand(st, 0, ['FIRE_6']);
  const res = Engine.apply(st, { type: 'play', card: uidOf('FIRE_6', 0), line: 1, faceUp: true });
  assert.equal(res.error, null);
  assert.equal(res.requests.length, 0);
  const st2 = res.state;
  // FIRE_1 のトリガー: 1枚ドロー(→手札1) → 反転対象なし → FIRE_6 着地
  // FIRE_6 中段: 手札1枚を自動で捨て札
  assert.deepEqual(st2.lines[1][0], [uidOf('FIRE_1', 0), uidOf('FIRE_6', 0)]);
  assert.equal(st2.players[0].hand.length, 0);
  assert.equal(st2.players[0].trash.length, 1);
});

test('SPEED_3: コンパイル削除の代わりに移動 (置換効果)', () => {
  const r = ng();
  const st = r.state;
  place(st, 'WATER_4', 0, 2, true);
  place(st, 'WATER_5', 0, 2, true);
  place(st, 'WATER_6', 0, 2, true);
  place(st, 'SPEED_3', 1, 2, true);  // 相手側に SPEED_3 (値2)
  setHand(st, 0, ['DARKNESS_6']);
  setHand(st, 1, []);
  let res = Engine.apply(st, { type: 'play', card: uidOf('DARKNESS_6', 0), line: 0, faceUp: false });
  assert.equal(res.error, null);
  res = Engine.apply(res.state, { type: 'refresh' });
  assert.equal(res.error, null);
  // P1 ターン: コントロール選択 → SPEED_3 の移動先選択 → コンパイル完了
  res = drive(res, req => {
    if (req.prompt === 'control-rearrange') return [2];
    if (req.prompt === 'compile-replace-shift') return [0];
    throw new Error('予期しない要求: ' + req.prompt);
  });
  const st2 = res.state;
  assert.deepEqual(st2.lines[0][1], [uidOf('SPEED_3', 1)]);  // 削除されず移動
  assert.equal(st2.players[1].trash.length, 0);
  assert.equal(st2.players[0].protocols[2].compiled, true);
  assert.equal(countAll(st2), 36);
});

test('WATER_5: 唯一の対象が自分自身なら強制的に自身を戻す', () => {
  const r = ng();
  const st = r.state;
  setHand(st, 0, ['WATER_5']);
  const res = Engine.apply(st, { type: 'play', card: uidOf('WATER_5', 0), line: 2, faceUp: true });
  assert.equal(res.error, null);
  assert.equal(res.requests.length, 0);
  assert.deepEqual(res.state.players[0].hand, [uidOf('WATER_5', 0)]);
  assert.equal(res.state.lines[2][0].length, 0);
});

test('PLAGUE_2 上段: 相手が捨て札にしたあとドロー (覆われていても発動)', () => {
  const r = ng({ p0: ['PLAGUE', 'FIRE', 'WATER'] });
  const st = r.state;
  place(st, 'PLAGUE_2', 0, 0, true);
  setHand(st, 0, ['PLAGUE_1']);
  // PLAGUE_1 を上に重ねる → PLAGUE_2 は覆われるが上段は有効
  let res = Engine.apply(st, { type: 'play', card: uidOf('PLAGUE_1', 0), line: 0, faceUp: true });
  assert.equal(res.error, null);
  // 相手の捨て札選択
  assert.equal(res.requests.length, 1);
  assert.equal(res.requests[0].kind, 'pickHand');
  assert.equal(res.requests[0].player, 1);
  res = drive(res, req => req.candidates.slice(0, 1));
  const st2 = res.state;
  assert.equal(st2.players[1].hand.length, 4);
  assert.equal(st2.players[0].hand.length, 1);  // PLAGUE_2 の上段でドロー
});

test('DEATH_1: 他の各ラインで1枚ずつ削除', () => {
  const r = ng({ p0: ['DEATH', 'FIRE', 'WATER'], p1: ['METAL', 'SPEED', 'LIFE'] });
  const st = r.state;
  place(st, 'METAL_5', 1, 1, false);
  place(st, 'SPEED_6', 1, 2, false);
  setHand(st, 0, ['DEATH_1']);
  let res = Engine.apply(st, { type: 'play', card: uidOf('DEATH_1', 0), line: 0, faceUp: true });
  assert.equal(res.error, null);
  // ライン処理順の選択 → 各ラインの対象は1枚なので自動
  res = drive(res, req => {
    if (req.kind === 'pickLine') return [req.lines[0]];
    if (req.kind === 'pickCard') return [req.candidates[0]];
    throw new Error('予期しない要求: ' + req.kind);
  });
  assert.equal(res.state.players[1].trash.length, 2);
  assert.equal(countAll(res.state), 36);
});

/* ---------- 常在効果 ---------- */

test('DARKNESS_3: このスタックの裏向きカードは値4', () => {
  const r = ng();
  const st = r.state;
  place(st, 'DARKNESS_5', 0, 0, false);  // 裏 (通常2 → 4)
  place(st, 'DARKNESS_3', 0, 0, true);   // 値2
  assert.equal(Engine.lineTotal(st, 0, 0), 6);
});

test('METAL_1: このラインの相手合計値は2減る', () => {
  const r = ng();
  const st = r.state;
  place(st, 'WATER_6', 0, 1, true);      // P1: 5
  place(st, 'METAL_1', 1, 1, true);      // P2 の常在: P1 を -2
  assert.equal(Engine.lineTotal(st, 1, 0), 3);
  assert.equal(Engine.lineTotal(st, 1, 1), 0);  // METAL_1 自身は値0
});

test('APATHY_1: ラインの裏向きカード1枚ごとに自分の合計+1', () => {
  const r = ng({ p0: ['APATHY', 'FIRE', 'WATER'] });
  const st = r.state;
  place(st, 'APATHY_1', 0, 0, true);     // 値0
  place(st, 'DEATH_4', 1, 0, false);     // 裏向き1枚 (相手側でもカウント)
  assert.equal(Engine.lineTotal(st, 0, 0), 1);
  assert.equal(Engine.lineTotal(st, 0, 1), 2);
});

test('METAL_2: 相手は次のターンにコンパイルできない', () => {
  const r = ng();
  const st = r.state;
  // P2 (METAL) 側がコンパイル可能な状況を作る
  place(st, 'DEATH_4', 1, 1, true);   // 3 (METAL ラインに置けるのは裏だが、直接配置でテスト)
  place(st, 'DEATH_5', 1, 1, true);   // 4
  place(st, 'DEATH_6', 1, 1, true);   // 5 → 計12
  // METAL_2 の効果で立つ cannotCompile フラグの動作を直接検証する
  st.players[1].cannotCompile = true;
  setHand(st, 0, ['DARKNESS_6']);
  let res = Engine.apply(st, { type: 'play', card: uidOf('DARKNESS_6', 0), line: 0, faceUp: false });
  assert.equal(res.error, null);
  // P2 のターン: コンパイル可能な値があるがフラグでスキップされ action 待ちになる
  assert.equal(res.state.turn, 1);
  assert.equal(res.state.phase, 'action');
  assert.equal(res.state.players[1].protocols[1].compiled, false);
  assert.equal(res.state.players[1].cannotCompile, false);  // 消費済み
});

/* ---------- シフト / コミット / 秘匿 ---------- */

test('E2: 覆われた表向きカードがシフトでuncoverされると中段が発動 (DARKNESS_1)', () => {
  const r = ng({ p0: ['DARKNESS', 'FIRE', 'WATER'], p1: ['SPEED', 'METAL', 'LIFE'] });
  const st = r.state;
  // P1 line0: SPEED_2(中段「2枚引く」) を覆った状態にする
  place(st, 'SPEED_2', 1, 0, true);   // covered になる
  place(st, 'SPEED_6', 1, 0, true);   // 上に重ねる (uncovered)
  setHand(st, 1, []);                 // P1手札を空に(デッキへ戻す)
  setHand(st, 0, ['DARKNESS_1']);
  let res = Engine.apply(st, { type: 'play', card: uidOf('DARKNESS_1', 0), line: 0, faceUp: true });
  assert.equal(res.error, null);
  // DARKNESS_1: P0が3枚ドロー → 相手の覆われたカード(SPEED_2)を移動。移動先ライン選択
  res = drive(res, req => {
    if (req.kind === 'pickLine') return [1];   // 空のライン1へ
    if (req.kind === 'pickCard') return [req.candidates[0]];
    return [];
  });
  const st2 = res.state;
  // SPEED_2 がライン1でuncoveredになり中段「2枚引く」が発動 → P1の手札が2
  assert.deepEqual(st2.lines[1][1], [uidOf('SPEED_2', 1)]);
  assert.equal(st2.players[1].hand.length, 2);
  assert.equal(countAll(st2), 36);
});

test('E2: 既にuncoveredなカードのシフトでは中段は再発動しない (GRAVITY_2)', () => {
  const r = ng({ p0: ['GRAVITY', 'SPEED', 'WATER'], p1: ['DEATH', 'METAL', 'LIFE'] });
  const st = r.state;
  place(st, 'SPEED_2', 0, 1, true);   // P0 line1 に単独・uncovered (中段「2枚引く」)
  setHand(st, 0, ['GRAVITY_2']);      // 「2枚引く。このラインから/へカードを1枚移動」
  let res = Engine.apply(st, { type: 'play', card: uidOf('GRAVITY_2', 0), line: 0, faceUp: true });
  res = drive(res, req => {
    if (req.kind === 'pickCard') return [uidOf('SPEED_2', 0)];  // SPEED_2 を移動
    if (req.kind === 'pickLine') return [req.lines[0]];
    return [];
  });
  // GRAVITY_2 のドローで +2 のみ。SPEED_2 は元々uncovered なので中段は再発動しない(+2されない)
  assert.equal(res.state.players[0].hand.length, 2);
  assert.equal(countAll(res.state), 36);
});

test('L1: 裏向きカードをシフトしてもログに実名が出ない', () => {
  const r = ng({ p0: ['DARKNESS', 'FIRE', 'WATER'], p1: ['SPEED', 'METAL', 'LIFE'] });
  const st = r.state;
  place(st, 'METAL_5', 1, 0, false);  // P1の裏向きカード
  place(st, 'METAL_6', 1, 0, false);  // 覆う
  setHand(st, 0, ['DARKNESS_1']);
  let res = Engine.apply(st, { type: 'play', card: uidOf('DARKNESS_1', 0), line: 0, faceUp: true });
  res = drive(res, req => {
    if (req.kind === 'pickLine') return [1];
    if (req.kind === 'pickCard') return [req.candidates[0]];
    return [];
  });
  const joined = res.state.actionLog.join('\n');
  assert.ok(/裏向きカード をライン/.test(joined), '移動ログが伏せ名であること');
  assert.ok(!/METAL_5 をライン/.test(joined), '実名が漏れていないこと');
});

test('E1: 複数カードがコミット順にスタックへ入る (GRAVITY_1)', () => {
  const r = ng({ p0: ['GRAVITY', 'FIRE', 'WATER'], p1: ['DEATH', 'METAL', 'LIFE'] });
  const st = r.state;
  // GRAVITY_1: このライン内のカード2枚ごとに、デッキトップを このカードの下に裏向きでプレイ
  place(st, 'GRAVITY_6', 0, 0, true);  // ライン内に1枚 (GRAVITY_1自身と合わせ2枚 → 1回)
  // デッキトップを既知にする
  const top = st.players[0].deck.slice();
  setHand(st, 0, ['GRAVITY_1']);
  let res = Engine.apply(st, { type: 'play', card: uidOf('GRAVITY_1', 0), line: 0, faceUp: true });
  res = drive(res, () => []);
  // GRAVITY_1 は最上段、その下にプレイされたカード、最下に GRAVITY_6 の順
  const stack = res.state.lines[0][0];
  assert.equal(stack[stack.length - 1], uidOf('GRAVITY_1', 0), 'GRAVITY_1が最上段(uncovered)');
  assert.equal(countAll(res.state), 36);
});

/* ---------- AI / トレース ---------- */

test('AI: コンパイル圏に届くラインへのプレイを選ぶ', () => {
  const r = ng({ first: 1 });   // AI(P2) が先手でアクション待ち
  const st = r.state;
  assert.equal(st.turn, 1);
  // P2 line2 (SPEED) に合計8を構築。SPEED_5(値4) をプレイすれば 12 でコンパイル圏
  place(st, 'SPEED_4', 1, 2, true);
  place(st, 'SPEED_6', 1, 2, true);
  setHand(st, 1, ['SPEED_5']);
  const a = Engine.ai.action(st);
  assert.equal(a.type, 'play');
  assert.equal(a.line, 2);
});

test('AI: 合法手のみを返す', () => {
  const r = ng();
  setHand(r.state, 0, []);
  r.state.turn = 0;
  const a = Engine.ai.action(r.state);
  assert.deepEqual(a, { type: 'refresh' });
});

test('トレース: setTrace(true) でステップごとのスナップショットが返る', () => {
  Engine.setTrace(true);
  try {
    const r = ng();
    setHand(r.state, 0, ['DARKNESS_6']);
    const res = Engine.apply(r.state, { type: 'play', card: uidOf('DARKNESS_6', 0), line: 0, faceUp: true });
    assert.equal(res.error, null);
    assert.ok(res.trace.length >= 2, 'trace が記録されること');
    assert.ok(res.trace[0].st && res.trace[0].st.players, 'スナップショットを含むこと');
    assert.ok(res.trace.some(t => t.uid === uidOf('DARKNESS_6', 0)), 'uid 付きエントリがあること');
  } finally { Engine.setTrace(false); }
});

/* ---------- ランダム自動対戦スモーク ---------- */

test('ランダム自動対戦: 全15プロトコルでクラッシュせずカード総数36が保存される', () => {
  const matchups = [
    [['DARKNESS', 'FIRE', 'WATER'], ['DEATH', 'METAL', 'SPEED']],
    [['LIFE', 'LIGHT', 'PLAGUE'], ['PSYCHIC', 'SPIRIT', 'GRAVITY']],
    [['APATHY', 'HATE', 'LOVE'], ['DARKNESS', 'METAL', 'WATER']],
    [['SPIRIT', 'HATE', 'GRAVITY'], ['LIGHT', 'LOVE', 'APATHY']]
  ];
  let finished = 0;
  for (const [p0, p1] of matchups) {
    for (const seed of [11, 22, 33, 44]) {
      const tag = p0.join('+') + ' vs ' + p1.join('+') + ' seed=' + seed;
      const rng = (function (a) { return function () { a = a * 1103515245 + 12345 & 0x7fffffff; return a / 0x7fffffff; }; })(seed);
      let res = Engine.newGame({ p0, p1, seed });
      assert.equal(res.error, null, tag);
      let steps = 0;
      while (res.winner === null && steps < 800) {
        steps++;
        if (res.requests.length) {
          const req = res.requests[0];
          res = Engine.apply(res.state, { type: 'choose', id: req.id, picks: randomAnswer(req, rng) });
        } else {
          const acts = Engine.legalActions(res.state);
          if (!acts.length) break;
          const a = acts[Math.floor(rng() * acts.length)];
          res = Engine.apply(res.state, a);
        }
        assert.equal(res.error, null, tag + ' step=' + steps + ': ' + res.error);
        assert.equal(countAll(res.state), 36, tag + ' step=' + steps + ': カード総数が崩れた');
      }
      assert.ok(steps > 5, tag + ': ゲームが進行していない');
      if (res.winner !== null) finished++;
    }
  }
  assert.ok(finished > 0, '1ゲームも決着していない');
});

function randomAnswer(req, rng) {
  switch (req.kind) {
    case 'pickCard':
    case 'pickHand': {
      const min = req.min !== undefined ? req.min : 1;
      const max = req.max !== undefined ? req.max : 1;
      const n = min + Math.floor(rng() * (Math.min(max, req.candidates.length) - min + 1));
      const pool = req.candidates.slice();
      const picks = [];
      for (let i = 0; i < n; i++) picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      return picks;
    }
    case 'pickLine':
      return [req.lines[Math.floor(rng() * req.lines.length)]];
    case 'option':
      if (req.optional && rng() < 0.3) return [];
      return [Math.floor(rng() * req.options.length)];
    case 'yesNo':
      return rng() < 0.5 ? ['yes'] : [];
    case 'arrange':
      return req.exact === 'transposition' ? [1, 0, 2] : [1, 2, 0];
    default:
      throw new Error('未知の request kind: ' + req.kind);
  }
}
