/* =========================================================================
 * カオス勝ち抜き戦 (2026-10-16 ユーザー「RUN に新しいモード。めちゃくちゃな遊び」)
 *   ふつうの勝ち抜き戦 (run.js) と同じ地図を登るが、
 *   ・試合ごとに「異変」(MUTATORS) がルーレットで 1〜3 個かかる。たいていは両者にかかるので、崩れた盤面をどう使うかの遊び
 *   ・はじめからパッチ2つ (LEGENDARY も出る) と、RARE 以上から1つ選ぶ。ライフ 12・クレジット 12
 *   ・Ω の祭壇 (デッキのプロトコルを Ω のプロトコルへ入れ替えて Ω カードをもらう) と、運命のルーレット (当たりも外れも大きい)
 *   ・勝ったときのカードの報酬に「ルーレット」が足される
 *   HEAT・最高記録はふつうの勝ち抜き戦と分ける。ここはデータと抽選だけ (run.js が使う)
 * ========================================================================= */

export const CHAOS_LIFE = 12;
export const CHAOS_CREDITS = 12;
export const CHAOS_MAX_ADDED = 6;            // β・Ω を足せる数 (ふつうは 3)

/* 異変。who: both (両者) / me (あなたに得) / opp (相手が変わる) / rule (遊び方が壊れる)。group が同じものは1試合に1つまで。
   効き方は run.js の battleOpts・prepareBattle・creditGain・finishBattle が id を見て決める */
export const MUTATORS = [
  { id: 'bighand', group: 'hand', who: 'both', name: 'BIG HAND', label: '大盤振る舞い', text: 'どちらも、はじめの手札が 7 枚' },
  { id: 'famine', group: 'hand', who: 'both', name: 'FAMINE', label: '断食', text: 'どちらも、はじめの手札が 3 枚' },
  { id: 'upside', group: 'value', who: 'both', name: 'UPSIDE DOWN', label: '裏の世界', text: 'どちらも、裏向きのカードの値が 4、表向きの値は −1' },
  { id: 'double', group: 'value', who: 'both', name: 'DOUBLE', label: '倍々', text: 'どちらも、デッキのいちばん左のプロトコルの表向きの値が 2 倍' },
  { id: 'powerup', who: 'both', name: 'POWER UP', label: '全員強化', text: 'どちらも、カードが全部 強化済み (値 +1)' },
  { id: 'omega', who: 'both', name: 'Ω RAIN', label: 'Ω の雨', text: 'どちらの山札にも、自分のプロトコルの β カードと Ω カードが全部入る' },
  { id: 'sudden', group: 'win', who: 'both', name: 'SUDDEN DEATH', label: '一発勝負', text: 'どちらも、1本コンパイルしたら勝ち' },
  { id: 'nocost', who: 'both', name: 'NO COST', label: '捨て放題', text: 'どちらも、自分のカードの効果で手札を捨てるとき、捨てなくてよい' },
  { id: 'handicap', who: 'me', name: 'HANDICAP', label: '施し', text: 'あなたの手札 +2。そのかわり相手が先攻で、はじめからコントロールを持つ' },
  { id: 'mirror', group: 'opp', who: 'opp', name: 'MIRROR MATCH', label: '鏡写し', text: '相手のデッキが、あなたと同じ3つのプロトコル' },
  { id: 'swap', group: 'opp', who: 'opp', name: 'BODY SWAP', label: '入れ替わり', text: 'この試合だけ、あなたと相手のデッキが入れ替わる (強化・β は相手のデッキには付かない)' },
  { id: 'giant', group: 'opp', who: 'opp', name: 'GIANT KILLING', label: '巨人狩り', text: '相手がいちばん強い CPU。勝てばクレジット 3 倍' },
  { id: 'jackpot', group: 'stake', who: 'me', name: 'JACKPOT', label: '一攫千金', text: '勝てばクレジット +10。負けるとライフがさらに −2' },
  { id: 'vampire', group: 'stake', who: 'me', name: 'VAMPIRE', label: '吸血', text: '勝てばライフ +2' },
  { id: 'marathon', group: 'win', who: 'both', name: 'MARATHON', label: '長期戦', text: 'どちらも、コンパイル済みなしの 3 本勝負 (ルールどおりの長い試合)。勝てばクレジット +6' },
  { id: 'twin', who: 'both', name: 'DOUBLE DECK', label: '二重の山札', text: 'どちらの山札にも、自分のカードの写しが最大 12 枚混ざる (山札がぶ厚くなる)' },
  { id: 'drunk', group: 'opp', who: 'opp', name: 'DRUNK', label: '酔っぱらい', text: '相手は「つよい」の読みだが、手の半分がでたらめ' },
  { id: 'baby', group: 'opp', who: 'opp', name: 'BABY MODE', label: '赤ちゃん', text: '相手は「かんたん」になるが、あなたの手札は 2 枚、相手は 7 枚' },
  /* ここから下は数値ではなく「遊び方」を壊す異変 (2026-10-17 ユーザー「常識に囚われてる」)。画面側 (main.js・board.js・stage.js) が効かせる。
     あなたにだけ不利なので、勝てばクレジット +4 (creditGain) */
  { id: 'blind', group: 'rule', who: 'rule', name: 'BLINDFOLD', label: '目隠し', text: 'あなたの手札と、あなたの裏向きのカードが見えない。表で出せば見える。勝てばクレジット +4' },
  { id: 'tick', group: 'rule', who: 'rule', name: 'FIVE SECONDS', label: '5秒ルール', text: 'あなたの手番は 5 秒。過ぎると、でたらめな手を勝手に打つ。勝てばクレジット +4' },
  { id: 'flip', group: 'rule', who: 'rule', name: 'TOPSY-TURVY', label: '天地逆転', text: '画面が上下さかさまになる。勝てばクレジット +4' },
  /* 勝ち負けの決まり方を壊す (エンジンの newGame の misere・handSwap) */
  { id: 'misere', group: 'win', who: 'both', name: 'MISÈRE', label: '負けるが勝ち', text: '先にコンパイルし終えた側の負け。ラインを伸ばさず、相手に伸ばさせる' },
  { id: 'handswap', who: 'both', name: 'HAND SWAP', label: '手札交換', text: '4 手番ごとに、あなたと相手の手札がまるごと入れ替わる' },
  { id: 'turncoat', who: 'both', name: 'TURNCOAT', label: '寝返り', text: '3 手番ごとに、どこかのラインのいちばん上のカードどうしが、向こう側へ寝返る' }
];
/* 画面側で効かせる異変 (エンジンには何も渡さない) */
export const RULE_MUTATORS = ['blind', 'tick', 'flip'];
const MUT = Object.fromEntries(MUTATORS.map(m => [m.id, m]));
export const mutatorInfo = (id) => MUT[id] || null;

