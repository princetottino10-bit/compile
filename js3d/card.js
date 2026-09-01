/* =========================================================================
 * 3Dビュー: カード1枚のメッシュ
 *   表面 / 裏面 / 厚みの3パーツを Group にまとめる。
 *   ジオメトリは全カードで共有し、マテリアルだけ個別に持つ。
 *   ローカル軸: +X=右, +Y=上(表面の法線), +Z=手前。rotation.x=PI で裏返る。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { CARD, COLOR } from './theme.js';
import { faceTexture, backTex } from './cardtex.js';

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

  const front = new THREE.Mesh(planeGeometry(), new THREE.MeshStandardMaterial({
    map: faceTexture(def),
    roughness: 0.38,
    metalness: 0.16,
    envMapIntensity: 0.3,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 1
  }));
  front.position.y = CARD.thickness / 2 + 0.0004;
  front.castShadow = true;
  front.receiveShadow = true;

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
  core.castShadow = true;

  const frame = new THREE.Mesh(frameGeometry(), new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.color || '#63f3ff').multiplyScalar(0.55),
    roughness: 0.24,
    metalness: 0.95,
    envMapIntensity: 1.1,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0
  }));
  frame.position.y = CARD.thickness / 2 + 0.0016;

  group.add(core, front, back, frame);
  group.userData = { def, front, back, core, frame, uid: null, glowColor: null, glowStrength: 0 };
  return group;
}

/* ハイライト。カード面の発光と、床に落ちる光輪を別々に指定する。
   面の発光を上げすぎるとアートが白飛びするので、強調は光輪側 (board が描く) に寄せる。 */
export function setHighlight(card, colorHex, strength, glowStrength) {
  const ud = card.userData;
  const c = new THREE.Color(colorHex);
  ud.front.material.emissive.copy(c);
  ud.front.material.emissiveIntensity = strength;
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

/* いま操作できないカードを沈める (MD の「発動できない札」に相当) */
export function setDim(card, dim) {
  const v = dim ? 0.55 : 1;
  card.userData.front.material.color.setScalar(v);
  card.userData.back.material.color.setScalar(v);
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
  if (card.userData.frame) {
    card.userData.frame.material.color
      .set(def.color || '#63f3ff').multiplyScalar(0.55);
  }
}
