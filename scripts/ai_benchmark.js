'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
const enginePath = path.join(__dirname, '..', 'engine.js');
const baselineRef = process.argv[4] || 'HEAD';
const Candidate = loadEngine(fs.readFileSync(enginePath, 'utf8'), 'working-tree-engine.js');
const Baseline = loadEngine(execFileSync('git', ['show', baselineRef + ':engine.js'], {
  cwd: path.join(__dirname, '..'), encoding: 'utf8',
}), baselineRef + ':engine.js');
Candidate.init(cards, effects);
Baseline.init(cards, effects);
Candidate.setAiLevel(2);
Baseline.setAiLevel(2);

const games = Math.max(4, +(process.argv[2] || 24));
const seedBase = +(process.argv[3] || 20260711);
const matchups = [
  [['CHAOS', 'CLARITY', 'LUCK'], ['CORRUPTION', 'COURAGE', 'FEAR']],
  [['ICE', 'MIRROR', 'TIME'], ['PEACE', 'SMOKE', 'WAR']],
  [['ASSIMILATION', 'DIVERSITY', 'UNITY'], ['CHAOS', 'CORRUPTION', 'MIRROR']],
  [['DARKNESS', 'FIRE', 'WATER'], ['DEATH', 'METAL', 'SPEED']],
  [['LIFE', 'LIGHT', 'PLAGUE'], ['PSYCHIC', 'SPIRIT', 'GRAVITY']],
  [['APATHY', 'HATE', 'LOVE'], ['DARKNESS', 'METAL', 'WATER']],
  [['SPIRIT', 'HATE', 'GRAVITY'], ['LIGHT', 'LOVE', 'APATHY']],
  [['DEATH', 'LOVE', 'SPEED'], ['FIRE', 'LIFE', 'PSYCHIC']],
  [['APATHY', 'DARKNESS', 'WATER'], ['HATE', 'METAL', 'SPIRIT']],
];

const totals = {
  candidateWins: 0, baselineWins: 0, draws: 0, errors: 0,
  candidateMs: 0, baselineMs: 0, candidateMoves: 0, baselineMoves: 0,
  candidateRecompiles: 0, baselineRecompiles: 0, maxMoveMs: 0, turns: 0,
  candidateControlGains: 0, baselineControlGains: 0,
};

for (let i = 0; i < games; i++) {
  const pair = matchups[Math.floor(i / 4) % matchups.length];
  const variant = i % 4;
  const swap = variant >= 2;
  const p0 = swap ? pair[1] : pair[0];
  const p1 = swap ? pair[0] : pair[1];
  const candidateSide = variant % 2;
  const result = playGame({
    p0, p1, candidateSide,
    seed: seedBase + Math.floor(i / 4),
  });
  totals.turns += result.turns;
  totals.candidateMs += result.ms[candidateSide];
  totals.baselineMs += result.ms[1 - candidateSide];
  totals.candidateMoves += result.moves[candidateSide];
  totals.baselineMoves += result.moves[1 - candidateSide];
  totals.candidateRecompiles += result.recompiles[candidateSide];
  totals.baselineRecompiles += result.recompiles[1 - candidateSide];
  totals.candidateControlGains += result.controlGains[candidateSide];
  totals.baselineControlGains += result.controlGains[1 - candidateSide];
  totals.maxMoveMs = Math.max(totals.maxMoveMs, result.maxMoveMs);
  if (result.error) totals.errors++;
  else if (result.winner === null) totals.draws++;
  else if (result.winner === candidateSide) totals.candidateWins++;
  else totals.baselineWins++;
  process.stdout.write('.');
}

process.stdout.write('\n');
const decided = totals.candidateWins + totals.baselineWins;
const summary = {
  games,
  candidate: 'working tree 600ms CPU',
  baseline: baselineRef + ' 600ms CPU',
  candidateWins: totals.candidateWins,
  baselineWins: totals.baselineWins,
  draws: totals.draws,
  errors: totals.errors,
  candidateWinRate: decided ? +(totals.candidateWins / decided * 100).toFixed(1) : 0,
  avgCandidateMoveMs: average(totals.candidateMs, totals.candidateMoves),
  avgBaselineMoveMs: average(totals.baselineMs, totals.baselineMoves),
  maxMoveMs: +totals.maxMoveMs.toFixed(1),
  candidateRecompileRate: rate(totals.candidateRecompiles, totals.candidateMoves),
  baselineRecompileRate: rate(totals.baselineRecompiles, totals.baselineMoves),
  avgCandidateControlGains: average(totals.candidateControlGains, games),
  avgBaselineControlGains: average(totals.baselineControlGains, games),
  avgTurns: average(totals.turns, games),
};
console.log(JSON.stringify(summary, null, 2));

function playGame(opts) {
  let res = Candidate.newGame({ p0: opts.p0, p1: opts.p1, seed: opts.seed, useControl: true });
  const ais = opts.candidateSide === 0 ? [Candidate, Baseline] : [Baseline, Candidate];
  const ms = [0, 0], moves = [0, 0], recompiles = [0, 0], controlGains = [0, 0];
  let maxMoveMs = 0, turns = 0, guard = 0, error = null;

  while (res.winner === null && guard++ < 500) {
    const side = res.requests.length ? res.requests[0].player : res.state.turn;
    const ai = ais[side];
    const beforeControl = res.state.control;
    const started = now();
    if (res.requests.length) {
      const req = res.requests[0];
      res = Candidate.apply(res.state, { type: 'choose', id: req.id, picks: ai.ai.answer(res.state, req) });
    } else {
      const action = ai.ai.action(res.state);
      if (!action) break;
      res = Candidate.apply(res.state, action);
      moves[side]++;
      turns++;
    }
    const elapsed = now() - started;
    ms[side] += elapsed;
    maxMoveMs = Math.max(maxMoveMs, elapsed);
    for (const line of res.log || []) if (line.includes('リコンパイル')) recompiles[side]++;
    if (res.state.control !== beforeControl && res.state.control >= 0) controlGains[res.state.control]++;
    if (res.error) { error = res.error; break; }
  }
  return { winner: res.winner, error, ms, moves, recompiles, controlGains, maxMoveMs, turns };
}

function loadEngine(source, filename) {
  const context = {
    module: { exports: {} }, exports: {}, console,
    structuredClone, performance,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename });
  return context.module.exports || context.CompileEngine;
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function average(value, count) {
  return count ? +(value / count).toFixed(1) : 0;
}

function rate(value, count) {
  return count ? +(value / count * 100).toFixed(2) : 0;
}
