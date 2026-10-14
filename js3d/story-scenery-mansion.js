/* =========================================================================
 * 2章「三時」の背景: 人のいなくなった屋敷 (story-world.js が呼ぶ。story-scenery-aquarium.js と同じ形で返す)
 *   掃除だけが行き届いている。床は磨いた木、壁は深い赤の壁紙。明かりは壁の燭台の暖色と、窓から差す午後の光だけ。
 *   G 柱時計 (針は三時で止まり、振り子は動かない) / Z 食卓 (椅子はひとつだけ) / 階段の上の廊下の奥が寝室
 *   buildMansion(scene, map, keep) → { update(t, dt), syncDoors(state) }
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import * as M from './story-map.js';

const T = 2;
const WALL_H = 3.6;
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

/* 床: 磨いた木の板。板ごとに少し色を変える */
const floorTex = () => canvasTex(256, 256, (g, w, h) => {
  const r = rnd(9);
  for (let i = 0; i < 4; i++) {
    const v = 52 + Math.floor(r() * 14);
    g.fillStyle = 'rgb(' + v + ',' + Math.floor(v * 0.55) + ',' + Math.floor(v * 0.32) + ')';
    g.fillRect(0, i * h / 4, w, h / 4);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, (i + 1) * h / 4 - 2, w, 2);
    g.fillRect(Math.floor(r() * w), i * h / 4, 2, h / 4);
  }
  for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(255,220,180,' + (r() * 0.04) + ')'; g.fillRect(r() * w, r() * h, 6 + r() * 20, 1); }
});
/* 壁: 深い赤の壁紙と、下の腰板 */
const wallTex = () => canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#3a1016'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,190,150,.06)';
  for (let y = 10; y < h * 0.7; y += 26) for (let x = (y / 26) % 2 ? 10 : 34; x < w; x += 48) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#24140c'; g.fillRect(0, h * 0.72, w, h * 0.28);
  g.fillStyle = '#5a3a20'; g.fillRect(0, h * 0.72, w, 4);
});
/* 光だまり (床に落ちる燭台と窓の光) */
const poolTex = () => canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});
/* 柱時計の文字盤: 針は三時 */
const dialTex = () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#efe4c8'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3a2a18'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#3a2a18';
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 2, 4, 4); }
  g.lineCap = 'round';
  g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(96, 64); g.stroke();    // 短い針: 3
  g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 18); g.stroke();    // 長い針: 0分
});

function bounds(map, ch) {
  const ps = M.find(map, ch);
  if (!ps.length) return null;
  const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs) + 1, y0: Math.min(...ys), y1: Math.max(...ys) + 1 };
}

