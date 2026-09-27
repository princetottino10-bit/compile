/* =========================================================================
 * もらった CHIP の合計 (ガチャに使う)
 *   経験値が入るたびに CHIP も入る。2026-09-27 から、経験値 1 につき CHIP 3 (それより前は 1)。
 *   前の分まで 3 倍にすると、長く遊んだ人がガチャをいっぺんにそろえきってしまうので、この日からの分だけ。
 *   日時は戦績 (records の at) と経験値の帳簿 (xp.js の at) から取るので、端末をまたいでも同じ数になる
 * ========================================================================= */
import { playerXp } from './stats-data.js';
import { localRecords } from './stats.js';
import { xpLog } from './xp.js';

export const CHIP_PER_XP = 3;
export const CHIP_BOOST_FROM = Date.parse('2026-09-27T15:00:00+09:00');

/** records・log を渡せば、その分だけで数える (確認用) */
export function earnedChips(records = localRecords(), log = xpLog()) {
  const before = records.filter(r => !(r.at >= CHIP_BOOST_FROM));
  const after = records.filter(r => r.at >= CHIP_BOOST_FROM);
  let chips = playerXp(before) + playerXp(after) * CHIP_PER_XP;
  for (const e of log) chips += e.at >= CHIP_BOOST_FROM ? e.xp * CHIP_PER_XP : e.xp;
  return chips;
}
