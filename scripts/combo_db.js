'use strict';
/*
 * コンボのデータベースを作る。
 *   候補 (scripts/combo_cands.js) と実験の結果 (scripts/combo_lab.js の出力、1コンボ1ファイル) と
 *   教わった手筋 (scripts/combo_taught.js) をまとめて data/combos.json と docs/combos.md を書く。
 *
 *   node scripts/combo_db.js --res _combo2/r1,_combo2/r2
 *
 * 同じコンボの結果が複数のディレクトリにあれば、後ろに書いたほうを使う (読みを長くした測り直しなど)。
 */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const resDirs = (args[args.indexOf('--res') + 1] || '').split(',').filter(Boolean);
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
const proto = {}, value = {};
for (const p of cards.protocols) for (const c of p.cards) { proto[c.id] = p.name; value[c.id] = c.value; }
const CANDS = require('./combo_cands.js');
const TAUGHT = require('./combo_taught.js');

const results = {};
for (const d of resDirs) {
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) if (f.endsWith('.json')) {
    const r = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
    results[r.id] = r;
  }
}
/* 組の効き目 (相互作用) = (その手 − その手で相方を白紙) − (ORACLE の手 − ORACLE の手で相方を白紙)。
   1つ目の差だけだと、相方そのものの強さ (相方が単独で場にある値) まで数えてしまう */
function interaction(r) {
  const rows = (r.rows || []).filter(x => ['forced', 'free', 'forcedA0', 'freeA0'].every(k => x[k] !== null && x[k] !== undefined));
  if (rows.length < 5) return null;
  const v = rows.map(x => (x.forced - x.forcedA0) - (x.free - x.freeA0));
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1));
  return { mean: m, se: sd / Math.sqrt(v.length), n: v.length };
}
const pt = (x) => (x === null || x === undefined ? null : Math.round(1000 * x) / 10);

/* 判定: 組の効き目 (forced − forcedA0) と、ORACLE が逃している得 (forced − free)。
   2SE を超えたものだけを数える */
function verdict(r) {
  if (!r || !r.missed) return { key: 'untested', label: '未計測' };
  const it = interaction(r), m = r.missed;
  const sig = (x, th) => x && x.mean - 2 * x.se > th;
  if (sig(m, 0.02)) return { key: 'missed', label: 'AI が逃している' };
  if (it && sig(it, 0) && it.mean >= 0.02) return { key: 'strong', label: '噛み合う' };
  if (r.pairValue && sig(r.pairValue, 0.04) && (!it || it.mean > -0.01)) return { key: 'weak', label: '相方が強い (噛み合いは小さい)' };
  if (it && it.mean + 2 * it.se < 0) return { key: 'negative', label: '逆効果' };
  return { key: 'none', label: '効き目が見えない' };
}

const combos = [];
for (const c of CANDS) {
  const r = results[c.id];
  const v = verdict(r);
  combos.push({
    id: c.id, name: c.name, kind: c.kind, source: c.source || (c.auto ? 'auto' : 'lab'),
    cards: c.setup.mine.map(p => p.card), protocols: c.protos, how: c.how,
    verdict: v.key, verdictLabel: v.label,
    lab: r && r.missed ? {
      n: r.n, horizon: r.opt.horizon, playout: !!r.opt.playout,
      interaction: interaction(r) ? pt(interaction(r).mean) : null, interactionSe: interaction(r) ? pt(interaction(r).se) : null,
      partnerValue: r.pairValue ? pt(r.pairValue.mean) : null, partnerValueSe: r.pairValue ? pt(r.pairValue.se) : null,
      synergy: r.synergy ? pt(r.synergy.mean) : null, synergySe: r.synergy ? pt(r.synergy.se) : null,
      missed: r.missed ? pt(r.missed.mean) : null, missedSe: r.missed ? pt(r.missed.se) : null,
      aiPicked: r.aiPicked === null ? null : Math.round(100 * r.aiPicked)
    } : null,
    note: c.note || null
  });
}
for (const t of TAUGHT) combos.push({ ...t, source: 'taught', verdict: 'taught', verdictLabel: '教わった手筋 (AI に入っている)', lab: null });

const KIND = { engine: '毎手番効く', burst: 'その手番で得', setup: '次の手番の仕込み', lock: '相手を縛る' };
const out = {
  about: 'Compile のコンボのデータベース。生成: node scripts/combo_db.js (候補 scripts/combo_cands.js / 検証 scripts/combo_lab.js / 教わった手筋 scripts/combo_taught.js)。' +
    'lab.interaction = 噛み合い (その手で相方あり−相方白紙) − (ORACLE の手で相方あり−相方白紙) (pt)。lab.partnerValue = ORACLE が自由に打つときの相方あり−相方白紙 (相方そのものの値)。' +
    'lab.synergy = その手で相方あり−相方白紙 (噛み合い+相方の値)。' +
    'lab.missed = その手を打ったときと ORACLE が自分で選んだ手の差。lab.aiPicked = ORACLE が自分でその手を選んだ割合 (%)。' +
    '勝つ見込みは自分の手番を horizon 回進めたあとの data/valnet.json の読み (playout なら決着まで打った勝ち負け)。',
  updated: new Date().toISOString().slice(0, 10),
  combos
};
fs.writeFileSync(path.join(ROOT, 'data', 'combos.json'), JSON.stringify(out, null, 1) + '\n');

