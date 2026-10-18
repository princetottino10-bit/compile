'use strict';
/* ORACLE がロックのデッキ (PSYCHIC を含む) を持ったときだけ、ロックの手筋とロック用の学習モデル (data/valnet-lock.json) に切り替える */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
Engine.init(require('../data/cards.json'), require('../data/effects.json'));
const { FEATURE_SIZE } = require('../scripts/valnet_features.js');

const AUTO = { level: 2, blunder: 0, budget: 2400, specialist: true, kind: 'dsh', specSide: 0, valnet: 400, oracle: true };
const game = (p0, p1) => Engine.newGame({ p0, p1, seed: 3, useControl: true }).state;

test('特化の側のデッキに PSYCHIC があるときだけ、ロックの読みとロック用のモデルに切り替える', async () => {
  const { oracleAi } = await import('../js3d/aidecks.js');
  const lock = oracleAi(AUTO, game(['PSYCHIC', 'DARKNESS', 'FIRE'], ['FIRE', 'WATER', 'SPEED']));
  assert.equal(lock.kind, 'psylock');
  assert.equal(lock.valnetModel, 'lock');
  assert.equal(lock.budget, 3600);
  assert.equal(lock.specSide, 0);
  /* 相手だけが PSYCHIC: 切り替えない */
  assert.equal(oracleAi(AUTO, game(['FIRE', 'WATER', 'SPEED'], ['PSYCHIC', 'DARKNESS', 'FIRE'])), AUTO);
  /* CHALLENGE の ORACLE (CPU の側 = 1) は自分の側のデッキを見る */
  const cpu = { ...AUTO, specSide: 1 };
  assert.equal(oracleAi(cpu, game(['PSYCHIC', 'DARKNESS', 'FIRE'], ['FIRE', 'WATER', 'SPEED'])), cpu);
  assert.equal(oracleAi(cpu, game(['FIRE', 'WATER', 'SPEED'], ['PSYCHIC', 'HATE', 'SPIRIT'])).valnetModel, 'lock');
  /* ORACLE でない設定・盤面なしはそのまま */
  const plain = { ...AUTO, oracle: false };
  assert.equal(oracleAi(plain, game(['PSYCHIC', 'DARKNESS', 'FIRE'], ['FIRE', 'WATER', 'SPEED'])), plain);
  assert.equal(oracleAi(AUTO, null), AUTO);
});

test('タッグの複合プロトコル (PSYCHIC+…) もロックのデッキと見る', async () => {
  const { isLockDeck } = await import('../js3d/aidecks.js');
  assert.equal(isLockDeck([{ name: 'PSYCHIC+HATE' }, { name: 'FIRE' }]), true);
  assert.equal(isLockDeck([{ name: 'FIRE+WATER' }, { name: 'SPEED' }]), false);
  assert.equal(isLockDeck(null), false);
});

test('ロック用の学習モデルは、エンジンの特徴量と同じ大きさで読める', () => {
  const model = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/valnet-lock.json'), 'utf8'));
  assert.equal(model.sizes[0], FEATURE_SIZE);
  assert.equal(model.sizes[model.sizes.length - 1], 1);
  Engine.setAiValueNet(model, 400);
  try {
    Engine.setAiLevel(1);
    Engine.setAiSpecialist(true, 0, 'psylock');
    const st = game(['PSYCHIC', 'DARKNESS', 'FIRE'], ['PSYCHIC', 'DARKNESS', 'FIRE']);
    assert.ok(Number.isFinite(Engine.ai.score(st, 0)));
    assert.ok(Engine.ai.action(st));
  } finally {
    Engine.setAiValueNet(null, 0);
    Engine.setAiSpecialist(false, -1, 'dsh');
  }
});

