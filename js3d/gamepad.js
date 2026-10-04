/* =========================================================================
 * ゲームパッドで遊ぶ (ブラウザの Gamepad API。Xbox・プレステの「標準の並び」)
 *   ・いま指している所に枠を出す。十字キー・左スティックで、その向きにいちばん近い所へ移る
 *   ・A で「そこを触ったのと同じこと」をする (ボタンは click、盤面は同じ場所への pointerdown / pointerup)
 *     対戦の決まりや画面の流れには手を入れない (今のタップの処理をそのまま使う)
 *   ・指せる所 = 画面に見えていて、ほかの物に覆われていないボタン + main.js が渡す盤面の物 (手札・選べる札・ライン)
 *   ・マウスやタッチを使ったら枠は消える (パッドを触るとまた出る)
 * 設定の「ゲームパッドで遊ぶ」をオンにしたときだけ動く (最初はオフ。ハンドルなどをつないでいる人が勝手に動かないように)。
 * ボタン: A 決定 / B 戻る (Esc) / X リフレッシュ / Y 手札を開く・畳む / LB・RB 手札を左右に / BACK ログ / START 設定
 * 物語の歩く画面 (story-world.js): 左スティック・十字キーで歩く (矢印キーと同じ)、A で話す・調べる (E と同じ)。
 *   会話が出ている間は A で次のセリフへ (Enter と同じ)。上に窓が出ているときは、ふつうに枠でボタンを選ぶ
 * ========================================================================= */

import { settings, onSettings, openSettings } from './settings.js';

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const STICK_ON = 0.55;               // スティックを倒したとみなす量
const REPEAT_FIRST = 380;            // 押しっぱなしで次へ進むまで (ミリ秒)
const REPEAT_NEXT = 140;
const CLICKABLE = 'button, [role="button"], a[href], summary, input[type="checkbox"], input[type="radio"], input[type="range"], select, ' +
  'figure[data-z], i[data-info], input[type="text"], input[type="email"], input[type="password"], input:not([type]), textarea';
const TEXT_INPUT = 'input[type="text"], input[type="email"], input[type="password"], input:not([type]), textarea';
/* 見た目はボタンでも押しても何も起きない物 (RUN の地図で、まだ行けない所) */
const DEAD = 'button.rn-node:not([data-node])';

let canvasTargets = () => [];
let openHand = null;                 // main.js が渡す: 畳んである手札を開く (開いたら true)        // main.js が渡す: [{ key, x, y, w, h, hand? }] (画面の座標)
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
  openHand = opts.openHand || null;
  if (!('getGamepads' in navigator)) return;
  window.addEventListener('gamepadconnected', () => { if (!enabled()) return; markPad(pickPad(), true); start(); });
  window.addEventListener('gamepaddisconnected', () => { if (!pickPad()) { stop(); markPad(null, false); } });
  /* 設定でオン・オフしたとき */
  onSettings(() => {
    if (enabled()) { const p = pickPad(); if (p) { markPad(p, false); start(); } }
    else { stop(); markPad(null, false); }
  });
  /* 画面の裏に回った・ほかの窓へ移ったら、押しているつもりの矢印キーを離す (歩き続けないように) */
  window.addEventListener('blur', () => releaseWalk());
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseWalk(); });
  /* マウス・タッチを使ったら枠を消す (パッドを触るとまた出る) */
  window.addEventListener('pointerdown', (ev) => { if (ev.isTrusted) setActive(false); }, true);
  window.addEventListener('mousemove', (ev) => { if (ev.isTrusted && (Math.abs(ev.movementX) + Math.abs(ev.movementY) > 2)) setActive(false); }, true);
  if (enabled() && pickPad()) { markPad(pickPad(), false); start(); }
}

const enabled = () => !!settings().gamepad;

/* 点検用 (確かめの台本から): 指せる物の一覧と、それぞれから上下左右へ進んだ先 */
window.__gpMap = () => {
  const list = allTargets();
  const name = (t) => (t.el ? (t.el.id || (t.el.textContent || '').trim().slice(0, 14) || t.el.className) : t.key) + (t.hand ? '[手札]' : '');
  return list.map(t => {
    const c = center(t), o = { name: name(t), at: [Math.round(c.x), Math.round(c.y)], hit: t.hit ? [Math.round(t.hit.x), Math.round(t.hit.y)] : null };
    for (const d of ['up', 'down', 'left', 'right']) { const n = t.hand ? fromHand(list, t, d) : nearest(list.filter(x => x !== t), c, d, t); o[d] = n ? name(n) : null; }
    return o;
  });
};

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
/* 使う機器: ボタンの並びが標準 (standard) のものだけ。いちばん最近さわったもの。
   ハンドルやペダルは並びが標準でないことが多く、休んでいる位置の軸が端 (±1) のこともあるので読まない */
