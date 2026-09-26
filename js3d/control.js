/* =========================================================================
 * 3Dビュー: コントロールコンポーネント (実卓の物理マーカー)
 *   コントロールトラッカー (control-tracker.html) と同じ意匠のマーカー:
 *   角を落とした三角形の枠に、三方へ腕の伸びた窓と中心の丸。
 *   盤面左脇に置かれ、保持者の側へ滑って移動する。
 *   中立 (-1) は中央で淡く、保持中は保持者の色で強く光る。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import * as TW from './tween.js';
import { sfx } from './audio.js';
import { shockwave } from './fx.js';
import { VIEW } from './theme.js';

const X_WIDE = -2.85;         // lane0 とトラッシュの間の余白
/* 縦持ちはレーンの外側の細い余白へ寄せ、小さくする (山札・捨て札と同じ扱い) */
const X = () => X_WIDE + (-2.52 - X_WIDE) * VIEW.k;
const SCALE = () => 1 - 0.38 * VIEW.k;
/* 横持ちのスマホは自分の捨て札を奥へ寄せる (layout.js の pilePos) ので、マーカーも板の側に寄せて捨て札に重ねない */
const Z = { neutral: 0, get me() { return VIEW.short ? 0.72 : 1.35; }, get opp() { return VIEW.short ? -0.72 : -1.35; } };
const MINT = 0xa07bff, PINK = 0xff4fa3, DIM = 0x44536e;
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
  slayer: { me: 0xffc83a, dim: 0x5c1020, pattern: 'slash', extra: 'crown', metal: 0.8, rough: 0.25 },   // 下剋上の褒美
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
const patternTextures = new Map();
function patternTexture(pattern) {
  if (!patternTextures.has(pattern)) {
    const t = new THREE.CanvasTexture(markerPatternCanvas(pattern));
    t.colorSpace = THREE.SRGBColorSpace;
    /* 押し出しの上面の UV は形の座標そのまま (±0.42)。0〜1 に合わせる */
    t.repeat.set(1 / 0.84, 1 / 0.84);
    t.offset.set(0.5, 0.5);
    patternTextures.set(pattern, t);
  }
  return patternTextures.get(pattern);
}

