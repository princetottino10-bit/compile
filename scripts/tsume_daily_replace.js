'use strict';
/* 今日の問題 (data/tsume-daily.json) のうち、相手の山札の並び (見えない) 次第で解けなくなる問題を、
 * 新しい候補 (tsume_gen.js の出力) と入れ替える。番号 (id) と段 (tier) はそのまま、日ごとの巡りも変えない。
 *   node scripts/tsume_daily_replace.js 候補1.json 候補2.json ...
 *   node scripts/tsume_daily_replace.js --ids d017,d190 候補1.json ...   (入れ替える問題を指定する。tsume_audit.js で外れた問題など)
 * 候補の選び方は tsume_pick.js と同じ (CPU がそのまま解けない・相手の裏向きのカードや山札に頼らない) */
const fs = require('fs');
const path = require('path');
const P = require('./tsume_pick.js');

const root = path.join(__dirname, '..');
const DAILY = path.join(root, 'data/tsume-daily.json');

(async () => {
  const { PROMPT_TEXT, optionLabel } = await import('../js3d/prompts.js');
  const args = process.argv.slice(2);
  const idsAt = args.indexOf('--ids');
  const only = idsAt >= 0 ? new Set(String(args[idsAt + 1] || '').split(',').filter(Boolean)) : null;
  const files = idsAt >= 0 ? args.filter((_, i) => i !== idsAt && i !== idsAt + 1) : args;
  if (!files.length) { console.error('候補のファイルを指定してください'); process.exit(1); }
  const daily = JSON.parse(fs.readFileSync(DAILY, 'utf8'));
  const fixed = JSON.parse(fs.readFileSync(path.join(root, 'data/tsume.json'), 'utf8'));
  /* 指定がなければ、相手の山札の並び次第で解けない問題 (想定の答えでお題を満たさない問題も、ここで外れる) */
  const bad = only ? daily.filter(p => only.has(p.id)) : daily.filter(p => !P.deckFair(p));
  console.log('入れ替える問題: ' + (bad.map(p => p.id).join(' ') || 'なし'));
  if (!bad.length) return;

  const taken = new Set(fixed.concat(daily).map(p => JSON.stringify(p.spec)));
  let cands = [];
  for (const f of files) cands = cands.concat(JSON.parse(fs.readFileSync(f, 'utf8')));
  cands = cands.filter(p => {
    const k = JSON.stringify(p.spec);
    if (taken.has(k)) return false;
    taken.add(k);
    return P.tierOf(p) >= 1 && p.solution.length <= 12;
  });
  cands = cands.filter(p => !P.aiSolves(p) && P.fair(p) && P.deckFair(p));
  console.log('使える候補: ' + cands.length);

  /* 決まった順 (再実行で同じ結果)。当てずっぽうで解けにくいものから */
  cands.sort((a, b) => (a.rate - b.rate) || (b.chain - a.chain));
  const used = new Set();
  let replaced = 0;
  for (const old of bad) {
    const p = cands.find(c => !used.has(c) && P.tierOf(c) === old.tier);
    if (!p) { console.log(old.id + ': 同じ段 (' + old.tier + ') の候補が足りない'); continue; }
    const { steps, res } = await P.describe(p, PROMPT_TEXT, optionLabel);
    if (!P.solved(p, res)) continue;
    used.add(p);
    const i = daily.indexOf(old);
    daily[i] = { id: old.id, tier: old.tier, goal: p.goal, opp: !!p.opp, chain: p.chain, depth: p.depth,
      solutions: p.solutions, spec: p.spec, solution: p.solution, steps };
    replaced++;
    console.log(old.id + ' → ' + p.spec.sides[0].protos.join('/') + ' vs ' + p.spec.sides[1].protos.join('/') + ' ' + JSON.stringify(p.goal));
  }
  fs.writeFileSync(DAILY, JSON.stringify(daily));
  console.log(replaced + ' / ' + bad.length + ' 問を入れ替えた');
})().catch((e) => { console.error(e); process.exit(1); });
