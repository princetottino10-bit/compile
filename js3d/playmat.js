/* =========================================================================
 * 盤面の柄 (プレイマット)。公式プレイマットの配色を意識したオリジナルの柄を、canvas に描いて盤面に敷く。
 *   NEON GRID (はじめから) / NEBULA (マット1: 桃・紫・青の星雲) / VORTEX (マット2: 白地に橙・赤・青の渦)
 *   BIOMECH (マット3: 暗い青緑の有機的な柄と紫の光)
 *   プレイヤーレベルが上がると解放される (MATS)。選ぶのは設定の画面
 * ========================================================================= */
import { bonusXp } from './xp.js';
import * as THREE from '../vendor/three.module.js';
import { BOARD, CARD, VIEW } from './theme.js';
import { pilePos } from './layout.js';
import { playerLevel } from './stats-data.js';
import { COSMETICS, unlockLevel } from './rewards.js';

/* 盤面の範囲 (arena.js の枠と同じ): x ±5 / z ±5.4。1単位 = 100px */
export const MAT_W = 10, MAT_D = 10.8;
const PX = 100;
const W = MAT_W * PX, H = MAT_D * PX;
const cx = (x) => (x + MAT_W / 2) * PX;
const cy = (z) => (z + MAT_D / 2) * PX;

/* プレイヤーレベル (stats-data.js) が上がると解放。解放のレベルは rewards.js */
const lv = (rs) => playerLevel(rs, bonusXp()).level;
export const MATS = COSMETICS.mat.map(([key, name]) => ({
  key, name, need: unlockLevel('mat', key), unlocked: (rs) => lv(rs) >= unlockLevel('mat', key)
}));

export function matUnlocked(key, records) {
  const m = MATS.find(x => x.key === key);
  return !!(m && m.unlocked(records));
}

/* 決まった並びの乱数 (柄が毎回同じになるように) */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function blob(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', alpha));
  g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/* 札を置く場所: 各ラインのスタック・プロトコル板・山札と捨て札 (world 座標から) */
function slots() {
  const out = [];
  const cw = CARD.w * 1.12, ch = CARD.h * 1.1;
  for (const x of BOARD.laneX) {
    for (const s of [-1, 1]) {
      /* プロトコル板 */
      out.push({ kind: 'proto', x: cx(x) - 0.78 * PX, y: cy(s * 0.5) - 0.4 * PX, w: 1.56 * PX, h: 0.8 * PX });
      /* スタック (1枚目から手前/奥へ伸びる帯) */
      const z0 = s * (BOARD.stackZ[1] - ch / 2 + 0.05), z1 = s * 4.75;
      out.push({ kind: 'lane', x: cx(x) - cw / 2 * PX, y: cy(Math.min(z0, z1)), w: cw * PX, h: Math.abs(z1 - z0) * PX });
    }
  }
  /* 山札と捨て札は、実際に置く場所 (layout.js) に合わせる。
     横持ちのスマホでは自分の山を奥へ寄せるので、枠も一緒に動かす (ずれて見えていた) */
  for (const side of [0, 1]) {
    for (const kind of ['deck', 'trash']) {
      const p = pilePos(kind, side, 0, 0);
      const w = cw * p.scale, h = ch * p.scale;
      out.push({ kind: 'pile', x: cx(p.pos[0]) - w / 2 * PX, y: cy(p.pos[2]) - h / 2 * PX, w: w * PX, h: h * PX });
    }
  }
  return out;
}

function drawSlots(ctx, fill, stroke, lw) {
  for (const s of slots()) {
    rrect(ctx, s.x, s.y, s.w, s.h, s.kind === 'proto' ? 10 : 14);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
    /* 四隅の小さな鉤 (印刷のトンボ風) */
    ctx.lineWidth = lw * 1.6;
    const L = 12;
    for (const [px, py, sx, sy] of [[s.x, s.y, 1, 1], [s.x + s.w, s.y, -1, 1], [s.x, s.y + s.h, 1, -1], [s.x + s.w, s.y + s.h, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(px + sx * 4, py + sy * (4 + L)); ctx.lineTo(px + sx * 4, py + sy * 4); ctx.lineTo(px + sx * (4 + L), py + sy * 4); ctx.stroke();
    }
  }
}

function edgeTitle(ctx, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = '900 46px Orbitron, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [x, rot] of [[46, -Math.PI / 2], [W - 46, Math.PI / 2]]) {
    ctx.save();
    ctx.translate(x, H / 2);
    ctx.rotate(rot);
    ctx.fillText('COMPILE', 0, 0);
    ctx.font = '700 18px Oxanium, system-ui, sans-serif';
    ctx.fillText('< / >', 0, 40);
    ctx.restore();
    ctx.font = '900 46px Orbitron, system-ui, sans-serif';
  }
  ctx.restore();
}

function centerBand(ctx, color, alpha, half) {
  const g = ctx.createLinearGradient(0, H / 2 - half, 0, H / 2 + half);
  g.addColorStop(0, color.replace('A', 0));
  g.addColorStop(0.5, color.replace('A', alpha));
  g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, H / 2 - half, W, half * 2);
}

/* マット1 風: 桃・紫・青の星雲とグリッチの横線、中央の白い光の帯 */
function drawNebula(ctx) {
  const r = rng(11);
  ctx.fillStyle = '#1b1034';
  ctx.fillRect(0, 0, W, H);
  blob(ctx, W * 0.2, H * 0.35, W * 0.55, 'rgba(255,95,176,A)', 0.55);
  blob(ctx, W * 0.82, H * 0.62, W * 0.55, 'rgba(77,124,255,A)', 0.5);
  blob(ctx, W * 0.5, H * 0.5, W * 0.5, 'rgba(155,92,255,A)', 0.45);
  blob(ctx, W * 0.3, H * 0.86, W * 0.4, 'rgba(255,138,208,A)', 0.35);
  blob(ctx, W * 0.72, H * 0.14, W * 0.4, 'rgba(90,184,255,A)', 0.35);
  for (let i = 0; i < 220; i++) {                                   // グリッチの横線
    const y = r() * H, w = 20 + r() * 180, h = 2 + r() * 9;
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,' + (0.04 + r() * 0.14) + ')' : 'rgba(255,170,225,' + (0.05 + r() * 0.16) + ')';
    ctx.fillRect(r() * W, y, w, h);
  }
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.12 + r() * 0.2) + ')';
    ctx.fillRect(0, r() * H, W, 1);
  }
  centerBand(ctx, 'rgba(255,240,250,A)', 0.42, 120);
  drawSlots(ctx, 'rgba(22,10,38,.72)', 'rgba(255,255,255,.7)', 2);
  edgeTitle(ctx, 'rgba(255,255,255,.72)');
}