function pickPad() {
  return pads().filter(p => p.mapping === 'standard').sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0] || null;
}
function start() { if (!raf) raf = requestAnimationFrame(loop); }
function stop() { cancelAnimationFrame(raf); raf = 0; setActive(false); releaseWalk(); }

function setActive(on) {
  active = on;
  if (!ring) {
    ring = document.createElement('div');
    ring.id = 'gpFocus';
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring);
    quadSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    quadSvg.id = 'gpQuad';
    quadSvg.setAttribute('aria-hidden', 'true');
    quadSvg.innerHTML = '<polygon class="gp-q-back"></polygon><polygon class="gp-q-line"></polygon>';
    document.body.appendChild(quadSvg);
  }
  if (!document.getElementById('gpStyle')) {
    const css = document.createElement('style');
    css.id = 'gpStyle';
    css.textContent = CONFIRM_IDS.map(id => 'body.gamepad #' + id + '::before').join(',') +
      '{content:var(--gp-x);display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;margin-right:6px;' +
      'vertical-align:-3px;font:900 10.5px/1 "M PLUS 1",system-ui;color:#fff;background:var(--gp-x-c);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);}';
    document.head.appendChild(css);
  }
  ring.classList.toggle('on', on);
  quadSvg.classList.toggle('on', on);
  if (!on) { focusKey = null; releaseWalk(); }
}

/* ---------- 指せる所 ---------- */
function visibleRect(el, owner) {
  const cs = getComputedStyle(el);
  /* ボタン自体は押せず、中の文字だけ押せる作り (窓の下の「閉じる」.pz-x) は、中の文字の所を使う */
  if (cs.pointerEvents === 'none') {
    const inner = [...el.children].find(c => getComputedStyle(c).pointerEvents !== 'none');
    return inner ? visibleRect(inner, el) : null;
  }
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
  if (cs.visibility === 'hidden' || +cs.opacity === 0) return null;
  /* 覆われていないか (いちばん上にある窓のボタンだけが残る) */
  const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
  const cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const top = document.elementFromPoint(cx, cy);
  const o = owner || el;
  if (!top || (top !== el && !el.contains(top) && !top.contains(el) && !o.contains(top))) return null;
  return r;
}

/* 画面のボタンの呼び名: 描き直されても同じボタンなら同じ名前 (窓を閉じたあと、前のボタンへ戻れるように) */
function domKey(el) {
  if (el.id) return '#' + el.id;
  const same = el.parentElement ? [...el.parentElement.children].filter(c => c.tagName === el.tagName).indexOf(el) : 0;
  const cls = String(el.className || '').split(/\s+/).filter(c => !/^(on|active|sel|selected|is-active|ready|focused|cur|hover)$/.test(c)).join('.');
  return el.tagName + '.' + cls + ':' + (el.textContent || '').trim().slice(0, 24) + ':' + same;
}

function domTargets() {
  const out = [];
  for (const el of document.querySelectorAll(CLICKABLE)) {
    if (el.disabled || el.closest('[hidden], [inert]')) continue;
    if (el.id === 'gpFocus' || el.classList.contains('rb-peek') || el.matches(DEAD)) continue;
    const r = visibleRect(el);
    if (!r) continue;
    out.push({ key: domKey(el), el, x: r.left, y: r.top, w: r.width, h: r.height });
  }
  return out;
}

function boardTargets() {
  const canvasEl = cv();
  if (!canvasEl) return [];
  let list = [];
  try { list = canvasTargets() || []; } catch (e) { list = []; }
  /* 盤面の上に窓が出ている所は指さない (覆っている物があれば、そちらのボタンを指す)。
     手札は下が画面からはみ出し、名札やボタンが一部に重なるので、画面に見えている部分の数か所を調べて、盤面が見えている点を押す所にする */
  const out = [];
  for (const t of list) {
    if (t.hit) {
      if (document.elementFromPoint(t.hit.x, t.hit.y) === canvasEl) out.push(t);
      continue;
    }
    const x0 = Math.max(0, t.x), y0 = Math.max(0, t.y);
    const x1 = Math.min(innerWidth - 1, t.x + t.w), y1 = Math.min(innerHeight - 1, t.y + t.h);
    if (x1 - x0 < 8 || y1 - y0 < 8) continue;
    const pts = [[0.5, 0.5], [0.5, 0.25], [0.3, 0.3], [0.7, 0.3], [0.5, 0.75]];
    for (const [fx, fy] of pts) {
      const px = x0 + (x1 - x0) * fx, py = y0 + (y1 - y0) * fy;
      if (document.elementFromPoint(px, py) === canvasEl) { out.push({ ...t, hit: { x: px, y: py } }); break; }
    }
  }
  return out;
}

