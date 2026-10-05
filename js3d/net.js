/* =========================================================================
 * つながっているか (オンライン / オフライン)
 *   ブラウザの navigator.onLine と online / offline の知らせを見る。
 *   オフラインのあいだは、タイトルの隅に「オフライン」の札を出す (CPU 戦はそのまま遊べる)。
 *   ONLINE・SIGN IN・同期は、押したときに理由を出して止める (title.js・account.js が isOnline を見る)
 * ========================================================================= */

const listeners = new Set();

/** いまネットにつながっているか (分からないときは、つながっているとみなす) */
export function isOnline() {
  try { return navigator.onLine !== false; } catch (e) { return true; }
}

/** つながり方が変わったら cb(online)。返り値を呼ぶと外れる */
export function onNetChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const OFFLINE_TEXT = 'オフラインです。インターネットにつながると使えます (CPU 戦はこのまま遊べます)';

function chip() {
  let el = document.getElementById('netChip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'netChip';
    el.setAttribute('role', 'status');
    el.title = OFFLINE_TEXT;
    el.innerHTML = '<i aria-hidden="true"></i>オフライン';
    document.body.appendChild(el);
  }
  return el;
}

function paint() {
  const on = isOnline();
  document.body.classList.toggle('offline', !on);
  chip().hidden = on;
}

let started = false;
/** 起動時に1回 (main.js)。札を用意して、変わるたびに知らせる */
export function watchNet() {
  if (started || typeof window === 'undefined') return;
  started = true;
  paint();
  const fire = () => { paint(); const on = isOnline(); for (const cb of listeners) { try { cb(on); } catch (e) { /* ほかの知らせは止めない */ } } };
  window.addEventListener('online', fire);
  window.addEventListener('offline', fire);
}
