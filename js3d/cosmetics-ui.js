/* =========================================================================
 * 設定の「見た目」の段: レベルの報酬 (rewards.js) を選ぶ
 *   盤面・カードの裏面・コントロールマーカー・コンパイルの光・勝ちの演出・称号・アイコン
 *   まだのものは鍵と、解放されるレベルを出す
 * ========================================================================= */
import { hasPlatinum } from './achievements.js';
import { bonusXp } from './xp.js';
import { COSMETICS, TITLES, unlockLevel, ownedTitles } from './rewards.js';
import { playerLevel } from './stats-data.js';
import { localRecords } from './stats.js';
import { UNDERDOG_LEVEL } from './aidecks.js';
import { emblemDataURL } from './emblems.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const LABELS = { mat: 'PLAYMAT', sleeve: 'SLEEVE', marker: 'CONTROL MARKER', ccolor: 'COMPILE FX', victory: 'VICTORY FX' };
const DEFAULT_KEY = { mat: 'neon', sleeve: 'default', marker: 'default', ccolor: 'default', victory: 'default' };

/* 条件で取る称号 (レベル以外) */
export function extraTitles(records) {
  const out = records.some(r => r.win && r.level === UNDERDOG_LEVEL) ? ['underdog'] : [];
  return hasPlatinum() ? out.concat('platinum') : out;
}

/* プロフィール (タイトル画面・戦績に出す): { level, title, icon } */
export function profileOf(settings, records) {
  const level = playerLevel(records, bonusXp()).level;
  const titles = ownedTitles(level, extraTitles(records));
  const title = titles.includes(settings.title) ? TITLES[settings.title] : '';
  const icon = level >= unlockLevel('icon', 'icon') && settings.icon ? settings.icon : '';
  return { level, title, icon };
}

/* アイコンに並べるプロトコル (main.js が起動時に渡す) */
let protoList = [];
export function setCosmeticProtocols(list) { protoList = list || []; }

export function cosmeticsHtml(s, protocols) {
  protocols = protocols || protoList;
  const recs = localRecords();
  const level = playerLevel(recs, bonusXp()).level;
  /* 取る前の見た目は出さない (レベルアップで初めて明かす)。まだあることだけ「+N」で示す */
  let locked = 0;
  const row = (kind) => {
    const open = COSMETICS[kind].filter(([key]) => level >= unlockLevel(kind, key));
    locked += COSMETICS[kind].length - open.length;
    return '<div class="st-cos"><span>' + LABELS[kind] + '</span><div class="st-opts">' + open.map(([key, name]) => {
      const cur = (s[kind] || DEFAULT_KEY[kind]) === key;
      return '<button type="button" data-cos="' + kind + '" data-key="' + key + '" class="st-opt ' + kind + '-' + key + (cur ? ' on' : '') + '">' +
        '<i></i><b>' + esc(name) + '</b></button>';
    }).join('') + (open.length < COSMETICS[kind].length ? '<span class="st-more">+' + (COSMETICS[kind].length - open.length) + '</span>' : '') + '</div></div>';
  };
  const titles = ownedTitles(level, extraTitles(recs));
  const titleRow = '<div class="st-cos"><span>称号</span><div class="st-opts">' +
    '<button type="button" data-cos="title" data-key="" class="st-opt' + (!s.title ? ' on' : '') + '"><b>つけない</b></button>' +
    Object.entries(TITLES).filter(([key]) => titles.includes(key)).map(([key, name]) =>
      '<button type="button" data-cos="title" data-key="' + key + '" class="st-opt' + (s.title === key ? ' on' : '') + '"><b>' + esc(name) + '</b></button>'
    ).join('') + (titles.length < Object.keys(TITLES).length ? '<span class="st-more">+' + (Object.keys(TITLES).length - titles.length) + '</span>' : '') +
    '</div></div>';
  const iconOpen = level >= unlockLevel('icon', 'icon');
  const iconRow = !iconOpen ? '' : '<div class="st-cos"><span>PROFILE ICON</span>' +
    (iconOpen
      ? '<div class="st-icons">' + '<button type="button" data-cos="icon" data-key="" class="st-ic' + (!s.icon ? ' on' : '') + '" aria-label="アイコンなし">—</button>' +
        (protocols || []).map(p => '<button type="button" data-cos="icon" data-key="' + esc(p.name) + '" class="st-ic' + (s.icon === p.name ? ' on' : '') +
          '" title="' + esc(p.name) + '" aria-label="' + esc(p.name) + '"><img alt="" src="' + emblemDataURL(p.name, p.color || '#b9a4ff', 40, true) + '"></button>').join('') + '</div>'
      : '') + '</div>';
  const rows = row('mat') + row('sleeve') + row('marker') + row('ccolor') + row('victory');
  return '<div class="st-cosmetics"><div class="st-cos-head"><b>COSMETICS</b><small>LV ' + level + ' ・ 「+」はまだ見ぬ見た目。レベルを上げると明かされます</small></div>' +
    rows + titleRow.replace('<span>称号</span>', '<span>TITLE</span>').replace('<b>つけない</b>', '<b>NONE</b>') + iconRow + '</div>';
}

/* 押したら保存して、同じ段の印を付け替える */
export function bindCosmetics(el, setSetting) {
  el.querySelectorAll('[data-cos]').forEach(b => {
    b.onclick = () => {
      if (b.disabled) return;
      const kind = b.dataset.cos;
      setSetting(kind, b.dataset.key);
      el.querySelectorAll('[data-cos="' + kind + '"]').forEach(x => x.classList.toggle('on', x === b));
    };
  });
}
