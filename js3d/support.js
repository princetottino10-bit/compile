/* =========================================================================
 * 不具合・要望の窓口 (Discord) と、報告に貼る情報のコピー
 *   Discord に書いてもらうとき、端末や版を聞き返さずに済むように、分かることをまとめて渡す。
 *   ここは通信しない (クリップボードに入れるだけ)
 * ========================================================================= */
import { versionOf, deviceOf } from './errorreport.js';
import { recentErrors } from './errtext.js';

export const DISCORD_URL = 'https://discord.gg/Xtf4PmxE7f';

const LIVE_KEY = 'compileLiveGame';          // crashwatch.js: いま遊んでいる対戦
const CRASH_KEY = 'compileLastCrash';        // crashwatch.js: 前に途中で終わった対戦 (報告した文)

const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const readText = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };

/* いまの画面の名前。アドレスの後ろはそのまま入れず、知っている印だけを拾う */
function screenName() {
  const live = readJSON(LIVE_KEY);
  if (live && live.mode) return '対戦 (' + live.mode + ')';
  let keys = [];
  try { keys = [...new URLSearchParams(location.search).keys()].filter(k => /^(story|run|tsume|tutorial|training|replay|puzzle|quick|join)$/.test(k)); } catch (e) { keys = []; }
  return keys.length ? keys.join(',') : 'タイトル';
}

/* ほかのモジュールが足す行 (画質・GPU の名前は main.js、変えた設定は settings.js)。() => 文字列の配列 */
const extraSources = [];
export function addReportLines(fn) { extraSources.push(fn); }
/* 画面の写しを作る (main.js が 3D の画面から PNG を作る関数を渡す)。() => Promise<Blob | null> */
let captureSource = null;
export function setCaptureSource(fn) { captureSource = fn; }
/** 画面の写しをコピーできる環境か */
export function canCopyScreenshot() {
  return !!(captureSource && typeof window !== 'undefined' && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
}
/** 画面の写し (3D の盤面) をクリップボードへ。結果の文を返す */
export async function copyScreenshot() {
  if (!canCopyScreenshot()) return 'この端末では画面の写しをコピーできません。スクリーンショットを撮って貼ってください';
  try {
    /* Safari は、押した瞬間に ClipboardItem を作らないと断るので、中身は Promise で渡す */
    await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': Promise.resolve(captureSource()).then((b) => { if (!b) throw new Error('no image'); return b; }) })]);
    return '画面の写しをコピーしました。Discord の #不具合 に、報告用の情報と一緒に貼ってください';
  } catch (e) {
    return '画面の写しをコピーできませんでした。スクリーンショットを撮って貼ってください';
  }
}

/** 報告に貼る文 (個人の情報は入れない: 端末の種類・版・画面・対戦の様子だけ) */
export function reportInfo(now = new Date()) {
  const lines = [
    '【報告用の情報】',
    '版: ' + (versionOf() || '?'),
    '端末: ' + deviceOf() + ' ・ 画面 ' + window.innerWidth + 'x' + window.innerHeight,
    '開いている画面: ' + screenName(),
    '時刻: ' + now.toLocaleString('ja-JP')
  ];
  const live = readJSON(LIVE_KEY);
  if (live) lines.push('対戦中: ' + live.mode + ' ・ ' + (live.turns | 0) + '手番 ・ ' + (live.me || []).join('/') + ' vs ' + (live.opp || []).join('/') +
    (live.what ? ' ・ 最後: ' + live.what : ''));
  const crash = readText(CRASH_KEY);
  if (crash) lines.push('前に途中で終わった対戦: ' + crash);
  for (const fn of extraSources) {
    try { for (const l of fn() || []) if (l) lines.push(String(l)); } catch (e) { /* 1つ読めなくても、ほかは入れる */ }
  }
  const errs = recentErrors();
  if (errs.length) lines.push('最近のエラー:\n' + errs.map(x => '  - ' + x).join('\n'));
  return lines.join('\n');
}

/** 情報をコピーする。できなければ選べる形で出す。結果の文を返す (トーストに使う) */
export async function copyReportInfo() {
  const text = reportInfo();
  try {
    await navigator.clipboard.writeText(text);
    return 'コピーしました。Discord の #不具合 に貼ってください';
  } catch (e) {
    window.prompt('この文をコピーして、Discord に貼ってください', text);
    return '';
  }
}

/** 不具合・要望の窓 (メニュー画面の「不具合・要望」から)。Discord を開く・報告用の情報をコピーする */
export function openReport() {
  let el = document.getElementById('reportOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'reportOv';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="pz-card st-card rp-card" role="dialog" aria-modal="true" aria-label="不具合・要望">' +
    '<div class="pz-head"><b>REPORT<small>不具合・要望</small></b><button type="button" class="pz-x"><span>閉じる</span></button></div>' +
    '<div class="rp-body">' +
    '<p class="rp-lead">不具合や要望は Discord で受け付けています。不具合のときは、先に下の「コピー」を押して、貼り付けてください (版や端末が分かり、すぐ調べられます)。</p>' +
    '<div class="st-row st-act"><span>報告用の情報<small>版・端末・途中で終わった対戦の記録 (名前や記録の中身は入りません)</small></span>' +
      '<button type="button" id="rpCopy">コピー</button></div>' +
    '<div class="st-row st-act"><span>Discord<small>#不具合 か #要望 に書いてください</small></span>' +
      '<button type="button" id="rpDiscord" class="rp-go">Discord を開く</button></div>' +
    '<p class="st-msg" id="rpMsg" role="status"></p>' +
    '</div></div>';
  el.classList.add('show');
  const close = () => el.classList.remove('show');
  el.onclick = (ev) => { if (ev.target === el) close(); };
  el.querySelector('.pz-x').onclick = close;
  el.querySelector('#rpDiscord').onclick = () => openDiscord();
  el.querySelector('#rpCopy').onclick = async (ev) => {
    const msg = await copyReportInfo();
    if (msg) { ev.target.textContent = 'コピーしました'; el.querySelector('#rpMsg').textContent = msg; setTimeout(() => { ev.target.textContent = 'コピー'; }, 2400); }
  };
}

export function openDiscord() {
  window.open(DISCORD_URL, '_blank', 'noopener');
}
