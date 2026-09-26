/* =========================================================================
 * 3Dビュー: カード面テクスチャの生成
 *   Canvas でカード意匠を描き、CanvasTexture として返す。
 *   カードアート (art/{number}{proto}.webp) は非同期で載り次第、再描画する。
 *
 *   レイアウトはルールシートの Card Anatomy に従う:
 *     ヘッダ (名前 + 効果アイコン + 値) と上段コマンドを上端にまとめ、
 *     「覆われても値と上段コマンドが常に見える」の指定を満たす。
 *   上・中・下段は役割ラベル付きのゾーンとして塗り分ける:
 *     ▲ 上段・常在 / ◆ 中段・即時 / ▼ 下段・補助
 *   本文は枠に収まるまで自動縮小し、切り捨てを出さない。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { CARD, FONT } from './theme.js';
import { drawIcon } from './icons.js';
import { condChars } from './cardtext.js';

/* 座標は 512x716 のデザイン空間で書き、実テクスチャへは拡大して描く */
const DW = 512, DH = 716;

const faceCache = new Map();   // defId -> THREE.CanvasTexture
const faceZones = new Map();   // defId -> {upper/middle/lower: [x,y,w,h]} (デザイン座標)
const faceVersion = new Map(); // defId -> 描き直し回数 (アート読込で+1、dataURLキャッシュの無効化キー)
const urlCache = new Map();    // defId+':'+version(+':'+zone) -> dataURL (PNGエンコードは重い)
const faceCanvas = new Map();  // defId -> HTMLCanvasElement (プレビュー用)
const artCache = new Map();    // url -> HTMLImageElement | null (失敗)
const backTextures = new Map();   // 裏面の柄 (スリーブ) -> テクスチャ
/* 絵は対局をまたいで使い回すが、何試合も遊ぶと増え続けるので、新しい順に ART_KEEP 枚だけ残す */
const ART_KEEP = 120;
function rememberArt(url, img) {
  artCache.delete(url);
  artCache.set(url, img);
  while (artCache.size > ART_KEEP) artCache.delete(artCache.keys().next().value);
}
/* 斜めに寝かせた手札の文字をにじませないよう、GPU が許す最大の異方性フィルタを使う */
let maxAnisotropy = 8;
export function setMaxAnisotropy(n) {
  if (!(n > 0)) return;
  maxAnisotropy = n;
  for (const tex of faceCache.values()) { tex.anisotropy = n; tex.needsUpdate = true; }
  for (const tex of backTextures.values()) { tex.anisotropy = n; tex.needsUpdate = true; }
}

/* カードアートが存在するセット (Main 2 / Aux 2 は scripts/build_card_art_2.py で生成) */
export const ART_SETS = new Set(['Main 1', 'Aux 1', 'Main 2', 'Aux 2']);

/* 覆われたときも見えている必要がある上端の割合 (theme.js の coverStep と連動) */
export const REVEAL_RATIO = 0.334;
const REVEAL_PX = Math.floor(DH * REVEAL_RATIO);   // = 239

/* ---------- 画像ロード (失敗は null として記憶し、再試行しない) ---------- */
function loadArt(url, onReady) {
  if (artCache.has(url)) {
    const cached = artCache.get(url);
    if (cached) onReady(cached);
    return;
  }
  const img = new Image();
  img.onload = () => { rememberArt(url, img); onReady(img); };
  img.onerror = () => { rememberArt(url, null); };
  img.src = url;
}

function artUrlFor(def) {
  return 'art/' + def.number + def.proto.toLowerCase() + '.webp';
}

/* ---------- 描画ヘルパ ---------- */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 16進 -> rgba() 文字列 */
function rgba(hex, a) {
  const h = String(hex || '#b9a4ff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/* トリガー (「開始：」「〜たとき：」) は太字で測る・描く (カードリストと同じ強調) */
const COND_WEIGHT = '800';
const fontFor = (weight, px, cond) => (cond ? COND_WEIGHT : weight) + ' ' + px + 'px system-ui, sans-serif';

/* condChars の文字列を、太字の幅も込みで折り返す (行 = 文字の配列) */
function wrapRich(ctx, chars, maxW, weight, px) {
  const lines = [];
  let line = [], w = 0;
  for (const c of chars) {
    if (c.ch === '\n') { lines.push(line); line = []; w = 0; continue; }
    ctx.font = fontFor(weight, px, c.cond);
    const cw = ctx.measureText(c.ch).width;
    if (w + cw > maxW && line.length) { lines.push(line); line = []; w = 0; }
    line.push(c); w += cw;
  }
  if (line.length) lines.push(line);
  return lines;
}

/* 1行を、太字の切れ目ごとにまとめて描く。トリガーには下線を引く */
function drawRichLine(ctx, line, x, ty, weight, px, color) {
  let cx = x;
  for (let i = 0; i < line.length;) {
    const cond = line[i].cond;
    let run = '';
    while (i < line.length && line[i].cond === cond) run += line[i++].ch;
    ctx.font = fontFor(weight, px, cond);
    ctx.fillStyle = cond ? '#ffffff' : color;
    ctx.fillText(run, cx, ty);
    const w = ctx.measureText(run).width;
    if (cond) {
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fillRect(cx, ty + px * 0.16, w, Math.max(1.5, px * 0.07));
    }
    cx += w;
  }
}

/* 枠 (maxW × maxH) に収まるフォントサイズを探して描く */
function fitTextBlock(ctx, text, x, y, maxW, maxH, opts) {
  const start = opts.start || 24;
  const min = opts.min || 15;
  const lh = opts.lineH || 1.34;
  const weight = opts.weight || '500';
  const chars = condChars(text);
  let px = start;
  let lines = [];
  for (; px >= min; px--) {
    lines = wrapRich(ctx, chars, maxW, weight, px);
    if (lines.length * px * lh <= maxH) break;
  }
  const color = opts.color || '#e8eef8';
  let ty = y + px;                       // 1行目のベースライン
  for (const line of lines) {
    if (ty > y + maxH + 4) break;        // min でも収まらない場合の保険
    drawRichLine(ctx, line, x, ty, weight, px, color);
    ty += px * lh;
  }
}

/* 事前見積り: このテキストがどれだけの高さを要るか (描かずに測る) */
function measureTextBlock(ctx, text, maxW, opts) {
  const start = opts.start || 24;
  const lh = opts.lineH || 1.34;
  return Math.ceil(wrapRich(ctx, condChars(text), maxW, opts.weight || '500', start).length * start * lh);
}

/* 役割ラベルのチップ (高さ26)。塗り (bg) か枠線 (fg) のどちらか */
function chip(ctx, x, y, glyph, label, fg, bg) {
  const text = glyph + ' ' + label;
  ctx.font = '800 15px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 16;
  if (bg) {
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, 22, 6);
    ctx.fill();
  } else {
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, 22, 6);
    ctx.stroke();
  }
  ctx.fillStyle = bg ? '#04060e' : fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 8, y + 12);
  ctx.textBaseline = 'alphabetic';
}

/* ---------- 表面 ---------- */
/* 見出し (プロトコル名と値)。手札でも読めるよう、名前と値は大きめに取る */
const HEAD_H = 122;
const BADGE = 112;           // 値のバッジの一辺
const BADGE_FONT = 94;       // 値の数字
const NAME_FONT = 72;        // プロトコル名 (長い名前は幅に合わせて縮める)
const TEXT_X = 26;                 // ゾーン内テキストの左端 (左バーの分を空ける)
const TEXT_W = DW - TEXT_X - 22;

