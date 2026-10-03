/* =========================================================================
 * ゲームパッドで遊ぶ (ブラウザの Gamepad API。Xbox・プレステの「標準の並び」)
 *   ・いま指している所に枠を出す。十字キー・左スティックで、その向きにいちばん近い所へ移る
 *   ・A で「そこを触ったのと同じこと」をする (ボタンは click、盤面は同じ場所への pointerdown / pointerup)
 *     対戦の決まりや画面の流れには手を入れない (今のタップの処理をそのまま使う)
 *   ・指せる所 = 画面に見えていて、ほかの物に覆われていないボタン + main.js が渡す盤面の物 (手札・選べる札・ライン)
 *   ・マウスやタッチを使ったら枠は消える (パッドを触るとまた出る)
 * ボタン: A 決定 / B 戻る (Esc) / X リフレッシュ / Y 手札を開く・畳む / LB・RB 手札を左右に / BACK ログ / START 設定
 * ========================================================================= */

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const STICK_ON = 0.55;               // スティックを倒したとみなす量
const REPEAT_FIRST = 380;            // 押しっぱなしで次へ進むまで (ミリ秒)
const REPEAT_NEXT = 140;
const CLICKABLE = 'button, [role="button"], a[href], summary, input[type="checkbox"], input[type="radio"], select';

let canvasTargets = () => [];        // main.js が渡す: [{ key, x, y, w, h, hand? }] (画面の座標)
let canvasOpt = null;                 // 盤面の canvas (または、それを返す関数。盤面はあとから作られる)
const cv = () => (typeof canvasOpt === 'function' ? canvasOpt() : canvasOpt);
let ring = null;
let quadSvg = null;                  // 盤面のカードは斜めに写るので、四隅を結んだ形で囲む (SVG)
let active = false;                  // パッドを使っている間 (枠を出す)
let focusKey = null;
let focusPos = null;                 // 最後に指していた所 (指していた物が消えたら、ここから近い物へ)
let prevButtons = [];
let held = { dir: null, since: 0, last: 0 };
let raf = 0;

/* main.js から: 盤面の canvas と、盤面で指せる物を返す関数 */
export function initGamepad(opts) {
  canvasOpt = opts.canvas || null;
  canvasTargets = opts.targets || (() => []);
  if (!('getGamepads' in navigator)) return;
  window.addEventListener('gamepadconnected', (ev) => { markPad(ev.gamepad || pads()[0], true); start(); });
  window.addEventListener('gamepaddisconnected', () => { if (!pads().length) { stop(); markPad(null, false); } });
  /* マウス・タッチを使ったら枠を消す (パッドを触るとまた出る) */
  window.addEventListener('pointerdown', (ev) => { if (ev.isTrusted) setActive(false); }, true);
  window.addEventListener('mousemove', (ev) => { if (ev.isTrusted && (Math.abs(ev.movementX) + Math.abs(ev.movementY) > 2)) setActive(false); }, true);
  if (pads().length) { markPad(pads()[0], false); start(); }
}

/* つないでいる間は body.gamepad。画面のボタンに、対応するコントローラーのボタンの印を出す (three-play.html の body.gamepad)。
   プレステのコントローラーは ✕ ○ □ △ (body.gp-ps)、ほかは Xbox の A B X Y。つないだときに一度だけ操作の案内を出す */
function markPad(pad, announce) {
  const on = !!pad;
  /* 名前で見分ける。「Wireless Controller」は Xbox の名前にも入るので、Xbox (045e) でないときだけプレステとみなす */
  const id = (pad && pad.id) || '';
  const ps = on && !/xbox|045e/i.test(id) && /054c|playstation|dualsense|dualshock|wireless controller/i.test(id);
  document.body.classList.toggle('gamepad', on);
  document.body.classList.toggle('gp-ps', ps);
  if (on && announce) {
    const t = document.getElementById('toast');
    const a = ps ? '✕' : 'A', b = ps ? '○' : 'B';
    if (t) {
      t.textContent = 'コントローラーをつなぎました。十字キーで選んで ' + a + ' で決定、' + b + ' で戻る';
      t.classList.add('show');
      clearTimeout(markPad.timer);
      markPad.timer = setTimeout(() => t.classList.remove('show'), 4200);
    }
  }
}

