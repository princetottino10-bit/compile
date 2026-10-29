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
  },
  /* ---------- 噛み合いが確かな組に3枚目を足す (partner = 足した札) ---------- */
  {
    id: 'C054', name: 'WAR 0 + LOVE 6 + MIRROR 4: 引かせて消して引く', kind: 'burst', protos: ['WAR', 'LOVE', 'MIRROR'],
    how: 'LOVE 6 で相手が2枚引くと、WAR 0 で削除、MIRROR 4 (相手が引いたあと: 1枚引く) でこちらも引く。',
    setup: { mine: [{ card: 'WAR_1', at: 'field' }, { card: 'MIRROR_5', at: 'field' }, { card: 'LOVE_6', at: 'hand' }] },
    act: { play: 'LOVE_6' }, partner: ['MIRROR_5']
  },
  {
    id: 'C055', name: 'WAR 0 + LOVE 6 + HATE 3: 引かせて消して引く', kind: 'burst', protos: ['WAR', 'LOVE', 'HATE'],
    how: 'LOVE 6 で相手が引き、WAR 0 で削除、HATE 3 (削除したあと: 1枚引く) で1枚引く。',
    setup: { mine: [{ card: 'WAR_1', at: 'field' }, { card: 'HATE_4', at: 'field' }, { card: 'LOVE_6', at: 'hand' }] },
    act: { play: 'LOVE_6' }, partner: ['HATE_4']
  },
  {
    id: 'C056', name: 'WAR 0 + FEAR 1 + HATE 3', kind: 'burst', protos: ['WAR', 'FEAR', 'HATE'],
    how: 'FEAR 1 の引き直しで WAR 0 の削除が起き、HATE 3 で1枚引く。',
    setup: { mine: [{ card: 'WAR_1', at: 'field' }, { card: 'HATE_4', at: 'field' }, { card: 'FEAR_2', at: 'hand' }] },
    act: { play: 'FEAR_2' }, partner: ['HATE_4']
  },
  {
    id: 'C057', name: 'PLAGUE 1 + COURAGE 0 + WAR 3: 捨てさせるたびに裏で出す', kind: 'engine', protos: ['PLAGUE', 'COURAGE', 'WAR'],
    how: 'COURAGE 0 の終了で相手に捨てさせると、PLAGUE 1 で1枚引き、WAR 3 の下段で裏向きを1枚出せる。',
    setup: { mine: [{ card: 'PLAGUE_2', at: 'field' }, { card: 'COURAGE_1', at: 'field' }, { card: 'WAR_4', at: 'hand' }] },
    act: { play: 'WAR_4' }, partner: ['COURAGE_1']
  },
  {
    id: 'C058', name: 'CORRUPTION 6 + CORRUPTION 2 + WAR 3: 終了のたびに捨てさせて裏で出す', kind: 'engine', protos: ['CORRUPTION', 'WAR'],
    how: 'CORRUPTION 6 の終了で捨てると CORRUPTION 2 で相手も捨て、WAR 3 の下段で裏向きを1枚出せる。',
    setup: { mine: [{ card: 'CORRUPTION_6', at: 'field' }, { card: 'CORRUPTION_3', at: 'field' }, { card: 'WAR_4', at: 'hand' }] },
    act: { play: 'WAR_4' }, partner: ['CORRUPTION_6']
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

/* ---------- 状態を作る札 × その状態で得する札 (S001〜、2026-10-22) ----------
   ユーザー「fire3 と plague4 みたいなのは見つけれないんか？」。「〜したあと」の誘発 (A001〜) では拾えない、
   盤面の状態 (相手の裏向き・自分のラインの裏向き) を作る札と、その状態を取り立てる札の組を総当たりにする */
(function stateCandidates() {
  const fs = require('node:fs');
  const path = require('node:path');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {};
  for (const p of cards.protocols) for (const c of p.cards) { proto[c.id] = p.name; value[c.id] = c.value; text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / '); }
  const name = (id) => proto[id] + ' ' + value[id];
  /* end: 終了時に効く札 (場に置いておく)。それ以外は出した手番の中段で効く */
  const GROUPS = [
    { state: '相手の裏向き',
      makers: ['FIRE_4', 'APATHY_4', 'DARKNESS_2', 'METAL_1', 'LIFE_2', 'WATER_1', 'GRAVITY_3', 'PLAGUE_4', 'MIRROR_4', 'LOVE_4', 'PEACE_3', 'WAR_3', 'LIGHT_1', 'SPIRIT_3', 'FEAR_1', 'ASSIMILATION_6', 'GRAVITY_6'],
      payoffs: ['PLAGUE_5', 'DEATH_4', 'ASSIMILATION_1', 'SPEED_5', 'DARKNESS_5', 'WATER_4', 'DEATH_3'] },
    { state: '自分のラインの裏向き',
      makers: ['WATER_2', 'LIFE_1', 'SMOKE_1', 'SMOKE_4', 'DARKNESS_4', 'PEACE_2', 'TIME_4', 'ASSIMILATION_3', 'LIGHT_4', 'GRAVITY_4', 'DARKNESS_5', 'SMOKE_5'],
      payoffs: ['APATHY_1', 'SMOKE_3', 'DARKNESS_3'] }
  ];
  const END = new Set(['FIRE_4', 'ASSIMILATION_6', 'PLAGUE_5', 'ASSIMILATION_3']);
  const FIELD = new Set(['PLAGUE_5', 'APATHY_1', 'SMOKE_3', 'DARKNESS_3']);
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  let n = 0;
  for (const g of GROUPS) for (const P of g.payoffs) for (const M of g.makers) {
    if (M === P) continue;
    const key = [M, P].sort().join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    /* 終了時に作る札は場に置いて、取り立てる札を出す。それ以外は作る札を出す (取り立てる札は場か手札) */
    const makerOnField = END.has(M);
    const mine = makerOnField
      ? [{ card: M, at: 'field' }, { card: P, at: FIELD.has(P) && P !== 'PLAGUE_5' ? 'field' : 'hand' }]
      : [{ card: P, at: FIELD.has(P) ? 'field' : 'hand' }, { card: M, at: 'hand' }];
    const act = makerOnField && mine[1].at === 'hand' ? P : M;
    module.exports.push({
      id: 'S' + String(++n).padStart(3, '0'), name: name(M) + ' → ' + name(P), kind: END.has(M) || FIELD.has(P) ? 'engine' : 'burst', auto: true, source: 'state',
      protos: [...new Set([proto[M], proto[P]])],
      how: name(M) + ' (' + text[M] + ') で' + g.state + 'を作り、' + name(P) + ' (' + text[P] + ') で取り立てる。',
      setup: { mine }, act: { play: act }, partner: [act === M ? P : M], late: true
    });
  }
})();

/* ---------- 上段を活かす組 (U001〜、2026-10-22) ----------
   ユーザー「上段効果を活かしたコンボは？」。上段は覆われても表なら効く。
   (1) 覆われていても動ける上段 (SPIRIT 3・TIME 2・ICE 3・UNITY 1) で、覆われることになったときに効く札の上へ動いて下段を起こす
   (2) 効き続ける上段 (MIRROR 0・DIVERSITY 3・FEAR 0・COURAGE 0) と、その条件を満たす札 */
(function upperCandidates() {
  const fs = require('node:fs');
  const path = require('node:path');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {};
  for (const p of cards.protocols) for (const c of p.cards) { proto[c.id] = p.name; value[c.id] = c.value; text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / '); }
  const name = (id) => proto[id] + ' ' + value[id];
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  let n = 0;
  const push = (c) => {
    const key = c.setup.mine.map(p => p.card).sort().join('+');
    if (seen.has(key)) return;
    seen.add(key);
    module.exports.push({ id: 'U' + String(++n).padStart(3, '0'), auto: true, source: 'upper', late: true, ...c });
  };
  for (const M of ['SPIRIT_4', 'TIME_3', 'ICE_3', 'UNITY_2']) for (const T of ['FIRE_1', 'LIFE_4', 'HATE_5', 'CLARITY_2', 'APATHY_3']) {
    push({
      name: name(M) + ' (覆われて動く) → ' + name(T) + ' (覆われると効く)', kind: 'engine', protos: [...new Set([proto[M], proto[T]])],
      how: name(M) + ' (' + text[M] + ') は覆われていても動ける。' + name(T) + ' (' + text[T] + ') の上へ動けば、覆われたときの下段が起きる。',
      setup: { mine: [{ card: M, at: 'field', cover: true }, { card: T, at: 'hand' }] }, act: { play: T }, partner: [M]
    });
  }
  const PASSIVE = [
    ['MIRROR_1', 'ASSIMILATION_6', '終了時に相手側のスタックへ裏向きを置くので、MIRROR 0 のラインに置けば相手の札が増えて +1 ずつ'],
    ['DIVERSITY_3', 'CHAOS_4', 'CHAOS 3 は対応なしで出せるので、DIVERSITY 3 のスタックに別のプロトコルの表向きを置ける (+2)'],
    ['FEAR_1', 'DEATH_1', 'DEATH 0 で一番上を消すと相手の下の札が現れるが、FEAR 0 の上段で自分の手番中は相手の中段が起きない'],
    ['FEAR_1', 'HATE_3', 'HATE 2 で相手の一番上を消しても、FEAR 0 の上段で現れた札の中段が起きない'],
    ['FEAR_1', 'HATE_1', 'HATE 0 で相手の一番上を消しても、FEAR 0 の上段で現れた札の中段が起きない'],
    ['COURAGE_1', 'PEACE_1', 'PEACE 1 で両者の手札を捨てると、COURAGE 0 の上段 (開始: 手札が無ければ1枚引く) と PEACE 1 の終了で引ける']
  ];
  for (const [U, P, why] of PASSIVE) push({
    name: name(U) + ' (上段) + ' + name(P), kind: 'engine', protos: [...new Set([proto[U], proto[P]])],
    how: name(U) + ' (' + text[U] + ')。' + why + '。',
    setup: { mine: [{ card: U, at: 'field' }, { card: P, at: 'hand' }] }, act: { play: P, ...(P === 'CHAOS_4' ? { line: 'DIVERSITY' } : {}) }, partner: [U]
  });
})();

/* ---------- 中段を撃ち直す組 (F001〜・X001〜、2026-10-28) ----------
   中段は表になったとき・覆いが外れたときにもう一度入る。
   (F) 自分の裏向きの札を表にする札 × 中段の強い札 (裏で置いておき、表にして撃つ)
   (X) 自分の一番上の札をどける札 × 覆われた中段の強い札 (覆いをどけて撃ち直す)
   どちらも、効果の対象は撃つ札 (F) / その覆い (X) に決め打つ。白紙の腕も同じ札を選ぶ */
(function retriggerCandidates() {
  const fs = require('node:fs');
  const path = require('node:path');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {}, byName = {};
  for (const p of cards.protocols) for (const c of p.cards) {
    proto[c.id] = p.name; value[c.id] = c.value; byName[p.name + ' ' + c.value] = c.id;
    text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / ');
  }
  const id = (n) => { if (!byName[n]) throw new Error('no card ' + n); return byName[n]; };
  const name = (d) => proto[d] + ' ' + value[d];
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  const PAYLOAD = ['DEATH 0', 'FIRE 0', 'DARKNESS 0', 'LIGHT 0', 'GRAVITY 1', 'SPIRIT 1', 'FEAR 1', 'PSYCHIC 2', 'WATER 1', 'LIFE 0', 'HATE 0', 'METAL 1', 'SPEED 0', 'LUCK 0'].map(id);
  const FLIP = ['LIFE 2', 'LIFE 1', 'SPIRIT 2', 'METAL 0', 'WATER 0', 'GRAVITY 2', 'LIGHT 2', 'SMOKE 1', 'MIRROR 3', 'WAR 2', 'LOVE 4', 'FEAR 0'].map(id);
  const UNCOVER = ['SPEED 3', 'HATE 2', 'WATER 4', 'CHAOS 2', 'DARKNESS 4', 'SMOKE 4', 'ICE 2', 'GRAVITY 1'].map(id);
  let nf = 0, nx = 0;
  const push = (pre, n, c) => {
    const key = c.setup.mine.map(p => p.card).sort().join('+');
    if (seen.has(key)) return false;
    seen.add(key);
    module.exports.push({ id: pre + String(n).padStart(3, '0'), auto: true, source: 'retrigger', late: true, ...c });
    return true;
  };
  for (const E of FLIP) for (const T of PAYLOAD) {
    if (proto[E] === proto[T]) continue;
    const ok = push('F', nf + 1, {
      name: name(E) + ' で裏の ' + name(T) + ' を表にして撃つ', kind: 'burst', protos: [proto[E], proto[T]],
      how: name(T) + ' (' + text[T] + ') を裏で置いておき、' + name(E) + ' (' + text[E] + ') で表にすると中段が入る。',
      setup: { mine: [{ card: T, at: 'field', faceUp: false }, { card: E, at: 'hand' }] }, act: { play: E }, partner: [T],
      picks: (s, q, P) => {
        const t = P.planted[T];
        if (q.context !== E || !t || !s.cards[t] || s.cards[t].faceUp) return null;
        if (q.kind === 'yesNo') return ['yes'];
        if (q.kind === 'pickCard' && q.candidates.includes(t)) return [t];
        return null;
      }
    });
    if (ok) nf++;
  }
  for (const R of UNCOVER) for (const T of PAYLOAD) {
    if (proto[R] === proto[T]) continue;
    const ok = push('X', nx + 1, {
      name: name(R) + ' で覆いをどけて ' + name(T) + ' を撃ち直す', kind: 'burst', protos: [proto[R], proto[T]],
      how: name(T) + ' (' + text[T] + ') の覆いを ' + name(R) + ' (' + text[R] + ') でどけると、中段がもう一度入る。',
      setup: { mine: [{ card: T, at: 'field', cover: true }, { card: R, at: 'hand' }] }, act: { play: R, line: 'other' }, partner: [T],
      picks: (s, q, P) => {
        const t = P.planted[T];
        if (q.context !== R || !t || !s.cards[t] || q.kind !== 'pickCard') return null;
        const L = s.lines.find(x => x[P.me].includes(t));
        if (!L) return null;
        const st = L[P.me], i = st.indexOf(t);
        const cover = i >= 0 && i < st.length - 1 ? st[i + 1] : null;
        if (cover && q.candidates.includes(cover)) return [cover];
        if (q.candidates.includes(t)) return [t];
        return null;
      }
    });
    if (ok) nx++;
  }
})();

/* ---------- 点を数える上段 × その数を増やす札 (V001〜、2026-10-28) ----------
   CLARITY 0 (手札1枚ごとに +1) に大きく引く札、MIRROR 0 (このラインの相手の札1枚ごとに +1) に相手の札をこのラインへ寄せる札 */
(function valueCandidates() {
  const fs = require('node:fs');
  const path = require('node:path');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {}, byName = {};
  for (const p of cards.protocols) for (const c of p.cards) {
    proto[c.id] = p.name; value[c.id] = c.value; byName[p.name + ' ' + c.value] = c.id;
    text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / ');
  }
  const id = (n) => { if (!byName[n]) throw new Error('no card ' + n); return byName[n]; };
  const name = (d) => proto[d] + ' ' + value[d];
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  let n = 0;
  const G = [
    ['CLARITY 0', ['DARKNESS 0', 'SPIRIT 1', 'FIRE 4', 'METAL 1', 'GRAVITY 1', 'SPEED 1', 'LIGHT 2', 'WATER 2', 'FEAR 1', 'UNITY 2'], '手札が増えるほど CLARITY 0 のラインが伸びる'],
    ['MIRROR 0', ['GRAVITY 6', 'CORRUPTION 0', 'DARKNESS 1', 'PSYCHIC 3', 'SPEED 4', 'DARKNESS 0', 'GRAVITY 2'], '相手の札を MIRROR 0 のラインに増やすと +1 ずつ']
  ];
  for (const [U, list, why] of G) for (const pn of list) {
    const u = id(U), p = id(pn);
    const key = [u, p].sort().join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    /* MIRROR 0 のラインへ寄せる札は MIRROR のラインに出す (GRAVITY 2・GRAVITY 6 は「このライン」) */
    const act = { play: p, ...(U === 'MIRROR 0' && /GRAVITY/.test(pn) ? { line: 'MIRROR' } : {}), ...(pn === 'CORRUPTION 0' ? { line: 'MIRROR', side: 'opp' } : {}) };
    module.exports.push({
      id: 'V' + String(++n).padStart(3, '0'), auto: true, source: 'value', late: true,
      name: U + ' (上段) + ' + pn, kind: 'burst', protos: [...new Set([proto[u], proto[p]])],
      how: U + ' (' + text[u] + ')。' + pn + ' (' + text[p] + ')。' + why + '。',
      setup: { mine: [{ card: u, at: 'field' }, { card: p, at: 'hand' }] }, act, partner: [u]
    });
  }
})();

/* ---------- FIRE 3 で毎手番起こし直す組 (L001〜、2026-10-28) ----------
   FIRE 3 の終了「1枚捨てて1枚反転」は毎手番使える、表にする札。
   (1) 自分で裏返る札 (WATER 0: 中段で自分も裏返る / SPIRIT 1: 開始に捨てるか裏返る / SPEED 3: 終了に動かしたら裏返る) を毎手番表に戻し、中段を毎手番撃つ
   (2) 裏で置いた中段の強い札 (撃ち直しの型) を FIRE 3 で起こす
   対象は決め打ち: FIRE 3 は一番小さい手札を捨てて相方を表にし、SPIRIT 1 の開始は裏返る方を選ぶ */
(function fire3Candidates() {
  const fs = require('node:fs');
  const path = require('node:path');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {}, byName = {};
  for (const p of cards.protocols) for (const c of p.cards) {
    proto[c.id] = p.name; value[c.id] = c.value; byName[p.name + ' ' + c.value] = c.id;
    text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / ');
  }
  const id = (n) => { if (!byName[n]) throw new Error('no card ' + n); return byName[n]; };
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  const F3 = id('FIRE 3');
  let n = 0;
  const targets = [['WATER 0', 'self'], ['SPIRIT 1', 'self'], ['SPEED 3', 'self'],
    ...['LIFE 0', 'LIGHT 0', 'LUCK 0', 'SPEED 0', 'HATE 0', 'GRAVITY 1', 'DARKNESS 0', 'WATER 1', 'DEATH 0'].map(x => [x, 'once'])];
  for (const [tn, how] of targets) {
    const T = id(tn);
    const key = [F3, T].sort().join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    module.exports.push({
      id: 'L' + String(++n).padStart(3, '0'), auto: true, source: 'fire3', late: true,
      name: 'FIRE 3 で ' + tn + ' を' + (how === 'self' ? '毎手番起こし直す' : '裏から起こす'), kind: how === 'self' ? 'engine' : 'burst', protos: [...new Set(['FIRE', proto[T]])],
      how: 'FIRE 3 (' + text[F3] + ') の終了の反転で、裏の ' + tn + ' (' + text[T] + ') を表にする。' + (how === 'self' ? tn + ' は自分で裏返るので、毎手番中段を撃ち直せる。' : ''),
      setup: { mine: [{ card: T, at: 'field', faceUp: false }, { card: F3, at: 'hand' }] }, act: { play: F3 }, partner: [T],
      picks: (s, q, P) => {
        const t = P.planted[T];
        if (!t || !s.cards[t]) return null;
        if (q.context === T && q.kind === 'option') { const i = q.options.indexOf('flip'); return i >= 0 ? [i] : null; }
        if (q.context !== F3 || s.cards[t].faceUp || !s.lines.some(L => L[P.me][L[P.me].length - 1] === t)) return null;
        if (q.kind === 'yesNo') return ['yes'];
        if (q.kind === 'pickHand') { const c = q.candidates.slice().sort((a, b) => P.val(s, a) - P.val(s, b)); return c.length ? [c[0]] : null; }
        if (q.kind === 'pickCard' && q.candidates.includes(t)) return [t];
        return null;
      }
    });
  }
})();

/* ---------- 覆われると効く札 × 札を置く札 (K001〜、2026-10-28) ----------
   FIRE 0・LIFE 3・HATE 4・CLARITY 1 は覆われることになったときに下段が入る。
   1手で自分の札を上に置ける札 (山札の上を裏で撒く LIFE 0・WATER 1、手札から追加で置く SPEED 0・PEACE 2・DARKNESS 3、捨て札から置く TIME 3、山札の上を置く LUCK 1) で覆う。
   置く先を選べるときは、覆われると効く札のラインに決め打つ */
(function coverCandidates() {
  const fs = require('node:fs');
  const path = require('node:path');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {}, byName = {};
  for (const p of cards.protocols) for (const c of p.cards) {
    proto[c.id] = p.name; value[c.id] = c.value; byName[p.name + ' ' + c.value] = c.id;
    text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / ');
  }
  const id = (n) => { if (!byName[n]) throw new Error('no card ' + n); return byName[n]; };
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  let n = 0;
  for (const tn of ['FIRE 0', 'LIFE 3', 'HATE 4', 'CLARITY 1']) for (const pn of ['LIFE 0', 'WATER 1', 'SPEED 0', 'PEACE 2', 'DARKNESS 3', 'TIME 3', 'LUCK 1']) {
    const T = id(tn), P0 = id(pn);
    if (proto[T] === proto[P0]) continue;
    const key = [T, P0].sort().join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    const mine = [{ card: T, at: 'field' }, { card: P0, at: 'hand' }];
    module.exports.push({
      id: 'K' + String(++n).padStart(3, '0'), auto: true, source: 'cover', late: true,
      name: pn + ' で ' + tn + ' を覆う', kind: 'burst', protos: [...new Set([proto[T], proto[P0]])],
      how: tn + ' (' + text[T] + ') を一番上に表で置いておき、' + pn + ' (' + text[P0] + ') で上に札を置いて下段を起こす。',
      setup: { mine }, act: { play: P0, line: 'other' }, partner: [T],
      picks: (s, q, P) => {
        const t = P.planted[T];
        if (!t || q.context !== P0 || q.kind !== 'pickLine') return null;
        const l = s.lines.findIndex(L => L[P.me].includes(t));
        return l >= 0 && q.lines.includes(l) ? [l] : null;
      }
    });
  }
})();

/* ---------- 相手のコンボを崩す札 (Z001〜、2026-10-28) ----------
   相手の場に、確かめたコンボ (回しが動いている形) を植え、こちらは崩す札 (削除・戻す・裏返す・動かす) を1枚出す。
   相方 = 相手のコンボの札 (白紙にすると、ただの同じ値の札に向けて同じ手を打つ)。
   噛み合い = その札がコンボ相手に「ほかの手より余分に」効く分。人が「この組にはこれを当てる」と覚えるためのもの */
(function counterCandidates() {
  const fs = require('node:fs');
  const path = require('node:path');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {}, byName = {};
  for (const p of cards.protocols) for (const c of p.cards) {
    proto[c.id] = p.name; value[c.id] = c.value; byName[p.name + ' ' + c.value] = c.id;
    text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / ');
  }
  const id = (n) => { if (!byName[n]) throw new Error('no card ' + n); return byName[n]; };
  const COMBOS = [
    ['WAR 0 + CHAOS 0', ['WAR 0', 'CHAOS 0']],
    ['FIRE 3 + PLAGUE 4', ['FIRE 3', 'PLAGUE 4']],
    ['WAR 3 + COURAGE 0', ['WAR 3', 'COURAGE 0']],
    ['FIRE 3 + SPIRIT 1', ['FIRE 3', 'SPIRIT 1']],
    ['SPIRIT 3 + PEACE 1', ['SPIRIT 3', 'PEACE 1']],
    ['PLAGUE 1 + COURAGE 0 + CORRUPTION 2', ['PLAGUE 1', 'COURAGE 0', 'CORRUPTION 2']]
  ];
  const ANSWERS = ['HATE 0', 'HATE 2', 'DEATH 0', 'DEATH 4', 'FIRE 2', 'FEAR 2', 'CORRUPTION 1', 'APATHY 3', 'DARKNESS 1', 'METAL 0', 'WAR 2', 'LOVE 4', 'FEAR 3', 'PSYCHIC 3', 'GRAVITY 2', 'LIFE 1'];
  let n = 0;
  for (const [cn, pieces] of COMBOS) for (const an of ANSWERS) {
    const A = id(an), ps = pieces.map(id);
    if (pieces.includes(an)) continue;
    const oppProtos = [...new Set(ps.map(x => proto[x]))];
    module.exports.push({
      id: 'Z' + String(++n).padStart(3, '0'), auto: true, source: 'counter', late: true,
      name: an + ' で相手の ' + cn + ' を崩す', kind: 'counter', protos: [proto[A]], oppProtos,
      how: '相手の ' + cn + ' が回っているときに ' + an + ' (' + text[A] + ') を出す。',
      setup: { mine: [{ card: A, at: 'hand' }], opp: ps.map(x => ({ card: x, at: 'field' })) },
      act: { play: A }, partner: ps.map(x => x + '@opp')
    });
  }
})();

/* ---------- 捨て札・山札の上を使う組 (T001〜、2026-10-28) ----------
   (1) 捨て札を増やす札 × 捨て札から出す札 (TIME 0: 捨て札の1枚をプレイ / TIME 3: 捨て札の1枚を別のラインに裏で)。相方 = 捨て札から出す札 (手札)
   (2) 山札の上をふるう CLARITY 1 (開始: 一番上を公開して捨てられる) × 山札の上の値で効く札 (LUCK 2: 捨てた札の値だけ引く / LUCK 4: 同じ値の札を削除 / LUCK 1: 一番上を裏で出して表にする) */
(function trashCandidates() {
  const fs = require('node:fs');
  const path = require('node:path');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {}, byName = {};
  for (const p of cards.protocols) for (const c of p.cards) {
    proto[c.id] = p.name; value[c.id] = c.value; byName[p.name + ' ' + c.value] = c.id;
    text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / ');
  }
  const id = (n) => { if (!byName[n]) throw new Error('no card ' + n); return byName[n]; };
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  let n = 0;
  const push = (c) => {
    const key = c.setup.mine.map(p => p.card).sort().join('+');
    if (seen.has(key)) return;
    seen.add(key);
    module.exports.push({ id: 'T' + String(++n).padStart(3, '0'), auto: true, source: 'trash', late: true, ...c });
  };
  for (const pn of ['TIME 0', 'TIME 3']) for (const fn of ['TIME 1', 'LUCK 2', 'LUCK 4', 'FIRE 4', 'HATE 1', 'CHAOS 4', 'TIME 4', 'PEACE 1', 'PLAGUE 2']) {
    const P0 = id(pn), F = id(fn);
    if (P0 === F) continue;
    push({
      name: fn + ' で捨て札を増やして ' + pn + ' で出す', kind: 'setup', protos: [...new Set([proto[F], proto[P0]])],
      how: fn + ' (' + text[F] + ') で捨て札を増やし、' + pn + ' (' + text[P0] + ') で捨て札から強い札を出す。',
      setup: { mine: [{ card: P0, at: 'hand' }, { card: F, at: 'hand' }] }, act: { play: F }, partner: [P0]
    });
  }
  const C1 = id('CLARITY 1');
  for (const pn of ['LUCK 2', 'LUCK 4', 'LUCK 1']) {
    const P0 = id(pn);
    push({
      name: 'CLARITY 1 で山札の上をふるって ' + pn, kind: 'engine', protos: ['CLARITY', 'LUCK'],
      how: 'CLARITY 1 (' + text[C1] + ') の開始で山札の一番上を選り分け、' + pn + ' (' + text[P0] + ') で使う。',
      setup: { mine: [{ card: C1, at: 'field' }, { card: P0, at: 'hand' }] }, act: { play: P0 }, partner: [C1]
    });
  }
})();

/* ---------- FIRE 3 + SPIRIT 1 の回しに3枚目 (L101〜、2026-10-28) ----------
   回しは毎手番「FIRE 3 で1枚捨てる」「SPIRIT 1 で2枚引く」。引いたあとに動く SPIRIT 3、捨てたあとに相手も捨てる CORRUPTION 2 を足す。
   相方 = 回しの2枚 (最初は3枚目にしていたが、それだと3枚目そのものの効果の値打ちを測ってしまう) */
(function fire3Triples() {
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  const T3 = [['SPIRIT_4', 'SPIRIT 3 (引いたあと: 覆われていても動ける)'], ['CORRUPTION_3', 'CORRUPTION 2 (捨てたあと: 相手も1枚捨てる)']];
  let n = 100;
  for (const [d, label] of T3) {
    const mine = [{ card: 'FIRE_4', at: 'field' }, { card: 'SPIRIT_2', at: 'field', faceUp: false, line: 'other' }, { card: d, at: 'hand' }];
    const key = mine.map(p => p.card).sort().join('+');
    if (seen.has(key)) continue;
    module.exports.push({
      id: 'L' + (++n), auto: true, source: 'fire3', late: true,
      name: 'FIRE 3 + SPIRIT 1 の回しに ' + label.split(' (')[0], kind: 'engine', protos: ['FIRE', 'SPIRIT', ...(d === 'CORRUPTION_3' ? ['CORRUPTION'] : [])],
      how: 'FIRE 3 で毎手番 SPIRIT 1 を表に戻す回しに、' + label + ' を足す。',
      setup: { mine }, act: { play: d }, partner: ['FIRE_4', 'SPIRIT_2'],
      picks: (s, q, P) => {
        const t = P.planted.SPIRIT_2;
        if (!t || !s.cards[t]) return null;
        if (q.context === 'SPIRIT_2' && q.kind === 'option') { const i = q.options.indexOf('flip'); return i >= 0 ? [i] : null; }
        if (q.context !== 'FIRE_4' || s.cards[t].faceUp) return null;
        if (q.kind === 'yesNo') return ['yes'];
        if (q.kind === 'pickHand') { const c = q.candidates.slice().sort((a, b) => P.val(s, a) - P.val(s, b)); return c.length ? [c[0]] : null; }
        if (q.kind === 'pickCard' && q.candidates.includes(t)) return [t];
        return null;
      }
    });
  }
})();

/* ---------- 裏向きを数える札 × 裏向きを足す札 (D001〜、2026-10-28) ----------
   DARKNESS 2 (このスタックの裏向きは値4)・APATHY 0・SMOKE 2 (このラインの裏向き1枚ごとに +1) は上段なので覆われても効く。
   そのラインに裏向きを足す札 (山札の上を撒く・裏で出す・裏向きを動かして寄せる) と、
   そのラインの覆われた表の札を裏にする札 (下に低い札を敷いておく) を組ませる。
   置く先・動かす先を選べるときは数える札のラインに、動かす札は他のラインの自分の裏向きを決め打つ */
(function facedownValueCandidates() {
  const fs = require('node:fs');
  const path = require('node:path');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {}, byName = {}, low = {};
  for (const p of cards.protocols) for (const c of p.cards) {
    proto[c.id] = p.name; value[c.id] = c.value; byName[p.name + ' ' + c.value] = c.id;
    text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / ');
  }
  const id = (n) => { if (!byName[n]) throw new Error('no card ' + n); return byName[n]; };
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  const BOOST = { 'DARKNESS 2': 'DARKNESS 0', 'APATHY 0': 'APATHY 1', 'SMOKE 2': 'SMOKE 1' };
  const ADD = ['LIFE 0', 'WATER 1', 'SMOKE 0', 'SMOKE 3', 'DARKNESS 3', 'PEACE 2', 'TIME 3'];
  const MOVE = ['DARKNESS 4', 'SMOKE 4'];
  const FLIP = ['SPIRIT 2', 'LOVE 4', 'METAL 0', 'WATER 0'];
  let n = 0;
  for (const [bn, under] of Object.entries(BOOST)) for (const pn of [...ADD, ...MOVE, ...FLIP]) {
    const B = id(bn), P0 = id(pn), U = id(under);
    if (proto[B] === proto[P0] && !MOVE.includes(pn)) continue;
    const key = [B, P0].sort().join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    const isFlip = FLIP.includes(pn), isMove = MOVE.includes(pn);
    const mine = isFlip ? [{ card: U, at: 'field' }, { card: B, at: 'field', over: U }, { card: P0, at: 'hand' }]
      : [{ card: B, at: 'field' }, { card: P0, at: 'hand' }];
    if (isMove) mine.splice(1, 0, { card: U, at: 'field', faceUp: false, line: 'other' });
    module.exports.push({
      id: 'D' + String(++n).padStart(3, '0'), auto: true, source: 'facedown', late: true,
      name: bn + ' のラインに ' + pn + ' で裏向きを' + (isFlip ? '作る' : isMove ? '寄せる' : '足す'), kind: 'burst', protos: [...new Set([proto[B], proto[P0]])],
      how: bn + ' (' + text[B] + ') のラインに、' + pn + ' (' + text[P0] + ') で裏向きを' + (isFlip ? '作る (覆われた ' + under + ' を裏にする)' : isMove ? '寄せる' : '足す') + '。',
      setup: { mine }, act: { play: P0, ...(['WATER 1', 'DARKNESS 3', 'TIME 3'].includes(pn) ? { line: 'other' } : {}) }, partner: [B],
      picks: (s, q, P) => {
        const b = P.planted[B];
        if (!b || !s.cards[b]) return null;
        const bl = s.lines.findIndex(L => L[P.me].includes(b));
        if (bl < 0 || q.player !== P.me) return null;
        if (q.kind === 'pickLine' && (q.context === P0 || /play-dest|shift-dest|choose-line/.test(q.prompt || '')) && q.lines.includes(bl)) return [bl];
        if (q.kind !== 'pickCard' || q.context !== P0 || q.prompt === 'trigger-order') return null;
        if (isMove) {
          const c = q.candidates.filter(u => !s.cards[u].faceUp && s.lines.some((L, i) => i !== bl && L[P.me].includes(u)));
          return c.length ? [c[0]] : null;
        }
        if (isFlip) { const u = P.planted[U]; return u && q.candidates.includes(u) ? [u] : null; }
        return null;
      }
    });
  }
})();

/* ---------- 自分の撃つ札を手札に戻して出し直す (B001〜、2026-10-28) ----------
   中段の強い札を表で一番上に置いておき、戻す札 (FIRE 2: 1枚捨てて1枚戻す / WATER 4: 自分の札を1枚戻す / CORRUPTION 1: 1枚戻す) で手札へ戻す。
   次の手番にもう一度出せば中段がまた入る。相方 = 戻した札 (白紙なら戻しても出し直す得がない)。
   撃ち直しの X 型と同じ札の組になるが、覆いをどけるのではなく戻すので別に測る */
(function bounceCandidates() {
  const fs = require('node:fs');
  const path = require('node:path');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {}, byName = {};
  for (const p of cards.protocols) for (const c of p.cards) {
    proto[c.id] = p.name; value[c.id] = c.value; byName[p.name + ' ' + c.value] = c.id;
    text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / ');
  }
  const id = (n) => { if (!byName[n]) throw new Error('no card ' + n); return byName[n]; };
  const name = (d) => proto[d] + ' ' + value[d];
  const PAYLOAD = ['DEATH 0', 'FIRE 0', 'DARKNESS 0', 'LIGHT 0', 'GRAVITY 1', 'SPIRIT 1', 'FEAR 1', 'PSYCHIC 2', 'WATER 1', 'LIFE 0', 'HATE 0', 'METAL 1', 'SPEED 0', 'LUCK 0'].map(id);
  const BOUNCE = ['FIRE 2', 'WATER 4', 'CORRUPTION 1'].map(id);
  let n = 0;
  for (const R of BOUNCE) for (const T of PAYLOAD) {
    if (proto[R] === proto[T]) continue;
    module.exports.push({
      id: 'B' + String(++n).padStart(3, '0'), auto: true, source: 'bounce', late: true,
      name: name(R) + ' で ' + name(T) + ' を手札に戻して出し直す', kind: 'setup', protos: [proto[R], proto[T]],
      how: name(T) + ' (' + text[T] + ') を撃ったあと、' + name(R) + ' (' + text[R] + ') で手札に戻し、次の手番にもう一度出す。',
      setup: { mine: [{ card: T, at: 'field' }, { card: R, at: 'hand' }] }, act: { play: R, line: 'other' }, partner: [T],
      picks: (s, q, P) => {
        const t = P.planted[T];
        if (q.context !== R || !t || !s.cards[t] || s.cards[t].zone !== 'field') return null;
        if (q.kind === 'yesNo') return ['yes'];
        if (q.kind === 'pickHand') { const c = q.candidates.filter(u => u !== t).sort((a, b) => P.val(s, a) - P.val(s, b)); return c.length ? [c[0]] : null; }
        if (q.kind === 'pickCard' && q.candidates.includes(t)) return [t];
        return null;
      }
    });
  }
})();

/* ---------- 回っている組に3枚目を足す (E001〜、2026-10-28) ----------
   確かめた組を場に植え、その組が毎手番起こす出来事 (引く・捨てる・削除・シャッフル) を聞く札を3枚目に出す。
   聞く札は A 型と同じく effects.json の「〜したあと」から拾う。
   相方 = 組の札 (3枚目を白紙にすると、3枚目そのものの効果の値打ちを測ってしまう。組を白紙にして、3枚目が組にどれだけ乗るかを測る) */
(function engineTriples() {
  const fs = require('node:fs');
  const path = require('node:path');
  const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'effects.json'), 'utf8'));
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {}, byName = {};
  for (const p of cards.protocols) for (const c of p.cards) {
    proto[c.id] = p.name; value[c.id] = c.value; byName[p.name + ' ' + c.value] = c.id;
    text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / ');
  }
  const id = (n) => { if (!byName[n]) throw new Error('no card ' + n); return byName[n]; };
  const name = (d) => proto[d] + ' ' + value[d];
  const ENGINES = [
    ['WAR 0 + CHAOS 0', ['WAR 0', 'CHAOS 0'], ['afterOppDraw', 'afterYouDraw', 'afterYouDelete']],
    ['FIRE 3 + PLAGUE 4', ['FIRE 3', 'PLAGUE 4'], ['afterYouDiscard']],
    ['PLAGUE 1 + COURAGE 0 + CORRUPTION 2', ['PLAGUE 1', 'COURAGE 0', 'CORRUPTION 2'], ['afterYouDiscard', 'afterOppDiscard', 'afterYouDraw']],
    ['WAR 3 + COURAGE 0', ['WAR 3', 'COURAGE 0'], ['afterYouDiscard', 'afterOppDiscard']],
    ['SPIRIT 3 + PEACE 1', ['SPIRIT 3', 'PEACE 1'], ['afterYouDraw']],
    ['TIME 2 + CLARITY 3', ['TIME 2', 'CLARITY 3'], ['afterYouShuffle', 'afterYouDraw']],
    ['CORRUPTION 6 + CORRUPTION 2', ['CORRUPTION 6', 'CORRUPTION 2'], ['afterYouDiscard', 'afterOppDiscard', 'afterYouDraw']]
  ];
  const listeners = [];
  for (const [d, eff] of Object.entries(effects)) {
    if (!proto[d]) continue;
    for (const slot of ['upper', 'lower']) {
      const tr = eff[slot] && eff[slot].trigger;
      if (tr && /^after/.test(tr.on)) listeners.push({ id: d, slot, on: tr.on });
    }
  }
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  let n = 0;
  for (const [en, pieces, evs] of ENGINES) {
    const ps = pieces.map(id);
    for (const L of listeners) {
      if (!evs.includes(L.on) || ps.includes(L.id)) continue;
      const mine = [...ps.map(x => ({ card: x, at: 'field' })), { card: L.id, at: 'hand' }];
      const key = mine.map(p => p.card).sort().join('+');
      if (seen.has(key)) continue;
      seen.add(key);
      module.exports.push({
        id: 'E' + String(++n).padStart(3, '0'), auto: true, source: 'triple', late: true,
        name: en + ' に ' + name(L.id), kind: 'engine', protos: [...new Set([...ps.map(x => proto[x]), proto[L.id]])],
        how: en + ' が回っているところに ' + name(L.id) + ' (' + text[L.id] + ') を足す。',
        /* 3枚目は組の札を覆わないラインに出す (下段の組は覆うと止まる) */
        setup: { mine }, act: { play: L.id, line: L.slot === 'lower' ? 'other' : undefined }, partner: ps
      });
    }
  }
})();

