/* =========================================================================
 * 曲が替わったときの「いまの曲」カード (2026-11-08 本人「曲変えたら曲のタイトルと作者のカード出るようにして」)
 *   bgm.js の setSongNotify から呼ばれ、右上 (⏭・🔊 の下) に曲名と作者を数秒だけ出す。触っても邪魔にならないよう押せない。
 *   作者: 本人 (Ryunosuke) の曲は「作曲 Ryunosuke」、ほかは作者・出どころ (表記の要る曲は表記そのもの: BGM 煉獄庭園 など)。
 *   表記の要る曲は前はトーストで出していたので、このカードがその代わり (流れている画面に表記を出す)
 * ========================================================================= */
import { songInfo } from './bgm.js';

const SHOW_MS = 3600;
let card = null, timer = null;

function ensure() {
  if (card) return card;
  card = document.createElement('div');
  card.id = 'nowPlaying';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = '<span class="np-icon" aria-hidden="true">♪</span><span class="np-text">' +
    '<span class="np-kicker">NOW PLAYING</span><b class="np-title"></b><span class="np-by"></span></span>';
  document.body.appendChild(card);
  return card;
}

/** その曲のカードを出す (知らない曲は出さない) */
export function showSong(key) {
  const s = songInfo(key);
  if (!s || typeof document === 'undefined') return;
  const el = ensure();
  el.querySelector('.np-title').textContent = s.title;
  el.querySelector('.np-by').textContent = s.own ? '作曲 ' + s.by : s.by;
  el.classList.toggle('own', s.own);
  /* 続けて替えたら (次の曲ボタンの連打) 出し直す: 一度引っ込めてから出すと、替わったことが分かる */
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), SHOW_MS);
}