export function buildMansion(scene, map, keep) {
  const W = M.width(map), H = M.height(map);
  const updates = [];
  const std = (o) => keep(new THREE.MeshStandardMaterial(o));
  const basic = (o) => keep(new THREE.MeshBasicMaterial(o));
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat); m.position.set(x, y, z); scene.add(m); return m; };
  const flat = (w, d, mat, x, z, y = 0.012) => { const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), mat); m.rotation.set(-Math.PI / 2, 0, 0); m.position.set(x, y, z); scene.add(m); return m; };
  const floorOf = (x, y) => M.TILE[M.charAt(map, x, y)] === 'floor';
  const openOf = (x, y) => { const c = M.charAt(map, x, y); return floorOf(x, y) || 'GZb'.includes(c); };
  const pTex = keep(poolTex());
  const pool = (x, z, w, d, color, opacity) => flat(w, d, basic({ map: pTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }), x, z, 0.014);

  /* 床 */
  const fTex = keep(floorTex());
  fTex.wrapS = fTex.wrapT = THREE.RepeatWrapping;
  fTex.repeat.set(W, H);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(W * T, H * T)), std({ map: fTex, roughness: 0.35, metalness: 0.05, envMapIntensity: 0.4 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W * T / 2, 0, H * T / 2);
  scene.add(floor);

  /* 壁: 水族館と同じく、部屋の奥の壁だけ高くし、ほかは低く切って中を見せる */
  const tallGeo = keep(new THREE.BoxGeometry(T, WALL_H, T));
  const lowGeo = keep(new THREE.BoxGeometry(T, LOW_H, T));
  const topMat = std({ color: 0x4a2a1c, roughness: 0.7 });
  const sideMat = std({ color: 0x2a1410, roughness: 0.85 });
  const faceMat = std({ map: keep(wallTex()), roughness: 0.85 });
  const faceGeo = keep(new THREE.PlaneGeometry(T, WALL_H));
  const backWalls = [];
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
    backWalls.push(w);
  }

  /* 窓: 奥の壁に、いくつかおきに。午後の光が床へ斜めに落ちる */
  const winMat = basic({ color: 0xffd9a0, toneMapped: false });
  const frameMat = std({ color: 0x2a1a10, roughness: 0.6 });
  backWalls.forEach((w, i) => {
    if (i % 4 !== 1) return;
    const c = cell(w.x, w.y, 0);
    const z = c.z + T / 2 + 0.03;
    box(0.9, 1.3, 0.02, winMat, c.x, 2.0, z);
    box(0.08, 1.3, 0.04, frameMat, c.x, 2.0, z + 0.01);
    box(0.9, 0.08, 0.04, frameMat, c.x, 2.0, z + 0.01);
    pool(c.x + 0.6, z + 1.6, 1.6, 2.6, 0xffc070, 0.22);
  });

  /* 柱時計: 背の高い木の箱、文字盤 (三時)、止まった振り子 */
  const clockB = bounds(map, 'G');
  if (clockB) {
    const cx = (clockB.x0 + clockB.x1) / 2 * T, cz = (clockB.y0 + clockB.y1) / 2 * T;
    const wood = std({ color: 0x3b2414, roughness: 0.45, metalness: 0.1 });
    box(0.9, 2.6, 0.6, wood, cx, 1.3, cz);
    box(1.05, 0.25, 0.7, wood, cx, 2.72, cz);
    const dial = new THREE.Mesh(keep(new THREE.CircleGeometry(0.34, 32)), basic({ map: keep(dialTex()), toneMapped: false }));
    dial.position.set(cx, 2.2, cz + 0.31);
    scene.add(dial);
    const glass = box(0.5, 1.1, 0.02, std({ color: 0xffe2b0, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.6 }), cx, 1.1, cz + 0.31);
    glass.renderOrder = 1;
    const brass = std({ color: 0xc9a25a, roughness: 0.25, metalness: 0.9 });
    box(0.02, 0.8, 0.02, brass, cx, 1.25, cz + 0.28);                 // 振り子の棒 (まっすぐ下がったまま)
    const bob = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 20)), brass);
    bob.rotation.x = Math.PI / 2;
    bob.position.set(cx, 0.85, cz + 0.28);
    scene.add(bob);
    const l = new THREE.PointLight(0xffc878, 2.2, 5, 1.6);
    l.position.set(cx, 2.4, cz + 1.0);
    scene.add(l);
    pool(cx, cz + 1.4, 3, 2.4, 0xffc878, 0.18);
    /* 鐘: ときどき文字盤がかすかに明るくなる (三時の鐘の名残) */
    updates.push((t) => { dial.material.color.setScalar(0.85 + 0.15 * Math.max(0, Math.sin(t * 0.6)) ** 8); });
  }

  /* 食卓: 白は入れず、深い赤のクロス。椅子はひとつだけ */
  const tableB = bounds(map, 'Z');
  if (tableB) {
    const x0 = tableB.x0 * T, x1 = tableB.x1 * T, z0 = tableB.y0 * T, z1 = tableB.y1 * T;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    box(x1 - x0 - 0.3, 0.08, z1 - z0 - 0.3, std({ color: 0x5a1420, roughness: 0.8 }), cx, 0.82, cz);
    const leg = std({ color: 0x2a180c, roughness: 0.5 });
    for (const [lx, lz] of [[x0 + 0.4, z0 + 0.4], [x1 - 0.4, z0 + 0.4], [x0 + 0.4, z1 - 0.4], [x1 - 0.4, z1 - 0.4]]) box(0.1, 0.8, 0.1, leg, lx, 0.4, lz);
    box(0.6, 0.06, 0.6, leg, cx, 0.5, z1 + 0.15);
    box(0.6, 0.8, 0.06, leg, cx, 0.9, z1 + 0.45);
    box(0.06, 0.25, 0.06, std({ color: 0xe8d8b0, roughness: 0.7 }), cx, 1.0, cz);
    const flame = box(0.04, 0.07, 0.04, basic({ color: 0xffb860, toneMapped: false }), cx, 1.17, cz);
    const l = new THREE.PointLight(0xffa850, 2.4, 6, 1.6);
    l.position.set(cx, 1.6, cz);
    scene.add(l);
    pool(cx, cz, 5, 4, 0xffa850, 0.16);
    updates.push((t) => { const k = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 3.7); l.intensity = 2.4 * k; flame.scale.y = k; });
  }

  /* 調べられる物 (地図の looks): 小さな飾り台と、うっすら光る紙 */
  for (const l of map.looks || []) {
    const m = M.find(map, l.at)[0];
    if (!m) continue;
    if ([[0, -1], [1, 0], [-1, 0], [0, 1]].some(([dx, dy]) => M.charAt(map, m.x + dx, m.y + dy) === 'G')) continue;   // 柱時計そのものを調べる (台は置かない)
    const c = cell(m.x, m.y);
    const wood = std({ color: 0x3b2414, roughness: 0.5 });
    box(0.5, 0.8, 0.4, wood, c.x, 0.4, c.z - 0.6);
    box(0.36, 0.02, 0.26, basic({ color: 0xe8dcc0, toneMapped: false }), c.x, 0.82, c.z - 0.6);
  }

  /* 扉 (地図の opens): 閉じているあいだは木の扉と赤い灯。開いたら扉を消して、灯は緑 */
  const doors = [];
  for (const ch of Object.keys(map.opens || {})) {
    const cells = M.find(map, ch);
    if (!cells.length) continue;
    const xs = cells.map(c => c.x), ys = cells.map(c => c.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
    const vertical = (y1 - y0) >= (x1 - x0);
    const leaf = box(vertical ? 0.2 : (x1 - x0) * T, 2.6, vertical ? (y1 - y0) * T : 0.2, std({ color: 0x4a2a16, roughness: 0.5 }), (x0 + x1) / 2 * T, 1.3, (y0 + y1) / 2 * T);
    const lamp = box(0.14, 0.14, 0.14, basic({ color: 0xff3b3b, toneMapped: false }), (x0 + x1) / 2 * T + (vertical ? -0.2 : 0), 2.9, (y0 + y1) / 2 * T);
    doors.push({ ch, leaf, lamp });
  }

  /* 部屋ごとの燭台の明かり (暖色)。寝室だけは灯さない */
  for (const r of map.rects || []) {
    if (r.z === 'R') continue;
    const cx = (r.x0 + r.x1 + 1) / 2 * T, cz = (r.y0 + r.y1 + 1) / 2 * T;
    const l = new THREE.PointLight(0xffb070, 4.5, 12, 1.3);
    l.position.set(cx, 2.8, cz);
    scene.add(l);
    pool(cx, cz, 6, 5, 0xffb070, 0.12);
  }
  /* 全体の、ごく弱い暖色 (真っ暗にならないように) */
  scene.add(new THREE.HemisphereLight(0xb08860, 0x2a1810, 1.8));

  /* 窓の光の中を漂うほこり */
  const DN = 120;
  const dGeo = keep(new THREE.BufferGeometry());
  const dArr = new Float32Array(DN * 3);
  const r = rnd(5);
  for (let i = 0; i < DN; i++) { dArr[i * 3] = r() * W * T; dArr[i * 3 + 1] = 0.3 + r() * 3; dArr[i * 3 + 2] = (1 + r() * (H - 2)) * T; }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dArr, 3));
  scene.add(new THREE.Points(dGeo, basic({ color: 0xffd8a8, size: 0.035, transparent: true, opacity: 0.35, depthWrite: false })));
  updates.push((t, dt) => {
    for (let i = 0; i < DN; i++) { dArr[i * 3 + 1] += Math.sin(t * 0.5 + i) * dt * 0.05; }
    dGeo.attributes.position.needsUpdate = true;
  });

  return {
    update: (t, dt) => { for (const u of updates) u(t, dt); },
    syncDoors: (state) => { for (const d of doors) { const open = M.isOpen(map, state, d.ch); d.leaf.visible = !open; d.lamp.material.color.setHex(open ? 0x2bd96b : 0xff3b3b); } }
  };
}
