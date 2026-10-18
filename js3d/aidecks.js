/* =========================================================================
 * CPU の難易度と固定デッキ
 *   0..2 : かんたん / ふつう / つよい (通常 AI、ランダム編成)
 *   3    : GATEKEEPER (旧名 最強。dsh 特化 + STRONGEST_AI)
 *   4    : ロック特化 (psylock 特化 + LOCK_AI)
 *   5..  : 挑戦者 (dsh 特化 + CHALLENGERS の固定デッキ)
 *   22   : 機械仕掛けの神 CODE:PURPLE (psylock 特化 + DEUS_AI、4 秒の読み。対戦の始めに降臨の演出)
 *   23   : すべてを見る者 ALL-SEEING (22 と同じ + のぞき見。神に勝つと現れる。対戦の始めに目が開く演出)
 *   24   : ORACLE (管理者の自動プレイと同じ読み: 学習モデル入り・ORACLE だけの手筋・2.4 秒。のぞき見なし)
 *   30..33 : 本気の4人 (本気紫苑・本気瑠璃・本気杏・本気茜。ORACLE の読み + その子の得意プロトコル入りのデッキと学習モデル)
 *   固定デッキの難易度は「自由に選ぶ」でだけ使える (setup.js)。
 *   エンジンの設定は main.js の applyAiDifficulty、戦績の表示名は stats.js。
 * ========================================================================= */

/* 最強: 2026-09-23 に scripts/deck_search.js で165デッキをふるい分け、
   旧最強 (DARKNESS/SPEED/HATE) と 400戦して 244勝 (61%) */
export const STRONGEST_AI = ['FIRE', 'WATER', 'SPEED'];
/* ロック特化: サイキック①を覆って「相手は裏向きでしかプレイできない」を永続させる。
   ダークネス②で覆われた①を表にするか、スピード③の終了時の移動で①を覆う */
export const LOCK_AI = ['PSYCHIC', 'DARKNESS', 'SPEED'];

/* 挑戦者: 最強を選んだときの上位候補。どれも旧最強と 200戦して互角 (44.5〜49.5%) */
export const CHALLENGER_BASE = 5;
export const CHALLENGERS = [
  { deck: ['DARKNESS', 'SPEED', 'HATE'], name: '旧最強' },
  { deck: ['DARKNESS', 'HATE', 'SMOKE'] },
  { deck: ['HATE', 'FIRE', 'WAR'] },
  { deck: ['SMOKE', 'WATER', 'PEACE'] }
];

export const LEVEL_LABELS = ['かんたん', 'ふつう', 'つよい', 'GATEKEEPER', 'ロック特化'];

/* 下剋上: 最弱のデッキ (あなた) で最強 (STRONGEST_AI) に挑む。相手の戦い方は最強と同じ。
   最弱は 2026-09-24 に探したもの: プロトコル単体の強さの下位10個から作れる120デッキを
   scripts/deck_search.js --bottom 10 でふるい分け (SPEED を含むものは最強と重なるので除く)、
   下位8つを最強と60戦ずつ (両者とも最強の戦い方) → SMOKE/UNITY/APATHY が 4勝55敗1分 (6.8%) で最も低い */
export const UNDERDOG_LEVEL = 20;
export const UNDERDOG_DECK = ['SMOKE', 'UNITY', 'APATHY'];

/* 下剋上タッグ: あなた (最弱で固定) と、かんたんの CPU の味方 vs 最強のタッグ。
   相手は最強のデッキ (STRONGEST_AI) と、DARKNESS / HATE / PSYCHIC (最強とも、あなたの最弱とも重ならない。2026-10-04)。
   相手2人とも最強と同じ戦い方。味方の CPU だけ、かんたんの読み (main.js の UNDERDOG_MATE_AI) */
export const UNDERDOG_TAG_LEVEL = 21;
export const UNDERDOG_TAG_RIVAL_MATE = ['DARKNESS', 'HATE', 'PSYCHIC'];

/* 機械仕掛けの神 (仮の名前 CODE:PURPLE): ぱぱぱのぱの棋譜から学んだ指し方 (ロック特化がもと) と、その得意デッキ。
   CHALLENGE の画面にだけ出す (週替わり・勝ち抜き戦の CHALLENGERS には入れない)。対戦の始めにデウス・エクス・マキナの降臨 (deus.js) */
export const DEUS_LEVEL = 22;
/* デッキ: 3つ目を10通り試し (2026-10-11)、最強 (1.2 秒) 相手に 4 秒の読みで 480戦 55.7% (95%: 51.3〜60.1%) だった FIRE。
   ぱぱぱのぱの得意は WAR だが、WAR は 47% で最強に届かなかった */
