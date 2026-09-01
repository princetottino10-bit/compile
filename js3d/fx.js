/* =========================================================================
 * 3Dビュー: 大物の演出エフェクト
 *   盤面ロジックから独立した「見せ場」だけをここに集める。
 *   - コンパイル時のライン崩壊
 *   - カードが砕けて散る
 *   - 空間に漂う塵
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { CARD, COLOR, BOARD } from './theme.js';
import * as TW from './tween.js';

/* -------------------------------------------------------------------------
 * ライン全体を貫く光の柱 (コンパイルの主役)
 * ------------------------------------------------------------------------- */
export function compilePillar(scene, laneX, colorHex, ms) {
  const group = new THREE.Group();
  const color = new THREE.Color(colorHex);

  /* 芯: 細く白い柱 */
  const coreGeo = new THREE.CylinderGeometry(0.2, 0.26, 16, 32, 1, true);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const core = new THREE.Mesh(coreGeo, coreMat);

  /* 外殻: プロトコル色の広がり */
  const shellGeo = new THREE.CylinderGeometry(0.66, 1.02, 16, 40, 1, true);
  const shellMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const shell = new THREE.Mesh(shellGeo, shellMat);

  /* 床に沿って走る帯 */
  const bandGeo = new THREE.PlaneGeometry(1.9, 11);
  bandGeo.rotateX(-Math.PI / 2);
  const bandMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.position.y = 0.006;

  group.add(core, shell, band);
  group.position.set(laneX, 0, 0);
  core.position.y = 8; shell.position.y = 8;
  scene.add(group);

  const dur = ms || 1500;
  return TW.tween(dur, (t) => {
    /* 立ち上がり → 膨張 → 消滅 */
    const rise = Math.min(1, t / 0.22);
    const decay = Math.max(0, (t - 0.34) / 0.66);
    coreMat.opacity = rise * (1 - decay) * 0.95;
    shellMat.opacity = rise * (1 - decay) * 0.42;
    bandMat.opacity = rise * (1 - decay * decay) * 0.7;
    const grow = 1 + TW.Ease.outCubic(t) * 0.85;
    shell.scale.set(grow, 1, grow);
    core.scale.set(1 + t * 0.35, 1, 1 + t * 0.35);
    band.scale.set(1 + t * 0.5, 1, 1);
  }, TW.Ease.linear, () => {
    scene.remove(group);
    coreGeo.dispose(); coreMat.dispose();
    shellGeo.dispose(); shellMat.dispose();
    bandGeo.dispose(); bandMat.dispose();
  });
}

/* 床を水平に走る衝撃波 (コンパイル / 大きな効果の合図) */
export function shockwave(scene, center, colorHex, radius, ms) {
  const geo = new THREE.RingGeometry(0.94, 1.0, 128);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.set(center.x, 0.01, center.z);
  scene.add(ring);

  const to = radius || 6.5;
  return TW.tween(ms || 900, (t) => {
    const s = 1 + (to - 1) * TW.Ease.outQuart(t);
    ring.scale.set(s, 1, s);
    mat.opacity = 0.9 * (1 - t) * (1 - t);
  }, TW.Ease.linear, () => {
    scene.remove(ring); geo.dispose(); mat.dispose();
  });
}

/* -------------------------------------------------------------------------
 * カードが砕けて散る (削除・コンパイルで消えるとき)
 *   カード面のテクスチャを小片に貼って飛ばす。
 * ------------------------------------------------------------------------- */
export function shatterCard(scene, card, colorHex, ms) {
  const COLS = 4, ROWS = 5;
  const pieces = [];
  const map = card.userData.front.material.map;
  const group = new THREE.Group();
  group.position.copy(card.position);
  group.rotation.copy(card.rotation);
  scene.add(group);

  const pw = CARD.w / COLS, ph = CARD.h / ROWS;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const geo = new THREE.PlaneGeometry(pw, ph);
      geo.rotateX(-Math.PI / 2);
      /* 元カードの該当部分だけを貼る */
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i,
          (c + uv.getX(i)) / COLS,
          (ROWS - 1 - r + uv.getY(i)) / ROWS);
      }
      const mat = new THREE.MeshBasicMaterial({
        map, transparent: true, opacity: 1, side: THREE.DoubleSide
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set((c - (COLS - 1) / 2) * pw, 0, (r - (ROWS - 1) / 2) * ph);
      group.add(m);
      pieces.push({
        mesh: m,
        base: m.position.clone(),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 2.6,
          1.4 + Math.random() * 2.2,
          (Math.random() - 0.5) * 2.6
        ),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9
        ),
        mat
      });
    }
  }

  card.visible = false;
  const dur = ms || 900;
  return TW.tween(dur, (t) => {
    const s = t * (dur / 1000);
    for (const p of pieces) {
      p.mesh.position.set(
        p.base.x + p.vel.x * s,
        p.base.y + p.vel.y * s - 4.6 * s * s,
        p.base.z + p.vel.z * s
      );
      p.mesh.rotation.set(p.spin.x * s, p.spin.y * s, p.spin.z * s);
      p.mat.opacity = Math.max(0, 1 - t * 1.25);
    }
  }, TW.Ease.linear, () => {
    scene.remove(group);
    for (const p of pieces) { p.mesh.geometry.dispose(); p.mat.dispose(); }
  });
}

