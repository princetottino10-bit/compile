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
  /* 図鑑の見本は画面に出さない canvas に描くので、大きさを canvas.dataset.w / h で渡す */
  const fixed = canvas.dataset && canvas.dataset.w;
  const dpr = fixed ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, fixed ? +canvas.dataset.w : (canvas.clientWidth || window.innerWidth));
  const h = Math.max(1, fixed ? +canvas.dataset.h : (canvas.clientHeight || window.innerHeight));
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

/* 基板の配線: 縦横と45度の折れ線に、丸い端子と四角い部品。黒の上に、ほんの少し明るい黒で。
   盤面の柄 (playmat.js の MAIN 3) も同じ配線を使う。盤面は斜めから見て暗く沈むので、目を粗く・線を明るめに渡す */
export function circuit(ctx, w, h, r, opt) {
  const step = (opt && opt.step) || 26, base = (opt && opt.base) || 19, bg = (opt && opt.bg) || '#060606';
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
    const shade = base + Math.floor(r() * 10);
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
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(ex * step, ey * step, lw, 0, Math.PI * 2); ctx.fill();
  }
  /* 四角い部品 */
  for (let i = 0; i < Math.round(cols * rows / 60); i++) {
    const x = Math.floor(r() * cols) * step, y = Math.floor(r() * rows) * step;
    const bw = step * (1 + Math.floor(r() * 3)), bh = step * (1 + Math.floor(r() * 2));
    ctx.strokeStyle = 'rgb(' + (base + 11) + ',' + (base + 11) + ',' + (base + 11) + ')'; ctx.lineWidth = 2;
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

/* ---------- 勝ちの演出の追加分 (2026-11-03) ---------- */

/* MAIN 3 (レベルの報酬): 黒い基板の配線に赤い信号が走り、斜めの赤い一閃 */
export function drawCircuitBackdrop(canvas) {
  const { ctx, w, h } = prepare(canvas);
  const r = rng(41);
  ctx.fillStyle = '#060606';
  ctx.fillRect(0, 0, w, h);
  circuit(ctx, w, h, r, { step: Math.max(14, Math.round(Math.min(w, h) / 30)) });
  const step = Math.max(14, Math.round(Math.min(w, h) / 30));
  const cx = w / 2, cy = h / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  /* 中央から外へ、45 度で折れながら走る赤い信号 */
  for (let i = 0; i < 34; i++) {
    let x = cx + (r() - 0.5) * w * 0.2, y = cy + (r() - 0.5) * h * 0.2;
    const a0 = Math.floor(r() * 8) * Math.PI / 4;
    let a = a0;
    ctx.strokeStyle = r() < 0.8 ? PINK : '#ff8a9a';
    ctx.lineWidth = 1 + r() * 2.2;
    ctx.shadowColor = PINK; ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.35 + r() * 0.6;
    ctx.beginPath(); ctx.moveTo(x, y);
    const n = 3 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const len = step * (1 + Math.floor(r() * 4));
      x += Math.cos(a) * len; y += Math.sin(a) * len;
      ctx.lineTo(x, y);
      a = a0 + (r() < 0.5 ? Math.PI / 4 : -Math.PI / 4) * (k % 2 ? 0 : 1);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd0d6';
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  /* 斜めの一閃 */
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(-0.42);
  const slash = ctx.createLinearGradient(0, -h * 0.07, 0, h * 0.07);
  slash.addColorStop(0, 'rgba(232,32,63,0)');
  slash.addColorStop(0.5, 'rgba(232,32,63,.62)');
  slash.addColorStop(1, 'rgba(232,32,63,0)');
  ctx.fillStyle = slash;
  ctx.fillRect(-w, -h * 0.07, w * 2, h * 0.14);
  ctx.fillStyle = 'rgba(255,220,226,.85)';
  ctx.fillRect(-w, -1, w * 2, 2);
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  vignette(ctx, w, h, 0.75);
}

/* SAKURA: 夜桜。大きな月と、舞う花びら */
export function drawSakuraBackdrop(canvas) {
  const { ctx, w, h } = prepare(canvas);
  const r = rng(53);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#120a22'); sky.addColorStop(1, '#2a0f24');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  const mx = w * 0.72, my = h * 0.3;
  const halo = ctx.createRadialGradient(mx, my, m * 0.1, mx, my, m * 0.5);
  halo.addColorStop(0, 'rgba(255,214,232,.35)'); halo.addColorStop(1, 'rgba(255,214,232,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffeef4';
  ctx.beginPath(); ctx.arc(mx, my, m * 0.14, 0, Math.PI * 2); ctx.fill();
  /* 枝の影 */
  ctx.save();
  ctx.strokeStyle = '#0a0510'; ctx.lineCap = 'round';
  const branch = (x, y, a, len, wd, d) => {
    if (d > 5 || len < 6) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    ctx.lineWidth = wd;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,170,205,.75)';
    if (d >= 3) for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x2 + (r() - 0.5) * 18, y2 + (r() - 0.5) * 18, 3 + r() * 5, 0, Math.PI * 2); ctx.fill(); }
    branch(x2, y2, a - 0.3 - r() * 0.4, len * 0.72, wd * 0.65, d + 1);
    branch(x2, y2, a + 0.2 + r() * 0.4, len * 0.68, wd * 0.65, d + 1);
  };
  branch(-10, h * 0.12, 0.25, m * 0.22, m * 0.03, 0);
  ctx.restore();
  /* 花びら */
  for (let i = 0; i < 150; i++) {
    const x = r() * w, y = r() * h, s = 3 + r() * 7;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(r() * Math.PI);
    ctx.globalAlpha = 0.45 + r() * 0.5;
    ctx.fillStyle = r() < 0.5 ? '#ffc2d9' : '#ffe0ec';
    ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  vignette(ctx, w, h, 0.55);
}

/* MATRIX: 緑の文字の雨 */
export function drawMatrixBackdrop(canvas) {
  const { ctx, w, h } = prepare(canvas);
  const r = rng(67);
  ctx.fillStyle = '#020604'; ctx.fillRect(0, 0, w, h);
  const fs = Math.max(10, Math.round(Math.min(w, h) / 34));
  const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789COMPILE';
  ctx.font = '700 ' + fs + 'px monospace';
  ctx.textAlign = 'center';
  for (let x = fs / 2; x < w; x += fs) {
    if (r() < 0.25) continue;
    const head = r() * h * 1.2, len = 6 + Math.floor(r() * 22);
    for (let k = 0; k < len; k++) {
      const y = head - k * fs;
      if (y < -fs || y > h + fs) continue;
      const t = k / len;
      ctx.fillStyle = k === 0 ? '#e6ffee' : 'rgba(77,255,136,' + (0.9 * (1 - t)) + ')';
      ctx.fillText(chars[Math.floor(r() * chars.length)], x, y);
    }
  }
  const band = ctx.createLinearGradient(0, h * 0.35, 0, h * 0.65);
  band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.5, 'rgba(0,0,0,.55)'); band.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = band; ctx.fillRect(0, h * 0.35, w, h * 0.3);
  vignette(ctx, w, h, 0.7);
}

