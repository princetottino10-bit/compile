/* =========================================================================
 * 効果の選択UI (共通部品)
 *   盤面ピックの帯と一覧ダイアログで、同じ見出しを使う:
 *   発動元カード (タップで効果文) / 何を選ぶか / 任意・選択数
 * ========================================================================= */
import { PROMPT_TEXT, OP_LABEL } from './prompts.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 質問文。見出しでは発動元を別に出すので [カード名] の前置きは付けない */
export function questionText(req) {
  return PROMPT_TEXT[req.prompt] || {
    pickCard: 'カードを選ぶ', pickHand: '手札を選ぶ', pickLine: 'ラインを選ぶ',
    yesNo: '確認', option: '効果を選ぶ', arrange: '並び順を決める'
  }[req.kind] || '選択してください';
}

/* "flip+draw" のような内部名を「反転する → カードを引く」に */
export function choiceLabel(o) {
  if (o === null || o === undefined) return '';
  if (typeof o !== 'string') return esc(o.label || o.text || o);
  if (o.indexOf('+') >= 0 || OP_LABEL[o]) {
    return o.split('+').map(op => esc(OP_LABEL[op] || op)).join('<i class="sel-arrow">→</i>');
  }
  return esc(o);
}

/* 指示文のうち「何を選ぶか」の語を強調する (例: 反転させる<em>カード</em>を選択) */
const TARGET_WORD = /(カード|ライン|手札|スタック|プロトコル|効果|並び順|値)(?=を|\(|（)/;
function emphasize(html) {
  return html.replace(TARGET_WORD, '<em>$1</em>');
}

/* 見出し。source: { def, name, color } (無ければ省略)
   meta: { optional, count, max } */
export function selectHead(req, source, meta) {
  const m = meta || {};
  const tags = [];
  if (m.optional) tags.push('<span class="sel-tag">任意</span>');
  if (m.max > 1) tags.push('<span class="sel-count"><b>' + (m.count || 0) + '</b> / ' + m.max + '</span>');
  return '<div class="sel-head"' + (source && source.color ? ' style="--accent:' + source.color + '"' : '') + '>' +
    (source
      ? '<button type="button" class="sel-src" data-def="' + esc(source.def) + '" title="効果を読む">' +
          '<i></i><b>' + esc(source.name) + '</b><span>効果</span></button>'
      : '') +
    '<div class="sel-q">' + emphasize(esc(questionText(req))) + '</div>' +
    (tags.length ? '<div class="sel-meta">' + tags.join('') + '</div>' : '') +
    '</div>';
}

/* 見出しの発動元チップにタップ処理を付ける */
export function bindSelectHead(root, onSource) {
  const src = root.querySelector('.sel-src');
  if (src && onSource) src.onclick = (ev) => { ev.stopPropagation(); onSource(src.dataset.def); };
}

/* 選択肢の本体 (種類ごとの見た目) を組み立てる。
   戻り値: { html, bind(el, finish) } */
export function optionBody(req, ctx) {
  if (req.prompt === 'declare-protocol') {
    return {
      html: '<div class="sel-grid sel-protos">' + req.options.map((name, i) => {
        const p = ctx.protoInfo ? ctx.protoInfo(name) : null;
        return '<button type="button" class="sel-proto" data-i="' + i + '"' +
          (p && p.color ? ' style="--pc:' + p.color + '"' : '') + '>' +
          '<b>' + esc(name) + '</b>' + (p && p.owner ? '<small>' + esc(p.owner) + '</small>' : '') + '</button>';
      }).join('') + '</div>',
      bind: (el, finish) => el.querySelectorAll('.sel-proto').forEach(b => { b.onclick = () => finish([+b.dataset.i]); })
    };
  }
  if (req.prompt === 'declare-value') {
    return {
      html: '<div class="sel-grid sel-values">' + req.options.map((v, i) =>
        '<button type="button" class="sel-value" data-i="' + i + '">' + esc(v) + '</button>').join('') + '</div>',
      bind: (el, finish) => el.querySelectorAll('.sel-value').forEach(b => { b.onclick = () => finish([+b.dataset.i]); })
    };
  }
  return null;
}