/* -------------------------------------------------------------------------
 * 空間の塵 — 常時ゆっくり漂わせて「空気」を出す
 * ------------------------------------------------------------------------- */
export function createDust(stage, count) {
  const n = count || 900;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 22;
    pos[i * 3 + 1] = Math.random() * 7.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 18;
    seed[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(COLOR.cyan) },
      uColorB: { value: new THREE.Color(COLOR.pink) },
      uSize: { value: 2.2 * Math.min(window.devicePixelRatio, 2) }
    },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      uniform float uSize;
      varying float vFade;
      varying float vMix;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * 0.16 + aSeed * 0.4, 7.5);
        p.x += sin(uTime * 0.22 + aSeed) * 0.42;
        p.z += cos(uTime * 0.18 + aSeed * 1.7) * 0.42;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (7.0 / -mv.z);
        vFade = smoothstep(7.5, 4.0, p.y) * smoothstep(0.0, 1.2, p.y);
        vMix = fract(aSeed * 0.31);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vFade;
      varying float vMix;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(d));
        vec3 col = mix(uColorA, uColorB, vMix);
        gl_FragColor = vec4(col, a * vFade * 0.5);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  stage.scene.add(points);
  stage.onFrame((dt, elapsed) => { mat.uniforms.uTime.value = elapsed; });
  return points;
}

/* -------------------------------------------------------------------------
 * ラインを一瞬白熱させる (コンパイル直前のチャージ)
 * ------------------------------------------------------------------------- */
export function laneCharge(scene, laneX, colorHex, ms) {
  const geo = new THREE.PlaneGeometry(1.75, 10.5);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(laneX, 0.005, 0);
  scene.add(m);
  return TW.tween(ms || 620, (t) => {
    mat.opacity = Math.pow(t, 2.2) * 0.85;
    m.scale.set(1 - t * 0.22, 1, 1);
  }, TW.Ease.linear, () => {
    scene.remove(m); geo.dispose(); mat.dispose();
  });
}

/* 盤面全体を一瞬白く飛ばす (決着・コンパイルの締め) */
export function screenFlash(stage, colorHex, ms, strength) {
  const el = document.getElementById('flash');
  if (!el) return Promise.resolve();
  const c = new THREE.Color(colorHex);
  el.style.background = 'rgb(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ')';
  return TW.tween(ms || 520, (t) => {
    el.style.opacity = String((strength === undefined ? 0.85 : strength) * (1 - t));
  }, TW.Ease.outQuart, () => { el.style.opacity = '0'; });
}

/* -------------------------------------------------------------------------
 * プロトコル別のコンパイル・バースト
 *   30種を5系統に丸める: flame(炎粉) / crystal(結晶) / mist(霧) /
 *   rings(波紋) / streaks(光条)。光柱と同時に重ねて個性を出す。
 * ------------------------------------------------------------------------- */
export const BURST_FAMILY = {
  FIRE: 'flame', HATE: 'flame', COURAGE: 'flame', WAR: 'flame', TIME: 'flame', CHAOS: 'flame',
  ICE: 'crystal', METAL: 'crystal', CLARITY: 'crystal', MIRROR: 'crystal', UNITY: 'crystal',
  DARKNESS: 'mist', DEATH: 'mist', PLAGUE: 'mist', APATHY: 'mist', FEAR: 'mist',
  SMOKE: 'mist', CORRUPTION: 'mist', GRAVITY: 'mist',
  PSYCHIC: 'rings', LOVE: 'rings', PEACE: 'rings', SPIRIT: 'rings', ASSIMILATION: 'rings',
  SPEED: 'streaks', LIGHT: 'streaks', WATER: 'streaks', LIFE: 'streaks', LUCK: 'streaks',
  DIVERSITY: 'streaks'
};

