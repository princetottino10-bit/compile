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
/* 対戦で流す曲 (COLLECTION で選ぶ仕組み BGM_RELEASED とは別)。2026-09-28: ボスは「彷徨いの言葉は天に導かれ」、
   強敵は Z･E･R･O。タイトルは無音 */
export const BATTLE_BGM_ON = true;
/* ふつうの対戦: OpenTracks (旧 DOVA-SYNDROME) の4曲から毎試合ランダム。
   OpenTracks の規約 (ファイルのまま取り出せる形で置かない) に合わせて m4a に変換して置いている */
export const NORMAL_BGMS = ['cho_zunou', 'reflect', 'kaidoku', 'crescendo_jitter'];
export const STRONG_BGM = 'zero';
export const BOSS_BGM = 'samayoi';
/* 曲のファイル (無ければ <key>.mp3) */
const FILES = { cho_zunou: 'cho_zunou.m4a', reflect: 'reflect.m4a', kaidoku: 'kaidoku.m4a', crescendo_jitter: 'crescendo_jitter.m4a' };
export const bgmFile = (key) => 'art/bgm/' + (FILES[key] || key + '.mp3');
/** ふつうの対戦の曲を1つ選ぶ */
export const pickNormalBgm = () => NORMAL_BGMS[Math.floor(Math.random() * NORMAL_BGMS.length)];

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
  /* COLLECTION の BGM をしまっている間は、対戦の2曲だけ鳴らす (タイトルの曲・選んだ曲は鳴らさない) */
  if (!BGM_RELEASED && !(BATTLE_BGM_ON && key && (NORMAL_BGMS.includes(key) || key === STRONG_BGM || key === BOSS_BGM))) { stopBgm(); return; }
  want = key && key !== 'off' ? key : null;
  if (!want) { stopBgm(); return; }
  try {
    ensure();
    const url = bgmFile(want);
    if (!el.src.endsWith(url)) el.src = url;
    refreshBgm();
  } catch (e) { /* BGM が無くても遊べる */ }
}

/** 決着したときなど: 少しずつ小さくして止める (ms かけて) */
export function fadeOutBgm(ms = 1400) {
  if (!el || !want) return;
  want = null;
  route.set(0, ms / 1000 / 3);                    // 3 時定数でほぼ無音
  const e = el;
  setTimeout(() => { if (!want) e.pause(); }, ms);
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
const retry = () => { initAudio(); prime(); if (want && el && el.paused && level() > 0) el.play().catch(() => {}); };
/* iPhone: 画面に触れた瞬間に一度も鳴らしていない <audio> は、あとからプログラムで鳴らせない。
   対戦は「戦う」を押してから読み込みを待って始まるので、そのときにはもう触れた瞬間ではなく、1戦目の BGM が鳴らなかった。
   最初に触れたときに、無音で一瞬だけ鳴らして止めておく (以後は対戦の始まりにすぐ鳴らせる) */
let primed = false;
function prime() {
  if (primed || want || !BATTLE_BGM_ON) return;
  primed = true;
  try {
    ensure();
    route.set(0);
    el.src = bgmFile(NORMAL_BGMS[0]);
    const p = el.play();
    if (p && p.then) p.then(() => { if (!want) el.pause(); }, () => { primed = false; });
  } catch (e) { primed = false; }
}
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, retry, { capture: true, passive: true });
/* 画面を離れたら止め、戻ったら続きから */
document.addEventListener('visibilitychange', () => {
  if (!el) return;
  if (document.visibilityState === 'hidden') el.pause(); else refreshBgm();
});
onSettings(() => refreshBgm());

/** いまの様子 (確かめる用) */
export const bgmState = () => ({ want, src: el ? el.src.split('/').pop() : null, paused: el ? el.paused : null, time: el ? el.currentTime : 0, level: level() });
