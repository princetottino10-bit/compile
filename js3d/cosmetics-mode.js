/* =========================================================================
 * COSMETICS (見た目) のモード。タイトル・プロフィール・設定から開く
 *   種類ごとのタブ (盤面・スリーブ・マーカー・コンパイルの光・勝ちの演出・称号・アイコン)。
 *   左に実物どおりの大きなプレビュー (スリーブはカードの裏面、盤面は柄そのもの)、右に図鑑。
 *   まだ持っていないものも並べ、手に入れ方を書く (押すとプレビューだけ見られる)。
 *   新しく手に入れたものには NEW (見た印は compileCosSeen、このブラウザだけ)
 * ========================================================================= */
import { COSMETICS, TITLES, REWARDS, GACHA_ITEMS, UNDERDOG_ITEMS, WEEKLY_ITEMS, masteryItem, protoMastery, unlockLevel, ownedTitles } from './rewards.js';
import { extraTitles, TROPHY_TITLES } from './cosmetics-ui.js';
import { settings, setSetting } from './settings.js';
import { playerLevel } from './stats-data.js';
import { localRecords } from './stats.js';
import { bonusXp } from './xp.js';
import { backTex, onSleeveArt } from './cardtex.js';
import { playmatTexture, matArtURL } from './playmat.js';
import { markerPreviewURL } from './control.js';
import { emblemDataURL } from './emblems.js';
import { displayName } from './displayname.js';
import { openGacha, chipsNow } from './gacha-ui.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEEN_KEY = 'compileCosSeen';

const TABS = [
  { kind: 'mat', label: '盤面' }, { kind: 'sleeve', label: 'スリーブ' }, { kind: 'marker', label: 'マーカー' },
  { kind: 'ccolor', label: 'コンパイルの光' }, { kind: 'victory', label: '勝ちの演出' }, { kind: 'title', label: '称号' }, { kind: 'icon', label: 'アイコン' },
  { kind: 'plate', label: '名札' }
];
const DEFAULT_KEY = { mat: 'neon', sleeve: 'default', marker: 'default', ccolor: 'default', victory: 'default', title: '', icon: '',
  plate: 'default' };
const RAR_NAME = { C: 'COMMON', R: 'RARE', E: 'EPIC', L: 'LEGENDARY' };
const TROPHY_NAME = { chain4: 'CHAIN REACTION', flawless: 'FLAWLESS', mastery10: 'GRANDMASTER', tsume_mid: '詰めコンパイル 中級を全部', tsume_all: '詰めコンパイル 全部' };
const CCOLOR = { default: 'linear-gradient(90deg,#ff5c5c,#b9a4ff,#a07bff)', gold: '#ffd86a', cyan: '#7ff3ff', rainbow: 'conic-gradient(#ff5f7a,#ffc05a,#7df28c,#5ab8ff,#b98cff,#ff5f7a)',
  lime: '#b6ff4a', violet: '#b07bff', ember: '#ff7a2e' };

let protoList = [];
export function setCosmeticsProtocols(list) { protoList = list || []; }

