/* =========================================================================
 * BGM (煉獄庭園の曲。art/bgm/<key>.mp3、96kbps に縮めたもの)
 *   タイトル・メニューは MENU_BGMS から、対戦は NORMAL_BGMS / 強敵 / ボスの曲 (COLLECTION の BGM を出したら選んだ曲)。
 *   音量は設定の「BGM」(bgmVol、0 でオフ)。🔇 で効果音と一緒に止まる。キャラが喋る間は小さくする (duckBgm)。
 *   iPhone は <audio> の volume が効かないので、audio.js の Web Audio のゲインを通す。
 *   ブラウザの自動再生の制限で鳴らせなかったときは、次に画面に触れたときに鳴らし直す
 *   クレジット (必須): 煉獄庭園 (設定の画面と COLLECTION の BGM に出す)
 * ========================================================================= */
import { routeMedia, isMuted, initAudio, onMuteChange, kickAudio } from './audio.js';
import { settings, onSettings } from './settings.js';
import { BGM_RELEASED } from './rewards.js';
import { isTrack, chosenTrack, TRACKS, ownsTrack } from './bgm-shop.js';

export const TITLE_BGM = 'orange_tunnel';
export const BGM_CREDIT = '煉獄庭園';
/* 対戦で流す曲 (COLLECTION で選ぶ仕組み BGM_RELEASED とは別)。2026-09-28: ボスは「彷徨いの言葉は天に導かれ」、
   強敵は Z･E･R･O。タイトルは無音 */
export const BATTLE_BGM_ON = true;
/* ふつうの対戦: OpenTracks (旧 DOVA-SYNDROME) の4曲から毎試合ランダム。
   OpenTracks の規約 (ファイルのまま取り出せる形で置かない) に合わせて m4a に変換して置いている */
export const NORMAL_BGMS = ['cho_zunou', 'reflect', 'kaidoku', 'crescendo_jitter'];
export const STRONG_BGM = 'zero';
/* タイトル・メニュー (対戦以外): 落ち着いた3曲から、ページを開くたびに1曲 (メニューの間は同じ曲が続く) */
export const MENU_BGMS = ['planetarium', 'madoromu_neon', 'nine_jack'];
/* 勝ち抜き戦 (RUN) の対戦以外の画面 (入口・地図・ショップ・休憩所など): 沈殿するイルカ */
export const RUN_BGM = 'iruka';
let menuPick = null;
/* COLLECTION の BGM で「メニューで流す」を選んでいれば、その曲 */
export const menuBgm = () => chosenTrack(settings(), 'bgmMenu') || (menuPick = menuPick || MENU_BGMS[Math.floor(Math.random() * MENU_BGMS.length)]);
/** ふつうの対戦の曲: 「対戦で流す」を選んでいればその曲、おまかせなら4曲からランダム */
export const normalBattleBgm = () => chosenTrack(settings(), 'bgmBattle') || pickNormalBgm();
/* オンライン対戦の曲: 選んだ曲に決めず、いつもの曲と交換した曲から毎回ランダム (前の対戦と同じ曲は選ばない) */
export function onlineBattleBgm() {
  const extra = TRACKS.filter(t => ownsTrack(t.key)).map(t => t.key);
  rotatePool = NORMAL_BGMS.concat(extra.filter(k => !NORMAL_BGMS.includes(k)));
  return pickNormalBgm(Math.random, extra);
}
export const BOSS_BGM = 'samayoi';
/* 曲のファイル (無ければ <key>.mp3) */
const FILES = { cho_zunou: 'cho_zunou.m4a', reflect: 'reflect.m4a', kaidoku: 'kaidoku.m4a', crescendo_jitter: 'crescendo_jitter.m4a',
  planetarium: 'planetarium.m4a', madoromu_neon: 'madoromu_neon.m4a', nine_jack: 'nine_jack.m4a', iruka: 'iruka.m4a',
  /* COLLECTION の BGM で交換する曲 (bgm-shop.js) */
  ...Object.fromEntries(['noesis', 'sagittarius', 'engram', 'objective_point', 'virus_entry', 'uso_ni_naru', 'siege_buster', 'electric_highway', 'grenade',
    'midnight_breaker', 'rapid4', 'irregular', 'rapid5', 'under_world', 'cyber10', 'cyber_prisoner'].map(k => [k, k + '.m4a'])) };
