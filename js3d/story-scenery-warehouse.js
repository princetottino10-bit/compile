/* =========================================================================
 * 3章「順番」の背景: 港の救助機体の倉庫 (story-world.js が呼ぶ。story-scenery-mansion.js と同じ形で返す)
 *   コンクリートの床と波板の壁。明かりは天井の蛍光灯 (ときどき瞬く) と、待機所の回る橙の警告灯だけ。
 *   V 古い救助機体の棚 (目を閉じた機体が立ったまま並ぶ) / u 空いた棚 (3955 の場所) / O 本部の指令の盤 / B 修理の台
 *   buildWarehouse(scene, map, keep) → { update(t, dt), syncDoors(state) }
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

/* 床: すり減ったコンクリート。継ぎ目と、黄色い区画線のかすれ */
const floorTex = () => canvasTex(256, 256, (g, w, h) => {
  const r = rnd(13);
  g.fillStyle = '#3a3d42'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { const v = 40 + Math.floor(r() * 30); g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 4) + ',.5)'; g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, h - 2, w, 2); g.fillRect(w - 2, 0, 2, h);
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,' + (0.08 + r() * 0.1) + ')'; g.beginPath(); g.arc(r() * w, r() * h, 10 + r() * 30, 0, Math.PI * 2); g.fill(); }
});
/* 壁: 灰青の波板と、下の黄黒の帯 */
const wallTex = () => canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#2c3440'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x, 0, 6, h * 0.8); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 10, 0, 4, h * 0.8); }
  for (let x = -h; x < w; x += 24) { g.fillStyle = '#c99a20'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 12, h); g.lineTo(x + 12 + h * 0.2, h * 0.8); g.lineTo(x + h * 0.2, h * 0.8); g.fill(); }
  g.fillStyle = '#15181d'; g.fillRect(0, h * 0.8 - 3, w, 3);
});
const poolTex = () => canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});