function allTargets() {
  const scope = placeScope();
  if (scope) return domTargets().filter(t => scope.contains(t.el) && /place-face(up|down)/.test(t.el.className));
  return domTargets().concat(boardTargets());
}

/* 手札のカードを選んだあと、置く場所 (ラインごとの「表」「裏」のボタン) が出ている間 */
function placeScope() {
  const root = document.getElementById('playChoices');
  if (!root || root.hidden || !root.querySelector('.place-faceup, .place-facedown')) return null;
  return getComputedStyle(root).display === 'none' ? null : root;
}
/* 置く場所を選びはじめたら「表」へ (無ければ真ん中に近い「裏」)。やめたら、選ぶ前に指していた手札へ戻る */
let placing = false;
let keyBeforePlace = null;
function followPlaceScope(list) {
  const scope = placeScope();
  if (scope && !placing) {
    placing = true;
    keyBeforePlace = focusKey;
    const up = list.find(t => t.el.classList.contains('place-faceup'));
    focus(up || nearest(list, { x: innerWidth / 2, y: innerHeight / 2 }));
    return true;
  }
  if (!scope && placing) {
    placing = false;
    focusKey = keyBeforePlace;
    const back = current(list);
    const hand = list.filter(t => t.hand);
    focus(back || (hand.length ? nearest(hand, focusPos || { x: innerWidth / 2, y: innerHeight }) : null));
    return !!(back || hand.length);
  }
  return false;
}

const center = (t) => ({ x: t.x + t.w / 2, y: t.y + t.h / 2 });

/* 枠を新しく出すときの行き先: 前にいた所の近く。はじめては手札 (対戦ではまず手札を見る) */
function startTarget(list) {
  /* さっきまで指していた物がまた見えていれば、そこへ戻る (窓を閉じたら、開く前のボタンへ) */
  for (let i = recent.length - 1; i >= 0; i--) { const t = list.find(x => x.key === recent[i]); if (t) return t; }
  if (focusPos) return nearest(list, focusPos);
  const hand = list.filter(t => t.hand);
  return nearest(hand.length ? hand : list, { x: innerWidth / 2, y: innerHeight * 0.8 });
}

/* 新しく窓が開いたら、その窓の主なボタンへ枠を移す (前は窓の外の、前に指していた所に残っていた) */
let seenEls = new WeakSet();
const NOT_WINDOW = '.pick-ribbon, #playChoices, #pickBar';
function followNewWindow(list) {
  const fresh = list.filter(t => t.el && !seenEls.has(t.el));
  seenEls = new WeakSet(list.filter(t => t.el).map(t => t.el));
  if (!fresh.length) return false;
  const box = fresh[0].el.closest('[role="dialog"], dialog, .show, .tt-morepop');
  if (!box || box.closest(NOT_WINDOW)) return false;
  const cur = current(list);
  if (cur && cur.el && box.contains(cur.el)) return false;
  const inBox = list.filter(t => t.el && box.contains(t.el));
  /* 前に来たことのある画面へ戻った (窓を閉じた) なら、そのとき指していたボタンへ */
  let first = null;
  for (let i = recent.length - 1; i >= 0 && !first; i--) first = inBox.find(t => t.key === recent[i]) || null;
  first = first || primaryOf(inBox);
  if (first) focus(first);
  return !!first;
}
/* 窓の中の主なボタン: 目立たせてあるもの、無ければ最初のもの (閉じる×は除く) */
const PRIMARY = ['[autofocus]', '.tt-first .go', '.tt-main [data-mode="single"]', '#setupStart:not([disabled])', '.op-quick', '.op-card.last',
  '.rn-node.reach', '.rn-go', '.sm-go', '.ts-daily:not(.done)', '#roomQuick', '.cm-item.cur', '#endAgain', '#pkYes', '.ga-pull',
  '#tuPlay', '#pzAgain', '.pz-main', '.ok', '.primary', '.ready', '[data-primary]'];
