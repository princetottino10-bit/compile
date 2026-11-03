/* =========================================================================
 * 背景の絵 (タイトル・勝利・敗北) を canvas に描く
 *   Canva で試作した3枚 (タイトル: グリッド床とカードの柱 / 勝利: 金とミントの光条 /
 *   敗北: 崩れるグリッドと深紅のグリッチ) を見本に、画面の大きさに合わせて描き直す。
 *   画像ファイルを持たないので、どの解像度でもにじまない。
 * ========================================================================= */

const INK = '#050505';
const CYAN = '#cdc7d4', PINK = '#e8203f', MINT = '#a07bff', GOLD = '#ffc2b4';

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
  /* Main 3 の箱に合わせる: つやのない黒に、黒より少し明るい基板の配線を浮き彫りのように引き、
     右上から左下へ赤い一閃を1本。光らせるのは赤だけにして、ほかは面と線で見せる */
  const { ctx, w, h } = prepare(canvas);
  const r = rng(7);
  ctx.fillStyle = '#060606';
  ctx.fillRect(0, 0, w, h);
  /* 下からの赤い煙 (トレーラーの赤い霧)。薄くして文字の地を濁さない */
  const smoke = ctx.createRadialGradient(w * 0.7, h * 1.05, 10, w * 0.7, h * 1.05, Math.max(w, h) * 0.75);
  smoke.addColorStop(0, 'rgba(150,10,24,.38)');
  smoke.addColorStop(1, 'rgba(150,10,24,0)');
  ctx.fillStyle = smoke; ctx.fillRect(0, 0, w, h);
  circuit(ctx, w, h, r);
  /* 赤い一閃: 箱の蓋と身の境目の帯。太い面1本と、その上下の細い影 */
  ctx.save();
  ctx.translate(w * 0.6, h * 0.52);
  ctx.rotate(-0.36);
  const L = Math.hypot(w, h) * 1.2, t = Math.max(10, Math.min(w, h) * 0.022);
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(-L / 2, -t / 2 - 6, L, t + 12);
  const red = ctx.createLinearGradient(0, -t / 2, 0, t / 2);
  red.addColorStop(0, '#ff3048'); red.addColorStop(0.5, '#d4122e'); red.addColorStop(1, '#8e0a1d');
  ctx.fillStyle = red;
  ctx.fillRect(-L / 2, -t / 2, L, t);
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(-L / 2, -t / 2, L, 1);
  ctx.restore();
  /* 火の粉 (少しだけ) */
  for (let i = 0; i < 46; i++) {
    const x = r() * w, y = h * (0.45 + r() * 0.55), s = 0.6 + r() * 1.8;
    ctx.fillStyle = 'rgba(255,' + Math.floor(90 + r() * 110) + ',60,' + (0.18 + r() * 0.5) + ')';
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
  }
  /* 走査線 */
  ctx.fillStyle = 'rgba(255,255,255,.018)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  vignette(ctx, w, h, 0.8);
}

/* 基板の配線: 縦横と45度の折れ線に、丸い端子と四角い部品。黒の上に、ほんの少し明るい黒で */
function circuit(ctx, w, h, r) {
  const step = 26;
  const cols = Math.ceil(w / step) + 2, rows = Math.ceil(h / step) + 2;
  const used = new Set();
  const key = (x, y) => x + ',' + y;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const traces = Math.round(cols * rows / 9);
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let n = 0; n < traces; n++) {
    let x = Math.floor(r() * cols), y = Math.floor(r() * rows);
    if (used.has(key(x, y))) continue;
    let d = Math.floor(r() * 4);
    const pts = [[x, y]]; used.add(key(x, y));
    const len = 3 + Math.floor(r() * 10);
    for (let k = 0; k < len; k++) {
      if (r() < 0.28) d = r() < 0.5 ? (d + 4) % 8 : Math.floor(r() * 4);
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (used.has(key(nx, ny)) || nx < -1 || ny < -1 || nx > cols || ny > rows) break;
      x = nx; y = ny; used.add(key(x, y)); pts.push([x, y]);
    }
    if (pts.length < 3) continue;
    const lw = r() < 0.15 ? 5 : (r() < 0.5 ? 3 : 2);
    const shade = 19 + Math.floor(r() * 10);
    /* 浮き彫り: 下にずらした影の線と、上の明るい線 */
    for (const [dy, col] of [[1.5, 'rgba(0,0,0,.9)'], [0, 'rgb(' + shade + ',' + shade + ',' + shade + ')']]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath();
      pts.forEach(([px, py], i) => { const X = px * step, Y = py * step + dy; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
      ctx.stroke();
    }
    /* 端子 */
    const [ex, ey] = pts[pts.length - 1];
    ctx.fillStyle = 'rgb(' + (shade + 4) + ',' + (shade + 4) + ',' + (shade + 4) + ')';
    ctx.beginPath(); ctx.arc(ex * step, ey * step, lw + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#060606';
    ctx.beginPath(); ctx.arc(ex * step, ey * step, lw, 0, Math.PI * 2); ctx.fill();
  }
  /* 四角い部品 */
  for (let i = 0; i < Math.round(cols * rows / 60); i++) {
    const x = Math.floor(r() * cols) * step, y = Math.floor(r() * rows) * step;
    const bw = step * (1 + Math.floor(r() * 3)), bh = step * (1 + Math.floor(r() * 2));
    ctx.strokeStyle = 'rgb(30,30,30)'; ctx.lineWidth = 2;
    ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
  }
  ctx.restore();
}

/* 勝利: 中央の帯から金とミントの光条が左右へ弾け、六角の破片が飛ぶ */
export function drawVictoryBackdrop(canvas) {
  const { ctx, w, h } = prepare(canvas);
  const r = rng(11);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  const cy = h / 2;
  const band = ctx.createLinearGradient(0, cy - h * 0.22, 0, cy + h * 0.22);
  band.addColorStop(0, 'rgba(255,194,180,0)');
  band.addColorStop(0.5, 'rgba(255,240,190,.55)');
  band.addColorStop(1, 'rgba(255,194,180,0)');
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
  ctx.strokeStyle = 'rgba(205,199,212,.35)';
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
    ctx.fillStyle = i % 3 ? 'rgba(232,32,63,.18)' : 'rgba(200,16,60,.35)';
    ctx.fillRect(x, y, w, bh);
  }
  const band = ctx.createLinearGradient(0, cy - h * 0.16, 0, cy + h * 0.16);
  band.addColorStop(0, 'rgba(232,32,63,0)');
  band.addColorStop(0.5, 'rgba(255,40,90,.42)');
  band.addColorStop(1, 'rgba(232,32,63,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, cy - h * 0.16, w, h * 0.32);
  /* 色ずれ (シアンの影を少しずらす) */
  ctx.fillStyle = 'rgba(205,199,212,.06)';
  ctx.fillRect(6, cy - h * 0.1, w, h * 0.2);
  ctx.restore();
  /* 降ってくる画素の破片 */
  for (let i = 0; i < 140; i++) {
    const x = r() * w, y = cy + r() * (h - cy);
    const s = 1 + r() * 4;
    ctx.fillStyle = r() < 0.7 ? 'rgba(232,32,63,.55)' : 'rgba(255,255,255,.35)';
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
  g.addColorStop(0, 'rgba(5,5,5,0)');
  g.addColorStop(1, 'rgba(5,5,5,' + strength + ')');
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
