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
