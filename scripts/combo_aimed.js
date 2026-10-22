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
  { id: 'M04', name: 'SPEED 2 をコンパイルに持ち込む', cards: ['SPEED_3'], protocols: ['SPEED'], combo: 'speed2', games: 40,
    how: 'SPEED 2 は表で場に居れば、そのラインをコンパイルしても削除されず別のラインへ移る (値2と札を次のラインへ持ち越す)。手札から捨てず、コンパイルが近いラインに表で置く。',
    base: { compiles: 100, survived: 13, discarded: 27, wins: 20 }, now: { compiles: 101, survived: 32, discarded: 7, wins: 19 } }
];
