/* =========================================================================
 * 小窓 (設定・プロフィール・記録など .pz-ov) と全画面の画面 (カード一覧など) の、共通の閉じ方
 *   - 右上の × はやめた。小窓は下の「閉じる」、全画面の画面は左上の「← 戻る」
 *   - どれも外側に触れる・Esc で閉じる。Esc は一番手前の1つだけを閉じる
 *     (各画面の閉じるボタンを押したのと同じにして、画面ごとの後始末をそのまま通す)
 *   - 小窓の中身が下に続くときは、下端に「続きあり」の合図 (.more) を出す
 * ========================================================================= */

/* [開いているときの外枠, その閉じるボタン] */
const CLOSERS = [
  ['.pz-ov.show', '.pz-x'],
  ['#cosOv.show', '.cm-x'],
  ['#protoCardsOv.show', '.pc-x']
];
/* 重ねて開く画面。あとから開いたものが必ず手前に出る (前は画面ごとの z-index がばらばらで、
   ガチャから開いたログインやプロフィールから開いた画面が、後ろに隠れることがあった) */
const STACKED = '.pz-ov, #cosOv, #protoCardsOv, #cardListOv';
const zOf = (el) => Number(getComputedStyle(el).zIndex) || 0;

function topmostCloser() {
  /* 触ったカードの説明は、いつもいちばん手前 */
  const note = document.querySelector('#cardNote.show .cn-close');
  if (note) return note;
  let best = null, bestZ = -Infinity;
  for (const [ov, btn] of CLOSERS) {
    for (const el of document.querySelectorAll(ov)) {
      const b = el.querySelector(btn);
      const z = zOf(el);
      /* 同じ高さなら、あとから足したもの (DOM の後ろ) が手前 */
      if (b && (z > bestZ || (z === bestZ && best && (best.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)))) { best = el; bestZ = z; }
    }
  }
  return best ? best.querySelector(CLOSERS.find(([ov]) => best.matches(ov))[1]) : null;
}

/* 開いた画面を、ほかに開いている画面より手前へ。開いたままの画面をもう一度開いたとき (COLLECTION から RECORD へ戻るなど) も呼ぶ */
export function raise(el) {
  el.style.zIndex = '';
  let top = 0;
  for (const o of document.querySelectorAll(STACKED)) {
    if (o !== el && o.classList.contains('show')) top = Math.max(top, zOf(o));
  }
  if (top >= zOf(el)) el.style.zIndex = String(top + 1);
}
function onClassChange(records) {
  for (const r of records) {
    /* はじめから show 付きで足された画面も */
    if (r.type === 'childList') {
      for (const n of r.addedNodes) if (n.nodeType === 1 && n.matches(STACKED) && n.classList.contains('show')) raise(n);
      continue;
    }
    const el = r.target;
    if (r.type !== 'attributes' || !el.matches || !el.matches(STACKED)) continue;
    const was = /(^|\s)show(\s|$)/.test(r.oldValue || ''), now = el.classList.contains('show');
    if (now && !was) raise(el);
    else if (!now && was) el.style.zIndex = '';
  }
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
  new MutationObserver((records) => { onClassChange(records); queueMark(); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  window.addEventListener('resize', queueMark);
}
