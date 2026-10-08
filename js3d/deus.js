/* =========================================================================
 * 称号 DEUS EX MACHINA (実績をすべて取った人) の特別な演出
 *   「機械仕掛けの神」: 天から光の柱が降り、歯車が回り、名前が吊られて降りてくる。
 *   - descend(name, mine): 試合の始めに1回 (自分でも、オンラインの相手でも)。1.8 秒ほどで消える飾り。
 *     盤面の操作は止めない (pointer-events なし)。触れたら早めに消える
 *   - gearSvg(): 名札の称号の前に付ける小さな歯車
 *   動きを減らす設定では、光って名前が出るだけ (歯車は回さない)
 * ========================================================================= */
import { sfx } from './audio.js';
import { calm } from './prefs.js';

export const DEUS_TITLE = 'DEUS EX MACHINA';

/** 歯車の形 (SVG)。teeth: 歯の数 */
export function gearSvg(teeth = 10, cls = '') {
  const pts = [];
  const R = 48, r = 38;
  for (let i = 0; i < teeth * 2; i++) {
    const a = (Math.PI * i) / teeth;
    const rad = i % 2 ? r : R;
    const a1 = a - Math.PI / teeth / 2.4, a2 = a + Math.PI / teeth / 2.4;
    pts.push((50 + rad * Math.cos(a1)).toFixed(1) + ',' + (50 + rad * Math.sin(a1)).toFixed(1));
    pts.push((50 + rad * Math.cos(a2)).toFixed(1) + ',' + (50 + rad * Math.sin(a2)).toFixed(1));
  }
  return '<svg class="dx-gear ' + cls + '" viewBox="0 0 100 100" aria-hidden="true"><polygon points="' + pts.join(' ') + '"/>' +
    '<circle cx="50" cy="50" r="16"/></svg>';
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 降臨の演出。name: その人の名前、mine: 自分か */
export function descend(name, mine) {
  const el = document.createElement('div');
  el.className = 'dx-descend' + (calm() ? ' calm' : '');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    '<i class="dx-pillar"></i>' +
    '<div class="dx-gears">' + gearSvg(12, 'g1') + gearSvg(9, 'g2') + gearSvg(14, 'g3') + '</div>' +
    '<div class="dx-hang"><i class="dx-wire l"></i><i class="dx-wire r"></i>' +
      '<div class="dx-plaque"><i class="dx-halo"></i><small>' + (mine ? 'YOU ARE' : 'ENTER') + '</small>' +
      '<b data-text="' + DEUS_TITLE + '">' + DEUS_TITLE + '</b><em>' + esc(name) + '</em></div></div>';
  document.body.appendChild(el);
  sfx('deus');
  const end = () => { el.classList.add('out'); setTimeout(() => el.remove(), 500); };
  const t = setTimeout(end, calm() ? 1400 : 2300);
  /* 触れたら早めに消す (盤面の操作はそのまま通す) */
  const early = () => { clearTimeout(t); end(); window.removeEventListener('pointerdown', early, true); };
  window.addEventListener('pointerdown', early, true);
  setTimeout(() => window.removeEventListener('pointerdown', early, true), 2600);
}
