/* =========================================================================
 * 3Dビュー: コントロールコンポーネント (実卓の物理マーカー)
 *   Main 3 の公式のコントロールコンポーネント (カード型) に寄せた意匠:
 *   黒地に上下の警告縞と角を落とした枠、中央にコントロールの紋章 (control-emblem.js)。
 *   盤面左脇に置かれ、保持者の側へ滑って移動する (移るときに一回転する)。
 *   中立 (-1) は中央で淡く、保持中は保持者の色で強く光る。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import * as TW from './tween.js';
import { sfx } from './audio.js';
import { shockwave } from './fx.js';
import { VIEW } from './theme.js';
import { fillEmblem } from './control-emblem.js';

const X_WIDE = -2.85;         // lane0 とトラッシュの間の余白
/* 縦持ちはレーンの外側の細い余白へ寄せ、小さくする (山札・捨て札と同じ扱い) */
const X = () => X_WIDE + (-2.52 - X_WIDE) * VIEW.k;
const SCALE = () => 1 - 0.38 * VIEW.k;
/* 横持ちのスマホは自分の捨て札を奥へ寄せる (layout.js の pilePos) ので、マーカーも板の側に寄せて捨て札に重ねない */
const Z = { neutral: 0, get me() { return VIEW.short ? 0.72 : 1.35; }, get opp() { return VIEW.short ? -0.72 : -1.35; } };
const MINT = 0xa07bff, PINK = 0xe8203f, DIM = 0x44536e;
/* 見た目 (レベルの報酬): 自分が持ったときの色と、中立のときの色 */
/* pattern: 上の面の模様 (明るいところが光る) / metal・rough: 質感 / glass: 半透明 / extra: 飾り (orbit 回る光の粒・crown 王冠・halo 二重の輪・wreath 葉の冠) */
export const MARKER_STYLES = {
  default: { me: MINT, dim: DIM },
  gold: { me: 0xffd86a, dim: 0x6e5d34, metal: 1, rough: 0.18, pattern: 'facets' },
  crystal: { me: 0x7ff3ff, dim: 0x2c5c66, glass: true, pattern: 'facets', extra: 'halo' },
  crimson: { me: 0xff5a6e, dim: 0x5e2430, pattern: 'scales' },
  prism: { me: 0xf4f0ff, dim: 0x5d5670, pattern: 'rainbow', extra: 'halo' },
  /* ガチャの見た目 */
  emerald: { me: 0x3ff0a0, dim: 0x245c44, pattern: 'circuit' },
  amber: { me: 0xffa640, dim: 0x5e4220, pattern: 'stripes' },
  sapphire: { me: 0x4f8cff, dim: 0x22345e, pattern: 'waves', glass: true },
  obsidian: { me: 0xff6a2a, dim: 0x2a1410, metal: 0.9, rough: 0.05, pattern: 'cracks' },
  nova: { me: 0xfff4c8, dim: 0x6b5e3a, pattern: 'stars', extra: 'orbit' },
  slayer: { me: 0xf3e6c4, dim: 0x3a3548, pattern: 'skull', metal: 0.05, rough: 0.7 },                // 下剋上の褒美 (がしゃどくろ)
  laurel: { me: 0x9be07a, dim: 0x3d5a24, pattern: 'leaves', extra: 'wreath' }                         // 週替わりの褒美 (3週クリア)
};

