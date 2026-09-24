/* =========================================================================
 * 3Dビュー: プロトコルごとのコンパイル演出 (追加の系統)
 *   fx.js の5系統 (炎・結晶・霧・波紋・光条) に、プロトコルの名前から連想できる
 *   動きを足す。どれも「レーン1本ぶんの範囲で、1〜2秒で消える」粒子演出。
 *   割り当ては fx.js の BURST_FAMILY。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import * as TW from './tween.js';

const LANE_DEPTH = 6.5;   // レーンの奥行き (z の広がり)

/* 丸い減衰スプライト */
let softTex = null;
function softTexture() {
  if (softTex) return softTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(cv);
  return softTex;
}

/* 花びら (楕円) のスプライト */
let petalTex = null;
function petalTexture() {
  if (petalTex) return petalTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.translate(32, 32);
  ctx.rotate(0.6);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  petalTex = new THREE.CanvasTexture(cv);
  return petalTex;
}

/* 星 (4本の光芒) のスプライト */
let starTex = null;
function starTexture() {
  if (starTex) return starTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 10);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(32, 2); ctx.lineTo(32, 62);
  ctx.moveTo(2, 32); ctx.lineTo(62, 32);
  ctx.stroke();
  starTex = new THREE.CanvasTexture(cv);
  return starTex;
}

/* 共通: スプライトの群れを作り、毎フレーム step(p, raw) で動かして消す */
function spriteSwarm(scene, count, make, step, ms, tex, blending) {
  const group = new THREE.Group();
  const parts = [];
  for (let i = 0; i < count; i++) {
    const p = make(i);
    const mat = new THREE.SpriteMaterial({
      map: tex || softTexture(), color: p.color, transparent: true, opacity: 0,
      blending: blending || THREE.AdditiveBlending, depthWrite: false
    });
    p.sp = new THREE.Sprite(mat);
    p.sp.position.copy(p.pos);
    p.sp.scale.set(p.size, p.size, 1);
    group.add(p.sp);
    parts.push(p);
  }
  scene.add(group);
  return TW.tween(ms, (t, raw) => {
    for (const p of parts) step(p, raw);
  }, TW.Ease.linear, () => {
    scene.remove(group);
    for (const p of parts) p.sp.material.dispose();
  });
}

const rnd = (a, b) => a + Math.random() * (b - a);
const laneZ = () => rnd(-LANE_DEPTH / 2, LANE_DEPTH / 2);
/* 立ち上がって消える山形の不透明度 */
const bell = (x) => Math.sin(Math.PI * Math.max(0, Math.min(1, x)));

/* 渦 (DARKNESS / GRAVITY): 周りの粒がレーンの中心へ螺旋で吸い込まれ、沈む */
function burstVortex(scene, laneX, color, ms) {
  return spriteSwarm(scene, 120, () => ({
    color, size: rnd(0.08, 0.22),
    pos: new THREE.Vector3(), r0: rnd(1.2, 3.4), a0: rnd(0, Math.PI * 2), y0: rnd(0.2, 1.8), z0: laneZ() * 0.6,
    spin: rnd(4, 7), delay: rnd(0, 0.25)
  }), (p, raw) => {
    const k = Math.max(0, (raw - p.delay) / (1 - p.delay));
    const r = p.r0 * (1 - TW.Ease.inCubic(k));
    const a = p.a0 + k * p.spin;
    p.sp.position.set(laneX + Math.cos(a) * r, p.y0 * (1 - k) - k * 0.3, p.z0 + Math.sin(a) * r * 0.6);
    p.sp.material.opacity = 0.9 * bell(k * 1.1);
  }, ms);
}

/* 灰 (DEATH / APATHY): 灰色の欠片がゆっくり舞い落ちる */
function burstAsh(scene, laneX, color, ms) {
  const grey = new THREE.Color(0x9aa3ad).lerp(color, 0.25);
  return spriteSwarm(scene, 90, () => ({
    color: grey, size: rnd(0.05, 0.14),
    pos: new THREE.Vector3(laneX + rnd(-0.9, 0.9), rnd(1.6, 3.4), laneZ()),
    vy: rnd(0.6, 1.3), sway: rnd(0, Math.PI * 2), delay: rnd(0, 0.3)
  }), (p, raw) => {
    const k = Math.max(0, raw - p.delay);
    p.sp.position.y -= p.vy * 0.016;
    p.sp.position.x += Math.sin(k * 9 + p.sway) * 0.008;
    p.sp.material.opacity = 0.75 * bell(k * 1.3);
  }, ms, null, THREE.NormalBlending);
}

