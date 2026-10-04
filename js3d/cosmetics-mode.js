/* =========================================================================
 * COSMETICS (見た目) のモード。タイトル・プロフィール・設定から開く
 *   種類ごとのタブ (盤面・スリーブ・マーカー・コンパイルの光・勝ちの演出・称号・アイコン)。
 *   左に実物どおりの大きなプレビュー (スリーブはカードの裏面、盤面は柄そのもの)、右に図鑑。
 *   まだ持っていないものも並べ、手に入れ方を書く (押すとプレビューだけ見られる)。
 *   新しく手に入れたものには NEW (見た印は compileCosSeen、このブラウザだけ)
 * ========================================================================= */
import { COSMETICS, TITLES, REWARDS, GACHA_ITEMS, UNDERDOG_ITEMS, WEEKLY_ITEMS, masteryItem, protoMastery, unlockLevel, ownedTitles, AVATAR_RELEASED, BGM_RELEASED, weeklyClears } from './rewards.js';
import { AVATARS, faceURL } from './avatar.js';
import { accountState } from './account.js';
import { extraTitles, TROPHY_TITLES } from './cosmetics-ui.js';
import { settings, setSetting } from './settings.js';
import { playerLevel, xpForLevel } from './stats-data.js';
import { localRecords } from './stats.js';
import { bonusXp } from './xp.js';
import { backTex, onSleeveArt } from './cardtex.js';
import { playmatTexture, matArtURL } from './playmat.js';
import { markerPreviewURL } from './control.js';
import { emblemDataURL } from './emblems.js';
import { displayName } from './displayname.js';
import { openGacha, chipsNow } from './gacha-ui.js';
import { playBgm, menuBgm, previewBgm, BGM_CREDIT } from './bgm.js';
import { TRACKS, trackOf, ownsTrack, trackPrice, buyTrack } from './bgm-shop.js';
import { FACE_ICONS, FACE_ICON_PRICE, isFaceIcon, ownsFaceIcon, buyFaceIcon, faceIconURL, faceIconName, iconArt } from './face-icons.js';
import { earnedChips } from './chips.js';
import { rarityOf, RARITIES, RARITY_NAME } from './cos-rarity.js';
import { TROPHIES } from './achievements.js';
import { raise } from './dialogs.js';

/* CHIP で交換する品物 (ガチャに入れない)。値段 (0 なら交換の品物ではない) と、交換する関数 */
const SHOP = {
  icon: { price: (k) => (isFaceIcon(k) ? FACE_ICON_PRICE : 0), buy: (k) => buyFaceIcon(k, earnedChips()) },
  track: { price: (k) => trackPrice(k), buy: (k) => buyTrack(k, earnedChips()) }
};
/* BGM はメニューの曲と対戦の曲を別に選ぶ (設定の bgmMenu / bgmBattle。'' はおまかせ) */
const SLOTS = [['bgmMenu', 'メニュー'], ['bgmBattle', '対戦']];
const shopPrice = (kind, key) => (SHOP[kind] ? SHOP[kind].price(key) : 0);
/* レア度 (C / R / E / L、印なしは null)。枠の色・印・光り方に使う */
const rarOf = (kind, key) => rarityOf(kind, key, { defaultKey: DEFAULT_KEY[kind], shopPrice: shopPrice(kind, key) });
const rarCls = (r) => (r ? ' rar-' + r : '');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEEN_KEY = 'compileCosSeen';
const TAB_KEY = 'compileCosTab';            // 前に見ていたタブ (次に開いたときもそこから)

const ALL_TABS = [
  { kind: 'mat', label: '盤面' }, { kind: 'sleeve', label: 'スリーブ' }, { kind: 'marker', label: 'マーカー' },
  { kind: 'ccolor', label: 'コンパイルの光' }, { kind: 'victory', label: '勝ちの演出' }, { kind: 'title', label: '称号' }, { kind: 'icon', label: 'アイコン' },
  { kind: 'plate', label: '名札' }, { kind: 'avatar', label: 'キャラ' }, { kind: 'track', label: 'BGM' }, { kind: 'bgm', label: 'BGM' }
];
/* キャラのタブは、出すまでは管理者にだけ */
const tabsNow = () => ALL_TABS.filter(t => (t.kind !== 'avatar' || AVATAR_RELEASED || accountState().admin) && (t.kind !== 'bgm' || BGM_RELEASED));
const DEFAULT_KEY = { mat: 'neon', sleeve: 'default', marker: 'default', ccolor: 'default', victory: 'default', title: '', icon: '',
  plate: 'default', avatar: 'shion', bgm: 'burst', track: '' };
