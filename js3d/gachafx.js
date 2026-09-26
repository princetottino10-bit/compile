/* =========================================================================
 * ガチャの演出 (勝ち抜き戦のパッチ・COSMETICS のガチャで共通)
 *   カプセルが揺れて、レア度の色で弾ける。EPIC / LEGENDARY は画面が光って紙吹雪。
 *   動きを減らす設定では、揺れや紙吹雪を出さずに光って切り替わるだけ
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

/** カプセルを開ける演出。rar: C / R / E / L、name: 出てきたものの名前。終わったら解決。
 *  白いカプセルが落ちてきて 3 回揺れる (だんだん強く)。2 回目から継ぎ目がレア度の色で光り、
 *  開くと後ろで光の筋が回って名前が出る。画面を押すと飛ばせる。
 *  動きを減らす設定では揺らさず、光ってから切り替わるだけ (演出そのものは消さない) */
export function playCapsule(host, rar, name) {
  if (!RAR_NAMES[rar]) return Promise.resolve();
  const still = calm();
  const stage = document.createElement('div');
  stage.className = 'rn-stage r' + rar + (still ? ' still' : '');
  stage.innerHTML = '<div class="rn-rays"></div><div class="rn-cap"><i></i><i></i><b class="rn-seam"></b></div>' +
    '<div class="rn-reveal"><small>' + RAR_NAMES[rar] + '</small><b>' + esc(name) + '</b></div><p class="rn-skip">画面を押すと飛ばせます</p>';
  (host || document.body).appendChild(stage);
  /* 揺れ 3 回と開く時刻 (ms)。LEGENDARY は長めにためる */
  const T = still ? { s: [], open: 700, end: 1700 }
    : rar === 'L' ? { s: [450, 950, 1450], open: 2200, end: 4200 }
      : rar === 'E' ? { s: [450, 900, 1350], open: 1850, end: 3400 }
        : { s: [450, 850, 1250], open: 1600, end: 2700 };
  return new Promise((resolve) => {
    const timers = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      stage.classList.add('out');
      setTimeout(() => { stage.remove(); resolve(); }, 200);
    };
    const open = () => {
      stage.classList.add('open');
      if (rar === 'E' || rar === 'L') {
        document.body.classList.add('rn-flash-' + rar);
        setTimeout(() => document.body.classList.remove('rn-flash-' + rar), 700);
        confetti(RAR_COLORS[rar], rar === 'L' ? 260 : 140);
      }
    };
    T.s.forEach((t, k) => timers.push(setTimeout(() => { stage.classList.remove('s1', 's2', 's3'); stage.classList.add('s' + (k + 1)); }, t)));
    timers.push(setTimeout(open, T.open));
    timers.push(setTimeout(finish, T.end));
    /* 押したら: 開く前なら開いたところへ、開いたあとなら終わる */
    stage.addEventListener('click', () => {
      if (!stage.classList.contains('open')) { timers.forEach(clearTimeout); open(); timers.push(setTimeout(finish, 900)); } else finish();
    });
  });
}