/* マット2 風: 白地に橙・赤・青の渦 */
function drawVortex(ctx) {
  const r = rng(22);
  ctx.fillStyle = '#ece5d8';
  ctx.fillRect(0, 0, W, H);
  const colors = ['rgba(242,138,60,A)', 'rgba(226,81,58,A)', 'rgba(42,91,154,A)', 'rgba(111,179,217,A)', 'rgba(138,143,153,A)', 'rgba(250,196,90,A)'];
  const ox = W * 0.5, oy = H * 0.5;
  /* 渦巻きの腕: 角度が進むほど半径が広がる線を、太さと色を変えて重ねる */
  ctx.lineCap = 'round';
  for (let i = 0; i < 110; i++) {
    const r0 = 30 + r() * 520, a0 = r() * Math.PI * 2, span = 0.6 + r() * 2.2, grow = 40 + r() * 90;
    ctx.strokeStyle = colors[Math.floor(r() * colors.length)].replace('A', 0.3 + r() * 0.5);
    ctx.lineWidth = 3 + r() * 30;
    ctx.beginPath();
    for (let t = 0; t <= 1.0001; t += 0.04) {
      const ang = a0 + span * t, rad = r0 + grow * span * t;
      const x = ox + Math.cos(ang) * rad, y = oy + Math.sin(ang) * rad * 0.92;
      if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 500; i++) {                                     // 絵の具の飛沫
    ctx.fillStyle = colors[Math.floor(r() * colors.length)].replace('A', 0.2 + r() * 0.4);
    ctx.beginPath(); ctx.arc(r() * W, r() * H, 1 + r() * 4, 0, Math.PI * 2); ctx.fill();
  }
  blob(ctx, ox, oy, 180, 'rgba(255,255,255,A)', 0.55);
  centerBand(ctx, 'rgba(255,255,255,A)', 0.45, 100);
  drawSlots(ctx, 'rgba(250,247,240,.42)', 'rgba(40,44,56,.6)', 2);
  edgeTitle(ctx, 'rgba(40,44,56,.7)');
}

/* マット3 風: 暗い青緑の有機的な柄 (細胞と筋)、中央に紫の光 */
function drawBiomech(ctx) {
  const r = rng(33);
  ctx.fillStyle = '#071a1d';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) {                                     // 細胞
    const x = r() * W, y = r() * H, rad = 12 + r() * 70;
    const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
    g.addColorStop(0, 'rgba(90,200,190,' + (0.18 + r() * 0.25) + ')');
    g.addColorStop(0.7, 'rgba(20,90,95,' + (0.15 + r() * 0.2) + ')');
    g.addColorStop(1, 'rgba(7,26,29,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {                                      // 筋・配管
    ctx.strokeStyle = 'rgba(' + (60 + r() * 60 | 0) + ',' + (150 + r() * 80 | 0) + ',' + (150 + r() * 60 | 0) + ',' + (0.12 + r() * 0.3) + ')';
    ctx.lineWidth = 1 + r() * 7;
    ctx.beginPath();
    const x0 = r() * W, y0 = r() * H;
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + (r() - 0.5) * 400, y0 + (r() - 0.5) * 400, x0 + (r() - 0.5) * 400, y0 + (r() - 0.5) * 400, x0 + (r() - 0.5) * 500, y0 + (r() - 0.5) * 500);
    ctx.stroke();
  }
  blob(ctx, W * 0.5, H * 0.5, W * 0.42, 'rgba(150,70,190,A)', 0.5);
  blob(ctx, W * 0.5, H * 0.5, W * 0.22, 'rgba(220,100,180,A)', 0.35);
  centerBand(ctx, 'rgba(210,170,255,A)', 0.22, 90);
  drawSlots(ctx, 'rgba(4,12,16,.66)', 'rgba(230,255,250,.62)', 2);
  edgeTitle(ctx, 'rgba(230,255,250,.7)');
}

