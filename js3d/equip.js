/* =========================================================================
 * その場で着ける (レベルアップ・ガチャ・実績・下剋上など「手に入った」画面から1回で)
 *   着けたら「○○を着けました ・ 元に戻す」を出す。知らせは勝手に消さない
 *   (ほかの場所に触れたら引っ込む)
 * ========================================================================= */
import { settings, setSetting } from './settings.js';
import { COSMETICS, TITLES } from './rewards.js';

/* はじめから着けているもの (設定に何も無いとき) */
const DEFAULT_KEY = { mat: 'neon', sleeve: 'default', marker: 'default', ccolor: 'default', victory: 'default', title: '', icon: '',
  plate: 'default', avatar: 'shion', bgm: 'burst' };

/** その場で着けられる品物か (BGM の曲 (track) はメニューと対戦のどちらで流すか選ぶので、ここでは着けない) */
export function canEquip(kind, key) {
  if (kind === 'title') return !!TITLES[key];
  return !!(COSMETICS[kind] && COSMETICS[kind].some(([k]) => k === key));
}

/** いま着けているか */
export function isEquipped(kind, key) {
  const s = settings();
  return (kind === 'title' || kind === 'icon' ? (s[kind] || '') : (s[kind] || DEFAULT_KEY[kind])) === key;
}

export function itemLabel(kind, key) {
  if (kind === 'title') return TITLES[key] || key;
  const it = COSMETICS[kind] && COSMETICS[kind].find(([k]) => k === key);
  return it ? it[1] : key;
}

/**
 * まとめて着ける ([[kind, key], ...])。元に戻すの知らせを出す
 * @returns {boolean} 1つでも着けたか
 */
export function equipNow(items) {
  const list = (items || []).filter(([kind, key]) => canEquip(kind, key));
  if (!list.length) return false;
  const s = settings();
  const prev = list.map(([kind]) => [kind, kind === 'title' || kind === 'icon' ? (s[kind] || '') : (s[kind] || DEFAULT_KEY[kind])]);
  for (const [kind, key] of list) setSetting(kind, key);
  undoToast(list.map(([kind, key]) => itemLabel(kind, key)).join('・'), () => { for (const [kind, v] of prev) setSetting(kind, v); });
  return true;
}

function undoToast(name, undo) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('equipToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'equipToast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = '<span>「' + esc(name) + '」を着けました</span><button type="button">元に戻す</button>';
  el.classList.add('show');
  const hide = () => { el.classList.remove('show'); document.removeEventListener('pointerdown', outside, true); };
  const outside = (ev) => { if (!el.contains(ev.target)) hide(); };
  el.querySelector('button').onclick = () => {
    undo();
    el.innerHTML = '<span>元に戻しました</span>';
    document.removeEventListener('pointerdown', outside, true);
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  };
  /* 着けたそのタッチでは引っ込めない (次に触れたときから) */
  document.removeEventListener('pointerdown', el._outside || outside, true);
  el._outside = outside;
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
