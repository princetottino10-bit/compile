/* =========================================================================
 * 相手を選ぶ画面
 *   SINGLE GAME: おまかせ (プロトコルも相手も自動) / CPU (かんたん / ふつう / つよい。次の画面で公式のドラフトで取り合う) / タッグ
 *   CHALLENGE (opts.challenge): 強敵 (最強・本気の4人・ORACLE・神。相手のデッキは決まっている。ロック特化・挑戦者は「自由に選ぶ」にだけ残す) / 下剋上 (最弱のデッキで最強に挑む。勝つと称号)
 *   CHALLENGE の「連勝」: GATEKEEPER 連勝 (endless.js)。負けるまで GATEKEEPER と戦い、勝つたびに相手のルールが足される
 *   → { level } / { underdog: true } / { endless: true, level } / { quick: true } / { watch: true } / null (タイトルへ)
 * ========================================================================= */
import { showTitleBack, hideTitleBack } from './titleback.js';
import { gearSvg, eyeSvg } from './deus.js';
import { LEVEL_LABELS, STRONGEST_AI, HONKI, HONKI_BASE, UNDERDOG_DECK, UNDERDOG_LEVEL, UNDERDOG_TAG_LEVEL, UNDERDOG_TAG_RIVAL_MATE, DEUS_LEVEL, DEUS_AI, DEUS_NAME, PEEK_LEVEL, PEEK_AI, PEEK_NAME, ORACLE_LEVEL, ORACLE_AI, ORACLE_NAME } from './aidecks.js';
import { localRecords } from './stats.js';
import { conquered, conquerable } from './stats-data.js';
import { settings } from './settings.js';
import { accountState } from './account.js';
import { loadEndless, activeRules, ruleAt, MAX_STAGE } from './endless.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LAST_KEY = 'compileOppLast';

