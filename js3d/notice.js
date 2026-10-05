/* =========================================================================
 * 小さなお知らせのカード (画面の下に重ねる。× で閉じるまで消えない)
 *   「横持ちがおすすめ」「ホーム画面に追加」「コントローラーを検出」などの、遊びを止めない知らせに使う。
 *   読む前に勝手に消えないよう、時間では閉じない。1回きりの知らせは once() で覚えておく
 * ========================================================================= */

const ONCE_KEY = 'compileOnce';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function readOnce() {
  try { return JSON.parse(localStorage.getItem(ONCE_KEY) || '{}') || {}; } catch (e) { return {}; }
}
/** その知らせをもう出したか */
export function seen(key) { return !!readOnce()[key]; }
/** 出したことを覚える */
export function markSeen(key) {
  const m = readOnce();
  m[key] = Date.now();
  try { localStorage.setItem(ONCE_KEY, JSON.stringify(m)); } catch (e) { /* 覚えられなければ、次も出る */ }
}
/** まだ出していなければ true を返し、出したことにする */
export function once(key) {
  if (seen(key)) return false;
  markSeen(key);
  return true;
}

function stack() {
  let el = document.getElementById('noticeStack');
  if (!el) {
    el = document.createElement('div');
    el.id = 'noticeStack';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

/**
 * お知らせを出す。同じ id がもう出ていれば出し直さない。
 * @param {{ id: string, title?: string, text: string, actions?: Array<{label: string, onClick?: Function, main?: boolean}>, tone?: string }} o
 *   actions: ボタン (押すと閉じてから onClick)。閉じる (×) はいつも付く
 * @returns {{ close: Function } | null}
 */
export function notice(o) {
  if (typeof document === 'undefined' || !o || !o.id) return null;
  const host = stack();
  if (host.querySelector('[data-nid="' + o.id + '"]')) return null;
  const card = document.createElement('div');
  card.className = 'sn-card' + (o.tone ? ' ' + o.tone : '');
  card.dataset.nid = o.id;
  card.setAttribute('role', 'status');
  card.innerHTML = '<div class="sn-text">' + (o.title ? '<b>' + esc(o.title) + '</b>' : '') + '<span>' + esc(o.text) + '</span></div>' +
    '<div class="sn-acts">' + (o.actions || []).map((a, i) => '<button type="button" data-a="' + i + '"' + (a.main ? ' class="go"' : '') + '>' + esc(a.label) + '</button>').join('') +
    '<button type="button" class="sn-x" data-a="x" aria-label="閉じる">×</button></div>';
  const close = () => { card.remove(); };
  card.onclick = (ev) => {
    const b = ev.target.closest('button[data-a]');
    if (!b) return;
    const a = b.dataset.a === 'x' ? null : (o.actions || [])[+b.dataset.a];
    if (a && a.keep) { if (a.onClick) a.onClick(b); return; }
    close();
    if (a && a.onClick) a.onClick(b);
  };
  host.appendChild(card);
  return { close };
}

/** 出ているお知らせを閉じる */
export function closeNotice(id) {
  const el = document.querySelector('#noticeStack [data-nid="' + id + '"]');
  if (el) el.remove();
}