/* ---------- 回っている組に、場に残って効く札を総当たりで3枚目に (G001〜、2026-10-28) ----------
   E 型は「〜したあと」を聞く札だけだった。上段か下段 (開始・終了・常に効く) を持つ札を、組と別のプロトコルからすべて試す */
(function engineAnyThird() {
  const fs = require('node:fs');
  const path = require('node:path');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {}, byName = {}, persist = [];
  for (const p of cards.protocols) for (const c of p.cards) {
    proto[c.id] = p.name; value[c.id] = c.value; byName[p.name + ' ' + c.value] = c.id;
    text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / ');
    if (c.upper || c.lower) persist.push(c.id);
  }
  const id = (n) => { if (!byName[n]) throw new Error('no card ' + n); return byName[n]; };
  const name = (d) => proto[d] + ' ' + value[d];
  const ENGINES = [
    ['WAR 0 + CHAOS 0', ['WAR 0', 'CHAOS 0']],
    ['FIRE 3 + PLAGUE 4', ['FIRE 3', 'PLAGUE 4']],
    ['WAR 3 + COURAGE 0', ['WAR 3', 'COURAGE 0']],
    ['SPIRIT 3 + PEACE 1', ['SPIRIT 3', 'PEACE 1']],
    /* 2巡目 (G226〜): 1巡目の4組のあとに足した */
    ['FIRE 3 + SPIRIT 1', ['FIRE 3', 'SPIRIT 1']],
    ['TIME 2 + CLARITY 3', ['TIME 2', 'CLARITY 3']],
    /* 3巡目 (G343〜) */
    ['WAR 0 + LOVE 2', ['WAR 0', 'LOVE 2']],
    ['WAR 3 + FEAR 1', ['WAR 3', 'FEAR 1']],
    ['SPIRIT 3 + CORRUPTION 2', ['SPIRIT 3', 'CORRUPTION 2']]
  ];
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  let n = 0;
  for (const [en, pieces] of ENGINES) {
    const ps = pieces.map(id), pp = new Set(ps.map(x => proto[x]));
    for (const T of persist) {
      if (pp.has(proto[T])) continue;
      const mine = [...ps.map(x => ({ card: x, at: 'field' })), { card: T, at: 'hand' }];
      const key = mine.map(p => p.card).sort().join('+');
      if (seen.has(key)) continue;
      seen.add(key);
      module.exports.push({
        id: 'G' + String(++n).padStart(3, '0'), auto: true, source: 'triple', late: true,
        name: en + ' に ' + name(T), kind: 'engine', protos: [...pp, proto[T]],
        how: en + ' が回っているところに ' + name(T) + ' (' + text[T] + ') を足す。',
        setup: { mine }, act: { play: T }, partner: ps
      });
    }
  }
})();