function pads() {
  return [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean);
}
function start() { if (!raf) raf = requestAnimationFrame(loop); }
function stop() { cancelAnimationFrame(raf); raf = 0; setActive(false); }

function setActive(on) {
  active = on;
  if (!ring) {
    ring = document.createElement('div');
    ring.id = 'gpFocus';
    ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = '<span class="gp-cap"><i class="gp-key gp-a"></i>決定<i class="gp-key gp-b"></i>戻る</span>';
    document.body.appendChild(ring);
    quadSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    quadSvg.id = 'gpQuad';
    quadSvg.setAttribute('aria-hidden', 'true');
    quadSvg.innerHTML = '<polygon class="gp-q-back"></polygon><polygon class="gp-q-line"></polygon>';
    document.body.appendChild(quadSvg);
  }
  ring.classList.toggle('on', on);
  quadSvg.classList.toggle('on', on);
  if (!on) focusKey = null;
}

/* ---------- 指せる所 ---------- */
function visibleRect(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || +cs.opacity === 0) return null;
  /* 覆われていないか (いちばん上にある窓のボタンだけが残る) */
  const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
  const cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const top = document.elementFromPoint(cx, cy);
  if (!top || (top !== el && !el.contains(top) && !top.contains(el))) return null;
  return r;
}

function domTargets() {
  const out = [];
  for (const el of document.querySelectorAll(CLICKABLE)) {
    if (el.disabled || el.closest('[hidden], [inert]')) continue;
    if (el.id === 'gpFocus') continue;
    const r = visibleRect(el);
    if (!r) continue;
    out.push({ key: el, el, x: r.left, y: r.top, w: r.width, h: r.height });
  }
  return out;
}

function boardTargets() {
  const canvasEl = cv();
  if (!canvasEl) return [];
  let list = [];
  try { list = canvasTargets() || []; } catch (e) { list = []; }
  /* 盤面の上に窓が出ている所は指さない (覆っている物があれば、そちらのボタンを指す) */
  return list.filter(t => {
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
    const top = document.elementFromPoint(cx, cy);
    return top === canvasEl;
  });
}

function allTargets() { return domTargets().concat(boardTargets()); }

const center = (t) => ({ x: t.x + t.w / 2, y: t.y + t.h / 2 });

function current(list) {
  return list.find(t => t.key === focusKey) || null;
}

/* いちばん近い物 (向きの指定があれば、その向きにある物の中から) */
function nearest(list, from, dir) {
  let best = null, bestScore = Infinity;
  for (const t of list) {
    const c = center(t);
    const dx = c.x - from.x, dy = c.y - from.y;
    if (dir) {
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 4) continue;
      const score = along + across * 2.2;          // 横にずれた物より、まっすぐ先にある物を選ぶ
      if (score < bestScore) { bestScore = score; best = t; }
    } else {
      const d = dx * dx + dy * dy;
      if (d < bestScore) { bestScore = d; best = t; }
    }
  }
  return best;
}

function focus(t) {
  if (!t) return;
  focusKey = t.key;
  focusPos = center(t);
  draw(t);
  /* 盤面の物は、マウスを乗せたときと同じ扱い (カードの説明が出る・手札が持ち上がる) */
  if (!t.el && cv()) fire('pointermove', focusPos);
  else if (t.el && t.el.scrollIntoView) t.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function draw(t) {
  if (!ring) return;
  const pad = 4;
  ring.style.left = (t.x - pad) + 'px';
  ring.style.top = (t.y - pad) + 'px';
  ring.style.width = (t.w + pad * 2) + 'px';
  ring.style.height = (t.h + pad * 2) + 'px';
  /* 盤面の物は、四隅を結んだ形 (台形) で囲む。四角の枠は「A 決定 B 戻る」の置き場としてだけ使う */
  const q = t.quad;
  ring.classList.toggle('quad', !!q);
  quadSvg.classList.toggle('show', !!q);
  if (q) {
    const pts = q.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    for (const poly of quadSvg.querySelectorAll('polygon')) poly.setAttribute('points', pts);
  }
  /* 「A 決定 B 戻る」は枠の下に出す。画面の下端に近い物 (手札など) を指しているときは、枠の上に */
  ring.classList.toggle('cap-top', t.y + t.h + 40 > innerHeight);
}

/* 盤面の canvas へ、その場所を触ったのと同じ合図を送る */
function fire(type, p) {
  const ev = new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0 });
  const el = cv();
  if (el) el.dispatchEvent(ev);
}

