/* =========================================================================
 * アカウント (Google ログイン) と戦績の保存
 *   ログインしていれば、CPU 戦の記録 (stats.js) をアカウントに保存し、
 *   別の端末で記録した分も読み込む。ブラウザの記録はログインしなくても残る。
 *   ゲスト (オンライン対戦用の匿名ログイン) はログインしていない扱い。
 * ========================================================================= */
import * as ROOM from './room.js';
import { localRecords, mergeRecords, setStatsHooks } from './stats.js';
import { xpLog, mergeXp, setXpHooks } from './xp.js';
import * as SAVE from './cloudsave.js';
import { openAdmin } from './admin-ui.js';
import { pinnedReplays, mergeReplays, setReplayHooks } from './replays.js';

const TABLE = 'player_records';
const XP_TABLE = 'player_xp';       // CPU 戦の戦績以外で入った経験値 (オンライン・チュートリアルなど)
const SAVE_TABLE = 'player_saves';  // 設定・見た目・お気に入り・RUN・WEEKLY など (1人1行)
const REPLAY_TABLE = 'player_replays';   // 保存 (★) したリプレイ (1人30まで)
const replayRow = (r) => ({ id: r.id, data: { ...r, pinned: undefined } });

/* 通信を減らすため、前回の同期からの差分だけを行き来させる。
   pulled: 読み込んだ行の created_at (サーバーの時刻) の最大、pushed: 送り終えたブラウザの記録の時刻の最大 */
const MARK = 'compileSyncMark';
function loadMark(user) {
  try {
    const m = JSON.parse(localStorage.getItem(MARK) || 'null');
    if (m && m.user === user) return m;
  } catch (e) { /* 壊れていたら最初から */ }
  return { user, rec: { pulled: null, pushed: 0 }, xp: { pulled: null, pushed: 0 } };
}
function saveMark(m) { try { localStorage.setItem(MARK, JSON.stringify(m)); } catch (e) { /* private mode */ } }

/* table の、mark.pulled より後に作られた行を全部読む */
async function pullSince(table, cols, pulled) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = ROOM.roomClient().from(table).select(cols + ',created_at');
    if (pulled) q = q.gt('created_at', pulled);
    const r = await q.order('created_at', { ascending: true }).range(from, from + 999);
    if (r.error) throw new Error(r.error.message);
    rows.push(...r.data);
    if (r.data.length < 1000) break;
  }
  return rows;
}
const maxCreated = (rows, was) => rows.reduce((m, r) => (!m || r.created_at > m ? r.created_at : m), was);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = { ready: false, available: false, user: null, sync: '', error: '', admin: false };
const listeners = new Set();
function changed() { for (const fn of listeners) fn(state); }
export function onAccountChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function accountState() { return state; }

/* ブラウザの記録 ⇔ 表の行 */
const toRow = (r) => ({
  id: r.id, me: r.me, opp: r.opp, win: !!r.win,
  level: Number.isInteger(r.level) ? r.level : null, played_at: new Date(r.at).toISOString(),
  turns: Number.isInteger(r.turns) ? r.turns : null, feats: Array.isArray(r.feats) ? r.feats.slice(0, 32) : [],
  cards: Array.isArray(r.cards) ? r.cards.slice(0, 64) : [],
  effects: r.effects && typeof r.effects === 'object' ? r.effects : {}
});
const fromRow = (row) => ({
  id: row.id, me: row.me, opp: row.opp, win: row.win, level: row.level, at: Date.parse(row.played_at),
  turns: row.turns, feats: row.feats || [], cards: row.cards || [], effects: row.effects || {}
});

const xpToRow = (e) => ({ id: e.id, src: e.src, xp: e.xp, earned_at: new Date(e.at).toISOString() });
const xpFromRow = (row) => ({ id: row.id, src: row.src, xp: row.xp, at: Date.parse(row.earned_at) });

function userFrom(session) {
  const u = session && session.user;
  if (!u || u.is_anonymous) return null;
  const meta = u.user_metadata || {};
  return { id: u.id, name: meta.full_name || meta.name || meta.display_name || u.email || 'プレイヤー', email: u.email || '' };
}

