/* 詰めコンパイルの全問 (一覧 data/tsume.json と、今日の問題の出題元 data/tsume-daily.json) を、
   いまのエンジンとゲームと同じ判定で解き直して確かめる (再発防止。2026-10-11)。
   - 想定の答え (solution) をそのまま指して、お題を満たすこと
   - お題が「○○ のライン」なら、並べ替えたあとも、そのプロトコルのラインで判定すること (ゲームの judgeTsume と同じ)
   エンジン・カードの効果・問題を変えたら、このテストが落ちた問題は出題から外すか作り直す */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { judgeTsume, withGoalProto } from '../js3d/tsume.js';

const require = createRequire(import.meta.url);
const Engine = require('../engine.js');
Engine.init(JSON.parse(fs.readFileSync(new URL('../data/cards.json', import.meta.url), 'utf8')),
  JSON.parse(fs.readFileSync(new URL('../data/effects.json', import.meta.url), 'utf8')));
Engine.setTrace(true);
const ME = 0;

/* 手番を終えた時点の盤面 (ゲームの puzzle.js の endOfTurnState と同じ: 相手の手番に移った最初の盤面) */
function endState(res, all) {
  for (const t of all) if (t.st && t.st.turn !== ME) return t.st;
  return res.state;
}
/* 想定の答えを指して、判定の結果を返す */
export function playSolution(p) {
  let res = Engine.newPuzzle(p.spec, { seed: 1 });
  const trace = [];
  for (const a of p.solution || []) {
    if (res.error || res.state.winner !== null) break;
    res = Engine.apply(res.state, a);
    if (res.error) return { ok: false, text: 'エンジンが手を受け付けない: ' + res.error };
    trace.push(...(res.trace || []));
  }
  return judgeTsume(p.goal, endState(res, trace), res.state, ME, Engine);
}

const load = (f) => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8')).map(withGoalProto);
for (const file of ['tsume.json', 'tsume-daily.json']) {
  test('詰めコンパイル ' + file + ': どの問題も、想定の答えでお題を満たす', () => {
    const bad = [];
    for (const p of load(file)) {
      const r = playSolution(p);
      if (!r.ok) bad.push(p.id + ' (' + r.text + ')');
    }
    assert.deepEqual(bad, [], '想定の答えでお題を満たさない問題: ' + bad.length + ' 問\n' + bad.join('\n'));
  });
}
