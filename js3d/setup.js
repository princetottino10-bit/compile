/* =========================================================================
 * 3Dビュー: 対戦開始前のプロトコル選択
 *   ルール (使うプロトコルの範囲・決め方) を選び、自分の3つを決める。
 *     自由に選ぶ: 3つ選ぶ。相手は範囲の残りから自動で組む
 *     ドラフト  : オンラインと同じ順番で CPU と取り合う (候補の抽選・BAN つき)
 *     ランダム  : 両者とも範囲からランダムに3つ
 *   各プロトコルの「?」で、そのプロトコルの6枚 (効果の文つき) を見られる。
 *   決まりごと (範囲・順番・CPU の選び方) は solodraft.js。
 * ========================================================================= */

import { emblemDataURL } from './emblems.js';
import { showProtocolCards } from './protocards.js';
import { POOLS, poolNames, clampCandidates, draftSteps, shuffled, randomDecks, cpuDraftPick } from './solodraft.js';
import { PROTOCOL_STRENGTH } from './protocol-strength.js';
/* 難易度と固定デッキ (最強・ロック特化・挑戦者)。固定デッキは「自由に選ぶ」でだけ使える */
import { LEVEL_LABELS as AI_LABELS, CHALLENGERS, CHALLENGER_BASE, isChallenger, fixedDeck, challengerName, levelLabel } from './aidecks.js';
export { STRONGEST_AI, LOCK_AI } from './aidecks.js';

