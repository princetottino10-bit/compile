/* =========================================================================
 * 画面で起きたエラーをサーバーに知らせる (報告がなくても気づけるように)
 *   送るのは エラーの文・起きた場所 (ファイルと行)・画面の種類 (URL の ?以降の名前だけ)・版の印・端末のおおまかな種類 だけ。
 *   同じエラーは1回だけ、1回の起動で最大 8 件。送れなくても遊ぶのには関係ない (黙って諦める)。
 *   受け取るのは Supabase の client_errors (だれでも書ける・管理者の画面だけが読める)
 * ========================================================================= */

const sent = new Set();
let count = 0;
const MAX = 8;
let configLoad = null;

/* 接続先 (secure-room-config.js) を読む。オンライン対戦と同じ設定 */
function loadConfig() {
  if (window.COMPILE_ROOM_CONFIG) return Promise.resolve(window.COMPILE_ROOM_CONFIG);
  if (!configLoad) {
    configLoad = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'secure-room-config.js';
      s.onload = () => resolve(window.COMPILE_ROOM_CONFIG || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }
  return configLoad;
}

/* 画面の種類: ?tsume=… なら tsume のように、パラメータの名前だけ (値は送らない) */
function modeOf() {
  try {
    const keys = [...new URLSearchParams(location.search).keys()].filter(k => /^[a-z]{1,12}$/.test(k));
    return (location.pathname.split('/').pop() || 'index') + (keys.length ? '?' + keys.join(',') : '');
  } catch (e) {
    return '';
  }
}
function deviceOf() {
  const ua = navigator.userAgent || '';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'other';
  const br = /CriOS|Chrome/.test(ua) && !/Edg/.test(ua) ? 'Chrome' : /Edg/.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'other';
  return os + ' ' + br + (matchMedia && matchMedia('(pointer: coarse)').matches ? ' touch' : '');
}
/* 版の印: 読み込んだ main.js の ?v= */
function versionOf() {
  try {
    const m = (document.querySelector('script[type="importmap"]') || {}).textContent || '';
    const v = m.match(/main\.js\?v=([a-z0-9]+)/);
    return v ? v[1] : '';
  } catch (e) {
    return '';
  }
}
/* 起きた場所: スタックの最初の行から、ファイル名と行だけ */
function sourceOf(err, fallback) {
  const stack = String((err && err.stack) || '');
  const line = stack.split('\n').find(l => /\.js/.test(l)) || fallback || '';
  const m = line.match(/([\w.-]+\.js)(?:\?v=\w+)?:(\d+)(?::(\d+))?/);
  return m ? m[1] + ':' + m[2] : String(line).slice(0, 120);
}

/** エラーを知らせる。err は Error か文字列 */
export async function reportError(err, where) {
  try {
    const message = String((err && err.message) || err || '不明なエラー').slice(0, 300);
    const source = sourceOf(err, where);
    const key = message + '|' + source;
    if (sent.has(key) || count >= MAX) return;
    sent.add(key);
    count++;
    const cfg = await loadConfig();
    if (!cfg || !cfg.url || !cfg.anonKey) return;
    await fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/client_errors', {
      method: 'POST',
      headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ message, source: source.slice(0, 300), mode: modeOf().slice(0, 40), version: versionOf().slice(0, 40), device: deviceOf().slice(0, 60) }),
      keepalive: true
    });
  } catch (e) { /* 送れなくても遊ぶのには関係ない */ }
}

/** 取りこぼしたエラーを全部拾う (起動のはじめに1回) */
export function watchErrors() {
  window.addEventListener('error', (ev) => reportError(ev.error || ev.message, (ev.filename || '') + ':' + (ev.lineno || '')));
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason));
}
