/* 勝った瞬間の演出で iPhone がページごと落としたとき (画面が真っ白になってタイトルへ戻される、2026-10-16 の報告) に、
   開き直すと同じ決着から結果へ戻り、戦績を二度数えず、ストーリー・勝ち抜き戦の進み具合も落とさないこと */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const R = await import('../js3d/resume.js');
const { rebuild } = await import('../js3d/replays.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Engine = createRequire(import.meta.url)('../engine.js');
Engine.init(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data/effects.json'), 'utf8')));

/* P0 が勝つまで指した対戦 (中断の記録と同じ形) */
function wonGame() {
  for (let seed = 1; seed < 300; seed++) {
    let a = seed * 7919;
    const rng = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
    const init = { seed, p0: ['FIRE', 'WATER', 'SPEED'], p1: ['LIFE', 'LIGHT', 'METAL'], first: 0, winCompiles: null };
    let res = Engine.newGame({ seed, p0: init.p0, p1: init.p1, first: 0 });
    const actions = [];
    for (let i = 0; i < 2000 && res.state.winner === null; i++) {
      let act;
      if (res.requests.length) {
        const q = res.requests[0];
        const picks = q.kind === 'pickLine' ? [q.lines[0]] : q.kind === 'option' ? [0] : q.kind === 'yesNo' ? [] : q.kind === 'arrange' ? [1, 2, 0]
          : (q.candidates || []).slice(0, q.min !== undefined ? q.min : 1);
        act = { type: 'choose', id: q.id, picks };
      } else {
        const acts = Engine.legalActions(res.state);
        const pick = res.state.turn === 0 ? acts.filter(x => x.type === 'play' && x.faceUp) : acts.filter(x => x.type === 'play' && !x.faceUp);
        const from = pick.length ? pick : acts;
        act = from[Math.floor(rng() * from.length)];
      }
      const next = Engine.apply(res.state, act);
      if (next.error) break;
      actions.push(act); res = next;
    }
    if (res.state.winner === 0) return { init, actions };
  }
  throw new Error('勝つ対戦が作れなかった');
}

test('決着しても、演出が終わるまで中断の記録は残り、開き直すと決着した盤面に戻る', () => {
  const g = wonGame();
  R.startResume({ mode: 'run', level: 1, me: g.init.p0, opp: g.init.p1, run: 'run' }, g.init, 1000, g.actions);
  /* 決着: 戦績を書いた印だけ付ける (ここで落ちたとする) */
  R.markResumeRecorded();
  const rec = R.loadResume(2000);
  assert.ok(rec, '演出の途中で落ちても、中断の記録が残っている (前は決着の瞬間に消していた)');
  assert.equal(rec.recorded, true, '戦績を書いた印があるので、開き直しても二度数えない');
  assert.notEqual(rec.progressed, true, 'デイリー・実績はまだ数えていない');
  const b = rebuild(Engine, rec);
  assert.ok(b.ok && !b.res.error);
  assert.equal(b.res.state.winner, 0, '並べ直すと決着している (起動時に聞かずに結果へ進む)');
  R.markResumeRecorded('progressed');
  assert.equal(R.loadResume(2000).progressed, true);
  R.endResume();
  assert.equal(R.loadResume(2000), null);
});

test('開き直した対戦をまた始めても、書き終えた段の印を引き継げる', () => {
  const g = wonGame();
  R.startResume({ mode: 'cpu', level: 1 }, g.init, 1000, g.actions);
  R.markResumeRecorded();
  const rec = R.loadResume(2000);
  /* main.js: 続きから始めると記録を作り直し、印を付け直す */
  R.startResume(rec.meta, rec.init, 3000, rec.actions);
  if (rec.recorded) R.markResumeRecorded();
  assert.equal(R.loadResume(4000).recorded, true);
  R.endResume();
});

test('main.js: 決着の印 (crashwatch・中断の記録) は、結果のカットインのあとで消す', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js3d/main.js'), 'utf8');
  const start = src.indexOf('if (cur.state.winner !== null && !resultShown) {');
  const end = src.indexOf('\n}\n', start);
  assert.ok(start > 0 && end > start, '決着の処理が見つからない');
  const body = src.slice(start, end);
  const cut = body.indexOf('UI.resultCutIn(');
  assert.ok(cut > 0);
  /* 観戦は記録を取らないので先に消してよい。それ以外の消し方は、カットインより前に無いこと */
  const before = body.slice(0, cut).replace(/if \(spectate\) RS\.endResume\(\);/, '').replace(/finishLiveGame\(\);\s*await spectateEnd/, '');
  assert.doesNotMatch(before, /CW\.battleEnded\(\)|RS\.endResume\(\)|finishLiveGame\(\)/, 'カットインより前に印を消している');
  assert.match(body, /RS\.markResumeRecorded\(\)/, '戦績を書いた印を付ける');
  assert.match(body.slice(cut), /finishLiveGame\(\)/, '結果を出すところで印を消す');
  const story = src.slice(src.indexOf('async function storyAfterGame'));
  assert.ok(story.indexOf('finishLiveGame()') > story.indexOf('STORY.saveStory(after)'), 'ストーリーは進み具合を保存してから消す');
});

test('iPhone: 決着のカットインの重い層 (回る光線・グリッチの文字) を出さない', () => {
  const html = fs.readFileSync(path.join(ROOT, 'three-play.html'), 'utf8');
  assert.match(html, /body\.ios \.rc-rays[^{]*\{display:none;\}/);
  assert.match(html, /body\.ios \.rc-title::before/);
});
