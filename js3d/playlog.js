/* =========================================================================
 * 遊ばれ方の匿名の記録: 試合が終わるたびに1件送る (ログインしていない人も)。
 *   送るのは 端末のランダムな番号・モード・勝ち負け・難易度・プロトコル・手数・版・ログインしているか だけ。
 *   受け取るのは Supabase の play_events (だれでも書ける・管理者の画面だけが読める)。送れなくても遊ぶのには関係ない
 * ========================================================================= */
import { deviceId } from './device.js';
import { loadConfig, versionOf } from './errorreport.js';

let sentThisLoad = 0;
const clean = (list) => (Array.isArray(list) ? list.filter(n => /^[A-Z]{2,16}$/.test(n)).slice(0, 3) : null);

/** mode: cpu / quick / run / weekly / tutorial / online など。logged: ログインしているか */
export async function logPlay({ mode, win, level, me, opp, turns, logged }) {
  try {
    if (sentThisLoad >= 50) return;            // 1回の起動で送りすぎない
    sentThisLoad++;
    const cfg = await loadConfig();
    if (!cfg || !cfg.url || !cfg.anonKey) return;
    const m = String(mode || 'cpu').toLowerCase().replace(/[^a-z]/g, '').slice(0, 16) || 'cpu';
    await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/play_events', {
      method: 'POST',
      headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        device: deviceId(), mode: m, win: typeof win === 'boolean' ? win : null,
        level: Number.isInteger(level) ? Math.max(-1, Math.min(99, level)) : null,
        me: clean(me), opp: clean(opp), turns: Number.isInteger(turns) ? Math.max(0, Math.min(999, turns)) : null,
        version: versionOf().slice(0, 40), logged: !!logged
      }),
      keepalive: true
    });
  } catch (e) { /* 送れなくても遊ぶのには関係ない */ }
}
