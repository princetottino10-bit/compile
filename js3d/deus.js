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

/**
 * 機械仕掛けの神 (CHALLENGE の CODE:PURPLE) が対戦の始めに降りてくる演出。画面全体を使い、4秒ほど。
 *   暗転 → 天から紫の光の柱 → 歯車が組み上がる → 名前の札が吊られて降りる → 着地 (opts.onLand: 曲を流す・画面を揺らす) → 消える。
 *   押す・キーで飛ばせる (着地前なら onLand もそのとき呼ぶ)。動きを減らす設定では、光って名前が出るだけで短く。
 *   終わったら解決する Promise を返す (対戦の始まりはこれを待つ)
 */
export function deusIntro(name, opts = {}) {
  const quiet = calm();
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'dxi' + (quiet ? ' calm' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '機械仕掛けの神 ' + name + ' が降臨した');
    el.innerHTML =
      '<i class="dxi-veil"></i><i class="dxi-pillar"></i>' +
      '<div class="dxi-gears">' + gearSvg(16, 'g1') + gearSvg(10, 'g2') + gearSvg(12, 'g3') + gearSvg(8, 'g4') + '</div>' +
      '<p class="dxi-kicker">' + DEUS_TITLE + '</p>' +
      '<div class="dxi-hang"><i class="dx-wire l"></i><i class="dx-wire r"></i>' +
        '<div class="dxi-plaque"><i class="dxi-halo"></i><small>機械仕掛けの神</small>' +
        '<b>' + esc(name) + '</b></div></div>' +
      '<i class="dxi-ring"></i><i class="dxi-flash"></i>' +
      '<p class="dxi-skip">押すと飛ばせます</p>';
    document.body.appendChild(el);
    sfx('deus');
    let landed = false, done = false;
    const land = () => {
      if (landed) return;
      landed = true;
      el.classList.add('landed');
      try { if (opts.onLand) opts.onLand(); } catch (e) { /* 曲や揺れが失敗しても演出は続ける */ }
    };
    const shownAt = Date.now();
    /* 出てすぐの誤タップでは飛ばさない */
    const skip = (e) => {
      if (Date.now() - shownAt < 450) return;
      if (e.type === 'keydown' && !['Enter', 'Escape', ' '].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      finish();
    };
    const tLand = setTimeout(land, quiet ? 500 : 2250);
    const tEnd = setTimeout(() => finish(), quiet ? 1700 : 4200);
    function finish() {
      if (done) return;
      done = true;
      land();
      clearTimeout(tLand); clearTimeout(tEnd);
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, 450);
    }
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', skip, true);
  });
}

/** 目の形 (SVG)。ALL-SEEING (すべてを見る者) の印 */
export function eyeSvg(cls = '') {
  return '<svg class="dx-eye ' + cls + '" viewBox="0 0 100 60" aria-hidden="true">' +
    '<path class="lid" d="M4 30 Q50 -6 96 30 Q50 66 4 30 Z"/><circle class="iris" cx="50" cy="30" r="15"/><circle class="pupil" cx="50" cy="30" r="6"/></svg>';
}

/**
 * すべてを見る者 (ALL-SEEING) の登場。暗転 → 巨大な目が開く → 走査の光が画面をなめる (手札・盤面を読まれる) →
 * 名前 → 目が光って曲 (opts.onLand)。4秒ほど。押す・キーで飛ばせる。動きを減らす設定では短く。終わったら解決する Promise
 */
export function eyeIntro(name, opts = {}) {
  const quiet = calm();
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'dxi dxe' + (quiet ? ' calm' : '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'すべてを見る者 ' + name + ' が現れた');
    el.innerHTML =
      '<i class="dxi-veil"></i>' +
      '<div class="dxe-eye">' + eyeSvg('big') + '</div>' +
      '<i class="dxe-scan"></i>' +
      '<p class="dxi-kicker">ALL YOUR CARDS ARE VISIBLE</p>' +
      '<div class="dxe-name"><small>すべてを見る者</small><b>' + esc(name) + '</b></div>' +
      '<i class="dxi-flash"></i>' +
      '<p class="dxi-skip">押すと飛ばせます</p>';
    document.body.appendChild(el);
    sfx('deus');
    let landed = false, done = false;
    const land = () => {
      if (landed) return;
      landed = true;
      el.classList.add('landed');
      try { if (opts.onLand) opts.onLand(); } catch (e) { /* 曲や揺れが失敗しても演出は続ける */ }
    };
    const shownAt = Date.now();
    const skip = (e) => {
      if (Date.now() - shownAt < 450) return;
      if (e.type === 'keydown' && !['Enter', 'Escape', ' '].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      finish();
    };
    const tLand = setTimeout(land, quiet ? 500 : 2400);
    const tEnd = setTimeout(() => finish(), quiet ? 1700 : 4200);
    function finish() {
      if (done) return;
      done = true;
      land();
      clearTimeout(tLand); clearTimeout(tEnd);
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, 450);
    }
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', skip, true);
  });
}