function primaryOf(list) {
  for (const sel of PRIMARY) { const t = list.find(x => x.el.matches(sel)); if (t) return t; }
  return list.find(t => !/close|(^|[\s-])x($|[\s-])/i.test(t.el.className) && !/^[×✕✖]$/.test((t.el.textContent || '').trim())) || list[0] || null;
}

/* 右スティック: 指している物の入っている一覧 (無ければ画面) をスクロール */
function scrollByStick(pad) {
  const y = pad.axes[3] || 0, x = pad.axes[2] || 0;
  if (Math.abs(y) < 0.3 && Math.abs(x) < 0.3) return;
  const dx = Math.abs(x) >= 0.3 ? x * 22 : 0, dy = Math.abs(y) >= 0.3 ? y * 22 : 0;
  const frame = document.querySelector('#cardListOv.show iframe');
  if (frame && frame.contentWindow) { try { frame.contentWindow.scrollBy(dx, dy); return; } catch (e) { /* 別の場所のページは動かせない */ } }
  const cur = current(allTargets());
  const scroller = (start) => {
    for (let p = start; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if ((/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) || (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 2)) return p;
    }
    return null;
  };
  const box = (cur && cur.el && scroller(cur.el.parentElement)) || scroller(document.elementFromPoint(innerWidth / 2, innerHeight / 2));
  (box || document.scrollingElement).scrollBy(dx, dy);
}

/* 選んでいる最中の「決定」(何枚か選ぶ・選んだ1枚・並べ替えの確定)。X で押せる */
const CONFIRM_IDS = ['pkGo', 'pickGo', 'arrGo'];
function confirmButton() {
  for (const id of CONFIRM_IDS) {
    const el = document.getElementById(id);
    if (el && !el.disabled && visibleRect(el)) return el;
  }
  return null;
}

function current(list) {
  return list.find(t => t.key === focusKey) || null;
}

/* いちばん近い物 (向きの指定があれば、その向きにある物の中から) */
function nearest(list, from, dir, fromT) {
  /* 向きの指定があるときは、まず押した向きの扇の中 (横のずれが進む距離の1.5倍まで) から選ぶ。
     無いときだけ広げる (前は右を押して斜め下の物へ行くことがあった) */
  if (dir) return nearestIn(list, from, dir, 1.5, fromT) || (fromT && fromT.el ? null : nearestIn(list, from, dir, Infinity, fromT));
  return nearestIn(list, from, null, Infinity);
}
/* 2つの区間のすき間 (重なっていれば 0) */
const gap = (a0, a1, b0, b1) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
function nearestIn(list, from, dir, cone, fromT) {
  let best = null, bestScore = Infinity;
  for (const t of list) {
    const c = center(t);
    const dx = c.x - from.x, dy = c.y - from.y;
    if (dir) {
      const cAlong = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      if (cAlong <= 4) continue;
      /* 今いる物の枠があれば、真ん中どうしではなく端どうしで比べる。
         横に長いボタン (タイトルの SINGLE GAME など) の真ん中は遠くにあり、下へ押すと下の段を飛ばしていた */
      let along, across, off;
      if (fromT) {
        const horiz = dir === 'left' || dir === 'right';
        along = horiz ? (dir === 'right' ? t.x - (fromT.x + fromT.w) : fromT.x - (t.x + t.w))
          : (dir === 'down' ? t.y - (fromT.y + fromT.h) : fromT.y - (t.y + t.h));
        along = Math.max(0, along);
        across = horiz ? gap(t.y, t.y + t.h, fromT.y, fromT.y + fromT.h) : gap(t.x, t.x + t.w, fromT.x, fromT.x + fromT.w);
        off = horiz ? Math.abs(dy) : Math.abs(dx);
        if (across > (along + 24) * cone) continue;
        /* 画面のボタンどうし: 押した向きの端より先にある物だけ。左右は同じ段 (高さが重なる・近い) の物だけ、
           上下も大きく横にずれた物へは行かない (右で右下の「不具合・要望」へ飛んでいた) */
        if (fromT.el && t.el) {
          const beyond = dir === 'left' ? c.x <= fromT.x + 2 : dir === 'right' ? c.x >= fromT.x + fromT.w - 2
            : dir === 'up' ? c.y <= fromT.y + 2 : c.y >= fromT.y + fromT.h - 2;
          if (!beyond) continue;
          if (horiz && across > Math.max(t.h, fromT.h) * 0.3) continue;
          if (!horiz && across > Math.max(t.w, fromT.w) * 1.5) continue;
        }
      } else {
        along = cAlong;
        across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
        off = 0;
        if (across > along * cone) continue;
      }
      const score = along + across * 2.2 + off * 0.08;   // 横にずれた物より、まっすぐ先にある物を選ぶ
      if (score < bestScore) { bestScore = score; best = t; }
    } else {
      const d = dx * dx + dy * dy;
      if (d < bestScore) { bestScore = d; best = t; }
    }
  }
  return best;
}