/* 瘴気 (PLAGUE / CORRUPTION): 病んだ色の泡がぼこぼこと湧き上がって弾ける */
function burstMiasma(scene, laneX, color, ms) {
  const sick = new THREE.Color(color).lerp(new THREE.Color(0x9bd13a), 0.35);
  return spriteSwarm(scene, 70, () => ({
    color: sick, size: rnd(0.12, 0.45),
    pos: new THREE.Vector3(laneX + rnd(-0.8, 0.8), 0.05, laneZ()),
    vy: rnd(0.5, 1.4), delay: rnd(0, 0.6), grow: rnd(1.2, 2.2)
  }), (p, raw) => {
    const k = Math.max(0, (raw - p.delay) / 0.4);
    if (k <= 0) return;
    p.sp.position.y += p.vy * 0.016;
    const s = p.size * (1 + Math.min(1, k) * p.grow);
    p.sp.scale.set(s, s, 1);
    p.sp.material.opacity = 0.6 * bell(k);
  }, ms);
}

/* 魂 (SPIRIT): ゆらめく光の玉が、ばらばらの速さで昇っていく */
function burstWisps(scene, laneX, color, ms) {
  return spriteSwarm(scene, 26, () => ({
    color, size: rnd(0.25, 0.5),
    pos: new THREE.Vector3(laneX + rnd(-0.7, 0.7), rnd(0, 0.4), laneZ() * 0.8),
    vy: rnd(0.9, 2.2), ph: rnd(0, Math.PI * 2), amp: rnd(0.2, 0.5), delay: rnd(0, 0.35)
  }), (p, raw) => {
    const k = Math.max(0, raw - p.delay);
    p.sp.position.y += p.vy * 0.016;
    p.sp.position.x = laneX + Math.sin(k * 7 + p.ph) * p.amp * 0.5 + (p.sp.position.x - laneX) * 0.98;
    p.sp.material.opacity = 0.85 * bell(k * 1.25) * (0.75 + 0.25 * Math.sin(k * 30 + p.ph));
  }, ms);
}

/* 花 (LIFE / LOVE): 花びらが螺旋を描いて舞い上がる */
function burstBloom(scene, laneX, color, ms) {
  const tint = new THREE.Color(color);
  return spriteSwarm(scene, 80, () => ({
    color: tint.clone().offsetHSL(rnd(-0.05, 0.05), 0, rnd(0, 0.2)), size: rnd(0.14, 0.3),
    pos: new THREE.Vector3(laneX, 0.1, 0), r: rnd(0.2, 1.1), a0: rnd(0, Math.PI * 2), z0: laneZ(),
    vy: rnd(1.2, 2.6), spin: rnd(3, 6), delay: rnd(0, 0.3)
  }), (p, raw) => {
    const k = Math.max(0, raw - p.delay);
    const a = p.a0 + k * p.spin;
    const r = p.r * (0.5 + k);
    p.sp.position.set(laneX + Math.cos(a) * r, 0.1 + p.vy * k * 1.6, p.z0 + Math.sin(a) * r * 0.5);
    p.sp.material.rotation = a;
    p.sp.material.opacity = 0.9 * bell(k * 1.3);
  }, ms, petalTexture());
}

/* 雨 (WATER): 滴が降り、床に落ちた所から輪が広がる */
function burstRain(scene, laneX, color, ms) {
  const group = new THREE.Group();
  const drops = [];
  const dropGeo = new THREE.BoxGeometry(0.02, 0.36, 0.02);
  const ringGeo = new THREE.RingGeometry(0.1, 0.13, 32);
  ringGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 34; i++) {
    const dm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const rm = dm.clone();
    const drop = new THREE.Mesh(dropGeo, dm);
    const ring = new THREE.Mesh(ringGeo, rm);
    const x = laneX + rnd(-0.8, 0.8), z = laneZ();
    drop.position.set(x, 3.5, z);
    ring.position.set(x, 0.03, z);
    group.add(drop, ring);
    drops.push({ drop, ring, dm, rm, delay: rnd(0, 0.45), fall: rnd(0.18, 0.28) });
  }
  scene.add(group);
  return TW.tween(ms, (t, raw) => {
    for (const d of drops) {
      const k = (raw - d.delay) / d.fall;
      if (k < 0) continue;
      if (k < 1) {
        d.drop.position.y = 3.5 * (1 - k * k);
        d.dm.opacity = 0.8;
      } else {
        d.dm.opacity = 0;
        const rk = Math.min(1, (k - 1) * d.fall / 0.4);
        const s = 1 + rk * 7;
        d.ring.scale.set(s, 1, s);
        d.rm.opacity = 0.7 * (1 - rk);
      }
    }
  }, TW.Ease.linear, () => {
    scene.remove(group);
    dropGeo.dispose(); ringGeo.dispose();
    for (const d of drops) { d.dm.dispose(); d.rm.dispose(); }
  });
}

