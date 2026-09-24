/* =========================================================================
 * 3Dビュー: タイトルとモード選択
 * ========================================================================= */
import { emblemDataURL } from './emblems.js';
import { drawTitleBackdrop } from './backdrops.js';
import { initAudio, sfx } from './audio.js';
import { openSettings } from './settings.js';
import { openStats } from './stats.js';
import { openAccount, accountState, onAccountChange } from './account.js';

const BOOT_LINES = [
  '> COMPILE OS v3.1 — boot sequence initiated',
  '> loading protocols .......... 30/30 OK',
  '> arena renderer ............. OK',
  '> audio synthesizer .......... OK',
  '> control component .......... NEUTRAL',
  '> awaiting operator input _'
];

function accountLabel() {
  const u = accountState().user;
  return u ? String(u.name).replace(/[&<>"]/g, '') : 'ログイン';
}

export function runTitle(protocols, opts) {
  const menuOnly = !!(opts && opts.menuOnly);    // ロビー等から戻るとき: 起動演出を飛ばしてメニューだけ
  const root = document.getElementById('title');
  if (!root) return Promise.resolve('single');
  const emblems = protocols
    .map(p => '<img alt="" src="' + emblemDataURL(p.name, p.color || '#63f3ff', 72, true) + '">')
    .join('');
  root.innerHTML =
    '<canvas class="tt-art" aria-hidden="true"></canvas>' +
    '<div class="tt-scan"></div><div class="tt-log" id="ttLog"></div>' +
    '<div class="tt-center" id="ttCenter"><div class="tt-logo"><b>//</b> COMPILE</div>' +
      '<div class="tt-sub">3D ARENA</div><button class="tt-start" id="ttStart" type="button">PRESS START</button></div>' +
    '<div class="tt-marquee"><div class="tt-strip">' + emblems + emblems + '</div></div>' +
    '<div class="tt-foot">engine.js — 全30プロトコル / 180枚</div>' +
    '<div class="tt-corner" id="ttCorner" hidden>' +
      '<button data-mode="account" type="button" class="tt-account"><span>' + accountLabel() + '</span></button>' +
      '<button data-mode="options" type="button" class="tt-gear" title="設定 (演出・音)" aria-label="設定 (演出・音)">⚙</button>' +
    '</div>';
  root.classList.add('show');
  const art = root.querySelector('.tt-art');
  const paint = () => { if (art.isConnected) { try { drawTitleBackdrop(art); } catch (e) { /* 描けなくても従来の背景で進む */ } } };
  paint();
  window.addEventListener('resize', paint);
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
        /* 遊ぶ入口は大きく2つだけ。練習・記録は小さく下に、アカウントと設定は右上の隅に置く */
        '<nav class="tt-menu" aria-label="ゲームモード">' +
          '<div class="tt-main">' +
            '<button data-mode="single" type="button">SINGLE GAME <small>CPUと対戦</small></button>' +
            '<button data-mode="online" type="button">ONLINE GAME <small>ルーム・レート戦</small></button>' +
          '</div>' +
          '<div class="tt-more">' +
            '<button data-mode="tutorial" type="button">TUTORIAL <small>ルールを1つずつ</small></button>' +
            '<button data-mode="training" type="button">TRAINING <small>検証盤面</small></button>' +
            '<button data-mode="record" type="button">RECORD <small>戦績</small></button>' +
          '</div>' +
        '</nav>';
      root.querySelector('#ttCorner').hidden = false;
      /* ログイン状態は裏で読むので、分かったら表示を差し替える */
      const offAccount = onAccountChange(() => {
        const label = root.querySelector('#ttCorner button[data-mode="account"] span');
        if (!label || !root.classList.contains('show')) { offAccount(); return; }
        label.textContent = accountLabel();
      });
      const onMenu = (ev) => {
        const button = ev.target.closest('button[data-mode]');
        if (!button) return;
        sfx('select');
        /* 設定 (演出の速さ・効果音の音量・待ち時間)。音の ON/OFF は対戦中の 🔊 で */
        if (button.dataset.mode === 'options') openSettings();
        else if (button.dataset.mode === 'record') openStats();
        else if (button.dataset.mode === 'account') openAccount();
        else finish(button.dataset.mode);
      };
      center.querySelector('.tt-menu').onclick = onMenu;
      root.querySelector('#ttCorner').onclick = onMenu;
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
    if (opts && opts.after) opts.after();
  });
}
