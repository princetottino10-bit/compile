/* =========================================================================
 * 背景の絵 (タイトル・勝利・敗北) を canvas に描く
 *   Canva で試作した3枚 (タイトル: グリッド床とカードの柱 / 勝利: 金とミントの光条 /
 *   敗北: 崩れるグリッドと深紅のグリッチ) を見本に、画面の大きさに合わせて描き直す。
 *   画像ファイルを持たないので、どの解像度でもにじまない。
 * ========================================================================= */

const INK = '#03040a';
const CYAN = '#b9a4ff', PINK = '#ff4fa3', MINT = '#a07bff', GOLD = '#ffb3da';

/* 決まった種から同じ絵を描く (開くたびに星や破片が暴れないように) */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* canvas を表示サイズ × 画素密度 (上限2) に合わせ、描画用の context を返す */
function prepare(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, canvas.clientWidth || window.innerWidth);
  const h = Math.max(1, canvas.clientHeight || window.innerHeight);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function glowLine(ctx, x1, y1, x2, y2, color, width, blur) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/* 奥へ伸びるグリッドの床。horizon: 地平線の高さ、fall: 崩れ (敗北用) */
function gridFloor(ctx, w, h, horizon, color, alpha, fall) {
  const cx = w / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = -14; i <= 14; i++) {
    const xb = cx + i * (w / 9);
    glowLine(ctx, cx + i * 6, horizon, xb, h + 40, color, 1, 6);
  }
  for (let k = 1; k < 16; k++) {
    const t = Math.pow(k / 16, 2.1);
    const y = horizon + (h - horizon) * t;
    const drop = fall ? fall(k) : 0;
    ctx.globalAlpha = alpha * (0.25 + 0.75 * t);
    glowLine(ctx, 0, y + drop, w, y + drop * 0.3, color, 1, 6);
  }
  ctx.restore();
}

/* タイトル: 暗い空間、グリッドの床、ネオンの縁取りをした3枚のカードの柱 */
export function drawTitleBackdrop(canvas) {
  /* 公式アート寄り: 暗い地に、桃→紫の太い斜めの帯と、グリッチの横線。浮いた札や床は描かない */
  const { ctx, w, h } = prepare(canvas);
  const r = rng(7);
  ctx.fillStyle = '#07050d';
  ctx.fillRect(0, 0, w, h);
  /* 奥の色溜まり */
  const glowA = ctx.createRadialGradient(w * 0.78, h * 0.35, 10, w * 0.78, h * 0.35, Math.max(w, h) * 0.7);
  glowA.addColorStop(0, 'rgba(139,92,246,.32)');
  glowA.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = glowA; ctx.fillRect(0, 0, w, h);
  const glowB = ctx.createRadialGradient(w * 0.2, h * 0.9, 10, w * 0.2, h * 0.9, Math.max(w, h) * 0.6);
  glowB.addColorStop(0, 'rgba(255,79,163,.22)');
  glowB.addColorStop(1, 'rgba(255,79,163,0)');
  ctx.fillStyle = glowB; ctx.fillRect(0, 0, w, h);
  /* 太い斜めの帯 (右上から左下へ) */
  ctx.save();
  ctx.translate(w * 0.62, h * 0.5);
  ctx.rotate(-0.42);
  const band = ctx.createLinearGradient(-w, 0, w, 0);
  band.addColorStop(0, 'rgba(255,79,163,0)');
  band.addColorStop(0.35, 'rgba(255,79,163,.28)');
  band.addColorStop(0.65, 'rgba(139,92,246,.3)');
  band.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = band;
  ctx.fillRect(-w * 1.2, -h * 0.13, w * 2.4, h * 0.26);
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  ctx.fillRect(-w * 1.2, -h * 0.135, w * 2.4, 2);
  ctx.fillRect(-w * 1.2, h * 0.13, w * 2.4, 1);
  ctx.restore();
  /* グリッチの横線 (右に多め) */
  for (let i = 0; i < 150; i++) {
    const x = w * (0.35 + r() * 0.7) - 80, y = r() * h;
    const len = 20 + r() * 220, th = 1 + r() * 6;
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,79,163,' + (0.05 + r() * 0.22) + ')' : 'rgba(185,164,255,' + (0.05 + r() * 0.2) + ')';
    ctx.fillRect(x, y, len, th);
  }
  /* 走査線 */
  ctx.fillStyle = 'rgba(255,255,255,.025)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  vignette(ctx, w, h, 0.75);
}

