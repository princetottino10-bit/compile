/* カード本文のトリガー (「開始：」「終了：」「〜たとき：」など) を強調する。
   カードリスト (companion.js の cardText) と同じ見分け方で、太字＋下線にする */

const COND_RE = /(開始：|終了：|[^。：]+?(?:たとき|たあと|た場合|なかった場合)：)/g;

const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* HTML 用: 本文をエスケープし、トリガーを <b class="cond"> で囲む */
export function condHtml(text) {
  return esc(text).replace(COND_RE, '<b class="cond">$1</b>');
}

/* canvas 用: 1文字ずつ、トリガーの中かどうかを返す ({ ch, cond }[]) */
export function condChars(text) {
  const s = String(text == null ? '' : text);
  const on = new Array(s.length).fill(false);
  for (const m of s.matchAll(COND_RE)) for (let i = m.index; i < m.index + m[0].length; i++) on[i] = true;
  const out = [];
  let i = 0;
  for (const ch of Array.from(s)) { out.push({ ch, cond: on[i] }); i += ch.length; }
  return out;
}
