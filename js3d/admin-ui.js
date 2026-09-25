/* =========================================================================
 * 管理者の画面 (ACCOUNT → ADMIN)。管理者かどうかはサーバーが決める (admins 表)
 *   STATS: 利用状況と無料枠の減り具合 / PLAYERS: ログインして遊んでいる人 (表示名だけ) / WEEKLY: クリア者一覧から名前を消す /
 *   ROOMS: 残っている部屋を閉じる / UNLOCK: 見た目と称号を全部解放 (このブラウザだけ)
 * ========================================================================= */
import * as ROOM from './room.js';
import { weekKey, weekIndex } from './weekly.js';
import { isUnlockAll, setUnlockAll } from './rewards.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TABS = ['STATS', 'PLAYERS', 'WEEKLY', 'ROOMS', 'UNLOCK'];
const FREE_DB = 500 * 1024 * 1024;           // Supabase 無料プランのデータベースの目安 (500MB)
const mb = (n) => (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 2 : 1) + ' MB';
const when = (t) => new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/* 管理者の画面 (PLAYERS): モードの呼び名と、人ごとの回数の札 */
const MODE_LABEL = {
  cpu: '対 CPU 戦', quick: 'おまかせで1戦', run: '勝ち抜き戦', weekly: '週替わり3連戦', tutorial: 'チュートリアル',
  'cpu?': '対戦 (モード不明)', online: 'オンライン対戦', lesson: 'チュートリアル', tsume: '詰めコンパイル',
  puzzle: '共有された問題', daily: 'デイリーミッション'
};
function modeChips(p) {
  const m = p.modes || {}, x = p.xp || {};
  const items = [
    ['対 CPU 戦', m.cpu], ['おまかせ', m.quick], ['勝ち抜き戦', m.run], ['週替わり', m.weekly], ['チュートリアル (対戦)', m.tutorial],
    ['対戦 (不明)', m.unknown], ['オンライン', x.online], ['レッスン', x.lesson], ['詰めコンパイル', x.tsume], ['今日の問題', x.dailyPuzzle],
    ['共有された問題', x.puzzle], ['勝ち抜き戦クリア', x.runClear], ['週替わりクリア', x.weeklyClear], ['デイリー', x.daily], ['ガチャ', +p.gacha || 0]
  ].filter(([, n]) => n > 0);
  const run = p.run && p.run !== 'over' && p.run !== 'clear' ? '<i class="now">勝ち抜き戦の途中</i>' : '';
  return '<div class="ad-modes">' + (items.length ? items.map(([k, n]) => '<i>' + k + ' <b>' + n + '</b></i>').join('') : '<i class="none">記録なし</i>') + run + '</div>';
}

function statsHtml(s) {
  const pct = Math.min(100, Math.round(100 * s.db_bytes / FREE_DB));
  const rooms = s.rooms || {};
  const row = (k, v) => '<div><small>' + k + '</small><b>' + esc(v) + '</b></div>';
  const tables = Object.entries(s.tables || {}).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, v]) => '<li><span>' + esc(k) + '</span><b>' + mb(v) + '</b></li>').join('');
  return '<div class="ad-meter"><small>DATABASE</small><b>' + mb(s.db_bytes) + '<i> / 500 MB</i></b>' +
      '<span class="tr-meter"><i style="width:' + pct + '%"></i></span><em>無料枠の ' + pct + '%</em></div>' +
    '<div class="ad-grid">' +
      row('USERS (ログイン)', s.users) + row('GUESTS (ゲスト)', s.guests) + row('ACTIVE 30日', s.active_users_30d) +
      row('CPU 戦 (30日)', s.cpu_records_30d) + row('CPU 戦 (全部)', s.cpu_records) + row('レート戦 (30日)', s.rated_matches_30d) +
      row('今日の部屋 (残り)', s.online_games_today) + row('部屋: 対戦中', rooms.playing || 0) + row('部屋: 待ち', (rooms.waiting || 0) + (rooms.setup || 0)) +
      row('リプレイ', s.replays) + row('経験値の記録', s.xp_entries) + row('WEEKLY クリア', s.weekly_clears) +
    '</div><h4 class="rp-h">TABLES</h4><ul class="ad-tables">' + tables + '</ul>' +
    '<p class="pz-note">通信量 (月5GB) と関数の呼び出し回数 (月50万回) は Supabase のダッシュボードの Usage で見られます。</p>';
}

