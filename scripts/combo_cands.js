'use strict';
/*
 * コンボの候補 (カードの効果を読んで挙げたもの)。scripts/combo_lab.js が盤面に植えて検証する。
 *
 *   protos   … 自分のデッキに入れるプロトコル (足りない分はランダム)
 *   setup    … 植える札。mine/opp: [{ card, at: 'field'|'hand'|'trash'|'deckTop', faceUp, line, over }]
 *              場の札は既定でそのプロトコルのラインの一番上。over: <card> はその札の上に重ねる
 *   act      … 検証する手 (forced の1手目)。{ play, faceUp, line: 'proto'|'onto:<card>'|<protocol>|'other' }
 *   partner  … 組の効き目を測るとき効果を消す札 (同じ値の白紙の札に差し替えて同じ手を打つ)
 *   late     … 中盤以降の盤面を使う
 *   kind     … engine (場に残って毎手番効く) / burst (その手番で大きく得) / setup (次の手番の仕込み) / lock (相手の行動を縛る)
 *
 * 呼び名は値 (WAR 0 = WAR_1)。内部 ID は data/cards.json で引く。
 */
module.exports = [
  {
    id: 'C001', name: 'WAR 0 + CHAOS 0: 開始のたびに削除', kind: 'engine', protos: ['WAR', 'CHAOS'],
    how: 'WAR 0 (相手がカードを引いたあと: 1枚削除できる) を一番上に置いたまま、CHAOS 0 を一番上に出す。CHAOS 0 の開始「相手は自分のデッキの一番上を引く」で毎手番 WAR 0 が起き、毎手番1枚削除できる。',
    setup: { mine: [{ card: 'WAR_1', at: 'field' }, { card: 'CHAOS_1', at: 'hand' }] },
    act: { play: 'CHAOS_1' }, partner: ['WAR_1'],
    note: '決着まで打った勝ち負けでも、その手で相方あり−白紙 = 勝率 +8.9 ±3.8pt (289盤面)。ORACLE が自分で CHAOS 0 を出すのは1割だが、選ばない手も同じくらい良い (−1.7 ±3.7)。'
  },
  {
    id: 'C002', name: 'FIRE 3 + PSYCHIC 4: 毎手番の戻す', kind: 'engine', protos: ['FIRE', 'PSYCHIC'],
    how: 'PSYCHIC 4 の終了「相手のカードを1枚戻せる。そうしたらこのカードを反転」で裏になった PSYCHIC 4 を、FIRE 3 の終了「1枚捨てて1枚反転」で表に戻す。終了時の順を PSYCHIC 4 → FIRE 3 にすると、毎手番1枚捨てで相手の札を1枚戻せる。',
    setup: { mine: [{ card: 'PSYCHIC_5', at: 'field' }, { card: 'FIRE_4', at: 'hand' }] },
    act: { play: 'FIRE_4' }, partner: ['PSYCHIC_5'],
    /* 回し方を決め打つ: 終了時は PSYCHIC 4 を先に、相手の一番大きい札を戻し、FIRE 3 は一番小さい手札を捨てて PSYCHIC 4 を表に戻す */
    picks: (s, q, P) => {
      const psy = P.planted.PSYCHIC_5;
      if (q.prompt === 'trigger-order' && q.candidates.includes(psy)) return [psy];
      if (q.context === 'PSYCHIC_5' && q.kind === 'pickCard') {
        const c = q.candidates.slice().sort((a, b) => P.val(s, b) - P.val(s, a));
        return c.length ? [c[0]] : null;
      }
      if (q.context === 'FIRE_4') {
        if (s.cards[psy].faceUp) return null;
        if (q.kind === 'yesNo') return ['yes'];
        if (q.kind === 'pickHand') { const c = q.candidates.slice().sort((a, b) => P.val(s, a) - P.val(s, b)); return [c[0]]; }
        if (q.kind === 'pickCard' && q.candidates.includes(psy)) return [psy];
      }
      return null;
    }
  },
  {
    id: 'C003', name: 'CORRUPTION 2 + CHAOS 4: 終了のたびに相手の手札を削る', kind: 'engine', protos: ['CORRUPTION', 'CHAOS'],
    how: 'CORRUPTION 2 の上段「あなたが手札を捨て札にしたあと: 相手は1枚捨てる」は覆われていても効く。CHAOS 4 の終了「手札を全部捨てて同じ枚数引く」で毎手番これが起きる。',
    setup: { mine: [{ card: 'CORRUPTION_3', at: 'field' }, { card: 'CHAOS_5', at: 'hand' }] },
    act: { play: 'CHAOS_5' }, partner: ['CORRUPTION_3']
  },
  {
    id: 'C004', name: 'CORRUPTION 6 + CORRUPTION 2: 1プロトコルの手札削り', kind: 'engine', protos: ['CORRUPTION'],
    how: 'CORRUPTION 6 の終了「1枚捨てるか、このカードを削除」で捨てるたび、CORRUPTION 2 の上段で相手も1枚捨てる。CORRUPTION 6 を CORRUPTION 2 の上に重ねても、上段どうしなので両方効く。',
    setup: { mine: [{ card: 'CORRUPTION_3', at: 'field' }, { card: 'CORRUPTION_6', at: 'hand' }] },
    act: { play: 'CORRUPTION_6' }, partner: ['CORRUPTION_3']
  },
  {
    id: 'C005', name: 'PLAGUE 1 + COURAGE 0: 終了のたびに交換', kind: 'engine', protos: ['PLAGUE', 'COURAGE'],
    how: 'COURAGE 0 の終了「1枚捨ててよい。そうしたら相手も1枚捨てる」に PLAGUE 1 の上段「相手が捨てたあと1枚引く」が乗る。こちらの手札は減らず、相手だけが毎手番1枚減る。',
    setup: { mine: [{ card: 'PLAGUE_2', at: 'field' }, { card: 'COURAGE_1', at: 'hand' }] },
    act: { play: 'COURAGE_1' }, partner: ['PLAGUE_2']
  },
  {
    id: 'C006', name: 'ICE 1 + WAR 3: 置かせるたびに置き返す', kind: 'engine', protos: ['ICE', 'WAR'],
    how: 'ICE 1 のラインに相手が出すと相手は1枚捨てる。WAR 3 の下段「相手が捨てたあと: 裏で1枚プレイできる」で、こちらは手番の外で1枚置ける。',
    setup: { mine: [{ card: 'ICE_1', at: 'field' }, { card: 'WAR_4', at: 'hand' }] },
    act: { play: 'WAR_4' }, partner: ['ICE_1']
  },
  {
    id: 'C007', name: 'MIRROR 4 + CHAOS 0: 開始のたびに2枚引く', kind: 'engine', protos: ['MIRROR', 'CHAOS'],
    how: 'CHAOS 0 の開始で両者が相手のデッキから1枚ずつ引き、相手が引いたので MIRROR 4 (相手が引いたあと1枚引く) でもう1枚。毎手番こちらだけ1枚多い。',
    setup: { mine: [{ card: 'MIRROR_5', at: 'field' }, { card: 'CHAOS_1', at: 'hand' }] },
    act: { play: 'CHAOS_1' }, partner: ['MIRROR_5']
  },
  {
    id: 'C008', name: 'HATE 3 + WAR 0: 削除するたびに引く', kind: 'engine', protos: ['HATE', 'WAR'],
    how: 'WAR 0 の削除 (相手が引くたび) ごとに HATE 3 の上段で1枚引く。HATE 3 は覆われても上段が効く。',
    setup: { mine: [{ card: 'WAR_1', at: 'field' }, { card: 'HATE_4', at: 'hand' }] },
    act: { play: 'HATE_4' }, partner: ['WAR_1']
  },
  {
    id: 'C009', name: 'SPIRIT 0 + CLARITY 0: 手札を溜めて点にする', kind: 'engine', protos: ['SPIRIT', 'CLARITY'],
    how: 'SPIRIT 0 の下段でキャッシュの確認 (手札5枚超を捨てる) を飛ばし、手札を溜める。CLARITY 0 の上段は手札1枚ごとにそのラインの合計 +1。',
    setup: { mine: [{ card: 'CLARITY_1', at: 'field' }, { card: 'SPIRIT_1', at: 'hand' }] },
    act: { play: 'SPIRIT_1' }, partner: ['CLARITY_1']
  },
  {
    id: 'C010', name: 'LIGHT 1 + SPIRIT 3: 毎手番動かして下を撃ち直す', kind: 'engine', protos: ['LIGHT', 'SPIRIT'],
    how: 'SPIRIT 3 の上段「あなたが引いたあと: 覆われていても移動できる」。LIGHT 1 の終了の1枚ドローで毎手番 SPIRIT 3 を動かせ、SPIRIT 3 がどいた札の中段が撃ち直しになる。',
    setup: { mine: [{ card: 'SPIRIT_4', at: 'field' }, { card: 'LIGHT_2', at: 'hand' }] },
    act: { play: 'LIGHT_2' }, partner: ['SPIRIT_4']
  },
  {
    id: 'C011', name: 'CORRUPTION 1 + PSYCHIC 4: 戻した札を手札に入れさせない', kind: 'engine', protos: ['CORRUPTION', 'PSYCHIC'],
    how: 'CORRUPTION 1 の下段で、相手の手札に戻る札は相手のデッキの一番上に裏で置かれる。PSYCHIC 4 の終了の戻すが、相手の次のドローを潰す形になる。',
    setup: { mine: [{ card: 'PSYCHIC_5', at: 'field' }, { card: 'CORRUPTION_2', at: 'hand' }] },
    act: { play: 'CORRUPTION_2' }, partner: ['PSYCHIC_5']
  },
  {
    id: 'C012', name: 'TIME 1 → TIME 0: デッキから好きな札を出す', kind: 'setup', protos: ['TIME'],
    how: 'TIME 1 の中段「覆われた札を1枚反転。デッキを全部捨て札に」で山札を捨て札に落とし、次の手番に TIME 0 「捨て札から1枚プレイ」で一番強い札を選んで出す。',
    setup: { mine: [{ card: 'TIME_2', at: 'hand' }, { card: 'TIME_1', at: 'hand' }] },
    act: { play: 'TIME_2' }, partner: ['TIME_1']
  },
  {
    id: 'C013', name: 'PLAGUE 1 + ICE 1: 置かせるたびに引く', kind: 'engine', protos: ['PLAGUE', 'ICE'],
    how: 'ICE 1 のラインに相手が出すたび相手は1枚捨て、PLAGUE 1 の上段でこちらが1枚引く。',
    setup: { mine: [{ card: 'PLAGUE_2', at: 'field' }, { card: 'ICE_1', at: 'hand' }] },
    act: { play: 'ICE_1' }, partner: ['PLAGUE_2']
  },
  {
    id: 'C014', name: 'WAR 0 + LOVE 6: 引かせて消す', kind: 'burst', protos: ['WAR', 'LOVE'],
    how: 'LOVE 6 (相手は2枚引く) の引かせる損を WAR 0 の削除で取り返す。',
    setup: { mine: [{ card: 'WAR_1', at: 'field' }, { card: 'LOVE_6', at: 'hand' }] },
    act: { play: 'LOVE_6' }, partner: ['WAR_1'],
    note: '決着まで打った勝ち負けでも、その手で相方あり−白紙 = 勝率 +11.0 ±3.8pt (292盤面)。'
  }
  ,
  {
    id: 'C015', name: '覆われた PSYCHIC 1 + METAL 2: 1ラインを締め出す', kind: 'lock', protos: ['PSYCHIC', 'METAL'],
    how: '覆われた表の PSYCHIC 1 は開始で裏返らず、相手は裏向きでしか出せない。METAL 2 の上段「相手はこのラインに裏向きで出せない」と重なると、相手は METAL 2 のラインに何も出せない。',
    setup: { mine: [{ card: 'PSYCHIC_2', at: 'field', cover: true }, { card: 'METAL_3', at: 'hand' }] },
    act: { play: 'METAL_3' }, partner: ['PSYCHIC_2']
  },
  {
    id: 'C016', name: '覆われた PSYCHIC 1 + PLAGUE 0: 1ラインを締め出す', kind: 'lock', protos: ['PSYCHIC', 'PLAGUE'],
    how: 'PLAGUE 0 の下段「相手はこのラインにプレイできない」と覆われた PSYCHIC 1 (裏向きでしか出せない) で、相手の置き場が2ラインの裏向きだけになる。',
    setup: { mine: [{ card: 'PSYCHIC_2', at: 'field', cover: true }, { card: 'PLAGUE_1', at: 'hand' }] },
    act: { play: 'PLAGUE_1' }, partner: ['PSYCHIC_2']
  },
  {
    id: 'C017', name: 'APATHY 1 → DEATH 2: 裏返してまとめて消す', kind: 'setup', protos: ['APATHY', 'DEATH'],
    how: 'APATHY 1 の中段で、そのラインの他の表向きの札 (相手の札も) を全部裏にする。裏向きは値2なので、次の手番に DEATH 2 「値1か2の札を全部削除」でそのラインを更地にする。',
    setup: { mine: [{ card: 'APATHY_2', at: 'hand' }, { card: 'DEATH_3', at: 'hand' }] },
    act: { play: 'APATHY_2' }, partner: ['DEATH_3'], late: true
  },
  {
    id: 'C018', name: 'PLAGUE 3 → WATER 3: 裏返してまとめて戻す', kind: 'setup', protos: ['PLAGUE', 'WATER'],
    how: 'PLAGUE 3 の中段で覆われていない表の札を全部裏 (値2) にし、次の手番に WATER 3 「1ラインの値2の札を全部戻す」で相手の札をまとめて手札に戻す。',
    setup: { mine: [{ card: 'PLAGUE_4', at: 'hand' }, { card: 'WATER_4', at: 'hand' }] },
    act: { play: 'PLAGUE_4' }, partner: ['WATER_4'], late: true
  },
  {
    id: 'C019', name: 'CLARITY 1 + LUCK 2: 山札の一番上を選んでから引く', kind: 'engine', protos: ['CLARITY', 'LUCK'],
    how: 'CLARITY 1 の開始で山札の一番上を見て、小さい札なら捨てる。そのあと LUCK 2 「一番上を捨て、その値の枚数を引く」で大きく引く。',
    setup: { mine: [{ card: 'CLARITY_2', at: 'hand' }, { card: 'LUCK_3', at: 'hand' }] },
    act: { play: 'CLARITY_2' }, partner: ['LUCK_3']
  },
  {
    id: 'C020', name: 'CLARITY 1 + LUCK 4: 山札の一番上を選んでから削除', kind: 'engine', protos: ['CLARITY', 'LUCK'],
    how: 'CLARITY 1 の開始で山札の一番上を見て、狙いの値でなければ捨てる。LUCK 4 「一番上を捨て、その値の札を1枚削除」の的を選べる。',
    setup: { mine: [{ card: 'CLARITY_2', at: 'hand' }, { card: 'LUCK_5', at: 'hand' }] },
    act: { play: 'CLARITY_2' }, partner: ['LUCK_5']
  },
  {
    id: 'C021', name: 'ASSIMILATION 6: 相手の済みラインに積んでリコンパイルさせる', kind: 'engine', protos: ['ASSIMILATION'],
    how: 'ASSIMILATION 6 の終了「デッキの一番上を相手の好きなスタックに裏で」を相手のコンパイル済みのラインに積み、10点を超えさせる。相手は開始で強制的にリコンパイルし、その手番の行動を失う。',
    setup: { mine: [{ card: 'ASSIMILATION_6', at: 'hand' }] },
    act: { play: 'ASSIMILATION_6' }, partner: [], late: true
  },
  {
    id: 'C022', name: 'PLAGUE 1 + PSYCHIC 0: ハンデスで引く (教わった手筋)', kind: 'burst', protos: ['PLAGUE', 'PSYCHIC'], source: 'taught',
    how: '場の PLAGUE 1 の上段で、相手が捨てるたびに1枚引く。PSYCHIC 0 で2枚捨てさせると2枚。',
    setup: { mine: [{ card: 'PLAGUE_2', at: 'field' }, { card: 'PSYCHIC_1', at: 'hand' }] },
    act: { play: 'PSYCHIC_1' }, partner: ['PLAGUE_2']
  },
  {
    id: 'C023', name: 'HATE 3 + HATE 1: 削除のたびに引く (教わった手筋)', kind: 'burst', protos: ['HATE'], source: 'taught',
    how: 'HATE 3 の上段「削除したあと1枚引く」を場に置いて HATE 1 (3枚捨てて2枚削除) を撃つ。',
    setup: { mine: [{ card: 'HATE_4', at: 'field' }, { card: 'HATE_2', at: 'hand' }] },
    act: { play: 'HATE_2' }, partner: ['HATE_4']
  },
  {
    id: 'C024', name: 'GRAVITY 4 → DARKNESS 2: 裏向きを集めて4点ずつ', kind: 'setup', protos: ['GRAVITY', 'DARKNESS'],
    how: 'DARKNESS 2 の上段「このスタックの裏向きは値4」。DARKNESS 2 を出しておき、裏向きをそのラインへ寄せる (GRAVITY 4 は GRAVITY のラインへ寄せるので、DARKNESS 2 を GRAVITY のラインに持ち込む形)。ここでは DARKNESS 2 の上に裏向きを重ねていく手順を測る。',
    setup: { mine: [{ card: 'DARKNESS_3', at: 'hand' }, { card: 'DARKNESS_5', at: 'hand' }] },
    act: { play: 'DARKNESS_3' }, partner: ['DARKNESS_5']
  }
  ,
  {
    id: 'C025', name: 'CLARITY 1 を先に置いて、次の手番に覆って3枚引く', kind: 'setup', protos: ['CLARITY'],
    how: 'CLARITY 1 の下段「覆われることになったとき: 先に3枚引く」。いま表で出しておき、次の手番に CLARITY の札を重ねて3枚引く。',
    setup: { mine: [{ card: 'CLARITY_2', at: 'hand' }, { card: 'CLARITY_5', at: 'hand' }] },
    act: { play: 'CLARITY_2' }, partner: ['CLARITY_5']
  },
  {
    id: 'C026', name: 'HATE 4 を先に置いて、覆って相手の覆われた札を消す', kind: 'setup', protos: ['HATE'],
    how: 'HATE 4 の下段「覆われることになったとき: 先にこのラインの値が最も小さい覆われた札を1枚削除」。相手の覆われた札も的になる。',
    setup: { mine: [{ card: 'HATE_5', at: 'hand' }, { card: 'HATE_3', at: 'hand' }] },
    act: { play: 'HATE_5' }, partner: ['HATE_3'], late: true
  },
  {
    id: 'C027', name: 'DARKNESS 2 + WATER 1: 撒いた裏向きを4点に', kind: 'burst', protos: ['DARKNESS', 'WATER'],
    how: 'DARKNESS 2 を表で置いたラインに、WATER 1 の「デッキの上を他の各ラインに裏向き」で裏向きを足すと、それぞれ4点。',
    setup: { mine: [{ card: 'DARKNESS_3', at: 'field' }, { card: 'WATER_2', at: 'hand' }] },
    act: { play: 'WATER_2' }, partner: ['DARKNESS_3']
  },
  {
    id: 'C028', name: 'DARKNESS 2 + LIFE 0: 撒いた裏向きを4点に', kind: 'burst', protos: ['DARKNESS', 'LIFE'],
    how: 'LIFE 0 の「カードのある各ラインにデッキの上を裏向き」で DARKNESS 2 のラインにも裏向きが入り、4点になる。',
    setup: { mine: [{ card: 'DARKNESS_3', at: 'field' }, { card: 'LIFE_1', at: 'hand' }] },
    act: { play: 'LIFE_1' }, partner: ['DARKNESS_3']
  },
  {
    id: 'C029', name: 'SMOKE 2 + SMOKE 0: 裏向きを撒いて合計を上げる', kind: 'burst', protos: ['SMOKE'],
    how: 'SMOKE 2 の上段「このラインの裏向き1枚ごとに合計+1」。SMOKE 0 で裏向きのある各ラインに裏向きを撒く。',
    setup: { mine: [{ card: 'SMOKE_3', at: 'field' }, { card: 'SMOKE_1', at: 'hand' }] },
    act: { play: 'SMOKE_1' }, partner: ['SMOKE_3']
  },
  {
    id: 'C030', name: 'MIRROR 2: 相手の札とスタックを入れ替えてコンパイル', kind: 'burst', protos: ['MIRROR'],
    how: 'MIRROR 2 「自分のスタック1つを別のスタックと入れ替える」で、点数の高いスタックを相手の低いラインへ移してコンパイルを通す。',
    setup: { mine: [{ card: 'MIRROR_3', at: 'hand' }] },
    act: { play: 'MIRROR_3' }, partner: [], late: true
  }
  ,
  /* ---------- 3枚の組: 噛み合いが見えた2枚に、もう1枚を足す ---------- */
  {
    id: 'C031', name: 'WAR 0 + CHAOS 0 + HATE 3: 開始のたびに削除して引く', kind: 'engine', protos: ['WAR', 'CHAOS', 'HATE'],
    how: 'WAR 0 と CHAOS 0 が場にあると毎手番の開始で削除が起きる。HATE 3 の上段「削除したあと1枚引く」を足すと、その削除ごとに1枚引く。',
    setup: { mine: [{ card: 'WAR_1', at: 'field' }, { card: 'CHAOS_1', at: 'field' }, { card: 'HATE_4', at: 'hand' }] },
    act: { play: 'HATE_4' }, partner: ['WAR_1', 'CHAOS_1'],
    note: '入れる前 (master) の ORACLE は逃している得 +4.1 ±0.8 (303盤面): 自分の札で WAR 0・CHAOS 0 を覆って回しを潰していた。揃えに行く手筋 (M01) を入れて +2.3 ±0.8'
  },
  {
    id: 'C032', name: 'WAR 0 + CHAOS 0 + MIRROR 4: 開始のたびに削除と2枚', kind: 'engine', protos: ['WAR', 'CHAOS', 'MIRROR'],
    how: 'CHAOS 0 の開始で相手が引くたび、WAR 0 で1枚削除、MIRROR 4 (相手が引いたあと1枚引く) で1枚引く。',
    setup: { mine: [{ card: 'WAR_1', at: 'field' }, { card: 'CHAOS_1', at: 'field' }, { card: 'MIRROR_5', at: 'hand' }] },
    act: { play: 'MIRROR_5' }, partner: ['WAR_1', 'CHAOS_1'],
    note: '入れる前 (master) の ORACLE は逃している得 +5.0 ±0.8 (303盤面)。揃えに行く手筋 (M01) を入れて +0.9 ±0.7'
  },
  {
    id: 'C033', name: 'PLAGUE 1 + COURAGE 0 + CORRUPTION 2: 終了のたびに2枚捨てさせて2枚引く', kind: 'engine', protos: ['PLAGUE', 'COURAGE', 'CORRUPTION'],
    how: 'COURAGE 0 の終了で1枚捨てると、COURAGE 0 自身と CORRUPTION 2 の上段で相手が2枚捨て、PLAGUE 1 の上段でこちらが2枚引く。',
    setup: { mine: [{ card: 'PLAGUE_2', at: 'field' }, { card: 'COURAGE_1', at: 'field' }, { card: 'CORRUPTION_3', at: 'hand' }] },
    act: { play: 'CORRUPTION_3' }, partner: ['PLAGUE_2', 'COURAGE_1']
  },
  {
    id: 'C034', name: 'ICE 1 + PLAGUE 1 + WAR 3: 置かせるたびに引いて置き返す', kind: 'engine', protos: ['ICE', 'PLAGUE', 'WAR'],
    how: 'ICE 1 のラインに相手が出すと相手が1枚捨て、PLAGUE 1 で1枚引き、WAR 3 で裏で1枚出せる。',
    setup: { mine: [{ card: 'ICE_1', at: 'field' }, { card: 'PLAGUE_2', at: 'field' }, { card: 'WAR_4', at: 'hand' }] },
    act: { play: 'WAR_4' }, partner: ['ICE_1', 'PLAGUE_2']
  },
  {
    id: 'C035', name: 'WAR 0 + LOVE 2 + HATE 3: 引かせて消して引く', kind: 'burst', protos: ['WAR', 'LOVE', 'HATE'],
    how: 'LOVE 2 で相手が引き、WAR 0 で削除、HATE 3 で1枚引く。LOVE 2 のリフレッシュとあわせて手札が大きく増える。',
    setup: { mine: [{ card: 'WAR_1', at: 'field' }, { card: 'HATE_4', at: 'field' }, { card: 'LOVE_2', at: 'hand' }] },
    act: { play: 'LOVE_2' }, partner: ['WAR_1', 'HATE_4']
  },
  /* ---------- 4回目: まだ挙げていなかった札の組 (2026-10-22) ---------- */
  {
    id: 'C036', name: 'FEAR 0 + LIGHT 0: 相手の札を起こさずに引く', kind: 'burst', protos: ['FEAR', 'LIGHT'],
    how: 'FEAR 0 の上段「あなたの手番中、相手の中段はないものとして扱う」の間に LIGHT 0 で相手の裏向きを反転させると、相手の中段を撃たせずに、その値の枚数を引ける。',
    setup: { mine: [{ card: 'FEAR_1', at: 'field' }, { card: 'LIGHT_1', at: 'hand' }] },
    act: { play: 'LIGHT_1' }, partner: ['FEAR_1']
  },
  {
    id: 'C037', name: 'CORRUPTION 1 + FEAR 2: 戻した札を山札の上へ', kind: 'burst', protos: ['CORRUPTION', 'FEAR'],
    how: 'CORRUPTION 1 の下段で、相手の手札に戻る札は代わりに相手のデッキの一番上に裏向きで置かれる。FEAR 2 で相手の札を戻すと、相手は手札を増やせず、次のドローがその札になる。',
    setup: { mine: [{ card: 'CORRUPTION_2', at: 'field' }, { card: 'FEAR_3', at: 'hand' }] },
    act: { play: 'FEAR_3' }, partner: ['CORRUPTION_2']
  },
  {
    id: 'C038', name: 'CORRUPTION 1 + FEAR 2 + LOVE 1: 相手の札を奪う', kind: 'burst', protos: ['CORRUPTION', 'FEAR', 'LOVE'],
    how: 'CORRUPTION 1 の下で FEAR 2 が戻した相手の札は、相手のデッキの一番上に乗る。続けて LOVE 1 (相手のデッキの一番上を引く) でその札を自分の手札にする。',
    setup: { mine: [{ card: 'CORRUPTION_2', at: 'field' }, { card: 'FEAR_3', at: 'hand' }, { card: 'LOVE_1', at: 'hand' }] },
    act: { play: 'FEAR_3' }, partner: ['CORRUPTION_2']
  },
  {
    id: 'C039', name: 'WAR 1 + PEACE 4: 相手のリフレッシュで引き直す', kind: 'engine', protos: ['WAR', 'PEACE'],
    how: 'WAR 1 の下段「相手がリフレッシュしたあと: 任意の枚数捨ててリフレッシュ」。相手の手番中に捨てるので PEACE 4 の下段で1枚多く引ける。',
    setup: { mine: [{ card: 'WAR_2', at: 'field' }, { card: 'PEACE_4', at: 'hand' }] },
    act: { play: 'PEACE_4' }, partner: ['WAR_2']
  },
  {
    id: 'C040', name: 'ASSIMILATION 1 + LOVE 2: リフレッシュで相手の山札を引く', kind: 'burst', protos: ['ASSIMILATION', 'LOVE'],
    how: 'ASSIMILATION 1 の下段「誰かがリフレッシュしたあと: 相手のデッキの一番上を引き、手札1枚を相手の捨て札へ」。LOVE 2 のリフレッシュで起こす。',
    setup: { mine: [{ card: 'ASSIMILATION_2', at: 'field' }, { card: 'LOVE_2', at: 'hand' }] },
    act: { play: 'LOVE_2' }, partner: ['ASSIMILATION_2']
  },
  {
    id: 'C041', name: 'ASSIMILATION 1 + WAR 1: 相手のリフレッシュで2回奪う', kind: 'engine', protos: ['ASSIMILATION', 'WAR'],
    how: '相手がリフレッシュすると ASSIMILATION 1 が起き、WAR 1 でこちらもリフレッシュしてもう一度起きる。',
    setup: { mine: [{ card: 'WAR_2', at: 'field' }, { card: 'ASSIMILATION_2', at: 'hand' }] },
    act: { play: 'ASSIMILATION_2' }, partner: ['WAR_2']
  },
  {
    id: 'C042', name: 'CORRUPTION 6 + CORRUPTION 2 + PLAGUE 1: 終了のたびに捨てさせて引く', kind: 'engine', protos: ['CORRUPTION', 'PLAGUE'],
    how: 'CORRUPTION 6 の終了で1枚捨てると、CORRUPTION 2 の上段で相手が1枚捨て、PLAGUE 1 の上段で1枚引く。3枚とも上段なので覆われていても効く。',
    setup: { mine: [{ card: 'CORRUPTION_6', at: 'field' }, { card: 'PLAGUE_2', at: 'field' }, { card: 'CORRUPTION_3', at: 'hand' }] },
    act: { play: 'CORRUPTION_3' }, partner: ['PLAGUE_2']
  },
  /* ---------- PSYCHIC 1 のロックで相手が裏向きしか出せない間の取り立て ---------- */
  {
    id: 'C043', name: '覆われた PSYCHIC 1 + PLAGUE 4: 出させた裏向きを毎手番消させる', kind: 'lock', protos: ['PSYCHIC', 'PLAGUE'],
    how: '覆われた PSYCHIC 1 で相手は裏向きでしか出せない。PLAGUE 4 の終了「相手は自分の裏向きを1枚削除」で、出した札を毎手番1枚ずつ失わせる。',
    setup: { mine: [{ card: 'PSYCHIC_2', at: 'field', cover: true }, { card: 'PLAGUE_5', at: 'hand' }] },
    act: { play: 'PLAGUE_5' }, partner: ['PSYCHIC_2']
  },
  {
    id: 'C044', name: '覆われた PSYCHIC 1 + ASSIMILATION 0: 裏向きを奪う', kind: 'lock', protos: ['PSYCHIC', 'ASSIMILATION'],
    how: 'ロックの間は相手の札がみな裏向きなので、ASSIMILATION 0 (相手の裏向きを1枚手札に加える) の的が増える。',
    setup: { mine: [{ card: 'PSYCHIC_2', at: 'field', cover: true }, { card: 'ASSIMILATION_1', at: 'hand' }] },
    act: { play: 'ASSIMILATION_1' }, partner: ['PSYCHIC_2']
  },
  {
    id: 'C045', name: '覆われた PSYCHIC 1 + WATER 3: 裏向き (値2) をまとめて戻す', kind: 'lock', protos: ['PSYCHIC', 'WATER'],
    how: '裏向きの札は値2。ロックで相手の札が裏向きばかりになったラインに WATER 3 (値2の札をすべて戻す) を撃つ。',
    setup: { mine: [{ card: 'PSYCHIC_2', at: 'field', cover: true }, { card: 'WATER_4', at: 'hand' }] },
    act: { play: 'WATER_4' }, partner: ['PSYCHIC_2'], late: true
  },
  {
    id: 'C046', name: '覆われた PSYCHIC 1 + DEATH 2: 裏向き (値2) をまとめて消す', kind: 'lock', protos: ['PSYCHIC', 'DEATH'],
    how: 'ロックで相手の札が裏向き (値2) ばかりのラインに DEATH 2 (値1か2の札をすべて削除) を撃つ。',
    setup: { mine: [{ card: 'PSYCHIC_2', at: 'field', cover: true }, { card: 'DEATH_3', at: 'hand' }] },
    act: { play: 'DEATH_3' }, partner: ['PSYCHIC_2'], late: true
  },
  {
    id: 'C047', name: 'SMOKE 2 + LIGHT 3: 裏向きを寄せて点にする', kind: 'burst', protos: ['SMOKE', 'LIGHT'],
    how: 'LIGHT 3 (このラインの裏向きをすべて他の1ラインへ) で、SMOKE 2 (このラインの裏向き1枚ごとに +1) のラインに裏向きを寄せる。',
    setup: { mine: [{ card: 'SMOKE_3', at: 'field' }, { card: 'LIGHT_4', at: 'hand' }] },
    act: { play: 'LIGHT_4' }, partner: ['SMOKE_3'], late: true
  },
  /* ---------- 相手にリフレッシュさせる・覆いをどけて撃ち直す (2026-10-22) ---------- */
  {
    id: 'C048', name: 'PLAGUE 2 + WAR 1: 相手の手札を枯らしてこちらも引き直す', kind: 'burst', protos: ['PLAGUE', 'WAR'],
    how: 'PLAGUE 2 で相手の手札を空にすると相手は次の手番にリフレッシュするしかない。WAR 1 の下段「相手がリフレッシュしたあと: 任意の枚数捨ててリフレッシュ」でこちらも手札を5枚に戻す。',
    setup: { mine: [{ card: 'WAR_2', at: 'field' }, { card: 'PLAGUE_3', at: 'hand' }] },
    act: { play: 'PLAGUE_3' }, partner: ['WAR_2']
  },
  {
    id: 'C049', name: 'PLAGUE 2 + ASSIMILATION 1: 相手にリフレッシュさせて奪う', kind: 'burst', protos: ['PLAGUE', 'ASSIMILATION'],
    how: 'PLAGUE 2 で相手にリフレッシュを強いると、ASSIMILATION 1 の下段 (誰かがリフレッシュしたあと: 相手のデッキの一番上を引き、1枚を相手の捨て札へ) が起きる。',
    setup: { mine: [{ card: 'ASSIMILATION_2', at: 'field' }, { card: 'PLAGUE_3', at: 'hand' }] },
    act: { play: 'PLAGUE_3' }, partner: ['ASSIMILATION_2']
  },
  {
    id: 'C050', name: 'CLARITY 2 + PSYCHIC 1: ロックの札を探して出す', kind: 'setup', protos: ['CLARITY', 'PSYCHIC'],
    how: 'CLARITY 2 はデッキから値1の札を引き、値1の札を1枚プレイする。PSYCHIC 1 を引いて出せば、ロックの入口を1手で作れる。',
    setup: { mine: [{ card: 'PSYCHIC_2', at: 'deckTop' }, { card: 'CLARITY_3', at: 'hand' }] },
    act: { play: 'CLARITY_3' }, partner: ['PSYCHIC_2']
  },
  {
    id: 'C051', name: 'DARKNESS 2 + SMOKE 4: 裏向きを寄せて4点にする', kind: 'burst', protos: ['DARKNESS', 'SMOKE'],
    how: 'DARKNESS 2 のスタックの裏向きは各4点。SMOKE 4 (覆われている裏向きを1枚移動) でその裏向きを DARKNESS 2 のスタックに寄せる。',
    setup: { mine: [{ card: 'DARKNESS_3', at: 'field' }, { card: 'SMOKE_5', at: 'hand' }] },
    act: { play: 'SMOKE_5' }, partner: ['DARKNESS_3'], late: true
  },
  {
    id: 'C052', name: 'SPEED 3 + DEATH 0: 覆いをどけて撃ち直す', kind: 'burst', protos: ['SPEED', 'DEATH'],
    how: 'SPEED 3 の中段「あなたの他のカードを1枚移動」で、覆われた DEATH 0 の上の札をどけると DEATH 0 の中段 (他の各ラインを1枚ずつ削除) がもう一度撃てる。',
    setup: { mine: [{ card: 'DEATH_1', at: 'field', cover: true }, { card: 'SPEED_4', at: 'hand' }] },
    act: { play: 'SPEED_4' }, partner: ['DEATH_1']
  },
  {
    id: 'C053', name: 'ICE 1 + ICE 2: 重ねてすぐどき、下を撃ち直す', kind: 'burst', protos: ['ICE'],
    how: 'ICE 1 の中段「このカードを移動できる」。ICE 2 の上に出してすぐ別のラインへ動けば、ICE 2 の中段 (他のカードを1枚移動) がもう一度撃てる。',
    setup: { mine: [{ card: 'ICE_2', at: 'field' }, { card: 'ICE_1', at: 'hand' }] },
    act: { play: 'ICE_1', line: 'onto:ICE_2' }, partner: ['ICE_2']
  }
];

