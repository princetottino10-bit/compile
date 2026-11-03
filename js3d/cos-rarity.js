/* =========================================================================
 * 見た目のレア度 (COLLECTION の枠の色・印・光り方に使う)
 *   ガチャの品物はガチャのレア度そのまま。ほかは手に入れる難しさで決める:
 *   レベルの報酬は解放のレベル、習熟度は段階、実績の称号は実績の段階 (銀=EPIC / 金=LEGENDARY)。
 *   はじめから持っているものと、出す前のキャラは印なし (null)
 * ========================================================================= */
import { REWARDS, GACHA_ITEMS, UNDERDOG_ITEMS, WEEKLY_ITEMS, FREE_ITEMS, trophyItem, masteryItem, MASTERY_STEP } from './rewards.js';
import { TROPHIES } from './achievements.js';

export const RARITIES = ['C', 'R', 'E', 'L'];
export const RARITY_NAME = { C: 'COMMON', R: 'RARE', E: 'EPIC', L: 'LEGENDARY' };

/* 実績の称号 (cosmetics-ui.js の TROPHY_TITLES と同じ対応。循環を避けてここでも持つ) */
const TROPHY_OF_TITLE = { flawless: 'flawless', grandmaster: 'mastery10', puzzler: 'tsume_mid', compuzzler: 'tsume_all',
  conqueror: 'conqueror', underdogduo: 'underdog_tag', tagmaster: 'tag_all', perfectsync: 'tag_flawless',
  botbreaker: 'solo_regular', rootaccess: 'solo_advanced', sevensins: 'sins7', tristate: 'tristate',
  thirdwave: 'm3_all', vanguard: 'm3_pure', debugger: 'solo_wins20', unbroken: 'streak10', neworder: 'm3_conquer', deadlysin: 'sins_apex', hardstate: 'aux3_apex', sineater: 'sins_mastery', dataminer: 'm3_cards', zeroday: 'solo_m3', gatecrasher: 'apex50', legion: 'wins300', immortal: 'wins1000', pantheon: 'mastery10x5', omniprotocol: 'mastery6_all', kernelpanic: 'solo_flawless', shutdown: 'apex_shutout', overflow: 'maxline30', singularity: 'turnfx20' };
const TIER_RAR = { bronze: 'R', silver: 'E', gold: 'L', platinum: 'L' };

/* レベルの報酬: 低いほどありふれている */
function levelRarity(lv) {
  return lv <= 9 ? 'C' : lv <= 19 ? 'R' : lv <= 27 ? 'E' : 'L';
}

/**
 * kind / key の品物のレア度 ('C' / 'R' / 'E' / 'L')。印を付けないものは null
 * @param {{ defaultKey?: string, shopPrice?: number }} [opt] はじめからの品物のキー・CHIP の値段
 */
export function rarityOf(kind, key, opt = {}) {
  if (key === '' || key === opt.defaultKey || FREE_ITEMS.some(x => x.kind === kind && x.key === key)) return null;
  const g = GACHA_ITEMS.find(x => x.kind === kind && x.key === key);
  if (g) return g.rar;
  if (opt.shopPrice) return opt.shopPrice >= 150 ? 'E' : 'R';
  if (UNDERDOG_ITEMS.some(x => x.kind === kind && x.key === key) || (kind === 'title' && key === 'underdog')) return 'E';
  const m = masteryItem(kind, key);
  /* 習熟度の品物はプロトコルの数だけある (27 枚の盤面を LEGENDARY にすると薄まる) ので、いちばん上の盤面でも EPIC */
  if (m) return m.mastery >= MASTERY_STEP.mat ? 'E' : 'R';
  /* 実績の褒美の見た目は、称号と同じく実績の段階で決める */
  const ti = trophyItem(kind, key);
  if (ti) { const t = TROPHIES.find(x => x.id === ti.trophy); return t ? TIER_RAR[t.tier] || 'E' : 'E'; }
  const w = WEEKLY_ITEMS.find(x => x.kind === kind && x.key === key);
  /* 週替わりの褒美は3連戦を勝ち抜いた証なので高め (2026-11-03 に R/E → E/L) */
  if (w) return w.weeks >= 3 ? 'L' : 'E';
  if (kind === 'title') {
    if (key === 'platinum' || key === 'deicide' || key === 'blindspot') return 'L';
    const t = TROPHIES.find(x => x.id === TROPHY_OF_TITLE[key]);
    if (t) return TIER_RAR[t.tier] || 'E';
  }
  if (kind === 'icon') return 'C';
  const r = REWARDS.find(x => x.kind === kind && x.key === key);
  return r ? levelRarity(r.lv) : null;
}
