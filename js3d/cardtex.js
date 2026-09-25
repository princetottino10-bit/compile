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
  crimson: { a: '#4a0f1c', b: '#1a0509', grid: 'rgba(255,120,120,.14)', halo: '255,176,64', ring: 'rgba(255,212,120,.85)',
    ring2: 'rgba(255,120,120,.5)', strip: '255,120,120' },
  circuit: { a: '#0b2a22', b: '#04120e', grid: 'rgba(160,123,255,.08)', halo: '99,243,255', ring: 'rgba(160,123,255,.85)',
    ring2: 'rgba(185,164,255,.55)', strip: '160,123,255', circuit: true },
  holo: { a: '#241a3d', b: '#0b0a18', grid: 'rgba(255,255,255,.1)', halo: '185,140,255', ring: 'rgba(255,255,255,.85)',
    ring2: 'rgba(185,140,255,.6)', strip: '185,140,255', holo: true },
  /* 黒地に金の輪 */
  void: { a: '#0d0c12', b: '#020203', grid: 'rgba(255,215,130,.05)', halo: '255,196,90', ring: 'rgba(255,214,130,.9)',
    ring2: 'rgba(255,196,90,.4)', strip: '255,196,90' },
  /* 桜色の地に白の輪 */
  sakura: { a: '#3d1830', b: '#12070f', grid: 'rgba(255,200,225,.08)', halo: '255,170,210', ring: 'rgba(255,232,242,.92)',
    ring2: 'rgba(255,150,200,.6)', strip: '255,170,210' },
  /* 金の地に黒の輪 */
  aurum: { a: '#6b4f14', b: '#231704', grid: 'rgba(255,240,190,.12)', halo: '255,226,150', ring: 'rgba(20,14,4,.85)',
    ring2: 'rgba(255,236,170,.7)', strip: '255,226,150' },
  /* ---- ガチャの見た目 ---- */
  mint: { a: '#0f3a33', b: '#05140f', grid: 'rgba(160,255,220,.08)', halo: '120,240,200', ring: 'rgba(190,255,230,.9)',
    ring2: 'rgba(120,240,200,.5)', strip: '120,240,200' },
  ocean: { a: '#0b2446', b: '#030a18', grid: 'rgba(120,190,255,.08)', halo: '90,170,255', ring: 'rgba(170,215,255,.9)',
    ring2: 'rgba(90,170,255,.5)', strip: '90,170,255' },
  ember: { a: '#4a1a06', b: '#160602', grid: 'rgba(255,150,80,.1)', halo: '255,120,50', ring: 'rgba(255,190,110,.92)',
    ring2: 'rgba(255,90,40,.6)', strip: '255,120,50', glitch: true },
  glacier: { a: '#d8ecff', b: '#6f93b8', grid: 'rgba(255,255,255,.25)', halo: '220,240,255', ring: 'rgba(20,50,90,.85)',
    ring2: 'rgba(255,255,255,.8)', strip: '160,210,255' },
  toxic: { a: '#1d3a05', b: '#081302', grid: 'rgba(190,255,60,.1)', halo: '170,255,40', ring: 'rgba(210,255,90,.92)',
    ring2: 'rgba(120,220,20,.6)', strip: '170,255,40', circuit: true },
  /* 下剋上の褒美: 黒地に金と深紅 */
  slayer: { a: '#2a0808', b: '#000000', grid: 'rgba(255,210,90,.1)', halo: '255,196,60', ring: 'rgba(255,214,90,.95)',
    ring2: 'rgba(220,30,60,.8)', strip: '255,40,70', glitch: true },
  galaxy: { a: '#1a0b3d', b: '#040112', grid: 'rgba(255,255,255,.12)', halo: '255,120,220', ring: 'rgba(255,240,255,.95)',
    ring2: 'rgba(124,240,208,.7)', strip: '255,120,220', holo: true, glitch: true }
};
export function backTex(variant) {
  const key = SLEEVES[variant] ? variant : 'default';
  if (backTextures.has(key)) return backTextures.get(key);
  const P = SLEEVES[key];
  const cv = document.createElement('canvas');
  cv.width = CARD.texW; cv.height = CARD.texH;
  const ctx = cv.getContext('2d');
  ctx.scale(cv.width / DW, cv.height / DH);

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

  /* 中央の紋章 */
  const cx = DW / 2, cy = DH / 2;
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
  ctx.fillText('C O M P I L E', cx, cy + 190);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  /* 裏向きカードの値は 2。表と同じ位置に出して、覆われても読めるようにする */
  const bh = HEAD_H;
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

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  backTextures.set(key, tex);
  return tex;
}