const recent = [];                  // 最近指した物 (新しい順に後ろ)。窓を閉じたときの戻り先
function focus(t) {
  if (!t) return;
  const i = recent.indexOf(t.key);
  if (i >= 0) recent.splice(i, 1);
  recent.push(t.key);
  if (recent.length > 40) recent.shift();
  focusKey = t.key;
  focusPos = center(t);
  draw(t);
  /* 盤面の物は、マウスを乗せたときと同じ扱い (カードの説明が出る・手札が持ち上がる) */
  if (!t.el && cv()) fire('pointermove', t.hit || focusPos);
  else if (t.el) {
    if (t.el.scrollIntoView) t.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    /* フォーカスを移すと、選んだときに説明が出る一覧 (対象を選ぶ窓) も動く。文字の欄は A で入るまで移さない */
    const a = document.activeElement;
    if (!t.el.matches(TEXT_INPUT) && !(a && a.matches && a.matches(TEXT_INPUT))) t.el.focus({ preventScroll: true });
  }
}

function draw(t) {
  if (!ring) return;
  const pad = 4;
  ring.style.left = (t.x - pad) + 'px';
  ring.style.top = (t.y - pad) + 'px';
  ring.style.width = (t.w + pad * 2) + 'px';
  ring.style.height = (t.h + pad * 2) + 'px';
  /* 盤面の物は、四隅を結んだ形 (台形) で囲む */
  const q = t.quad;
  ring.classList.toggle('quad', !!q);
  quadSvg.classList.toggle('show', !!q);
  if (q) {
    const pts = q.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    for (const poly of quadSvg.querySelectorAll('polygon')) poly.setAttribute('points', pts);
  }
}

/* 盤面の canvas へ、その場所を触ったのと同じ合図を送る */
function fire(type, p) {
  const ev = new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0 });
  const el = cv();
  if (el) el.dispatchEvent(ev);
}

/* 画面の真ん中にある物を押す。ボタンのない全画面の表示 (制覇の演出・カードの拡大・ガチャの結果など) は、触ると閉じる作り */
function tapCenter() {
  const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  if (el && el !== cv()) el.click();
}
/* ボタンのない、触ると閉じる全画面の表示 (B でも閉じる) */
const TAP_CLOSE = ['.rn-stage', '#revealOv.show', '#zoomOv.show', '#levelUp.show', '.ga-reveal'];
function tapCloseOpen() {
  for (const sel of TAP_CLOSE) {
    const el = [...document.querySelectorAll(sel)].pop();
    if (el && getComputedStyle(el).display !== 'none') return el;
  }
  return null;
}

function activate() {
  const list = allTargets();
  if (!list.length) { tapCenter(); return; }
  const t = current(list);
  if (!t) { focus(startTarget(list)); return; }
  if (t.el && t.el.matches(TEXT_INPUT)) { t.el.focus(); if (t.el.select) t.el.select(); return; }
  if (t.el) { t.el.click(); return; }
  const p = t.hit || center(t);
  fire('pointermove', p);
  fire('pointerdown', p);
  fire('pointerup', p);
}

/* キーを1回押したことにする。フォーカスのある物に送れば window まで上がって届くので、送るのは1か所だけ
   (前は両方に送っていて、1回の押下が2回に数えられ、会話が1行飛ぶ・戻るが2回効くことがあった) */
function key(k) {
  const opts = { key: k, code: k, bubbles: true, cancelable: true };
  const el = document.activeElement;
  if (el && el !== document.body && el !== document.documentElement) el.dispatchEvent(new KeyboardEvent('keydown', opts));
  else document.dispatchEvent(new KeyboardEvent('keydown', opts));
}

