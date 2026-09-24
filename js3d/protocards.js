/* =========================================================================
 * プロトコルの6枚を見せる (選択画面・オンラインのドラフト共通)
 *   絵だけだとスマホで文字が読めないので、値と上段・中段・下段の文も並べる。
 *   どこかに触れると閉じる。
 *   getItems(name) -> [{ img, value, label, rows: [{ key: 'upper'|'middle'|'lower', text }] }]
 *   カードの絵は後から読み込まれるので、少し待ってから絵を差し替える。
 * ========================================================================= */

const ZONE = { upper: '▲ 上段', middle: '◆ 中段', lower: '▼ 下段' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function showProtocolCards(name, color, getItems) {
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
  ov.style.setProperty('--accent', color || '#b9a4ff');
  ov.setAttribute('aria-label', name + ' のカード');
  ov.innerHTML =
    '<div class="pc-head"><b>' + esc(name) + '</b><span>のカード (6枚)</span>' +
      '<button type="button" class="pc-x" aria-label="閉じる">×</button></div>' +
    '<div class="pc-list">' + items.map((it) =>
      '<article class="pc-card">' +
        '<div class="pc-img">' + (it.img ? '<img alt="" src="' + it.img + '">' : '<i></i>') + '</div>' +
        '<div class="pc-text"><b>' + esc(it.label) + '</b>' +
          (it.rows.length
            ? it.rows.map(r => '<p><span>' + (ZONE[r.key] || '') + '</span>' + r.text + '</p>').join('')
            : '<p class="pc-none">効果なし</p>') +
        '</div>' +
      '</article>').join('') + '</div>' +
    '<div class="pc-hint">どこかに触れると閉じます</div>';
  ov.classList.add('show');
  ov.onclick = () => ov.classList.remove('show');
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
  if (ov) ov.classList.remove('show');
}
