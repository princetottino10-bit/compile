/* ホロカード: 指やマウスの位置でカードを傾け、光沢をその位置へ寄せる (design-lab 04)。
   要素に CSS 変数 --rx / --ry (傾き) と --mx / --my (光の中心)、--op (光沢の濃さ) を書くだけで、
   見た目は使う側の CSS が決める。触っている間は .holo-active が付く。
   ドラッグして傾けたあとの指離れでは click を起こさない (カードを押すと進む画面で、傾けただけで進まないように) */
const MAX = 14;            // 端を触ったときの傾き (度)

export function holo(el, opts) {
  if (!el || el._holo) return;
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) { /* 古いブラウザ */ }
  const max = (opts && opts.max) || MAX;
  let sx = 0, sy = 0, down = false, moved = false;
  const set = (rx, ry, mx, my, op) => {
    el.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    el.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    el.style.setProperty('--mx', mx.toFixed(1) + '%');
    el.style.setProperty('--my', my.toFixed(1) + '%');
    el.style.setProperty('--op', op);
  };
  const move = (e) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    const y = Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1);
    if (down && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 8) moved = true;
    set((.5 - y) * max * 2, (x - .5) * max * 2, x * 100, y * 100, 1);
  };
  const enter = (e) => { el.classList.add('holo-active'); move(e); };
  const leave = () => { el.classList.remove('holo-active'); set(0, 0, 50, 50, 0); };
  el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') enter(e); });
  el.addEventListener('pointerdown', (e) => {
    sx = e.clientX; sy = e.clientY; down = true; moved = false;
    if (e.pointerType !== 'mouse') { try { el.setPointerCapture(e.pointerId); } catch (_) { /* 古いブラウザ */ } }
    enter(e);
  });
  el.addEventListener('pointermove', (e) => { if (el.classList.contains('holo-active')) move(e); });
  el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') leave(); });
  el.addEventListener('pointerup', (e) => { down = false; if (e.pointerType !== 'mouse') leave(); });
  el.addEventListener('pointercancel', () => { down = false; leave(); });
  el.addEventListener('click', (e) => { if (moved) { moved = false; e.stopPropagation(); e.preventDefault(); } }, true);
  el.style.touchAction = 'none';
  el._holo = true;
  set(0, 0, 50, 50, 0);
}