/* B: ひとつ戻る。いちばん上の物から順に: 触ると閉じる表示 → 置く場所選びをやめる → 文字の欄から出る → MORE を閉じる →
   その画面の「戻る」「閉じる」 → タイトルから入った画面ならタイトルへ → Esc。
   その画面の戻るは、上に窓が重なっていない (見えている) ものだけ。「やめる」で中身が消えるもの (続きから遊ぶかの確認) は押さない */
const BACK_SEL = ['.cl-x', '.cm-x', '.pc-x', '.cn-close', '.pz-x', '#storyConfirm .sm-back', '.sm-confirm [data-v=""]',
  '#loginHint [data-h="close"]', '#pzLook', '#setupBack', '#roomBack', '#runOv [data-act="quitNo"]', '#runOv [data-act^="un"]', '#runOv [data-act="hub"]', '#runBack', '#endFloatBack'];
function goBack() {
  const ov = tapCloseOpen();
  if (ov) { ov.click(); return; }                    // 公開された札の一覧・拡大・演出は、触ると閉じる
  const scope = placeScope();
  const cancel = scope && scope.querySelector('.placement-cancel');
  if (cancel) { cancel.click(); return; }           // 置く場所を選んでいる間: カードを選ぶ前に戻る
  const a = document.activeElement;
  if (a && a.matches && a.matches(TEXT_INPUT)) { a.blur(); return; }
  const more = document.querySelector('.tt-morepop:not([hidden])');
  const moreBtn = document.querySelector('.tt-morebtn');
  if (more && moreBtn) { moreBtn.click(); return; }
  for (const sel of BACK_SEL) {
    const el = [...document.querySelectorAll(sel)].reverse().find(x => !x.disabled && visibleRect(x));
    if (el) { el.click(); return; }
  }
  if (titleBackShown()) { document.getElementById('titleBack').click(); return; }   // タイトルから入った画面: タイトルへ
  key('Escape');
}

/* 右上の「← タイトル」が出ていて、上に窓が重なっていない (窓が出ていれば B はその窓を閉じる) */
function titleBackShown() {
  const el = document.getElementById('titleBack');
  return !!(el && !el.hidden && visibleRect(el));
}
/* START: 設定。対戦中は画面の設定ボタン、タイトルなどでは設定を直接開く (前はタイトルで何も起きなかった) */
function openOptions() {
  const btn = document.getElementById('btnSettings');
  if (btn && !btn.disabled && visibleRect(btn)) btn.click();
  else openSettings();
}

function clickIfShown(id) {
  const el = document.getElementById(id);
  if (!el || el.disabled || !visibleRect(el)) return false;
  el.click();
  return true;
}

function clickId(id) {
  const el = document.getElementById(id);
  if (el && !el.disabled && visibleRect(el)) el.click();
}

function move(dir) {
  const list = allTargets();
  const cur = current(list);
  if (!cur) { focus(startTarget(list)); return; }
  if (cur.el && adjustValue(cur.el, dir)) return;
  const next = cur.hand ? fromHand(list, cur, dir) : nearest(list.filter(t => t !== cur), center(cur), dir, cur);
  /* 長い一覧の中: 次の物が一覧の外なら、先に一覧をめくる (画面の外にある項目へ行けなかった) */
  const sc = cur.el && (dir === 'up' || dir === 'down') ? scrollParent(cur.el, dir) : null;
  if (sc && (!next || !next.el || !sc.contains(next.el))) {
    sc.scrollBy({ top: (dir === 'down' ? 1 : -1) * Math.max(80, sc.clientHeight * 0.6), behavior: 'instant' });
    const inside = allTargets().filter(t => t.el && t.el !== cur.el && sc.contains(t.el));
    const n2 = nearest(inside, center(cur), dir, cur);
    if (n2) focus(n2); else draw(cur);
    return;
  }
  if (next) focus(next);
  else if (dir === 'down') showHandThen(() => {
    const hand = boardTargets().filter(t => t.hand);
    if (hand.length) focus(nearest(hand, center(cur)));
  });
}

/* 手札からの行き先。手札は弧を描いて並び、選んだカードは持ち上がるので、高さで比べると手札の中を上下に迷う。
   左右は並び順で隣のカード (端からは手札の外へ)、上下は手札の外へ出る */
