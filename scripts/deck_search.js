'use strict';
/*
 * 「最強」の固定デッキ探し (ふるい分け)。
 *   候補のデッキを「最強」と同じ戦い方 (dsh 特化) で、決まった相手の顔ぶれと先手・後手で戦わせ、勝率で並べる。
 *   候補は js3d/protocol-strength.js の上位 --top 個 (+ --extra) から作れる3つの組合せすべてと、今の最強デッキ。
 *   思考時間は短め (--budget) なので、上位は ai_arena.js で本番の設定のまま最強と直接比べて確かめる。
 *
 *   node scripts/deck_search.js --top 10 --extra SPEED --budget 60
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const Engine = require('../engine.js');
const cards = require('../data/cards.json');
const effects = require('../data/effects.json');

const CURRENT = ['FIRE', 'WATER', 'SPEED'];
/* 相手の顔ぶれ: セットと戦い方が偏らないように */
const OPPONENTS = [
  ['DARKNESS', 'FIRE', 'WATER'], ['DEATH', 'METAL', 'SPEED'], ['LIFE', 'LIGHT', 'PLAGUE'],
  ['PSYCHIC', 'SPIRIT', 'GRAVITY'], ['APATHY', 'HATE', 'LOVE'], ['CHAOS', 'CLARITY', 'LUCK'],
  ['CORRUPTION', 'COURAGE', 'FEAR'], ['ICE', 'MIRROR', 'TIME'], ['PEACE', 'SMOKE', 'WAR'],
  ['ASSIMILATION', 'DIVERSITY', 'UNITY'], ['DEATH', 'LOVE', 'SPEED'], ['FIRE', 'LIFE', 'PSYCHIC']
];

function argv(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

Engine.init(cards, effects);
Engine.setAiLevel(2);
Engine.setAiThinkBudget(isMainThread ? +argv('--budget', 60) : workerData.budget);

function play(deck, opp, side, seed) {
  Engine.setAiSpecialist(true, side, 'dsh');     // 候補の側だけ「最強」の戦い方
  let result = Engine.newGame({ p0: side === 0 ? deck : opp, p1: side === 0 ? opp : deck, seed, useControl: true, first: seed & 1 });
  let guard = 0;
  while (result.winner === null && guard++ < 500) {
    if (result.requests.length) {
      const req = result.requests[0];
      result = Engine.apply(result.state, { type: 'choose', id: req.id, picks: Engine.ai.answer(result.state, req) });
    } else {
      result = Engine.apply(result.state, Engine.ai.action(result.state));
    }
    if (result.error) return null;
  }
  return result.winner === null ? null : result.winner === side;
}

if (!isMainThread) {
  parentPort.postMessage(workerData.jobs.map(j => ({ key: j.deck.join('/'), won: play(j.deck, j.opp, j.side, j.seed) })));
} else {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js3d', 'protocol-strength.js'), 'utf8');
  const strength = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
  const top = Object.keys(strength).slice(0, +argv('--top', 10));
  const extra = String(argv('--extra', '')).split(',').filter(Boolean);
  const pool = [...new Set(top.concat(extra))];
  const decks = [];
  for (let a = 0; a < pool.length; a++) for (let b = a + 1; b < pool.length; b++) for (let c = b + 1; c < pool.length; c++) decks.push([pool[a], pool[b], pool[c]]);
  if (!decks.some(d => d.slice().sort().join() === CURRENT.slice().sort().join())) decks.push(CURRENT);
  const budget = +argv('--budget', 60);
  const seed = +argv('--seed', 20260923);
  const jobs = [];
  for (const deck of decks) {
    OPPONENTS.filter(o => o.every(n => !deck.includes(n))).forEach((opp, i) => {
      for (const side of [0, 1]) jobs.push({ deck, opp, side, seed: seed + i * 2 + side });
    });
  }
  const workers = Math.max(1, Math.min(+argv('--workers', os.cpus().length - 1), jobs.length));
  const chunks = Array.from({ length: workers }, () => []);
  jobs.forEach((j, i) => chunks[i % workers].push(j));
  console.log(`deck search: ${decks.length} decks (${pool.join(',')}), ${jobs.length} games, ${budget}ms, ${workers} workers`);
  const started = Date.now();
  Promise.all(chunks.map(list => new Promise((resolve, reject) => {
    const w = new Worker(__filename, { workerData: { jobs: list, budget } });
    w.once('message', resolve);
    w.once('error', reject);
  }))).then(parts => {
    const rows = parts.flat();
    const ranked = decks.map(deck => {
      const key = deck.join('/');
      const own = rows.filter(r => r.key === key);
      const w = own.filter(r => r.won === true).length, l = own.filter(r => r.won === false).length;
      return { key, w, l, rate: w + l ? w / (w + l) : 0 };
    }).sort((a, b) => b.rate - a.rate);
    ranked.forEach((r, i) => {
      if (i < 25 || r.key === CURRENT.join('/')) console.log(String(i + 1).padStart(3), r.key.padEnd(30), (r.rate * 100).toFixed(1) + '%', r.w + '-' + r.l);
    });
    console.log('done in', Math.round((Date.now() - started) / 1000) + 's');
  }).catch(e => { console.error(e); process.exitCode = 1; });
}
