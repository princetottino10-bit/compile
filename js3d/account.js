/* =========================================================================
 * アカウント (Google ログイン) と戦績の保存
 *   ログインしていれば、CPU 戦の記録 (stats.js) をアカウントに保存し、
 *   別の端末で記録した分も読み込む。ブラウザの記録はログインしなくても残る。
 *   ゲスト (オンライン対戦用の匿名ログイン) はログインしていない扱い。
 * ========================================================================= */
import { displayName, nameFieldHtml, bindNameField } from './displayname.js';
import * as ROOM from './room.js';
import { localRecords, mergeRecords, setStatsHooks } from './stats.js';
import { xpLog, mergeXp, setXpHooks, bonusXp } from './xp.js';
import { playerLevel } from './stats-data.js';
import { friendlyMessage, rawText, noteError } from './errtext.js';
import { isOnline, onNetChange, OFFLINE_TEXT } from './net.js';
import { notice } from './notice.js';
import { setSignedInGate } from './settings.js';
import * as SAVE from './cloudsave.js';
import { openAdmin } from './admin-ui.js';
import { pinnedReplays, mergeReplays, setReplayHooks } from './replays.js';
import { raise } from './dialogs.js';

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

const state = { ready: false, available: false, user: null, sync: '', error: '', errorRaw: '', admin: false };
const listeners = new Set();
function changed() { for (const fn of listeners) fn(state); }
/* 失敗を、遊ぶ人に分かる言葉で出す (元の文は「くわしく」と報告用の情報に残す。errtext.js) */
function fail(prefix, e) {
  noteError(e);
  state.error = prefix + friendlyMessage(e, { online: isOnline() });
  state.errorRaw = rawText(e);
}
/* 設定の画面に「この設定はアカウントにも保存されます」と出すため */
setSignedInGate(() => !!state.user);

/* 最後に同期できた時刻 (ACCOUNT に「最終同期 12:34」と出す) */
const LAST_SYNC = 'compileLastSync';
function lastSyncAt(user) {
  try { const m = JSON.parse(localStorage.getItem(LAST_SYNC) || 'null'); return m && m.user === user ? m.at : 0; } catch (e) { return 0; }
}
function noteSynced(user) { try { localStorage.setItem(LAST_SYNC, JSON.stringify({ user, at: Date.now() })); } catch (e) { /* 覚えられなくても同期はできている */ } }
const pad2 = (n) => String(n).padStart(2, '0');
function clockText(at) {
  const d = new Date(at), now = new Date();
  const hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  return d.toDateString() === now.toDateString() ? hm : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
}

/* アカウントの記録を読み込んで画面を読み直したあとに、一度だけ知らせる */
const LOADED_FLAG = 'compileSyncLoaded';
function showLoadedNotice() {
  try {
    if (sessionStorage.getItem(LOADED_FLAG) !== '1') return;
    sessionStorage.removeItem(LOADED_FLAG);
  } catch (e) { return; }
  notice({ id: 'syncLoaded', title: 'ACCOUNT', text: 'アカウントの記録を読み込みました' });
}
export function onAccountChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function accountState() { return state; }

