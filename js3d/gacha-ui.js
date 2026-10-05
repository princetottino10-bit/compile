/* =========================================================================
 * COSMETICS のガチャの画面 (進行と保存は gacha.js)
 *   タイトルの GACHA から開く。CHIP で1回 / 10連。出たものは図鑑にたまり、COSMETICS で選べる
 * ========================================================================= */
import { calm as prefCalm } from './prefs.js';
import { countUp, dealIn } from './motion.js';
import { earnedChips, CHIP_PER_XP } from './chips.js';
import * as G from './gacha.js';
import { playCapsule, RAR_NAMES, confetti, RAR_COLORS } from './gachafx.js';
import { itemArtHtml } from './cosmetics-mode.js';
import { grantXp } from './xp.js';
import { unlockTrophies, TROPHY_XP } from './achievements.js';
import { trophyContext, showTrophyBanner } from './achievements-ui.js';
import { loginNudgeNeeded, maybeLoginHint, openAccount } from './account.js';
import { holo } from './holo.js';
import { raise } from './dialogs.js';
import { equipNow, canEquip, isEquipped } from './equip.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ORDER = ['L', 'E', 'R', 'C'];

/** もらった CHIP の合計 (chips.js) */
export { earnedChips };
/** いま使える CHIP (タイトルのボタンに出す) */
export function chipsNow() {
  return G.chipsOf(G.loadGacha(), earnedChips());
}

/* 出たものを1枚ずつめくって、実物の見た目で見せる。押すと飛ばせる。EPIC 以上はめくった瞬間に光る */
function revealResults(results) {
  const calm = prefCalm();
  const el = document.createElement('div');
  el.className = 'ga-reveal' + (results.length > 1 ? ' ten' : ' one');
  el.innerHTML = '<div class="ga-cards">' + results.map((r, i) =>
    '<div class="ga-rc r' + r.rar + '" style="--i:' + i + '"><div class="ga-flip">' +
      '<div class="ga-back"><b>?</b></div>' +
      '<div class="ga-front"><div class="ga-art">' + itemArtHtml(r.kind, r.key) + '</div>' +
        '<small>' + RAR_NAMES[r.rar] + (r.dupe ? ' ・ かぶり +' + r.refund : ' ・ NEW') + '</small><b>' + esc(r.name) + '</b></div>' +
    '</div></div>').join('') + '</div><p class="ga-tap">画面を押すと進みます</p>';
  document.body.appendChild(el);
  return new Promise((resolve) => {
    const cards = [...el.querySelectorAll('.ga-rc')];
    let i = 0, timer = null, done = false;
    /* 全部めくれたら、1枚ずつ触って傾けられるようにする */
    const finish = () => { done = true; el.classList.add('done'); cards.forEach(c => holo(c)); };
    const flipNext = () => {
      if (i >= cards.length) { finish(); return; }
      const c = cards[i++];
      c.classList.add('open');
      const rar = results[i - 1].rar;
      if (!calm && (rar === 'E' || rar === 'L')) confetti(RAR_COLORS[rar], rar === 'L' ? 160 : 70);
      timer = setTimeout(flipNext, calm ? 0 : rar === 'L' ? 900 : rar === 'E' ? 600 : 260);
    };
    setTimeout(flipNext, calm ? 0 : 300);
    el.onclick = () => {
      if (!done) {                                   // めくり途中なら全部めくる
        clearTimeout(timer);
        cards.forEach(c => c.classList.add('open'));
        finish();
        return;
      }
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, calm ? 0 : 250);
    };
  });
}

/* いちばん良い結果 (新しく手に入れたものを優先) */
function bestOf(results) {
  const list = (results || []).slice().sort((a, c) => (a.dupe - c.dupe) || (ORDER.indexOf(a.rar) - ORDER.indexOf(c.rar)));
  return list[0] || null;
}
function useLabel(results) {
  const b = bestOf(results);
  return b ? '「' + b.name + '」を COLLECTION で見る' : 'COLLECTION で見る';
}

