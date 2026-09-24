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

export function openCardList() {
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'cardListOv';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'カードリスト');
    ov.innerHTML = '<div class="cl-bar"><b>CARD LIST</b><button type="button" class="cl-x" aria-label="閉じる">×</button></div>' +
      '<iframe class="cl-frame" title="カードリスト" src="cardlist.html?embed=1"></iframe>';
    ov.querySelector('.cl-x').onclick = close;
    document.body.appendChild(ov);
  }
  ov.classList.add('show');
  document.addEventListener('keydown', onKey);
}