/* SUPERNOVA: 中心が白く爆ぜ、光条と衝撃の輪が広がる */
export function drawSupernovaBackdrop(canvas) {
  const { ctx, w, h } = prepare(canvas);
  const r = rng(79);
  ctx.fillStyle = '#04030a'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + r() * 0.5) + ')';
    ctx.fillRect(r() * w, r() * h, 1 + r(), 1 + r());
  }
  const cx = w / 2, cy = h / 2, m = Math.max(w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 120; i++) {
    const a = r() * Math.PI * 2, len = m * (0.2 + r() * 0.5);
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    const col = r() < 0.5 ? '255,216,106' : (r() < 0.5 ? '255,120,190' : '120,200,255');
    g.addColorStop(0, 'rgba(' + col + ',.8)'); g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.strokeStyle = g; ctx.lineWidth = 0.8 + r() * 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.stroke();
  }
  [0.16, 0.27, 0.4].forEach((k, i) => {
    ctx.strokeStyle = ['rgba(255,240,200,.5)', 'rgba(255,140,200,.35)', 'rgba(140,200,255,.25)'][i];
    ctx.lineWidth = 3 - i;
    ctx.beginPath(); ctx.ellipse(cx, cy, m * k, m * k * 0.62, -0.2, 0, Math.PI * 2); ctx.stroke();
  });
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, m * 0.22);
  core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.25, 'rgba(255,230,160,.8)');
  core.addColorStop(0.6, 'rgba(255,110,170,.25)'); core.addColorStop(1, 'rgba(255,110,170,0)');
  ctx.fillStyle = core; ctx.fillRect(0, 0, w, h);
  ctx.restore();
  vignette(ctx, w, h, 0.6);
}

