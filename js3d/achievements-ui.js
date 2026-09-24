/* =========================================================================
 * 実績の見せ方: 取ったときの知らせ (上から滑り込む帯) と、一覧 (プロフィールから開く)
 *   隠し実績は取るまで「???」。取っていない普通の実績は条件と進み具合を出す
 * ========================================================================= */
import { trophyView, TROPHY_XP } from './achievements.js';
import { localRecords, favoriteCards } from './stats.js';
import { playerLevel, cardStats } from './stats-data.js';
import { xpLog, bonusXp } from './xp.js';

/* 判定に使う材料をそろえる。game: その1試合 (無ければ null) */
export function trophyContext(game) {
  const records = localRecords();
  return { records, xp: xpLog(), favorites: favoriteCards(), level: playerLevel(records, bonusXp()).level,
    cardWins: cardStats(records), game: game || null };
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
  /* まとめて取ったとき (前から遊んでいた人の初回など) は1枚にまとめる */
  if (list.length > 3) {
    const top = ['platinum', 'gold', 'silver', 'bronze'].find(k => list.some(t => t.tier === k));
    el.className = 'tb-' + top;
    el.innerHTML = '<i class="tb-medal" aria-hidden="true"></i><div><small>TROPHIES UNLOCKED</small><b>' + list.length + ' TROPHIES</b>' +
      '<span>' + esc(list.map(t => t.name).join(' · ')) + '</span></div><em>+' + list.reduce((n, t) => n + TROPHY_XP[t.tier], 0) + ' XP</em>';
    el.classList.add('show');
    await wait(4200);
    el.classList.remove('show');
    await wait(360);
    return;
  }
  for (const t of list) {
    el.className = 'tb-' + t.tier;
    el.innerHTML = '<i class="tb-medal" aria-hidden="true"></i><div><small>' + (t.hidden ? 'HIDDEN ' : '') + 'TROPHY UNLOCKED · ' + TIER[t.tier] + '</small>' +
      '<b>' + esc(t.name) + '</b><span>' + esc(t.desc) + '</span></div><em>+' + TROPHY_XP[t.tier] + ' XP</em>';
    el.classList.add('show');
    await wait(2800);
    el.classList.remove('show');
    await wait(360);
  }
}

/* 一覧 */
export function openTrophies() {
  const v = trophyView(trophyContext(null));
  let el = document.getElementById('trophyOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'trophyOv';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  const row = (t) => {
    const secret = t.hidden && !t.at;
    const prog = t.prog ? '<i class="tr-bar"><i style="width:' + Math.min(100, Math.round(100 * t.prog[0] / t.prog[1])) + '%"></i></i><em>' + t.prog[0] + '/' + t.prog[1] + '</em>' : '';
    return '<li class="tr-' + t.tier + (t.at ? ' got' : '') + (secret ? ' secret' : '') + '">' +
      '<i class="tb-medal" aria-hidden="true"></i>' +
      '<div><b>' + (secret ? '???' : esc(t.name)) + '</b><span>' + (secret ? '隠し実績' : esc(t.desc)) + '</span>' + (t.at ? '' : prog) + '</div>' +
      '<small>' + (t.at ? new Date(t.at).toLocaleDateString('ja-JP') : TIER[t.tier]) + '</small></li>';
  };
  const count = (tier) => v.list.filter(t => t.tier === tier && t.at).length + '/' + v.list.filter(t => t.tier === tier).length;
  el.innerHTML = '<div class="pz-card tr-card" role="dialog" aria-modal="true" aria-label="実績">' +
    '<div class="pz-head"><b>TROPHIES</b><button type="button" class="pz-x" aria-label="閉じる">×</button></div>' +
    '<div class="tr-top"><b>' + v.rate + '<i>%</i></b><div><span class="tr-meter"><i style="width:' + v.rate + '%"></i></span>' +
      '<small>' + v.done + ' / ' + v.total + ' ・ BRONZE ' + count('bronze') + ' ・ SILVER ' + count('silver') + ' ・ GOLD ' + count('gold') + '</small></div></div>' +
    '<ul class="tr-list">' + v.list.map(row).join('') + '</ul>' +
    '<p class="pz-note">すべて取ると PLATINUM と称号「PLATINUM」。隠し実績は取るまで条件も見えません。</p></div>';
  el.classList.add('show');
  const close = () => el.classList.remove('show');
  el.onclick = (ev) => { if (ev.target === el) close(); };
  el.querySelector('.pz-x').onclick = close;
}