export function openAdmin() {
  let el = document.getElementById('adminOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'adminOv';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  let tab = 0;
  let week = weekIndex();
  let armed = null;                     // 2回押しで消す: 1回目に押したものの印
  el.innerHTML = '<div class="pz-card ad-card" role="dialog" aria-modal="true" aria-label="管理者">' +
    '<div class="pz-head"><b>ADMIN</b><button type="button" class="pz-x" aria-label="閉じる">×</button></div>' +
    '<div class="sr-tabs ad-tabs" role="tablist">' + TABS.map((t, i) => '<button type="button" role="tab" data-ad-tab="' + i + '">' + t + '</button>').join('') + '</div>' +
    '<div id="adBody" class="ad-body"></div><p class="ad-msg" id="adMsg" role="status"></p></div>';
  const body = el.querySelector('#adBody');
  const msg = (t) => { el.querySelector('#adMsg').textContent = t || ''; };
  const call = async (op, extra) => {
    try { return await ROOM.roomApi(op, extra); } catch (e) { msg('できませんでした: ' + e.message); throw e; }
  };

  const views = [
    async () => {
      body.innerHTML = '<p class="pz-note">読み込み中…</p>';
      const r = await call('adminStats');
      body.innerHTML = statsHtml(r.stats || {});
    },
    /* PLAYERS: 最後に遊んだ順。表示名を決めていない人は id の頭だけ出して見分ける */
    async () => {
      body.innerHTML = '<p class="pz-note">読み込み中…</p>';
      const r = await call('adminPlayers');
      const list = r.players || [];
      const day = (t) => (t ? new Date(t).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' }) : '—');
      const via = { google: 'Google', email: 'メール', github: 'GitHub' };
      body.innerHTML = '<p class="pz-note">ログインしている ' + list.length + ' 人 (ゲストは含みません)。表示名は本人が決めた名前です。' +
        '対戦のモードは 9/25 から記録しています (それより前の対戦は「対戦 (不明)」)。</p>' +
        (list.length ? '<ol class="ad-players">' + list.map(p =>
          '<li><b>' + (p.name ? esc(p.name) : '<i>名前なし</i> <small>#' + esc(p.id) + '</small>') +
            ' <span class="ad-lv">LV ' + (p.level | 0 || 1) + ' <small>(' + (p.xp_total | 0) + ' XP)</small></span></b>' +
            '<span>' + esc(via[p.provider] || p.provider || '') + ' ・ 登録 ' + day(p.created_at) + ' ・ 最後 ' + day(p.last_active) + '</span>' +
            '<em>' + (p.last_mode ? '最後に遊んだ: ' + esc(MODE_LABEL[p.last_mode] || p.last_mode) : 'まだ遊んでいない') + '</em>' +
            modeChips(p) + '</li>').join('') + '</ol>'
          : '<p class="pz-note">まだいません</p>');
    },
    async () => {
      const key = 'W' + week;
      body.innerHTML = '<div class="ad-week"><button type="button" data-ad-week="-1" aria-label="前の週">◀</button><b>' + key +
        (key === weekKey() ? ' <i>(今週)</i>' : '') + '</b><button type="button" data-ad-week="1" aria-label="次の週"' + (week >= weekIndex() ? ' disabled' : '') + '>▶</button></div>' +
        '<p class="pz-note">読み込み中…</p>';
      const r = await call('adminWeekly', { week: key });
      const list = r.clears || [];
      body.querySelector('.pz-note').outerHTML = list.length
        ? '<ul class="ad-list">' + list.map(c => '<li><span><b>' + esc(c.name) + '</b><small>' + when(c.cleared_at) + ' ・ ' + c.attempts + '回目</small></span>' +
          '<button type="button" data-ad-del-weekly="' + esc(c.user_id) + '">' + (armed === 'w' + c.user_id ? '消す?' : '×') + '</button></li>').join('') + '</ul>'
        : '<p class="pz-note">この週のクリア者はいません</p>';
    },
    async () => {
      body.innerHTML = '<p class="pz-note">読み込み中…</p>';
      const r = await call('adminRooms');
      const list = r.rooms || [];
      body.innerHTML = list.length
        ? '<ul class="ad-list">' + list.map(x => '<li><span><b>' + esc(x.code) + ' <i class="ad-st ' + esc(x.status) + '">' + esc(x.status) + '</i>' + (x.rated ? ' <i class="ad-st">RATED</i>' : '') + '</b>' +
          '<small>' + esc(x.title) + ' ・ ' + esc(x.host_name) + (x.guest_name ? ' vs ' + esc(x.guest_name) : '') + ' ・ 更新 ' + when(x.updated_at) + '</small></span>' +
          '<button type="button" data-ad-close="' + esc(x.code) + '">' + (armed === 'r' + x.code ? '閉じる?' : '×') + '</button></li>').join('') + '</ul>' +
          '<p class="pz-note">× を2回押すと部屋を閉じます (対戦中なら両者の対戦が終わります)。</p>'
        : '<p class="pz-note">部屋はありません</p>';
    },
    async () => {
      body.innerHTML = '<label class="ad-toggle"><input type="checkbox" id="adUnlock"' + (isUnlockAll() ? ' checked' : '') + '> 見た目・盤面の柄・称号を全部解放する</label>' +
        '<p class="pz-note">テスト用です。このブラウザだけに効き、レベルや経験値、強さは変わりません。切り替えたあとはページを読み直すと反映されます。</p>' +
        '<div class="pz-row"><button type="button" id="adReload">読み直す</button></div>';
    }
  ];

  const show = async (i) => {
    tab = i;
    msg('');
    el.querySelectorAll('[data-ad-tab]').forEach(b => b.classList.toggle('on', +b.dataset.adTab === i));
    try { await views[i](); } catch (e) { /* msg に出してある */ }
  };

  el.onclick = async (ev) => {
    if (ev.target === el) { el.classList.remove('show'); return; }
    const b = ev.target.closest('button, input');
    if (!b) return;
    if (b.classList.contains('pz-x')) { el.classList.remove('show'); return; }
    if (b.dataset.adTab) { armed = null; show(+b.dataset.adTab); return; }
    if (b.dataset.adWeek) { week += +b.dataset.adWeek; armed = null; show(1); return; }
    if (b.dataset.adDelWeekly) {
      const id = b.dataset.adDelWeekly;
      if (armed !== 'w' + id) { armed = 'w' + id; b.textContent = '消す?'; b.classList.add('warn'); return; }
      armed = null;
      try { await call('adminWeeklyDelete', { week: 'W' + week, userId: id }); msg('一覧から消しました'); } catch (e) { return; }
      show(1);
      return;
    }
    if (b.dataset.adClose) {
      const code = b.dataset.adClose;
      if (armed !== 'r' + code) { armed = 'r' + code; b.textContent = '閉じる?'; b.classList.add('warn'); return; }
      armed = null;
      try { await call('adminCloseRoom', { code }); msg('部屋 ' + code + ' を閉じました'); } catch (e) { return; }
      show(2);
      return;
    }
    if (b.id === 'adUnlock') { setUnlockAll(b.checked); msg(b.checked ? '全部解放にしました (読み直すと反映されます)' : '全部解放を切りました'); return; }
    if (b.id === 'adReload') location.reload();
  };
  el.classList.add('show');
  show(tab);
}
