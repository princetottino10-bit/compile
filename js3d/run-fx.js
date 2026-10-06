/* =========================================================================
 * 勝ち抜き戦の手触り (run-ui.js の描き直しのあとに呼ぶ)
 *   数字が増えるのを見せる (クレジットの数え上げ)、手に入れたものを光らせる、
 *   系統ボーナスがそろった瞬間を祝う、レアの候補が出たら鳴らす。
 *   画面を勝手に進めたり閉じたりはしない (見た目と音だけ)。動きを減らす設定では数え上げ・紙吹雪をやめる
 * ========================================================================= */
import * as RUN from './run.js';
import { sfx } from './audio.js';
import { confetti, RAR_COLORS } from './gachafx.js';
import { calm } from './prefs.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 数字を from から to まで数え上げる (増えるときは小さく鳴らす) */
export function countUp(node, from, to, opts = {}) {
  if (!node) return;
  const fmt = opts.fmt || ((v) => String(v));
  if (calm() || from === to) { node.textContent = fmt(to); return; }
  const ms = opts.ms || Math.min(900, 160 + Math.abs(to - from) * 45);
  const t0 = performance.now();
  let last = from;
  node.classList.add(to > from ? 'fx-up' : 'fx-down');
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (v !== last) { last = v; node.textContent = fmt(v); if (to > from && !opts.quiet) sfx('tick'); }
    if (k < 1) requestAnimationFrame(step);
    else setTimeout(() => node.classList.remove('fx-up', 'fx-down'), 500);
  };
  node.textContent = fmt(from);
  requestAnimationFrame(step);
  /* 画面が裏に回っていると requestAnimationFrame が止まるので、最後の数だけは必ず出す */
  setTimeout(() => { if (last !== to) { last = to; node.textContent = fmt(to); } }, ms + 120);
}

/** 終わりから数えた連勝の数 (同じ段で負けてやり直した分は切れる) */
export function winStreak(run) {
  const h = (run && run.history) || [];
  let n = 0;
  for (let i = h.length - 1; i >= 0 && h[i].win; i--) n++;
  return n;
}

/** 頂上 (BOSS) まであと何段か。地図に出る前は全段 */
export function rowsLeft(run) {
  const n = run && RUN.nodeById(run, run.pos);
  return RUN.MAP_ROWS - 1 - (n ? n.row : -1);
}

/* 系統ボーナスが上がった系統と、新しく付いたボーナス */
function bonusUps(prev, run) {
  return Object.keys(RUN.TAGS).flatMap(t => {
    const a = RUN.setLevel(prev, t), b = RUN.setLevel(run, t);
    return b > a ? [{ tag: t, lv: b, text: RUN.TAGS[t].bonus[b - 1], color: RUN.TAGS[t].color }] : [];
  });
}

const RAR_ORDER = ['C', 'R', 'E', 'L'];

/** 描き直したあとに呼ぶ。prev = 描き直す前の run (はじめて描くときは null) */
export function afterRender(el, prev, run) {
  if (!el || !run) return;
  const card = el.querySelector('.rn-card');
  if (!card) return;
  /* クレジット: 変わった分を数え上げる */
  const cr = card.querySelector('.rn-credit b');
  if (prev && cr && (prev.credits | 0) !== (run.credits | 0)) countUp(cr, prev.credits | 0, run.credits | 0);
  /* 勝利の報酬画面: 「+N CREDIT」を 0 から数え上げる */
  const gain = card.querySelector('.rn-gainnum');
  if (gain && (!prev || prev.phase !== run.phase)) countUp(gain, 0, run.lastGain | 0, { fmt: (v) => '+' + v });
  if (!prev) return;
  /* ライフが増えた: 増えた目盛りを光らせる */
  if ((run.life | 0) > (prev.life | 0)) {
    const pips = card.querySelectorAll('.rn-life i');
    for (let i = prev.life | 0; i < run.life && i < pips.length; i++) pips[i].classList.add('gain');
    sfx('charge');
  }
  /* 新しく手に入れたパッチ: 上の一覧で弾ませる */
  const had = new Set(prev.patches || []);
  const fresh = (run.patches || []).filter(id => !had.has(id));
  if (fresh.length) {
    for (const id of fresh) { const chip = card.querySelector('.rn-pchip[data-id="' + id + '"]'); if (chip) chip.classList.add('new'); }
    sfx('pick');
  }
  /* 系統ボーナスがそろった: 消えない帯で知らせる (次に描き直すまで残る) */
  const ups = bonusUps(prev, run);
  if (ups.length) {
    const host = card.querySelector('.rn-patches');
    const band = document.createElement('div');
    band.className = 'rn-bonusup';
    band.innerHTML = ups.map(u => '<p style="--tc:' + u.color + '"><small>SET BONUS</small><b>' + u.tag + ' ' + '★'.repeat(u.lv) + '</b><span>' + esc(u.text) + '</span></p>').join('');
    if (host) host.after(band); else card.prepend(band);
    sfx('chain', 3);
    confetti(ups.map(u => u.color).concat(['#ffffff']), 160);
  }
  /* 場面が変わったとき */
  if (prev.phase !== run.phase) {
    if (run.phase === 'patch') {
      /* 候補にいちばん高いレアがあれば、光らせて鳴らす */
      const best = (run.patchOffers || []).map(id => (RUN.patchInfo(id) || {}).rar).sort((a, b) => RAR_ORDER.indexOf(b) - RAR_ORDER.indexOf(a))[0];
      if (best === 'L') { sfx('boom'); confetti(RAR_COLORS.L, 220); }
      else if (best === 'E') sfx('charge');
      else sfx('flip');
    } else if (run.phase === 'battle') sfx('charge');
    else if (run.phase === 'shop' || run.phase === 'rest' || run.phase === 'event') sfx('flip');
  }
  /* 地図で進んだ */
  if (prev.pos !== run.pos && run.phase !== 'draft') sfx('land');
}

