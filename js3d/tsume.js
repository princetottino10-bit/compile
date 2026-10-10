/* =========================================================================
 * 詰めコンパイル (?tsume=t1-01)
 *   1手番で完結する問題。割り込みや連鎖を読み切って、お題を達成する。
 *   問題は data/tsume.json (scripts/tsume_gen.js で作り、tsume_pick.js で選んだもの)。
 *   盤面は問題モード (puzzle.js) と同じ仕組みで遊び、手番を終えた時点で判定する。
 *   解いた問題は経験値の帳簿 (k:ts:問題の id / 今日の問題は k:dp:日) で数える (アカウントの保存にも載る)
 * ========================================================================= */

import { showTitleBack, hideTitleBack } from './titleback.js';
import { xpLog, XP_GAIN } from './xp.js';
import { dayIndex } from './daily.js';

export const TIERS = [
  { tier: 1, name: '初級', note: '最初の一手と、その効果の選び方' },
  { tier: 2, name: '中級', note: '効果がつながる。途中の選択まで読む' },
  { tier: 3, name: '上級', note: '連鎖と割り込みが重なる。最後まで読み切る' }
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 解いたときの経験値 (問題ごとに初回。今日の問題は日ごとに) */
export function tsumeXp(p) {
  if (p.daily != null) return p.hard ? XP_GAIN.tsumeDailyHard : XP_GAIN.tsumeDaily;
  return XP_GAIN['tsume' + p.tier] || XP_GAIN.tsume1;
}
/** 経験値の帳簿の key (実績の数え上げにも使う: k:ts:t2-03 / k:dp:日) */
export function tsumeXpKey(p) {
  return p.daily != null ? (p.hard ? 'dph:' : 'dp:') + p.daily : 'ts:' + p.id;
}

/* 読めなかったときは覚えない (前は空の一覧を覚え続け、通信の失敗なのに「問題が見つかりません」と出て、読み直すまで直らなかった)。
   loadFailed: 最後の読み込みが通信などで失敗したか (呼ぶ側が「通信できませんでした」と出し分ける) */
export let loadFailed = false;
async function loadJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) { loadFailed = true; return null; }
    const v = await res.json();
    loadFailed = false;
    return Array.isArray(v) ? v : [];
  } catch (e) {
    loadFailed = true;
    return null;
  }
}

let cache = null;
/** @returns {Promise<Array<object>>} 問題の一覧 (読めなければ空。そのときは覚えず、次に読み直す) */
export async function loadTsume() {
  if (cache) return cache;
  const v = await loadJson('data/tsume.json');
  if (v) cache = v;
  return v || [];
}

let dailyCache = null;
/** 今日の問題の出題元 (一覧に置いていない問題) */
export async function loadDailyList() {
  if (dailyCache) return dailyCache;
  const v = await loadJson('data/tsume-daily.json');
  if (v) dailyCache = v;
  return v || [];
}

/** その日の問題。日本時間の0時に替わり、どの端末でも同じ。
    進み幅は問題数と割り切れない数にして、全部を一巡してから繰り返す */
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export function dailyPick(all, day = dayIndex(), hard = false) {
  /* 今日の問題は初級・中級から、今日の上級は上級から */
  const list = (all || []).filter(p => (hard ? p.tier === 3 : p.tier !== 3));
  if (!list.length) return null;
  let step = 97;
  while (gcd(step, list.length) !== 1) step++;
  const p = list[((day * step + 13) % list.length + list.length) % list.length];
  return { ...p, daily: day, hard };
}

/** 今日の問題を解いたか (経験値の帳簿で見る。アカウントの保存で別の端末とも揃う) */
export function dailyPuzzleDone(day = dayIndex(), log = xpLog(), hard = false) {
  return log.some(e => e.id === (hard ? 'k:dph:' : 'k:dp:') + day);
}

/** 解いた問題 { id: true } (経験値の帳簿 k:ts:id から。問題を作り直しても id ごとに数え直せる) */
export function clearedMap(log = xpLog()) {
  const out = {};
  for (const e of log) { const m = /^k:ts:(t\d-\d+)$/.exec(e.id || ''); if (m) out[m[1]] = true; }
  return out;
}

/** お題の文。protos は自分のプロトコル名 (ラインの呼び名に使う) */
export function goalText(goal, protos) {
  if (goal.kind === 'ready') return '次のターンにコンパイルできる状態にする';
  if (goal.kind === 'emptyHand') return 'この手番の終わりに手札を0枚にする';
  return 'この手番の終わりに ' + protos[goal.line] + ' のラインの合計を ちょうど ' + goal.value + ' にする';
}

function shortGoal(goal, protos) {
  if (goal.kind === 'ready') return 'コンパイルの準備';
  if (goal.kind === 'emptyHand') return '手札を0枚に';
  return protos[goal.line] + ' を ' + goal.value + ' に';
}