/* ---------- マーカーの上の面の模様 (256px の正方形。外形の半径 0.42 が端) ---------- */
function seeded(n) { let a = n; return () => (a = (a * 16807) % 2147483647) / 2147483647; }
const PATTERN_DRAW = {
  facets(c, S) {
    const r = seeded(5);
    for (let i = 0; i < 40; i++) {
      c.fillStyle = 'rgba(255,255,255,' + (0.15 + r() * 0.6) + ')';
      c.beginPath(); c.moveTo(r() * S, r() * S); c.lineTo(r() * S, r() * S); c.lineTo(r() * S, r() * S); c.fill();
    }
  },
  scales(c, S) {
    c.strokeStyle = '#fff'; c.lineWidth = 5;
    for (let row = 0; row < 12; row++) for (let x = (row % 2) * 16 - 16; x < S + 32; x += 32) { c.beginPath(); c.arc(x, row * 22, 16, 0, Math.PI); c.stroke(); }
  },
  rainbow(c, S) {
    const g = c.createConicGradient ? c.createConicGradient(0, S / 2, S / 2) : null;
    if (g) { ['#ff5f7a', '#ffc05a', '#7df28c', '#5ab8ff', '#b98cff', '#ff5f7a'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col)); c.fillStyle = g; }
    else c.fillStyle = '#fff';
    c.fillRect(0, 0, S, S);
  },
  circuit(c, S) {
    const r = seeded(9);
    c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineWidth = 4;
    for (let k = 0; k < 16; k++) {
      let x = r() * S, y = r() * S;
      c.beginPath(); c.moveTo(x, y);
      for (let t = 0; t < 3; t++) { if (r() < 0.5) x += (r() - 0.5) * 120; else y += (r() - 0.5) * 120; c.lineTo(x, y); }
      c.stroke(); c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
    }
  },
  stripes(c, S) {
    c.fillStyle = '#fff';
    for (let x = -S; x < S * 2; x += 36) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 16, 0); c.lineTo(x + 16 - S, S); c.lineTo(x - S, S); c.fill(); }
  },
  waves(c, S) {
    c.strokeStyle = '#fff'; c.lineWidth = 5;
    for (let y = 10; y < S; y += 26) { c.beginPath(); for (let x = 0; x <= S; x += 6) c.lineTo(x, y + Math.sin(x / 18 + y) * 7); c.stroke(); }
  },
  cracks(c, S) {
    const r = seeded(13);
    c.strokeStyle = '#fff'; c.lineWidth = 4;
    for (let k = 0; k < 9; k++) {
      let x = S / 2, y = S / 2, a = r() * Math.PI * 2;
      c.beginPath(); c.moveTo(x, y);
      for (let t = 0; t < 6; t++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * 24; y += Math.sin(a) * 24; c.lineTo(x, y); }
      c.stroke();
    }
  },
  stars(c, S) {
    const r = seeded(21);
    c.fillStyle = '#fff';
    for (let k = 0; k < 70; k++) { c.beginPath(); c.arc(r() * S, r() * S, 1.5 + r() * 3, 0, Math.PI * 2); c.fill(); }
    const star = (x, y, rad) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? rad * 0.42 : rad; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.fill(); };
    star(S * 0.5, S * 0.5, 34); star(S * 0.25, S * 0.3, 14); star(S * 0.75, S * 0.7, 16);
  },
  slash(c, S) {
    c.save(); c.translate(S / 2, S / 2); c.rotate(-0.8);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-S, 0); c.quadraticCurveTo(0, -18, S, 0); c.quadraticCurveTo(0, 8, -S, 0); c.fill();
    c.restore();
    const r = seeded(3);
    c.fillStyle = '#fff';
    for (let k = 0; k < 30; k++) { c.beginPath(); c.arc(r() * S, r() * S, 1 + r() * 2.5, 0, Math.PI * 2); c.fill(); }
  },
  /* 骨の白のどくろ (浮世絵のがしゃどくろ)。目と鼻の穴は暗く、下に歯 */
  skull(c, S) {
    const x = S / 2, y = S * 0.46;
    c.fillStyle = '#fff';
    c.beginPath(); c.ellipse(x, y, S * 0.27, S * 0.25, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.roundRect ? c.roundRect(x - S * 0.15, y + S * 0.12, S * 0.3, S * 0.16, 10) : c.rect(x - S * 0.15, y + S * 0.12, S * 0.3, S * 0.16); c.fill();
    c.fillStyle = '#000';
    c.beginPath(); c.ellipse(x - S * 0.1, y + S * 0.01, S * 0.075, S * 0.085, 0.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x + S * 0.1, y + S * 0.01, S * 0.075, S * 0.085, -0.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(x, y + S * 0.08); c.lineTo(x - S * 0.028, y + S * 0.13); c.lineTo(x + S * 0.028, y + S * 0.13); c.fill();
    c.lineWidth = 3; c.strokeStyle = '#000';
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x + i * S * 0.05, y + S * 0.18); c.lineTo(x + i * S * 0.05, y + S * 0.27); c.stroke(); }
    /* ひびの線 */
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(x + S * 0.05, y - S * 0.24); c.lineTo(x + S * 0.08, y - S * 0.15); c.lineTo(x + S * 0.04, y - S * 0.1); c.stroke();
  },
  leaves(c, S) {
    c.fillStyle = '#fff';
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14;
      c.save(); c.translate(S / 2 + Math.cos(a) * S * 0.3, S / 2 + Math.sin(a) * S * 0.3); c.rotate(a + 0.6);
      c.beginPath(); c.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2); c.fill(); c.restore();
    }
  }
};
/** 模様の canvas (256px)。明るさ 0.35 の地に、白い模様 */
export function markerPatternCanvas(pattern) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = pattern === 'rainbow' ? '#000' : 'rgb(90,90,90)';
  c.fillRect(0, 0, S, S);
  if (PATTERN_DRAW[pattern]) PATTERN_DRAW[pattern](c, S);
  return cv;
}
/* 見た目の画面のプレビュー (2D): カードの面を持ち主の色で光らせ、飾りも描く */
export function markerPreviewURL(key, size) {
  const st = MARKER_STYLES[key] || MARKER_STYLES.default;
  const S = size || 240;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const k = S / 1.2;                               // ワールド 1.2 = 全体
  const hex = '#' + st.me.toString(16).padStart(6, '0');
  const w = CARD_W * k, h = CARD_H * k, x = (S - w) / 2, y = (S - h) / 2;
  /* 足元の光 */
  c.save();
  c.strokeStyle = hex; c.shadowColor = hex; c.shadowBlur = S * 0.04; c.lineWidth = S * 0.012; c.globalAlpha = 0.8;
  c.beginPath(); c.roundRect(x - S * 0.02, y - S * 0.02, w + S * 0.04, h + S * 0.04, S * 0.03); c.stroke();
  c.restore();
  if (st.extra === 'halo') {
    c.strokeStyle = hex; c.globalAlpha = 0.7; c.lineWidth = S * 0.008;
    c.beginPath(); c.arc(S / 2, S / 2, 0.56 * k, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
  }
  /* 面: 白いところを持ち主の色に (黒はそのまま) */
  const face = document.createElement('canvas');
  face.width = CW; face.height = CH;
  const f = face.getContext('2d');
  f.drawImage(controlCardCanvas(st.pattern), 0, 0);
  f.globalCompositeOperation = 'multiply';
  f.fillStyle = hex; f.fillRect(0, 0, CW, CH);
  c.save();
  c.beginPath(); c.roundRect(x, y, w, h, S * 0.025); c.clip();
  c.drawImage(face, x, y, w, h);
  c.restore();
  /* 飾り */
  if (st.extra === 'orbit') {
    c.fillStyle = '#fff8dc'; c.shadowColor = hex; c.shadowBlur = S * 0.05;
    for (let i = 0; i < 3; i++) { const a = i * 2.09 + 0.4; c.beginPath(); c.arc(S / 2 + Math.cos(a) * 0.56 * k, S / 2 + Math.sin(a) * 0.56 * k, S * 0.025, 0, Math.PI * 2); c.fill(); }
    c.shadowBlur = 0;
  }
  if (st.extra === 'crown') {
    const [cx, cy] = [S / 2, y - S * 0.04];
    c.fillStyle = '#ffd65a';
    c.beginPath(); c.moveTo(cx - S * 0.1, cy + S * 0.04); c.lineTo(cx - S * 0.1, cy - S * 0.02); c.lineTo(cx - S * 0.05, cy + S * 0.01);
    c.lineTo(cx, cy - S * 0.05); c.lineTo(cx + S * 0.05, cy + S * 0.01); c.lineTo(cx + S * 0.1, cy - S * 0.02); c.lineTo(cx + S * 0.1, cy + S * 0.04); c.closePath(); c.fill();
  }
  if (st.extra === 'wreath') {
    c.fillStyle = '#d9c25a';
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16;
      c.save(); c.translate(S / 2 + Math.cos(a) * 0.55 * k, S / 2 + Math.sin(a) * 0.55 * k); c.rotate(a + 0.7);
      c.beginPath(); c.ellipse(0, 0, S * 0.03, S * 0.012, 0, 0, Math.PI * 2); c.fill(); c.restore();
    }
  }
  return cv.toDataURL('image/png');
}

