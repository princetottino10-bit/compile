/* =========================================================================
 * 3Dビュー: 最小トゥイーンランタイム
 *   毎フレーム update(dtMs) を呼ぶ。各 tween は Promise を返す。
 * ========================================================================= */

const active = new Set();

export const Ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: t => (--t) * t * t + 1,
  inCubic: t => t * t * t,
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  outQuart: t => 1 - (--t) * t * t * t,
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  /* 着地の「ドン」を出す: 一度行き過ぎて戻る */
  outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  /* 弾む: 着地の沈み込み用 */
  outBounceSoft: t => {
    const p = 1 - Math.pow(1 - t, 2.2);
    return p + Math.sin(t * Math.PI) * 0.055 * (1 - t);
  }
};

/* 経過に応じて onUpdate(progress0to1) を呼ぶ */
export function tween(ms, onUpdate, ease, onDone) {
  const fn = ease || Ease.inOutCubic;
  return new Promise((resolve) => {
    const t = {
      elapsed: 0,
      ms: Math.max(1, ms),
      step(dt) {
        t.elapsed += dt;
        const raw = Math.min(1, t.elapsed / t.ms);
        onUpdate(fn(raw), raw);
        if (raw >= 1) {
          active.delete(t);
          if (onDone) onDone();
          resolve();
        }
      }
    };
    active.add(t);
  });
}

/* 進行待ち: 描画フレームに依存させない (タブが裏でも進行が固まらない) */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function update(dtMs) {
  if (!active.size) return;
  for (const t of Array.from(active)) t.step(dtMs);
}

export function activeCount() { return active.size; }

export function cancelAll() {
  active.clear();
}

/* ---------- 補間ヘルパ ---------- */
export function lerp(a, b, t) { return a + (b - a) * t; }

export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/* 2点間を、上に膨らむ弧で結ぶ (着地演出の軌道) */
export function arcPoint(out, from, to, t, height) {
  out.x = lerp(from.x, to.x, t);
  out.z = lerp(from.z, to.z, t);
  out.y = lerp(from.y, to.y, t) + Math.sin(Math.PI * t) * height;
  return out;
}
