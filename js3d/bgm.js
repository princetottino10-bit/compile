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
/* ふつうの対戦のいつもの12曲 (2026-10-15 からおまかせはシャッフルで、持っている曲すべてから選ぶ。この12曲は鳴らせる曲の印と、iPhone の下準備に使う): OpenTracks (旧 DOVA-SYNDROME) (2026-10-13 に、まんぼう二等兵の BPM 135〜165 の8曲を足した。
   あと1本の曲 TENSE_BGMS より遅くして、切り替わったときの差を残す)。
   OpenTracks の規約 (ファイルのまま取り出せる形で置かない) に合わせて m4a に変換して置いている */
export const NORMAL_BGMS = ['cho_zunou', 'reflect', 'kaidoku', 'crescendo_jitter', 'switcheroo', 'monolith_black', 'particle_tones', 'tsuisekisha', 'clock_jitter', 'joudou_catharsis', 'blaze_a_trail', 'killer_roll'];
export const STRONG_BGM = 'zero';
/* タイトル・メニュー (対戦以外) の落ち着いた3曲。2026-10-15 からおまかせはシャッフルになったので、選ぶのには使っていない (鳴らせる曲の印) */
export const MENU_BGMS = ['planetarium', 'madoromu_neon', 'nine_jack'];
/* 勝ち抜き戦 (RUN) の対戦以外の画面 (入口・地図・ショップ・休憩所など): 沈殿するイルカ */
export const RUN_BGM = 'iruka';
/* ストーリー (2026-10-23): 章の地図の曲と、会話の山場で替える曲。甘茶の音楽工房 (https://amachamusic.chagasi.com/) の曲。
   規約: ゲームの BGM として商用も可、曲だけの再配布は不可、表記は任意 (設定のクレジットに出す)。OpenTracks と同じく m4a に変換して置く */
export const STORY_BGMS = {
  ch0: 'genjitsunosukima',        // 序章 研究所 (夜): 現実の隙間
  ch1: 'mizunishizumupiano',      // 1章 水族館: 水に沈むピアノ
  ch2: 'janegreynoshouzou',       // 2章 屋敷: ジェーン・グレイの肖像
  ch3: 'rokugatsunoamaoto',       // 3章 倉庫: 6月の雨音
  ch4: 'kanatanikasumujoukisen',  // 4章 駅 (夕方): 彼方に霞む蒸気船
  ch5: 'elegyfourstrings2',       // 5章 研究所 (朝): エレジー・フォー・ストリングスⅡ
  ch6: 'inishienohiseki'          // 終章 所長室: 古の碑石
};
/* 会話の中で替える曲 (story.js の行の bgm / 場面の bgm に書く名前) */
export const STORY_SCENE_BGMS = ['gozennijinomunashisa', 'natsunokiri', 'sangatsunosundasora'];   // 午前2時の虚しさ・夏の霧・3月の澄んだ空
const STORY_TRACKS = [...Object.values(STORY_BGMS), ...STORY_SCENE_BGMS];
export const STORY_BGM_CREDIT = '甘茶の音楽工房';
/** その章の地図の曲 */
export const storyBgm = (chapterId) => STORY_BGMS[chapterId] || STORY_BGMS.ch0;
/* COLLECTION の BGM で「メニューで流す」を選んでいればその曲、おまかせならシャッフル */
export const menuBgm = () => chosenTrack(settings(), 'bgmMenu') || shuffleMenuBgm();
/** ふつうの対戦の曲: 「対戦で流す」を選んでいればその曲、おまかせならシャッフル (持っている曲から無作為に。1曲ごとに替える) */
export const normalBattleBgm = () => chosenTrack(settings(), 'bgmBattle') || shuffleBattleBgm();
/* オンライン対戦の曲: 選んだ曲に決めず、いつもシャッフル (同じ曲ばかり流れないように) */
export function onlineBattleBgm() {
  shuffleCtx = 'online';
  return (shuffled = pickShuffleBgm());
}
export const BOSS_BGM = 'samayoi';
/* 機械仕掛けの神 (CHALLENGE の CODE:PURPLE) の曲 */
export const DEUS_BGM = 'destroy_god';
/* すべてを見る者 (ALL-SEEING) の曲 */
export const PEEK_BGM = 'final_2sec';
/* どちらかが勝ちまであと1本になったら (ふつうの3本勝負なら2本目のコンパイルのあと) 切り替える曲。
   まんぼう二等兵 (OpenTracks) の速くて緊張感のある6曲 (BPM 162〜216。ふつうの対戦の曲は 140〜170) から、試合ごとにランダム */