export const DEUS_AI = ['PSYCHIC', 'DARKNESS', 'FIRE'];
/* 考える時間 (ms)。最強は 1200。読みを深くした分だけ強い (0.9 秒で 42% → 2.4 秒で 47%、WAR のとき) */
export const DEUS_BUDGET = 4000;
/* ALL-SEEING (機械仕掛けの神の先、のぞき見の敵): 神と同じ読み・デッキに、こちらの手札・裏向き・山札の並びをすべて見る力。
   最強 (1.2 秒) 相手に 480戦 66.5% (神は 54.6%)。神に勝つと CHALLENGE に現れる */
export const PEEK_LEVEL = 23;
export const PEEK_AI = ['PSYCHIC', 'DARKNESS', 'FIRE'];
export const PEEK_NAME = 'ALL-SEEING';
/* ORACLE: 管理者だけの自動プレイの読み (main.js の AUTO_AI) を、CPU 戦の相手として誰でも選べるようにしたもの (2026-10-15 ユーザー「CPU 戦の相手として戦えるように。オート操作に開放はしない」)。
   デッキは ORACLE を鍛えた FIRE / WATER / SPEED (最強と同じ) */
export const ORACLE_LEVEL = 24;
export const ORACLE_AI = STRONGEST_AI;
export const ORACLE_NAME = 'ORACLE';
/* ORACLE (管理者の自動プレイ・CHALLENGE の相手) がロックのデッキ (PSYCHIC を含む) を持ったときだけ、読みを差し替える:
   サイキック①ロックの手筋 + ロック用の学習モデル (data/valnet-lock.json) + 3.6 秒。
   モデルはロックのミラー5,000局 (うち2,000局はロック用モデル入り同士) + 第1世代のデータで学習 (2026-10-16)。
   ALL-SEEING とのミラー (両者 PSYCHIC / DARKNESS / FIRE) で 600戦 54.8% (95%: 50.8〜58.8%)。
   同じ種で、切り替える前の ORACLE (dsh の手筋・第1世代のモデル) は 37.3%、ロックの手筋 + 第1世代のモデルは 47.0% (300戦) */
export const ORACLE_LOCK_AI = { kind: 'psylock', budget: 3600, valnetModel: 'lock' };
export const isLockDeck = (protocols) => (protocols || []).some(p => String(p && p.name || p || '').split('+').includes('PSYCHIC'));
/* cfg: ORACLE の設定 (main.js の AUTO_AI など)。特化を当てる側のデッキがロックなら、差し替えた設定を返す */
export function oracleAi(cfg, st) {
  const me = st && st.players && st.players[cfg.specSide === 0 ? 0 : 1];
  return cfg.oracle && me && isLockDeck(me.protocols) ? { ...cfg, ...ORACLE_LOCK_AI } : cfg;
}
export const DEUS_NAME = 'CODE:PURPLE';

/* 本気の4人 (CHALLENGE の強敵、2026-10-16 ユーザー「チャレンジモードは本気紫苑 本気瑠璃みたいな感じにしたい」)。
   中身は ORACLE の読み (main.js の ORACLE_CPU_AI) に、その子の得意プロトコル (avatar-lines.js の FAVORITE) を必ず入れたデッキと、
   そのデッキ用の学習モデル (ai.valnetModel → data/valnet-<名前>.json。無い間は第1世代) を当てたもの。相手のキャラはその子で固定。
   デッキの残り2つは scripts/deck_search.js --must <得意> --top 14 (60ms、各79デッキ) でふるい分け、上位6つずつを
   --rounds 4 --budget 300 で比べ直して決めた (2026-10-16、1デッキ約66戦、95% の幅は ±10 ポイントほど)。
   茜 HATE/FIRE/DEATH 96.4% (飛び抜けて1位)。杏 FIRE/WATER/COURAGE 76.4%・瑠璃 WATER/HATE/TIME 76.1% は、
   最上位 (FIRE/WATER/HATE 83.3%・WATER/FIRE/DEATH 79.7%) と幅の中で差がなく、4人のデッキが重ならない組を選んだ */
