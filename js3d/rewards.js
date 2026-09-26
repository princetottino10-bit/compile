/* =========================================================================
 * レベルアップの報酬 (見た目と記念だけ。強さは変わらない)
 *   kind: mat (盤面) / sleeve (カードの裏面) / marker (コントロールマーカー) / ccolor (自分のコンパイルの光)
 *         victory (勝ちの演出) / title (称号) / icon (アイコンを選べる)
 *   選ぶのは設定の「見た目」(cosmetics-ui.js)。レベルは stats-data.js の playerLevel
 * ========================================================================= */
import { protocolSummary } from './stats-data.js';

export const REWARDS = [
  { lv: 2, kind: 'sleeve', key: 'crimson', name: 'SLEEVE — CRIMSON' },
  { lv: 3, kind: 'mat', key: 'nebula', name: 'PLAYMAT — NEBULA' },
  { lv: 4, kind: 'marker', key: 'gold', name: 'CONTROL MARKER — GOLD' },
  { lv: 5, kind: 'title', key: 'compiler', name: 'TITLE — COMPILER' },
  { lv: 5, kind: 'icon', key: 'icon', name: 'PROFILE ICON' },
  { lv: 6, kind: 'mat', key: 'vortex', name: 'PLAYMAT — VORTEX' },
  { lv: 7, kind: 'sleeve', key: 'circuit', name: 'SLEEVE — CIRCUIT' },
  { lv: 8, kind: 'ccolor', key: 'gold', name: 'COMPILE FX — GOLD' },
  { lv: 9, kind: 'marker', key: 'crystal', name: 'CONTROL MARKER — CRYSTAL' },
  { lv: 10, kind: 'mat', key: 'biomech', name: 'PLAYMAT — BIOMECH' },
  { lv: 10, kind: 'title', key: 'veteran', name: 'TITLE — VETERAN' },
  { lv: 11, kind: 'ccolor', key: 'cyan', name: 'COMPILE FX — CYAN' },
  { lv: 12, kind: 'victory', key: 'aurora', name: 'VICTORY FX — AURORA' },
  { lv: 13, kind: 'sleeve', key: 'void', name: 'SLEEVE — VOID' },
  { lv: 14, kind: 'title', key: 'tactician', name: 'TITLE — TACTICIAN' },
  { lv: 15, kind: 'sleeve', key: 'holo', name: 'SLEEVE — HOLO' },
  { lv: 15, kind: 'title', key: 'expert', name: 'TITLE — EXPERT' },
  { lv: 16, kind: 'marker', key: 'crimson', name: 'CONTROL MARKER — CRIMSON' },
  { lv: 17, kind: 'ccolor', key: 'rainbow', name: 'COMPILE FX — RAINBOW' },
  { lv: 18, kind: 'sleeve', key: 'sakura', name: 'SLEEVE — SAKURA' },
  { lv: 19, kind: 'title', key: 'architect', name: 'TITLE — ARCHITECT' },
  { lv: 20, kind: 'mat', key: 'prism', name: 'PLAYMAT — PRISM' },
  { lv: 20, kind: 'title', key: 'master', name: 'TITLE — MASTER' },
  { lv: 22, kind: 'mat', key: 'eclipse', name: 'PLAYMAT — ECLIPSE' },
  { lv: 24, kind: 'marker', key: 'prism', name: 'CONTROL MARKER — PRISM' },
  { lv: 25, kind: 'title', key: 'legend', name: 'TITLE — LEGEND' },
  { lv: 27, kind: 'sleeve', key: 'aurum', name: 'SLEEVE — AURUM' },
  { lv: 30, kind: 'title', key: 'ascended', name: 'TITLE — ASCENDED' }
];

/* 見た目の選択肢 (default ははじめから)。名前は設定の画面に出す */
/* プロトコルの習熟度で開く見た目 (30 プロトコルそれぞれ): 3 で名札・6 で称号・9 でプレイマット。
   key は小文字のプロトコル名に p_ (名札・マット) / m_ (称号) を付けたもの */
