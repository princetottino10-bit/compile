/* =========================================================================
 * 戦績 (CPU 戦)
 *   決着ごとに「自分と相手のプロトコル・勝敗・難易度」をブラウザに残し、
 *   全体・自分のプロトコル別・相手のプロトコル別・デッキ別の勝率を出す。
 * ========================================================================= */

const KEY = 'compileSoloRecords';
const MAX = 500;
const LEVELS = ['かんたん', 'ふつう', 'つよい', '最強', 'ロック特化'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function records() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

/* 1戦を記録する。me / opp: プロトコル名3つ、win: 勝ったか、level: 難易度 (0..4 / 不明なら null) */
export function recordSoloResult(me, opp, win, level) {
  const list = records();
  list.push({ me: me.slice(), opp: opp.slice(), win: !!win, level: level === undefined ? null : level, at: Date.now() });
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (e) { /* private mode */ }
}

function tally(list, keysOf) {
  const map = new Map();
  for (const r of list) {
    for (const k of keysOf(r)) {
      const t = map.get(k) || { key: k, n: 0, w: 0 };
      t.n++;
      if (r.win) t.w++;
      map.set(k, t);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.n - a.n || b.w / b.n - a.w / a.n);
}

function rows(list) {
  if (!list.length) return '<p class="pz-note">まだ記録がありません</p>';
  return '<div class="sr-table">' + list.map(t => {
    const rate = Math.round(100 * t.w / t.n);
    return '<div class="sr-row"><span class="sr-name">' + esc(t.key) + '</span>' +
      '<span class="sr-bar"><i style="width:' + rate + '%"></i></span>' +
      '<b>' + rate + '%</b><small>' + t.w + '勝' + (t.n - t.w) + '敗</small></div>';
  }).join('') + '</div>';
}

/* 戦績の画面 */
export function openStats() {
  const list = records();
  let el = document.getElementById('statsOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'statsOv';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  const wins = list.filter(r => r.win).length;
  const byLevel = tally(list.filter(r => r.level !== null), r => [LEVELS[r.level] || '不明']);
  el.innerHTML = '<div class="pz-card sr-card" role="dialog" aria-modal="true" aria-label="戦績">' +
    '<div class="pz-head"><b>戦績 (CPU 戦)</b><button type="button" class="pz-x" aria-label="閉じる">×</button></div>' +
    '<p class="sr-total">' + list.length + '戦 <b>' + wins + '勝</b> ' + (list.length - wins) + '敗' +
      (list.length ? '　勝率 <b>' + Math.round(100 * wins / list.length) + '%</b>' : '') + '</p>' +
    '<div class="sr-tabs" role="tablist">' +
      ['自分のプロトコル', '相手のプロトコル', '自分のデッキ', '難易度'].map((t, i) =>
        '<button type="button" data-tab="' + i + '" class="' + (i === 0 ? 'on' : '') + '">' + t + '</button>').join('') +
    '</div><div id="srBody"></div>' +
    (list.length ? '<div class="pz-row"><button type="button" id="srClear">記録を消す</button></div>' : '') +
    '</div>';
  const tabs = [
    () => rows(tally(list, r => r.me)),
    () => rows(tally(list, r => r.opp)),
    () => rows(tally(list, r => [r.me.slice().sort().join(' / ')])),
    () => rows(byLevel)
  ];
  const show = (i) => {
    el.querySelector('#srBody').innerHTML = tabs[i]();
    el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', +b.dataset.tab === i));
  };
  el.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => show(+b.dataset.tab); });
  show(0);
  el.classList.add('show');
  const close = () => el.classList.remove('show');
  el.onclick = (ev) => { if (ev.target === el) close(); };
  el.querySelector('.pz-x').onclick = close;
  const clear = el.querySelector('#srClear');
  if (clear) clear.onclick = () => {
    if (!confirm('CPU 戦の記録をすべて消しますか？')) return;
    try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
    openStats();
  };
}