/* ---------- 相手の置き場をふさぐ札 × 崩す札 (P001〜、2026-10-29) ----------
   G011 (WAR 0 + CHAOS 0 に PLAGUE 0) で、PLAGUE 0 の下段「相手はこのラインにプレイできない」と削除が噛み合った。
   ふさぐ札 (PLAGUE 0・METAL 2: 裏向きを出させない・PSYCHIC 1: 表で出させない) を場に置き、崩す札を出す2枚の組。相方 = ふさぐ札 */
(function blockCandidates() {
  const fs = require('node:fs');
  const path = require('node:path');
  const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.json'), 'utf8'));
  const proto = {}, value = {}, text = {}, byName = {};
  for (const p of cards.protocols) for (const c of p.cards) {
    proto[c.id] = p.name; value[c.id] = c.value; byName[p.name + ' ' + c.value] = c.id;
    text[c.id] = [c.upper, c.middle, c.lower].filter(Boolean).join(' / ');
  }
  const id = (n) => { if (!byName[n]) throw new Error('no card ' + n); return byName[n]; };
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  let n = 0;
  for (const bn of ['PLAGUE 0', 'METAL 2', 'PSYCHIC 1']) for (const rn of ['WAR 0', 'HATE 0', 'HATE 2', 'DEATH 0', 'DEATH 2', 'DEATH 3', 'DEATH 4', 'WATER 3', 'FEAR 2', 'FIRE 2', 'LUCK 4', 'COURAGE 1', 'GRAVITY 6', 'ASSIMILATION 0']) {
    const B = id(bn), R = id(rn);
    if (proto[B] === proto[R]) continue;
    const key = [B, R].sort().join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    module.exports.push({
      id: 'P' + String(++n).padStart(3, '0'), auto: true, source: 'block', late: true,
      name: bn + ' でふさいで ' + rn + ' で崩す', kind: 'burst', protos: [proto[B], proto[R]],
      how: bn + ' (' + text[B] + ') で相手の出し方をふさいだうえで、' + rn + ' (' + text[R] + ') で相手の場を崩す。',
      /* WAR 0 は場に置き、LOVE 2 (相手に1枚引かせる) で削除を起こす */
      setup: { mine: [{ card: B, at: 'field' }, ...(rn === 'WAR 0' ? [{ card: R, at: 'field' }, { card: 'LOVE_2', at: 'hand' }] : [{ card: R, at: 'hand' }])] },
      act: rn === 'WAR 0' ? { play: 'LOVE_2' } : { play: R }, partner: [B]
    });
  }
})();