export const TENSE_BGMS = ['interception', 'strike_despair', 'lobelia', 'will_you_cry', 'tactical_encounter', 'hangeki'];
/** あと1本の曲を1つ選ぶ (前の試合と同じ曲は選ばない) */
const LAST_TENSE_KEY = 'compileLastTenseBgm';
export function pickTenseBgm(rnd = Math.random) {
  let last = null;
  try { last = localStorage.getItem(LAST_TENSE_KEY); } catch (e) { /* private mode */ }
  const pool = TENSE_BGMS.filter(k => k !== last);
  const pick = pool[Math.floor(rnd() * pool.length)];
  try { localStorage.setItem(LAST_TENSE_KEY, pick); } catch (e) { /* private mode */ }
  return pick;
}
/* 曲のファイル (無ければ <key>.mp3) */
const FILES = { ...Object.fromEntries(STORY_TRACKS.map(k => [k, k + '.m4a'])), cho_zunou: 'cho_zunou.m4a', reflect: 'reflect.m4a', kaidoku: 'kaidoku.m4a', crescendo_jitter: 'crescendo_jitter.m4a',
  planetarium: 'planetarium.m4a', madoromu_neon: 'madoromu_neon.m4a', nine_jack: 'nine_jack.m4a', iruka: 'iruka.m4a',
  /* COLLECTION の BGM で交換する曲 (bgm-shop.js) */
  ...Object.fromEntries(['noesis', 'sagittarius', 'engram', 'objective_point', 'virus_entry', 'uso_ni_naru', 'siege_buster', 'electric_highway', 'grenade',
    'midnight_breaker', 'rapid4', 'irregular', 'rapid5', 'under_world', 'cyber10', 'cyber_prisoner'].map(k => [k, k + '.m4a'])),
  /* ふつうの対戦に足した曲と、あと1本の曲 */
  ...Object.fromEntries(['switcheroo', 'monolith_black', 'particle_tones', 'tsuisekisha', 'clock_jitter', 'joudou_catharsis', 'blaze_a_trail', 'killer_roll', 'interception', 'strike_despair', 'lobelia', 'will_you_cry', 'tactical_encounter', 'hangeki'].map(k => [k, k + '.m4a'])) };
export const bgmFile = (key) => 'art/bgm/' + (FILES[key] || key + '.mp3');
/* 曲ごとの大きさ (ラウドネス、LUFS。ffmpeg の ebur128 で測った値)。曲によって 10 dB 近く違ったので、
   鳴らすときに LOUD_TARGET へそろえる (大きい曲は下げ、小さい曲は少しだけ上げる)。曲を足したら測って書き足す:
   ffmpeg -i art/bgm/<曲> -af ebur128=framelog=quiet -f null -   (最後の I: の値) */
