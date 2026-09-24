/* =========================================================================
 * 3Dビュー: エントリポイント
 *   engine.js (window.CompileEngine) をルール担当として、描画と入力だけを担う。
 * ========================================================================= */
import { bonusXp, grantXp, XP_GAIN, hashKey } from './xp.js';
import { recordDailyGame, DAILY_XP } from './daily.js';
import { unlockTrophies, TROPHY_XP } from './achievements.js';
import { addReplay, getReplay, pinReplay, rebuild } from './replays.js';
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
import * as TU from './tutorial.js';
import { settings, onSettings, openSettings } from './settings.js';
import { recordSoloResult, localRecords, favoriteCards, toggleFavoriteCard, onFavoriteChange } from './stats.js';
import { cardStats, cardTier, playerLevel } from './stats-data.js';
import { isUnlocked, rewardsBetween, TITLES } from './rewards.js';
import { setCosmeticProtocols } from './cosmetics-ui.js';
import { matUnlocked } from './playmat.js';
import { initAccount, openAccount, takeAccountResume } from './account.js';
import { openCardList } from './cardlist-ov.js';
import { openOpponentSelect } from './opponent-select.js';
import { UNDERDOG_DECK, STRONGEST_AI, UNDERDOG_LEVEL } from './aidecks.js';
import { openRun, runHud, showRunAfterGame } from './run-ui.js';
import { openWeekly, weeklyHud, showWeeklyAfterGame } from './weekly-ui.js';
import { compilesBy, loadRun, RUN_WIN_COMPILES } from './run.js';
import { loadWeekly, weekKey } from './weekly.js';
import { openReview } from './review.js';
import { runRoomLobby } from './roomui.js';
import { selectHead, bindSelectHead } from './selectui.js';
import { faceImageURL, backImageURL, pruneFaceCache, ART_SETS, setMaxAnisotropy } from './cardtex.js';
import * as FX from './fx.js';
import { buildArena } from './arena.js';
import { initAudio, sfx, setMuted, isMuted, setSfxVolume } from './audio.js';
import { emblemDataURL } from './emblems.js';
import * as LAYOUT from './layout.js';
import { BOARD, CARD, COLOR, TIMING, VIEW } from './theme.js';
import * as TW from './tween.js';
import * as UI from './ui.js';
import { pickCard, placementPad } from './input.js';
import { placementChoices, renderPlayChoices } from './playchoices.js';

const Engine = window.CompileEngine;
const ME = 0;      // 視点 = 人間プレイヤー
const AI = 1;

let stage, board, panels, arena, defIndex = {}, protoIndex = {};
let cur = null;                 // { state, requests, log, winner }
let busy = false;               // 演出中はクリックを無視
let selectedUid = null;
let hoverUid = null;
let ctrlMarker = null;
let pads = [];                  // 着地パッド (line × side)
let demoMode = false;           // AI 同士の観戦 (?demo=1)
let roomMode = false;           // オンライン対戦 (secure-room)
let roomRm = null;              // 直近の publicState
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
function cosmetic(kind, fallback) {
  const key = settings()[kind];
  return key && isUnlocked(kind, key, myLevel) ? key : fallback;
}
let favSet = new Set(favoriteCards());
function refreshCardGlow() {
  cardWins = cardStats(localRecords());
  myLevel = playerLevel(localRecords(), bonusXp()).level;
  favSet = new Set(favoriteCards());
  if (board && cur) board.syncInstant(shown());
}
/* CPU 戦の戦績以外で入る経験値 (xp.js) を足し、レベルが上がったら手に入った報酬を見せる。
   noTrophy: 実績の判定をこのあとまとめてするとき */
async function gainXp(src, xp, key, noTrophy) {
  const before = myLevel;
  if (!grantXp(src, xp, key)) return;
  refreshCardGlow();                 // myLevel も数え直す
  if (myLevel > before) await UI.levelUpCutIn(myLevel, rewardsBetween(before, myLevel));
  if (!noTrophy) await checkTrophies(null);
}

/* 決着した1試合の中身 (デイリーミッションと実績の判定に使う) */
function gameSummary(st, side, win, level, online) {
  const t = st.tally || {};
  const effectsMap = (t.effects && t.effects[side]) || {};
  return {
    win, level, online, protocols: st.players[side].protocols.map(p => p.name),
    compiles: (t.compiles && t.compiles[side]) | 0, oppCompiles: (t.compiles && t.compiles[1 - side]) | 0,
    winCompiles: st.winCompiles || 3, effectsMap,
    effects: Object.values(effectsMap).reduce((n, v) => n + (v | 0), 0),
    faceUpIds: ((t.faceUp && t.faceUp[side]) || []).slice(),
    turns: (st.turns || 0) + 1, at: Date.now()
  };
}

/* 決着のあと: デイリーミッションを進め、実績を判定する (CPU 戦・オンライン共通) */
async function afterGameProgress(st, side, win, level, online) {
  const game = gameSummary(st, side, win, level, online);
  const r = recordDailyGame(game, Object.keys(protoIndex));
  if (r.cleared.length) {
    const xp = r.cleared.reduce((n, m) => n + m.xp, 0) + (r.allNow ? DAILY_XP.all : 0);
    UI.toast('DAILY MISSION CLEAR — ' + r.cleared.map(m => m.text).join(' / ') + (r.allNow ? ' (3つ達成)' : '') + '  +' + xp + ' XP', 3600);
    for (const m of r.cleared) await gainXp('daily', m.xp, 'dm:' + r.day + ':' + m.key, true);
    if (r.allNow) await gainXp('daily', DAILY_XP.all, 'dm:' + r.day + ':all', true);
  }
  await checkTrophies(game);
}

/* 実績を判定し、取った分の経験値を足して知らせる。レベルが上がって取れる実績もあるので数回まわす */
let trophyBusy = null;
async function checkTrophies(game) {
  while (trophyBusy) await trophyBusy;              // 同時に2回判定しない
  let done;
  trophyBusy = new Promise(r => { done = r; });
  try {
    for (let pass = 0; pass < 3; pass++) {
      const got = unlockTrophies(trophyContext(pass ? null : game));
      if (!got.length) break;
      const before = myLevel;
      for (const t of got) grantXp('trophy', TROPHY_XP[t.tier], 'ach:' + t.id);
      refreshCardGlow();
      await showTrophyBanner(got);
      if (myLevel > before) await UI.levelUpCutIn(myLevel, rewardsBetween(before, myLevel));
    }
  } finally {
    trophyBusy = null;
    done();
  }
}
function auraFor(defId) {
  if (favSet.has(defId)) return { color: '#ffffff', strength: 1, fav: true, frame: true, holo: false };
  const t = cardWins.get(defId);
  const tier = t ? cardTier(t.wins) : null;
  if (!tier) return null;
  return { color: tier.color, strength: tier.key === 'bronze' ? 0.45 : tier.key === 'silver' ? 0.55 : 0.7, holo: !!tier.holo, fav: false };
}
onFavoriteChange(() => { refreshCardGlow(); checkTrophies(null); });
/* 詳細パネルの ★ でお気に入りを選ぶ (もう一度押すと外す。10枚・1プロトコル1枚まで) */
UI.setFavoriteHandler({
  isFav: (defId) => favSet.has(defId),
  toggle: (defId) => { const r = toggleFavoriteCard(defId); if (r.message) UI.toast(r.message); return r; },
  winsOf: (defId) => { const t = cardWins.get(defId); return t ? { wins: t.wins, games: t.games, effects: t.effects, tier: cardTier(t.wins) } : null; }
});
let runMode = false;             // 勝ち抜き戦・週替わり3連戦の1戦 (?run=1)
let runKind = 'run';             // 'run' (勝ち抜き戦) / 'weekly' (週替わり3連戦)
let runEnded = false;            // 勝ち抜き戦の結果を出したか (ライフが尽きたらその場で出す)
let setupNote = '';
/* リプレイ (replays.js): 対局中の棋譜 { init, actions }、いま見ているリプレイ、直前の試合のリプレイ id */
let replayLog = null;
let replayMode = null;
let lastReplayId = null;
const logAction = (a) => { if (replayLog) replayLog.actions.push(JSON.parse(JSON.stringify(a))); };
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