function paintFace(ctx, def, art) {
  const accent = def.color || '#b9a4ff';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.scale(ctx.canvas.width / DW, ctx.canvas.height / DH);

  /* 下地 */
  const base = ctx.createLinearGradient(0, 0, 0, DH);
  base.addColorStop(0, '#0d1120');
  base.addColorStop(1, '#05070f');
  ctx.fillStyle = base;
  roundRect(ctx, 0, 0, DW, DH, 30); ctx.fill();

  ctx.save();
  roundRect(ctx, 0, 0, DW, DH, 30); ctx.clip();

  /* --- アート: ヘッダ下の全面を背景に敷く (実物のカードと同じ) --- */
  const artTop = HEAD_H;
  const artH = DH - artTop;
  if (art) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, artTop, DW, artH);
    ctx.clip();
    const sc = Math.max(DW / art.width, artH / art.height);
    const dw = art.width * sc, dh = art.height * sc;
    ctx.drawImage(art, (DW - dw) / 2, artTop + (artH - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    const g = ctx.createRadialGradient(DW / 2, artTop + artH * 0.4, 20, DW / 2, artTop + artH * 0.4, DW * 0.9);
    g.addColorStop(0, rgba(accent, 0.5));
    g.addColorStop(1, 'rgba(4,6,14,0)');
    ctx.fillStyle = '#080b16'; ctx.fillRect(0, artTop, DW, artH);
    ctx.fillStyle = g; ctx.fillRect(0, artTop, DW, artH);
    ctx.font = '700 120px ' + FONT.hud;
    ctx.fillStyle = rgba(accent, 0.4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.proto.slice(0, 2), DW / 2, artTop + artH * 0.4);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  /* 明るいアートが 3D 上で白飛びしないよう、薄い暗幕とビネット */
  ctx.fillStyle = 'rgba(4,6,14,.18)';
  ctx.fillRect(0, artTop, DW, artH);
  const vig = ctx.createRadialGradient(DW / 2, artTop + artH * 0.42, DW * 0.24, DW / 2, artTop + artH * 0.42, DW * 0.85);
  vig.addColorStop(0, 'rgba(4,6,14,0)');
  vig.addColorStop(1, 'rgba(4,6,14,.5)');
  ctx.fillStyle = vig; ctx.fillRect(0, artTop, DW, artH);

  /* --- ヘッダ: プロトコル名 + 効果アイコン + 値 --- */
  const head = ctx.createLinearGradient(0, 0, DW, 0);
  head.addColorStop(0, rgba(accent, 0.62));
  head.addColorStop(0.62, 'rgba(8,11,21,.96)');
  head.addColorStop(1, 'rgba(8,11,21,.98)');
  ctx.fillStyle = head;
  ctx.fillRect(0, 0, DW, HEAD_H);

  const badge = BADGE;
  const bx = DW - badge - 12, by = (HEAD_H - badge) / 2;
  ctx.fillStyle = accent;
  roundRect(ctx, bx, by, badge, badge, 14); ctx.fill();
  ctx.fillStyle = '#04060e';
  ctx.font = '800 ' + BADGE_FONT + 'px ' + FONT.hud;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(def.value), bx + badge / 2, by + badge / 2 + 3);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  /* 効果種別アイコン (覆われても見えるヘッダに置く) */
  const types = (def.effectTypes || []).slice(0, 3);
  const iconSize = 36, iconGap = 7;
  let ix = bx - 12 - types.length * (iconSize + iconGap);
  const iconLeft = ix;
  for (const t of types) {
    drawIcon(ctx, t, ix, (HEAD_H - iconSize) / 2, iconSize, 'rgba(238,244,252,.92)');
    ix += iconSize + iconGap;
  }

  /* プロトコル名 (バッジとアイコンを避けて縮める) */
  const nameMax = (types.length ? iconLeft : bx) - 30;
  let namePx = NAME_FONT;
  do {
    ctx.font = '800 ' + namePx + 'px ' + FONT.hud;
    if (ctx.measureText(def.proto).width <= nameMax) break;
    namePx -= 2;
  } while (namePx > 22);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.proto, 18, HEAD_H / 2 + 1);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = accent;
  ctx.fillRect(0, HEAD_H - 4, DW, 4);

  /* --- 3つのコマンドボックス (実物どおり 上 / 中央 / 下 に固定) ---
     上段はヘッダ直下 (覆われても見える REVEAL_PX 内)、中段はカード中央、
     下段はカード下端。空のゾーンは描かず、アートがそのまま見える。 */
  const BOX_X = 10, BOX_W = DW - 20;
  const TXT_X = BOX_X + 20, TXT_W = BOX_W - 40;

  function zonePanel(y, h, emphasis) {
    ctx.fillStyle = 'rgba(5,8,16,.9)';
    roundRect(ctx, BOX_X, y, BOX_W, h, 12); ctx.fill();
    if (emphasis) {
      ctx.fillStyle = rgba(accent, 0.12);
      roundRect(ctx, BOX_X, y, BOX_W, h, 12); ctx.fill();
    }
    ctx.strokeStyle = emphasis ? rgba(accent, 0.55) : 'rgba(255,255,255,.12)';
    ctx.lineWidth = 2;
    roundRect(ctx, BOX_X, y, BOX_W, h, 12); ctx.stroke();
    /* 左のアクセントバー */
    ctx.fillStyle = emphasis ? accent : rgba(accent, 0.55);
    roundRect(ctx, BOX_X + 5, y + 7, 5, h - 14, 3); ctx.fill();
  }

  const zoneRects = {};

  /* 上段 (常在: 覆われても効く) — ヘッダ直下、REVEAL_PX に必ず収める */
  if (def.upper) {
    const yT = HEAD_H + 6;
    const hT = Math.min(REVEAL_PX - yT,
      22 + 5 + measureTextBlock(ctx, def.upper, TXT_W, { start: 24, weight: '600' }) + 12);
    zoneRects.upper = [BOX_X, yT, BOX_W, hT];
    zonePanel(yT, hT, false);
    chip(ctx, TXT_X, yT + 6, '▲', '上段・常在', rgba(accent, 0.95), null);
    fitTextBlock(ctx, def.upper, TXT_X, yT + 6 + 22 + 4, TXT_W, hT - 22 - 16,
      { start: 24, min: 17, weight: '600', color: '#e6eef8' });
  }

  /* 下段 (補助: 覆われていないときのみ) — 下端に固定 */
  let bottomTop = DH;
  if (def.lower) {
    const hB = Math.min(196, 22 + 5 + measureTextBlock(ctx, def.lower, TXT_W, { start: 24, weight: '600' }) + 12);
    const yB = DH - 12 - hB;
    bottomTop = yB;
    zoneRects.lower = [BOX_X, yB, BOX_W, hB];
    zonePanel(yB, hB, false);
    chip(ctx, TXT_X, yB + 6, '▼', '下段・補助', 'rgba(190,206,222,.95)', null);
    fitTextBlock(ctx, def.lower, TXT_X, yB + 6 + 22 + 4, TXT_W, hB - 22 - 16,
      { start: 24, min: 17, weight: '600', color: '#d3dfec' });
  }

  /* 中段 (即時: プレイ/反転/暴露で解決) — カード中央に固定。最も読ませたい */
  if (def.middle) {
    const hM = Math.min(240, 22 + 7 + measureTextBlock(ctx, def.middle, TXT_W, { start: 24, weight: '600' }) + 14);
    let yM = Math.round(440 - hM / 2);                    // 中央アンカー
    yM = Math.max(yM, REVEAL_PX + 10);                    // 上段と被らない
    yM = Math.min(yM, bottomTop - 10 - hM);               // 下段と被らない
    zoneRects.middle = [BOX_X, yM, BOX_W, hM];
    zonePanel(yM, hM, true);
    chip(ctx, TXT_X, yM + 7, '◆', '中段・即時', null, accent);
    fitTextBlock(ctx, def.middle, TXT_X, yM + 7 + 22 + 5, TXT_W, hM - 22 - 20,
      { start: 24, min: 16, weight: '600', color: '#f4f8fe' });
  }

  ctx.restore();

  /* 外枠 */
  ctx.strokeStyle = rgba(accent, 0.6);
  ctx.lineWidth = 5;
  roundRect(ctx, 3, 3, DW - 6, DH - 6, 28); ctx.stroke();
  ctx.restore();
  return zoneRects;
}

/* defId のテクスチャを返す (キャッシュ) */
export function faceTexture(def) {
  const key = def.id;
  if (faceCache.has(key)) return faceCache.get(key);

  const cv = document.createElement('canvas');
  cv.width = CARD.texW; cv.height = CARD.texH;
  const ctx = cv.getContext('2d');
  faceZones.set(key, paintFace(ctx, def, null));

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  faceCache.set(key, tex);
  faceCanvas.set(key, cv);

  if (def.proto === 'UNKNOWN' || !ART_SETS.has(def.set)) return tex;
  loadArt(artUrlFor(def), (img) => {
    paintFace(ctx, def, img);
    tex.needsUpdate = true;
    faceVersion.set(key, (faceVersion.get(key) || 0) + 1);
  });
  return tex;
}

/* キラ加工 (card.js の setFoil) の型紙: 白 = 光らせてよい所 (絵と縁)、黒 = 文字のある所。
   名前と値の帯 (ヘッダ) と、上・中・下段の文の枠には光を乗せない (読みやすさを落とさないため) */
const maskCache = new Map();   // defId -> THREE.CanvasTexture
export function foilMaskTexture(def) {
  if (maskCache.has(def.id)) return maskCache.get(def.id);
  faceTexture(def);                                  // 枠の位置 (faceZones) を用意する
  const rects = faceZones.get(def.id) || {};
  const S = 0.25;
  const cv = document.createElement('canvas');
  cv.width = Math.round(DW * S); cv.height = Math.round(DH * S);
  const ctx = cv.getContext('2d');
  ctx.scale(S, S);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, DW, DH);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, DW, HEAD_H + 8);
  for (const r of Object.values(rects)) {
    if (Array.isArray(r)) ctx.fillRect(r[0] - 8, r[1] - 8, r[2] + 16, r[3] + 16);
  }
  const tex = new THREE.CanvasTexture(cv);
  maskCache.set(def.id, tex);
  return tex;
}

/* 対局の切り替わりで、次の対局に不要な分のテクスチャを解放する。
   keep: 残す defId の集合 (使用プロトコルのカード群) */
export function pruneFaceCache(keepIds) {
  const keep = new Set(keepIds);
  for (const [key, tex] of faceCache) {
    if (keep.has(key)) continue;
    tex.dispose();
    faceCache.delete(key);
    faceCanvas.delete(key);
    faceZones.delete(key);
    faceVersion.delete(key);
    const mask = maskCache.get(key);
    if (mask) { mask.dispose(); maskCache.delete(key); }
  }
  for (const key of urlCache.keys()) {
    if (!keep.has(key.split(':')[0])) urlCache.delete(key);
  }
}

