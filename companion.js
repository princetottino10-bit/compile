/* =========================================================================
 * コンパニオンツール (カードリスト・ピッカー) の共通部品
 *   カードの中身は 3D アリーナと同じ data/cards.json から読む
 *   (ページに埋め込むと、カードの修正がツールにだけ反映されずにずれる)。
 *   紋章と効果アイコンもアリーナのモジュールをそのまま使う。
 * ========================================================================= */
import { emblemDataURL } from './js3d/emblems.js';
import { svgIcon } from './js3d/icons.js';

export const SETS = ['Main 1', 'Aux 1', 'Main 2', 'Aux 2'];

export const EFFECTS = ['draw', 'delete', 'flip', 'shift', 'return', 'rearrange', 'discard', 'play', 'five', 'other'];
export const EFFECT_LABEL = {
  draw: '引く', delete: '削除', flip: '反転', shift: '移動', return: '戻す',
  rearrange: '並べ替え', discard: '捨て札', play: 'プレイ', five: '５', other: 'その他'
};
export const EFFECT_COLOR = {
  draw: '#63b3ff', delete: '#ff6b6b', flip: '#c38bff', shift: '#ffb547', return: '#3ee0c8',
  rearrange: '#a594ff', discard: '#9aa3b5', play: '#6dffc2', five: '#cfd6e4', other: '#8f9bb3'
};

export const ZONES = [
  ['upper', '▲', '上段'],
  ['middle', '◆', '中段'],
  ['lower', '▼', '下段']
];

export const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* カード本文: 句点で改行し、「開始：」「〜たとき：」などの条件を強調する (旧カードリストと同じ読みやすさ) */
export function cardText(s) {
  return esc(s)
    .replace(/。(?!$)/g, '。<br>')
    .replace(/(開始：|終了：|[^。<>]+?(たとき|たあと|た場合|なかった場合)：)/g, '<b class="cond">$1</b>');
}

export async function loadProtocols() {
  const res = await fetch('data/cards.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('data/cards.json: ' + res.status);
  const data = await res.json();
  return data.protocols;
}

/* art/Darkness.webp (プロトコルの風景) / art/1darkness.webp (カード1枚ずつ) */
export const protoArt = (name) => 'art/' + name.charAt(0) + name.slice(1).toLowerCase() + '.webp';
export const cardArt = (proto, card) => 'art/' + card.number + proto.toLowerCase() + '.webp';

export const emblem = (p, size) => emblemDataURL(p.name, p.color || '#63f3ff', size || 96, true);
export const effectIcon = (type, color, size) => svgIcon(type, color || EFFECT_COLOR[type], size || 14);

/* プロトコルのタイル。attrs は button に足す属性文字列 */
export function protoTile(p, opts) {
  const o = opts || {};
  return '<button type="button" class="proto' + (o.cls ? ' ' + o.cls : '') + '" data-name="' + esc(p.name) + '"' +
    ' style="--accent:' + esc(p.color || '#63f3ff') + '"' + (o.attrs ? ' ' + o.attrs : '') + '>' +
    '<span class="proto-art" style="background-image:url(&quot;' + protoArt(p.name) + '&quot;)"></span>' +
    '<img class="proto-emblem" alt="" src="' + emblem(p) + '">' +
    (o.extra || '') +
    '<span class="proto-name">' + esc(p.displayName || p.name) + '</span>' +
    '<span class="proto-set">' + esc(o.tag != null ? o.tag : p.set) + '</span></button>';
}

/* 紋章つきの小さなチップ */
export function protoChip(p, on) {
  return '<button type="button" class="pchip' + (on ? ' on' : '') + '" data-name="' + esc(p.name) + '"' +
    ' style="--accent:' + esc(p.color || '#63f3ff') + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
    '<img alt="" src="' + emblem(p, 48) + '">' + esc(p.name) + '</button>';
}

/* 保存 (プライベートブラウズ等で使えなくても、ページは普通に動く) */
export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ }
  }
};

/* 画面下の一言 */
let toastTimer = 0;
export function toast(msg) {
  let el = document.getElementById('cpToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cpToast';
    el.className = 'cp-toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('コピーしました');
    return true;
  } catch (e) {
    toast('コピーできませんでした');
    return false;
  }
}

/* シート (モーダル) : 外側・×・Esc・下スワイプで閉じる */
export function sheet() {
  let ov = document.getElementById('cpSheet');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'cpSheet';
    ov.className = 'cp-sheet-ov';
    ov.innerHTML = '<div class="cp-sheet" role="dialog" aria-modal="true">' +
      '<button type="button" class="cp-sheet-x" aria-label="閉じる">×</button><div class="cp-sheet-body"></div></div>';
    document.body.appendChild(ov);
    const box = ov.querySelector('.cp-sheet');
    const close = () => { ov.classList.remove('show'); document.body.style.overflow = ''; };
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.cp-sheet-x').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.classList.contains('show')) close(); });
    let y0 = null;
    box.addEventListener('touchstart', (e) => { y0 = box.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    box.addEventListener('touchmove', (e) => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      box.style.transform = dy > 0 ? 'translateY(' + dy + 'px)' : '';
    }, { passive: true });
    box.addEventListener('touchend', (e) => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0;
      box.style.transform = '';
      y0 = null;
      if (dy > 90) close();
    });
    ov._close = close;
  }
  return {
    open(html, accent) {
      const box = ov.querySelector('.cp-sheet');
      box.style.setProperty('--accent', accent || '#63f3ff');
      ov.querySelector('.cp-sheet-body').innerHTML = html;
      box.scrollTop = 0;
      ov.classList.add('show');
      document.body.style.overflow = 'hidden';
      return ov.querySelector('.cp-sheet-body');
    },
    close() { ov._close(); }
  };
}
