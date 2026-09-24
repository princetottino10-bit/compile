/* =========================================================================
 * 設定の「見た目」の段: レベルの報酬 (rewards.js) を選ぶ
 *   盤面・カードの裏面・コントロールマーカー・コンパイルの光・勝ちの演出・称号・アイコン
 *   まだのものは鍵と、解放されるレベルを出す
 * ========================================================================= */
import { COSMETICS, TITLES, unlockLevel, ownedTitles } from './rewards.js';
import { playerLevel } from './stats-data.js';
import { localRecords } from './stats.js';
import { UNDERDOG_LEVEL } from './aidecks.js';
import { emblemDataURL } from './emblems.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const LABELS = { mat: '盤面', sleeve: 'カードの裏面', marker: 'コントロールマーカー', ccolor: '自分のコンパイルの光', victory: '勝ちの演出' };
const DEFAULT_KEY = { mat: 'neon', sleeve: 'default', marker: 'default', ccolor: 'default', victory: 'default' };

/* 条件で取る称号 (レベル以外) */
export function extraTitles(records) {
  return records.some(r => r.win && r.level === UNDERDOG_LEVEL) ? ['underdog'] : [];
}

/* プロフィール (タイトル画面・戦績に出す): { level, title, icon } */
export function profileOf(settings, records) {
  const level = playerLevel(records).level;
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
  const level = playerLevel(recs).level;
  const row = (kind) => '<div class="st-cos"><span>' + LABELS[kind] + '</span><div class="st-opts">' + COSMETICS[kind].map(([key, name]) => {
    const need = unlockLevel(kind, key);
    const open = level >= need;
    const cur = (s[kind] || DEFAULT_KEY[kind]) === key;
    return '<button type="button" data-cos="' + kind + '" data-key="' + key + '" class="st-opt ' + kind + '-' + key + (cur ? ' on' : '') + '"' +
      (open ? '' : ' disabled title="レベル ' + need + 'で解放"') + '><i></i><b>' + esc(name) + '</b>' + (open ? '' : '<small>🔒 Lv' + need + '</small>') + '</button>';
  }).join('') + '</div></div>';
  const titles = ownedTitles(level, extraTitles(recs));
  const titleRow = '<div class="st-cos"><span>称号</span><div class="st-opts">' +
    '<button type="button" data-cos="title" data-key="" class="st-opt' + (!s.title ? ' on' : '') + '"><b>つけない</b></button>' +
    Object.entries(TITLES).map(([key, name]) => {
      const open = titles.includes(key);
      const need = key === 'underdog' ? '下剋上で勝つ' : 'Lv' + (unlockLevel('title', key));
      return '<button type="button" data-cos="title" data-key="' + key + '" class="st-opt' + (s.title === key ? ' on' : '') + '"' +
        (open ? '' : ' disabled') + '><b>' + esc(name) + '</b>' + (open ? '' : '<small>🔒 ' + need + '</small>') + '</button>';
    }).join('') + '</div></div>';
  const iconOpen = level >= unlockLevel('icon', 'icon');
  const iconRow = '<div class="st-cos"><span>アイコン' + (iconOpen ? '' : ' <small>🔒 Lv' + unlockLevel('icon', 'icon') + '</small>') + '</span>' +
    (iconOpen
      ? '<div class="st-icons">' + '<button type="button" data-cos="icon" data-key="" class="st-ic' + (!s.icon ? ' on' : '') + '" aria-label="アイコンなし">—</button>' +
        (protocols || []).map(p => '<button type="button" data-cos="icon" data-key="' + esc(p.name) + '" class="st-ic' + (s.icon === p.name ? ' on' : '') +
          '" title="' + esc(p.name) + '" aria-label="' + esc(p.name) + '"><img alt="" src="' + emblemDataURL(p.name, p.color || '#63f3ff', 40, true) + '"></button>').join('') + '</div>'
      : '') + '</div>';
  return '<div class="st-cosmetics"><div class="st-cos-head"><b>見た目</b><small>レベル ' + level + ' ・ レベルを上げると増えます (戦績の「まとめ」で次の報酬を確認できます)</small></div>' +
    row('mat') + row('sleeve') + row('marker') + row('ccolor') + row('victory') + titleRow + iconRow + '</div>';
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