/** 判定。endSt = 手番を終えた時点、finalSt = いまの盤面。Engine は compilableLines / lineTotal を使う */
export function judgeTsume(goal, endSt, finalSt, me, Engine) {
  if (finalSt.winner === me) return goal.kind === 'ready'
    ? { ok: true, text: '勝利しました' } : { ok: false, text: '勝利しましたが、お題は別のことです' };
  if (finalSt.winner === 1 - me) return { ok: false, text: '相手が勝利しました' };
  if (goal.kind === 'ready') {
    const lines = Engine.compilableLines(endSt, me);
    return lines.length
      ? { ok: true, text: endSt.players[me].protocols[lines[0]].name + ' をコンパイルできる状態です' }
      : { ok: false, text: 'コンパイルできる (10以上で相手より大きい) ラインがありません' };
  }
  if (goal.kind === 'emptyHand') {
    const n = endSt.players[me].hand.length;
    return n === 0 ? { ok: true, text: '手札を使い切りました' } : { ok: false, text: '手札が ' + n + ' 枚残っています' };
  }
  const v = Engine.lineTotal(endSt, goal.line, me);
  const name = endSt.players[me].protocols[goal.line].name;
  return v === goal.value
    ? { ok: true, text: name + ' のラインがちょうど ' + v + ' です' }
    : { ok: false, text: name + ' のラインは ' + v + ' でした (お題は ' + goal.value + ')' };
}

/** 次の問題 (同じ段の次、段の最後なら次の段の最初)。無ければ null */
/** 次の問題: 同じ段のまだ解いていない問題 (後ろ → 前の順で探す)。無ければ、次の段のまだの問題。
    cleared を渡さなければ、並びの次 (前と同じ) */
export function nextOf(list, id, cleared) {
  const i = list.findIndex(p => p.id === id);
  if (!cleared) return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
  const me = list[i];
  const open = (p) => p && p.id !== id && !cleared[p.id];
  const tier = me ? me.tier : null;
  const sameTier = list.filter(p => p.tier === tier);
  const after = sameTier.slice(sameTier.indexOf(me) + 1).find(open) || sameTier.find(open);
  if (after) return after;
  return list.filter(p => tier == null || p.tier > tier).find(open) || null;
}
/** 今日の問題を解いたあとの続き: いちばん下の段のまだ解いていない問題 */
export function firstOpen(list, cleared) {
  return list.find(p => !cleared[p.id]) || null;
}

function overlay(html) {
  let el = document.getElementById('tsumeList');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tsumeList';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  el.innerHTML = html;
  el.classList.add('show');
  return el;
}

/* 挑戦した問題 (解けたかは帳簿で分かる。解けていないのに挑戦したものに印を付ける) と、最後に開いた問題 */
const TRIED_KEY = 'compileTsumeTried', LAST_KEY = 'compileTsumeLast';
function triedSet() { try { return new Set(JSON.parse(localStorage.getItem(TRIED_KEY) || '[]')); } catch (e) { return new Set(); } }
/** 問題を開いたときに呼ぶ (一覧の「挑戦中」の印と、次に一覧を開いたときの位置のため) */
export function markTsumeTried(id) {
  if (!id || id === 'list' || /^daily/.test(id)) return;
  try {
    const t = triedSet(); t.add(id);
    localStorage.setItem(TRIED_KEY, JSON.stringify([...t].slice(-300)));
    localStorage.setItem(LAST_KEY, id);
  } catch (e) { /* private mode */ }
}

