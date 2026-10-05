/* =========================================================================
 * 戦績 (CPU 戦)
 *   決着ごとに「自分と相手のプロトコル・勝敗・難易度」をブラウザに残し、
 *   全体・自分のプロトコル別・相手のプロトコル別・デッキ別の勝率を出す。
 * ========================================================================= */

import { replaysTab, bindReplays } from './replays-ui.js';
import { bonusXp } from './xp.js';
import { levelLabel } from './aidecks.js';
import { conquerable, protocolSummary, matchups, winTrend, fastestWin, masteryLevel, cardStats, cardTier, playerLevel, xpForLevel } from './stats-data.js';
import { nextReward } from './rewards.js';
import { raise } from './dialogs.js';

const KEY = 'compileSoloRecords';
const MAX = 2000;
/* アカウント連携 (account.js) が差し込む口。stats.js 自体は通信しない */
const hooks = { onRecord: null, onClear: null, note: null };
export function setStatsHooks(h) { Object.assign(hooks, h); }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 同期で同じ1戦を見分けるための id。以前の記録 (id なし) は日時から作る */
const idOf = (r) => r.id || ('t' + r.at);
function records() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    /* チュートリアルの対戦は戦績に数えない (前に残ったものも読み飛ばす) */
    return Array.isArray(list) ? list.filter(r => r && r.mode !== 'tutorial').map(r => (r.id ? r : { ...r, id: idOf(r) })) : [];
  } catch (e) {
    return [];
  }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (e) { /* private mode */ }
}

export function localRecords() { return records(); }

/* 効果の発動回数 { defId: 回数 } の形だけ通す (カードの種類は64まで) */
export function cleanEffects(e) {
  const out = {};
  if (!e || typeof e !== 'object') return out;
  for (const [k, v] of Object.entries(e).slice(0, 64)) {
    if (/^[A-Z]{2,16}_\d$/.test(k) && Number.isInteger(v) && v > 0) out[k] = Math.min(v, 999);
  }
  return out;
}

/* 別の端末で記録した分 (アカウントから読んだ分) を足す。同じ id は足さない */
export function mergeRecords(remote) {
  const list = records();
  const have = new Set(list.map(r => r.id));
  const add = remote.filter(r => r && r.id && !have.has(r.id));
  if (!add.length) return 0;
  save(list.concat(add).sort((a, b) => a.at - b.at));
  return add.length;
}

/* 1戦を記録する。me / opp: プロトコル名3つ、win: 勝ったか、level: 難易度 (aidecks.js の番号 / 不明なら null)
   extra: { turns: 決着までの手番の数 (両者合計), feats: 取った実績の id, cards: 自分が表で出したカードの defId,
            effects: { defId: 自分のそのカードの効果が発動した回数 } } */
