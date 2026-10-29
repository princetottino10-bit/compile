'use strict';
/* 深読み (setAiDeep): ORACLE の設定で有効にし、読み直しても合法な手を返す */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Engine = require('../engine.js');
Engine.init(require('../data/cards.json'), require('../data/effects.json'));

test('ORACLE の設定は深読み 3 で、Worker と画面側の両方がエンジンに渡す', () => {
  const main = fs.readFileSync(path.join(__dirname, '../js3d/main.js'), 'utf8');
  assert.match(main, /const AUTO_AI = \{[^}]*deep: 3/);
  for (const f of ['ai-worker.js', 'aiclient.js']) {
    assert.match(fs.readFileSync(path.join(__dirname, '../js3d', f), 'utf8'), /setAiDeep\(cfg\.deep \|\| 0\)/, f);
  }
});

test('深読みを入れても、特化の読みは合法な手を返す', () => {
  Engine.setAiLevel(2); Engine.setAiThinkBudget(300); Engine.setAiSpecialist(true, 0, 'dsh'); Engine.setAiDeep(3);
  try {
    let res = Engine.newGame({ p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'PSYCHIC', 'LIFE'], seed: 5, useControl: true });
    for (let i = 0; i < 12 && res.winner === null; i++) {
      const st = res.state;
      if (res.requests.length) { const q = res.requests[0]; res = Engine.apply(st, { type: 'choose', id: q.id, picks: Engine.ai.answer(st, q) }); continue; }
      const a = Engine.ai.action(st);
      assert.ok(a);
      res = Engine.apply(st, a);
      assert.ok(!res.error, res.error);
    }
  } finally { Engine.setAiDeep(0); Engine.setAiSpecialist(false, -1); }
});