/* ---------- PLAGUE 0 でふさいで WAR 0 で消す、をほかの引かせ方で (H001〜、2026-10-29) ----------
   G011 (CHAOS 0)・G353 (LOVE 2) で残った形を、WAR 0 を起こすほかの札 (LOVE 6・FEAR 1・ASSIMILATION 4) でも確かめる。相方 = WAR 0 */
(function plague0Candidates() {
  let n = 0;
  for (const [d, label] of [['LOVE_6', 'LOVE 6'], ['FEAR_2', 'FEAR 1'], ['ASSIMILATION_4', 'ASSIMILATION 4']]) {
    module.exports.push({
      id: 'H' + String(++n).padStart(3, '0'), auto: true, source: 'triple', late: true,
      name: 'WAR 0 + ' + label + ' に PLAGUE 0', kind: 'burst', protos: ['WAR', label.split(' ')[0], 'PLAGUE'],
      how: 'WAR 0 を一番上に置き、PLAGUE 0 で相手の置き場を1本ふさいでから、' + label + ' で相手に引かせて WAR 0 の削除を起こす。',
      setup: { mine: [{ card: 'WAR_1', at: 'field' }, { card: d, at: 'hand' }, { card: 'PLAGUE_1', at: 'hand' }] },
      act: { play: 'PLAGUE_1' }, partner: ['WAR_1']
    });
  }
})();

