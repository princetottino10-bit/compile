/* =========================================================================
 * アカウント (Google ログイン) と戦績の保存
 *   ログインしていれば、CPU 戦の記録 (stats.js) をアカウントに保存し、
 *   別の端末で記録した分も読み込む。ブラウザの記録はログインしなくても残る。
 *   ゲスト (オンライン対戦用の匿名ログイン) はログインしていない扱い。
 * ========================================================================= */
import * as ROOM from './room.js';
import { localRecords, mergeRecords, setStatsHooks } from './stats.js';

const TABLE = 'player_records';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = { ready: false, available: false, user: null, sync: '', error: '' };
const listeners = new Set();
function changed() { for (const fn of listeners) fn(state); }
export function onAccountChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function accountState() { return state; }

/* ブラウザの記録 ⇔ 表の行 */
const toRow = (r) => ({
  id: r.id, me: r.me, opp: r.opp, win: !!r.win,
  level: Number.isInteger(r.level) ? r.level : null, played_at: new Date(r.at).toISOString(),
  turns: Number.isInteger(r.turns) ? r.turns : null, feats: Array.isArray(r.feats) ? r.feats.slice(0, 32) : [],
  cards: Array.isArray(r.cards) ? r.cards.slice(0, 64) : []
});
const fromRow = (row) => ({
  id: row.id, me: row.me, opp: row.opp, win: row.win, level: row.level, at: Date.parse(row.played_at),
  turns: row.turns, feats: row.feats || [], cards: row.cards || []
});

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
        if (next && next.id !== was) syncRecords();
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
      pushRows([toRow(rec)]).catch((e) => { state.error = '戦績を保存できませんでした (次の同期で送り直します): ' + e.message; changed(); });
    },
    onClear: state.user ? clearRemote : null,
    note: () => (state.user ? state.user.name + ' のアカウントにも保存しています' : 'ログインすると、戦績をアカウントに保存して別の端末でも見られます')
  });
  changed();
  if (state.user) syncRecords();
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
    const remote = [];
    for (let from = 0; ; from += 1000) {
      const r = await ROOM.roomClient().from(TABLE).select('id,me,opp,win,level,played_at,turns,feats,cards')
        .order('played_at', { ascending: true }).range(from, from + 999);
      if (r.error) throw new Error(r.error.message);
      remote.push(...r.data);
      if (r.data.length < 1000) break;
    }
    const have = new Set(remote.map(x => x.id));
    const missing = localRecords().filter(x => !have.has(x.id)).map(toRow);
    for (let i = 0; i < missing.length; i += 200) await pushRows(missing.slice(i, i + 200));
    const added = mergeRecords(remote.map(fromRow));
    state.sync = '同期しました' + (added ? ' (' + added + '戦を読み込み)' : '');
    state.error = '';
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
    state.sync = '';
    setStatsHooks({ onClear: null });
  } catch (e) {
    state.error = 'ログアウトできませんでした: ' + e.message;
  }
  changed();
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
  const render = () => {
    const s = state;
    let body;
    if (!s.ready) body = '<p class="pz-note">読み込み中…</p>';
    else if (!s.available) body = '<p class="pz-note">' + esc(s.error || 'この環境ではログインできません (secure-room-config.js が未設定)') + '</p>';
    else if (!s.user) {
      body = '<p class="ac-lead">ログインすると、CPU 戦の戦績をアカウントに保存します。スマホと PC など、別の端末でも同じ戦績を見られます。</p>' +
        '<div class="pz-row"><button type="button" id="acGoogle" class="ac-google">Google でログイン</button></div>' +
        '<p class="pz-note">ログインしなくても、戦績はこのブラウザに残ります。ログインしたときに、それまでの記録もまとめて保存します。</p>';
    } else {
      body = '<p class="ac-user"><b>' + esc(s.user.name) + '</b>' + (s.user.email ? '<small>' + esc(s.user.email) + '</small>' : '') + '</p>' +
        '<p class="pz-note">' + esc(s.sync || '戦績をアカウントに保存しています') + '</p>' +
        '<div class="pz-row"><button type="button" id="acSync">今すぐ同期</button><button type="button" id="acOut">ログアウト</button></div>';
    }
    el.innerHTML = '<div class="pz-card ac-card" role="dialog" aria-modal="true" aria-label="アカウント">' +
      '<div class="pz-head"><b>アカウント</b><button type="button" class="pz-x" aria-label="閉じる">×</button></div>' +
      body + (s.error && s.available ? '<p class="ac-error" role="alert">' + esc(s.error) + '</p>' : '') + '</div>';
    el.querySelector('.pz-x').onclick = close;
    const g = el.querySelector('#acGoogle'); if (g) g.onclick = signIn;
    const y = el.querySelector('#acSync'); if (y) y.onclick = syncRecords;
    const o = el.querySelector('#acOut'); if (o) o.onclick = signOut;
  };
  const off = onAccountChange(render);
  const close = () => { off(); el.classList.remove('show'); };
  el.onclick = (ev) => { if (ev.target === el) close(); };
  render();
  el.classList.add('show');
}
