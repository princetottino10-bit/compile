/* =========================================================================
 * トレーニング: 任意のカードを盤面へ供給するデバッグ用ツール。
 * ========================================================================= */
import { faceImageURL } from './cardtex.js';

export function mountTrainingTools(cards, defs, handlers) {
  const root = document.createElement('aside');
  root.id = 'trainingTools';
  root.innerHTML =
    '<div class="tr-head"><b>TRAINING</b><span>FREE PLACE</span></div>' +
    '<button class="tr-card" id="trChoose" type="button">カードを選ぶ</button>' +
    '<div class="tr-selected" id="trSelected">カードを選んでください</div>' +
    '<p>表／裏を切り替え、光る6つの配置枠を押すとその場所に追加します。</p>' +
    '<div class="tr-row"><button id="trUndo" type="button">直前を戻す</button><button id="trClear" type="button">盤面を空にする</button></div>' +
    '<div class="tr-picker" id="trPicker" hidden><div class="tr-picker-head"><b>カードを選ぶ</b><button id="trClose" type="button">閉じる</button></div>' +
      '<input id="trSearch" type="search" placeholder="プロトコル名・数字・テキストで検索" autocomplete="off">' +
      '<div class="tr-list" id="trList"></div></div>';
  document.body.appendChild(root);
  const all = cards.protocols.flatMap(p => p.cards.map(c => defs[c.id])).filter(Boolean);
  let selected = null;
  const selectedEl = root.querySelector('#trSelected');
  const picker = root.querySelector('#trPicker');
  const list = root.querySelector('#trList');
  function paint(listing = all) {
    list.replaceChildren();
    for (const def of listing) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tr-item';
      const img = document.createElement('img'); img.alt = ''; img.src = faceImageURL(def);
      const text = document.createElement('span');
      const effect = def.middle || def.upper || def.lower || '効果なし';
      text.innerHTML = '<b>' + def.proto + ' ' + def.value + '</b><small>' + effect + '</small>';
      b.append(img, text);
      b.onclick = () => {
        selected = def;
        selectedEl.textContent = def.proto + ' ' + def.value + ' を配置中';
        picker.hidden = true;
        handlers.select(def);
      };
      list.appendChild(b);
    }
  }
  paint();
  root.querySelector('#trChoose').onclick = () => { picker.hidden = false; root.querySelector('#trSearch').focus(); };
  root.querySelector('#trClose').onclick = () => { picker.hidden = true; };
  root.querySelector('#trSearch').oninput = (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    paint(!q ? all : all.filter(d => (d.proto + ' ' + d.value + ' ' + d.upper + ' ' + d.middle + ' ' + d.lower).toLowerCase().includes(q)));
  };
  root.querySelector('#trUndo').onclick = handlers.undo;
  root.querySelector('#trClear').onclick = handlers.clear;
  return { remove: () => root.remove(), selected: () => selected };
}