export const MASTERY_PROTOS = ['DARKNESS', 'DEATH', 'FIRE', 'GRAVITY', 'LIFE', 'LIGHT', 'METAL', 'PLAGUE', 'PSYCHIC', 'SPEED', 'SPIRIT', 'WATER',
  'APATHY', 'HATE', 'LOVE', 'CHAOS', 'CLARITY', 'CORRUPTION', 'COURAGE', 'FEAR', 'ICE', 'LUCK', 'MIRROR', 'PEACE', 'SMOKE', 'TIME', 'WAR',
  'ASSIMILATION', 'DIVERSITY', 'UNITY'];
export const MASTERY_STEP = { plate: 3, title: 6, mat: 9 };
const PROTO_TITLES = {
  DARKNESS: 'SHADOWBORN', DEATH: 'REAPER', FIRE: 'PYROMANCER', GRAVITY: 'GRAVITON', LIFE: 'LIFEWEAVER', LIGHT: 'LUMINARY',
  METAL: 'IRONCLAD', PLAGUE: 'PLAGUEBEARER', PSYCHIC: 'MINDBENDER', SPEED: 'SPEEDSTER', SPIRIT: 'SPIRITWALKER', WATER: 'TIDECALLER',
  APATHY: 'STOIC', HATE: 'HATEMONGER', LOVE: 'HEARTBINDER', CHAOS: 'CHAOS AGENT', CLARITY: 'CLAIRVOYANT', CORRUPTION: 'CORRUPTOR',
  COURAGE: 'LIONHEART', FEAR: 'DREADLORD', ICE: 'FROSTWARDEN', LUCK: 'WILDCARD', MIRROR: 'REFLECTOR', PEACE: 'PEACEKEEPER',
  SMOKE: 'SMOKESCREEN', TIME: 'CHRONOMANCER', WAR: 'WARLORD', ASSIMILATION: 'ASSIMILATOR', DIVERSITY: 'POLYMATH', UNITY: 'UNIFIER'
};
const pkey = (p) => 'p_' + p.toLowerCase();
const mkey = (p) => 'm_' + p.toLowerCase();

export const COSMETICS = {
  mat: [['neon', 'NEON GRID'], ['nebula', 'NEBULA'], ['vortex', 'VORTEX'], ['biomech', 'BIOMECH'], ['prism', 'PRISM'], ['eclipse', 'ECLIPSE'],
    ['celestial', 'CELESTIAL'], ['hokusai', 'FUJI'], ['seigaiha', 'GREAT WAVE'], ['sakura', 'YOZAKURA'], ['garden', 'ROSE GARDEN'], ['library', 'LIBRARY'],
    ...MASTERY_PROTOS.map(p => [pkey(p), p])],
  sleeve: [['default', 'STANDARD'], ['crimson', 'CRIMSON'], ['circuit', 'CIRCUIT'], ['void', 'VOID'], ['holo', 'HOLO'], ['sakura', 'SAKURA'], ['aurum', 'AURUM'],
    ['mint', 'MINT'], ['ocean', 'OCEAN'], ['ember', 'EMBER'], ['glacier', 'GLACIER'], ['toxic', 'TOXIC'], ['galaxy', 'GALAXY'],
    ['tiger', 'TIGER'], ['pixel', 'PIXEL'], ['koi', 'KOI'], ['aurora', 'AURORA'], ['nyanko', 'NYANKO'], ['sweets', 'SWEETS'], ['bunny', 'BUNNY'], ['rose', 'ROSE'], ['butterfly', 'GOLDEN BUTTERFLY'], ['momiji', 'MOMIJI'], ['sprout', 'SPROUT'], ['konpairu', 'KONPAIRU'], ['teaparty', 'TEA PARTY'],
    ['slayer', 'GIANT SLAYER'], ['laurel', 'LAUREL']],
  marker: [['default', 'STANDARD'], ['gold', 'GOLD'], ['crystal', 'CRYSTAL'], ['crimson', 'CRIMSON'], ['prism', 'PRISM'],
    ['emerald', 'EMERALD'], ['amber', 'AMBER'], ['sapphire', 'SAPPHIRE'], ['obsidian', 'OBSIDIAN'], ['nova', 'NOVA'],
    ['slayer', 'GIANT SLAYER'], ['laurel', 'LAUREL']],
  ccolor: [['default', 'PROTOCOL'], ['gold', 'GOLD'], ['cyan', 'CYAN'], ['rainbow', 'RAINBOW'], ['lime', 'LIME'], ['violet', 'VIOLET'], ['ember', 'EMBER']],
  victory: [['default', 'STANDARD'], ['aurora', 'AURORA']],
  /* 対戦中の名札の枠 (相手にも見える) */
  plate: [['default', 'STANDARD'], ['gold', 'GOLD'], ['sakura', 'SAKURA'], ['washi', 'WASHI'], ['neon', 'NEON'], ['urushi', 'URUSHI'],
    ['crystal', 'CRYSTAL'], ['royal', 'ROYAL'], ...MASTERY_PROTOS.map(p => [pkey(p), p])]
};

