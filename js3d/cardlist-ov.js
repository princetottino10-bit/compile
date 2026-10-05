/* =========================================================================
 * カードリストをアプリの中で開く
 *   cardlist.html をそのまま重ねて出す (検索・絞り込み・詳細もそのまま使える)。
 *   ?embed=1 のときカードリスト側はサイトの見出し (他ページへのリンク) を隠す。
 *   一度開いたら閉じても残し、次は読み込み直さずに出す。
 *   カードリスト側からの知らせ (postMessage):
 *     cl-close: カードリストの中で Esc (詳しい表示が開いていないとき) → 閉じる
 *     cl-play : デッキ分析の「このデッキで対戦」→ その3つを選んだ状態でプロトコル選択へ (?deck=A,B,C)
 * ========================================================================= */

let ov = null;
let opener = null;      // 開く前に触っていたもの。閉じたらそこへ戻す

/* 対戦の準備より前 (タイトル) だけ、カードリストから新しい対戦を始めてよい。対戦中に移ると今の対戦が消える */
const canPlay = () => document.body.classList.contains('pregame');

function close() {
  if (!ov || !ov.classList.contains('show')) return;
  ov.classList.remove('show');
  document.removeEventListener('keydown', onKey);
  const back = opener;
  opener = null;
  if (back && back.isConnected && typeof back.focus === 'function') {
    try { back.focus({ preventScroll: true }); } catch (e) { /* 古いブラウザ */ }
  }
}

/* Esc は dialogs.js が一番手前の画面の「戻る」を押してくれる。これはそれが無い所で開いたとき用 */
function onKey(ev) {
  if (ev.key === 'Escape' && !ev.defaultPrevented) close();
}

const frame = () => ov && ov.querySelector('.cl-frame');

function onMessage(ev) {
  const fr = frame();
  if (!fr || ev.origin !== location.origin || ev.source !== fr.contentWindow || !ev.data) return;
  if (ev.data.type === 'cl-close') { close(); return; }
  if (ev.data.type === 'cl-play') {
    const list = Array.isArray(ev.data.protos) ? ev.data.protos.filter(n => typeof n === 'string' && /^[A-Z0-9_]+$/.test(n)) : [];
    if (list.length !== 3 || !canPlay()) return;
    location.href = location.pathname + '?deck=' + encodeURIComponent(list.join(','));
  }
}

/* 開いたら中へ入る (キーボードでそのまま探せて、Esc もカードリストの中で効く) */
function focusFrame() {
  const fr = frame();
  if (!fr || !ov.classList.contains('show')) return;
  try { fr.focus(); if (fr.contentWindow) fr.contentWindow.focus(); } catch (e) { /* 読み込み中 */ }
}

/* protos: 対戦中ならその対戦のプロトコル (自分と相手)。渡すとその絞り込みで開く。
   渡さない (タイトルから) ときも知らせて、前の対戦の絞り込みを残さない */
export function openCardList(protos) {
  const list = Array.isArray(protos) ? protos.filter(Boolean) : [];
  if (ov) {
    const fr = frame();
    try { fr.contentWindow.postMessage({ type: 'cl-protos', protos: list, canPlay: canPlay() }, location.origin); } catch (e) { /* 読み込み中なら URL で効く */ }
  }
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'cardListOv';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'カードリスト');
    ov.innerHTML = '<div class="cl-bar"><b>CARD LIST</b><button type="button" class="cl-x"><span aria-hidden="true">←</span>戻る</button></div>' +
      '<iframe class="cl-frame" title="カードリスト" src="cardlist.html?embed=1' + (canPlay() ? '&play=1' : '') +
        (list.length ? '&protos=' + encodeURIComponent(list.join(',')) : '') + '"></iframe>';
    ov.querySelector('.cl-x').onclick = close;
    ov.querySelector('.cl-frame').addEventListener('load', focusFrame);
    window.addEventListener('message', onMessage);
    document.body.appendChild(ov);
  }
  const active = document.activeElement;
  if (!ov.classList.contains('show')) opener = active && active !== document.body && !ov.contains(active) ? active : null;
  ov.classList.add('show');
  document.addEventListener('keydown', onKey);
  focusFrame();
}
