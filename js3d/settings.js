/* =========================================================================
 * 設定 (演出の速さ・音量・発動の待ち時間) と、その画面
 *   ブラウザに保存し、次に開いたときも同じにする。
 *   タイトルの OPTION と、対戦中の上のバーの ⚙ から同じ画面を開く。
 * ========================================================================= */

import { cosmeticsHtml, bindCosmetics } from './cosmetics-ui.js';
const KEY = 'compileSettings';
/* mat 以下は見た目 (レベルの報酬、cosmetics-ui.js) */
/* autoPick: 選べるものが1つしかない選択は自動で選ぶ / oppSummary: 相手の番のまとめ / hint: おすすめの手のボタン (CPU 戦) */
const DEFAULTS = { speed: 1, sfx: 80, pauses: true, autoPick: true, oppSummary: true, hint: true, mat: 'neon', sleeve: 'default', marker: 'default', ccolor: 'default',
  victory: 'default', title: '', icon: '' };
const SPEEDS = [
  { v: 0.65, label: 'ゆっくり' },          // 何が起きたかを1つずつ追いたい人向け
  { v: 1, label: 'ふつう' },
  { v: 1.6, label: 'はやい' },
  { v: 2.5, label: 'とてもはやい' }
];

let current = load();
const listeners = [];

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...raw };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function settings() {
  return current;
}

export function setSetting(key, value) {
  current = { ...current, [key]: value };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) { /* private mode */ }
  for (const cb of listeners) cb(current);
}

/* 設定が変わったら (と、登録した直後に一度) cb(settings) を呼ぶ */
export function onSettings(cb) {
  listeners.push(cb);
  cb(current);
}

/* 設定画面。extra: 画面に足すボタン [{ label, onClick }] (サウンド ON/OFF など) */
export function openSettings(extra) {
  let el = document.getElementById('settingsOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'settingsOv';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  const s = current;
  el.innerHTML = '<div class="pz-card st-card" role="dialog" aria-modal="true" aria-label="設定">' +
    '<div class="pz-head"><b>SETTINGS</b><button type="button" class="pz-x" aria-label="閉じる">×</button></div>' +
    '<div class="st-row"><span>演出の速さ</span><div class="st-seg" role="group" aria-label="演出の速さ">' +
      SPEEDS.map(o => '<button type="button" data-speed="' + o.v + '" class="' + (s.speed === o.v ? 'on' : '') + '">' + o.label + '</button>').join('') +
    '</div></div>' +
    '<label class="st-row"><span>効果音の音量 <i id="stSfxV">' + s.sfx + '</i></span>' +
      '<input type="range" min="0" max="100" step="5" id="stSfx" value="' + s.sfx + '"></label>' +
    '<label class="st-row st-check"><span>効果の発動・チェーンで一時停止する<small>オフにすると、発動した効果を1つずつ止めずに進めます</small></span>' +
      '<input type="checkbox" id="stPauses"' + (s.pauses ? ' checked' : '') + '></label>' +
    '<label class="st-row st-check"><span>選べるものが1つなら自動で選ぶ<small>対象が1つしかない選択は、確認せずに進めます</small></span>' +
      '<input type="checkbox" id="stAutoPick"' + (s.autoPick ? ' checked' : '') + '></label>' +
    '<label class="st-row st-check"><span>相手の番のまとめを出す<small>相手の番が終わったら、何をしたかを短く出します</small></span>' +
      '<input type="checkbox" id="stOppSummary"' + (s.oppSummary ? ' checked' : '') + '></label>' +
    '<label class="st-row st-check"><span>おすすめの手のボタン (CPU 戦)<small>押すと、CPU ならどう打つかを盤面で光らせます</small></span>' +
      '<input type="checkbox" id="stHint"' + (s.hint ? ' checked' : '') + '></label>' +
    cosmeticsHtml(s) +
    (extra && extra.length ? '<div class="pz-row">' + extra.map((x, i) => '<button type="button" data-extra="' + i + '">' + x.label + '</button>').join('') + '</div>' : '') +
    '</div>';
  el.classList.add('show');
  const close = () => el.classList.remove('show');
  el.onclick = (ev) => { if (ev.target === el) close(); };
  el.querySelector('.pz-x').onclick = close;
  el.querySelectorAll('[data-speed]').forEach(b => {
    b.onclick = () => {
      setSetting('speed', +b.dataset.speed);
      el.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b));
    };
  });
  const range = (id, key, out) => {
    const input = el.querySelector(id);
    input.oninput = () => { el.querySelector(out).textContent = input.value; setSetting(key, +input.value); };
  };
  range('#stSfx', 'sfx', '#stSfxV');
  el.querySelector('#stPauses').onchange = (ev) => setSetting('pauses', ev.target.checked);
  el.querySelector('#stAutoPick').onchange = (ev) => setSetting('autoPick', ev.target.checked);
  el.querySelector('#stOppSummary').onchange = (ev) => setSetting('oppSummary', ev.target.checked);
  el.querySelector('#stHint').onchange = (ev) => setSetting('hint', ev.target.checked);
  bindCosmetics(el, setSetting);
  el.querySelectorAll('[data-extra]').forEach(b => {
    b.onclick = () => { const x = extra[+b.dataset.extra]; if (x) x.onClick(b); };
  });
}