/* 見た目の画面のプレビュー (2D): 外形に模様を敷き、持ち主の色で光らせる。飾りも描く */
export function markerPreviewURL(key, size) {
  const st = MARKER_STYLES[key] || MARKER_STYLES.default;
  const S = size || 240;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const k = S / 1.2;                               // ワールド 1.2 = 全体
  const P = (x, y) => [S / 2 + x * k, S / 2 - y * k];
  const hex = '#' + st.me.toString(16).padStart(6, '0');
  const dim = '#' + st.dim.toString(16).padStart(6, '0');
  /* 足元の輪 */
  c.strokeStyle = hex; c.globalAlpha = 0.7; c.lineWidth = S * 0.02;
  c.beginPath(); c.arc(S / 2, S / 2, 0.46 * k, 0, Math.PI * 2); c.stroke();
  if (st.extra === 'halo') { c.lineWidth = S * 0.008; c.beginPath(); c.arc(S / 2, S / 2, 0.55 * k, 0, Math.PI * 2); c.stroke(); }
  c.globalAlpha = 1;
  /* 外形 (窓は抜く) */
  c.save();
  c.beginPath();
  OUTER.forEach(([x, y], i) => { const [px, py] = P(x, y); if (i) c.lineTo(px, py); else c.moveTo(px, py); });
  c.closePath();
  WINDOW.slice().reverse().forEach(([x, y], i) => { const [px, py] = P(x, y); if (i) c.lineTo(px, py); else c.moveTo(px, py); });
  c.closePath();
  c.clip('evenodd');
  c.fillStyle = hex; c.fillRect(0, 0, S, S);
  if (st.pattern) {
    c.globalCompositeOperation = st.pattern === 'rainbow' ? 'source-over' : 'multiply';
    c.drawImage(markerPatternCanvas(st.pattern), S / 2 - 0.42 * k, S / 2 - 0.42 * k, 0.84 * k, 0.84 * k);
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
  c.strokeStyle = dim; c.lineWidth = S * 0.012;
  c.beginPath(); OUTER.forEach(([x, y], i) => { const [px, py] = P(x, y); if (i) c.lineTo(px, py); else c.moveTo(px, py); }); c.closePath(); c.stroke();
  /* 真ん中の点 */
  c.fillStyle = hex; c.beginPath(); c.arc(S / 2, S / 2, DOT_R * k, 0, Math.PI * 2); c.fill();
  /* 飾り */
  if (st.extra === 'orbit') {
    c.fillStyle = '#fff8dc'; c.shadowColor = hex; c.shadowBlur = S * 0.05;
    for (let i = 0; i < 3; i++) { const a = i * 2.09 + 0.4; c.beginPath(); c.arc(S / 2 + Math.cos(a) * 0.56 * k, S / 2 + Math.sin(a) * 0.56 * k, S * 0.025, 0, Math.PI * 2); c.fill(); }
    c.shadowBlur = 0;
  }
  if (st.extra === 'crown') {
    const [cx, cy] = [S / 2, S / 2 - 0.5 * k];
    c.fillStyle = '#ffd65a';
    c.beginPath(); c.moveTo(cx - S * 0.1, cy + S * 0.04); c.lineTo(cx - S * 0.1, cy - S * 0.02); c.lineTo(cx - S * 0.05, cy + S * 0.01);
    c.lineTo(cx, cy - S * 0.05); c.lineTo(cx + S * 0.05, cy + S * 0.01); c.lineTo(cx + S * 0.1, cy - S * 0.02); c.lineTo(cx + S * 0.1, cy + S * 0.04); c.closePath(); c.fill();
  }
  if (st.extra === 'wreath') {
    c.fillStyle = '#d9c25a';
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16;
      c.save(); c.translate(S / 2 + Math.cos(a) * 0.53 * k, S / 2 + Math.sin(a) * 0.53 * k); c.rotate(a + 0.7);
      c.beginPath(); c.ellipse(0, 0, S * 0.03, S * 0.012, 0, 0, Math.PI * 2); c.fill(); c.restore();
    }
  }
  return cv.toDataURL('image/png');
}

/* トラッカーのマーカー画像 (2048px) の輪郭を、中心をそろえて 120° 対称に整えたもの。
   単位はワールド座標 (外形の半径 ≈ 0.42)、y は上向き */
const OUTER = [[-0.064, 0.415], [-0.392, -0.152], [-0.328, -0.263], [0.328, -0.263], [0.392, -0.152], [0.064, 0.415]];
const WINDOW = [[-0.078, 0.223], [0.078, 0.223], [0.078, 0.133], [0.155, 0.001], [0.232, -0.044], [0.154, -0.179],
  [0.076, -0.135], [-0.076, -0.135], [-0.154, -0.179], [-0.232, -0.044], [-0.155, 0.001], [-0.078, 0.133]];
const DOT_R = 0.079;
const THICK = 0.05;

