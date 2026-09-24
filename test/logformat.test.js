/* ログの整形 (js3d/logformat.js): カード表記・席の呼び方・ラインのプロトコル名 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogFormat } from '../js3d/logformat.js';

const defIndex = { DARKNESS_6: { proto: 'DARKNESS', value: 5 }, FIRE_1: { proto: 'FIRE', value: 0 } };
const protos = (a) => a.map(name => ({ name }));
const state = { players: [{ protocols: protos(['FIRE', 'WATER', 'SPEED']) }, { protocols: protos(['DARKNESS', 'HATE', 'LOVE']) }] };
const make = (over = {}) => createLogFormat({
  defIndex, seat: () => 0, roomSide: () => null, demo: () => false, state: () => state, ...over
});
const join = (parts) => parts.map(p => p.text).join('');

test('カードは印刷された表記にし、触れる部品として切り出す', () => {
  const parts = make()('P1: DARKNESS_6 をライン1に表でプレイ');
  assert.deepEqual(parts[1], { card: 'DARKNESS_6', text: 'DARKNESS 5' });
  assert.equal(join(parts), 'あなた: DARKNESS 5 をライン1〈FIRE〉に表でプレイ');
});

test('相手の行為は相手側のプロトコル名を添える', () => {
  assert.equal(join(make()('P2: FIRE_1 をライン2に表でプレイ')), '相手: FIRE 0 をライン2〈HATE〉に表でプレイ');
});

test('オンラインで後手の席なら、P2 が自分・盤面は自分側から見る', () => {
  const f = make({ seat: () => 1, roomSide: () => 1 });
  assert.equal(join(f('P2: FIRE_1 をライン3に表でプレイ')), 'あなた: FIRE 0 をライン3〈SPEED〉に表でプレイ');
});

test('ターンの区切りは見出しになる', () => {
  const parts = make()('--- P2 のターン ---');
  assert.equal(parts.turn, 1);
  assert.equal(parts.label, '相手のターン');
});

test('観戦では P1/P2 のまま・裏向きプレイの余分な空白を詰める', () => {
  assert.equal(join(make({ demo: () => true })('P1: カード をライン1に裏でプレイ')), 'P1: カードをライン1〈FIRE〉に裏でプレイ');
});

test('知らない ID や行為者のない行は、両者のプロトコル名を添えてそのまま', () => {
  assert.equal(join(make()('ライン2 がコンパイルされた (XX_9)')), 'ライン2〈WATER/HATE〉 がコンパイルされた (XX_9)');
});