export const HONKI_BASE = 30;
export const HONKI = [
  /* 紫苑: 機械仕掛けの神と同じロックのデッキ。ロック用の学習モデル (ORACLE_LOCK_AI) がそのまま使える */
  { avatar: 'shion', color: '#a07bff', name: '本気紫苑', note: '読みを解析しきって、サイキック①で縛りに来る', fav: 'PSYCHIC', deck: ['PSYCHIC', 'DARKNESS', 'FIRE'], alt: ['PSYCHIC', 'DIVERSITY', 'MIRROR'], ai: ORACLE_LOCK_AI },
  { avatar: 'asagi', color: '#3d7dff', name: '本気瑠璃', note: 'ウォーターの流れで、自分の順路へ連れていく', fav: 'WATER', deck: ['WATER', 'HATE', 'TIME'], alt: ['WATER', 'FEAR', 'LUCK'], ai: {} },
  { avatar: 'yamabuki', color: '#ff8a2a', name: '本気杏', note: 'ファイアの勢いで、押しきりに来る', fav: 'FIRE', deck: ['FIRE', 'WATER', 'COURAGE'], alt: ['FIRE', 'LIFE', 'SPEED'], ai: {} },
  { avatar: 'nadeshiko', color: '#e0283c', name: '本気茜', note: 'ヘイトで、盤面をきれいに片づけに来る', fav: 'HATE', deck: ['HATE', 'FIRE', 'DEATH'], alt: ['HATE', 'GRAVITY', 'PLAGUE'], ai: {} }
];
export const isHonki = (level) => level >= HONKI_BASE && level < HONKI_BASE + HONKI.length;
export const honkiOf = (level) => (isHonki(level) ? HONKI[level - HONKI_BASE] : null);
/* cfg: ORACLE の設定。本気のキャラはその子の設定を重ねる (ロックへの切り替え oracleAi は通さない: デッキごとに決めてあるため) */
export const honkiAi = (cfg, level) => ({ ...cfg, ...honkiOf(level).ai });
/* 本気のキャラ同士の対戦 (2026-10-16 ユーザー「お互いが対戦したりする時用に」): デッキのプロトコルがかぶったら、片方が alt (2つ目のデッキ) にゆずる。
   かぶったプロトコルが誰かの得意なら、その持ち主が残す (FIRE は杏、WATER は瑠璃)。どちらの得意でもなければ、HONKI で後ろの子がゆずる (紫苑と茜の FIRE は茜がゆずる)。
   alt は4人同時のタッグでもかぶらないように、ほかの3人の1つ目のプロトコルも、ほかの子の alt のプロトコルも使わない (12個すべて別)。
   選び方 (2026-10-18 ユーザー「可能な限り強くして、ストーリーで握る組み合わせもそれにしよう」): 使える中で強さの目安 (proto_strength) が上位の8個を、いちばん弱い子の勝率が最大になるように配った。
   ストーリーで主人公の FIRE/WATER/LIFE・FIRE/LIGHT/LIFE と同じ卓に並ぶので、LIFE は杏だけ (杏はまだストーリーで戦わない)。js3d/story.js の手持ちも同じ組
   前の alt (--exclude で探した最強の組) は ORACLE の読みで1つ目に 28〜46% だったので、1つ目は変えない
   a, b: HONKI の要素。返り値: [a のデッキ, b のデッキ] */
export function honkiPairDecks(a, b) {
  const shared = a.deck.filter(p => b.deck.includes(p));
  if (!shared.length) return [a.deck, b.deck];
  const aFav = shared.includes(a.fav), bFav = shared.includes(b.fav);
  const bKeeps = aFav === bFav ? HONKI.indexOf(b) < HONKI.indexOf(a) : bFav;
  return bKeeps ? [a.alt, b.deck] : [a.deck, b.alt];
}

export const isChallenger = (level) => level >= CHALLENGER_BASE && level < CHALLENGER_BASE + CHALLENGERS.length;

/* 難易度の固定デッキ (無ければ null = ランダム編成) */
export function fixedDeck(level) {
  if (level === 3 || level === UNDERDOG_LEVEL || level === UNDERDOG_TAG_LEVEL) return STRONGEST_AI;
  if (level === 4) return LOCK_AI;
  if (level === DEUS_LEVEL) return DEUS_AI;
  if (level === PEEK_LEVEL) return PEEK_AI;
  if (level === ORACLE_LEVEL) return ORACLE_AI;
  if (isHonki(level)) return honkiOf(level).deck;
  return isChallenger(level) ? CHALLENGERS[level - CHALLENGER_BASE].deck : null;
}

export function challengerName(c) {
  return (c.name ? c.name + ' ' : '') + c.deck.join(' / ');
}

/* 戦績などに出す難易度の名前 */
export function levelLabel(level) {
  if (isChallenger(level)) return '挑戦者 ' + challengerName(CHALLENGERS[level - CHALLENGER_BASE]);
  if (level === UNDERDOG_LEVEL) return '下剋上 (最弱 vs GATEKEEPER)';
  if (level === DEUS_LEVEL) return '機械仕掛けの神 ' + DEUS_NAME;
  if (level === PEEK_LEVEL) return 'すべてを見る者 ' + PEEK_NAME;
  if (level === ORACLE_LEVEL) return ORACLE_NAME;
  if (isHonki(level)) return honkiOf(level).name;
  if (level === UNDERDOG_TAG_LEVEL) return '下剋上タッグ (かんたんの味方 vs GATEKEEPER タッグ)';
  return LEVEL_LABELS[level] || '不明';
}