/* 合法手: ソロはエンジン、ルームはサーバー提供値 */

function legalNow() {
  if (roomMode) {
    return ROOM.normLegalActions(roomRm);
  }
  if (!cur || cur.state.turn !== ME || cur.requests.length || cur.state.winner !== null) return [];
  return Engine.legalActions(cur.state);
}

/* ライン合計: ルーム状態はサーバー計算値 (_totals) を持つ */
function totalOf(st, line, side) {
  return st._totals ? st._totals[line][side] : Engine.lineTotal(st, line, side);
}

/* ---------- 起動 ---------- */
boot().catch((e) => {
  console.error(e);
  UI.toast('初期化に失敗: ' + e.message, 6000);
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
  const [cards, effects] = await Promise.all([
    fetch('data/cards.json').then(r => r.json()),
    fetch('data/effects.json').then(r => r.json())
  ]);
  setCosmeticProtocols(cards.protocols);
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
  mark('fetch');
  Engine.init(cards, effects);
  Engine.setAiLevel(1);
  /* trace を有効にすると、どのカードが効果を発動したかを演出に使える。
     AI 探索中は重くなるので、思考の直前だけ切る (withoutTrace)。 */
  Engine.setTrace(true);
  UI.bindLogFormatter(logParts, showCardNoteFor);
  mark('engineInit');
  /* カードやプロトコルの札は canvas に文字を描くので、書体が届いてから作る (最大1.5秒待つ) */
  await loadFonts(1500);
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
    sleeve: () => cosmetic('sleeve', 'default'),
    compileColor: () => (cosmetic('ccolor', 'default') === 'gold' ? '#ffd86a' : null),
    onCompile: async (info) => {
      /* まず盤上のプロトコルカードを "Compiled" 面へ裏返し、その後にカットイン */
      await panels.flipAt(info.line, info.side, true);
      await UI.compileCutIn({
        ...info,
        art: glitchArtUrl(info.name),
        emblem: emblemDataURL(info.name, info.color, 512, true)
      });
    }
  });
  arena = buildArena(stage);
  FX.createDust(stage, 900);
  panels = createPanels(stage, ME);
  buildPads();
  stage.onFrame((dt, t) => { positionPlayChoices(); trackHandTop(); trackHandRight(); trackPileCounts(); if (panels) panels.tick(t); });
  /* 設定 (演出の速さ・音量) を反映し、変わったらすぐ当てる */
  /* 盤面の柄は解放されているものだけ (記録を消したあとなどに、未解放のまま残らないように) */
  onSettings((s) => {
    TW.setSpeed(s.speed);
    setSfxVolume(s.sfx);
    arena.setMat(matUnlocked(s.mat, localRecords()) ? s.mat : 'neon');
    ctrlMarker.setStyle(cosmetic('marker', 'default'));
    if (cur) board.syncInstant(shown());                      // カードの裏面を付け替える
  });
  bindInput();
  mark('stage');

  const params = new URLSearchParams(location.search);
  demoMode = params.get('demo') === '1';
  const pick = (key, fallback) => {
    const v = params.get(key);
    const list = v ? v.split(',').map(s => s.trim().toUpperCase()).filter(n => protoIndex[n]) : [];
    return list.length === 3 ? list : fallback;
  };
  let p0 = pick('me', null);
  let p1 = pick('ai', null);
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

  /* 保存したリプレイを見る (?replay=id) */
  if (params.get('replay')) {
    replayMode = getReplay(params.get('replay'));
    if (replayMode) {
      p0 = replayMode.init.p0.slice(); p1 = replayMode.init.p1.slice();
      document.body.classList.add('replay');
    } else UI.toast('リプレイが見つかりません (消したか、別の端末で保存したもの)');
  }

  /* チュートリアル: レッスンの盤面から始める */
  const tuNo = parseInt(params.get('tutorial'), 10);
  if (tuNo >= 1 && tuNo <= TU.LESSONS.length && !puzzle) {
    tutorial = { index: tuNo - 1, lesson: TU.LESSONS[tuNo - 1] };
    p0 = tutorial.lesson.spec.sides[0].protos.slice(); p1 = tutorial.lesson.spec.sides[1].protos.slice();
    document.body.classList.add('tutorial');
    applyAiDifficulty(0);
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
    /* ログイン状態は裏で読む (待たない)。Google から戻ってきたときはメニューを出してアカウントの画面を開く */
    const accountReady = initAccount();
    const accountResume = takeAccountResume();
    /* 勝ち抜き戦の次の1戦 (?run=1) はタイトルを飛ばして勝ち抜き戦の画面へ */
    let nextMode = params.get('run') === '1' ? 'run'
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
      if (nextMode === 'online') {
        try {
          await ROOM.roomLoadDeps();
        } catch (e) { UI.toast('オンライン機能を読み込めませんでした'); nextMode = 'single'; continue; }
        if (!ROOM.roomConfigured()) { UI.toast('オンライン対戦は未設定です (secure-room-config.js)'); nextMode = 'single'; continue; }
        /* ドラフト中にプロトコルの6枚を見る */
        const result = await runRoomLobby(cards.protocols, { cardsOf: protocolCards });
        /* 「戻る」はモード選択へ (ソロのプロトコル選択ではなく) */
        if (!result) { nextMode = await runTitle(cards.protocols, { menuOnly: true }); continue; }
        document.getElementById('boot').style.display = 'none';
        document.body.classList.remove('pregame');
        await roomEnterGame(result.rm);
        return;
      }
      if (nextMode === 'tutorial') { location.href = location.pathname + '?tutorial=1'; return; }
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
        opp = await openOpponentSelect(cards.protocols);
        if (!opp) { nextMode = await runTitle(cards.protocols, { menuOnly: true }); continue; }
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
        level: opp ? opp.level : undefined });
      if (chosen.online) { nextMode = 'online'; continue; }
      if (chosen.back) {
        if (opp) continue;                                  // 相手を選び直す
        nextMode = await runTitle(cards.protocols, { menuOnly: true });
        continue;
      }
      document.body.classList.remove('pregame');
      p0 = chosen.me;
      p1 = p1 || chosen.ai;
      trainingMode = !!chosen.training;
      applyAiDifficulty(chosen.level);
      /* ドラフトは先手後攻もドラフトの先手に合わせる。ランダム編成は中身を知らせる */
      if (chosen.first) chosenFirst = chosen.first === 'me' ? ME : AI;
      if (chosen.random) setupNote = 'ランダム: あなた ' + p0.join(' / ') + '　相手 ' + p1.join(' / ');
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
  const firstPlayer = trainingMode || puzzle || tutorial || demoMode ? ME
    : chosenFirst !== null ? chosenFirst : (Math.random() < 0.5 ? ME : AI);
  const seed = (Math.random() * 1e9) | 0;
  const winCompiles = runMode ? RUN_WIN_COMPILES : undefined;
  const replayBuilt = replayMode ? rebuild(Engine, replayMode) : null;
  const res = replayBuilt
    ? replayBuilt.res
    : puzzle
      ? Engine.newPuzzle(puzzle.spec, { seed: 1 })
      : tutorial
        ? Engine.newPuzzle(tutorial.lesson.spec, { seed: 1 })
        : Engine.newGame({ seed, p0, p1, first: firstPlayer, training: trainingMode, winCompiles });
  cur = res;
  /* CPU 戦は棋譜を取る (決着したらリプレイとして残す) */
  replayLog = !replayMode && !trainingMode && !puzzle && !tutorial && !demoMode
    ? { init: { seed, p0: p0.slice(), p1: p1.slice(), first: firstPlayer, winCompiles: winCompiles || null }, actions: [] } : null;
  if (trainingMode) training.protos = [p0.slice(), p1.slice()];
  window.__3d = {
    stage, board, THREE, LAYOUT,
    get cur() { return cur; },
    /* 動作確認用: 盤面をコードから進める */
    play: (uid, line, faceUp) => step({ type: 'play', card: uid, line, faceUp: faceUp !== false }),
    legal: () => Engine.legalActions(cur.state),
    diag: () => ({ busy, selectedUid, tweens: TW.activeCount(), marks: window.__bootMarks }),
    arrange: (req) => arrangeOnBoard(req),
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
    testResult: async (win) => { await finaleFx(!!win); await UI.resultCutIn(!!win); },
    /* 合成した publicState を流し込んでルーム描画経路を検証する (ポーリングなし) */
    testRoomView: async (rm, instant) => {
      roomMode = true;
      if (!roomTracker) roomTracker = ROOM.createTraceTracker();
      await roomApplyView(rm, instant !== false);
    },
    /* キャンバスを取り出す (記録・共有用)。
       preserveDrawingBuffer を有効にしてあるので、いつ呼んでも直前の描画が残っている。 */
    capture: (quality) => {
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
  refreshHud();
  if (puzzle) PZ.showPuzzleBar(puzzle, retryPuzzle);
  if (tutorial) coachUpdate();
  if (replayMode) { startReplayView(replayBuilt); return; }
  if (trainingMode) {
    UI.setPrompt('');
    UI.toast('カードを選んで、光っている枠をタップすると置けます', 3200);
  } else {
    if (!puzzle && !tutorial && !demoMode) {
      const turnNote = chosenFirst !== null
        ? (firstPlayer === ME ? 'ドラフトの先手: あなたが先攻です' : 'ドラフトの後手: あなたは後攻です')
        : (firstPlayer === ME ? 'コイントス: あなたが先攻です' : 'コイントス: あなたは後攻です');
      UI.toast(setupNote ? setupNote + '　' + turnNote : turnNote, setupNote ? 4200 : 2600);
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
  const result = PZ.judgePuzzle(puzzle.goal, endSt, shown(), ME, totalOf);
  sfx(result.ok === false ? 'lose' : 'win');
  if (result.ok !== false) await gainXp('puzzle', XP_GAIN.puzzle, 'pz:' + hashKey(JSON.stringify([puzzle.spec, puzzle.goal])));
  PZ.showPuzzleResult(result, retryPuzzle);
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
  TU.showCoachResult(i, r, () => {
    if (r.ok && last) {
      TU.showTutorialDone({
        onPlay: () => { location.href = location.pathname; },
        onTop: () => { location.href = 'index.html'; },
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
  lastTurn = null;
  resultShown = false;
  board.syncInstant(shown());
  syncPanels(shown(), false);
  refreshHud();
  try { history.replaceState(null, '', location.pathname + '?tutorial=' + (index + 1)); } catch (e) { /* file:// など */ }
  stage.home(400);
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
  const cap = protoName.charAt(0) + protoName.slice(1).toLowerCase();
  return protoIndex[protoName] && ART_SETS.has(protoIndex[protoName].set)
    ? 'art/' + cap + '_Glitched.webp'
    : null;
}

/* 難易度 → エンジン設定。
   auto-play と同じく上位2段は探索AI。最強は思考時間増 + DSH特化戦略 */
let aiDifficulty = null;   // 戦績に残す難易度 (aidecks.js の番号)。URL で直接始めた対戦は不明
function applyAiDifficulty(level) {
  aiDifficulty = level;
  if (level <= 0) {
    Engine.setAiLevel(1);                        // かんたん: ヒューリスティックのみ
  } else if (level === 1) {
    Engine.setAiLevel(2);                        // ふつう: 探索 590ms
  } else {
    Engine.setAiLevel(2);
    Engine.setAiThinkBudget(1200);               // つよい/最強/挑戦者: 思考時間2倍
  }
  /* 最強・挑戦者 = dsh 特化 + 固定デッキ (aidecks.js)、ロック特化 = サイキック①の永続ロック狙い */
  if (Engine.setAiSpecialist) {
    if (level === 4) Engine.setAiSpecialist(true, 1, 'psylock');
    else Engine.setAiSpecialist(level >= 3, 1, 'dsh');
  }
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
  if ((roomMode ? shown() : st).turn !== ME) return;

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
      if (!drag.moved && dx * dx + dy * dy > 64) drag.moved = true;
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
        if (lt && lt.zone === 'trash') showTrash(lt.side);
        return;
      }
    }
    /* 捨て札の山をタップ: 中身は公開情報なので一覧を出す */
    if (hit && hit.obj.userData.uid) {
      const lt = locOf(shown(), hit.obj.userData.uid);
      if (lt && lt.zone === 'trash') { showTrash(lt.side); return; }
    }
    /* プロトコル板をタップ: そのラインのスタックを一覧で見せる (配置先を選んでいる間は除く) */
    if (!(hit && hit.obj.userData.uid) && !selectedUid) {
      const pl = panelAt(ev);
      if (pl) { showStack(pl.line, pl.side); return; }
    }
    if (demoMode || busy || !cur || shown().winner !== null) return;
    if (cur.requests.length || shown().turn !== ME) return;
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
        el.setPointerCapture && el.setPointerCapture(ev.pointerId);
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
    for (const pad of pads) pad.userData.hover = false;
    el.style.cursor = 'default';
    if (!d.moved) return;             // ただのクリック → 選択のまま

    const pt = planePoint(ev);
    const over = padUnder(pt);
    if (over && selectedUid === d.uid) {
      await dropOnPad(over.userData);
    } else {
      /* 掴んだが置けない場所 → 手札へ戻す (選択は維持) */
      const card = board.cards.get(d.uid);
      if (card) { card.renderOrder = 0; raiseHandCard(d.uid); }
    }
  });

  el.addEventListener('pointercancel', () => {
    if (!drag) return;
    const card = board.cards.get(drag.uid);
    if (card) { card.renderOrder = 0; restHandCard(drag.uid); }
    drag = null;
    for (const pad of pads) pad.userData.hover = false;
  });

  async function dropOnPad(ud) {
    if (!canPlaceOnLine(cur.state, selectedUid, ud.line, ud.side)) {
      UI.toast('そのラインにはプレイできません'); return;
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
    if (busy || !cur || shown().turn !== ME || cur.requests.length) return;
    const ok = legalNow().some(a => a.type === 'refresh');
    if (!ok) { UI.toast('いまは補充できません'); return; }
    deselect();
    await step({ type: 'refresh' });
  };
  const goToMenu = async () => {
    if (!roomMode) {
      if (!confirm('メニューに戻りますか？')) return;
      location.href = location.pathname;
      return;
    }
    const st = shown();
    if (st && st.winner === null) {
      if (!confirm('投了してメニューに戻りますか？')) return;
      try { await ROOM.roomApi('action', { code: roomRm.code, version: roomRm.version, action: { type: 'surrender' } }); }
      catch (e) { /* 決着はサーバー側で確定する */ }
    }
    location.href = location.pathname;
  };
  const menuBtn = document.getElementById('btnMenu');
  if (menuBtn) menuBtn.onclick = goToMenu;
  const cardsBtn = document.getElementById('btnCards');
  if (cardsBtn) cardsBtn.onclick = () => openCardList();
  const settingsBtn = document.getElementById('btnSettings');
  if (settingsBtn) settingsBtn.onclick = () => openSettings();
  const muteBtn = document.getElementById('btnMute');
  if (muteBtn) muteBtn.onclick = () => {
    initAudio();
    setMuted(!isMuted());
    muteBtn.textContent = isMuted() ? '🔇' : '🔊';
    muteBtn.classList.toggle('on', isMuted());
  };
  const logBtn = document.getElementById('btnLog');
  if (logBtn) logBtn.onclick = () => {
    const open = !document.getElementById('logDock')?.classList.contains('open');
    setLogOpen(open);
    try { localStorage.setItem('compileLogOpen', open ? '1' : '0'); } catch (e) { /* private mode */ }
  };
  /* 前回サイドバーを開いていたら開いて始める (最初は閉じておき、盤面を広く見せる) */
  let logWasOpen = false;
  try { logWasOpen = localStorage.getItem('compileLogOpen') === '1'; } catch (e) { /* private mode */ }
  setLogOpen(logWasOpen);
  const handBtn = document.getElementById('btnHand');
  if (handBtn) handBtn.onclick = () => {
    /* ボタンで隠したら、マウスを下へ動かしても勝手に出さない (出すボタンかカード選択で戻す) */
    handPinnedClosed = VIEW.handOpen;
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

function showPreview(uid) {
  const box = document.getElementById('preview');
  if (!box) return;
  if (isCompactHandUI()) {
    /* 対象選択中に候補を触ったのは「選ぶ」操作。効果パネルで選択帯を隠さない */
    if (uid && boardPick && Array.isArray(boardPick.req.candidates) && boardPick.req.candidates.includes(uid)) {
      previewUid = null;
      UI.hideCardNote();
      return;
    }
    if (uid === previewUid) return;
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

function updateDesktopHandDrawer(ev) {
  if (isCompactHandUI() || !stage || selectedUid !== null || handPinnedClosed) return;
  const r = stage.renderer.domElement.getBoundingClientRect();
  const fromBottom = r.bottom - ev.clientY;
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
  if (cur.requests.length || shown().turn !== ME) return [];
  return placementChoices(legalNow(), selectedUid, shown().turn);
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
      showPreview(null);
      if (boardPick?.kind === 'free') { finishFreePick([valid.raw]); return; }
      const { side, ...wire } = valid;
      if (side !== shown().turn) wire.side = side;
      deselect();
      await step(wire);
    }, () => {
      if (boardPick?.kind === 'free') { boardPick.sel = null; renderFreePick(); }
      else { deselect(); showPreview(null); }
    });
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
function showVsTag(rm) {
  const el = document.getElementById('vsTag');
  if (!el || !rm || !Array.isArray(rm.names)) return;
  const opp = 1 - rm.side;
  const name = rm.names[opp];
  if (!name) { el.hidden = true; return; }
  const badge = rm.badges && TITLES[rm.badges[opp]];
  el.textContent = '';
  const vs = document.createElement('i');
  vs.textContent = 'VS';
  const b = document.createElement('b');
  b.textContent = name;
  el.append(vs, b);
  if (badge) {
    const t = document.createElement('small');
    t.textContent = badge;
    el.append(t);
  }
  el.hidden = false;
}

async function roomApplyView(rm, instant) {
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
  /* last_log はサーバーが直近の解決分だけ公開している。ポーリングのたびに
     同じ内容を積まないよう、ルームの版番号ごとに一度だけ表示する。 */
  if (Array.isArray(rm.log) && rm.version !== roomLoggedVersion) {
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
  if (busy || !roomRm) return;
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
    UI.toast((e && e.message) || '通信エラー');
    await roomPoll(true);
  }
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
function roomPollDelay() {
  const mine = roomRm && (roomRm.legalActions || []).length > 0 && !roomRm.request;
  return mine ? 4000 : 1300;
}
async function roomPollTick() {
  if (!roomPollOn) return;
  try { await roomPoll(); } finally {
    if (roomPollOn) roomPollTimer = setTimeout(roomPollTick, roomPollDelay());
  }
}
function startRoomPoll() {
  roomPollOn = true;
  clearTimeout(roomPollTimer);
  roomPollTimer = setTimeout(roomPollTick, 1300);
}
function stopRoomPoll() {
  roomPollOn = false;
  clearTimeout(roomPollTimer);
}

async function roomPoll(force) {
  if (!roomMode || !roomRm) return;
  if (busy && !force) return;
  let next;
  /* 前回の印 (stamp) を渡すと、変わっていないときは盤面を省いた「変化なし」が返る */
  try { next = await ROOM.roomApi('get', { code: roomRm.code, stamp: roomRm.stamp }); } catch (e) { return; }
  if (next.unchanged || (next.version === roomRm.version && next.status === roomRm.status)) {
    if (!next.unchanged) roomRm = next;
    await roomDrainRequest();          // 取りこぼしたリクエストの再開
    return;
  }
  await roomApplyView(next);
}

let roomResultShown = false;
async function roomMaybeFinish() {
  const st = shown();
  if (!st || st.winner === null || roomResultShown) return;
  roomResultShown = true;
  stopRoomPoll();
  const win = st.winner === ME;
  UI.setPrompt(win ? 'あなたの勝ち' : '敗北', 'end');
  const victory = cosmetic('victory', 'default');
  sfx(win ? (victory === 'aurora' ? 'winAurora' : 'win') : 'lose');
  await finaleFx(win);
  await UI.resultCutIn(win, { victory });
  /* 同じ部屋の同じ決着を読み直しても2回は入らない */
  const firstTime = grantXp('online', XP_GAIN.onlinePlay + (win ? XP_GAIN.onlineWin : 0),
    'room:' + (roomRm && roomRm.code) + ':' + (st.turns || 0));
  if (firstTime) {
    const before = myLevel;
    refreshCardGlow();
    if (myLevel > before) await UI.levelUpCutIn(myLevel, rewardsBetween(before, myLevel));
    await afterGameProgress(st, ME, win, null, true);     // 同じ決着を読み直したときは進めない
  }
  showEndActions(win);
}

/* ロビーから playing の publicState を受けて対戦開始 */
async function roomEnterGame(rm) {
  document.body.classList.add('room');
  roomMode = true;
  roomResultShown = false;
  lastTurn = null;
  roomLoggedVersion = null;
  roomTracker = ROOM.createTraceTracker();
  await roomApplyView(rm, true);
  await stage.home(600);
  startRoomPoll();
}

/* ---------- ターン / 効果の演出 ---------- */
let lastTurn = null;
let resultShown = false;

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

async function announceTurnFor(turn) {
  if (trainingMode) return;                         // 検証盤面に手番はない
  if (turn === undefined || turn === null || turn === lastTurn) return;
  lastTurn = turn;
  if (arena && arena.setTurnSide) arena.setTurnSide(turn);
  /* 自分の番が回ってきたときは、相手の番とは別の音で知らせる */
  sfx(turn === ME ? 'yourTurn' : 'turn');
  await UI.turnCutIn(turn === ME);
}

async function announceTurn() {
  const st = shown();
  if (!st || st.winner !== null) return;
  await announceTurnFor(st.turn);
}

/* フェイズの開始を、そのフェイズの演出より先に見せる。
   コンパイルは相手の手番の直後ではなく「自分のターンのコンパイル確認」で
   起きるので、ターン交代とフェイズを再生の途中に差し込まないと、
   相手のターンの出来事のように見えてしまう。 */
let lastPhaseTag = '';
async function markPhase(st) {
  if (!st || st.winner !== null || trainingMode) return;
  await announceTurnFor(st.turn);
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
async function holdStep(t0, target) {
  const spent = (performance.now() - t0) * settings().speed;
  if (spent < target) await TW.wait(target - spent);
}
/* 設定で「一時停止する」をオフにしたら待たない */
function chainPause(kind) {
  return settings().pauses ? TW.wait(CHAIN_HOLD[kind]) : Promise.resolve();
}

function meaningfulSteps(prev, res) {
  if (!res || !res.trace || !res.trace.length) return [];
  const shownFp = visualFingerprint(prev);
  const steps = [];
  let last = shownFp;
  let pendingCue = null;
  let pendingActs = [];
  let lastPhase = prev ? prev.phase + ':' + prev.turn : null;
  for (const t of res.trace) {
    if (!t.st) continue;
    /* このコマまでに起きた効果の割り込み (チェーン表示) を、最後に通った記録で持つ */
    if (steps.length) steps[steps.length - 1].tr = t;
    const fp = visualFingerprint(t.st);
    /* フェイズの切り替わりは、絵が変わらなくても1ステップとして残す。
       そうしないと「開始フェイズ」の帯が、開始効果の演出と同時に出てしまう。 */
    const phaseTag = t.st.phase + ':' + t.st.turn;
    if (fp === last && phaseTag !== lastPhase) {
      lastPhase = phaseTag;
      steps.push({ st: t.st, fp, uid: null, msg: '', cue: pendingCue, acts: [], phaseOnly: true, tr: t, chain: t.chain });
      pendingCue = null;
      continue;
    }
    lastPhase = phaseTag;
    if (fp === last) {
      /* 絵は変わらないが、発動カードの合図だけは拾っておく */
      if (t.uid) {
        /* 発動の合図と一緒に、その瞬間の「処理中の効果の並び」も持つ (割り込みの判定に使う) */
        const cue = { uid: t.uid, msg: t.msg, chain: t.chain };
        if (steps.length) steps[steps.length - 1].cue = cue;
        else pendingCue = cue;
        /* 効果の発動 (上段/中段/下段) は、絵が変わる前にいくつ起きても全部残す。
           最後の1つだけにすると、続けて発動した効果が見えないまま処理された */
        if (/[上中下]段/.test(t.msg || '')) {
          if (steps.length) steps[steps.length - 1].acts.push(cue);
          else pendingActs.push(cue);
        }
      }
      continue;
    }
    last = fp;
    steps.push({ st: t.st, fp, uid: t.uid, msg: t.msg, cue: pendingCue, acts: pendingActs, tr: t, chain: t.chain });
    pendingCue = null;
    pendingActs = [];
  }
  /* 選択に答えると、エンジンはアクションを基準状態から再実行する。
     頭から再生すると盤面が巻き戻って見えるので、いま画面に出ている絵と
     一致する最後のステップまで早送りし、その続きだけを再生する */
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].fp === shownFp) return steps.slice(i + 1);
  }
  return steps;
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
      zone, text: def[zone], mine: card.owner === ME
    }, FX_BANNER_MS / settings().speed);
  }
  await board.pulse(uid, def.color, 380);
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
      ? { img: faceImageURL(d), name: d.proto + ' ' + d.value, zone: k.zone, color: d.color }
      : { img: null, name: '裏向きのカード', zone: k.zone, color: '#8fa8c8' };
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

async function replayResolution(prev, res, action) {
  const steps = meaningfulSteps(prev, res);
  /* オンラインは版ごとに届いたログをまとめて出す (roomApplyView) */
  const liveLog = !roomMode && Array.isArray(res.log);
  const logStep = (step) => { if (liveLog && step.tr) logUpTo(res, res.trace.indexOf(step.tr)); };
  const final = shown();
  UI.hideChain();

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
    if (delta > 0) sfx('chain', n);     // チェーンがつながった
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
    await board.applyTransition(from, step.st, first ? action : null, { speed: chainShown ? STEP_MOTION * 1.3 : STEP_MOTION });
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
    from = step.st;
    first = false;
  }
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
  await syncPanels(final, true);
  /* 盤面が最終形になってから、そこまでに進んだ手番/フェイズを告げる */
  await markPhase(final);
}

/* ---------- 進行 ---------- */
async function step(action) {
  if (roomMode) { await roomStep(action); return; }
  if (busy) return;
  busy = true;
  if (tutorial) tutorialPending = true;
  updatePads();
  const prev = shown();
  const before = cur.state;
  const res = Engine.apply(cur.state, action);
  if (res.error) {
    UI.toast(res.error);
    busy = false;
    tutorialPending = false;
    return;
  }
  if (!trainingMode && !demoMode && (action.type === 'play' || action.type === 'refresh')) {
    gameHistory.push({ st: before, action });
  }
  logAction(action);
  cur = res;
  await replayResolution(prev, res, action);
  refreshHud();
  busy = false;
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
  return UI.askChoice(req, choiceCtx());
}

/* 対象選択を盤面の直接タップで行う。
   候補が盤面/手札のカードそのものなら、モーダルを出さずに
   候補をハイライトしてタップで選ばせる。null ならモーダルへ */
let boardPick = null;
const PICK_CANCEL = '__pickCancel__';   // 外部要因 (ポーリング等) による中断
const PICK_BACK = '__pickBack__';       // 効果の一段前の選択へ戻る
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
      boardPick = { kind: 'yesno', req, resolve };
      let el = document.getElementById('pickBar');
      if (!el) {
        el = document.createElement('div');
        el.id = 'pickBar';
        el.className = 'arr-bar';
        document.body.appendChild(el);
      }
      /* 質問と はい/いいえ を離すと、何に答えているのか分からなくなる。
         同じ帯にまとめて出す。 */
      /* 手札のすぐ上に出す。盤面に重なるので、目ボタンで隠して盤面を見られる */
      el.classList.add('with-ask', 'confirm');
      el.innerHTML =
        pickBarAsk(req) +
        '<div class="arr-btns">' +
          PEEK_BTN +
          '<button class="arr-btn ok" id="pkYes" type="button">YES</button>' +
          '<button class="arr-btn" id="pkNo" type="button">NO</button>' +
        '</div>';
      bindPickBar(el);
      const done = (picks) => {
        boardPick = null;
        el.classList.remove('with-ask', 'confirm', 'peek');
        removePickBar();
        resolve(picks);
      };
      bindPeek(el);
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

/* 手札の上に出す帯の目ボタン: 押すと帯を隠して盤面を見られる。もう一度で戻る */
const PEEK_BTN = '<button class="sel-peek" id="pkPeek" type="button" title="盤面を見る" aria-label="盤面を見る" aria-pressed="false">&#128065;</button>';
function bindPeek(el) {
  const btn = el.querySelector('#pkPeek');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(el.classList.contains('peek')));
  btn.onclick = () => btn.setAttribute('aria-pressed', String(el.classList.toggle('peek')));
}

/* 選択バーの見出し。何に答えているのかをボタンのすぐ横に置く。
   上部の帯にだけ質問を出すと、下のボタンとの距離で意味が分からなくなる。 */
function pickBarAsk(req, meta) {
  return selectHead(req, sourceInfo(req && req.context), meta);
}

/* 帯の組み立て後に呼ぶ: 発動元チップのタップで効果文を出す。
   選択バーには発動元と質問が入っているので、出している間は上の「効果処理中」の帯を隠す */
let pickPanelReq = null;
function bindPickBar(el) {
  el.classList.add('sel-bar');
  document.body.classList.add('picking');
  bindSelectHead(el, showCardNoteFor);
  /* 選んでいる間は、何の効果で選んでいるのかを左の詳細パネルに出しておく (マスターデュエルと同じ)。
     同じ選択の描き直し (候補を1枚選んだ等) では出し直さない */
  const req = boardPick && boardPick.req;
  if (!req || req === pickPanelReq || isCompactHandUI()) return;
  pickPanelReq = req;
  const d = req.context && defIndex[req.context];
  if (d) { previewUid = null; UI.showCardPanel(defDetail(d)); }
}

/* 選択バーを畳む (どの経路で終わっても body の印を戻す) */
function removePickBar() {
  const el = document.getElementById('pickBar');
  if (el) el.remove();
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
    el.className = 'arr-bar';
    document.body.appendChild(el);
  }
  const instant = pickIsInstant(bp);   // 盤面の1枚必須はタップで即決
  /* 2段階以上の効果は、一つ前の選択へ戻れる (エンジンが回答を1つ減らして再生する) */
  const canBack = !!(cur && cur.state && cur.state.pending && cur.state.pending.requestId === bp.req.id
    && Array.isArray(cur.state.pending.choices) && cur.state.pending.choices.length);
  el.classList.add('with-ask');
  /* 手札から選ぶ (捨てる・キャッシュの削除など) は、手札のすぐ上に出す (確認と同じ場所・大きさ) */
  const nearHand = bp.req.kind === 'pickHand';
  el.classList.toggle('confirm', nearHand);
  el.classList.toggle('hand-pick', nearHand);   // 手札から選ぶ帯も右上に出す (three-play.html)
  const where = nearHand ? '手札の光っているカード' : '光っているカード';
  el.innerHTML =
    pickBarAsk(bp.req, { optional: bp.min === 0, count: bp.chosen.length, max: bp.max }) +
    /* 何を選んだかを帯の中でも読めるようにする (盤面の金色だけでは見落とす) */
    (bp.chosen.length
      ? '<div class="sel-chosen">' + bp.chosen.map((u, i) =>
          '<button type="button" class="sel-chip" data-uid="' + u + '"><b>' + (i + 1) + '</b>' +
          (cardName(u) || '裏向きのカード') + '<i>×</i></button>').join('') + '</div>'
      : '<div class="sel-hint">' + where + 'をタップ</div>') +
    '<div class="arr-btns">' +
    PEEK_BTN +
    (canBack ? '<button class="arr-btn" id="pkBack" type="button">← 戻る</button>' : '') +
    '<button class="arr-btn ghost" id="pkList" type="button">LIST</button>' +
    (instant ? '' :
      '<button class="arr-btn ok" id="pkOk" type="button"' +
        (bp.chosen.length < bp.min ? ' disabled' : '') + '>' +
        (bp.chosen.length === 0 && bp.min === 0 ? '選ばない' : '決定') +
        '</button>') +
    '</div>';
  bindPickBar(el);
  bindPeek(el);
  el.querySelectorAll('.sel-chip').forEach(c => { c.onclick = () => toggleBoardPick(c.dataset.uid); });
  const ok = el.querySelector('#pkOk');
  if (ok) ok.onclick = () => finishBoardPick(bp.chosen.slice());
  const back = el.querySelector('#pkBack');
  if (back) back.onclick = () => finishBoardPick(PICK_BACK);
  el.querySelector('#pkList').onclick = () => finishBoardPick(null);
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
    el.className = 'arr-bar';
    document.body.appendChild(el);
  }
  el.innerHTML =
    (bp.sel ? '<button class="arr-btn" id="pkBack" type="button">カードを選び直す</button>' : '') +
    '<button class="arr-btn" id="pkList" type="button">リストで選ぶ</button>';
  const back = el.querySelector('#pkBack');
  if (back) back.onclick = () => { bp.sel = null; renderFreePick(); };
  el.querySelector('#pkList').onclick = () => finishFreePick(null);
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
  setLineTargets(bp.lines);
  let el = document.getElementById('pickBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pickBar';
    el.className = 'arr-bar';
    document.body.appendChild(el);
  }
  const hasFocus = Array.isArray(bp.req.focus) ? bp.req.focus.length > 0 : !!bp.req.focus;
  const canBack = !!(cur && cur.state && cur.state.pending && cur.state.pending.requestId === bp.req.id
    && Array.isArray(cur.state.pending.choices) && cur.state.pending.choices.length);
  el.classList.add('with-ask');
  el.classList.remove('confirm');
  el.innerHTML = pickBarAsk(bp.req) +
    '<div class="sel-hint">' +
    (hasFocus ? '<i class="sel-key gold"></i>移動するカード　<i class="sel-key mint"></i>移動先のライン' : '光っているラインをタップ') +
    '</div>' +
    '<div class="arr-btns">' +
    PEEK_BTN +
    (canBack ? '<button class="arr-btn" id="pkBack" type="button">← 対象を選び直す</button>' : '') +
    '<button class="arr-btn ghost" id="pkList" type="button">LIST</button>' +
    '</div>';
  bindPickBar(el);
  bindPeek(el);
  const back = el.querySelector('#pkBack');
  if (back) back.onclick = () => finishLinePick(PICK_BACK);
  el.querySelector('#pkList').onclick = () => finishLinePick(null);
}

function finishLinePick(picks) {
  const bp = boardPick;
  boardPick = null;
  board.clearCandidates();
  clearLineTargets();
  removePickBar();
  bp.resolve(picks);
}

function setLineTargets(lines) {
  const set = new Set(lines || []);
  const st = shown();
  for (const pad of pads) {
    const on = set.has(pad.userData.line);
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
}

function toggleBoardPick(uid) {
  const bp = boardPick;
  if (!bp || bp.req.candidates.indexOf(uid) < 0) return;
  const i = bp.chosen.indexOf(uid);
  if (i >= 0) bp.chosen.splice(i, 1);
  else {
    if (bp.max === 1) bp.chosen.length = 0;
    bp.chosen.push(uid);
  }
  if (pickIsInstant(bp) && bp.chosen.length === 1) {
    finishBoardPick(bp.chosen.slice());
    return;
  }
  renderBoardPick();
}

/* 1枚必須の選択をタップで即決するか。手札から選ぶ (捨てる・キャッシュの削除・渡す等) は
   取り消せないので、1枚でも「選んで → 決定」にする。選び直しはもう1枚をタップ */
function pickIsInstant(bp) {
  return bp.max === 1 && bp.min >= 1 && bp.req.kind !== 'pickHand';
}

function finishBoardPick(picks) {
  const bp = boardPick;
  boardPick = null;
  board.clearCandidates();
  removePickBar();
  bp.resolve(picks);
}

/* 並べ替え: 対象側のプロトコルパネルにチップを重ね、2枚タップで入れ替える。
   exact === 'transposition' (1回だけ入れ替え) は2枚目のタップで即確定。
   戻り値は picks (新しい位置ごとの旧インデックス) か、null (モーダルへ)。 */
function arrangeOnBoard(req) {
  const targetSide = req.target !== undefined ? req.target : ME;
  const list = (panels && panels.panels || []).filter(p => p.side === targetSide);
  if (list.length !== 3 || !stage) return Promise.resolve(null);

  const ov = document.createElement('div');
  ov.id = 'arrOv';
  document.body.appendChild(ov);

  const perm = [0, 1, 2];            // 位置 -> 旧インデックス
  const single = req.exact === 'transposition';
  let sel = -1;

  return new Promise((resolve) => {
    const onResize = () => render();
    window.addEventListener('resize', onResize);
    const finish = (picks) => {
      activeArrange = null;
      window.removeEventListener('resize', onResize);
      ov.remove();
      resolve(picks);
    };
    activeArrange = { cancel: () => finish(PICK_CANCEL) };

    const render = () => {
      const isIdentity = perm[0] === 0 && perm[1] === 1 && perm[2] === 2;
      /* 操作は手札のすぐ上の帯 (効果の確認・手札を捨てるときと同じ場所・大きさ)。
         盤面を大きく映すと帯がプロトコル板に重なるので、並び (左・中・右) も帯の中に出す */
      ov.innerHTML =
        '<div class="arr-bar with-ask sel-bar confirm">' +
          pickBarAsk(req) +
          '<div class="arr-order">' + list.slice().sort((a, b) => a.line - b.line).map((p) => {
            const line = p.line;
            const name = req.current[perm[line]];
            const done = req.compiled && req.compiled[perm[line]];
            return '<button type="button" class="arr-chip' + (sel === line ? ' on' : '') +
              (done ? ' done' : '') + '" data-line="' + line + '">' + (done ? '✓ ' : '') + name + '</button>';
          }).join('') + '</div>' +
          '<div class="sel-hint">' +
            (single ? '入れ替える2つをタップ' : '2つタップで入れ替え。よければ確定') +
          '</div>' +
          '<div class="arr-btns">' +
            /* 帯が自分の山に重なるので、目ボタンで隠して盤面を見られるようにする (他の帯と同じ) */
            PEEK_BTN +
            '<button type="button" class="arr-btn ghost" id="arrList">一覧で選ぶ</button>' +
            '<button type="button" class="arr-btn" id="arrReset">やり直し</button>' +
            (single ? '' : '<button type="button" class="arr-btn ok" id="arrOk"' + (isIdentity ? ' disabled' : '') + '>確定</button>') +
          '</div>' +
        '</div>';
      bindSelectHead(ov, showCardNoteFor);
      bindPeek(ov.querySelector('.arr-bar'));

      ov.querySelectorAll('.arr-chip').forEach((b) => {
        b.onclick = () => {
          const line = +b.dataset.line;
          if (sel === -1) { sel = line; render(); return; }
          if (sel === line) { sel = -1; render(); return; }
          const t = perm[sel]; perm[sel] = perm[line]; perm[line] = t;
              sel = -1;
          if (single) { finish(perm.slice()); return; }
          render();
        };
      });
      const ok = ov.querySelector('#arrOk');
      if (ok) ok.onclick = () => finish(perm.slice());
      ov.querySelector('#arrReset').onclick = () => {
        perm[0] = 0; perm[1] = 1; perm[2] = 2; sel = -1; render();
      };
      ov.querySelector('#arrList').onclick = () => finish(null);
    };
    render();
  });
}

async function drainRequests() {
  if (roomMode) { await roomDrainRequest(); return; }
  let guard = 0;
  while (cur && cur.requests && cur.requests.length && guard++ < 80) {
    const req = cur.requests[0];
    let picks;
    if ((req.player === ME || trainingMode) && !demoMode) {
      UI.setPrompt('');
      picks = await askUser(req);
    } else {
      UI.setPrompt('相手が選択しています…', 'wait');
      await TW.wait(260);
      picks = withoutTrace(() => Engine.ai.answer(cur.state, req));
    }
    if (picks === PICK_CANCEL) continue;
    const prev = shown();
    busy = true;
    const answer = picks === PICK_BACK ? { type: 'back', id: req.id } : { type: 'choose', id: req.id, picks };
    const res = Engine.apply(cur.state, answer);
    if (res.error) { UI.toast(res.error); busy = false; continue; }   // 再質問へ
    logAction(answer);
    cur = res;
    await replayResolution(prev, res, null);
    busy = false;
    refreshHud();
  }
  UI.setPrompt('');
  await stage.home(TIMING.camEase);
}

/* AI のターンを回す */
async function afterTurn() {
  if (roomMode) { await announceTurn(); await roomMaybeFinish(); return; }
  if (puzzle) { await puzzleAfterTurn(); return; }
  if (tutorial && await tutorialAfterStep()) return;
  await announceTurn();
  let guardAi = 0;
  while (cur && cur.state.winner === null && (demoMode || cur.state.turn === AI)
         && !cur.requests.length && guardAi++ < 40) {
    await TW.wait(demoMode ? 420 : 260);
    const action = withoutTrace(() => Engine.ai.action(cur.state));
    if (!action) break;
    await step(action);
    return;   // step が再帰的に afterTurn を呼ぶ
  }
  refreshHud();
  if (cur.state.winner !== null && !resultShown) {
    resultShown = true;
    const win = cur.state.winner === ME;
    const levelBefore = myLevel;
    if (!trainingMode && !puzzle && !demoMode && !roomMode) {
      const st0 = cur.state;
      recordSoloResult(st0.players[ME].protocols.map(p => p.name), st0.players[AI].protocols.map(p => p.name), win, aiDifficulty,
        { turns: (st0.turns || 0) + 1,       // 決着した手番も1つと数える
          cards: ((st0.tally && st0.tally.faceUp[ME]) || []).slice(),
          effects: (st0.tally && st0.tally.effects && st0.tally.effects[ME]) || {} });
      refreshCardGlow();
      if (replayLog) {
        lastReplayId = addReplay({ me: replayLog.init.p0, opp: replayLog.init.p1, win, level: aiDifficulty,
          turns: (st0.turns || 0) + 1, kind: runMode ? runKind : null, init: replayLog.init, actions: replayLog.actions });
        replayLog = null;
      }
    }
    UI.setPrompt(win ? 'あなたの勝ち' : '敗北', 'end');
    const victory = cosmetic('victory', 'default');
    sfx(win ? (victory === 'aurora' ? 'winAurora' : 'win') : 'lose');
    await finaleFx(win);
    await UI.resultCutIn(win, { victory });
    /* レベルが上がったら、手に入った報酬を見せる */
    if (myLevel > levelBefore) await UI.levelUpCutIn(myLevel, rewardsBetween(levelBefore, myLevel));
    if (!trainingMode && !puzzle && !demoMode && !roomMode) await afterGameProgress(cur.state, ME, win, aiDifficulty, false);
    if (demoMode) {
      await TW.wait(900);
      location.reload();
      return;
    }
    if (runMode) {
      if (!runEnded) {
        runEnded = true;
        /* クリアした瞬間 (battle → clear) にだけ経験値を足す */
        if (runKind === 'weekly') {
          const was = loadWeekly().phase;
          showWeeklyAfterGame(win, Object.values(protoIndex));
          if (was === 'battle' && loadWeekly().phase === 'clear') await gainXp('weekly', XP_GAIN.weeklyClear, 'wk:' + weekKey());
        } else {
          const was = loadRun();
          showRunAfterGame(win, compilesBy(cur.state, AI), Object.values(protoIndex));
          const now = loadRun();
          if (was && was.phase === 'battle' && now && now.phase === 'clear') await gainXp('run', XP_GAIN.runClear);
        }
      }
      return;
    }
    showEndActions(win);
  }
}

/* 対局後の導線。盤面は残したまま、次の行動を選べるようにする */
function showEndActions(win) {
  let el = document.getElementById('endBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'endBar';
    document.body.appendChild(el);
  }
  const underdogWin = win && aiDifficulty === UNDERDOG_LEVEL;
  el.innerHTML =
    '<div class="end-title">' + (underdogWin ? '下剋上 達成！' : win ? 'あなたの勝ち' : '敗北') + '</div>' +
    (underdogWin ? '<div class="end-sub">最弱のデッキで最強に勝ちました。TITLE — UNDERDOG を獲得</div>' : '') +
    '<div class="end-btns">' +
      '<button class="arr-btn ok" id="endAgain" type="button">REMATCH</button>' +
      '<button class="arr-btn" id="endTop" type="button">TITLE</button>' +
      '<button class="arr-btn" id="endBoard" type="button">BOARD</button>' +
      (gameHistory.length && !roomMode && !puzzle ? '<button class="arr-btn" id="endReview" type="button">REVIEW</button>' : '') +
      (lastReplayId ? '<button class="arr-btn" id="endSave" type="button">SAVE REPLAY</button>' : '') +
    '</div>';
  el.classList.add('show');
  const saveBtn = el.querySelector('#endSave');
  if (saveBtn) {
    saveBtn.onclick = () => {
      const r = pinReplay(lastReplayId, true);
      UI.toast(r.ok ? 'リプレイを保存しました (RECORD → REPLAYS で見られます)' : r.message, 2600);
      if (r.ok) { saveBtn.disabled = true; saveBtn.textContent = 'SAVED'; }
    };
  }
  const reviewBtn = el.querySelector('#endReview');
  if (reviewBtn) reviewBtn.onclick = () => { el.classList.remove('show'); startReview(win); };
  /* どちらもページを作り直す。シーンを組み直すのが最も確実 */
  el.querySelector('#endAgain').onclick = () => { location.hash = ''; location.reload(); };
  el.querySelector('#endTop').onclick = () => { location.hash = ''; location.reload(); };
  el.querySelector('#endBoard').onclick = () => {
    el.classList.remove('show');
    UI.setPrompt('盤面を確認中 — 右下の「タイトルへ」で戻れます', 'end');
    /* 決着演出の斜めの寄りのままでは盤面が読めないので定位置へ戻す */
    stage.home(600);
    showEndFloat();
  };
}

/* 感想戦: 棋譜を1手ずつ戻して見る。自分の手番では AI のおすすめも出す */
function startReview(win, history, onExit) {
  const final = cur.state;
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
function startReplayView(built) {
  const rep = replayMode;
  const when = new Date(rep.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  UI.toast('REPLAY — ' + when + '　' + rep.me.join(' / ') + ' vs ' + rep.opp.join(' / ') + (rep.win ? '　勝ち' : '　負け'), 3600);
  if (!built.ok) UI.toast('途中から再現できませんでした (そこまでを見られます)', 3600);
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

/* 「盤面を見る」で隠したあと、戻る手段だけ小さく残す */
function showEndFloat() {
  let el = document.getElementById('endFloat');
  if (!el) {
    el = document.createElement('div');
    el.id = 'endFloat';
    document.body.appendChild(el);
    el.innerHTML = '<button class="btn" type="button">タイトルへ</button>';
    el.querySelector('button').onclick = () => { location.hash = ''; location.reload(); };
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

/* 手札公開 (PSYCHIC 0 等): st.revealed の変化を検知して公開ハンドを見せる */
let lastRevealTag = '';
function checkRevealed(st) {
  const r = st && st.revealed;
  if (!r || !Array.isArray(r.cards)) return;
  /* CLARITY 1 のデッキトップ公開は自分の効果でも公開情報。従来は自分が
     公開したものを一律で抑止していたため、カードが一切見えなかった。 */
  const showOwn = r.kind === 'deck' || r.kind === 'card';
  if (r.player === ME && !showOwn) return;
  /* seq (発生順) を含めないと、同じ内容の公開が2回目以降に出なくなる */
  const tag = (r.seq === undefined ? '' : r.seq + '#') + r.player + ':' + r.cards.join(',');
  if (tag === lastRevealTag) return;
  lastRevealTag = tag;
  const who = r.player === ME ? 'あなた' : '相手';
  const title = r.kind === 'deck' ? who + 'のデッキが公開された (' + r.cards.length + '枚)'
    : r.kind === 'hand' ? who + 'の手札が公開された'
    : who + 'がカードを公開した';
  UI.showRevealedHand(r.cards.map((id) => {
    const d = defIndex[id];
    return d ? { img: faceImageURL(d), label: d.proto + ' ' + d.value } : null;
  }).filter(Boolean), title);
}

/* 画面リサイズ/回転: カメラは stage が追従するが、手札や山札の実配置は
   状態遷移時にしか書き直されないため、ここで取り直す */
let relayoutTimer = null;
function onViewportChanged() {
  syncHandDrawerForViewport();
  clearTimeout(relayoutTimer);
  const attempt = (n) => {
    const st = shown();
    if (st && board && !busy) { board.syncInstant(st); return; }
    if (n < 20) relayoutTimer = setTimeout(() => attempt(n + 1), 300);   // 演出中は後で再試行
  };
  relayoutTimer = setTimeout(() => attempt(0), 220);
}
window.addEventListener('resize', onViewportChanged);
/* stage が実際の大きさの変化を検知したとき (回転直後の遅れて確定する大きさなど) */
window.addEventListener('compile:viewport', onViewportChanged);

/* ---------- HUD ---------- */
/* プロトコル板の表示内容 ([line][side]) */
function panelRows(st) {
  return [0, 1, 2].map((line) => {
    const cell = (side) => {
      const proto = st.players[side].protocols[line];
      const meta = protoIndex[proto.name] || {};
      return {
        name: proto.name,
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

/* 再生の途中でプロトコル板を合わせる。並べ替えは板を滑らせて見せ、終わるまで待つ */
function syncPanels(st, animate) {
  if (runMode && runKind === 'run' && st && !runEnded) {
    /* 勝ち抜き戦: 相手にコンパイルされた回数だけライフを減らして見せる。尽きたらその場で終わり */
    const lost = compilesBy(st, AI);
    runHud(lost);
    const run = loadRun();
    if (run && lost >= run.life) {
      runEnded = true;
      showRunAfterGame(false, lost, Object.values(protoIndex));
    }
  }
  if (!panels || !st) return Promise.resolve();
  return panels.update(panelRows(st), { animate });
}

function refreshHud() {
  const st = shown();
  checkRevealed(st);
  /* 盤面そのものの色で手番を示す (決着後はどちらも消す) */
  if (arena && arena.setTurnSide) arena.setTurnSide(st && st.winner === null && !trainingMode ? st.turn : null);
  if (ctrlMarker) {
    /* コントロール変種を使わない対戦ではマーカーを隠す */
    ctrlMarker.group.visible = st.useControl !== false;
    ctrlMarker.update(typeof st.control === 'number' ? st.control : -1, ME, true);
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

/* ---------- ログの整形 ----------
   エンジンのログはカードを def ID (DARKNESS_6) で書くが、カードに印刷されて
   いる表記は「DARKNESS 5」なので、そのままだと盤面と数字が食い違う。
   表記を直したうえで、カード名は触れる部品として切り出す。 */
const LOG_DEF_RE = /[A-Z]+_\d/g;

function mySeat() { return (roomMode && roomRm) ? roomRm.side : ME; }

function logSeatText(text) {
  if (demoMode) return text;                      // 観戦は P1/P2 のまま
  const mine = 'P' + (mySeat() + 1), opp = 'P' + (2 - mySeat());
  /* "P1:" や "P1 の" の形だけ置き換える (英字混じりの文言を壊さない) */
  return text.replace(/(^|[\s(（\[])P([12])(?=[:\s：の])/g, (m, pre, n) =>
    pre + ('P' + n === mine ? 'あなた' : 'P' + n === opp ? '相手' : 'P' + n));
}

/* 「ライン2」だけでは列が分からないので、行為者側のプロトコル名を添える */
function logLineText(text, actorSeat) {
  const st = shown();
  if (!st || !st.players) return text;
  const side = actorSeat === null ? null
    : (roomMode && roomRm ? (actorSeat === roomRm.side ? 0 : 1) : actorSeat);
  return text.replace(/ライン([123])(?!〈)/g, (m, n) => {
    const l = +n - 1;
    const names = side === null
      ? [st.players[0].protocols[l].name, st.players[1].protocols[l].name]
      : [st.players[side].protocols[l].name];
    return m + '〈' + names.join('/') + '〉';
  });
}

function logParts(msg) {
  const text = String(msg == null ? '' : msg);
  const turn = text.match(/^---\s*P(\d)\s*のターン\s*---$/);
  if (turn) {
    const mine = (+turn[1] - 1) === mySeat();
    const out = [];
    out.turn = mine ? 0 : 1;
    out.label = mine ? 'あなたのターン' : '相手のターン';
    return out;
  }
  const actor = text.match(/^P([12])[:\s]/);
  const actorSeat = actor ? +actor[1] - 1 : null;
  /* 裏向きプレイは "カード をライン…" と余分な空白が入るので詰める */
  const body = text.replace(/^(P[12]: )カード を/, '$1カードを');
  const plain = (t) => logLineText(logSeatText(t), actorSeat);
  const parts = [];
  let last = 0, m;
  LOG_DEF_RE.lastIndex = 0;
  while ((m = LOG_DEF_RE.exec(body)) !== null) {
    const d = defIndex[m[0]];
    if (!d) continue;
    if (m.index > last) parts.push({ text: plain(body.slice(last, m.index)) });
    parts.push({ card: m[0], text: d.proto + ' ' + d.value });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ text: plain(body.slice(last)) });
  return parts.length ? parts : [{ text: plain(body) }];
}

/* ログのカード名をタップ: 拡大プレビューではなく、テキストだけの小さな表示 */
function showCardNoteFor(defId) {
  const d = defIndex[defId];
  if (!d) return;
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
      const card = board.cards.get(uid);
      if (!card) return;
      if (on) board.setHighlight(card, COLOR.gold, 0.28, 0.9);
      else board.clearHighlight(card);
    }
  };
}
