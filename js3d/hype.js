/* =========================================================================
 * 試合中のほめ言葉 (勝ち抜き戦)
 *   自分の手を解き終えたら、その1手の大きさ (自分のラインの伸び + 相手のラインの減り + チェーン + コンパイル) で
 *   NICE / GREAT / EXCELLENT / INSANE を叩きつける。あと1本で勝ち・負けの場面では MATCH POINT / DANGER。
 *   押さなくても消える一語の飾り (読ませる情報は載せない)。盤面の操作は止めない
 * ========================================================================= */
import { sfx } from './audio.js';
import { confetti } from './gachafx.js';
import { calm } from './prefs.js';

export const RANKS = [
  { min: 24, name: 'INSANE', cls: 'r4' },
  { min: 16, name: 'EXCELLENT', cls: 'r3' },
  { min: 11, name: 'GREAT', cls: 'r2' },
  { min: 7, name: 'NICE', cls: 'r1' }
];

/** 1手の点数。swing = 自分のラインの伸び + 相手のラインの減り、chain = いちばん長かったチェーン、compiled = コンパイルした */
export function playScore({ swing, chain, compiled }) {
  return Math.max(0, swing | 0) + (chain >= 2 ? (chain - 1) * 3 : 0) + (compiled ? 8 : 0);
}
/** 点数の段 (届かなければ null) */
export function rankOf(score) {
  return RANKS.find(r => score >= r.min) || null;
}

function host() {
  let el = document.getElementById('hype');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hype';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

/** 叩きつける。sub = 下の小さな文字 (CHAIN ×3 など)、cls = 色の段 */
export function slam(text, sub, cls) {
  const el = host();
  const b = document.createElement('div');
  b.className = 'hp-slam ' + (cls || '');
  b.innerHTML = '<b data-text="' + text + '">' + text + '</b>' + (sub ? '<small>' + sub + '</small>' : '');
  el.replaceChildren(b);
  setTimeout(() => { if (b.parentNode) b.remove(); }, calm() ? 1200 : 1700);
}

/** 1手のほめ言葉。bonus = 勝ち抜き戦の試合中ボーナス (クレジット) を今回もらえた数 */
export function hypePlay(info, bonus) {
  const score = playScore(info);
  const r = rankOf(score);
  if (!r) return null;
  const parts = [];
  if (info.chain >= 2) parts.push('CHAIN ×' + info.chain);
  if (info.compiled) parts.push('COMPILE');
  if (info.swing >= 6) parts.push('SWING +' + info.swing);
  if (bonus) parts.push('<em>+' + bonus + ' CR</em>');
  slam(r.name, parts.join(' ・ '), r.cls);
  if (r.cls === 'r4') { sfx('boom'); confetti(['#ffd86a', '#ff4fa3', '#7cf0d0', '#9d7bff', '#ffffff'], 200); }
  else if (r.cls === 'r3') { sfx('chain', 5); confetti(['#ffd86a', '#ff4fa3', '#ffffff'], 90); }
  else if (r.cls === 'r2') sfx('charge');
  else sfx('chain', 2);
  return r;
}

/** あと1本で勝ち (mine) / 負け (!mine) */
export function matchPoint(mine) {
  slam(mine ? 'MATCH POINT' : 'DANGER', mine ? 'あと1本で勝ち' : 'あと1本で負け', mine ? 'mp' : 'dg');
  sfx(mine ? 'charge' : 'turn');
}