/* ---------- 持っているか・手に入れ方 ---------- */
function ctx() {
  const recs = localRecords();
  const level = playerLevel(recs, bonusXp()).level;
  return { level, titles: ownedTitles(level, extraTitles(recs)) };
}
function itemsOf(kind) {
  if (kind === 'title') return [['', 'なし']].concat(Object.entries(TITLES));
  if (kind === 'icon') return [['', 'なし']].concat(protoList.map(p => [p.name, p.name]));
  return COSMETICS[kind] || [];
}
function owned(kind, key, c) {
  if (key === '' || key === DEFAULT_KEY[kind]) return true;
  if (kind === 'title') return c.titles.includes(key);
  if (kind === 'icon') return c.level >= unlockLevel('icon', 'icon');
  return c.level >= unlockLevel(kind, key);
}
function sourceOf(kind, key) {
  if (key === '' || key === DEFAULT_KEY[kind]) return 'はじめから';
  if (kind === 'icon') return 'LV ' + unlockLevel('icon', 'icon') + ' で解放';
  const g = GACHA_ITEMS.find(x => x.kind === kind && x.key === key);
  if (g) return 'GACHA (' + RAR_NAME[g.rar] + ')';
  if (UNDERDOG_ITEMS.some(x => x.kind === kind && x.key === key) || (kind === 'title' && key === 'underdog')) return '下剋上に勝つ';
  const m = masteryItem(kind, key);
  if (m) return m.proto + ' の習熟度 ' + m.mastery + ' (いま ' + protoMastery(m.proto) + ')';
  const w = WEEKLY_ITEMS.find(x => x.kind === kind && x.key === key);
  if (w) return '週替わり3連戦を ' + w.weeks + ' 週クリア';
  if (kind === 'title') {
    const t = Object.entries(TROPHY_TITLES).find(([, k]) => k === key);
    if (t) return '実績 ' + (TROPHY_NAME[t[0]] || t[0]);
    if (key === 'platinum') return 'ほかの実績を全部取る';
  }
  const r = REWARDS.find(x => x.kind === kind && x.key === key);
  return r ? 'LV ' + r.lv + ' で解放' : '';
}

