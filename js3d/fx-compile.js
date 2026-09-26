/* =========================================================================
 * コンパイルの光 (見た目の報酬) ごとの「しるし」の演出
 *   光の柱・衝撃波は共通。その上に、色ごとに違う動きを重ねて見分けられるようにする。
 *   gold: 金貨が降る / cyan: 稲妻が落ちる / rainbow: 虹の輪が順に広がる
 *   lime: 泡が昇って弾ける / violet: 渦を巻いて昇る / ember: 火の粉が舞い上がる
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import * as TW from './tween.js';

const add = (color, opacity) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
});
const rand = (a, b) => a + Math.random() * (b - a);

/* 多数の小さな物を、それぞれの動き (step) で動かして消す共通の枠 */
function swarm(scene, n, make, step, ms) {
  const group = new THREE.Group();
  const items = Array.from({ length: n }, (_, i) => { const it = make(i); group.add(it.obj); return it; });
  scene.add(group);
  return TW.tween(ms, (t, raw) => { for (const it of items) step(it, raw); }, TW.Ease.linear, () => {
    scene.remove(group);
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  });
}

/* 金貨: 上から回りながら降り、床で跳ねて消える */
function gold(scene, x) {
  const geo = new THREE.CylinderGeometry(0.14, 0.14, 0.03, 20);
  return swarm(scene, 46, () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd35a, metalness: 0.6, roughness: 0.3, emissive: 0xc08a18, emissiveIntensity: 0.9, transparent: true });
    const obj = new THREE.Mesh(geo.clone(), mat);
    return { obj, x: x + rand(-1.4, 1.4), z: rand(-4.5, 4.5), y0: rand(4, 9), delay: rand(0, 0.45), spin: rand(6, 14) };
  }, (it, t) => {
    const k = Math.max(0, (t - it.delay) / (1 - it.delay));
    const fall = Math.min(1, k * 1.6);
    const y = it.y0 * (1 - fall * fall);
    const bounce = fall >= 1 ? Math.abs(Math.sin((k - 0.625) * 14)) * 0.3 * (1 - k) : 0;
    it.obj.position.set(it.x, Math.max(0.03, y) + bounce, it.z);
    it.obj.rotation.set(k * it.spin, k * it.spin * 0.7, 0);
    it.obj.visible = k > 0;
    it.obj.material.opacity = k > 0.8 ? (1 - k) / 0.2 : 1;
  }, 1900);
}

/* 稲妻: ぎざぎざの太い光が数回、空からラインへ落ちる (線は 1px しか描けないので、細い円柱をつないで作る) */
function cyan(scene, x) {
  const group = new THREE.Group();
  const up = new THREE.Vector3(0, 1, 0);
  const bolts = [];
  for (let b = 0; b < 5; b++) {
    const bolt = new THREE.Group();
    const core = add(0xeaffff, 0), halo = add(0x7ff3ff, 0);
    let p = new THREE.Vector3(x + rand(-0.6, 0.6), 9, rand(-3.5, 3.5));
    while (p.y > 0) {
      const q = new THREE.Vector3(p.x + rand(-0.45, 0.45), Math.max(0, p.y - rand(0.5, 0.9)), p.z + rand(-0.45, 0.45));
      const len = p.distanceTo(q), mid = p.clone().add(q).multiplyScalar(0.5);
      const dir = q.clone().sub(p).normalize();
      for (const [r, m] of [[0.035, core], [0.12, halo]]) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6, 1, true), m);
        seg.position.copy(mid);
        seg.quaternion.setFromUnitVectors(up, dir);
        bolt.add(seg);
      }
      p = q;
    }
    group.add(bolt);
    bolts.push({ core, halo, at: b * 0.16 + rand(0, 0.06) });
  }
  const glow = new THREE.PointLight(0x7ff3ff, 0, 12);
  glow.position.set(x, 2, 0);
  group.add(glow);
  scene.add(group);
  return TW.tween(1500, (t, raw) => {
    let flash = 0;
    for (const b of bolts) {
      const d = raw - b.at;
      const on = d > 0 && d < 0.14 ? (Math.random() > 0.25 ? 1 : 0.35) * (1 - d / 0.14) : 0;
      b.core.opacity = on; b.halo.opacity = on * 0.45;
      flash = Math.max(flash, on);
    }
    glow.intensity = flash * 30;
  }, TW.Ease.linear, () => {
    scene.remove(group);
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    bolts.forEach(b => { b.core.dispose(); b.halo.dispose(); });
  });
}

