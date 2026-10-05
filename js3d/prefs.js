/* =========================================================================
 * 「動きを減らす」と「振動」の設定を、演出のどこからでも見られるようにする小さな窓口
 *   設定 (settings.js) を読み込むと画面の部品まで連れてくるので、演出のモジュール (feel.js・motion.js など) は
 *   ここだけを見る。settings.js が変わるたびに setMotionPrefs で知らせる。
 *   motion: 'auto' (端末の「視差効果を減らす」に合わせる) / 'less' (減らす) / 'full' (減らさない)
 * ========================================================================= */

let pref = { motion: 'auto', vibrate: true };
try {
  const s = JSON.parse(localStorage.getItem('compileSettings') || '{}') || {};
  pref = { motion: ['less', 'full'].includes(s.motion) ? s.motion : 'auto', vibrate: s.vibrate !== false };
} catch (e) { /* 読めなければ既定のまま */ }

/** settings.js から: 設定が変わったら */
export function setMotionPrefs(s) {
  pref = { motion: ['less', 'full'].includes(s.motion) ? s.motion : 'auto', vibrate: s.vibrate !== false };
  try { document.body.classList.toggle('calm', pref.motion === 'less'); } catch (e) { /* 画面がまだ無い */ }
}

/** 端末が「動きを減らす」にしているか */
export function osReducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

/** 動きを減らすか (設定 → 端末の設定の順に見る) */
export function calm() {
  if (pref.motion === 'less') return true;
  if (pref.motion === 'full') return false;
  return osReducedMotion();
}

/** 振動してよいか */
export function vibrationOn() { return pref.vibrate; }
