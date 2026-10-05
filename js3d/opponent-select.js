/* =========================================================================
 * 相手を選ぶ画面
 *   SINGLE GAME: おまかせ (プロトコルも相手も自動) / CPU (かんたん / ふつう / つよい。次の画面で公式のドラフトで取り合う) / タッグ
 *   CHALLENGE (opts.challenge): 強敵 (最強・ロック特化・挑戦者。相手のデッキは決まっている) / 下剋上 (最弱のデッキで最強に挑む。勝つと称号)
 *   → { level } / { underdog: true } / { quick: true } / { watch: true } / null (タイトルへ)
 * ========================================================================= */
import { showTitleBack, hideTitleBack } from './titleback.js';
import { LEVEL_LABELS, STRONGEST_AI, LOCK_AI, CHALLENGERS, CHALLENGER_BASE, UNDERDOG_DECK, UNDERDOG_LEVEL, UNDERDOG_TAG_LEVEL, UNDERDOG_TAG_RIVAL_MATE } from './aidecks.js';
import { localRecords } from './stats.js';
import { conquered, conquerable } from './stats-data.js';
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
  /* 強敵ごとの戦績 (勝ち・負け)。押す前に、どの相手に勝っていないかが分かるように */
  const recs = localRecords();
  const wl = (lv) => {
    const g = recs.filter(r => r.level === lv && (!r.mode || r.mode === 'cpu'));   // 勝ち抜き戦・タッグなどは数えない
    if (!g.length) return '<span class="op-wl none">まだ戦っていない</span>';
    const w = g.filter(r => r.win).length;
    return '<span class="op-wl' + (w ? ' won' : '') + '">' + w + '勝 ' + (g.length - w) + '敗</span>';
  };
  const tagCleared = localRecords().some(r => r.win && r.level === UNDERDOG_TAG_LEVEL);
  /* 制覇: 最強に勝ったプロトコルの数。30 すべてで称号 CONQUEROR */
  const conq = conquered(localRecords()).size, total = conquerable(protocols.map(p => p.name)).length;
  const conqBar = '<span class="op-conq"><span>制覇 <b>' + conq + '</b>/' + total + '</span><i><s style="width:' + Math.round(conq / total * 100) + '%"></s></i></span>';
  el.innerHTML = '<div class="op-wrap">' +
    (challenge
      ? '<div class="op-head"><b>// CHALLENGE</b><span>BOSS · UNDERDOG</span></div>' +
      '<section><h3>強敵 <small>相手のデッキは決まっている。次の画面で自分の3つを選ぶ</small></h3>' +
      '<div class="op-row boss">' +
        card('3', '最強' + (conq >= total ? ' <em>✓ TITLE — CONQUEROR</em>' : ''),
          'いちばん強い CPU。残りの' + total + 'のプロトコルすべてで勝つと 称号 CONQUEROR', deck(STRONGEST_AI) + conqBar + wl(3)) +
        card('4', 'ロック特化', 'サイキック①で「裏向きでしか出せない」を狙う', deck(LOCK_AI) + wl(4)) +
        /* 挑戦者は、どれも「挑戦者」だった見出しをデッキの名前に */
        CHALLENGERS.map((c, k) => card(String(CHALLENGER_BASE + k), esc(c.name || '挑戦者'), c.name ? '挑戦者 ・ 最強の候補だったデッキ' : '最強の候補だったデッキ', deck(c.deck) + wl(CHALLENGER_BASE + k))).join('') +
      '</div></section>' +
      '<section><h3>下剋上 <small>いちばん弱いデッキで、いちばん強い CPU に挑む</small></h3>' +
      '<div class="op-row">' + card('underdog', '下剋上' + (cleared ? ' <em>✓ TITLE — GIANT SLAYER</em>' : ''),
        'あなた (最弱) vs 最強。勝つと 称号 GIANT SLAYER・専用スリーブとマーカー・+100 XP',
        '<span class="op-vs">' + deck(UNDERDOG_DECK) + '<i>VS</i>' + deck(STRONGEST_AI) + '</span>', ' wide') + '</div>' +
      '<div class="op-row">' + card('udtag', '下剋上タッグ' + (tagCleared ? ' <em>✓ TITLE — UNDERDOG DUO</em>' : ''),
        'あなた (好きな3つ) ＋ かんたんの味方 vs 最強のタッグ。手番は あなた → 相手1 → 味方 → 相手2。勝つと 称号 UNDERDOG DUO',
        '<span class="op-vs"><span class="op-any">好きな3つ</span><i>VS</i>' + deck(STRONGEST_AI) + deck(UNDERDOG_TAG_RIVAL_MATE) + '</span>', ' wide') + '</div></section>'
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
      if (key === 'udtag') { resolve({ underdogTag: true, level: UNDERDOG_TAG_LEVEL }); return; }
      resolve(key === 'underdog' ? { underdog: true, level: UNDERDOG_LEVEL } : { level: +key });
    };
  });
}