/* ガチャ (COSMETICS の GACHA) でしか出ない見た目と称号。rar: C / R / E / L。
   持っているかは compileGacha (gacha.js が書く) の owned { 'kind:key': 取った時刻 } で見る */
export const GACHA_ITEMS = [
  { kind: 'sleeve', key: 'mint', rar: 'C' }, { kind: 'sleeve', key: 'ocean', rar: 'C' },
  { kind: 'marker', key: 'emerald', rar: 'C' }, { kind: 'marker', key: 'amber', rar: 'C' }, { kind: 'ccolor', key: 'lime', rar: 'C' },
  { kind: 'sleeve', key: 'ember', rar: 'R' }, { kind: 'sleeve', key: 'glacier', rar: 'R' }, { kind: 'marker', key: 'sapphire', rar: 'R' },
  { kind: 'ccolor', key: 'violet', rar: 'R' }, { kind: 'title', key: 'gambler', rar: 'R' },
  { kind: 'sleeve', key: 'toxic', rar: 'E' }, { kind: 'marker', key: 'obsidian', rar: 'E' }, { kind: 'ccolor', key: 'ember', rar: 'E' },
  { kind: 'title', key: 'highroller', rar: 'E' },
  { kind: 'sleeve', key: 'galaxy', rar: 'L' }, { kind: 'marker', key: 'nova', rar: 'L' }, { kind: 'title', key: 'fortune', rar: 'L' },
  { kind: 'sleeve', key: 'nyanko', rar: 'R' }, { kind: 'sleeve', key: 'sweets', rar: 'C' }, { kind: 'sleeve', key: 'bunny', rar: 'E' },
  { kind: 'sleeve', key: 'rose', rar: 'E' }, { kind: 'sleeve', key: 'butterfly', rar: 'L' }, { kind: 'sleeve', key: 'momiji', rar: 'R' }, { kind: 'sleeve', key: 'konpairu', rar: 'E' }, { kind: 'sleeve', key: 'teaparty', rar: 'R' },
  /* 名札の枠 */
  { kind: 'plate', key: 'gold', rar: 'R' }, { kind: 'plate', key: 'sakura', rar: 'R' }, { kind: 'plate', key: 'washi', rar: 'R' },
  { kind: 'plate', key: 'neon', rar: 'R' }, { kind: 'plate', key: 'urushi', rar: 'E' }, { kind: 'plate', key: 'crystal', rar: 'E' },
  { kind: 'plate', key: 'royal', rar: 'L' },
  /* 絵のプレイマット */
  { kind: 'mat', key: 'hokusai', rar: 'R' }, { kind: 'mat', key: 'sakura', rar: 'R' }, { kind: 'mat', key: 'garden', rar: 'R' },
  { kind: 'mat', key: 'library', rar: 'E' }, { kind: 'mat', key: 'celestial', rar: 'E' }, { kind: 'mat', key: 'seigaiha', rar: 'L' },
  { kind: 'sleeve', key: 'tiger', rar: 'R' }, { kind: 'sleeve', key: 'pixel', rar: 'R' }, { kind: 'sleeve', key: 'koi', rar: 'E' }, { kind: 'sleeve', key: 'aurora', rar: 'L' }
];
/* 下剋上 (最弱のデッキで最強に勝つ) の褒美。勝った記録 (compileSoloRecords に level 20 の勝ち) があれば使える */
export const UNDERDOG_ITEMS = [{ kind: 'sleeve', key: 'slayer' }, { kind: 'marker', key: 'slayer' }];
export const UNDERDOG_XP = 100;
const isUnderdogItem = (kind, key) => UNDERDOG_ITEMS.some(g => g.kind === kind && g.key === key);
export function underdogCleared() {
  try {
    const list = JSON.parse(localStorage.getItem('compileSoloRecords') || '[]');
    return Array.isArray(list) && list.some(r => r && r.win && r.level === 20);
  } catch (e) {
    return false;
  }
}