/** その試合の異変の数: 序盤 1 / 5段目から 2 / BOSS 3。精鋭は +1 (最大 3) */
export function mutatorCount(row, kind) {
  if (kind === 'boss') return 3;
  const base = row < 4 ? 1 : 2;
  return Math.min(3, base + (kind === 'elite' ? 1 : 0));
}

/** 異変を n 個選ぶ (group が同じものは1つまで)。ボス戦では相手のデッキを変える異変 (opp) は出さない */
export function rollMutators(n, rnd, opts = {}) {
  const out = [];
  const used = new Set();
  let pool = MUTATORS.filter(m => !(opts.boss && m.group === 'opp'));
  while (out.length < n && pool.length) {
    const m = pool[Math.floor(rnd() * pool.length)];
    out.push(m.id);
    if (m.group) used.add(m.group);
    pool = pool.filter(x => x.id !== m.id && !(x.group && used.has(x.group)));
  }
  return out;
}

/* 運命のルーレット (イベントとカードの報酬)。当たりも外れも大きい。
   kind で run.js が中身を決める。weight は出やすさ */
export const ROULETTE = [
  { kind: 'legend', weight: 14, label: 'LEGENDARY のパッチ', text: 'LEGENDARY のパッチを1つもらった！' },
  { kind: 'credits', weight: 18, label: 'クレジット +15', text: 'クレジット +15！' },
  { kind: 'fullheal', weight: 14, label: 'ライフ全回復', text: 'ライフが全回復した！' },
  { kind: 'upgrade2', weight: 16, label: 'ランダムに2枚強化', text: 'カードが2枚、勝手に強化された！' },
  { kind: 'omega', weight: 10, label: 'Ω カード', text: 'Ω カードが降ってきた！' },
  { kind: 'reshuffle', weight: 12, label: 'デッキ総入れ替え', text: 'デッキのプロトコルが3つとも入れ替わった！ (強化・除去・β は消えた)' },
  { kind: 'hurt', weight: 12, label: 'ライフ −3', text: 'ハズレ… ライフ −3' },
  { kind: 'broke', weight: 4, label: 'クレジット 0', text: '大ハズレ… クレジットが 0 になった' }
];
