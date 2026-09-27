/* =========================================================================
 * 観戦: CPU どうしの対戦を見る
 *   ベットして観戦 : ランダムに選んだ2つのデッキ (A・B) のどちらが勝つかに CHIP を賭ける。
 *                    倍率はプロトコルの強さの目安 (protocol-strength.js) から。弱い方ほど高い
 *   自由に選ぶ     : A と B の3つずつと、CPU の強さを選んで見る
 *   → { a: [3], b: [3], level, bet: { side: 0|1, amount, odds, payout } | null } / null (タイトルへ)
 * ========================================================================= */
import { PROTOCOL_STRENGTH } from './protocol-strength.js';
import { LEVEL_LABELS } from './aidecks.js';
import { shuffled } from './solodraft.js';
import { emblemDataURL } from './emblems.js';
import * as G from './gacha.js';
import { earnedChips } from './chips.js';

export const BET_AMOUNTS = [5, 15, 30, 50];
export const BET_LEVEL = 1;                        // ベットの試合の CPU の強さ (ふつう)

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A が勝つ見込み (0.15〜0.85)。デッキの強さはプロトコルの勝率の平均 */
export function winChance(a, b) {
  const str = (d) => d.reduce((n, p) => n + (PROTOCOL_STRENGTH[p] || 0.5), 0) / d.length;
  return Math.max(0.15, Math.min(0.85, 0.5 + (str(a) - str(b)) * 3));
}
/** 倍率 (胴元の取り分 5%。1.1 倍以上) */
export function oddsOf(p) { return Math.max(1.1, Math.round((0.95 / p) * 10) / 10); }
/** 当たったときに戻る CHIP (賭けた分こみ)。5 の倍数に切り上げ */
export function payoutOf(amount, odds) { return Math.ceil(amount * odds / 5) * 5; }

export function openSpectate(protocols) {
  const byName = Object.fromEntries(protocols.map(p => [p.name, p]));
  const names = protocols.map(p => p.name);
  const colorOf = (n) => (byName[n] || {}).color || '#b9a4ff';
  const deckHtml = (d) => '<span class="wt-deck">' + d.map(n => '<i style="--pc:' + esc(colorOf(n)) + '">' +
    '<img alt="" src="' + emblemDataURL(n, colorOf(n), 40, true) + '">' + esc(n) + '</i>').join('') + '</span>';

  let el = document.getElementById('watchOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'watchOv';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '観戦');
    document.body.appendChild(el);
  }
  const draw = () => { const d = shuffled(names); return { a: d.slice(0, 3), b: d.slice(3, 6) }; };
  let match = draw();
  let side = null, amount = 15;
  const free = { a: [], b: [], level: 1 };

  const render = () => {
    const chips = G.chipsOf(G.loadGacha(), earnedChips());
    const pA = winChance(match.a, match.b);
    const odds = [oddsOf(pA), oddsOf(1 - pA)];
    const team = (k, label) => '<button type="button" class="wt-team' + (side === k ? ' on' : '') + '" data-side="' + k + '">' +
      '<b>' + label + '</b>' + deckHtml(k ? match.b : match.a) + '<em>' + odds[k].toFixed(1) + ' 倍</em></button>';
    const canBet = side !== null && chips >= amount;
    const pick = (k) => names.map(n => '<button type="button" class="wt-proto' + (free[k].includes(n) ? ' on' : '') +
      (free[k].length >= 3 && !free[k].includes(n) ? ' dim' : '') + '" data-pick="' + k + '" data-name="' + esc(n) +
      '" style="--pc:' + esc(colorOf(n)) + '">' + esc(n) + '</button>').join('');
    el.innerHTML = '<div class="op-wrap">' +
      '<div class="op-head"><b>// WATCH</b><span>CPU どうしの対戦を観戦する</span><span class="wt-chips">CHIP <b>' + chips + '</b></span></div>' +
      '<section><h3>ベットして観戦 <small>どちらが勝つかに CHIP を賭ける。当たれば倍率ぶん戻る。CPU は' + LEVEL_LABELS[BET_LEVEL] + '</small></h3>' +
        '<div class="wt-match">' + team(0, 'A') + '<i class="wt-vs">VS</i>' + team(1, 'B') + '</div>' +
        '<div class="wt-bar"><span>賭ける CHIP</span>' + BET_AMOUNTS.map(v => '<button type="button" class="lvl' + (v === amount ? ' on' : '') +
          '" data-amount="' + v + '"' + (chips < v ? ' disabled' : '') + '>' + v + '</button>').join('') +
          '<button type="button" class="lvl" data-reroll="1">組み合わせを引き直す</button>' +
          '<button type="button" class="wt-go" data-bet="1"' + (canBet ? '' : ' disabled') + '>' +
            (side === null ? 'A か B を選ぶ' : (side ? 'B' : 'A') + ' に ' + amount + ' 賭けて観戦 (当たれば ' + payoutOf(amount, odds[side]) + ')') + '</button></div>' +
      '</section>' +
      '<section><h3>自由に選ぶ <small>A と B の3つずつと、CPU の強さを選んで見る (同じプロトコルどうしも選べる)</small></h3>' +
        '<div class="wt-free"><b>A ' + free.a.length + '/3</b><div class="wt-grid">' + pick('a') + '</div>' +
        '<b>B ' + free.b.length + '/3</b><div class="wt-grid">' + pick('b') + '</div></div>' +
        '<div class="wt-bar"><span>CPU の強さ</span>' + [0, 1, 2].map(i => '<button type="button" class="lvl' + (free.level === i ? ' on' : '') +
          '" data-level="' + i + '">' + LEVEL_LABELS[i] + '</button>').join('') +
          '<button type="button" class="wt-go" data-free="1"' + (free.a.length === 3 && free.b.length === 3 ? '' : ' disabled') + '>観戦する</button></div>' +
      '</section>' +
      '<div class="op-foot"><button type="button" data-back="1">← タイトルへ</button></div></div>';
  };
  render();
  el.classList.add('show');

  return new Promise((resolve) => {
    el.onclick = (ev) => {
      const t = ev.target.closest('button');
      if (!t || t.disabled) return;
      if (t.dataset.back) { el.classList.remove('show'); resolve(null); return; }
      if (t.dataset.side !== undefined) side = +t.dataset.side;
      else if (t.dataset.amount) amount = +t.dataset.amount;
      else if (t.dataset.reroll) { match = draw(); side = null; }
      else if (t.dataset.level !== undefined) free.level = +t.dataset.level;
      else if (t.dataset.pick) {
        const list = free[t.dataset.pick], n = t.dataset.name, i = list.indexOf(n);
        if (i >= 0) list.splice(i, 1); else if (list.length < 3) list.push(n);
      } else if (t.dataset.bet) {
        const pA = winChance(match.a, match.b);
        const odds = side ? oddsOf(1 - pA) : oddsOf(pA);
        /* 賭けた分はここで払う (観戦の途中で閉じても戻らない) */
        if (!G.spendChips(amount, earnedChips())) { render(); return; }
        el.classList.remove('show');
        resolve({ a: match.a, b: match.b, level: BET_LEVEL, bet: { side, amount, odds, payout: payoutOf(amount, odds) } });
        return;
      } else if (t.dataset.free) {
        el.classList.remove('show');
        resolve({ a: free.a.slice(), b: free.b.slice(), level: free.level, bet: null });
        return;
      }
      render();
    };
  });
}