/* 勝利: 中央の帯から金とミントの光条が左右へ弾け、六角の破片が飛ぶ */
export function drawVictoryBackdrop(canvas) {
  const { ctx, w, h } = prepare(canvas);
  const r = rng(11);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  const cy = h / 2;
  const band = ctx.createLinearGradient(0, cy - h * 0.22, 0, cy + h * 0.22);
  band.addColorStop(0, 'rgba(255,179,218,0)');
  band.addColorStop(0.5, 'rgba(255,240,190,.55)');
  band.addColorStop(1, 'rgba(255,179,218,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, cy - h * 0.22, w, h * 0.44);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 160; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const y = cy + (r() - 0.5) * h * 0.9 * Math.pow(r(), 0.7);
    const x0 = w / 2 + side * r() * w * 0.12;
    const len = w * (0.15 + r() * 0.45);
    const col = r() < 0.55 ? GOLD : (r() < 0.6 ? MINT : CYAN);
    const g = ctx.createLinearGradient(x0, y, x0 + side * len, y);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.strokeStyle = g;
    ctx.globalAlpha = 0.25 + r() * 0.55;
    ctx.lineWidth = 0.6 + r() * 2.4;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + side * len, y + (y - cy) * 0.35);
    ctx.stroke();
  }
  /* 六角の破片 */
  for (let i = 0; i < 26; i++) {
    const x = r() * w, y = cy + (r() - 0.5) * h * 0.95;
    const s = 4 + r() * 16;
    ctx.globalAlpha = 0.35 + r() * 0.5;
    ctx.strokeStyle = r() < 0.5 ? MINT : GOLD;
    ctx.lineWidth = 1.2;
    hexagon(ctx, x, y, s, r() * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
  /* 中央の走査リング */
  ctx.save();
  ctx.strokeStyle = 'rgba(185,164,255,.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(w / 2, cy, Math.min(w, h) * 0.34, Math.min(w, h) * 0.34, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  vignette(ctx, w, h, 0.7);
}

/* 敗北: 深紅の帯が乱れ、グリッドが下へ崩れ落ち、画素の破片が降る */
export function drawDefeatBackdrop(canvas) {
  const { ctx, w, h } = prepare(canvas);
  const r = rng(23);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  const cy = h * 0.46;
  gridFloor(ctx, w, h, h * 0.58, '#b0123f', 0.45, (k) => k * k * (0.6 + r() * 0.8));
  /* ずれながら重なる深紅の帯 (グリッチ) */
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    const y = cy + (r() - 0.5) * h * 0.26;
    const bh = 2 + r() * h * 0.05;
    const x = (r() - 0.5) * w * 0.1;
    ctx.fillStyle = i % 3 ? 'rgba(255,79,163,.18)' : 'rgba(200,16,60,.35)';
    ctx.fillRect(x, y, w, bh);
  }
  const band = ctx.createLinearGradient(0, cy - h * 0.16, 0, cy + h * 0.16);
  band.addColorStop(0, 'rgba(255,79,163,0)');
  band.addColorStop(0.5, 'rgba(255,40,90,.42)');
  band.addColorStop(1, 'rgba(255,79,163,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, cy - h * 0.16, w, h * 0.32);
  /* 色ずれ (シアンの影を少しずらす) */
  ctx.fillStyle = 'rgba(185,164,255,.06)';
  ctx.fillRect(6, cy - h * 0.1, w, h * 0.2);
  ctx.restore();
  /* 降ってくる画素の破片 */
  for (let i = 0; i < 140; i++) {
    const x = r() * w, y = cy + r() * (h - cy);
    const s = 1 + r() * 4;
    ctx.fillStyle = r() < 0.7 ? 'rgba(255,79,163,.55)' : 'rgba(255,255,255,.35)';
    ctx.fillRect(x, y, s, s * (1 + r() * 3));
  }
  /* 走査線 */
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  vignette(ctx, w, h, 0.9);
}

function hexagon(ctx, x, y, s, rot) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * Math.PI * 2;
    const px = x + Math.cos(a) * s, py = y + Math.sin(a) * s;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function vignette(ctx, w, h, strength) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(3,4,10,0)');
  g.addColorStop(1, 'rgba(3,4,10,' + strength + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* 勝ち (AURORA、レベルの報酬): 夜空にオーロラの幕が揺れ、星が瞬く */
export function drawAuroraBackdrop(canvas) {
  const { ctx, w, h } = prepare(canvas);
  const r = rng(29);
  ctx.fillStyle = '#03040c';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.2 + r() * 0.6) + ')';
    ctx.fillRect(r() * w, r() * h * 0.8, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const bands = [['109,255,194', 0.42], ['99,243,255', 0.36], ['185,140,255', 0.3], ['255,122,180', 0.22]];
  bands.forEach(([rgb, a], k) => {
    for (let x = 0; x < w; x += 3) {
      const t = x / w;
      const y = h * (0.28 + k * 0.08) + Math.sin(t * 7 + k * 1.7) * h * 0.06 + Math.sin(t * 17 + k) * h * 0.02;
      const len = h * (0.22 + 0.12 * Math.sin(t * 5 + k * 2));
      const g = ctx.createLinearGradient(x, y, x, y + len);
      g.addColorStop(0, 'rgba(' + rgb + ',0)');
      g.addColorStop(0.35, 'rgba(' + rgb + ',' + a * (0.6 + 0.4 * Math.sin(t * 23 + k)) + ')');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, 3, len);
    }
  });
  ctx.restore();
  vignette(ctx, w, h, 0.6);
}
