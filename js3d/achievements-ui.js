/* =========================================================================
 * 実績の見せ方: 取ったときの知らせ (上から滑り込む帯) と、一覧 (プロフィールから開く)
 *   隠し実績は取るまで「???」。取っていない普通の実績は条件と進み具合を出す
 * ========================================================================= */
import { loadGacha } from './gacha.js';
import { sfx } from './audio.js';
import { trophyView, TROPHY_XP } from './achievements.js';
import { localRecords } from './stats.js';
import { playerLevel, cardStats } from './stats-data.js';
import { xpLog, bonusXp } from './xp.js';
import { TROPHY_TITLES } from './cosmetics-ui.js';
import { TITLES, TROPHY_ITEMS, itemName } from './rewards.js';

/* 判定に使う材料をそろえる。game: その1試合 (無ければ null) */
export function trophyContext(game) {
  const all = localRecords();
  /* 短縮マッチ (RUN・WEEKLY など3本より少ないコンパイルで決着する試合) は実績に数えない。
     印 (short) が無い前の戦績は、RUN と WEEKLY を短縮マッチとみなす。レベルは経験値なので全部で */
  const records = all.filter(r => !(r.short || (r.short === undefined && (r.mode === 'run' || r.mode === 'weekly'))));
  return { records, all, xp: xpLog(), level: playerLevel(all, bonusXp()).level,
    /* カードの縁 (銅・金・ホロ) の実績は、盤面の縁の光り方と同じく全部の勝ちで数える
       (縁はホロになったのに、実績は短縮マッチの勝ちを除いて数えていて付かなかった) */
    cardWins: cardStats(all), game: game || null, gacha: loadGacha() };
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TIER = { bronze: 'BRONZE', silver: 'SILVER', gold: 'GOLD', platinum: 'PLATINUM' };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* 取った実績を1つずつ知らせる (全部出し終えたら解決) */
export async function showTrophyBanner(list) {
  let el = document.getElementById('trophyBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'trophyBanner';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  /* 帯を押すと RECORD のその実績へ (前は押せず、どこで見られるか分からなかった) */
  el.onclick = () => { const id = el.dataset.trophy; el.classList.remove('show'); openTrophies(id || null); };
  /* まとめて取ったとき (前から遊んでいた人の初回など) は1枚にまとめる */
  if (list.length > 3) {
    const top = ['platinum', 'gold', 'silver', 'bronze'].find(k => list.some(t => t.tier === k));
    el.className = 'tb-' + top;
    el.dataset.trophy = '';
    el.innerHTML = '<i class="tb-medal" aria-hidden="true"></i><div><small>TROPHIES UNLOCKED</small><b>' + list.length + ' TROPHIES</b>' +
      '<span>' + esc(list.map(t => t.name).join(' · ')) + '</span></div><em>+' + list.reduce((n, t) => n + TROPHY_XP[t.tier], 0) + ' XP</em>';
    el.classList.add('show');
    sfx('trophy', top);
    await wait(4200);
    el.classList.remove('show');
    await wait(360);
    return;
  }
  for (const t of list) {
    el.className = 'tb-' + t.tier;
    el.dataset.trophy = t.id;
    el.innerHTML = '<i class="tb-medal" aria-hidden="true"></i><div><small>' + (t.hidden ? 'HIDDEN ' : '') + 'TROPHY UNLOCKED · ' + TIER[t.tier] + '</small>' +
      '<b>' + esc(t.name) + '</b><span>' + esc(t.desc) + '</span></div><em>+' + TROPHY_XP[t.tier] + ' XP</em>';
    el.classList.add('show');
    sfx('trophy', t.tier);
    await wait(2800);
    el.classList.remove('show');
    await wait(360);
  }
}

/* 一覧 */
/* 取った数 / 全部の数 (RECORD の実績のタブ) */
export function trophyCounts() {
  const v = trophyView(trophyContext(null));
  const list = Array.isArray(v) ? v : (v.list || v.items || []);
  return { got: list.filter(t => t.at).length, total: list.length };
}

/* 実績の一覧 (RECORD の「実績」のタブの中身)。称号がもらえる実績には、その称号へ飛ぶボタン */
export function trophyListHtml() {
  const v = trophyView(trophyContext(null));
  const titleChip = (id, got) => {
    const key = id === 'platinum' ? 'platinum' : TROPHY_TITLES[id];
    if (!key || !TITLES[key]) return '';
    return got ? '<button type="button" class="tr-title" data-title="' + esc(key) + '" title="COLLECTION の称号で見る">称号 ' + esc(TITLES[key]) + ' ▸</button>'
      : '<em class="tr-title off">称号 ' + esc(TITLES[key]) + '</em>';
  };
  /* 称号のほかにもらえる見た目 (スリーブ・マーカー)。取っていればその見た目へ飛ぶ */
  const itemChips = (id, got) => TROPHY_ITEMS.filter(g => g.trophy === id).map(g => {
    const label = ({ sleeve: 'スリーブ', marker: 'マーカー' }[g.kind] || '') + ' ' + itemName(g.kind, g.key).split(' — ').pop();
    return got ? '<button type="button" class="tr-title" data-kind="' + esc(g.kind) + '" data-key="' + esc(g.key) + '" title="COLLECTION で見る">' + esc(label) + ' ▸</button>'
      : '<em class="tr-title off">' + esc(label) + '</em>';
  }).join('');
  const row = (t) => {
    const secret = t.hidden && !t.at;
    const prog = t.prog ? '<i class="tr-bar"><i style="width:' + Math.min(100, Math.round(100 * t.prog[0] / t.prog[1])) + '%"></i></i><em>' + t.prog[0] + '/' + t.prog[1] + '</em>' : '';
    return '<li id="tr-' + esc(t.id) + '" class="tr-' + t.tier + (t.at ? ' got' : '') + (secret ? ' secret' : '') + '">' +
      '<i class="tb-medal" aria-hidden="true"></i>' +
      '<div><b>' + (secret ? '???' : esc(t.name)) + '</b><span>' + (secret ? '隠し実績' : esc(titleChip(t.id, false) || itemChips(t.id, false) ? t.desc.replace(/\s*\((称号|スリーブ|マーカー)[^)]*\)/, '') : t.desc)) + '</span>' + (t.at ? '' : prog) +
        (secret ? '' : titleChip(t.id, !!t.at) + itemChips(t.id, !!t.at)) + '</div>' +
      '<small>' + (t.at ? new Date(t.at).toLocaleDateString('ja-JP') : TIER[t.tier]) + '</small></li>';
  };
  const count = (tier) => v.list.filter(t => t.tier === tier && t.at).length + '/' + v.list.filter(t => t.tier === tier).length;
  return '<div class="tr-top"><b>' + v.rate + '<i>%</i></b><div><span class="tr-meter"><i style="width:' + v.rate + '%"></i></span>' +
      '<small>' + v.done + ' / ' + v.total + ' ・ BRONZE ' + count('bronze') + ' ・ SILVER ' + count('silver') + ' ・ GOLD ' + count('gold') + ' ・ PLATINUM ' + count('platinum') + '</small></div></div>' +
    '<ul class="tr-list">' + v.list.map(row).join('') + '</ul>' +
    '<p class="pz-note">すべて取ると PLATINUM と称号「PLATINUM」。隠し実績は取るまで条件も見えません。</p>';
}
/* 一覧の中の「称号 X ▸」「SLEEVE X ▸」→ COLLECTION のその見た目 (重ねて開く。戻ると一覧へ) */
export function bindTrophyList(root) {
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('.tr-title[data-title], .tr-title[data-kind]');
    if (!b) return;
    if (b.dataset.kind) import('./cosmetics-mode.js').then(m => m.openCosmetics({ tab: b.dataset.kind, focus: b.dataset.key }));
    else import('./cosmetics-mode.js').then(m => m.openCosmetics({ tab: 'title', focus: b.dataset.title }));
  });
}

/* 実績の一覧を開く = RECORD の「実績」のタブ (前は別の小窓で、RECORD のタブはボタンだけだった)。
   id を渡すとその実績まで送って光らせる */
export function openTrophies(id) {
  import('./stats.js').then(m => m.openStats({ tab: '実績', trophy: id || null }));
}
