import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLine, buildPrompt, aiLine, talkReady } from '../js3d/aitalk.js';
import { AVATARS } from '../js3d/avatar.js';

test('AI の答えは1行目だけ・かっこや名前を外して40字まで', () => {
  assert.equal(cleanLine('「行くよ、FIRE 3！」\n(説明)'), '行くよ、FIRE 3！');
  assert.equal(cleanLine('紫苑: よろしくね。'), 'よろしくね。');
  assert.equal(Array.from(cleanLine('あ'.repeat(80))).length, 40);
  assert.equal(cleanLine(''), '');
});

test('AI に渡す文は、キャラの話し方と見える出来事だけ', () => {
  const { system, user } = buildPrompt(AVATARS.zundamon, 'play', { card: 'FIRE 3' }, { turns: 4, mine: 1, theirs: 0, foe: '紫苑' });
  assert.match(system, /ずんだもん/);
  assert.match(user, /FIRE 3/);
  assert.match(user, /自分 1 \/ 相手 0/);
  assert.doesNotMatch(user, /手札|山札/);
});

test('キーが無ければ AI は使わず、いつものセリフに戻る', async () => {
  assert.equal(talkReady(), false);
  assert.equal(await aiLine(AVATARS.shion, 'turn', null, null), null);
});
