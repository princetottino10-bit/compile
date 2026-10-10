/* =========================================================================
 * エラーの文を、遊んでいる人に分かる日本語にする
 *   通信の失敗 (Failed to fetch など)・サーバーの番号 (404 / 500)・時間切れ・ログイン切れを、
 *   「何が起きたか」と「次にどうすればいいか」に言い換える。元の文は報告用に残す (recentErrors)。
 *   すでに日本語で書かれた文 (サーバーの「ルームが見つかりません」など) は、そのまま使う。
 *   ここは画面に触らない (テストで読み込めるように)
 * ========================================================================= */

/* 開発用のファイル名は、遊ぶ人には意味がないので文から外す (「(secure-room-config.js)」など) */
const FILE_RE = /\s*[(（]?\s*[\w./-]+\.(?:js|json|html|css|webp|png)(?:\?[^\s)）]*)?\s*[)）]?/g;

/** 生のエラー (Error・文字列・Supabase のエラーの形) から、元の文を取り出す */
export function rawText(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  const msg = err.message || err.error_description || err.error || err.msg || '';
  if (msg) return String(msg);
  try { return String(err); } catch (e) { return ''; }
}

/* 番号 (HTTP の状態) を探す: err.status / err.context.status / 文の中の「(404)」「status 500」 */
function statusOf(err, raw) {
  const n = err && typeof err === 'object' ? (err.status || (err.context && err.context.status) || err.statusCode) : 0;
  if (Number.isInteger(n) && n >= 100 && n < 600) return n;
  const m = raw.match(/[(（]\s*(\d{3})\s*[)）]|\bstatus(?:\s*code)?\s*[:=]?\s*(\d{3})\b|\bHTTP\s*(\d{3})\b/i);
  return m ? +(m[1] || m[2] || m[3]) : 0;
}

const JA = /[぀-ヿ㐀-鿿]/;

/**
 * エラーを分かる言葉にする。
 * @param {unknown} err  Error・文字列・{ message, status } など
 * @param {{ online?: boolean }} [opts]  online: いまネットにつながっているか (navigator.onLine)。省略すると調べない
 * @returns {{ kind: string, text: string, next: string, raw: string }}
 */
export function friendlyError(err, opts) {
  const raw = rawText(err).trim();
  const online = opts && typeof opts.online === 'boolean' ? opts.online : true;
  const status = statusOf(err, raw);
  const r = (kind, text, next) => ({ kind, text, next, raw });
  if (!online) return r('offline', 'オフラインです。', 'インターネットにつながったら、もう一度試してください');
  if (/webgl|context.*(lost|creat)|gpu process/i.test(raw)) {
    return r('webgl', '3D の表示を始められませんでした。', 'Chrome か Safari の最新版で開いてください。ほかのアプリを閉じると直ることもあります');
  }
  if (/failed to fetch|networkerror|network request failed|load failed|err_internet|err_network|err_connection|fetch failed|network ?error|ネットワーク/i.test(raw)) {
    return r('network', '通信できませんでした。', '電波のよい所で、もう一度試してください');
  }
  if (/timed? ?out|timeout|aborterror|aborted|時間切れ/i.test(raw) || status === 408 || status === 504) {
    return r('timeout', '時間がかかりすぎて止まりました。', '少し待ってから、もう一度試してください');
  }
  if (/jwt|refresh token|token.*(expired|invalid)|not authenticated|unauthori[sz]ed|invalid login|session.*(missing|expired)|セッションが切れ|認証が必要/i.test(raw) || status === 401 || status === 403) {
    return r('auth', 'ログインの期限が切れました。', 'ACCOUNT からログインし直してください');
  }
  if (/quota|storage.*full|exceeded the quota/i.test(raw)) {
    return r('storage', 'この端末の保存場所がいっぱいです。', 'ブラウザの不要なデータを消してから、もう一度試してください');
  }
  if (/not configured|未設定|secure-room-config/i.test(raw)) {
    return r('config', 'この環境ではオンラインの機能を使えません。', 'CPU 戦はこのまま遊べます');
  }
  if (status === 429 || /too many requests|rate limit/i.test(raw)) {
    return r('busy', '混み合っています。', '1分ほど待ってから、もう一度試してください');
  }
  if (status === 404) return r('notfound', '必要なデータが見つかりませんでした。', '再読み込みしてください (更新の途中だったのかもしれません)');
  if (status >= 500 || /non-2xx|internal server error|bad gateway|service unavailable/i.test(raw)) {
    return r('server', 'サーバーが応えませんでした。', 'しばらく待ってから、もう一度試してください');
  }
  /* スクリプトやデータのファイルが届かなかった (room.js の loadScript など) */
  if (/\.(?:js|json)\b[^]*読み込めませんでした/.test(raw)) {
    return r('network', '必要なファイルを読み込めませんでした。', '電波のよい所で、再読み込みしてください');
  }
  /* サーバーやこのゲームが日本語で書いた文は、そのまま (ファイル名だけ外す) */
  if (raw && JA.test(raw)) return r('message', stripFiles(raw), '');
  return r('unknown', '思わぬエラーが起きました。', '再読み込みしてください。続くときは「不具合・要望」から知らせてください');
}

/** 1行の文にする (「何が起きたか。次にどうするか」) */
export function friendlyMessage(err, opts) {
  const f = friendlyError(err, opts);
  return f.next ? f.text + f.next : f.text;
}

/** 文からファイル名を外す */
export function stripFiles(text) {
  return String(text || '').replace(FILE_RE, '').replace(/\s{2,}/g, ' ').trim();
}

/* ---------- 直近のエラー (報告用の情報に入れる) ---------- */
const RECENT_MAX = 5;
const recent = [];
/** 起きたエラーの元の文を覚える (同じ文は続けて入れない)。報告用の情報に最後の数件を入れる */
export function noteError(err) {
  const raw = stripSecrets(rawText(err)).slice(0, 160);
  if (!raw || recent[recent.length - 1] === raw) return;
  recent.push(raw);
  if (recent.length > RECENT_MAX) recent.shift();
}
export function recentErrors() { return recent.slice(); }

/* 報告に入れる前に、鍵やメールの形をした所を伏せる */
function stripSecrets(s) {
  return String(s || '').replace(/eyJ[\w-]{10,}\.[\w-]+\.[\w-]+/g, '[token]').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[mail]')
    .replace(/([?&](?:code|access_token|token|key)=)[^&\s]+/gi, '$1…');
}
