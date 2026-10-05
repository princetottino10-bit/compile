/* =========================================================================
 * 数字と並びの小さな動き (docs/design-resources.md の Kinetics・Magic UI 系を素の JS で)
 *   countUp: 数字を前の値から新しい値まで数え上げる (経験値・CHIP)
 *   dealIn:  並んだものを1つずつ、配るように出す (対戦のあとの「手に入ったもの」)
 *   どちらも動きを減らす設定では、すぐ最後の形にする。待ち時間は足さない (呼んだ側は待たなくてよい)
 * ========================================================================= */
/* 動きを減らすか (設定の「動きを減らす」→ 端末の設定。prefs.js) */
import { calm } from './prefs.js';

/** el の数字を from から to へ数え上げる。fmt で表示を整える (既定は '+' を付けない整数) */
export function countUp(el, from, to, opts) {
  const o = Object.assign({ ms: 900, delay: 0, fmt: (n) => String(n) }, opts);
  if (!el) return;
  if (calm() || from === to) { el.textContent = o.fmt(to); return; }
  el.textContent = o.fmt(from);
  const start = performance.now() + o.delay;
  const tick = (now) => {
    if (!el.isConnected) return;
    const t = Math.min(1, Math.max(0, (now - start) / o.ms));
    const e = 1 - Math.pow(1 - t, 3);                     // 終わりにかけてゆっくり
    el.textContent = o.fmt(Math.round(from + (to - from) * e));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** items を1つずつ、下から少し傾いて配られるように出す。返り値: 最後の1つが出終わるまでの ms */
export function dealIn(items, opts) {
  const o = Object.assign({ stagger: 140, delay: 0, ms: 420 }, opts);
  const list = Array.from(items || []);
  if (calm() || !list.length || !list[0].animate) return 0;
  list.forEach((el, i) => {
    el.animate([
      { opacity: 0, transform: 'translateY(14px) rotate(-3deg) scale(.94)' },
      { opacity: 1, offset: 0.6 },
      { opacity: 1, transform: 'none' }
    ], { duration: o.ms, delay: o.delay + i * o.stagger, easing: 'cubic-bezier(.2,.9,.25,1.15)', fill: 'backwards' });
  });
  return o.delay + (list.length - 1) * o.stagger + o.ms;
}