test('本気の4人: 得意プロトコル入りの決まったデッキ、ORACLE の読みにその子の設定を重ねる', async () => {
  const { HONKI, HONKI_BASE, isHonki, honkiOf, honkiAi, fixedDeck, levelLabel } = await import('../js3d/aidecks.js');
  const { FAVORITE } = await import('../js3d/avatar-lines.js');
  assert.equal(HONKI.length, 4);
  HONKI.forEach((h, k) => {
    const lv = HONKI_BASE + k;
    assert.ok(isHonki(lv));
    assert.equal(honkiOf(lv), h);
    assert.equal(FAVORITE[h.avatar], h.fav, h.name + ' の得意プロトコル');
    assert.ok(h.deck.includes(h.fav) && new Set(h.deck).size === 3, h.name + ' のデッキ');
    assert.deepEqual(fixedDeck(lv), h.deck);
    assert.equal(levelLabel(lv), h.name);
    const cfg = honkiAi({ ...AUTO, specSide: 1 }, lv);
    assert.equal(cfg.oracle, true);
    assert.equal(cfg.specSide, 1);
  });
  assert.equal(isHonki(HONKI_BASE + HONKI.length), false);
  assert.equal(isHonki(24), false);
  /* 本気紫苑はロックのデッキとロック用のモデル */
  assert.equal(honkiAi(AUTO, HONKI_BASE).valnetModel, 'lock');
  assert.equal(honkiAi(AUTO, HONKI_BASE).kind, 'psylock');
});

test('本気のキャラ同士: かぶったら得意でない側が2つ目のデッキにゆずり、どの組もかぶらない', async () => {
  const { HONKI, honkiPairDecks } = await import('../js3d/aidecks.js');
  const [shion, ruri, an, akane] = HONKI;
  /* FIRE は杏の得意 → 紫苑・茜がゆずる。WATER は瑠璃 → 杏がゆずる。HATE は茜 → 瑠璃がゆずる */
  assert.deepEqual(honkiPairDecks(shion, an), [shion.alt, an.deck]);
  assert.deepEqual(honkiPairDecks(an, akane), [an.deck, akane.alt]);
  assert.deepEqual(honkiPairDecks(an, ruri), [an.alt, ruri.deck]);
  assert.deepEqual(honkiPairDecks(ruri, akane), [ruri.alt, akane.deck]);
  /* FIRE はどちらの得意でもない → 後ろの茜がゆずる。並べる順によらない */
  assert.deepEqual(honkiPairDecks(akane, shion), [akane.alt, shion.deck]);
  assert.deepEqual(honkiPairDecks(shion, akane), [shion.deck, akane.alt]);
  /* タッグで4人同時でも: alt 同士はかぶらない。得意以外は、ほかの子の1つ目ともかぶらない (得意は誰かの1つ目に入っていてよい: ゆずる側の得意はかぶっていないので) */
  const altAll = HONKI.flatMap(h => h.alt);
  assert.equal(new Set(altAll).size, altAll.length, '4人の2つ目のデッキはすべて別のプロトコル');
  for (const a of HONKI) for (const b of HONKI) if (a !== b) assert.ok(!a.alt.some(p => p !== a.fav && b.deck.includes(p)), a.name + ' の2つ目が ' + b.name + ' の1つ目とかぶらない');
  for (const a of HONKI) {
    assert.ok(a.alt.includes(a.fav), a.name + ' の2つ目のデッキにも得意が入る');
    for (const b of HONKI) {
      if (a === b) continue;
      const [da, db] = honkiPairDecks(a, b);
      assert.ok(!da.some(p => db.includes(p)), a.name + ' vs ' + b.name);
      assert.ok(da === a.deck || db === b.deck, '片方は1つ目のまま');
    }
  }
});

test('ストーリーで紫苑・瑠璃・茜が握るデッキは、本気の2つ目のデッキと同じ', async () => {
  const { HONKI } = await import('../js3d/aidecks.js');
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  const S = await import('../js3d/story.js');
  const nodes = JSON.stringify(S);
  const alt = Object.fromEntries(HONKI.map(h => [h.avatar, h.alt]));
  for (const av of ['shion', 'asagi', 'nadeshiko']) assert.ok(nodes.includes(JSON.stringify(alt[av])), av + ' の2つ目のデッキがストーリーに出る');
});
