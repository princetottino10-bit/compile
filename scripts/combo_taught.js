'use strict';
/* 対戦者から教わって AI に入れた手筋 (docs/ai-combos.md の一覧を、データベース用に短くしたもの)。
   AI 側の実装やテストの場所は docs/ai-combos.md を見る */
module.exports = [
  { id: 'T01', name: 'WATER 1 + WATER 4', kind: 'burst', cards: ['WATER_2', 'WATER_5'], protocols: ['WATER'], how: 'WATER 1 の上に WATER 4 を重ね、WATER 4 自身を戻す。WATER 1 の中段 (デッキの上を他の各ラインに裏向き) を撃ち直し、WATER 4 は手札に戻る。' },
  { id: 'T02', name: 'DEATH 1 の自壊', kind: 'burst', cards: ['DEATH_2'], protocols: ['DEATH'], how: 'DEATH 1 の開始「1枚引き、他1枚削除、そのあとこのカードを削除」で、自分の下の札の中段を撃ち直す。' },
  { id: 'T03', name: 'SPIRIT 0 で SPIRIT 3 を2回動かす', kind: 'burst', cards: ['SPIRIT_1', 'SPIRIT_4'], protocols: ['SPIRIT'], how: 'SPIRIT 0 のリフレッシュと1枚ドローのたびに SPIRIT 3 を動かし、どいた先の下の札の中段を2回撃つ。' },
  { id: 'T04', name: 'GRAVITY の連鎖', kind: 'burst', cards: ['GRAVITY_2', 'GRAVITY_3'], protocols: ['GRAVITY'], how: 'GRAVITY 1 を裏で置き、GRAVITY 2 で反転してこのラインへ。GRAVITY 1 の中段 (2ドロー+移動) で別の札を上に移し、残りの移動で GRAVITY 1 の中段をもう一度撃つ。' },
  { id: 'T05', name: 'FIRE 0 を噛ませる', kind: 'burst', cards: ['FIRE_1'], protocols: ['FIRE'], how: 'FIRE 0 は覆われるとき「先に1枚引き、他1枚反転」。下に置いておき、上に重ねるたびに得をする。' },
  { id: 'T06', name: 'FIRE 0 + WATER 4', kind: 'engine', cards: ['FIRE_1', 'WATER_5'], protocols: ['FIRE', 'WATER'], how: 'WATER のラインの表の FIRE 0 に WATER 4 を表で重ね、WATER 4 自身を戻す。FIRE 0 の覆われ時と中段が両方入り、2枚反転・3枚ドロー。WATER 4 は手札に戻るので毎手番くり返せる。' },
  { id: 'T07', name: 'SPEED 0 + SPEED 3', kind: 'burst', cards: ['SPEED_1', 'SPEED_4'], protocols: ['SPEED'], how: 'SPEED 0 の追加プレイで SPEED 3 を上に表で。SPEED 3 の中段で別の札を動かし、終了時に SPEED 3 自身をどかすと SPEED 0 の中段がもう一度入る。下の表の札を起こせるときまで手札にキープする。' },
  { id: 'T08', name: 'WATER 2 の並べ替えで構え', kind: 'setup', cards: ['WATER_3', 'FIRE_1', 'WATER_5'], protocols: ['WATER', 'FIRE'], how: 'WATER 2 (2枚引く・プロトコルを並べ替える) で FIRE 0 の居るラインを WATER にし、FIRE 0 + WATER 4 の構えを作る。' },
  { id: 'T09', name: 'FIRE 0 + LIFE 0 / WATER 1', kind: 'burst', cards: ['FIRE_1', 'LIFE_1', 'WATER_2'], protocols: ['FIRE', 'LIFE', 'WATER'], how: '裏向きを撒くとき FIRE 0 のラインを最後にし、FIRE 0 の反転で先に撒いた裏向きを表にする。' },
  { id: 'T10', name: 'LIFE 3 + LIFE 0', kind: 'burst', cards: ['LIFE_4', 'LIFE_1'], protocols: ['LIFE'], how: 'LIFE 3 が覆われるときの裏向きが LIFE 0 の中段より先に入るので、空きラインにも裏向きを置ける。' },
  { id: 'T11', name: 'PLAGUE 2 で手札を枯らす', kind: 'burst', cards: ['PLAGUE_3'], protocols: ['PLAGUE'], how: '相手の手札を全部捨てさせ、リフレッシュを強制して手番を奪う。その間に確定でコンパイルする。' },
  { id: 'T12', name: '相手の済みラインに寄せて行動不能', kind: 'burst', cards: ['SPEED_5'], protocols: ['SPEED'], how: '移動効果で相手の札を相手の済みラインへ寄せて10点以上にし、開始の強制リコンパイルでその手番の行動を奪う。' },
  { id: 'T13', name: 'FIRE 3 + PLAGUE 4', kind: 'burst', cards: ['FIRE_4', 'PLAGUE_5'], protocols: ['FIRE', 'PLAGUE'], how: 'FIRE 3 の終了で相手の表を裏にし、PLAGUE 4 の終了「相手は自分の裏向きを1枚削除」で落とさせる。終了時の順は FIRE 3 → PLAGUE 4。' },
  { id: 'T14', name: '8点のラインに PSYCHIC 1', kind: 'burst', cards: ['PSYCHIC_2'], protocols: ['PSYCHIC'], how: '8点のラインに PSYCHIC 1 を表で出す (9点)。開始の反転で裏向き=値2になり10点でコンパイル。' },
  { id: 'T15', name: 'SPIRIT 3 で SPIRIT 1 を覆う', kind: 'burst', cards: ['SPIRIT_4', 'SPIRIT_2'], protocols: ['SPIRIT'], how: 'SPIRIT 1 の開始「1枚捨てるか反転」を、覆うことで止める。' },
  { id: 'T16', name: 'DEATH 0 を都合のいいラインに', kind: 'burst', cards: ['SPIRIT_2', 'DEATH_1'], protocols: ['SPIRIT', 'DEATH'], how: 'SPIRIT 1 (対応不問で表でプレイ) の間に DEATH 0 (他の各ラインを1枚ずつ削除) を、相手の札が並ぶ2ライン以外に出す。' },
  { id: 'T17', name: 'GRAVITY 4 で崩れにくいリーチ', kind: 'setup', cards: ['GRAVITY_4'], protocols: ['GRAVITY'], how: 'GRAVITY 4 で裏向きを1枚このラインへ移動。持ってきた裏向きを除去されても別ラインの裏向きをまた持ってこられる。' },
  { id: 'T18', name: 'HATE 3 を場に置いて削除', kind: 'engine', cards: ['HATE_4'], protocols: ['HATE'], how: 'HATE 0・HATE 1・DEATH 0・HATE 3 の覆われ時・WAR 0 の削除ごとに1枚引く。' },
  { id: 'T19', name: 'DARKNESS 2 で点数を跳ね上げる', kind: 'burst', cards: ['DARKNESS_3'], protocols: ['DARKNESS'], how: 'このスタックの裏向きは各4点。中段で自分の覆われた低い札を裏にすれば、それも4点。' },
  { id: 'T20', name: 'PEACE 6 + PEACE 1', kind: 'burst', cards: ['PEACE_6', 'PEACE_1'], protocols: ['PEACE'], how: 'PEACE 1 で両者の手札を空にし、PEACE 6 (値6) が裏返らないようにする。相手は次の手番をリフレッシュに使う。' },
  { id: 'T21', name: 'DIVERSITY 0 を3本目に', kind: 'setup', cards: ['DIVERSITY_1'], protocols: ['DIVERSITY'], how: '場に表向きで6種類そろえば出すだけでコンパイル完了。2本済んでから使い、それまで種類をそろえて残す。' },
  { id: 'T22', name: 'DARKNESS 4 で PSYCHIC 1 を覆う', kind: 'lock', cards: ['DARKNESS_5', 'PSYCHIC_2'], protocols: ['DARKNESS', 'PSYCHIC'], how: '表の PSYCHIC 1 が一番上なら、DARKNESS 4 で裏向きを上に移して覆う。開始で裏返らなくなり、相手は裏向きでしか出せない (永続ロック)。' },
  { id: 'T23', name: 'PSYCHIC 1 → FIRE 0 → 裏 → DARKNESS 4', kind: 'setup', cards: ['PSYCHIC_2', 'FIRE_1', 'DARKNESS_5'], protocols: ['PSYCHIC', 'FIRE', 'DARKNESS'], how: 'FIRE 0 (表) の上に裏向きを乗せておき、PSYCHIC 1 が一番上の時に DARKNESS 4 でその裏向きを PSYCHIC 1 の上へ。覆いの外れた FIRE 0 の中段の反転で、覆われた PSYCHIC 1 を表にする = 1手で永続ロック。' },
  { id: 'T24', name: 'FIRE 3 を回す', kind: 'engine', cards: ['FIRE_4', 'PSYCHIC_2'], protocols: ['FIRE', 'PSYCHIC'], how: 'FIRE 3 を一番上で表のまま残し、別のラインの PSYCHIC 1 が開始で裏返るたびに、終了時の反転で表に戻す (相手の手番は毎回ロック)。' },
  { id: 'T25', name: 'HATE 1 を撃ち直させない', kind: 'lock', cards: ['FIRE_4', 'HATE_2'], protocols: ['FIRE', 'HATE'], how: '相手の一番上の表の HATE 1 は、HATE 0・HATE 2 を重ねて自分を消すと撃ち直される。FIRE 3 の終了の反転で裏にして止める。' },
  { id: 'T26', name: 'PSYCHIC 4 を取っておく', kind: 'engine', cards: ['PSYCHIC_5'], protocols: ['PSYCHIC'], how: '終了の「相手の札を1枚戻す」(使うと裏返る) はすぐ使わず、リフレッシュのような手の空いた手番で使う。' }
];