/* ログインしたことのあるブラウザにだけ Supabase の保存がある。無ければ SDK を読まずに済ませる */
function hasStoredSession() {
  try { return Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k)); } catch (e) { return false; }
}

/* 起動時に1回 (待たない)。ログインしたことが無ければ、アカウントの画面を開くまで SDK を読まない */
let loading = null;
export function initAccount(force) {
  if (!force && !hasStoredSession()) {
    state.ready = true;
    state.deferred = true;
    setStatsHooks({ note: () => 'ログインすると、戦績をアカウントに保存して別の端末でも見られます' });
    changed();
    return Promise.resolve();
  }
  if (!loading) loading = loadAccount();
  return loading;
}

async function loadAccount() {
  state.deferred = false;
  state.ready = false;
  changed();
  try {
    await ROOM.roomLoadDeps();
    state.available = ROOM.roomConfigured();
    if (state.available) {
      state.user = userFrom(await ROOM.roomSession());
      ROOM.roomClient().auth.onAuthStateChange((_ev, session) => {
        const next = userFrom(session);
        const was = state.user && state.user.id;
        state.user = next;
        changed();
        if (next && next.id !== was) { syncRecords(); checkAdmin(); }
        if (!next) state.admin = false;
      });
    }
  } catch (e) {
    state.available = false;
    state.error = 'ログインの機能を読み込めませんでした';
  }
  state.ready = true;
  setStatsHooks({
    /* 送れなかった分はブラウザに残っているので、次の同期で送り直す */
    onRecord: (rec) => {
      if (!state.user) return;
      saveSoon();
      pushRows([toRow(rec)]).catch((e) => { state.error = '戦績を保存できませんでした (次の同期で送り直します): ' + e.message; changed(); });
    },
    onClear: state.user ? clearRemote : null,
    note: () => (state.user ? state.user.name + ' のアカウントにも保存しています' : 'ログインすると、戦績をアカウントに保存して別の端末でも見られます')
  });
  setXpHooks({
    onGrant: (entry) => {
      if (!state.user) return;
      saveSoon();
      pushXp([xpToRow(entry)]).catch((e) => { state.error = '経験値を保存できませんでした (次の同期で送り直します): ' + e.message; changed(); });
    }
  });
  setReplayHooks({
    onPin: (r) => {
      if (!state.user) return;
      ROOM.roomClient().from(REPLAY_TABLE).upsert(replayRow(r), { onConflict: 'user_id,id' })
        .then((w) => { if (w.error) { state.error = 'リプレイを保存できませんでした (次の同期で送り直します): ' + w.error.message; changed(); } });
    },
    onUnpin: (id) => {
      if (!state.user) return;
      ROOM.roomClient().from(REPLAY_TABLE).delete().eq('id', id).then(() => {});
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSoon(); });
  changed();
  if (state.user) { syncRecords(); checkAdmin(); }
}

/* 管理者か (サーバーが admins 表で決める)。管理者なら ACCOUNT に ADMIN の入口を出す */
async function checkAdmin() {
  try {
    const r = await ROOM.roomApi('whoami');
    state.admin = !!(r && r.admin);
  } catch (e) {
    state.admin = false;
  }
  changed();
}

async function pushXp(rows) {
  if (!rows.length) return;
  const r = await ROOM.roomClient().from(XP_TABLE).upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true });
  if (r.error) throw new Error(r.error.message);
}

/* 経験値の帳簿も、戦績と同じく差分を送り合う。読み込んだ件数を返す */
async function syncXp(mark) {
  const remote = await pullSince(XP_TABLE, 'id,src,xp,earned_at', mark.xp.pulled);
  const local = xpLog();
  const send = local.filter(x => x.at > mark.xp.pushed).map(xpToRow);
  for (let i = 0; i < send.length; i += 200) await pushXp(send.slice(i, i + 200));
  const added = mergeXp(remote.map(xpFromRow));
  mark.xp = { pulled: maxCreated(remote, mark.xp.pulled), pushed: local.reduce((m, x) => Math.max(m, x.at), mark.xp.pushed) };
  return added;
}

