/* =========================================================================
 * 感想戦 (CPU 戦の棋譜を1手ずつ見返す)
 *   対局中に「その手を指す前の盤面と、指した手」を残しておき、決着後に
 *   ◀ ▶ で盤面を戻して見る。自分の手番では「AI ならどう指したか」も出す。
 *   盤面の描き替え・手の説明・AI の手は main.js から渡す (ここは帯の UI だけ)。
 * ========================================================================= */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* history: [{ st, action }] (指す前の盤面と、その手)。final: 決着の盤面。
   hooks: { show(st), describe(action, st), suggest(st) -> action|null, same(a, b), isMine(st), onExit() } */
export function openReview(history, final, hooks) {
  if (!history.length) return;
  let el = document.getElementById('reviewBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'reviewBar';
    document.body.appendChild(el);
  }
  const cache = new Map();
  let i = 0;
  let token = 0;

  const render = async () => {
    const my = ++token;
    const last = i >= history.length;
    const entry = last ? null : history[i];
    const st = last ? final : entry.st;
    hooks.show(st);
    const mine = entry && hooks.isMine(entry.st);
    el.innerHTML =
      '<div class="rv-nav">' +
        '<button type="button" id="rvPrev" aria-label="1手戻る"' + (i === 0 ? ' disabled' : '') + '>◀</button>' +
        '<b>' + (last ? '終局' : (i + 1) + ' 手目') + '<small> / ' + history.length + '</small></b>' +
        '<button type="button" id="rvNext" aria-label="1手進む"' + (last ? ' disabled' : '') + '>▶</button>' +
      '</div>' +
      '<div class="rv-info">' +
        (entry
          ? '<p class="rv-move ' + (mine ? 'me' : 'opp') + '">' + esc(hooks.describe(entry.action, entry.st)) + '</p>' +
            (mine ? '<p class="rv-ai" id="rvAi">AI のおすすめ: 考え中…</p>' : '<p class="rv-ai dim">相手の手番</p>')
          : '<p class="rv-move">この盤面で決着しました</p>') +
      '</div>' +
      '<button type="button" id="rvExit" class="rv-exit">感想戦を終える</button>';
    el.classList.add('show');
    el.querySelector('#rvPrev').onclick = () => { if (i > 0) { i--; render(); } };
    el.querySelector('#rvNext').onclick = () => { if (i < history.length) { i++; render(); } };
    el.querySelector('#rvExit').onclick = exit;
    if (!mine) return;
    /* AI のおすすめは重いので、表示してから考える (前後に動かしたら捨てる) */
    await new Promise(r => setTimeout(r, 60));
    if (my !== token) return;
    let s = cache.get(i);
    if (s === undefined) {
      try { s = hooks.suggest(entry.st); } catch (e) { s = null; }
      cache.set(i, s);
    }
    if (my !== token) return;
    const box = el.querySelector('#rvAi');
    if (!box) return;
    if (!s) { box.textContent = 'AI のおすすめ: 出せませんでした'; return; }
    const same = hooks.same(s, entry.action);
    box.innerHTML = 'AI のおすすめ: ' + esc(hooks.describe(s, entry.st, true)) +
      (same ? ' <span class="rv-same">同じ手</span>' : ' <span class="rv-diff">別の手</span>');
  };

  const onKey = (ev) => {
    if (ev.key === 'ArrowLeft' && i > 0) { i--; render(); }
    else if (ev.key === 'ArrowRight' && i < history.length) { i++; render(); }
    else if (ev.key === 'Escape') exit();
  };
  function exit() {
    token++;
    window.removeEventListener('keydown', onKey);
    el.classList.remove('show');
    hooks.show(final);
    hooks.onExit();
  }
  window.addEventListener('keydown', onKey);
  render();
}
