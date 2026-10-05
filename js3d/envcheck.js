/* =========================================================================
 * 遊べる環境かどうかの下見 (3D の表示・アプリの中のブラウザ・端末)
 *   3D の土台 (WebGL) が無い端末で、真っ黒のまま止まらないように、作る前に確かめる。
 *   LINE・Instagram・Facebook・X の中で開いたブラウザは、音・ログイン・保存が欠けることが多いので、
 *   ふつうのブラウザで開き直すよう勧める
 * ========================================================================= */

/** アプリの中のブラウザなら、その名前 ('LINE' など)。ふつうのブラウザなら null */
export function inAppBrowser(ua) {
  const s = String(ua == null ? (typeof navigator !== 'undefined' ? navigator.userAgent : '') : ua);
  if (/\bLine\//.test(s)) return 'LINE';
  if (/Instagram/i.test(s)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/.test(s)) return 'Facebook';
  if (/Twitter(?:Android)?|TwitterAndroid/i.test(s)) return 'X';
  return null;
}

/** 3D の土台 (WebGL) を作れるか。作ってみてすぐ捨てる */
export function webglAvailable() {
  try {
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) return false;
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2') || cv.getContext('webgl') || cv.getContext('experimental-webgl');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch (e) {
    return false;
  }
}

/** 絵を描いている部品 (GPU) の名前。報告用 (読めなければ '?') */
export function gpuName(renderer) {
  try {
    const gl = renderer && renderer.getContext ? renderer.getContext() : null;
    if (!gl) return '?';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '?').slice(0, 120);
  } catch (e) {
    return '?';
  }
}

/** iPhone・iPad (iPad の Safari は Mac と名乗るので、触れる点の数で見分ける) */
export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
}

/** スマホ・タブレット (触って遊ぶ、画面の短い辺が小さい) */
export function isPhoneLike() {
  if (typeof window === 'undefined') return false;
  return (navigator.maxTouchPoints || 0) > 0 && Math.min(window.innerWidth, window.innerHeight) < 600;
}