/* 保存したリプレイ: 向こうに無いものを送り、こちらに無いものだけ中身を読む。読み込んだ数を返す */
async function syncReplays() {
  const ids = await ROOM.roomClient().from(REPLAY_TABLE).select('id').limit(100);
  if (ids.error) throw new Error(ids.error.message);
  const remote = new Set(ids.data.map(x => x.id));
  const local = pinnedReplays();
  const send = local.filter(r => !remote.has(r.id)).map(replayRow);
  if (send.length) {
    const w = await ROOM.roomClient().from(REPLAY_TABLE).upsert(send, { onConflict: 'user_id,id', ignoreDuplicates: true });
    if (w.error) throw new Error(w.error.message);
  }
  const have = new Set(local.map(r => r.id));
  const need = Array.from(remote).filter(id => !have.has(id));
  if (!need.length) return 0;
  const r = await ROOM.roomClient().from(REPLAY_TABLE).select('id,data').in('id', need);
  if (r.error) throw new Error(r.error.message);
  return mergeReplays(r.data.map(x => ({ ...x.data, id: x.id })));
}

/* 設定・見た目・お気に入り・RUN・WEEKLY (1人1行)。アカウントから読んで書き換えたら true */
async function syncSaves() {
  const uid = state.user.id;
  const r = await ROOM.roomClient().from(SAVE_TABLE).select('data,updated_at').maybeSingle();
  if (r.error) throw new Error(r.error.message);
  const remote = r.data ? { data: r.data.data, at: Date.parse(r.data.updated_at) } : null;
  const d = SAVE.decide(SAVE.snapshot(), remote, SAVE.loadMeta(uid));
  if (d.apply) SAVE.applySnapshot(d.apply);
  let at = remote ? remote.at : 0;
  if (d.push) {
    const w = await ROOM.roomClient().from(SAVE_TABLE).upsert({ data: d.push }, { onConflict: 'user_id' }).select('updated_at').single();
    if (w.error) throw new Error(w.error.message);
    at = Date.parse(w.data.updated_at);
  }
  SAVE.saveMeta(uid, SAVE.hashOf(SAVE.snapshot()), at);
  return !!d.apply;
}

/* 試合のあとやタブを離れるときに、変わった分だけ送る (失敗しても次の同期で送り直す) */
let saveTimer = null;
function saveSoon() {
  if (!state.user) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const meta = SAVE.loadMeta(state.user.id);
    if (meta && meta.hash === SAVE.hashOf(SAVE.snapshot())) return;
    syncSaves().then((applied) => { if (applied) reloadIfIdle(); }).catch(() => { /* 次の同期で */ });
  }, 1500);
}

/* アカウントの設定を読み込んだら、タイトル画面にいるときだけ読み直して反映する (対戦中は次に開いたときに) */
function reloadIfIdle() {
  const t = document.getElementById('title');
  if (t && !t.hidden && getComputedStyle(t).display !== 'none') location.reload();
  else { state.sync = '別の端末の設定を読み込みました (次に開いたときに反映します)'; changed(); }
}

async function pushRows(rows) {
  if (!rows.length) return;
  const r = await ROOM.roomClient().from(TABLE).upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true });
  if (r.error) throw new Error(r.error.message);
}

/* ブラウザにしかない記録を送り、アカウントにしかない記録を取り込む */
export async function syncRecords() {
  if (!state.user) return;
  state.sync = '同期中…';
  changed();
  try {
    const mark = loadMark(state.user.id);
    const remote = await pullSince(TABLE, 'id,me,opp,win,level,played_at,turns,feats,cards,effects', mark.rec.pulled);
    const local = localRecords();
    const send = local.filter(x => x.at > mark.rec.pushed).map(toRow);
    for (let i = 0; i < send.length; i += 200) await pushRows(send.slice(i, i + 200));
    const added = mergeRecords(remote.map(fromRow));
    mark.rec = { pulled: maxCreated(remote, mark.rec.pulled), pushed: local.reduce((m, x) => Math.max(m, x.at), mark.rec.pushed) };
    const xpAdded = await syncXp(mark);
    saveMark(mark);
    const applied = await syncSaves();
    const rpAdded = await syncReplays();
    state.sync = '同期しました' + (added ? ' (' + added + '戦を読み込み)' : '') + (xpAdded ? ' (経験値 ' + xpAdded + '件を読み込み)' : '') +
      (rpAdded ? ' (リプレイ ' + rpAdded + '件を読み込み)' : '');
    state.error = '';
    if (applied) { changed(); reloadIfIdle(); }
  } catch (e) {
    state.sync = '';
    state.error = '同期できませんでした: ' + e.message;
  }
  setStatsHooks({ onClear: state.user ? clearRemote : null });
  changed();
}

