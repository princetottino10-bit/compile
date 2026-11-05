/* 勝ち確・負け確のひとことの出しどころ (js3d/deciding.js)。
   コントロールを持っていれば、済んだプロトコルのラインのコンパイルでも、自分のプロトコルを並べ替えて勝てる。
   node --test test/deciding.test.js */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { decidingLine } from '../js3d/deciding.js';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Engine = require('../engine.js');
Engine.init(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'effects.json'), 'utf8')));

/* P1: FIRE と WATER は済み、DEATH はまだ。盤面を組んでから番の頭 (start) に戻す (newPuzzle は組んだ盤面からすぐ進めるので) */
const fd = (defs) => defs.map(d => [d, false]);
const TEN = (p) => fd([1, 2, 3, 4, 5].map(n => p + '_' + n));           // 裏向き5枚 = 値10
function board(lines, ctl) {
  const res = Engine.newPuzzle({
    sides: [
      { protos: ['FIRE', 'WATER', 'DEATH'], compiled: [true, true, false], lines: [[], [], []], hand: [] },
      { protos: ['METAL', 'LIGHT', 'SPEED'], lines: [[], [], []], hand: [] }
    ]
  }, { seed: 1 });
  assert.equal(res.error, null);
  const st = res.state;
  lines.forEach((stack, l) => {
    for (const [d] of stack) {
      const uid = 'p0:' + d;
      const pl = st.players[0];
      for (const z of [pl.deck, pl.hand]) { const k = z.indexOf(uid); if (k >= 0) z.splice(k, 1); }
      st.cards[uid].zone = 'field'; st.cards[uid].faceUp = false; st.cards[uid].knownTo = 1;
      st.lines[l][0].push(uid);
    }
  });
  st.turn = 0; st.phase = 'start'; st.pending = null; st.winner = null;
  if (ctl !== undefined) { st.useControl = true; st.control = ctl; } else { st.useControl = false; st.control = -1; }
  return st;
}

test('まだのプロトコルのラインで10以上なら勝ち確 (これまでどおり)', () => {
  const st = board([[], [], TEN('DEATH')]);
  assert.equal(decidingLine(st, 0, Engine), true);
  assert.equal(decidingLine(st, 1, Engine), false);
});

test('済んだプロトコルのラインしかなく、コントロールも無ければ勝ち確ではない (リコンパイルになる)', () => {
  assert.equal(decidingLine(board([TEN('FIRE'), [], []]), 0, Engine), false);
  assert.equal(decidingLine(board([TEN('FIRE'), [], []], 1), 0, Engine), false);
});

test('コントロールを持っていれば、並べ替えてまだのプロトコルを持ってこられるので勝ち確', () => {
  assert.equal(decidingLine(board([TEN('FIRE'), [], []], 0), 0, Engine), true);
});

test('この番のコントロールの確認で得られる (2ライン以上で上回る) なら勝ち確', () => {
  assert.equal(decidingLine(board([TEN('FIRE'), [], fd(['DEATH_6'])], -1), 0, Engine), true);
  /* 1ラインしか上回っていなければ得られない */
  assert.equal(decidingLine(board([TEN('FIRE'), [], []], -1), 0, Engine), false);
  /* もうコントロールの確認を過ぎていれば、持っていない限り得られない */
  const late = board([TEN('FIRE'), [], fd(['DEATH_6'])], -1);
  late.phase = 'action';
  assert.equal(decidingLine(late, 0, Engine), false);
});

test('実際に: コントロールで自分のプロトコルを並べ替えてコンパイルすると勝つ', () => {
  let res = Engine.apply(board([TEN('FIRE'), [], []], 0), { type: '_begin' });
  assert.equal(res.error, null);
  const answers = [[0], [2, 1, 0]];      // 自分のプロトコルを並べ替える → DEATH をライン0へ
  for (const picks of answers) {
    const req = res.requests[0];
    assert.ok(req, '選択待ちのはず');
    res = Engine.apply(res.state, { type: 'choose', id: req.id, picks });
    assert.equal(res.error, null);
  }
  assert.equal(res.state.winner, 0);
});
