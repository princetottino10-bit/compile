/* =========================================================================
 * ガチャの演出 (勝ち抜き戦のパッチ・COSMETICS のガチャで共通)
 *   カプセルが揺れて、レア度の色で弾ける。EPIC / LEGENDARY は画面が光って紙吹雪。
 *   動きを減らす設定では出さない
 * ========================================================================= */

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

export const RAR_NAMES = { C: 'COMMON', R: 'RARE', E: 'EPIC', L: 'LEGENDARY' };
export const RAR_COLORS = {
  C: ['#cfd6e6', '#8a93a8'], R: ['#7cc4ff', '#b9e2ff', '#3f8cff'], E: ['#ffc85a', '#ff4fa3', '#fff1c2'],
  L: ['#ff4fa3', '#ffc85a', '#7cf0d0', '#9d7bff', '#ffffff']
};

/* 紙吹雪 (画面いっぱいの canvas に一瞬だけ) */
export function confetti(colors, count) {
  if (calm()) return;
  const cv = document.createElement('canvas');
  cv.className = 'rn-confetti';
  cv.width = innerWidth; cv.height = innerHeight;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const parts = Array.from({ length: count || 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * innerWidth * 0.3, y: innerHeight * 0.45,
    vx: (Math.random() - 0.5) * 16, vy: -6 - Math.random() * 12, r: 3 + Math.random() * 5,
    a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.4, c: colors[Math.floor(Math.random() * colors.length)]
  }));
  const t0 = performance.now();
  const tick = (t) => {
    const k = (t - t0) / 1800;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - k); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore();
    }
    if (k < 1) requestAnimationFrame(tick); else cv.remove();
  };
  requestAnimationFrame(tick);
}

/** カプセルを開ける演出。rar: C / R / E / L、name: 出てきたものの名前。終わったら解決 */
export function playCapsule(host, rar, name) {
  if (calm() || !RAR_NAMES[rar]) return Promise.resolve();
  const stage = document.createElement('div');
  stage.className = 'rn-stage r' + rar;
  stage.innerHTML = '<div class="rn-cap"><i></i><i></i></div><div class="rn-reveal"><small>' + RAR_NAMES[rar] + '</small><b>' + esc(name) + '</b></div>';
  (host || document.body).appendChild(stage);
  return new Promise((resolve) => {
    setTimeout(() => {
      stage.classList.add('open');
      if (rar === 'E' || rar === 'L') {
        document.body.classList.add('rn-flash-' + rar);
        setTimeout(() => document.body.classList.remove('rn-flash-' + rar), 700);
        confetti(RAR_COLORS[rar], rar === 'L' ? 260 : 140);
      }
    }, rar === 'L' ? 1500 : 950);
    setTimeout(() => { stage.remove(); resolve(); }, rar === 'L' ? 3000 : rar === 'E' ? 2300 : 1700);
  });
}