const MODES = [
  { key: 'free', label: '自由に選ぶ' },
  { key: 'draft', label: 'ドラフト' },
  { key: 'random', label: 'ランダム' }
];
const CANDIDATES = [[0, '全部'], [12, '12個'], [10, '10個'], [8, '8個']];
const BANS = [[0, 'なし'], [1, '各1'], [2, '各2']];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function lsGet(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

/* options: { training, allowOnline, cardsOf(name) -> 6枚 (protocards.js の形),
              level: 相手を選ぶ画面 (opponent-select.js) で決めた難易度。あれば難易度の段は出さない } */
export function runSetup(protocols, options = {}) {
  const training = !!options.training;
  const root = document.getElementById('setup');
  const grid = document.getElementById('setupGrid');
  const startBtn = document.getElementById('setupStart');
  const levelWrap = document.getElementById('setupLevels');
  const countEl = document.getElementById('setupCount');
  const backBtn = document.getElementById('setupBack');
  const onlineBtn = document.getElementById('setupOnline');
  const head = document.querySelector('#setupHead h1');
  const note = document.querySelector('#setupHead p');
  const byName = Object.fromEntries(protocols.map(p => [p.name, p]));

  let rules = document.getElementById('setupRules');
  if (!rules) {
    rules = document.createElement('div');
    rules.id = 'setupRules';
    document.getElementById('setupHead').after(rules);
  }

  const picked = [];
  const presetLevel = Number.isInteger(options.level) ? options.level : null;
  let level = presetLevel === null ? 1 : presetLevel;
  let poolKey = lsGet('compileSoloPool', 'all');
  /* 強敵 (デッキの決まった相手) には、自分の3つを選ぶだけ */
  let mode = training || (presetLevel !== null && fixedDeck(presetLevel)) ? 'free' : lsGet('compileSoloMode', 'free');
  let draftSize = +lsGet('compileSoloDraftPool', '0');
  let draftBans = +lsGet('compileSoloDraftBans', '0');
  let challenger = Math.min(CHALLENGERS.length - 1, Math.max(0, +lsGet('compileSoloChallenger', '0') || 0));
  let trainingMine = null;     // トレーニングは 自分 → 相手 の2段階で選ぶ
  let draft = null;            // ドラフト中の状態
  let onDraftDone = () => {};  // ドラフトが終わったら (Promise の中で差し替える)
  let sameBtn = document.getElementById('setupSame');
  if (sameBtn) sameBtn.remove();
  sameBtn = null;
  onlineBtn.hidden = training || options.allowOnline === false;

  const pool = () => poolNames(protocols, poolKey);
  const fixedLocked = () => (mode === 'free' ? fixedDeck(level) || [] : []);

  /* ---------- 見出し・ルールの段 ---------- */
  function renderHead() {
    if (draft) return;
    head.innerHTML = training
      ? (trainingMine ? '<b>//</b> TRAINING — 相手のプロトコル' : '<b>//</b> TRAINING SETUP')
      : '<b>//</b> PROTOCOL SELECT';
    note.textContent = training
      ? (trainingMine ? '自分: ' + trainingMine.join(' / ') + '　相手の3つを選ぶ (同じプロトコルも選べる)'
        : 'まず自分のプロトコルを3つ選ぶ。次に相手の3つを選ぶ。置けるのはこの6つのカードだけ。')
      : presetLevel !== null && fixedDeck(presetLevel)
        ? '自分のプロトコルを3つ選ぶ。相手 (' + levelLabel(presetLevel) + ') のデッキは ' + fixedDeck(presetLevel).join(' / ') + '。'
      : mode === 'free' ? '使用するプロトコルを3つ選ぶ。相手は範囲の残りから自動で編成される。'
        : mode === 'draft' ? 'CPU とドラフトで取り合う (CPU の指し方は同じ。難易度は CPU のドラフトの上手さ)。'
          : '両者とも、範囲からランダムに3つ。';
  }

  function seg(items, current, attr) {
    return items.map(([v, label]) => '<button type="button" class="lvl' + (String(v) === String(current) ? ' on' : '') +
      '" data-' + attr + '="' + v + '">' + label + '</button>').join('');
  }

  function renderRules() {
    if (draft) { renderDraftSummary(); return; }
    rules.innerHTML =
      '<div class="sr-group"><span>使うプロトコル</span>' + seg(POOLS.map(p => [p.key, p.label]), poolKey, 'pool') + '</div>' +
      (training || (presetLevel !== null && fixedDeck(presetLevel)) ? ''
        : '<div class="sr-group"><span>決め方</span>' + seg(MODES.map(m => [m.key, m.label]), mode, 'mode') + '</div>') +
      (mode === 'draft'
        ? '<div class="sr-group"><span>候補</span>' + seg(CANDIDATES, draftSize, 'cand') +
          '<span>BAN</span>' + seg(BANS, draftBans, 'bans') + '</div>'
        : '');
    rules.querySelectorAll('[data-pool]').forEach(b => { b.onclick = () => { poolKey = b.dataset.pool; lsSet('compileSoloPool', poolKey); refresh(); }; });
    rules.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { mode = b.dataset.mode; lsSet('compileSoloMode', mode); refresh(); }; });
    rules.querySelectorAll('[data-cand]').forEach(b => { b.onclick = () => { draftSize = +b.dataset.cand; lsSet('compileSoloDraftPool', String(draftSize)); refresh(); }; });
    rules.querySelectorAll('[data-bans]').forEach(b => { b.onclick = () => { draftBans = +b.dataset.bans; lsSet('compileSoloDraftBans', String(draftBans)); refresh(); }; });
  }

  /* ---------- 難易度 ----------
     ドラフトでは CPU の指し方は変えず (つよい に固定)、難易度は CPU のドラフトの上手さにだけ効く。
     強さはドラフトで取り合う */
  function renderLevels() {
    levelWrap.hidden = training || !!draft || presetLevel !== null;
    if (presetLevel !== null) { levelWrap.innerHTML = ''; return; }
    /* 固定デッキ (最強・ロック特化・挑戦者) は自分で選ぶときだけ */
    if (mode !== 'free' && fixedDeck(level)) level = 2;
    /* 挑戦者は1つのボタンにまとめ、選んだらデッキを横の選択肢から選ぶ */
    const items = AI_LABELS.map((label, i) => [i, label]);
    if (mode !== 'draft') items.push([CHALLENGER_BASE + challenger, '挑戦者']);
    const shown = mode === 'draft' ? items.slice(0, 3) : items;
    const lockedLevel = (i) => mode !== 'free' && !!fixedDeck(i);
    levelWrap.innerHTML = (mode === 'draft' ? '<span class="lv-lbl">CPU のドラフト</span>' : '') +
      shown.map(([i, label]) => '<button type="button" class="lvl' + (i === level ? ' on' : '') +
      (lockedLevel(i) ? ' locked' : '') + '" data-level="' + i + '"' +
      (lockedLevel(i) ? ' disabled title="自由に選ぶときだけ"' : '') + '>' + label + '</button>').join('') +
      (isChallenger(level)
        ? '<select class="lv-pick" aria-label="挑戦者のデッキ">' + CHALLENGERS.map((c, k) =>
          '<option value="' + k + '"' + (k === challenger ? ' selected' : '') + '>' + esc(challengerName(c)) + '</option>').join('') + '</select>'
        : '');
    levelWrap.querySelectorAll('[data-level]').forEach(b => {
      b.onclick = () => { level = +b.dataset.level; refresh(); };
    });
    const pick = levelWrap.querySelector('.lv-pick');
    if (pick) pick.onchange = () => {
      challenger = +pick.value;
      lsSet('compileSoloChallenger', String(challenger));
      level = CHALLENGER_BASE + challenger;
      refresh();
    };
  }

  /* ---------- プロトコルの一覧 ---------- */
  function tile(name, cls, tag) {
    const p = byName[name] || {};
    return '<div class="proto-wrap"><button type="button" class="proto' + (cls ? ' ' + cls : '') + '" data-name="' + esc(name) + '"' +
      ' style="--accent:' + (p.color || '#b9a4ff') + '">' +
      '<span class="proto-art" style="background-image:url(&quot;art/' + name.charAt(0) + name.slice(1).toLowerCase() + '.webp&quot;)"></span>' +
      '<img class="proto-emblem" alt="" src="' + emblemDataURL(name, p.color || '#b9a4ff', 96, true) + '">' +
      '<span class="proto-name">' + esc(name) + '</span>' +
      '<span class="proto-set">' + esc(tag || p.set || '') + '</span></button>' +
      (options.cardsOf ? '<button type="button" class="proto-info" data-info="' + esc(name) + '" aria-label="' + esc(name) +
        ' のカードを見る" title="カードを見る">?</button>' : '') + '</div>';
  }

  function bindInfo() {
    grid.querySelectorAll('.proto-info').forEach(b => {
      b.onclick = (ev) => {
        ev.stopPropagation();
        const p = byName[b.dataset.info] || {};
        showProtocolCards(b.dataset.info, p.color, options.cardsOf);
      };
    });
  }

  function renderGrid() {
    if (draft) { renderDraftGrid(); return; }
    const names = pool();
    for (let i = picked.length - 1; i >= 0; i--) if (!names.includes(picked[i])) picked.splice(i, 1);
    const locked = fixedLocked();
    for (const n of locked) { const i = picked.indexOf(n); if (i >= 0) picked.splice(i, 1); }
    const choosing = mode === 'free' || training;
    grid.innerHTML = names.map(n => tile(n, [
      picked.includes(n) ? 'on' : '',
      locked.includes(n) ? 'locked' : '',
      choosing && picked.length >= 3 && !picked.includes(n) ? 'dim' : '',
      choosing ? '' : 'view'
    ].filter(Boolean).join(' '))).join('');
    bindInfo();
    if (!choosing) return;
    grid.querySelectorAll('.proto').forEach(b => {
      b.onclick = () => {
        const n = b.dataset.name;
        if (b.classList.contains('locked')) return;
        const i = picked.indexOf(n);
        if (i >= 0) picked.splice(i, 1);
        else if (picked.length < 3) picked.push(n);
        else return;
        renderGrid();
        syncStart();
      };
    });
  }

  function syncStart() {
    if (draft) return;
    if (training) {
      startBtn.textContent = trainingMine ? 'トレーニング開始' : '次へ: 相手のプロトコル';
      startBtn.disabled = picked.length !== 3;
      countEl.textContent = picked.length + ' / 3';
      return;
    }
    if (mode === 'free') {
      startBtn.textContent = 'START';
      startBtn.disabled = picked.length !== 3;
      countEl.textContent = picked.length + ' / 3';
    } else if (mode === 'draft') {
      const size = clampCandidates(draftSize, draftBans, pool().length);
      startBtn.textContent = 'ドラフト開始';
      startBtn.disabled = pool().length < 6 + draftBans * 2;
      countEl.textContent = '候補 ' + size;
    } else {
      startBtn.textContent = 'ランダムで対戦開始';
      startBtn.disabled = pool().length < 6;
      countEl.textContent = 'RANDOM';
    }
  }

  function refresh() {
    renderHead();
    renderRules();
    renderLevels();
    renderGrid();
    syncStart();
  }

  /* ---------- ドラフト (CPU と取り合う) ---------- */
  function startDraft() {
    const names = pool();
    const size = clampCandidates(draftSize, draftBans, names.length);
    const first = Math.random() < 0.5 ? 0 : 1;           // 0 = あなた
    draft = {
      candidates: shuffled(names).slice(0, size), first,
      steps: draftSteps(first, draftBans), at: 0,
      mine: [], theirs: [], banned: [[], []], sel: [], cpuFlash: []
    };
    backBtn.textContent = '← ルールに戻る';
    levelWrap.hidden = true;
    runDraft();
  }

  const taken = () => draft.mine.concat(draft.theirs, draft.banned[0], draft.banned[1]);
  const left = () => draft.candidates.filter(n => !taken().includes(n));

  function renderDraftSummary() {
    const tags = (list, cls) => list.map(n => '<span class="sd-tag ' + cls + '">' + esc(n) + '</span>').join('') || '<i>—</i>';
    rules.innerHTML =
      '<div class="sd-row"><span>あなた ' + draft.mine.length + '/3</span>' + tags(draft.mine, 'me') + '</div>' +
      '<div class="sd-row"><span>CPU ' + draft.theirs.length + '/3</span>' + tags(draft.theirs, 'opp') + '</div>' +
      (draft.steps.some(s => s.kind === 'ban')
        ? '<div class="sd-row"><span>BAN</span>' + tags(draft.banned[0].concat(draft.banned[1]), 'ban') + '</div>' : '');
  }

  function renderDraftGrid() {
    const step = draft.steps[draft.at];
    const myTurn = step && step.side === 0;
    grid.innerHTML = draft.candidates.map(n => {
      const cls = draft.mine.includes(n) ? 'mine' : draft.theirs.includes(n) ? 'theirs'
        : draft.banned[0].includes(n) || draft.banned[1].includes(n) ? 'banned'
          : draft.sel.includes(n) ? 'on' : draft.cpuFlash.includes(n) ? 'flash' : '';
      const tag = cls === 'mine' ? 'あなた' : cls === 'theirs' ? 'CPU' : cls === 'banned' ? 'BAN' : '';
      return tile(n, cls + (myTurn ? '' : ' view'), tag);
    }).join('');
    bindInfo();
    if (!myTurn) return;
    grid.querySelectorAll('.proto').forEach(b => {
      const n = b.dataset.name;
      if (taken().includes(n)) return;
      b.onclick = () => {
        const i = draft.sel.indexOf(n);
        if (i >= 0) draft.sel.splice(i, 1);
        else if (draft.sel.length < step.n) draft.sel.push(n);
        else if (step.n === 1) draft.sel = [n];
        renderDraftGrid();
        syncDraftStart();
      };
    });
  }

  function syncDraftStart() {
    const step = draft.steps[draft.at];
    if (!step || step.side !== 0) { startBtn.disabled = true; startBtn.textContent = 'CPU が選んでいます…'; return; }
    startBtn.disabled = draft.sel.length !== step.n;
    startBtn.textContent = (step.kind === 'ban' ? 'BAN する' : '確定') + ' (' + draft.sel.length + '/' + step.n + ')';
  }

  function applyDraft(side, names, kind) {
    if (kind === 'ban') draft.banned[side].push(...names);
    else (side === 0 ? draft.mine : draft.theirs).push(...names);
    draft.at++;
  }

  function runDraft() {
    const step = draft.steps[draft.at];
    renderDraftSummary();
    if (!step) { onDraftDone(); return; }
    const who = step.side === 0 ? 'あなた' : 'CPU';
    head.innerHTML = '<b>//</b> DRAFT';
    note.textContent = (draft.first === 0 ? 'あなたが先手。' : 'CPU が先手。') +
      (step.side === 0
        ? (step.kind === 'ban' ? '相手に使わせたくないプロトコルを ' + step.n + ' つ BAN' : 'プロトコルを ' + step.n + ' つ選ぶ')
        : who + 'が' + (step.kind === 'ban' ? 'BAN' : '選択') + 'しています…');
    countEl.textContent = (draft.at + 1) + ' / ' + draft.steps.length;
    draft.sel = [];
    renderDraftGrid();
    syncDraftStart();
    if (step.side === 0) return;
    const token = draft;
    setTimeout(() => {
      if (draft !== token) return;                         // ルールに戻った
      const picks = cpuDraftPick(left(), step.n, level, PROTOCOL_STRENGTH);
      draft.cpuFlash = picks;
      applyDraft(1, picks, step.kind);
      runDraft();
      setTimeout(() => { if (draft === token) { draft.cpuFlash = []; renderDraftGrid(); } }, 700);
    }, 750);
  }

  root.classList.add('show');
  refresh();

  return new Promise((resolve) => {
    const close = (result) => {
      if (sameBtn) sameBtn.remove();
      root.classList.remove('show');
      if (!result.back && !result.online) setTimeout(() => { root.style.display = 'none'; }, 500);
      resolve(result);
    };
    onDraftDone = () => {
      /* 指し方は つよい に固定。選んだ難易度はドラフトの上手さ (draftLevel) として残す */
      const result = { me: draft.mine.slice(), ai: draft.theirs.slice(), level: 2, draftLevel: level, training: false,
        first: draft.first === 0 ? 'me' : 'ai' };
      draft = null;
      close(result);
    };
    /* 戻る: ドラフト中はルールへ、トレーニングの2段目なら1段目へ、それ以外はモード選択へ */
    const backLabel = presetLevel !== null ? '← 相手を選び直す' : '← モード選択';
    backBtn.textContent = backLabel;
    backBtn.onclick = () => {
      if (draft) { draft = null; backBtn.textContent = backLabel; refresh(); return; }
      if (training && trainingMine) {
        picked.length = 0;
        picked.push(...trainingMine);
        trainingMine = null;
        if (sameBtn) { sameBtn.remove(); sameBtn = null; }
        backBtn.textContent = backLabel;
        refresh();
        return;
      }
      close({ back: true });
    };
    onlineBtn.onclick = () => close({ online: true });
    startBtn.onclick = () => {
      if (draft) {
        const step = draft.steps[draft.at];
        if (!step || step.side !== 0 || draft.sel.length !== step.n) return;
        applyDraft(0, draft.sel.slice(), step.kind);
        runDraft();
        return;
      }
      if (training) {
        if (picked.length !== 3) return;
        if (!trainingMine) {
          trainingMine = picked.slice();
          picked.length = 0;
          backBtn.textContent = '← 自分のプロトコル';
          sameBtn = document.createElement('button');
          sameBtn.id = 'setupSame';
          sameBtn.type = 'button';
          sameBtn.className = 'lvl';
          sameBtn.style.marginLeft = 'auto';
          sameBtn.textContent = '自分と同じ3つ';
          sameBtn.onclick = () => close({ me: trainingMine.slice(), ai: trainingMine.slice(), level, training });
          startBtn.before(sameBtn);
          refresh();
          return;
        }
        close({ me: trainingMine.slice(), ai: picked.slice(), level, training });
        return;
      }
      if (mode === 'draft') { startDraft(); return; }
      if (mode === 'random') {
        const { me, ai } = randomDecks(pool());
        close({ me, ai, level, training: false, random: true });
        return;
      }
      if (picked.length !== 3) return;
      let ai;
      if (fixedDeck(level)) ai = fixedDeck(level).slice();
      else {
        const rest = pool().filter(n => !picked.includes(n));
        ai = shuffled(rest).slice(0, 3);
      }
      close({ me: picked.slice(), ai, level, training: false });
    };
  });
}