/* 週替わり3連戦の褒美。クリアした週の数 (経験値の帳簿の k:wk:W…) で開く */
/* プロトコルの習熟度で開く見た目 (そのプロトコルを遊び込んだ証)。mastery: 習熟度 (1〜10) */
export const MASTERY_ITEMS = [
  { kind: 'sleeve', key: 'sprout', proto: 'LIFE', mastery: 5 },
  ...MASTERY_PROTOS.flatMap(p => [
    { kind: 'plate', key: pkey(p), proto: p, mastery: MASTERY_STEP.plate },
    { kind: 'title', key: mkey(p), proto: p, mastery: MASTERY_STEP.title },
    { kind: 'mat', key: pkey(p), proto: p, mastery: MASTERY_STEP.mat }
  ])
];
export function masteryItem(kind, key) {
  return MASTERY_ITEMS.find(g => g.kind === kind && g.key === key) || null;
}
/* そのプロトコルの今の習熟度 (記録から数える) */
export function protoMastery(name) {
  const t = masterySummary().get(name);
  return t ? t.mastery.level : 0;
}
/* 記録から数えた習熟度の一覧。同じ記録なら数え直さない (称号の一覧などで何度も呼ぶため) */
let summaryCache = { raw: null, map: new Map() };
function masterySummary() {
  try {
    const raw = localStorage.getItem('compileSoloRecords') || '[]';
    if (raw !== summaryCache.raw) {
      const list = JSON.parse(raw);
      summaryCache = { raw, map: protocolSummary(Array.isArray(list) ? list.filter(r => r && r.mode !== 'tutorial') : []) };
    }
    return summaryCache.map;
  } catch (e) {
    return new Map();
  }
}

export const WEEKLY_ITEMS = [
  { kind: 'sleeve', key: 'laurel', weeks: 1 },
  { kind: 'marker', key: 'laurel', weeks: 3 },
  { kind: 'title', key: 'regular', weeks: 3 },
  { kind: 'title', key: 'weeklylegend', weeks: 10 }
];
export function weeklyClears() {
  try {
    const list = JSON.parse(localStorage.getItem('compileXpLog') || '[]');
    const ids = (Array.isArray(list) ? list : []).map(e => e && (e.id || (e.key ? 'k:' + e.key : ''))).filter(id => /^k:wk:W\d+$/.test(id || ''));
    return new Set(ids).size;
  } catch (e) {
    return 0;
  }
}
const weeklyItem = (kind, key) => WEEKLY_ITEMS.find(g => g.kind === kind && g.key === key);

const GACHA_KEY = 'compileGacha';
export const gachaId = (kind, key) => kind + ':' + key;
const isGachaItem = (kind, key) => GACHA_ITEMS.some(g => g.kind === kind && g.key === key);
/** ガチャで取った見た目 { 'kind:key': 時刻 } */
export function gachaOwned() {
  try {
    const s = JSON.parse(localStorage.getItem(GACHA_KEY) || 'null');
    return s && s.owned && typeof s.owned === 'object' ? s.owned : {};
  } catch (e) {
    return {};
  }
}
/** 見た目の名前 (ガチャの結果・図鑑に出す) */
export function itemName(kind, key) {
  if (kind === 'title') return 'TITLE — ' + (TITLES[key] || key);
  const row = (COSMETICS[kind] || []).find(([k]) => k === key);
  const label = { sleeve: 'SLEEVE', marker: 'CONTROL MARKER', ccolor: 'COMPILE FX', mat: 'PLAYMAT', victory: 'VICTORY FX',
    plate: 'NAMEPLATE' }[kind] || kind.toUpperCase();
  return label + ' — ' + (row ? row[1] : key);
}

