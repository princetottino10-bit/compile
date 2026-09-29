/* =========================================================================
 * 小窓 (設定・プロフィール・記録など .pz-ov) と全画面の画面 (カード一覧など) の、共通の閉じ方
 *   - 右上の × はやめた。小窓は下の「閉じる」、全画面の画面は左上の「← 戻る」
 *   - どれも外側に触れる・Esc で閉じる。Esc は一番手前の1つだけを閉じる
 *     (各画面の閉じるボタンを押したのと同じにして、画面ごとの後始末をそのまま通す)
 *   - 小窓の中身が下に続くときは、下端に「続きあり」の合図 (.more) を出す
 * ========================================================================= */

/* [開いているときの外枠, その閉じるボタン]。上ほど手前に出るもの */
const CLOSERS = [
  ['.pz-ov.show', '.pz-x'],
  ['#protoCardsOv.show', '.pc-x'],
  ['#cardNote.show', '.cn-close']
];

function topmostCloser() {
  for (const [ov, btn] of CLOSERS) {
    const open = document.querySelectorAll(ov);
    /* 同じ種類が重なっていたら、あとから足したもの (DOM の後ろ) が手前 */
    for (let i = open.length - 1; i >= 0; i--) {
      const b = open[i].querySelector(btn);
      if (b) return b;
    }
  }
  return null;
}

/* 中身が下に続いていて、まだ下まで見ていない小窓に .more。
   小窓の中の一部だけがすべる作り (設定の右の中身など) は、その部分 (.pz-scroll) で見る */
function markMore(card) {
  const sc = card.querySelector('.pz-scroll') || card;
  const more = sc.scrollHeight - sc.clientHeight - sc.scrollTop > 8;
  card.classList.toggle('more', more);
}
function markAll() {
  for (const c of document.querySelectorAll('.pz-ov.show .pz-card')) markMore(c);
}

let queued = false;
function queueMark() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; markAll(); });
}

export function initDialogs() {
  if (typeof document === 'undefined') return;
  /* capture で先に受けて、閉じたら盤面の Esc (選択の取り消しなど) には渡さない */
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || ev.defaultPrevented) return;
    const b = topmostCloser();
    if (!b) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    b.click();
  }, true);
  document.addEventListener('scroll', (ev) => {
    const t = ev.target;
    const card = t && t.closest && t.closest('.pz-card');
    if (card) markMore(card);
  }, true);
  /* 開いた・中身を描き直した (タブの切り替えなど) ときにも付け直す */
  new MutationObserver(queueMark).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', queueMark);
}
