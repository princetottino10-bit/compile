/* =========================================================================
 * 3Dビュー: タイトル画面
 *   ブートログ → ロゴ点灯 → PRESS START。背景では 3D アリーナが生きて
 *   動いているので、オーバーレイは薄めにして空間を見せる。
 *   クリック / キーで解決する Promise を返す。
 * ========================================================================= */
import { emblemDataURL } from './emblems.js';
import { initAudio, sfx } from './audio.js';

const BOOT_LINES = [
  '> COMPILE OS v3.1 — boot sequence initiated',
  '> loading protocols .......... 30/30 OK',
  '> arena renderer ............. OK',
  '> audio synthesizer .......... OK',
  '> control component .......... NEUTRAL',
  '> awaiting operator input _'
];

export function runTitle(protocols) {
  const root = document.getElementById('title');
  if (!root) return Promise.resolve();

  /* 紋章のマーキー (全30種が流れる) */
  const emblems = protocols
    .map(p => '<img alt="" src="' + emblemDataURL(p.name, p.color || '#63f3ff', 72, true) + '">')
    .join('');

  root.innerHTML =
    '<div class="tt-scan"></div>' +
    '<div class="tt-log" id="ttLog"></div>' +
    '<div class="tt-center">' +
      '<div class="tt-logo"><b>//</b> COMPILE</div>' +
      '<div class="tt-sub">3D ARENA</div>' +
      '<div class="tt-start" id="ttStart">PRESS START</div>' +
    '</div>' +
    '<div class="tt-marquee"><div class="tt-strip">' + emblems + emblems + '</div></div>' +
    '<div class="tt-foot">engine.js — 全30プロトコル / 180枚 · クリックで起動</div>';
  root.classList.add('show');

  /* ブートログを1行ずつ流す */
  const log = root.querySelector('#ttLog');
  let li = 0;
  const logTimer = setInterval(() => {
    if (li >= BOOT_LINES.length) { clearInterval(logTimer); return; }
    const div = document.createElement('div');
    div.textContent = BOOT_LINES[li++];
    log.appendChild(div);
  }, 210);

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(logTimer);
      initAudio();
      sfx('turn');
      root.classList.add('gone');
      window.removeEventListener('keydown', finish);
      setTimeout(() => {
        root.classList.remove('show', 'gone');
        root.innerHTML = '';
        resolve();
      }, 550);
    };
    root.addEventListener('pointerdown', finish);
    window.addEventListener('keydown', finish);
  });
}
