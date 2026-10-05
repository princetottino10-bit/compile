/* =========================================================================
 * 感想戦 (CPU 戦の棋譜を1手ずつ見返す)
 *   対局中に「その手を指す前の盤面と、指した手」を残しておき、決着後に
 *   ◀ ▶ で盤面を戻して見る。自分の手番では「AI ならどう指したか」も出す。
 *   盤面の描き替え・手の説明・AI の手は main.js から渡す (ここは帯の UI だけ)。
 * ========================================================================= */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 自動再生の速さ (1手を見せる時間)。読む時間を残すため、いちばん速くても 0.7 秒 */
export const AUTO_SPEEDS = [{ label: 'ゆっくり', ms: 2600 }, { label: 'ふつう', ms: 1500 }, { label: '速い', ms: 700 }];
const SPEED_KEY = 'compileReviewSpeed';
const SWIPE_MIN = 48;          // これより長く横に動かしたらスワイプ (縦のぶれは SWIPE_MIN 未満まで)

/* 分かれ目の前後: i より前 (dir -1) / 後 (dir 1) でいちばん近い分かれ目の手。無ければ null */
export function nextTurning(turning, i, dir) {
  const idx = (turning || []).map(t => t.index).sort((a, b) => a - b);
  if (dir > 0) return idx.find(k => k > i) ?? null;
  const before = idx.filter(k => k < i);
  return before.length ? before[before.length - 1] : null;
}

/* history: [{ st, action }] (指す前の盤面と、その手)。final: 決着の盤面。
   hooks: { show(st), describe(action, st), suggest(st) -> action|null, same(a, b), isMine(st), onExit(),
            adv: 優勢の推移 (手の数 + 1、自分から見て -1..1。turning.js) / 無ければグラフを出さない,
            turning: 分かれ目 [{ index, swing }],
            start: はじめに見る手 (0 から。リンクの &m=),
            shareAt(i) -> Promise<文 | { text, url }>: 「この局面を共有」(無ければボタンを出さない。url は手でコピーしてもらうリンク),
            saveShared() -> { ok, message }: 共有されたリプレイを自分のリプレイに残す (無ければ出さない) } */

/* 優勢の推移のグラフ。上が自分の有利。分かれ目は印、いま見ている手は縦線。押すとその手へ */
function graphHtml(adv, turning, i) {
  const n = adv.length - 1;
  if (n < 1) return '';
  const pts = adv.map((v, k) => (k / n * 100).toFixed(2) + ',' + (50 - v * 46).toFixed(2)).join(' ');
  const at = (k) => (k / n * 100).toFixed(2) + '%';
  return '<div class="rv-graph" role="group" aria-label="優勢の推移">' +
    '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<rect x="0" y="0" width="100" height="50" class="rv-g-me"/><rect x="0" y="50" width="100" height="50" class="rv-g-op"/>' +
      '<line x1="0" y1="50" x2="100" y2="50" class="rv-g-mid"/>' +
      '<polyline points="' + pts + '" class="rv-g-line"/>' +
    '</svg>' +
    '<i class="rv-g-now" style="left:' + at(Math.min(i, n)) + '"></i>' +
    turning.map(t => '<button type="button" class="rv-g-tp ' + (t.swing > 0 ? 'up' : 'down') + '" style="left:' + at(t.index + 0.5) + '"' +
      ' data-jump="' + t.index + '" title="分かれ目: ' + (t.index + 1) + '手目" aria-label="分かれ目 ' + (t.index + 1) + '手目へ">◆</button>').join('') +
    '<small class="rv-g-lbl">▲ あなた有利　▼ 相手有利</small></div>';
}

function loadSpeed() {
  try {
    const raw = localStorage.getItem(SPEED_KEY);
    const v = raw === null ? NaN : Number(raw);
    return v >= 0 && v < AUTO_SPEEDS.length ? v : 1;          // はじめは「ふつう」
  } catch (e) { return 1; }
}

