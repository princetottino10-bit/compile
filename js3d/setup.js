/* =========================================================================
 * 3Dビュー: 対戦開始前のプロトコル選択
 *   ルール (使うプロトコルの範囲・決め方) を選び、自分の3つを決める。ふだんは公式ルールのドラフト。
 *     ドラフト  : 公式ルールどおり CPU と 1 → 2 → 2 → 1 つ取り合う。先に取った側が先攻、取った順にラインへ並ぶ
 *                 (候補の数・BAN は好みで足せる)
 *     自由に選ぶ: 3つ選ぶ。相手は範囲の残りから自動で組む。
 *                 1つか2つ選んだところで「残りはランダム」を押すと、自分の残りを範囲の残りからランダムで埋める
 *     ランダム  : 両者とも範囲からランダムに3つ
 *   各プロトコルの「?」で、そのプロトコルの6枚 (効果の文つき) を見られる。
 *   決まりごと (範囲・順番・CPU の選び方) は solodraft.js。
 * ========================================================================= */

import { emblemDataURL } from './emblems.js';
import { showProtocolCards } from './protocards.js';
import { SET_GROUPS, poolKeyOf, groupsOf, poolNames, clampCandidates, draftSteps, shuffled, randomDecks, cpuDraftPick } from './solodraft.js';
import { PROTOCOL_STRENGTH } from './protocol-strength.js';
/* 難易度と固定デッキ (最強・ロック特化・挑戦者)。固定デッキは「自由に選ぶ」でだけ使える */
import { LEVEL_LABELS as AI_LABELS, CHALLENGERS, CHALLENGER_BASE, isChallenger, fixedDeck, challengerName, levelLabel } from './aidecks.js';
export { STRONGEST_AI, LOCK_AI } from './aidecks.js';
import { showTitleBack, hideTitleBack } from './titleback.js';
import { localRecords } from './stats.js';
import { conquered, conquerable, protocolSummary } from './stats-data.js';
import { dailyView } from './daily.js';

