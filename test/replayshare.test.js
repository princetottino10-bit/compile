import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { encodeReplay, decodeReplay, validateReplay, sharedCodeFromHash, replayShareUrl } from '../js3d/replayshare.js';
import { rebuild } from '../js3d/replays.js';

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const Engine = require('../engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(dir, '..', 'data', 'effects.json'), 'utf8'));
Engine.init(cards, effects);
Engine.setAiLevel(0);
const NAMES = cards.protocols.map(p => p.name);

/* CPU どうしで1戦して、main.js と同じ形の棋譜を作る */
function playOne(seed) {
  const init = { seed, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'METAL', 'LIFE'], first: 0, winCompiles: 3 };
  let res = Engine.newGame(init);
  const actions = [];
  for (let i = 0; i < 3000 && res.state.winner === null; i++) {
    const q = res.requests[0];
    const a = q ? { type: 'choose', id: q.id, picks: Engine.ai.answer(res.state, q) } : Engine.ai.action(res.state);
    actions.push(a);
    res = Engine.apply(res.state, a);
  }
  return { rep: { id: 'rtest', me: init.p0, opp: init.p1, win: res.state.winner === 0, level: 1, turns: res.state.turns, kind: 'cpu', at: 1, init, actions, pinned: true }, final: res.state };
}

test('共有: 符号にして戻すと同じ試合が再現でき、リンクは短い', async () => {
  const { rep, final } = playOne(7);
  const code = await encodeReplay(rep);
  assert.equal(code[0], 'z', '圧縮されている');
  assert.ok(code.length < 3000, 'リンクが長すぎない: ' + code.length);
  const back = await decodeReplay(code, NAMES);
  assert.ok(back && back.shared);
  assert.deepEqual(back.actions, rep.actions);
  assert.equal(back.id, undefined, '保存の id は載せない');
  const built = rebuild(Engine, back);
  assert.ok(built.ok);
  assert.equal(built.final.winner, final.winner);
});

test('共有: 壊れた・おかしな符号は開かない', async () => {
  assert.equal(await decodeReplay('zAAAA', NAMES), null);
  assert.equal(await decodeReplay('xabc', NAMES), null);
  assert.equal(await decodeReplay('', NAMES), null);
  const junk = Buffer.from(JSON.stringify({ v: 1, init: { seed: 1, p0: ['FIRE', 'WATER', 'NOPE'], p1: ['A', 'B', 'C'] }, actions: [] })).toString('base64url');
  assert.equal(await decodeReplay('j' + junk, NAMES), null, '知らないプロトコル');
  assert.equal(validateReplay({ v: 1, init: { seed: 1, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['DARKNESS', 'METAL', 'LIFE'] }, actions: 'x' }, NAMES), null);
  assert.equal(validateReplay({ v: 1, init: { seed: 1, p0: ['<b>', 'WATER', 'SPEED'], p1: ['DARKNESS', 'METAL', 'LIFE'] }, actions: [] }), null, '名前の形');
});

test('共有: 展開すると大きすぎる符号は開かない', async () => {
  const big = new TextEncoder().encode(JSON.stringify({ v: 1, pad: 'a'.repeat(400 * 1024) }));
  const z = await new Response(new Blob([big]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  assert.equal(await decodeReplay('z' + Buffer.from(z).toString('base64url'), NAMES), null);
});

test('共有: リンクの形', () => {
  assert.equal(replayShareUrl('zAB', { origin: 'https://x.io', pathname: '/c/three-play.html' }), 'https://x.io/c/three-play.html#rp=zAB');
  assert.equal(sharedCodeFromHash('#rp=zAB-_9'), 'zAB-_9');
  assert.equal(sharedCodeFromHash('#rp=a<b'), null);
  assert.equal(sharedCodeFromHash(''), null);
});

test('リンクの「何手目から」(&m=): #rp= と #rs= の後ろに付けられる', async () => {
  const S = await import('../js3d/replayshare.js');
  assert.equal(S.sharedCodeFromHash('#rp=zAB-_9&m=23'), 'zAB-_9');
  assert.equal(S.shortIdFromHash('#rs=abc123XY&m=5'), 'abc123XY');
  assert.equal(S.shortIdFromHash('#rs=abc123XY&m=x'), null);
  assert.equal(S.moveFromHash('#rp=zAB&m=23', ''), 23);
  assert.equal(S.moveFromHash('#rs=abc123XY', '?replay=r1&m=7'), 7);
  assert.equal(S.moveFromHash('#rp=zAB', ''), null);
  assert.equal(S.moveFromHash('#rp=zAB&m=0', ''), null);
  assert.equal(S.withMove('https://x.io/p#rp=z', 12), 'https://x.io/p#rp=z&m=12');
  assert.equal(S.withMove('https://x.io/p#rp=z', undefined), 'https://x.io/p#rp=z');
});