/* ---------- コントロールコンポーネントのカード (Main 3 の公式の意匠) ----------
   黒地に白: 上下の警告縞、角を落とした枠、内側の L 字、左下の三角、中央の紋章。
   白いところだけが持ち主の色で光る (emissiveMap)。模様のある見た目は紋章の中に模様を敷く。
   寸法は公式画像 (744x1039) の px で書き、描くときに縮める */
const CW = 512, CH = 714;            // canvas (カード比 0.716 は公式と同じ)
export const CARD_W = 0.6, CARD_H = CARD_W * CH / CW;   // ワールド (ゲームのカード 1.0x1.4 の 6 割)
const THICK = 0.03;
const EMBLEM_K = 615 * (CW / 744);   // 紋章 1 単位の px (公式の紋章幅 480px / 外形幅 0.784)
const EMBLEM_C = [372 * CW / 744, 557 * CW / 744];   // 中心の丸の位置

/* 警告縞の帯 (x0..x1, y0..y1): 斜めの白い縞。右端の欠けた縞は小さな三角で終える */
function hazard(c, x0, y0, x1, y1) {
  const h = y1 - y0, step = h * 1.24, w = h * 0.62;
  c.save();
  c.beginPath(); c.rect(x0, y0, x1 - x0, h); c.clip();
  for (let x = x0 - h; x < x1 + h; x += step) {
    c.beginPath();
    c.moveTo(x, y1); c.lineTo(x + w, y1); c.lineTo(x + w + h, y0); c.lineTo(x + h, y0);
    c.closePath(); c.fill();
  }
  c.restore();
}