function fromHand(list, cur, dir) {
  const hand = list.filter(t => t.hand).sort((a, b) => center(a).x - center(b).x);
  const others = list.filter(t => !t.hand);
  if (dir === 'left' || dir === 'right') {
    const i = hand.findIndex(t => t.key === cur.key);
    const n = hand[i + (dir === 'right' ? 1 : -1)];
    if (n) return n;
  }
  /* 下は手札の下の物だけ (扇の外の REFRESH などへ横に飛ばない) */
  if (dir === 'down') return nearestIn(others, center(cur), dir, 1.5, cur);
  return nearest(others, center(cur), dir, cur);
}

/* つまみ (音量など) は左右で値を変える。選択肢 (select) は左右で前後の項目へ */
function adjustValue(el, dir) {
  if (dir !== 'left' && dir !== 'right') return false;
  const d = dir === 'right' ? 1 : -1;
  if (el.matches('input[type="range"]')) {
    const step = parseFloat(el.step) || 1, min = parseFloat(el.min) || 0, max = el.max === '' ? 100 : parseFloat(el.max);
    const big = Math.max(step, (max - min) / 20);
    el.value = String(Math.min(max, Math.max(min, parseFloat(el.value) + d * big)));
  } else if (el.tagName === 'SELECT') {
    const i = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + d));
    if (i === el.selectedIndex) return true;
    el.selectedIndex = i;
  } else return false;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
/* その向きにまだめくれる、いちばん近い一覧 (縦にスクロールする入れ物) */
function scrollParent(el, dir) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy !== 'auto' && oy !== 'scroll') || p.scrollHeight <= p.clientHeight + 2) continue;
    const can = dir === 'down' ? p.scrollTop + p.clientHeight < p.scrollHeight - 2 : p.scrollTop > 2;
    return can ? p : null;
  }
  return null;
}

/* 畳んである手札を開いて、出そろってから続ける */
function showHandThen(fn) {
  if (openHand && openHand()) setTimeout(fn, 260);
}

/* 手札を左右に送る (LB / RB) */
function stepHand(delta) {
  const hand = boardTargets().filter(t => t.hand).sort((a, b) => center(a).x - center(b).x);
  if (!hand.length) return openHand && openHand() ? (setTimeout(() => { if (boardTargets().some(t => t.hand)) stepHand(delta); }, 260), true) : false;
  const i = hand.findIndex(t => t.key === focusKey);
  const n = i < 0 ? (delta > 0 ? 0 : hand.length - 1) : Math.max(0, Math.min(hand.length - 1, i + delta));
  focus(hand[n]);
  return true;
}

/* LB / RB: タブ (設定の左の項目・コレクションの絞り込みなど) を前後へ。
   タブは「選ばれている印」(aria-selected・.on/.active/.sel) を持つ、同じ親に並んだボタンの組。指している所に近い組を使う */
const TAB_ON = (el) => el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true' || el.matches('.on, .active, .sel, .is-active, .selected');
function switchTab(delta) {
  const list = allTargets().filter(t => t.el);
  const groups = new Map();
  for (const t of list) {
    const el = t.el;
    if (!el.parentElement || el.matches(TEXT_INPUT)) continue;
    const g = groups.get(el.parentElement) || [];
    g.push(t);
    groups.set(el.parentElement, g);
  }
  const cur = current(list);
  const from = cur ? center(cur) : { x: innerWidth / 2, y: innerHeight / 2 };
  let best = null, bestD = Infinity;
  for (const [parent, g] of groups) {
    /* 選ばれている印がちょうど1つの、2つ以上並んだボタン。タブらしい物 (role=tab・名前に tab) を先に */
    if (g.length < 2 || g.filter(t => TAB_ON(t.el)).length !== 1) continue;
    const tabby = g.some(t => t.el.getAttribute('role') === 'tab' || t.el.hasAttribute('aria-selected')) || /(^|[\s_-])tabs?([\s_-]|$)/i.test(parent.className) ? -1e12 : 0;
    const inside = cur && cur.el && parent.contains(cur.el) ? -1e9 : 0;
    const d = Math.min(...g.map(t => Math.hypot(center(t).x - from.x, center(t).y - from.y))) + inside + tabby;
    if (d < bestD) { bestD = d; best = g; }
  }
  if (!best) return false;
  const i = best.findIndex(t => TAB_ON(t.el));
  const n = best[(i + delta + best.length) % best.length];
  n.el.click();
  if (cur && cur.el && best.includes(cur)) focus(n);
  return true;
}