/* 虹の輪: 6 色の輪が少しずつずれて床から広がる */
function rainbow(scene, x) {
  const cols = [0xff5f7a, 0xffc05a, 0xfff36a, 0x7df28c, 0x5ab8ff, 0xb98cff];
  const geo = new THREE.RingGeometry(0.9, 1.0, 96);
  geo.rotateX(-Math.PI / 2);
  return swarm(scene, 12, (i) => {
    const obj = new THREE.Mesh(geo.clone(), add(cols[i % 6], 0));
    obj.position.set(x, 0.02 + i * 0.002, 0);
    return { obj, at: i * 0.06 };
  }, (it, t) => {
    const k = Math.max(0, (t - it.at) / 0.55);
    const s = 0.3 + 7 * (1 - Math.pow(1 - Math.min(1, k), 3));
    it.obj.scale.set(s, 1, s);
    it.obj.material.opacity = k > 0 && k < 1 ? 0.85 * (1 - k) : 0;
  }, 1700);
}

/* 泡: 丸い泡がラインから昇り、最後にふくらんで弾ける */
function lime(scene, x) {
  const geo = new THREE.SphereGeometry(1, 14, 10);
  return swarm(scene, 38, () => {
    const obj = new THREE.Mesh(geo.clone(), add(0xb6ff4a, 0));
    return { obj, x: x + rand(-1, 1), z: rand(-4.5, 4.5), r: rand(0.06, 0.2), sp: rand(2.5, 6), at: rand(0, 0.4), wob: rand(0, 6) };
  }, (it, t) => {
    const k = Math.max(0, (t - it.at) / (1 - it.at));
    const pop = k > 0.85 ? (k - 0.85) / 0.15 : 0;
    it.obj.position.set(it.x + Math.sin(k * 8 + it.wob) * 0.15, k * it.sp, it.z);
    it.obj.scale.setScalar(it.r * (1 + pop * 1.6));
    it.obj.material.opacity = k > 0 ? 0.55 * (1 - pop) : 0;
  }, 1800);
}

/* 渦: 光の粒がラインの中心へ回り込みながら昇る */
function violet(scene, x) {
  const geo = new THREE.SphereGeometry(0.085, 8, 6);
  return swarm(scene, 120, (i) => {
    const obj = new THREE.Mesh(geo.clone(), add(i % 3 ? 0xb07bff : 0xffffff, 0));
    return { obj, a0: rand(0, Math.PI * 2), r0: rand(1.5, 3.2), z: rand(-4, 4), at: rand(0, 0.3) };
  }, (it, t) => {
    const k = Math.max(0, (t - it.at) / (1 - it.at));
    const a = it.a0 + k * 9;
    const r = it.r0 * (1 - k * 0.85);
    it.obj.position.set(x + Math.cos(a) * r, 0.2 + k * 6, it.z * (1 - k * 0.5) + Math.sin(a) * r * 0.6);
    it.obj.material.opacity = k > 0 ? Math.sin(Math.PI * k) : 0;
  }, 1900);
}

/* 火の粉: 橙の粒がゆらぎながら舞い上がり、明滅して消える */
function ember(scene, x) {
  const geo = new THREE.SphereGeometry(0.075, 8, 6);
  return swarm(scene, 140, (i) => {
    const obj = new THREE.Mesh(geo.clone(), add(i % 4 ? 0xff7a2e : 0xffd27a, 0));
    return { obj, x: x + rand(-1.1, 1.1), z: rand(-4.8, 4.8), sp: rand(2, 6.5), at: rand(0, 0.5), ph: rand(0, 6), drift: rand(-0.8, 0.8) };
  }, (it, t) => {
    const k = Math.max(0, (t - it.at) / (1 - it.at));
    it.obj.position.set(it.x + Math.sin(k * 6 + it.ph) * 0.25 + it.drift * k, 0.1 + k * it.sp, it.z);
    const flicker = 0.6 + 0.4 * Math.sin(k * 40 + it.ph);
    it.obj.material.opacity = k > 0 ? (1 - k) * flicker : 0;
  }, 2000);
}

const SIGNS = { gold, cyan, rainbow, lime, violet, ember };

/** コンパイルの光のしるし。key は見た目の ccolor (default は何もしない) */
export function compileSignature(scene, laneX, key) {
  const f = SIGNS[key];
  return f ? f(scene, laneX) : Promise.resolve();
}