const RAR_NAME = { C: 'COMMON', R: 'RARE', E: 'EPIC', L: 'LEGENDARY' };
/* 実績の名前は achievements.js から (前はここに手で写していて、ずれていた) */
const trophyName = (id) => (TROPHIES.find(t => t.id === id) || {}).name || id;
const CCOLOR = { default: 'linear-gradient(90deg,#ff5c5c,#b9a4ff,#a07bff)', gold: '#ffd86a', cyan: '#7ff3ff', rainbow: 'conic-gradient(#ff5f7a,#ffc05a,#7df28c,#5ab8ff,#b98cff,#ff5f7a)',
  lime: '#b6ff4a', violet: '#b07bff', ember: '#ff7a2e' };

/* コンパイルの光ごとの演出 (fx-compile.js)。色だけでなく動きも違う */
const CC_DESC = { default: 'プロトコルの色の光の柱', gold: '金色の光の柱 + 金貨が降る', cyan: '水色の光の柱 + 稲妻が落ちる',
  rainbow: '毎回ちがう色の光の柱 + 虹の輪が広がる', lime: '黄緑の光の柱 + 泡が昇って弾ける', violet: '紫の光の柱 + 光の粒が渦を巻いて昇る',
  ember: '橙の光の柱 + 火の粉が舞い上がる' };

let protoList = [];
/* プロトコルの習熟度の名札 (p_fire) は、そのプロトコルの色を --pfc に渡す */
function pfcStyle(key) {
  const m = /^p_([a-z]+)$/.exec(key || '');
  const p = m && protoList.find(x => x.name === m[1].toUpperCase());
  return p ? ' style="--pfc:' + esc(p.color) + '"' : '';
}
export function setCosmeticsProtocols(list) { protoList = list || []; }
export function cosmeticsProtocols() { return protoList; }

/* ---------- 持っているか・手に入れ方 ---------- */
function ctx() {
  const recs = localRecords();
  const level = playerLevel(recs, bonusXp()).level;
  return { level, titles: ownedTitles(level, extraTitles(recs)) };
}
function itemsOf(kind) {
  if (kind === 'title') return [['', 'なし']].concat(Object.entries(TITLES));
  if (kind === 'icon') return [['', 'なし']].concat(protoList.map(p => [p.name, p.name]), FACE_ICONS.map(k => [k, faceIconName(k)]));
  if (kind === 'track') return [['', 'おまかせ']].concat(TRACKS.map(t => [t.key, t.title]));
  return COSMETICS[kind] || [];
}
function owned(kind, key, c) {
  if (key === '' || key === DEFAULT_KEY[kind]) return true;
  if (kind === 'title') return c.titles.includes(key);
  if (kind === 'icon' && isFaceIcon(key)) return ownsFaceIcon(key);
  if (kind === 'track') return ownsTrack(key);
  if (kind === 'icon') return c.level >= unlockLevel('icon', 'icon');
  return c.level >= unlockLevel(kind, key);
}
/* いまの経験値 (まだの品物に「あと XP いくつ」を出す)。一覧の全部で数え直さないよう、少しのあいだ覚えておく */
let xpMemo = { at: 0, xp: 0 };
function xpNow() {
  if (Date.now() - xpMemo.at > 1000) xpMemo = { at: Date.now(), xp: playerLevel(localRecords(), bonusXp()).xp };
  return xpMemo.xp;
}
const lvLeft = (lv) => { const n = xpForLevel(lv) - xpNow(); return n > 0 ? ' (あと XP ' + n + ')' : ''; };