/* ---------- 物語の歩く画面 ---------- */
const ARROW = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const walkHeld = new Set();          // いま押しているつもりの矢印キー
function storyMode() {
  if (document.querySelector('#storyScene.show')) return 'scene';          // 会話が出ている (歩く画面の上でも、対戦のあとでも)
  const world = document.getElementById('storyWorld');
  if (!world || !world.isConnected || getComputedStyle(world).display === 'none') return null;
  /* 画面の真ん中が歩く画面のままなら歩ける (上に確認の窓などが出ていれば、ふつうの枠の操作) */
  const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  return top && world.contains(top) ? 'walk' : null;
}
function releaseWalk() { if (walkHeld.size) setWalk(new Set()); }
function setWalk(dirs) {
  for (const d of Object.keys(ARROW)) {
    const want = dirs.has(d);
    if (want && !walkHeld.has(d)) { walkHeld.add(d); window.dispatchEvent(new KeyboardEvent('keydown', { key: ARROW[d], bubbles: true, cancelable: true })); }
    if (!want && walkHeld.has(d)) { walkHeld.delete(d); window.dispatchEvent(new KeyboardEvent('keyup', { key: ARROW[d], bubbles: true })); }
  }
}
/* 歩く・話す。扱ったら true (ふつうの枠の操作はしない) */
function storyInput(pad, b, pressed) {
  const mode = storyMode();
  if (!mode) { if (walkHeld.size) setWalk(new Set()); return false; }
  ring && ring.classList.remove('on');
  quadSvg && quadSvg.classList.remove('on');
  if (mode === 'scene') {
    if (walkHeld.size) setWalk(new Set());
    if (pressed(BTN.A)) key('Enter');                       // 次のセリフへ
    if (pressed(BTN.B)) key('Escape');                      // 会話を飛ばす (SKIP と同じ)
    return true;
  }
  const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
  const dirs = new Set();
  if (b[BTN.LEFT] || ax < -0.4) dirs.add('left');
  if (b[BTN.RIGHT] || ax > 0.4) dirs.add('right');
  if (b[BTN.UP] || ay < -0.4) dirs.add('up');
  if (b[BTN.DOWN] || ay > 0.4) dirs.add('down');
  setWalk(dirs);
  if (pressed(BTN.A)) key('e');                             // 話す・調べる (近くに何もなければ何も起きない)
  if (pressed(BTN.B)) { const back = document.getElementById('titleBack'); if (back && back.offsetParent) back.click(); }   // 歩く画面から戻る
  if (pressed(BTN.START)) openOptions();
  return true;
}

/* ---------- 毎フレーム: ボタンとスティックを読む ---------- */
function loop(now) {
  raf = requestAnimationFrame(loop);
  if (!enabled()) return;
  const pad = pickPad();
  if (!pad) return;
  const b = pad.buttons.map(x => x.pressed || x.value > 0.5);
  const pressed = (i) => b[i] && !prevButtons[i];
  const any = b.some(Boolean) || Math.abs(pad.axes[0] || 0) > STICK_ON || Math.abs(pad.axes[1] || 0) > STICK_ON;
  if (any && !active) {
    setActive(true);
    const list = allTargets();
    focus(current(list) || startTarget(list));
    prevButtons = b;
    return;                          // 最初のひと押しは、枠を出すだけ
  }
  if (!active) { prevButtons = b; return; }
  if (storyInput(pad, b, pressed)) { prevButtons = b; held = { dir: null, since: now, last: now }; return; }
  if (ring && !ring.classList.contains('on')) { ring.classList.add('on'); quadSvg.classList.add('on'); }

  /* 指している物が動いた・消えたら、枠を追わせる */
  const list = allTargets();
  if (followPlaceScope(list)) { prevButtons = b; return; }
  if (!followNewWindow(list)) {
    const cur = current(list);
    if (cur) { focusPos = center(cur); draw(cur); }
    else if (list.length) focus(startTarget(list));
  }
  scrollByStick(pad);

  if (pressed(BTN.A)) activate();
  if (pressed(BTN.B)) goBack();
  if (pressed(BTN.X)) {
    const go = confirmButton();
    if (go) go.click();                              // 選んでいる最中は「決定」(リフレッシュはその間できない)
    else clickId('btnRefresh');
  }
  if (pressed(BTN.Y)) clickId('btnHand');
  if (pressed(BTN.LB)) stepHand(-1) || clickIfShown('rvPrev') || switchTab(-1);
  if (pressed(BTN.RB)) stepHand(1) || clickIfShown('rvNext') || switchTab(1);
  if (pressed(BTN.BACK)) clickId('btnLog');
  if (pressed(BTN.START)) openOptions();

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
