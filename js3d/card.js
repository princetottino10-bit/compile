/* =========================================================================
 * 3Dビュー: カード1枚のメッシュ
 *   表面 / 裏面 / 厚みの3パーツを Group にまとめる。
 *   ジオメトリは全カードで共有し、マテリアルだけ個別に持つ。
 *   ローカル軸: +X=右, +Y=上(表面の法線), +Z=手前。rotation.x=PI で裏返る。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { CARD, COLOR } from './theme.js';
import { faceTexture, backTex } from './cardtex.js';

/* 中身を知らないカードの def ID (board.js の UNKNOWN_DEF) と、透かしの濃さ */
const UNKNOWN_ID = '__unknown__';
const GHOST_OPACITY = 0.55;

let sharedPlane = null;   // 角丸の板 (水平)
let sharedCore = null;    // 厚み用の芯
let sharedFrame = null;   // 縁の金属枠

/* 角丸矩形の Shape を作る */
function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/* ShapeGeometry は XY 平面に出るので、UV を貼り直してから水平に倒す */
function planeGeometry() {
  if (sharedPlane) return sharedPlane;
  const g = new THREE.ShapeGeometry(roundedShape(CARD.w, CARD.h, 0.075), 8);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / CARD.w + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / CARD.h + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.rotateX(-Math.PI / 2);   // 法線を +Y に
  sharedPlane = g;
  return g;
}

/* カード外周をなぞる細い額縁。金属質にすると「刷り物」らしさが出る */
function frameGeometry() {
  if (sharedFrame) return sharedFrame;
  const outer = roundedShape(CARD.w, CARD.h, 0.075);
  const inner = roundedShape(CARD.w - 0.058, CARD.h - 0.058, 0.055);
  outer.holes.push(new THREE.Path(inner.getPoints(28)));
  const g = new THREE.ShapeGeometry(outer, 10);
  g.rotateX(-Math.PI / 2);
  sharedFrame = g;
  return g;
}

function coreGeometry() {
  if (!sharedCore) sharedCore = new THREE.BoxGeometry(CARD.w * 0.985, CARD.thickness, CARD.h * 0.985);
  return sharedCore;
}

/* 放射状に減衰する光輪テクスチャ (床に落とす光として board が使う) */
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
  g.addColorStop(0, 'rgba(255,255,255,.85)');
  g.addColorStop(0.35, 'rgba(255,255,255,.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

/* -------------------------------------------------------------------------
 * makeCard(def) -> THREE.Group
 *   group.userData = { def, front, back, glow, uid }
 * ------------------------------------------------------------------------- */
export function makeCard(def) {
  const group = new THREE.Group();

  /* カード面は印刷物として読ませたいので、照明を受けない面にして絵をそのままの色で出す。
     照明を受ける面だと、カメラに正対する手札が常に露出オーバーになり、
     色が白っぽく抜けて「ぴかぴか」に見えていた (トーンマップも通さない) */
  const front = new THREE.Mesh(planeGeometry(), new THREE.MeshBasicMaterial({
    map: faceTexture(def),
    toneMapped: false
  }));
  front.position.y = CARD.thickness / 2 + 0.0004;
  /* カードは影を落とさない (手札の影が盤面に落ちて読みづらかった) */
  front.castShadow = false;

  /* 発光 (効果の発動・選んだ札など) は、面の上に加算で色を重ねて表す */
  const shine = new THREE.Mesh(planeGeometry(), new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false
  }));
  shine.position.y = CARD.thickness / 2 + 0.0008;
  shine.renderOrder = 2;
  shine.visible = false;
  shine.raycast = () => {};

  const back = new THREE.Mesh(planeGeometry(), new THREE.MeshStandardMaterial({
    map: backTex(),
    roughness: 0.44,
    metalness: 0.26,
    envMapIntensity: 0.5,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 1
  }));
  /* 法線を -Y に向ける。カードは rotation.x=PI で裏返るため、
     裏面も x 軸で反転させておくと裏向き時に天地が揃う
     (z 軸反転だと裏向きプレイで上下逆に見える) */
  back.rotation.x = Math.PI;
  back.position.y = -CARD.thickness / 2 - 0.0004;

  const core = new THREE.Mesh(coreGeometry(), new THREE.MeshStandardMaterial({
    color: COLOR.cardEdge, roughness: 0.62, metalness: 0.45, envMapIntensity: 0.6
  }));
  core.castShadow = false;

  /* 縁は控えめな金属に。強い映り込みだと、持ち上げた手札の縁が発光して見えた */
  const frame = new THREE.Mesh(frameGeometry(), new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.color || '#b9a4ff').multiplyScalar(0.55),
    roughness: 0.45,
    metalness: 0.5,
    envMapIntensity: 0.3,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0
  }));
  frame.position.y = CARD.thickness / 2 + 0.0016;

  /* 透かし: 裏面の外側に表の絵を半透明で重ねる。自分の裏向きなど、
     中身を知っているカードだけ出す (知らないカードは UNKNOWN の絵なので出さない)。
     裏面と同じく x 軸で反転させておくと、裏向きのとき天地が表と揃う */
  const ghost = new THREE.Mesh(planeGeometry(), new THREE.MeshBasicMaterial({
    map: faceTexture(def), transparent: true, opacity: GHOST_OPACITY, depthWrite: false
  }));
  ghost.rotation.x = Math.PI;
  ghost.position.y = -CARD.thickness / 2 - 0.0012;
  ghost.renderOrder = 1;
  ghost.raycast = () => {};
  ghost.visible = def.id !== UNKNOWN_ID;

  group.add(core, front, shine, back, frame, ghost);
  group.userData = { def, front, shine, back, core, frame, ghost, uid: null, glowColor: null, glowStrength: 0 };
  return group;
}