/* 称号 (レベルのもの + 条件で取るもの)。オンラインで相手に見せるので、サーバー (secure-room の BADGES) にも同じ key を並べる */
export const TITLES = {
  compiler: 'COMPILER', veteran: 'VETERAN', tactician: 'TACTICIAN', expert: 'EXPERT', architect: 'ARCHITECT',
  master: 'MASTER', legend: 'LEGEND', ascended: 'ASCENDED', underdog: 'GIANT SLAYER',     // 下剋上 (key はサーバー・保存と揃えて underdog のまま)
  /* プロトコルの習熟度 6 で取る */
  ...Object.fromEntries(MASTERY_PROTOS.map(p => [mkey(p), PROTO_TITLES[p]])),
  /* 実績で取る (cosmetics-ui.js の TROPHY_TITLES) */
  chainer: 'CHAIN MASTER', flawless: 'FLAWLESS', grandmaster: 'GRANDMASTER',
  puzzler: 'PUZZLER', compuzzler: 'COMPUZZLER',       // COMPUZZLE の中級を全部 / 全部
  platinum: 'PLATINUM',    // 実績をすべて取る (achievements.js)
  /* ガチャで取る (GACHA_ITEMS) */
  gambler: 'GAMBLER', highroller: 'HIGH ROLLER', fortune: 'FORTUNE',
  /* 週替わり3連戦 (WEEKLY_ITEMS) */
  regular: 'WEEKLY REGULAR', weeklylegend: 'WEEKLY LEGEND'
};

/* 全部解放 (管理者のテスト用。ADMIN 画面で切り替え、このブラウザに残す)。見た目と称号だけで、強さは変わらない */
const UNLOCK_KEY = 'compileUnlockAll';
let unlockAll = false;
try { unlockAll = localStorage.getItem(UNLOCK_KEY) === '1'; } catch (e) { /* node / private mode */ }
export function isUnlockAll() { return unlockAll; }
export function setUnlockAll(on) {
  unlockAll = !!on;
  try { if (unlockAll) localStorage.setItem(UNLOCK_KEY, '1'); else localStorage.removeItem(UNLOCK_KEY); } catch (e) { /* private mode */ }
}

/* その見た目を解放するレベル (はじめからなら 1) */
export function unlockLevel(kind, key) {
  if (unlockAll) return 1;
  /* ガチャの見た目はレベルでは開かない (取っていれば 1、取っていなければ届かない数) */
  if (isGachaItem(kind, key)) return gachaOwned()[gachaId(kind, key)] ? 1 : 9999;
  if (isUnderdogItem(kind, key)) return underdogCleared() ? 1 : 9999;
  const m = masteryItem(kind, key);
  if (m) return protoMastery(m.proto) >= m.mastery ? 1 : 9999;
  if (weeklyItem(kind, key)) return weeklyClears() >= weeklyItem(kind, key).weeks ? 1 : 9999;
  const r = REWARDS.find(x => x.kind === kind && x.key === key);
  return r ? r.lv : 1;
}

export function isUnlocked(kind, key, level) {
  return level >= unlockLevel(kind, key);
}

/* from より上 〜 to までのレベルで手に入る報酬 (レベルアップの演出に使う) */
export function rewardsBetween(from, to) {
  return REWARDS.filter(r => r.lv > from && r.lv <= to);
}

/* 次にもらえる報酬 (無ければ null) */
export function nextReward(level) {
  return REWARDS.find(r => r.lv > level) || null;
}

/* 取った称号の key。extra: 条件で取る称号 (下剋上など) */
export function ownedTitles(level, extra) {
  if (unlockAll) return Object.keys(TITLES);
  const own = REWARDS.filter(r => r.kind === 'title' && r.lv <= level).map(r => r.key);
  const owned = gachaOwned();
  const gacha = GACHA_ITEMS.filter(g => g.kind === 'title' && owned[gachaId('title', g.key)]).map(g => g.key)
    .concat(WEEKLY_ITEMS.filter(g => g.kind === 'title' && weeklyClears() >= g.weeks).map(g => g.key))
    .concat(MASTERY_ITEMS.filter(g => g.kind === 'title' && protoMastery(g.proto) >= g.mastery).map(g => g.key));
  return own.concat([...(extra || []), ...gacha].filter((k, i, a) => TITLES[k] && !own.includes(k) && a.indexOf(k) === i));
}