/* カード面を画像として取り出す (拡大プレビュー用) */
export function faceImageURL(def) {
  faceTexture(def);                       // 未生成なら作らせる
  const key = def.id + ':' + (faceVersion.get(def.id) || 0);
  if (urlCache.has(key)) return urlCache.get(key);
  const cv = faceCanvas.get(def.id);
  if (!cv) return null;
  const url = cv.toDataURL('image/png');
  urlCache.set(key, url);
  return url;
}

/* 発動カットイン用: 発動したゾーン以外をグレーアウトし、
   発動ゾーンを金縁で光らせた画像を返す (毎回描き直し、キャッシュしない) */
export function activationImageURL(def, zone) {
  faceTexture(def);
  const key = def.id + ':' + (faceVersion.get(def.id) || 0) + ':' + zone;
  if (urlCache.has(key)) return urlCache.get(key);
  const base = faceCanvas.get(def.id);
  if (!base) return null;
  const cv = document.createElement('canvas');
  cv.width = base.width; cv.height = base.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(base, 0, 0);
  /* 全体に暗幕 → 発動ゾーンだけベースから再コピーして金縁で光らせる */
  ctx.fillStyle = 'rgba(3,5,10,.62)';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const rects = faceZones.get(def.id) || {};
  const r = zone && rects[zone];
  if (r) {
    const sx = cv.width / DW, sy = cv.height / DH;
    const x = r[0] * sx, y = r[1] * sy, w = r[2] * sx, h = r[3] * sy;
    ctx.drawImage(base, x, y, w, h, x, y, w, h);
    ctx.strokeStyle = '#ffe9a3';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#ffb3da';
    ctx.shadowBlur = 18;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.shadowBlur = 0;
  }
  const url = cv.toDataURL('image/png');
  urlCache.set(key, url);
  return url;
}

/* 裏面を画像として取り出す (スタック一覧で、見る権利のない裏向きに使う) */
let backURL = null;
export function backImageURL() {
  if (!backURL) backURL = backTex().image.toDataURL('image/png');
  return backURL;
}

/* ---------- 裏面 ----------
   variant: 自分のカードの裏面の柄 (スリーブ、レベルの報酬)。相手のカードと一覧の画像は standard */