/* 雷 (HATE): ぎざぎざの稲妻が上から何本も落ちる */
function burstLightning(scene, laneX, color, ms) {
  const group = new THREE.Group();
  const bolts = [];
  for (let i = 0; i < 7; i++) {
    const pts = [];
    let x = laneX + rnd(-0.6, 0.6);
    const z = laneZ() * 0.8;
    for (let y = 4; y >= 0; y -= 0.4) { pts.push(new THREE.Vector3(x, y, z + rnd(-0.15, 0.15))); x += rnd(-0.28, 0.28); }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    group.add(line);
    bolts.push({ geo, mat, at: rnd(0, 0.6) });
  }
  scene.add(group);
  return TW.tween(ms, (t, raw) => {
    for (const b of bolts) {
      const k = (raw - b.at) / 0.18;
      b.mat.opacity = k < 0 || k > 1 ? 0 : (Math.random() < 0.8 ? 1 - k * 0.6 : 0.15);
    }
  }, TW.Ease.linear, () => {
    scene.remove(group);
    for (const b of bolts) { b.geo.dispose(); b.mat.dispose(); }
  });
}

/* グリッチ (CHAOS): 四角いノイズ片がランダムな位置と色で明滅する */
function burstGlitch(scene, laneX, color, ms) {
  const group = new THREE.Group();
  const tiles = [];
  const geo = new THREE.PlaneGeometry(1, 1);
  const palette = [new THREE.Color(color), new THREE.Color(0xb9a4ff), new THREE.Color(0xff4fa3), new THREE.Color(0xffffff)];
  for (let i = 0; i < 40; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: palette[i % palette.length], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    group.add(m);
    tiles.push({ m, mat, next: 0 });
  }
  scene.add(group);
  return TW.tween(ms, (t, raw) => {
    for (const g of tiles) {
      if (raw >= g.next) {
        g.next = raw + rnd(0.04, 0.14);
        g.m.position.set(laneX + rnd(-0.9, 0.9), rnd(0.1, 2.6), laneZ());
        g.m.scale.set(rnd(0.1, 0.9), rnd(0.03, 0.16), 1);
        g.mat.opacity = Math.random() < 0.6 ? 0.8 * (1 - raw) : 0;
      }
    }
  }, TW.Ease.linear, () => {
    scene.remove(group);
    geo.dispose();
    for (const g of tiles) g.mat.dispose();
  });
}

/* 時計 (TIME): 床に目盛りの輪が広がり、長針・短針が逆向きに回る */
function burstClock(scene, laneX, color, ms) {
  const group = new THREE.Group();
  group.position.set(laneX, 0.06, 0);
  const mats = [];
  const mk = (geo) => {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    mats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    group.add(m);
    return m;
  };
  const dial = mk(new THREE.RingGeometry(1.1, 1.16, 64).rotateX(-Math.PI / 2));
  for (let i = 0; i < 12; i++) {
    const tick = mk(new THREE.PlaneGeometry(0.04, i % 3 ? 0.14 : 0.26).rotateX(-Math.PI / 2));
    const a = (i / 12) * Math.PI * 2;
    tick.position.set(Math.cos(a) * 0.98, 0, Math.sin(a) * 0.98);
    tick.rotation.y = -a + Math.PI / 2;
  }
  const hand = (len) => {
    const pivot = new THREE.Group();
    const m = mk(new THREE.PlaneGeometry(0.06, len).rotateX(-Math.PI / 2));
    m.position.z = -len / 2;
    group.remove(m);
    pivot.add(m);
    group.add(pivot);
    return pivot;
  };
  const longHand = hand(0.95), shortHand = hand(0.6);
  scene.add(group);
  return TW.tween(ms, (t, raw) => {
    const s = 0.8 + TW.Ease.outCubic(Math.min(1, raw * 2)) * 0.6;   // レーン幅 (半径 ~1.4) に収める
    group.scale.set(s, 1, s);
    longHand.rotation.y = -raw * Math.PI * 4;
    shortHand.rotation.y = raw * Math.PI * 1.2;
    const o = 0.85 * bell(raw);
    for (const m of mats) m.opacity = o;
  }, TW.Ease.linear, () => {
    scene.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const m of mats) m.dispose();
  });
}

