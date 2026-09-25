/* =========================================================================
 * CPU 戦の戦績以外で入る経験値 (オンライン対戦・チュートリアル・問題・勝ち抜き戦のクリアなど)
 *   CPU 戦の分は戦績 (stats.js) から数える。ここは「どこで何点入ったか」の帳簿だけ持つ。
 *   once: 同じ key では2回入らない (レッスンの初回クリア、同じ部屋の同じ決着を読み直したときなど)
 * ========================================================================= */

const KEY = 'compileXpLog';
const MAX = 3000;
/* アカウント連携 (account.js) が差し込む口。xp.js 自体は通信しない */
const hooks = { onGrant: null };
export function setXpHooks(h) { Object.assign(hooks, h); }

/* 同期で同じ1件を見分けるための id。key があれば key から (どの端末でも同じ id になり、2回入らない) */
const ID_RE = /^[A-Za-z0-9_:.-]{1,64}$/;
const idFromKey = (key) => 'k:' + String(key).replace(/[^A-Za-z0-9_:.-]/g, '').slice(0, 60);
const idOf = (e) => (e.id && ID_RE.test(e.id) ? e.id : e.key ? idFromKey(e.key) : 'x' + e.at + '_' + e.src);

/* 入る量。CPU 戦は 1戦 +1・勝ち +2・つよい以上に勝つと +1 (stats-data.js) */
export const XP_GAIN = {
  onlinePlay: 3,       // オンライン対戦を最後まで (人との対戦なので CPU 戦より多め)
  onlineWin: 5,        // そのうえ勝つと (勝てば合計 +8。CPU 戦は最大 +4)
  lesson: 2,           // チュートリアルのレッスン (初回)
  tutorialAll: 5,      // チュートリアルを全部 (初回)
  puzzle: 3,           // 問題を解く (問題ごとに初回)
  tsume1: 3,           // COMPUZZLE (詰めコンパイル) 初級を解く (問題ごとに初回)
  tsume2: 5,           // 中級
  tsume3: 8,           // 上級
  tsumeDaily: 5,       // 今日の問題 (日ごとに)
  runClear: 10,        // 勝ち抜き戦 (8人) を全勝クリア
  weeklyClear: 10      // 週替わり3連戦をクリア (週ごとに初回)
};

export function xpLog() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter(e => e && Number.isInteger(e.xp) && e.xp > 0).map(e => ({ ...e, id: idOf(e) })) : [];
  } catch (e) {
    return [];
  }
}

/* 帳簿の合計 */
export function bonusXp(log = xpLog()) {
  return log.reduce((n, e) => n + e.xp, 0);
}

/* 経験値を足す。key を渡すと同じ key では1回だけ。足した量を返す (入らなければ 0) */
export function grantXp(src, xp, key) {
  if (!Number.isInteger(xp) || xp <= 0) return 0;
  const log = xpLog();
  const at = Date.now();
  const id = key ? idFromKey(key) : 'x' + at + '_' + Math.random().toString(36).slice(2, 6);
  if (log.some(e => e.id === id)) return 0;
  const entry = { id, src: String(src).slice(0, 16), xp, at, ...(key ? { key: String(key) } : {}) };
  if (!save(log.concat(entry))) return 0;
  if (hooks.onGrant) hooks.onGrant(entry);
  return xp;
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); return true; } catch (e) { return false; }
}

/* 別の端末で入った分 (アカウントから読んだ分) を足す。同じ id は足さない。足した件数を返す */
export function mergeXp(remote) {
  const log = xpLog();
  const have = new Set(log.map(e => e.id));
  const add = (remote || []).filter(e => e && ID_RE.test(e.id) && Number.isInteger(e.xp) && e.xp > 0 && !have.has(e.id));
  if (!add.length) return 0;
  save(log.concat(add).sort((a, b) => a.at - b.at));
  return add.length;
}

/* 帳簿を消す (戦績を消すときに一緒に) */
export function clearXpLog() {
  try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
}

/* 問題の文字列から短い key を作る (帳簿に長い文字列を残さない) */
export function hashKey(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