/* ブラウザの記録 ⇔ 表の行 */
const toRow = (r) => ({
  id: r.id, me: r.me, opp: r.opp, win: !!r.win,
  level: Number.isInteger(r.level) ? r.level : null, played_at: new Date(r.at).toISOString(),
  turns: Number.isInteger(r.turns) ? r.turns : null, feats: Array.isArray(r.feats) ? r.feats.slice(0, 32) : [],
  cards: Array.isArray(r.cards) ? r.cards.slice(0, 64) : [],
  effects: r.effects && typeof r.effects === 'object' ? r.effects : {},
  mode: ['cpu', 'quick', 'run', 'weekly', 'tutorial'].includes(r.mode) ? r.mode : null
});
const fromRow = (row) => ({
  id: row.id, me: row.me, opp: row.opp, win: row.win, level: row.level, at: Date.parse(row.played_at),
  turns: row.turns, feats: row.feats || [], cards: row.cards || [], effects: row.effects || {},
  ...(row.mode ? { mode: row.mode } : {})
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
  showLoadedNotice();
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
      pushRows([toRow(rec)]).catch((e) => { fail('戦績を保存できませんでした (次の同期で送り直します)。', e); changed(); });
    },
    onClear: state.user ? clearRemote : null,
    note: () => (state.user ? (displayName() || 'あなた') + ' のアカウントにも保存しています' : 'ログインすると、戦績をアカウントに保存して別の端末でも見られます')
  });
  setXpHooks({
    onGrant: (entry) => {
      if (!state.user) return;
      saveSoon();
      pushXp([xpToRow(entry)]).catch((e) => { fail('経験値を保存できませんでした (次の同期で送り直します)。', e); changed(); });
    }
  });
  setReplayHooks({
    onPin: (r) => {
      if (!state.user) return;
      ROOM.roomClient().from(REPLAY_TABLE).upsert(replayRow(r), { onConflict: 'user_id,id' })
        .then((w) => { if (w.error) { fail('リプレイを保存できませんでした (次の同期で送り直します)。', w.error); changed(); } });
    },
    onUnpin: (id) => {
      if (!state.user) return;
      ROOM.roomClient().from(REPLAY_TABLE).delete().eq('id', id).then(() => {});
    }
  });
  /* 隠れたら送る。戻ってきたら、1分以上たっていれば読み直す (スマホはアプリを開いたままにすることが多く、
     ページを開いたときにしか読まなかったので、別の端末で取った実績や戦績がいつまでも出てこなかった) */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { saveSoon(); return; }
    /* 対戦の途中では読まない (対戦中の同期で週替わりの進み具合が書き戻ったことがある)。メニューの画面にいるときだけ */
    const inMenu = document.body.classList.contains('pregame');
    if (state.user && inMenu && state.sync !== '同期中…' && Date.now() - lastSyncAt(state.user.id) > 60 * 1000) syncRecords();
  });
  /* つながったら、オフラインの間に遊んだ分をすぐ送る (オフラインの間の失敗の知らせも消す) */
  onNetChange((on) => { if (on && state.user) syncRecords(); else changed(); });
  changed();
  if (state.user) { syncRecords(); checkAdmin(); }
}

/* 管理者か (サーバーが admins 表で決める)。管理者なら ACCOUNT に ADMIN の入口を出す */
async function checkAdmin() {
  try {
    const r = await ROOM.roomApi('whoami');
    state.admin = !!(r && r.admin);
    state.collect = !!(r && r.collect);
    state.collectAt = Date.now();
  } catch (e) {
    state.admin = false;
    state.collectAt = Date.now();
  }
  changed();
}

async function pushXp(rows) {
  await pushTolerant(XP_TABLE, rows, null);
}

/* まとめて送って、表の決まりに合わない行 (値の範囲外など) があって断られたら、1行ずつ送り直す。
   合わない行は直せるところ (fix) を直してもう一度、それでもだめなら飛ばす。
   前は1行の不合格でまとめて失敗し、その先の戦績・経験値がずっと送れなくなっていた
   (下剋上タッグの難易度 21 が、戦績の表の「20 まで」に合わず、2026-10-07 にぱうぷるさんの同期が止まった) */
const isRowReject = (e) => !!e && /^2[23]/.test(String(e.code || ''));       // 22xxx: 値の誤り / 23xxx: 決まり違反
async function pushTolerant(table, rows, fix) {
  if (!rows.length) return;
  const c = ROOM.roomClient();
  const opts = { onConflict: 'user_id,id', ignoreDuplicates: true };
  const r = await c.from(table).upsert(rows, opts);
  if (!r.error) return;
  if (!isRowReject(r.error)) throw new Error(r.error.message);
  for (const row of rows) {
    let e = (await c.from(table).upsert([row], opts)).error;
    if (e && isRowReject(e) && fix) e = (await c.from(table).upsert([fix(row)], opts)).error;
    if (e && !isRowReject(e)) throw new Error(e.message);
  }
}