/* ---------- 自動で挙げる候補: 「〜したあと」の札 × その出来事を起こす札 ----------
   場に置いた「〜したあと」の札 (聞く側) に、手札から出来事を起こす札 (起こす側) を表で出す。
   起こす側の出来事が開始・終了・「〜したあと」の中にあれば毎手番起きる (engine)、中段だけなら1回 (burst)。
   手で挙げた候補と同じ組は除く */
(function autoCandidates() {
  const fs = require('node:fs');
  const path = require('node:path');
  const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {};
  for (const p of cards.protocols) for (const c of p.cards) { proto[c.id] = p.name; value[c.id] = c.value; }
  const name = (id) => proto[id] + ' ' + value[id];
  const text = (id, slot) => String((effects[id][slot] || {})._text || '').replace(/。$/, '');
  const LISTEN = {
    afterOppDraw: '相手が引いたあと', afterOppDiscard: '相手が捨てたあと', afterYouDelete: '削除したあと',
    afterYouDiscard: '捨てたあと', afterYouDraw: '引いたあと', afterYouShuffle: 'シャッフルしたあと', afterYouRefresh: 'リフレッシュしたあと'
  };
  const produces = (o) => {
    const out = [];
    if ((o.op === 'draw' || o.op === 'drawByCount') && o.player === 'opp') out.push('afterOppDraw');
    if (o.op === 'oppDrawsFromYourDeck') out.push('afterOppDraw');
    if ((o.op === 'discard' || o.op === 'randomDiscard') && o.player === 'opp') out.push('afterOppDiscard');
    if (o.op === 'bothDiscardAll') out.push('afterOppDiscard', 'afterYouDiscard');
    if (o.op === 'delete') out.push('afterYouDelete');
    if (o.op === 'discard' && !o.player) out.push('afterYouDiscard');
    if ((o.op === 'draw' || o.op === 'drawByCount' || o.op === 'drawByValue' || o.op === 'drawDynamic') && !o.player) out.push('afterYouDraw');
    if (o.op === 'refresh') out.push('afterYouDraw', 'afterYouRefresh');
    if (o.op === 'shuffleTrashIntoDeck' || o.op === 'searchDeck') out.push('afterYouShuffle');
    return out;
  };
  const walk = (o, acc) => { if (Array.isArray(o)) o.forEach(v => walk(v, acc)); else if (o && typeof o === 'object') { if (o.op) acc.push(o); for (const v of Object.values(o)) walk(v, acc); } };
  const listeners = [], producers = [];
  for (const [id, eff] of Object.entries(effects)) {
    if (!proto[id]) continue;
    for (const slot of ['upper', 'lower']) {
      const tr = eff[slot] && eff[slot].trigger;
      if (tr && LISTEN[tr.on]) listeners.push({ id, slot, on: tr.on });
    }
    for (const slot of ['upper', 'middle', 'lower']) {
      const s = eff[slot];
      if (!s) continue;
      const acc = []; walk(s.trigger ? s.trigger.ops : s.ops, acc);
      const evs = new Set(acc.flatMap(produces));
      const repeat = !!s.trigger;
      for (const ev of evs) producers.push({ id, slot, ev, repeat, trig: s.trigger && s.trigger.on });
    }
  }
  /* 測って噛み合いが見えた組は、仕組みを読める文に書き直す (自動の文は聞く側の札の1つの誘発しか書かない) */
  const HOW = {
    'LOVE_2+WAR_1': 'WAR 0 を一番上に置いたまま LOVE 2 を出す。LOVE 2 の「相手は1枚引く」で WAR 0 の下段 (相手が引いたあと: 1枚削除できる) が起きる。LOVE 2 で相手に渡す1枚を、削除で取り返す。',
    'FEAR_2+WAR_1': 'WAR 0 を一番上に置いたまま FEAR 1 を出す。FEAR 1 で相手は手札を全部捨てて (枚数−1) 枚引き直す。その引き直しで WAR 0 の削除が起きる。',
    'ASSIMILATION_4+WAR_1': 'WAR 0 を一番上に置いたまま ASSIMILATION 4 を出す。「相手はあなたのデッキの一番上を引く」で WAR 0 の削除が起きる。',
    'PEACE_1+SPIRIT_4': 'SPIRIT 3 (引いたあと: 覆われていても移動できる) を場に置き、PEACE 1 を出す。PEACE 1 の終了「手札が0枚なら1枚引く」で SPIRIT 3 を動かせる。',
    'CORRUPTION_6+SPIRIT_4': 'SPIRIT 3 を場に置き、CORRUPTION 6 を出す。',
    'COURAGE_1+WAR_4': 'WAR 3 (相手が捨てたあと: 裏で1枚プレイできる) を一番上に置き、COURAGE 0 を出す。COURAGE 0 の終了「1枚捨ててよい。そうしたら相手も1枚捨てる」で、毎手番 WAR 3 の追加プレイが入る。'
  };
  const have = new Set(module.exports.map(c => [...c.setup.mine.map(p => p.card)].sort().join('+')));
  let n = 0;
  for (const L of listeners) for (const P of producers) {
    if (P.ev !== L.on || P.id === L.id) continue;
    /* 同じプロトコルだと起こす側が聞く側を覆う。下段の「〜したあと」は覆われると止まるので組にならない */
    if (proto[P.id] === proto[L.id] && L.slot === 'lower') continue;
    /* 聞く側が自分で起こした出来事に乗る札 (WAR 0 の削除で HATE 3 が引く等) は、起こす側が聞く側のときに限る */
    const key = [L.id, P.id].sort().join('+');
    if (have.has(key)) continue;
    have.add(key);
    n++;
    module.exports.push({
      id: 'A' + String(n).padStart(3, '0'),
      name: name(L.id) + ' + ' + name(P.id),
      kind: P.repeat ? 'engine' : 'burst', auto: true,
      protos: [...new Set([proto[L.id], proto[P.id]])],
      how: HOW[key] || name(L.id) + ' (' + text(L.id, L.slot) + ') を場に置き、' + name(P.id) + ' (' + text(P.id, P.slot) + ') を出す。' + (P.repeat ? '場に残れば毎手番起きる。' : '出した手番に1回起きる。'),
      setup: { mine: [{ card: L.id, at: 'field' }, { card: P.id, at: 'hand' }] },
      act: { play: P.id }, partner: [L.id]
    });
  }
})();