async function clearRemote() {
  const r = await ROOM.roomClient().from(TABLE).delete().eq('user_id', state.user.id);
  if (r.error) throw new Error(r.error.message);
  const m = loadMark(state.user.id);
  saveMark({ ...m, rec: { pulled: null, pushed: 0 } });     // 消したあとは最初から数え直す
}

async function signIn() {
  state.error = '';
  try {
    await ROOM.accountSignInWithGoogle();          // Google の画面へ移る
  } catch (e) {
    state.error = 'ログインできませんでした: ' + e.message;
    changed();
  }
}

async function signOut() {
  try {
    await ROOM.roomSignOut();
    state.user = null;
    state.admin = false;
    state.sync = '';
    setStatsHooks({ onClear: null });
  } catch (e) {
    state.error = 'ログアウトできませんでした: ' + e.message;
  }
  changed();
}

/* このブラウザに残す記録 (アカウントを消すときに一緒に消すもの) */
const LOCAL_KEYS = ['compileSoloRecords', 'compileXpLog', 'compileReplays', 'compileSyncMark', 'compileCloudMeta'].concat(SAVE.SAVE_KEYS);

/* アカウントを消す。サーバーでユーザーを消すと、表の行もすべて一緒に消える (on delete cascade)。
   clearLocal: このブラウザの記録も消す */
async function deleteAccount(clearLocal) {
  await ROOM.roomApi('deleteAccount', { confirm: 'DELETE' });
  try { await ROOM.roomSignOut(); } catch (e) { /* ユーザーはもう無いので失敗してよい */ }
  try {
    for (const k of Object.keys(localStorage)) if (/^sb-.+-auth-token$/.test(k)) localStorage.removeItem(k);
    localStorage.removeItem('compileSyncMark');
    localStorage.removeItem('compileCloudMeta');
    if (clearLocal) for (const k of LOCAL_KEYS) localStorage.removeItem(k);
  } catch (e) { /* private mode */ }
  state.user = null;
  state.sync = '';
}

/* Google から戻ってきたらアカウントの画面を開く (main.js が呼ぶ) */
export function takeAccountResume() {
  try {
    if (localStorage.getItem('compileAccountResume') !== '1') return false;
    localStorage.removeItem('compileAccountResume');
    return true;
  } catch (e) {
    return false;
  }
}