/* ---------- 動ける札で、覆われると効く札を覆い直す (M001〜、2026-10-29) ----------
   SPIRIT 3 (引いたあと: 覆われていても動ける)・TIME 2 (シャッフルしたあと: 1枚引いて動ける) を、覆われると効く札
   (FIRE 0: 先に1枚引いて1枚反転 / LIFE 3 / HATE 4 / CLARITY 1: 先に3枚引く / APATHY 2) の上へ動かす。
   FIRE 0・CLARITY 1 は覆われるときに引くので、引いたあとにまた SPIRIT 3 が動ける (どいてもう一度乗れば、もう一度起きる)。
   動く先は覆われると効く札のラインに決め打つ。相方 = 覆われると効く札 */
(function moverCoverCandidates() {
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  const T = [['FIRE_1', 'FIRE 0'], ['LIFE_4', 'LIFE 3'], ['HATE_5', 'HATE 4'], ['CLARITY_2', 'CLARITY 1'], ['APATHY_3', 'APATHY 2']];
  const MOVERS = [['SPIRIT_4', 'SPIRIT 3', 'METAL_2', 'METAL 1 (2枚引く)'], ['TIME_3', 'TIME 2', 'CLARITY_4', 'CLARITY 3 (シャッフル)']];
  let n = 0;
  for (const [m, mn, d, dn] of MOVERS) for (const [t, tn] of T) {
    if (m.split('_')[0] === t.split('_')[0] || d.split('_')[0] === t.split('_')[0]) continue;
    const mine = [{ card: t, at: 'field' }, { card: m, at: 'field', line: 'other' }, { card: d, at: 'hand' }];
    const key = mine.map(p => p.card).sort().join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    module.exports.push({
      id: 'M' + String(++n).padStart(3, '0'), auto: true, source: 'mover', late: true,
      name: mn + ' を ' + tn + ' の上へ動かす', kind: 'engine', protos: [...new Set([m, t, d].map(x => x.split('_')[0]))],
      how: dn + ' で ' + mn + ' を起こし、' + tn + ' の上へ動かして覆われたときの効果を起こす。',
      setup: { mine }, act: { play: d, line: 'other' }, partner: [t],
      picks: (s, q, P) => {
        const tu = P.planted[t], mu = P.planted[m];
        if (!tu || !mu || !s.cards[tu] || !s.cards[mu] || q.player !== P.me) return null;
        const tl = s.lines.findIndex(L => L[P.me].includes(tu));
        const ml = s.lines.findIndex(L => L[P.me].includes(mu));
        if (tl < 0) return null;
        const tTop = s.lines[tl][P.me][s.lines[tl][P.me].length - 1] === tu;
        if (q.context === m && q.kind === 'yesNo') return [tTop && ml !== tl ? 'yes' : 'no'];
        if (q.kind === 'pickLine' && /shift-dest/.test(q.prompt || '') && q.focus === mu) return q.lines.includes(tl) ? [tl] : null;
        return null;
      }
    });
  }
})();