function tokenGeometry() {
  const shape = new THREE.Shape(OUTER.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.holes.push(new THREE.Path(WINDOW.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: THICK, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2
  });
  /* 押し出しは +z 方向。卓に寝かせ、厚みの中心を y=0 に */
  g.rotateX(-Math.PI / 2);
  g.translate(0, -THICK / 2, 0);
  return g;
}

export function createControlMarker(scene) {
  const grp = new THREE.Group();

  /* 光るのは上面だけ。側面まで光らせると窓の縁がにじんで形が読めない */
  const face = new THREE.MeshStandardMaterial({
    color: 0x0a0f1c, roughness: 0.35, metalness: 0.4,
    emissive: new THREE.Color(DIM), emissiveIntensity: 0.5
  });
  const side = new THREE.MeshStandardMaterial({
    color: 0x0a0f1c, roughness: 0.4, metalness: 0.8,
    emissive: new THREE.Color(DIM), emissiveIntensity: 0.12
  });
  /* ExtrudeGeometry の材質グループ: 0 = 上下の面, 1 = 側面 */
  const puck = new THREE.Mesh(tokenGeometry(), [face, side]);
  puck.castShadow = true;
  /* CylinderGeometry の材質グループ: 0 = 側面, 1 = 上面, 2 = 底面 */
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(DOT_R, DOT_R, THICK + 0.02, 40), [side, face, side]);
  dot.castShadow = true;

  /* 足元の光の輪 */
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.022, 10, 48),
    new THREE.MeshBasicMaterial({ color: DIM, transparent: true, opacity: 0.7 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.03;

  grp.add(puck, dot, ring);
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
        m.position.set(Math.cos(a) * 0.52, 0.0, Math.sin(a) * 0.52);
        m.rotation.y = -a + 0.7;
        extras.add(m);
      }
    }
  };
  grp.position.set(X(), 0.06, Z.neutral);
  grp.rotation.y = Math.PI / 6;
  scene.add(grp);

  let holder = -1;
  let spin = 0;
  let style = MARKER_STYLES.default;
  let seat = 0;
  const paint = () => {
    const col = holder === -1 ? style.dim : (holder === seat ? style.me : PINK);
    face.emissive.setHex(col);
    face.emissiveIntensity = holder === -1 ? 0.5 : 1.5;
    side.emissive.setHex(col);
    ring.material.color.setHex(col);
    return col;
  };
  const state = {
    group: grp,
    /* 毎フレーム: 保持中はゆっくり回して「生きている」感を出す */
    tick(dt) {
      spin += dt * (holder === -1 ? 0.15 : 0.55);
      if (orbit) orbit.rotation.y -= dt * 1.6;
      grp.rotation.y = Math.PI / 6 + spin;
      grp.position.x += (X() - grp.position.x) * Math.min(1, dt * 6);   // 向きが変わったら追従
      const sc = SCALE();
      grp.scale.setScalar(grp.scale.x + (sc - grp.scale.x) * Math.min(1, dt * 6));
    },
    /* 見た目の切り替え (設定から) */
    setStyle(key) {
      style = MARKER_STYLES[key] || MARKER_STYLES.default;
      /* 質感と模様 */
      face.metalness = style.metal !== undefined ? style.metal : 0.4;
      face.roughness = style.rough !== undefined ? style.rough : 0.35;
      side.metalness = style.metal !== undefined ? Math.max(0.6, style.metal) : 0.8;
      face.transparent = side.transparent = !!style.glass;
      face.opacity = style.glass ? 0.72 : 1;
      side.opacity = style.glass ? 0.55 : 1;
      face.emissiveMap = style.pattern ? patternTexture(style.pattern) : null;
      face.needsUpdate = true; side.needsUpdate = true;
      buildExtras(style);
      paint();
    },
    /* me: 自分の座席番号。ctrl: st.control (-1/0/1) */
    update(ctrl, me, animate) {
      if (ctrl === holder) return;
      const from = grp.position.z;
      const to = ctrl === -1 ? Z.neutral : (ctrl === me ? Z.me : Z.opp);
      holder = ctrl;
      seat = me;
      const col = paint();
      if (!animate) { grp.position.z = to; return; }
      /* 獲得/使用の瞬間を衝撃波と音で知らせる */
      sfx(ctrl === -1 ? 'flip' : 'effect');
      shockwave(scene, new THREE.Vector3(X(), 0.1, from), col, 2.2, 500);
      TW.tween(520, (t) => {
        grp.position.z = TW.lerp(from, to, TW.Ease.inOutCubic(t));
        grp.position.y = 0.06 + Math.sin(Math.PI * t) * 0.55;
        grp.rotation.y += 0.22;
      }, TW.Ease.linear, () => {
        shockwave(scene, new THREE.Vector3(X(), 0.1, to), col, 2.8, 620);
        sfx('land');
      });
    },
    has(ctrl) { return holder === ctrl; }
  };
  return state;
}