const LOUDNESS = {
  a: -15.1, burst: -12.1, cho_zunou: -11.8, crazy_cat: -12.3, crescendo_jitter: -5.6, destroy_god: -6.6, final_2sec: -9.4,
  iruka: -6.6, junk_smash: -13.5, kaidoku: -14.5, kessen_asa: -8.8, madoromu_neon: -14.3, nine_jack: -7.6, orange_tunnel: -11.0,
  planetarium: -8.5, reaper_phoenix: -9.1, reflect: -7.9, samayoi: -8.9, zero: -13.4,
  noesis: -5.5, sagittarius: -6.9, engram: -6.1, objective_point: -7.1, virus_entry: -8.0, uso_ni_naru: -11.4, siege_buster: -7.0,
  electric_highway: -9.3, grenade: -7.8, midnight_breaker: -9.9, rapid4: -6.8, irregular: -8.3, rapid5: -8.2, under_world: -9.7, cyber10: -6.5, cyber_prisoner: -6.9,
  interception: -4.3, strike_despair: -6.5, lobelia: -5.6, will_you_cry: -6.2, tactical_encounter: -6.4, hangeki: -5.8,
  switcheroo: -6.2, monolith_black: -6.4, particle_tones: -5.6, tsuisekisha: -8.5, clock_jitter: -6.2, joudou_catharsis: -5.4, blaze_a_trail: -8.1, killer_roll: -6.4,
  /* ストーリー (甘茶の音楽工房)。静かな曲が多く、上げられるのは 1.6 倍までなので、対戦の曲より少し小さく鳴る (会話の後ろに置く曲なのでそのまま) */
  genjitsunosukima: -19.3, mizunishizumupiano: -16.9, janegreynoshouzou: -14.2, rokugatsunoamaoto: -15.2, kanatanikasumujoukisen: -16.1,
  elegyfourstrings2: -14.3, inishienohiseki: -14.3, gozennijinomunashisa: -15.9, natsunokiri: -17.7, sangatsunosundasora: -17.4
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

/* =========================================================================
 * シャッフル (COLLECTION の BGM で「おまかせ」のとき。2026-10-15 に本人の希望で)
 *   メニューとふつうの対戦 (オンラインはいつも) の曲を、持っている COLLECTION の曲 (はじめからの曲と交換した曲) から無作為に選び、
 *   1曲終わるたびに次の曲も無作為に選ぶ (繰り返さない)。
 *   ボス・強敵・機械仕掛けの神・すべてを見る者・あと1本の曲・勝ち抜き戦の画面の曲は、場面の曲なのでそのまま
 * ========================================================================= */
/** シャッフルで選ぶ曲 (持っている COLLECTION の曲) */
export const shufflePool = () => TRACKS.filter(t => ownsTrack(t.key)).map(t => t.key);
/* 最近流した曲 (同じ曲が近くに続かないよう、曲数の半分 (最大8曲) までは選ばない) */
const SHUFFLE_RECENT_KEY = 'compileShuffleRecent';
let shuffleRecent = null;
let shuffled = null;             // シャッフルで選んで流している曲 (終わったら次へ。ほかの曲を鳴らしたら null 扱い)
let shuffleCtx = null;           // 'menu' / 'battle' / 'online' (メニューへ戻ったら、対戦で流していた曲は続けない)
/** シャッフルで次の曲を1つ選ぶ (最近流した曲は避ける) */
export function pickShuffleBgm(rnd = Math.random, pool = shufflePool()) {
  if (!shuffleRecent) {
    try { shuffleRecent = JSON.parse(localStorage.getItem(SHUFFLE_RECENT_KEY) || '[]'); } catch (e) { shuffleRecent = []; }
    if (!Array.isArray(shuffleRecent)) shuffleRecent = [];
  }
  if (!pool.length) return null;
  const keep = Math.min(8, Math.floor(pool.length / 2));
  const recent = shuffleRecent.slice(-keep);
  const fresh = pool.filter(k => !recent.includes(k));
  const from = fresh.length ? fresh : pool;
  const pick = from[Math.floor(rnd() * from.length)];
  shuffleRecent = shuffleRecent.filter(k => k !== pick).concat(pick).slice(-8);
  try { localStorage.setItem(SHUFFLE_RECENT_KEY, JSON.stringify(shuffleRecent)); } catch (e) { /* private mode */ }
  return pick;
}
function shuffleMenuBgm() {
  /* メニューの間は、いま流れている曲を続ける (画面を移るたびに替えない。試し聴きのあともその曲へ戻す) */
  if (shuffleCtx === 'menu' && shuffled) return shuffled;
  shuffleCtx = 'menu';
  return (shuffled = pickShuffleBgm());
}
function shuffleBattleBgm() {
  shuffleCtx = 'battle';
  return (shuffled = pickShuffleBgm());
}
/* シャッフルで流している曲か (この曲は繰り返さず、終わったら次の曲へ)。途中で曲を選んだら、その曲は繰り返す */
const shuffling = () => !!want && want === shuffled
  && (shuffleCtx === 'online' || !chosenTrack(settings(), shuffleCtx === 'menu' ? 'bgmMenu' : 'bgmBattle'));
/* 次の曲に替わったら知らせる (main.js が、表記の要る曲の曲名と表記を出す) */
let onShuffleTrack = null;
export const setShuffleNotify = (fn) => { onShuffleTrack = fn; };
function nextShuffle() {
  const next = pickShuffleBgm(Math.random, shufflePool().filter(k => k !== want));
  if (!next) return;
  shuffled = next;
  playBgm(next);
  try { el.currentTime = 0; } catch (e) { /* 読み込み前 */ }
  if (onShuffleTrack) onShuffleTrack(next);
}

let el = null;
let route = null;
let want = null;                 // 鳴らしたい曲 (null なら止める)

/* 音量: 設定の「BGM」(はじめは 30。キャラの声が聞き取りやすいよう控えめに) */
const level = () => (isMuted() ? 0 : Math.max(0, Math.min(1, (settings().bgmVol ?? 30) / 100)) * 0.7 * (want ? trackGain(want) : 1));

function ensure() {
  if (el) return;
  initAudio();                   // まだ触れていなくても作っておく (触れたときに再開する)
  el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  el.addEventListener('ended', () => { if (shuffling()) nextShuffle(); });
  route = routeMedia(el, level());
}

/** 曲を鳴らす (同じ曲なら続きから)。key が無い・'off' なら止める */
export function playBgm(key) {
  /* COLLECTION の BGM をしまっている間は、対戦の2曲だけ鳴らす (タイトルの曲・選んだ曲は鳴らさない) */
  if (!BGM_RELEASED && !(BATTLE_BGM_ON && key && (isTrack(key) || NORMAL_BGMS.includes(key) || MENU_BGMS.includes(key) || key === RUN_BGM || key === STRONG_BGM || key === BOSS_BGM || key === DEUS_BGM || key === PEEK_BGM || TENSE_BGMS.includes(key) || STORY_TRACKS.includes(key)))) { stopBgm(); return; }
  clearTimeout(previewTimer);
  want = key && key !== 'off' ? key : null;
  if (!want) { stopBgm(); return; }
  try {
    ensure();
    const url = bgmFile(want);
    if (!el.src.endsWith(url)) el.src = url;
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

/** 対戦の途中で曲を替える: いまの曲を ms かけて小さくしてから、次の曲を頭から (ぶつ切りにしない) */
export function crossBgm(key, ms = 1100) {
  if (!el || !want || !route) { playBgm(key); return; }
  if (want === key) return;
  const was = want;
  route.set(0, ms / 1000 / 3);
  setTimeout(() => {
    if (want !== was) return;             // その間に止めた・別の曲にした (決着など)
    playBgm(key);
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
  el.loop = !shuffling();          // シャッフルの曲は1回で終わらせて次へ (設定を切り替えたらすぐ合わせる)
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
