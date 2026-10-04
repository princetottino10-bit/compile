/* =========================================================================
 * 3Dビュー: エントリポイント
 *   engine.js (window.CompileEngine) をルール担当として、描画と入力だけを担う。
 * ========================================================================= */
import { randomDecks, shuffled } from './solodraft.js';
import { bonusXp, grantXp, XP_GAIN, hashKey } from './xp.js';
import { recordDailyGame, DAILY_XP, dailyView } from './daily.js';
import { maybeLoginHint, uploadReplay } from './account.js';
import { logPlay } from './playlog.js';
import * as FEEL from './feel.js';
import { createPickAid } from './pickaid.js';
import { openSpectate } from './spectate.js';
import { mountAvatar, AVATARS, avatarIds } from './avatar.js';
import { FAVORITE } from './avatar-lines.js';
import { countUp, dealIn } from './motion.js';
import { loadGacha, chipsOf, giveChips } from './gacha.js';
import { earnedChips } from './chips.js';
import * as CW from './crashwatch.js';
import { unlockTrophies, TROPHY_XP, pruneTrophies } from './achievements.js';
import { addReplay, getReplay, pinReplay, rebuild } from './replays.js';
import * as RS from './resume.js';
import { decodeReplay, sharedCodeFromHash, shareReplayLink, setReplayShortener, shortIdFromHash, loadShortReplay } from './replayshare.js';
/* リプレイの短いリンク: 符号をサーバーに預けて (ログインしている人だけ) ID を返す / ID から符号を受け取る (誰でも) */
setReplayShortener(async (code) => {
  await ROOM.roomLoadDeps();
  if (!ROOM.roomConfigured() || !(await ROOM.roomSession())) return null;
  const r = await ROOM.roomApi('shareReplay', { code });
  return r && r.id ? r.id : null;
}, async (id) => {
  await ROOM.roomLoadDeps();
  if (!ROOM.roomConfigured()) return null;
  const { data, error } = await ROOM.roomClient().from('shared_replays').select('code').eq('id', id).maybeSingle();
  return !error && data ? data.code : null;
});
import { advantageSeries, turningPoints } from './turning.js';
import { trophyContext, showTrophyBanner } from './achievements-ui.js';
import * as THREE from '../vendor/three.module.js';
import { createStage } from './stage.js';
import { createBoard, visualFingerprint, locOf } from './board.js';
import { createControlMarker } from './control.js';
import { createPanels } from './panel.js';
import { runSetup } from './setup.js';
import { runTitle } from './title.js';
import { mountTrainingTools } from './training.js';
import * as ROOM from './room.js';
import * as PZ from './puzzle.js';
import * as TS from './tsume.js';
import { watchErrors, reportError } from './errorreport.js';
import * as TU from './tutorial.js';
import { settings, onSettings, openSettings, setAvatarOptionsGate } from './settings.js';
import { recordSoloResult, localRecords } from './stats.js';
import { conquered, newlyConquered, conquerable } from './stats-data.js';
import * as STORY from './story.js';
import { showStoryResult } from './story-ui.js';
import { openWorld } from './story-world.js';
import { cardStats, cardTier, playerLevel, protocolSummary } from './stats-data.js';
import { isUnlocked, rewardsBetween, TITLES, UNDERDOG_XP, underdogCleared, AVATAR_RELEASED, COSMETICS } from './rewards.js';
import { confetti } from './gachafx.js';
import { setCosmeticProtocols, profileOf, myLook } from './cosmetics-ui.js';
import { setCosmeticsProtocols } from './cosmetics-mode.js';
import { displayName } from './displayname.js';
import { showPlates, setCompileProgress, setTurnPlate } from './plates.js';
import { matUnlocked, MAT_W, MAT_D } from './playmat.js';
import { initAccount, openAccount, takeAccountResume, accountState, onAccountChange } from './account.js';
import { openCardList } from './cardlist-ov.js';
import { openOpponentSelect } from './opponent-select.js';
import { UNDERDOG_DECK, STRONGEST_AI, UNDERDOG_LEVEL, UNDERDOG_TAG_LEVEL, UNDERDOG_TAG_RIVAL_MATE, levelLabel, fixedDeck } from './aidecks.js';
import { openRun, runHud, showRunAfterGame } from './run-ui.js';
import { openWeekly, weeklyHud, showWeeklyAfterGame } from './weekly-ui.js';
import { compilesBy, loadRun, RUN_WIN_COMPILES, battleOpts, lethal, nodeById } from './run.js';
import { loadWeekly, loadStoredWeekly, weekKey } from './weekly.js';
import { openReview } from './review.js';
import { runRoomLobby } from './roomui.js';
import { bindSelectHead, questionText } from './selectui.js';
import { faceImageURL, backImageURL, pruneFaceCache, ART_SETS, setMaxAnisotropy, faceCacheSize } from './cardtex.js';
import * as FX from './fx.js';
import { buildArena } from './arena.js';
import { initAudio, sfx, setMuted, isMuted, setSfxVolume, onMuteChange } from './audio.js';
import { mountMuteButton, muteIcon } from './mutebutton.js';
import { playBgm, refreshBgm, fadeOutBgm, pickNormalBgm, normalBattleBgm, onlineBattleBgm, STRONG_BGM, BOSS_BGM } from './bgm.js';
import { trackOf } from './bgm-shop.js';
import { BGM_RELEASED } from './rewards.js';
import { emblemDataURL } from './emblems.js';
import * as LAYOUT from './layout.js';
import { BOARD, CARD, COLOR, TIMING, VIEW, IOS } from './theme.js';
import * as TW from './tween.js';
import * as UI from './ui.js';
import { pickCard, placementPad } from './input.js';
import { placementChoices, renderPlayChoices } from './playchoices.js';
import { createAiClient } from './aiclient.js';
import { buildRunDefs } from './runcards.js';
import { createLogFormat } from './logformat.js';
import { meaningfulSteps as cutSteps } from './steps.js';
import { initDialogs } from './dialogs.js';
import { initGamepad } from './gamepad.js';
import { iconArt } from './face-icons.js';

const Engine = window.CompileEngine;
initDialogs();
const ME = 0;      // 視点 = 人間プレイヤー
const AI = 1;

let stage, board, panels, arena, defIndex = {}, protoIndex = {};
let pickAid = null;           // カードを選ぶときの手助け (矢印・選んだ順・予告・理由)
let cur = null;                 // { state, requests, log, winner }
let busy = false;               // 演出中はクリックを無視
let selectedUid = null;
let hoverUid = null;
let ctrlMarker = null;
let pads = [];                  // 着地パッド (line × side)
let demoMode = false;           // AI 同士の観戦 (?demo=1)
let roomMode = false;           // オンライン対戦 (secure-room)
let roomRm = null;              // 直近の publicState
let roomWatching = false;        // オンラインの対戦を観戦している (指せない。両方の手札は伏せてある)
let roomTracker = null;         // trace の差分追跡
let roomPollTimer = null;
let handCompactMode = null;
let roomLoggedVersion = null;
let trainingMode = false;
/* 共有された問題を解いている (?puzzle=...)。{ spec, task, goal } */
let puzzle = null;
/* 選択画面で決まった先手 (ドラフト) と、始めに知らせること (ランダム編成) */
let chosenFirst = null;
/* ---------- 使って勝つほど光るカード・お気に入り ----------
   カードごとの勝ち数は戦績から数える。光り方は board のオーラ (card.js) */
let cardWins = cardStats(localRecords());
/* プレイヤーレベル (見た目の解放に使う)。決着ごとに数え直す */
let myLevel = playerLevel(localRecords(), bonusXp()).level;
/* 選んだ見た目を、解放されていれば使う (記録を消して条件を外れたら標準に戻す) */
/* 相手の見た目 (盤面の奥半分・相手が持ったときのマーカー・相手のカードの裏面)。
   オンラインは部屋から届く。CPU 戦などは標準 */
const NO_LOOK = { mat: 'neon', marker: 'default', sleeve: 'default', plate: 'default' };
let oppLook = NO_LOOK;
function cleanLook(look) {
  const pick = (v, d) => (typeof v === 'string' && /^[a-z0-9_]{1,24}$/.test(v)) ? v : d;
  return look ? { mat: pick(look.mat, 'neon'), marker: pick(look.marker, 'default'), sleeve: pick(look.sleeve, 'default'), plate: pick(look.plate, 'default'),
    avatar: AVATARS[look.avatar] ? look.avatar : null } : NO_LOOK;
}
function applyLooks() {
  if (!arena || !ctrlMarker) return;
  /* 相手がマットを選んでいない (標準の NEON GRID・CPU 戦) ときは、自分のマットを盤面全体に敷く */
  arena.setMat(myLook(settings()).mat, oppLook.mat === 'neon' ? null : oppLook.mat);
  ctrlMarker.setStyle(cosmetic('marker', 'default'), oppLook.marker);
}
function setOppLook(look) {
  const next = cleanLook(look);
  if (JSON.stringify(next) === JSON.stringify(oppLook)) return;
  oppLook = next;
  applyLooks();
  if (cur && board) board.syncInstant(shown());
}

function cosmetic(kind, fallback) {
  const key = settings()[kind];
  return key && isUnlocked(kind, key, myLevel) ? key : fallback;
}
/* プロトコルの習熟度 (戦績から数える)。カード表面のキラ加工に使う */
let protoMastery = protocolSummary(localRecords());
/* 習熟度 3 で銀、6 で金、9 で虹のキラ。見た目だけで強さは変わらない (設定で切れる) */
const FOIL_TIERS = [
  { min: 9, color: '#ffffff', strength: 0.34, rainbow: true },
  { min: 6, color: '#ffd98a', strength: 0.3 },
  { min: 3, color: '#dfe8ff', strength: 0.26 }
];
function foilFor(defId) {
  if (!settings().foil) return null;
  const d = defIndex[defId];
  const t = d && protoMastery.get(d.proto);
  const lv = t ? t.mastery.level : 0;
  return FOIL_TIERS.find(x => lv >= x.min) || null;
}
function refreshCardGlow() {
  cardWins = cardStats(localRecords());
  protoMastery = protocolSummary(localRecords());
  myLevel = playerLevel(localRecords(), bonusXp()).level;
  if (board && cur) board.syncInstant(shown());
}
/* CPU 戦の戦績以外で入る経験値 (xp.js) を足し、レベルが上がったら手に入った報酬を見せる。
   noTrophy: 実績の判定をこのあとまとめてするとき */
async function gainXp(src, xp, key, noTrophy) {
  const before = myLevel;
  if (!grantXp(src, xp, key)) return;
  refreshCardGlow();                 // myLevel も数え直す
  if (myLevel > before) { await UI.levelUpCutIn(myLevel, rewardsBetween(before, myLevel)); maybeLoginHint('level'); }
  if (!noTrophy) await checkTrophies(null);
}

/* 決着した1試合の中身 (デイリーミッションと実績の判定に使う) */
function gameSummary(st, side, win, level, online) {
  const t = st.tally || {};
  const effectsMap = (t.effects && t.effects[side]) || {};
  return {
    win, level, online, protocols: ownProtos(st, side),
    compiles: (t.compiles && t.compiles[side]) | 0, oppCompiles: (t.compiles && t.compiles[1 - side]) | 0,
    winCompiles: st.winCompiles || 3, effectsMap,
    effects: Object.values(effectsMap).reduce((n, v) => n + (v | 0), 0),
    faceUpIds: ((t.faceUp && t.faceUp[side]) || []).slice(),
    /* 表で出したカードの値 (ID の数字と値が合わないカードがあるので、カードの資料から) */
    faceUpVals: ((t.faceUp && t.faceUp[side]) || []).map(id => (defIndex[id] ? defIndex[id].value : 99)),
    chainMax: (t.chains && t.chains[side]) | 0,      // 自分の効果で割り込んでつないだ、一番長いチェーン
    turns: (st.turns || 0) + 1, at: Date.now(),
    refreshes: (t.refreshes && t.refreshes[side]) | 0,   // リフレッシュした回数
    touched: (t.touched && t.touched[side]) | 0,         // 自分のカードが相手の効果で削除・反転・移動・手札に戻された回数
    maxLine: (t.maxLine && t.maxLine[side]) | 0,         // 自分のラインの合計値の最高
    short: shortMatch,                                   // 短縮マッチ (実績に数えない)
    tag: !!tagMates                                      // タッグデュエル
  };
}

/* 決着のあと: デイリーミッションを進め、実績を判定する (CPU 戦・オンライン共通) */
async function afterGameProgress(st, side, win, level, online) {
  const game = gameSummary(st, side, win, level, online);
  const r = recordDailyGame(game, Object.keys(protoIndex));
  if (matchGains) matchGains.daily.push(...r.cleared.map(m => m.text));
  if (r.cleared.length) {
    const xp = r.cleared.reduce((n, m) => n + m.xp, 0) + (r.allNow ? DAILY_XP.all : 0);
    UI.toast('DAILY MISSION CLEAR — ' + r.cleared.map(m => m.text).join(' / ') + (r.allNow ? ' (3つ達成)' : '') + '  +' + xp + ' XP', 3600);
    for (const m of r.cleared) await gainXp('daily', m.xp, 'dm:' + r.day + ':' + m.key, true);
    if (r.allNow) await gainXp('daily', DAILY_XP.all, 'dm:' + r.day + ':all', true);
  }
  /* オンラインの対戦は1試合の集計 (リフレッシュ・表で出したカード・コンパイルの回数など) が届かないので、
     その1試合の実績は判定しない (前は 0 回とみなして、勝っただけで SHADOW PLAY などが付いた) */
  await checkTrophies(st.tally ? game : null);
}

/* 実績を判定し、取った分の経験値を足して知らせる。レベルが上がって取れる実績もあるので数回まわす */
let trophyBusy = null;
async function checkTrophies(game) {
  pruneTrophies(trophyContext(null));
  while (trophyBusy) await trophyBusy;              // 同時に2回判定しない
  let done;
  trophyBusy = new Promise(r => { done = r; });
  try {
    for (let pass = 0; pass < 3; pass++) {
      const got = unlockTrophies(trophyContext(pass ? null : game));
      if (!got.length) break;
      const before = myLevel;
      if (matchGains) matchGains.trophies.push(...got.map(t => t.name));
      for (const t of got) grantXp('trophy', TROPHY_XP[t.tier], 'ach:' + t.id);
      refreshCardGlow();
      await showTrophyBanner(got);
      maybeLoginHint('trophy');
      if (myLevel > before) await UI.levelUpCutIn(myLevel, rewardsBetween(before, myLevel));
    }
  } finally {
    trophyBusy = null;
    done();
  }
}
function auraFor(defId) {
  const t = cardWins.get(defId);
  const tier = t ? cardTier(t.wins) : null;
  if (!tier) return null;
  return { color: tier.color, strength: tier.key === 'bronze' ? 0.45 : tier.key === 'silver' ? 0.55 : 0.7, holo: !!tier.holo, fav: false };
}
/* 詳細パネルに、そのカードの光り方 (表で出して勝った数) と効果の発動回数を添える */
UI.setCardInfoHandler({
  winsOf: (defId) => { const t = cardWins.get(defId); return t ? { wins: t.wins, games: t.games, effects: t.effects, tier: cardTier(t.wins) } : null; }
});
let runMode = false;             // 勝ち抜き戦・週替わり3連戦の1戦 (?run=1)
let storyNode = null;            // ストーリーの対戦の場面 (story.js)。決着したら ?story=1 で地図に戻る
let resumed = null;              // 中断した対戦を続きから遊ぶ (resume.js): { rec, built }
let runKind = 'run';             // 'run' (勝ち抜き戦) / 'weekly' (週替わり3連戦)
let quickGame = false;           // おまかせで1戦 (?quick=1)
let runEnded = false;            // 勝ち抜き戦の結果を出したか (ライフが尽きたらその場で出す)
let setupNote = '';
let lastSetup = null;
let firstGameHintShown = false;    // はじめの数戦の操作の案内 (1戦に1回)              // いまの CPU 戦のプロトコル { p0, p1 } (もう1戦で同じ組み合わせにする)
/* 対戦のそばのキャラ (avatar.js)。自分 (左下)・タッグの味方 (その後ろ)・相手 (右上)。
   問題・観戦・トレーニング・リプレイでは出さない (チュートリアルと勝ち抜き戦・週替わりでは出す)。
   2026-09-27: いったん管理者にだけ見せている (ユーザーの指示)。ログインの確認が済んだら出し入れし直す */
let avatars = null;              // { me, mate, opp, oppIds: [1人目, 2人目] }
const avatarSaidAt = {};         // 同じ種類のひとことを続けて言わない
function myAvatarId() { const k = settings().avatar; return AVATARS[k] && isUnlocked('avatar', k, myLevel) ? k : 'shion'; }
/* キャラが見られるか (出したあとはだれでも。出す前は管理者だけ) */
const avatarsOpen = () => AVATAR_RELEASED || !!accountState().admin;
/* 持っているキャラ [[id, 名前], ...] (観戦で選ぶ) */
function ownedAvatars() { return (COSMETICS.avatar || []).filter(([k]) => AVATARS[k] && isUnlocked('avatar', k, myLevel)); }
/* 相手のキャラは、デッキを決める前に決めておく (その子の得意プロトコルを CPU のデッキに入りやすくするため)。
   設定の「相手のキャラ」(ふだんはランダム)。自分と同じ子は選ばない */
let plannedOpp;
function oppAvatarPlan() {
  if (plannedOpp !== undefined) return plannedOpp;
  if (storyNode) return (plannedOpp = storyNode.oppAvatar || null);
  /* 勝ち抜き戦のボス戦は、ボス本人 (avatar.js の boss_<id>) */
  if (runMode && runKind === 'run') {
    const run = loadRun();
    if (run && run.opp && run.opp.boss) return (plannedOpp = 'boss_' + (run.opp.bossId || 'strongest'));
  }
  const me = myAvatarId();
  const fixed = settings().oppAvatar;
  plannedOpp = fixed && fixed !== 'random' && AVATARS[fixed] && fixed !== me ? fixed : oppAvatarIds([me])[0];
  return plannedOpp;
}
/* 相手のキャラが出るとき、その子の得意プロトコル (FAVORITE) を CPU のデッキに 7 割で入れる。
   avoid: 自分のデッキ (同じプロトコルは入れない)。pool: 使えるプロトコル (無ければどれでも) */
const FAV_RATE = 0.7;
function oppFavorite() {
  return avatarsOpen() && settings().avatarShow !== false && !tutorial && !demoMode ? FAVORITE[oppAvatarPlan()] || null : null;
}
function favorDeck(deck, avoid, pool) {
  const fav = oppFavorite();
  if (!fav || !Array.isArray(deck) || deck.includes(fav) || (avoid || []).includes(fav) || (pool && !pool.includes(fav)) || Math.random() >= FAV_RATE) return deck;
  const out = deck.slice();
  out[Math.floor(Math.random() * out.length)] = fav;
  return out;
}
/* 相手のキャラ: 自分・味方と重ならない中から、1戦ごとにランダム (タッグの2人も重ならない) */
function oppAvatarIds(taken) {
  const pool = shuffled(avatarIds().filter(i => !taken.includes(i)));
  const a = pool[0] || 'nadeshiko';
  return [a, pool[1] || a];
}
function syncAvatar() {
  /* 観戦 (demoMode) は、観戦の画面でキャラを選んだときだけ */
  /* チュートリアルは、キャラの公開前でもずんだもんが案内する */
  const want = (avatarsOpen() || !!tutorial || !!storyNode) && settings().avatarShow !== false && !puzzle && (!demoMode || !!spectate) && !trainingMode && !replayMode && !!cur;
  if (!want) {
    if (avatars) for (const k of ['me', 'mate', 'opp']) if (avatars[k]) avatars[k].destroy();
    avatars = null;
    return;
  }
  if (avatars) return;
  /* 観戦: A (左下) と B (右上) は観戦の画面で選んだキャラ (なしも)。タッグの相棒はほかからランダム */
  const sp = spectate && spectate.av;
  /* 下剋上タッグの相手 (最強のタッグ) は紫苑と茜で決まり。自分と味方はほかの子から */
  const udTag = !sp && !storyNode && aiDifficulty === UNDERDOG_TAG_LEVEL;
  const UD_OPP = ['shion', 'nadeshiko'];
  /* オンライン: 相手は相手が着けているキャラ。観戦は手前 (作った人) と奥 (参加した人) が着けているキャラ */
  const roomLooks = roomMode && roomRm && Array.isArray(roomRm.looks) ? roomRm.looks.map(cleanLook) : null;
  let me = sp ? sp.a : tutorial ? 'zundamon' : storyNode ? storyNode.mate || null
    : roomWatching && roomLooks ? roomLooks[0].avatar || 'shion' : myAvatarId();
  if (udTag && UD_OPP.includes(me)) me = avatarIds().find(i => !UD_OPP.includes(i) && i !== 'asagi') || me;
  const pool = (ids) => shuffled(avatarIds().filter(i => !ids.includes(i)));
  const mate = tagMates && (!sp || sp.a) ? (sp ? pool([sp.a, sp.b])[0]
    : (avatarIds().find(i => i !== me && i === 'asagi' && !(udTag && UD_OPP.includes(i))) || avatarIds().find(i => i !== me && !(udTag && UD_OPP.includes(i))))) : null;
  let oppIds;
  if (udTag) oppIds = UD_OPP.slice();
  else if (roomLooks && !tagMates) { const o = roomLooks[roomWatching ? 1 : 1 - roomRm.side].avatar; oppIds = [o || oppAvatarIds([me])[0], null]; }
  else if (sp) oppIds = sp.b ? [sp.b, pool([sp.a, sp.b, mate])[0] || sp.b] : [null, null];
  else if (storyNode) oppIds = [storyNode.oppAvatar || null, null];
  else {
    /* 相手のキャラ: 設定の「相手のキャラ」(ふだんはランダム)。自分・味方と同じ子は選ばない */
    /* デッキを決める前に決めておいた子 (oppAvatarPlan。得意プロトコルを CPU のデッキに入れるため) */
    const plan = oppAvatarPlan();
    oppIds = oppAvatarIds([me, mate, plan].filter(Boolean));
    if (plan && plan !== me && plan !== mate) oppIds = [plan, oppIds[0]];
  }
  avatars = {
    me: me ? mountAvatar(me, { side: 'me', avoid: storyAvoid() }) : null,
    mate: mate ? mountAvatar(mate, { side: 'me', back: true }) : null,
    opp: tutorial || !oppIds[0] ? null : mountAvatar(oppIds[0], { side: 'opp', voice: settings().oppVoice !== false, avoid: storyAvoid() }),
    oppIds
  };
  if (avatars.opp) setTimeout(() => { if (avatars && avatars.opp) avatars.opp.react('hello'); }, 900);
  /* タッグ: 前にいる子が、後ろの相方に声をかける (相方ごとのセリフ。avatar-lines.js の tag_hello_*) */
  if (avatars.me && avatars.mate) setTimeout(() => avatarTagSay('tag_hello'), 5200);
  /* 自分のキャラも、相手が言い終わるころに挨拶を返す。自分が先攻のときは「私の番」のひとことがすぐ出るので言わない
     (チュートリアルの案内役は別のひとことを言う) */
  if (avatars.me && !tutorial) setTimeout(() => { if (avatars && avatars.me && cur && (cur.state.turns | 0) <= 1 && cur.state.turn !== ME) avatarSay(ME, 'hello'); }, 3200);
}
/* 物語の中では、コンパイルを遊びとして語らない: 勝ち・負け・遊び・手札・対戦などの言葉が入ったひとことは言わせない (avatar.js の avoid) */
const STORY_AVOID = /勝|負|遊|手札|対戦|ゲーム|ターン|有利/;
const storyAvoid = () => (storyNode ? STORY_AVOID : null);
/* いま、その側で話す人 (タッグは指している人) */
function avatarOf(side, st) {
  if (!avatars) return null;
  if (side !== ME) return avatars.opp;
  const s = st || (cur && cur.state);
  return avatars.mate && s && s.tag && s.tag.pilot[ME] === 1 ? avatars.mate : avatars.me;
}
/* 大事な場面 (コンパイル・勝敗など)。話している途中でも捨てずに、言い終わったらすぐ言う */
const AVATAR_MUST_KINDS = new Set(['compile', 'compiled', 'win', 'lose', 'almost', 'reach', 'hurt', 'crushed', 'hello', 'lesson', 'good', 'retry', 'turn', 'lead', 'sure', 'doomed']);
/* チュートリアルの案内 (tu...) も捨てない */
const AVATAR_MUST = { has: (kind) => AVATAR_MUST_KINDS.has(kind) || /^tu(\d|ask)/.test(kind) || /^(ace$|own_)/.test(kind) };
/* 話している途中に来たひとことは、1つだけ待たせて、言い終わったら言う (前は捨てていたので「喋ったり喋らなかったり」になっていた)。
   待たせるのは大事な場面を優先。ふつうのひとことは 5 秒たったら古いので捨てる */
const avatarQueue = new Map();       // avatar -> { kind, vars, at }
function avatarFlush(a) {
  clearTimeout(a._qTimer);
  a._qTimer = setTimeout(() => {
    const p = avatarQueue.get(a);
    if (!p) return;
    if (!avatars || ![avatars.me, avatars.mate, avatars.opp].includes(a)) { avatarQueue.delete(a); return; }
    if (a.idleIn() > 0) { avatarFlush(a); return; }
    avatarQueue.delete(a);
    if (!AVATAR_MUST.has(p.kind) && Date.now() - p.at > 5000) return;
    a.react(p.kind, p.vars);
  }, a.idleIn() + 180);
}
/** キャラが言い終わるのを待つ (最大 maxMs)。相手が次の手を打つ前などに */
async function avatarsQuiet(maxMs = 2500) {
  const until = Date.now() + maxMs;
  const busy = () => avatars && [avatars.me, avatars.mate, avatars.opp].some(a => a && (a.idleIn() > 0 || avatarQueue.has(a)));
  while (busy() && Date.now() < until) await TW.wait(120);
}
/* UNDO (待った・練習の戻す) で盤面を戻したとき: 戻した手で起きたことのひとことは言わない。
   待っているセリフを捨て、少しの間 (あとから言う予定だったもの: コンパイルされた・見ていた など) は何も言わない */
let avatarHushUntil = 0;
function avatarHush(st) {
  avatarQueue.clear();
  avatarHushUntil = Date.now() + 2500;
  /* 戻した盤面のコントロールを「いまの持ち主」にしておく (戻ったのを、取ったと思って喜ばない) */
  avatarControl = st && typeof st.control === 'number' ? st.control : -1;
}
/* chance: 言う確率 (毎回だとうるさいもの)。gapMs: 同じ種類を続けて言わない間 */
function avatarSay(side, kind, vars, st, gapMs, chance, retried) {
  if (Date.now() < avatarHushUntil) return;
  const a = avatarOf(side, st);
  /* キャラがまだ出ていない (対戦の始まりの最初の番の合図など) ときは、大事なセリフだけ少し待って言い直す */
  if (!a) {
    if (!retried && AVATAR_MUST.has(kind) && cur) setTimeout(() => avatarSay(side, kind, vars, st, gapMs, chance, true), 1500);
    return;
  }
  /* チュートリアルのずんだもんは案内役。対戦のひとこと (ぼくの番なのだ 等) は言わない */
  if (tutorial && side === ME && !/^(tu\d|tuask|lesson$|good$|retry$)/.test(kind)) return;
  if (chance !== undefined && Math.random() > chance) return;
  const k = side + ':' + kind;
  const now = Date.now();
  if (gapMs && now - (avatarSaidAt[k] || 0) < gapMs) return;
  avatarSaidAt[k] = now;
  /* 話している途中なら待たせる (大事な場面を優先して1つだけ) */
  if (a.idleIn() > 0 || avatarQueue.has(a)) {
    const pend = avatarQueue.get(a);
    if (!pend || AVATAR_MUST.has(kind) || !AVATAR_MUST.has(pend.kind)) avatarQueue.set(a, { kind, vars, at: now });
    avatarFlush(a);
    return;
  }
  a.react(kind, vars);
}
/* そのラインをコンパイルすれば勝ち (まだ済んでいないプロトコルで、済みがあと1本足りない) */
function reachLine(st, side, line) {
  const ps = st && st.players && st.players[side] && st.players[side].protocols;
  if (!ps || !ps[line] || ps[line].compiled) return false;
  const need = Array.isArray(st.winBySide) ? st.winBySide[side] : (st.winCompiles || 3);
  return ps.filter(p => p.compiled).length === need - 1;
}
/* その側に、コンパイルすれば決着するライン (reachLine) で、もう 10 以上で相手を上回っているものがあるか */
function decidingLine(st, side) {
  if (!st || !st.lines || st.winner !== null) return false;
  return [0, 1, 2].some(l => reachLine(st, side, l) && totalOf(st, l, side) >= 10 && totalOf(st, l, side) > totalOf(st, l, 1 - side));
}
/* 形勢: 済みのプロトコル1本を 10 点として、ラインの合計の差と足す。+8 以上で優勢、-8 以下で劣勢 */
function standingOf(st, side) {
  if (!st || !st.players || typeof Engine.lineTotal !== 'function') return 0;
  const score = (s) => st.players[s].protocols.reduce((a, p, i) => a + (p.compiled ? 10 : Engine.lineTotal(st, i, s)), 0);
  const d = score(side) - score(1 - side);
  return d >= 8 ? 1 : d <= -8 ? -1 : 0;
}
/* 考えこんでいる: 自分の番で 25 秒さわっていなければ、1手番に1回だけ相手のキャラが声をかける (自分のキャラはプレイしている本人なので) */
/* 数え始めは「自分の番で手が空いた時点」と「最後に触った時点」の遅いほう。
   前は最後に触った時点だけで数えていて、相手の番の間に触らないと、自分の番になってすぐ急かされていた */
const AVATAR_IDLE_MS = 45000;
let avatarIdleTurn = -1, avatarLastInput = Date.now(), avatarWaitTurn = -1, avatarWaitSince = 0;
for (const ev of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(ev, () => { avatarLastInput = Date.now(); }, true);
setInterval(() => {
  if (!avatars || !cur || busy || demoMode || cur.requests.length || !humanTurn(cur.state) || cur.state.winner !== null) {
    avatarWaitTurn = -1;                  // 手が空いていない間は数えない (空いたところから数え直す)
    return;
  }
  const t = cur.state.turns | 0;
  if (t !== avatarWaitTurn) { avatarWaitTurn = t; avatarWaitSince = Date.now(); }
  const since = Math.max(avatarWaitSince, avatarLastInput);
  if (t !== avatarIdleTurn && Date.now() - since > AVATAR_IDLE_MS) { avatarIdleTurn = t; avatarSay(AI, 'idle'); }
}, 3000);
/* その場面を動かした側: いま解決している効果のカードの持ち主 (相手の番に自分のカードの効果が出ることもある)。
   効果の途中でなければ、その場面の手番 */
function actorOf(step, from) {
  const c = effectCardOf(step, from);
  return c ? c.owner : from.turn;
}
/* いま解決している効果のカード (無ければ null) */
function effectCardOf(step, from) {
  const src = effectSource(step);
  return (src && from && from.cards && from.cards[src]) || null;
}
/* 担当のカードのうち、効果が実際に働いたときに言うひとこと (avatar-lines.js の OWN_LATE)。どれも表向きで働く効果なので、見えている情報だけで決まる。
   FIRE 3: 1コマずつの再生の中で見る (a → b の1コマと、そのコマを動かした効果のカード)。終了の効果で、1枚捨ててカードを反転させた */
function avatarOwnCheck(a, b, effectCard) {
  if (!avatars || !a || !b || !effectCard || !a.cards || !b.cards || effectCard.def !== 'FIRE_4') return;
  const flipped = Object.keys(b.cards).some(uid => a.cards[uid] && a.cards[uid].zone === 'field' && b.cards[uid].zone === 'field' && a.cards[uid].faceUp !== b.cards[uid].faceUp);
  if (flipped) avatarSay(effectCard.owner, 'own_FIRE_3', null, b, 4000);
}
/* ICE 3・SPEED 0 → SPEED 3: 答えた選択 (req) と、その前後の盤面から見る。
   カードが動く・着地するコマでは、解決中の効果がもう別のカードに移っているので、1コマずつの見方では拾えない (60 戦で 0 回だった)。
   通信対戦 (roomStep) では言わない */
function avatarOwnAnswered(a, b, req) {
  if (!avatars || !a || !b || !req || !a.cards || !b.cards) return;
  const side = req.player;
  const lineOf = (st, uid) => st.lines.findIndex(l => l[0].includes(uid) || l[1].includes(uid));
  const mine = (def) => Object.keys(b.cards).filter(uid => b.cards[uid].def === def && b.cards[uid].owner === side && b.cards[uid].zone === 'field' && b.cards[uid].faceUp);
  /* ICE 3: 自分の効果で、覆われた下から別のラインへ移動した */
  if (req.prompt === 'shift-dest' && req.context === 'ICE_3') {
    const moved = mine('ICE_3').some(uid => { const was = lineOf(a, uid), now = lineOf(b, uid); return was >= 0 && now >= 0 && was !== now; });
    if (moved) avatarSay(side, 'own_ICE_3', null, b);
  }
  /* SPEED 0 → SPEED 3: SPEED 0 の「カードを1枚プレイする」で、SPEED 3 を表で出した */
  if (req.prompt === 'play-free' && req.context === 'SPEED_1') {
    const landed = mine('SPEED_4').some(uid => !a.cards[uid] || a.cards[uid].zone !== 'field');
    if (landed) avatarSay(side, 'own_SPEED_3', null, b);
  }
}
/* ハンデス: 相手 (の効果) に手札を失わされた側 (捨て札・相手の手札・山札へ。場に出したものは数えない) が嫌がる。
   actor: その場面を動かした側 (actorOf) */
function avatarHandesCheck(a, b, actor, effectCard) {
  if (!avatars || !a || !b || !a.players || !b.players) return;
  /* 自分のプロトコルを自分で並べ替えた (コントロール・効果): ひとこと */
  for (const s of [0, 1]) {
    const was = a.players[s].protocols.map(p => p.name).join(), now = b.players[s].protocols.map(p => p.name).join();
    if (was !== now && (actor === undefined ? a.turn : actor) === s) avatarSay(s, 'rearrange', null, b, 5000);
  }
  /* 相手の効果でなければハンデスではない (コストで捨てた・手札の上限・どの効果か分からない場面は数えない) */
  if (!effectCard) return;
  /* 大きいカード (値 5・6) を相手の効果で裏にされた・削除された側は嫌がる。
     合計の減りで見る「崩された」(3 以上減ったとき) では、裏向きの 5・6 を消されたとき (減りは 2) に何も言わなかった。
     コンパイルで捨て札になった分は数えない */
  if (Date.now() - avatarCompileAt >= 6000) {
    for (let l = 0; l < 3; l++) {
      for (const s of [0, 1]) {
        if (effectCard.owner === s) continue;
        const hit = (a.lines[l][s] || []).some((u) => {
          const ca = a.cards[u], cb = b.cards[u], d = ca && defIndex[ca.def];
          if (!d || !cb || !(d.value >= 5)) return false;
          /* 裏向きのカードの値は、持ち主しか知らない。相手のキャラが嫌がると「5 か 6 だった」とばれるので、
             裏向きで反応するのは、CPU 戦の自分のキャラだけ (オンライン・観戦では表向きのカードだけ) */
          if (!ca.faceUp && (s !== ME || roomMode || demoMode)) return false;
          const deleted = /^trash/.test(cb.zone || '');
          const flippedDown = ca.faceUp && !cb.faceUp && /^field/.test(cb.zone || '');
          return deleted || flippedDown;
        });
        /* 合計が 3 以上減っていれば、合計の減りの方 (崩された・悲鳴) が言うので、ここでは重ねない */
        if (hit && totalOf(b, l, s) - totalOf(a, l, s) > -3) avatarSay(s, 'hurt', null, b, 8000);
      }
    }
  }
  for (const s of [0, 1]) {
    if (effectCard.owner === s) continue;
    const now = new Set(b.players[s].hand);
    const lost = a.players[s].hand.filter(u => !now.has(u) && b.cards[u] && !/^(field|committed|transit)/.test(b.cards[u].zone || ''));
    if (lost.length) avatarSay(s, 'handes', null, b, 5000);
  }
}
/* コントロールを取った側がひとこと (変わったときだけ) */
let avatarControl = null;
let avatarCompileAt = 0;          // 最後にコンパイルが起きた時刻 (その直後の合計の減りでは驚かない)
let avatarActor = null;           // いま再生している場面を動かした側 (その効果のカードの持ち主。無ければその場面の手番)。再生の外では null
let avatarTurn = null;            // いま再生している場面の手番の側。再生の外では null
/* 喜ぶひとこと (つながった・積み上がった・まとめて消した) を言ってよいか: 自分の手番のときだけ。
   相手のカードで自分のカードが発動した (表にされた・覆われた) ときは、自分の効果が動いても喜ばない */
const ownTurn = (side) => (avatarTurn === null ? cur && cur.state && cur.state.turn : avatarTurn) === side;
function avatarControlCheck(st) {
  const c = st && typeof st.control === 'number' ? st.control : -1;
  if (avatarControl !== null && c !== avatarControl && c >= 0) avatarSay(c, 'control', null, st, 6000);
  avatarControl = c;
}
/* タッグの相方へのひとこと。前にいる子が、後ろの子の id を相方として言う (後ろの子の吹き出しは見えないため) */
function avatarTagSay(kind, st) {
  if (!avatars || !avatars.me || !avatars.mate) return;
  const front = avatarOf(ME, st);
  const back = front === avatars.mate ? avatars.me : avatars.mate;
  avatarSay(ME, kind, { mate: back.id }, st, kind === 'tag_in' ? 15000 : 0, kind === 'tag_in' ? 0.5 : undefined);
}
/* タッグ: 指す番の人が前に出る。相手のキャラは、相手の番が始まるときにその番の人へ替える
   (前は相手が指し終えた瞬間に次の人へ替わり、いま指した人のひとことや名札が次の人のものになっていた)。
   oppTurn: 相手の番が始まった (このときだけ相手を替える) */
let oppShownPilot = 0;               // 相手の側で、いま出ている人 (0 = 相手1 / 1 = 相手2)
function avatarTagTurn(st, oppTurn) {
  if (!avatars || !st || !st.tag) return;
  if (avatars.mate) {
    const partner = st.tag.pilot[ME] === 1;
    if (avatars.me) avatars.me.setBack(partner);
    avatars.mate.setBack(!partner);
    /* 交代して前に出た子が、下がった相方にひとこと (毎回だとうるさいので半分、15 秒あける) */
    if (avatars._front !== undefined && avatars._front !== partner && st.turn === ME) avatarTagSay('tag_in', st);
    avatars._front = partner;
  }
  if (!oppTurn) return;
  oppShownPilot = st.tag.pilot[AI];
  const want = avatars.oppIds[oppShownPilot];
  if (want && avatars.opp && avatars.opp.id !== want) { avatars.opp.destroy(); avatars.opp = mountAvatar(want, { side: 'opp', voice: settings().oppVoice !== false }); }
}
/* 名札の呼び名: 出ているキャラの名前 (キャラを出さない設定なら CPU / 相手1・2)。モードの名前は呼び名にしない */
const avatarName = (id) => (id && AVATARS[id] ? AVATARS[id].name : '');
function oppCallName(pilot) {
  const id = avatars ? (avatars.oppIds || [])[pilot] : (pilot ? null : oppAvatarPlan());
  return avatarName(id) || (tagMates ? 'CPU ' + (pilot + 1) : 'CPU');
}
/* 難易度の短い名前 (名札の下の小さい字) */
function shortLevel(lv) {
  if (lv === null || lv === undefined) return '';
  const t = levelLabel(lv);
  return t === '不明' ? '' : t.replace(/\s*\(.*\)$/, '').replace(/^挑戦者 .*/, '挑戦者');
}

/* 設定の画面に、対戦のキャラの項目 (相手の声・クレジット) を出すのは、キャラが見える人だけ */
/* 「AI でしゃべらせる」はなくした (2026-10-02。声が付かず、使わないため)。設定に入れた API キーが端末に残らないよう消す */
try { localStorage.removeItem('compileAiTalk'); } catch (e) { /* private mode */ }
setAvatarOptionsGate(() => AVATAR_RELEASED || !!accountState().admin, () => (COSMETICS.avatar || []).filter(([k]) => AVATARS[k]));

/* 観戦 (spectate.js の結果)。{ a, b, level, bet } / null */
let spectate = null;

/* タッグデュエル (2 対 2): 味方と相手の味方のプロトコル { p0: [3], p1: [3] }。null ならふつうの対戦 */
let tagMates = null;
/* タッグで、自分の側を味方が指している (次に指すのが味方)。CPU 戦の味方は CPU、オンラインは味方の人 */
function partnerMove(st) {
  const s = st || (cur && cur.state);
  if (s && s.tag && s.tag.online) return s.tag.pilot[ME] !== s.tag.mine;
  return !!(tagMates && s && s.tag && s.tag.pilot[ME] === 1);
}
/* オンラインのタッグの席 (roomApplyView が覚える): 4つの席と、自分の側 (サーバーの 0 / 1) */
let roomTag = null;
/* 人が操作できる手番か (自分の側の手番で、タッグなら自分が指す番) */
function humanTurn(st) { return !!st && st.turn === ME && !partnerMove(st) && !(autoPlay && !roomMode) && !roomWatching; }
/* 自分が持ってきたプロトコル (タッグの複合プロトコルは、その側の1人目の分) */
function ownProtos(st, side) { return st.players[side].protocols.map(p => (p.names ? p.names[0] : p.name)); }

/* この試合で手に入ったもの (対戦のあとの画面に1つずつ出す)。{ xp0, lv0, daily: [文], trophies: [名前] } */
let matchGains = null;
/* 今日のデイリーミッションで指定されたプロトコル (まだ達成していないものを優先)。無ければ null */
function todayDailyProto() {
  try {
    const list = dailyView(Object.keys(protoIndex)).filter(m => m.proto && protoIndex[m.proto]);
    const open = list.find(m => !m.done) || list[0];
    return open ? open.proto : null;
  } catch (e) { return null; }
}
/* おまかせで使う基本セット (最初の12プロトコル。効果が素直で覚えやすい) */
const QUICK_POOL = ['FIRE', 'WATER', 'SPEED', 'DEATH', 'LIFE', 'LIGHT', 'DARKNESS', 'GRAVITY', 'METAL', 'PSYCHIC', 'SPIRIT', 'PLAGUE'];
/* リプレイ (replays.js): 対局中の棋譜 { init, actions }、いま見ているリプレイ、直前の試合のリプレイ id */
let replayLog = null;
let replayMode = null;
let lastReplayId = null;
const logAction = (a) => { if (replayLog) replayLog.actions.push(JSON.parse(JSON.stringify(a))); RS.logResume(a); };
/* チュートリアルのレッスン (?tutorial=1..)。{ index, lesson } */
let tutorial = null;
let tutorialOver = false;
let tutorialAsk = null;       // 答えを求められている選択 (req.prompt)。案内の切り替えに使う
let tutorialFocus = null;     // いまの案内で光らせる場所
let tutorialPending = false;  // 手を指してから判定が出るまで (この間は案内を変えない)
let trainingTools = null;
/* トレーニングの操作状態: 選択中のカード・表示中の側・効果の有無・置く向き */
const training = { sel: null, side: 0, effects: true, faceUp: true, collapsed: false, undo: [], protos: null };

/* 表示用の状態。
   engine は選択待ちで中断すると state に「アクション前の基準状態」を返し、
   途中経過は view に入れる。盤面の描画・HUD は必ずこちらを見る。
   一方 apply / legalActions に渡すのは基準状態 (cur.state) の方。 */
/* 感想戦で見返している盤面 (null なら今の盤面) */
let reviewView = null;
function shown() { return reviewView || (cur && (cur.view || cur.state)) || null; }

/* 感想戦の棋譜: 手を指す前の盤面と、その手 (CPU 戦のみ) */
const gameHistory = [];
/* 待った: 自分の最後の手 (出す・リフレッシュ) の直前。1手だけ戻せる (ふつうの CPU 戦のみ) */
let undoPoint = null;
let gpPickAt = null;
let shortMatch = false;               // いまの対戦が短縮マッチか (3本より少ないコンパイルで決着)。実績に数えない                 // ゲームパッド用の当たり判定 (bindInput で作る。gpHitPoint)
/* 相手の番のまとめ: { start: 相手の番の最初の盤面, lines: 相手の手の文 } */
let oppTurn = null;

/* 合法手: ソロはエンジン、ルームはサーバー提供値 */

function legalNow() {
  if (roomMode) {
    return ROOM.normLegalActions(roomRm);
  }
  if (!cur || !humanTurn(cur.state) || cur.requests.length || cur.state.winner !== null) return [];
  return Engine.legalActions(cur.state);
}

/* ライン合計: ルーム状態はサーバー計算値 (_totals) を持つ */
function totalOf(st, line, side) {
  return st._totals ? st._totals[line][side] : Engine.lineTotal(st, line, side);
}

/* ---------- 起動 ---------- */
/* iPhone・iPad: 重い画面の演出を軽くする (three-play.html の body.ios)。合成レイヤーが増えるとページごと落ちる */
if (IOS) document.body.classList.add('ios');
/* 画面で起きたエラーはサーバーに知らせる (報告がなくても気づけるように。errorreport.js) */
watchErrors();
CW.checkLastBattle();                 // 前の対戦が途中で落ちていたら知らせる (crashwatch.js)
boot().catch((e) => {
  console.error(e);
  reportError(e, 'boot');
  UI.toast('初期化に失敗: ' + e.message + ' (ページを読み直してください)', 8000);
});
/* 取りこぼした非同期のエラーも、黙って固まらずに知らせる (同じ内容は一度だけ) */
const shownErrors = new Set();
window.addEventListener('unhandledrejection', (ev) => {
  const msg = (ev.reason && (ev.reason.message || String(ev.reason))) || '不明なエラー';
  console.error(ev.reason);
  if (shownErrors.has(msg)) return;
  shownErrors.add(msg);
  UI.toast('エラー: ' + msg, 5000);
});

/* ロゴ (Orbitron) と見出し・数字 (Oxanium) の書体を読み込む。届かなくても先へ進む (system-ui で描く) */
function loadFonts(timeoutMs) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const loads = ['900 40px Orbitron', '800 40px Oxanium', '700 40px Oxanium'].map(f => document.fonts.load(f).catch(() => null));
  return Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, timeoutMs))]);
}

async function boot() {
  const T0 = performance.now();
  const mark = (label) => { window.__bootMarks = window.__bootMarks || []; window.__bootMarks.push(label + ':' + Math.round(performance.now() - T0)); };
  /* OAuth の戻り先では、ゲーム初期化より先にセッション復元と URL の掃除を行う。 */
  await ROOM.roomRestoreOAuthRedirect();
  /* 読み込めなかったとき (通信の失敗・404 の HTML) に、何が起きたか分かるようにする */
  const getJson = (url) => fetch(url).then((r) => {
    if (!r.ok) throw new Error(url + ' を読み込めませんでした (' + r.status + ')');
    return r.json();
  });
  const [cards, effects] = await Promise.all([getJson('data/cards.json'), getJson('data/effects.json')]);
  setCosmeticProtocols(cards.protocols);
  setCosmeticsProtocols(cards.protocols);
  /* 前に下剋上を達成していた人 (褒美を足す前・別の端末・あとから記録を足した人) にも経験値の褒美を。key が同じなので1回だけ */
  if (underdogCleared()) for (let i = 1; i <= UNDERDOG_XP / 20; i++) grantXp('underdog', 20, 'ud:' + i);
  setTimeout(() => { checkTrophies(null); }, 1500);   // 前から遊んでいる人の分・別の端末で取った分をまとめて
  for (const p of cards.protocols) {
    protoIndex[p.name] = p;
    for (const c of p.cards) {
      defIndex[c.id] = {
        id: c.id, proto: p.name, color: p.color, number: c.number, set: p.set,
        value: c.value, upper: c.upper, middle: c.middle, lower: c.lower,
        effectTypes: c.effectTypes || []
      };
    }
  }
  /* 勝ち抜き戦だけのカード (★ と ＋)。画面の defIndex とエンジン・CPU の Worker に登録する */
  const runDefs = buildRunDefs(cards, effects);
  for (const d of runDefs.ui) defIndex[d.id] = d;
  markDemerits(effects, runDefs.engine);
  mark('fetch');
  Engine.init(cards, effects, runDefs.engine);
  Engine.setAiLevel(1);
  /* CPU の思考は Worker で (画面が止まらないように)。エンジンは読み込んだのと同じ版を使う */
  const engineTag = document.querySelector('script[src^="engine.js"]');
  aiClient = createAiClient(Engine, { cards, effects, extra: runDefs.engine, engineUrl: engineTag ? engineTag.src : null });
  /* trace を有効にすると、どのカードが効果を発動したかを演出に使える。
     AI 探索中は重くなるので、思考の直前だけ切る (withoutTrace)。 */
  Engine.setTrace(true);
  UI.bindLogFormatter(logParts, showCardNoteFor);
  mark('engineInit');
  /* カードやプロトコルの札は canvas に文字を描くので、書体が届いてから作る (最大1.5秒待つ) */
  await loadFonts(600);                 // 待ちすぎると最初の画面が遅れる。間に合わなければ後から差し替わる
  mark('fonts');
  /* 盤面のスタックは、覆われた札に上段 (覆われても効く) があるときだけ上段が見える幅でずらし、無ければ詰める */
  LAYOUT.setStackCardInfo((st, uid) => {
    const c = st.cards[uid];
    if (!c || !c.faceUp) return false;
    const d = defIndex[c.def];
    return !!(d && d.upper && String(d.upper).trim());
  });

  stage = createStage(document.getElementById('stage'));
  setMaxAnisotropy(stage.renderer.capabilities.getMaxAnisotropy());
  ctrlMarker = createControlMarker(stage.scene);
  ctrlMarker.group.visible = false;          // 対戦開始 (refreshHud) まで隠す
  stage.onFrame((dt) => ctrlMarker.tick(dt));
  board = createBoard(stage, defIndex, ME, {
    auraFor,
    foilFor,
    sleeve: () => cosmetic('sleeve', 'default'),
    oppSleeve: () => oppLook.sleeve,
    /* 自分のコンパイルの光の色 (レベルの報酬)。虹は毎回ちがう色 */
    compileStyle: () => cosmetic('ccolor', 'default'),
    compileColor: () => {
      const c = cosmetic('ccolor', 'default');
      if (c === 'gold') return '#ffd86a';
      if (c === 'cyan') return '#7ff3ff';
      if (c === 'rainbow') return '#' + new THREE.Color().setHSL(Math.random(), 0.9, 0.62).getHexString();
      if (c === 'lime') return '#b6ff4a';
      if (c === 'violet') return '#b07bff';
      if (c === 'ember') return '#ff7a2e';
      return null;
    },
    /* 自分のカードが着地した瞬間に震わせる (飛び立つ前ではなく、音と光に合わせる)。表で値が大きいほど強く */
    onLand: (o) => { if (o.byMe) FEEL.buzz(o.faceUp ? 14 + o.value * 4 : 12); },
    /* 落ちたときの手がかり: コンパイルの演出を始めた・覚えているカードの絵の数 */
    onCompileStart: () => CW.battleNote('compile', memNote()),
    onCompileEnd: () => { document.body.classList.remove('compiling'); CW.battleNote('after-compile', memNote()); },
    /* タッグ: 手札が入れ替わるのと同時に、キャラも入れ替える (前は手番の告知のときで、手札より遅れていた) */
    onTagSwap: (st) => { if (tagMates) avatarTagTurn(st); },
    onCompile: async (info) => {
      CW.battleNote('compile-cutin', memNote());
      document.body.classList.add('compiling');       // iPhone: 演出の間だけ、すりガラスの効果を切る (three-play.html の body.ios.compiling)
      FEEL.buzz(info.side === ME ? [30, 60, 50] : 40);
      /* コンパイルした側は喜び、された側は少し遅れて悔しがる */
      avatarCompileAt = Date.now();
      /* 勝負が決まるコンパイル (最後の1本) では「まだ負けてない」などとは言わせない。このあと勝ち・負けのセリフが出る */
      const decisive = cur && cur.state && cur.state.winner === info.side;
      /* リコンパイル (済みのプロトコルでもう一度) は、1枚もらうだけなので軽いひとことだけ。された側は何も言わない */
      if (info.recompile) avatarSay(info.side, 'recompile', null, null, 6000);
      else if (!decisive) {
        avatarSay(info.side, 'compile');
        setTimeout(() => avatarSay(1 - info.side, 'compiled'), 1300);
      }
      /* まず盤上のプロトコルカードを "Compiled" 面へ裏返し、その後にカットイン */
      await panels.flipAt(info.line, info.side, true);
      await UI.compileCutIn({
        ...info,
        who: spectate ? specName(info.side) : null,          // 観戦は「YOU / OPPONENT」ではなく、キャラの名前
        art: glitchArtUrl(info.name),
        emblem: emblemDataURL(info.name, info.color, 512, true)
      });
    }
  });
  arena = buildArena(stage);
  FX.createDust(stage, 900);
  /* 合計値の変化とコンパイル圏入りを、盤の上に小さく見せる (feel.js)。
     感想戦・リプレイの早送り・トレーニングでは出さない (手を戻すたびに数字が飛ぶため) */
  panels = createPanels(stage, ME, {
    onChange: (events) => {
      if (!cur || reviewView || replayMode || trainingMode || demoMode || !gameStartedAt || Date.now() - gameStartedAt < 1200) return;
      for (const e of events) {
        /* 手の解決中は1コマずつ出さず、チェーンを解き終えたあとにラインごとの増減をまとめて出す (netDeltaShow) */
        if (e.delta && Math.abs(e.delta) <= 20 && !netDelta) FEEL.floatDelta(stage, e.pos, e.delta, e.color);
        if (e.ready) { FEEL.readyBurst(stage, e.pos, e.color); if (e.side === ME) FEEL.buzz(18); }
        /* 相手の手でラインが大きく減った側は驚く。コンパイル目前になった側は「あと少し」(続けては言わない) */
        /* ラインが大きく減った: 動かした側 (いま再生している場面の手番) で見分ける。cur はもう先まで進んでいることがある。
           相手の手で減った側は驚く。自分の手で (METAL 3 などで) まとめて消したときは、動かした側が得意げに。
           コンパイルでカードが消えたときは、どちらも言わない */
        const byCompile = Date.now() - avatarCompileAt < 6000;
        const actor = avatarActor === null ? cur.state.turn : avatarActor;
        /* 自分のラインが自分の手で減った (ずらした・裏にした・戻した) ときは、どちらも言わない */
        /* 相手の手で 5 点以上減らされたら、一段上の悲鳴 (必ず言う) と、画面を少し揺らす。3〜4 点はいつもの「崩された」 */
        if (e.delta <= -3 && !byCompile) {
          if (actor !== e.side) {
            const big = e.delta <= -5;
            avatarSay(e.side, big ? 'crushed' : 'hurt', null, null, big ? 3000 : 8000);
            if (ownTurn(actor)) avatarSay(actor, 'wipe', null, null, 8000);
            if (big && !matchMedia('(prefers-reduced-motion: reduce)').matches) stage.shake(0.1, 340);
          }
        }
        else if (e.ready) {
          /* コンパイルすれば勝ちのライン (あと1本) なら、特別なひとこと */
          const reach = reachLine(cur.state, e.side, e.line);
          avatarSay(e.side, reach ? 'reach' : 'almost', null, null, reach ? 4000 : 12000);
        }
        /* 「積み上がってきた」: 自分の手でラインが増えて、2枚目以降で、合計が 7 以上になったとき
           (前は「一度に 4 以上増えた」で、1枚目を置いただけでも言っていた) */
        else if (e.delta > 0 && e.total >= 7 && actor === e.side && ownTurn(e.side) && stackCount(e.line, e.side) >= 2) avatarSay(e.side, 'boost', null, null, 10000, 0.6);
      }
    }
  });
  buildPads();
  stage.onFrame((dt, t) => { positionPlayChoices(); positionShiftTotals(); trackHandTop(); trackHandRight(); trackPileCounts(); if (panels) panels.tick(t); });
  /* 設定 (演出の速さ・音量) を反映し、変わったらすぐ当てる */
  /* 盤面の柄は解放されているものだけ (記録を消したあとなどに、未解放のまま残らないように) */
  onSettings((s) => {
    TW.setSpeed(s.speed);
    setSfxVolume(s.sfx);
    applyLooks();
    if (cur) board.syncInstant(shown());                      // カードの裏面を付け替える
    syncAvatar();                                             // キャラの出し入れ
    if (avatars && avatars.opp) avatars.opp.setVoice(s.oppVoice !== false);   // 相手の声のオンオフ
  });
  bindInput();
  mark('stage');

  const params = new URLSearchParams(location.search);
  quickGame = params.get('quick') === '1';           // 記録に「おまかせで1戦」と残すため (決着のときは params が見えない)
  demoMode = params.get('demo') === '1';
  const pick = (key, fallback) => {
    const v = params.get(key);
    const list = v ? v.split(',').map(s => s.trim().toUpperCase()).filter(n => protoIndex[n]) : [];
    return list.length === 3 ? list : fallback;
  };
  let p0 = pick('me', null);
  let p1 = pick('ai', null);
  /* タッグのもう1戦 (?tag=1&mate=&omate=) */
  if (params.get('tag') === '1' && p0 && p1) {
    const mate = pick('mate', null), omate = pick('omate', null);
    if (mate && omate) tagMates = { p0: mate, p1: omate };
  }
  /* もう1戦 (REMATCH が ?me=&ai=&lv= を付けて開き直す): 同じ組み合わせ・同じ強さで、タイトルと準備を飛ばす */
  const lvParam = parseInt(params.get('lv'), 10);
  if (p0 && p1 && params.get('training') !== '1' && Number.isInteger(lvParam)) applyAiDifficulty(lvParam);
  /* おまかせ (?quick=1): 基本セットから両者のプロトコルを選び、すぐ始める (はじめての人向け)。
     相手の強さは設定の「おまかせで対戦する強さ」、デイリーのプロトコルを入れる設定なら自分の1つ目にそれを入れる */
  if (params.get('quick') === '1' && !p0) {
    const basic = QUICK_POOL.filter(n => protoIndex[n]);
    const from = basic.length >= 6 ? basic : cards.protocols.map(x => x.name);
    const lv = Math.min(2, Math.max(0, settings().quickLevel | 0));
    const dailyProto = settings().quickDaily ? todayDailyProto() : null;
    if (dailyProto) {
      const mine = [dailyProto].concat(shuffled(from.filter(n => n !== dailyProto)).slice(0, 2));
      p0 = mine; p1 = shuffled(from.filter(n => !mine.includes(n))).slice(0, 3);
    } else {
      const d = randomDecks(from);
      p0 = d.me; p1 = d.ai;
    }
    p1 = favorDeck(p1, p0, from);                       // 相手のキャラの得意プロトコルが入りやすい
    applyAiDifficulty(lv);
    setupNote = 'おまかせ: あなた ' + p0.join(' / ') + (dailyProto ? ' (' + dailyProto + ' はデイリー)' : '') +
      '　相手 (' + levelLabel(lv) + ') ' + p1.join(' / ');
  }
  /* ?training=1&me=...&ai=... でトレーニング盤面を直接開く (確認用) */
  if (params.get('training') === '1' && p0) { trainingMode = true; p1 = p1 || p0.slice(); }
  /* 共有された問題: 盤面・課題・クリア条件が URL に入っている */
  if (params.get('puzzle')) {
    puzzle = PZ.decodePuzzle(params.get('puzzle'));
    if (puzzle) {
      p0 = puzzle.spec.sides[0].protos.slice(); p1 = puzzle.spec.sides[1].protos.slice();
      document.body.classList.add('puzzle');
    }
    else UI.toast('問題のリンクが壊れています');
  }
  /* 詰めコンパイル (?tsume=t1-01)。問題モードと同じ仕組みで、お題と判定だけ違う */
  if (params.get('tsume') && params.get('tsume') !== 'list' && !puzzle) {
    const t = params.get('tsume') === 'daily' || params.get('tsume') === 'daily-hard'
      ? TS.dailyPick(await TS.loadDailyList(), undefined, params.get('tsume') === 'daily-hard')
      : (await TS.loadTsume()).find(x => x.id === params.get('tsume'));
    if (t) {
      puzzle = { spec: t.spec, goal: t.goal.kind, task: TS.goalText(t.goal, t.spec.sides[0].protos), tsume: t };
      p0 = t.spec.sides[0].protos.slice(); p1 = t.spec.sides[1].protos.slice();
      document.body.classList.add('puzzle', 'tsume');
    } else UI.toast('詰めコンパイルの問題が見つかりません');
  }

  /* 保存したリプレイを見る (?replay=id) */
  if (params.get('replay')) {
    replayMode = getReplay(params.get('replay'));
    if (replayMode) {
      p0 = replayMode.init.p0.slice(); p1 = replayMode.init.p1.slice();
      document.body.classList.add('replay');
    } else UI.toast('リプレイが見つかりません (消したか、別の端末で保存したもの)');
  }
  /* 共有されたリプレイ (#rp=符号)。棋譜はリンクの中にある (replayshare.js) */
  const shortId = !replayMode && shortIdFromHash();
  const sharedCode = !replayMode && (shortId ? await loadShortReplay(shortId) : sharedCodeFromHash());
  if (sharedCode) {
    replayMode = await decodeReplay(sharedCode, cards.protocols.map(p => p.name));
    if (replayMode) {
      p0 = replayMode.init.p0.slice(); p1 = replayMode.init.p1.slice();
      document.body.classList.add('replay');
    } else UI.toast('共有されたリプレイを開けませんでした (リンクが途中で切れているかもしれません)', 4200);
  }
  if (shortId && !sharedCode) UI.toast('共有されたリプレイが見つかりませんでした', 4200);

  /* チュートリアル: レッスンの盤面から始める */
  const tuNo = parseInt(params.get('tutorial'), 10);
  if (tuNo >= 1 && tuNo <= TU.LESSONS.length && !puzzle) {
    tutorial = { index: tuNo - 1, lesson: TU.LESSONS[tuNo - 1] };
    p0 = tutorial.lesson.spec.sides[0].protos.slice(); p1 = tutorial.lesson.spec.sides[1].protos.slice();
    document.body.classList.add('tutorial');
    applyAiDifficulty(0, { engine: 1 });
  }

  if (demoMode && !p0) {
    const pool = cards.protocols.map(x => x.name);
    const draw = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    p0 = [draw(), draw(), draw()];
    p1 = p1 || [draw(), draw(), draw()];
    document.body.classList.add('demo');
  }

  /* URL で指定がなければ、タイトル → モード選択 → 各モードの準備へ */
  if (!p0) {
    const bootEl0 = document.getElementById('boot');
    bootEl0.classList.add('gone');
    setTimeout(() => { bootEl0.style.display = 'none'; }, 800);
    document.body.classList.add('pregame');
    mountMuteButton();                  /* すべての音を消すボタン (タイトル・待合室・ストーリーの左下) */
    /* ログイン状態は裏で読む (待たない)。Google から戻ってきたときはメニューを出してアカウントの画面を開く */
    const accountReady = initAccount();
    const accountResume = takeAccountResume();
    /* 勝ち抜き戦の次の1戦 (?run=1) はタイトルを飛ばして勝ち抜き戦の画面へ */
    /* 招待リンク (?room=CODE): オンラインのロビーへ直行して、その部屋に入る。
       Google 等のログインでページを離れても続けられるよう、コードをこのタブに覚えておく */
    let joinCode = params.get('room') || '';
    try {
      if (joinCode) sessionStorage.setItem('compileJoinCode', joinCode);
      else joinCode = sessionStorage.getItem('compileJoinCode') || '';
    } catch (e) { /* private mode */ }
    /* 中断した対戦 (画面が落ちた・閉じた) があれば、タイトルの前に続きから遊ぶか聞く */
    let resumeRec = null;
    if (!joinCode && !accountResume && ![...params.keys()].length) {
      const r = RS.loadResume();
      if (r) { if (await RS.askResume(r)) resumeRec = r; else RS.endResume(); }
    }
    let nextMode = resumeRec ? 'resume'
      : joinCode ? 'online'
      : params.get('run') === '1' ? 'run'
      : params.get('story') === '1' ? 'story'
      : params.get('tsume') ? 'tsume'
      : params.get('watch') === '1' ? 'watch'
      : params.get('title') !== '0'
        ? await runTitle(cards.protocols, accountResume ? { menuOnly: true, after: () => accountReady.then(openAccount) } : undefined)
        : 'single';
    /* Google 等のログインはページを離れて戻ってくる。
       戻り先はタイトルなので、目印があればオンラインへ直行する。 */
    try {
      if (localStorage.getItem('compileOnlineResume') === '1') {
        localStorage.removeItem('compileOnlineResume');
        nextMode = 'online';
      }
    } catch (e) { /* private mode */ }
    for (;;) {
      /* 中断した対戦の続き: はじめの状態から手を並べ直す。並べ直せなければ、ふつうにタイトルへ */
      if (nextMode === 'resume') {
        let built = null, why = '';
        try { built = rebuild(Engine, resumeRec); } catch (e) { built = null; why = 'exception: ' + (e && e.message); }
        if (!built || !built.ok || !built.res || built.res.error || built.res.state.winner !== null) {
          /* なぜ続けられなかったかを知らせる (どの手で崩れたか。記録は手の数と最後の手だけ) */
          const acts = (resumeRec && resumeRec.actions) || [];
          const last = acts.length ? JSON.stringify(acts[acts.length - 1]).slice(0, 120) : '-';
          reportError('中断した対戦を続けられなかった: ' + (why || (!built ? '組み立て失敗' : !built.ok ? '手が通らない' : built.res.error ? 'エラー ' + built.res.error : '決着済み')) +
            ' ・ ' + acts.length + '手 ・ 最後: ' + last + ' ・ ' + ((resumeRec.meta || {}).mode || '?'), 'resume');
          RS.endResume();
          UI.toast('中断した対戦は続きから遊べませんでした', 3600);
          nextMode = await runTitle(cards.protocols, { menuOnly: true });
          continue;
        }
        const m = resumeRec.meta;
        resumed = { rec: resumeRec, built };
        document.body.classList.remove('pregame');
        p0 = resumeRec.init.p0.slice();
        p1 = resumeRec.init.p1.slice();
        if (m.story) storyNode = STORY.nodeById(m.story);
        if (m.run) { runMode = true; runKind = m.run; if (runKind === 'weekly') weeklyHud(); else runHud(0); }
        quickGame = !!m.quick;
        if (m.oppAvatar !== undefined) plannedOpp = m.oppAvatar;
        applyAiDifficulty(m.level);
        if (storyNode) history.replaceState(null, '', location.pathname + '?story=1');
        break;
      }
      if (nextMode === 'online') {
        try {
          await ROOM.roomLoadDeps();
        } catch (e) { UI.toast('オンライン機能を読み込めませんでした'); nextMode = 'single'; continue; }
        if (!ROOM.roomConfigured()) { UI.toast('オンライン対戦は未設定です (secure-room-config.js)'); nextMode = 'single'; continue; }
        /* ドラフト中にプロトコルの6枚を見る */
        const result = await runRoomLobby(cards.protocols, { cardsOf: protocolCards, joinCode });
        joinCode = '';
        try { sessionStorage.removeItem('compileJoinCode'); } catch (e) { /* private mode */ }
        if (result && result.quick) { location.href = location.pathname + '?quick=1'; return; }
        /* 「戻る」はモード選択へ (ソロのプロトコル選択ではなく) */
        if (!result) { nextMode = await runTitle(cards.protocols, { menuOnly: true }); continue; }
        document.getElementById('boot').style.display = 'none';
        document.body.classList.remove('pregame');
        /* 観戦: 指す操作を出さず、手前に作った人・奥に参加した人で見る */
        if (result.watch) { roomWatching = true; document.body.classList.add('room-watch'); }
        await roomEnterGame(result.rm);
        return;
      }
      if (nextMode === 'tutorial') { location.href = location.pathname + '?tutorial=1'; return; }
      /* 観戦: CPU どうし (A = 手前、B = 奥)。ベットしていれば、決着で払い戻す */
      if (nextMode === 'watch') {
        const w = await openSpectate(cards.protocols, avatarsOpen() ? { avatars: ownedAvatars(), pool: avatarIds() } : { avatars: [] });
        if (!w) { history.replaceState(null, '', location.pathname); nextMode = await runTitle(cards.protocols, { menuOnly: true }); continue; }
        document.body.classList.remove('pregame');
        document.body.classList.add('demo', 'watch');
        demoMode = true;
        spectate = w;
        p0 = w.a; p1 = w.b;
        if (w.mates) tagMates = w.mates;                // タッグ戦の観戦
        applyAiDifficulty(w.level);
        break;
      }
      if (nextMode === 'tsume') {
        const id = await TS.openTsumeList();
        if (id) { location.href = location.pathname + '?tsume=' + encodeURIComponent(id); return; }
        history.replaceState(null, '', location.pathname);
        nextMode = await runTitle(cards.protocols, { menuOnly: true });
        continue;
      }
      /* ストーリー: 歩ける3Dの地図 (story-world.js)。会話はその場で、対戦に入ったら始める。
         ?story=1&play=1 は「もう一度」(始めた対戦をそのまま) */
      if (nextMode === 'story') {
        let node = params.get('play') === '1' ? STORY.pendingBattle(STORY.loadStory()) : null;
        if (!node) {
          const pick = await openWorld(cards.protocols, {
            onChapterClear: (id) => gainXp('story', XP_GAIN.storyChapter, 'stc:' + id)
          });
          node = pick && pick.battle;
        }
        if (!node) { history.replaceState(null, '', location.pathname); nextMode = await runTitle(cards.protocols, { menuOnly: true }); continue; }
        document.body.classList.remove('pregame');
        storyNode = node;
        if (node.kind === 'tsume') {
          /* 詰めコンパイルの敵: 問題モードと同じ仕組みで、決着をストーリーへ返す (puzzle.story) */
          const t = node.puzzle || (await TS.loadTsume()).find(x => x.id === node.tsume);
          if (!t) { UI.toast('詰めコンパイルの問題が見つかりません'); storyNode = null; history.replaceState(null, '', location.pathname); nextMode = await runTitle(cards.protocols, { menuOnly: true }); continue; }
          puzzle = { spec: t.spec, goal: t.goal.kind, task: TS.goalText(t.goal, t.spec.sides[0].protos), tsume: t, story: true };
          p0 = t.spec.sides[0].protos.slice(); p1 = t.spec.sides[1].protos.slice();
          document.body.classList.add('puzzle', 'tsume');
        } else {
          p0 = node.me.slice();
          p1 = node.opp.slice();
          applyAiDifficulty(node.level);
        }
        history.replaceState(null, '', location.pathname + '?story=1');
        break;
      }
      if (nextMode === 'run') {
        /* 1戦終えて戻ってきた (?run=1) ときは、前に遊んでいた方の画面へ。タイトルからは入口を出す */
        const resume = params.get('run') === '1';
        let lastKind = 'run';
        try { lastKind = localStorage.getItem('compileRunKind') || 'run'; } catch (e) { /* private mode */ }
        let pick = resume && lastKind === 'weekly' ? await openWeekly(cards.protocols, protocolCards)
          : await openRun(cards.protocols, protocolCards, { hub: !resume });
        for (let hop = 0; pick && pick.go && hop < 8; hop++) {
          pick = pick.go === 'weekly' ? await openWeekly(cards.protocols, protocolCards)
            : await openRun(cards.protocols, protocolCards, { hub: true });
        }
        if (!pick || pick.go) { history.replaceState(null, '', location.pathname); nextMode = await runTitle(cards.protocols, { menuOnly: true }); continue; }
        document.body.classList.remove('pregame');
        p0 = pick.me;
        p1 = pick.ai;
        runMode = true;
        runKind = pick.kind === 'weekly' ? 'weekly' : 'run';
        try { localStorage.setItem('compileRunKind', runKind); } catch (e) { /* private mode */ }
        if (runKind === 'weekly') weeklyHud(); else runHud(0);
        applyAiDifficulty(pick.level);
        break;
      }
      /* SINGLE GAME は先に相手を選ぶ (CPU / 強敵 / 下剋上)。トレーニングは相手も自分で置くので飛ばす */
      let opp = null;
      if (nextMode !== 'training') {
        opp = await openOpponentSelect(cards.protocols, { challenge: nextMode === 'challenge' });
        if (!opp) { nextMode = await runTitle(cards.protocols, { menuOnly: true }); continue; }
        if (opp.quick) { location.href = location.pathname + '?quick=1'; return; }
        if (opp.watch) { nextMode = 'watch'; continue; }
        if (opp.underdogTag) {
          /* 自分の3つは選べる。相手の最強タッグの6つは選べない。何を選んでも勝てば実績 */
          const pick = await runSetup(cards.protocols, { allowOnline: false, cardsOf: protocolCards, level: UNDERDOG_TAG_LEVEL,
            lock: UNDERDOG_TAG_RIVAL_MATE });
          if (pick.back) { if (!pick.title) continue; nextMode = await runTitle(cards.protocols, { menuOnly: true }); continue; }
          document.body.classList.remove('pregame');
          p0 = pick.me.slice();
          p1 = STRONGEST_AI.slice();
          /* 味方の3つは、あなたの3つと重ならないように残りからランダム。相手の味方は決まったデッキ */
          const all = cards.protocols.map(x => x.name);
          tagMates = { p0: shuffled(all.filter(n => !p0.includes(n) && !p1.includes(n) && !UNDERDOG_TAG_RIVAL_MATE.includes(n))).slice(0, 3), p1: UNDERDOG_TAG_RIVAL_MATE.slice() };
          applyAiDifficulty(UNDERDOG_TAG_LEVEL);
          setupNote = '下剋上タッグ: あなた ' + p0.join(' / ') + ' ＋ かんたんの味方 ' + tagMates.p0.join(' / ') + '　vs 最強タッグ ' + p1.join(' / ') + ' ＋ ' + tagMates.p1.join(' / ');
          break;
        }
        if (opp.underdog) {
          document.body.classList.remove('pregame');
          p0 = UNDERDOG_DECK.slice();
          p1 = STRONGEST_AI.slice();
          applyAiDifficulty(UNDERDOG_LEVEL);
          setupNote = '下剋上: 最弱 ' + p0.join(' / ') + ' で最強に挑む';
          break;
        }
      }
      const chosen = await runSetup(cards.protocols, { training: nextMode === 'training', allowOnline: false, cardsOf: protocolCards,
        level: opp ? opp.level : undefined, favorite: opp && opp.level < 3 ? oppFavorite() : null });
      if (chosen.online) { nextMode = 'online'; continue; }
      if (chosen.back) {
        if (opp && !chosen.title) continue;                // 相手を選び直す (右上の「タイトル」ならタイトルまで)
        nextMode = await runTitle(cards.protocols, { menuOnly: true });
        continue;
      }
      document.body.classList.remove('pregame');
      p0 = chosen.me;
      /* ランダム・自由に選ぶ・一部ランダムの CPU のデッキには、相手のキャラの得意プロトコルが入りやすい (ドラフトは setup.js で)。
         最強・ロック特化・挑戦者の固定デッキは入れ替えない (挑戦者の名札のデッキと、盤面のデッキが食い違っていた) */
      if (!p1 && !chosen.training && !chosen.first && !fixedDeck(chosen.level)) p1 = favorDeck(chosen.ai, p0, chosen.pool);
      p1 = p1 || chosen.ai;
      trainingMode = !!chosen.training;
      /* タッグ: 味方と相手の味方の3つは、それぞれのチームで重ならないように残りからランダム */
      if (opp && opp.tag) {
        const all = cards.protocols.map(x => x.name);
        tagMates = { p0: shuffled(all.filter(n => !p0.includes(n))).slice(0, 3), p1: shuffled(all.filter(n => !p1.includes(n))).slice(0, 3) };
      }
      applyAiDifficulty(chosen.level);
      /* ドラフトは先手後攻もドラフトの先手に合わせる。ランダム編成は中身を知らせる */
      if (chosen.first) chosenFirst = chosen.first === 'me' ? ME : AI;
      if (chosen.random) setupNote = 'ランダム: あなた ' + p0.join(' / ') + '　相手 ' + p1.join(' / ');
      if (chosen.partial) setupNote = 'あなた ' + p0.map(n => chosen.partial.includes(n) ? n : n + ' (ランダム)').join(' / ') + '　相手 ' + p1.join(' / ');
      if (tagMates) setupNote = 'タッグ: あなた ' + p0.join(' / ') + ' ＋ 味方 ' + tagMates.p0.join(' / ') + '　相手 ' + p1.join(' / ') + ' ＋ ' + tagMates.p1.join(' / ');
      break;
    }
  }

  /* 前の対局で使ったプロトコルのテクスチャを解放してから始める */
  const keepIds = ['__unknown__'];
  for (const name of p0.concat(p1)) {
    for (const id of Object.keys(defIndex)) if (defIndex[id].proto === name) keepIds.push(id);
  }
  pruneFaceCache(keepIds);
  /* 先攻・後攻はコイントスで決める (トレーニングと問題は自分から。ドラフトはドラフトの先手) */
  /* 勝ち抜き戦のパッチ (先攻・はじめの手札・コントロール) */
  const runOpts = runMode && runKind === 'run' ? battleOpts(loadRun() || { patches: [] }, ME) : null;
  const firstPlayer = trainingMode || puzzle || tutorial || demoMode || storyNode ? ME
    : runOpts && runOpts.first !== undefined ? runOpts.first
      : chosenFirst !== null ? chosenFirst : (Math.random() < 0.5 ? ME : AI);
  const seed = (Math.random() * 1e9) | 0;
  /* 勝ち抜き戦は2本先取 (序盤のふつうの戦闘は1本先取。run.js の runWinCompiles)。週替わりは2本先取 */
  const winCompiles = storyNode ? storyNode.win : runMode ? (runOpts ? runOpts.winCompiles : RUN_WIN_COMPILES) : undefined;
  /* 短縮マッチ: 3本より少ないコンパイルで決着する (はじめからコンパイル済みのプロトコルがあるのも同じ) */
  shortMatch = (!!winCompiles && winCompiles < 3) || !!(runOpts && Array.isArray(runOpts.startCompiled) && runOpts.startCompiled.some(n => n > 0));
  /* ストーリーの「2本先取」は、勝ち抜き戦と同じく自分は 3 本のうち 1 本がコンパイル済みから始まる (相手はそのまま 2 本) */
  const storyOpts = storyNode && storyNode.kind === 'battle' && storyNode.win < 3
    ? { winCompilesBySide: [3, storyNode.win], startCompiled: [3 - storyNode.win, 0] } : null;
  /* 共有された棋譜は外から来たものなので、作り直しで落ちても止まらないように */
  let replayBuilt = null;
  if (replayMode) {
    try { replayBuilt = rebuild(Engine, replayMode); } catch (e) { replayBuilt = null; }
    if (!replayBuilt || !replayBuilt.res || replayBuilt.res.error) {
      UI.toast('このリプレイは再現できませんでした', 4200);
      replayMode = null; replayBuilt = null;
      document.body.classList.remove('replay');
    }
  }
  const res = replayBuilt
    ? replayBuilt.res
    : resumed
      ? resumed.built.res
    : puzzle
      ? Engine.newPuzzle(puzzle.spec, { seed: 1 })
      : tutorial
        ? Engine.newPuzzle(tutorial.lesson.spec, { seed: 1 })
        : Engine.newGame({ seed, p0, p1, first: firstPlayer, training: trainingMode, winCompiles,
          ...(runOpts ? { handSize: runOpts.handSize, startControl: runOpts.startControl, exclude: runOpts.exclude, deckMods: runOpts.deckMods, winCompilesBySide: runOpts.winCompilesBySide, perks: runOpts.perks, startCompiled: runOpts.startCompiled } : {}),
          ...(storyOpts || {}),
          ...(tagMates ? { tag: tagMates } : {}) });
  cur = res;
  playBattleBgm();                          // 対戦の BGM (ボス戦は専用の曲)
  gameStartedAt = Date.now();          // はじめの表示で合計値の演出が出ないように (feel.js)
  if (!trainingMode && !puzzle && !tutorial && !demoMode && !replayMode) CW.battleStarted(storyNode ? 'story' : runMode ? runKind : tagMates ? 'tag' : quickGame ? 'quick' : 'cpu', p0, p1);
  if (!trainingMode && !puzzle && !tutorial && !demoMode && !replayMode) lastSetup = { p0: p0.slice(), p1: p1.slice(), mates: tagMates };
  /* 対戦を始めたら、アドレスの「この対戦を始める」指定 (REMATCH の ?me=&ai=&lv=、おまかせの ?quick=1、タッグ) を消す。
     残っていると、iPhone が裏で落としたページを読み直したとき・負けた直後に読み直されたときに、新しい対戦が勝手に始まる。
     読み直したら、タイトルの「途中から遊ぶ」で続きに戻れる */
  if (!trainingMode && !puzzle && !tutorial && !demoMode && !replayMode && !roomMode && !runMode && !storyNode) {
    const q = new URLSearchParams(location.search);
    if (q.has('me') || q.has('ai') || q.has('quick') || q.has('tag')) history.replaceState(null, '', location.pathname);
  }
  /* CPU 戦は棋譜を取る (決着したらリプレイとして残す) */
  /* タッグはリプレイに残さない (棋譜の形が 1 対 1 のため) */
  const gameInit = resumed ? resumed.rec.init : { seed, p0: p0.slice(), p1: p1.slice(), first: firstPlayer, winCompiles: winCompiles || null,
    ...(runOpts ? { handSize: runOpts.handSize, startControl: runOpts.startControl, exclude: runOpts.exclude, deckMods: runOpts.deckMods, winCompilesBySide: runOpts.winCompilesBySide, perks: runOpts.perks, startCompiled: runOpts.startCompiled } : {}),
    ...(storyOpts || {}) };
  const priorActions = resumed ? resumed.rec.actions : [];
  replayLog = !replayMode && !trainingMode && !puzzle && !tutorial && !demoMode && !tagMates && !storyNode
    ? { init: gameInit, actions: priorActions.slice() } : null;
  /* 落ちても続きから遊べるように、はじめの状態と手を端末に書き残す (タッグ・トレーニング・問題・観戦・オンラインは除く) */
  if (!replayMode && !trainingMode && !puzzle && !tutorial && !demoMode && !tagMates && !roomMode && !spectate) {
    RS.startResume({ mode: storyNode ? 'story' : runMode ? runKind : quickGame ? 'quick' : 'cpu', level: aiDifficulty, me: p0.slice(), opp: p1.slice(),
      story: storyNode ? storyNode.id : null, run: runMode ? runKind : null, quick: quickGame, oppAvatar: oppAvatarPlan() }, gameInit, Date.now(), priorActions);
  }
  if (trainingMode) training.protos = [p0.slice(), p1.slice()];
  window.__3d = {
    stage, board, THREE, LAYOUT,
    get cur() { return cur; },
    /* 動作確認用: 盤面をコードから進める */
    play: (uid, line, faceUp) => step({ type: 'play', card: uid, line, faceUp: faceUp !== false }),
    legal: () => Engine.legalActions(cur.state),
    avatarIds: () => (avatars ? { me: avatars.me && avatars.me.id, mate: avatars.mate && avatars.mate.id, opp: avatars.opp && avatars.opp.id, oppIds: avatars.oppIds } : null),
    diag: () => ({ busy, selectedUid, tweens: TW.activeCount(), marks: window.__bootMarks }),
    arrange: (req, opts) => arrangeOnBoard(req, opts),
    pickTest: (req) => pickOnBoard(req),
    askTest: (req) => askUser(req),
    reviewTest: () => startReview(false),
    fp: (st) => visualFingerprint(st),
    /* 演出だけを再生して確認する (盤面の状態は変えない) */
    testCompile: (line, side) => {
      const st = shown();
      const next = JSON.parse(JSON.stringify(st));
      next.players[side].protocols[line].compiled = true;
      return board.compileSequence(st, next, {
        side, line, name: st.players[side].protocols[line].name
      });
    },
    timing: TIMING,
    /* 詰めコンパイルの AUTO を確かめる (管理者でなくても動く。解いても記録・経験値には入らない) */
    tsumeAutoTest: () => (puzzle && puzzle.tsume ? (startTsumeAuto(puzzle.tsume, true), 'auto') : 'no tsume'),
    testResult: async (win) => { await finaleFx(!!win); await UI.resultCutIn(!!win); },
    endTest: (win) => showEndActions(!!win),
    spectateEndTest: (aWon) => (spectate ? spectateEnd(!!aWon) : null),
    avatarTest: (kind, side) => avatarSay(side === 1 ? AI : ME, kind, { card: 'FIRE 3' }),
    gfx: () => stage.gfx(), setGfx: (n) => stage.setGfx(n),
    /* 合成した publicState を流し込んでルーム描画経路を検証する (ポーリングなし) */
    testRoomView: async (rm, instant) => {
      roomMode = true;
      if (!roomTracker) roomTracker = ROOM.createTraceTracker();
      await roomApplyView(rm, instant !== false);
    },
    /* キャンバスを取り出す (記録・共有用)。
       preserveDrawingBuffer を有効にしてあるので、いつ呼んでも直前の描画が残っている。 */
    capture: (quality) => {
      /* iPhone は直前の絵を残していないので、取り出す前にその場で描く */
      try { stage.composer.render(); } catch (e) { /* 描けなくても、残っている絵で取る */ }
      const src = stage.renderer.domElement;
      if (quality === undefined) return src.toDataURL('image/png');
      const w = 960, h = Math.round(w * src.height / src.width);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(src, 0, 0, w, h);
      return cv.toDataURL('image/jpeg', quality);
    }
  };
  mark('newGame');
  board.syncInstant(shown());
  if (trainingMode) mountTraining();
  mark('sync');
  const bootEl = document.getElementById('boot');
  bootEl.classList.add('gone');
  /* タブが裏だと CSS トランジションが凍るので、確実に取り除く */
  setTimeout(() => { bootEl.style.display = 'none'; }, 800);

  await stage.home(0);
  placeDialogsNearBoard();
  refreshHud();
  if (puzzle) PZ.showPuzzleBar(puzzle, retryPuzzle, puzzle.tsume ? tsumeBarOpts(puzzle.tsume) : null);
  if (puzzle && puzzle.tsume && new URLSearchParams(location.search).get('auto') === '1') resumeTsumeAuto(puzzle.tsume);
  /* 詰めコンパイル: 管理者か (答えのボタンを出すか) はログイン状態を読んでから分かるので、分かったら帯を描き直す */
  if (puzzle && puzzle.tsume) {
    onAccountChange(() => PZ.showPuzzleBar(puzzle, retryPuzzle, tsumeBarOpts(puzzle.tsume)));
    initAccount();
  }
  if (tutorial) coachUpdate();
  if (replayMode) { startReplayView(replayBuilt); return; }
  if (!roomMode) setOppLook(null);                 // CPU 戦などの相手は標準の見た目
  if (!puzzle && !tutorial && !demoMode && !trainingMode && !roomMode) showCpuPlates(p1);
  if (spectate) spectateStart();
  syncAvatar();
  onAccountChange(() => { const had = !!avatars; syncAvatar(); syncAutoButton(); if (!had && avatars && tutorial) avatarSay(ME, tutorKind('')); });
  syncAutoButton();   // 管理者かどうかは、ログインの確認のあとで分かる
  if (tutorial) setTimeout(() => avatarSay(ME, tutorKind('')), 700);
  if (!accountState().ready) initAccount();         // REMATCH など URL から直に始めた対戦でも確かめる
  if (trainingMode) {
    UI.setPrompt('');
    UI.toast('カードを選んで、光っている枠をタップすると置けます', 3200);
  } else {
    if (!puzzle && !tutorial && !demoMode) {
      const turnNote = chosenFirst !== null
        ? (firstPlayer === ME ? 'ドラフトの先手: あなたが先攻です' : 'ドラフトの後手: あなたは後攻です')
        : (firstPlayer === ME ? 'コイントス: あなたが先攻です' : 'コイントス: あなたは後攻です');
      UI.toast(resumed ? '中断した対戦の続きから' : setupNote ? setupNote + '　' + turnNote : turnNote, setupNote ? 4200 : 2600);
    }
    await drainRequests();
    await afterTurn();
  }
}

/* ---------- 問題 (共有された盤面を解く) ----------
   自分の手番だけを遊ぶ。相手の選択 (効果で相手が選ぶ等) は AI が答えるが、相手の手番は進めない。
   手番を終えたら、手番を終えた時点 (相手の開始フェイズより前) の盤面でクリア条件を判定する */
let puzzleJudged = false;
async function puzzleAfterTurn() {
  const st = cur && cur.state;
  if (!st || puzzleJudged) return;
  if (st.winner === null && st.turn === ME) return;       // まだ自分の手番
  puzzleJudged = true;
  const endSt = PZ.endOfTurnState(cur.trace, ME, shown());
  const ts = puzzle.tsume;
  const result = ts ? TS.judgeTsume(ts.goal, endSt, shown(), ME, Engine) : PZ.judgePuzzle(puzzle.goal, endSt, shown(), ME, totalOf);
  sfx(result.ok === false ? 'lose' : 'win');
  /* ストーリーの詰め: 決着の会話と次へ (ふつうの対戦と同じ流れ) */
  if (puzzle.story && storyNode) {
    logPlay({ mode: 'story', win: result.ok === true, level: 0, logged: !!accountState().user });
    UI.toast(result.text, 3600);
    await storyAfterGame(result.ok === true);
    return;
  }
  if (!ts) {
    if (result.ok !== false) await gainXp('puzzle', XP_GAIN.puzzle, 'pz:' + hashKey(JSON.stringify([puzzle.spec, puzzle.goal])));
    PZ.showPuzzleResult(result, retryPuzzle);
    return;
  }
  /* AUTO (管理者の確認) で解いた分は、遊ばれ方の記録・経験値・今日の問題の済みに入れない */
  if (tsumeAutoUsed) {
    tsumeAuto = null;
    UI.toast('AUTO: ' + (result.ok === false ? '模範解答で解けませんでした (問題か模範解答がおかしい)' : '模範解答で解けました'), 4200);
  }
  /* 遊ばれ方の匿名の記録: 解けたか (level は段。今日の問題は 11・今日の上級は 13) */
  if (!tsumeAutoUsed) logPlay({ mode: 'tsume', win: result.ok !== false, level: ts.daily != null ? (ts.hard ? 13 : 11) : (ts.tier | 0), logged: !!accountState().user });
  /* COMPUZZLE: 段ごとの経験値 (問題ごとに初回。今日の問題は日ごと)。実績の判定もここで */
  if (result.ok && !tsumeAutoUsed) {
    await gainXp('tsume', TS.tsumeXp(ts), TS.tsumeXpKey(ts));
    maybeLoginHint('tsume');
  }
  const next = ts.daily == null ? TS.nextOf(await TS.loadTsume(), ts.id) : null;
  PZ.showPuzzleResult(result, retryPuzzle, {
    buttons: [
      ...(result.ok && next ? [{ label: '次の問題', main: true, on: () => openTsume(next.id) }] : []),
      ...(result.ok || !accountState().admin ? [] : [{ label: '答えを見る', on: () => TS.showAnswer(ts) }]),
      { label: '一覧へ', on: () => openTsume('list') }
    ]
  });
}

/* 詰めコンパイル: 上の帯のボタン (ヒント・答え・一覧) */
function tsumeBarOpts(ts) {
  const tier = TS.TIERS.find(t => t.tier === ts.tier);
  return {
    tag: puzzle.story ? 'STORY' : ts.daily != null ? (ts.hard ? '今日の上級' : '今日の問題') : '詰め ' + (tier ? tier.name : ''),
    sub: '1手番で達成する' + (ts.solutions > 1 ? ' (解き方は2通り)' : ''),
    buttons: [
      { label: '山札', on: () => TS.showDeck(shown(), defIndex, ME) },
      { label: 'ヒント', on: () => UI.toast('最初の一手: ' + ts.steps[0], 5200) },
      /* 模範解答は管理者のアカウントだけ (問題の確認用) */
      ...(accountState().admin ? [{ label: '答え', on: () => TS.showAnswer(ts) }] : []),
      /* AUTO: 模範解答を盤面の上で自動で指して見せる (管理者だけ。報告を受けた問題の確認用) */
      ...(accountState().admin && Array.isArray(ts.solution) && ts.solution.length ? [{ label: 'AUTO', on: () => (tsumeAuto ? stopTsumeAuto() : startTsumeAuto(ts)) }] : []),
      puzzle.story ? { label: '地図へ', on: () => { location.href = location.pathname + '?story=1'; } } : { label: '一覧', on: () => openTsume('list') }
    ]
  };
}

function openTsume(id) {
  location.href = location.pathname + '?tsume=' + encodeURIComponent(id);
}

/* 詰めコンパイルの AUTO (管理者だけ): 模範解答 (ts.solution) を、ふつうに指したときと同じ流れで1つずつ指す。
   もう手を進めていたら、?auto=1 を付けて初めから読み直してから始める。
   AUTO で解いた分は経験値・今日の問題の済み・遊ばれ方の記録に入れない (tsumeAutoUsed) */
let tsumeAuto = null;              // 残りの手と選択 (Engine.apply に渡す形)
let tsumeAutoUsed = false;
const TSUME_AUTO_GAP = 650;        // 1手ごとの間 (見て追えるように)
function startTsumeAuto(ts, test = false) {
  if ((!accountState().admin && !test) || tsumeAuto) return;
  const fresh = cur && cur.state && cur.state.turn === ME && !puzzleJudged && !gameHistory.length && !(cur.requests && cur.requests.length);
  if (!fresh) {
    const q = new URLSearchParams(location.search);
    q.set('auto', '1');
    location.href = location.pathname + '?' + q.toString();
    return;
  }
  tsumeAuto = ts.solution.map(a => ({ ...a }));
  tsumeAutoUsed = true;
  UI.toast('AUTO: 模範解答を指します', 2400);
  deselect(); showPreview(null);
  tsumeAutoAction();                               // 手番の始まりの処理が先に指していれば、こちらは何もしない
}
/* AUTO をもう一度押したら止める (残りの手は自分で指せる。経験値などに入れないのは止めてもそのまま) */
function stopTsumeAuto() {
  tsumeAuto = null;
  UI.toast('AUTO を止めました。続きは自分で指せます', 2400);
}
/* 読み直したあと (?auto=1): 管理者だと分かってから始める (ログインの状態は裏で読むので、少し待つ) */
async function resumeTsumeAuto(ts) {
  const q = new URLSearchParams(location.search);
  q.delete('auto');
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : ''));
  for (let i = 0; i < 25 && !accountState().admin; i++) await TW.wait(200);
  if (accountState().admin) startTsumeAuto(ts);
}
/* 自分の番の手 (play など) を AUTO で指す。指したら true。
   手番の始まりの処理と AUTO を始める処理が同時に来ても、指すのは1か所だけにする (tsumeAutoBusy)。
   前は読み直した直後 (?auto=1) に2か所が同じ手を取り合い、1つ目の選択の答えがなくなって途中で止まっていた */
let tsumeAutoBusy = false;
async function tsumeAutoAction() {
  if (!tsumeAuto || !tsumeAuto.length || tsumeAuto[0].type === 'choose') return false;
  if (!cur || cur.state.turn !== ME || (cur.requests && cur.requests.length)) return false;
  if (tsumeAutoBusy) return true;                  // もう片方が指す
  tsumeAutoBusy = true;
  let action;
  try {
    await TW.wait(TSUME_AUTO_GAP);
    for (let i = 0; busy && i < 100; i++) await TW.wait(100);     // 前の表示 (手番の知らせなど) が終わるまで
    if (!tsumeAuto || !tsumeAuto.length || tsumeAuto[0].type === 'choose') return true;
    action = tsumeAuto.shift();
  } finally { tsumeAutoBusy = false; }             // step の中でまた呼ばれるので、指す前に戻す
  await step(action);
  return true;
}

/* ---------- チュートリアル ----------
   操作を1つ解決し終えるたびに、レッスンの判定をかける。終わったら相手の手番を進めない */
async function tutorialAfterStep() {
  tutorialPending = false;
  if (tutorialOver) return true;
  const st = cur && cur.state;
  if (!st) return false;
  const r = TU.judgeStep(tutorial.lesson, { st, trace: cur.trace, me: ME, total: totalOf });
  if (!r) {
    /* 自分の手番は終わったが、判定は相手の手番のあと (コンパイル待ちの案内に切り替わる) */
    coachUpdate();
    return false;
  }
  tutorialOver = true;
  tutorialFocus = null;
  applyTutorialFocus();
  refreshHud();
  if (st.winner === ME) {
    sfx('win');
    await finaleFx(true);
    await UI.resultCutIn(true);
  } else sfx(r.ok ? 'win' : 'lose');
  /* 「次へ」は押さなくてよい: 読む時間が過ぎたら次のレッスン (失敗ならやり直し) へ */
  const i = tutorial.index;
  const last = i === TU.LESSONS.length - 1;
  /* レッスンごとに初回だけ。全部終えたらもう少し */
  if (r.ok) {
    await gainXp('lesson', XP_GAIN.lesson, 'tu:' + i);
    if (last) await gainXp('tutorial', XP_GAIN.tutorialAll, 'tu:all');
  }
  avatarSay(ME, r.ok ? tutorKind('ok', 'good') : 'retry');
  TU.showCoachResult(i, r, () => {
    if (r.ok && last) {
      TU.showTutorialDone({
        /* チュートリアルのあとは、そのまま「おまかせ」で CPU と1戦 */
        onPlay: () => { location.href = location.pathname + '?quick=1'; },
        onTop: () => { location.href = location.pathname; },
        onRestart: () => startLesson(0)
      });
    } else startLesson(r.ok ? i + 1 : i);
  });
  return true;
}

/* レッスンをその場で始める (ページを読み直さない) */
async function startLesson(index) {
  tutorial = { index, lesson: TU.LESSONS[index] };
  tutorialOver = false;
  tutorialAsk = null;
  tutorialFocus = null;
  tutorialPending = false;
  deselect();
  showPreview(null);
  cur = Engine.newPuzzle(tutorial.lesson.spec, { seed: 1 });
  gameHistory.length = 0;
  refreshSayFor = null;
  undoPoint = null;
  oppTurn = null;
  lastTurn = null;
  resultShown = false;
  board.syncInstant(shown());
  syncPanels(shown(), false);
  refreshHud();
  try { history.replaceState(null, '', location.pathname + '?tutorial=' + (index + 1)); } catch (e) { /* file:// など */ }
  stage.home(400);
  tutorialSaidStep = 0;
  avatarSay(ME, tutorKind(''));
  await drainRequests();
  await afterTurn();
}

/* 「やり直す」: 動いている最中や選択の途中は、読み直して確実に最初から */
function restartLesson() {
  if (busy || tutorialAsk || !tutorial) { location.reload(); return; }
  startLesson(tutorial.index);
}

/* いまの操作の状態 (選んだカード・求められている選択・相手待ち) */
function tutorialCtx() {
  const st = cur && cur.state;
  const view = shown();
  const c = selectedUid && view && view.cards[selectedUid];
  return {
    sel: c ? c.def : null,
    ask: tutorialAsk,
    waiting: !!st && st.winner === null && st.turn !== ME
  };
}

/* 案内を状態に合わせて出し直し、押す場所を光らせる。
   まとめて次の一瞬に行い、手を解決している間 (busy) は変えない
   (置く直前に選択が外れるので、そのままだと最初の案内に一瞬戻ってしまう) */
let coachTick = null;
let tutorialSaidStep = 0;      // ずんだもんが最後に言った案内の手順
/* チュートリアルのずんだもんのセリフの種類 (tu<レッスン><後ろ>)。無ければ fallback */
function tutorKind(suffix, fallback = 'lesson') {
  const k = 'tu' + (tutorial ? tutorial.index : 0) + suffix;
  return AVATARS.zundamon && AVATARS.zundamon.lines[k] ? k : fallback;
}
function coachUpdate(force) {
  if (!tutorial || tutorialOver) return;
  clearTimeout(coachTick);
  coachTick = setTimeout(() => {
    /* 手を解決している間・判定待ちの間は変えない (選択を求められたときだけは force で出す) */
    if (!tutorial || tutorialOver || busy || (tutorialPending && !force)) return;
    const n = TU.coachStep(tutorial.lesson, tutorialCtx());
    const prevCard = (tutorialFocus && tutorialFocus.card) || null;
    tutorialFocus = n >= 0 ? tutorial.lesson.steps[n].focus || null : null;
    TU.showCoach(tutorial.index, n, restartLesson);
    /* 案内が変わったら、ずんだもんが声でも言う (はじめの手順はレッスンの始めに言っている) */
    if (n !== tutorialSaidStep) {
      tutorialSaidStep = n;
      const k = n < 0 ? 'tuask' : n > 0 ? tutorKind('s' + n, null) : null;
      if (k) avatarSay(ME, k);
    }
    applyTutorialFocus();
    /* 明るくする手札が変わったら、手札の明るさを付け直す */
    if (((tutorialFocus && tutorialFocus.card) || null) !== prevCard) refreshHud();
  }, 0);
}

function applyTutorialFocus() {
  document.querySelectorAll('.tu-focus').forEach(e => e.classList.remove('tu-focus'));
  const f = tutorial && !tutorialOver ? tutorialFocus : null;
  if (!f) return;
  if (f.button) document.getElementById(f.button)?.classList.add('tu-focus');
  if (f.line) {
    const line = shown().players[ME].protocols.findIndex(p => p.name === f.line);
    const cls = f.face === 'up' ? 'place-faceup' : 'place-facedown';
    document.querySelector('#playChoices section[data-side="0"][data-line="' + line + '"] .' + cls)?.classList.add('tu-focus');
  }
}

function retryPuzzle() {
  location.reload();
}

/* トレーニングの盤面を「問題」として共有する */
function sharePuzzle() {
  if (!cur) return;
  PZ.openShareDialog((task, goal) => PZ.encodePuzzle(shown(), task, goal));
}

/* ---------- トレーニング: ターン進行なしの検証盤面 ----------
   盤面の変更はすべてエンジンの training* 操作で行う。効果ありなら
   通常のプレイと同じ経路で解決され、選択要求は両者ぶんともユーザーが答える。 */
function trainingCardsOf(st, side) {
  const out = [];
  for (const uid of Object.keys(st.cards)) {
    if (!uid.startsWith('p' + side + ':')) continue;
    const c = st.cards[uid];
    const zone = String(c.zone).replace(/[01]$/, '');
    out.push({ uid, def: c.def, zone: ['hand', 'trash', 'deck'].includes(zone) ? zone : 'field', faceUp: c.faceUp });
  }
  return out;
}

function renderTraining() {
  if (!trainingTools || !cur) return;
  const st = shown();
  if (training.sel && !st.cards[training.sel]) training.sel = null;
  trainingTools.render({
    side: training.side, effects: training.effects, faceUp: training.faceUp,
    collapsed: training.collapsed, canUndo: training.undo.length > 0, sel: training.sel,
    protocols: st.players.map(p => p.protocols.map(x => ({ name: x.name, color: protoIndex[x.name] && protoIndex[x.name].color }))),
    cards: trainingCardsOf(st, training.side)
  });
  document.body.classList.toggle('training-collapsed', training.collapsed);
}

function trainingSelect(uid) {
  training.sel = uid;
  if (uid) {
    training.side = uid.startsWith('p1:') ? 1 : 0;
    sfx('pick');
    /* 選んだカードの効果を詳細パネルで読めるようにする */
    showTrainingCard(uid);
  }
  board.clearCandidates();
  const obj = uid && board.cards.get(uid);
  if (obj) board.setSelected(obj, true);         // 盤面の他のカードは沈めない
  updatePads();
  renderTraining();
}

/* トレーニングはどちらの札も全部見える。一覧を触ったカードも、盤面のカードと同じく詳細パネルに出す */
function showTrainingCard(uid) {
  const c = uid && shown().cards[uid];
  const d = c && defIndex[c.def];
  if (!d) return;
  previewUid = null;
  UI.showCardPanel(cardDetail(uid) || defDetail(d));
}

async function trainingStep(action) {
  if (busy || !cur || cur.requests.length) return;
  const withEffects = action.type === 'trainingPlace' || action.type === 'trainingFlip' || action.type === 'trainingMove';
  /* 置くだけのときは演出なしで、すぐ盤面に反映する */
  if (!training.effects && (withEffects || action.type === 'trainingDraw')) {
    const res = Engine.apply(cur.state, { ...action, effects: false });
    if (res.error) { UI.toast(res.error); return; }
    training.undo.push(cur);
    if (training.undo.length > 80) training.undo.shift();
    cur = res;
    UI.pushLog(res.log);
    board.clearCandidates();
    board.syncInstant(shown());
    refreshHud();
    if (isCompactHandUI()) training.collapsed = true;
    if (action.type === 'trainingPlace' || action.type === 'trainingMove') training.sel = null;
    trainingSelect(training.sel && shown().cards[training.sel] ? training.sel : null);
    return;
  }
  const before = cur;
  training.undo.push(before);
  if (training.undo.length > 80) training.undo.shift();
  document.body.classList.add('training-busy');
  board.clearCandidates();
  for (const pad of pads) pad.userData.pulse = 0;
  try {
    await step(withEffects ? { ...action, effects: training.effects } : action);
  } finally {
    document.body.classList.remove('training-busy');
  }
  if (cur === before) training.undo.pop();              // エラーで盤面が変わらなかった
  else if (isCompactHandUI()) training.collapsed = true; // スマホ: 結果の盤面を見せる
  if (action.type === 'trainingPlace' || action.type === 'trainingMove') training.sel = null;
  trainingSelect(training.sel && shown().cards[training.sel] ? training.sel : null);
}

function mountTraining() {
  trainingTools?.remove();
  document.body.classList.add('training');
  training.sel = null;
  training.undo = [];
  const resync = () => {
    board.clearCandidates();
    board.syncInstant(shown());
    refreshHud();
    trainingSelect(null);
  };
  trainingTools = mountTrainingTools(defIndex, {
    select: (uid) => { if (!uid) training.collapsed = false; trainingSelect(uid); },
    setSide: (side) => { training.side = side; trainingSelect(null); },
    setEffects: (on) => { training.effects = on; renderTraining(); },
    setFaceUp: (up) => { training.faceUp = up; renderTraining(); },
    fold: () => { training.collapsed = !training.collapsed; renderTraining(); },
    peek: (uid) => showTrainingCard(uid),
    share: () => sharePuzzle(),
    act: (action) => trainingStep(action),
    undo: () => {
      if (busy || !training.undo.length) return;
      cur = training.undo.pop();
      avatarHush(cur.state);
      resync();
      sfx('trash');
    },
    reset: () => {
      if (busy) return;
      const [a, b] = training.protos;
      cur = Engine.newGame({ seed: (Math.random() * 1e9) | 0, p0: a, p1: b, training: true });
      training.undo = [];
      resync();
      UI.toast('盤面をリセットしました');
    }
  });
  window.__3d.training = {
    act: (action) => trainingStep(action),
    select: (uid) => trainingSelect(uid),
    state: training
  };
  renderTraining();
}

/* 着地パッドの意匠: 角丸の枠 + 内側のごく薄い塗り */
const laneGlows = [];
/* ライン1本の光の帯: 縁が明るく、中はうっすら */
function laneTexture() {
  const W = 128, H = 880;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.06, 'rgba(255,255,255,.3)');
  g.addColorStop(0.2, 'rgba(255,255,255,.05)');
  g.addColorStop(0.8, 'rgba(255,255,255,.05)');
  g.addColorStop(0.94, 'rgba(255,255,255,.3)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  /* 両端 (盤の奥と手前) はぼかして消す */
  ctx.globalCompositeOperation = 'destination-in';
  const v = ctx.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.1, 'rgba(0,0,0,1)');
  v.addColorStop(0.9, 'rgba(0,0,0,1)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  return new THREE.CanvasTexture(cv);
}

function padTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const pad = 10, r = 26, w = S - pad * 2;
  const round = (x, y, ww, hh, rr) => {
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
    ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
    ctx.arcTo(x, y + hh, x, y, rr);
    ctx.arcTo(x, y, x + ww, y, rr);
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  round(pad, pad, w, w, r); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = 7;
  round(pad, pad, w, w, r); ctx.stroke();
  /* 四隅のマーカー */
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 12;
  const c = 46;
  const corners = [[pad, pad, 1, 1], [S - pad, pad, -1, 1], [pad, S - pad, 1, -1], [S - pad, S - pad, -1, -1]];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * c, y);
    ctx.lineTo(x + dx * 14, y);
    ctx.moveTo(x, y + dy * c);
    ctx.lineTo(x, y + dy * 14);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* コンパイル面のアート (art/Fire_Glitched.webp 等)。未生成のプロトコルは null */
function glitchArtUrl(protoName) {
  protoName = String(protoName || '').split('+')[0];      // タッグの複合プロトコルは1人目の絵
  const cap = protoName.charAt(0) + protoName.slice(1).toLowerCase();
  return protoIndex[protoName] && ART_SETS.has(protoIndex[protoName].set)
    ? 'art/' + cap + '_Glitched.webp'
    : null;
}

/* 難易度 → エンジン設定。
   auto-play と同じく上位2段は探索AI。最強は思考時間増 + DSH特化戦略 */
let aiDifficulty = null;   // 戦績に残す難易度 (aidecks.js の番号)。URL で直接始めた対戦は不明
let aiClient = null;       // CPU の手を考える窓口 (aiclient.js)
/* opts.engine: エンジンの読みの段を直接決める (チュートリアルは筋書きどおり動くよう、でたらめを混ぜない) */
function applyAiDifficulty(level, opts) {
  aiDifficulty = level;
  /* かんたん: いちばん軽い読み + 3割はでたらめ (ふつうに 1 割ほどしか勝てない) /
     ふつう: 1 手読み (探索なし) / つよい以上: 探索。
     前の対戦で長くした思考時間が残らないように、毎回すべて決め直す */
  const config = {
    level: opts && opts.engine !== undefined ? opts.engine : level <= 0 ? 0 : level === 1 ? 1 : 2,
    blunder: opts && opts.engine !== undefined ? 0 : level <= 0 ? 0.3 : 0,
    budget: level >= 2 ? 1200 : 900,
    /* 最強・挑戦者 = dsh 特化 + 固定デッキ (aidecks.js)、ロック特化 = サイキック①の永続ロック狙い */
    specialist: level >= 3,
    kind: level === 4 ? 'psylock' : 'dsh'
  };
  Engine.setAiLevel(config.level);
  if (Engine.setAiBlunder) Engine.setAiBlunder(config.blunder);
  Engine.setAiThinkBudget(config.budget);
  if (Engine.setAiSpecialist) Engine.setAiSpecialist(config.specialist, 1, config.kind);
  if (aiClient) aiClient.setConfig(config);
}

/* CPU の手 (Worker で考える。使えなければ画面側で) */
/* 考えている間は、相手の名札の横に印を出す (feel.js) */
function thinking(p) {
  FEEL.setThinking(true);
  return p.finally(() => FEEL.setThinking(false));
}
/* 管理者の自動プレイ (AUTO): 自分の側も CPU が指す。自分の側は最強と同じ読み (探索・特化の手筋・長めの思考)、相手はいつもの強さのまま */
let autoPlay = false;
const AUTO_AI = { level: 2, blunder: 0, budget: 2400, specialist: true, kind: 'dsh', specSide: 0 };
const autoFor = (side) => autoPlay && side === ME && !roomMode;
/* 下剋上タッグの味方: かんたんと同じ読み (3割はでたらめ)。相手の最強タッグはいつもの最強の読み */
const UNDERDOG_MATE_AI = { level: 0, blunder: 0.3, budget: 900, specialist: false, kind: 'dsh' };
const weakMate = (side) => aiDifficulty === UNDERDOG_TAG_LEVEL && side === ME && !roomMode && partnerMove();
function aiAction(st) {
  const over = autoFor(st && st.turn) ? AUTO_AI : weakMate(st && st.turn) ? UNDERDOG_MATE_AI : null;
  return thinking(aiClient ? aiClient.action(st, over) : Promise.resolve(withoutTrace(() => Engine.ai.action(st))));
}
function aiAnswer(st, req) {
  const over = req && autoFor(req.player) ? AUTO_AI : req && weakMate(req.player) ? UNDERDOG_MATE_AI : null;
  return thinking(aiClient ? aiClient.answer(st, req, over) : Promise.resolve(withoutTrace(() => Engine.ai.answer(st, req))));
}
/* 上のバーの AUTO (管理者だけ。オンライン・チュートリアル・問題・検証盤面・リプレイ・観戦では出さない) */
function syncAutoButton() {
  const bar = document.getElementById('topRight');
  if (!bar) return;
  let b = document.getElementById('btnAuto');
  const want = !!accountState().admin && !roomMode && !tutorial && !puzzle && !trainingMode && !replayMode && !demoMode;
  if (!want) { if (b) b.remove(); if (autoPlay) autoPlay = false; return; }
  if (!b) {
    b = document.createElement('button');
    b.id = 'btnAuto'; b.className = 'btn'; b.type = 'button';
    b.title = '強い CPU に自分の手を指させる (管理者)';
    b.onclick = () => {
      const waitingMe = !!cur && !busy && !cur.requests.length && cur.state.winner === null && humanTurn(cur.state);
      autoPlay = !autoPlay;
      syncAutoButton();
      UI.toast(autoPlay ? 'AUTO: 自分の手を強い CPU が指します' : 'AUTO を止めました。次の判断から自分で指せます', 2600);
      /* 自分の番で待っているところなら、すぐ動かす (選択の画面を開いているときは、次の判断から) */
      if (autoPlay && waitingMe) { deselect(); showPreview(null); afterTurn(); }
      refreshHud();
    };
    bar.insertBefore(b, bar.firstChild);
  }
  b.textContent = autoPlay ? 'AUTO ●' : 'AUTO';
  b.classList.toggle('on', autoPlay);
  b.setAttribute('aria-pressed', String(autoPlay));
}

/* ---------- 着地パッド (ラインの当たり判定 + 視覚) ---------- */
function buildPads() {
  const geo = new THREE.PlaneGeometry(CARD.w * 1.34, CARD.h * 1.2);
  geo.rotateX(-Math.PI / 2);
  const tex = padTexture();
  for (let line = 0; line < 3; line++) {
    for (let side = 0; side < 2; side++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: side === ME ? COLOR.mint : COLOR.pink,
        transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const pad = new THREE.Mesh(geo, mat);
      const stackLen = 0;
      const slot = LAYOUT.stackSlot(line, side, stackLen, ME);
      pad.position.set(slot.pos[0], 0.006, slot.pos[2]);
      pad.userData = { line, side, isPad: true, pulse: 0 };
      pad.renderOrder = 2;
      stage.scene.add(pad);
      pads.push(pad);
    }
  }
  /* ライン全体に効く選択 (「ラインを1つ選び、そこのカードを全部〜」など) は、両側の置き場ではなく
     ライン1本を縦に貫く光の帯で示す (自分の場と相手の場が別々に光ると、どちらに効くのか分かりにくかった) */
  const laneGeo = new THREE.PlaneGeometry(CARD.w * 1.36, 9.4);
  laneGeo.rotateX(-Math.PI / 2);
  const laneTex = laneTexture();
  for (let line = 0; line < 3; line++) {
    const glow = new THREE.Mesh(laneGeo, new THREE.MeshBasicMaterial({
      map: laneTex, color: COLOR.gold, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    glow.position.set(BOARD.laneX[line], 0.005, 0);
    glow.renderOrder = 2;
    glow.raycast = () => {};
    glow.userData = { line, on: false };
    stage.scene.add(glow);
    laneGlows.push(glow);
  }
  stage.onFrame((dt, t) => {
    for (const g of laneGlows) {
      const want = g.userData.on ? 0.3 + 0.16 * Math.sin(t * 4.4 + g.userData.line) : 0;   // 板の文字を飛ばさない強さ
      g.material.opacity += (want - g.material.opacity) * 0.25;
      g.visible = g.material.opacity > 0.01;
    }
  });
  stage.onFrame((dt, t) => {
    for (const pad of pads) {
      if (pad.userData.pulse <= 0) { pad.material.opacity += (0 - pad.material.opacity) * 0.2; continue; }
      const base = pad.userData.pulse;
      pad.material.opacity = pad.userData.hover
        ? 1.0
        : base * (0.62 + 0.38 * Math.sin(t * 4.4 + pad.userData.line));
      const s = pad.userData.hover ? 1.12 : 1;
      pad.scale.set(s, 1, s);
    }
  });
}

/* 選択中カードの着地候補を光らせる */
function updatePads() {
  if (trainingMode) {
    const selCard = training.sel && cur && shown().cards[training.sel];
    for (const pad of pads) {
      /* 置けるのは選んだカードの持ち主の側だけ */
      const on = !!selCard && !busy && pad.userData.side === selCard.owner;
      pad.userData.pulse = on ? 0.92 : 0;
      if (on) {
        const slot = LAYOUT.stackSlot(pad.userData.line, pad.userData.side,
          cur.state.lines[pad.userData.line][pad.userData.side].length, ME, cur.state);
        pad.position.set(...slot.pos);
      }
    }
    const choices = document.getElementById('playChoices');
    if (choices) { choices.replaceChildren(); choices.hidden = true; }
    return;
  }
  updatePlayChoices();
  const st = cur && cur.state;   // 合法手の判定は基準状態で行う
  for (const pad of pads) pad.userData.pulse = 0;
  if (!st || busy || selectedUid === null || cur.requests.length) return;
  if (!humanTurn(roomMode ? shown() : st)) return;

  for (const pad of pads) {
    const { line, side } = pad.userData;
    const choices = placementChoices(legalNow(), selectedUid, st.turn)
      .filter(a => a.line === line && a.side === side);
    if (!choices.length) continue;
    /* 表裏を選ぶ前の段階では「置けるレーン」だけを判定する。
       同じプロトコルの表向きが優先表示されていても、裏向きの合法手を消さない。 */
    pad.userData.pulse = choices.some(a => a.faceUp) ? 0.95 : 0.6;
    /* 積み上がった高さに追従させる */
    const idx = st.lines[line][side].length;
    const slot = LAYOUT.stackSlot(line, side, idx, ME, st);
    /* パッドと飛行アニメーションは同じ stackSlot を共有する。 */
    pad.position.set(...slot.pos);
  }
}

function canPlaceOnLine(st, uid, line, side) {
  return placementChoices(legalNow(), uid, st.turn)
    .some(a => a.line === line && a.side === side);
}

/* ---------- 入力 ---------- */
function bindInput() {
  const el = stage.renderer.domElement;
  /* 最初の操作で音声を解錠する (ブラウザの自動再生制限) */
  window.addEventListener('pointerdown', () => {
    initAudio();
  }, { once: false });
  /* iPhone は pointerdown だけでは音を解錠・再開できないことがあるので、指を離したときにも */
  window.addEventListener('touchend', () => initAudio(), { passive: true });
  window.addEventListener('click', () => initAudio());
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /* accept を渡すと、条件に合わないカードは読み飛ばして下のカードを拾う。
     指に追従中の札や持ち上がった手札が、選びたいカードを隠さないようにする。 */
  function pick(ev, accept) {
    const r = el.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, stage.camera);
    /* 手札のアニメーション直後でも、見えているカードの行列で判定する。 */
    stage.scene.updateMatrixWorld(true);
    return pickCard(ray, [...board.hitList(), ...pads], accept);
  }

  /* 手札の当たり判定は、持ち上がる前の定位置 (LAYOUT.handSlot) で取る。
     触ると札が持ち上がるので、札そのもので判定すると下半分に触れたとき札が上へ逃げ、
     「札の上のほうしか反応しない」状態になっていた。定位置の札が重なる所は手前の札 */
  const restProxy = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD.w, CARD.h).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  function handRestAt(ev) {
    const st = shown();
    if (!st || drag) return null;
    const hand = st.players[ME].hand;
    const r = el.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, stage.camera);
    let best = null, bestD = Infinity;
    hand.forEach((uid, i) => {
      const s = LAYOUT.handSlot(i, hand.length);
      restProxy.position.set(s.pos[0], s.pos[1], s.pos[2]);
      restProxy.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
      restProxy.scale.setScalar(s.scale);
      restProxy.updateMatrixWorld(true);
      const h = ray.intersectObject(restProxy, false)[0];
      if (h && h.distance < bestD) { bestD = h.distance; best = uid; }
    });
    return best;
  }
  /* 手札の定位置に触れていれば、その札を当たりにする (盤面の配置先・パッドは除く) */
  function pickWithHand(ev, accept) {
    const hit = pick(ev, accept);
    if (hit && hit.obj.userData.isPad) return hit;
    const rest = handRestAt(ev);
    const card = rest && board.cards.get(rest);
    if (card && (!accept || accept(card.userData))) return { obj: card, point: null };
    return hit;
  }

  /* ゲームパッド用: 画面のその点を押したら、どのカードに当たるか (pickWithHand と同じ。シーンの行列は呼ぶ側で更新しておく) */
  gpPickAt = (x, y, accept) => {
    const r = el.getBoundingClientRect();
    ndc.x = ((x - r.left) / r.width) * 2 - 1;
    ndc.y = -((y - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, stage.camera);
    const hit = pickCard(ray, [...board.hitList(), ...pads], accept);
    if (hit && hit.obj.userData.isPad) return null;
    const rest = handRestAt({ clientX: x, clientY: y });
    const card = rest && board.cards.get(rest);
    if (card && (!accept || accept(card.userData))) return rest;
    return hit && hit.obj.userData ? hit.obj.userData.uid || null : null;
  };

  /* プロトコル板に当たっていれば、その板 (そのラインのスタックを一覧で見せる) */
  function panelAt(ev) {
    if (!panels) return null;
    const r = el.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, stage.camera);
    const meshes = panels.panels.flatMap(p => [p.loading.mesh, p.compiled.mesh]);
    const h = ray.intersectObjects(meshes, false)[0];
    return h ? panels.panels.find(p => p.loading.mesh === h.object || p.compiled.mesh === h.object) : null;
  }

  /* いま画面上で浮いているカード (掴んでいる/選択で持ち上がった手札) */
  function isFloating(uid) {
    if (!uid) return false;
    return uid === selectedUid || !!(drag && drag.uid === uid);
  }

  /* ---- ドラッグ&ドロップ ----
     押下で選択、8px 以上動いたら掴んで指に追従、パッド上で離すとプレイ。
     動かさず離せばクリック選択のまま (従来操作も生きる)。 */
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.05);   // y=1.05 の空中面
  const dragPt = new THREE.Vector3();
  let drag = null;   // { uid, sx, sy, moved, lastX }

  function planePoint(ev) {
    const r = el.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, stage.camera);
    return ray.ray.intersectPlane(dragPlane, dragPt) ? dragPt : null;
  }

  /* ドラッグ位置の直下にある着地候補パッド */
  function padUnder(pt) {
    if (!pt) return null;
    for (const pad of pads) {
      if (pad.userData.pulse <= 0) continue;
      if (Math.abs(pt.x - pad.position.x) < 0.85 && Math.abs(pt.z - pad.position.z) < 1.1) return pad;
    }
    return null;
  }

  el.addEventListener('pointermove', (ev) => {
    updateDesktopHandDrawer(ev);
    if (busy) return;

    /* 掴んでいる間: カードを指に追従させ、パッドをホバー強調 */
    if (drag) {
      const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (!drag.moved && dx * dx + dy * dy > 64) {
        drag.moved = true;
        const c0 = board.cards.get(drag.uid);
        if (c0) drag.stopShadow = board.followShadow(c0);        // 盤面の上を運ぶ間、影を落とす
      }
      if (drag.moved) {
        const pt = planePoint(ev);
        const card = board.cards.get(drag.uid);
        if (pt && card) {
          card.position.set(pt.x, 1.05, pt.z);
          const tilt = Math.max(-0.4, Math.min(0.4, (ev.clientX - drag.lastX) * 0.02));
          card.rotation.set(0.5, 0, -tilt);
          card.scale.setScalar(1.18);
          card.renderOrder = 7;
        }
        drag.lastX = ev.clientX;
        const over = padUnder(pt);
        for (const pad of pads) pad.userData.hover = (pad === over);
        el.style.cursor = over ? 'copy' : 'grabbing';
      }
      return;
    }

    /* 対象を選んでいる間: 候補にカーソルを乗せたら、選んだら何が起きるかを札の上に出す */
    if (pickAid && boardPick && Array.isArray(boardPick.chosen) && Array.isArray(boardPick.req.candidates)) {
      const cands = boardPick.req.candidates;
      const over = pickWithHand(ev, (ud) => ud.uid && cands.indexOf(ud.uid) >= 0);
      const ou = over && over.obj.userData.uid;
      if (ou) { if (pickAid.tipUid() !== ou) { const pv = pickPreview(boardPick, ou); pickAid.tip(ou, pv.now, pv.later); } }
      else pickAid.untip();
    }
    const hit = pickWithHand(ev);
    const uid = hit && hit.obj.userData.uid;
    const st = shown();
    const inMyHand = uid && st && st.players[ME].hand.includes(uid);
    const next = inMyHand ? uid : null;
    if (next !== hoverUid) {
      const prev = hoverUid;
      hoverUid = next;
      if (prev && prev !== selectedUid) restHandCard(prev);
      if (hoverUid && hoverUid !== selectedUid) raiseHandCard(hoverUid);
      el.style.cursor = uid ? 'pointer' : 'default';
    }
    /* プロトコル板も押せる (スタックの一覧) */
    if (!uid) el.style.cursor = panelAt(ev) ? 'pointer' : 'default';
    /* 盤面のカードは向きが読みにくいので、余白に拡大プレビュー。
       スマホはタップ (pointerdown) だけで切り替える: 指の移動で消えないように */
    if (!isCompactHandUI()) showPreview(uid);
  });

  /* カーソルが盤面から出たらプレビューを消す */
  el.addEventListener('pointerleave', () => {
    if (!isCompactHandUI()) showPreview(null);   // タッチは指を離すと leave が来るので消さない
    if (!isCompactHandUI() && !drag && selectedUid === null) setHandDrawer(false);
  });

  el.addEventListener('pointerdown', async (ev) => {
    /* プロトコルの並べ替え中は、並べ替える板のタップだけを受ける (並べ替えの側が先に拾う)。
       それ以外の板を押してもスタックの一覧を開かない (開くと画面を覆って、入れ替えが続けられなかった) */
    if (activeArrange && !activeArrange.peek) {
      if (panelAt(ev)) UI.toast(activeArrange.hint || '光っている側のプロトコルをタップしてください', 1800);
      return;
    }
    if (drag) {
      const stale = board.cards.get(drag.uid);
      if (stale) {
        stale.renderOrder = 0;
        if (drag.uid === selectedUid) raiseHandCard(drag.uid);
        else restHandCard(drag.uid);
      }
      drag = null;
      for (const pad of pads) pad.userData.hover = false;
    }
    /* タップ環境はホバーが無いので、触れたカードをまずプレビューする。
       操作できない場面 (相手ターン・選択待ち) でもテキストは読めるようにする */
    const hit = pickWithHand(ev);
    showPreview((hit && hit.obj.userData.uid) || null);
    /* 選択の帯を透かしている間は、選ばずに見るだけ。公開されている情報はふだんどおり開ける:
       捨て札の山 → 中身の一覧、プロトコル板 → そのラインのスタックの一覧 (重なった下のカードも) */
    if (ribbonPeeking()) {
      const pu = hit && hit.obj.userData.uid;
      const plt = pu && locOf(shown(), pu);
      if (plt && plt.zone === 'trash') { showTrash(plt.side); return; }
      if (plt && plt.zone === 'deck' && plt.side === ME && puzzle && puzzle.tsume) { TS.showDeck(shown(), defIndex, ME); return; }
      if (plt && plt.zone === 'field' && shown().lines[plt.line][plt.side].length > 1) { showStack(plt.line, plt.side); return; }
      if (!pu) { const pl = panelAt(ev); if (pl) showStack(pl.line, pl.side); }
      return;
    }
    /* 盤面対象選択モード中はタップを選択として扱う。
       ラインの判定はメッシュに頼らず、盤面平面の座標から最寄りレーンを取る
       (パネルやパッドの当たり判定に依存しない) */
    const laneFromEvent = () => {
      const pt = planePoint(ev);
      if (!pt || Math.abs(pt.z) > 3.4) return null;
      let bl = null, bd = 1.1;
      BOARD.laneX.forEach((x, i) => {
        const dd = Math.abs(pt.x - x);
        if (dd < bd) { bd = dd; bl = i; }
      });
      return bl;
    };
    if (trainingMode && !busy && cur && !cur.requests.length && !boardPick) {
      const ud = hit && hit.obj && hit.obj.userData;
      const selCard = training.sel && shown().cards[training.sel];
      if (selCard) {
        const owner = selCard.owner;
        let line = ud && ud.isPad && ud.side === owner ? ud.line : null;
        /* 持ち主側のスタックのカードを触ったら、その上に置く */
        if (line === null && ud && ud.uid && ud.uid !== training.sel) {
          const loc = locOf(shown(), ud.uid);
          if (loc && loc.zone === 'field' && loc.side === owner) line = loc.line;
        }
        /* カード以外 (レーンの床やプロトコル板) は盤面平面の位置で判定する */
        if (line === null && !(ud && ud.uid)) {
          const pt = planePoint(ev);
          const lane = laneFromEvent();
          if (pt && lane !== null && (pt.z < 0 ? AI : ME) === owner) line = lane;
        }
        if (line !== null) {
          await trainingStep({ type: 'trainingPlace', card: training.sel, line, faceUp: training.faceUp });
          return;
        }
      }
      if (ud && ud.uid && shown().cards[ud.uid]) {
        const lt = locOf(shown(), ud.uid);
        if (lt && lt.zone === 'trash' && !selCard) { showTrash(lt.side); return; }
        trainingSelect(ud.uid === training.sel ? null : ud.uid);
        return;
      }
      /* 置き先を少し外しただけで選択が消えると困るので、空振りでは何もしない (× で外す) */
      return;
    }
    if (boardPick && boardPick.kind === 'yesno') return;
    if (boardPick && boardPick.kind === 'free') {
      /* 候補でないカードが重なっていても、その下の候補まで拾いに行く */
      const free = pickWithHand(ev, (ud) => ud.uid && !!boardPick.byUid[ud.uid]);
      const uid2 = free && free.obj.userData.uid;
      if (uid2) { tapFreePick({ uid: uid2 }); return; }
      if (boardPick.sel) {
        const line = laneFromEvent();
        if (line !== null) tapFreePick({ isPad: true, line });
      }
      return;
    }
    if (boardPick && boardPick.kind === 'line') {
      const line = laneFromEvent();
      if (line !== null && boardPick.lines.indexOf(line) >= 0) finishLinePick(boardPick.toPicks(line));
      return;
    }
    if (boardPick) {
      /* 対象選択では候補だけを当たり判定に使う。重なった非候補は透かす */
      const cands = Array.isArray(boardPick.req && boardPick.req.candidates) ? boardPick.req.candidates : null;
      const target = cands
        ? pickWithHand(ev, (ud) => ud.uid && cands.indexOf(ud.uid) >= 0)
        : (hit && hit.obj.userData.uid ? hit : null);
      if (target && target.obj.userData.uid) { toggleBoardPick(target.obj.userData.uid); return; }
      if (cands) {
        /* 候補外でも捨て札の山だけは中身を見せる (公開情報) */
        const lt = hit && hit.obj.userData.uid && locOf(shown(), hit.obj.userData.uid);
        if (lt && (lt.zone === 'field' || lt.zone === 'hand') && pickAid) pickAid.reason(hit.obj.userData.uid, pickReason(lt));
        if (lt && lt.zone === 'trash') showTrash(lt.side);
        else if (lt && lt.zone === 'deck' && lt.side === ME && puzzle && puzzle.tsume) TS.showDeck(shown(), defIndex, ME);
        return;
      }
    }
    /* 捨て札の山をタップ: 中身は公開情報なので一覧を出す */
    if (hit && hit.obj.userData.uid) {
      const lt = locOf(shown(), hit.obj.userData.uid);
      if (lt && lt.zone === 'trash') { showTrash(lt.side); return; }
      /* 詰めコンパイルでは自分の山札も見てよい: 山を触ると中身を上から順に出す */
      if (lt && lt.zone === 'deck' && lt.side === ME && puzzle && puzzle.tsume) { TS.showDeck(shown(), defIndex, ME); return; }
    }
    /* プロトコル板をタップ: そのラインのスタックを一覧で見せる (配置先を選んでいる間は除く) */
    if (!(hit && hit.obj.userData.uid) && !selectedUid) {
      const pl = panelAt(ev);
      if (pl) { showStack(pl.line, pl.side); return; }
    }
    if (demoMode || busy || !cur || shown().winner !== null) return;
    if (cur.requests.length || !humanTurn(shown())) return;
    /* 縦持ちは、画面下の手札が見た目では盤面と離れていても透視投影上は
       盤面レイに重なることがある。選択済みなら配置枠のワールド座標を
       優先し、手札に当たり判定を奪われず盤面へ置けるようにする。 */
    if (selectedUid && isCompactHandUI()) {
      const directPad = padUnder(planePoint(ev));
      if (directPad) { await dropOnPad(directPad.userData); return; }
    }
    /* 選択中の手札や盤面のカードが重なっても、光る配置先を直接判定する。
       座席は legalNow() でローカルへ変換済みの pad.side を使う。 */
    /* 盤面の積み札を押した時は、投影座標ではなく実際に当たった札の
       所属レーンを使う。自分側のスタックが高くなっても当たり先がずれない。 */
    /* 持ち上がった手札が盤面に重なっている時は、その札を透かして下の積み札を拾う。
       指が手札の並びの上にある場合は従来通り (同じカードの再タップ=選択解除)。 */
    const seeThrough = selectedUid && isFloating(hit && hit.obj.userData.uid) && laneFromEvent() !== null;
    const under = seeThrough ? pick(ev, (ud) => ud.uid && !isFloating(ud.uid)) : hit;
    const hitData = under && under.obj.userData;
    if (selectedUid && hitData && hitData.uid) {
      const loc = locOf(shown(), hitData.uid);
      if (loc && loc.zone === 'field') {
        await dropOnPad({ line: loc.line, side: loc.side });
        return;
      }
    }
    const targetPad = placementPad(ray, pads, hit && hit.obj.userData.uid,
      selectedUid, shown().players[ME].hand);
    if (targetPad) { await dropOnPad(targetPad); return; }
    if (!hit) { deselect(); return; }

    const ud = hit.obj.userData;
    if (ud.uid && shown().players[ME].hand.includes(ud.uid)) {
      select(ud.uid === selectedUid ? null : ud.uid);
      if (selectedUid) {
        drag = { uid: selectedUid, sx: ev.clientX, sy: ev.clientY, moved: false, lastX: ev.clientX };
        /* ゲームパッド (gamepad.js) から送った合図には、捕まえられる指がない。捕まえられなくても続ける */
        if (ev.isTrusted && el.setPointerCapture) { try { el.setPointerCapture(ev.pointerId); } catch (e) { /* 指がもう離れた */ } }
      }
      return;
    }
    if (ud.isPad && selectedUid) {
      await dropOnPad(ud);
      return;
    }
  });

  el.addEventListener('pointerup', async (ev) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.stopShadow) d.stopShadow();
    for (const pad of pads) pad.userData.hover = false;
    el.style.cursor = 'default';
    if (!d.moved) return;             // ただのクリック → 選択のまま

    const pt = planePoint(ev);
    const over = padUnder(pt);
    if (over && selectedUid === d.uid) {
      await dropOnPad(over.userData);
    } else {
      /* 掴んだが置けない場所 → 手札へ戻す (選択は維持)。戻ったことが分かるよう短く鳴らす */
      const card = board.cards.get(d.uid);
      if (card) { card.renderOrder = 0; raiseHandCard(d.uid); sfx('tick'); }
    }
  });

  el.addEventListener('pointercancel', () => {
    if (!drag) return;
    if (drag.stopShadow) drag.stopShadow();
    const card = board.cards.get(drag.uid);
    if (card) { card.renderOrder = 0; restHandCard(drag.uid); }
    drag = null;
    for (const pad of pads) pad.userData.hover = false;
  });

  async function dropOnPad(ud) {
    if (!canPlaceOnLine(cur.state, selectedUid, ud.line, ud.side)) {
      sfx('tick'); UI.toast('そのラインにはプレイできません'); return;
    }
    const card = board.cards.get(selectedUid);
    if (card) { card.renderOrder = 0; raiseHandCard(selectedUid); }
    focusPlayChoice(ud.line, ud.side);
  }

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') deselect();
  });
  window.addEventListener('keyup', (ev) => {
  });

  const refreshBtn = document.getElementById('btnRefresh');
  if (refreshBtn) refreshBtn.onclick = async () => {
    if (busy || !cur || !humanTurn(shown()) || cur.requests.length) return;
    const ok = legalNow().some(a => a.type === 'refresh');
    if (!ok) { UI.toast('いまは補充できません'); return; }
    /* 押し間違え防止: 1回目は確かめ、3秒以内にもう一度押したら補充 (補充すると番が終わる) */
    if (!refreshBtn.classList.contains('armed')) {
      refreshBtn.classList.add('armed');
      refreshBtn.dataset.label = refreshBtn.dataset.label || refreshBtn.textContent;
      refreshBtn.textContent = 'もう一度押すと補充';
      clearTimeout(refreshBtn._t);
      refreshBtn._t = setTimeout(() => { refreshBtn.classList.remove('armed'); refreshBtn.textContent = refreshBtn.dataset.label; }, 3000);
      return;
    }
    clearTimeout(refreshBtn._t);
    refreshBtn.classList.remove('armed');
    refreshBtn.textContent = refreshBtn.dataset.label;
    deselect();
    await step({ type: 'refresh' });
  };
  const goToMenu = async () => {
    if (!roomMode) {
      /* 続きから遊べる対戦 (resume.js で記録中) は、中断するか・やめるかを選ぶ */
      const st0 = shown();
      if (RS.resumeActive() && st0 && st0.winner === null) {
        const v = await RS.askLeave();
        if (!v) return;
        CW.battleEnded();                 // 落ちたのではない (エラーの一覧に送らない)
        if (v === 'quit') RS.endResume();
        /* 中断してすぐのメニューでは「続きから遊ぶか」を聞かない (次に開いたときに聞く) */
        location.href = location.pathname + (v === 'suspend' ? '?suspended=1' : '');
        return;
      }
      if (!await RS.askConfirm('メニューに戻りますか？')) return;
      CW.battleEnded(); RS.endResume();
      location.href = location.pathname;
      return;
    }
    const st = shown();
    /* 観戦はそのまま抜ける (投了は送らない) */
    if (roomWatching) { location.href = location.pathname; return; }
    if (st && st.winner === null) {
      if (!await RS.askConfirm('投了してメニューに戻りますか？')) return;
      try { await ROOM.roomApi('action', { code: roomRm.code, version: roomRm.version, action: { type: 'surrender' } }); }
      catch (e) {
        if (!isRoomGone(e) && !await RS.askConfirm('投了を送れませんでした。それでもメニューに戻りますか？', e.message)) return;
      }
    }
    CW.battleEnded(); RS.endResume();
    location.href = location.pathname;
  };
  const cardsBtn = document.getElementById('btnCards');
  if (cardsBtn) cardsBtn.onclick = () => openCardList();
  const settingsBtn = document.getElementById('btnSettings');
  /* メニューへ戻るのは歯車の中 (上のバーの MENU は、縦持ちだと画面の外へ押し出されて押せなかった) */
  if (settingsBtn) settingsBtn.onclick = () => {
    const st = shown();
    const live = roomMode && st && st.winner === null;
    const items = [{ label: live ? '投了してメニューに戻る' : 'メニューに戻る', button: 'メニューへ', warn: live,
      note: live ? 'この対戦は負けになります' : RS.resumeActive() && st && st.winner === null ? '中断して、あとで続きから遊ぶこともできます' : 'この対戦をやめてタイトルに戻ります', onClick: goToMenu }];
    if (canSurrender()) items.unshift({ label: '降参する', button: '降参', warn: true, note: 'この対戦は負けとして記録されます (戦績・リプレイに残ります)', onClick: surrenderLocal });
    openSettings(items);
  };
  /* 右上のボタン = すべての音を消す (タイトルなどの右下のボタンと同じ状態) */
  const muteBtn = document.getElementById('btnMute');
  if (muteBtn) {
    const sync = () => {
      muteBtn.innerHTML = muteIcon(isMuted());
      muteBtn.classList.toggle('on', isMuted());
      muteBtn.setAttribute('aria-pressed', isMuted() ? 'true' : 'false');
      muteBtn.title = isMuted() ? '音を鳴らす' : 'すべての音を消す';
    };
    muteBtn.onclick = () => { initAudio(); setMuted(!isMuted()); };
    onMuteChange(sync);
    sync();
  }
  const undoBtn = document.getElementById('btnUndo');
  if (undoBtn) undoBtn.onclick = () => (roomMode ? roomUndo() : undoLastMove());
  const hintBtn = document.getElementById('btnHint');
  if (hintBtn) hintBtn.onclick = showHint;
  onSettings(() => syncAssist());
  const logBtn = document.getElementById('btnLog');
  if (logBtn) logBtn.onclick = () => {
    const open = !document.getElementById('logDock')?.classList.contains('open');
    setLogOpen(open);
    try { localStorage.setItem('compileLogOpen', open ? '1' : '0'); } catch (e) { /* private mode */ }
  };
  /* 詳細 (左) もログと同じ要領で出したりしまったりできる。最初は出しておき、しまったら次回もしまったまま */
  const infoBtn = document.getElementById('btnInfo');
  if (infoBtn) infoBtn.onclick = () => {
    const open = document.body.classList.contains('info-closed');
    UI.setInfoOpen(open);
    try { localStorage.setItem(isCompactHandUI() ? 'compileInfoOpenP' : 'compileInfoOpen', open ? '1' : '0'); } catch (e) { /* private mode */ }
  };
  /* 縦持ちの INFO (効いている上段・下段の一覧) は、はじめは閉じておく (盤面を覆うので)。横持ちとは別に覚える */
  const infoKey = () => (isCompactHandUI() ? 'compileInfoOpenP' : 'compileInfoOpen');
  let infoWasOpen = !isCompactHandUI();
  try { const v = localStorage.getItem(infoKey()); if (v !== null) infoWasOpen = v === '1'; } catch (e) { /* private mode */ }
  UI.setInfoOpen(infoWasOpen);
  /* 効果の一覧の項目を押したら、その札を光らせて説明を出す */
  UI.setFxTapHandler((uid) => {
    board.pulse(uid, undefined, undefined, { still: true });
    if (isCompactHandUI()) showCardInspector(uid);
    else { previewUid = null; showPreview(uid); }
  });
  /* 縦持ちは INFO の外に触れたら閉じる (ログと同じ) */
  document.addEventListener('pointerdown', (ev) => {
    if (!isCompactHandUI() || document.body.classList.contains('info-closed')) return;
    if (ev.target && ev.target.closest && ev.target.closest('#preview, #btnInfo, #cardNote')) return;
    UI.setInfoOpen(false);
    try { localStorage.setItem('compileInfoOpenP', '0'); } catch (e) { /* private mode */ }
  }, true);
  /* 縦持ちはログが盤面の大半を覆うので、ログの外に触れたら閉じる (触れた操作はそのまま通す) */
  document.addEventListener('pointerdown', (ev) => {
    if (!isCompactHandUI()) return;
    const dock = document.getElementById('logDock');
    if (!dock || !dock.classList.contains('open') || (ev.target && ev.target.closest && ev.target.closest('#logDock'))) return;
    setLogOpen(false);
    try { localStorage.setItem('compileLogOpen', '0'); } catch (e) { /* private mode */ }
  }, true);
  /* 前回サイドバーを開いていたら開いて始める (最初は閉じておき、盤面を広く見せる) */
  let logWasOpen = false;
  try { logWasOpen = localStorage.getItem('compileLogOpen') === '1'; } catch (e) { /* private mode */ }
  setLogOpen(logWasOpen);
  const handBtn = document.getElementById('btnHand');
  if (handBtn) handBtn.onclick = () => {
    /* ボタンで隠したら、マウスを下へ動かしても勝手に出さない (出すボタンかカード選択で戻す) */
    handPinnedClosed = VIEW.handOpen;
    handHold = false;
    setHandDrawer(!VIEW.handOpen);
  };
  syncHandDrawerForViewport();
}

/* ログは右のサイドバー。端のつまみで開閉する */
function setLogOpen(open) {
  const dock = document.getElementById('logDock');
  const log = document.getElementById('log');
  const logBtn = document.getElementById('btnLog');
  if (!dock || !log) return;
  dock.classList.toggle('open', open);
  /* 開いたら一番新しい行を見せる (押した直後に何が起きたか読みたい) */
  if (open) log.scrollTop = log.scrollHeight;
  if (logBtn) logBtn.setAttribute('aria-expanded', String(open));
}

/* ---------- 拡大プレビュー (余白に固定表示) ---------- */
let previewUid = null;

/* スマホ: カードを触ったら、画像の拡大ではなく文字で効果を読ませる。
   画面中央に大きな画像を出すと盤面が隠れ、それでも文字は小さかった。
   触ったカードを隠さないよう、画面の下半分のカードなら上に、上半分なら下に出す。 */
function fieldLoc(st, uid) {
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) {
    const idx = st.lines[l][s].indexOf(uid);
    if (idx >= 0) return { line: l, side: s, idx };
  }
  return null;
}

/* カードの詳細 (拡大表示のパネル・スマホの効果表示で共通)。
   見る権利のないカードは中身を出さず「裏向きのカード」とだけ返す */
const ROW_LABEL = { upper: '上段', middle: '中段', lower: '下段' };
/* プロトコルの6枚 (絵・値・効果の文)。選択画面とオンラインのドラフトの「?」で見せる */
function protocolCards(name) {
  return (protoIndex[name] ? protoIndex[name].cards : [])
    .map(c => defIndex[c.id]).filter(Boolean)
    .map(d => ({
      img: faceImageURL(d), label: d.proto + ' ' + d.value,
      rows: ['upper', 'middle', 'lower'].filter(k => d[k]).map(k => ({ key: k, text: d[k] }))
    }));
}

function defDetail(d, rows) {
  return {
    title: d.proto + ' ' + d.value, proto: d.proto, value: d.value, color: d.color, img: faceImageURL(d), defId: d.id,
    /* 段が無いカードも3段の位置をそろえる (無い段は「なし」と薄く出す。上に詰めない) */
    rows: rows || ['upper', 'middle', 'lower'].map(k => ({ key: k, zone: ROW_LABEL[k], text: d[k] || '', empty: !d[k] }))
  };
}

function cardDetail(uid, st = shown()) {
  const card = uid && st && st.cards[uid];
  if (!card) return null;
  /* トレーニングは検証用の盤面なので、どちらの裏向きも中身を出す */
  const visible = card.def && (trainingMode || card.faceUp || ((card.knownTo || 0) & (1 << ME)));
  if (!visible) {
    return { hidden: true, title: '裏向きのカード', proto: '裏向きのカード', value: 2, color: '#8fa8c8',
      badge: '非公開', note: '値2', rows: [] };
  }
  const d = defIndex[card.def];
  if (!d) return null;
  const loc = fieldLoc(st, uid)
    || (st.players.some(pl => pl.hand.includes(uid)) ? { zone: 'hand' }
      : st.players.some(pl => pl.trash.includes(uid)) ? { zone: 'trash' } : null);
  let badge = '', note = '';
  let upperOff = false, middleOff = false, lowerOff = false;
  if (loc && loc.line !== undefined) {
    const stack = st.lines[loc.line][loc.side];
    const covered = stack.indexOf(uid) < stack.length - 1;
    /* 場所と状態は短く (効かない段はパネルで薄くなるので、説明は一言だけ) */
    badge = (loc.side === ME ? '自分の場' : '相手の場') + (covered ? '・覆われ' : '');
    if (!card.faceUp) { badge += '・裏'; note = '効果なし・値2'; upperOff = middleOff = lowerOff = true; }
    else if (covered) { note = '上段のみ有効'; middleOff = lowerOff = true; }
  } else if (loc && loc.zone === 'hand') {
    badge = '手札';
  } else if (loc && loc.zone === 'trash') {
    badge = '捨て札';
  }
  const off = { upper: upperOff, middle: middleOff, lower: lowerOff };
  const rows = ['upper', 'middle', 'lower']
    .map(k => ({ key: k, zone: ROW_LABEL[k], text: d[k] || '', empty: !d[k], inactive: off[k] }));
  const facedown = !card.faceUp && !!(loc && loc.line !== undefined);
  return { ...defDetail(d, rows), badge, note, facedown };
}

function showCardInspector(uid) {
  const o = cardDetail(uid);
  if (!o) { UI.hideCardNote(); return; }
  /* 盤面と手札を隠さない右上の空きに出す。盤面をタップすれば消える */
  UI.showCardNote({ ...o, place: 'corner', large: true, persist: true });
}

/* 発動の拡大表示と触ったときの拡大表示は同じ場所の同じ枠。あとから出たほうに入れ替える */
function clearPreview() {
  previewUid = null;
}

/* 選択の帯を目のボタンで透かしている間か (このあいだはカードを触っても選ばず、効果を見るだけ) */
function ribbonPeeking() { return !!document.querySelector('.pick-ribbon.peek'); }

function showPreview(uid) {
  const box = document.getElementById('preview');
  if (!box) return;
  /* 目の状態: どこのカードでも (選ぶ候補でも) 効果を出す。INFO をしまっていても見えるよう小さな表示で */
  if (uid && ribbonPeeking()) {
    previewUid = uid;
    showCardInspector(uid);
    return;
  }
  /* 横持ちで INFO (左の詳細) をしまっているときも、押したカードの説明は出す (縦持ちと同じ小さな表示で) */
  if (!isCompactHandUI() && uid && document.body.classList.contains('info-closed')) {
    if (uid === previewUid && UI.cardNoteShown()) return;
    previewUid = uid;
    showCardInspector(uid);
    return;
  }
  if (isCompactHandUI()) {
    /* 対象選択中に候補を触ったのは「選ぶ」操作。効果パネルで選択帯を隠さない */
    if (uid && boardPick && Array.isArray(boardPick.req.candidates) && boardPick.req.candidates.includes(uid)) {
      /* ただし選んだカードの効果は出したまま (toggleBoardPick が出す) */
      if (Array.isArray(boardPick.chosen) && boardPick.chosen.includes(uid)) return;
      previewUid = null;
      UI.hideCardNote();
      return;
    }
    /* 外を触って閉じたあとに同じカードを押したら、開き直す */
    if (uid === previewUid && UI.cardNoteShown()) return;
    previewUid = uid;
    box.classList.remove('show');
    showCardInspector(uid);
    return;
  }
  /* 見えないカード (相手の裏向き等) も「非公開」の案内を出す。無反応だと壊れて見えるため */
  const o = cardDetail(uid);
  /* カードから外れても消さない: 最後に触ったカードを出したままにする */
  if (!o || uid === previewUid) return;
  previewUid = uid;
  UI.showCardPanel(o);
}

/* 縦持ちのスマホ用の UI か。スマホは横持ち専用にしたので、横向きでは PC と同じ UI を使う */
function isCompactHandUI() {
  return window.matchMedia('(max-width: 860px) and (orientation: portrait)').matches;
}

/* 手札を隠す/出すボタンは常に出す (盤面の下側を見たいとき用) */
let handPinnedClosed = false;
function syncHandDrawerButton() {
  const button = document.getElementById('btnHand');
  if (!button) return;
  button.hidden = false;
  button.textContent = VIEW.handOpen ? 'HIDE HAND' : 'SHOW HAND';
  button.setAttribute('aria-expanded', String(VIEW.handOpen));
}

function setHandDrawer(open, instant = false) {
  VIEW.handOpen = !!open;
  if (open) handPinnedClosed = false;
  VIEW.handHidden = !open && handPinnedClosed;
  document.body.classList.toggle('hand-tucked', !VIEW.handOpen);
  syncHandDrawerButton();
  const st = shown();
  if (!st || !board) return;
  if (instant) {
    board.syncInstant(st);
    if (selectedUid) raiseHandCard(selectedUid);
    return;
  }
  for (const [i, uid] of st.players[ME].hand.entries()) {
    const slot = uid === selectedUid
      ? LAYOUT.handSlotRaised(i, st.players[ME].hand.length)
      : LAYOUT.handSlot(i, st.players[ME].hand.length);
    const card = board.cardOf(st, uid);
    /* 隠すときは引いてから消し、出すときは先に見せてから上げる */
    if (!slot.hidden) card.visible = true;
    board.moveTo(card, slot, null, 180, TW.Ease.outCubic, 0).then(() => { if (slot.hidden) card.visible = false; });
  }
}

function syncHandDrawerForViewport() {
  const compact = isCompactHandUI();
  if (handCompactMode !== compact) {
    handCompactMode = compact;
    /* PC は盤面を優先して畳んだ状態から、スマホはボタンで畳めるよう最初は表示する。 */
    setHandDrawer(compact, true);
  } else {
    syncHandDrawerButton();
  }
}

/* パソコン: 自分の番が来たら、手札を開いて始める (handHold)。相手の番になったら畳んで盤面を広く見せる。
   前はいつも畳んだ状態で、開き方 (マウスを下端へ寄せる) がどこにも書いておらず、はじめての人は手札の効果を読めなかった。
   開いたままにするのは、マウスが一度手札の所へ入るまで。入ったあとは、いつもの「離れたら畳む」に戻る。
   HIDE HAND で自分で隠した人には出さない。観戦・自動で指す番には関係ない */
let handHold = false;
function handForTurn(turn) {
  if (isCompactHandUI() || handPinnedClosed || demoMode || spectate || !board) return;
  const mine = turn === ME && !partnerMove() && !(autoPlay && !roomMode);
  handHold = mine;
  if (mine && !VIEW.handOpen) setHandDrawer(true);
  else if (!mine && VIEW.handOpen && selectedUid === null) setHandDrawer(false);
}

function updateDesktopHandDrawer(ev) {
  if (!ev.isTrusted) return;                       // ゲームパッド (gamepad.js) から送った動き: 手札を勝手に開け閉めしない
  if (isCompactHandUI() || !stage || selectedUid !== null || handPinnedClosed) return;
  const r = stage.renderer.domElement.getBoundingClientRect();
  const fromBottom = r.bottom - ev.clientY;
  if (handHold) { if (fromBottom <= 120) handHold = false; return; }
  if (!VIEW.handOpen && fromBottom <= 120) setHandDrawer(true);
  else if (VIEW.handOpen && fromBottom > 230) setHandDrawer(false);
}

function raiseHandCard(uid) {
  handPinnedClosed = false;
  if (!VIEW.handOpen) setHandDrawer(true);
  const st = shown();
  const i = st.players[ME].hand.indexOf(uid);
  if (i < 0) return;
  const slot = LAYOUT.handSlotRaised(i, st.players[ME].hand.length);
  board.moveTo(board.cardOf(st, uid), slot, null, 150, TW.Ease.outCubic, 0);
}

function restHandCard(uid) {
  const st = shown();
  const i = st.players[ME].hand.indexOf(uid);
  if (i < 0) return;
  const slot = LAYOUT.handSlot(i, st.players[ME].hand.length);
  board.moveTo(board.cardOf(st, uid), slot, null, 170, TW.Ease.outCubic, 0);
}

function select(uid) {
  if (selectedUid && selectedUid !== uid) {
    const prev = board.cardOf(shown(), selectedUid);
    board.clearHighlight(prev);
    board.setSelected(prev, false);
    restHandCard(selectedUid);
  }
  selectedUid = uid;
  if (uid) {
    setHandDrawer(true);
    sfx('pick');
    raiseHandCard(uid);
    const card = board.cardOf(shown(), uid);
    board.setHighlight(card, 0xffb3da, 0.22, 0.85);
    board.setSelected(card, true, 0xffb3da);      // 選んだ札は金色に染める
  }
  updatePads();
  if (tutorial) coachUpdate();
}

function deselect() { select(null); }

function currentPlacementChoices() {
  if (!cur || busy || demoMode || shown().winner !== null) return [];
  if (boardPick?.kind === 'free') {
    return (boardPick.byUid[boardPick.sel] || []).map(o => ({
      type: 'play', card: boardPick.sel, line: o.line, side: ME,
      faceUp: o.face === 'u', raw: o.raw
    }));
  }
  if (cur.requests.length || !humanTurn(shown())) return [];
  return placementChoices(legalNow(), selectedUid, shown().turn);
}

/* 置いたあとのそのラインの合計 (効果を解く前)。写しの盤面に積んで、エンジンと同じ数え方で数える */
function placedTotal(st, action) {
  try {
    const s = JSON.parse(JSON.stringify(st));
    delete s._totals;
    const c = s.cards[action.card];
    if (!c) return null;
    const side = action.side ?? s.turn;
    for (const p of s.players) p.hand = p.hand.filter(u => u !== action.card);
    c.faceUp = !!action.faceUp;
    c.zone = 'field';
    c.owner = side;
    s.lines[action.line][side].push(action.card);
    return Engine.lineTotal(s, action.line, side);
  } catch (e) { return null; }
}
function updatePlayChoices() {
  const root = document.getElementById('playChoices');
  if (!root || !cur) return;
  const options = currentPlacementChoices();
  const uid = boardPick?.kind === 'free' ? boardPick.sel : selectedUid;
  renderPlayChoices(root, options, shown().players.map(p => p.protocols),
    options.length ? cardName(uid) : '', async action => {
      // Recheck against the latest state before committing a possibly stale button.
      const valid = currentPlacementChoices().find(a => a.card === action.card && a.line === action.line
        && a.side === action.side && a.faceUp === action.faceUp && a.raw === action.raw);
      if (!valid) { updatePlayChoices(); return; }
      sfx('select');                  // 表・裏を決めた手応え
      showPreview(null);
      if (boardPick?.kind === 'free') { finishFreePick([valid.raw]); return; }
      const { side, ...wire } = valid;
      if (side !== shown().turn) wire.side = side;
      deselect();
      await step(wire);
    }, () => {
      if (boardPick?.kind === 'free') { boardPick.sel = null; renderFreePick(); }
      else { deselect(); showPreview(null); }
    }, (action) => placedTotal(shown(), action));
  positionPlayChoices();
  if (tutorial) applyTutorialFocus();
}

function focusPlayChoice(line, side) {
  updatePlayChoices();
  const root = document.getElementById('playChoices');
  const cell = root?.querySelector(`section[data-line="${line}"][data-side="${side}"]`);
  if (cell) cell.classList.add('focused');
}

/* 手札の上端が画面下からどれだけ上にあるかを CSS 変数 --hand-gap に置く。
   効果を使うかの確認や一覧ダイアログを「手札のすぐ上」に出すのに使う。
   札は奥 (-Z) が上端で、手札は rot.x だけ起こしてあるので、その向きに半分ずらした点を投影する。
   PC は手札がマウスに合わせて上下するので、確認が動かないよう開いたときの位置で測る */
const handTopWorld = new THREE.Vector3();
let handTopTick = 0;
let handGapPx = '';
function openHandSlot() {
  const was = VIEW.handOpen;
  VIEW.handOpen = true;
  try { return LAYOUT.handSlot(0, 1); } finally { VIEW.handOpen = was; }
}
function trackHandTop() {
  if (!stage || (handTopTick++ % 8)) return;
  const s = openHandSlot();
  const half = CARD.h * s.scale / 2;
  handTopWorld.set(s.pos[0], s.pos[1] + Math.sin(s.rot[0]) * half, s.pos[2] - Math.cos(s.rot[0]) * half);
  handTopWorld.project(stage.camera);
  const rect = stage.renderer.domElement.getBoundingClientRect();
  const top = rect.top + (1 - handTopWorld.y) * rect.height / 2;
  if (!Number.isFinite(top)) return;
  /* 画面の外や上半分に出るような値 (カメラの切替中など) は使わない */
  const gap = Math.round(Math.min(window.innerHeight * 0.5, Math.max(0, window.innerHeight - top)));
  const px = gap + 'px';
  if (px === handGapPx) return;
  handGapPx = px;
  document.documentElement.style.setProperty('--hand-gap', px);
}

/* リフレッシュは手札の右脇に置く。いちばん右の札の右端を投影し、その少し右へ。
   手札の枚数で幅が変わるので、枚数が変わるたびに付いていく */
const handEdgeWorld = new THREE.Vector3();
const handEdgeEuler = new THREE.Euler();
/* 手札の端の札の、画面上いちばん外側の x (NDC)。扇に傾いた札は角が外へ張り出すので、
   中心 ± 半幅ではなく4つの角を傾けてから投影する。dir: 1 = 右端, -1 = 左端 */
function handCardEdgeX(slot, dir) {
  handEdgeEuler.set(slot.rot[0], slot.rot[1], slot.rot[2]);
  let edge = -Infinity;
  for (const cx of [-0.5, 0.5]) for (const cz of [-0.5, 0.5]) {
    handEdgeWorld.set(cx * CARD.w * slot.scale, 0, cz * CARD.h * slot.scale).applyEuler(handEdgeEuler);
    handEdgeWorld.x += slot.pos[0]; handEdgeWorld.y += slot.pos[1]; handEdgeWorld.z += slot.pos[2];
    handEdgeWorld.project(stage.camera);
    edge = Math.max(edge, dir * handEdgeWorld.x);
  }
  return dir * edge;
}
let handRightPx = '';
function trackHandRight() {
  if (!stage || (handTopTick % 8) !== 1) return;
  const st = shown();
  const n = Math.max(1, st ? st.players[ME].hand.length : 1);
  const was = VIEW.handOpen;
  VIEW.handOpen = true;
  let s;
  try { s = LAYOUT.handSlot(n - 1, n); } finally { VIEW.handOpen = was; }
  const rect = stage.renderer.domElement.getBoundingClientRect();
  const x = rect.left + (handCardEdgeX(s, 1) + 1) * rect.width / 2 + 16;
  if (!Number.isFinite(x)) return;
  const btn = document.getElementById('btnRefresh');
  const w = btn ? btn.offsetWidth : 110;
  const px = Math.round(Math.max(rect.left + rect.width / 2, Math.min(x, window.innerWidth - w - 14))) + 'px';
  if (px !== handRightPx) {
    handRightPx = px;
    document.documentElement.style.setProperty('--hand-right', px);
  }
  /* 手札を隠す/出すボタンは、リフレッシュと左右対称に手札の左脇へ置く */
  const was2 = VIEW.handOpen;
  VIEW.handOpen = true;
  let s0;
  try { s0 = LAYOUT.handSlot(0, n); } finally { VIEW.handOpen = was2; }
  const dock = document.getElementById('dock');
  const dw = dock ? dock.offsetWidth : 90;
  const lx = rect.left + (handCardEdgeX(s0, -1) + 1) * rect.width / 2 - 16 - dw;
  if (!Number.isFinite(lx)) return;
  const lpx = Math.round(Math.min(rect.left + rect.width / 2 - dw, Math.max(lx, 14))) + 'px';
  if (lpx === handLeftPx) return;
  handLeftPx = lpx;
  document.documentElement.style.setProperty('--hand-left', lpx);
}
let handLeftPx = '';

/* 山札・捨て札の枚数の札を、盤面の山のそば (盤の中央寄り) に置く。
   右上にまとめていた枚数表示の代わり。カメラが動くので数フレームごとに合わせ直す */
const pileWorld = new THREE.Vector3();
let pileTick = 0;
function trackPileCounts() {
  if (!stage || (pileTick++ % 3)) return;
  const root = document.getElementById('pileCounts');
  if (!root) return;
  const rect = stage.renderer.domElement.getBoundingClientRect();
  for (const el of root.children) {
    const side = +el.dataset.side;
    const p = LAYOUT.pilePos(el.dataset.kind, side, ME, 0);
    const edge = CARD.h * p.scale / 2;
    /* 手前の山は奥側 (画面の上)、奥の山は手前側 (画面の下) の縁の外に、山のカードにかぶせずに置く */
    pileWorld.set(p.pos[0], 0, p.pos[2] + (side === ME ? -edge : edge));
    pileWorld.project(stage.camera);
    const x = rect.left + (pileWorld.x + 1) * rect.width / 2;
    const y = rect.top + (1 - pileWorld.y) * rect.height / 2;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) translate(-50%,' +
      (side === ME ? 'calc(-100% - 4px)' : '4px') + ')';
  }
  placePileButtons(rect);
}

/* 縦持ち: 操作ボタンを手札に重ねず、自分の山のすぐ下に置く (半透明)。
   捨て札 (左) の下に UNDO・HINT、山札 (右) の下に REFRESH・手札をしまう。横持ちと PC は CSS の既定の位置 */
const pileBtnAt = new THREE.Vector3();
function placePileButtons(rect) {
  const groups = [
    { kind: 'trash', els: [document.getElementById('assist')] },
    { kind: 'deck', els: [document.getElementById('btnRefresh'), document.getElementById('dock')] }
  ];
  const on = isCompactHandUI();
  document.body.classList.toggle('pile-buttons', on);
  for (const g of groups) {
    if (!on) { for (const el of g.els) if (el) { el.style.left = ''; el.style.top = ''; } continue; }
    const p = LAYOUT.pilePos(g.kind, ME, ME, 0);
    pileBtnAt.set(p.pos[0], 0, p.pos[2] + CARD.h * p.scale / 2).project(stage.camera);
    const x = rect.left + (pileBtnAt.x + 1) * rect.width / 2;
    let y = rect.top + (1 - pileBtnAt.y) * rect.height / 2 + 6;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    for (const el of g.els) {
      if (!el || el.hidden) continue;
      /* 山は画面の端に近いので、ボタンが画面からはみ出さないよう内側に寄せる (中心で置いている) */
      const half = el.offsetWidth / 2;
      el.style.left = Math.round(Math.min(window.innerWidth - half - 6, Math.max(half + 6, x))) + 'px';
      el.style.top = Math.round(y) + 'px';
      y += el.offsetHeight + 10;        // 指で押し分けられる間 (前は 6px)
    }
  }
}

const choiceWorld = new THREE.Vector3();
function positionPlayChoices() {
  const root = document.getElementById('playChoices');
  if (!root || root.hidden || !stage) return;
  const rect = stage.renderer.domElement.getBoundingClientRect();
  for (const cell of root.querySelectorAll('.placement-lane')) {
    const line = Number(cell.dataset.line), side = Number(cell.dataset.side);
    const pad = pads.find(p => p.userData.line === line && p.userData.side === side);
    if (!pad) { cell.hidden = true; continue; }
    pad.getWorldPosition(choiceWorld);
    /* ボタンはスタックの1枚目の位置に固定する (スタックが伸びても動かさない)。
       札に重なるので、ボタンは半透明にして下の札を透かす (playchoices.css) */
    choiceWorld.z = BOARD.stackZ[choiceWorld.z > 0 ? 1 : 0];
    choiceWorld.y = isCompactHandUI() ? 0.8 : 0.09;
    choiceWorld.project(stage.camera);
    const visible = choiceWorld.z >= -1 && choiceWorld.z <= 1
      && choiceWorld.x >= -1.25 && choiceWorld.x <= 1.25 && choiceWorld.y >= -1.25 && choiceWorld.y <= 1.25;
    cell.hidden = !visible;
    if (!visible) continue;
    cell.style.left = (rect.left + (choiceWorld.x + 1) * rect.width / 2) + 'px';
    cell.style.top = (rect.top + (1 - choiceWorld.y) * rect.height / 2) + 'px';
  }
}

/* AI の思考中だけ trace を止める (state の clone が入って探索が重くなるため) */
function withoutTrace(fn) {
  Engine.setTrace(false);
  try { return fn(); } finally { Engine.setTrace(true); }
}

/* ==================== ルーム対戦 (オンライン) ==================== */

function roomValOf(defId) {
  const d = defId && defIndex[defId];
  return d ? d.value : 0;
}

/* サーバーの publicState を受けて、差分アニメ + HUD 更新まで行う */
/* オンライン対戦: 画面上に対戦相手の名前と称号を出す */
let roomServerOffset = 0;          // サーバーの時計 - この端末の時計 (持ち時間の計算に使う)
/* 自分の名札: 表示名 (未設定なら YOU)・レベル・称号・アイコン (設定の「見た目」で選んだもの) */
/* 名札の枠の色 (プロトコルの習熟度の名札 p_fire → FIRE の色) */
function frameColor(frame) {
  const m = /^p_([a-z]+)$/.exec(frame || '');
  const p = m && protoIndex[m[1].toUpperCase()];
  return p ? p.color : null;
}
function myPlate() {
  const p = profileOf(settings(), localRecords());
  const art = iconArt(p.icon, Object.values(protoIndex), 40);
  const frame = myLook(settings()).plate;
  return { name: displayName() || 'YOU', level: p.level, sub: p.title || '', frame, frameColor: frameColor(frame),
    icon: art ? { name: p.icon, color: art.color, src: art.src, face: !!art.face } : null };
}
/* CPU 戦の名札: 相手は CPU と難易度。アイコンは相手のデッキの1つ目のプロトコル */
function showCpuPlates(p1) {
  const first = p1 && protoIndex[p1[0]];
  /* 勝ち抜き戦・週替わりでは難易度名 (かんたん・ふつう…) を出さない */
  const sub = storyNode ? 'STORY' : aiDifficulty === null || runMode ? '' : levelLabel(aiDifficulty);
  const showAv = avatarsOpen() && settings().avatarShow !== false && !tutorial;
  showPlates({ me: myPlate(), opp: { name: storyNode ? storyNode.oppName : (showAv && avatarName(oppAvatarPlan())) || 'CPU',
    sub: storyNode ? 'STORY' : runMode ? '' : shortLevel(aiDifficulty),
    icon: first ? { name: first.name, color: first.color } : null } });
}

/* タッグの名札: 自分の側は、いま (次に) 指す人 (あなた / 味方)。相手の側は 相手1 / 相手2。アイコンはその人の1つ目のプロトコル */
function tagPlates(st) {
  const iconOf = (side, pilot) => {
    const p = st.players[side].protocols[0];
    const meta = protoIndex[p.names ? p.names[pilot] : p.name];
    return meta ? { name: meta.name, color: meta.color } : null;
  };
  const lv = aiDifficulty === null ? '' : levelLabel(aiDifficulty);
  const mine = st.tag.pilot[ME], theirs = st.tag.pilot[AI];
  /* オンラインのタッグ: いま指す人の名前 (席の名前)。自分の番なら自分の名札 */
  if (roomTag && st.tag.online) {
    const seatOf = (local, pilot) => roomTag.seats[(local === ME ? roomTag.side : 1 - roomTag.side) + 2 * pilot];
    const plate = (local, pilot, sub) => {
      const x = seatOf(local, pilot);
      return { name: x ? x.name : '?', sub: (x && x.cpu ? 'CPU · ' : '') + sub, icon: iconOf(local, pilot) };
    };
    showPlates({
      me: mine === st.tag.mine ? myPlate() : plate(ME, mine, 'PARTNER'),
      opp: plate(AI, theirs, 'RIVAL ' + (theirs + 1))
    });
    return;
  }
  /* 観戦のタッグ: A1 / A2 と B1 / B2 (ベットした側に印) */
  if (spectate) {
    const bet = spectate.bet;
    const mark = (k) => (bet && bet.side === k ? 'ベット ' + bet.amount + ' CHIP' : 'CPU ' + lv);
    showPlates({ me: { name: specName(ME, mine), sub: mark(0), icon: iconOf(ME, mine) }, opp: { name: specName(AI, theirs), sub: mark(1), icon: iconOf(AI, theirs) } });
    return;
  }
  /* 相手の側は、いま出ている人 (相手の番が始まるときに替わる。avatarTagTurn) */
  const shownOpp = st.turn === AI ? theirs : oppShownPilot;
  const mateName = avatarName(avatars && avatars.mate && avatars.mate.id) || 'PARTNER';
  const short = shortLevel(aiDifficulty);
  showPlates({
    me: mine ? { name: mateName, sub: 'PARTNER' + (short ? ' · ' + short : ''), icon: iconOf(ME, 1) } : myPlate(),
    opp: { name: oppCallName(shownOpp), sub: 'RIVAL ' + (shownOpp + 1) + (short ? ' · ' + short : ''), icon: iconOf(AI, shownOpp) }
  });
}

/* 観戦の呼び名: その側に出ているキャラの名前 (キャラなしなら A / B)。who: タッグの 0 (本人) / 1 (相棒) */
function specName(side, who = 0) {
  const nm = (id) => (id && AVATARS[id] ? AVATARS[id].name : null);
  const id = !avatars ? null : side === ME ? (who ? avatars.mate && avatars.mate.id : avatars.me && avatars.me.id) : (avatars.oppIds || [])[who];
  return nm(id) || (side === ME ? 'A' : 'B') + (who ? '2' : '');
}
/* その側のチームの呼び名 (タッグは2人を「・」でつなぐ) */
const specTeam = (side) => (spectate && spectate.mates ? specName(side, 0) + '・' + specName(side, 1) : specName(side));

/* 観戦の始まり: 名札を A (手前) / B (奥) のキャラの名前にし、ベットの中身を知らせる */
function spectateStart() {
  syncAvatar();                                          // 名前はキャラから取るので、先に出しておく
  const icon = (d) => (protoIndex[d[0]] ? { name: d[0], color: protoIndex[d[0]].color } : null);
  const bet = spectate.bet;
  const mark = (k) => (bet && bet.side === k ? 'ベット ' + bet.amount + ' CHIP' : 'CPU ' + levelLabel(spectate.level));
  showPlates({ me: { name: specName(ME), sub: mark(0), icon: icon(spectate.a) }, opp: { name: specName(AI), sub: mark(1), icon: icon(spectate.b) } });
  const team = (d, m) => d.join(' / ') + (m ? ' ＋ ' + m.join(' / ') : '');
  const mates = spectate.mates || {};
  UI.toast(bet ? 'ベット: ' + specTeam(bet.side ? AI : ME) + ' に ' + bet.amount + ' CHIP (当たれば ' + bet.payout + ')'
    : '観戦: ' + specTeam(ME) + ' ' + team(spectate.a, mates.p0) + '　' + specTeam(AI) + ' ' + team(spectate.b, mates.p1), 4200);
}
/* 観戦の決着: A / B の勝ちを見せ、ベットが当たっていれば払い戻す。次は観戦のメニューかタイトルへ */
async function spectateEnd(aWon) {
  const bet = spectate.bet;
  const hit = bet && (bet.side === 0) === aWon;
  if (hit) giveChips(bet.payout);
  sfx(hit || !bet ? 'win' : 'lose');
  await finaleFx(true);
  const winner = specTeam(aWon ? ME : AI);
  await UI.resultCutIn(true, { title: winner + ' WINS', sub: bet ? (hit ? 'BET HIT' : 'BET MISSED') : 'SPECTATE' });
  let el = document.getElementById('endBar');
  if (!el) { el = document.createElement('div'); el.id = 'endBar'; document.body.appendChild(el); }
  el.innerHTML = '<div class="end-title">' + winner + ' の勝ち</div>' +
    (bet ? '<div class="end-sub">' + (hit ? '当たり！ ' + bet.payout + ' CHIP が戻りました' : 'はずれ (' + bet.amount + ' CHIP)') + '</div>' : '') +
    '<div class="end-btns"><button class="arr-btn ok" id="endWatch" type="button">もう一度観戦</button>' +
    '<button class="arr-btn" id="endTop" type="button">TITLE</button></div>';
  el.classList.add('show');
  el.querySelector('#endWatch').onclick = () => { location.href = location.pathname + '?watch=1'; };
  el.querySelector('#endTop').onclick = goTitle;
}

function showVsTag(rm) {
  if (rm && rm.now) roomServerOffset = Date.parse(rm.now) - Date.now();
  roomTag = rm && rm.mode === 'tag' && Array.isArray(rm.seats) ? { seats: rm.seats, side: rm.side, seat: rm.seat } : null;
  /* タッグの名札は、手番が替わるたびに tagPlates が出す (ここでふつうの名札に戻さない) */
  if (roomTag && cur && cur.state && cur.state.tag) { tagPlates(cur.state); return; }
  if (rm && rm.ratedError) UI.toast('レート戦の結果を記録できませんでした。時間をおいて戦績を確かめてください', 5000);
  const el = document.getElementById('vsTag');
  if (!el || !rm || !Array.isArray(rm.names)) return;
  /* 観戦: 手前と奥の2人の名前と称号 */
  if (roomWatching) {
    /* 手札の中身は見えないので、枚数を名札に出す (手前の人の札は伏せて置くが、重なって数えにくい) */
    /* 名札の幅が狭いと後ろが切れるので、枚数を先に */
    const handOf = (k) => { const c = rm.game && rm.game.counts && rm.game.counts[k]; return c ? '手札 ' + (c.hand | 0) + '　' : ''; };
    const plate = (k) => ({ name: rm.names[k] || '?', sub: handOf(k) + ((rm.badges && TITLES[rm.badges[k]]) || (k ? 'GUEST' : 'HOST')) });
    showPlates({ me: plate(0), opp: plate(1) });
    return;
  }
  const opp = 1 - rm.side;
  const name = rm.names[opp];
  const badge = rm.badges && TITLES[rm.badges[opp]];
  setOppLook(rm.looks && rm.looks[opp]);
  const oc = rm.game && rm.game.counts && rm.game.counts[opp];
  const oppHand = oc ? '手札 ' + (oc.hand | 0) : '';
  showPlates({ me: myPlate(), opp: name ? { name, sub: [oppHand, badge].filter(Boolean).join('　'), frame: oppLook.plate, frameColor: frameColor(oppLook.plate) } : null });
}

async function roomApplyView(rm, instant) {
  if (!gameStartedAt) { gameStartedAt = Date.now(); CW.battleStarted('online'); }
  showVsTag(rm);
  /* サーバー側の状態が進んだら、進行中の待ち受けUI (盤面ピック/並べ替え/
     モーダル) は破棄して取り直す (放置すると古い req.id で答えて desync する) */
  cancelPendingAsk();
  /* 続き再生は同じルームなら常に試す。従来は「自分宛リクエスト継続中」に
     限定していたため、相手の多段解決ではポーリングのたびにアクション頭から
     フル再生され、盤面が巻き戻って見えた。安全性は traceKey の前方一致が担保 */
  const mayContinue = !!(roomRm && roomRm.code === rm.code);
  const entries = roomTracker.take(rm, mayContinue, roomValOf);
  roomRm = rm;
  const prev = cur ? shown() : null;
  const st = ROOM.buildRoomState(rm, roomValOf);
  const nq = ROOM.normRequest(rm);
  cur = { state: st, requests: nq ? [nq] : [], log: rm.log || [], trace: entries, winner: st.winner, error: null };
  syncAssist();                                  // 取り消せるか (canUndo) が変わる
  /* last_log はサーバーが直近の解決分だけ公開している。ポーリングのたびに
     同じ内容を積まないよう、ルームの版番号ごとに一度だけ表示する。 */
  if (Array.isArray(rm.log) && rm.version !== roomLoggedVersion) {
    /* 相手が1手戻した */
    if (roomLoggedVersion !== null && rm.log.some(l => /^P[12]: 1手戻した/.test(l) && !l.startsWith('P' + (rm.side + 1) + ':'))) UI.toast('相手が1手戻しました', 2400);
    UI.pushLog(rm.log);
    roomLoggedVersion = rm.version;
  }
  if (instant || !prev) {
    board.syncInstant(st);
  } else {
    busy = true;
    await replayResolution(prev, { trace: entries }, null);
    busy = false;
  }
  refreshHud();
  await afterTurn();          // roomMode 分岐: ターン告知と決着のみ
  await roomDrainRequest();
}

async function roomStep(action) {
  if (busy || !roomRm || roomWatching) return;           // 観戦は指せない
  busy = true;
  updatePads();
  try {
    /* 相手側へのプレイ (CORRUPTION 0 等) の side はローカル→座席番号へ */
    const wire = ROOM.toRoomAction(action, roomRm.side);
    const next = await ROOM.roomApi('action', { code: roomRm.code, version: roomRm.version, action: wire });
    busy = false;
    await roomApplyView(next);
  } catch (e) {
    busy = false;
    if (isRoomGone(e)) { roomClosed(); return; }
    UI.toast((e && e.message) || '通信エラー');
    await roomPoll(true);
  }
}

/* 部屋がもう無い (管理者が閉じた・時間切れで片付けられた)。サーバーは「ルームが見つかりません」を返す */
function isRoomGone(e) {
  return !!(e && /ルームが見つかりません/.test(e.message || ''));
}
let roomClosedShown = false;
function roomClosed() {
  if (roomClosedShown) return;
  roomClosedShown = true;
  stopRoomPoll();
  try { localStorage.removeItem('compileRoomLast'); } catch (e) { /* private mode */ }
  cancelPendingAsk();
  UI.setPrompt('この部屋は閉じられました', 'end');
  let el = document.getElementById('endBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'endBar';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="end-title">部屋が閉じられました</div>' +
    '<div class="end-sub">この対戦の部屋はもうありません (管理者が閉じたか、時間が経って片付けられました)。</div>' +
    '<div class="end-btns"><button class="arr-btn ok" id="endTop" type="button">TITLE</button></div>';
  el.classList.add('show');
  el.querySelector('#endTop').onclick = goTitle;
}

let roomAsking = false;
async function roomDrainRequest() {
  if (!roomMode || roomAsking) return;
  roomAsking = true;
  try {
    /* 選択に答えた直後にサーバが次のリクエストを返すことがあるため、
       尽きるまでループで処理する (roomStep 内からの再入は roomAsking が防ぐ) */
    let guard = 0;
    while (cur && cur.requests.length && shown().winner === null && guard++ < 40) {
      const req = cur.requests[0];
      UI.setPrompt('');
      const picks = await askUser(req);
      UI.setPrompt('');
      if (picks === PICK_CANCEL) continue;   // 外部更新で取り直し
      if (picks === PICK_BACK) { await roomStep({ type: 'back', id: req.id }); continue; }
      await roomStep({ type: 'choose', id: req.id, picks });
    }
  } finally {
    roomAsking = false;
  }
}

/* ポーリング: 相手の手を待つ間は速く、自分が指す番 (相手は何もできない) はゆっくり。
   次の問い合わせは前の応答が返ってから予約する (重なって飛ばない) */
let roomPollOn = false;
let roomPollFails = 0;
/* タブが表に戻ったら、すぐに問い合わせる (裏ではブラウザがタイマーを間引く) */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && roomMode && roomPollOn) roomPoll(true);
});

/* 手番の持ち時間 (サーバーの TURN_LIMIT_MS)。相手の番が長引いたら、時間切れ勝ちを主張できる */
let turnTimerId = null;
function startTurnTimer() {
  clearInterval(turnTimerId);
  turnTimerId = setInterval(updateTurnTimer, 1000);
}
function updateTurnTimer() {
  const el = document.getElementById('turnTimer');
  const rm = roomRm;
  const st = rm && shown();
  if (!el) return;
  if (!roomMode || !rm || rm.status !== 'playing' || !rm.lastActionAt || !rm.turnLimitMs || !st || st.winner !== null) { el.hidden = true; return; }
  const mine = (rm.legalActions || []).length > 0 || !!rm.request;
  const left = Math.ceil((rm.turnLimitMs - (Date.now() + roomServerOffset - Date.parse(rm.lastActionAt))) / 1000);
  const fmt = (n) => Math.floor(Math.max(0, n) / 60) + ':' + String(Math.max(0, n) % 60).padStart(2, '0');
  el.hidden = false;
  el.classList.toggle('mine', mine);
  el.classList.toggle('warn', left <= 30);
  if (!mine && left <= 0 && !roomWatching) {
    if (!el.querySelector('button')) {
      el.innerHTML = '<span>相手の持ち時間が切れました</span><button type="button">時間切れで勝ちにする</button>';
      el.querySelector('button').onclick = async () => {
        try { const next = await ROOM.roomApi('claimTimeout', { code: rm.code }); await roomApplyView(next); }
        catch (e) { UI.toast(e.message || '通信エラー'); }
      };
    }
    return;
  }
  el.textContent = (mine ? 'あなたの持ち時間 ' : '相手の持ち時間 ') + fmt(left);
}
/* 問い合わせの間隔 (サーバーの呼び出し回数 = 無料枠を節約する)。
   自分が操作する番 (手番・自分への選択待ち) は相手が盤面を変えないので 4 秒。
   相手の番は 1.3 秒から、変化のない返事が続くほど少しずつ延ばし (最大 3 秒)、変わったら戻す */
let roomPollIdle = 0;
function roomPollDelay() {
  const req = roomRm && roomRm.request;
  const mine = roomRm && (req ? req.player === roomRm.side : (roomRm.legalActions || []).length > 0);
  if (mine) return 4000;
  return roomPollIdle < 3 ? 1300 : roomPollIdle < 10 ? 2200 : 3000;
}
async function roomPollTick() {
  if (!roomPollOn) return;
  try { await roomPoll(); } finally {
    if (roomPollOn) roomPollTimer = setTimeout(roomPollTick, roomPollDelay());
  }
}
function startRoomPoll() {
  roomPollOn = true;
  startTurnTimer();
  clearTimeout(roomPollTimer);
  roomPollTimer = setTimeout(roomPollTick, 1300);
}
function stopRoomPoll() {
  roomPollOn = false;
  clearInterval(turnTimerId);
  const tt = document.getElementById('turnTimer');
  if (tt) tt.hidden = true;
  clearTimeout(roomPollTimer);
}

async function roomPoll(force) {
  if (!roomMode || !roomRm) return;
  if (busy && !force) return;
  let next;
  /* 前回の印 (stamp) を渡すと、変わっていないときは盤面を省いた「変化なし」が返る */
  try { next = await ROOM.roomApi(roomWatching ? 'watch' : 'get', { code: roomRm.code, stamp: roomRm.stamp }); } catch (e) {
    if (isRoomGone(e)) { roomClosed(); return; }
    /* 一時的な通信の失敗は次の問い合わせで取り直す。続くときは知らせる */
    if (++roomPollFails === 4) UI.toast('通信が不安定です。つながり直すまで待っています…', 4000);
    return;
  }
  if (roomPollFails >= 4) UI.toast('つながりました', 1600);
  roomPollFails = 0;
  if (next.unchanged || (next.version === roomRm.version && next.status === roomRm.status)) {
    roomPollIdle++;
    if (!next.unchanged) roomRm = next;
    await roomDrainRequest();          // 取りこぼしたリクエストの再開
    return;
  }
  roomPollIdle = 0;
  await roomApplyView(next);
}

let roomResultShown = false;
async function roomMaybeFinish() {
  const st = shown();
  if (!st || st.winner === null || roomResultShown) return;
  roomResultShown = true;
  /* 観戦: 勝った人の名前を出すだけ (経験値・戦績には入れない) */
  if (roomWatching) {
    fadeOutBgm();
    stopRoomPoll();
    const nm = (roomRm && roomRm.names && roomRm.names[st.winner]) || '?';
    UI.setPrompt(nm + ' の勝ち', 'end');
    await finaleFx(true);
    await UI.resultCutIn(true, { title: nm + ' WINS', sub: 'ONLINE MATCH' });
    showWatchEnd();
    return;
  }
  fadeOutBgm();
  CW.battleEnded(); RS.endResume();
  stopRoomPoll();
  /* 決着したので「中断した対戦に戻る」の目印を消す (終わった対戦がロビーに残っていた) */
  try { localStorage.removeItem('compileRoomLast'); } catch (e) { /* private mode */ }
  const win = st.winner === ME;
  UI.setPrompt(win ? 'あなたの勝ち' : '敗北', 'end');
  const victory = cosmetic('victory', 'default');
  sfx(win ? (victory === 'aurora' ? 'winAurora' : 'win') : 'lose');
  await finaleFx(win);
  FEEL.buzz(win ? [40, 70, 40, 70, 120] : [160]);
  await UI.resultCutIn(win, { victory });
  lastReplayId = null;
  /* 同じ部屋の同じ決着を読み直しても2回は入らない */
  const firstTime = grantXp('online', XP_GAIN.onlinePlay + (win ? XP_GAIN.onlineWin : 0),
    'room:' + (roomRm && roomRm.code) + ':' + (st.turns || 0));
  /* 遊ばれ方の匿名の記録 (同じ決着を読み直したときは送らない) */
  if (firstTime) logPlay({ mode: 'online', win, me: st.players[ME].protocols.map(p => p.name), opp: st.players[1 - ME].protocols.map(p => p.name),
    turns: (st.turns || 0) + 1, logged: !!accountState().user });
  await saveOnlineReplay(st, win, firstTime);
  if (firstTime) {
    const before = myLevel;
    refreshCardGlow();
    if (myLevel > before) await UI.levelUpCutIn(myLevel, rewardsBetween(before, myLevel));
    await afterGameProgress(st, ME, win, null, true);     // 同じ決着を読み直したときは進めない
  }
  showEndActions(win);
}

/* 降参 (CPU 戦など手元の対戦): 負けとして決着させ、ふつうの決着の流れ (戦績・リプレイ・結果の画面) に乗せる。
   オンラインは歯車の「投了してメニューに戻る」。問題・練習・チュートリアル・リプレイ・観戦では出さない */
function canSurrender() {
  const st = shown();
  return !!st && st.winner === null && !roomWatching && !puzzle && !tutorial && !trainingMode && !replayMode && !demoMode && !spectate && !reviewView;
}
async function surrenderLocal() {
  if (!await RS.askConfirm('降参しますか？ この対戦は負けになります。')) return;
  const ov = document.getElementById('settingsOv');
  if (ov) ov.classList.remove('show');
  /* オンライン: 投了を送り、その場で結果の画面へ (感想戦・リプレイを見られる。メニューへは結果の画面から) */
  if (roomMode) {
    try {
      const next = await ROOM.roomApi('action', { code: roomRm.code, version: roomRm.version, action: { type: 'surrender' } });
      cancelPendingAsk();
      removePickBar();
      await roomApplyView(next);
    } catch (e) {
      if (isRoomGone(e)) { roomClosed(); return; }
      UI.toast((e && e.message) || '投了を送れませんでした');
    }
    return;
  }
  /* 相手が指している途中なら、その手が終わるのを待ってから */
  for (let i = 0; i < 100 && busy; i++) await TW.wait(100);
  if (!canSurrender() || busy) return;
  /* 自分の選択を待っている途中なら、その画面を閉じる。閉じた選択の待ちは、続けて呼ぶ step が盤面を
     (同期のうちに) 決着に替えるので、聞き直さずに抜ける */
  cancelPendingAsk();
  removePickBar();
  await step({ type: 'surrender', player: ME });
}

/* オンラインのリプレイ: 決着したらサーバーから始めの条件と手の列をもらって残す (1対1だけ)。
   後攻の部屋 (ゲスト) の人は view 1 で、盤面を入れ替えて自分を手前にして見る */
let onlineReview = null;           // オンラインの感想戦: { history, final } (棋譜から作り直したもの)
async function saveOnlineReplay(st, win, firstTime) {
  onlineReview = null;
  if (!roomRm || roomRm.mode === 'tag' || roomWatching) return;
  try {
    const r = await ROOM.roomApi('replay', { code: roomRm.code });
    if (!r || !r.init || !Array.isArray(r.actions)) return;
    const view = r.side === 1 ? 1 : 0;
    const rep = { me: view ? r.init.p1 : r.init.p0, opp: view ? r.init.p0 : r.init.p1, win, level: 2, kind: 'online', view,
      oppName: (roomRm.names && roomRm.names[1 - view]) || '', turns: (st.turns || 0) + 1, init: r.init, actions: r.actions };
    try {
      const built = rebuild(Engine, rep);
      if (built.ok && built.history.length) onlineReview = { history: built.history, final: built.final };
    } catch (e) { onlineReview = null; }
    /* 同じ決着を読み直したとき (部屋に入り直した等) は、リプレイを2つ残さない */
    if (!firstTime) return;
    lastReplayId = addReplay(rep);
    uploadReplay({ ...rep, at: Date.now(), mode: 'online' });
  } catch (e) { /* 残せなくても対戦の結果には響かない */ }
}

/* 観戦の決着のあと: タイトルへ戻るボタン */
function showWatchEnd() {
  let el = document.getElementById('watchEnd');
  if (!el) {
    el = document.createElement('div');
    el.id = 'watchEnd';
    el.style.cssText = 'position:fixed;right:14px;bottom:calc(64px + env(safe-area-inset-bottom));z-index:45;';
    el.innerHTML = '<button class="btn" type="button">タイトルへ</button>';
    el.querySelector('button').onclick = () => { location.href = location.pathname; };
    document.body.appendChild(el);
  }
}

/* ロビーから playing の publicState を受けて対戦開始 */
async function roomEnterGame(rm) {
  document.body.classList.add('room');
  roomMode = true;
  playBattleBgm();                       // roomMode を立ててから (オンラインの曲の選び方にする)
  roomResultShown = false;
  lastTurn = null;
  roomLoggedVersion = null;
  roomTracker = ROOM.createTraceTracker();
  await roomApplyView(rm, true);
  if (avatars) { for (const k of ['me', 'mate', 'opp']) if (avatars[k]) avatars[k].destroy(); avatars = null; }
  syncAvatar();                                          // 相手 (観戦は2人) が着けているキャラで出し直す
  await stage.home(600);
  placeDialogsNearBoard();
  startRoomPoll();
}

/* ---------- ターン / 効果の演出 ---------- */
let lastTurn = null;
let resultShown = false;
let gameStartedAt = 0;             // 対戦を始めた時刻 (手触りの演出を、はじめの盤面合わせで出さないため)

/* 決着の合図: 3ライン同時に光柱を立てて盤面を白く飛ばす */
async function finaleFx(win) {
  const accent = win ? COLOR.mint : COLOR.pink;
  /* 盤面中央を大きく回り込みながら締める */
  stage.cinematicHold(new THREE.Vector3(0, 0, 0), 3400, { radius: 5.2, height: 2.6, sweep: 1.5 });
  for (let i = 0; i < 3; i++) {
    FX.compilePillar(stage.scene, BOARD.laneX[i], accent, 1800);
  }
  FX.shockwave(stage.scene, new THREE.Vector3(0, 0, 0), accent, 9, 1200);
  FX.screenFlash(stage, win ? 0xffffff : 0xff4fa3, 760, 0.92);
  stage.shake(0.3, 900);
  await TW.wait(320);
}

async function announceTurnFor(turn, atState) {
  if (trainingMode) return;                         // 検証盤面に手番はない
  if (turn === undefined || turn === null || turn === lastTurn) return;
  lastTurn = turn;
  /* 前の手番の効果の帯が残っていると、効果がまだ終わっていないように見えるのでしまう */
  UI.hideFxBanner();
  UI.hideChain();
  if (arena && arena.setTurnSide) arena.setTurnSide(turn);
  setTurnPlate(turn === ME ? 'me' : 'opp');
  handForTurn(turn);
  /* 自分の番が回ってきたときは、相手の番とは別の音で知らせる */
  sfx(turn === ME && !partnerMove() ? 'yourTurn' : 'turn');
  /* タッグ: だれの番かを名札とカットインで。自分の側でも味方が指す番は PARTNER TURN */
  /* 名札とカットインは、手番が替わった時点の盤面で (再生の途中は cur がもう先へ進んでいる) */
  const tagSt = atState || (cur && cur.state);
  if ((tagMates || roomTag) && tagSt && tagSt.tag) {
    tagPlates(tagSt);
    if (tagMates) avatarTagTurn(tagSt, turn === AI);
    tagPlates(tagSt);
    const pilot = tagSt.tag.pilot[turn];
    const mine = tagSt.tag.online ? tagSt.tag.mine : 0;
    /* 観戦は「YOUR / PARTNER / RIVAL」ではなく、指すキャラの名前で */
    await UI.turnCutIn(turn === ME, spectate ? specName(turn, pilot) + ' TURN'
      : turn === ME ? (pilot === mine ? 'YOUR TURN' : 'PARTNER TURN') : (tagSt.tag.online ? 'RIVAL ' + (pilot + 1) : oppCallName(pilot)) + ' TURN');
  } else await UI.turnCutIn(turn === ME, spectate ? specName(turn) + ' TURN' : undefined);
  /* 番を終えた側が劣勢なら、ひとこと (タッグフォースの「ターンエンド……」)。番が来た側は、優勢なら強気に、ふだんはいつものひとこと */
  const standSt = tagSt || (cur && cur.state);
  /* 番が来た側が、このままコンパイルすれば決着する (勝ちが決まるラインが 10 以上で相手を上回っている):
     来た側は「勝ち確」、終えた側は「負け確」のひとこと。そうでなければ、いつもの優勢・劣勢・自分の番 */
  if (decidingLine(standSt, turn)) {
    avatarSay(1 - turn, 'doomed', null, standSt);
    avatarSay(turn, 'sure', null, tagSt);
  } else {
    if (standingOf(standSt, 1 - turn) < 0) avatarSay(1 - turn, 'behind', null, standSt, 20000, 0.7);
    avatarSay(turn, standingOf(standSt, turn) > 0 && Math.random() < 0.7 ? 'lead' : 'turn', null, tagSt);
  }
  /* はじめの数戦だけ、自分の番に何をすればいいかを添える */
  if (turn === ME && !roomMode && !tutorial && !puzzle && !demoMode && !replayMode && localRecords().length < 3 && !firstGameHintShown) {
    firstGameHintShown = true;
    UI.toast('手札のカードを選んで、光っている列に置きます。表向き = 効果が出る・裏向き = 値2。列の合計が10以上で相手より大きいとコンパイル', 6500);
  }
}

async function announceTurn() {
  const st = shown();
  if (!st || st.winner !== null) return;
  await announceTurnFor(st.turn, st);
}

/* フェイズの開始を、そのフェイズの演出より先に見せる。
   コンパイルは相手の手番の直後ではなく「自分のターンのコンパイル確認」で
   起きるので、ターン交代とフェイズを再生の途中に差し込まないと、
   相手のターンの出来事のように見えてしまう。 */
let lastPhaseTag = '';
async function markPhase(st) {
  if (!st || st.winner !== null || trainingMode) return;
  await announceTurnFor(st.turn, st);
  const phase = st.phase;
  /* アクションは盤面の操作そのもので分かるので帯を出さない */
  if (!phase || phase === 'action' || phase === 'finished') return;
  const tag = st.turn + ':' + phase;
  if (tag === lastPhaseTag) return;
  lastPhaseTag = tag;
  UI.showPhase(phase, st.turn === ME);
  await TW.wait(240);
}

/* -------------------------------------------------------------------------
 * 効果解決のステップ再生
 *   engine の trace には各ログ時点の状態スナップショットが入っている。
 *   絵が変わるステップだけを拾って順に流すと、
 *   「反転 → 移動 → 削除」が一息に飛ばず、1つずつ見えるようになる。
 * ------------------------------------------------------------------------- */
const MAX_STEPS = 14;          // 長い連鎖はここで打ち切って最終状態へ飛ばす
/* チェーン表示の間 (ms): 割り込んで積まれたとき / 1つ解決したとき */
const CHAIN_HOLD = { add: 1500, resolve: 1000, each: 1000 };
/* 効果の解決を1コマずつ見せるときの、1コマの最短の長さ (ms、「ふつう」の速さで)。
   同じカードが続けて動くなら目はそのまま追えるが、別の場所へ移ると
   目を移して何が起きたか分かるまでに約1秒かかる */
const STEP_PACE = { same: 500, moved: 1000 };
/* 解決中のカードの動きの長さ (TIMING に掛ける倍率。大きいほどゆっくり) */
const STEP_MOTION = 1.25;
/* 効果の帯 (発動した段の文章) を出しておく長さ。20字前後を読み切れる長さ */
const FX_BANNER_MS = 3200;
/* 観戦 (CPU どうし) で文章を読む間。動き (カードが飛ぶ・着地する) の速さは変えず、読むところだけ待つ。
   文字数に応じて 1.5〜4.5 秒 (設定の「演出の速さ」で縮む)。動画に撮っても読めるように */
const READ = { base: 900, perChar: 55, min: 1500, max: 4500 };
function readMs(text) {
  const n = Array.from(String(text || '')).length;
  return Math.max(READ.min, Math.min(READ.max, READ.base + n * READ.perChar)) / settings().speed;
}
async function holdStep(t0, target) {
  const spent = (performance.now() - t0) * settings().speed;
  if (spent < target) await TW.wait(target - spent);
}
/* 設定で「一時停止する」をオフにしたら待たない */
function chainPause(kind) {
  return settings().pauses ? TW.wait(CHAIN_HOLD[kind]) : Promise.resolve();
}

/* 再生するコマの切り出しは steps.js (盤面の見た目の指紋は board.js のものを使う) */
function meaningfulSteps(prev, res) { return cutSteps(prev, res, visualFingerprint); }

/* このコマで解決している効果のカード (チェーンの一番内側)。効果の元から対象へ光をつなぐのに使う */
function effectSource(step) {
  const ch = step && Array.isArray(step.chain) ? step.chain : null;
  if (!ch || !ch.length) return null;
  const x = ch[ch.length - 1];
  return x.slice(0, x.lastIndexOf('|'));
}

/* そのステップの主役カードを光らせ、効果テキストを出す */
async function cueFor(step, st) {
  const cue = step.cue || step;
  const uid = cue.uid || step.uid;
  if (!uid) return;
  const card = st.cards[uid];
  const def = card && defIndex[card.def];
  if (!def) return;
  /* 見る権利のないカード (相手の裏向きプレイ等) の正体をカットインで
     晒さない。演出はパルスだけに留める */
  const visible = card.faceUp || ((card.knownTo || 0) & (1 << ME));
  if (!visible) { await board.pulse(uid, def.color, 380); return; }
  /* trace のメッセージからどの段が発動したかを読み取る */
  const msg = cue.msg || step.msg || '';
  let zone = null;
  if (msg.indexOf('中段') >= 0) zone = 'middle';
  else if (msg.indexOf('上段') >= 0) zone = 'upper';
  else if (msg.indexOf('下段') >= 0) zone = 'lower';
  /* 効果が発動したとき (どの段かが分かるとき) だけ、右上に発動の帯を滑り込ませる (マスターデュエル風)。
     プレイや削除などの手では出さない (裏向きでプレイした札が「発動」に見えてしまう)。
     左上の詳細パネルは触ったカードのまま替えない */
  if (zone && card.faceUp && def[zone]) {
    UI.showFxBanner({
      name: def.proto + ' ' + def.value, color: def.color,
      zone, text: def[zone], mine: card.owner === ME,
      who: spectate ? specName(card.owner) : null          // 観戦は「あなた / 相手」ではなく、キャラの名前
    }, Math.max(FX_BANNER_MS / settings().speed, demoMode ? readMs(def[zone]) + 400 : 0));
    /* 観戦: 発動した効果の文を読み切れるまで待つ */
    if (demoMode) await Promise.all([board.pulse(uid, def.color, 380), TW.wait(readMs(def[zone]))]);
    else await board.pulse(uid, def.color, 380);
    return;
  }
  await board.pulse(uid, def.color, 380);
}

/* 損しかない効果 (自分の手札を捨てるだけ) のカード。これにつながってもキャラは喜ばない */
const demeritDefs = new Set();
function markDemerits(effects, runEngine) {
  const selfDiscardOnly = (eff) => {
    const secs = Object.values(eff || {}).filter(s => s && Array.isArray(s.ops) && s.ops.length);
    return secs.length > 0 && secs.every(s => s.ops.every(o => o.op === 'discard' && o.player !== 'opp'));
  };
  for (const [id, eff] of Object.entries(effects || {})) if (selfDiscardOnly(eff)) demeritDefs.add(id);
  for (const d of runEngine || []) {
    if (selfDiscardOnly(d.eff)) demeritDefs.add(d.id); else demeritDefs.delete(d.id);
  }
}

/* チェーン表示: 記録に残った「処理中の効果の並び」を、カード名と絵にする。
   カードを出す手では、出したカードの処理中 (まだアクションフェイズ) なら1番に置く。
   相手の裏向きなど、見る権利のないカードは名前を伏せる */
function chainLinksAt(t, action) {
  if (!t || !Array.isArray(t.chain)) return [];
  const st = t.st;
  const links = t.chain.map((x) => { const i = x.lastIndexOf('|'); return { uid: x.slice(0, i), zone: x.slice(i + 1) }; });
  const playing = action && action.card && (action.type === 'play' || action.type === 'trainingPlace');
  if (playing && st && (st.phase === 'action' || st.phase === 'training')
      && (!links.length || links[0].uid !== action.card)) {
    links.unshift({ uid: action.card, zone: 'play' });
  }
  /* 同じカードが続けて並ぶのはチェーンではない */
  const out = [];
  for (const k of links) if (!out.length || out[out.length - 1].uid !== k.uid) out.push(k);
  return out.map((k) => {
    const c = st && st.cards[k.uid];
    const d = c && defIndex[c.def];
    const visible = d && (c.faceUp || ((c.knownTo || 0) & (1 << ME)) || k.zone !== 'play');
    return visible
      ? { uid: k.uid, def: c.def, img: faceImageURL(d), name: d.proto + ' ' + d.value, zone: k.zone, color: d.color }
      : { uid: k.uid, img: null, name: '裏向きのカード', zone: k.zone, color: '#8fa8c8' };
  });
}

/* ログは演出の進みに合わせて1行ずつ書き足す (手の解決が終わるまで待たない)。
   ログの行は、途中経過 (trace) のうち文のあるコマと順番どおりに対応している。
   選択を挟むとエンジンは手を頭から再実行した記録を返すので、書き足し済みの行と先頭から比べて新しい行だけ足す */
let logShown = [];
const logText = (l) => (typeof l === 'string' ? l : (l && l.msg) || '');
function logUpTo(res, traceIdx) {
  const lines = res.log || [];
  let target = lines.length;
  if (Number.isFinite(traceIdx) && Array.isArray(res.trace)) {
    let n = 0;
    for (let i = 0; i <= traceIdx && i < res.trace.length; i++) if (res.trace[i] && res.trace[i].msg) n++;
    target = Math.min(n, lines.length);
  }
  let same = 0;
  while (same < logShown.length && same < lines.length && logText(logShown[same]) === logText(lines[same])) same++;
  if (target > same) UI.pushLog(lines.slice(same, target));
  logShown = lines.slice(0, Math.max(target, same));
}

/* 1手の解決 (チェーンを含む) で、各ラインの合計がどれだけ動いたか。解き終えたら赤/明るい数字でまとめて出す。
   選択を挟んで再生が分かれても、最初の再生の前の盤面から数える */
let netDelta = null;
function netDeltaBegin(st) {
  /* 途中で止まったまま (エラー等) 古い記録が残っていたら捨てる */
  if (netDelta && Date.now() - netDelta.at > 90000) netDelta = null;
  if (netDelta || !st || !st.lines) return;
  netDelta = { base: [0, 1, 2].map(l => [0, 1].map(s => totalOf(st, l, s))), at: Date.now() };
}
function netDeltaShow(st) {
  const d = netDelta;
  netDelta = null;
  if (!d || !st || !st.lines || !panels) return;
  /* コンパイルで空になったラインの減りは出さない (コンパイルの演出がある) */
  const compiled = avatarCompileAt >= d.at;
  let k = 0;
  for (let l = 0; l < 3; l++) {
    for (let s = 0; s < 2; s++) {
      const delta = totalOf(st, l, s) - d.base[l][s];
      if (!delta || Math.abs(delta) > 30) continue;
      if (compiled && delta < 0 && !st.lines[l][0].length && !st.lines[l][1].length) continue;
      const p = panels.panels.find(q => q.line === l && q.side === s);
      if (!p) continue;
      const pos = new THREE.Vector3();
      p.group.getWorldPosition(pos);
      const color = p.info && p.info.color;
      /* 1手で 6 以上動いたら、特別な演出 (光の輪・大きな数字・音。減ったときは揺れも) */
      const swing = Math.abs(delta) >= 6;
      setTimeout(() => {
        if (!swing) { FEEL.floatDelta(stage, pos, delta, color); return; }
        FEEL.bigSwing(stage, pos, delta, color);
        const calmMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!calmMotion) FX.shockwave(stage.scene, pos, delta > 0 ? 0xffd86a : 0xff3b6b, 2.8, 900);
        sfx(delta > 0 ? 'charge' : 'boom');
        if (delta < 0 && !calmMotion) stage.shake(0.12, 380);
      }, k++ * 140);
    }
  }
}

async function replayResolution(prev, res, action) {
  const steps = meaningfulSteps(prev, res);
  netDeltaBegin(prev);
  /* オンラインは版ごとに届いたログをまとめて出す (roomApplyView) */
  const liveLog = !roomMode && Array.isArray(res.log);
  const logStep = (step) => { if (liveLog && step.tr) logUpTo(res, res.trace.indexOf(step.tr)); };
  const final = shown();
  UI.hideChain();
  /* この解決の間に走った「効果の元 → 対象」の光は、薄い筋として残して順番を付ける */
  board.beginTrail();

  /* ステップが多すぎるときは間引いて、テンポを保つ */
  window.__lastSteps = steps.length;
  const chainLen = (c) => (Array.isArray(c) ? c.length : 0);
  const use = steps.length > MAX_STEPS
    ? steps.filter((s, i) => i % Math.ceil(steps.length / MAX_STEPS) === 0
      /* チェーンが積まれる・解決するコマは残す (飛ばすと何が起きたか分からない) */
      || chainLen(s.chain) !== chainLen(i > 0 ? steps[i - 1].chain : null)
      || chainLen(s.cue && s.cue.chain) > 0
      || (s.acts && s.acts.length > 0))
    : steps;
  /* この解決で発動した効果の数。2つ以上なら、1つずつ間をあけて見せる */
  const actCount = use.reduce((n, s) => n + ((s.acts && s.acts.length) || 0), 0);
  /* 次に発動する効果を1つずつ見せる。割り込み (チェーンが伸びる) なら、積んだところで長めに止める */
  const showActs = async (step) => {
    for (const cue of step.acts) {
      const grew = cue.chain ? showChainNow(cue.chain, step.st) > 0 : false;
      await cueFor({ cue }, step.st);
      if (grew) await chainPause('add');
      else if (actCount > 1) await chainPause('each');
    }
  };
  /* いま出しているチェーンの長さ。伸びたら (割り込み) 止めて積んだところを見せ、
     縮んだら (1つ解決) 少し待ってから次へ進む */
  let chainShown = 0;
  const showChainNow = (chain, st) => {
    const links = Array.isArray(chain) ? chainLinksAt({ chain, st }, action) : [];
    UI.showChain(links);
    const n = links.length >= 2 ? links.length : 0;
    const delta = n - chainShown;
    chainShown = n;
    if (delta > 0) {                                     // チェーンがつながった
      sfx('chain', n);
      /* 喜ぶのは、自分のカードから始まって自分のカードの効果がつながったときだけ。
         相手の効果で自分のカードが動かされたとき・相手のカードの効果・損しかない効果 (手札を捨てるだけ) では喜ばない */
      const cardOf = (k) => (k && st && st.cards && st.cards[k.uid]) || null;
      const root = cardOf(links[0]), last = cardOf(links[links.length - 1]);
      if (root && last && root.owner === ME && last.owner === ME && !demeritDefs.has(last.def) && st && st.turn === ME) {
        avatarSay(ME, 'chain', null, st, 7000);
      }
    }
    return delta;
  };

  let from = prev;
  let first = true;
  let lastUid = null;
  for (const step of use) {
    /* フェイズだけが進むコマは、絵が同じなので合図を出して次へ進む。
       この形なら「開始フェイズ → 開始効果」の順に見える。 */
    logStep(step);
    if (step.phaseOnly) {
      /* 間引きで飛ばしたコマ (効果の結果) がまだ盤面に出ていなければ、手番やフェイズを告げる前に盤面を追いつかせる。
         追いつかせないと、効果の結果が出る前に「相手のターン」の演出が出ていた */
      if (visualFingerprint(from) !== step.fp) {
        avatarActor = actorOf(step, from);
        avatarTurn = from.turn;
        await board.applyTransition(from, step.st, first ? action : null, { speed: STEP_MOTION, source: effectSource(step) });
        avatarHandesCheck(from, step.st, avatarActor, effectCardOf(step, from));
        avatarOwnCheck(from, step.st, effectCardOf(step, from));
        await syncPanels(step.st, true);
        from = step.st;
        first = false;
      }
      await markPhase(step.st);
      await checkAnnounce(step.st);
      if (step.acts && step.acts.length) await showActs(step);
      continue;
    }
    /* 絵が動くコマは、動かしてから合図を出す。
       1コマの中で「カードの着地」と「手番交代」が同時に起きることがあり、
       先に告知すると、相手のターンになってからカードが積まれて見えた。 */
    const t0 = performance.now();
    const uid = step.uid || (step.cue && step.cue.uid) || null;
    /* チェーンの途中は動きもさらにゆっくり見せる */
    avatarActor = actorOf(step, from);
    avatarTurn = from.turn;
    await board.applyTransition(from, step.st, first ? action : null,
      { speed: chainShown ? STEP_MOTION * 1.3 : STEP_MOTION, source: effectSource(step) });
    avatarHandesCheck(from, step.st, avatarActor, effectCardOf(step, from));
    avatarOwnCheck(from, step.st, effectCardOf(step, from));
    /* プロトコル板 (並び・合計値) もこのコマに合わせる。並べ替えは板が動き終わるまで待つ */
    await syncPanels(step.st, true);
    /* この絵の時点のチェーン。1つ解決して短くなったら、解決したことが分かるよう少し待つ */
    if (showChainNow(step.chain, step.st) < 0) await chainPause('resolve');
    if (step.acts && step.acts.length) await showActs(step);
    else await cueFor(step, step.st);
    /* 次のコマへ進む前に、このコマを追えるだけの間を取る */
    await holdStep(t0, uid && uid === lastUid ? STEP_PACE.same : STEP_PACE.moved);
    lastUid = uid;
    await markPhase(step.st);
    await checkAnnounce(step.st);
    await checkRevealed(step.st);                 // 公開されたカードは、見終わる (閉じる) まで次のコマへ進まない
    from = step.st;
    first = false;
  }
  avatarActor = null;                // 再生が終わったら、動かした側の覚えを捨てる
  avatarTurn = null;
  /* 残りの行 (間引いたコマの分) を書き足す。手を解決し終えたら、次の手のために覚えを捨てる */
  if (liveLog) {
    logUpTo(res, Infinity);
    if (!res.requests || !res.requests.length) logShown = [];
  }
  /* 選択の途中で止まっているなら、どの効果の途中かを残したまま聞く */
  const lastTr = res.trace && res.trace.length ? res.trace[res.trace.length - 1] : null;
  if (res.requests && res.requests.length) UI.showChain(chainLinksAt(lastTr, action));
  else UI.hideChain();
  /* 最後は必ず本物の状態へ合わせる */
  await board.applyTransition(from, final, first ? action : null, first ? null : { speed: STEP_MOTION });
  board.endTrail();
  await syncPanels(final, true);
  /* 増減のまとめは、効果を解き終えたところで出す。手札の上限で捨てる選択 (キャッシュのクリア) は効果ではないので、
     その前に出す (捨てたあとに出すと、捨てたせいでラインが減ったように見えた) */
  const pendingReq = res.requests && res.requests[0];
  if (!pendingReq || pendingReq.prompt === 'clear-cache') netDeltaShow(final);
  /* 盤面が最終形になってから、そこまでに進んだ手番/フェイズを告げる */
  await markPhase(final);
  await checkRevealed(final);
}

/* CPU (相手・タッグの味方・観戦の両側) がコントロールを使ったときの告知。choice: 0 自分の並べ替え / 1 相手の並べ替え / 2 並べ替えない */
async function announceControl(req, choice) {
  const side = req.player;
  const who = spectate ? specName(side) : side === ME ? '味方' : '相手';
  const value = choice === 0 ? '自分のプロトコルを並べ替え' : choice === 1 ? (spectate ? specName(1 - side) : side === ME ? '相手' : 'あなた') + 'のプロトコルを並べ替え' : '並べ替えなし';
  await UI.declareCutIn({ label: who + 'のコントロール', value, tone: 'call', small: true, hold: 1800, note: req.controlReason === 'refresh' ? 'リフレッシュ' : 'コンパイル' });
}

/* 対戦の格: 'boss' (勝ち抜き戦の BOSS・週替わりの BOSS・CHALLENGE の最強・下剋上) / 'strong' (勝ち抜き戦の精鋭・CHALLENGE のロック特化と挑戦者) / null */
function battleTier() {
  if (demoMode || roomMode || tutorial || puzzle || trainingMode) return null;
  if (storyNode) return storyNode.boss ? 'boss' : null;
  if (runMode && runKind === 'run') {
    const run = loadRun();
    const node = run && nodeById(run, run.pos);
    return node && node.type === 'boss' ? 'boss' : node && node.type === 'elite' ? 'strong' : null;
  }
  if (runMode && runKind === 'weekly') return (loadStoredWeekly().stage | 0) === 2 ? 'boss' : null;
  if (aiDifficulty === 3 || aiDifficulty === UNDERDOG_LEVEL) return 'boss';
  return aiDifficulty >= 3 ? 'strong' : null;
}
/* 落ちたときの手がかり (crashwatch): 覚えているカードの絵の数 f、描画が持っている絵 t・形 g・シェーダー p、画質の段 L。
   コンパイルのたびに数が増えていれば、捨て忘れ (漏れ) がある */
function memNote() {
  try {
    const i = stage.renderer.info;
    return 'f' + faceCacheSize() + ' t' + i.memory.textures + ' g' + i.memory.geometries + ' p' + ((i.programs && i.programs.length) | 0) + ' L' + stage.gfx().level;
  } catch (e) { return 'f' + faceCacheSize(); }
}
/* そのラインに、その側のカードが何枚積まれているか (いま画面に出ている盤面で) */
function stackCount(line, side) {
  const st = shown();
  return st && st.lines && st.lines[line] && st.lines[line][side] ? st.lines[line][side].length : 0;
}
/* 対戦の BGM: ボスと強敵は専用の曲。ふつうの対戦は4曲からランダム (COLLECTION の BGM を出したら選んだ曲) */
function battleBgm() {
  if (roomMode) return onlineBattleBgm();      // オンラインは毎回ランダム (同じ曲ばかり流れないように)
  const tier = battleTier();
  if (tier === 'boss') return BOSS_BGM;
  if (tier === 'strong') return STRONG_BGM;
  return BGM_RELEASED ? (settings().bgm || normalBattleBgm()) : normalBattleBgm();
}
/* 対戦の曲を流す。表記の要る曲 (煉獄庭園・魔王魂・Senses Circuit など) は、流れている画面に曲名と表記を小さく出す */
function playBattleBgm() {
  const key = battleBgm();
  playBgm(key);
  const t = trackOf(key);
  if (t && t.credit) setTimeout(() => UI.toast('♪ ' + t.title + ' — ' + t.credit, 2600), 2400);
}

/* ---------- 進行 ---------- */
let refreshSayFor = null;          // リフレッシュのひとことを、並べ替えの選択のあとまで待たせている { side, st } (null なら待っていない)
async function step(action) {
  if (roomMode) { await roomStep(action); return; }
  if (busy) return;
  busy = true;
  if (tutorial) tutorialPending = true;
  updatePads();
  const prev = shown();
  const before = cur.state;
  /* いま答えた選択 (効果が働いたときのひとことに使う。avatarOwnAnswered) */
  const answered = action.type === 'choose' && cur.requests ? cur.requests.find(q => q.id === action.id) || null : null;
  /* 観戦: 表で出すカードは、出す前に左の詳細に出して読む間を取る (文章の長さに合わせて) */
  if (demoMode && action.type === 'play' && action.faceUp) {
    const pc = before.cards[action.card];
    const pd = pc && defIndex[pc.def];
    if (pd) {
      UI.showCardPanel(defDetail(pd));
      await TW.wait(readMs([pd.upper, pd.middle, pd.lower].filter(Boolean).join('')));
    }
  }
  const res = Engine.apply(cur.state, action);
  if (res.error) {
    UI.toast(res.error);
    /* 画面は打てる手しか出さないので、ここに来るのはエンジンか画面の食い違い */
    reportError('エンジンが手を受け付けない: ' + res.error + ' (' + action.type + ')', 'step');
    busy = false;
    tutorialPending = false;
    return;
  }
  const topLevel = action.type === 'play' || action.type === 'refresh';
  CW.battleProgress(res.state.turns | 0);
  /* 自分で表向きに出したカード: キャラがひとこと */
  if (action.type === 'play' && action.faceUp) {
    /* 表で出したカードは出した時点で公開。出す前の盤面では相手の手札 (見えない) なので、出したあとの盤面から名前を取る */
    const pc = res.state.cards[action.card];
    const pd = pc && defIndex[pc.def];
    avatarSay(before.turn, 'play', { card: pd ? pd.proto + ' ' + pd.value : 'カード' }, before);
    /* 相手が表で出したら、こちらがときどき反応する (少し遅れて) */
    /* その手で自分のラインを減らされた側は、感心しない (「いい手だね」ではなく、やられた方のひとことに任せる) */
    const watcher = 1 - before.turn;
    const lostSome = [0, 1, 2].some(l => totalOf(res.state, l, watcher) < totalOf(before, l, watcher));
    if (!lostSome) setTimeout(() => avatarSay(watcher, 'watch', null, null, 9000, 0.35), 1400);
  } else if (action.type === 'play') avatarSay(before.turn, 'down', null, before, 6000, 0.6);
  /* リフレッシュのひとこと。コントロールを持っているときは、先に並べ替え (その選択) があって、そのあとに引く。
     前はリフレッシュを押した時点で「補充」のひとことを言い、並べ替えのひとことがあとに続いて、順番が逆だった。
     選択が残っているなら覚えておき、引き終わったあとに言う */
  else if (action.type === 'refresh') {
    if (res.requests && res.requests.length) refreshSayFor = { side: before.turn, st: before };   // st: タッグで、押した人が言うように
    else avatarSay(before.turn, 'refresh', null, before, 6000);
  }
  /* 待たせたひとことは、選択を解き終えたところ (drainRequests) で言う。次の手が始まったら古いので捨てる */
  if (action.type === 'play') refreshSayFor = null;
  /* 戻り先は人が指した手だけ (タッグの味方 = CPU の手を戻り先にすると、戻したあと誰も指さずに止まっていた) */
  if (topLevel && assistGame() && before.turn === ME && !partnerMove(before) && !autoFor(ME)) {
    undoPoint = { cur, replayLen: replayLog ? replayLog.actions.length : 0, resumeLen: RS.resumeLength(), histLen: gameHistory.length };
  }
  if (topLevel && !demoMode && !trainingMode && !tutorial && !puzzle && before.turn === AI) {
    if (!oppTurn) oppTurn = { start: before, lines: [] };
    oppTurn.lines.push(describeAction(action, before, true));
  }
  if (!trainingMode && !demoMode && topLevel) {
    gameHistory.push({ st: before, action });
  }
  logAction(action);
  cur = res;
  syncAssist();
  await replayResolution(prev, res, action);
  avatarOwnAnswered(prev, shown(), answered);
  refreshHud();
  busy = false;
  syncAssist();
  await drainRequests();
  await afterTurn();
}

/* 選択要求を処理し切る */
/* 選択リクエストをユーザーに聞く。盤面の直接タップを優先し、
   使えない状況ではモーダルにフォールバックする */
async function askUser(req) {
  if (!tutorial) return askUserInner(req);
  tutorialAsk = req.prompt || req.kind;
  coachUpdate(true);
  try { return await askUserInner(req); }
  finally { tutorialAsk = null; coachUpdate(); }
}

async function askUserInner(req) {
  if (req.kind === 'arrange' && Array.isArray(req.current) && req.current.length === 3) {
    for (let hop = 0; hop < 10; hop++) {
      const picks = await arrangeOnBoard(req);
      if (picks === PICK_CANCEL) return PICK_CANCEL;
      if (picks) return picks;
      const m = await UI.askChoice(req, choiceCtx());
      if (m !== '__board__') return m;      // 「盤面で選ぶに戻る」でループ
    }
  }
  /* デッキ検索の候補は盤面にも手札にも無く、オンラインでは中身も届かない。
     要求に添えられた defs からカードの絵を並べて選ばせる。 */
  if (req.kind === 'pickCard' && Array.isArray(req.defs)
      && req.defs.length === (req.candidates || []).length) {
    const items = req.candidates.map((uid, i) => {
      const d = defIndex[req.defs[i]];
      return d ? { img: faceImageURL(d), label: d.proto + ' ' + d.value, value: uid } : null;
    });
    if (items.every(Boolean)) {
      const picks = await UI.pickFaces(items, {
        title: (req.context ? cardName(req.context) + ': ' : '') + '手札に加えるカードを選ぶ',
        optional: (req.min === undefined ? 1 : req.min) === 0
      });
      if (picks === PICK_CANCEL) return PICK_CANCEL;
      if (picks) return picks;
    }
  }
  if (req.kind === 'pickCard' || req.kind === 'pickHand' || req.kind === 'pickLine' || req.kind === 'yesNo'
      || (req.kind === 'option' && req.prompt === 'play-dest')) {
    const picks = await pickOnBoard(req);
    if (picks === PICK_CANCEL) return PICK_CANCEL;
    if (picks) return picks;
  }
  showSourcePanel(req);
  try { return await UI.askChoice(req, choiceCtx()); } finally { pickPanelReq = null; }
}

/* 対象選択を盤面の直接タップで行う。
   候補が盤面/手札のカードそのものなら、モーダルを出さずに
   候補をハイライトしてタップで選ばせる。null ならモーダルへ */
let boardPick = null;
const PICK_CANCEL = '__pickCancel__';   // 外部要因 (ポーリング等) による中断
const PICK_BACK = '__pickBack__';       // 効果の一段前の選択へ戻る
const PICK_SKIP = '__pickSkip__';       // 「〜してもよい」をまとめた選択で「しない」を選んだ

/* 「〜してもよい」(はい/いいえ) のあとに盤面の選択が続く効果は、はい/いいえを聞かずに、いきなり盤面の選択に入る。
   対象を選べば「はい」、帯の「しない」で「いいえ」。「はい」を手元で試しに進めて、次の問いを見て決める
   (CPU 戦だけ。エンジンが手元にあるので当て直しても同じ結果になる。オンラインは相手の情報が無いので試せない) */
let pickSkip = false;                   // いま出している盤面の選択に「しない」を付けるか
let queuedAnswer = null;                // 「はい」のあとに自動で答える選択 { id, picks }
function mergedYesTarget(req) {
  if (roomMode || tutorial || trainingMode || req.kind !== 'yesNo' || req.player !== ME) return null;
  let spec;
  try { spec = withoutTrace(() => Engine.apply(cur.state, { type: 'choose', id: req.id, picks: ['yes'] })); } catch (e) { return null; }
  if (!spec || spec.error || !Array.isArray(spec.requests) || !spec.requests.length) return null;
  const nx = spec.requests[0];
  if (nx.player !== ME) return null;
  const st = shown();
  if (nx.kind === 'pickLine' && Array.isArray(nx.lines) && nx.lines.length) return nx;
  /* 手札から捨てる・渡す (してもよい) も、手札の選択にまとめる。手札は「はい」の前後で変わらない */
  if (nx.kind === 'pickHand' && (nx.min === undefined || nx.min >= 1) && Array.isArray(nx.candidates) && nx.candidates.length
      && nx.candidates.every(u => st.players[ME].hand.includes(u))) return nx;
  /* 盤面にあるカードから1枚以上選ぶもの (山札から選ぶもの、選ばなくてもよいものはまとめない) */
  if (nx.kind === 'pickCard' && nx.prompt !== 'play-free' && (nx.min === undefined || nx.min >= 1)
      && Array.isArray(nx.candidates) && nx.candidates.length
      && nx.candidates.every(u => typeof u === 'string' && u.indexOf('|') < 0 && st.cards[u] && (locOf(st, u) || {}).zone === 'field')) return nx;
  return null;
}
let activeArrange = null;               // 表示中の並べ替えオーバーレイ

/* 表示中の待ち受けUI (盤面ピック / 並べ替え / モーダル) をすべて破棄する */
function cancelPendingAsk() {
  cancelBoardPick();
  if (activeArrange) activeArrange.cancel();
  UI.cancelChoice(PICK_CANCEL);
}

function cancelBoardPick() {
  if (!boardPick) return;
  const bp = boardPick;
  boardPick = null;
  board.clearCandidates();
  clearLineTargets();
  for (const pad of pads) pad.userData.hover = false;
  removePickBar();
  if (bp.cleanup) bp.cleanup();
  bp.resolve(PICK_CANCEL);
}

function pickOnBoard(req) {
  const st = shown();
  /* ライン選択: パッドを光らせて直接タップ */
  if (req.kind === 'pickLine') {
    if (!Array.isArray(req.lines) || !req.lines.length) return Promise.resolve(null);
    return new Promise((resolve) => {
      boardPick = { kind: 'line', req, lines: req.lines.slice(), toPicks: (l) => [l], resolve };
      renderLinePick();
    });
  }
  /* はい/いいえ は盤面を隠さず下部バーで答える */
  if (req.kind === 'yesNo') {
    return new Promise((resolve) => {
      const bp = { kind: 'yesno', req, resolve };
      boardPick = bp;
      let el = document.getElementById('pickBar');
      if (!el) {
        el = document.createElement('div');
        el.id = 'pickBar';
        el.className = 'pick-ribbon';
        document.body.appendChild(el);
      }
      /* 質問と はい/いいえ を同じ1行の帯に (選択の帯と同じ形)。手札のすぐ上、PC の広い画面では効果を出したカードのそば */
      el.className = 'pick-ribbon';
      el.innerHTML = pickRibbon(req, {
        extra: '<button type="button" class="rb-btn ok" id="pkYes">YES</button><button type="button" class="rb-btn" id="pkNo">NO</button>'
      });
      bindPickBar(el);
      bindRibbon(el, {});
      let done = (picks) => {
        boardPick = null;
        removePickBar();
        resolve(picks);
      };
      /* PC の近道: Enter = はい、Esc = いいえ、盤面で右クリック = いいえ */
      const onKey = (ev) => {
        if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
        if (ribbonPeeking()) return;                       // 目で盤面を見ている間はキーで答えない
        if (ev.key === 'Enter') { ev.preventDefault(); done(['yes']); }
        else if (ev.key === 'Escape') { ev.preventDefault(); done([]); }
      };
      const onCtx = (ev) => { ev.preventDefault(); done([]); };
      window.addEventListener('keydown', onKey);
      window.addEventListener('contextmenu', onCtx);
      const done0 = done;
      let finished = false;
      const unlisten = () => {
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('contextmenu', onCtx);
      };
      /* 取り消し (UNDO・オンラインの再同期) でも、キーと右クリックの受け口を外す。
         残すと、次のはい/いいえで古い受け口が先に答えて、新しい選択が止まっていた */
      bp.cleanup = unlisten;
      done = (picks) => {
        unlisten();
        if (finished || boardPick !== bp) return;   // もう閉じた / 別の選択に替わった
        finished = true;
        done0(picks);
      };
      el.querySelector('#pkYes').onclick = () => done(['yes']);
      el.querySelector('#pkNo').onclick = () => done([]);
    });
  }
  /* option 型のプレイ先 (ライン×表裏の組合せ): レーンをタップすると表を優先する */
  if (req.kind === 'option' && req.prompt === 'play-dest' && Array.isArray(req.faces) && req.faces.length) {
    const lines = [...new Set(req.faces.map(x => x.l))];
    const toPicks = (l) => {
      const want = true;
      let i = req.faces.findIndex(x => x.l === l && x.f === want);
      if (i < 0) i = req.faces.findIndex(x => x.l === l);
      return [i];
    };
    return new Promise((resolve) => {
      boardPick = { kind: 'line', req, lines, toPicks, resolve };
      renderLinePick();
    });
  }
  /* play-free (SPEED 0 等の「カードを1枚プレイする」): 通常プレイと同じ
     手札タップ → パッドタップ の2段で選ぶ */
  if (req.kind === 'pickCard' && req.prompt === 'play-free') {
    return new Promise((resolve) => {
      const byUid = {};
      for (const raw of req.candidates) {
        const parts = String(raw).split('|');
        (byUid[parts[0]] = byUid[parts[0]] || []).push({ line: +parts[1], face: parts[2], raw });
      }
      boardPick = { kind: 'free', req, byUid, sel: null, resolve };
      renderFreePick();
    });
  }
  const usable = Array.isArray(req.candidates) && req.candidates.length
    && req.candidates.every((u) => {
      if (typeof u !== 'string' || u.indexOf('|') >= 0) return false;
      const l = locOf(st, u);
      return l && (l.zone === 'field' || l.zone === 'hand' || l.zone === 'transit');
    });
  if (!usable) return Promise.resolve(null);
  const min = req.min === undefined ? 1 : req.min;
  const max = req.max === undefined ? 1 : req.max;
  return new Promise((resolve) => {
    boardPick = { req, min, max, chosen: [], resolve };
    renderBoardPick();
  });
}

/* 帯の組み立て後に呼ぶ: 発動元チップのタップで効果文を出す。
   選択バーには発動元と質問が入っているので、出している間は上の「効果処理中」の帯を隠す */
let pickPanelReq = null;
function bindPickBar(el) {
  document.body.classList.add('picking');
  bindSelectHead(el, showCardNoteFor);
  /* 選んでいる間は、何の効果で選んでいるのかを左の詳細パネルに出しておく (マスターデュエルと同じ)。
     同じ選択の描き直し (候補を1枚選んだ等) では出し直さない */
  showSourcePanel(boardPick && boardPick.req);
}
/* 選んでいる間は、何の効果で選んでいるのかを左の詳細パネルに出す (帯で選ぶときも、一覧で選ぶときも同じ)。
   同じ選択の描き直しでは出し直さない */
function showSourcePanel(req) {
  if (!req || req === pickPanelReq || isCompactHandUI()) return;
  pickPanelReq = req;
  const d = req.context && defIndex[req.context];
  if (d) { previewUid = null; UI.showCardPanel(defDetail(d)); }
}

/* 選択バーを畳む (どの経路で終わっても body の印を戻す) */
function removePickBar() {
  if (pickAid) pickAid.hide();
  const el = document.getElementById('pickBar');
  if (el) el.remove();
  const go = document.getElementById('pickGo');
  if (go) go.remove();
  const go2 = document.getElementById('pkGo');
  if (go2) go2.remove();
  document.body.classList.remove('picking');
  pickPanelReq = null;
}

function renderBoardPick() {
  const bp = boardPick;
  if (!bp) return;
  /* キャッシュ確認など手札から選ぶ要求は、収納中でも必ず読める状態へ戻す。 */
  if (bp.req.kind === 'pickHand') setHandDrawer(true);
  clearLineTargets();
  board.markCandidates(bp.req.candidates, bp.chosen);
  let el = document.getElementById('pickBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pickBar';
    el.className = 'pick-ribbon';
    document.body.appendChild(el);
  }
  const instant = pickIsInstant(bp);   // 盤面の1枚必須はタップで即決
  /* 2段階以上の効果は、一つ前の選択へ戻れる (エンジンが回答を1つ減らして再生する) */
  const canBack = !!(cur && cur.state && cur.state.pending && cur.state.pending.requestId === bp.req.id
    && Array.isArray(cur.state.pending.choices) && cur.state.pending.choices.length);
  /* 1行の帯 (pickRibbon): 何の効果で・何を選ぶか・「しない」。決定は押したカードのそばに浮かぶ (renderPickGo) */
  el.className = 'pick-ribbon';
  /* 何枚か選ぶときの「決定」は帯の中に置く。選んだカードの横に出すと、次に押すカードのそばに出て、うっかり確定していた */
  const goInRibbon = pickGoInRibbon(bp);
  el.innerHTML = pickRibbon(bp.req, {
    count: bp.chosen.length, max: bp.max, back: canBack, skip: pickSkip,
    none: !pickSkip && bp.min === 0 && !bp.chosen.length,
    /* 選べる枚数をすべて選んだら、決定を光らせて「あとは押すだけ」と知らせる */
    extra: ''
  });
  bindPickBar(el);
  bindRibbon(el, {
    back: () => finishBoardPick(PICK_BACK),
    skip: () => finishBoardPick(PICK_SKIP),
    none: () => finishBoardPick([])
  });
  /* 決定は帯の中ではなく、右下 (リフレッシュの上・親指の届くところ) に出す。
     帯は候補のカードに重なると画面の上へよけるので、帯の中の決定が上の端まで行っていた */
  let pkGo = document.getElementById('pkGo');
  if (goInRibbon) {
    if (!pkGo) {
      pkGo = document.createElement('button');
      pkGo.type = 'button';
      pkGo.id = 'pkGo';
      document.body.appendChild(pkGo);
    }
    pkGo.className = 'pk-go' + (bp.chosen.length >= bp.max ? ' ready' : '');
    pkGo.textContent = pickGoLabel(bp);
  } else if (pkGo) { pkGo.remove(); pkGo = null; }
  if (pkGo) {
    /* 出た直後 (選んだ勢いの連打) は押しても決めない */
    const armedAt = performance.now() + GO_ARM_MS;
    pkGo.onclick = (ev) => {
      ev.stopPropagation();
      if (performance.now() < armedAt || boardPick !== bp) return;
      finishBoardPick(bp.chosen.slice());
    };
  }
  renderPickGo(bp);
  if (!pickAid) pickAid = createPickAid(stage, board);
  pickAid.show({ cands: bp.req.candidates, chosen: bp.chosen, multi: bp.max > 1, ribbon: el,
    userMoved: () => !!(ribbonOffset.x || ribbonOffset.y) });
}

/* 選択の1行の帯: [効果の元のカード] 何を選ぶか (数) [戻る] [しない]。
   手札のすぐ上に出す (three-play.html の .pick-ribbon)。元のカードを押すと効果の全文 */
function pickRibbon(req, m) {
  const s = sourceInfo(req && req.context);
  const d = s && defIndex[s.def];
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return '<button type="button" class="rb-peek" aria-pressed="false" title="帯を透かして盤面を見る" aria-label="盤面を見る">&#128065;</button>' +
    (s
      ? '<button type="button" class="rb-src" data-def="' + esc(s.def) + '" style="--accent:' + esc(s.color || '#b9a4ff') + '" title="効果を読む">' +
          (d ? '<img alt="" src="' + faceImageURL(d) + '">' : '') + '<b>' + esc(s.name) + '</b></button>'
      : '') +
    '<span class="rb-q">' + esc(questionText(req)) + (m.max > 1 ? ' <em>' + (m.count || 0) + '/' + m.max + '</em>' : '') + '</span>' +
    ribbonActs((m.back ? '<button type="button" class="rb-btn" id="pkBack">← 戻る</button>' : '') +
      (m.skip ? '<button type="button" class="rb-btn skip" id="pkSkip">しない</button>' : '') +
      (m.none ? '<button type="button" class="rb-btn skip" id="pkNone">選ばない</button>' : '') + (m.extra || ''));
}
/* 帯のボタンはひとまとめにする (折り返すときも一緒に右へ) */
function ribbonActs(html) { return html ? '<span class="rb-act">' + html + '</span>' : ''; }
/* 帯の目ボタン: 押すと帯を透かして下の盤面を見られる。同じ選択の描き直しでも透かしたまま (もう一度で戻る) */
let ribbonPeekReq = null;
/* 選択の帯は、ボタン以外を掴んでドラッグすると動かせる (下のカードが隠れて見えないとき)。
   動かした位置はこの対戦の間は覚えておき、次の選択の帯も同じ場所に出す。画面の外へは出さない */
const ribbonOffset = { x: 0, y: 0 };
function makeRibbonDraggable(el) {
  el.style.translate = ribbonOffset.x + 'px ' + ribbonOffset.y + 'px';
  if (el._drag) return;
  el._drag = true;
  let start = null;
  el.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('button') || ev.button > 0) return;
    start = { px: ev.clientX, py: ev.clientY, x: ribbonOffset.x, y: ribbonOffset.y, r: el.getBoundingClientRect() };
    try { el.setPointerCapture(ev.pointerId); } catch (e) { /* 古いブラウザ */ }
    el.classList.add('dragging');
  });
  el.addEventListener('pointermove', (ev) => {
    if (!start) return;
    const r = start.r;
    let dx = ev.clientX - start.px, dy = ev.clientY - start.py;
    /* 画面の中に収める (帯の四隅が画面から出ないように) */
    dx = Math.max(-r.left + 4, Math.min(window.innerWidth - r.right - 4, dx));
    dy = Math.max(-r.top + 4, Math.min(window.innerHeight - r.bottom - 4, dy));
    ribbonOffset.x = start.x + dx;
    ribbonOffset.y = start.y + dy;
    el.style.translate = ribbonOffset.x + 'px ' + ribbonOffset.y + 'px';
  });
  const end = () => { start = null; el.classList.remove('dragging'); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function bindRibbon(el, on) {
  makeRibbonDraggable(el);
  const req = boardPick && boardPick.req;
  const peek = el.querySelector('.rb-peek');
  const setPeek = (v) => { el.classList.toggle('peek', v); if (peek) peek.setAttribute('aria-pressed', String(v)); };
  setPeek(!!req && ribbonPeekReq === req);
  if (peek) peek.onclick = (ev) => {
    ev.stopPropagation();
    const v = !el.classList.contains('peek');
    ribbonPeekReq = v ? req : null;
    setPeek(v);
    if (v) UI.toast('触ったカードの効果を見られます (目をもう一度押すと選択に戻ります)', 2200);
  };
  const src = el.querySelector('.rb-src');
  if (src) src.onclick = (ev) => { ev.stopPropagation(); showCardNoteFor(src.dataset.def); };
  for (const [id, fn] of [['#pkBack', on.back], ['#pkSkip', on.skip], ['#pkNone', on.none]]) {
    const b = el.querySelector(id);
    if (b && fn) b.onclick = (ev) => { ev.stopPropagation(); fn(); };
  }
}

function renderFreePick() {
  const bp = boardPick;
  if (!bp) return;
  updatePlayChoices();
  if (bp.sel) {
    board.markCandidates([bp.sel], [bp.sel]);
    const lines = new Set(bp.byUid[bp.sel].map(o => o.line));
    for (const pad of pads) pad.userData.hover = pad.userData.side === ME && lines.has(pad.userData.line);
  } else {
    board.markCandidates(Object.keys(bp.byUid), []);
    for (const pad of pads) pad.userData.hover = false;
  }
  let el = document.getElementById('pickBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pickBar';
    document.body.appendChild(el);
  }
  /* ほかの選択と同じ1行の帯: 何の効果で、何をするか (カードを選ぶ → 置くラインを選ぶ) */
  el.className = 'pick-ribbon';
  el.innerHTML = pickRibbon({ ...bp.req, prompt: bp.sel ? 'play-free-line' : bp.req.prompt }, {
    extra: bp.sel ? '<button type="button" class="rb-btn" id="pkBack">カードを選び直す</button>' : ''
  });
  const q = el.querySelector('.rb-q');
  if (q) q.textContent = bp.sel ? '置くラインをタップ' : 'プレイするカードを選ぶ';
  bindPickBar(el);
  bindRibbon(el, {});
  const back = el.querySelector('#pkBack');
  if (back) back.onclick = (ev) => { ev.stopPropagation(); bp.sel = null; renderFreePick(); };
}

function tapFreePick(hitUd) {
  const bp = boardPick;
  if (!bp) return;
  const uid = hitUd.uid;
  if (uid && bp.byUid[uid]) {
    bp.sel = (bp.sel === uid) ? null : uid;
    renderFreePick();
    return;
  }
  if (!bp.sel) return;
  /* パッド or ライン上のカードのタップで着地先を決める */
  let line = hitUd.isPad ? hitUd.line : null;
  if (line === null && uid) {
    const l = locOf(shown(), uid);
    if (l && (l.zone === 'field' || l.zone === 'transit')) line = l.line;
  }
  if (line === null) return;
  const opts = bp.byUid[bp.sel].filter(o => o.line === line);
  if (!opts.length) return;
  /* 表裏どちらも置けるラインは、表向き/裏向きトグルの状態に従う */
  focusPlayChoice(line, ME);
}

function finishFreePick(picks) {
  const bp = boardPick;
  boardPick = null;
  updatePlayChoices();
  board.clearCandidates();
  for (const pad of pads) pad.userData.hover = false;
  removePickBar();
  bp.resolve(picks);
}

function renderLinePick() {
  const bp = boardPick;
  if (!bp) return;
  board.clearCandidates();
  board.markEffectFocus(bp.req.focus);
  setLineTargets(bp.lines, lineSideFor(bp.req));
  let el = document.getElementById('pickBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pickBar';
    el.className = 'pick-ribbon';
    document.body.appendChild(el);
  }
  const canBack = !!(cur && cur.state && cur.state.pending && cur.state.pending.requestId === bp.req.id
    && Array.isArray(cur.state.pending.choices) && cur.state.pending.choices.length);
  /* 移動するカード (金) と移動先 (緑) は盤面の光で示す */
  el.className = 'pick-ribbon';
  el.innerHTML = pickRibbon(bp.req, { back: canBack, skip: pickSkip });
  bindPickBar(el);
  bindRibbon(el, { back: () => finishLinePick(PICK_BACK), skip: () => finishLinePick(PICK_SKIP) });
  renderShiftTotals(bp);
}

/* 移動先ごとの、移動したあとのそのラインの合計 (効果を解く前)。写しの盤面で動かして、エンジンと同じ数え方で数える */
function shiftedTotals(st, req) {
  const uids = (Array.isArray(req.focus) ? req.focus : [req.focus]).filter(u => u != null);
  if (!st || !uids.length || !Array.isArray(req.lines)) return [];
  const out = [];
  for (const dest of req.lines) {
    try {
      const s = JSON.parse(JSON.stringify(st));
      delete s._totals;
      const sides = new Set();
      for (const u of uids) {
        for (let l = 0; l < 3; l++) for (let sd = 0; sd < 2; sd++) {
          const stk = s.lines[l][sd];
          const i = stk.indexOf(u);
          if (i >= 0 && l !== dest) { stk.splice(i, 1); s.lines[dest][sd].push(u); sides.add(sd); }
        }
      }
      for (const sd of sides) out.push({ line: dest, side: sd, total: Engine.lineTotal(s, dest, sd) });
    } catch (e) { /* 数えられないときは出さない */ }
  }
  return out;
}

/* 移動先の置き場の上に「→合計」を出す (プレイの表/裏ボタンと同じ見通し) */
function renderShiftTotals(bp) {
  let root = document.getElementById('shiftTotals');
  const items = bp && bp.kind === 'line' && /^(shift-dest|mass-shift-dest)$/.test(bp.req.prompt || '')
    ? shiftedTotals(shown(), bp.req).filter(it => Number.isFinite(it.total)) : [];
  if (!items.length) { if (root) root.remove(); return; }
  if (!root) {
    root = document.createElement('div');
    root.id = 'shiftTotals';
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
  }
  root.replaceChildren(...items.map(it => {
    const el = document.createElement('div');
    el.className = 'shift-total';
    el.dataset.line = it.line;
    el.dataset.side = it.side;
    const arrow = document.createElement('i');
    arrow.textContent = '→';
    const num = document.createElement('b');
    num.textContent = String(it.total);
    el.append(arrow, num);
    return el;
  }));
  positionShiftTotals();
}

function positionShiftTotals() {
  const root = document.getElementById('shiftTotals');
  if (!root) return;
  /* 選び終わった・取り消した (UNDO・再同期) ときは消す */
  if (!boardPick || boardPick.kind !== 'line' || !stage) { root.remove(); return; }
  const rect = stage.renderer.domElement.getBoundingClientRect();
  for (const el of root.children) {
    const line = Number(el.dataset.line), side = Number(el.dataset.side);
    const pad = pads.find(p => p.userData.line === line && p.userData.side === side);
    if (!pad) { el.hidden = true; continue; }
    pad.getWorldPosition(choiceWorld);          // 置き場は着地する位置に動かしてある (setLineTargets)
    choiceWorld.y += 0.12;
    choiceWorld.project(stage.camera);
    const visible = choiceWorld.z >= -1 && choiceWorld.z <= 1 && Math.abs(choiceWorld.x) <= 1.25 && Math.abs(choiceWorld.y) <= 1.25;
    el.hidden = !visible;
    if (!visible) continue;
    el.style.left = (rect.left + (choiceWorld.x + 1) * rect.width / 2) + 'px';
    el.style.top = (rect.top + (1 - choiceWorld.y) * rect.height / 2) + 'px';
  }
}

function finishLinePick(picks) {
  const bp = boardPick;
  boardPick = null;
  board.clearCandidates();
  clearLineTargets();
  removePickBar();
  bp.resolve(picks);
}

/* ラインを選ぶとき、どちらの側の置き場を光らせるか (null なら両側 = ライン全体に効く効果)。
   両側がいつも光ると、自分の場に置くのか相手の場なのか分からず違和感があった */
function lineSideFor(req) {
  if (!req) return null;
  if (typeof req.side === 'number') return req.side;                      // エンジンが側を決めているもの (相手のスタックにプレイ)
  const focus = Array.isArray(req.focus) ? req.focus[0] : req.focus;      // 動かすカードは持ち主の側のまま
  const st = shown();
  if (focus && st && st.cards[focus]) return st.cards[focus].owner;
  if (/^(play-dest|swap-stack-[12]|compile-line)$/.test(req.prompt || '')) return req.player;
  return null;
}

function setLineTargets(lines, side) {
  const set = new Set(lines || []);
  const st = shown();
  const whole = side === null || side === undefined;       // ライン全体: 置き場ではなく帯で示す
  for (const g of laneGlows) g.userData.on = whole && set.has(g.userData.line);
  for (const pad of pads) {
    const on = !whole && set.has(pad.userData.line) && pad.userData.side === side;
    pad.userData.pulse = on ? 0.95 : 0;
    pad.userData.hover = on;
    if (on && st) {
      const idx = st.lines[pad.userData.line][pad.userData.side].length;
      const slot = LAYOUT.stackSlot(pad.userData.line, pad.userData.side, idx, ME, st);
      pad.position.set(...slot.pos);
    }
  }
}

function clearLineTargets() {
  for (const pad of pads) { pad.userData.pulse = 0; pad.userData.hover = false; }
  for (const g of laneGlows) g.userData.on = false;
}

function toggleBoardPick(uid) {
  const bp = boardPick;
  if (!bp || bp.req.candidates.indexOf(uid) < 0) return;
  const i = bp.chosen.indexOf(uid);
  /* 1枚選ぶ選択: 選んだカードをもう一度触ったら決める。手札から選ぶ (捨てる等) は帯の決定だけで決める
     (2回続けて触っただけで捨てていた。もう一度触ると選び直し) */
  if (i >= 0 && bp.max === 1 && bp.chosen.length >= bp.min && bp.req.kind !== 'pickHand') { finishBoardPick(bp.chosen.slice()); return; }
  if (i >= 0) bp.chosen.splice(i, 1);
  else {
    if (bp.max === 1) bp.chosen.length = 0;
    bp.chosen.push(uid);
  }
  if (pickIsInstant(bp) && bp.chosen.length === 1) {
    finishBoardPick(bp.chosen.slice());
    return;
  }
  /* 選んで → 決定 の選択 (捨てる等) は、選んだカードの効果を右上に出す。
     スマホではカードを触ると選ぶことになり、効果を読めないまま決めていたため */
  if (bp.chosen.indexOf(uid) >= 0) { previewUid = uid; showCardInspector(uid); }
  else if (previewUid === uid) { previewUid = null; UI.hideCardNote(); }
  /* スマホは乗せる (ホバー) が無いので、選んだカードの上に「選んだら何が起きるか」を出す */
  if (pickAid && isCompactHandUI()) {
    const pv = bp.chosen.indexOf(uid) >= 0 ? pickPreview(bp, uid) : null;
    pickAid.tip(uid, pv && pv.now, pv && pv.later);
  }
  /* 何枚か選ぶ選択は、盤面でも手札でも「選ぶ → 帯の決定」にそろえる
     (盤面だけ N 枚目で勝手に決まると、押し間違えを取り消せず、手札の選択と操作も食い違っていた) */
  renderBoardPick();
}

/* 最後に押した場所 (選んだカードのすぐ横に「決定」を出すため) */
let lastTap = null;
window.addEventListener('pointerdown', (ev) => { lastTap = { x: ev.clientX, y: ev.clientY }; }, true);

/* 選んだカードのすぐ横の「決定」。ダイアログの決定まで手を伸ばさなくてよいように (Enter でも決定) */
const GO_ARM_MS = 400;
/* 何枚か選ぶ選択は、決定を帯の中に置く (カードの横には出さない) */
/* 決定を帯の中に置くか。何枚か選ぶときと、手札から選ぶとき (捨てる等)。
   手札は扇に重なっているので、選んだ札の横に決定を浮かべると、隣の札に選び直そうとして決定を押していた */
function pickGoInRibbon(bp) {
  return !!bp && !pickIsInstant(bp) && (bp.max > 1 || bp.req.kind === 'pickHand') && bp.chosen.length > 0 && bp.chosen.length >= bp.min;
}
/* 帯の決定の文字。手札から1枚選ぶときは、選んだ札の名前を出す (どれを捨てるのか押す前に分かる) */
function pickGoLabel(bp) {
  if (bp.req.kind === 'pickHand' && bp.max === 1 && bp.chosen.length === 1) {
    const nm = cardName(bp.chosen[0]);
    if (nm) return '決定: ' + nm;   // プロトコル名と数字だけ (cardName)
  }
  return '決定 (' + bp.chosen.length + ')';
}
function renderPickGo(bp) {
  let go = document.getElementById('pickGo');
  const show = bp && !pickIsInstant(bp) && !pickGoInRibbon(bp) && bp.max === 1 && bp.chosen.length > 0 && bp.chosen.length >= bp.min && lastTap;
  if (!show) { if (go) go.remove(); return; }
  if (!go) {
    go = document.createElement('button');
    go.id = 'pickGo';
    go.type = 'button';
    document.body.appendChild(go);
  }
  go.textContent = '決定' + (bp.max > 1 ? ' (' + bp.chosen.length + ')' : '');
  go.title = 'Enter でも決定できます';
  const x = Math.min(window.innerWidth - 110, lastTap.x + 26);
  const y = Math.max(8, Math.min(window.innerHeight - 50, lastTap.y - 18));
  go.style.left = x + 'px';
  go.style.top = y + 'px';
  const armedAt = performance.now() + GO_ARM_MS;       // 出た直後は押しても決めない (選んだ勢いの連打で確定しないように)
  go.onclick = (ev) => { ev.stopPropagation(); if (performance.now() >= armedAt && boardPick === bp) finishBoardPick(bp.chosen.slice()); };
}
window.addEventListener('keydown', (ev) => {
  const bp = boardPick;
  /* 「〜してもよい」をまとめた選択は Esc で「しない」 */
  if (ribbonPeeking()) return;                       // 目で盤面を見ている間はキーで決めない
  if (ev.key === 'Escape' && bp && pickSkip && (bp.chosen || bp.kind === 'line')) {
    ev.preventDefault();
    if (bp.kind === 'line') finishLinePick(PICK_SKIP); else finishBoardPick(PICK_SKIP);
    return;
  }
  if (ev.key !== 'Enter' || !bp || !bp.chosen || pickIsInstant(bp)) return;
  if (bp.chosen.length < bp.min) return;
  if (ev.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(ev.target.tagName)) return;
  ev.preventDefault();
  finishBoardPick(bp.chosen.slice());
});

/* 1枚必須の選択をタップで即決するか。手札から選ぶ (捨てる・キャッシュの削除・渡す等) は
   取り消せないので、1枚でも「選んで → 決定」にする。選び直しはもう1枚をタップ */
/* 1枚選ぶ選択は触ったら決まる。オンラインは取り消せない手が多いので、選んでから決める (同じカードをもう一度・決定) */
function pickIsInstant(bp) {
  return bp.max === 1 && bp.min >= 1 && bp.req.kind !== 'pickHand' && !roomMode;
}

/* 選んだら何が起きるか (候補に乗せた / 選んだときの札)。
   上の段: 何をされるか (反転・削除…) と、その札だけを動かしたときに変わるラインの合計値。
   下の段 (CPU 戦): 効果が最後まで進んだときの合計値の見通し (pickPreview の中)。
   ゲームを試しに進めて比べると、あとに続く効果 (「そうした場合、〜」) の変化まで混ざり、
   捨てただけで合計値が変わるように見えていた。なので、その札に直接起きることだけを盤面の写しに当てて計算する */
const PICK_OUTCOME = {
  'delete': '→ 捨て札', 'optional-delete': '→ 捨て札', 'discard': '→ 捨て札', 'clear-cache': '→ 捨て札',
  'return': '→ 手札', 'optional-return': '→ 手札', 'steal-to-hand': '→ 自分の手札', 'give-card': '→ 相手の手札',
  'shift': '移動する', 'optional-shift': '移動する', 'reveal': '公開する', 'optional-reveal': '公開する',
  'reveal-hand-card': '公開する', 'play-card': 'プレイする', 'play-from-trash': 'プレイする'
};
/* その札だけを動かした盤面の写し (動かし方が分からなければ null)。
   移動は行き先がまだ決まっていないので、元のラインから抜けたところまで */
function directPickState(st, uid, prompt) {
  const p = String(prompt || '').replace(/^optional-/, '');
  const moves = { 'delete': 'trash', 'discard': 'trash', 'clear-cache': 'trash', 'return': 'hand', 'steal-to-hand': 'mine',
    'give-card': 'theirs', 'shift': 'lift', 'flip': 'flip' };
  const how = moves[p];
  if (!how || !st.cards[uid]) return null;
  const x = JSON.parse(JSON.stringify(st));
  delete x._totals;
  const c = x.cards[uid];
  if (how === 'flip') { c.faceUp = !c.faceUp; return x; }
  for (const line of x.lines) for (const side of [0, 1]) line[side] = line[side].filter(u => u !== uid);
  for (const pl of x.players) pl.hand = pl.hand.filter(u => u !== uid);
  const owner = c.owner;
  if (how === 'trash') { x.players[owner].trash.push(uid); c.zone = 'trash' + owner; }
  else if (how === 'hand') { x.players[owner].hand.push(uid); c.zone = 'hand' + owner; }
  else if (how === 'mine') { x.players[ME].hand.push(uid); c.zone = 'hand' + ME; }
  else if (how === 'theirs') { x.players[1 - ME].hand.push(uid); c.zone = 'hand' + (1 - ME); }
  else c.zone = 'committed';                       // 移動: 行き先が決まる前 (どのラインにもいない)
  return x;
}
function pickPreview(bp, uid) {
  const req = bp.req;
  if (bp._tips && uid in bp._tips) return bp._tips[uid];
  const st = shown();
  const c = st && st.cards[uid];
  let what = PICK_OUTCOME[req.prompt] || null;
  if (/flip$/.test(req.prompt || '') && c) what = c.faceUp ? '裏になる' : '表になる';
  const parts = what ? ['<b>' + what + '</b>'] : [];
  /* 合計値が変わるラインを「SPEED 6→5」の形で並べる (before と after の盤面を比べる) */
  const totalsDiff = (before, after) => {
    const out = [];
    for (let side = 0; side < 2; side++) {
      for (let l = 0; l < 3; l++) {
        const a = Engine.lineTotal(before, l, side), b = Engine.lineTotal(after, l, side);
        if (a === b) continue;
        const name = (before.players[side].protocols[l] || {}).name || '';
        out.push('<span class="' + (b > a ? 'up' : 'down') + '">' + (side === ME ? '' : '相手 ') + name + ' ' + a + '→' + b + '</span>');
      }
    }
    return out;
  };
  let direct = [];
  try {
    const after = st && directPickState(st, uid, req.prompt);
    if (after) direct = totalsDiff(st, after);
  } catch (e) { /* 計算できないときは、何をされるかだけ */ }
  parts.push(...direct);
  /* 効果のあとの見通し: CPU 戦で1枚で決まる選択は、手元のエンジンで試しに最後まで進めて、合計値がどうなるかを出す。
     その札に直接起きたこと (吹き出し) と混ざって「捨てたから減った」ように見えないよう、別のウインドウにして見出しを付ける。
     まだ選択が残るところで止まったら「途中まで」 */
  let laterHtml = null;
  if (!roomMode && bp.max === 1 && cur && cur.state && req.player === ME) {
    try {
      /* 比べる元は「いま画面に出ている盤面」(st)。選択の途中の cur.state は手を始める前の盤面なので、
         それと比べると、もう済んだ変化 (FIRE 0 で裏返した METAL 5→2 など) が、いま選ぶ札のせいで起きるように出ていた。
         進めるのは自分の手番の終わりまで (相手の手番の始めのコンパイルなどは、この選択の結果ではない) */
      const sim = Engine.apply(cur.state, { type: 'choose', id: req.id, picks: [uid] });
      if (sim && !sim.error && sim.state && st) {
        const turn = cur.state.turn;
        const end = sim.state.turn === turn ? sim.state : PZ.endOfTurnState(sim.trace, turn, null);
        const later = end ? totalsDiff(st, end) : [];
        if (later.length && later.join('') !== direct.join('')) {
          const partial = Array.isArray(sim.requests) && sim.requests.length > 0;
          /* 手札の上限で捨てる (キャッシュのクリア) のあとに起きるのは、効果ではなく手番の終わりの処理 */
          const head = req.prompt === 'clear-cache' ? '手番の終わりまでに' : '効果のあと';
          laterHtml = '<i>' + head + (partial ? '（途中まで）' : '（見込み）') + '</i>' + later.join('');
        }
      }
    } catch (e) { /* 試せないときは出さない */ }
  }
  /* 返り値: { now: その札に直接起きること, later: 効果全体の見通し (別のウインドウに出す) } */
  (bp._tips = bp._tips || {})[uid] = { now: parts.length ? parts.join('') : null, later: laterHtml };
  return bp._tips[uid];
}
/* 選べないカードを押したときの理由 */
function pickReason(l) {
  if (l.zone === 'hand' && l.side !== ME) return '相手の手札は選べない';
  if (l.zone === 'field' && l.len && l.idx < l.len - 1) return '覆われているので選べない';
  return 'この効果では選べない';
}

function finishBoardPick(picks) {
  const bp = boardPick;
  boardPick = null;
  previewUid = null;
  UI.hideCardNote();
  renderPickGo(null);
  board.clearCandidates();
  removePickBar();
  bp.resolve(picks);
}

/* 並べ替え: 対象側のプロトコルパネルにチップを重ね、2枚タップで入れ替える。
   exact === 'transposition' (1回だけ入れ替え) は2枚目のタップで即確定。
   戻り値は picks (新しい位置ごとの旧インデックス) か、null (モーダルへ)。 */
/* プロトコルの並べ替えを盤面の板で行う。
   通常: req (arrange) の対象の側だけ。返り値は並び (位置 -> 旧インデックス) / null (一覧で選ぶ) / PICK_CANCEL。
   opts.control: コントロールの「並べ替えますか」(option) をまとめて、自分・相手どちらの板もタップできる。
     最初にタップした側を並べ替える。返り値は { target, perm } / { skip: true } / null / PICK_CANCEL */
function arrangeOnBoard(req, opts) {
  const control = !!(opts && opts.control);
  const platesOf = (side) => (panels && panels.panels || []).filter(p => p.side === side);
  let targetSide = control ? null : (req.target !== undefined ? req.target : ME);
  let list = targetSide === null ? [] : platesOf(targetSide);
  if ((!control && list.length !== 3) || !stage) return Promise.resolve(null);
  const namesOf = (side) => {
    if (!control) return { current: req.current, compiled: req.compiled };
    const pr = shown().players[side].protocols;
    return { current: pr.map(x => x.name), compiled: pr.map(x => !!x.compiled) };
  };

  const ov = document.createElement('div');
  ov.id = 'arrOv';
  document.body.appendChild(ov);

  const perm = [0, 1, 2];            // 位置 -> 旧インデックス
  let arrPeek = false;               // 帯を透かして盤面を見ているか (目のボタン)
  const single = req.exact === 'transposition';
  let sel = -1;

  /* 盤面の板を直接タップして入れ替える。板は並びどおりの位置へ滑らせて見せ、選んだ板は少し持ち上げる */
  const canvas = stage.renderer.domElement;
  const plateOf = (oldIdx) => list.find(p => p.line === oldIdx);
  const slotX = (line, side) => LAYOUT.protoSlot(line, side === undefined ? targetSide : side, ME).pos;
  let closed = false;                // 終わったあとに残りの動きが板を動かさないように
  const layPlates = (ms) => {
    if (targetSide === null) return;
    for (let pos = 0; pos < 3; pos++) {
      const p = plateOf(perm[pos]);
      if (!p) continue;
      const to = slotX(pos);
      const x0 = p.group.position.x, y0 = p.group.position.y;
      const y1 = to[1] + (sel === pos ? 0.28 : 0);
      if (!ms) { p.group.position.x = to[0]; p.group.position.y = y1; continue; }
      TW.tween(ms, (t) => {
        if (closed) return;
        p.group.position.x = x0 + (to[0] - x0) * t;
        p.group.position.y = y0 + (y1 - y0) * t;
      }, TW.Ease.outCubic);
    }
  };
  const resetPlates = (plates) => {
    for (const p of plates) { const s0 = LAYOUT.protoSlot(p.line, p.side, ME).pos; p.group.position.x = s0[0]; p.group.position.y = s0[1]; }
  };
  const ray0 = new THREE.Raycaster();
  const plane0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02);
  /* タップした板 { side, pos } (無ければ null)。コントロールのときは両方の側を見る */
  const hitPos = (ev) => {
    const r = canvas.getBoundingClientRect();
    ray0.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), stage.camera);
    const pt = ray0.ray.intersectPlane(plane0, new THREE.Vector3());
    if (!pt) return null;
    for (const side of control ? [ME, AI] : [targetSide]) {
      for (let pos = 0; pos < 3; pos++) {
        const s = slotX(pos, side);
        if (Math.abs(pt.x - s[0]) < 1.0 && Math.abs(pt.z - s[2]) < 0.62) return { side, pos };
      }
    }
    return null;
  };

  return new Promise((resolve) => {
    const onResize = () => render();
    window.addEventListener('resize', onResize);
    let tapLine = null;                          // 盤面の板をタップしたとき (帯の名前を押したのと同じ扱い)
    const onPlate = (ev) => {
      if (arrPeek) return;                       // 目の状態: 板は入れ替えず、触ったカードの効果を見るだけ
      const h = hitPos(ev);
      if (!h) return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      if (tapLine) tapLine(h.pos, h.side);
    };
    const onHover = (ev) => { canvas.style.cursor = hitPos(ev) ? 'pointer' : ''; };
    canvas.addEventListener('pointerdown', onPlate, true);
    canvas.addEventListener('pointermove', onHover);
    /* 確定ボタンを、並べ替えている板の右隣にも浮かべる (帯まで押しに行かなくてよいように)。Enter でも確定 */
    const go = document.createElement('button');
    go.id = 'arrGo';
    go.type = 'button';
    go.textContent = '確定';
    go.title = 'Enter でも確定できます';
    go.hidden = true;
    document.body.appendChild(go);
    const goAt = new THREE.Vector3();
    const placeGo = () => {
      if (go.hidden || targetSide === null) return;
      const s = slotX(2);
      goAt.set(s[0] + 1.05, s[1], s[2]).project(stage.camera);
      const r = canvas.getBoundingClientRect();
      const x = r.left + (goAt.x + 1) / 2 * r.width, y = r.top + (1 - goAt.y) / 2 * r.height;
      go.style.left = Math.min(window.innerWidth - go.offsetWidth - 8, Math.max(8, x)) + 'px';
      go.style.top = Math.min(window.innerHeight - go.offsetHeight - 8, Math.max(8, y - go.offsetHeight / 2)) + 'px';
    };
    const offFrame = stage.onFrame(placeGo);
    const onKey = (ev) => {
      if (ev.key !== 'Enter' || go.hidden) return;
      if (ev.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(ev.target.tagName)) return;
      ev.preventDefault();
      done();
    };
    window.addEventListener('keydown', onKey);
    const finish = (picks) => {
      closed = true;
      activeArrange = null;
      if (typeof offFrame === 'function') offFrame();
      window.removeEventListener('keydown', onKey);
      go.remove();
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPlate, true);
      canvas.removeEventListener('pointermove', onHover);
      canvas.style.cursor = '';
      /* 板は元の位置へ戻す (決まった並びはこのあとの盤面の更新で滑って入れ替わる) */
      for (const r of releaseTotals) r();
      resetPlates(list);
      ov.remove();
      resolve(picks);
    };
    activeArrange = { cancel: () => finish(PICK_CANCEL), hint: null };
    /* 並べ替えている間、数字 (ラインの合計値) はラインの位置に止めておく (板と一緒に動かさない) */
    const releaseTotals = [ME, AI].filter(s => control || s === targetSide).map(s => panels.holdTotals(s));
    const done = () => finish(control ? { target: targetSide, perm: perm.slice() } : perm.slice());

    const render = () => {
      const isIdentity = perm[0] === 0 && perm[1] === 1 && perm[2] === 2;
      /* 選択と同じ1行の帯 (手札の上)。確定は盤面の板の横に浮かぶボタン (#arrGo) で、どの入れ替えも確定を押してから決まる */
      const s = sourceInfo(req && req.context);
      const d = s && defIndex[s.def];
      const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const text = control
        ? (targetSide === null ? '並べ替えるなら、自分か相手のプロトコルをタップ'
          : (targetSide === ME ? '自分' : '相手') + 'のプロトコルを2つタップして入れ替え (反対側をタップで切り替え)')
        : (targetSide === ME ? '自分' : '相手') + 'のプロトコルを2つタップして入れ替え' + (single ? ' (1回だけ)' : '');
      activeArrange.hint = targetSide === null ? '並べ替えるなら、自分か相手のプロトコルをタップ' : (targetSide === ME ? '自分' : '相手') + 'のプロトコルをタップしてください';
      ov.innerHTML =
        '<div class="pick-ribbon' + (arrPeek ? ' peek' : '') + '">' +
          '<button type="button" class="rb-peek" aria-pressed="' + arrPeek + '" title="帯を透かして盤面を見る" aria-label="盤面を見る">&#128065;</button>' +
          (s ? '<button type="button" class="rb-src" data-def="' + esc(s.def) + '" style="--accent:' + esc(s.color || '#b9a4ff') + '" title="効果を読む">' +
            (d ? '<img alt="" src="' + faceImageURL(d) + '">' : '') + '<b>' + esc(s.name) + '</b></button>' : '') +
          '<span class="rb-q">' + esc(text) + '</span>' +
          ribbonActs((targetSide === null || isIdentity ? '' : '<button type="button" class="rb-btn" id="arrReset">やり直し</button>') +
            (control ? '<button type="button" class="rb-btn skip" id="arrSkip">並べ替えない</button>' : '')) +
        '</div>';
      const peekBtn = ov.querySelector('.rb-peek');
      if (peekBtn) peekBtn.onclick = (ev) => {
        ev.stopPropagation();
        arrPeek = !arrPeek;
        activeArrange.peek = arrPeek;
        render();
        if (arrPeek) UI.toast('触ったカードの効果を見られます (目をもう一度押すと入れ替えに戻ります)', 2200);
      };
      const srcBtn = ov.querySelector('.rb-src');
      if (srcBtn) srcBtn.onclick = (ev) => { ev.stopPropagation(); showCardNoteFor(srcBtn.dataset.def); };

      tapLine = (line, side) => {
        sfx('pick');
        /* コントロール: 反対側の板をタップしたら、そちらを並べ替える (前の側は元に戻す) */
        if (control && side !== undefined && side !== targetSide) {
          resetPlates(list);
          targetSide = side;
          list = platesOf(side);
          perm[0] = 0; perm[1] = 1; perm[2] = 2;
          sel = line;
          layPlates(160);
          render();
          return;
        }
        if (sel === -1) { sel = line; layPlates(160); render(); return; }
        if (sel === line) { sel = -1; layPlates(160); render(); return; }
        /* 1回だけの入れ替えは、もう入れ替えたあとなら元の並びから入れ替え直す */
        if (single && !(perm[0] === 0 && perm[1] === 1 && perm[2] === 2)) { perm[0] = 0; perm[1] = 1; perm[2] = 2; }
        const t = perm[sel]; perm[sel] = perm[line]; perm[line] = t;
        sel = -1;
        layPlates(320);
        render();
      };
      go.hidden = targetSide === null || isIdentity;
      go.onclick = (ev) => { ev.stopPropagation(); done(); };
      placeGo();
      const reset = ov.querySelector('#arrReset');
      if (reset) reset.onclick = () => { perm[0] = 0; perm[1] = 1; perm[2] = 2; sel = -1; layPlates(320); render(); };
      const skip = ov.querySelector('#arrSkip');
      if (skip) skip.onclick = () => finish({ skip: true });
    };
    render();
  });
}

async function drainRequests() {
  if (roomMode) { await roomDrainRequest(); return; }
  let guard = 0;
  while (cur && cur.requests && cur.requests.length && guard++ < 80) {
    await uiHold;                                   // 前の表示 (公開されたカードなど) を閉じてから
    const req = cur.requests[0];
    let picks;
    let fromTsumeAuto = false;                      // 詰めコンパイルの AUTO が答えた (受け付けられなければ AUTO を止める)
    /* タッグで味方が指しているとき・AUTO のときは、自分の側の選択も CPU が答える */
    const cpuMine = req.player === ME && (partnerMove() || autoFor(ME));
    const merged = !demoMode && !cpuMine ? mergedYesTarget(req) : null;
    const mine = req.player === ME && !cpuMine;
    const controlAsk = !demoMode && !tutorial && !trainingMode && mine
      && req.kind === 'option' && req.prompt === 'control-rearrange';
    if (queuedAnswer && (queuedAnswer.id === req.id
        || (queuedAnswer.kind && queuedAnswer.kind === req.kind && queuedAnswer.target === req.target))) {
      picks = queuedAnswer.picks;                   // まとめて答えた選択の続き
      queuedAnswer = null;
    } else if (tsumeAuto && tsumeAuto.length && tsumeAuto[0].type === 'choose' && req.player === ME) {
      /* 詰めコンパイルの AUTO: 模範解答の選択をそのまま答える (選んだものが見えるよう、少し待つ) */
      UI.setPrompt('AUTO が選択しています…', 'wait');
      await TW.wait(TSUME_AUTO_GAP);
      picks = tsumeAuto.shift().picks;
      fromTsumeAuto = true;
    } else if (controlAsk) {
      /* コントロールの「並べ替えますか」は聞かずに、盤面の板で並べ替えるかどうかまで決めてもらう */
      UI.setPrompt('');
      const r = await arrangeOnBoard(req, { control: true });
      if (r === PICK_CANCEL) continue;
      if (r === null) picks = await askUser(req);                       // 一覧で選ぶ
      else if (r.skip) picks = [2];
      else { picks = [r.target === ME ? 0 : 1]; queuedAnswer = { kind: 'arrange', target: r.target, picks: r.perm }; }
    } else if (merged) {
      UI.setPrompt('');
      pickSkip = true;
      let ans;
      try { ans = await askUser(merged); } finally { pickSkip = false; }
      if (ans === PICK_CANCEL) continue;
      if (ans === PICK_SKIP || ans === PICK_BACK || ans === null) picks = [];
      else { picks = ['yes']; queuedAnswer = { id: merged.id, picks: ans }; }
    } else if ((mine || trainingMode) && !demoMode) {
      UI.setPrompt('');
      const forced = forcedPicks(req);
      if (forced) { picks = forced; await showForcedPick(req, forced); }
      else picks = await askUser(req);
    } else {
      UI.setPrompt(spectate ? specName(req.player, cur.state.tag ? cur.state.tag.pilot[req.player] : 0) + ' が選択しています…'
        : req.player === ME ? (autoFor(ME) ? 'AUTO が選択しています…' : '味方が選択しています…') : '相手が選択しています…', 'wait');
      const at = cur;
      const [ans] = await Promise.all([aiAnswer(cur.state, req), TW.wait(260)]);
      if (cur !== at) return;                     // 考えている間に対戦をやめた
      picks = ans;
      /* CPU がコントロールをどう使ったかを、コンパイル (やリフレッシュ) の前にはっきり見せる。並べ替えなかったときも */
      if (req.kind === 'option' && req.prompt === 'control-rearrange' && Array.isArray(picks)) await announceControl(req, picks[0]);
    }
    if (picks === PICK_CANCEL) continue;
    const prev = shown();
    busy = true;
    const answer = picks === PICK_BACK ? { type: 'back', id: req.id } : { type: 'choose', id: req.id, picks };
    const res = Engine.apply(cur.state, answer);
    if (res.error && fromTsumeAuto) {
      /* AUTO の答えが合わない: 黙って待ち続けないよう、理由を出して AUTO を終える (このあとは自分で選べる) */
      tsumeAuto = null;
      UI.toast('AUTO: 模範解答の選択が受け付けられませんでした (' + res.error + ')。ここから先は自分で選べます', 6000);
      busy = false; continue;
    }
    if (res.error) { UI.toast(res.error); busy = false; continue; }   // 再質問へ
    logAction(answer);
    cur = res;
    await replayResolution(prev, res, null);
    /* リフレッシュのひとこと: コントロールの並べ替えを解き終えて、引いたあとに言う (step で待たせたもの) */
    if (refreshSayFor && !(res.requests && res.requests.length)) {
      const r = refreshSayFor;
      refreshSayFor = null;
      avatarSay(r.side, 'refresh', null, r.st, 6000);
    }
    busy = false;
    refreshHud();
  }
  UI.setPrompt('');
  await stage.home(TIMING.camEase);
}

/* AI のターンを回す */
async function afterTurn() {
  if (roomMode) { await announceTurn(); await roomMaybeFinish(); return; }
  if (puzzle) {
    /* 詰めコンパイル・問題も、はじめに自分の番であることを見せる (2回目からは announceTurnFor が出さない) */
    if (!puzzleJudged && cur && cur.state.winner === null && cur.state.turn === ME) await announceTurn();
    if (await tsumeAutoAction()) return;          // AUTO: step が afterTurn をまた呼ぶ
    await puzzleAfterTurn();
    return;
  }
  if (tutorial && await tutorialAfterStep()) return;
  await announceTurn();
  let guardAi = 0;
  while (cur && cur.state.winner === null && (demoMode || cur.state.turn === AI || partnerMove() || autoFor(cur.state.turn))
         && !cur.requests.length && guardAi++ < 40) {
    await uiHold;                                   // 前の表示を閉じてから相手が動く
    await avatarsQuiet();                           // キャラが言い終わってから
    const at = cur;
    const [action] = await Promise.all([aiAction(cur.state), TW.wait(demoMode ? 420 : 260)]);
    if (cur !== at) return;                       // 考えている間に対戦をやめた
    if (!action) break;
    await step(action);
    return;   // step が再帰的に afterTurn を呼ぶ
  }
  if (oppTurn && cur && (cur.state.turn === ME || cur.state.winner !== null)) {
    const o = oppTurn;
    oppTurn = null;
    if (cur.state.winner === null && settings().oppSummary) showOppSummary(o, cur.state);
  }
  refreshHud();
  syncAssist();
  if (cur.state.winner !== null && !resultShown) {
    resultShown = true;
    fadeOutBgm();                                   // 決着したら BGM は引いて、勝ち・負けの音だけにする
    CW.battleEnded(); RS.endResume();
    const win = cur.state.winner === ME;
    /* 遊ばれ方の匿名の記録 (ログインしていない人も。チュートリアルも数える) */
    /* AUTO (管理者の自動プレイ) で指した対戦も数える (戦績・経験値の動きを確かめるためのもの) */
    if (!trainingMode && !puzzle && !demoMode && !roomMode) {
      logPlay({ mode: storyNode ? 'story' : runMode ? runKind : tutorial ? 'tutorial' : tagMates ? 'tag' : quickGame ? 'quick' : 'cpu', win, level: aiDifficulty,
        me: ownProtos(cur.state, ME), opp: ownProtos(cur.state, AI),
        turns: (cur.state.turns || 0) + 1, logged: !!accountState().user });
    }
    const levelBefore = myLevel;
    let newConq = [];     // この1戦で新しく制覇した (最強に初めて勝った) プロトコル
    if (!trainingMode && !puzzle && !demoMode && !roomMode && !tutorial && !storyNode) {
      matchGains = { xp0: playerLevel(localRecords(), bonusXp()).xp, chip0: earnedChips(), lv0: myLevel, daily: [], trophies: [] };
    }
    /* チュートリアルとストーリーは戦績・リプレイ・実績に数えない */
    if (!trainingMode && !puzzle && !demoMode && !roomMode && !tutorial && !storyNode) {
      const st0 = cur.state;
      newConq = newlyConquered(localRecords(), { win, level: aiDifficulty, me: ownProtos(st0, ME), opp: ownProtos(st0, AI) });
      /* タッグは、自分が持ってきた3つで記録する (習熟度・デイリーも自分のプロトコルで数える) */
      recordSoloResult(ownProtos(st0, ME), ownProtos(st0, AI), win, aiDifficulty,
        { turns: (st0.turns || 0) + 1,       // 決着した手番も1つと数える
          cards: ((st0.tally && st0.tally.faceUp[ME]) || []).slice(),
          effects: (st0.tally && st0.tally.effects && st0.tally.effects[ME]) || {},
          mode: runMode ? runKind : tutorial ? 'tutorial' : tagMates ? 'tag' : quickGame ? 'quick' : 'cpu', short: shortMatch });
      refreshCardGlow();
      if (replayLog) {
        const rep = { me: replayLog.init.p0, opp: replayLog.init.p1, win, level: aiDifficulty,
          turns: (st0.turns || 0) + 1, kind: runMode ? runKind : null, init: replayLog.init, actions: replayLog.actions };
        lastReplayId = addReplay(rep);
        uploadReplay({ ...rep, at: Date.now(), mode: tagMates ? 'tag' : quickGame ? 'quick' : runMode ? runKind : 'cpu' });
        replayLog = null;
      }
    }
    /* 観戦は A / B の勝ちで見せ、ベットを払い戻す */
    if (spectate) { await spectateEnd(win); return; }
    /* 物語の決着は、そのあとの会話 (winLines / loseLines) が語る */
    if (!storyNode) {
      avatarSay(ME, win ? 'win' : 'lose');
      setTimeout(() => avatarSay(AI, win ? 'lose' : 'win'), 900);
    }
    UI.setPrompt(win ? 'あなたの勝ち' : '敗北', 'end');
    const victory = cosmetic('victory', 'default');
    sfx(win ? (victory === 'aurora' ? 'winAurora' : 'win') : 'lose');
    await finaleFx(win);
    FEEL.buzz(win ? [40, 70, 40, 70, 120] : [160]);
  /* 物語の決着は、勝ち・負けの言葉を出さない */
  await UI.resultCutIn(win, storyNode ? { victory, title: win ? 'COMPILED' : 'OVERWRITTEN' } : { victory });
    /* 最強に新しいプロトコルで勝った: 制覇の数を刻む */
    if (newConq.length) {
      await UI.conquerCutIn(newConq.map(n => ({ name: n, color: (protoIndex[n] || {}).color })), conquered(localRecords()).size,
        conquerable(Object.keys(protoIndex)).length, { auto: autoPlay });
    }
    /* レベルが上がったら、手に入った報酬を見せる */
    if (myLevel > levelBefore) await UI.levelUpCutIn(myLevel, rewardsBetween(levelBefore, myLevel));
    if (!trainingMode && !puzzle && !demoMode && !roomMode && !tutorial && !storyNode) await afterGameProgress(cur.state, ME, win, aiDifficulty, false);
    if (win && !trainingMode && !puzzle && !demoMode && !roomMode) maybeLoginHint('firstWin');
    if (demoMode) {
      await TW.wait(900);
      location.reload();
      return;
    }
    if (storyNode) { await storyAfterGame(win); return; }
    if (runMode) {
      if (!runEnded) {
        runEnded = true;
        /* クリアした瞬間 (battle → clear) にだけ経験値を足す */
        if (runKind === 'weekly') {
          /* 対戦中に週が変わっても、挑戦した週 (保存してある week) で数える */
          const was = loadStoredWeekly();
          showWeeklyAfterGame(win, Object.values(protoIndex));
          const after = loadStoredWeekly();
          if (was.phase === 'battle' && after.phase === 'clear' && after.week === was.week) {
            await gainXp('weekly', XP_GAIN.weeklyClear, 'wk:' + was.week, true);
            await gainXp('weekly', XP_GAIN.weeklyBonus, 'wkb:' + was.week);
          }
        } else {
          const was = loadRun();
          showRunAfterGame(win, compilesBy(cur.state, AI), Object.values(protoIndex));
          if (win) maybeLoginHint('runWin');
          const now = loadRun();
          if (was && was.phase === 'battle' && now && now.phase === 'clear') await gainXp('run', XP_GAIN.runClear);
        }
      }
      return;
    }
    showEndActions(win);
  }
}

/* ストーリーの決着: 勝てばクリア (初めてなら経験値。章を終えたらさらに)、決着の会話 → 次へ / もう一度 */
async function storyAfterGame(win) {
  const node = storyNode;
  const before = STORY.loadStory();
  const had = STORY.isCleared(before, node.id);
  const after = STORY.finishBattle({ ...before, pending: node.id }, win);
  STORY.saveStory(after);
  if (win && !had) {
    await gainXp('story', XP_GAIN.storyBattle, 'st:' + node.id);
    if (STORY.chapterCleared(after, node.chapter)) await gainXp('story', XP_GAIN.storyChapter, 'stc:' + node.chapter);
  }
  const go = (q) => { location.href = location.pathname + q; };
  await showStoryResult(win, node, {
    next: () => go('?story=1'),
    map: () => go('?story=1'),
    retry: () => { STORY.saveStory(STORY.startBattle(STORY.loadStory(), node.id)); go('?story=1&play=1'); },
    title: () => go('')
  });
}

/* 決着の画面に出す「次の目標」: 次のレベルまでの経験値と、今日のデイリーミッションの残り */
function nextGoalsHtml() {
  if (roomMode && !localRecords().length) return '';
  const pl = playerLevel(localRecords(), bonusXp());
  let daily = '';
  try {
    const list = dailyView(Object.keys(protoIndex));
    const left = list.filter(m => !m.done);
    daily = left.length ? 'DAILY ' + (list.length - left.length) + '/' + list.length + ' — 次: ' + left[0].text : 'DAILY 3/3 達成';
  } catch (e) { daily = ''; }
  return '<div class="end-goals"><span><b>LV ' + pl.level + '</b> 次まで ' + (pl.next - pl.xp) + ' XP</span>' +
    '<i style="--p:' + Math.round(pl.progress * 100) + '%"></i>' + (daily ? '<span>' + daily.replace(/[<>&]/g, '') + '</span>' : '') + '</div>';
}

/* この試合で手に入ったもの: 経験値・CHIP・デイリー・実績・レベル。数字は数え上げ、1行ずつ配るように出す */
function gainsHtml() {
  if (!matchGains) return '';
  const xp = playerLevel(localRecords(), bonusXp()).xp - matchGains.xp0;
  if (xp <= 0 && !matchGains.daily.length && !matchGains.trophies.length) return '';
  const chips = chipsOf(loadGacha(), earnedChips());
  const gotChips = earnedChips() - matchGains.chip0;
  const esc = (t) => String(t).replace(/[<>&"]/g, '');
  const rows = [];
  if (xp > 0) {
    rows.push('<li class="eg-num"><small>経験値</small><b data-from="0" data-to="' + xp + '" data-plus="1">+' + xp + '</b></li>');
    rows.push('<li class="eg-num"><small>CHIP</small><b data-from="' + Math.max(0, chips - gotChips) + '" data-to="' + chips + '">' + chips + '</b><em>+' + gotChips + '</em></li>');
  }
  if (myLevel > matchGains.lv0) rows.push('<li class="eg-lv"><small>レベル</small><b>LV ' + matchGains.lv0 + ' → ' + myLevel + '</b></li>');
  for (const t of matchGains.daily) rows.push('<li class="eg-daily"><small>デイリー達成</small><span>' + esc(t) + '</span></li>');
  for (const t of matchGains.trophies) rows.push('<li class="eg-trophy"><small>実績</small><span>' + esc(t) + '</span></li>');
  return '<ul class="end-gains" aria-label="この試合で手に入ったもの">' + rows.join('') + '</ul>';
}
function playGains(el) {
  const rows = el.querySelectorAll('.end-gains li');
  dealIn(rows, { stagger: 150, delay: 120 });
  rows.forEach((li, i) => {
    const b = li.querySelector('b[data-to]');
    if (!b) return;
    const plus = b.dataset.plus === '1';
    countUp(b, +b.dataset.from, +b.dataset.to, { delay: 120 + i * 150 + 200, ms: 900, fmt: (n) => (plus ? '+' : '') + n });
  });
}

/* 対局後の導線。盤面は残したまま、次の行動を選べるようにする */
/* タイトルへ: URL の対戦の指定 (?me=&ai=&lv= や ?quick=1) を外して開き直す。
   読み直すだけだと、REMATCH やおまかせのあとで同じ対戦がまた始まっていた */
function goTitle() { location.href = location.pathname; }

function showEndActions(win) {
  let el = document.getElementById('endBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'endBar';
    document.body.appendChild(el);
  }
  const underdogWin = win && aiDifficulty === UNDERDOG_LEVEL;
  if (underdogWin) celebrateUnderdog();
  el.innerHTML =
    '<div class="end-title">' + (underdogWin ? '下剋上 達成！' : win ? 'あなたの勝ち' : '敗北') + '</div>' +
    gainsHtml() +
    nextGoalsHtml() +
    (underdogWin ? '<div class="end-sub">最弱のデッキで最強に勝ちました。称号 GIANT SLAYER・専用スリーブとマーカー・+' + UNDERDOG_XP + ' XP</div>' : '') +
    '<div class="end-btns">' +
      '<button class="arr-btn ok" id="endAgain" type="button">REMATCH</button>' +
      '<button class="arr-btn" id="endTop" type="button">TITLE</button>' +
      '<button class="arr-btn" id="endBoard" type="button">BOARD</button>' +
      ((gameHistory.length && !roomMode && !puzzle) || (roomMode && onlineReview) ? '<button class="arr-btn" id="endReview" type="button">REVIEW</button>' : '') +
      (lastReplayId ? '<button class="arr-btn" id="endSave" type="button">SAVE REPLAY</button>' : '') +
      (lastReplayId ? '<button class="arr-btn" id="endShare" type="button">SHARE</button>' : '') +
    '</div>';
  el.classList.add('show');
  playGains(el);
  /* 出た直後のタップは受けない: 決着の演出を送ろうと連打していた指が、出てきた REMATCH に当たって次の対戦が始まっていた */
  const btns = el.querySelectorAll('.end-btns button');
  btns.forEach(x => { x.disabled = true; });
  setTimeout(() => btns.forEach(x => { x.disabled = false; }), 900);
  const saveBtn = el.querySelector('#endSave');
  if (saveBtn) {
    saveBtn.onclick = () => {
      const r = pinReplay(lastReplayId, true);
      UI.toast(r.ok ? 'リプレイを保存しました (RECORD → REPLAYS で見られます)' : r.message, 2600);
      if (r.ok) { saveBtn.disabled = true; saveBtn.textContent = 'SAVED'; }
    };
  }
  const shareBtn = el.querySelector('#endShare');
  if (shareBtn) shareBtn.onclick = () => shareReplayById(lastReplayId);
  const reviewBtn = el.querySelector('#endReview');
  if (reviewBtn) reviewBtn.onclick = () => {
    el.classList.remove('show');
    /* オンライン: サーバーの棋譜から作り直した盤面で振り返る (後攻の部屋の人は左右を入れ替えた盤面) */
    if (roomMode && onlineReview) startReview(win, onlineReview.history, null, onlineReview.final);
    else startReview(win);
  };
  /* どちらもページを作り直す。シーンを組み直すのが最も確実 */
  /* もう1戦: 同じ組み合わせ・同じ強さで、タイトルと準備を飛ばして始め直す (勝ち抜き戦・オンラインは除く) */
  el.querySelector('#endAgain').onclick = () => {
    const st0 = cur && cur.state;
    if (!roomMode && !runMode && lastSetup && st0) {
      const q = new URLSearchParams({ me: lastSetup.p0.join(','), ai: lastSetup.p1.join(','), lv: String(aiDifficulty ?? 0) });
      /* タッグは味方どうしの3つも同じで */
      if (lastSetup.mates) { q.set('tag', '1'); q.set('mate', lastSetup.mates.p0.join(',')); q.set('omate', lastSetup.mates.p1.join(',')); }
      location.href = location.pathname + '?' + q.toString();
      return;
    }
    location.hash = ''; location.reload();
  };
  el.querySelector('#endTop').onclick = goTitle;
  el.querySelector('#endBoard').onclick = () => {
    el.classList.remove('show');
    UI.setPrompt('盤面を確認中 — 右下の「結果を見る」で戻れます', 'end');
    /* 決着演出の斜めの寄りのままでは盤面が読めないので定位置へ戻す */
    stage.home(600);
    showEndFloat();
  };
}

/* 感想戦: 棋譜を1手ずつ戻して見る。自分の手番では AI のおすすめも出す */
function startReview(win, history, onExit, finalState) {
  const final = finalState || cur.state;
  const list = history || gameHistory;
  UI.setPrompt('');
  stage.home(400);
  /* 試合後の分かれ目: 各手を指す前の盤面の点数 (自分から見て) → 優勢の推移と、流れが大きく動いた手 */
  let adv = null, turning = [];
  try {
    adv = advantageSeries(list.map(h => withoutTrace(() => Engine.ai.score(h.st, ME))).concat(withoutTrace(() => Engine.ai.score(final, ME))));
    turning = turningPoints(adv);
  } catch (e) { adv = null; }
  openReview(list, final, {
    adv, turning,
    show: (st) => {
      reviewView = st === final ? null : st;
      board.clearCandidates();
      board.syncInstant(shown());
      syncPanels(shown(), false);
      refreshHud();
    },
    describe: describeAction,
    suggest: (st) => withoutTrace(() => Engine.ai.action(st)),
    same: (a, b) => !!a && !!b && a.type === b.type && a.card === b.card && a.line === b.line
      && !!a.faceUp === !!b.faceUp && (a.side ?? null) === (b.side ?? null),
    isMine: (st) => st.turn === ME,
    onExit: () => { reviewView = null; if (onExit) onExit(); else showEndActions(win); }
  });
}

/* 保存したリプレイを見る: 決着の盤面を出してから、1手目から見返す (感想戦と同じ帯) */
/* リプレイを共有する (リンクを端末の共有メニューへ。無ければコピー) */
async function shareReplayById(id) {
  const rep = getReplay(id);
  if (!rep) { UI.toast('リプレイが見つかりません'); return; }
  const r = await shareReplayLink(rep, 'COMPILE のリプレイ — ' + rep.me.join(' / ') + ' vs ' + rep.opp.join(' / '));
  if (r === 'copied') UI.toast('リプレイのリンクをコピーしました。貼り付けて送れます', 2800);
  else if (r === 'failed') UI.toast('リンクを作れませんでした', 2600);
}

function startReplayView(built) {
  const rep = replayMode;
  const when = new Date(rep.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  UI.toast((rep.shared ? '共有されたリプレイ — ' : 'REPLAY — ') + when + '　' + rep.me.join(' / ') + ' vs ' + rep.opp.join(' / ') + (rep.win ? '　勝ち' : '　負け'), 3600);
  /* カードやルールを直したあとだと、古い棋譜は途中から合わなくなる */
  if (!built.ok) UI.toast(rep.shared ? 'ルールが変わったため、途中までしか再現できません (そこまでを見られます)' : '途中から再現できませんでした (そこまでを見られます)', 4200);
  if (!built.history.length) { UI.toast('見られる手がありません'); return; }
  busy = true;                        // 見ている間は盤面から手を指せないように
  startReview(!!rep.win, built.history, () => { location.href = location.pathname; });
}

/* 棋譜の1手を文にする。相手の裏向きは中身を出さない */
function describeAction(a, st, noWho) {
  const who = noWho ? '' : (st.turn === ME ? 'あなた: ' : '相手: ');
  if (!a) return '';
  if (a.type === 'play') {
    const side = a.side ?? st.turn;
    const c = st.cards[a.card];
    const visible = c && (a.faceUp || st.turn === ME || ((c.knownTo || 0) & (1 << ME)));
    const d = visible && defIndex[c.def];
    return who + (d ? d.proto + ' ' + d.value : '裏向きのカード') + ' を ' +
      (side !== st.turn ? '相手の ' : '') + st.players[side].protocols[a.line].name + ' のラインに' +
      (a.faceUp ? '表' : '裏') + 'で置く';
  }
  if (a.type === 'refresh') return who + 'リフレッシュ';
  return who + a.type;
}

/* ---------- 遊びやすさの補助 (待った・おすすめの手・自動で選ぶ・相手の番のまとめ・ログから光らせる) ---------- */
/* 待ったとおすすめの手を使える対戦: ふつうの CPU 戦だけ (勝ち抜き戦・週替わり・オンライン・問題・練習では使わない) */
function assistGame() {
  return !roomMode && !runMode && !puzzle && !tutorial && !trainingMode && !demoMode && !replayMode;
}
/* いま自分が操作する番か (自分の手番で選択待ちが無い、または自分への選択待ち) */
function myMoment() {
  if (!cur || cur.state.winner !== null || busy) return false;
  return cur.requests.length ? cur.requests[0].player === ME && !partnerMove() : humanTurn(cur.state);
}
function syncAssist() {
  const undoBtn = document.getElementById('btnUndo');
  const hintBtn = document.getElementById('btnHint');
  const game = assistGame() && !!cur;
  /* オンライン: サーバーが戻せると言っている手だけ (自分の番の中で、引く・公開・相手の選択が入っていない手。レート戦は無し) */
  if (undoBtn && roomMode) {
    undoBtn.hidden = roomWatching || !(roomRm && roomRm.canUndo);
    undoBtn.disabled = busy;
  } else if (undoBtn) {
    undoBtn.hidden = !game || !undoPoint;
    undoBtn.disabled = !myMoment();
  }
  if (hintBtn) {
    hintBtn.hidden = !game || !settings().beginner;          // 初心者モードのときだけ
    hintBtn.disabled = !myMoment() || !!(cur && cur.requests.length);
  }
}
/* オンラインの1手取り消し (サーバーが戻せる手だけ受け付ける) */
async function roomUndo() {
  if (!roomRm || busy || !roomRm.canUndo) return;
  let next;
  try { next = await ROOM.roomApi('undo', { code: roomRm.code }); } catch (e) { UI.toast(e.message || 'いまは戻せません'); return; }
  cancelPendingAsk();
  deselect();
  await roomApplyView(next, true);
  UI.toast('1手戻しました', 1600);
  syncAssist();
}
/* 待った: 自分の最後の手の直前へ戻す (相手がそのあと指した手も戻る)。1手だけ */
function undoLastMove() {
  refreshSayFor = null;
  if (!undoPoint || !myMoment()) { UI.toast('いまは戻せません'); return; }
  const p = undoPoint;
  undoPoint = null;
  queuedAnswer = null;
  oppTurn = null;
  cur = p.cur;                         // 先に戻す (選択待ちを閉じると、処理の続きは戻した盤面を見て止まる)
  avatarHush(cur.state);
  if (replayLog) replayLog.actions.length = p.replayLen;
  RS.truncateResume(p.resumeLen);
  gameHistory.length = p.histLen;
  cancelPendingAsk();
  deselect();
  board.syncInstant(shown());
  syncPanels(shown(), false);
  UI.pushLog(['— 1手戻しました —']);
  logShown = [];
  UI.setPrompt('');
  refreshHud();
  syncAssist();
  UI.toast('1手戻しました', 1600);
  /* 戻した盤面が CPU (タッグの味方・相手) の番なら、CPU に指させ直す */
  if (!myMoment()) afterTurn();
}
/* おすすめの手: CPU ならどう打つかを考えて、そのカードを光らせ、文で出す */
async function showHint() {
  if (!myMoment() || cur.requests.length) { UI.toast('自分の番に使えます'); return; }
  const at = cur;
  const btn = document.getElementById('btnHint');
  if (btn) btn.disabled = true;
  let a = null;
  try { a = await aiAction(cur.state); } catch (e) { a = null; }
  if (cur !== at) return;
  syncAssist();
  if (!a) { UI.toast('おすすめの手が見つかりませんでした'); return; }
  const st = shown();
  if (a.type === 'play' && a.card) {
    const d = st.cards[a.card] && defIndex[st.cards[a.card].def];
    board.pulse(a.card, d ? d.color : null, 900);
  }
  UI.toast('おすすめ: ' + describeAction(a, cur.state, true), 4200);
}
/* 選べるものが1つしかない選択 (設定で切れる)。その答え (無ければ null) */
function forcedPicks(req) {
  if (!settings().autoPick || tutorial || trainingMode || roomMode) return null;
  if (req.kind === 'pickLine') return Array.isArray(req.lines) && req.lines.length === 1 ? [req.lines[0]] : null;
  if (req.kind === 'pickCard' || req.kind === 'pickHand') {
    const min = req.min !== undefined ? req.min : 1;
    const c = req.candidates;
    if (min >= 1 && Array.isArray(c) && c.length === min && c.every(x => typeof x === 'string')) return c.slice();
  }
  return null;
}
/* 自動で選んだことが分かるよう、選んだカードを光らせて一言出す */
async function showForcedPick(req, picks) {
  const st = shown();
  showSourcePanel(req);                 // 何の効果で自動で選んだのかを左の詳細にも (ほかの選択と同じ)
  pickPanelReq = null;
  const names = picks.map(u => (typeof u === 'string' ? cardName(u) : null)).filter(Boolean);
  UI.toast('選べるのが1つだけなので自動で選びました' + (names.length ? ': ' + names.join(' / ') : ''), 1800);
  const first = picks[0];
  if (typeof first === 'string' && st.cards[first]) {
    const d = defIndex[st.cards[first].def];
    await board.pulse(first, d ? d.color : null, 520);
  } else {
    await TW.wait(420);
  }
}
/* 相手の番のまとめ: 相手が出した手と、コンパイルしたプロトコル。触れるか数秒で消える */
let oppSummaryTimer = null;
function showOppSummary(o, st) {
  const lines = o.lines.slice();
  for (let l = 0; l < 3; l++) {
    const a = o.start.players[AI].protocols[l], b = st.players[AI].protocols[l];
    if (a && b && !a.compiled && b.compiled) lines.push(b.name + ' をコンパイル');
  }
  if (!lines.length) return;
  let el = document.getElementById('oppSummary');
  if (!el) {
    el = document.createElement('div');
    el.id = 'oppSummary';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = '';
  const head = document.createElement('b');
  head.textContent = '相手の番';
  const list = document.createElement('ol');
  for (const t of lines) {
    const li = document.createElement('li');
    li.textContent = t;
    list.append(li);
  }
  el.append(head, list);
  el.classList.add('show');
  const hide = () => { el.classList.remove('show'); clearTimeout(oppSummaryTimer); };
  el.onclick = hide;
  clearTimeout(oppSummaryTimer);
  oppSummaryTimer = setTimeout(hide, 3200 + lines.length * 1400);
}
/* ログに出たカードが盤面・自分の手札のどこにあるかを光らせる (見えているカードだけ) */
function pulseVisible(defId, color) {
  const st = shown();
  if (!st || !st.cards) return;
  for (const [uid, c] of Object.entries(st.cards)) {
    if (c.def !== defId) continue;
    const seen = c.faceUp || ((c.knownTo || 0) & (1 << ME)) || c.zone === 'hand' + ME;
    if (seen && (c.zone === 'field' || c.zone === 'hand' + ME)) board.pulse(uid, color, 800, { still: true });
  }
}

/* 「盤面を見る」で隠したあと、戻る手段だけ小さく残す */
function showEndFloat() {
  let el = document.getElementById('endFloat');
  if (!el) {
    el = document.createElement('div');
    el.id = 'endFloat';
    document.body.appendChild(el);
    /* 結果を見る: 盤面を見たあと、対戦後の窓 (REMATCH・REVIEW・SAVE など) へ戻る。前は戻れず、タイトルへ行くしかなかった */
    el.innerHTML = '<button class="btn" type="button" id="endFloatBack">結果を見る</button>' +
      '<button class="btn" type="button" id="endFloatTop" style="margin-left:8px">タイトルへ</button>';
    el.querySelector('#endFloatTop').onclick = goTitle;
    el.querySelector('#endFloatBack').onclick = () => {
      const bar = document.getElementById('endBar');
      if (!bar) return;
      el.classList.remove('show');
      UI.setPrompt('');
      bar.classList.add('show');
    };
  }
  el.classList.add('show');
}

/* 捨て札一覧 (両者とも公開情報) */
function showTrash(side) {
  const st = shown();
  const list = st.players[side].trash.slice().reverse();
  const items = list.map((u) => {
    const d = defIndex[st.cards[u].def];
    return d ? { img: faceImageURL(d), label: d.proto + ' ' + d.value } : null;
  }).filter(Boolean);
  if (!items.length) { UI.toast('捨て札はありません'); return; }
  UI.showPile((side === ME ? 'あなた' : '相手') + 'の捨て札 (' + items.length + '枚・新しい順)', items);
}

/* プロトコル板をタップ: そのラインのスタックを上から一覧で見せる。
   見る権利のない裏向きは裏面のまま (中身は出さない) */
function showStack(line, side) {
  const st = shown();
  const proto = st.players[side].protocols[line];
  const owner = side === ME ? 'あなた' : '相手';
  const stack = st.lines[line][side].slice().reverse();
  if (!stack.length) { UI.toast(owner + 'の ' + proto.name + ' にカードはありません'); return; }
  const items = stack.map((u) => {
    const c = st.cards[u];
    const known = c.faceUp || ((c.knownTo || 0) & (1 << ME));
    const d = known && defIndex[c.def];
    if (!d) return { img: backImageURL(), label: '裏向き (値2)' };
    return { img: faceImageURL(d), label: d.proto + ' ' + d.value + (c.faceUp ? '' : ' / 裏向き (値2)') };
  });
  UI.showPile(owner + 'の ' + proto.name + ' のスタック (' + items.length + '枚・上から / 合計 ' +
    totalOf(st, line, side) + ')', items);
}

/* 宣言 (LUCK 0 / LUCK 3): 宣言した内容と当否を画面中央で見せる */
let lastAnnounceTag = '';
async function checkAnnounce(st) {
  const a = st && st.announce;
  if (!a) return;
  const tag = [a.seq, a.kind, a.player, a.what, a.value, a.card, a.hit].join('|');
  if (tag === lastAnnounceTag) return;
  lastAnnounceTag = tag;
  const who = a.player === ME ? 'あなた' : '相手';
  const src = a.context ? cardName(a.context) : '';
  if (a.kind === 'declare') {
    await UI.declareCutIn({
      label: who + 'の宣言 / ' + (a.what === 'protocol' ? 'プロトコル' : '値'),
      value: a.value, tone: 'call', note: src
    });
    return;
  }
  if (a.kind === 'declareResult') {
    const d = a.card ? defIndex[a.card] : null;
    await UI.declareCutIn({
      label: a.hit ? '的中' : 'はずれ',
      value: a.value,
      tone: a.hit ? 'hit' : 'miss',
      note: d ? d.proto + ' ' + d.value : (a.card || '該当なし')
    });
  }
}

/* 手札公開 (PSYCHIC 0 等): st.revealed の変化を検知して公開ハンドを見せる。
   閉じるまで対戦を先へ進めない (uiHold。再生の各コマ・相手の手・選択の前に待つ) */
let lastRevealTag = '';
let uiHold = Promise.resolve();
function checkRevealed(st) {
  const r = st && st.revealed;
  if (!r || !Array.isArray(r.cards)) return uiHold;
  /* CLARITY 1 のデッキトップ公開は自分の効果でも公開情報。従来は自分が
     公開したものを一律で抑止していたため、カードが一切見えなかった。 */
  const showOwn = r.kind === 'deck' || r.kind === 'card';
  if (r.player === ME && !showOwn) return uiHold;
  /* seq (発生順) を含めないと、同じ内容の公開が2回目以降に出なくなる */
  const tag = (r.seq === undefined ? '' : r.seq + '#') + r.player + ':' + r.cards.join(',');
  if (tag === lastRevealTag) return uiHold;
  lastRevealTag = tag;
  const who = r.player === ME ? 'あなた' : '相手';
  const title = r.kind === 'deck' ? who + 'のデッキが公開された (' + r.cards.length + '枚)'
    : r.kind === 'hand' ? who + 'の手札が公開された'
    : who + 'がカードを公開した';
  uiHold = UI.showRevealedHand(r.cards.map((id) => {
    const d = defIndex[id];
    return d ? { img: faceImageURL(d), label: d.proto + ' ' + d.value } : null;
  /* 観戦・AUTO (押す人がいない) では、決めた秒数で閉じて先へ進む */
  }).filter(Boolean), title, demoMode ? { autoClose: 4 } : autoPlay && !roomMode ? { autoClose: 3 } : undefined);
  return uiHold;
}

/* 画面リサイズ/回転: カメラは stage が追従するが、手札や山札の実配置は
   状態遷移時にしか書き直されないため、ここで取り直す */
let relayoutTimer = null;
function onViewportChanged() {
  syncHandDrawerForViewport();
  /* 横 → 縦に回したとき: 横で出ていた詳細ウインドウ (左上) は縦では使わない (縦は触ったカードの小さな説明を出す)。
     残すと画面の真ん中で選択の帯に重なるので片付ける */
  if (isCompactHandUI()) { previewUid = null; pickPanelReq = null; UI.hideCardPanel(); }
  clearTimeout(relayoutTimer);
  const attempt = (n) => {
    const st = shown();
    if (st && board && !busy) { board.syncInstant(st); return; }
    if (n < 20) relayoutTimer = setTimeout(() => attempt(n + 1), 300);   // 演出中は後で再試行
  };
  relayoutTimer = setTimeout(() => attempt(0), 220);
}
window.addEventListener('resize', onViewportChanged);
/* カメラが画面の大きさに合わせ直したあとで数える (合わせ直しは少し遅れることがあるので、もう一度あとでも) */
function placeDialogsSoon() {
  clearTimeout(dlgTimer);
  dlgTimer = setTimeout(() => { placeDialogsNearBoard(); dlgTimer = setTimeout(placeDialogsNearBoard, 900); }, 400);
}
window.addEventListener('resize', placeDialogsSoon);
window.addEventListener('compile:viewport', placeDialogsSoon);

/* PC の広い画面では、選ぶ帯・発動の帯・選択肢の一覧を画面の右上の隅ではなく「盤面の右上の角のすぐ外」に出す。
   盤の奥の右の角が画面のどこに写るかを数え、CSS の --dlg-x / --dlg-y に入れる (はみ出す分は CSS が右端で止める) */
let dlgTimer = null;
function placeDialogsNearBoard() {
  if (!stage || !stage.camera) return;
  const root = document.documentElement.style;
  const w = window.innerWidth, h = window.innerHeight;
  const corners = [-1, 1].map((sz) => {
    const v = new THREE.Vector3(MAT_W / 2, 0, sz * MAT_D / 2).project(stage.camera);
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h };
  });
  const far = corners[0].y < corners[1].y ? corners[0] : corners[1];      // 画面の上に写る方が奥の角
  if (!Number.isFinite(far.x) || far.x <= 0 || far.x >= w) { root.removeProperty('--dlg-x'); root.removeProperty('--dlg-y'); return; }
  root.setProperty('--dlg-x', Math.round(far.x + 18) + 'px');
  root.setProperty('--dlg-y', Math.round(Math.max(44, far.y)) + 'px');
}
/* ゲームパッド (gamepad.js) で指せる盤面の物。画面の座標で返す:
   自分の手札 (hand)・場のカード (説明を読む)・選んでいる途中の候補・置けるライン (光っている置き場) */
const gpV = new THREE.Vector3();
/* 物の表面の四つの角 (その物の座標)。カードは横たわった長方形 (CARD.w × CARD.h)、置き場は平らな板の形から。
   物まるごとの箱で測ると、まわりの光や影の板まで入って、枠が大きくずれていた */
function gpCorners(obj) {
  if (obj.userData && obj.userData.uid) {
    const w = CARD.w / 2, h = CARD.h / 2, y = CARD.thickness / 2;
    return [[-w, y, -h], [w, y, -h], [w, y, h], [-w, y, h]];
  }
  const g = obj.geometry;
  if (!g) return null;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox;
  const ex = b.max.x - b.min.x, ey = b.max.y - b.min.y, ez = b.max.z - b.min.z;
  if (ey <= ex && ey <= ez) return [[b.min.x, 0, b.min.z], [b.max.x, 0, b.min.z], [b.max.x, 0, b.max.z], [b.min.x, 0, b.max.z]];
  if (ez <= ex && ez <= ey) return [[b.min.x, b.min.y, 0], [b.max.x, b.min.y, 0], [b.max.x, b.max.y, 0], [b.min.x, b.max.y, 0]];
  return [[0, b.min.y, b.min.z], [0, b.max.y, b.min.z], [0, b.max.y, b.max.z], [0, b.min.y, b.max.z]];
}
function gamepadTargets() {
  if (!stage || !board || !cur) return [];
  const st = shown();
  if (!st) return [];
  const r = stage.renderer.domElement.getBoundingClientRect();
  /* 画面の上の四隅 (quad) と、それを囲む四角 */
  const rectOf = (obj) => {
    const cs = gpCorners(obj);
    if (!cs) return null;
    obj.updateWorldMatrix(true, false);
    const quad = [];
    for (const [x, y, z] of cs) {
      gpV.set(x, y, z).applyMatrix4(obj.matrixWorld).project(stage.camera);
      if (gpV.z > 1) return null;                     // カメラの後ろ
      quad.push([r.left + (gpV.x + 1) / 2 * r.width, r.top + (1 - gpV.y) / 2 * r.height]);
    }
    const xs = quad.map(p => p[0]), ys = quad.map(p => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0, quad };
  };
  const out = [];
  const seen = new Set();
  /* 選ぶ場面では候補だけを当たりにする (押したときと同じ) */
  const cands = boardPick && boardPick.req && Array.isArray(boardPick.req.candidates) ? new Set(boardPick.req.candidates) : null;
  const accept = cands ? (ud) => !!ud.uid && cands.has(ud.uid) : (ud) => !!ud.uid;
  if (gpPickAt) stage.scene.updateMatrixWorld(true);
  const addCard = (uid, hand) => {
    if (seen.has(uid)) return;
    const obj = board.cards.get(uid);
    if (!obj || !obj.visible) return;
    const rc = rectOf(obj);
    if (!rc) return;
    seen.add(uid);
    /* 場のカードは、押したら本当にそのカードに当たる点を探す。重なったカードや手札に隠れたカードは、
       枠の真ん中が別のカードの上になり、A で別のカードを押していた (重なった SPEED の一番上が選べなかった) */
    const hit = hand ? null : gpHitPoint(uid, rc.quad, r, accept);
    out.push({ key: 'c:' + uid, hand, ...rc, ...(hit ? { hit } : {}) });
  };
  for (const uid of st.players[ME].hand) addCard(uid, true);
  if (boardPick && boardPick.req && Array.isArray(boardPick.req.candidates)) {
    for (const c of boardPick.req.candidates) if (typeof c === 'string' && !c.includes('|')) addCard(c, false);
  }
  /* 捨て札の山 (押すと中身の一覧。公開情報)。詰めコンパイルでは自分の山札も (押すと中身) */
  if (!boardPick) {
    for (const s of [ME, 1 - ME]) { const tr = st.players[s].trash; if (tr.length) addCard(tr[tr.length - 1], false); }
    const dk = st.players[ME].deck;
    if (puzzle && puzzle.tsume && dk.length) addCard(dk[0], false);
  }
  /* 場のカード (いちばん上の札だけ。重なった下の札は、上の札を指せば一覧で読める) */
  for (const line of st.lines) for (const side of [0, 1]) { const stack = line[side]; if (stack.length) addCard(stack[stack.length - 1], false); }
  /* プロトコルの板: 並べ替え (効果・コントロール) で入れ替える板、ふだんは押すとスタックの一覧が開く */
  const shownObj = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  if (panels && panels.panels) panels.panels.forEach((p, i) => {
    const m = [p.loading && p.loading.mesh, p.compiled && p.compiled.mesh].find(x => x && shownObj(x));
    const rc = m && rectOf(m);
    if (rc) out.push({ key: 'pl:' + i, ...rc });
  });
  /* 置ける所 (カードを選んでいるとき光る置き場)、ラインを選ぶとき、プレイする効果で札を選んだあとの置き場 (hover で光る) */
  const lineWanted = boardPick && boardPick.kind === 'line' ? new Set(boardPick.lines) : null;
  for (const pad of pads) {
    const ud = pad.userData;
    const want = ud.pulse > 0 || (boardPick && boardPick.kind === 'free' && boardPick.sel && ud.hover)
      || (lineWanted && lineWanted.has(ud.line) && ud.side === ME);
    if (!want) continue;
    const rc = rectOf(pad);
    if (rc) out.push({ key: 'p:' + ud.line + ':' + ud.side, ...rc });
  }
  return out;
}
/* そのカードの四隅の中で、押すとそのカードに当たる点 (無ければ null)。同じ形なら少しの間覚えておく (毎フレーム呼ばれる) */
const gpHitCache = new Map();
function gpHitPoint(uid, quad, r, accept) {
  if (!gpPickAt || !quad) return null;
  const sig = quad.map(p => p[0].toFixed(0) + ',' + p[1].toFixed(0)).join(' ') + (boardPick ? '|pick' : '');
  const now = performance.now();
  const c = gpHitCache.get(uid);
  if (c && c.sig === sig && now - c.at < 300) return c.hit;
  const at = (fx, fy) => {
    const top = [quad[0][0] + (quad[1][0] - quad[0][0]) * fx, quad[0][1] + (quad[1][1] - quad[0][1]) * fx];
    const bot = [quad[3][0] + (quad[2][0] - quad[3][0]) * fx, quad[3][1] + (quad[2][1] - quad[3][1]) * fx];
    return { x: top[0] + (bot[0] - top[0]) * fy, y: top[1] + (bot[1] - top[1]) * fy };
  };
  let hit = null;
  outer: for (const fy of [0.5, 0.3, 0.7, 0.12, 0.88, 0.04, 0.96]) {
    for (const fx of [0.5, 0.25, 0.75]) {
      const p = at(fx, fy);
      if (p.x < r.left + 2 || p.y < r.top + 2 || p.x > r.right - 2 || p.y > r.bottom - 2) continue;
      if (gpPickAt(p.x, p.y, accept) === uid) { hit = p; break outer; }
    }
  }
  gpHitCache.set(uid, { sig, at: now, hit });
  return hit;
}

/* 手札を畳んであるとき、パッドで下へ進む・LB/RB を押したら開く (開いたら true) */
function gamepadOpenHand() {
  if (!stage || !board || isCompactHandUI() || VIEW.handOpen) return false;
  /* 盤面が見えているときだけ (タイトルなどの画面の裏で手札を開かない) */
  if (document.elementFromPoint(innerWidth / 2, innerHeight - 30) !== stage.renderer.domElement) return false;
  setHandDrawer(true);
  return true;
}
initGamepad({ canvas: () => (stage && stage.renderer ? stage.renderer.domElement : null), targets: gamepadTargets, openHand: gamepadOpenHand });

/* stage が実際の大きさの変化を検知したとき (回転直後の遅れて確定する大きさなど) */
window.addEventListener('compile:viewport', onViewportChanged);

/* ---------- HUD ---------- */
/* プロトコル板の表示内容 ([line][side]) */
function panelRows(st) {
  return [0, 1, 2].map((line) => {
    const cell = (side) => {
      const proto = st.players[side].protocols[line];
      /* タッグの複合プロトコル (FIRE+WATER) は、2つの名前と色を渡す */
      const parts = proto.names || [proto.name];
      const meta = protoIndex[parts[0]] || {};
      return {
        name: proto.name,
        parts: parts.length > 1 ? parts.map(n => ({ name: n, color: (protoIndex[n] || {}).color || '#b9a4ff' })) : null,
        total: totalOf(st, line, side),
        color: meta.color || '#b9a4ff',
        set: meta.set,
        compiled: proto.compiled,
        /* 次のその側の手番の開始でコンパイル (済みならリコンパイル) が起きる */
        threat: totalOf(st, line, side) >= 10 && totalOf(st, line, side) > totalOf(st, line, 1 - side)
      };
    };
    return [cell(0), cell(1)];
  });
}

/* 名札の横の「勝ちまでの進み具合」(●●○) を盤面に合わせる */
function syncCompileProgress(st) {
  if (!st || !st.players) return;
  /* 勝つのに要る本数は側ごとに違うことがある (ボス「聖域」など。エンジンの winCompilesOf と同じ決め方) */
  const need = (side) => (Array.isArray(st.winBySide) ? st.winBySide[side] : 0) || st.winCompiles || 3;
  const done = (side) => st.players[side].protocols.filter(p => p.compiled).length;
  setCompileProgress({ done: done(ME), need: need(ME) }, { done: done(1 - ME), need: need(1 - ME) });
}

/* 再生の途中でプロトコル板を合わせる。並べ替えは板を滑らせて見せ、終わるまで待つ */
function syncPanels(st, animate) {
  syncCompileProgress(st);
  if (runMode && runKind === 'run' && st && !runEnded) {
    /* 勝ち抜き戦: 相手にコンパイルされた回数だけライフを減らして見せる。尽きたらその場で終わり */
    const lost = compilesBy(st, AI);
    runHud(lost);
    const run = loadRun();
    if (run && lethal(run, lost)) {
      runEnded = true;
      fadeOutBgm();
      showRunAfterGame(false, lost, Object.values(protoIndex));
    }
  }
  if (!panels || !st) return Promise.resolve();
  return panels.update(panelRows(st), { animate });
}

/* いま効いている上段・下段 (INFO に並べる)。上段は表の札なら覆われていても効く、下段はいちばん上の表の札だけ */
function activeFx(st) {
  const out = [];
  if (!st || !st.lines) return out;
  for (const side of [ME, 1 - ME]) {
    for (let l = 0; l < 3; l++) {
      const stack = st.lines[l][side] || [];
      stack.forEach((uid, i) => {
        const c = st.cards[uid];
        const d = c && c.faceUp && defIndex[c.def];
        if (!d) return;
        const base = { uid, mine: side === ME, name: d.proto + ' ' + d.value, color: d.color };
        if (d.upper) out.push({ ...base, zone: 'upper', text: d.upper });
        if (d.lower && i === stack.length - 1) out.push({ ...base, zone: 'lower', text: d.lower });
      });
    }
  }
  return out;
}

function refreshHud() {
  syncCompileProgress(shown());      // 名札は作り直されると空になるので、表示の更新のたびに進み具合も合わせる
  const st = shown();
  UI.setActiveFx(activeFx(st));
  checkRevealed(st);
  /* 盤面そのものの色で手番を示す (決着後はどちらも消す) */
  if (arena && arena.setTurnSide) arena.setTurnSide(st && st.winner === null && !trainingMode ? st.turn : null);
  if (ctrlMarker) {
    /* コントロール変種を使わない対戦ではマーカーを隠す */
    ctrlMarker.group.visible = st.useControl !== false;
    ctrlMarker.update(typeof st.control === 'number' ? st.control : -1, ME, true);
    avatarControlCheck(st);
  }
  panels.update(panelRows(st));
  UI.setCounts(
    { deck: st.players[ME].deck.length, trash: st.players[ME].trash.length },
    { deck: st.players[AI].deck.length, trash: st.players[AI].trash.length }
  );
  const mine = st.turn === ME && st.winner === null;

  const acts = mine && !cur.requests.length ? legalNow() : [];
  if (tutorial) coachUpdate();
  if (mine && !cur.requests.length) {
    let playable = new Set(acts.filter(a => a.type === 'play').map(a => a.card));
    /* チュートリアル: 案内しているカードだけ明るくする */
    if (tutorial && tutorialFocus && tutorialFocus.card) {
      playable = new Set([...playable].filter(u => st.cards[u] && st.cards[u].def === tutorialFocus.card));
    }
    board.highlightPlayable(st, Array.from(playable));
  } else {
    board.highlightPlayable(st, []);
  }

  /* 打てる札がなく補充しか残っていないときは、ボタンで誘導する */
  const refreshBtn = document.getElementById('btnRefresh');
  if (refreshBtn) {
    refreshBtn.hidden = trainingMode;
    const onlyRefresh = acts.length > 0 && acts.every(a => a.type === 'refresh');
    refreshBtn.classList.toggle('urge', onlyRefresh);
    refreshBtn.classList.toggle('idle', !acts.some(a => a.type === 'refresh'));
    if (!trainingMode && onlyRefresh) UI.setPrompt('プレイできるカードがありません。リフレッシュしてください', 'ask');
  }
  updatePads();
}

/* ---------- ログの整形 (logformat.js) ---------- */
function mySeat() { return (roomMode && roomRm) ? roomRm.side : ME; }
let logFormat = null;
function logParts(msg) {
  if (!logFormat) {
    logFormat = createLogFormat({
      defIndex,
      seat: mySeat,
      roomSide: () => (roomMode && roomRm ? roomRm.side : null),
      demo: () => demoMode,
      state: () => shown(),
      /* 観戦: 「あなた」「相手」ではなく2人の名前 */
      seatNames: () => (roomWatching && roomRm && Array.isArray(roomRm.names) ? roomRm.names : null),
      /* タッグ (CPU 戦): 何人目かから、あなた / 味方・相手のキャラの名前 */
      tagName: (side, k) => (!tagMates || roomMode ? '' : side === 0 ? (k ? avatarName(avatars && avatars.mate && avatars.mate.id) || '味方' : 'あなた') : oppCallName(k))
    });
  }
  return logFormat(msg);
}

/* ログのカード名をタップ: 拡大プレビューではなく、テキストだけの小さな表示 */
/* チェーンに積まれたカードを押したら、そのカードの効果を出す */
UI.onChainTap((defId) => showCardNoteFor(defId));
function showCardNoteFor(defId) {
  const d = defIndex[defId];
  if (!d) return;
  pulseVisible(defId, d.color);
  const o = defDetail(d);
  if (!isCompactHandUI()) {
    previewUid = null;
    UI.showCardPanel(o);
    return;
  }
  UI.showCardNote(o);
}

function cardName(idOrUid) {
  const st = shown();
  /* uid 指定は可視性を確認してから実名を出す (def ID 直指定は公開情報) */
  const c = st.cards[idOrUid];
  if (c) {
    const visible = c.faceUp || ((c.knownTo || 0) & (1 << ME));
    if (!visible) return null;
  }
  const d = defIndex[idOrUid] || (c && defIndex[c.def]);
  /* 表記は cardlist.html / auto-play.html と揃える: プロトコル名 + 値 */
  return d ? d.proto + ' ' + d.value : null;
}

/* 選択UIの見出しに出す発動元カード (公開情報の def ID) */
function sourceInfo(defId) {
  const d = defId && defIndex[defId];
  return d ? { def: d.id, name: d.proto + ' ' + d.value, color: d.color } : null;
}

function choiceCtx() {
  return {
    cardName,
    sourceInfo,
    onSource: (defId) => showCardNoteFor(defId),
    protoInfo: (name) => {
      const st = shown();
      const mine = st.players[ME].protocols.some(p => p.name === name);
      const opp = st.players[1 - ME].protocols.some(p => p.name === name);
      return { color: protoIndex[name] && protoIndex[name].color,
        owner: mine && opp ? '両者' : mine ? '自分' : opp ? '相手' : '' };
    },
    lineInfo: (l) => {
      const st = shown();
      const info = (side) => {
        const p = st.players[side].protocols[l];
        return { name: p.name, color: (protoIndex[p.name] && protoIndex[p.name].color) || '#cfefff' };
      };
      return { mine: info(ME), opp: info(1 - ME) };
    },
    cardThumb: (cand) => {
      const uid = String(cand).split('|')[0];
      const c = shown().cards[uid];
      if (!c) return null;
      const d = defIndex[c.def];
      const visible = d && (c.faceUp || ((c.knownTo || 0) & (1 << ME)));
      return visible ? { img: faceImageURL(d), color: d.color } : { img: null, color: '#8fa8c8' };
    },
    cardLabel: (cand) => {
      /* play-free 等は "uid|line|facing" の複合候補 */
      if (String(cand).indexOf('|') >= 0) {
        const p = String(cand).split('|');
        const name = cardName(p[0]) || '裏向きのカード';
        return name + ' <small>→ ライン' + (+p[1] + 1) + ' / ' + (p[2] === 'u' ? '表向き' : '裏向き') + '</small>';
      }
      const st = shown();
      const c = st.cards[cand];
      const d = c && defIndex[c.def];
      const visible = c && (c.faceUp || ((c.knownTo || 0) & (1 << ME)));
      if (!d || !visible) {
        /* 中身は伏せたまま、どのカードかは位置で区別できるようにする */
        const l = locOf(st, cand);
        if (l && l.zone === 'field') {
          const proto = st.players[l.side].protocols[l.line];
          return '裏向きのカード <small>' + (l.side === ME ? '自分' : '相手') + 'の ' +
            (proto ? proto.name : 'ライン' + (l.line + 1)) + '・下から' + (l.idx + 1) + '枚目</small>';
        }
        return '裏向きのカード';
      }
      return d.proto + ' ' + d.value;
    },
    lineLabel: (l) => shown().players[ME].protocols[l].name,
    protoName: (i) => shown().players[ME].protocols[i].name,
    onHoverCandidate: (cand, on) => {
      const uid = String(cand).split('|')[0];
      /* 一覧のカードに触れたら、盤面のカードと同じように詳細を出す (捨て札など盤に無いカードも) */
      if (on) showPreview(uid);
      const card = board.cards.get(uid);
      if (!card) return;
      if (on) board.setHighlight(card, COLOR.gold, 0.28, 0.9);
      else board.clearHighlight(card);
    }
  };
}

/* 下剋上 (最弱のデッキで最強に勝つ) を達成: 大きく祝い、褒美 (経験値 +100・専用の見た目・称号) を渡す。
   経験値は 20 ずつ 5 回に分けて入れる (帳簿の1件は 20 まで)。key が同じなので何度勝っても1回だけ */
let underdogShown = false;
async function celebrateUnderdog() {
  if (underdogShown) return;
  underdogShown = true;
  let el = document.getElementById('underdogWin');
  if (!el) {
    el = document.createElement('div');
    el.id = 'underdogWin';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="ud-card"><small>UNDERDOG</small><h2>GIANT SLAYER</h2>' +
    '<p>最弱のデッキで、最強の CPU を倒しました。</p>' +
    '<ul><li>称号 GIANT SLAYER</li><li>専用スリーブ GIANT SLAYER</li><li>専用コントロールマーカー GIANT SLAYER</li><li>+' + UNDERDOG_XP + ' XP</li></ul>' +
    '<p style="font-size:12px;opacity:.8">見た目は タイトルの COLLECTION で着けられます</p>' +
    '<button type="button">受け取る</button></div>';
  el.classList.add('show');
  confetti(['#ffd65a', '#ff4f6e', '#fff4c8', '#ff8a5a'], 320);
  setTimeout(() => confetti(['#ffd65a', '#ffffff', '#ff4f6e'], 220), 900);
  await new Promise(resolve => { el.querySelector('button').onclick = resolve; });
  el.classList.remove('show');
  for (let i = 1; i <= UNDERDOG_XP / 20; i++) await gainXp('underdog', 20, 'ud:' + i, i < UNDERDOG_XP / 20);
}