/* ECLIPSE: 黒い太陽と金のコロナ */
export function drawEclipseBackdrop(canvas) {
  const { ctx, w, h } = prepare(canvas);
  const r = rng(97);
  ctx.fillStyle = '#030303'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = 'rgba(255,240,220,' + (0.1 + r() * 0.4) + ')';
    ctx.fillRect(r() * w, r() * h, 1, 1);
  }
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 3.2);
  glow.addColorStop(0, 'rgba(255,200,90,.7)'); glow.addColorStop(0.3, 'rgba(255,140,50,.25)'); glow.addColorStop(1, 'rgba(255,140,50,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 220; i++) {
    const a = r() * Math.PI * 2, len = R * (0.3 + Math.pow(r(), 2) * 2.4);
    ctx.strokeStyle = 'rgba(255,' + (190 + Math.floor(r() * 60)) + ',120,' + (0.15 + r() * 0.4) + ')';
    ctx.lineWidth = 0.6 + r() * 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.quadraticCurveTo(cx + Math.cos(a + 0.08) * (R + len * 0.6), cy + Math.sin(a + 0.08) * (R + len * 0.6), cx + Math.cos(a + 0.05) * (R + len), cy + Math.sin(a + 0.05) * (R + len));
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,236,190,.95)'; ctx.lineWidth = 2;
  ctx.shadowColor = '#ffd27a'; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;
  /* ダイヤモンドリング */
  const dx = cx + Math.cos(-0.7) * R, dy = cy + Math.sin(-0.7) * R;
  const d = ctx.createRadialGradient(dx, dy, 0, dx, dy, R * 0.5);
  d.addColorStop(0, 'rgba(255,255,255,1)'); d.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = d; ctx.fillRect(dx - R, dy - R, R * 2, R * 2);
  vignette(ctx, w, h, 0.65);
}

/* 勝ちの演出ごとの背景・文字の色・音。key は見た目の victory */
export const VICTORY_FX = {
  default: { draw: drawVictoryBackdrop, accent: '#a07bff', sfx: 'win' },
  aurora: { draw: drawAuroraBackdrop, accent: '#a07bff', sfx: 'winAurora' },
  circuit: { draw: drawCircuitBackdrop, accent: '#e8203f', sfx: 'win' },
  sakura: { draw: drawSakuraBackdrop, accent: '#ff9cc4', sfx: 'winAurora' },
  matrix: { draw: drawMatrixBackdrop, accent: '#4dff88', sfx: 'win' },
  supernova: { draw: drawSupernovaBackdrop, accent: '#ffd86a', sfx: 'winAurora' },
  eclipse: { draw: drawEclipseBackdrop, accent: '#ffc85a', sfx: 'win' }
};
export const victoryFx = (key) => VICTORY_FX[key] || VICTORY_FX.default;

/* 図鑑の見本 (画面に出さない canvas に描いて data URL)。同じ大きさは描き直さない */
const vicCache = new Map();
export function victoryPreviewURL(key, w, h) {
  const id = key + ':' + w + 'x' + h;
  if (!vicCache.has(id)) {
    try {
      const cv = document.createElement('canvas');
      cv.dataset.w = w; cv.dataset.h = h;
      victoryFx(key).draw(cv);
      vicCache.set(id, cv.toDataURL('image/jpeg', 0.85));
    } catch (e) {
      vicCache.set(id, '');
    }
  }
  return vicCache.get(id);
}