/* アカウントの画面 */
export function openAccount() {
  if (state.deferred) initAccount(true);
  let el = document.getElementById('accountOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'accountOv';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  let deleting = false;
  const render = () => {
    const s = state;
    let body;
    if (!s.ready) body = '<p class="pz-note">読み込み中…</p>';
    else if (!s.available) body = '<p class="pz-note">' + esc(s.error || 'この環境ではログインできません (secure-room-config.js が未設定)') + '</p>';
    else if (!s.user) {
      body = (s.sync ? '<p class="ac-done" role="status">' + esc(s.sync) + '</p>' : '') + '<p class="ac-lead">ログインすると、戦績・経験値・実績・見た目やお気に入り・RUN と WEEKLY の進み具合・保存したリプレイをアカウントに保存します。スマホと PC など、別の端末でも同じ戦績を見られます。</p>' +
        '<div class="pz-row"><button type="button" id="acGoogle" class="ac-google">Google でログイン</button></div>' +
        '<p class="pz-note">ログインしなくても、戦績はこのブラウザに残ります。ログインしたときに、それまでの記録もまとめて保存します。</p>';
    } else {
      body = '<p class="ac-user"><b>' + esc(s.user.name) + '</b>' + (s.user.email ? '<small>' + esc(s.user.email) + '</small>' : '') + '</p>' +
        '<p class="pz-note">' + esc(s.sync || '戦績をアカウントに保存しています') + '</p>' +
        '<div class="pz-row"><button type="button" id="acSync">今すぐ同期</button><button type="button" id="acOut">ログアウト</button>' +
          (s.admin ? '<button type="button" id="acAdmin" class="ac-admin">ADMIN</button>' : '') + '</div>' +
        (deleting
          ? '<div class="ac-del"><p><b>アカウントを削除します。</b>アカウントに保存した戦績・経験値・実績・設定・リプレイ・WEEKLY のクリア者一覧の名前がすべて消え、元に戻せません。</p>' +
            '<label><input type="checkbox" id="acDelLocal"> このブラウザに残っている記録も消す</label>' +
            '<div class="pz-row"><button type="button" id="acDelYes" class="warn">削除する</button><button type="button" id="acDelNo">やめる</button></div></div>'
          : '<button type="button" id="acDel" class="ac-del-link">アカウントを削除</button>');
    }
    el.innerHTML = '<div class="pz-card ac-card" role="dialog" aria-modal="true" aria-label="アカウント">' +
      '<div class="pz-head"><b>ACCOUNT</b><button type="button" class="pz-x" aria-label="閉じる">×</button></div>' +
      body + (s.error && s.available ? '<p class="ac-error" role="alert">' + esc(s.error) + '</p>' : '') + '</div>';
    el.querySelector('.pz-x').onclick = close;
    const g = el.querySelector('#acGoogle'); if (g) g.onclick = signIn;
    const y = el.querySelector('#acSync'); if (y) y.onclick = syncRecords;
    const o = el.querySelector('#acOut'); if (o) o.onclick = signOut;
    const ad = el.querySelector('#acAdmin'); if (ad) ad.onclick = () => { close(); openAdmin(); };
    const d = el.querySelector('#acDel'); if (d) d.onclick = () => { deleting = true; render(); };
    const dn = el.querySelector('#acDelNo'); if (dn) dn.onclick = () => { deleting = false; render(); };
    const dy = el.querySelector('#acDelYes');
    if (dy) {
      dy.onclick = async () => {
        const clearLocal = el.querySelector('#acDelLocal').checked;
        dy.disabled = true;
        dy.textContent = '削除中…';
        try {
          await deleteAccount(clearLocal);
          deleting = false;
          state.error = '';
          state.sync = 'アカウントを削除しました' + (clearLocal ? ' (このブラウザの記録も消しました)' : '');
          changed();
          if (clearLocal) setTimeout(() => location.reload(), 1600);    // 画面の数字を空の記録に合わせる
        } catch (e) {
          state.error = '削除できませんでした: ' + e.message;
          deleting = false;
          changed();
        }
      };
    }
  };
  const off = onAccountChange(render);
  const close = () => { off(); el.classList.remove('show'); };
  el.onclick = (ev) => { if (ev.target === el) close(); };
  render();
  el.classList.add('show');
}

/* ---------- 週替わり3連戦のクリア者一覧 ----------
   読むのはログインしなくてもよい。載せるのはログインした本人だけ (1週1回) */
const WEEKLY_TABLE = 'weekly_clears';

export async function fetchWeeklyClears(week) {
  await ROOM.roomLoadDeps();
  if (!ROOM.roomConfigured()) throw new Error('サーバーが未設定です');
  const r = await ROOM.roomClient().from(WEEKLY_TABLE).select('name,attempts,cleared_at')
    .eq('week', week).order('cleared_at', { ascending: true }).limit(100);
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export async function submitWeeklyClear(week, name, attempts, decks) {
  if (state.deferred || !state.ready) await initAccount(true);
  if (!state.user) throw new Error('ログインすると名前を載せられます (右上のログインから)');
  const r = await ROOM.roomClient().from(WEEKLY_TABLE).insert({ week, name, attempts, decks });
  if (r.error) {
    if (/duplicate|unique/i.test(r.error.message)) throw new Error('今週はもう載っています');
    throw new Error(r.error.message);
  }
}
