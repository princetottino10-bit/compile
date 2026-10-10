'use strict';
/* もう出している詰めコンパイルの全問 (一覧と、今日の問題の出題元) を、いまのエンジンで問題を作るときと同じ条件にかけ直す。
 *   node scripts/tsume_audit.js [data/tsume.json data/tsume-daily.json ...]
 * 条件 (tsume_gen.js と同じ): 解き方 (最初の1手) が 1〜2 通り・どの解き方でも連鎖を通る・当てずっぽうで解けない・山札の並びに頼らない。
 * エンジンやカードの効果を変えると、前は良かった問題に近道 (別解) ができたり、解けなくなったりする。
 * 2026-10-11: 今日の上級 d190 が、作ったときと違う短い手順で解けた (並べ替えでお題と違うラインが正解になった件と合わせて見つかった)。
 * 条件を満たさなくなった問題は、scripts/tsume_daily_replace.js で入れ替える (一覧の問題は作り直す)。
 * 1問でも外れたら終わりの番号 1 で終わる (公開前に流して止める用) */
const fs = require('fs');
const path = require('path');
const { tryBoard } = require('./tsume_gen.js');

const root = path.join(__dirname, '..');
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['data/tsume.json', 'data/tsume-daily.json'];
const bad = [];
const t0 = Date.now();
let n = 0;
for (const f of files) {
  const list = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  for (const p of list) {
    n++;
    const r = tryBoard(p.spec, p.goal);
    if (!r) bad.push(f + ' ' + p.id + ' (tier ' + p.tier + ', ' + JSON.stringify(p.goal) + ')');
  }
}
console.log(n + ' 問を確かめた (' + Math.round((Date.now() - t0) / 1000) + 's)。条件を満たさない問題: ' + bad.length);
for (const b of bad) console.log('  ' + b);
process.exitCode = bad.length ? 1 : 0;
