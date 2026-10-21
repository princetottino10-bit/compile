/* =========================================================================
 * 終章「名前」の背景: 研究所の最上階・所長室 (story-world.js が呼ぶ。story-scenery-station.js と同じ形で返す)
 *   夜。暗い絨毯と、奥の壁一面の古い計算機 (これが所長)。冷たい青と琥珀の小さな灯が瞬く。
 *   m 計算機の棚 / M 所長の目 (大きな丸いレンズ) / H 空いた人の席 / Z 机 / d・b 扉 (開くと消える)
 *   壁の板「もう、止めていい」は、M の左の棚に掛ける (作中の掲示なので日本語でよい)
 *   buildDirector(scene, map, keep) → { update(t, dt), syncDoors(state) }
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import * as M from './story-map.js';

const T = 2;
const WALL_H = 3.8;
const LOW_H = 0.32;
const cell = (x, y, h = 0) => new THREE.Vector3((x + 0.5) * T, h, (y + 0.5) * T);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rnd = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* 床: 紺の絨毯。ほこりで所々白っぽい (14,208日、誰も歩いていない) */
const carpetTex = () => canvasTex(256, 256, (g, w, h) => {
  const r = rnd(11);
  g.fillStyle = '#1d2232'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1600; i++) { const v = 26 + Math.floor(r() * 18); g.fillStyle = 'rgb(' + v + ',' + (v + 4) + ',' + (v + 16) + ')'; g.fillRect(r() * w, r() * h, 2, 2); }
  for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(200,200,210,' + (0.03 + r() * 0.04) + ')'; g.beginPath(); g.arc(r() * w, r() * h, 10 + r() * 30, 0, Math.PI * 2); g.fill(); }
});
/* 壁: 濃い木の腰板と、くすんだ灰の上壁 */
const wallTex = () => canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#3a3c44'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#3b2a20'; g.fillRect(0, h * 0.6, w, h * 0.4);
  for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, h * 0.6, 2, h * 0.4); }
  g.fillStyle = '#7a6a4a'; g.fillRect(0, h * 0.6, w, 3);
});
/* 計算機の棚の前面: 細い溝と、灯の並ぶ帯 (灯そのものは別の小さな板で瞬かせる) */
const rackTex = () => canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#2b2f37'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#c9c2ae'; g.fillRect(6, 10, w - 12, h * 0.28);
  g.fillStyle = '#23262c'; for (let y = 20; y < h * 0.28; y += 10) g.fillRect(12, y, w - 24, 3);
  g.fillStyle = '#16181c'; g.fillRect(14, h * 0.36, 44, 44); g.fillRect(70, h * 0.36, 44, 44);   // テープのリール
  g.strokeStyle = '#6a6e76'; g.lineWidth = 3;
  for (const cx of [36, 92]) { g.beginPath(); g.arc(cx, h * 0.36 + 22, 17, 0, Math.PI * 2); g.stroke(); }
  for (let y = h * 0.6; y < h - 10; y += 14) { g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(8, y, w - 16, 2); }
});
const poolTex = () => canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});
const plaqueTex = () => canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = '#8a7a52'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#b8a674'; g.fillRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#2a2216'; g.font = 'bold 30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('もう、止めていい', w / 2, h / 2 + 2);
});