/* ハイライト。カード面の発光と、床に落ちる光輪を別々に指定する。
   面の発光を上げすぎるとアートが白飛びするので、強調は光輪側 (board が描く) に寄せる。 */
export function setHighlight(card, colorHex, strength, glowStrength) {
  const ud = card.userData;
  const c = new THREE.Color(colorHex);
  ud.shine.material.color.copy(c);
  ud.shine.material.opacity = Math.min(1, strength);
  ud.shine.visible = strength > 0.001;
  ud.back.material.emissive.copy(c);
  ud.back.material.emissiveIntensity = strength * 0.8;
  if (ud.frame) {
    ud.frame.material.emissive.copy(c);
    ud.frame.material.emissiveIntensity = strength * 2.6;
  }
  ud.glowColor = c;
  ud.glowStrength = Math.min(0.95, glowStrength === undefined ? strength * 0.55 : glowStrength);
}

export function clearHighlight(card) {
  setHighlight(card, 0x000000, 0, 0);
}

/* 選択中のカード: 色付きの半透明ティントと太い縁取りで「選んだ1枚」を一目で分からせる。
   ハイライト(発光)だけでは候補との差が付きにくいため、面の色そのものを変える */
export function setSelected(card, on, colorHex) {
  const ud = card.userData;
  if (!ud.selectTint) {
    const geo = planeGeometry();
    const tint = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      /* 面は照明を受けない (絵そのままの明るさ) ので、加算の色は薄めにする */
      color: 0xffb3da, transparent: true, opacity: 0.08, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false
    }));
    tint.position.y = CARD.thickness / 2 + 0.002;
    tint.renderOrder = 3;
    const edges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(CARD.w * 1.06, CARD.h * 1.05).rotateX(-Math.PI / 2));
    const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: 0xffb3da, transparent: true, opacity: 0.95, linewidth: 2
    }));
    outline.position.y = CARD.thickness / 2 + 0.003;
    /* 装飾は入力を受けない。Line の標準判定幅はカード幅ほどあり、
       visible=false でも Raycaster が拾うため、隣のカードの操作を奪う。 */
    tint.raycast = () => {};
    outline.raycast = () => {};
    card.add(tint, outline);
    ud.selectTint = tint;
    ud.selectOutline = outline;
    tint.visible = false; outline.visible = false;
  }
  const c = new THREE.Color(colorHex || 0xffb3da);
  ud.selectTint.material.color.copy(c);
  ud.selectOutline.material.color.copy(c);
  ud.selectTint.visible = !!on;
  ud.selectOutline.visible = !!on;
  ud.selected = !!on;
}

