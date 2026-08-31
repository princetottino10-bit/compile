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
import { CARD } from './theme.js';
import { drawIcon } from './icons.js';

/* 座標は 512x716 のデザイン空間で書き、実テクスチャへは拡大して描く */
const DW = 512, DH = 716;

const faceCache = new Map();   // defId -> THREE.CanvasTexture
const faceCanvas = new Map();  // defId -> HTMLCanvasElement (プレビュー用)
const artCache = new Map();    // url -> HTMLImageElement | null (失敗)
let backTexture = null;

/* カードアートが存在するセット (Main 2 / Aux 2 は scripts/build_card_art_2.py で生成) */
export const ART_SETS = new Set(['Main 1', 'Aux 1', 'Main 2', 'Aux 2']);

/* 覆われたときも見えている必要がある上端の割合 (theme.js の coverStep と連動) */
export const REVEAL_RATIO = 0.285;
const REVEAL_PX = Math.floor(DH * REVEAL_RATIO);   // = 204

/* ---------- 画像ロード (失敗は null として記憶し、再試行しない) ---------- */
function loadArt(url, onReady) {
  if (artCache.has(url)) {
    const cached = artCache.get(url);
    if (cached) onReady(cached);
    return;
  }
  const img = new Image();
  img.onload = () => { artCache.set(url, img); onReady(img); };
  img.onerror = () => { artCache.set(url, null); };
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
  const h = String(hex || '#63f3ff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/* 現在のフォントで折り返した行の配列を返す */
function wrapLines(ctx, text, maxW) {
  const lines = [];
  let line = '';
  for (const ch of Array.from(text)) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* 枠 (maxW × maxH) に収まるフォントサイズを探して描く */
function fitTextBlock(ctx, text, x, y, maxW, maxH, opts) {
  const start = opts.start || 24;
  const min = opts.min || 15;
  const lh = opts.lineH || 1.34;
  const weight = opts.weight || '500';
  let px = start;
  let lines = [];
  for (; px >= min; px--) {
    ctx.font = weight + ' ' + px + 'px system-ui, sans-serif';
    lines = wrapLines(ctx, text, maxW);
    if (lines.length * px * lh <= maxH) break;
  }
  ctx.fillStyle = opts.color || '#e8eef8';
  let ty = y + px;                       // 1行目のベースライン
  for (const line of lines) {
    if (ty > y + maxH + 4) break;        // min でも収まらない場合の保険
    ctx.fillText(line, x, ty);
    ty += px * lh;
  }
}

/* 事前見積り: このテキストがどれだけの高さを要るか (描かずに測る) */
function measureTextBlock(ctx, text, maxW, opts) {
  const start = opts.start || 24;
  const lh = opts.lineH || 1.34;
  ctx.font = (opts.weight || '500') + ' ' + start + 'px system-ui, sans-serif';
  return Math.ceil(wrapLines(ctx, text, maxW).length * start * lh);
}

/* 役割ラベルのチップ (高さ26)。塗り (bg) か枠線 (fg) のどちらか */
function chip(ctx, x, y, glyph, label, fg, bg) {
  const text = glyph + ' ' + label;
  ctx.font = '800 17px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 20;
  if (bg) {
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, 26, 7);
    ctx.fill();
  } else {
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, 26, 7);
    ctx.stroke();
  }
  ctx.fillStyle = bg ? '#04060e' : fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 10, y + 14);
  ctx.textBaseline = 'alphabetic';
}

/* ---------- 表面 ---------- */
const HEAD_H = 104;
const TEXT_X = 26;                 // ゾーン内テキストの左端 (左バーの分を空ける)
const TEXT_W = DW - TEXT_X - 22;