function activate() {
  const list = allTargets();
  const t = current(list);
  if (!t) { focus(nearest(list, focusPos || { x: innerWidth / 2, y: innerHeight * 0.8 })); return; }
  if (t.el) { t.el.click(); return; }
  const p = center(t);
  fire('pointermove', p);
  fire('pointerdown', p);
  fire('pointerup', p);
}

function key(k) {
  const opts = { key: k, code: k, bubbles: true, cancelable: true };
  (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', opts));
  window.dispatchEvent(new KeyboardEvent('keydown', opts));
}

function clickId(id) {
  const el = document.getElementById(id);
  if (el && !el.disabled && visibleRect(el)) el.click();
}

function move(dir) {
  const list = allTargets();
  const cur = current(list);
  if (!cur) { focus(nearest(list, focusPos || { x: innerWidth / 2, y: innerHeight * 0.8 })); return; }
  const next = nearest(list.filter(t => t !== cur), center(cur), dir);
  if (next) focus(next);
}

/* 手札を左右に送る (LB / RB) */
function stepHand(delta) {
  const hand = boardTargets().filter(t => t.hand).sort((a, b) => center(a).x - center(b).x);
  if (!hand.length) return;
  const i = hand.findIndex(t => t.key === focusKey);
  const n = i < 0 ? (delta > 0 ? 0 : hand.length - 1) : Math.max(0, Math.min(hand.length - 1, i + delta));
  focus(hand[n]);
}

/* ---------- 毎フレーム: ボタンとスティックを読む ---------- */
function loop(now) {
  raf = requestAnimationFrame(loop);
  const pad = pads()[0];
  if (!pad) return;
  const b = pad.buttons.map(x => x.pressed || x.value > 0.5);
  const pressed = (i) => b[i] && !prevButtons[i];
  const any = b.some(Boolean) || Math.abs(pad.axes[0] || 0) > STICK_ON || Math.abs(pad.axes[1] || 0) > STICK_ON;
  if (any && !active) {
    setActive(true);
    const list = allTargets();
    focus(current(list) || nearest(list, focusPos || { x: innerWidth / 2, y: innerHeight * 0.8 }));
    prevButtons = b;
    return;                          // 最初のひと押しは、枠を出すだけ
  }
  if (!active) { prevButtons = b; return; }

  /* 指している物が動いた・消えたら、枠を追わせる */
  const list = allTargets();
  const cur = current(list);
  if (cur) { focusPos = center(cur); draw(cur); }
  else if (list.length) focus(nearest(list, focusPos || { x: innerWidth / 2, y: innerHeight / 2 }));

  if (pressed(BTN.A)) activate();
  if (pressed(BTN.B)) key('Escape');
  if (pressed(BTN.X)) clickId('btnRefresh');
  if (pressed(BTN.Y)) clickId('btnHand');
  if (pressed(BTN.LB)) stepHand(-1);
  if (pressed(BTN.RB)) stepHand(1);
  if (pressed(BTN.BACK)) clickId('btnLog');
  if (pressed(BTN.START)) clickId('btnSettings');

  /* 十字キー・左スティック (押しっぱなしで続けて進む) */
  const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  const dir = b[BTN.UP] || ay < -STICK_ON ? 'up' : b[BTN.DOWN] || ay > STICK_ON ? 'down'
    : b[BTN.LEFT] || ax < -STICK_ON ? 'left' : b[BTN.RIGHT] || ax > STICK_ON ? 'right' : null;
  if (dir !== held.dir) {
    held = { dir, since: now, last: now };
    if (dir) move(dir);
  } else if (dir && now - held.since > REPEAT_FIRST && now - held.last > REPEAT_NEXT) {
    held.last = now;
    move(dir);
  }
  prevButtons = b;
}
