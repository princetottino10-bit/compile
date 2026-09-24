/* =========================================================================
 * プロフィール: タイトル右上のレベルを押すと開く
 *   アイコン・レベル・経験値・称号、次の報酬 (中身は取るまで秘密)、取った報酬、見た目を選ぶ入口
 * ========================================================================= */
import { nameFieldHtml, bindNameField } from './displayname.js';
import { openAccount } from './account.js';
import { trophyView } from './achievements.js';
import { trophyContext, openTrophies } from './achievements-ui.js';
import { bonusXp, XP_GAIN } from './xp.js';
import { dailyView, DAILY_XP } from './daily.js';
import { playerLevel, xpForLevel } from './stats-data.js';
import { localRecords } from './stats.js';
import { settings, openSettings } from './settings.js';
import { profileOf } from './cosmetics-ui.js';
import { REWARDS, nextReward } from './rewards.js';
import { emblemDataURL } from './emblems.js';

/* 経験値の入り方 (数は stats-data.js の playerXp と xp.js の XP_GAIN) */
const EARN = [
  ['CPU 戦', '+1 / 勝ち +2 (つよい以上 +1)'],
  ['ONLINE', '+' + XP_GAIN.onlinePlay + ' / 勝ち +' + XP_GAIN.onlineWin],
  ['TUTORIAL', 'レッスン +' + XP_GAIN.lesson + ' / 全部 +' + XP_GAIN.tutorialAll],
  ['PUZZLE', '解くと +' + XP_GAIN.puzzle],
  ['RUN', '全勝クリア +' + XP_GAIN.runClear],
  ['WEEKLY', 'クリア +' + XP_GAIN.weeklyClear],
  ['DAILY', 'ミッション +' + DAILY_XP.easy + '〜+' + DAILY_XP.hard + ' / 3つ達成 +' + DAILY_XP.all]
];

/* デイリーミッション (日本時間の0時に入れ替わる) */
function dailyHtml(protocols) {
  const list = dailyView((protocols || []).map(p => p.name));
  const done = list.filter(m => m.done).length;
  return '<div class="pf-daily"><div class="pf-daily-h"><small>DAILY MISSIONS</small><b>' + done + '/' + list.length + '</b>' +
    '<em>3つ達成で +' + DAILY_XP.all + ' XP</em></div><ul>' + list.map(m =>
      '<li class="' + m.tier + (m.done ? ' done' : '') + '"><span>' + esc(m.text) + '</span>' +
      '<i style="--p:' + Math.round(100 * m.n / m.goal) + '%"></i>' +
      '<b>' + (m.done ? 'CLEAR' : m.n + '/' + m.goal) + '</b><em>+' + m.xp + '</em></li>').join('') + '</ul></div>';
}

/* 実績の達成率 (押すと一覧) */
function trophyHtml() {
  const v = trophyView(trophyContext(null));
  return '<button type="button" class="pf-trophy" id="pfTrophy"><small>TROPHIES</small><b>' + v.rate + '<i>%</i></b>' +
    '<span class="tr-meter"><i style="width:' + v.rate + '%"></i></span><em>' + v.done + ' / ' + v.total + '</em></button>';
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function openProfile(protocols) {
  const recs = localRecords();
  const pl = playerLevel(recs, bonusXp());
  const me = profileOf(settings(), recs);
  const proto = (protocols || []).find(p => p.name === me.icon);
  const nx = nextReward(pl.level);
  const got = REWARDS.filter(r => r.lv <= pl.level);
  const wins = recs.filter(r => r.win).length;
  let el = document.getElementById('profileOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'profileOv';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="pz-card pf-card" role="dialog" aria-modal="true" aria-label="プロフィール">' +
    '<div class="pz-head"><b>PROFILE</b><button type="button" class="pz-x" aria-label="閉じる">×</button></div>' +
    '<div class="pf-top">' +
      '<div class="pf-icon">' + (proto ? '<img alt="" src="' + emblemDataURL(proto.name, proto.color || '#b9a4ff', 96, true) + '">' : '<span>//</span>') + '</div>' +
      '<div class="pf-id"><small>PLAYER LEVEL</small><b>' + pl.level + '</b>' + (me.title ? '<em>' + esc(me.title) + '</em>' : '') + '</div>' +
    '</div>' +
    nameFieldHtml('pf') +
    '<div class="pf-xp"><span><i style="width:' + Math.round(pl.progress * 100) + '%"></i></span>' +
      '<small>XP ' + pl.xp + ' ・ NEXT LV まで ' + (pl.next - pl.xp) + '</small></div>' +
    '<div class="pf-stats"><div><b>' + recs.length + '</b><small>GAMES</small></div><div><b>' + wins + '</b><small>WINS</small></div>' +
      '<div><b>' + got.length + '<i>/' + REWARDS.length + '</i></b><small>REWARDS</small></div></div>' +
    (nx ? '<div class="pf-next"><small>NEXT REWARD</small><b>LV ' + nx.lv + '</b><span>???</span><em>あと XP ' + (xpForLevel(nx.lv) - pl.xp) + '</em></div>'
      : '<div class="pf-next"><small>ALL REWARDS UNLOCKED</small></div>') +
    trophyHtml() +
    dailyHtml(protocols) +
    (got.length ? '<ul class="pf-got">' + got.slice().reverse().map(r => '<li><b>LV ' + r.lv + '</b>' + esc(r.name) + '</li>').join('') + '</ul>' : '') +
    '<details class="pf-earn"><summary>HOW TO EARN XP</summary><ul>' + EARN.map(([k, v]) => '<li><span>' + k + '</span><b>' + v + '</b></li>').join('') + '</ul></details>' +
    '<p class="pz-note">取った見た目は COSMETICS で選べます。</p>' +
    '<div class="pz-row"><button type="button" id="pfCos">COSMETICS</button><button type="button" id="pfAcc">ACCOUNT</button></div>' +
    '</div>';
  el.classList.add('show');
  const close = () => el.classList.remove('show');
  el.onclick = (ev) => { if (ev.target === el) close(); };
  el.querySelector('.pz-x').onclick = close;
  el.querySelector('#pfCos').onclick = () => { close(); openSettings(); };
  el.querySelector('#pfAcc').onclick = () => { close(); openAccount(); };
  bindNameField(el, 'pf');
  el.querySelector('#pfTrophy').onclick = () => openTrophies();
}