/** カードの面 (白い意匠と黒の地)。pattern を渡すと紋章の中に模様を重ねる */
export function controlCardCanvas(pattern) {
  const cv = document.createElement('canvas');
  cv.width = CW; cv.height = CH;
  const c = cv.getContext('2d');
  const s = CW / 744;
  c.fillStyle = '#000'; c.fillRect(0, 0, CW, CH);
  c.save(); c.scale(s, s);
  c.fillStyle = '#fff'; c.strokeStyle = '#fff';
  /* 上: 警告縞と、途中で細くなる帯 */
  hazard(c, 45, 52, 698, 108);
  c.beginPath();
  c.moveTo(47, 127); c.lineTo(697, 127); c.lineTo(697, 150); c.lineTo(520, 150); c.lineTo(545, 134);
  c.lineTo(322, 134); c.lineTo(300, 150); c.lineTo(47, 150); c.closePath(); c.fill();
  /* 枠: 上辺に段、右上と左下を落とし、下辺にも段 */
  c.lineWidth = 9; c.lineJoin = 'miter';
  c.beginPath();
  [[45, 192], [412, 192], [428, 212], [615, 212], [632, 196], [645, 196], [698, 252], [698, 840],
    [388, 840], [360, 868], [190, 868], [45, 735]].forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath(); c.stroke();
  /* 内側の L 字 (左上・右下) と左下の三角 */
  c.fillRect(90, 240, 88, 17); c.fillRect(90, 240, 17, 85);
  c.fillRect(570, 786, 85, 17); c.fillRect(638, 715, 17, 88);
  c.beginPath(); c.moveTo(45, 792); c.lineTo(45, 886); c.lineTo(138, 886); c.closePath(); c.fill();
  /* 下: 細い帯と警告縞 */
  c.fillRect(45, 908, 653, 9);
  hazard(c, 45, 926, 698, 986);
  c.restore();
  /* 紋章 */
  const [ex, ey] = EMBLEM_C;
  c.fillStyle = '#fff';
  fillEmblem(c, ex, ey, EMBLEM_K);
  if (pattern) {
    /* 模様は紋章の形 (窓は抜き、丸は残す) で切り抜いてから重ねる */
    const m = document.createElement('canvas');
    m.width = CW; m.height = CH;
    const mc = m.getContext('2d');
    const r = 0.42 * EMBLEM_K;
    mc.drawImage(markerPatternCanvas(pattern), ex - r, ey - r, r * 2, r * 2);
    /* 紋章は2回塗る (本体と丸) ので、一度別の canvas に描いてから destination-in で抜く */
    const mask = document.createElement('canvas');
    mask.width = CW; mask.height = CH;
    const kc = mask.getContext('2d');
    kc.fillStyle = '#fff';
    fillEmblem(kc, ex, ey, EMBLEM_K);
    mc.globalCompositeOperation = 'destination-in';
    mc.drawImage(mask, 0, 0);
    c.globalCompositeOperation = pattern === 'rainbow' ? 'source-over' : 'multiply';
    c.drawImage(m, 0, 0);
    c.globalCompositeOperation = 'source-over';
  }
  return cv;
}
const faceTextures = new Map();
function faceTexture(pattern) {
  const key = pattern || '';
  if (!faceTextures.has(key)) {
    const t = new THREE.CanvasTexture(controlCardCanvas(pattern));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    /* 押し出しの上面の UV は形の座標そのまま (±W/2, ±H/2)。0〜1 に合わせる */
    t.repeat.set(1 / CARD_W, 1 / CARD_H);
    t.offset.set(0.5, 0.5);
    faceTextures.set(key, t);
  }
  return faceTextures.get(key);
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function cardGeometry() {
  const g = new THREE.ExtrudeGeometry(roundedRect(CARD_W, CARD_H, 0.03), {
    depth: THICK, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2, curveSegments: 4
  });
  /* 押し出しは +z 方向。卓に寝かせ (形の上 = 奥)、厚みの中心を y=0 に */
  g.rotateX(-Math.PI / 2);
  g.translate(0, -THICK / 2, 0);
  return g;
}

/* 足元の光: カードの外周をなぞる、ぼかした角丸の線 (色は材質の color で付ける) */
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const S = 256, cv = document.createElement('canvas');
  cv.width = S; cv.height = Math.round(S * (CARD_H + 0.16) / (CARD_W + 0.16));
  const c = cv.getContext('2d');
  const pad = S * 0.08 / (CARD_W + 0.16) * 1.0;
  c.strokeStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 14; c.lineWidth = 5;
  c.beginPath(); c.roundRect(pad, pad, cv.width - pad * 2, cv.height - pad * 2, 14); c.stroke();
  c.stroke();
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

export function createControlMarker(scene) {
  const grp = new THREE.Group();

  /* 光るのは上面の白い意匠だけ (emissiveMap)。側面まで光らせると縁がにじんで形が読めない */
  const face = new THREE.MeshStandardMaterial({
    color: 0x05070d, roughness: 0.45, metalness: 0.2,
    emissive: new THREE.Color(DIM), emissiveIntensity: 0.6, emissiveMap: faceTexture(null)
  });
  const side = new THREE.MeshStandardMaterial({
    color: 0x0a0f1c, roughness: 0.4, metalness: 0.8,
    emissive: new THREE.Color(DIM), emissiveIntensity: 0.12
  });
  /* ExtrudeGeometry の材質グループ: 0 = 上下の面, 1 = 側面 */
  const puck = new THREE.Mesh(cardGeometry(), [face, side]);
  puck.castShadow = true;

  /* 足元の光 (カードの外周) */
  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W + 0.16, CARD_H + 0.16),
    new THREE.MeshBasicMaterial({ color: DIM, map: glowTexture(), transparent: true, opacity: 0.85, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.012;

  grp.add(puck, ring);
  /* 飾り (見た目ごと): setStyle で作り直す */
  const extras = new THREE.Group();
  grp.add(extras);
  let orbit = null;
  const buildExtras = (st) => {
    while (extras.children.length) extras.remove(extras.children[0]);
    orbit = null;
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd65a, metalness: 1, roughness: 0.25, emissive: new THREE.Color(0x6b4a08), emissiveIntensity: 0.6 });
    if (st.extra === 'halo') {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.008, 8, 64), new THREE.MeshBasicMaterial({ color: st.me, transparent: true, opacity: 0.8 }));
      h.rotation.x = Math.PI / 2; h.position.y = 0.02; extras.add(h);
    }
    if (st.extra === 'orbit') {
      orbit = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff8dc }));
        const a = (i * Math.PI * 2) / 3;
        b.position.set(Math.cos(a) * 0.56, 0.1, Math.sin(a) * 0.56);
        orbit.add(b);
      }
      extras.add(orbit);
    }
    if (st.extra === 'crown') {
      const crown = new THREE.Group();
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 20, 1, true), gold);
      crown.add(band);
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 6), gold);
        const a = (i * Math.PI * 2) / 5;
        sp.position.set(Math.cos(a) * 0.1, 0.06, Math.sin(a) * 0.1);
        crown.add(sp);
      }
      crown.position.y = 0.16;
      extras.add(crown);
    }
    if (st.extra === 'wreath') {
      const leaf = new THREE.MeshStandardMaterial({ color: 0xd9c25a, metalness: 0.7, roughness: 0.35, emissive: new THREE.Color(0x3d5a24), emissiveIntensity: 0.5 });
      for (let i = 0; i < 18; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), leaf);
        m.scale.set(1.6, 0.35, 0.7);
        const a = (i * Math.PI * 2) / 18;
        m.position.set(Math.cos(a) * 0.56, 0.0, Math.sin(a) * 0.56);
        m.rotation.y = -a + 0.7;
        extras.add(m);
      }
    }
  };
  grp.position.set(X(), 0.06, Z.neutral);
  grp.rotation.y = 0;
  scene.add(grp);

  let holder = -1;
  let pulse = 0;
  let style = MARKER_STYLES.default;
  let seat = 0;
  /* 見た目は持っている側のもの。自分が持てば自分の設定、相手が持てば相手の設定、中立は標準 */
  const keys = { me: 'default', opp: 'default' };
  let applied = null;
  const holderKey = () => holder === -1 ? 'default' : (holder === seat ? keys.me : keys.opp);
  const paint = () => {
    /* 相手が標準のままなら、相手の色 (ピンク) で見分ける */
    const oppDefault = holder !== -1 && holder !== seat && holderKey() === 'default';
    const col = holder === -1 ? style.dim : (oppDefault ? PINK : style.me);
    face.emissive.setHex(col);
    face.emissiveIntensity = holder === -1 ? 0.55 : 1.4;
    side.emissive.setHex(col);
    ring.material.color.setHex(col);
    return col;
  };
  const state = {
    group: grp,
    /* 毎フレーム: 保持中は光をゆっくり脈打たせて「生きている」感を出す。
       カードは文字の向きがあるので回さず、いつも手前の自分へ向ける */
    tick(dt) {
      pulse += dt;
      if (holder !== -1) face.emissiveIntensity = 1.4 + Math.sin(pulse * 2.4) * 0.25;
      if (orbit) orbit.rotation.y -= dt * 1.6;
      grp.position.x += (X() - grp.position.x) * Math.min(1, dt * 6);   // 向きが変わったら追従
      const sc = SCALE();
      grp.scale.setScalar(grp.scale.x + (sc - grp.scale.x) * Math.min(1, dt * 6));
    },
    /* 見た目の設定。me: 自分、opp: 相手 (省くと今のまま) */
    setStyle(me, opp) {
      if (me !== undefined) keys.me = MARKER_STYLES[me] ? me : 'default';
      if (opp !== undefined) keys.opp = MARKER_STYLES[opp] ? opp : 'default';
      applied = null;
      applyHolder();
    },
    /* me: 自分の座席番号。ctrl: st.control (-1/0/1) */
    update(ctrl, me, animate) {
      if (ctrl === holder && me === seat) return;
      const from = grp.position.z;
      const to = ctrl === -1 ? Z.neutral : (ctrl === me ? Z.me : Z.opp);
      holder = ctrl;
      seat = me;
      applyHolder();
      const col = paint();
      if (!animate) { grp.position.z = to; return; }
      /* 獲得/使用の瞬間を衝撃波と音で知らせる */
      sfx(ctrl === -1 ? 'flip' : 'effect');
      shockwave(scene, new THREE.Vector3(X(), 0.1, from), col, 2.2, 500);
      TW.tween(520, (t) => {
        grp.position.z = TW.lerp(from, to, TW.Ease.inOutCubic(t));
        grp.position.y = 0.06 + Math.sin(Math.PI * t) * 0.55;
        grp.rotation.y = Math.PI * 2 * TW.Ease.inOutCubic(t);
      }, TW.Ease.linear, () => {
        grp.rotation.y = 0;
        shockwave(scene, new THREE.Vector3(X(), 0.1, to), col, 2.8, 620);
        sfx('land');
      });
    },
    has(ctrl) { return holder === ctrl; }
  };
  /* 持っている側の見た目を当てる (変わったときだけ作り直す) */
  function applyHolder() {
    const key = holderKey();
    if (key === applied) { paint(); return; }
    applied = key;
    style = MARKER_STYLES[key] || MARKER_STYLES.default;
    /* 質感と模様 */
    face.metalness = style.metal !== undefined ? style.metal : 0.4;
    face.roughness = style.rough !== undefined ? style.rough : 0.35;
    side.metalness = style.metal !== undefined ? Math.max(0.6, style.metal) : 0.8;
    face.transparent = side.transparent = !!style.glass;
    face.opacity = style.glass ? 0.72 : 1;
    side.opacity = style.glass ? 0.55 : 1;
    face.emissiveMap = faceTexture(style.pattern || null);
    face.needsUpdate = true; side.needsUpdate = true;
    buildExtras(style);
    paint();
  }
  return state;
}