/* 選べる候補: 面は光らせず (アートが白く褪せて、候補外より目立たなくなる)、
   選択と同じ縁取りだけを水色で出す。選んだ札は setSelected の金色が上書きする */
export function setCandidate(card, on) {
  setSelected(card, !!on, 0xb9a4ff);
  if (card.userData.selectTint) card.userData.selectTint.visible = false;
  card.userData.selected = false;
}

/* いま操作できないカードを沈める (MD の「発動できない札」に相当) */
export function setDim(card, dim) {
  const v = dim ? 0.55 : 1;
  card.userData.front.material.color.setScalar(v);
  card.userData.back.material.color.setScalar(v);
  if (card.userData.ghost) card.userData.ghost.material.color.setScalar(v);
}

/* 額縁も一緒に光らせる (発光の主役はあくまで縁) */
export function frameGlow(card, colorHex, strength) {
  const f = card.userData.frame;
  if (!f) return;
  f.material.emissive.set(colorHex);
  f.material.emissiveIntensity = strength;
}

/* テクスチャを別カードのものに差し替える (裏向き→公開時など) */
export function retexture(card, def) {
  card.userData.def = def;
  card.userData.front.material.map = faceTexture(def);
  card.userData.front.material.needsUpdate = true;
  const ghost = card.userData.ghost;
  if (ghost) {
    ghost.material.map = card.userData.front.material.map;
    ghost.material.needsUpdate = true;
    ghost.visible = def.id !== UNKNOWN_ID;
  }
  if (card.userData.frame) {
    card.userData.frame.material.color
      .set(def.color || '#b9a4ff').multiplyScalar(0.55);
  }
}

/* -------------------------------------------------------------------------
 * オーラ: 使って勝つほど光る (銅・銀・金・ホロ)、お気に入りはさらに脈打つ。
 * カードの外周を縁取る光の輪 (中はくり抜き) を面の上に重ねる。
 * spec: { color, strength, holo, fav } / null で消す。毎フレームの揺らぎは tickAura
 * ------------------------------------------------------------------------- */
let auraTex = null;
let auraGeo = null;
function auraTexture() {
  if (auraTex) return auraTex;
  /* カードの外周だけが光る輪。中はくり抜いて、絵を覆わない (板はカードの 1.36 × 1.3 倍) */
  const W = 272, H = 338;
  const cw = W / 1.36, ch = H / 1.3, x = (W - cw) / 2, y = (H - ch) / 2, r = 16;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const rect = () => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + cw, y, x + cw, y + ch, r); ctx.arcTo(x + cw, y + ch, x, y + ch, r);
    ctx.arcTo(x, y + ch, x, y, r); ctx.arcTo(x, y, x + cw, y, r); ctx.closePath();
  };
  ctx.shadowColor = '#fff';
  ctx.strokeStyle = '#fff';
  for (const [blur, lw] of [[30, 10], [14, 6], [4, 3]]) {
    ctx.shadowBlur = blur;
    ctx.lineWidth = lw;
    rect();
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'destination-out';
  rect();
  ctx.fill();
  auraTex = new THREE.CanvasTexture(cv);
  return auraTex;
}