/* 丸い減衰スプライト (霧・火の粉で共用) */
let softTex = null;
function softTexture() {
  if (softTex) return softTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,.32)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  softTex = new THREE.CanvasTexture(cv);
  return softTex;
}

/* 炎粉: 上昇しながら揺れる火の粉 */
function burstFlame(scene, laneX, color, ms) {
  const n = 110;
  const sprites = [];
  const group = new THREE.Group();
  const mat = new THREE.SpriteMaterial({
    map: softTexture(), color, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(mat.clone());
    const s = 0.06 + Math.random() * 0.2;
    sp.scale.set(s, s, 1);
    sp.position.set(laneX + (Math.random() - 0.5) * 1.4, Math.random() * 0.4, (Math.random() - 0.5) * 7);
    sprites.push({ sp, vy: 1.6 + Math.random() * 3.2, wob: Math.random() * Math.PI * 2, spd: 2 + Math.random() * 4 });
    group.add(sp);
  }
  scene.add(group);
  return TW.tween(ms, (t, raw) => {
    for (const p of sprites) {
      p.sp.position.y += p.vy * 0.016;
      p.sp.position.x += Math.sin(raw * p.spd * 6 + p.wob) * 0.006;
      p.sp.material.opacity = 0.9 * (1 - raw);
    }
  }, TW.Ease.linear, () => { scene.remove(group); });
}

/* 結晶: 床から生えて消える鋭い柱 */
function burstCrystal(scene, laneX, color, ms) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const shards = [];
  for (let i = 0; i < 14; i++) {
    const h = 0.6 + Math.random() * 1.8;
    const geo = new THREE.ConeGeometry(0.07 + Math.random() * 0.09, h, 5);
    const m = new THREE.Mesh(geo, mat.clone());
    m.position.set(laneX + (Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 6.5);
    m.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5);
    m.userData = { h, delay: Math.random() * 0.3 };
    group.add(m);
    shards.push(m);
  }
  scene.add(group);
  return TW.tween(ms, (t, raw) => {
    for (const m of shards) {
      const lt = Math.max(0, Math.min(1, (raw - m.userData.delay) / 0.4));
      const grow = TW.Ease.outBack(lt);
      m.scale.set(grow, grow, grow);
      m.position.y = m.userData.h * 0.5 * grow;
      m.material.opacity = 0.55 * (1 - Math.max(0, (raw - 0.55) / 0.45));
    }
  }, TW.Ease.linear, () => {
    scene.remove(group);
    for (const m of shards) m.geometry.dispose();
  });
}

/* 霧: 大きな靄がゆっくり湧く */
function burstMist(scene, laneX, color, ms) {
  const group = new THREE.Group();
  const sprites = [];
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.SpriteMaterial({
      map: softTexture(), color, transparent: true, opacity: 0,
      blending: THREE.NormalBlending, depthWrite: false
    });
    const sp = new THREE.Sprite(mat);
    const s = 1.4 + Math.random() * 1.8;
    sp.scale.set(s, s, 1);
    sp.position.set(laneX + (Math.random() - 0.5) * 1.6, 0.2 + Math.random() * 0.7, (Math.random() - 0.5) * 6);
    sprites.push({ sp, vy: 0.25 + Math.random() * 0.5, peak: 0.24 + Math.random() * 0.18 });
    group.add(sp);
  }
  scene.add(group);
  return TW.tween(ms, (t, raw) => {
    for (const p of sprites) {
      p.sp.position.y += p.vy * 0.014;
      p.sp.material.opacity = p.peak * Math.sin(Math.PI * raw);
    }
  }, TW.Ease.linear, () => { scene.remove(group); });
}

/* 波紋: 同心のリングが層になって昇る */
function burstRings(scene, laneX, color, ms) {
  const group = new THREE.Group();
  const rings = [];
  for (let i = 0; i < 5; i++) {
    const geo = new THREE.TorusGeometry(0.8, 0.025, 6, 64);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(laneX, 0.1, 0);
    m.userData = { delay: i * 0.16 };
    group.add(m);
    rings.push(m);
  }
  scene.add(group);
  return TW.tween(ms, (t, raw) => {
    for (const m of rings) {
      const lt = Math.max(0, Math.min(1, (raw - m.userData.delay) / 0.7));
      const s = 0.5 + lt * 2.6;
      m.scale.set(s, 1, s);
      m.position.y = 0.1 + lt * 2.6;
      m.material.opacity = 0.65 * Math.sin(Math.PI * lt);
    }
  }, TW.Ease.linear, () => {
    scene.remove(group);
    for (const m of rings) m.geometry.dispose();
  });
}

