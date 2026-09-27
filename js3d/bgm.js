/* =========================================================================
 * BGM (煉獄庭園の曲。art/bgm/<key>.mp3、96kbps に縮めたもの)
 *   タイトルは「オレンジトンネルを抜ける」、対戦は COLLECTION の「BGM」で選んだ曲 (settings().bgm)。
 *   音量は設定の「BGM」(bgmVol、0 でオフ)。🔇 で効果音と一緒に止まる。
 *   iPhone は <audio> の volume が効かないので、audio.js の Web Audio のゲインを通す。
 *   ブラウザの自動再生の制限で鳴らせなかったときは、次に画面に触れたときに鳴らし直す
 *   クレジット (必須): 煉獄庭園 (設定の画面と COLLECTION の BGM に出す)
 * ========================================================================= */
import { routeMedia, isMuted, initAudio } from './audio.js';
import { settings, onSettings } from './settings.js';
import { BGM_RELEASED } from './rewards.js';

export const TITLE_BGM = 'orange_tunnel';
export const BGM_CREDIT = '煉獄庭園';

let el = null;
let route = null;
let want = null;                 // 鳴らしたい曲 (null なら止める)

const level = () => (isMuted() ? 0 : Math.max(0, Math.min(1, (settings().bgmVol ?? 50) / 100)) * 0.7);

function ensure() {
  if (el) return;
  initAudio();                   // まだ触れていなくても作っておく (触れたときに再開する)
  el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  route = routeMedia(el, level());
}

/** 曲を鳴らす (同じ曲なら続きから)。key が無い・'off' なら止める */
export function playBgm(key) {
  if (!BGM_RELEASED) { stopBgm(); return; }        // 一旦しまっている (rewards.js の BGM_RELEASED)
  want = key && key !== 'off' ? key : null;
  if (!want) { stopBgm(); return; }
  try {
    ensure();
    const url = 'art/bgm/' + want + '.mp3';
    if (!el.src.endsWith(url)) el.src = url;
    refreshBgm();
  } catch (e) { /* BGM が無くても遊べる */ }
}

export function stopBgm() {
  want = null;
  if (el) el.pause();
}

/** 音量・消音の変更を反映する (設定・🔇 のあと) */
export function refreshBgm() {
  if (!el) return;
  const v = level();
  route.set(v);
  if (!v || !want) { el.pause(); return; }
  if (el.paused) el.play().catch(() => { /* まだ画面に触れていない。触れたときに鳴らす */ });
}

/* 自動再生の制限: 画面に触れたときに鳴らし直す。iPhone の Safari は指を置いた瞬間 (pointerdown) では再生を許さず、
   指を離したとき (touchend)・タップ (click) だけ許すので、どれでも試す (ページを開き直して始まる対戦で鳴らなかった) */
const retry = () => { initAudio(); if (want && el && el.paused && level() > 0) el.play().catch(() => {}); };
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, retry, { capture: true, passive: true });
/* 画面を離れたら止め、戻ったら続きから */
document.addEventListener('visibilitychange', () => {
  if (!el) return;
  if (document.visibilityState === 'hidden') el.pause(); else refreshBgm();
});
onSettings(() => refreshBgm());

/** いまの様子 (確かめる用) */
export const bgmState = () => ({ want, src: el ? el.src.split('/').pop() : null, paused: el ? el.paused : null, time: el ? el.currentTime : 0, level: level() });