export const bgmFile = (key) => 'art/bgm/' + (FILES[key] || key + '.mp3');
/* 曲ごとの大きさ (ラウドネス、LUFS。ffmpeg の ebur128 で測った値)。曲によって 10 dB 近く違ったので、
   鳴らすときに LOUD_TARGET へそろえる (大きい曲は下げ、小さい曲は少しだけ上げる)。曲を足したら測って書き足す:
   ffmpeg -i art/bgm/<曲> -af ebur128=framelog=quiet -f null -   (最後の I: の値) */
const LOUDNESS = {
  a: -15.1, burst: -12.1, cho_zunou: -11.8, crazy_cat: -12.3, crescendo_jitter: -5.6, destroy_god: -6.6, final_2sec: -9.4,
  iruka: -6.6, junk_smash: -13.5, kaidoku: -14.5, kessen_asa: -8.8, madoromu_neon: -14.3, nine_jack: -7.6, orange_tunnel: -11.0,
  planetarium: -8.5, reaper_phoenix: -9.1, reflect: -7.9, samayoi: -8.9, zero: -13.4,
  noesis: -5.5, sagittarius: -6.9, engram: -6.1, objective_point: -7.1, virus_entry: -8.0, uso_ni_naru: -11.4, siege_buster: -7.0,
  electric_highway: -9.3, grenade: -7.8, midnight_breaker: -9.9, rapid4: -6.8, irregular: -8.3, rapid5: -8.2, under_world: -9.7, cyber10: -6.5, cyber_prisoner: -6.9
};
const LOUD_TARGET = -11;              // 曲の真ん中あたり (全体の大きさは今までと同じくらいに)
/** その曲を LOUD_TARGET にそろえる倍率 (上げるのは 1.6 倍まで。測っていない曲は 1) */
export function trackGain(key) {
  const l = LOUDNESS[key];
  return l === undefined ? 1 : Math.min(1.6, Math.pow(10, (LOUD_TARGET - l) / 20));
}
/** ふつうの対戦の曲を1つ選ぶ。前の対戦と同じ曲は選ばない (ただのランダムだと、4曲でも同じ曲が続くことがよくある)。
    前の曲は端末に覚えておく (対戦はページを開き直して始まることがあるため) */
const LAST_KEY = 'compileLastBgm';
export function pickNormalBgm(rnd = Math.random, extra = []) {
  let last = null;
  try { last = localStorage.getItem(LAST_KEY); } catch (e) { /* private mode */ }
  const all = NORMAL_BGMS.concat(extra.filter(k => !NORMAL_BGMS.includes(k)));
  const pool = all.filter(k => k !== last);
  const from = pool.length ? pool : all;
  const pick = from[Math.floor(rnd() * from.length)];
  try { localStorage.setItem(LAST_KEY, pick); } catch (e) { /* private mode */ }
  return pick;
}

let el = null;
let route = null;
let want = null;                 // 鳴らしたい曲 (null なら止める)

/* 音量: 設定の「BGM」(はじめは 30。キャラの声が聞き取りやすいよう控えめに) */
const level = () => (isMuted() ? 0 : Math.max(0, Math.min(1, (settings().bgmVol ?? 30) / 100)) * 0.7 * (want ? trackGain(want) : 1));

/* ふつうの対戦の曲 (ランダムの4曲) は、ROTATE_LOOPS 周したら別の曲へつなぐ (同じ曲がずっと続かないように)。
   ボス・強敵の曲、COLLECTION で選んだ曲は替えない */
const ROTATE_LOOPS = 2;
let loops = 0, lastTime = 0, swapping = false;
/* オンライン対戦は、選んだ曲があっても、いつもの曲と交換した曲 (rotatePool) から替えていく */
let rotatePool = null;
const rotating = () => !!want && ((rotatePool && rotatePool.includes(want))
  || (NORMAL_BGMS.includes(want) && !chosenTrack(settings(), 'bgmBattle') && !(BGM_RELEASED && settings().bgm)));
function onTime() {
  if (!el || swapping) return;
  const t = el.currentTime;
  if (t + 1 < lastTime) loops++;          // 頭に戻った = 1周した
  lastTime = t;
  if (loops >= ROTATE_LOOPS && rotating()) swapTrack();
}
function swapTrack() {
  const others = (rotatePool || NORMAL_BGMS).filter(k => k !== want);
  const next = others[Math.floor(Math.random() * others.length)];
  if (!next) return;
  swapping = true;
  const was = want;
  route.set(0, 0.4);                      // 1.2 秒ほどで小さくしてから替える
  setTimeout(() => {
    swapping = false;
    loops = 0; lastTime = 0;
    if (want !== was) return;             // その間に止めた・別の曲にした
    want = next;
    el.src = bgmFile(next);
    refreshBgm();
  }, 1300);
}