/* 手に入れ方。[まだのときの言い方, 持っているときの言い方 (どうやって手に入れたか)] */
function sourceInfo(kind, key) {
  if (key === '' || key === DEFAULT_KEY[kind]) return ['はじめから', 'はじめから持っている'];
  if (shopPrice(kind, key)) return ['CHIP ' + shopPrice(kind, key) + ' で交換', 'CHIP ' + shopPrice(kind, key) + ' で交換した'];
  if (kind === 'icon') return ['LV ' + unlockLevel('icon', 'icon') + ' で解放' + lvLeft(unlockLevel('icon', 'icon')), 'LV ' + unlockLevel('icon', 'icon') + ' になって解放'];
  const g = GACHA_ITEMS.find(x => x.kind === kind && x.key === key);
  if (g) return ['GACHA (' + RAR_NAME[g.rar] + ')', 'GACHA で当てた (' + RAR_NAME[g.rar] + ')'];
  if (UNDERDOG_ITEMS.some(x => x.kind === kind && x.key === key) || (kind === 'title' && key === 'underdog')) return ['下剋上に勝つ', '下剋上に勝ってもらった'];
  const m = masteryItem(kind, key);
  if (m) return [m.proto + ' の習熟度 ' + m.mastery + ' (いま ' + protoMastery(m.proto) + ')', m.proto + ' の習熟度が ' + m.mastery + ' になってもらった'];
  const w = WEEKLY_ITEMS.find(x => x.kind === kind && x.key === key);
  if (w) return ['週替わり3連戦を ' + w.weeks + ' 週クリア (いま ' + weeklyClears() + ')', '週替わり3連戦を ' + w.weeks + ' 週クリアしてもらった'];
  if (kind === 'title') {
    const t = Object.entries(TROPHY_TITLES).find(([, k]) => k === key);
    if (t) return ['実績 ' + trophyName(t[0]), '実績「' + trophyName(t[0]) + '」を取ってもらった'];
    if (key === 'platinum') return ['ほかの実績を全部取る', 'ほかの実績を全部取ってもらった'];
  }
  const r = REWARDS.find(x => x.kind === kind && x.key === key);
  return r ? ['LV ' + r.lv + ' で解放' + lvLeft(r.lv), 'LV ' + r.lv + ' のレベルアップでもらった'] : ['', ''];
}
function sourceOf(kind, key) { return sourceInfo(kind, key)[0]; }
/* 手に入れ方の場所へ飛ぶボタン (実績 → RECORD の実績、習熟度 → RECORD のプロトコル、レベル → プロフィール) */
function sourceLink(kind, key) {
  if (kind === 'title') {
    const t = Object.entries(TROPHY_TITLES).find(([, k]) => k === key);
    if (t || key === 'platinum') return '<button type="button" class="cm-src" data-src="trophy" data-id="' + esc(t ? t[0] : 'platinum') + '">実績を見る ▸</button>';
  }
  if (masteryItem(kind, key)) return '<button type="button" class="cm-src" data-src="mastery">習熟度を見る ▸</button>';
  if (!GACHA_ITEMS.some(x => x.kind === kind && x.key === key) && REWARDS.some(x => x.kind === kind && x.key === key)) {
    return '<button type="button" class="cm-src" data-src="level">レベルの報酬を見る ▸</button>';
  }
  return '';
}
function gotHow(kind, key) { return sourceInfo(kind, key)[1]; }

/* レア度ごとの集まり具合 (例: L 1/4)。そのタブにある段だけ */
function rarTally(kind, list, c) {
  const rows = RARITIES.map(r => {
    const all = list.filter(([k]) => rarOf(kind, k) === r);
    return all.length ? '<span class="cm-rt rar-' + r + '" title="' + RARITY_NAME[r] + '">' + r + ' ' + all.filter(([k]) => owned(kind, k, c)).length + '/' + all.length + '</span>' : '';
  }).join('');
  return rows ? '<p class="cm-rts">' + rows + '</p>' : '';
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
  return tabsNow().some(t => t.kind !== 'icon' && hasNewIn(t.kind, c, s));
}
function hasNewIn(kind, c, s) {
  return itemsOf(kind).some(([key]) => owned(kind, key, c) && key !== '' && key !== DEFAULT_KEY[kind] && !s.has(kind + ':' + key));
}