/* レベル20: 黒地に金の細い線と、中央から射す虹色の光 */
function drawPrism(ctx) {
  const r = rng(44);
  ctx.fillStyle = '#07060a';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {                                     // 虹色の光の筋
    const a = (i / 26) * Math.PI * 2 + r() * 0.1;
    const g = ctx.createLinearGradient(W / 2, H / 2, W / 2 + Math.cos(a) * W, H / 2 + Math.sin(a) * W);
    g.addColorStop(0, 'hsla(' + Math.round((i / 26) * 360) + ',90%,65%,.22)');
    g.addColorStop(1, 'hsla(' + Math.round((i / 26) * 360) + ',90%,65%,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2);
    ctx.lineTo(W / 2 + Math.cos(a - 0.05) * W, H / 2 + Math.sin(a - 0.05) * W);
    ctx.lineTo(W / 2 + Math.cos(a + 0.05) * W, H / 2 + Math.sin(a + 0.05) * W);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(232,190,110,.28)';                         // 金の幾何学の細線
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const y = r() * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + (r() - 0.5) * 200); ctx.stroke();
  }
  blob(ctx, W / 2, H / 2, 200, 'rgba(255,236,190,A)', 0.4);
  centerBand(ctx, 'rgba(255,226,150,A)', 0.28, 90);
  drawSlots(ctx, 'rgba(10,8,6,.7)', 'rgba(240,200,120,.85)', 2);
  edgeTitle(ctx, 'rgba(240,200,120,.85)');
}

/* 日食: 黒地の真ん中に金の光の輪 (コロナ)。細い放射の線 */
function drawEclipse(ctx) {
  const r = rng(77);
  ctx.fillStyle = '#050407';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i++) {                                     // コロナの放射
    const a = r() * Math.PI * 2, len = 260 + r() * 420;
    const g = ctx.createLinearGradient(W / 2, H / 2, W / 2 + Math.cos(a) * len, H / 2 + Math.sin(a) * len);
    g.addColorStop(0, 'rgba(255,196,110,.16)');
    g.addColorStop(1, 'rgba(255,196,110,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 1 + r() * 3;
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(W / 2 + Math.cos(a) * len, H / 2 + Math.sin(a) * len); ctx.stroke();
  }
  ctx.restore();
  blob(ctx, W / 2, H / 2, 330, 'rgba(255,170,80,A)', 0.42);
  blob(ctx, W / 2, H / 2, 210, 'rgba(255,236,200,A)', 0.5);
  ctx.fillStyle = '#050407';                                          // 月の影
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 150, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,226,170,.8)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 152, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 160; i++) {                                    // 星
    ctx.fillStyle = 'rgba(255,255,255,' + (0.1 + r() * 0.4) + ')';
    ctx.fillRect(r() * W, r() * H, 1.5, 1.5);
  }
  drawSlots(ctx, 'rgba(8,6,4,.72)', 'rgba(255,214,150,.75)', 2);
  edgeTitle(ctx, 'rgba(255,214,150,.8)');
}

