/* =========================================================================
 * 戦績画面の REPLAYS タブ: 保存したリプレイと直近の試合。WATCH で ?replay=id を開く
 * ========================================================================= */
import { listReplays, pinReplay, deleteReplay, RECENT, PINNED } from './replays.js';
import { levelLabel } from './aidecks.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = (at) => new Date(at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function row(r) {
  return '<li class="rp-row' + (r.win ? ' win' : '') + '">' +
    '<b class="rp-res">' + (r.win ? 'WIN' : 'LOSE') + '</b>' +
    '<div class="rp-main"><span>' + esc(r.me.join(' / ')) + ' <i>vs</i> ' + esc(r.opp.join(' / ')) + '</span>' +
      '<small>' + when(r.at) + ' ・ ' + esc(r.kind === 'weekly' ? 'WEEKLY' : r.kind === 'run' ? 'RUN' : levelLabel(r.level)) +
      (r.turns ? ' ・ ' + r.turns + '手番' : '') + '</small></div>' +
    '<div class="rp-btns"><button type="button" data-rp-watch="' + r.id + '">WATCH</button>' +
      '<button type="button" data-rp-pin="' + r.id + '" aria-pressed="' + !!r.pinned + '" title="' + (r.pinned ? '保存をやめる' : '保存する') + '">' + (r.pinned ? '★' : '☆') + '</button>' +
      (r.pinned ? '<button type="button" data-rp-del="' + r.id + '" title="消す">×</button>' : '') + '</div></li>';
}

export function replaysTab() {
  const list = listReplays();
  const pinned = list.filter(r => r.pinned), recent = list.filter(r => !r.pinned);
  if (!list.length) return '<p class="pz-note">CPU 戦を遊ぶと、直近 ' + RECENT + ' 戦のリプレイがここに残ります</p>';
  return (pinned.length ? '<h4 class="rp-h">SAVED <small>' + pinned.length + ' / ' + PINNED + '</small></h4><ul class="rp-list">' + pinned.map(row).join('') + '</ul>' : '') +
    (recent.length ? '<h4 class="rp-h">RECENT <small>直近 ' + RECENT + ' 戦 (☆ で保存)</small></h4><ul class="rp-list">' + recent.map(row).join('') + '</ul>' : '') +
    '<p class="pz-note" id="rpMsg" role="status">リプレイはこのブラウザに残ります。WATCH で1手ずつ見返せます (自分の手番では AI のおすすめも)。</p>';
}

/* タブの中身を描いたあとに呼ぶ。rerender: 変更後に描き直す */
export function bindReplays(body, rerender) {
  body.querySelectorAll('[data-rp-watch]').forEach(b => {
    b.onclick = () => { location.href = location.pathname + '?replay=' + encodeURIComponent(b.dataset.rpWatch); };
  });
  body.querySelectorAll('[data-rp-pin]').forEach(b => {
    b.onclick = () => {
      const r = pinReplay(b.dataset.rpPin, b.getAttribute('aria-pressed') !== 'true');
      rerender();
      if (!r.ok) { const m = body.querySelector('#rpMsg'); if (m) m.textContent = r.message; }
    };
  });
  body.querySelectorAll('[data-rp-del]').forEach(b => {
    /* 押し間違いで消えないように、1回目は確かめるだけ */
    b.onclick = () => {
      if (b.dataset.armed) { deleteReplay(b.dataset.rpDel); rerender(); return; }
      b.dataset.armed = '1';
      b.textContent = '消す?';
      b.classList.add('warn');
    };
  });
}