/* 六角 (UNITY / ASSIMILATION): 六角形のタイルが外から集まって1枚の面に組み上がる */
function burstHex(scene, laneX, color, ms) {
  const group = new THREE.Group();
  const geo = new THREE.CircleGeometry(0.34, 6).rotateX(-Math.PI / 2);
  const edge = new THREE.EdgesGeometry(geo);
  const tiles = [];
  const w = 0.34 * Math.sqrt(3);
  for (let r = -4; r <= 4; r++) for (let c = -1; c <= 1; c++) {
    const x = laneX + c * w + (r % 2 ? w / 2 : 0);
    const z = r * 0.51;
    if (Math.abs(x - laneX) > 0.95) continue;
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const fill = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const tile = new THREE.Group();
    tile.add(new THREE.LineSegments(edge, mat), new THREE.Mesh(geo, fill));
    const from = new THREE.Vector3(x + rnd(-3, 3), rnd(1.5, 3.5), z + rnd(-2, 2));
    tile.position.copy(from);
    group.add(tile);
    tiles.push({ tile, mat, fill, from, to: new THREE.Vector3(x, 0.05, z), delay: rnd(0, 0.35) });
  }
  scene.add(group);
  return TW.tween(ms, (t, raw) => {
    for (const h of tiles) {
      const k = Math.max(0, Math.min(1, (raw - h.delay) / 0.4));
      h.tile.position.lerpVectors(h.from, h.to, TW.Ease.outCubic(k));
      const fade = raw > 0.75 ? 1 - (raw - 0.75) / 0.25 : 1;
      h.mat.opacity = 0.9 * Math.min(1, k * 2) * fade;
      h.fill.opacity = (k >= 1 ? 0.28 : 0.08) * fade;
    }
  }, TW.Ease.linear, () => {
    scene.remove(group);
    geo.dispose(); edge.dispose();
    for (const h of tiles) { h.mat.dispose(); h.fill.dispose(); }
  });
}

/* 虹 (DIVERSITY): 色相の違う光の筋が何色も駆け上がる */
function burstPrism(scene, laneX, color, ms) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.035, 1.1, 0.035);
  const streaks = [];
  for (let i = 0; i < 48; i++) {
    const c = new THREE.Color().setHSL(i / 48, 0.9, 0.62);
    const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(laneX + rnd(-0.8, 0.8), -0.6, laneZ());
    group.add(m);
    streaks.push({ m, mat, vy: rnd(5, 11), delay: rnd(0, 0.45) });
  }
  scene.add(group);
  return TW.tween(ms, (t, raw) => {
    for (const s of streaks) {
      if (raw < s.delay) continue;
      s.m.position.y += s.vy * 0.016;
      s.mat.opacity = 0.85 * (1 - raw);
    }
  }, TW.Ease.linear, () => {
    scene.remove(group);
    geo.dispose();
    for (const s of streaks) s.mat.dispose();
  });
}

/* きらめき (LUCK): 金色の星があちこちでまたたく */
function burstSparkle(scene, laneX, color, ms) {
  const gold = new THREE.Color(0xffb3da).lerp(color, 0.2);
  return spriteSwarm(scene, 60, () => ({
    color: gold, size: rnd(0.2, 0.5),
    pos: new THREE.Vector3(laneX + rnd(-1, 1), rnd(0.2, 2.8), laneZ()),
    at: rnd(0, 0.8), life: rnd(0.12, 0.25)
  }), (p, raw) => {
    const k = (raw - p.at) / p.life;
    p.sp.material.opacity = k < 0 || k > 1 ? 0 : bell(k);
    p.sp.material.rotation = raw * 3;
    const s = p.size * (0.6 + 0.4 * bell(k));
    p.sp.scale.set(s, s, 1);
  }, ms, starTexture());
}

export const PROTOCOL_BURSTS = {
  vortex: burstVortex, ash: burstAsh, miasma: burstMiasma, wisps: burstWisps, bloom: burstBloom,
  rain: burstRain, lightning: burstLightning, glitch: burstGlitch, clock: burstClock, hex: burstHex,
  prism: burstPrism, sparkle: burstSparkle
};