/* 絵のマット: 自分の半面ぶんの横長の絵 (art/mats/<名前>.webp)。手前の半面にそのまま、奥の半面に 180 度回して敷く
   (実物のマットを向かい合わせに置いたのと同じ。相手の半面には相手のマットが相手の向きで出る)。
   slot: 置き場の枠の色 [塗り, 線] */
const ART_MATS = {
  seigaiha: { slot: ['rgba(6,12,28,.55)', 'rgba(200,220,255,.55)'] },
  hokusai: { slot: ['rgba(8,16,30,.5)', 'rgba(240,230,210,.6)'] },
  celestial: { slot: ['rgba(4,8,22,.55)', 'rgba(240,210,140,.65)'] },
  garden: { slot: ['rgba(30,50,30,.35)', 'rgba(255,255,245,.7)'] },
  sakura: { slot: ['rgba(10,10,30,.5)', 'rgba(255,200,220,.6)'] },
  library: { slot: ['rgba(40,24,10,.4)', 'rgba(250,235,200,.7)'] },
};
function drawArtMat(key, img) {
  return (ctx) => {
    ctx.fillStyle = '#0b0a12';
    ctx.fillRect(0, 0, W, H);
    if (img) {
      const half = H / 2;
      ctx.drawImage(img, 0, half, W, half);                              // 手前 (自分の向き)
      ctx.save(); ctx.translate(W, half); ctx.rotate(Math.PI);           // 奥 (相手の向き)
      ctx.drawImage(img, 0, 0, W, half);
      ctx.restore();
      ctx.fillStyle = 'rgba(6,8,16,.22)';                               // 暗い画面になじむよう少しだけ沈める
      ctx.fillRect(0, 0, W, H);
    }
    const [fill, stroke] = ART_MATS[key].slot;
    drawSlots(ctx, fill, stroke, 2);
  };
}
const artImages = new Map();       // key -> Image (読み込み済みなら complete)

const DRAW = { nebula: drawNebula, vortex: drawVortex, biomech: drawBiomech, prism: drawPrism, eclipse: drawEclipse };
for (const key of Object.keys(ART_MATS)) DRAW[key] = null;          // 絵のマットは playmatTexture で描く
const cache = new Map();

/* 柄のテクスチャ (neon は柄なし = null) */
/* 画面の形で山の置き場が動くので、その形ごとに描き分ける */
function layoutKey() { return (VIEW.short ? 's' : 'n') + Math.round(VIEW.k * 20); }

export function playmatTexture(key) {
  if (!DRAW[key] && !ART_MATS[key]) return null;
  const ck = key + ':' + layoutKey();
  if (cache.has(ck)) return cache.get(ck);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (ART_MATS[key]) {
    /* 絵は読み込めてから描き直す (それまでは暗い地に枠だけ) */
    let img = artImages.get(key);
    if (!img) { img = new Image(); img.src = 'art/mats/' + key + '.webp'; artImages.set(key, img); }
    const paint = () => { drawArtMat(key, img.complete && img.naturalWidth ? img : null)(cv.getContext('2d')); tex.needsUpdate = true; };
    paint();
    if (!img.complete) img.addEventListener('load', paint, { once: true });
  } else {
    DRAW[key](cv.getContext('2d'));
  }
  cache.set(ck, tex);
  return tex;
}

/** 見本の絵 (図鑑・ガチャ用)。自分の半面ぶんの横長の絵の URL。絵のマットでなければ null */
export function matArtURL(key) {
  return ART_MATS[key] ? 'art/mats/' + key + '.webp' : null;
}