export function openReview(history, final, hooks) {
  if (!history.length) return;
  let el = document.getElementById('reviewBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'reviewBar';
    document.body.appendChild(el);
  }
  /* 中身 (描き直す) と、読み上げ用の欄 (描き直さない。毎回作り直すと読み上げが拾わない) */
  el.innerHTML = '<div class="rv-body"></div><p class="rv-sr" role="status" aria-live="polite"></p>';
  const body = el.querySelector('.rv-body');
  const live = el.querySelector('.rv-sr');
  const cache = new Map();
  const turning = hooks.turning || [];
  let i = Math.max(0, Math.min(history.length, hooks.start | 0));
  let token = 0;
  let auto = null;                 // 自動再生のタイマー
  let speed = loadSpeed();
  let note = '';                   // 共有・保存のあとの一言 (次に動かすまで出す)
  let saved = false;

  const go = (k) => {
    const n = Math.max(0, Math.min(history.length, k));
    if (n === i) return;
    i = n;
    note = '';
    render();
  };
  const stopAuto = () => { if (auto) { clearInterval(auto); auto = null; } };
  const startAuto = () => {
    stopAuto();
    if (i >= history.length) i = 0;                 // 終局から押したら、はじめから
    auto = setInterval(() => {
      if (i >= history.length) { stopAuto(); render(); return; }   // 終局で止まる (閉じない)
      i++;
      render();
    }, AUTO_SPEEDS[speed].ms);
    render();
  };

  const render = async () => {
    const my = ++token;
    const last = i >= history.length;
    const entry = last ? null : history[i];
    const st = last ? final : entry.st;
    hooks.show(st);
    const mine = entry && hooks.isMine(entry.st);
    const adv = hooks.adv || null;
    const tp = entry && turning.find(t => t.index === i);
    const prevTp = nextTurning(turning, i, -1), nextTp = nextTurning(turning, i, 1);
    const moveText = entry ? hooks.describe(entry.action, entry.st) : 'この盤面で決着しました';
    const navBtn = (id, label, aria, off) => '<button type="button" id="' + id + '" aria-label="' + aria + '" title="' + aria + '"' + (off ? ' disabled' : '') + '>' + label + '</button>';
    body.innerHTML =
      (adv ? graphHtml(adv, turning, i) : '') +
      '<div class="rv-nav">' +
        navBtn('rvFirst', '最初', '最初の手へ (Home)', i === 0) +
        (turning.length ? navBtn('rvPrevTp', '◆◀', '前の分かれ目へ', prevTp === null) : '') +
        navBtn('rvPrev', '◀', '1手戻る', i === 0) +
        '<b>' + (last ? '終局' : (i + 1) + ' 手目') + '<small> / ' + history.length + '</small></b>' +
        navBtn('rvNext', '▶', '1手進む', last) +
        (turning.length ? navBtn('rvNextTp', '▶◆', '次の分かれ目へ', nextTp === null) : '') +
        navBtn('rvLast', '最後', '最後 (終局) へ (End)', last) +
      '</div>' +
      '<div class="rv-info">' +
        (entry
          ? (tp ? '<p class="rv-tp ' + (tp.swing > 0 ? 'up' : 'down') + '">◆ 分かれ目: この手で流れが' + (tp.swing > 0 ? 'あなた' : '相手') + 'に傾きました</p>' : '') +
            '<p class="rv-move ' + (mine ? 'me' : 'opp') + '">' + esc(moveText) + '</p>' +
            (mine ? '<p class="rv-ai" id="rvAi">' + (auto ? 'AI のおすすめ: 自動再生を止めると出ます' : 'AI のおすすめ: 考え中…') + '</p>' : '<p class="rv-ai dim">相手の手番</p>')
          : '<p class="rv-move">' + esc(moveText) + '</p>') +
      '</div>' +
      '<div class="rv-tools">' +
        '<button type="button" id="rvAuto" class="rv-tool" aria-pressed="' + !!auto + '">' + (auto ? '❚❚ 止める' : '▶ 自動で進める') + '</button>' +
        '<span class="rv-speed" role="group" aria-label="自動で進める速さ">' + AUTO_SPEEDS.map((s, k) =>
          '<button type="button" data-speed="' + k + '" aria-pressed="' + (k === speed) + '">' + s.label + '</button>').join('') + '</span>' +
        (hooks.shareAt ? '<button type="button" id="rvShareAt" class="rv-tool">この局面を共有</button>' : '') +
        (hooks.saveShared ? '<button type="button" id="rvSaveShared" class="rv-tool"' + (saved ? ' disabled' : '') + '>' + (saved ? '残しました' : '自分のリプレイに残す') + '</button>' : '') +
        (note ? '<small class="rv-note">' + esc(typeof note === 'string' ? note : note.text) + '</small>' : '') +
        (note && note.url ? '<input class="rv-url" type="text" readonly aria-label="この局面のリンク" value="' + esc(note.url) + '">' : '') +
      '</div>' +
      '<button type="button" id="rvExit" class="rv-exit">感想戦を終える</button>';
    el.classList.add('show');
    live.textContent = (last ? '終局' : (i + 1) + '手目') + '。' + (tp ? '分かれ目。' : '') + moveText;
    const on = (id, fn) => { const b = body.querySelector('#' + id); if (b) b.onclick = fn; };
    on('rvFirst', () => go(0));
    on('rvLast', () => go(history.length));
    on('rvPrev', () => go(i - 1));
    on('rvNext', () => go(i + 1));
    on('rvPrevTp', () => { const k = nextTurning(turning, i, -1); if (k !== null) go(k); });
    on('rvNextTp', () => { const k = nextTurning(turning, i, 1); if (k !== null) go(k); });
    on('rvExit', exit);
    on('rvAuto', () => { if (auto) { stopAuto(); render(); } else startAuto(); });
    body.querySelectorAll('[data-speed]').forEach(b => {
      b.onclick = () => {
        speed = +b.dataset.speed;
        try { localStorage.setItem(SPEED_KEY, String(speed)); } catch (e) { /* private mode */ }
        if (auto) startAuto(); else render();
      };
    });
    on('rvShareAt', async () => {
      const at = i;
      note = '';
      try { note = await hooks.shareAt(at); } catch (e) { note = 'リンクを作れませんでした'; }
      if (at === i) render();                       // 待つ間にほかの手へ動いていたら、その手の表示のまま
    });
    on('rvSaveShared', () => {
      let r;
      try { r = hooks.saveShared(); } catch (e) { r = { ok: false, message: '残せませんでした' }; }
      saved = !!(r && r.ok);
      note = (r && r.message) || '';
      render();
    });
    const url = body.querySelector('.rv-url');
    if (url) url.onfocus = () => url.select();
    body.querySelectorAll('[data-jump]').forEach(b => { b.onclick = () => go(+b.dataset.jump); });
    const g = body.querySelector('.rv-graph svg');
    if (g) {
      g.onclick = (ev) => {
        const r = g.getBoundingClientRect();
        go(Math.round((ev.clientX - r.left) / r.width * history.length));
      };
    }
    if (!mine || auto) return;
    /* AI のおすすめは重いので、表示してから考える (前後に動かしたら捨てる) */
    await new Promise(r => setTimeout(r, 60));
    if (my !== token) return;
    let s = cache.get(i);
    if (s === undefined) {
      try { s = hooks.suggest(entry.st); } catch (e) { s = null; }
      cache.set(i, s);
    }
    if (my !== token) return;
    const box = body.querySelector('#rvAi');
    if (!box) return;
    if (!s) { box.textContent = 'AI のおすすめ: 出せませんでした'; return; }
    const same = hooks.same(s, entry.action);
    box.innerHTML = 'AI のおすすめ: ' + esc(hooks.describe(s, entry.st, true)) +
      (same ? ' <span class="rv-same">同じ手</span>' : ' <span class="rv-diff">別の手</span>');
  };

  const onKey = (ev) => {
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (ev.key === 'ArrowLeft') go(i - 1);
    else if (ev.key === 'ArrowRight') go(i + 1);
    else if (ev.key === 'Home') { ev.preventDefault(); go(0); }
    else if (ev.key === 'End') { ev.preventDefault(); go(history.length); }
    else if (ev.key === 'Escape') exit();
  };
  /* スマホ: 帯の上を左右になぞると1手ずつ (左へ = 次の手) */
  let touch = null;
  const onDown = (ev) => { if (ev.pointerType === 'touch') touch = { x: ev.clientX, y: ev.clientY }; };
  const onUp = (ev) => {
    if (!touch || ev.pointerType !== 'touch') return;
    const dx = ev.clientX - touch.x, dy = ev.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) go(i + (dx < 0 ? 1 : -1));
  };
  function exit() {
    token++;
    stopAuto();
    window.removeEventListener('keydown', onKey);
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointerup', onUp);
    el.classList.remove('show');
    live.textContent = '';
    hooks.show(final);
    hooks.onExit();
  }
  window.addEventListener('keydown', onKey);
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  render();
}
