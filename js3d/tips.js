/* =========================================================================
 * スマホでも説明 (title) を見られるように
 *   マウスを乗せたときだけ出る説明 (パッチの効果・地図のマス・相性表の数字・難しさの理由など) は、
 *   指では見られなかった。触れたときに小さな吹き出しで出す
 *   - 押しても何も起きない物 (表のマス・札など) は、軽く触れると出す
 *   - 押すと何かが起きる物 (ボタン) は、長押しで出す (押した動きは止める)
 *   吹き出しは勝手に消さない。ほかの場所に触れたら引っ込む
 * ========================================================================= */
const ACTIVE = 'button, a[href], input, select, textarea, summary, [role="button"]';
const HOLD_MS = 450;

let tip = null;
function show(text, x, y) {
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'tapTip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
  }
  tip.textContent = text;
  tip.classList.add('show');
  /* 指の少し上に。画面からはみ出さないように寄せる */
  const r = tip.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - r.width - 8, x - r.width / 2));
  const top = y - r.height - 18 > 8 ? y - r.height - 18 : y + 22;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}
function hide() { if (tip) tip.classList.remove('show'); }

/** 説明を持つ要素 (title か data-tip)。title はブラウザの吹き出しと二重にならないよう、ここでは読むだけ */
function tipOf(el) {
  const t = el && el.closest && el.closest('[data-tip], [title]');
  if (!t) return null;
  const text = t.getAttribute('data-tip') || t.getAttribute('title');
  return text && text.trim() ? { el: t, text: text.trim() } : null;
}

export function initTapTips() {
  if (typeof document === 'undefined') return;
  let hold = 0, held = false, startX = 0, startY = 0;
  document.addEventListener('pointerdown', (ev) => {
    if (tip && tip.classList.contains('show') && !(tip.contains(ev.target))) hide();
    if (ev.pointerType !== 'touch') return;
    const t = tipOf(ev.target);
    if (!t) return;
    startX = ev.clientX; startY = ev.clientY; held = false;
    clearTimeout(hold);
    if (t.el.matches(ACTIVE) || t.el.closest(ACTIVE)) {
      hold = setTimeout(() => { held = true; show(t.text, startX, startY); }, HOLD_MS);
    } else {
      show(t.text, ev.clientX, ev.clientY);
    }
  }, true);
  document.addEventListener('pointermove', (ev) => {
    if (hold && (Math.abs(ev.clientX - startX) > 10 || Math.abs(ev.clientY - startY) > 10)) { clearTimeout(hold); hold = 0; }
  }, true);
  document.addEventListener('pointerup', () => { clearTimeout(hold); hold = 0; }, true);
  /* 長押しで説明を出したときは、そのあとのクリック (買う・進むなど) を起こさない */
  document.addEventListener('click', (ev) => {
    if (held) { held = false; ev.preventDefault(); ev.stopPropagation(); }
  }, true);
  /* 長押しで出るブラウザのメニューも止める (説明を出すとき) */
  document.addEventListener('contextmenu', (ev) => { if (tipOf(ev.target) && ev.pointerType !== 'mouse') ev.preventDefault(); }, true);
  window.addEventListener('scroll', hide, true);
}
