/* =========================================================================
 * プロトコルの6枚を見せる (選択画面・オンラインのドラフト共通)
 *   絵だけだとスマホで文字が読めないので、値と上段・中段・下段の文も並べる。
 *   閉じるのは外側 (暗い所) か「戻る」だけ。カードに触れて読んでいる途中で閉じないように。
 *   Esc は dialogs.js が一番手前の画面の「戻る」を押す (ここが手前のときだけ閉じる)。
 *   getItems(name) -> [{ img, value, label, rows: [{ key: 'upper'|'middle'|'lower', text }] }]
 *   カードの絵は後から読み込まれるので、少し待ってから絵を差し替える。
 * ========================================================================= */

const ZONE = { upper: '▲ 上段', middle: '◆ 中段', lower: '▼ 下段' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 閉じて、開く前に触っていたボタン (「?」など) へ戻す */
function closeOv(ov) {
  if (!ov.classList.contains('show')) return;
  ov.classList.remove('show');
  const back = ov._opener;
  ov._opener = null;
  if (back && back.isConnected && typeof back.focus === 'function') {
    try { back.focus({ preventScroll: true }); } catch (e) { /* 古いブラウザ */ }
  }
}

/* list = [{ name, color }] を渡すと、上にタブを出して他のプロトコルにも切り替えられる (← → キーでも) */
export function showProtocolCards(name, color, getItems, list) {
  const items = getItems ? getItems(name) : [];
  if (!items.length) return;
  let ov = document.getElementById('protoCardsOv');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'protoCardsOv';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    document.body.appendChild(ov);
  }
  /* タブで切り替えたときは開き直しではないので、戻り先はそのまま */
  if (!ov.classList.contains('show')) {
    const a = document.activeElement;
    ov._opener = a && a !== document.body && !ov.contains(a) ? a : null;
  }
  const tabsOn = !!(list && list.length > 1);
  ov.style.setProperty('--accent', color || '#b9a4ff');
  ov.setAttribute('aria-label', name + ' のカード');
  const tabs = tabsOn
    ? '<nav class="pc-tabs' + (list.length > 8 ? ' many' : '') + '" aria-label="プロトコル">' + list.map(p =>
      '<button type="button" data-tab="' + esc(p.name) + '" style="--pc:' + esc(p.color || '#b9a4ff') + '"' +
        (p.name === name ? ' class="on" aria-current="true"' : '') + '>' + esc(p.name) + '</button>').join('') + '</nav>'
    : '';
  ov.innerHTML = tabs +
    '<div class="pc-head"><b>' + esc(name) + '</b><span>のカード (6枚)</span>' +
      '<button type="button" class="pc-x"><span aria-hidden="true">←</span>戻る</button></div>' +
    '<div class="pc-list">' + items.map((it) =>
      '<article class="pc-card">' +
        '<div class="pc-img">' + (it.img ? '<img alt="" src="' + it.img + '">' : '<i></i>') + '</div>' +
        '<div class="pc-text"><b>' + esc(it.label) + '</b>' +
          (it.rows.length
            ? it.rows.map(r => '<p><span>' + (ZONE[r.key] || '') + '</span>' + r.text + '</p>').join('')
            : '<p class="pc-none">効果なし</p>') +
        '</div>' +
      '</article>').join('') + '</div>' +
    '<div class="pc-hint">' + (tabsOn ? '上の名前か ← → で切り替え ・ ' : '') + '外側か「戻る」で閉じます</div>';
  ov.classList.add('show');
  const go = (p, focusTab) => {
    showProtocolCards(p.name, p.color, getItems, list);
    if (focusTab) { const t = ov.querySelector('.pc-tabs .on'); if (t) t.focus({ preventScroll: true }); }
  };
  ov.onclick = (ev) => {
    const tab = ev.target.closest('[data-tab]');
    if (tab) {
      const p = list.find(x => x.name === tab.dataset.tab);
      if (p) go(p, true);
      return;
    }
    /* 外側 (暗い所) か「戻る」だけで閉じる */
    if (ev.target === ov || ev.target.closest('.pc-x')) closeOv(ov);
  };
  ov.onkeydown = (ev) => {
    if (!tabsOn || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    const i = list.findIndex(x => x.name === name) + (ev.key === 'ArrowRight' ? 1 : -1);
    if (i < 0 || i >= list.length) return;
    ev.preventDefault();
    go(list[i], true);
  };
  /* 開いたら中へ (タブがあれば今のタブ、なければ「戻る」)。描き直しで消えたフォーカスもここで戻る */
  if (!ov.contains(document.activeElement)) {
    const f = ov.querySelector('.pc-tabs .on') || ov.querySelector('.pc-x');
    if (f) f.focus({ preventScroll: true });
  }
  /* 横にすべるタブでは、今のタブが見える所まで寄せる */
  const on = ov.querySelector('.pc-tabs.many .on');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  /* カードの絵は後から描かれるので、少し待ってから絵の入ったものに差し替える */
  clearTimeout(ov._t);
  ov._t = setTimeout(() => {
    if (!ov.classList.contains('show')) return;
    const imgs = ov.querySelectorAll('.pc-img img');
    getItems(name).forEach((it, i) => { if (imgs[i] && it.img) imgs[i].src = it.img; });
  }, 900);
}

export function hideProtocolCards() {
  const ov = document.getElementById('protoCardsOv');
  if (ov) closeOv(ov);
}