/* NEW: 持っているのにまだ見ていないもの */
function seen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); }
}
function markSeen(ids) {
  const s = seen();
  for (const id of ids) s.add(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch (e) { /* private mode */ }
}
/** まだ見ていない見た目があるか (タイトルのボタンの印) */
export function hasNewCosmetics() {
  try { if (!localStorage.getItem(SEEN_KEY)) return false; } catch (e) { return false; }   // はじめて開くまでは出さない (全部 NEW になるので)
  const c = ctx(), s = seen();
  return TABS.some(t => t.kind !== 'icon' && itemsOf(t.kind).some(([key]) => owned(t.kind, key, c) && key !== '' && key !== DEFAULT_KEY[t.kind] && !s.has(t.kind + ':' + key)));
}

/* ---------- 見た目の絵 ---------- */
const imgCache = new Map();
/* 絵のスリーブは画像を読み込んでから描き直される。読めたら見本を作り直し、開いていれば画面も描き直す */
let rerender = null;
onSleeveArt((key) => { imgCache.delete('sleeve:' + key); if (rerender) rerender(); });
function sleeveURL(key) {
  const k = 'sleeve:' + key;
  if (!imgCache.has(k)) imgCache.set(k, backTex(key).image.toDataURL('image/png'));
  return imgCache.get(k);
}
function matURL(key) {
  const art = matArtURL(key);                    // 絵のマットは絵をそのまま (自分の半面ぶん)
  if (art) return art;
  const k = 'mat:' + key;
  if (!imgCache.has(k)) {
    const tex = playmatTexture(key);
    imgCache.set(k, tex ? tex.image.toDataURL('image/jpeg', 0.8) : '');
  }
  return imgCache.get(k);
}
function markerURL(key) {
  const k = 'marker:' + key;
  if (!imgCache.has(k)) imgCache.set(k, markerPreviewURL(key, 240));
  return imgCache.get(k);
}
/** ガチャの結果などに出す見本 (スリーブは裏面の絵、マーカーは形と模様、称号は名前) */
export function itemArtHtml(kind, key) {
  if (kind === 'title') return '<span class="cm-titleart">' + esc(TITLES[key] || key) + '</span>';
  return thumb(kind, key);
}

/* 小さい見本 (図鑑のマス) */
function thumb(kind, key) {
  switch (kind) {
    case 'sleeve': return '<img alt="" src="' + sleeveURL(key) + '">';
    case 'mat': return matURL(key) ? '<img alt="" src="' + matURL(key) + '">' : '<span class="cm-neon"></span>';
    case 'marker': return '<img alt="" src="' + markerURL(key) + '">';
    case 'ccolor': return '<span class="cm-glow" style="--gc:' + (CCOLOR[key] || CCOLOR.default) + '"></span>';
    case 'victory': return '<span class="cm-vic ' + esc(key) + '">WIN</span>';
    case 'icon': {
      const p = protoList.find(x => x.name === key);
      return p ? '<img alt="" src="' + emblemDataURL(p.name, p.color || '#b9a4ff', 64, true) + '">' : '<span class="cm-none">—</span>';
    }
    case 'plate': return '<span class="cm-pf pf-' + esc(key) + '"><b>' + esc((displayName() || 'YOU').slice(0, 8)) + '</b></span>';
    default: return '<span class="cm-none">' + (key ? '★' : '—') + '</span>';
  }
}
/* 大きなプレビュー */
function preview(kind, key, name, isOwned, src) {
  const s = settings();
  let art = '';
  switch (kind) {
    case 'sleeve': art = '<img class="cm-card" alt="" src="' + sleeveURL(key) + '">'; break;
    case 'mat': {
      const url = matURL(key);
      art = '<div class="cm-matview">' + (url ? '<img alt="" src="' + url + '">' : '<span class="cm-neon big"></span>') +
        '<img class="cm-matcard" alt="" src="' + sleeveURL(s.sleeve || 'default') + '"></div>';
      break;
    }
    case 'marker': art = '<div class="cm-markerview"><img alt="" src="' + markerURL(key) + '"></div>'; break;
    case 'ccolor': art = '<div class="cm-burst" style="--gc:' + (CCOLOR[key] || CCOLOR.default) + '"><b>COMPILE</b></div>'; break;
    case 'victory': art = '<div class="cm-vicview ' + esc(key) + '"><b>YOU WIN</b></div>'; break;
    case 'plate': {
      const p = protoList.find(x => x.name === s.icon);
      art = '<div class="cm-plate pf-' + esc(key) + '">' + (p ? '<img alt="" src="' + emblemDataURL(p.name, p.color || '#b9a4ff', 96, true) + '">' : '<span>//</span>') +
        '<div><b>' + esc(displayName() || 'YOU') + '</b>' + (TITLES[s.title] ? '<small>' + esc(TITLES[s.title]) + '</small>' : '') + '</div></div>';
      break;
    }

    case 'title': case 'icon': {
      const icon = kind === 'icon' ? key : s.icon;
      const p = protoList.find(x => x.name === icon);
      const title = kind === 'title' ? (key ? TITLES[key] : '') : (TITLES[s.title] || '');
      art = '<div class="cm-plate">' + (p ? '<img alt="" src="' + emblemDataURL(p.name, p.color || '#b9a4ff', 96, true) + '">' : '<span>//</span>') +
        '<div><b>' + esc(displayName() || 'YOU') + '</b>' + (title ? '<small>' + esc(title) + '</small>' : '') + '</div></div>';
      break;
    }
    default: break;
  }
  return '<div class="cm-art' + (isOwned ? '' : ' locked') + '">' + art + '</div>' +
    '<div class="cm-cap"><b>' + esc(name) + '</b><span>' + (isOwned ? '持っている' : '未入手 — ' + esc(src)) + '</span></div>';
}

/* ---------- 画面 ---------- */
export function openCosmetics(opts) {
  let el = document.getElementById('cosOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cosOv';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'COSMETICS');
    document.body.appendChild(el);
  }
  let tab = (opts && opts.tab) || 'sleeve';
  let focus = null;                  // プレビューに出しているもの (押したもの。はじめは着けているもの)
  const firstOpen = (() => { try { return !localStorage.getItem(SEEN_KEY); } catch (e) { return false; } })();
  const render = () => {
    const s = settings();
    const c = ctx();
    const sn = seen();
    const list = itemsOf(tab);
    const cur = tab === 'title' ? (s.title || '') : tab === 'icon' ? (s.icon || '') : (s[tab] || DEFAULT_KEY[tab]);
    const fk = focus !== null && list.some(([k]) => k === focus) ? focus : cur;
    const fItem = list.find(([k]) => k === fk) || list[0];
    const got = list.filter(([k]) => owned(tab, k, c)).length;
    const all = TABS.reduce((n, t) => n + itemsOf(t.kind).length, 0);
    const allGot = TABS.reduce((n, t) => n + itemsOf(t.kind).filter(([k]) => owned(t.kind, k, c)).length, 0);
    el.innerHTML = '<div class="cm-shell">' +
      '<div class="cm-head"><b>// COLLECTION</b><span>集めた ' + allGot + ' / ' + all + '</span>' +
        '<button type="button" class="cm-gacha">GACHA <small>CHIP ' + chipsNow() + '</small></button>' +
        '<button type="button" class="cm-x" aria-label="閉じる">×</button></div>' +
      '<div class="cm-tabs" role="tablist">' + TABS.map(t => {
        const hasNew = !firstOpen && t.kind !== 'icon' && itemsOf(t.kind).some(([k]) => k !== '' && k !== DEFAULT_KEY[t.kind] && owned(t.kind, k, c) && !sn.has(t.kind + ':' + k));
        return '<button type="button" role="tab" data-tab="' + t.kind + '" class="' + (t.kind === tab ? 'on' : '') + '">' + t.label + (hasNew ? '<i class="cm-dot"></i>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="cm-body">' +
        '<section class="cm-preview">' + preview(tab, fItem[0], fItem[1], owned(tab, fItem[0], c), sourceOf(tab, fItem[0])) +
          (owned(tab, fItem[0], c) && fItem[0] !== cur ? '<button type="button" class="cm-equip" data-equip="' + esc(fItem[0]) + '">着ける</button>'
            : fItem[0] === cur ? '<p class="cm-on">着けています</p>' : '') + '</section>' +
        '<section class="cm-list"><p class="cm-count">' + TABS.find(t => t.kind === tab).label + ' ' + got + ' / ' + list.length + '</p>' +
          '<div class="cm-grid ' + (tab === 'plate' ? 'nameplate' : tab) + '">' + list.map(([key, name]) => {
            const has = owned(tab, key, c);
            const isNew = !firstOpen && has && key !== '' && key !== DEFAULT_KEY[tab] && !sn.has(tab + ':' + key);
            return '<button type="button" data-key="' + esc(key) + '" class="cm-item' + (has ? '' : ' locked') + (key === cur ? ' cur' : '') + (key === fk ? ' focus' : '') + '">' +
              '<span class="cm-th">' + thumb(tab, key) + '</span><b>' + esc(name) + '</b>' +
              (has ? (key === cur ? '<em>装備中</em>' : '') : '<small>' + esc(sourceOf(tab, key)) + '</small>') +
              (isNew ? '<i class="cm-new">NEW</i>' : '') + '</button>';
          }).join('') + '</div></section>' +
      '</div></div>';
    /* 見た印: いま開いているタブの、持っているもの */
    markSeen(list.filter(([k]) => owned(tab, k, c)).map(([k]) => tab + ':' + k));
  };
  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.classList.contains('cm-x')) { close(); return; }
    /* ガチャはこの画面から。閉じたら図鑑を描き直す (引いたものが並ぶ) */
    if (b.classList.contains('cm-gacha')) { openGacha({ onClose: () => render() }); return; }
    if (b.dataset.tab) { tab = b.dataset.tab; focus = null; render(); return; }
    if (b.dataset.equip !== undefined) { setSetting(tab, b.dataset.equip); render(); return; }
    if (b.dataset.key !== undefined) {
      const key = b.dataset.key;
      focus = key;
      /* 持っているものは、押したらそのまま着ける (プレビューにも出す) */
      if (owned(tab, key, ctx())) setSetting(tab, key);
      render();
    }
  };
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  const close = () => {
    el.classList.remove('show');
    window.removeEventListener('keydown', onKey);
    if (opts && opts.onClose) opts.onClose();
  };
  window.addEventListener('keydown', onKey);
  rerender = () => { if (el.classList.contains('show')) render(); };
  render();
  el.classList.add('show');
}