/* ---------- 見た目の絵 ---------- */
const imgCache = new Map();
/* 絵のスリーブは画像を読み込んでから描き直される。読めたら見本を作り直し、開いていれば画面も描き直す */
let rerender = null;
/* 読めたスリーブの絵だけを差し替える (前は画面全体を描き直していて、絵が1枚読めるたびに全部の見本が貼り直されてチカチカしていた) */
onSleeveArt((key) => {
  imgCache.delete('sleeve:' + key);
  const ov = document.getElementById('cosOv');
  if (!ov) return;
  const imgs = ov.querySelectorAll('img[data-sleeve="' + key + '"]');
  if (imgs.length) { const url = sleeveURL(key); imgs.forEach(im => { if (im.src !== url) im.src = url; }); }
});
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
    case 'sleeve': return '<img alt="" data-sleeve="' + esc(key) + '" src="' + sleeveURL(key) + '">';
    case 'mat': return matURL(key) ? '<img alt="" src="' + matURL(key) + '">' : '<span class="cm-neon"></span>';
    case 'marker': return '<img alt="" src="' + markerURL(key) + '">';
    case 'ccolor': return '<span class="cm-glow" style="--gc:' + (CCOLOR[key] || CCOLOR.default) + '"></span>';
    case 'victory': return '<span class="cm-vic ' + esc(key) + '">WIN</span>';
    case 'icon': {
      if (isFaceIcon(key)) return '<img class="cm-face" alt="" src="' + faceIconURL(key) + '">';
      const p = protoList.find(x => x.name === key);
      return p ? '<img alt="" src="' + emblemDataURL(p.name, p.color || '#b9a4ff', 64, true) + '">' : '<span class="cm-none">—</span>';
    }
    case 'plate': return '<span class="cm-pf pf-' + esc(key) + '"' + pfcStyle(key) + '><b>' + esc((displayName() || 'YOU').slice(0, 8)) + '</b></span>';
    case 'avatar': return '<img class="cm-av" alt="" src="' + faceURL(key, 'normal') + '">';
    case 'bgm': case 'track': return '<span class="cm-note" aria-hidden="true">♪</span>';
    default: return '<span class="cm-none">' + (key ? '★' : '—') + '</span>';
  }
}
/* 大きなプレビュー */
function preview(kind, key, name, isOwned, src) {
  const s = settings();
  let art = '';
  switch (kind) {
    case 'sleeve': art = '<img class="cm-card" alt="" data-sleeve="' + esc(key) + '" src="' + sleeveURL(key) + '">'; break;
    case 'mat': {
      const url = matURL(key);
      art = '<div class="cm-matview">' + (url ? '<img alt="" src="' + url + '">' : '<span class="cm-neon big"></span>') +
        '<img class="cm-matcard" alt="" data-sleeve="' + esc(s.sleeve || 'default') + '" src="' + sleeveURL(s.sleeve || 'default') + '"></div>';
      break;
    }
    case 'marker': art = '<div class="cm-markerview"><img alt="" src="' + markerURL(key) + '"></div>'; break;
    case 'ccolor': art = '<div class="cm-burst" style="--gc:' + (CCOLOR[key] || CCOLOR.default) + '"><b>COMPILE</b></div>' +
      '<p class="cm-desc">' + esc(CC_DESC[key] || '') + '</p>'; break;
    case 'victory': art = '<div class="cm-vicview ' + esc(key) + '"><b>YOU WIN</b></div>'; break;
    case 'plate': {
      const ia = iconArt(s.icon, protoList, 96);
      art = '<div class="cm-plate pf-' + esc(key) + '"' + pfcStyle(key) + '>' + (ia ? '<img alt="" class="' + (ia.face ? 'face' : '') + '" src="' + ia.src + '">' : '<span>//</span>') +
        '<div><b>' + esc(displayName() || 'YOU') + '</b>' + (TITLES[s.title] ? '<small>' + esc(TITLES[s.title]) + '</small>' : '') + '</div></div>';
      break;
    }

    case 'avatar': {
      const d = AVATARS[key] || {};
      const line = d.lines && d.lines.hello ? d.lines.hello[0] : '';
      const text = Array.isArray(line) ? line[0] : line;
      art = '<div class="cm-avview" style="--av-c:' + esc(d.color || '#b9a4ff') + '"><img alt="" src="' + faceURL(key, 'happy') + '">' +
        (text ? '<p><b>' + esc(d.name || '') + '</b>' + esc(text) + '</p>' : '') +
        /* 得意プロトコル (そのカードを表で出すと専用のセリフ) */
        (d.fav ? '<em class="cm-fav" style="--pc:' + esc((protoList.find(x => x.name === d.fav) || {}).color || '#b9a4ff') + '">得意 ' + esc(d.fav) + '</em>' : '') +
        /* ゲストは声と立ち絵のクレジットを添える */
        (d.guest ? '<small class="cm-credit">' + esc(d.credit || '') + '　立ち絵：坂本アヒル</small>' : '') + '</div>';
      break;
    }
    /* BGM: 押すと試し聴き (持っていなくても聴ける)。閉じるとタイトルの曲に戻る */
    case 'bgm': art = '<div class="cm-bgmview"><span class="cm-note big" aria-hidden="true">♪</span>' +
      '<button type="button" class="cm-listen" data-listen="' + esc(key) + '">▶ 試し聴き</button>' +
      '<small class="cm-credit">曲 ' + esc(BGM_CREDIT) + '　・　' + (key === 'orange_tunnel' ? 'タイトルでも流れる曲' : '選ぶと対戦で流れる') + '</small></div>'; break;
    case 'track': {
      const t = trackOf(key);
      art = '<div class="cm-bgmview"><span class="cm-note big" aria-hidden="true">♪</span>' +
        (t ? '<b>' + esc(t.title) + '</b><small class="cm-credit">' + esc(t.by) + (t.credit ? '　・　' + esc(t.credit) : '') + '</small>' +
          '<button type="button" class="cm-listen" data-listen="' + esc(key) + '">▶ 試し聴き (15秒)</button>'
          : '<small class="cm-credit">メニューと対戦で、いつもの曲を順に流します</small>') + '</div>';
      break;
    }
    case 'title': case 'icon': {
      const icon = kind === 'icon' ? key : s.icon;
      const ia = iconArt(icon, protoList, 96);
      const title = kind === 'title' ? (key ? TITLES[key] : '') : (TITLES[s.title] || '');
      art = '<div class="cm-plate">' + (ia ? '<img alt="" class="' + (ia.face ? 'face' : '') + '" src="' + ia.src + '">' : '<span>//</span>') +
        '<div><b>' + esc(displayName() || 'YOU') + '</b>' + (title ? '<small>' + esc(title) + '</small>' : '') + '</div></div>';
      break;
    }
    default: break;
  }
  const rar = rarOf(kind, key);
  return '<div class="cm-art' + (isOwned ? '' : ' locked') + rarCls(rar) + '">' + art + '</div>' +
    '<div class="cm-cap' + rarCls(rar) + '">' + (rar ? '<i class="cm-rar">' + RARITY_NAME[rar] + '</i>' : '') + '<b>' + esc(name) + '</b><span>' + (isOwned ? (gotHow(kind, key) ? '入手: ' + esc(gotHow(kind, key)) : '持っている') : '未入手 — ' + esc(src)) + '</span>' + sourceLink(kind, key) + '</div>';
}