export function buildWarehouse(scene, map, keep) {
  const W = M.width(map), H = M.height(map);
  const updates = [];
  const std = (o) => keep(new THREE.MeshStandardMaterial(o));
  const basic = (o) => keep(new THREE.MeshBasicMaterial(o));
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat); m.position.set(x, y, z); scene.add(m); return m; };
  const flat = (w, d, mat, x, z, y = 0.012) => { const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), mat); m.rotation.set(-Math.PI / 2, 0, 0); m.position.set(x, y, z); scene.add(m); return m; };
  const floorOf = (x, y) => M.TILE[M.charAt(map, x, y)] === 'floor';
  const openOf = (x, y) => { const c = M.charAt(map, x, y); return floorOf(x, y) || 'VuOB'.includes(c); };
  const pTex = keep(poolTex());
  const pool = (x, z, w, d, color, opacity) => flat(w, d, basic({ map: pTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }), x, z, 0.014);

  /* 床 */
  const fTex = keep(floorTex());
  fTex.wrapS = fTex.wrapT = THREE.RepeatWrapping;
  fTex.repeat.set(W, H);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(W * T, H * T)), std({ map: fTex, roughness: 0.9, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W * T / 2, 0, H * T / 2);
  scene.add(floor);

  /* 壁: 屋敷と同じく、部屋の奥の壁だけ高くし、ほかは低く切って中を見せる */
  const tallGeo = keep(new THREE.BoxGeometry(T, WALL_H, T));
  const lowGeo = keep(new THREE.BoxGeometry(T, LOW_H, T));
  const topMat = std({ color: 0x3a4250, roughness: 0.7, metalness: 0.3 });
  const sideMat = std({ color: 0x1c2129, roughness: 0.85 });
  const faceMat = std({ map: keep(wallTex()), roughness: 0.7, metalness: 0.25 });
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

  /* 入口のシャッター (カメラの手前なので板は立てない): 外の朝の光だけが床へ差す */
  const shutterCells = M.find(map, '.').filter(p => p.y === H - 2);
  if (shutterCells.length) {
    const xs = shutterCells.map(p => p.x);
    const x0 = Math.min(...xs) * T, x1 = (Math.max(...xs) + 1) * T, z = (H - 1) * T;
    pool((x0 + x1) / 2, z - 1.2, x1 - x0, 3.2, 0xbcd6ff, 0.22);
  }

  /* 古い救助機体の棚: 鉄の枠と、立ったまま目を閉じた機体 (丸い頭、肩に色あせた橙の帯)。空いた棚は枠だけ */
  const frame = std({ color: 0x4a5260, roughness: 0.5, metalness: 0.7 });
  const shell = std({ color: 0x8c8f94, roughness: 0.6, metalness: 0.3 });
  const band = std({ color: 0xa0582a, roughness: 0.7 });
  const visor = std({ color: 0x15181d, roughness: 0.3, metalness: 0.4 });
  const unitBody = keep(new THREE.CylinderGeometry(0.32, 0.36, 1.3, 14));
  const unitHead = keep(new THREE.SphereGeometry(0.26, 14, 10));
  for (const ch of ['V', 'u']) {
    for (const p of M.find(map, ch)) {
      const c = cell(p.x, p.y);
      box(0.08, 2.6, 0.08, frame, c.x - T / 2 + 0.1, 1.3, c.z - 0.6);
      box(0.08, 2.6, 0.08, frame, c.x - T / 2 + 0.1, 1.3, c.z + 0.6);
      box(T, 0.08, 1.3, frame, c.x, 2.6, c.z);
      box(T, 0.06, 1.3, frame, c.x, 0.05, c.z);
      if (ch === 'u') { pool(c.x, c.z, 1.2, 1.2, 0x6ff0ff, 0.06); continue; }
      const b = new THREE.Mesh(unitBody, shell); b.position.set(c.x, 0.8, c.z); scene.add(b);
      const sb = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.37, 0.37, 0.12, 14)), band); sb.position.set(c.x, 1.25, c.z); scene.add(sb);
      const h = new THREE.Mesh(unitHead, shell); h.position.set(c.x, 1.72, c.z); scene.add(h);
      box(0.32, 0.07, 0.05, visor, c.x, 1.75, c.z + 0.24);
    }
  }

  /* 本部の指令の盤: 机と、斜めの画面 (橙の文字の光)、上に赤い回転灯 */
  for (const p of M.find(map, 'O')) {
    const c = cell(p.x, p.y);
    box(1.6, 0.9, 0.9, std({ color: 0x2a2f38, roughness: 0.5, metalness: 0.6 }), c.x, 0.45, c.z);
    const scr = box(1.2, 0.6, 0.04, basic({ color: 0xff8a3c, toneMapped: false }), c.x, 1.25, c.z + 0.1);
    scr.rotation.x = -0.35;
    const l = new THREE.PointLight(0xff8a3c, 2.5, 6, 1.6);
    l.position.set(c.x, 1.6, c.z + 1.0);
    scene.add(l);
    pool(c.x, c.z + 1.4, 2.6, 2.2, 0xff8a3c, 0.16);
    const beacon = box(0.18, 0.18, 0.18, basic({ color: 0xff3b3b, toneMapped: false }), c.x + 0.6, 1.0, c.z - 0.3);
    updates.push((t) => { const k = 0.6 + 0.4 * Math.sin(t * 1.3); scr.material.color.setRGB(k, 0.54 * k, 0.24 * k); beacon.material.color.setRGB(0.5 + 0.5 * Math.abs(Math.sin(t * 2.4)), 0.12, 0.12); });
  }

  /* 修理の台: 鉄の台と、上から下がる作業灯 */
  const bench = (() => { const ps = M.find(map, 'B'); if (!ps.length) return null; const xs = ps.map(p => p.x), ys = ps.map(p => p.y); return { x0: Math.min(...xs), x1: Math.max(...xs) + 1, y0: Math.min(...ys), y1: Math.max(...ys) + 1 }; })();
  if (bench) {
    const x0 = bench.x0 * T, x1 = bench.x1 * T, z0 = bench.y0 * T, z1 = bench.y1 * T;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    box(x1 - x0 - 0.4, 0.1, z1 - z0 - 0.3, std({ color: 0x8a9098, roughness: 0.35, metalness: 0.8 }), cx, 0.9, cz);
    for (const [lx, lz] of [[x0 + 0.4, z0 + 0.4], [x1 - 0.4, z0 + 0.4], [x0 + 0.4, z1 - 0.4], [x1 - 0.4, z1 - 0.4]]) box(0.1, 0.9, 0.1, frame, lx, 0.45, lz);
    box(0.5, 0.12, 0.3, basic({ color: 0xfff2d8, toneMapped: false }), cx, 2.8, cz);
    const l = new THREE.PointLight(0xfff0d0, 3.5, 7, 1.5);
    l.position.set(cx, 2.6, cz);
    scene.add(l);
    pool(cx, cz, 5, 3.6, 0xfff0d0, 0.18);
  }

  /* 調べられる物 (地図の looks): 小さな鉄の台と、うっすら光る紙 */
  for (const lk of map.looks || []) {
    const m = M.find(map, lk.at)[0];
    if (!m) continue;
    if ([[0, -1], [1, 0], [-1, 0], [0, 1]].some(([dx, dy]) => M.charAt(map, m.x + dx, m.y + dy) === 'B')) continue;   // 修理の台そのものを調べる
    const c = cell(m.x, m.y);
    box(0.5, 0.8, 0.4, frame, c.x, 0.4, c.z - 0.6);
    box(0.36, 0.02, 0.26, basic({ color: 0xe8e0c8, toneMapped: false }), c.x, 0.82, c.z - 0.6);
  }

  /* 天井の蛍光灯: 区画ごとに冷たい白。ときどき1本が瞬く */
  const lamps = [];
  for (const r of map.rects || []) {
    const cx = (r.x0 + r.x1 + 1) / 2 * T, cz = (r.y0 + r.y1 + 1) / 2 * T;
    const l = new THREE.PointLight(0xd8e6ff, 4, 13, 1.3);
    l.position.set(cx, 3.2, cz);
    scene.add(l);
    lamps.push(l);
    pool(cx, cz, 7, 5, 0xd8e6ff, 0.09);
  }
  if (lamps.length) updates.push((t) => { const l = lamps[1 % lamps.length]; l.intensity = Math.sin(t * 0.7) > 0.93 ? (Math.sin(t * 40) > 0 ? 4 : 0.6) : 4; });

  /* 待機所の橙の警告灯: 出動を待つ灯。ゆっくり回る */
  const yAt = M.find(map, 'Y')[0];
  if (yAt) {
    const c = cell(yAt.x, yAt.y);
    const warn = new THREE.SpotLight(0xff9a3c, 6, 10, 0.5, 0.6, 1.4);
    warn.position.set(c.x, 3.4, c.z - 1.6);
    scene.add(warn, warn.target);
    box(0.24, 0.2, 0.24, basic({ color: 0xff9a3c, toneMapped: false }), c.x, 3.4, c.z - 1.6);
    updates.push((t) => { warn.target.position.set(c.x + Math.cos(t * 1.6) * 3, 0, c.z - 1.6 + Math.sin(t * 1.6) * 3); });
  }
  scene.add(new THREE.HemisphereLight(0x8aa0c0, 0x1a1c22, 1.6));

  /* 光の中を漂うほこり */
  const DN = 110;
  const dGeo = keep(new THREE.BufferGeometry());
  const dArr = new Float32Array(DN * 3);
  const r = rnd(7);
  for (let i = 0; i < DN; i++) { dArr[i * 3] = r() * W * T; dArr[i * 3 + 1] = 0.3 + r() * 3; dArr[i * 3 + 2] = (1 + r() * (H - 2)) * T; }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dArr, 3));
  scene.add(new THREE.Points(dGeo, basic({ color: 0xd8e6ff, size: 0.035, transparent: true, opacity: 0.3, depthWrite: false })));
  updates.push((t, dt) => {
    for (let i = 0; i < DN; i++) { dArr[i * 3 + 1] += Math.sin(t * 0.5 + i) * dt * 0.05; }
    dGeo.attributes.position.needsUpdate = true;
  });

  return {
    update: (t, dt) => { for (const u of updates) u(t, dt); },
    syncDoors: () => {}
  };
}