const SLEEVES = {
  /* 標準: 暗い紫の地に、桃→紫の斜めの帯とグリッチの線 (公式アート寄り) */
  default: { a: '#1b1030', b: '#08060f', grid: 'rgba(255,255,255,.035)', halo: '255,79,163', ring: 'rgba(255,79,163,.9)',
    ring2: 'rgba(139,92,246,.7)', strip: '255,79,163', glitch: true },
  crimson: { art: 'art/sleeves/crimson.webp', pattern: 'scales', a: '#4a0f1c', b: '#1a0509', grid: 'rgba(255,120,120,.14)', halo: '255,176,64', ring: 'rgba(255,212,120,.85)',
    ring2: 'rgba(255,120,120,.5)', strip: '255,120,120' },
  circuit: { a: '#0b2a22', b: '#04120e', grid: 'rgba(160,123,255,.08)', halo: '99,243,255', ring: 'rgba(160,123,255,.85)',
    ring2: 'rgba(185,164,255,.55)', strip: '160,123,255', circuit: true },
  holo: { a: '#241a3d', b: '#0b0a18', grid: 'rgba(255,255,255,.1)', halo: '185,140,255', ring: 'rgba(255,255,255,.85)',
    ring2: 'rgba(185,140,255,.6)', strip: '185,140,255', holo: true },
  /* 黒地に金の輪 */
  void: { art: 'art/sleeves/void.webp', pattern: 'stars', a: '#0d0c12', b: '#020203', grid: 'rgba(255,215,130,.05)', halo: '255,196,90', ring: 'rgba(255,214,130,.9)',
    ring2: 'rgba(255,196,90,.4)', strip: '255,196,90' },
  /* 桜色の地に白の輪 */
  sakura: { art: 'art/sleeves/sakura.webp', pattern: 'sakura', a: '#3d1830', b: '#12070f', grid: 'rgba(255,200,225,.08)', halo: '255,170,210', ring: 'rgba(255,232,242,.92)',
    ring2: 'rgba(255,150,200,.6)', strip: '255,170,210' },
  /* 金の地に黒の輪 */
  aurum: { art: 'art/sleeves/aurum.webp', pattern: 'deco', a: '#6b4f14', b: '#231704', grid: 'rgba(255,240,190,.12)', halo: '255,226,150', ring: 'rgba(20,14,4,.85)',
    ring2: 'rgba(255,236,170,.7)', strip: '255,226,150' },
  /* ---- ガチャの見た目 ---- */
  mint: { pattern: 'hex', a: '#0f3a33', b: '#05140f', grid: 'rgba(160,255,220,.08)', halo: '120,240,200', ring: 'rgba(190,255,230,.9)',
    ring2: 'rgba(120,240,200,.5)', strip: '120,240,200' },
  ocean: { art: 'art/sleeves/ocean.webp', pattern: 'waves', a: '#0b2446', b: '#030a18', grid: 'rgba(120,190,255,.08)', halo: '90,170,255', ring: 'rgba(170,215,255,.9)',
    ring2: 'rgba(90,170,255,.5)', strip: '90,170,255' },
  ember: { art: 'art/sleeves/ember.webp', pattern: 'flames', a: '#4a1a06', b: '#160602', grid: 'rgba(255,150,80,.1)', halo: '255,120,50', ring: 'rgba(255,190,110,.92)',
    ring2: 'rgba(255,90,40,.6)', strip: '255,120,50', glitch: true },
  glacier: { art: 'art/sleeves/glacier.webp', pattern: 'ice', a: '#d8ecff', b: '#6f93b8', grid: 'rgba(255,255,255,.25)', halo: '220,240,255', ring: 'rgba(20,50,90,.85)',
    ring2: 'rgba(255,255,255,.8)', strip: '160,210,255' },
  toxic: { art: 'art/sleeves/toxic.webp', pattern: 'hazard', a: '#1d3a05', b: '#081302', grid: 'rgba(190,255,60,.1)', halo: '170,255,40', ring: 'rgba(210,255,90,.92)',
    ring2: 'rgba(120,220,20,.6)', strip: '170,255,40', circuit: true },
  /* 下剋上の褒美: 黒地に金と深紅 */
  slayer: { a: '#2a0808', b: '#000000', grid: 'rgba(255,210,90,.05)', halo: '255,196,60', ring: 'rgba(255,214,90,.95)',
    ring2: 'rgba(220,30,60,.8)', strip: '255,40,70', slayer: true },
  /* ---- ガチャの見た目 (2) ---- */
  tiger: { art: 'art/sleeves/tiger.webp', pattern: 'tiger', a: '#c96a14', b: '#6b2f04', grid: 'rgba(0,0,0,.06)', halo: '255,200,120', ring: 'rgba(20,10,0,.9)',
    ring2: 'rgba(255,220,160,.7)', strip: '255,160,60' },
  pixel: { art: 'art/sleeves/pixel.webp', pattern: 'pixel', a: '#12103a', b: '#05041a', grid: 'rgba(120,120,255,.12)', halo: '124,240,208', ring: 'rgba(124,240,208,.9)',
    ring2: 'rgba(255,121,198,.7)', strip: '124,240,208' },
  koi: { art: 'art/sleeves/koi.webp', pattern: 'koi', a: '#0f3d4a', b: '#04161c', grid: 'rgba(180,230,255,.05)', halo: '255,140,90', ring: 'rgba(255,244,236,.9)',
    ring2: 'rgba(255,90,54,.6)', strip: '255,120,80' },
  aurora: { art: 'art/sleeves/aurora.webp', pattern: 'aurora', a: '#0a1230', b: '#02040c', grid: 'rgba(124,240,208,.04)', halo: '124,240,208', ring: 'rgba(200,255,240,.9)',
    ring2: 'rgba(157,123,255,.7)', strip: '124,240,208' },
  /* ---- かわいい見た目 (ロゴなしの全面の柄) ---- */
  nyanko: { pattern: 'nyanko', noLogo: true, a: '#ffd6e6', b: '#f4c6ff', grid: 'rgba(255,255,255,0)', halo: '255,200,220', ring: 'rgba(0,0,0,0)',
    ring2: 'rgba(0,0,0,0)', strip: '255,140,180' },
  sweets: { pattern: 'sweets', noLogo: true, a: '#fff0f6', b: '#e6f7ff', grid: 'rgba(255,180,200,.12)', halo: '255,220,230', ring: 'rgba(0,0,0,0)',
    ring2: 'rgba(0,0,0,0)', strip: '255,150,190' },
  bunny: { pattern: 'bunny', noLogo: true, a: '#bfe3ff', b: '#e8d8ff', grid: 'rgba(255,255,255,0)', halo: '255,255,255', ring: 'rgba(0,0,0,0)',
    ring2: 'rgba(0,0,0,0)', strip: '170,150,255' },
  rose: { art: 'art/sleeves/rose.webp', pattern: 'rose', noLogo: true, a: '#2a0610', b: '#060103', grid: 'rgba(255,80,110,.04)', halo: '220,40,70', ring: 'rgba(0,0,0,0)',
    ring2: 'rgba(0,0,0,0)', strip: '200,30,60' },
  butterfly: { art: 'art/sleeves/butterfly.webp', pattern: 'butterfly', noLogo: true, a: '#14122e', b: '#030208', grid: 'rgba(255,210,110,.04)', halo: '255,200,90', ring: 'rgba(0,0,0,0)',
    ring2: 'rgba(0,0,0,0)', strip: '220,170,60' },
  momiji: { art: 'art/sleeves/momiji.webp', pattern: 'sakura', a: '#7a1a10', b: '#240603', grid: 'rgba(0,0,0,0)', halo: '255,120,80', ring: 'rgba(0,0,0,0)',
    ring2: 'rgba(0,0,0,0)', strip: '220,60,40' },
  /* 週替わりの褒美: 深い緑に金の月桂冠 */
  laurel: { art: 'art/sleeves/laurel.webp', pattern: 'laurel', a: '#1d3512', b: '#050b03', grid: 'rgba(230,210,120,.05)', halo: '230,210,120', ring: 'rgba(240,215,120,.85)',
    ring2: 'rgba(150,210,110,.6)', strip: '200,180,90' },
  galaxy: { art: 'art/sleeves/galaxy.webp', pattern: 'nebula', a: '#1a0b3d', b: '#040112', grid: 'rgba(255,255,255,.12)', halo: '255,120,220', ring: 'rgba(255,240,255,.95)',
    ring2: 'rgba(124,240,208,.7)', strip: '255,120,220', holo: true, glitch: true }
};
/* スリーブの柄 (報酬ごとに専用の模様)。backTex が地の色と格子のあと、中央の紋章の前に描く */
function seeded(n) {
  let s = n;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const PATTERNS = {
  /* 竜のうろこ: 重なった弧 */
  scales(ctx) {
    ctx.strokeStyle = 'rgba(255,170,120,.28)'; ctx.lineWidth = 2;
    for (let row = 0; row < 22; row++) {
      const y = 20 + row * 34, off = row % 2 ? 24 : 0;
      for (let x = -24 + off; x < DW + 24; x += 48) { ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI); ctx.stroke(); }
    }
  },
  /* 星空: 細かい星と、金の星座の線 */
  stars(ctx) {
    const r = seeded(41);
    for (let k = 0; k < 220; k++) {
      ctx.fillStyle = 'rgba(255,' + (220 + Math.floor(r() * 35)) + ',' + (170 + Math.floor(r() * 80)) + ',' + (0.25 + r() * 0.7) + ')';
      ctx.beginPath(); ctx.arc(r() * DW, r() * DH, r() < 0.93 ? 0.8 + r() : 1.8 + r() * 1.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,214,130,.35)'; ctx.lineWidth = 1.2;
    for (let c = 0; c < 4; c++) {
      let x = 60 + r() * (DW - 120), y = 80 + r() * (DH - 160);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let t = 0; t < 4; t++) { x += (r() - 0.5) * 120; y += (r() - 0.5) * 120; ctx.lineTo(x, y); ctx.fillStyle = 'rgba(255,230,160,.9)'; ctx.fillRect(x - 2, y - 2, 4, 4); }
      ctx.stroke();
    }
  },
  /* 桜: 枝と、舞う花びら */
  sakura(ctx) {
    ctx.save(); ctx.translate(0, 120);          // 上の値の帯に隠れないよう下げる
    ctx.strokeStyle = 'rgba(60,20,30,.85)'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-10, 130); ctx.bezierCurveTo(120, 110, 200, 40, 330, 20); ctx.stroke();
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(170, 72); ctx.bezierCurveTo(210, 110, 260, 130, 300, 170); ctx.stroke();
    const r = seeded(7);
    const flower = (x, y, s, rot, a) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a;
      for (let i = 0; i < 5; i++) {
        ctx.rotate((Math.PI * 2) / 5);
        ctx.fillStyle = '#ffd3e6';
        ctx.beginPath(); ctx.ellipse(0, -s * 0.55, s * 0.32, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ff7eb0'; ctx.beginPath(); ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    for (const [x, y, s] of [[90, 108, 22], [150, 84, 18], [236, 50, 24], [290, 150, 20], [60, 124, 14]]) flower(x, y, s, r() * 3, 0.95);
    ctx.restore();
    for (let k = 0; k < 30; k++) {
      ctx.save(); ctx.translate(r() * DW, 180 + r() * (DH - 200)); ctx.rotate(r() * 6); ctx.globalAlpha = 0.35 + r() * 0.5;
      ctx.fillStyle = '#ffc3dc'; ctx.beginPath(); ctx.ellipse(0, 0, 5 + r() * 4, 3 + r() * 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  },
  /* アールデコ: 放射する光と、段になった枠 */
  deco(ctx) {
    const cx = DW / 2, cy = DH / 2;
    ctx.save(); ctx.translate(cx, cy);
    for (let i = 0; i < 36; i++) {
      ctx.rotate(Math.PI / 18);
      ctx.fillStyle = i % 2 ? 'rgba(255,236,170,.10)' : 'rgba(40,26,4,.18)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-24, -DH); ctx.lineTo(24, -DH); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,236,170,.6)'; ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const m = 30 + k * 12;
      ctx.beginPath();
      ctx.moveTo(m + 30, m); ctx.lineTo(DW - m - 30, m); ctx.lineTo(DW - m, m + 30); ctx.lineTo(DW - m, DH - m - 30);
      ctx.lineTo(DW - m - 30, DH - m); ctx.lineTo(m + 30, DH - m); ctx.lineTo(m, DH - m - 30); ctx.lineTo(m, m + 30); ctx.closePath(); ctx.stroke();
    }
  },
  /* 蜂の巣: 六角形の格子 */
  hex(ctx) {
    const R = 26, h = R * Math.sqrt(3);
    ctx.strokeStyle = 'rgba(190,255,230,.22)'; ctx.lineWidth = 1.6;
    for (let row = -1; row * h * 0.5 < DH + h; row++) {
      for (let col = -1; col * R * 3 < DW + R * 3; col++) {
        const x = col * R * 3 + (row % 2 ? R * 1.5 : 0), y = row * h / 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; ctx.lineTo(x + R * Math.cos(a), y + R * Math.sin(a)); }
        ctx.closePath(); ctx.stroke();
      }
    }
  },
  /* 波: 下から重なる波と、しぶき */
  waves(ctx) {
    for (let k = 0; k < 7; k++) {
      const base = DH * 0.52 + k * 44, amp = 12 + k * 2;
      ctx.fillStyle = 'rgba(' + (40 + k * 12) + ',' + (110 + k * 14) + ',255,' + (0.1 + k * 0.05) + ')';
      ctx.beginPath(); ctx.moveTo(0, DH);
      for (let x = 0; x <= DW; x += 8) ctx.lineTo(x, base + Math.sin(x / 38 + k * 1.3) * amp);
      ctx.lineTo(DW, DH); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(220,240,255,' + (0.15 + k * 0.05) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= DW; x += 8) ctx.lineTo(x, base + Math.sin(x / 38 + k * 1.3) * amp);
      ctx.stroke();
    }
    const r = seeded(19);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(230,245,255,' + (0.3 + r() * 0.5) + ')'; ctx.beginPath(); ctx.arc(r() * DW, DH * 0.45 + r() * 60, 1 + r() * 2.5, 0, Math.PI * 2); ctx.fill(); }
  },
  /* 炎: 下から立ちのぼる炎と火の粉 */
  flames(ctx) {
    const r = seeded(23);
    for (let k = 0; k < 14; k++) {
      const x = r() * DW, h = 180 + r() * 260, w = 40 + r() * 50;
      const g = ctx.createLinearGradient(0, DH, 0, DH - h);
      g.addColorStop(0, 'rgba(255,90,20,.55)'); g.addColorStop(0.6, 'rgba(255,160,40,.3)'); g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - w, DH);
      ctx.bezierCurveTo(x - w, DH - h * 0.5, x + (r() - 0.5) * 40, DH - h * 0.7, x, DH - h);
      ctx.bezierCurveTo(x + (r() - 0.5) * 40, DH - h * 0.7, x + w, DH - h * 0.5, x + w, DH);
      ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < 60; i++) { ctx.fillStyle = 'rgba(255,' + (140 + Math.floor(r() * 100)) + ',60,' + (0.4 + r() * 0.6) + ')'; ctx.beginPath(); ctx.arc(r() * DW, r() * DH * 0.8, 1 + r() * 2, 0, Math.PI * 2); ctx.fill(); }
  },
  /* 氷: 雪の結晶と、切り子の面 */
  ice(ctx) {
    const r = seeded(31);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    for (let k = 0; k < 18; k++) { ctx.beginPath(); ctx.moveTo(r() * DW, r() * DH); ctx.lineTo(r() * DW, r() * DH); ctx.lineTo(r() * DW, r() * DH); ctx.stroke(); }
    const flake = (x, y, s) => {
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(30,70,120,.55)'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -s * 0.55); ctx.lineTo(-s * 0.22, -s * 0.75); ctx.moveTo(0, -s * 0.55); ctx.lineTo(s * 0.22, -s * 0.75); ctx.stroke();
      }
      ctx.restore();
    };
    for (let k = 0; k < 9; k++) flake(40 + r() * (DW - 80), 40 + r() * (DH - 80), 16 + r() * 22);
  },
  /* 毒: 警告の縞と泡 */
  hazard(ctx) {
    for (const y of [0, DH - 46]) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, y, DW, 46); ctx.clip();
      ctx.fillStyle = 'rgba(20,30,0,.9)'; ctx.fillRect(0, y, DW, 46);
      ctx.fillStyle = 'rgba(210,255,60,.85)';
      for (let x = -60; x < DW + 60; x += 40) { ctx.beginPath(); ctx.moveTo(x, y + 46); ctx.lineTo(x + 20, y + 46); ctx.lineTo(x + 46, y); ctx.lineTo(x + 26, y); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    const r = seeded(13);
    for (let i = 0; i < 40; i++) {
      const x = r() * DW, y = 60 + r() * (DH - 120), s = 4 + r() * 16;
      ctx.strokeStyle = 'rgba(200,255,80,' + (0.3 + r() * 0.4) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(230,255,160,.5)'; ctx.beginPath(); ctx.arc(x - s * 0.35, y - s * 0.35, s * 0.2, 0, Math.PI * 2); ctx.fill();
    }
  },
  /* 星雲: 色の雲と、渦を巻く星 */
  nebula(ctx) {
    const r = seeded(53);
    for (const [x, y, rad, c] of [[120, 180, 220, '255,90,200'], [380, 460, 240, '90,220,200'], [260, 320, 180, '140,100,255'], [80, 560, 160, '255,160,90']]) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(' + c + ',.62)'); g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);
    }
    const cx = DW / 2, cy = DH / 2;
    for (let i = 0; i < 260; i++) {
      const t = r() * 7, arm = r() < 0.5 ? 0 : Math.PI, rad = 18 + t * 32;
      const a = t + arm + (r() - 0.5) * 0.5;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + r() * 0.6) + ')';
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 1.1, 0.7 + r() * 1.4, 0, Math.PI * 2); ctx.fill();
    }
  },
  /* 虎: 橙の地に黒い縞 */
  tiger(ctx) {
    const r = seeded(61);
    ctx.fillStyle = 'rgba(10,6,2,.85)';
    for (let k = 0; k < 16; k++) {
      const y = 40 + k * 44 + (r() - 0.5) * 20, side = k % 2 ? 1 : -1, len = 120 + r() * 160;
      const x0 = side < 0 ? -10 : DW + 10;
      ctx.beginPath(); ctx.moveTo(x0, y - 14);
      ctx.bezierCurveTo(x0 - side * len * 0.4, y - 20, x0 - side * len * 0.8, y + 4, x0 - side * len, y + 10);
      ctx.bezierCurveTo(x0 - side * len * 0.7, y + 16, x0 - side * len * 0.3, y + 12, x0, y + 14);
      ctx.closePath(); ctx.fill();
    }
  },
  /* ピクセル: 8 ビットのインベーダーと星 */
  pixel(ctx) {
    const inv = ['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000'];
    const px = (x, y, s, col) => {
      ctx.fillStyle = col;
      inv.forEach((row, j) => [...row].forEach((b, i) => { if (b === '1') ctx.fillRect(x + i * s, y + j * s, s, s); }));
    };
    const cols = ['#7cf0d0', '#ff79c6', '#ffe066', '#8be9fd'];
    let k = 0;
    for (let y = 150; y < DH - 60; y += 110) for (let x = 30; x < DW - 60; x += 120) { px(x + (y / 110 % 2) * 30, y, 7, cols[k++ % cols.length] + 'aa'); }
    const r = seeded(71);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 60; i++) ctx.fillRect(Math.floor(r() * DW / 6) * 6, Math.floor(r() * DH / 6) * 6, 4, 4);
  },
  /* 鯉: 池の波紋と、泳ぐ二匹 */
  koi(ctx) {
    ctx.strokeStyle = 'rgba(180,230,255,.25)'; ctx.lineWidth = 1.5;
    for (const [x, y] of [[120, 520], [390, 250], [300, 600]]) for (let rr = 14; rr < 120; rr += 18) { ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); }
    const fish = (x, y, rot, body, spot) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(0, 0, 58, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(52, 0); ctx.lineTo(92, -22); ctx.quadraticCurveTo(80, 0, 92, 22); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-8, 18, 16, 6, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-8, -18, 16, 6, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = spot;
      ctx.beginPath(); ctx.ellipse(-20, -4, 16, 10, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(16, 5, 12, 8, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-44, -6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    fish(150, 250, 0.5, '#fff4ec', '#ff5a36');
    fish(360, 520, -2.4, '#ffb347', '#1a1a1a');
  },
  /* オーロラ: 夜空の光の帯と、雪の山 */
  aurora(ctx) {
    const r = seeded(83);
    for (let i = 0; i < 120; i++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + r() * 0.6) + ')'; ctx.beginPath(); ctx.arc(r() * DW, r() * DH * 0.6, 0.6 + r() * 1.2, 0, Math.PI * 2); ctx.fill(); }
    for (const [base, col, amp] of [[200, '124,240,208', 40], [260, '157,123,255', 50], [230, '255,120,220', 30]]) {
      for (let x = 0; x < DW; x += 3) {
        const y = base + Math.sin(x / 60 + amp) * amp + Math.sin(x / 23) * 10;
        const g = ctx.createLinearGradient(0, y - 140, 0, y);
        g.addColorStop(0, 'rgba(' + col + ',0)'); g.addColorStop(1, 'rgba(' + col + ',.35)');
        ctx.fillStyle = g; ctx.fillRect(x, y - 140, 3, 140);
      }
    }
    ctx.fillStyle = '#0c1424';
    ctx.beginPath(); ctx.moveTo(0, DH); ctx.lineTo(0, 560); ctx.lineTo(90, 470); ctx.lineTo(170, 540); ctx.lineTo(270, 430); ctx.lineTo(380, 540); ctx.lineTo(450, 490); ctx.lineTo(DW, 540); ctx.lineTo(DW, DH); ctx.fill();
    ctx.fillStyle = 'rgba(235,245,255,.9)';
    for (const [x, y] of [[90, 470], [270, 430], [450, 490]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 26, y + 26); ctx.lineTo(x - 8, y + 20); ctx.lineTo(x + 6, y + 30); ctx.lineTo(x + 26, y + 24); ctx.closePath(); ctx.fill(); }
  },
  /* ---- かわいい柄 ---- */
  /* ねこ: 眠そうなねこの顔を並べて、ハートと星 */
  nyanko(ctx) {
    const face = (x, y, s, col) => {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-s * 0.85, -s * 0.3); ctx.lineTo(-s * 0.7, -s * 1.05); ctx.lineTo(-s * 0.2, -s * 0.7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s * 0.85, -s * 0.3); ctx.lineTo(s * 0.7, -s * 1.05); ctx.lineTo(s * 0.2, -s * 0.7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5b3a4a'; ctx.lineWidth = s * 0.08; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(-s * 0.35, -s * 0.05, s * 0.16, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.35, -s * 0.05, s * 0.16, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.12, s * 0.22); ctx.quadraticCurveTo(0, s * 0.34, 0, s * 0.22); ctx.quadraticCurveTo(0, s * 0.34, s * 0.12, s * 0.22); ctx.stroke();
      ctx.fillStyle = 'rgba(255,140,170,.55)';
      ctx.beginPath(); ctx.ellipse(-s * 0.6, s * 0.2, s * 0.15, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(s * 0.6, s * 0.2, s * 0.15, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); ctx.lineCap = 'butt';
    };
    const cols = ['#fff4ea', '#ffd9a8', '#e9e2ff', '#d6f5ea'];
    let k = 0;
    for (let y = 150; y < DH; y += 120) for (let x = (y / 120) % 2 ? 60 : 130; x < DW; x += 140) face(x, y, 34, cols[k++ % cols.length]);
    const heart = (x, y, s) => {
      ctx.beginPath(); ctx.moveTo(x, y + s * 0.3);
      ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.4, y - s, x, y - s * 0.4);
      ctx.bezierCurveTo(x + s * 0.4, y - s, x + s, y - s * 0.4, x, y + s * 0.3); ctx.fill();
    };
    const r = seeded(97);
    for (let i = 0; i < 18; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,130,170,.7)' : 'rgba(255,220,120,.8)'; heart(r() * DW, 110 + r() * (DH - 130), 6 + r() * 6); }
  },
  /* おかし: ドーナツ・マカロン・キャンディ */
  sweets(ctx) {
    const r = seeded(29);
    const donut = (x, y, s) => {
      ctx.fillStyle = '#e8b06a'; ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ['#ff9ec4', '#b99cff', '#8fe3cf'][Math.floor(r() * 3)];
      ctx.beginPath(); for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.3) { const rr = s * (0.86 + Math.sin(a * 5) * 0.06); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.fill();
      ctx.fillStyle = '#fff6f0'; ctx.beginPath(); ctx.arc(x, y, s * 0.32, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 10; i++) { const a = r() * 6.28, d = s * (0.45 + r() * 0.35); ctx.fillStyle = ['#fff', '#ffe066', '#7cc4ff', '#ff6b9a'][i % 4]; ctx.save(); ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d); ctx.rotate(r() * 3); ctx.fillRect(-4, -1.5, 8, 3); ctx.restore(); }
    };
    const macaron = (x, y, s, col) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y - s * 0.28, s, s * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y + s * 0.28, s, s * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fffaf2'; ctx.fillRect(x - s * 0.9, y - s * 0.08, s * 1.8, s * 0.16);
    };
    const candy = (x, y, s, col) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(0.5);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s * 1.7, -s * 0.5); ctx.lineTo(-s * 1.7, s * 0.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s * 1.7, -s * 0.5); ctx.lineTo(s * 1.7, s * 0.5); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = s * 0.2;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0.5, 3.6); ctx.stroke();
      ctx.restore();
    };
    for (const [x, y, s] of [[110, 180, 50], [390, 360, 56], [140, 560, 46]]) donut(x, y, s);
    for (const [x, y, c] of [[380, 170, '#ffb3cf'], [120, 380, '#c7b8ff'], [390, 580, '#b8f0dc'], [270, 660, '#ffe0a3']]) macaron(x, y, 30, c);
    for (const [x, y, c] of [[260, 250, '#ff7eb0'], [260, 470, '#8fd3ff'], [60, 660, '#ffd166']]) candy(x, y, 16, c);
  },
  /* うさぎ: 雲の上のうさぎと、虹と星 */
  bunny(ctx) {
    const cx = DW / 2;
    const bands = ['#ffb3c7', '#ffd9a0', '#fff3a8', '#c4f2c8', '#b9e0ff', '#d8c4ff'];
    bands.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(cx, 470, 230 - i * 16, Math.PI, 0); ctx.stroke(); });
    const cloud = (x, y, s) => { ctx.fillStyle = '#ffffff'; for (const [dx, dy, rr] of [[-1, 0, 0.6], [-0.4, -0.35, 0.7], [0.35, -0.3, 0.65], [0.95, 0, 0.55], [0, 0.15, 0.75]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2); ctx.fill(); } };
    cloud(cx, 520, 70); cloud(90, 250, 34); cloud(420, 200, 30);
    /* うさぎ */
    ctx.fillStyle = '#fffafc';
    ctx.beginPath(); ctx.ellipse(cx - 26, 350, 16, 50, -0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 26, 350, 16, 50, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffc6d9';
    ctx.beginPath(); ctx.ellipse(cx - 26, 352, 7, 34, -0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 26, 352, 7, 34, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fffafc';
    ctx.beginPath(); ctx.ellipse(cx, 440, 64, 54, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a3040';
    ctx.beginPath(); ctx.arc(cx - 22, 436, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 22, 436, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff9fbf'; ctx.beginPath(); ctx.ellipse(cx, 452, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,150,180,.5)';
    ctx.beginPath(); ctx.ellipse(cx - 40, 458, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 40, 458, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
    const r = seeded(37);
    ctx.fillStyle = '#ffe066';
    for (let i = 0; i < 16; i++) {
      const x = r() * DW, y = 110 + r() * 220, s = 5 + r() * 7;
      ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? s * 0.45 : s; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.fill();
    }
  },
  /* 薔薇: 黒地に深紅の薔薇と、棘のあるつる */
  rose(ctx) {
    const r = seeded(61);
    /* つる */
    ctx.strokeStyle = 'rgba(40,90,50,.85)'; ctx.lineWidth = 4;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath(); let x = r() * DW, y = DH;
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) { const nx = x + (r() - 0.5) * 200, ny = y - 120; ctx.quadraticCurveTo(x + (r() - 0.5) * 160, y - 60, nx, ny); x = nx; y = ny; }
      ctx.stroke();
    }
    const leaf = (x, y, a, s) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      const g = ctx.createLinearGradient(0, -s * 0.4, 0, s * 0.4); g.addColorStop(0, '#2f7a45'); g.addColorStop(1, '#123a1f');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.5, -s * 0.45, s, 0); ctx.quadraticCurveTo(s * 0.5, s * 0.45, 0, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(160,220,150,.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.9, 0); ctx.stroke();
      ctx.restore();
    };
    /* 花びらを外から内へ重ねて、巻いた薔薇にする */
    const rose = (x, y, s) => {
      leaf(x - s * 0.7, y + s * 0.5, 2.6, s * 1.1); leaf(x + s * 0.6, y + s * 0.6, 0.5, s * 1.0);
      const layers = 5;
      for (let L = 0; L < layers; L++) {
        const rad = s * (1 - L * 0.17), n = 5 + (L % 2), off = L * 0.6;
        for (let i = 0; i < n; i++) {
          const a = off + i * Math.PI * 2 / n;
          const px = x + Math.cos(a) * rad * 0.35, py = y + Math.sin(a) * rad * 0.3;
          const g = ctx.createRadialGradient(px, py, 0, px, py, rad * 0.75);
          const light = 30 + L * 9;
          g.addColorStop(0, 'hsl(350,80%,' + light + '%)'); g.addColorStop(1, 'hsl(345,85%,' + (light - 18) + '%)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.ellipse(px, py, rad * 0.62, rad * 0.5, a, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(20,0,6,.45)'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
      ctx.strokeStyle = 'rgba(255,170,190,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let t = 0; t < 12; t += 0.2) { const rr = s * 0.02 * t; ctx.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr * 0.85); } ctx.stroke();
    };
    for (const [x, y, s] of [[DW * 0.5, DH * 0.52, 95], [DW * 0.18, DH * 0.24, 55], [DW * 0.82, DH * 0.3, 48], [DW * 0.2, DH * 0.82, 50], [DW * 0.84, DH * 0.86, 58]]) rose(x, y, s);
    /* 散った花びら */
    for (let i = 0; i < 22; i++) {
      const x = r() * DW, y = 110 + r() * (DH - 120);
      ctx.fillStyle = 'hsla(350,80%,' + (30 + r() * 25) + '%,.8)';
      ctx.beginPath(); ctx.ellipse(x, y, 5 + r() * 5, 3 + r() * 3, r() * 3, 0, Math.PI * 2); ctx.fill();
    }
  },
  /* 黄金の蝶: 夜の地に、金の蝶が舞い、金の粉が散る */
  butterfly(ctx) {
    const r = seeded(83);
    const gold = (x0, y0, x1, y1) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, '#fff3b0'); g.addColorStop(0.35, '#e8b53a'); g.addColorStop(0.6, '#9a6512'); g.addColorStop(0.8, '#f5cf5a'); g.addColorStop(1, '#7a4c0a');
      return g;
    };
    const fly = (x, y, s, a) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.shadowColor = 'rgba(255,200,80,.6)'; ctx.shadowBlur = s * 0.4;
      for (const side of [-1, 1]) {
        ctx.save(); ctx.scale(side, 1);
        ctx.fillStyle = gold(0, -s, s, s);
        /* 上の羽 */
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.bezierCurveTo(s * 0.3, -s * 1.1, s * 1.25, -s * 1.05, s * 1.05, -s * 0.2);
        ctx.bezierCurveTo(s * 0.95, s * 0.05, s * 0.4, s * 0.05, 0, 0); ctx.fill();
        /* 下の羽 */
        ctx.beginPath(); ctx.moveTo(0, s * 0.05);
        ctx.bezierCurveTo(s * 0.7, s * 0.1, s * 0.9, s * 0.75, s * 0.45, s * 0.85);
        ctx.bezierCurveTo(s * 0.2, s * 0.9, s * 0.08, s * 0.4, 0, s * 0.05); ctx.fill();
        ctx.shadowBlur = 0;
        /* 羽の模様 (すかし) */
        ctx.strokeStyle = 'rgba(60,30,0,.55)'; ctx.lineWidth = Math.max(1, s * 0.03);
        for (const [cx, cy, e] of [[0.2, -0.1, 0], [0.55, -0.55, 0], [0.85, -0.4, 0], [0.35, 0.45, 0]]) {
          ctx.beginPath(); ctx.moveTo(s * 0.05, 0); ctx.quadraticCurveTo(s * cx, s * cy, s * (cx + 0.2), s * (cy - 0.15 + e)); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,250,220,.85)';
        ctx.beginPath(); ctx.arc(s * 0.78, -s * 0.55, s * 0.07, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.42, s * 0.6, s * 0.05, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#3a2204'; ctx.beginPath(); ctx.ellipse(0, s * 0.15, s * 0.07, s * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e8b53a'; ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath(); ctx.moveTo(0, -s * 0.25); ctx.quadraticCurveTo(-s * 0.1, -s * 0.6, -s * 0.28, -s * 0.72); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.25); ctx.quadraticCurveTo(s * 0.1, -s * 0.6, s * 0.28, -s * 0.72); ctx.stroke();
      ctx.restore();
    };
    /* 金の粉の帯 */
    for (let i = 0; i < 260; i++) {
      const t = r(), x = DW * 0.1 + t * DW * 0.85 + (r() - 0.5) * 90, y = DH * 0.92 - t * DH * 0.7 + (r() - 0.5) * 90;
      ctx.fillStyle = 'rgba(255,' + (190 + r() * 60 | 0) + ',90,' + (0.2 + r() * 0.6) + ')';
      ctx.beginPath(); ctx.arc(x, y, r() * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    for (const [x, y, s, a] of [[DW * 0.5, DH * 0.5, 120, -0.12], [DW * 0.2, DH * 0.25, 42, -0.5], [DW * 0.82, DH * 0.2, 34, 0.4], [DW * 0.8, DH * 0.78, 48, 0.3], [DW * 0.18, DH * 0.84, 30, -0.3], [DW * 0.6, DH * 0.9, 22, 0.6]]) fly(x, y, s, a);
  },
  /* 月桂冠 (週替わりの褒美): 金の葉の冠と、上に3つの星 */
  laurel(ctx) {
    const cx = DW / 2, cy = DH / 2;
    const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, DH * 0.6);
    g.addColorStop(0, 'rgba(120,180,70,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);
    const leaf = (x, y, rot, s) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      const lg = ctx.createLinearGradient(0, -s, 0, s);
      lg.addColorStop(0, '#fff1b8'); lg.addColorStop(1, '#b8861a');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.55, 0, 0, s); ctx.quadraticCurveTo(-s * 0.55, 0, 0, -s); ctx.fill();
      ctx.strokeStyle = 'rgba(90,60,5,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke();
      ctx.restore();
    };
    for (const side of [-1, 1]) {
      for (let i = 0; i < 11; i++) {
        const t = -0.35 + i * 0.13;           // 下から上へ
        const a = Math.PI / 2 + side * (Math.PI * 0.12 + t * 2.1);
        const R = 150;
        const x = cx + Math.cos(a) * R, y = cy + 30 + Math.sin(a) * R * 1.15;
        leaf(x, y, a + side * 0.9, 26);
        leaf(x - side * 14 * Math.cos(a - Math.PI / 2), y - 14 * Math.sin(a - Math.PI / 2), a + side * 2.2, 21);
      }
    }
    ctx.fillStyle = '#ffe28a';
    const star = (x, y, s) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.45 : s; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
    };
    ctx.shadowColor = 'rgba(255,220,120,.9)'; ctx.shadowBlur = 12;
    star(cx - 44, cy - 150, 13); star(cx, cy - 166, 17); star(cx + 44, cy - 150, 13);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 30px ' + FONT.logo;
    const tg = ctx.createLinearGradient(0, DH - 110, 0, DH - 70);
    tg.addColorStop(0, '#fff4c8'); tg.addColorStop(1, '#c9a23a');
    ctx.fillStyle = tg; ctx.fillText('WEEKLY CHAMPION', cx, DH - 90);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
};

/* GIANT SLAYER の裏面 (下剋上の褒美)。
   背景に王冠をかぶった巨人の影。その王冠ごと、金の一太刀が斜めに断ち切っている。
   中央には挑んだ側の小さな剣、周りに金の二重の縁と飾り、下に GIANT SLAYER の文字 */
function drawSlayer(ctx) {
  const cx = DW / 2;
  ctx.save();
  roundRect(ctx, 0, 0, DW, DH, 30); ctx.clip();
  /* 地: 中心が深紅、外が黒 */
  const bg = ctx.createRadialGradient(cx, DH * 0.46, 20, cx, DH * 0.46, DH * 0.7);
  bg.addColorStop(0, '#5c0d18');
  bg.addColorStop(0.55, '#1c0306');
  bg.addColorStop(1, '#000');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, DW, DH);

  /* 巨人の影: 肩・頭・王冠 (上 2/3 を占める) */
  ctx.fillStyle = 'rgba(8,0,2,.85)';
  ctx.beginPath();
  ctx.moveTo(-20, DH * 0.84);
  ctx.bezierCurveTo(20, DH * 0.56, 120, DH * 0.5, cx - 70, DH * 0.48);
  ctx.lineTo(cx + 70, DH * 0.48);
  ctx.bezierCurveTo(DW - 120, DH * 0.5, DW - 20, DH * 0.56, DW + 20, DH * 0.84);
  ctx.lineTo(DW + 20, DH + 20); ctx.lineTo(-20, DH + 20); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, DH * 0.37, 92, 105, 0, 0, Math.PI * 2); ctx.fill();
  /* 目: 赤く光る */
  ctx.fillStyle = 'rgba(255,40,60,.85)';
  ctx.shadowColor = 'rgba(255,40,60,.9)'; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.ellipse(cx - 34, DH * 0.37, 14, 5, -0.15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 34, DH * 0.37, 14, 5, 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  /* 王冠: 真ん中で割れて、左右にずれている */
  const crown = (dx, dy, rot, from, to) => {
    ctx.save();
    ctx.translate(cx + dx, DH * 0.245 + dy); ctx.rotate(rot);
    ctx.beginPath();
    const pts = [[-96, 40], [-96, -10], [-64, 20], [-32, -34], [0, 14], [32, -34], [64, 20], [96, -10], [96, 40]];
    const part = pts.filter(([x]) => x >= from && x <= to);
    ctx.moveTo(part[0][0], 40);
    for (const [x, y] of part) ctx.lineTo(x, y);
    ctx.lineTo(part[part.length - 1][0], 40); ctx.closePath();
    const cg = ctx.createLinearGradient(0, -34, 0, 40);
    cg.addColorStop(0, '#fff1b8'); cg.addColorStop(0.5, '#d9a02a'); cg.addColorStop(1, '#6b4308');
    ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = 'rgba(40,20,0,.8)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  };
  crown(-18, 6, -0.16, -96, 0);
  crown(22, -8, 0.2, 0, 96);

  /* 一太刀: 右上から左下へ、金の光る斬撃 */
  ctx.save();
  ctx.translate(cx, DH * 0.48); ctx.rotate(-0.95);
  const sg = ctx.createLinearGradient(0, -14, 0, 14);
  sg.addColorStop(0, 'rgba(255,214,90,0)'); sg.addColorStop(0.45, 'rgba(255,240,190,.95)');
  sg.addColorStop(0.55, 'rgba(255,255,255,1)'); sg.addColorStop(1, 'rgba(255,214,90,0)');
  ctx.shadowColor = 'rgba(255,200,60,1)'; ctx.shadowBlur = 30;
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.moveTo(-DH * 0.62, 0); ctx.quadraticCurveTo(0, -16, DH * 0.62, 0); ctx.quadraticCurveTo(0, 7, -DH * 0.62, 0); ctx.fill();
  ctx.shadowBlur = 0;
  /* ひび: 斬撃から枝分かれ */
  let seed = 29;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  ctx.strokeStyle = 'rgba(255,200,80,.55)'; ctx.lineWidth = 1.5;
  for (let k = 0; k < 18; k++) {
    let x = (rnd() - 0.5) * DH * 1.1, y = 0;
    ctx.beginPath(); ctx.moveTo(x, y);
    const dir = rnd() < 0.5 ? -1 : 1;
    for (let t = 0; t < 3; t++) { x += (rnd() - 0.5) * 40; y += dir * (10 + rnd() * 26); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  /* 火花 */
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = 'rgba(255,' + (190 + Math.floor(rnd() * 60)) + ',120,' + (0.4 + rnd() * 0.6) + ')';
    ctx.beginPath(); ctx.arc((rnd() - 0.5) * DH * 1.1, (rnd() - 0.5) * 40, 1 + rnd() * 2.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  /* 中央: 挑んだ側の小さな剣 (上向き) */
  const sy = DH * 0.64;
  ctx.save();
  ctx.translate(cx, sy);
  ctx.shadowColor = 'rgba(255,200,60,.9)'; ctx.shadowBlur = 22;
  const bl = ctx.createLinearGradient(-9, 0, 9, 0);
  bl.addColorStop(0, '#b9b2a0'); bl.addColorStop(0.5, '#ffffff'); bl.addColorStop(1, '#8f8778');
  ctx.fillStyle = bl;
  ctx.beginPath(); ctx.moveTo(0, -120); ctx.lineTo(9, -100); ctx.lineTo(9, 20); ctx.lineTo(-9, 20); ctx.lineTo(-9, -100); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  const gd = ctx.createLinearGradient(0, 16, 0, 34);
  gd.addColorStop(0, '#fff1b8'); gd.addColorStop(1, '#a8700f');
  ctx.fillStyle = gd;
  ctx.beginPath(); ctx.moveTo(-48, 20); ctx.lineTo(48, 20); ctx.lineTo(40, 32); ctx.lineTo(-40, 32); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a1018'; ctx.fillRect(-6, 32, 12, 44);
  ctx.fillStyle = gd; ctx.beginPath(); ctx.arc(0, 84, 10, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  /* 金の二重の縁と、四隅の飾り */
  ctx.strokeStyle = 'rgba(255,210,90,.95)'; ctx.lineWidth = 4;
  roundRect(ctx, 14, 14, DW - 28, DH - 28, 22); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,30,55,.85)'; ctx.lineWidth = 2;
  roundRect(ctx, 26, 26, DW - 52, DH - 52, 16); ctx.stroke();
  ctx.fillStyle = 'rgba(255,214,90,.95)';
  for (const [x, y] of [[40, 40], [DW - 40, 40], [40, DH - 40], [DW - 40, DH - 40]]) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();
  }
  /* 下の文字 */
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 38px ' + FONT.logo;
  const tg = ctx.createLinearGradient(0, DH - 110, 0, DH - 70);
  tg.addColorStop(0, '#fff4c8'); tg.addColorStop(1, '#d99a1a');
  ctx.shadowColor = 'rgba(255,60,80,.8)'; ctx.shadowBlur = 12;
  ctx.fillStyle = tg;
  ctx.fillText('GIANT SLAYER', cx, DH - 88);
  ctx.shadowBlur = 0;
  ctx.font = '800 14px ' + FONT.logo;
  ctx.fillStyle = 'rgba(255,210,150,.7)';
  ctx.fillText('— UNDERDOG —', cx, DH - 58);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

/* 絵のスリーブの画像が読み込めたら知らせる (見た目の画面のプレビューを描き直すため) */
const artListeners = new Set();
export function onSleeveArt(fn) { artListeners.add(fn); return () => artListeners.delete(fn); }

export function backTex(variant) {
  const key = SLEEVES[variant] ? variant : 'default';
  if (backTextures.has(key)) return backTextures.get(key);
  const P = SLEEVES[key];
  const cv = document.createElement('canvas');
  cv.width = CARD.texW; cv.height = CARD.texH;
  const ctx = cv.getContext('2d');
  ctx.scale(cv.width / DW, cv.height / DH);
  /* 絵のスリーブ (art): 画像を全面に敷き、上に値の帯だけ描く。画像は読み込めたら描き直す */
  const paint = (art) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.scale(cv.width / DW, cv.height / DH);
    if (art) {
      ctx.save(); roundRect(ctx, 0, 0, DW, DH, 30); ctx.clip();
      ctx.fillStyle = P.b || '#000'; ctx.fillRect(0, 0, DW, DH);
      /* 絵は上の帯 (FACE DOWN と値) の下から敷く。帯に絵を隠させない。はみ出す分は上下を中央で切る */
      const top = HEAD_H, ah = DH - top;
      const s = Math.max(DW / art.width, ah / art.height);
      const sw = DW / s, sh = ah / s;
      ctx.drawImage(art, (art.width - sw) / 2, (art.height - sh) / 2, sw, sh, 0, top, DW, ah);
      /* 縁を少し暗くして、カードの形を読みやすく */
      const v = ctx.createRadialGradient(DW / 2, DH / 2, DH * 0.35, DW / 2, DH / 2, DH * 0.72);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, DW, DH);
      ctx.restore();
      ctx.strokeStyle = 'rgba(' + P.strip + ',.85)'; ctx.lineWidth = 6;
      roundRect(ctx, 3, 3, DW - 6, DH - 6, 28); ctx.stroke();
    } else {

    const g = ctx.createLinearGradient(0, 0, DW, DH);
    g.addColorStop(0, P.a);
    g.addColorStop(0.5, P.b);
    g.addColorStop(1, P.a);
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, DW, DH, 30); ctx.fill();

    /* 走査線グリッド */
    ctx.strokeStyle = P.grid;
    ctx.lineWidth = 1;
    for (let y = 24; y < DH; y += 26) { ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(DW - 18, y); ctx.stroke(); }
    for (let x = 24; x < DW; x += 26) { ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, DH - 18); ctx.stroke(); }

    /* 標準: 斜めの帯とグリッチの横線 */
    if (P.glitch) {
      ctx.save();
      roundRect(ctx, 0, 0, DW, DH, 30); ctx.clip();
      ctx.translate(DW / 2, DH / 2);
      ctx.rotate(-0.5);
      const bg2 = ctx.createLinearGradient(-DW, 0, DW, 0);
      bg2.addColorStop(0, 'rgba(255,79,163,0)');
      bg2.addColorStop(0.4, 'rgba(255,79,163,.42)');
      bg2.addColorStop(0.6, 'rgba(139,92,246,.45)');
      bg2.addColorStop(1, 'rgba(139,92,246,0)');
      ctx.fillStyle = bg2;
      ctx.fillRect(-DW, -70, DW * 2, 140);
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.fillRect(-DW, -72, DW * 2, 2);
      ctx.fillRect(-DW, 70, DW * 2, 1);
      ctx.restore();
      let seed = 13;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 40; k++) {
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,79,163,' + (0.12 + rnd() * 0.3) + ')' : 'rgba(185,164,255,' + (0.1 + rnd() * 0.25) + ')';
        ctx.fillRect(20 + rnd() * (DW - 120), 60 + rnd() * (DH - 90), 20 + rnd() * 120, 2 + rnd() * 5);
      }
    }

    /* HOLO: 斜めに虹色の光を流す */
    if (P.holo) {
      const hg = ctx.createLinearGradient(0, 0, DW, DH);
      ['rgba(255,122,180,.32)', 'rgba(185,140,255,.3)', 'rgba(185,164,255,.3)', 'rgba(160,123,255,.28)', 'rgba(255,216,106,.3)']
        .forEach((c, k, arr) => hg.addColorStop(k / (arr.length - 1), c));
      ctx.fillStyle = hg;
      roundRect(ctx, 0, 0, DW, DH, 30); ctx.fill();
    }
    /* CIRCUIT: 基板の配線 */
    if (P.circuit) {
      ctx.strokeStyle = 'rgba(160,123,255,.4)';
      ctx.fillStyle = 'rgba(160,123,255,.6)';
      ctx.lineWidth = 3;
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 26; k++) {
        let x = 30 + rnd() * (DW - 60), y = 30 + rnd() * (DH - 60);
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let t = 0; t < 3; t++) {
          if (rnd() < 0.5) x = Math.max(24, Math.min(DW - 24, x + (rnd() - 0.5) * 220));
          else y = Math.max(24, Math.min(DH - 24, y + (rnd() - 0.5) * 220));
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      }
    }

    /* 報酬のスリーブの柄 */
    if (P.pattern && PATTERNS[P.pattern]) { ctx.save(); roundRect(ctx, 0, 0, DW, DH, 30); ctx.clip(); PATTERNS[P.pattern](ctx); ctx.restore(); }
    /* 下剋上の褒美: 巨人と、それを断ち切った一太刀 (中央の紋章も専用) */
    if (P.slayer) drawSlayer(ctx);

    /* 中央の紋章 */
    const cx = DW / 2, cy = DH / 2;
    if (!P.slayer && !P.noLogo) {
    const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, 210);
    halo.addColorStop(0, 'rgba(' + P.halo + ',.5)');
    halo.addColorStop(1, 'rgba(' + P.halo + ',0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, DW, DH);

    ctx.strokeStyle = P.ring;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, 118, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = P.ring2;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 146, 0, Math.PI * 2); ctx.stroke();

    ctx.font = '900 88px ' + FONT.logo;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (P.glitch) {
      ctx.fillStyle = 'rgba(255,79,163,.9)'; ctx.fillText('//', cx + 5, cy + 4);
      ctx.fillStyle = 'rgba(139,92,246,.9)'; ctx.fillText('//', cx - 5, cy + 4);
    }
    ctx.fillStyle = 'rgba(245,240,255,.95)';
    ctx.fillText('//', cx, cy + 4);
    ctx.font = '800 22px ' + FONT.logo;
    ctx.fillStyle = 'rgba(233,240,255,.62)';
    if (P.pattern !== 'laurel') ctx.fillText('C O M P I L E', cx, cy + 190);   // 月桂冠は冠と重なるので出さない
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    /* 裏向きカードの値は 2。表と同じ位置に出して、覆われても読めるようにする */
    const bh = HEAD_H;
    if (art) {                                     // 絵のスリーブでは帯を透かさず、額の上辺のような無地の帯にする
      ctx.save(); roundRect(ctx, 0, 0, DW, DH, 30); ctx.clip();
      ctx.fillStyle = '#080b15'; ctx.fillRect(0, 0, DW, bh);
      ctx.restore();
    }
    const bg = ctx.createLinearGradient(0, 0, DW, 0);
    bg.addColorStop(0, 'rgba(' + P.strip + ',.34)');
    bg.addColorStop(0.62, 'rgba(8,11,21,.95)');
    bg.addColorStop(1, 'rgba(8,11,21,.97)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, DW, bh);
    const bsize = BADGE;
    const bbx = DW - bsize - 12, bby = (bh - bsize) / 2;
    ctx.fillStyle = 'rgba(160,190,215,.92)';
    roundRect(ctx, bbx, bby, bsize, bsize, 14); ctx.fill();
    ctx.fillStyle = '#04060e';
    ctx.font = '800 ' + BADGE_FONT + 'px ' + FONT.hud;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('2', bbx + bsize / 2, bby + bsize / 2 + 3);
    ctx.textAlign = 'left';
    ctx.font = '700 30px ' + FONT.hud;
    ctx.fillStyle = 'rgba(233,240,255,.86)';
    ctx.fillText('FACE DOWN', 18, bh / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(' + P.strip + ',.75)';
    ctx.fillRect(0, bh - 4, DW, 4);

    ctx.strokeStyle = 'rgba(' + P.strip + ',.55)';
    ctx.lineWidth = 6;
    roundRect(ctx, 3, 3, DW - 6, DH - 6, 28); ctx.stroke();
  };
  paint(null);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  if (P.art) {
    const img = new Image();
    img.onload = () => { paint(img); tex.needsUpdate = true; for (const fn of artListeners) fn(key); };
    img.src = P.art;
  }
  backTextures.set(key, tex);
  return tex;
}
