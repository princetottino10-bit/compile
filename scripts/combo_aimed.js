'use strict';
/* 揃えに行く手筋 (engine.js の AI_AIM_COMBOS / aiSpeed2Score) と、scripts/combo_aim.js で数えた実戦の結果。
   base = master の ORACLE、now = 手筋を入れた ORACLE。どちらも ORACLE 同士・同じ種の games 局。
   assembled: 揃った局 / fired: 撃った回数 (出した瞬間に撃つ札) / survived: SPEED 2 がコンパイルで生き残った回数 */
module.exports = [
  { id: 'M01', lab: 'C001', name: 'WAR 0 + CHAOS 0', cards: ['WAR_1', 'CHAOS_1'], protocols: ['WAR', 'CHAOS'], combo: 'warChaos', games: 60,
    how: 'WAR 0 を一番上で表のまま、CHAOS 0 も一番上で表に揃える。CHAOS 0 の開始で相手が引くたびに WAR 0 で1枚削除できる。HATE 3 (削除で1枚引く) と MIRROR 4 が乗る。WAR 0・CHAOS 0 を自分の札で覆わない。',
    base: { assembled: 0, wins: 25 }, now: { assembled: 7, wins: 24 } },
  { id: 'M02', lab: 'C014', name: 'WAR 0 + LOVE 6 / LOVE 2', cards: ['WAR_1', 'LOVE_6', 'LOVE_2'], protocols: ['WAR', 'LOVE'], combo: 'warLove', games: 60,
    how: 'WAR 0 を一番上で表に置いてから LOVE 6 (相手は2枚引く) / LOVE 2 (相手は1枚引く) を表で出し、引かせた分を削除で取り返す。LOVE は WAR 0 が場で効くまで手札に残す。',
    base: { assembled: 12, fired: 3, wins: 32 }, now: { assembled: 22, fired: 20, wins: 26 } },
  { id: 'M03', lab: 'A126', name: 'WAR 0 + FEAR 1', cards: ['WAR_1', 'FEAR_2'], protocols: ['WAR', 'FEAR'], combo: 'warFear', games: 60,
    how: 'WAR 0 を一番上で表に置いてから FEAR 1 (相手は手札を捨てて引き直す) を出し、引き直しで削除する。',
    base: { assembled: 6, fired: 0, wins: 27 }, now: { assembled: 19, fired: 9, wins: 33 } },
  { id: 'M05', lab: 'C015', name: '覆われた PSYCHIC 1 + METAL 2', cards: ['PSYCHIC_2', 'METAL_3'], protocols: ['PSYCHIC', 'METAL'], combo: 'psyMetal', games: 60,
    how: '覆われた表の PSYCHIC 1 は開始で裏返らず、相手は裏向きでしか出せない。METAL 2 (このラインに裏向きで出せない) と重ねると、相手は METAL 2 のラインに何も出せない。PSYCHIC 1 を表で出してから覆う。METAL 2 は捨てずに持つ。',
    base: { assembled: 1, wins: 22 }, now: { assembled: 8, wins: 26 } },
  { id: 'M06', lab: 'C016', name: '覆われた PSYCHIC 1 + PLAGUE 0', cards: ['PSYCHIC_2', 'PLAGUE_1'], protocols: ['PSYCHIC', 'PLAGUE'], combo: 'psyPlague', games: 60,
    how: 'PLAGUE 0 の下段 (相手はこのラインに出せない) と覆われた PSYCHIC 1 で、相手の置き場は2ラインの裏向きだけになる。',
    base: { assembled: 0, wins: 27 }, now: { assembled: 5, wins: 34 } },
  { id: 'M07', lab: 'C009', name: 'SPIRIT 0 + CLARITY 0', cards: ['SPIRIT_1', 'CLARITY_1'], protocols: ['SPIRIT', 'CLARITY'], combo: 'spiritClarity', games: 60,
    how: 'SPIRIT 0 の下段でキャッシュの確認を飛ばして手札を溜め、CLARITY 0 の上段で手札1枚ごとにそのラインを +1。SPIRIT 0 を一番上に残す。',
    base: { assembled: 9, wins: 22 }, now: { assembled: 16, wins: 25 } },
  { id: 'M08', lab: 'A127', name: 'WAR 0 + ASSIMILATION 4', cards: ['WAR_1', 'ASSIMILATION_5'], protocols: ['WAR', 'ASSIMILATION'], combo: 'warAssim', games: 60,
    how: 'WAR 0 を一番上で表に置いてから ASSIMILATION 4 (相手はあなたのデッキの一番上を引く) を出し、引かせた分を削除する。',
    base: { assembled: 4, wins: 28 }, now: { assembled: 16, wins: 31 } },
  { id: 'M04', name: 'SPEED 2 をコンパイルに持ち込む', cards: ['SPEED_3'], protocols: ['SPEED'], combo: 'speed2', games: 40,
    how: 'SPEED 2 は表で場に居れば、そのラインをコンパイルしても削除されず別のラインへ移る (値2と札を次のラインへ持ち越す)。手札から捨てず、コンパイルが近いラインに表で置く。',
    base: { compiles: 100, survived: 13, discarded: 27, wins: 20 }, now: { compiles: 101, survived: 32, discarded: 7, wins: 19 } }
];