export function openGacha(opts) {
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
      '<div class="pz-head"><b id="gaTitle">GACHA<small>ガチャ</small></b><button type="button" class="pz-x"><span>閉じる</span></button></div>' +
      (loginNudgeNeeded() ? '<div class="ga-login"><p><b>ログインしていません</b>引いた見た目と CHIP はこのブラウザにだけ残ります。消えると戻せません。</p>' +
        '<button type="button" id="gaLogin">ログインして守る</button></div>' : '') +
      '<div class="ga-top"><div class="ga-chip"><small>CHIP</small><b>' + chips + '</b><span>経験値が入るたびに増える (経験値 1 につき CHIP ' + CHIP_PER_XP + ')</span></div>' +
        '<div class="ga-btns"><button type="button" class="ga-pull" data-n="1"' + (chips >= G.PULL_COST ? '' : ' disabled') + '>1回 <small>' + G.PULL_COST + ' CHIP</small></button>' +
        '<button type="button" class="ga-pull ten" data-n="10"' + (chips >= G.TEN_COST ? '' : ' disabled') + '>10連 <small>' + G.TEN_COST + ' CHIP ・ RARE 以上1つ確定</small></button></div></div>' +
      '<p class="ga-rates">' + ORDER.map(k => '<span class="r' + k + '">' + RAR_NAMES[k] + ' ' + G.RATES[k] + '%</span>').join('') +
        '<em>EPIC 以上まで あと ' + toPity + ' 回で確定</em></p>' +
      /* 結果ごとに「着ける」(その場で1回) と、押すと COLLECTION のその品物へ */
      (last ? '<div class="ga-results">' + last.map(r => '<div class="ga-res r' + r.rar + '">' +
        '<button type="button" class="ga-see" data-kind="' + esc(r.kind) + '" data-key="' + esc(r.key) + '" title="COLLECTION で見る">' +
        '<small>' + RAR_NAMES[r.rar] + (r.dupe ? ' ・ かぶり +' + r.refund + ' CHIP' : ' ・ NEW') + '</small>' +
        '<b>' + esc(r.name) + '</b></button>' +
        (canEquip(r.kind, r.key) ? (isEquipped(r.kind, r.key) ? '<em class="ga-on">着けています</em>'
          : '<button type="button" class="ga-equip" data-kind="' + esc(r.kind) + '" data-key="' + esc(r.key) + '">着ける</button>') : '') +
        '</div>').join('') + '</div>' +
        '<div class="pz-row"><button type="button" class="pz-main" id="gaUse">' + esc(useLabel(last)) + '</button></div>' : '') +
      '<div class="ga-col"><h3>図鑑 <em>' + col.got + ' / ' + col.total + '</em></h3>' +
        ORDER.map(k => '<div class="ga-row r' + k + '"><small>' + RAR_NAMES[k] + '</small><div>' +
          col.list.filter(x => x.rar === k).map(x => '<span class="' + (x.owned ? 'on' : '') + '">' + (x.owned ? esc(x.name) : '???') + '</span>').join('') +
        '</div></div>').join('') + '</div>' +
      '</div>';
  };
  el.onclick = async (ev) => {
    if (ev.target === el || ev.target.closest('.pz-x')) {
      el.classList.remove('show');
      if (opts && opts.onClose) opts.onClose();
      return;
    }
    /* 着けに行く: ガチャを閉じて COLLECTION のその品物を見せる (前は設定が開いて、COLLECTION の後ろに隠れていた) */
    /* その場で着ける (閉じない。ほかの結果も着けられる) */
    const eq = ev.target.closest('.ga-equip');
    if (eq) {
      if (equipNow([[eq.dataset.kind, eq.dataset.key]])) {
        render();
        /* 描き直しで結果がもう一度飛び込んでこないように */
        el.querySelectorAll('.ga-res').forEach(x => { x.style.animation = 'none'; });
      }
      return;
    }
    const res = ev.target.closest('.ga-see[data-kind]');
    const use = ev.target.closest('#gaUse') ? bestOf(last) : res ? { kind: res.dataset.kind, key: res.dataset.key } : null;
    if (use) {
      el.classList.remove('show');
      if (opts && opts.onUse) opts.onUse(use.kind, use.key);
      else import('./cosmetics-mode.js').then(m => m.openCosmetics({ tab: use.kind, focus: use.key }));
      if (opts && opts.onClose) opts.onClose();
      return;
    }
    /* ログインはガチャの上に重ねる (閉じたらガチャに戻る) */
    if (ev.target.closest('#gaLogin')) { openAccount(); return; }
    const b = ev.target.closest('.ga-pull');
    if (!b || b.disabled || busy) return;
    const chipsBefore = G.chipsOf(G.loadGacha(), earnedChips());
    const r = G.pullAndSave(earnedChips(), +b.dataset.n);
    if (!r) return;
    busy = true;
    const best = r.results.slice().sort((a, c) => ORDER.indexOf(a.rar) - ORDER.indexOf(c.rar))[0];
    await playCapsule(document.body, best.rar, r.results.length > 1 ? '10連 — 最高 ' + RAR_NAMES[best.rar] : best.name);
    await revealResults(r.results);
    last = r.results;
    busy = false;
    render();
    /* 使った CHIP を数え下げて見せる (かぶりで戻った分も込みの、いまの残り) */
    countUp(el.querySelector('.ga-chip b'), chipsBefore, G.chipsOf(G.loadGacha(), earnedChips()), { ms: 700 });
    dealIn(el.querySelectorAll('.ga-res'), { stagger: 60, ms: 360 });
    /* ログインしていなければ守るよう勧める (レアを引いたら強めに) */
    maybeLoginHint(best.rar === 'E' || best.rar === 'L' ? 'rarePull' : 'gacha');
    /* ガチャの実績 (回した・そろえた) */
    const got = unlockTrophies(trophyContext(null));
    for (const t of got) grantXp('trophy', TROPHY_XP[t.tier], 'ach:' + t.id);
    if (got.length) { render(); await showTrophyBanner(got); }
  };
  render();
  el.classList.add('show');
  raise(el);   // 開いたままの画面をもう一度開いたときも、いちばん手前へ
}