/* ---------- docs/combos.md ---------- */
const order = ['missed', 'strong', 'weak', 'taught', 'none', 'negative', 'untested'];
const head = {
  missed: '## AI が逃しているコンボ\nその手を打つと、ORACLE が自分で選ぶ手より勝つ見込みが上がる。AI の手筋に入れる候補。',
  strong: '## 噛み合うコンボ\n相方があると、その手が他の手より余分に良くなる (平均 2pt 以上で、0 から 2SE 以上離れている)。',
  weak: '## 相方が強いもの\n相方の札そのものは強い (4pt 以上) が、この手との噛み合いは見えるほどではない。',
  taught: '## 教わった手筋\n対戦者から教わって AI に入れたもの。くわしくは docs/ai-combos.md。',
  none: '## 効き目が見えないもの\n効果を読むと噛み合いそうだが、実戦の盤面では差が出なかった。',
  negative: '## 逆効果だったもの',
  untested: '## まだ測っていないもの'
};
const f1 = (x, se) => (x === null ? '-' : (x >= 0 ? '+' : '') + x.toFixed(1) + (se !== null && se !== undefined ? ' ±' + se.toFixed(1) : ''));
let md = '# コンボのデータベース\n\n' +
  '生成物 (`node scripts/combo_db.js`)。手で書き換えない。データは data/combos.json。\n\n' +
  '**測り方**: コンボのプロトコルを含むデッキで ORACLE 同士の対戦を進め、途中の自分の手番で止めて札を植える。' +
  '同じ盤面から「その手を打つ」「相方を効果なしの同じ値の札にして同じ手を打つ」「ORACLE が自分で選ぶ」を打ち、' +
  '相手の手番を挟んで自分の手番を数回進めたあとの勝つ見込み (学習モデル) を比べる。\n\n' +
  '- **噛み合い**: 相方があることで、その手が他の手よりどれだけ余分に良くなったか (pt)。(その手: 相方あり−相方白紙) − (ORACLE の手: 相方あり−相方白紙)\n' +
  '- **相方の値**: ORACLE が自由に打つとき、相方の札があることでどれだけ良くなったか (相方そのものの強さ)\n' +
  '- **逃している得**: その手を打つのと ORACLE が自分で選ぶ手の差。正なら AI が打つべき手を打っていない\n' +
  '- **自分で選ぶ**: ORACLE がその手を自分で選んだ割合\n\n' +
  '呼び名は値 (WAR 0 = WAR_1)。± は標準誤差。\n\n';
for (const k of order) {
  const list = combos.filter(c => c.verdict === k);
  if (!list.length) continue;
  md += head[k] + '\n\n';
  if (k === 'taught') {
    md += '| 手筋 | 内容 |\n|---|---|\n';
    for (const c of list) md += '| ' + c.name + ' | ' + c.how + ' |\n';
  } else {
    if (k === 'none' || k === 'negative' || k === 'untested') {
      md += '| ID | コンボ | 種類 | 噛み合い | 相方の値 | 逃している得 | 自分で選ぶ |\n|---|---|---|---|---|---|---|\n';
      for (const c of list) md += '| ' + c.id + ' | ' + c.name + ' | ' + (KIND[c.kind] || c.kind) + ' | ' + (c.lab ? f1(c.lab.interaction, c.lab.interactionSe) : '-') + ' | ' + (c.lab ? f1(c.lab.partnerValue, c.lab.partnerValueSe) : '-') + ' | ' + (c.lab ? f1(c.lab.missed, c.lab.missedSe) : '-') + ' | ' + (c.lab && c.lab.aiPicked !== null ? c.lab.aiPicked + '%' : '-') + ' |\n';
    } else {
      list.sort((a, b) => (b.lab ? b.lab.interaction + b.lab.partnerValue : 0) - (a.lab ? a.lab.interaction + a.lab.partnerValue : 0));
      for (const c of list) {
        md += '### ' + c.id + ' ' + c.name + '\n' + c.how + '\n\n' +
          '- 種類: ' + (KIND[c.kind] || c.kind) + ' / プロトコル: ' + c.protocols.join('・') + '\n' +
          (c.lab ? '- 噛み合い ' + f1(c.lab.interaction, c.lab.interactionSe) + 'pt / 相方の値 ' + f1(c.lab.partnerValue, c.lab.partnerValueSe) + 'pt / 逃している得 ' + f1(c.lab.missed, c.lab.missedSe) + 'pt / 自分で選ぶ ' + c.lab.aiPicked + '% (' + c.lab.n + '盤面、自分の手番 ' + c.lab.horizon + ' 回先' + (c.lab.playout ? '・決着まで' : '') + ')\n' : '') +
          (c.note ? '- ' + c.note + '\n' : '') + '\n';
      }
    }
  }
  md += '\n';
}
fs.writeFileSync(path.join(ROOT, 'docs', 'combos.md'), md);
console.log('コンボ ' + combos.length + ' 件 (' + order.map(k => k + ' ' + combos.filter(c => c.verdict === k).length).join(', ') + ')');