const MODES = [
  { key: 'draft', label: 'ドラフト (公式)' },
  { key: 'free', label: '自由に選ぶ' },
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

  /* options.preset: はじめから選んでおく3つ (下剋上タッグの最弱デッキなど) */
  const picked = Array.isArray(options.preset) ? options.preset.slice(0, 3) : [];
  const presetLevel = Number.isInteger(options.level) ? options.level : null;
  let level = presetLevel === null ? 1 : presetLevel;
  /* 最強に勝ったプロトコル (制覇)。最強を相手に選ぶときだけ、まだのものに印を付ける */
  const conq = conquered(localRecords());
  /* 使うプロトコルの範囲は前に選んだものを引き継ぐ (はじめは全部) */
  let poolKey = poolKeyOf(groupsOf(lsGet('compileSoloPool', 'all')));
  /* はじめから選んでおく3つがあるとき (下剋上タッグ) は、全部の範囲から (覚えている範囲の外だと消えていた) */
  if (Array.isArray(options.preset)) poolKey = 'all';
  /* 強敵 (デッキの決まった相手) には、自分の3つを選ぶだけ */
  /* ふだんの CPU 戦は公式のドラフトから (以前の「自由に選ぶ」の保存は使わず、選び直したものだけ覚える) */
  let mode = training || (presetLevel !== null && fixedDeck(presetLevel)) ? 'free' : lsGet('compileSoloModeV2', 'draft');
  if (!MODES.some(m => m.key === mode)) mode = 'free';     // なくした決め方 (一部を選ぶ) を覚えていたとき
  /* カードリストの「このデッキで対戦」で3つ持ってきたときは、そのまま START できる「自由に選ぶ」で開く (覚えている決め方は変えない) */
  if (!training && picked.length >= 1 && options.presetFree !== false) mode = 'free';   // 1つか2つ (デイリーの「▶ 遊ぶ」) なら残りを選ぶか「残りはランダム」
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
  /* 自分で選ぶ決め方 (自由・一部)。固定デッキの相手と戦えるのはこのときだけ */
  const choosingMode = () => mode === 'free';
  /* 選べないもの: 固定デッキの相手のもの + options.lock (下剋上タッグの相手の味方のデッキなど) */
  const fixedLocked = () => (choosingMode() ? (fixedDeck(level) || []).concat(options.lock || []) : []);

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
        ? '自分のプロトコルを3つ選ぶ。相手 (' + levelLabel(presetLevel) + ') のデッキは ' + fixedDeck(presetLevel).join(' / ') +
          (options.lock && options.lock.length ? ' ＋ ' + options.lock.join(' / ') : '') + '。'
      : mode === 'free' ? '使用するプロトコルを3つ選ぶ (1つか2つ選んで「残りはランダム」でもよい)。相手は範囲の残りから自動で編成される。'
        : mode === 'draft' ? '公式ルールのドラフト: CPU と交互に 1 → 2 → 2 → 1 つ取り合う。先に取った側が先攻、取った順にラインへ並ぶ。'
          : '両者とも、範囲からランダムに3つ。';
  }

  function seg(items, current, attr) {
    return items.map(([v, label]) => '<button type="button" class="lvl' + (String(v) === String(current) ? ' on' : '') +
      '" data-' + attr + '="' + v + '">' + label + '</button>').join('');
  }

  function renderRules() {
    if (draft) { renderDraftSummary(); return; }
    rules.innerHTML =
      '<div class="sr-group"><span>使うプロトコル</span>' + SET_GROUPS.map(g => '<button type="button" class="lvl' +
        (groupsOf(poolKey)[g.key] ? ' on' : '') + '" data-pool="' + g.key + '" aria-pressed="' + !!groupsOf(poolKey)[g.key] + '">' + g.label + '</button>').join('') +
        '<span>' + pool().length + '個</span></div>' +
      (training || (presetLevel !== null && fixedDeck(presetLevel)) ? ''
        : '<div class="sr-group"><span>決め方</span>' + seg(MODES.map(m => [m.key, m.label]), mode, 'mode') + '</div>') +
      (mode === 'draft'
        ? '<div class="sr-group"><span>候補</span>' + seg(CANDIDATES, draftSize, 'cand') +
          '<span>BAN</span>' + seg(BANS, draftBans, 'bans') + '</div>'
        : '');
    /* 押すたびに出し入れする。両者で6つ要るので、6つより少なくなる外し方はできない (Aux だけ、など) */
    rules.querySelectorAll('[data-pool]').forEach(b => {
      b.onclick = () => {
        const on = { ...groupsOf(poolKey), [b.dataset.pool]: !groupsOf(poolKey)[b.dataset.pool] };
        if (!SET_GROUPS.some(g => on[g.key]) || poolNames(protocols, poolKeyOf(on)).length < 6) {
          /* 外せない理由を、押したボタンを揺らして目立つ色で少しのあいだ出す (前は数の欄に一瞬出るだけで気づけなかった) */
          b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
          const prev = countEl.dataset.prev || countEl.textContent;
          countEl.dataset.prev = prev;
          countEl.textContent = '両者で6つ要るので、これ以上は外せません';
          countEl.classList.add('warn');
          clearTimeout(countEl._t);
          countEl._t = setTimeout(() => { countEl.textContent = countEl.dataset.prev || ''; countEl.classList.remove('warn'); delete countEl.dataset.prev; }, 2600);
          return;
        }
        poolKey = poolKeyOf(on);
        lsSet('compileSoloPool', poolKey);
        refresh();
      };
    });
    rules.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { mode = b.dataset.mode; lsSet('compileSoloModeV2', mode); refresh(); }; });
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
    if (!choosingMode() && fixedDeck(level)) level = 2;
    /* 挑戦者は1つのボタンにまとめ、選んだらデッキを横の選択肢から選ぶ */
    const items = AI_LABELS.map((label, i) => [i, label]);
    if (mode !== 'draft') items.push([CHALLENGER_BASE + challenger, '挑戦者']);
    const shown = mode === 'draft' ? items.slice(0, 3) : items;
    const lockedLevel = (i) => !choosingMode() && !!fixedDeck(i);
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
  /* タイルに足す情報: 戦い方のタグ (説明として)・今日のミッションの印・自分の習熟度と勝ち数 (30 個から当てずっぽうで選ばないように) */
  const mySummary = protocolSummary(localRecords());
  const dailyProto = (() => { try { const m = dailyView(protocols.map(x => x.name)).find(x => x.proto && !x.done); return m ? m.proto : null; } catch (e) { return null; } })();
  function tile(name, cls, tag) {
    const p = byName[name] || {};
    const me = mySummary.get(name);
    return '<div class="proto-wrap"><button type="button" class="proto' + (cls ? ' ' + cls : '') + '" data-name="' + esc(name) + '"' +
      ' style="--accent:' + (p.color || '#b9a4ff') + '"' + (p.tags ? ' data-tip="' + esc(name + ': ' + p.tags) + '"' : '') + '>' +
      (name === dailyProto ? '<span class="proto-daily" title="今日のミッション">DAILY</span>' : '') +
      (p.tags ? '<span class="proto-tags">' + esc(p.tags) + '</span>' : '') +
      '<span class="proto-art" style="background-image:url(&quot;art/' + name.charAt(0) + name.slice(1).toLowerCase() + '.webp&quot;)"></span>' +
      '<img class="proto-emblem" alt="" src="' + emblemDataURL(name, p.color || '#b9a4ff', 96, true) + '">' +
      /* 最強のデッキ (FIRE / WATER / SPEED) は選べないので、制覇の数にも入らない。印も付けない */
      (level === 3 && !conq.has(name) && conquerable([name]).length ? '<span class="proto-conq" title="まだ最強に勝っていない">未制覇</span>' : '') +
      '<span class="proto-name">' + esc(name) + '</span>' +
      '<span class="proto-set">' + esc(tag || p.set || '') + (!tag && me ? ' ・ Lv' + me.mastery.level + ' ' + me.wins + '勝' : '') + '</span></button>' +
      (options.cardsOf ? '<button type="button" class="proto-info" data-info="' + esc(name) + '" aria-label="' + esc(name) +
        ' のカードを見る" title="カードを見る">?</button>' : '') + '</div>';
  }

  /* 「?」で開いた6枚の画面は、上のタブで今の候補どうしを切り替えられるように (勝ち抜き戦・週替わりと同じ)。
     ドラフト中はドラフトの候補、そうでなければ今並んでいる範囲 */
  function bindInfo() {
    const names = draft ? draft.candidates : pool();
    const list = names.filter(n => byName[n]).map(n => ({ name: n, color: byName[n].color }));
    grid.querySelectorAll('.proto-info').forEach(b => {
      b.onclick = (ev) => {
        ev.stopPropagation();
        const p = byName[b.dataset.info] || {};
        showProtocolCards(b.dataset.info, p.color, options.cardsOf, list);
      };
    });
  }

  function renderGrid() {
    if (draft) { renderDraftGrid(); return; }
    const names = pool();
    for (let i = picked.length - 1; i >= 0; i--) if (!names.includes(picked[i])) picked.splice(i, 1);
    const locked = fixedLocked();
    for (const n of locked) { const i = picked.indexOf(n); if (i >= 0) picked.splice(i, 1); }
    const choosing = choosingMode() || training;
    const max = 3;
    grid.innerHTML = names.map(n => tile(n, [
      picked.includes(n) ? 'on' : '',
      locked.includes(n) ? 'locked' : '',
      choosing && picked.length >= max && !picked.includes(n) ? 'dim' : '',
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
        else if (picked.length < max) picked.push(n);
        else return;
        renderGrid();
        syncStart();
      };
    });
  }

  /* 「残りはランダム」: 自由に選ぶで1つか2つ選んだときだけ、START の横に出す */
  let restBtn = document.getElementById('setupRest');
  if (!restBtn) {
    restBtn = document.createElement('button');
    restBtn.id = 'setupRest';
    restBtn.type = 'button';
    restBtn.className = 'lvl';
    startBtn.before(restBtn);
  }
  restBtn.hidden = true;
  function syncRest() {
    const n = picked.length;
    restBtn.hidden = !!draft || training || mode !== 'free' || n < 1 || n > 2;
    restBtn.textContent = '残り ' + (3 - n) + ' つはランダム';
  }

  function syncStart() {
    syncRest();
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

  /* 自由に選ぶ: 前回の3つと、最近使ったデッキ (前は毎回3つを選び直していた)。押すとその3つを選んだ状態に */
  let recentRow = document.getElementById('setupRecent');
  if (!recentRow) {
    recentRow = document.createElement('div');
    recentRow.id = 'setupRecent';
    grid.before(recentRow);
  }
  function recentDecks() {
    const seen = new Set(), out = [];
    const recs = localRecords();
    for (let i = recs.length - 1; i >= 0 && out.length < 4; i--) {
      const me = recs[i].me;
      if (!Array.isArray(me) || me.length !== 3) continue;
      const k = me.slice().sort().join(',');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(me.slice());
    }
    return out;
  }
  function renderRecent() {
    const ok = new Set(pool());
    const decks = (mode === 'free' && !training && !draft) ? recentDecks().filter(d => d.every(n => ok.has(n))) : [];
    recentRow.hidden = !decks.length;
    recentRow.innerHTML = decks.length ? '<small>最近のデッキ</small>' + decks.map((d, i) =>
      '<button type="button" class="lvl sr-deck" data-deck="' + esc(d.join(',')) + '">' + (i === 0 ? '<em>前回</em>' : '') + esc(d.join(' / ')) + '</button>').join('') : '';
    recentRow.querySelectorAll('[data-deck]').forEach(b => {
      b.onclick = () => { picked.length = 0; picked.push(...b.dataset.deck.split(',')); refresh(); };
    });
  }

  function refresh() {
    renderHead();
    renderRules();
    renderLevels();
    renderRecent();
    renderGrid();
    syncStart();
  }

  /* ---------- ドラフト (CPU と取り合う) ----------
     公式ルール: 先に先攻・後攻を決め、先攻が先にドラフトする。なので最初にコイントスを見せる */
  function startDraft() {
    const names = pool();
    const size = clampCandidates(draftSize, draftBans, names.length);
    const first = Math.random() < 0.5 ? 0 : 1;           // 0 = あなた (先攻)
    draft = {
      candidates: shuffled(names).slice(0, size), first,
      steps: draftSteps(first, draftBans), at: 0,
      mine: [], theirs: [], banned: [[], []], sel: [], cpuFlash: []
    };
    backBtn.textContent = '← ルールに戻る';
    levelWrap.hidden = true;
    coinToss(draft);
  }

  /* コイントス: 回るコインのあとに「あなたが先攻 / 後攻」。見せ終わったらドラフトへ */
  function coinToss(token) {
    const calm = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
    head.innerHTML = '<b>//</b> COIN TOSS';
    note.textContent = '先攻・後攻を決めます。先攻が先にドラフトします。';
    renderDraftSummary();
    grid.innerHTML = '';
    startBtn.disabled = true;
    startBtn.textContent = '抽選中…';
    const meFirst = token.first === 0;
    const toss = document.createElement('div');
    toss.className = 'sd-toss' + (calm ? ' calm' : '');
    toss.innerHTML = '<div class="sd-coin ' + (meFirst ? 'me' : 'cpu') + '"><i>YOU</i><i>CPU</i></div>' +
      '<p><b>' + (meFirst ? 'あなたが先攻' : 'あなたは後攻') + '</b><span>' + (meFirst ? 'あなたが先にドラフトします' : 'CPU が先にドラフトします') + '</span></p>';
    grid.appendChild(toss);
    setTimeout(() => toss.classList.add('done'), calm ? 0 : 1300);
    setTimeout(() => {
      if (draft !== token) return;                        // ルールに戻った
      runDraft();
    }, calm ? 1200 : 2600);
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
      /* 相手のキャラの得意プロトコル (options.favorite) が残っていれば、7 割で先に取る (BAN では使わない) */
      const fav = options.favorite;
      const favFirst = fav && step.kind !== 'ban' && left().includes(fav) && !draft.theirs.includes(fav) && Math.random() < 0.7;
      const picks = favFirst
        ? [fav].concat(cpuDraftPick(left().filter(n => n !== fav), step.n - 1, level, PROTOCOL_STRENGTH))
        : cpuDraftPick(left(), step.n, level, PROTOCOL_STRENGTH);
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
      hideTitleBack();
      if (sameBtn) sameBtn.remove();
      restBtn.hidden = true;
      root.classList.remove('show');
      if (!result.back && !result.online) setTimeout(() => { root.style.display = 'none'; }, 500);
      resolve(result);
    };
    onDraftDone = () => {
      /* 相手を選ぶ画面で強さを決めていれば、その強さで指す (ふつうの CPU 戦)。
         この画面で選ぶときは、指し方は つよい に固定し、選んだ難易度はドラフトの上手さ (draftLevel) にだけ効かせる */
      const result = { me: draft.mine.slice(), ai: draft.theirs.slice(), level: presetLevel !== null ? presetLevel : 2, draftLevel: level, training: false,
        first: draft.first === 0 ? 'me' : 'ai' };
      draft = null;
      close(result);
    };
    /* 戻る: ドラフト中はルールへ、トレーニングの2段目なら1段目へ、それ以外はモード選択へ */
    const backLabel = presetLevel !== null ? '← 相手を選び直す' : '← モード選択';
    backBtn.textContent = backLabel;
    backBtn.onclick = () => {
      if (draft) {
        /* 選び始めていたら、2回押しで確かめる (前は選んだ分が黙って消えた) */
        const started = draft.mine.length || draft.theirs.length || draft.banned[0].length || draft.banned[1].length;
        if (started && !backBtn.classList.contains('armed')) {
          backBtn.classList.add('armed');
          backBtn.textContent = 'ドラフトをやめる (もう一度押す)';
          clearTimeout(backBtn._t);
          backBtn._t = setTimeout(() => { backBtn.classList.remove('armed'); if (draft) backBtn.textContent = '← ルールに戻る'; }, 3000);
          return;
        }
        clearTimeout(backBtn._t);
        backBtn.classList.remove('armed');
        draft = null; backBtn.textContent = backLabel; refresh(); return;
      }
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
    /* 右上の「タイトル」は、相手を選ぶ画面を飛ばしてタイトルまで戻る */
    showTitleBack(() => close({ back: true, title: true }));
    restBtn.onclick = () => {
      if (mode !== 'free' || training || !picked.length || picked.length > 2) return;
      /* 自分の残りは、選んだものと固定デッキの相手のものを除いた範囲から。相手は固定デッキか、さらに残りから */
      const locked = fixedLocked();
      const me = picked.concat(shuffled(pool().filter(n => !picked.includes(n) && !locked.includes(n))).slice(0, 3 - picked.length));
      const ai = fixedDeck(level) ? fixedDeck(level).slice() : shuffled(pool().filter(n => !me.includes(n))).slice(0, 3);
      close({ me, ai, level, training: false, partial: picked.slice(), pool: pool() });
    };
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
        close({ me, ai, level, training: false, random: true, pool: pool() });
        return;
      }
      if (picked.length !== 3) return;
      let ai;
      if (fixedDeck(level)) ai = fixedDeck(level).slice();
      else {
        const rest = pool().filter(n => !picked.includes(n));
        ai = shuffled(rest).slice(0, 3);
      }
      close({ me: picked.slice(), ai, level, training: false, pool: pool() });
    };
  });
}
