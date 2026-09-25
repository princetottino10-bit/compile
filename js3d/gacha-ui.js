/* =========================================================================
 * COSMETICS のガチャの画面 (進行と保存は gacha.js)
 *   タイトルの GACHA から開く。CHIP で1回 / 10連。出たものは図鑑にたまり、COSMETICS で選べる
 * ========================================================================= */
import * as G from './gacha.js';
import { playCapsule, RAR_NAMES } from './gachafx.js';
import { playerLevel } from './stats-data.js';
import { localRecords } from './stats.js';
import { bonusXp, grantXp } from './xp.js';
import { openSettings } from './settings.js';
import { unlockTrophies, TROPHY_XP } from './achievements.js';
import { trophyContext, showTrophyBanner } from './achievements-ui.js';
import { loginNudgeNeeded, maybeLoginHint, openAccount } from './account.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ORDER = ['L', 'E', 'R', 'C'];

/** これまでに貯めた経験値の合計 (= もらった CHIP の合計) */
export function earnedChips() {
  return playerLevel(localRecords(), bonusXp()).xp;
}
/** いま使える CHIP (タイトルのボタンに出す) */
export function chipsNow() {
  return G.chipsOf(G.loadGacha(), earnedChips());
}

export function openGacha() {
  let el = document.getElementById('gachaOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gachaOv';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  let last = null;            // 直前に引いた結果
  let busy = false;
  const render = () => {
    const s = G.loadGacha();
    const chips = G.chipsOf(s, earnedChips());
    const col = G.collection(s);
    const toPity = G.PITY - s.pity;
    el.innerHTML = '<div class="pz-card ga-card" role="dialog" aria-modal="true" aria-labelledby="gaTitle">' +
      '<div class="pz-head"><b id="gaTitle">// GACHA</b><button type="button" class="pz-x" aria-label="閉じる">×</button></div>' +
      (loginNudgeNeeded() ? '<div class="ga-login"><p><b>ログインしていません</b>引いた見た目と CHIP はこのブラウザにだけ残ります。消えると戻せません。</p>' +
        '<button type="button" id="gaLogin">ログインして守る</button></div>' : '') +
      '<div class="ga-top"><div class="ga-chip"><small>CHIP</small><b>' + chips + '</b><span>経験値が貯まるたびに増える (1 XP = 1 CHIP)</span></div>' +
        '<div class="ga-btns"><button type="button" class="ga-pull" data-n="1"' + (chips >= G.PULL_COST ? '' : ' disabled') + '>1回 <small>' + G.PULL_COST + ' CHIP</small></button>' +
        '<button type="button" class="ga-pull ten" data-n="10"' + (chips >= G.TEN_COST ? '' : ' disabled') + '>10連 <small>' + G.TEN_COST + ' CHIP ・ RARE 以上1つ確定</small></button></div></div>' +
      '<p class="ga-rates">' + ORDER.map(k => '<span class="r' + k + '">' + RAR_NAMES[k] + ' ' + G.RATES[k] + '%</span>').join('') +
        '<em>EPIC 以上まで あと ' + toPity + ' 回で確定</em></p>' +
      (last ? '<div class="ga-results">' + last.map(r => '<div class="ga-res r' + r.rar + '"><small>' + RAR_NAMES[r.rar] + (r.dupe ? ' ・ かぶり +' + r.refund + ' CHIP' : ' ・ NEW') + '</small>' +
        '<b>' + esc(r.name) + '</b></div>').join('') + '</div>' +
        '<div class="pz-row"><button type="button" class="pz-main" id="gaUse">COSMETICS で着ける</button></div>' : '') +
      '<div class="ga-col"><h3>図鑑 <em>' + col.got + ' / ' + col.total + '</em></h3>' +
        ORDER.map(k => '<div class="ga-row r' + k + '"><small>' + RAR_NAMES[k] + '</small><div>' +
          col.list.filter(x => x.rar === k).map(x => '<span class="' + (x.owned ? 'on' : '') + '">' + (x.owned ? esc(x.name) : '???') + '</span>').join('') +
        '</div></div>').join('') + '</div>' +
      '</div>';
  };
  el.onclick = async (ev) => {
    if (ev.target === el || ev.target.closest('.pz-x')) {
      el.classList.remove('show');
      const chip = document.querySelector('.tt-gacha small');      // タイトルのボタンの CHIP も合わせる
      if (chip) chip.textContent = 'CHIP ' + chipsNow();
      return;
    }
    if (ev.target.closest('#gaUse')) { el.classList.remove('show'); openSettings(); return; }
    if (ev.target.closest('#gaLogin')) { el.classList.remove('show'); openAccount(); return; }
    const b = ev.target.closest('.ga-pull');
    if (!b || b.disabled || busy) return;
    const r = G.pullAndSave(earnedChips(), +b.dataset.n);
    if (!r) return;
    busy = true;
    const best = r.results.slice().sort((a, c) => ORDER.indexOf(a.rar) - ORDER.indexOf(c.rar))[0];
    await playCapsule(document.body, best.rar, r.results.length > 1 ? best.name + ' ほか' : best.name);
    last = r.results;
    busy = false;
    render();
    /* ログインしていなければ守るよう勧める (レアを引いたら強めに) */
    maybeLoginHint(best.rar === 'E' || best.rar === 'L' ? 'rarePull' : 'gacha');
    /* ガチャの実績 (回した・そろえた) */
    const got = unlockTrophies(trophyContext(null));
    for (const t of got) grantXp('trophy', TROPHY_XP[t.tier], 'ach:' + t.id);
    if (got.length) { render(); await showTrophyBanner(got); }
  };
  render();
  el.classList.add('show');
}