const CPU_NOTES = ['はじめての人に。読みは浅く、ときどき迷う', '標準。1手先を読んで指す', 'GATEKEEPER と同じ読みと手筋。デッキはドラフトで決まる'];

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
  const card = (key, title, note, body, extra, color) => '<button type="button" class="op-card' + (String(last) === key ? ' last' : '') + (extra || '') +
    '"' + (color ? ' style="--hc:' + esc(color) + '"' : '') + ' data-opp="' + key + '"><b>' + title + '</b><small>' + note + '</small>' + (body || '') + '</button>';
  const cleared = underdogCleared();
  /* 強敵ごとの戦績 (勝ち・負け)。見出しの右に小さく: 勝った ✓ / 負けだけ / 未挑戦 (押す前に、どの相手に勝っていないかが分かる) */
  const recs = localRecords();
  const recOf = (lv) => {
    const g = recs.filter(r => r.level === lv && (!r.mode || r.mode === 'cpu'));   // 勝ち抜き戦・タッグなどは数えない
    const w = g.filter(r => r.win).length;
    return { games: g.length, wins: w };
  };
  const rec = (lv) => {
    const r = recOf(lv);
    if (!r.games) return '<span class="op-rec none">未挑戦</span>';
    return '<span class="op-rec' + (r.wins ? ' won' : ' lost') + '">' + (r.wins ? '✓ ' : '') + r.wins + '勝 ' + (r.games - r.wins) + '敗</span>';
  };
  const tagCleared = localRecords().some(r => r.win && r.level === UNDERDOG_TAG_LEVEL);
  /* 制覇: 最強に勝ったプロトコルの数。30 すべてで称号 CONQUEROR */
  const conq = conquered(localRecords()).size, total = conquerable(protocols.map(p => p.name)).length;
  const conqBar = '<span class="op-conq"><span>制覇 <b>' + conq + '</b>/' + total + '</span><i><s style="width:' + Math.round(conq / total * 100) + '%"></s></i></span>';
  /* 強敵の一覧と、勝ったことのある数 (見出しの下にまとめて出す) */
  /* 機械仕掛けの神 (最強の上): 称号 CONQUEROR (最強を除く全プロトコルで最強に勝つ) を取ると挑める。管理者は試せるように常に */
  /* 機械仕掛けの神 (最強の上) は誰でも挑める。すべてを見る者は、神に勝つと現れる (それまでは札も出さない)。管理者は試せるように常に */
  const peekOpen = recOf(DEUS_LEVEL).wins > 0 || !!accountState().admin;
  /* ロック特化・挑戦者は CHALLENGE から外した (2026-10-16 本気の4人に置きかえ。ロック特化は本気紫苑と、挑戦者は最強と役が重なる)。
     「自由に選ぶ」ではまだ選べ、戦績も残る */
  const bossLevels = (peekOpen ? [PEEK_LEVEL] : []).concat([DEUS_LEVEL, ORACLE_LEVEL], HONKI.map((h, k) => HONKI_BASE + k), [3]);
  const beaten = bossLevels.filter(lv => recOf(lv).wins > 0).length;
  /* 強敵 / 下剋上 はタブで切り替える (前は縦に8枚並び、下剋上がずっと下にあった)。最後に選んだ方で開く */
  const tabKey = 'compileChallengeTab';
  let ctab = (() => { try { return localStorage.getItem(tabKey) || ''; } catch (e) { return ''; } })();
  if (last === 'underdog' || last === 'udtag') ctab = ctab || 'ud';
  if (last === 'endless') ctab = ctab || 'endless';
  if (ctab !== 'ud' && ctab !== 'endless') ctab = 'boss';
  const es = loadEndless();
  const esRules = activeRules(es.streak), esNext = ruleAt(es.streak + 1);
  const sumChip = (label, value, ok) => '<span class="op-sumc' + (ok ? ' ok' : '') + '"><small>' + label + '</small><b>' + value + '</b></span>';
  el.innerHTML = '<div class="op-wrap' + (challenge ? ' op-challenge' : '') + '">' +
    (challenge
      ? '<div class="op-head"><b>// CHALLENGE</b><span>BOSS · UNDERDOG</span></div>' +
      /* 進み具合のまとめ */
      '<div class="op-sum">' + sumChip('強敵に勝った', beaten + '/' + bossLevels.length, beaten === bossLevels.length) +
        sumChip('制覇', conq + '/' + total, conq >= total) +
        sumChip('下剋上', cleared ? '✓' : '—', cleared) + sumChip('タッグ', tagCleared ? '✓' : '—', tagCleared) +
        sumChip('最高連勝', es.best ? String(es.best) : '—', es.best >= MAX_STAGE) + '</div>' +
      '<div class="op-tabs" role="tablist">' +
        '<button type="button" role="tab" data-ctab="boss" aria-selected="' + (ctab === 'boss') + '" class="' + (ctab === 'boss' ? 'on' : '') + '">強敵 <small>' + bossLevels.length + '</small></button>' +
        '<button type="button" role="tab" data-ctab="ud" aria-selected="' + (ctab === 'ud') + '" class="' + (ctab === 'ud' ? 'on' : '') + '">下剋上 <small>2</small></button>' +
        '<button type="button" role="tab" data-ctab="endless" aria-selected="' + (ctab === 'endless') + '" class="' + (ctab === 'endless' ? 'on' : '') + '">連勝</button></div>' +
      '<section data-cpane="boss"' + (ctab === 'boss' ? '' : ' hidden') + '><h3><small>相手のデッキは決まっている。次の画面で自分の3つを選ぶ</small></h3>' +
      '<div class="op-row boss">' +
        (peekOpen ? card(String(PEEK_LEVEL), '<span class="op-deus op-peek">' + eyeSvg() + esc(PEEK_NAME) + '</span>' + rec(PEEK_LEVEL),
          'すべてを見る者。あなたの手札も、裏向きのカードも、山札の並びも見えている', deck(PEEK_AI), ' deus peek top') : '') +
        card(String(DEUS_LEVEL), '<span class="op-deus">' + gearSvg(10) + esc(DEUS_NAME) + '</span>' + rec(DEUS_LEVEL) +
            (recOf(DEUS_LEVEL).wins ? ' <em>✓ TITLE — DEICIDE</em>' : ''),
          'GATEKEEPER の上に座る、機械仕掛けの神。勝つと 称号 DEICIDE', deck(DEUS_AI), ' deus top') +
        /* ORACLE: 学習モデル入りの読み (読みの設定は管理者の自動プレイと同じ)。誰でも挑める (2026-10-15) */
        card(String(ORACLE_LEVEL), esc(ORACLE_NAME) + rec(ORACLE_LEVEL),
          '学習モデルと、上級者の棋譜から教わった手筋で打つ', deck(ORACLE_AI), ' top') +
        /* 本気の4人: ORACLE の読みに、その子の得意プロトコル入りのデッキと学習モデル。最強の上、神の下 */
        HONKI.map((h, k) => card(String(HONKI_BASE + k), esc(h.name) + rec(HONKI_BASE + k), esc(h.note), deck(h.deck), ' honki', h.color)).join('') +
        card('3', 'GATEKEEPER' + rec(3) + (conq >= total ? ' <em>✓ TITLE — CONQUEROR</em>' : ''),
          'CHALLENGE の門番。残りの' + total + 'のプロトコルすべてで勝つと 称号 CONQUEROR', deck(STRONGEST_AI) + conqBar, ' top') +
      '</div></section>' +
      '<section data-cpane="ud"' + (ctab === 'ud' ? '' : ' hidden') + '><h3><small>いちばん弱いデッキで、いちばん強い CPU に挑む</small></h3>' +
      '<div class="op-row">' + card('underdog', '下剋上' + (cleared ? ' <em>✓ TITLE — GIANT SLAYER</em>' : rec(UNDERDOG_LEVEL)),
        'あなた (最弱) vs GATEKEEPER。勝つと 称号 GIANT SLAYER・専用スリーブとマーカー・+100 XP',
        '<span class="op-vs">' + deck(UNDERDOG_DECK) + '<i>VS</i>' + deck(STRONGEST_AI) + '</span>', ' wide') + '</div>' +
      '<div class="op-row">' + card('udtag', '下剋上タッグ' + (tagCleared ? ' <em>✓ TITLE — UNDERDOG DUO</em>' : ''),
        'あなた (好きな3つ) ＋ かんたんの味方 vs GATEKEEPER のタッグ。手番は あなた → 相手1 → 味方 → 相手2。勝つと 称号 UNDERDOG DUO',
        '<span class="op-vs"><span class="op-any">好きな3つ</span><i>VS</i>' + deck(STRONGEST_AI) + deck(UNDERDOG_TAG_RIVAL_MATE) + '</span>', ' wide') + '</div></section>' +
      /* GATEKEEPER 連勝: 今の連勝・最高記録・かかっているルール・次に勝つと足されるルール */
      '<section data-cpane="endless"' + (ctab === 'endless' ? '' : ' hidden') + '><h3><small>負けるまで GATEKEEPER と戦い続ける。勝つたびに GATEKEEPER にルールが1つ足される。1戦ごとに自分の3つを選び直せる</small></h3>' +
      '<div class="op-row">' + card('endless', 'GATEKEEPER 連勝' + ' <span class="op-rec' + (es.best ? ' won' : ' none') + '">最高 ' + es.best + '連勝</span>',
        (es.streak ? 'いま ' + es.streak + '連勝中。' : '') + (esNext ? '次に勝つと: ' + esNext : 'ルールは全部そろっている。このまま続く') + '。3・5・7・10連勝で経験値',
        '<span class="op-vs"><span class="op-any">好きな3つ</span><i>VS</i>' + deck(STRONGEST_AI) + '</span>' +
        (esRules.length ? '<ul class="op-rules">' + esRules.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : ''), ' wide') + '</div></section>'
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
      const tb = ev.target.closest('[data-ctab]');
      if (tb) {
        const k = tb.dataset.ctab;
        el.querySelectorAll('[data-ctab]').forEach(b => { b.classList.toggle('on', b === tb); b.setAttribute('aria-selected', String(b === tb)); });
        el.querySelectorAll('[data-cpane]').forEach(p => { p.hidden = p.dataset.cpane !== k; });
        try { localStorage.setItem('compileChallengeTab', k); } catch (e) { /* private mode */ }
        el.scrollTop = 0;
        return;
      }
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
      if (key === 'endless') { resolve({ endless: true, level: 3 }); return; }
      resolve(key === 'underdog' ? { underdog: true, level: UNDERDOG_LEVEL } : { level: +key });
    };
  });
}