function ensure() {
  if (el) return;
  initAudio();                   // まだ触れていなくても作っておく (触れたときに再開する)
  el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  el.addEventListener('timeupdate', onTime);
  route = routeMedia(el, level());
}

/** 曲を鳴らす (同じ曲なら続きから)。key が無い・'off' なら止める */
export function playBgm(key) {
  /* COLLECTION の BGM をしまっている間は、対戦の2曲だけ鳴らす (タイトルの曲・選んだ曲は鳴らさない) */
  if (!BGM_RELEASED && !(BATTLE_BGM_ON && key && (isTrack(key) || NORMAL_BGMS.includes(key) || MENU_BGMS.includes(key) || key === RUN_BGM || key === STRONG_BGM || key === BOSS_BGM))) { stopBgm(); return; }
  clearTimeout(previewTimer);
  if (rotatePool && !rotatePool.includes(key)) rotatePool = null;   // オンラインの対戦から別の画面の曲へ
  want = key && key !== 'off' ? key : null;
  if (!want) { stopBgm(); return; }
  try {
    ensure();
    const url = bgmFile(want);
    if (!el.src.endsWith(url)) { el.src = url; loops = 0; lastTime = 0; }
    refreshBgm();
  } catch (e) { /* BGM が無くても遊べる */ }
}

/** 試し聴き: 頭から ms だけ流し、小さくして back() の曲に戻す (曲を選ぶための短い試し聴き。最後まで・繰り返しは流さない) */
let previewTimer = null;
export function previewBgm(key, back, ms = 15000) {
  playBgm(key);
  try { if (el) el.currentTime = 0; } catch (e) { /* 読み込み前 */ }
  previewTimer = setTimeout(() => {
    fadeOutBgm(1200);
    previewTimer = setTimeout(() => playBgm(back ? back() : null), 1300);
  }, ms);
}

/** 決着したときなど: 少しずつ小さくして止める (ms かけて) */
export function fadeOutBgm(ms = 1400) {
  if (!el || !want) return;
  want = null;
  route.set(0, ms / 1000 / 3);                    // 3 時定数でほぼ無音
  const e = el;
  setTimeout(() => { if (!want) e.pause(); }, ms);
}

/** キャラが喋っている間だけ BGM を小さくする (ms のあいだ。声が聞き取りやすいように) */
let duckTimer = null;
export function duckBgm(ms) {
  if (!el || !want || !route) return;
  route.set(level() * 0.4, 0.06);
  clearTimeout(duckTimer);
  duckTimer = setTimeout(() => { if (want) route.set(level(), 0.3); }, ms);
}

export function stopBgm() {
  want = null;
  if (el) el.pause();
}

/** 音量・消音の変更を反映する (設定・🔇 のあと) */
/* すべての音を消す・戻すを切り替えたら、BGM の音量もすぐ合わせる */
onMuteChange(() => refreshBgm());

export function refreshBgm() {
  if (!el) return;
  const v = level();
  route.set(v);
  if (!v || !want) { el.pause(); return; }
  if (el.paused) el.play().catch(() => { /* まだ画面に触れていない。触れたときに鳴らす */ });
}

/* 自動再生の制限: 画面に触れたときに鳴らし直す。iPhone の Safari は指を置いた瞬間 (pointerdown) では再生を許さず、
   指を離したとき (touchend)・タップ (click) だけ許すので、どれでも試す (ページを開き直して始まる対戦で鳴らなかった) */
/* kickAudio: 裏から戻ったあとの最初の1回、音の土台を起こし直す (audio.js) */
const retry = () => { initAudio(); kickAudio(); prime(); if (want && el && el.paused && level() > 0) el.play().catch(() => {}); };
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
const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';   // テスト (node) では見張らない
if (inBrowser) for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, retry, { capture: true, passive: true });
/* 画面を離れたら止め、戻ったら続きから */
if (inBrowser) document.addEventListener('visibilitychange', () => {
  if (!el) return;
  if (document.visibilityState === 'hidden') el.pause(); else refreshBgm();
});
onSettings(() => refreshBgm());

/** いまの様子 (確かめる用) */
export const bgmState = () => ({ want, src: el ? el.src.split('/').pop() : null, paused: el ? el.paused : null, time: el ? el.currentTime : 0, level: level() });