export function buildDirector(scene, map, keep) {
  const W = M.width(map), H = M.height(map);
  const updates = [];
  const std = (o) => keep(new THREE.MeshStandardMaterial(o));
  const basic = (o) => keep(new THREE.MeshBasicMaterial(o));
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat); m.position.set(x, y, z); scene.add(m); return m; };
  const flat = (w, d, mat, x, z, y = 0.012) => { const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), mat); m.rotation.set(-Math.PI / 2, 0, 0); m.position.set(x, y, z); scene.add(m); return m; };
  const floorOf = (x, y) => M.TILE[M.charAt(map, x, y)] === 'floor';
  const openOf = (x, y) => { const c = M.charAt(map, x, y); return floorOf(x, y) || 'mMHZdb'.includes(c); };
  const pTex = keep(poolTex());
  const pool = (x, z, w, d, color, opacity) => flat(w, d, basic({ map: pTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }), x, z, 0.014);

  /* 床 */
  const fTex = keep(carpetTex());
  fTex.wrapS = fTex.wrapT = THREE.RepeatWrapping;
  fTex.repeat.set(W, H);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(W * T, H * T)), std({ map: fTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W * T / 2, 0, H * T / 2);
  scene.add(floor);

  /* 壁: 奥の壁だけ高くし、ほかは低く切って中を見せる (駅・倉庫と同じ) */
  const tallGeo = keep(new THREE.BoxGeometry(T, WALL_H, T));
  const lowGeo = keep(new THREE.BoxGeometry(T, LOW_H, T));
  const topMat = std({ color: 0x3a3c46, roughness: 0.7, metalness: 0.2 });
  const sideMat = std({ color: 0x1c1d24, roughness: 0.85 });
  const faceMat = std({ map: keep(wallTex()), roughness: 0.7 });
  const faceGeo = keep(new THREE.PlaneGeometry(T, WALL_H));
  for (const w of M.find(map, '#')) {
    const n = openOf(w.x, w.y - 1), s = openOf(w.x, w.y + 1), e = floorOf(w.x + 1, w.y), wv = floorOf(w.x - 1, w.y);
    if (!n && !s && !e && !wv && !openOf(w.x + 1, w.y) && !openOf(w.x - 1, w.y)) continue;
    if (!(s && !n && !e && !wv)) {
      const low = new THREE.Mesh(lowGeo, topMat);
      low.position.copy(cell(w.x, w.y, LOW_H / 2));
      scene.add(low);
      continue;
    }
    const b = new THREE.Mesh(tallGeo, [sideMat, sideMat, topMat, topMat, sideMat, sideMat]);
    b.position.copy(cell(w.x, w.y, WALL_H / 2));
    scene.add(b);
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.copy(cell(w.x, w.y, WALL_H / 2)).add(new THREE.Vector3(0, 0, T / 2 + 0.01));
    scene.add(face);
  }

  /* 計算機の棚 (m と M): 天井までの筐体。前面に灯の小さな板を並べ、ばらばらの速さで瞬かせる */
  const rackMat = std({ map: keep(rackTex()), roughness: 0.5, metalness: 0.4 });
  const rackSide = std({ color: 0x23262c, roughness: 0.6, metalness: 0.5 });
  const lampGeo = keep(new THREE.PlaneGeometry(0.1, 0.06));
  const lampMats = [0x5fb8ff, 0xffb547, 0x5fb8ff, 0x8affc8].map(c => basic({ color: c, toneMapped: false, transparent: true }));
  const lamps = [];
  const r = rnd(23);
  for (const p of M.find(map, 'm').concat(M.find(map, 'M'))) {
    const c = cell(p.x, p.y);
    box(T * 0.96, WALL_H, T * 0.9, [rackSide, rackSide, rackSide, rackSide, rackMat, rackSide], c.x, WALL_H / 2, c.z);
    for (let i = 0; i < 10; i++) {
      const lamp = new THREE.Mesh(lampGeo, lampMats[Math.floor(r() * lampMats.length)]);
      lamp.position.set(c.x - 0.7 + (i % 5) * 0.35, 2.4 + Math.floor(i / 5) * 0.18 + (r() - 0.5) * 0.05, c.z + T * 0.45 + 0.01);
      scene.add(lamp);
      lamps.push({ lamp, sp: 0.6 + r() * 3, ph: r() * 6 });
    }
  }
  updates.push((t) => { for (const l of lamps) l.lamp.visible = Math.sin(t * l.sp + l.ph) > -0.2; });

  /* 所長の目 (M): 大きな丸いレンズ。ゆっくり明滅する琥珀の光。話すときに少し明るくするのは story-world 側でしない (背景は状態を持たない) */
  const eyeAt = M.find(map, 'M')[0];
  if (eyeAt) {
    const c = cell(eyeAt.x, eyeAt.y);
    const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(0.62, 0.09, 12, 40)), std({ color: 0x8b8f98, roughness: 0.3, metalness: 0.9 }));
    rim.position.set(c.x, 2.2, c.z + T * 0.46);
    scene.add(rim);
    const lens = new THREE.Mesh(keep(new THREE.CircleGeometry(0.58, 40)), basic({ color: 0xffc070, toneMapped: false }));
    lens.position.set(c.x, 2.2, c.z + T * 0.46 + 0.01);
    scene.add(lens);
    const l = new THREE.PointLight(0xffb060, 4, 9, 1.5);
    l.position.set(c.x, 2.2, c.z + 1.6);
    scene.add(l);
    pool(c.x, c.z + 2.2, 4.5, 4.5, 0xffb060, 0.16);
    updates.push((t) => { const k = 0.72 + 0.28 * Math.sin(t * 0.7); lens.material.color.setRGB(k, 0.75 * k, 0.44 * k); l.intensity = 3 + k * 1.5; });
  }

  /* 壁の板「もう、止めていい」: 目の左の棚に掛ける */
  const rackLeft = M.find(map, 'm').filter(p => eyeAt && p.x < eyeAt.x).pop();
  if (rackLeft) {
    const c = cell(rackLeft.x, rackLeft.y);
    const plaque = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.5, 0.56)), std({ map: keep(plaqueTex()), roughness: 0.4, metalness: 0.6 }));
    plaque.position.set(c.x, 1.55, c.z + T * 0.46 + 0.02);
    scene.add(plaque);
  }

  /* 机 (Z) と、空いた人の席 (H): 背の高い革の椅子。机の上にほこり */
  const wood = std({ color: 0x4a3222, roughness: 0.55, metalness: 0.05 });
  for (const p of M.find(map, 'Z')) {
    const c = cell(p.x, p.y);
    box(T, 0.1, T * 0.8, wood, c.x, 0.82, c.z);
    box(T, 0.78, 0.08, wood, c.x, 0.4, c.z + T * 0.36);
  }
  const leather = std({ color: 0x3a1c18, roughness: 0.45, metalness: 0.1 });
  for (const p of M.find(map, 'H')) {
    const c = cell(p.x, p.y);
    box(0.9, 0.14, 0.85, leather, c.x, 0.55, c.z);
    box(0.9, 1.3, 0.14, leather, c.x, 1.25, c.z - 0.38);
    box(0.08, 0.5, 0.08, std({ color: 0x2a2d33, metalness: 0.8, roughness: 0.4 }), c.x, 0.25, c.z);
    pool(c.x, c.z, 2.4, 2.4, 0xbfd4ff, 0.1);
  }

  /* 扉: 開いたら消える板 */
  const doors = [];
  for (const ch of ['d', 'b']) for (const p of M.find(map, ch)) {
    const c = cell(p.x, p.y);
    const leaf = box(0.16, 2.6, T * 0.96, std({ color: 0x5a4230, roughness: 0.5 }), c.x, 1.3, c.z);
    doors.push({ leaf, ch });
  }

  /* 明かり: 天井の灯は落ちていて、窓からの街の暗い青と、計算機の灯だけ */
  const moon = new THREE.DirectionalLight(0x8fa8d8, 0.7);
  moon.position.set(W * T * 0.2, 10, H * T * 1.4);
  moon.target.position.set(W * T * 0.6, 0, H * T * 0.4);
  scene.add(moon, moon.target);
  for (const [z, x0, x1] of [['A', 1, 6], ['B', 7, 16]]) {
    const l = new THREE.PointLight(z === 'B' ? 0x9fb8e0 : 0xc8d0e0, 2.2, 12, 1.4);
    l.position.set((x0 + x1) / 2 * T, 3.2, H * T / 2);
    scene.add(l);
  }
  scene.add(new THREE.HemisphereLight(0x6070a0, 0x14121a, 1.2));

  /* 空気中のほこり (計算機の灯に照らされる) */
  const DN = 70;
  const dGeo = keep(new THREE.BufferGeometry());
  const dArr = new Float32Array(DN * 3);
  const rr = rnd(31);
  for (let i = 0; i < DN; i++) { dArr[i * 3] = rr() * W * T; dArr[i * 3 + 1] = 0.3 + rr() * 3; dArr[i * 3 + 2] = (1 + rr() * (H - 2)) * T; }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dArr, 3));
  scene.add(new THREE.Points(dGeo, basic({ color: 0xc8d8ff, size: 0.03, transparent: true, opacity: 0.3, depthWrite: false })));
  updates.push((t, dt) => {
    for (let i = 0; i < DN; i++) { dArr[i * 3 + 1] += Math.sin(t * 0.4 + i) * dt * 0.04; }
    dGeo.attributes.position.needsUpdate = true;
  });

  return {
    update: (t, dt) => { for (const u of updates) u(t, dt); },
    syncDoors: (state) => { for (const d of doors) d.leaf.visible = !M.isOpen(map, state, d.ch); }
  };
}
