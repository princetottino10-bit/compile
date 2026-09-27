/* =========================================================================
 * 「タイトルへ」のボタン: タイトルから入る画面 (SINGLE GAME・RUN・ONLINE・COMPUZZLE・WATCH など) で、
 * いつも右上の同じ場所に同じ形で出す。画面を開くときに showTitleBack(戻る処理)、閉じるときに hideTitleBack()。
 * タイトルの上に重ねる小窓 (設定・COLLECTION・RECORD など) は、いつもどおり × で閉じる
 * ========================================================================= */
let el = null;
let handler = null;

/** 右上に「タイトル」を出す。押すと onBack を呼んで消える */
export function showTitleBack(onBack) {
  if (!el) {
    el = document.createElement('button');
    el.type = 'button';
    el.id = 'titleBack';
    el.className = 'title-back';
    el.setAttribute('aria-label', 'タイトルへ戻る');
    el.innerHTML = '<span aria-hidden="true">←</span>タイトル';
    el.onclick = () => { const f = handler; hideTitleBack(); if (f) f(); };
    document.body.appendChild(el);
  }
  handler = onBack;
  el.hidden = false;
}

export function hideTitleBack() {
  handler = null;
  if (el) el.hidden = true;
}