/** 押したボタンを弾ませてから fn を呼ぶ (選んだ手応え)。動きを減らす設定ではすぐ */
export function pressThen(btn, fn) {
  if (!btn || calm()) { fn(); return; }
  sfx('select');
  btn.classList.add('fx-picked');
  const box = btn.closest('.rn-card');
  if (box) box.classList.add('fx-busy');      // 弾んでいる間の2度押しを防ぐ
  setTimeout(fn, 240);
}

/** 対戦中のライフの横に出す札: いま勝てばもらえるクレジット・ノーダメージ・守りの残り・連勝 */
export function hudChips(run, lost, bonus, fresh) {
  const has = (id) => (run.patches || []).includes(id);
  const chips = [];
  /* 短縮マッチ (どちらも1本で勝ち) は、試合中ずっと見えるように */
  if (RUN.runWinCompiles(run) === 1) chips.push('<b class="rh-chip short" title="短縮マッチ: 先にコンパイルした方の勝ち">1本先取</b>');
  chips.push('<b class="rh-chip cr' + (fresh ? ' bump' : '') + '" title="いま勝てばもらえるクレジット (試合中スコアの分を含む)">WIN +' + RUN.creditGain(run, lost, bonus) + '</b>');
  /* ノーダメージで勝つとクレジット +1 (creditGain)。コンパイルされたら割れる */
  chips.push('<b class="rh-chip perfect' + (lost ? ' broken' : '') + '" title="コンパイルされずに勝つとクレジット +1">PERFECT</b>');
  if (has('firewall')) chips.push('<b class="rh-chip guard' + (lost ? ' used' : '') + '" title="FIREWALL: 最初の1回のコンパイルではライフが減らない">FIREWALL</b>');
  if (has('failsafe') && !run.failsafeUsed) chips.push('<b class="rh-chip guard" title="FAILSAFE: ライフが尽きる試合を1度だけ、ライフ 1 で耐える">FAILSAFE</b>');
  if (has('phoenix') && !run.phoenixUsed) chips.push('<b class="rh-chip guard" title="PHOENIX: ライフが尽きても1度だけ全回復">PHOENIX</b>');
  const st = winStreak(run);
  if (st >= 2) chips.push('<b class="rh-chip streak" title="続けて勝っている数 (負けると切れる)">' + st + '連勝中</b>');
  return '<span class="rh-chips">' + chips.join('') + '</span>';
}

/** 対戦中のライフ表示を揺らして、文字を浮かべる (kind: hurt / block) */
export function hudPop(hud, text, kind) {
  sfx(kind === 'block' ? 'shift' : 'shatter');
  if (calm()) return;
  hud.classList.remove('rh-hurt', 'rh-block');
  void hud.offsetWidth;
  hud.classList.add(kind === 'block' ? 'rh-block' : 'rh-hurt');
  const pop = document.createElement('b');
  pop.className = 'rh-pop ' + kind;
  pop.textContent = text;
  hud.appendChild(pop);
  setTimeout(() => pop.remove(), 1400);
}