/* 経験値の帳簿も、戦績と同じく差分を送り合う。読み込んだ件数を返す */
async function syncXp(mark) {
  const remote = await pullSince(XP_TABLE, 'id,src,xp,earned_at', mark.xp.pulled);
  const local = xpLog();
  const send = local.filter(x => x.at > mark.xp.pushed).map(xpToRow);
  for (let i = 0; i < send.length; i += 200) await pushXp(send.slice(i, i + 200));
  const added = mergeXp(remote.map(xpFromRow));
  mark.xp = { pulled: maxCreated(remote, mark.xp.pulled), pushed: local.reduce((m, x) => Math.max(m, x.at), mark.xp.pushed) };
  return { added, rows: remote };
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

/* 設定・見た目・お気に入り・RUN・WEEKLY (1人1行)。アカウントから読んで書き換えたら true。
   compare: この端末で初めての同期のときの、両方のレベルと戦数 ({ device, account })。
   食い違う中身があれば、上書きする前にどちらを残すか聞く */
async function syncSaves(compare) {
  const uid = state.user.id;
  const r = await ROOM.roomClient().from(SAVE_TABLE).select('data,updated_at').maybeSingle();
  if (r.error) throw new Error(r.error.message);
  const remote = r.data ? { data: r.data.data, at: Date.parse(r.data.updated_at) } : null;
  const meta = SAVE.loadMeta(uid);
  const local = SAVE.snapshot();
  let keepDevice = false;
  if (!meta && remote && compare && (compare.device.games > 0 || compare.device.xp > 0) && SAVE.conflictKeys(local, remote.data).length) {
    keepDevice = (await askWhichToKeep(compare)) === 'device';
  }
  const d = SAVE.decide(local, remote, meta, { keepDevice });
  /* この端末で初めての同期は、アカウントの中身で上書きする。その端末にしかなかった中身が黙って消えないよう、
     上書きの前に控えを残す (compileSaveBackup。ACCOUNT の「上書き前のデータに戻す」で戻せる) */
  if (!meta && keepDevice && d.push) SAVE.backupLocal(SAVE.cleanRemote(remote.data), 'account');
  else if (d.apply && !meta) SAVE.backupLocal(local, 'device');
  if (d.apply) SAVE.applySnapshot(d.apply);
  let at = remote ? remote.at : 0;
  if (d.push) {
    const w = await ROOM.roomClient().from(SAVE_TABLE).upsert({ data: d.push }, { onConflict: 'user_id' }).select('updated_at').single();
    if (w.error) throw new Error(w.error.message);
    at = Date.parse(w.data.updated_at);
  }
  /* 印は、送った (または書いた) 中身で作る。送っている間に変わった分は、次の saveSoon で送られる */
  SAVE.saveMeta(uid, SAVE.hashOf(d.push || d.apply || local), at);
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
    if (!isOnline()) return;                 // つながったときに送る (onNetChange)
    syncSaves().then((applied) => { if (applied) reloadIfIdle(); }).catch(() => { /* 次の同期で */ });
  }, 1500);
}

/* アカウントの設定を読み込んだら、タイトル画面にいるときだけ読み直して反映する (対戦中は次に開いたときに) */
function reloadIfIdle() {
  const t = document.getElementById('title');
  if (t && !t.hidden && getComputedStyle(t).display !== 'none') {
    try { sessionStorage.setItem(LOADED_FLAG, '1'); } catch (e) { /* 知らせが出ないだけ */ }
    location.reload();
  }
  else { state.sync = '別の端末の設定を読み込みました (次に開いたときに反映します)'; changed(); }
}

async function pushRows(rows) {
  /* 合わなかった行は、範囲外になりやすいところ (難易度・効果の集計) を外して送り直す */
  await pushTolerant(TABLE, rows, (row) => ({ ...row, level: null, effects: {}, feats: [] }));
}

/* このブラウザの記録が誰のものか。前にほかのアカウントで同期していれば、その人の記録 (compileSyncMark の user でもわかる)。
   別のアカウントで入り直したとき、前の人の戦績・経験値・実績・ガチャの見た目を新しいアカウントに混ぜないため */
const OWNER = 'compileLocalOwner';
function localOwner() {
  try {
    const o = localStorage.getItem(OWNER);
    if (o) return o;
    const m = JSON.parse(localStorage.getItem(MARK) || 'null');
    return m && m.user ? m.user : null;
  } catch (e) {
    return null;
  }
}
/* 前の人の記録を控えに移してから、このブラウザの記録を空にする (新しいアカウントの中身を読み込み直す) */
function switchOwner(prev) {
  try {
    const keep = {};
    for (const k of LOCAL_KEYS) { const v = localStorage.getItem(k); if (v !== null) keep[k] = v; }
    localStorage.setItem('compileOwnerBackup', JSON.stringify({ at: Date.now(), user: prev, data: keep }));
  } catch (e) { /* 容量が足りなければ控えは諦める (記録は前のアカウントに残っている) */ }
  try { for (const k of LOCAL_KEYS) localStorage.removeItem(k); } catch (e) { /* private mode */ }
}