function paintFace(ctx, def, art) {
  const accent = def.color || '#63f3ff';
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

  /* --- 各ゾーンの高さを先に見積もる --- */
  /* 上段: ヘッダと合わせて REVEAL_PX (覆われても見える範囲) に必ず収める */
  let topH = 0;
  if (def.upper) {
    const need = measureTextBlock(ctx, def.upper, TEXT_W, { start: 21 });
    topH = Math.min(REVEAL_PX - HEAD_H, 26 + 6 + need + 14);
  }
  const artTop = HEAD_H + topH;

  const midOpts = { start: 25, min: 16, weight: '600' };
  const botOpts = { start: 21, min: 14 };
  const needM = def.middle ? 26 + 6 + measureTextBlock(ctx, def.middle, TEXT_W, midOpts) + 16 : 0;
  const needB = def.lower ? 26 + 6 + measureTextBlock(ctx, def.lower, TEXT_W, botOpts) + 14 : 0;

  /* アートは最低 150px 残し、足りなければ本文側を等分で縮める */
  let artBottom = DH - needM - needB;
  const artMin = artTop + 150;
  if (artBottom < artMin) artBottom = artMin;
  const textSpace = DH - artBottom;
  const shrink = needM + needB > 0 ? Math.min(1, textSpace / (needM + needB)) : 1;
  const boxM = Math.floor(needM * shrink);
  const boxB = Math.floor(needB * shrink);

  /* --- アート (枠の外へはみ出さないようクリップ) --- */
  const artH = artBottom - artTop;
  if (art) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, artTop, DW, artH);
    ctx.clip();
    const s = Math.max(DW / art.width, artH / art.height);
    const dw = art.width * s, dh = art.height * s;
    ctx.drawImage(art, (DW - dw) / 2, artTop + (artH - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    const g = ctx.createRadialGradient(DW / 2, artTop + artH * 0.45, 20, DW / 2, artTop + artH * 0.45, DW * 0.8);
    g.addColorStop(0, rgba(accent, 0.5));
    g.addColorStop(1, 'rgba(4,6,14,0)');
    ctx.fillStyle = '#080b16'; ctx.fillRect(0, artTop, DW, artH);
    ctx.fillStyle = g; ctx.fillRect(0, artTop, DW, artH);
    ctx.font = '700 110px system-ui, sans-serif';
    ctx.fillStyle = rgba(accent, 0.45);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.proto.slice(0, 2), DW / 2, artTop + artH * 0.46);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  /* 明るいアートが 3D 上で白飛びしないよう、薄い暗幕とビネット */
  ctx.fillStyle = 'rgba(4,6,14,.2)';
  ctx.fillRect(0, artTop, DW, artH);
  const vig = ctx.createRadialGradient(DW / 2, artTop + artH * 0.45, DW * 0.2, DW / 2, artTop + artH * 0.45, DW * 0.8);
  vig.addColorStop(0, 'rgba(4,6,14,0)');
  vig.addColorStop(1, 'rgba(4,6,14,.55)');
  ctx.fillStyle = vig; ctx.fillRect(0, artTop, DW, artH);
  const fade = ctx.createLinearGradient(0, artBottom - 70, 0, artBottom);
  fade.addColorStop(0, 'rgba(5,7,15,0)');
  fade.addColorStop(1, 'rgba(5,7,15,.95)');
  ctx.fillStyle = fade; ctx.fillRect(0, artBottom - 70, DW, 70);

  /* --- ヘッダ: プロトコル名 + 効果アイコン + 値 --- */
  const head = ctx.createLinearGradient(0, 0, DW, 0);
  head.addColorStop(0, rgba(accent, 0.62));
  head.addColorStop(0.62, 'rgba(8,11,21,.96)');
  head.addColorStop(1, 'rgba(8,11,21,.98)');
  ctx.fillStyle = head;
  ctx.fillRect(0, 0, DW, HEAD_H);

  const badge = 86;
  const bx = DW - badge - 14, by = (HEAD_H - badge) / 2;
  ctx.fillStyle = accent;
  roundRect(ctx, bx, by, badge, badge, 14); ctx.fill();
  ctx.fillStyle = '#04060e';
  ctx.font = '900 62px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(def.value), bx + badge / 2, by + badge / 2 + 3);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  /* 効果種別アイコン (覆われても見えるヘッダに置く) */
  const types = (def.effectTypes || []).slice(0, 3);
  const iconSize = 42, iconGap = 8;
  let ix = bx - 12 - types.length * (iconSize + iconGap);
  const iconLeft = ix;
  for (const t of types) {
    drawIcon(ctx, t, ix, (HEAD_H - iconSize) / 2, iconSize, 'rgba(238,244,252,.92)');
    ix += iconSize + iconGap;
  }

  /* プロトコル名 (バッジとアイコンを避けて縮める) */
  const nameMax = (types.length ? iconLeft : bx) - 30;
  let namePx = 46;
  do {
    ctx.font = '800 ' + namePx + 'px system-ui, sans-serif';
    if (ctx.measureText(def.proto).width <= nameMax) break;
    namePx -= 2;
  } while (namePx > 22);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.proto, 18, HEAD_H / 2 + 1);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = accent;
  ctx.fillRect(0, HEAD_H - 4, DW, 4);

  /* --- 上段 (常在: 覆われても効く) --- */
  if (topH) {
    ctx.fillStyle = 'rgba(6,9,18,.94)';
    ctx.fillRect(0, HEAD_H, DW, topH);
    ctx.fillStyle = rgba(accent, 0.9);
    ctx.fillRect(0, HEAD_H, 6, topH);
    chip(ctx, TEXT_X, HEAD_H + 8, '▲', '上段・常在', rgba(accent, 0.95), null);
    fitTextBlock(ctx, def.upper, TEXT_X, HEAD_H + 8 + 26 + 6, TEXT_W, topH - 26 - 20,
      { start: 21, min: 14, color: '#dce6f5' });
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.fillRect(0, HEAD_H + topH - 1, DW, 1);
  }

  /* --- 中段 (即時: プレイ/反転/暴露で解決) — 最も読ませたい --- */
  let zy = artBottom;
  if (def.middle) {
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, zy, DW, boxM);
    ctx.fillStyle = rgba(accent, 0.10);
    ctx.fillRect(0, zy, DW, boxM);
    ctx.fillStyle = rgba(accent, 0.95);
    ctx.fillRect(0, zy, 6, boxM);
    chip(ctx, TEXT_X, zy + 8, '◆', '中段・即時', null, accent);
    fitTextBlock(ctx, def.middle, TEXT_X, zy + 8 + 26 + 6, TEXT_W, boxM - 26 - 22,
      { ...midOpts, color: '#f4f8fe' });
    zy += boxM;
  }

  /* --- 下段 (補助: 覆われていないときのみ) --- */
  if (def.lower) {
    ctx.fillStyle = '#080b15';
    ctx.fillRect(0, zy, DW, DH - zy);
    ctx.fillStyle = 'rgba(255,255,255,.04)';
    ctx.fillRect(0, zy, DW, DH - zy);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(0, zy, 6, DH - zy);
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.fillRect(0, zy, DW, 1);
    chip(ctx, TEXT_X, zy + 8, '▼', '下段・補助', 'rgba(178,196,214,.95)', null);
    fitTextBlock(ctx, def.lower, TEXT_X, zy + 8 + 26 + 6, TEXT_W, boxB - 26 - 20,
      { ...botOpts, color: '#b7c8d8' });
  }

  ctx.restore();

  /* 外枠 */
  ctx.strokeStyle = rgba(accent, 0.6);
  ctx.lineWidth = 5;
  roundRect(ctx, 3, 3, DW - 6, DH - 6, 28); ctx.stroke();
  ctx.restore();
}