/* 光条: 細い光がレーンを駆け上がる */
function burstStreaks(scene, laneX, color, ms) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const geo = new THREE.BoxGeometry(0.03, 0.9, 0.03);
  const streaks = [];
  for (let i = 0; i < 42; i++) {
    const m = new THREE.Mesh(geo, mat.clone());
    m.position.set(laneX + (Math.random() - 0.5) * 1.5, -0.5, (Math.random() - 0.5) * 7);
    streaks.push({ m, vy: 5 + Math.random() * 7, delay: Math.random() * 0.4 });
    group.add(m);
  }
  scene.add(group);
  return TW.tween(ms, (t, raw) => {
    for (const p of streaks) {
      if (raw < p.delay) continue;
      p.m.position.y += p.vy * 0.016;
      p.m.material.opacity = 0.8 * (1 - raw);
    }
  }, TW.Ease.linear, () => {
    scene.remove(group);
    geo.dispose();
  });
}

const BURSTS = {
  flame: burstFlame, crystal: burstCrystal, mist: burstMist,
  rings: burstRings, streaks: burstStreaks
};

export function compileBurst(scene, laneX, colorHex, protoName, ms) {
  const family = BURST_FAMILY[protoName] || 'rings';
  return BURSTS[family](scene, laneX, new THREE.Color(colorHex), ms || 1500);
}

/* -------------------------------------------------------------------------
 * 効果種別の軽量エフェクト
 *   カードの動き (draw/flip/shift/trash/delete) に色と光を添える。
 *   大物の compileBurst と違い、盤面のテンポを崩さない短い演出。
 * ------------------------------------------------------------------------- */

/* draw: カードが山札から出るときの、上へ伸びる光の尾 */
export function fxDrawTrail(scene, from, to, colorHex) {
  const geo = new THREE.BufferGeometry();
  const N = 16;
  const pos = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({
    color: colorHex, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  const a = new THREE.Vector3().copy(from);
  const b = new THREE.Vector3().copy(to);
  return TW.tween(360, (t) => {
    for (let i = 0; i < N; i++) {
      const k = Math.max(0, Math.min(1, t * 1.4 - (i / N) * 0.4));
      const p = new THREE.Vector3().lerpVectors(a, b, k);
      p.y += Math.sin(Math.PI * k) * 0.5;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 0.7 * (1 - t);
  }, TW.Ease.outCubic, () => { scene.remove(line); geo.dispose(); mat.dispose(); });
}

/* flip: 反転する瞬間の平たい閃光リング */
export function fxFlipFlash(scene, pos, colorHex) {
  const geo = new THREE.RingGeometry(0.2, 0.32, 40);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.set(pos.x, pos.y + 0.05, pos.z);
  ring.renderOrder = 3;
  scene.add(ring);
  return TW.tween(340, (t) => {
    const s = 1 + t * 3.4;
    ring.scale.set(s, 1, s);
    mat.opacity = 0.9 * (1 - t);
  }, TW.Ease.outQuart, () => { scene.remove(ring); geo.dispose(); mat.dispose(); });
}

/* shift: 移動元→先を結ぶ残像の帯 */
export function fxShiftStreak(scene, from, to, colorHex) {
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const len = from.distanceTo(to);
  const geo = new THREE.PlaneGeometry(len, 0.5);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(mid.x, 0.05, mid.z);
  m.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
  scene.add(m);
  return TW.tween(400, (t) => {
    mat.opacity = Math.sin(Math.PI * t) * 0.5;
  }, TW.Ease.linear, () => { scene.remove(m); geo.dispose(); mat.dispose(); });
}

/* delete: 赤い粒子がカード位置から弾け散る */
export function fxDeleteBurst(scene, pos, colorHex) {
  const N = 26;
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { p[i * 3] = pos.x; p[i * 3 + 1] = pos.y + 0.1; p[i * 3 + 2] = pos.z; }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const vel = [];
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 2.5;
    vel.push([Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp]);
  }
  const mat = new THREE.PointsMaterial({
    color: colorHex, size: 0.12, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return TW.tween(560, (t) => {
    const s = t * 0.56;
    for (let i = 0; i < N; i++) {
      p[i * 3] = pos.x + vel[i][0] * s;
      p[i * 3 + 1] = pos.y + 0.1 + vel[i][1] * s - 4.6 * s * s;
      p[i * 3 + 2] = pos.z + vel[i][2] * s;
    }
    g.attributes.position.needsUpdate = true;
    mat.opacity = 1 - t;
  }, TW.Ease.linear, () => { scene.remove(pts); g.dispose(); mat.dispose(); });
}