/** 問題の一覧。選んだ問題の id か、戻るなら null */
export async function openTsumeList() {
  const list = await loadTsume();
  const cleared = clearedMap();
  const tried = triedSet();
  const lastId = (() => { try { return localStorage.getItem(LAST_KEY); } catch (e) { return null; } })();
  const done = list.filter(p => cleared[p.id]).length;
  const today = dailyPuzzleDone();
  const todayHard = dailyPuzzleDone(undefined, undefined, true);
  const el = overlay(
    '<div class="pz-card ts-card" role="dialog" aria-modal="true" aria-labelledby="tsTitle">' +
      '<div class="pz-head"><b id="tsTitle">COMPUZZLE<small>詰めコンパイル</small></b></div>' +
      '<p class="ts-lead">1手番で完結する問題です。効果の連鎖や割り込みを読み切って、お題を達成してください。' +
        '<span class="ts-count">' + done + ' / ' + list.length + ' 問クリア</span></p>' +
      '<button type="button" class="ts-daily' + (today ? ' done' : '') + '" data-id="daily">' +
        '<small>DAILY</small><b>今日の問題</b><span>日本時間の0時に替わる1問 (+' + XP_GAIN.tsumeDaily + ' XP)</span>' +
        '<i>' + (today ? '✓ CLEAR' : 'PLAY') + '</i></button>' +
      '<button type="button" class="ts-daily hard' + (todayHard ? ' done' : '') + '" data-id="daily-hard">' +
        '<small>DAILY</small><b>今日の上級</b><span>上級から1問。読み切れたら +' + XP_GAIN.tsumeDailyHard + ' XP</span>' +
        '<i>' + (todayHard ? '✓ CLEAR' : 'PLAY') + '</i></button>' +
      (list.length ? TIERS.map(t => {
        const items = list.filter(p => p.tier === t.tier);
        const got = items.filter(p => cleared[p.id]).length;
        return '<section class="ts-tier" data-tier="' + t.tier + '">' +
          '<h3><span>' + t.name + '</span><small>' + esc(t.note) + '</small><em>' + got + '/' + items.length + '</em></h3>' +
          '<div class="ts-grid">' + items.map((p, i) =>
            '<button type="button" data-id="' + esc(p.id) + '" class="' + (cleared[p.id] ? 'done' : tried.has(p.id) ? 'tried' : '') + (p.id === lastId ? ' last' : '') + '">' +
              '<b>' + (i + 1) + '</b><span>' + esc(shortGoal(p.goal, p.spec.sides[0].protos)) + '</span>' +
              (cleared[p.id] ? '<i aria-label="クリア済み">✓</i>' : tried.has(p.id) ? '<i class="ts-tried" aria-label="挑戦中">…</i>' : '') +
            '</button>').join('') +
          '</div></section>';
      }).join('') : '<p class="pz-note">問題を読み込めませんでした。通信を確かめて、もう一度開いてください。</p>') +
    '</div>');
  return new Promise((resolve) => {
    const close = (id) => { hideTitleBack(); el.classList.remove('show'); resolve(id); };
    showTitleBack(() => close(null));
    el.onclick = (ev) => {
      if (ev.target === el) { close(null); return; }
      const b = ev.target.closest('button[data-id]');
      if (b) close(b.dataset.id);
    };
    /* 前に開いた問題があればそこへ (前は毎回いちばん上から) */
    const lastBtn = el.querySelector('.ts-grid button.last');
    if (lastBtn) { lastBtn.scrollIntoView({ block: 'center' }); lastBtn.focus({ preventScroll: true }); return; }
    const first = el.querySelector('.ts-daily:not(.done)') || el.querySelector('.ts-grid button:not(.done)') || el.querySelector('.ts-grid button');
    if (first) first.focus();
  });
}

/** 山札と捨て札を見る (詰めコンパイルは全部見えてよい。山札は上から順に)。defs: defId → { proto, value, color, upper, middle, lower } */
export function showDeck(st, defs, me = 0) {
  const pl = st.players[me];
  const card = (uid, i) => {
    const d = defs[st.cards[uid].def] || {};
    const text = [d.upper, d.middle, d.lower].filter(Boolean).join(' / ');
    return '<li style="--pc:' + esc(d.color || '#b9a4ff') + '">' + (i !== undefined ? '<em>' + (i + 1) + '</em>' : '') +
      '<b>' + esc((d.proto || '') + ' ' + (d.value !== undefined ? d.value : '')) + '</b><span>' + esc(text) + '</span></li>';
  };
  const el = overlay(
    '<div class="pz-card ts-deck" role="dialog" aria-modal="true" aria-labelledby="tsDeckT">' +
      '<div class="pz-head"><b id="tsDeckT">DECK<small>山札 (上から順に)</small></b><button type="button" class="pz-x"><span>閉じる</span></button></div>' +
      '<p class="pz-note">詰めコンパイルでは山札の中身と順番も見られます。カードを引く効果では、上から順に引きます。</p>' +
      (pl.deck.length ? '<ol>' + pl.deck.map((u, i) => card(u, i)).join('') + '</ol>' : '<p class="pz-note">山札はありません</p>') +
      '<h3>捨て札</h3>' + (pl.trash.length ? '<ol class="trash">' + pl.trash.map(u => card(u)).join('') + '</ol>' : '<p class="pz-note">捨て札はありません</p>') +
    '</div>');
  el.onclick = (ev) => { if (ev.target === el || ev.target.closest('.pz-x')) el.classList.remove('show'); };
}

/** 模範解答 (手順を1行ずつ) */
export function showAnswer(p) {
  const el = overlay(
    '<div class="pz-card" role="dialog" aria-modal="true">' +
      '<div class="pz-head"><b>ANSWER<small>模範解答</small></b><button type="button" class="pz-x"><span>閉じる</span></button></div>' +
      '<ol class="ts-steps">' + p.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
      (p.solutions > 1 ? '<p class="pz-note">ほかにもう1通りの解き方があります。</p>' : '') +
      '<p class="pz-note">最後の選択のあとに自動で解決される効果は省いています。</p>' +
    '</div>');
  el.onclick = (ev) => { if (ev.target === el || ev.target.closest('.pz-x')) el.classList.remove('show'); };
}