/* ブラウザにしかない記録を送り、アカウントにしかない記録を取り込む */
export async function syncRecords() {
  if (!state.user) return;
  if (!isOnline()) { state.sync = ''; state.error = OFFLINE_TEXT; state.errorRaw = ''; changed(); return; }
  state.sync = '同期中…';
  changed();
  try {
    /* ログインしたことのないブラウザの記録 (持ち主なし) は、はじめてログインしたアカウントに引き継ぐ。
       ほかのアカウントの記録なら、混ぜずに入れ替える */
    const owner = localOwner();
    const switched = !!(owner && owner !== state.user.id);
    if (switched) switchOwner(owner);
    try { localStorage.setItem(OWNER, state.user.id); } catch (e) { /* private mode */ }
    const mark = loadMark(state.user.id);
    /* この端末で初めて同期する: 上書きの前に「この端末」と「アカウント」のレベル・戦数を比べて見せるため、混ぜる前に数える */
    const firstHere = !switched && !SAVE.loadMeta(state.user.id) && mark.rec.pulled === null && mark.xp.pulled === null;
    const deviceSum = firstHere ? summarize(localRecords(), xpLog()) : null;
    const remote = await pullSince(TABLE, 'id,me,opp,win,level,played_at,turns,feats,cards,effects', mark.rec.pulled);
    const local = localRecords();
    const send = local.filter(x => x.at > mark.rec.pushed).map(toRow);
    for (let i = 0; i < send.length; i += 200) await pushRows(send.slice(i, i + 200));
    const added = mergeRecords(remote.map(fromRow));
    mark.rec = { pulled: maxCreated(remote, mark.rec.pulled), pushed: local.reduce((m, x) => Math.max(m, x.at), mark.rec.pushed) };
    const xp = await syncXp(mark);
    const xpAdded = xp.added;
    saveMark(mark);
    const compare = deviceSum ? { device: deviceSum, account: summarize(remote.map(fromRow), xp.rows.map(xpFromRow)) } : null;
    const applied = await syncSaves(compare);
    const rpAdded = await syncReplays();
    state.sync = '同期しました' + (added ? ' (' + added + '戦を読み込み)' : '') + (xpAdded ? ' (経験値 ' + xpAdded + '件を読み込み)' : '') +
      (rpAdded ? ' (リプレイ ' + rpAdded + '件を読み込み)' : '');
    state.error = '';
    /* この画面で1回でも同期できた (実績の判定し直しは、記録がそろってから) */
    if (!state.syncedOnce) { state.syncedOnce = true; try { window.dispatchEvent(new CustomEvent('compile:synced')); } catch (e) { /* 古いブラウザ */ } }
    state.errorRaw = '';
    noteSynced(state.user.id);
    if (applied || switched) { changed(); reloadIfIdle(); }
  } catch (e) {
    state.sync = '';
    fail('同期できませんでした。', e);
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
    fail('ログインできませんでした。', e);
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
    fail('ログアウトできませんでした。', e);
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

/* ログインしていない人に、ログインで何ができるかを必要な場面で一度だけ知らせる。
   reason ごとに1回 (compileLoginHints)。ログイン中・ログインが使えない環境では出さない */
const HINTS = {
  firstWin: 'この記録はこのブラウザにだけ残っています。ログインすると、別の端末でも同じ続きから遊べます。',
  rarePull: 'レアな見た目を引きました！ いまはこのブラウザにだけ残っています。ブラウザのデータが消えると一緒に消えます。ログインでアカウントに保存しましょう。',
  gacha: 'ガチャで引いた見た目・CHIP は、ログインするとアカウントに保存され、別の端末でも使えます。',
  runWin: '勝ち抜き戦の途中経過・パッチ・HEAT は、ログインすると別の端末でも続きから遊べます。',
  level: 'レベルが上がりました。レベル・報酬・実績は、ログインするとアカウントに守られます。',
  tsume: 'COMPUZZLE の進み具合は、ログインするとアカウントに保存されます。',
  trophy: '実績を取りました。ログインすると、実績と記録がアカウントに残ります。'
};
/** ログインを勧める場面か (ログインしていない・ログインが使える・ログイン状態を読み終えた) */
export function loginNudgeNeeded() {
  return !state.user && state.ready && (state.available || state.deferred);
}
export function maybeLoginHint(reason) {
  if (!HINTS[reason] || !loginNudgeNeeded()) return;
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem('compileLoginHints') || '{}') || {}; } catch (e) { seen = {}; }
  if (seen[reason]) return;
  seen[reason] = Date.now();
  try { localStorage.setItem('compileLoginHints', JSON.stringify(seen)); } catch (e) { return; }
  let el = document.getElementById('loginHint');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loginHint';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = '<p>' + esc(HINTS[reason]) + '</p><div><button type="button" data-h="login" class="go">ログインして守る</button><button type="button" data-h="close" aria-label="閉じる">×</button></div>';
  el.classList.add('show');
  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    el.classList.remove('show');
    if (b.dataset.h === 'login') openAccount();
  };
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

