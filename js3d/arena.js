/* =========================================================================
 * 3Dビュー: 盤面を囲む「箱」— 天球・外周の枠・浮遊リング・支柱
 *   ゲームの状態には一切関与しない、雰囲気だけを作る静的な構造物。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { COLOR, BOARD } from './theme.js';

/* 天球: 下が暗く、上に向かって薄く色が乗る + 微細な星 */
const skyVert = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFrag = `
  precision highp float;
  varying vec3 vDir;
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform vec3 uGlowA;
  uniform vec3 uGlowB;
  uniform float uTime;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }

  void main() {
    float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uLow, uHigh, pow(h, 1.35));

    /* 自陣・敵陣の方向にうっすら色を溜める */
    float front = max(0.0, dot(vDir, vec3(0.0, 0.12, 1.0)));
    float back = max(0.0, dot(vDir, vec3(0.0, 0.12, -1.0)));
    col += uGlowA * pow(front, 6.0) * 0.16;
    col += uGlowB * pow(back, 6.0) * 0.14;

    /* 星: 上半球にだけ、ごく小さく */
    vec3 g = floor(vDir * 190.0);
    float s = hash(g);
    float star = step(0.9975, s) * smoothstep(0.0, 0.35, vDir.y);
    float tw = 0.55 + 0.45 * sin(uTime * 1.6 + s * 40.0);
    col += vec3(star * tw * 0.85);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function buildArena(stage) {
  const scene = stage.scene;
  const group = new THREE.Group();
  scene.add(group);

  /* --- 天球 --- */
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uLow: { value: new THREE.Color(0x010206) },
      uHigh: { value: new THREE.Color(0x0a1024) },
      uGlowA: { value: new THREE.Color(COLOR.mint) },
      uGlowB: { value: new THREE.Color(COLOR.pink) },
      uTime: { value: 0 }
    }
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(48, 32, 24), skyMat);
  group.add(sky);
  scene.background = null;

  /* --- 盤面外周の発光枠 --- */
  const frame = new THREE.Group();
  const frameMat = new THREE.MeshBasicMaterial({
    color: COLOR.gridHot, transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const rail = (w, d, x, z) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, frameMat);
    m.position.set(x, 0.004, z);
    frame.add(m);
  };
  const HALF_X = 5.0, HALF_Z = 5.4, T = 0.035;
  rail(HALF_X * 2, T, 0, -HALF_Z);
  rail(HALF_X * 2, T, 0, HALF_Z);
  rail(T, HALF_Z * 2, -HALF_X, 0);
  rail(T, HALF_Z * 2, HALF_X, 0);
  group.add(frame);

  /* 角のマーカー */
  const cornerMat = new THREE.MeshBasicMaterial({
    color: COLOR.cyan, transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.9, 0.06);
      g.rotateX(-Math.PI / 2);
      const a = new THREE.Mesh(g, cornerMat);
      a.position.set(sx * (HALF_X - 0.45), 0.005, sz * HALF_Z);
      const b = new THREE.Mesh(g, cornerMat);
      b.position.set(sx * HALF_X, 0.005, sz * (HALF_Z - 0.45));
      b.rotation.y = Math.PI / 2;
      group.add(a, b);
    }
  }

  /* --- 空中の回転リング (ホログラムの計器) --- */
  const rings = [];
  const ringSpec = [
    { r: 10.5, tube: 0.02, tilt: 0.1, y: 6.2, color: COLOR.cyan, speed: 0.05, op: 0.17 },
    { r: 13.0, tube: 0.016, tilt: -0.16, y: 8.0, color: COLOR.pink, speed: -0.034, op: 0.13 },
    { r: 8.4, tube: 0.028, tilt: 0.26, y: 10.0, color: COLOR.mint, speed: 0.024, op: 0.1 }
  ];
  for (const spec of ringSpec) {
    const geo = new THREE.TorusGeometry(spec.r, spec.tube, 6, 128);
    const mat = new THREE.MeshBasicMaterial({
      color: spec.color, transparent: true, opacity: spec.op,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = Math.PI / 2 + spec.tilt;
    ring.position.y = spec.y;
    group.add(ring);
    rings.push({ ring, speed: spec.speed });
  }

  /* --- 左右の支柱 (奥行きの手がかり) --- */
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x0a0f1d, roughness: 0.42, metalness: 0.72, envMapIntensity: 0.5
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: COLOR.cyan, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6.4, 0.4), pillarMat);
      p.position.set(sx * 7.7, 3.2, sz * 5.9);
      p.castShadow = false;
      group.add(p);

      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 5.4, 0.055), glowMat);
      strip.position.set(sx * 7.7 - sx * 0.22, 3.2, sz * 5.9);
      group.add(strip);
    }
  }

  /* --- ライン境界の縦フィン (レーンを空間として意識させる) --- */
  const finMat = new THREE.MeshBasicMaterial({
    color: COLOR.gridHot, transparent: true, opacity: 0.09,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  for (let i = 0; i < 2; i++) {
    const x = (BOARD.laneX[i] + BOARD.laneX[i + 1]) / 2;
    const g = new THREE.PlaneGeometry(9.4, 1.15);
    const fin = new THREE.Mesh(g, finMat);
    fin.rotation.y = Math.PI / 2;
    fin.position.set(x, 0.575, 0);
    group.add(fin);
  }

  stage.onFrame((dt, elapsed) => {
    skyMat.uniforms.uTime.value = elapsed;
    for (const r of rings) r.ring.rotation.z += r.speed * dt;
    sky.position.copy(stage.camera.position);
  });

  return { group, rings };
}
