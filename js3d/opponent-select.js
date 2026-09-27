/* =========================================================================
 * 相手を選ぶ画面
 *   SINGLE GAME: おまかせ (プロトコルも相手も自動) / CPU (かんたん / ふつう / つよい。次の画面で公式のドラフトで取り合う) / タッグ
 *   CHALLENGE (opts.challenge): 強敵 (最強・ロック特化・挑戦者。相手のデッキは決まっている) / 下剋上 (最弱のデッキで最強に挑む。勝つと称号)
 *   → { level } / { underdog: true } / { quick: true } / { watch: true } / null (タイトルへ)
 * ========================================================================= */
import { showTitleBack, hideTitleBack } from './titleback.js';
import { LEVEL_LABELS, STRONGEST_AI, LOCK_AI, CHALLENGERS, CHALLENGER_BASE, UNDERDOG_DECK, UNDERDOG_LEVEL } from './aidecks.js';
import { localRecords } from './stats.js';
import { settings } from './settings.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LAST_KEY = 'compileOppLast';

const CPU_NOTES = ['はじめての人に。読みは浅く、ときどき迷う', '標準。1手先を読んで指す', '読みが深く、時間をかけて考える'];

export function underdogCleared() {
  return localRecords().some(r => r.win && r.level === UNDERDOG_LEVEL);
}

export function openOpponentSelect(protocols, opts = {}) {
  const challenge = !!opts.challenge;
  const byName = Object.fromEntries(protocols.map(p => [p.name, p]));
  const deck = (names) => '<span class="rn-deck">' + names.map(n =>
    '<i style="--pc:' + esc((byName[n] || {}).color || '#b9a4ff') + '">' + esc(n) + '</i>').join('') + '</span>';
  let last = null;
  try { last = localStorage.getItem(LAST_KEY); } catch (e) { /* private mode */ }

  let el = document.getElementById('oppOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'oppOv';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '相手を選ぶ');
    document.body.appendChild(el);
  }
  const card = (key, title, note, body, extra) => '<button type="button" class="op-card' + (String(last) === key ? ' last' : '') + (extra || '') +
    '" data-opp="' + key + '"><b>' + title + '</b><small>' + note + '</small>' + (body || '') + '</button>';
  const cleared = underdogCleared();
  el.innerHTML = '<div class="op-wrap">' +
    (challenge
      ? '<div class="op-head"><b>// CHALLENGE</b><span>BOSS · UNDERDOG</span></div>' +
      '<section><h3>強敵 <small>相手のデッキは決まっている。次の画面で自分の3つを選ぶ</small></h3>' +
      '<div class="op-row boss">' +
        card('3', '最強', 'いちばん強い CPU', deck(STRONGEST_AI)) +
        card('4', 'ロック特化', 'サイキック①で「裏向きでしか出せない」を狙う', deck(LOCK_AI)) +
        CHALLENGERS.map((c, k) => card(String(CHALLENGER_BASE + k), '挑戦者', esc(c.name || '最強の候補だったデッキ'), deck(c.deck))).join('') +
      '</div></section>' +
      '<section><h3>下剋上 <small>いちばん弱いデッキで、いちばん強い CPU に挑む</small></h3>' +
      '<div class="op-row">' + card('underdog', '下剋上' + (cleared ? ' <em>✓ TITLE — GIANT SLAYER</em>' : ''),
        'あなた (最弱) vs 最強。勝つと 称号 GIANT SLAYER・専用スリーブとマーカー・+100 XP',
        '<span class="op-vs">' + deck(UNDERDOG_DECK) + '<i>VS</i>' + deck(STRONGEST_AI) + '</span>', ' wide') + '</div></section>'
      : '<div class="op-head"><b>// SINGLE GAME</b><span>SELECT OPPONENT</span></div>' +
      /* 迷ったらこれ: 選ぶものを全部おまかせにして、すぐ始める */
      '<button type="button" class="op-quick" data-opp="quick"><b>おまかせで今すぐ始める</b>' +
      '<small>プロトコルも相手も自動で決めて、' + LEVEL_LABELS[Math.min(2, Math.max(0, settings().quickLevel | 0))] + 'の CPU と対戦します (強さは ⚙ の設定で変えられる)</small></button>' +
      '<section><h3>CPU <small>次の画面で、公式ルールのドラフトで CPU とプロトコルを取り合う (自由に選ぶ・ランダムにも変えられる)</small></h3>' +
      '<div class="op-row">' + [0, 1, 2].map(i => card(String(i), LEVEL_LABELS[i], CPU_NOTES[i])).join('') + '</div></section>' +
      '<section><h3>タッグデュエル <small>あなたと CPU の味方 vs CPU 2人。盤面は共有、手札と山札は1人ずつ。ラインは2人のプロトコルを合わせた複合プロトコル (次の画面で自分の3つを選び、味方は残りから)</small></h3>' +
      '<div class="op-row">' + [0, 1, 2].map(i => card('tag' + i, 'TAG · ' + LEVEL_LABELS[i], '手番は あなた → 相手1 → 味方 → 相手2')).join('') + '</div></section>' +
      '<section><h3>観戦 <small>CPU どうしの対戦を見る。どちらが勝つかに CHIP を賭けることも、組み合わせを自由に選ぶこともできる</small></h3>' +
      '<div class="op-row">' + card('watch', '観戦する', 'ベットして観戦 / 自由に選ぶ・タッグも', '', ' wide') + '</div></section>') +
    '</div>';
  el.classList.add('show');

  return new Promise((resolve) => {
    showTitleBack(() => { el.classList.remove('show'); resolve(null); });
    el.onclick = (ev) => {
      const t = ev.target.closest('[data-opp]');
      if (!t) return;
      const key = t.dataset.opp;
      el.classList.remove('show');
      hideTitleBack();
      if (key === 'back') { resolve(null); return; }
      if (key === 'quick') { resolve({ quick: true }); return; }
      if (key === 'watch') { resolve({ watch: true }); return; }
      try { localStorage.setItem(LAST_KEY, key); } catch (e) { /* private mode */ }
      if (/^tag\d$/.test(key)) { resolve({ tag: true, level: +key.slice(3) }); return; }
      resolve(key === 'underdog' ? { underdog: true, level: UNDERDOG_LEVEL } : { level: +key });
    };
  });
}