/* レベルと戦数 (この端末とアカウントを比べて見せる) */
function summarize(records, xpEntries) {
  const bonus = bonusXp(xpEntries);
  return { level: playerLevel(records, bonus).level, games: records.length, xp: bonus };
}

/* この端末で初めて同期するとき、アカウントとこの端末で中身が違えば、どちらを残すか聞く。
   戦績・経験値はどちらを選んでも両方を合わせて残す (選ぶのは設定・見た目・進み具合)。決めるまで閉じない */
function askWhichToKeep(c) {
  return new Promise((resolve) => {
    let el = document.getElementById('keepOv');
    if (!el) {
      el = document.createElement('div');
      el.id = 'keepOv';
      el.className = 'pz-ov';
      document.body.appendChild(el);
    }
    const side = (key, label, v) => '<button type="button" class="kp-side" data-keep="' + key + '"><b>' + label + '</b>' +
      '<span>LV ' + v.level + ' / ' + v.games + '戦</span><small>' + (key === 'device' ? 'この端末の設定・見た目・進み具合を残す' : 'アカウントの設定・見た目・進み具合を使う') + '</small></button>';
    el.innerHTML = '<div class="pz-card kp-card" role="dialog" aria-modal="true" aria-label="どちらの記録を残すか">' +
      '<div class="pz-head"><b>SYNC<small>どちらを残しますか</small></b></div>' +
      '<p class="pz-note">この端末とアカウントで、設定・見た目・進み具合が違います。どちらを残すか選んでください。戦績と経験値は、どちらを選んでも両方を合わせて残します。</p>' +
      '<div class="kp-sides">' + side('device', 'この端末', c.device) + side('account', 'アカウント', c.account) + '</div>' +
      '<p class="pz-note">残さなかった方の中身は控えに残ります (ACCOUNT の「上書き前のデータに戻す」で戻せます)。</p></div>';
    el.classList.add('show');
    raise(el);
    el.onclick = (ev) => {
      const b = ev.target.closest('[data-keep]');
      if (!b) return;
      el.classList.remove('show');
      resolve(b.dataset.keep);
    };
  });
}

/* ---------- 上書き前のデータに戻す ----------
   compileSaveBackup: この端末で初めて同期したとき、アカウントの中身で上書きする前のこの端末の中身 (cloudsave.js)
   compileOwnerBackup: 別のアカウントで入り直したとき、前の人の記録 (同じ人でログインしているときだけ戻せる) */
