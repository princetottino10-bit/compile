/* =========================================================================
 * 詰めコンパイル (?tsume=t1-01)
 *   1手番で完結する問題。割り込みや連鎖を読み切って、お題を達成する。
 *   問題は data/tsume.json (scripts/tsume_gen.js で作り、tsume_pick.js で選んだもの)。
 *   盤面は問題モード (puzzle.js) と同じ仕組みで遊び、手番を終えた時点で判定する。
 *   解いた問題は localStorage の compileTsume に残す (アカウントの保存にも載る)
 * ========================================================================= */

const KEY = 'compileTsume';
export const TIERS = [
  { tier: 1, name: '初級', note: '最初の一手と、その効果の選び方' },
  { tier: 2, name: '中級', note: '効果がつながる。途中の選択まで読む' },
  { tier: 3, name: '上級', note: '連鎖と割り込みが重なる。最後まで読み切る' }
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let cache = null;
/** @returns {Promise<Array<object>>} 問題の一覧 (読めなければ空) */
export async function loadTsume() {
  if (cache) return cache;
  try {
    const res = await fetch('data/tsume.json', { cache: 'no-cache' });
    cache = res.ok ? await res.json() : [];
  } catch (e) {
    cache = [];
  }
  return cache;
}

/** 解いた問題 { id: true } */
export function clearedMap() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    return o && typeof o.cleared === 'object' && o.cleared ? o.cleared : {};
  } catch (e) {
    return {};
  }
}

export function markCleared(id) {
  const cleared = { ...clearedMap(), [id]: true };
  try { localStorage.setItem(KEY, JSON.stringify({ cleared })); } catch (e) { /* private mode */ }
  return cleared;
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
export function nextOf(list, id) {
  const i = list.findIndex(p => p.id === id);
  return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
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

/** 問題の一覧。選んだ問題の id か、戻るなら null */
export async function openTsumeList() {
  const list = await loadTsume();
  const cleared = clearedMap();
  const done = list.filter(p => cleared[p.id]).length;
  const el = overlay(
    '<div class="pz-card ts-card" role="dialog" aria-modal="true" aria-labelledby="tsTitle">' +
      '<div class="pz-head"><b id="tsTitle">詰めコンパイル</b><button type="button" class="pz-x" aria-label="戻る">×</button></div>' +
      '<p class="ts-lead">1手番で完結する問題です。効果の連鎖や割り込みを読み切って、お題を達成してください。' +
        '<span class="ts-count">' + done + ' / ' + list.length + ' 問クリア</span></p>' +
      (list.length ? TIERS.map(t => {
        const items = list.filter(p => p.tier === t.tier);
        const got = items.filter(p => cleared[p.id]).length;
        return '<section class="ts-tier" data-tier="' + t.tier + '">' +
          '<h3><span>' + t.name + '</span><small>' + esc(t.note) + '</small><em>' + got + '/' + items.length + '</em></h3>' +
          '<div class="ts-grid">' + items.map((p, i) =>
            '<button type="button" data-id="' + esc(p.id) + '" class="' + (cleared[p.id] ? 'done' : '') + '">' +
              '<b>' + (i + 1) + '</b><span>' + esc(shortGoal(p.goal, p.spec.sides[0].protos)) + '</span>' +
              (cleared[p.id] ? '<i aria-label="クリア済み">✓</i>' : '') +
            '</button>').join('') +
          '</div></section>';
      }).join('') : '<p class="pz-note">問題を読み込めませんでした。通信を確かめて、もう一度開いてください。</p>') +
    '</div>');
  return new Promise((resolve) => {
    const close = (id) => { el.classList.remove('show'); resolve(id); };
    el.onclick = (ev) => {
      if (ev.target === el || ev.target.closest('.pz-x')) { close(null); return; }
      const b = ev.target.closest('button[data-id]');
      if (b) close(b.dataset.id);
    };
    const first = el.querySelector('.ts-grid button:not(.done)') || el.querySelector('.ts-grid button');
    if (first) first.focus();
  });
}

/** 模範解答 (手順を1行ずつ) */
export function showAnswer(p) {
  const el = overlay(
    '<div class="pz-card" role="dialog" aria-modal="true">' +
      '<div class="pz-head"><b>模範解答</b><button type="button" class="pz-x" aria-label="閉じる">×</button></div>' +
      '<ol class="ts-steps">' + p.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
      (p.solutions > 1 ? '<p class="pz-note">ほかにもう1通りの解き方があります。</p>' : '') +
      '<p class="pz-note">最後の選択のあとに自動で解決される効果は省いています。</p>' +
    '</div>');
  el.onclick = (ev) => { if (ev.target === el || ev.target.closest('.pz-x')) el.classList.remove('show'); };
}
