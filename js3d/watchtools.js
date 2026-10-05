/* =========================================================================
 * 観戦の手元の操作 (この端末だけ。相手やサーバーには何も送らない)
 *   CPU どうしの観戦: 一時停止 / 再開・速さ (動きだけ速くする。文章を読む間は変えない)
 *   オンラインの観戦: 手前と奥の入れ替え・途中から入ったときのここまでのまとめ
 *   main.js は watchGate() を CPU の手の前に待ち、onSpeed / onFlip で盤面に当てる
 * ========================================================================= */

export const WATCH_SPEEDS = [{ label: '×1', v: 1 }, { label: '×2', v: 2 }, { label: '×3', v: 3 }];

let paused = false;
let waiters = [];
/* 一時停止の間は、ここで待つ (再開したら進む) */
export function watchGate() {
  if (!paused) return Promise.resolve();
  return new Promise((resolve) => waiters.push(resolve));
}
export function watchPaused() { return paused; }
function setPaused(on) {
  paused = !!on;
  if (!paused) { const w = waiters; waiters = []; w.forEach(f => f()); }
}

function box() {
  let el = document.getElementById('watchTools');
  if (!el) {
    el = document.createElement('div');
    el.id = 'watchTools';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', '観戦の操作');
    document.body.appendChild(el);
  }
  return el;
}

/* CPU どうしの観戦の操作。opts.onSpeed(倍率) */
export function mountCpuWatchTools(opts = {}) {
  const el = box();
  let speed = 1;
  const render = () => {
    el.innerHTML = '<button type="button" class="wt-tool" data-pause="1" aria-pressed="' + paused + '">' + (paused ? '▶ 再開' : '❚❚ 一時停止') + '</button>' +
      '<span class="wt-speeds" role="group" aria-label="観戦の速さ">' + WATCH_SPEEDS.map(s =>
        '<button type="button" class="wt-tool" data-wspeed="' + s.v + '" aria-pressed="' + (s.v === speed) + '">' + s.label + '</button>').join('') + '</span>' +
      (paused ? '<small class="wt-paused" role="status">一時停止中 (いまの手が終わったところで止まります)</small>' : '');
  };
  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.pause) setPaused(!paused);
    else if (b.dataset.wspeed) { speed = +b.dataset.wspeed; if (opts.onSpeed) opts.onSpeed(speed); }
    render();
  };
  render();
  el.classList.add('show');
}

/* オンラインの観戦の操作。opts.onFlip(): 手前と奥を入れ替える。opts.note: 途中から入ったときのまとめ
   (読み終わるまで出しておく。× で閉じる) */
export function mountRoomWatchTools(opts = {}) {
  const el = box();
  el.innerHTML = (opts.note ? '<p class="wt-catchup" role="status">' + esc(opts.note) +
      '<button type="button" class="wt-x" data-close="1" aria-label="まとめを閉じる">×</button></p>' : '') +
    '<button type="button" class="wt-tool" data-flip="1">⇅ 手前と奥を入れ替える</button>';
  el.onclick = (ev) => {
    if (ev.target.closest('[data-close]')) { const p = el.querySelector('.wt-catchup'); if (p) p.remove(); return; }
    const b = ev.target.closest('[data-flip]');
    if (b && opts.onFlip) opts.onFlip();
  };
  el.classList.add('show');
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function unmountWatchTools() {
  setPaused(false);
  const el = document.getElementById('watchTools');
  if (el) el.classList.remove('show');
}

/* 途中から観戦したときの、ここまでのまとめ (クライアントに来ている publicState だけで作る)。
   ターンの数はサーバーが送ってこないので、コンパイルの数と、いまどちらの番かを出す */
export function catchUpText(rm) {
  const g = rm && rm.game;
  if (!g || !Array.isArray(g.protocols) || !Array.isArray(rm.names)) return '';
  const comp = (k) => (g.protocols[k] || []).filter(p => p && p.compiled).length;
  const name = (k) => rm.names[k] || (k ? 'GUEST' : 'HOST');
  const c0 = comp(0), c1 = comp(1);
  /* 始まったばかり (盤面にまだ何も無い) なら、まとめることが無い */
  const placed = (g.lines || []).some(line => (line || []).some(stack => (stack || []).length));
  if (!placed && !c0 && !c1) return '';
  const head = c0 || c1 ? 'ここまでのコンパイル: ' + name(0) + ' ' + c0 + ' ・ ' + name(1) + ' ' + c1 : 'まだどちらもコンパイルしていません';
  const turn = g.winner === null && (g.turn === 0 || g.turn === 1) ? '　いまは ' + name(g.turn) + ' の番です' : '';
  return '途中から観戦しています。' + head + turn;
}