function readBackup(key) {
  try { const b = JSON.parse(localStorage.getItem(key) || 'null'); return b && b.data && typeof b.data === 'object' ? b : null; } catch (e) { return null; }
}
function backups() {
  const out = [];
  const sb = readBackup('compileSaveBackup');
  if (sb) out.push({ key: 'compileSaveBackup', at: sb.at, label: sb.from === 'account' ? 'この端末の方を残す前の、アカウントの設定・見た目・進み具合' : 'アカウントで上書きする前の、この端末の設定・見た目・進み具合' });
  const ob = readBackup('compileOwnerBackup');
  if (ob && state.user && ob.user === state.user.id) out.push({ key: 'compileOwnerBackup', at: ob.at, label: '別のアカウントに切り替える前のこの端末の記録' });
  return out;
}
const dateText = (at) => { const d = new Date(at); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
function restoreHtml() {
  const list = backups();
  if (!list.length) return '';
  return '<div class="ac-restore">' + list.map(b => '<div class="st-row st-act"><span>上書き前のデータに戻す<small>' + esc(b.label) + ' (' + dateText(b.at) + ' の控え)</small></span>' +
    '<button type="button" data-restore="' + b.key + '">戻す</button></div>').join('') + '</div>';
}
function bindRestore(el, render) {
  el.querySelectorAll('[data-restore]').forEach(btn => {
    btn.onclick = () => {
      /* 1回目で確かめ、もう一度押したら戻す */
      if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = 'もう一度押すと戻します'; btn.classList.add('warn'); return; }
      const key = btn.dataset.restore;
      const b = readBackup(key);
      if (!b) { render(); return; }
      try {
        if (key === 'compileSaveBackup') SAVE.applySnapshot(SAVE.cleanRemote(b.data));
        else for (const [k, v] of Object.entries(b.data)) if (LOCAL_KEYS.includes(k) && typeof v === 'string') localStorage.setItem(k, v);
        localStorage.removeItem(key);
      } catch (e) {
        fail('戻せませんでした。', e);
        changed();
        return;
      }
      /* 戻した中身は、次の同期でアカウントにも送られる (この端末の方が新しい扱い) */
      state.error = '';
      const t = document.getElementById('title');
      if (t && !t.hidden && getComputedStyle(t).display !== 'none') { location.reload(); return; }
      state.sync = '上書き前のデータに戻しました (次に開いたときに反映します)';
      changed();
    };
  });
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
  /* Google の画面でやめて戻ってきた (room.js が印を残す) */
  try {
    if (sessionStorage.getItem('compileOAuthError') === '1') {
      sessionStorage.removeItem('compileOAuthError');
      state.error = 'ログインを中断しました。もう一度どうぞ';
      state.errorRaw = '';
    }
  } catch (e) { /* private mode */ }
  const render = () => {
    const s = state;
    const online = isOnline();
    let body;
    if (!s.ready) body = '<div class="ac-loading" role="status"><div class="ro-loader" aria-hidden="true"><i></i><i></i><i></i><b></b></div><p class="pz-note">アカウントを読み込んでいます…</p></div>';
    else if (!s.available) body = '<p class="pz-note">' + esc(s.error || 'この環境ではログインできません') + '</p>';
    else if (!s.user) {
      body = (s.sync ? '<p class="ac-done" role="status">' + esc(s.sync) + '</p>' : '') + '<p class="ac-lead">ログインすると、こんなことができるようになります。</p>' +
        '<ul class="ac-perks">' +
          '<li><b>記録がずっと残る</b><span>戦績・レベル・実績・リプレイをアカウントに保存。スマホと PC で同じ続きから遊べる</span></li>' +
          '<li><b>レート戦</b><span>オンラインでレートを競い、月ごとの順位表に載る</span></li>' +
          '<li><b>WEEKLY に名前が載る</b><span>週替わり3連戦をクリアしたら、クリア者の一覧に名前を載せられる</span></li>' +
          '<li><b>見た目・設定・RUN・COMPUZZLE の進み具合も</b><span>ガチャで引いた見た目、設定、勝ち抜き戦の途中、詰めコンパイルの進み具合も一緒に残る</span></li>' +
        '</ul>' +
        '<div class="pz-row"><button type="button" id="acGoogle" class="ac-google"' + (online ? '' : ' disabled') + '>Google でログイン</button></div>' +
        (online ? '' : '<p class="ac-offline" role="status">' + esc(OFFLINE_TEXT) + '</p>') +
        '<p class="pz-note">Google の名前は人に見えません (ほかの人に見えるのは、自分で決めた表示名だけです)。</p>' +
        '<p class="pz-note">ログインしなくても、戦績はこのブラウザに残ります。ログインしたときに、それまでの記録もまとめて保存します。</p>' +
        restoreHtml();
    } else {
      body = '<p class="ac-user"><b>' + esc(displayName() || '表示名なし') + '</b>' + (s.user.email ? '<small>' + esc(s.user.email) + '</small>' : '') + '</p>' +
        nameFieldHtml('ac') +
        '<p class="pz-note">' + esc(s.sync || '戦績をアカウントに保存しています') +
          (lastSyncAt(s.user.id) ? '<span class="ac-last">最終同期 ' + clockText(lastSyncAt(s.user.id)) + '</span>' : '') + '</p>' +
        (online ? '' : '<p class="ac-offline" role="status">' + esc(OFFLINE_TEXT) + ' つながったら自動で同期します。</p>') +
        '<div class="pz-row"><button type="button" id="acSync"' + (online ? '' : ' disabled') + '>今すぐ同期</button><button type="button" id="acOut">ログアウト</button>' +
          (s.admin ? '<button type="button" id="acAdmin" class="ac-admin">ADMIN</button>' : '') + '</div>' +
        (deleting
          ? '<div class="ac-del"><p><b>アカウントを削除します。</b>アカウントに保存した戦績・経験値・実績・設定・リプレイ・WEEKLY のクリア者一覧の名前がすべて消え、元に戻せません。</p>' +
            '<label><input type="checkbox" id="acDelLocal"> このブラウザに残っている記録も消す</label>' +
            '<div class="pz-row"><button type="button" id="acDelYes" class="warn">削除する</button><button type="button" id="acDelNo">やめる</button></div></div>'
          : '<button type="button" id="acDel" class="ac-del-link">アカウントを削除</button>') +
        restoreHtml();
    }
    el.innerHTML = '<div class="pz-card ac-card" role="dialog" aria-modal="true" aria-label="アカウント">' +
      '<div class="pz-head"><b>ACCOUNT<small>アカウント</small></b><button type="button" class="pz-x"><span>閉じる</span></button></div>' +
      body + (s.error && s.available ? '<p class="ac-error" role="alert">' + esc(s.error) +
        (s.errorRaw ? '<details class="ac-raw"><summary>くわしく (報告用)</summary><code>' + esc(s.errorRaw) + '</code></details>' : '') + '</p>' : '') + '</div>';
    bindRestore(el, render);
    el.querySelector('.pz-x').onclick = close;
    const g = el.querySelector('#acGoogle'); if (g) g.onclick = signIn;
    const y = el.querySelector('#acSync'); if (y) y.onclick = syncRecords;
    const o = el.querySelector('#acOut'); if (o) o.onclick = signOut;
    bindNameField(el, 'ac', () => render());
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
          fail('削除できませんでした。', e);
          deleting = false;
          changed();
        }
      };
    }
  };
  const offNet = onNetChange(() => { if (el.classList.contains('show')) render(); });
  const off = () => { offAcc(); offNet(); };
  const offAcc = onAccountChange(render);
  const close = () => { off(); el.classList.remove('show'); };
  el.onclick = (ev) => { if (ev.target === el) close(); };
  render();
  el.classList.add('show');
  raise(el);   // 開いたままの画面をもう一度開いたときも、いちばん手前へ
}