/* defId のテクスチャを返す (キャッシュ) */
export function faceTexture(def) {
  const key = def.id;
  if (faceCache.has(key)) return faceCache.get(key);

  const cv = document.createElement('canvas');
  cv.width = CARD.texW; cv.height = CARD.texH;
  const ctx = cv.getContext('2d');
  paintFace(ctx, def, null);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  faceCache.set(key, tex);
  faceCanvas.set(key, cv);

  if (def.proto === 'UNKNOWN' || !ART_SETS.has(def.set)) return tex;
  loadArt(artUrlFor(def), (img) => {
    paintFace(ctx, def, img);
    tex.needsUpdate = true;
  });
  return tex;
}

/* カード面を画像として取り出す (拡大プレビュー用) */
export function faceImageURL(def) {
  faceTexture(def);                       // 未生成なら作らせる
  const cv = faceCanvas.get(def.id);
  return cv ? cv.toDataURL('image/png') : null;
}

/* ---------- 裏面 (全カード共通) ---------- */
export function backTex() {
  if (backTexture) return backTexture;
  const cv = document.createElement('canvas');
  cv.width = CARD.texW; cv.height = CARD.texH;
  const ctx = cv.getContext('2d');
  ctx.scale(cv.width / DW, cv.height / DH);

  const g = ctx.createLinearGradient(0, 0, DW, DH);
  g.addColorStop(0, '#1d2a4d');
  g.addColorStop(0.5, '#0e1730');
  g.addColorStop(1, '#1d2a4d');
  ctx.fillStyle = g;
  roundRect(ctx, 0, 0, DW, DH, 30); ctx.fill();

  /* 走査線グリッド */
  ctx.strokeStyle = 'rgba(99,243,255,.16)';
  ctx.lineWidth = 1;
  for (let y = 24; y < DH; y += 26) { ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(DW - 18, y); ctx.stroke(); }
  for (let x = 24; x < DW; x += 26) { ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, DH - 18); ctx.stroke(); }

  /* 中央の紋章 */
  const cx = DW / 2, cy = DH / 2;
  const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, 210);
  halo.addColorStop(0, 'rgba(255,59,157,.5)');
  halo.addColorStop(1, 'rgba(255,59,157,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, DW, DH);

  ctx.strokeStyle = 'rgba(109,255,194,.78)';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, 118, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(99,243,255,.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 146, 0, Math.PI * 2); ctx.stroke();

  ctx.font = '900 88px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(233,240,255,.9)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('//', cx, cy + 4);
  ctx.font = '800 22px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(233,240,255,.62)';
  ctx.fillText('C O M P I L E', cx, cy + 190);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  /* 裏向きカードの値は 2。表と同じ位置に出して、覆われても読めるようにする */
  const bh = HEAD_H;
  const bg = ctx.createLinearGradient(0, 0, DW, 0);
  bg.addColorStop(0, 'rgba(99,243,255,.34)');
  bg.addColorStop(0.62, 'rgba(8,11,21,.95)');
  bg.addColorStop(1, 'rgba(8,11,21,.97)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, DW, bh);
  const bsize = 86;
  const bbx = DW - bsize - 14, bby = (bh - bsize) / 2;
  ctx.fillStyle = 'rgba(160,190,215,.92)';
  roundRect(ctx, bbx, bby, bsize, bsize, 14); ctx.fill();
  ctx.fillStyle = '#04060e';
  ctx.font = '900 62px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('2', bbx + bsize / 2, bby + bsize / 2 + 3);
  ctx.textAlign = 'left';
  ctx.font = '800 30px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(233,240,255,.86)';
  ctx.fillText('FACE DOWN', 18, bh / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(99,243,255,.75)';
  ctx.fillRect(0, bh - 4, DW, 4);

  ctx.strokeStyle = 'rgba(99,243,255,.55)';
  ctx.lineWidth = 6;
  roundRect(ctx, 3, 3, DW - 6, DH - 6, 28); ctx.stroke();

  backTexture = new THREE.CanvasTexture(cv);
  backTexture.colorSpace = THREE.SRGBColorSpace;
  backTexture.anisotropy = 8;
  return backTexture;
}
