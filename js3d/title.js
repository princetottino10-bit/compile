/* =========================================================================
 * 3Dビュー: タイトルとモード選択
 * ========================================================================= */
import { emblemDataURL } from './emblems.js';
import { initAudio, isMuted, setMuted, sfx } from './audio.js';

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
    const showOptions = () => {
      const box = root.querySelector('#ttOptions');
      if (!box) return;
      box.hidden = false;
      const sound = box.querySelector('#ttSound');
      sound.textContent = isMuted() ? 'サウンド: OFF' : 'サウンド: ON';
      sound.onclick = () => {
        setMuted(!isMuted());
        sound.textContent = isMuted() ? 'サウンド: OFF' : 'サウンド: ON';
        if (!isMuted()) sfx('tick');
      };
      box.querySelector('#ttOptionsBack').onclick = () => { box.hidden = true; };
    };
    const showMenu = () => {
      const center = root.querySelector('#ttCenter');
      center.innerHTML = '<div class="tt-logo"><b>//</b> COMPILE</div><div class="tt-sub">3D ARENA</div>' +
        '<nav class="tt-menu" aria-label="ゲームモード">' +
          '<button data-mode="single" type="button">SINGLE GAME <small>CPUと対戦</small></button>' +
          '<button data-mode="online" type="button">ONLINE GAME <small>ルーム・レート戦</small></button>' +
          '<button data-mode="training" type="button">TRAINING <small>自由配置・検証盤面</small></button>' +
          '<button data-mode="options" type="button">OPTION <small>サウンド設定</small></button>' +
        '</nav><section class="tt-options" id="ttOptions" hidden><b>OPTION</b>' +
          '<button id="ttSound" type="button"></button><button id="ttOptionsBack" type="button">戻る</button></section>';
      center.querySelector('.tt-menu').onclick = (ev) => {
        const button = ev.target.closest('button[data-mode]');
        if (!button) return;
        sfx('select');
        if (button.dataset.mode === 'options') showOptions();
        else finish(button.dataset.mode);
      };
    };
    const start = () => {
      if (started) return;
      started = true; initAudio(); sfx('turn');
      root.querySelector('#ttStart').remove(); showMenu();
    };
    root.querySelector('#ttStart').onclick = start;
    window.addEventListener('keydown', onKey);
  });
}