const MODES = ['cpu', 'quick', 'run', 'weekly', 'tutorial', 'tag'];   // tag: 2026-10-04 から残す (前のタッグ戦は印なし)
export function recordSoloResult(me, opp, win, level, extra) {
  const list = records();
  const at = Date.now();
  const x = extra || {};
  const rec = { id: 't' + at + '_' + Math.random().toString(36).slice(2, 6), me: me.slice(), opp: opp.slice(),
    win: !!win, level: level === undefined ? null : level, at,
    turns: Number.isInteger(x.turns) ? x.turns : null, feats: Array.isArray(x.feats) ? x.feats.slice() : [],
    cards: Array.isArray(x.cards) ? x.cards.slice(0, 64) : [], effects: cleanEffects(x.effects),
    /* どのモードの対戦か (管理者の画面で数える) */
    ...(MODES.includes(x.mode) ? { mode: x.mode } : {}),
    /* 短縮マッチ (3本より少ないコンパイルで決着する試合)。実績には数えない */
    ...(x.short ? { short: true } : {}) };
  list.push(rec);
  save(list);
  if (hooks.onRecord) hooks.onRecord(rec);
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

/* ---------- 戦績の画面 ----------
   まとめ (勝率の推移・最短勝利・制覇数) / プロトコル (習熟度と制覇) / 相性 / 詳細 (従来の集計) */

/* プロトコルの並びと色 (cards.json の順)。1回読んだら使い回す */
let protoList = null;
let cardIndex = {};
async function protocols() {
  if (protoList) return protoList;
  try {
    const data = await fetch('data/cards.json').then(r => r.json());
    protoList = data.protocols.map(p => ({ name: p.name, color: p.color || '#b9a4ff' }));
    cardIndex = {};
    for (const p of data.protocols) for (const c of p.cards) cardIndex[c.id] = { proto: p.name, value: c.value, color: p.color || '#b9a4ff' };
  } catch (e) {
    protoList = [];
  }
  return protoList;
}

const pct = (w, n) => (n ? Math.round(100 * w / n) : 0);

/* 勝率の推移 (直近10戦ごとの勝率、最後の60戦ぶん) を折れ線で */
function trendSvg(list) {
  const pts = winTrend(list, 10, 60);
  if (pts.length < 2) return '<p class="pz-note">10戦を超えると、勝率の推移がここに出ます</p>';
  const W = 460, H = 120, P = 8;
  const x = (i) => P + (W - 2 * P) * i / (pts.length - 1);
  const y = (v) => P + (H - 2 * P) * (1 - v);
  const line = pts.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const area = line + ' L' + x(pts.length - 1).toFixed(1) + ' ' + (H - P) + ' L' + x(0).toFixed(1) + ' ' + (H - P) + ' Z';
  const last = pts[pts.length - 1];
  return '<figure class="sr-trend"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="直近10戦ごとの勝率の推移">' +
    [0.25, 0.5, 0.75].map(v => '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="sr-grid"/>').join('') +
    '<text x="' + (P + 2) + '" y="' + (y(0.5) - 4) + '" class="sr-axis">50%</text>' +
    '<path d="' + area + '" class="sr-area"/><path d="' + line + '" class="sr-line"/>' +
    '<circle cx="' + x(pts.length - 1) + '" cy="' + y(last) + '" r="4" class="sr-dot"/></svg>' +
    '<figcaption>直近10戦の勝率 <b>' + Math.round(last * 100) + '%</b></figcaption></figure>';
}

function summaryTab(list, protos) {
  const sum = protocolSummary(list);
  const wonStrongest = protos.filter(p => (sum.get(p.name) || {}).wonStrongest).length;
  const wonAny = protos.filter(p => (sum.get(p.name) || {}).won).length;
  const fast = fastestWin(list);
  const fastTop = fastestWin(list, r => r.level >= 3);
  const tile = (label, value, sub) => '<div class="sr-kpi"><small>' + label + '</small><b>' + value + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>';
  /* レベル・報酬・ミッションはプロフィールにまとめた (ここは短く、押すとプロフィールへ) */
  const pl = playerLevel(list, bonusXp());
  const nx = nextReward(pl.level);
  return '<button type="button" class="sr-level sr-tolink" data-open="profile"><b>Lv ' + pl.level + '</b><span class="sr-xp"><i style="width:' + Math.round(pl.progress * 100) + '%"></i></span>' +
      '<small>' + (nx ? '次の報酬 Lv' + nx.lv + ' まで あと ' + (xpForLevel(nx.lv) - pl.xp) + ' XP' : '報酬はすべて手に入れました') + '</small><em>レベル・報酬・ミッション ▸</em></button>' +
    trendSvg(list) +
    '<div class="sr-kpis">' +
      tile('勝ったことのあるプロトコル', wonAny + '<i>/' + protos.length + '</i>') +
      tile('最強に勝ったプロトコル (制覇)', wonStrongest + '<i>/' + conquerable(protos.map(p => p.name)).length + '</i>') +
      tile('最短で勝った手番', fast ? fast.turns : '—', fast ? esc(fast.me.join(' / ')) : '記録なし') +
      tile('最強に最短で勝った手番', fastTop ? fastTop.turns : '—', fastTop ? esc(fastTop.me.join(' / ')) : '記録なし') +
    '</div>' +
    /* ここは CPU 戦の戦績。オンラインのレート戦の戦績はロビーの「戦績」にあるので、そこへの道を置く */
    '<button type="button" class="sr-tolink sr-rated" data-open="rated"><b>ONLINE RATED</b><small>オンラインのレート戦の戦績・順位表を見る</small><em>▸</em></button>';
}

/* 30プロトコルの習熟度と制覇 (勝った / つよいに勝った / 最強に勝った) */
function protocolTab(list, protos) {
  const sum = protocolSummary(list);
  return '<p class="pz-note">そのプロトコルを入れて戦うと習熟度が上がります (1戦 +1、勝ち +2、つよい以上に勝つと +1)。' +
    '印は 勝った・つよいに勝った・最強に勝った。</p>' +
    '<div class="sr-protos">' + protos.map(p => {
      const t = sum.get(p.name);
      const m = t ? t.mastery : masteryLevel(0);
      const pip = (on, label) => '<i class="' + (on ? 'on' : '') + '" title="' + label + '"></i>';
      return '<div class="sr-proto' + (t ? '' : ' none') + '" style="--pc:' + esc(p.color) + '">' +
        '<div class="sr-ph"><b>' + esc(p.name) + '</b><span>Lv' + m.level + '</span></div>' +
        '<div class="sr-xp"><i style="width:' + Math.round(m.progress * 100) + '%"></i></div>' +
        '<div class="sr-pf"><span class="sr-pips">' + pip(t && t.won, '勝った') + pip(t && t.wonStrong, 'つよいに勝った') +
          pip(t && t.wonStrongest, '最強に勝った') + '</span><small>' + (t ? t.wins + '勝' + (t.games - t.wins) + '敗' : '未使用') + '</small></div>' +
      '</div>';
    }).join('') + '</div>';
}

/* 相性: 使ったことのある自分のプロトコル × 当たったことのある相手のプロトコル */
function matchupTab(list, protos) {
  const mu = matchups(list);
  if (!mu.size) return '<p class="pz-note">まだ記録がありません</p>';
  const order = protos.map(p => p.name);
  const mine = order.filter(n => list.some(r => r.me.includes(n)));
  const theirs = order.filter(n => list.some(r => r.opp.includes(n)));
  const cell = (a, b) => {
    const t = mu.get(a + '|' + b);
    if (!t) return '<td class="nil"></td>';
    const r = t.w / t.n;
    return '<td style="--r:' + r.toFixed(2) + '" title="' + esc(a) + ' 対 ' + esc(b) + ': ' + t.w + '勝' + (t.n - t.w) + '敗">' +
      pct(t.w, t.n) + '<small>' + t.n + '</small></td>';
  };
  return '<p class="pz-note">行が自分、列が相手のプロトコル。数字は勝率 (%)、小さい数字は戦数。赤いほど苦手です。</p>' +
    '<div class="sr-mu"><table><thead><tr><th></th>' + theirs.map(n => '<th><span>' + esc(n) + '</span></th>').join('') + '</tr></thead><tbody>' +
    mine.map(a => '<tr><th>' + esc(a) + '</th>' + theirs.map(b => cell(a, b)).join('') + '</tr>').join('') +
    '</tbody></table></div>';
}

/* 詳細: 以前の集計 (自分・相手のプロトコル、デッキ、難易度) */
function detailTab(list) {
  const groups = [
    ['自分のプロトコル', tally(list, r => r.me)],
    ['相手のプロトコル', tally(list, r => r.opp)],
    ['自分のデッキ', tally(list, r => [r.me.slice().sort().join(' / ')])],
    ['難易度', tally(list.filter(r => r.level !== null), r => [levelLabel(r.level)])]
  ];
  return groups.map(([t, g]) => '<h3 class="sr-h">' + t + '</h3>' + rows(g)).join('');
}

/* 効果をよく使ったカード (上位5枚) */
function effectTop(cs) {
  const top = Array.from(cs.values()).filter(t => t.effects > 0).sort((a, b) => b.effects - a.effects).slice(0, 5);
  if (!top.length) return '';
  return '<div class="sr-fxtop"><small>効果をよく使ったカード</small>' + top.map(t => {
    const d = cardIndex[t.id] || { proto: t.id, value: '' };
    return '<span style="--pc:' + esc(d.color || '#b9a4ff') + '"><b>' + esc(d.proto + ' ' + d.value) + '</b>' + t.effects + '回</span>';
  }).join('') + '</div>';
}

/* カード: 全180枚をプロトコルごとに。光り方 (表で出して勝った数) */
let cardsOnlyUnused = false;     // カードのタブ: まだ表で出していないカードだけ見る
function cardsTab(list, protos) {
  const cs = cardStats(list);
  const total = Object.keys(cardIndex).length;
  const unused = Object.keys(cardIndex).filter(id => !cs.get(id)).length;
  const byProto = new Map();
  for (const [id, d] of Object.entries(cardIndex)) {
    if (!byProto.has(d.proto)) byProto.set(d.proto, []);
    byProto.get(d.proto).push({ id, ...d });
  }
  return '<p class="pz-note">表で出して勝った試合の数で、盤面のカードが光ります: 銅 3勝・銀 10勝・金 25勝・ホロ 50勝。' +
    'カードにカーソルを乗せると、勝った数と効果の発動回数が出ます。</p>' +
    effectTop(cs) +
    /* まだ表で出していないカード: 破線で薄く。数と、それだけ見る切り替え */
    '<div class="sr-unused"><span>まだ表で出していないカード <b>' + unused + '</b> / ' + total + '枚</span>' +
      '<button type="button" class="sr-ufilter' + (cardsOnlyUnused ? ' on' : '') + '" data-unused="1" aria-pressed="' + cardsOnlyUnused + '">' +
      (cardsOnlyUnused ? '全部を見る' : 'まだのカードだけ見る') + '</button></div>' +
    '<div class="sr-cardgrid">' + protos.map(p => {
      const cards = (byProto.get(p.name) || []).sort((a, b) => a.value - b.value);
      if (cardsOnlyUnused && cards.every(c => cs.get(c.id))) return '';
      return '<div class="sr-cgrow" style="--pc:' + esc(p.color) + '"><b>' + esc(p.name) + '</b>' + cards.map(c => {
        const t = cs.get(c.id);
        const tier = t ? cardTier(t.wins) : null;
        if (cardsOnlyUnused && t) return '<span class="sr-cc gone"></span>';
        return '<span class="sr-cc' + (tier ? ' t-' + tier.key : '') + (t ? '' : ' unused') + '" title="' + esc(p.name + ' ' + c.value) +
          (t ? ' - ' + t.wins + '勝 / ' + t.games + '戦・効果 ' + t.effects + '回' : ' - 未使用') + '">' +
          c.value + '</span>';
      }).join('') + '</div>';
    }).join('') + '</div>';
}

/* 実績: 一覧をそのまま (achievements-ui.js の trophyListHtml を、開いてから流し込む) */
function trophiesTab() {
  return '<div class="sr-trophy" id="srTrophies"><p class="pz-note">読み込み中…</p></div>';
}

/* タブは日本語 (COLLECTION のタブとそろえる) */
const TABS = ['まとめ', 'プロトコル', 'カード', '実績', '相性', 'くわしく', 'リプレイ'];

const TAB_KEY = 'compileStatsTab';      // 前に見ていたタブ (次に開いたときもそこから)
export const ROOM_OPEN_KEY = 'compileRoomOpen';   // ?online=1 で開いたロビーで、はじめに出す画面 ('history' = レート戦の戦績)

/** RECORD を開く。opts.tab: タブの名前か番号 (無ければ前に見ていたタブ)、opts.trophy: 実績のタブで送って光らせる実績、
    opts.scroll: はじめのスクロールの位置、opts.fromRated: ロビーのレート戦の戦績から開いた */
export async function openStats(opts) {
  const list = records();
  const protos = await protocols();
  let el = document.getElementById('statsOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'statsOv';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  const wins = list.filter(r => r.win).length;
  el.innerHTML = '<div class="pz-card sr-card" role="dialog" aria-modal="true" aria-label="戦績">' +
    '<div class="pz-head"><b>RECORD<small>戦績</small></b><button type="button" class="pz-x"><span>閉じる</span></button></div>' +
    (hooks.note ? '<p class="sr-cloud">' + esc(hooks.note()) + '</p>' : '') +
    '<p class="sr-total">' + list.length + '戦 <b>' + wins + '勝</b> ' + (list.length - wins) + '敗' +
      (list.length ? '　勝率 <b>' + pct(wins, list.length) + '%</b>' : '') + '</p>' +
    '<div class="sr-tabs" role="tablist">' + TABS.map((t, i) =>
      '<button type="button" role="tab" data-tab="' + i + '" class="' + (i === 0 ? 'on' : '') + '">' + t + '</button>').join('') +
    '</div><div id="srBody"></div>' +
    (list.length ? '<div class="pz-row"><button type="button" id="srClear">記録を消す</button></div>' : '') +
    '</div>';
  const views = [() => summaryTab(list, protos), () => protocolTab(list, protos), () => cardsTab(list, protos),
    () => trophiesTab(), () => matchupTab(list, protos), () => detailTab(list), () => replaysTab()];
  const show = (i) => {
    const body = el.querySelector('#srBody');
    body.innerHTML = views[i]();
    el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', +b.dataset.tab === i));
    bindReplays(body, () => show(i));
    const uf = body.querySelector('[data-unused]');
    if (uf) uf.onclick = () => { cardsOnlyUnused = !cardsOnlyUnused; show(i); };
    /* 実績: 一覧を流し込む。称号のボタンは COLLECTION へ */
    const tb = body.querySelector('#srTrophies');
    if (tb) {
      import('./achievements-ui.js').then(m => {
        tb.innerHTML = m.trophyListHtml();
        m.bindTrophyList(tb);
        const target = trophyFocus && tb.querySelector('#tr-' + trophyFocus);
        trophyFocus = null;
        if (target) { target.scrollIntoView({ block: 'center' }); target.classList.add('tr-flash'); }
      }).catch(() => { tb.innerHTML = '<p class="pz-note">実績を読み込めませんでした</p>'; });
    }
    /* まとめのレベル → プロフィール (重ねて開く。閉じると RECORD に戻る) */
    const toProfile = body.querySelector('[data-open="profile"]');
    if (toProfile) toProfile.onclick = () => import('./profile.js').then(m => m.openProfile(protos));
    /* まとめ → オンラインのレート戦の戦績。ロビーの戦績から開いたときは、閉じればそこへ戻る */
    const toRated = body.querySelector('[data-open="rated"]');
    if (toRated) {
      toRated.onclick = () => {
        if (opts && opts.fromRated) { close(); return; }
        try { sessionStorage.setItem(ROOM_OPEN_KEY, 'history'); } catch (e) { /* private mode */ }
        location.href = location.pathname + '?online=1';
      };
    }
    try { localStorage.setItem(TAB_KEY, String(i)); } catch (e) { /* private mode */ }
  };
  el.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => show(+b.dataset.tab); });
  let trophyFocus = (opts && opts.trophy) || null;
  const want = opts && opts.tab !== undefined ? (typeof opts.tab === 'number' ? opts.tab : TABS.indexOf(opts.tab))
    : (() => { try { return Number(localStorage.getItem(TAB_KEY)); } catch (e) { return 0; } })();
  const close = () => el.classList.remove('show');
  show(want >= 0 && want < TABS.length ? want : 0);
  el.classList.add('show');
  raise(el);   // 開いたままの画面をもう一度開いたときも、いちばん手前へ
  /* リプレイを見て戻ってきたときは、見る前のスクロールの位置へ */
  if (opts && opts.scroll) { const card = el.querySelector('.pz-card'); if (card) card.scrollTop = opts.scroll; }
  el.onclick = (ev) => { if (ev.target === el) close(); };
  el.querySelector('.pz-x').onclick = close;
  const clear = el.querySelector('#srClear');
  if (clear) clear.onclick = () => confirmClear(el);
}

/* 記録を消す前に、画面の中で確かめる (ブラウザの確認ダイアログは使わない) */
function confirmClear(el) {
  const row = el.querySelector('#srClear').parentElement;
  const cloud = !!hooks.onClear;
  row.innerHTML = '<span class="sr-warn">CPU 戦の記録をすべて消します' + (cloud ? ' (アカウントに保存した記録も)' : '') + '。よいですか？</span>' +
    '<button type="button" id="srClearYes" class="warn">消す</button><button type="button" id="srClearNo">やめる</button>';
  row.querySelector('#srClearNo').onclick = () => openStats();
  row.querySelector('#srClearYes').onclick = async () => {
    try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
    if (cloud) {
      try { await hooks.onClear(); } catch (e) {
        row.innerHTML = '<span class="sr-warn">アカウントの記録を消せませんでした: ' + esc(e.message) + '</span>';
        return;
      }
    }
    openStats();
  };
}
