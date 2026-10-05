/* =========================================================================
 * 戦績画面の REPLAYS タブ: 保存したリプレイと直近の試合。WATCH で ?replay=id を開く
 *   種類 (CPU / ONLINE / RUN / WEEKLY / 観戦) と勝ち負けで絞れる。名前を付けられる。
 *   見終わったら RECORD のこのタブへ戻る (戻る先とスクロールの位置はこのタブに覚えておく)
 * ========================================================================= */
import { listReplays, pinReplay, deleteReplay, getReplay, setReplayTitle, filterReplays, kindOf, replayTags, RECENT, PINNED } from './replays.js';
import { shareReplayLink } from './replayshare.js';
import { levelLabel } from './aidecks.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = (at) => new Date(at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/* 絞り込み (このタブを開いている間と、リプレイを見て戻ってきたときに同じにする) */
const FILTER_KEY = 'compileReplayFilter';
const KINDS = [['all', 'ALL'], ['cpu', 'CPU'], ['online', 'ONLINE'], ['run', 'RUN'], ['weekly', 'WEEKLY'], ['watch', 'WATCH']];
const RESULTS = [['all', 'すべて'], ['win', '勝ち'], ['lose', '負け']];
function loadFilter() {
  try {
    const f = JSON.parse(sessionStorage.getItem(FILTER_KEY) || 'null');
    if (f && KINDS.some(k => k[0] === f.kind) && RESULTS.some(k => k[0] === f.result)) return f;
  } catch (e) { /* private mode */ }
  return { kind: 'all', result: 'all' };
}
let filter = loadFilter();
function saveFilter() { try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(filter)); } catch (e) { /* private mode */ } }

/* ---- リプレイを見終わったら RECORD → リプレイへ戻る ---- */
const RETURN_KEY = 'compileRecordReturn';
export function markRecordReturn(scroll) {
  try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ tab: 'リプレイ', scroll: Math.max(0, scroll | 0) })); } catch (e) { /* private mode */ }
}
/* タイトルのメニューを出したときに1回だけ読む ({ tab, scroll } / null) */
export function takeRecordReturn() {
  try {
    const v = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null');
    sessionStorage.removeItem(RETURN_KEY);
    return v && v.tab ? v : null;
  } catch (e) { return null; }
}
/* リプレイの画面を閉じる: タイトルへ戻り、そこで RECORD のリプレイのタブを開く (共有リンクから来たときも) */
export function returnToReplays() {
  try { if (!sessionStorage.getItem(RETURN_KEY)) markRecordReturn(0); } catch (e) { /* private mode */ }
  location.href = location.pathname;
}

function kindLabel(r) {
  const k = kindOf(r);
  if (k === 'weekly') return 'WEEKLY';
  if (k === 'run') return 'RUN';
  if (k === 'online') return 'ONLINE' + (r.oppName ? ' vs ' + r.oppName : '') + (r.rated ? ' ★' : '');
  if (k === 'watch') return '観戦 ・ CPU ' + levelLabel(r.level);
  return levelLabel(r.level) + (r.cpuName ? ' ・ vs ' + r.cpuName : '');
}

function row(r) {
  const watch = kindOf(r) === 'watch';
  const tags = replayTags(r);
  const decks = esc(r.me.join(' / ')) + ' <i>vs</i> ' + esc(r.opp.join(' / '));
  return '<li class="rp-row' + (r.win ? ' win' : '') + '" data-row="' + esc(r.id) + '">' +
    '<b class="rp-res">' + (watch ? (r.win ? 'A WIN' : 'B WIN') : r.win ? 'WIN' : 'LOSE') + '</b>' +
    '<div class="rp-main">' + (r.title ? '<span class="rp-title">' + esc(r.title) + '</span>' : '') +
      '<span>' + decks + '</span>' +
      '<small>' + when(r.at) + ' ・ ' + esc(kindLabel(r)) + (r.turns ? ' ・ ' + r.turns + '手番' : '') + '</small>' +
      (tags.length ? '<span class="rp-tags">' + tags.map(t => '<em>' + esc(t) + '</em>').join('') + '</span>' : '') + '</div>' +
    '<div class="rp-btns"><button type="button" data-rp-watch="' + esc(r.id) + '">WATCH</button>' +
      '<button type="button" data-rp-share="' + esc(r.id) + '" title="リンクで送る">SHARE</button>' +
      '<button type="button" data-rp-name="' + esc(r.id) + '" title="名前を付ける" aria-label="名前を付ける">✎</button>' +
      '<button type="button" data-rp-pin="' + esc(r.id) + '" aria-pressed="' + !!r.pinned + '" title="' + (r.pinned ? '保存をやめる' : '保存する') + '">' + (r.pinned ? '★' : '☆') + '</button>' +
      (r.pinned ? '<button type="button" data-rp-del="' + esc(r.id) + '" title="消す">×</button>' : '') + '</div></li>';
}

