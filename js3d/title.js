/* =========================================================================
 * 3Dビュー: タイトルとモード選択
 * ========================================================================= */
import { emblemDataURL } from './emblems.js';
import { initAudio, sfx } from './audio.js';
import { openSettings } from './settings.js';
import { openStats } from './stats.js';

const BOOT_LINES = [
  '> COMPILE OS v3.1 — boot sequence initiated',
  '> loading protocols .......... 30/30 OK',
  '> arena renderer ............. OK',
  '> audio synthesizer .......... OK',
  '> control component .......... NEUTRAL',
  '> awaiting operator input _'
];

export function runTitle(protocols, opts) {
  const menuOnly = !!(opts && opts.menuOnly);    // ロビー等から戻るとき: 起動演出を飛ばしてメニューだけ
  const root = document.getElementById('title');
  if (!root) return Promise.resolve('single');
  const emblems = protocols
    .map(p => '<img alt="" src="' + emblemDataURL(p.name, p.color || '#63f3ff', 72, true) + '">')
    .join('');
  root.innerHTML =
    '<div class="tt-scan"></div><div class="tt-log" id="ttLog"></div>' +
    '<div class="tt-center" id="ttCenter"><div class="tt-logo"><b>//</b> COMPILE</div>' +
      '<div class="tt-sub">3D ARENA</div><button class="tt-start" id="ttStart" type="button">PRESS START</button></div>' +
    '<div class="tt-marquee"><div class="tt-strip">' + emblems + emblems + '</div></div>' +
    '<div class="tt-foot">engine.js — 全30プロトコル / 180枚</div>';
  root.classList.add('show');
  const log = root.querySelector('#ttLog');
  let li = 0;
  const logTimer = setInterval(() => {
    if (li >= BOOT_LINES.length) { clearInterval(logTimer); return; }
    const div = document.createElement('div'); div.textContent = BOOT_LINES[li++]; log.appendChild(div);
  }, 210);
  return new Promise((resolve) => {
    let started = false;
    const onKey = (ev) => {
      if (!started && (ev.key === 'Enter' || ev.key === ' ')) start();
    };
    const finish = (mode) => {
      clearInterval(logTimer); window.removeEventListener('keydown', onKey); root.classList.add('gone');
      setTimeout(() => { root.classList.remove('show', 'gone'); root.innerHTML = ''; resolve(mode); }, 420);
    };
    const showMenu = () => {
      const center = root.querySelector('#ttCenter');
      center.innerHTML = '<div class="tt-logo"><b>//</b> COMPILE</div><div class="tt-sub">3D ARENA</div>' +
        '<nav class="tt-menu" aria-label="ゲームモード">' +
          '<button data-mode="single" type="button">SINGLE GAME <small>CPUと対戦</small></button>' +
          '<button data-mode="online" type="button">ONLINE GAME <small>ルーム・レート戦</small></button>' +
          '<button data-mode="tutorial" type="button">TUTORIAL <small>はじめての方へ・ルールを1つずつ</small></button>' +
          '<button data-mode="training" type="button">TRAINING <small>自由配置・検証盤面</small></button>' +
          '<button data-mode="record" type="button">RECORD <small>CPU 戦の戦績</small></button>' +
          '<button data-mode="options" type="button">OPTION <small>演出・音の設定</small></button>' +
        '</nav>';
      center.querySelector('.tt-menu').onclick = (ev) => {
        const button = ev.target.closest('button[data-mode]');
        if (!button) return;
        sfx('select');
        /* 設定 (演出の速さ・効果音の音量・待ち時間)。音の ON/OFF は対戦中の 🔊 で */
        if (button.dataset.mode === 'options') openSettings();
        else if (button.dataset.mode === 'record') openStats();
        else finish(button.dataset.mode);
      };
    };
    /* 先にメニューを出し、音はそのあと (失敗しても進める)。以前は音の初期化が先で、
       音を作れないブラウザ (アプリ内ブラウザ等) では例外でメニューが出ず、
       started だけ立って二度と押せなくなっていた */
    const start = () => {
      if (started) return;
      started = true;
      const btn = root.querySelector('#ttStart');
      if (btn) btn.remove();
      showMenu();
      try { initAudio(); sfx('turn'); } catch (e) { /* 音なしで続ける */ }
    };
    root.querySelector('#ttStart').onclick = start;
    window.addEventListener('keydown', onKey);
    if (menuOnly) { clearInterval(logTimer); log.innerHTML = ''; start(); }
  });
}