/* 棋譜を残す (サーバーの replay_collect に載っている人だけ。本人の許可を取ってから管理者が載せる)。失敗しても遊ぶのは止めない */
export async function uploadReplay(rep) {
  if (!state.user || !rep) return;
  /* 開いたあとで載せてもらった人もいる (ページを開いたときに1回聞くだけだと、開きっぱなしの間ずっと残らなかった)。
     載っていないと聞いてから10分たっていたら、もう一度聞く */
  if (!state.collect && Date.now() - (state.collectAt || 0) > 10 * 60 * 1000) await checkAdmin();
  if (!state.collect) return;
  try { await ROOM.roomApi('saveReplay', { replay: rep }); } catch (e) { /* 次の対戦で送ればよい */ }
}

/* ---------- 週替わり3連戦のクリア者一覧 ----------
   読むのはログインしなくてもよい。載せるのはログインした本人だけ (1週1回) */
const WEEKLY_TABLE = 'weekly_clears';

export async function fetchWeeklyClears(week) {
  await ROOM.roomLoadDeps();
  if (!ROOM.roomConfigured()) throw new Error('サーバーが未設定です');
  const r = await ROOM.roomClient().from(WEEKLY_TABLE).select('name,cleared_at')          // 挑戦回数はみんなの一覧には出さない
    .eq('week', week).order('cleared_at', { ascending: true }).limit(100);
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/* 載せるのはサーバー (weeklySubmit)。3戦のリプレイを当て直して勝ちを確かめてから載せる */
export async function submitWeeklyClear(week, name, attempts, replays) {
  if (state.deferred || !state.ready) await initAccount(true);
  if (!state.user) throw new Error('ログインすると名前を載せられます (右上のログインから)');
  await ROOM.roomApi('weeklySubmit', {
    week, name, attempts, replays: replays.map(r => ({ init: r.init, actions: r.actions }))
  });
}