/* ---------- 相手のリフレッシュで起きる札 × 相手の手札を空にする札 (R001〜、2026-10-29) ----------
   WAR 1 (相手がリフレッシュしたあと: 好きなだけ捨ててリフレッシュ)・ASSIMILATION 1 (誰かがリフレッシュしたあと: 相手の山札の上を引き、1枚を相手の捨て札へ) は
   A 型の「〜したあと」に入っていなかった。相手の手札を減らす札 (相手はやがてリフレッシュする) と、自分でリフレッシュする札を組ませる。相方 = 聞く札 */
(function refreshCandidates() {
  const seen = new Set(module.exports.map(c => c.setup.mine.map(p => p.card).sort().join('+')));
  const L = [['WAR_2', 'WAR 1', false], ['ASSIMILATION_2', 'ASSIMILATION 1', true]];
  const P = [['PLAGUE_3', 'PLAGUE 2', false], ['PEACE_1', 'PEACE 1', false], ['FEAR_2', 'FEAR 1', false], ['HATE_2', 'HATE 1', false],
    ['LOVE_2', 'LOVE 2', true], ['SPIRIT_1', 'SPIRIT 0', true]];
  let n = 0;
  for (const [l, ln, any] of L) for (const [p, pn, own] of P) {
    if (own && !any) continue;
    const mine = [{ card: l, at: 'field' }, { card: p, at: 'hand' }];
    const key = mine.map(x => x.card).sort().join('+');
    if (seen.has(key)) continue;
    seen.add(key);
    module.exports.push({
      id: 'R' + String(++n).padStart(3, '0'), auto: true, source: 'refresh', late: true,
      name: ln + ' + ' + pn + ' (リフレッシュで起きる)', kind: own ? 'burst' : 'setup', protos: [l.split('_')[0], p.split('_')[0]],
      how: ln + ' を一番上に置いておき、' + pn + (own ? ' で自分がリフレッシュして起こす。' : ' で相手の手札を減らし、相手のリフレッシュで起こす。'),
      setup: { mine }, act: { play: p, line: 'other' }, partner: [l]
    });
  }
})();
