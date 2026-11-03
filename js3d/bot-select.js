/* =========================================================================
 * 公式ソロモード (BOT) のシナリオを選ぶ画面 — SINGLE GAME の「BOT」から
 *   通常 (REGULAR) / 上級 (ADVANCED) の各6シナリオ。シナリオが BOT のプロトコルと出し方を決める
 *   → シナリオ (bot-scenarios.js) / null (相手選びへ戻る)
 *   見た目は相手を選ぶ画面 (#oppOv・op-card) をそのまま使う
 * ========================================================================= */
import { showTitleBack, hideTitleBack } from './titleback.js';
import { localRecords } from './stats.js';
import { BOT_SCENARIOS, BOT_PLAY_LABEL, BOT_CONTROL_LABEL } from './bot-scenarios.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TAB_KEY = 'compileBotTab';
const LAST_KEY = 'compileBotLast';

/* 遊び方の要点 (ルールシートの BOT の決まりを短く) */
const RULES = [
  'あなたがいつも先手。BOT は手札の代わりに「キュー」を持ち、いちばん前の札から出す',
  'キューが空なら BOT はリフレッシュ。BOT が捨てる札もキューの前から',
  'BOT が決めることは、あなたに有利なように自動で決まる (同点のラインなど)',
  'BOT がコントロールを使うときは、並べ替えの代わりにシナリオの効果',
  '先に3つコンパイルすれば勝ち。BOT が同じプロトコルを2度コンパイルしたら負け'
];

export function openBotSelect(protocols) {
  const byName = Object.fromEntries(protocols.map(p => [p.name, p]));
  const deck = (names) => '<span class="rn-deck">' + names.map(n =>
    '<i style="--pc:' + esc((byName[n] || {}).color || '#cdc7d4') + '">' + esc(n) + '</i>').join('') + '</span>';
  const recs = localRecords();
  const recOf = (lv) => {
    const g = recs.filter(r => r.level === lv);
    return { games: g.length, wins: g.filter(r => r.win).length };
  };
  const rec = (lv) => {
    const r = recOf(lv);
    if (!r.games) return '<span class="op-rec none">未挑戦</span>';
    return '<span class="op-rec' + (r.wins ? ' won' : ' lost') + '">' + (r.wins ? '✓ ' : '') + r.wins + '勝 ' + (r.games - r.wins) + '敗</span>';
  };
  let last = null, tab = 'regular';
  try { last = localStorage.getItem(LAST_KEY); tab = localStorage.getItem(TAB_KEY) || 'regular'; } catch (e) { /* private mode */ }
  if (tab !== 'advanced') tab = 'regular';
  const cleared = (mode) => BOT_SCENARIOS.filter(s => s.mode === mode && recOf(s.level).wins > 0).length;

  let el = document.getElementById('oppOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'oppOv';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el);
  }
  el.setAttribute('aria-label', 'BOT のシナリオを選ぶ');
  const card = (s) => '<button type="button" class="op-card' + (String(last) === String(s.level) ? ' last' : '') + '" data-bot="' + s.level + '">' +
    '<b>Lv' + s.lvl + ' ' + esc(s.name) + rec(s.level) + '</b>' +
    '<small>出し方: ' + s.plays.map((p, i) => (s.plays.length > 1 ? (i + 1) + '. ' : '') + BOT_PLAY_LABEL[p]).join(' → ') +
    '<br>コントロール: ' + BOT_CONTROL_LABEL[s.control] + '</small>' + deck(s.protos) + '</button>';
  const pane = (mode, note) => '<section data-bpane="' + mode + '"' + (tab === mode ? '' : ' hidden') + '><h3><small>' + note + '</small></h3>' +
    '<div class="op-row boss">' + BOT_SCENARIOS.filter(s => s.mode === mode).map(card).join('') + '</div></section>';
  const tabBtn = (mode, label) => '<button type="button" role="tab" data-btab="' + mode + '" aria-selected="' + (tab === mode) + '" class="' + (tab === mode ? 'on' : '') + '">' +
    label + ' <small>' + cleared(mode) + '/6</small></button>';
  el.innerHTML = '<div class="op-wrap op-challenge op-bot">' +
    '<div class="op-head"><b>// SOLO MODE</b><span>VS BOT · 公式ソロモード</span></div>' +
    '<section><h3>BOT (Basic Oppositional Terminal) <small>シナリオが BOT のプロトコルと出し方を決める。次の画面で、残りから自分の3つを選ぶ</small></h3>' +
      '<ul class="op-botrules">' + RULES.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' +
      '<small class="op-botfirst">はじめての方は: あなた FULCRUM / OVERWHELM / MOMENTUM で、REGULAR の Lv1 から ・ ' +
      '<a href="rules.html#solo" target="_blank" rel="noopener">ソロモードの遊び方</a></small></section>' +
    '<div class="op-tabs" role="tablist">' + tabBtn('regular', 'REGULAR') + tabBtn('advanced', 'ADVANCED') + '</div>' +
    pane('regular', 'BOT のカードにはコマンドが無い (値とプロトコルだけ)') +
    pane('advanced', 'BOT のカードのコマンドも、ふつうの対戦と同じように解決する') +
    '</div>';
  el.classList.add('show');

  return new Promise((resolve) => {
    showTitleBack(() => { el.classList.remove('show'); resolve(null); });
    el.onclick = (ev) => {
      const tb = ev.target.closest('[data-btab]');
      if (tb) {
        const k = tb.dataset.btab;
        el.querySelectorAll('[data-btab]').forEach(b => { b.classList.toggle('on', b === tb); b.setAttribute('aria-selected', String(b === tb)); });
        el.querySelectorAll('[data-bpane]').forEach(p => { p.hidden = p.dataset.bpane !== k; });
        try { localStorage.setItem(TAB_KEY, k); } catch (e) { /* private mode */ }
        return;
      }
      const t = ev.target.closest('[data-bot]');
      if (!t) return;
      const sc = BOT_SCENARIOS.find(s => String(s.level) === t.dataset.bot);
      if (!sc) return;
      try { localStorage.setItem(LAST_KEY, String(sc.level)); } catch (e) { /* private mode */ }
      el.classList.remove('show');
      hideTitleBack();
      resolve(sc);
    };
  });
}
