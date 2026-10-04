/* =========================================================================
 * カードリストをアプリの中で開く
 *   cardlist.html をそのまま重ねて出す (検索・絞り込み・詳細もそのまま使える)。
 *   ?embed=1 のときカードリスト側はサイトの見出し (他ページへのリンク) を隠す。
 *   一度開いたら閉じても残し、次は読み込み直さずに出す。
 * ========================================================================= */

let ov = null;

function close() {
  if (!ov) return;
  ov.classList.remove('show');
  document.removeEventListener('keydown', onKey);
}

function onKey(ev) {
  if (ev.key === 'Escape') close();
}

/* protos: 対戦中ならその対戦のプロトコル (自分と相手)。渡すとその絞り込みで開く */
export function openCardList(protos) {
  const list = Array.isArray(protos) ? protos.filter(Boolean) : [];
  if (ov && list.length) {
    const fr = ov.querySelector('.cl-frame');
    try { fr.contentWindow.postMessage({ type: 'cl-protos', protos: list }, location.origin); } catch (e) { /* 読み込み中なら URL で効く */ }
  }
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'cardListOv';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'カードリスト');
    ov.innerHTML = '<div class="cl-bar"><b>CARD LIST</b><button type="button" class="cl-x"><span aria-hidden="true">←</span>戻る</button></div>' +
      '<iframe class="cl-frame" title="カードリスト" src="cardlist.html?embed=1' + (list.length ? '&protos=' + encodeURIComponent(list.join(',')) : '') + '"></iframe>';
    ov.querySelector('.cl-x').onclick = close;
    document.body.appendChild(ov);
  }
  ov.classList.add('show');
  document.addEventListener('keydown', onKey);
}