function filterBar(list) {
  const count = (k) => (k === 'all' ? list.length : list.filter(r => kindOf(r) === k).length);
  /* 観戦の札は、観戦のリプレイがあるときだけ */
  const kinds = KINDS.filter(([k]) => k !== 'watch' || count('watch') > 0 || filter.kind === 'watch');
  return '<div class="rp-filter" role="group" aria-label="種類で絞る">' + kinds.map(([k, label]) =>
      '<button type="button" data-rp-kind="' + k + '" aria-pressed="' + (filter.kind === k) + '">' + label + '<small>' + count(k) + '</small></button>').join('') + '</div>' +
    '<div class="rp-filter" role="group" aria-label="勝ち負けで絞る">' + RESULTS.map(([k, label]) =>
      '<button type="button" data-rp-result="' + k + '" aria-pressed="' + (filter.result === k) + '">' + label + '</button>').join('') + '</div>';
}

export function replaysTab() {
  const all = listReplays();
  if (!all.length) {
    return '<p class="pz-note">CPU 戦・オンライン・勝ち抜き戦・週替わり・観戦の対戦を終えると、直近のリプレイがここに残ります ' +
      '(CPU 戦などとオンライン・観戦で、それぞれ ' + RECENT + ' 戦ずつ)。</p>';
  }
  const list = filterReplays(all, filter);
  const pinned = list.filter(r => r.pinned), recent = list.filter(r => !r.pinned);
  return filterBar(all) +
    (list.length ? '' : '<p class="pz-note">この条件に合うリプレイはありません。</p>') +
    (pinned.length ? '<h4 class="rp-h">SAVED <small>保存したリプレイ ' + all.filter(r => r.pinned).length + ' / ' + PINNED + '</small></h4><ul class="rp-list">' + pinned.map(row).join('') + '</ul>' : '') +
    (recent.length ? '<h4 class="rp-h">RECENT <small>最近のリプレイ　直近 ' + RECENT + ' 戦ずつ (CPU 戦など・オンライン・観戦で別。☆ で保存)</small></h4><ul class="rp-list">' + recent.map(row).join('') + '</ul>' : '') +
    '<p class="pz-note" id="rpMsg" role="status">リプレイはこのブラウザに残ります。WATCH で1手ずつ見返せます (自分の手番では AI のおすすめも)。SHARE でリンクにして送れます (受け取った人は開くだけで見られます)。✎ で名前を付けられます。</p>';
}

/* 名前を付ける欄を、その行の中に出す (ブラウザの入力ダイアログは使わない) */
function openRename(body, id, rerender) {
  const li = body.querySelector('[data-row="' + CSS.escape(id) + '"]');
  const r = getReplay(id);
  if (!li || !r) return;
  const main = li.querySelector('.rp-main');
  main.innerHTML = '<form class="rp-rename"><input type="text" maxlength="40" aria-label="リプレイの名前" placeholder="名前 (空にすると外します)" value="' + esc(r.title || '') + '">' +
    '<button type="submit">決める</button><button type="button" data-cancel="1">やめる</button></form>';
  const form = main.querySelector('form');
  const input = form.querySelector('input');
  input.focus();
  input.select();
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const ok = setReplayTitle(id, input.value);
    rerender();
    const m = body.querySelector('#rpMsg');
    if (m && !ok) m.textContent = '名前を残せませんでした (ブラウザの保存がいっぱいかもしれません)';
  };
  form.querySelector('[data-cancel]').onclick = () => rerender();
  input.onkeydown = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); rerender(); } };
}

/* タブの中身を描いたあとに呼ぶ。rerender: 変更後に描き直す */
export function bindReplays(body, rerender) {
  const scroller = () => body.closest('.pz-card');
  body.querySelectorAll('[data-rp-watch]').forEach(b => {
    b.onclick = () => {
      /* 見終わったら、このタブのこの位置へ戻る */
      const sc = scroller();
      markRecordReturn(sc ? sc.scrollTop : 0);
      location.href = location.pathname + '?replay=' + encodeURIComponent(b.dataset.rpWatch);
    };
  });
  body.querySelectorAll('[data-rp-kind]').forEach(b => { b.onclick = () => { filter = { ...filter, kind: b.dataset.rpKind }; saveFilter(); rerender(); }; });
  body.querySelectorAll('[data-rp-result]').forEach(b => { b.onclick = () => { filter = { ...filter, result: b.dataset.rpResult }; saveFilter(); rerender(); }; });
  body.querySelectorAll('[data-rp-name]').forEach(b => { b.onclick = () => openRename(body, b.dataset.rpName, rerender); });
  body.querySelectorAll('[data-rp-share]').forEach(b => {
    b.onclick = async () => {
      const rep = getReplay(b.dataset.rpShare);
      const m = body.querySelector('#rpMsg');
      if (!rep) return;
      const r = await shareReplayLink(rep, 'COMPILE のリプレイ — ' + rep.me.join(' / ') + ' vs ' + rep.opp.join(' / '));
      if (m && r === 'copied') m.textContent = 'リンクをコピーしました。貼り付けて送れます。';
      else if (m && r === 'failed') m.textContent = 'リンクを作れませんでした。';
    };
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