/* ---------- 画面 ---------- */
export function openCosmetics(opts) {
  let el = document.getElementById('cosOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cosOv';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'COLLECTION');
    document.body.appendChild(el);
  }
  /* 開くタブ: 指定 (報酬などから飛んできた) → 新しいものがあるタブ → 前に見ていたタブ → スリーブ */
  const firstOpen = (() => { try { return !localStorage.getItem(SEEN_KEY); } catch (e) { return false; } })();
  const tabOk = (t) => tabsNow().some(x => x.kind === t);
  const newTab = firstOpen ? null : (tabsNow().find(t => t.kind !== 'icon' && hasNewIn(t.kind, ctx(), seen())) || {}).kind;
  const lastTab = (() => { try { return localStorage.getItem(TAB_KEY); } catch (e) { return null; } })();
  let tab = (opts && opts.tab && tabOk(opts.tab) && opts.tab) || newTab || (lastTab && tabOk(lastTab) && lastTab) || 'sleeve';
  let focus = (opts && opts.focus !== undefined && opts.focus !== null) ? String(opts.focus) : null;   // プレビューに出しているもの (押したもの。はじめは着けているもの)
  /* 一覧のしぼり込み: 'all' / 'own' (持っている) / 'not' (まだ)。プロトコルの習熟度の分 (30 ずつ) は、
     持っているものだけ出し、まだのものは showMastery のときだけ (数が多すぎて、ほかが埋もれていた) */
  let filter = 'all', showMastery = false;
  let listened = false;                              // BGM を試し聴きした (閉じたらタイトルの曲に戻す)
  let armed = null;                                  // 交換のボタンを1回押した品物 (もう一度押すと交換)
  /* 押すとすぐ着け替わるので、直前のものに戻せるように (確かめの画面は出さず、あとから戻せる) */
  let undo = null;                                   // { tab, prev, name }
  const equip = (key) => {
    const s0 = settings();
    const prev = tab === 'title' || tab === 'icon' ? (s0[tab] || '') : (s0[tab] || DEFAULT_KEY[tab]);
    if (prev === key) return;
    setSetting(tab, key);
    const item = itemsOf(tab).find(([k]) => k === key);
    undo = { tab, prev, name: item ? item[1] : key };
  };
  /* 見た印は、そのタブを離れるときと閉じるときに付ける (前は描き直すたびに付けていて、1回押しただけで NEW が全部消えていた) */
  const commitSeen = () => { const c = ctx(); markSeen(itemsOf(tab).filter(([k]) => owned(tab, k, c)).map(([k]) => tab + ':' + k)); };
  const render = () => {
    const s = settings();
    const c = ctx();
    const sn = seen();
    const list = itemsOf(tab);
    /* しぼり込み。着けているものと、プレビューに出しているものは必ず残す */
    const isMastery = (k) => !!masteryItem(tab, k);
    const masteryHidden = showMastery ? 0 : list.filter(([k]) => isMastery(k) && !owned(tab, k, c)).length;
    const shownList = list.filter(([k]) => {
      const has = owned(tab, k, c);
      if (k === (tab === 'title' ? (s.title || '') : tab === 'icon' ? (s.icon || '') : (s[tab] || DEFAULT_KEY[tab]))) return true;
      if (!showMastery && isMastery(k) && !has) return false;
      return filter === 'all' || (filter === 'own' ? has : !has);
    });
    const rawCur = tab === 'title' ? (s.title || '') : tab === 'icon' ? (s.icon || '') : (s[tab] || DEFAULT_KEY[tab]);
    /* 設定に残っていても、まだ持っていない (鍵の付いた) ものは着けていない扱い。対戦でも標準のものになる */
    const cur = tab === 'track' || owned(tab, rawCur, c) ? rawCur : (tab === 'title' || tab === 'icon' ? '' : DEFAULT_KEY[tab]);
    const fk = focus !== null && list.some(([k]) => k === focus) ? focus : cur;
    const fItem = list.find(([k]) => k === fk) || list[0];
    const got = list.filter(([k]) => owned(tab, k, c)).length;
    const TABS = tabsNow();
    const all = TABS.reduce((n, t) => n + itemsOf(t.kind).length, 0);
    const allGot = TABS.reduce((n, t) => n + itemsOf(t.kind).filter(([k]) => owned(t.kind, k, c)).length, 0);
    /* 描き直しても、一覧とタブの横の位置はそのまま (縦持ちで下のほうを押しても、上に戻らない)。タブを変えたら一覧は上から */
    const oldList = el.querySelector('.cm-list'), oldTabs = el.querySelector('.cm-tabs');
    const keepY = oldList && oldList.dataset.tab === tab ? oldList.scrollTop : 0;
    const keepX = oldTabs ? oldTabs.scrollLeft : 0, keepTop = oldTabs ? oldTabs.scrollTop : 0;
    el.innerHTML = '<div class="cm-shell">' +
      '<div class="cm-head"><b>// COLLECTION</b><span>集めた ' + allGot + ' / ' + all + '</span>' +
        '<button type="button" class="cm-gacha">GACHA <small>CHIP ' + chipsNow() + '</small></button>' +
        '<button type="button" class="cm-x"><span aria-hidden="true">←</span>戻る</button></div>' +
      /* 左に種類の一覧、右に見本と一覧 (設定と同じ形) */
      '<div class="cm-main"><div class="cm-tabs" role="tablist" aria-orientation="vertical">' + TABS.map(t => {
        const hasNew = !firstOpen && t.kind !== 'icon' && itemsOf(t.kind).some(([k]) => k !== '' && k !== DEFAULT_KEY[t.kind] && owned(t.kind, k, c) && !sn.has(t.kind + ':' + k));
        return '<button type="button" role="tab" data-tab="' + t.kind + '" class="' + (t.kind === tab ? 'on' : '') + '">' + t.label + (hasNew ? '<i class="cm-dot"></i>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="cm-body">' +
        '<section class="cm-preview">' + preview(tab, fItem[0], fItem[1], owned(tab, fItem[0], c), sourceOf(tab, fItem[0])) +
          (tab === 'track' && owned(tab, fItem[0], c) ? '<div class="cm-slots">' + SLOTS.map(([slot, label]) => (s[slot] || '') === fItem[0]
              ? '<p class="cm-on">' + label + 'で流しています</p>'
              : '<button type="button" class="cm-equip" data-slot="' + slot + '" data-key-set="' + esc(fItem[0]) + '">' + label + 'で流す</button>').join('') + '</div>'
            : owned(tab, fItem[0], c) && fItem[0] !== cur ? '<button type="button" class="cm-equip" data-equip="' + esc(fItem[0]) + '">着ける</button>'
            : fItem[0] === cur ? '<p class="cm-on">着けています</p>'
            : shopPrice(tab, fItem[0]) ? '<button type="button" class="cm-equip cm-buy' + (armed === fItem[0] ? ' armed' : '') + '" data-buy="' + esc(fItem[0]) + '"' +
              (chipsNow() < shopPrice(tab, fItem[0]) ? ' disabled' : '') + '>' +
              (chipsNow() < shopPrice(tab, fItem[0]) ? 'CHIP が足りません (' + shopPrice(tab, fItem[0]) + ')'
                : armed === fItem[0] ? 'もう一度押すと交換 (CHIP ' + shopPrice(tab, fItem[0]) + ')' : 'CHIP ' + shopPrice(tab, fItem[0]) + ' で交換') + '</button>' : '') +
          (undo && undo.tab === tab ? '<p class="cm-undo">「' + esc(undo.name) + '」を着けました <button type="button" data-undo="1">元に戻す</button></p>' : '') + '</section>' +
        '<section class="cm-list" data-tab="' + tab + '"><div class="cm-filter"><p class="cm-count">' + TABS.find(t => t.kind === tab).label + ' ' + got + ' / ' + list.length + '</p>' +
          rarTally(tab, list, c) +
          [['all', '全部'], ['own', '持っている'], ['not', 'まだ']].map(([k, label]) =>
            '<button type="button" class="cm-fbtn' + (filter === k ? ' on' : '') + '" data-filter="' + k + '">' + label + '</button>').join('') +
          (masteryHidden > 0 || showMastery ? '<button type="button" class="cm-fbtn' + (showMastery ? ' on' : '') + '" data-mastery="1">習熟度の分も見る' +
            (showMastery ? '' : ' (' + masteryHidden + ')') + '</button>' : '') + '</div>' +
          '<div class="cm-grid ' + (tab === 'plate' ? 'nameplate' : tab === 'avatar' ? 'charas' : tab) + '">' + shownList.map(([key, name]) => {
            const has = owned(tab, key, c);
            const isNew = !firstOpen && has && key !== '' && key !== DEFAULT_KEY[tab] && !sn.has(tab + ':' + key);
            return '<button type="button" data-key="' + esc(key) + '" class="cm-item' + (has ? '' : ' locked') + rarCls(rarOf(tab, key)) + (key === cur ? ' cur' : '') + (key === fk ? ' focus' : '') + '">' +
              '<span class="cm-th">' + thumb(tab, key) + '</span><b>' + (rarOf(tab, key) ? '<i class="cm-rb" title="' + RARITY_NAME[rarOf(tab, key)] + '">' + rarOf(tab, key) + '</i>' : '') + esc(name) + '</b>' +
              (has ? (tab === 'track' ? SLOTS.filter(([slot]) => (s[slot] || '') === key).map(([, label]) => '<em>' + label + '</em>').join('')
                : key === cur ? '<em>装備中</em>' : '') : '<small>' + esc(sourceOf(tab, key)) + '</small>') +
              (isNew ? '<i class="cm-new">NEW</i>' : '') + '</button>';
          }).join('') + '</div></section>' +
      '</div></div></div>';
    const newList = el.querySelector('.cm-list'), newTabs = el.querySelector('.cm-tabs'), onTab = el.querySelector('.cm-tabs .on');
    if (newList) newList.scrollTop = keepY;
    if (newTabs) {
      newTabs.scrollLeft = keepX;
      newTabs.scrollTop = keepTop;
      /* 選んでいるタブが一覧からはみ出していたら、見える位置まで寄せる */
      if (onTab) {
        const box = newTabs.getBoundingClientRect(), r = onTab.getBoundingClientRect();
        if (r.top < box.top || r.bottom > box.bottom) newTabs.scrollTop += (r.top + r.height / 2) - (box.top + box.height / 2);
      }
    }
    try { localStorage.setItem(TAB_KEY, tab); } catch (e) { /* private mode */ }
  };
  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.classList.contains('cm-x')) { close(); return; }
    /* 手に入れ方の場所へ (重ねて開く。閉じると COLLECTION に戻る) */
    if (b.dataset.src === 'trophy') { import('./achievements-ui.js').then(m => m.openTrophies(b.dataset.id)); return; }
    if (b.dataset.src === 'mastery') { import('./stats.js').then(m => m.openStats({ tab: 'プロトコル' })); return; }
    if (b.dataset.src === 'level') { import('./profile.js').then(m => m.openProfile(protoList)); return; }
    if (b.dataset.listen) { listened = true; (tab === 'track' ? previewBgm(b.dataset.listen, menuBgm) : playBgm(b.dataset.listen)); return; }
    /* BGM: メニュー・対戦のどちらで流すか */
    if (b.dataset.slot) { setSetting(b.dataset.slot, b.dataset.keySet); if (b.dataset.slot === 'bgmMenu') playBgm(menuBgm()); render(); return; }
    /* ガチャはこの画面から。閉じたら図鑑を描き直す (引いたものが並ぶ) */
    if (b.classList.contains('cm-gacha')) {
      openGacha({ onClose: () => render(), onUse: (kind, key) => { if (tabOk(kind)) { commitSeen(); tab = kind; } focus = key; filter = 'all'; render(); } });
      return;
    }
    if (b.dataset.undo !== undefined) { if (undo) setSetting(undo.tab, undo.prev); undo = null; render(); return; }
    if (b.dataset.tab) { if (b.dataset.tab !== tab) commitSeen(); tab = b.dataset.tab; focus = null; undo = null; render(); return; }
    if (b.dataset.filter) { filter = b.dataset.filter; render(); return; }
    if (b.dataset.mastery) { showMastery = !showMastery; render(); return; }
    if (b.dataset.equip !== undefined) { equip(b.dataset.equip); render(); return; }
    /* CHIP で交換: 1回目は確かめ、2回目で交換してそのまま着ける */
    if (b.dataset.buy !== undefined) {
      const key = b.dataset.buy;
      if (armed !== key) { armed = key; render(); return; }
      armed = null;
      if (SHOP[tab] && SHOP[tab].buy(key)) equip(key);
      render();
      return;
    }
    if (b.dataset.key !== undefined) {
      const key = b.dataset.key;
      focus = key;
      armed = null;
      /* BGM のタブは、押したら試し聴き */
      if (tab === 'bgm') { listened = true; playBgm(key); }
      /* 持っているものは、押したらそのまま着ける (プレビューにも出す) */
      if (owned(tab, key, ctx()) && tab !== 'track') equip(key);
      render();
    }
  };
  /* Esc はいちばん上の画面だけ閉じる (ガチャを重ねているときは、ガチャのほう) */
  const onKey = (ev) => { if (ev.key === 'Escape' && !document.querySelector('#gachaOv.show')) close(); };
  const close = () => {
    commitSeen();
    /* 試し聴きしていたら、タイトルの曲に戻す */
    if (listened) playBgm(menuBgm());
    el.classList.remove('show');
    window.removeEventListener('keydown', onKey);
    if (opts && opts.onClose) opts.onClose();
    /* どこから開いても、タイトルの NEW の印を合わせる */
    window.dispatchEvent(new CustomEvent('compile:cosmetics-closed'));
  };
  window.addEventListener('keydown', onKey);
  rerender = () => { if (el.classList.contains('show')) render(); };
  render();
  el.classList.add('show');
  raise(el);   // 開いたままの画面をもう一度開いたときも、いちばん手前へ
}
