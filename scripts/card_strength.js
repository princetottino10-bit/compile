'use strict';
/*
 * カードごとの「勝ち負けへの効き方」の目安を測る。
 *   ランダムな3つの編成どうしを通常 AI で戦わせ、そのカードを表で出した対戦と、出さなかった対戦の勝率を比べる
 *   (どちらも、そのプロトコルがデッキに入っている側だけを数える)。
 *   同じ AI どうしなので「この AI が使ったときの効き方」の目安。長い対戦ほど出す枚数が増える、といった偏りは残る。
 *
 *   node scripts/card_strength.js --games 4000 --budget 30 [--out 書き出し先.json]
 */
const fs = require('node:fs');
const os = require('node:os');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const Engine = require('../engine.js');
const cards = require('../data/cards.json');
const effects = require('../data/effects.json');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

Engine.init(cards, effects);
Engine.setAiLevel(2);
Engine.setAiThinkBudget(isMainThread ? Number(arg('--budget', 30)) : workerData.budget);

/* 1戦。勝った側と、それぞれが表にしたカード・効果が発動した回数 (エンジンが数えている state.tally) を返す */
function play(p0, p1, seed) {
  let result = Engine.newGame({ p0, p1, seed, useControl: true, first: seed & 1 });
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
  const tally = result.state.tally || {};
  return { winner: result.winner, up: tally.faceUp || [[], []], fx: tally.effects || [{}, {}] };
}

if (!isMainThread) {
  /* 1戦ごとに返す (途中で止まっても、そこまでの分が残るように) */
  for (const job of workerData.jobs) {
    parentPort.postMessage({ p0: job.p0, p1: job.p1, ...(play(job.p0, job.p1, job.seed) || { winner: null, up: [[], []], fx: [{}, {}] }) });
  }
  parentPort.postMessage(null);
} else {
  const names = cards.protocols.map(p => p.name);
  const games = Math.max(30, Number(arg('--games', 4000)));
  const budget = Math.max(1, Number(arg('--budget', 30)));
  const seed = Number(arg('--seed', 20261002));
  const out = arg('--out', '');
  const random = rng(seed);
  const draw3 = (exclude) => {
    const pool = names.filter(n => !exclude.includes(n));
    const picked = [];
    while (picked.length < 3) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    return picked;
  };
  const jobs = [];
  for (let i = 0; i < games; i++) {
    const p0 = draw3([]);
    jobs.push({ p0, p1: draw3(p0), seed: seed + i });
  }
  const workerCount = Math.max(1, Math.min(Number(arg('--workers', os.cpus().length - 1)), jobs.length));
  const chunks = Array.from({ length: workerCount }, () => []);
  jobs.forEach((job, i) => chunks[i % workerCount].push(job));
  console.log(`card strength: ${games} games, ${budget}ms, ${workerCount} workers`);
  const started = Date.now();

  const tally = {};
  for (const proto of cards.protocols) for (const c of proto.cards) tally[c.id] = { proto: proto.name, value: c.value, upN: 0, upW: 0, noN: 0, noW: 0, fx: 0, fxWin: 0, decks: 0 };
  let played = 0;
  const add = (row) => {
    played++;
    if (row.winner === null) return;
    [row.p0, row.p1].forEach((deck, side) => {
      const won = row.winner === side;
      const up = new Set(row.up[side]);
      for (const name of deck) {
        for (const c of cards.protocols.find(p => p.name === name).cards) {
          const t = tally[c.id];
          const fx = (row.fx[side] && row.fx[side][c.id]) | 0;
          t.decks++; t.fx += fx; if (won) t.fxWin += fx;
          if (up.has(c.id)) { t.upN++; if (won) t.upW++; } else { t.noN++; if (won) t.noW++; }
        }
      }
    });
  };
  const rank = () => Object.entries(tally).map(([id, t]) => {
    const upRate = t.upN ? t.upW / t.upN : 0.5;
    const noRate = t.noN ? t.noW / t.noN : 0.5;
    return { id, value: t.value, upRate: +upRate.toFixed(3), noRate: +noRate.toFixed(3), lift: +(upRate - noRate).toFixed(3), upN: t.upN, noN: t.noN,
      /* 発動: デッキに入っていた1戦あたりの発動回数 / そのうち勝った対戦での発動の割合 */
      fxPer: +(t.decks ? t.fx / t.decks : 0).toFixed(2), fxWinShare: +(t.fx ? t.fxWin / t.fx : 0.5).toFixed(3), fx: t.fx, decks: t.decks };
  }).sort((a, b) => b.lift - a.lift);
  const save = () => { if (out) fs.writeFileSync(out, JSON.stringify({ games: played, budget, seed, ranked: rank() }, null, 1)); };

  Promise.all(chunks.map(list => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { jobs: list, budget } });
    worker.on('message', (row) => {
      if (row === null) { resolve(); return; }
      add(row);
      if (played % 100 === 0) { save(); console.log('  ' + played + ' / ' + games, Math.round((Date.now() - started) / 1000) + 's'); }
    });
    worker.once('error', reject);
  }))).then(() => {
    save();
    for (const r of rank()) {
      console.log(r.id.padEnd(16), 'v' + r.value, ('+' + (r.lift * 100).toFixed(1)).replace('+-', '-').padStart(6),
        (r.upRate * 100).toFixed(1).padStart(6) + '%', String(r.upN).padStart(5), (r.noRate * 100).toFixed(1).padStart(6) + '%', String(r.noN).padStart(5),
        ' fx/戦', r.fxPer.toFixed(2), (r.fxWinShare * 100).toFixed(1).padStart(6) + '%');
    }
    console.log('done in', Math.round((Date.now() - started) / 1000) + 's');
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
