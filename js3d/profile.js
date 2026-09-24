/* =========================================================================
 * プロフィール: タイトル右上のレベルを押すと開く
 *   アイコン・レベル・経験値・称号、次の報酬 (中身は取るまで秘密)、取った報酬、見た目を選ぶ入口
 * ========================================================================= */
import { playerLevel, xpForLevel } from './stats-data.js';
import { localRecords } from './stats.js';
import { settings, openSettings } from './settings.js';
import { profileOf } from './cosmetics-ui.js';
import { REWARDS, nextReward } from './rewards.js';
import { emblemDataURL } from './emblems.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function openProfile(protocols) {
  const recs = localRecords();
  const pl = playerLevel(recs);
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
    '<div class="pf-xp"><span><i style="width:' + Math.round(pl.progress * 100) + '%"></i></span>' +
      '<small>XP ' + pl.xp + ' ・ NEXT LV まで ' + (pl.next - pl.xp) + '</small></div>' +
    '<div class="pf-stats"><div><b>' + recs.length + '</b><small>GAMES</small></div><div><b>' + wins + '</b><small>WINS</small></div>' +
      '<div><b>' + got.length + '<i>/' + REWARDS.length + '</i></b><small>REWARDS</small></div></div>' +
    (nx ? '<div class="pf-next"><small>NEXT REWARD</small><b>LV ' + nx.lv + '</b><span>???</span><em>あと XP ' + (xpForLevel(nx.lv) - pl.xp) + '</em></div>'
      : '<div class="pf-next"><small>ALL REWARDS UNLOCKED</small></div>') +
    (got.length ? '<ul class="pf-got">' + got.slice().reverse().map(r => '<li><b>LV ' + r.lv + '</b>' + esc(r.name) + '</li>').join('') + '</ul>' : '') +
    '<p class="pz-note">XP: 1戦 +1・勝ち +2・つよい以上に勝つと +1。取った見た目は COSMETICS で選べます。</p>' +
    '<div class="pz-row"><button type="button" id="pfCos">COSMETICS</button></div>' +
    '</div>';
  el.classList.add('show');
  const close = () => el.classList.remove('show');
  el.onclick = (ev) => { if (ev.target === el) close(); };
  el.querySelector('.pz-x').onclick = close;
  el.querySelector('#pfCos').onclick = () => { close(); openSettings(); };
}