export function setAura(card, spec) {
  let aura = card.userData.aura;
  if (!spec) {
    if (aura) aura.visible = false;
    card.userData.auraSpec = null;
    return;
  }
  if (!aura) {
    if (!auraGeo) {
      auraGeo = new THREE.PlaneGeometry(CARD.w * 1.36, CARD.h * 1.3);
      auraGeo.rotateX(-Math.PI / 2);
    }
    aura = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({
      map: auraTexture(), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false
    }));
    aura.position.y = CARD.thickness / 2 + 0.0024;     // 面の上 (中はくり抜いてある)
    aura.renderOrder = 4;
    aura.raycast = () => {};
    card.add(aura);
    card.userData.aura = aura;
  }
  aura.visible = true;
  aura.material.color.set(spec.color);
  aura.material.opacity = spec.strength;      // 揺らぎ (tickAura) が始まる前から見えるように
  card.userData.auraSpec = spec;
}

/* -------------------------------------------------------------------------
 * キラ加工: プロトコルの習熟度で、カードの表面に箔のような光を乗せる (銀 → 金 → 虹)。
 * 斜めの光の帯がゆっくり横切り、細かい箔の筋がかすかに揺れる。
 * 文字のある所 (ヘッダと上・中・下段の枠) は型紙 (foilMaskTexture) で抜いて、読みやすさを落とさない。
 * spec: { color, strength, rainbow } / null で消す。時間は全カードで1つ (setFoilTime)
 * ------------------------------------------------------------------------- */
const foilTime = { value: 0 };
export function setFoilTime(t) { foilTime.value = t; }
const FOIL_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FOIL_FRAG = `
uniform sampler2D uMask;
uniform float uTime;
uniform vec3 uColor;
uniform float uStrength;
uniform float uRainbow;
uniform float uPhase;
varying vec2 vUv;
vec3 hue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}
void main() {
  float m = texture2D(uMask, vUv).r;
  if (m < 0.02) discard;
  float d = vUv.x * 0.8 + vUv.y * 0.55;
  /* 光の帯: 数秒に1度、斜めに横切る (通っていない間は箔の筋だけ) */
  float pos = fract(uTime * 0.11 + uPhase) * 2.4 - 0.55;
  float band = exp(-pow((d - pos) / 0.075, 2.0));
  float fine = 0.5 + 0.5 * sin(vUv.x * 46.0 - vUv.y * 30.0 + uTime * 1.3);
  vec3 col = mix(uColor, hue(fract(d * 1.3 + uTime * 0.04)) * 0.9 + 0.1, uRainbow);
  float a = (band * 0.85 + fine * 0.12 + 0.05) * uStrength * m;
  gl_FragColor = vec4(col * a, a);
}`;

export function setFoil(card, spec, mask) {
  let foil = card.userData.foil;
  if (!spec || !mask) {
    if (foil) foil.visible = false;
    card.userData.foilSpec = null;
    return;
  }
  if (!foil) {
    foil = new THREE.Mesh(planeGeometry(), new THREE.ShaderMaterial({
      uniforms: {
        uMask: { value: mask }, uTime: foilTime, uColor: { value: new THREE.Color() },
        uStrength: { value: 0 }, uRainbow: { value: 0 }, uPhase: { value: Math.random() }
      },
      vertexShader: FOIL_VERT, fragmentShader: FOIL_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    }));
    foil.position.y = CARD.thickness / 2 + 0.0006;     // 絵の上、発光 (shine) の下
    foil.renderOrder = 1;
    foil.raycast = () => {};
    card.add(foil);
    card.userData.foil = foil;
  }
  const u = foil.material.uniforms;
  if (u.uMask.value !== mask) u.uMask.value = mask;
  u.uColor.value.set(spec.color);
  u.uStrength.value = spec.strength;
  u.uRainbow.value = spec.rainbow ? 1 : 0;
  foil.visible = true;
  card.userData.foilSpec = spec;
}

/* 毎フレーム: 光の輪はゆっくり脈打ち、ホロは色が巡る */
export function tickAura(card, t) {
  const spec = card.userData.auraSpec;
  const aura = card.userData.aura;
  if (!spec || !aura || !aura.visible) return;
  const pulse = 0.9 + 0.1 * Math.sin(t * 1.3);
  aura.material.opacity = spec.strength * pulse;
  if (spec.holo) aura.material.color.setHSL((t * 0.08) % 1, 0.85, 0.62);
}
