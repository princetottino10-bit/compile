/* =========================================================================
 * AI評価重みの自動チューニング (座標上昇法)
 *   各重みを ×0.75 / ×1.35 に振り、ai_arena の自己対戦で現行ベストと比較。
 *   1次スクリーニング (--games G1) で勝率55%以上なら追試 (G2) し、
 *   合算の勝率下側CIが50%を超えた変更だけ採用する。
 *   node scripts/ai_weight_tune.js [--g1 160] [--g2 280] [--passes 1]
 * ========================================================================= */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '_shots', 'weight_tune_log.txt');

const DEFAULTS = {
  ctrlHold: 65, ctrlHoldLev: 0.7, ctrlOpp: 90, ctrlOppLev: 0.75,
  leadGain: 50, oppLeadGain: 78, leadBonus: 18, oppLeadBonus: 24,
  marginLead: 6, marginTrail: 6,
  refreshPerCard: 13, refreshTempo: 26, compileSafety: 1,
};

const argv = process.argv.slice(2);
const opt = { g1: 160, g2: 280, passes: 1 };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--g1') opt.g1 = +argv[++i];
  else if (argv[i] === '--g2') opt.g2 = +argv[++i];
  else if (argv[i] === '--passes') opt.passes = +argv[++i];
}

function log(msg) {
  const line = new Date().toISOString().slice(11, 19) + ' ' + msg;
  console.log(line);
  fs.appendFileSync(OUT, line + '\n');
}

function fmtWeights(w) {
  return Object.keys(w).map(k => k + '=' + w[k]).join(',');
}

/* ai_arena を1回実行して {wins, losses} を返す */
function arena(candW, baseW, games, seed) {
  const args = ['scripts/ai_arena.js', '--self', '--games', String(games),
    '--workers', '15', '--seed', String(seed),
    '--weights', fmtWeights(candW), '--baseline-weights', fmtWeights(baseW)];
  const out = execFileSync('node', args, { cwd: ROOT, encoding: 'utf8', timeout: 3600e3 });
  const m = out.match(/候補 (\d+)勝 \/ 基準 (\d+)勝/);
  if (!m) throw new Error('arena output unparsable:\n' + out.slice(-400));
  return { wins: +m[1], losses: +m[2] };
}

/* Wilson下側CI */
function wilsonLow(w, n) {
  if (!n) return 0;
  const p = w / n, z = 1.96;
  const d = 1 + z * z / n;
  return (p + z * z / (2 * n) - z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)) / d;
}

function round1(v) { return Math.round(v * 100) / 100; }

let best = { ...DEFAULTS };
let seed = 20260902;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
log('=== tuning start g1=' + opt.g1 + ' g2=' + opt.g2 + ' passes=' + opt.passes + ' ===');

for (let pass = 0; pass < opt.passes; pass++) {
  let adopted = 0;
  for (const key of Object.keys(DEFAULTS)) {
    for (const factor of [0.75, 1.35]) {
      const cand = { ...best, [key]: round1(best[key] * factor) };
      if (cand[key] === best[key]) continue;
      const r1 = arena(cand, best, opt.g1, seed++);
      const p1 = r1.wins / (r1.wins + r1.losses);
      log(key + ' x' + factor + ' (' + cand[key] + '): screen ' +
        r1.wins + '-' + r1.losses + ' (' + (p1 * 100).toFixed(1) + '%)');
      if (p1 < 0.55) continue;
      const r2 = arena(cand, best, opt.g2, seed++);
      const w = r1.wins + r2.wins, n = w + r1.losses + r2.losses;
      const low = wilsonLow(w, n);
      log(key + ' x' + factor + ': confirm total ' + w + '/' + n +
        ' (' + (w / n * 100).toFixed(1) + '%, lowCI ' + (low * 100).toFixed(1) + '%)');
      if (low > 0.5) {
        best = cand;
        adopted++;
        log('>>> ADOPT ' + key + '=' + cand[key] + '  best=' + JSON.stringify(best));
      }
    }
  }
  log('pass ' + (pass + 1) + ' done, adopted=' + adopted);
  if (!adopted) break;
}
log('=== final best: ' + JSON.stringify(best) + ' ===');
