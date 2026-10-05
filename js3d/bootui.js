/* =========================================================================
 * 起動の画面 (#boot) の進み具合と、起動できなかったときの案内
 *   ・main.js の mark() の段に合わせて、バーを進め、いま何をしているかを出す (データ → 文字 → 3D → カード)
 *   ・10 秒たっても終わらなければ「時間がかかっています…」(three-play.html の小さなスクリプトも同じことをする。
 *     そちらはモジュールが1つも読めなかったときのため)
 *   ・失敗したら、隠れる通知ではなく #boot の中に、理由・再読み込み・報告用にコピー・Discord を出す
 * ========================================================================= */
import { friendlyError, noteError } from './errtext.js';
import { copyReportInfo, openDiscord } from './support.js';
import { inAppBrowser } from './envcheck.js';

/* mark() の名前 → [バーの位置 (%), 次にしていること] */
const STAGES = {
  start: [6, 'データを読み込んでいます'],
  fetch: [34, '文字を用意しています'],
  engineInit: [44, '文字を用意しています'],
  fonts: [62, '3D の画面を作っています'],
  stage: [86, 'カードを並べています'],
  newGame: [94, 'カードを並べています'],
  sync: [100, 'まもなく始まります']
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 起動の段が進んだ (main.js の mark から) */
export function bootStage(label) {
  const st = STAGES[label];
  if (!st) return;
  window.__bootAlive = true;                        // three-play.html の見張り: モジュールは動いている
  const bar = $('bootBar');
  if (bar) { bar.classList.add('det'); bar.style.setProperty('--boot-p', st[0] + '%'); bar.setAttribute('aria-valuenow', String(st[0])); }
  const step = $('bootStep');
  if (step) step.textContent = st[1] + '…';
}

/** 起動の画面がまだ見えているか */
export function bootVisible() {
  const el = $('boot');
  return !!(el && el.style.display !== 'none' && !el.classList.contains('gone'));
}

/** 起動できなかった: #boot の中に理由と次の一手を出す。reason: { kind?, text?, next? } で文を差し替えられる */
export function bootFail(err, reason) {
  noteError(err);
  const el = $('boot');
  if (!el) return;
  const f = { ...friendlyError(err, { online: navigator.onLine !== false }), ...(reason || {}) };
  const app = inAppBrowser();
  el.classList.remove('gone');
  el.style.display = '';
  el.classList.add('failed');
  let box = $('bootFail');
  if (!box) {
    box = document.createElement('div');
    box.id = 'bootFail';
    el.appendChild(box);
  }
  box.hidden = false;
  box.setAttribute('role', 'alert');
  box.innerHTML = '<b>起動できませんでした</b>' +
    '<p>' + esc(f.text) + (f.next ? '<br>' + esc(f.next) : '') + '</p>' +
    (app ? '<p class="bf-app">いま ' + esc(app) + ' の中のブラウザで開いています。メニューの「ブラウザで開く」から Chrome か Safari で開くと動くことがあります。</p>' : '') +
    '<div class="bf-acts"><button type="button" class="go" data-b="reload">再読み込み</button>' +
    '<button type="button" data-b="copy">報告用にコピー</button><button type="button" data-b="discord">Discord で知らせる</button></div>' +
    '<p class="bf-msg" role="status"></p>' +
    (f.raw ? '<details><summary>くわしく (報告用)</summary><code>' + esc(f.raw) + '</code></details>' : '');
  box.onclick = async (ev) => {
    const b = ev.target.closest('button[data-b]');
    if (!b) return;
    if (b.dataset.b === 'reload') location.reload();
    else if (b.dataset.b === 'discord') openDiscord();
    else if (b.dataset.b === 'copy') {
      const msg = await copyReportInfo();
      box.querySelector('.bf-msg').textContent = msg || '';
    }
  };
}
