/* =========================================================================
 * 4章「終点」の背景: 中央駅 (story-world.js が呼ぶ。story-scenery-warehouse.js と同じ形で返す)
 *   タイルの床と、夕方の西日。北は線路 (外行きのホーム)、南はコンコース。
 *   = 線路 / Q 最終便を待つ機体の列 (目を閉じて立ったまま並ぶ) / D 発車標 (「遅延」が瞬く) / P 駅の管理機体「聖域」(白い柱と光の輪)
 *   L ベンチ / X 改札 / k 改札の窓口 / g 改札の通り道 (改札を越えると扉が開く)
 *   buildStation(scene, map, keep) → { update(t, dt), syncDoors(state) }
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

/* 床: 薄い灰の四角いタイル。ところどころ欠けて黒ずむ */
const floorTex = () => canvasTex(256, 256, (g, w, h) => {
  const r = rnd(29);
  g.fillStyle = '#5a5c63'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) {
    const v = 84 + Math.floor(r() * 14);
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + (v + 6) + ')'; g.fillRect(x + 2, y + 2, 60, 60);
  }
  for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(0,0,0,' + (0.06 + r() * 0.12) + ')'; g.beginPath(); g.arc(r() * w, r() * h, 6 + r() * 24, 0, Math.PI * 2); g.fill(); }
});
/* 壁: 白いタイルと、腰の高さの紺の帯 */
const wallTex = () => canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#b9bcc4'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(x, y, 30, 1); g.fillRect(x, y, 1, 15); }
  g.fillStyle = '#26305a'; g.fillRect(0, h * 0.62, w, 10);
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h * 0.8, w, h * 0.2);
});
/* 線路: 砂利と枕木 */
const trackTex = () => canvasTex(128, 128, (g, w, h) => {
  const r = rnd(5);
  g.fillStyle = '#2b2a2c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) { const v = 40 + Math.floor(r() * 50); g.fillStyle = 'rgb(' + v + ',' + (v - 4) + ',' + (v - 8) + ')'; g.fillRect(r() * w, r() * h, 2, 2); }
  for (let x = 4; x < w; x += 32) { g.fillStyle = '#3d3229'; g.fillRect(x, 8, 14, h - 16); }
});
const poolTex = () => canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});
/* 発車標の文字 (作中の掲示なので日本語でよい) */
const boardTex = (on) => canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h);
  g.font = 'bold 30px sans-serif'; g.textBaseline = 'middle';
  g.fillStyle = '#ffb547'; g.fillText('外行き　最終便', 14, 30);
  g.fillStyle = on ? '#ff4a3c' : '#4a1410'; g.fillText('遅延', 14, 70);
  g.fillStyle = '#7fd3ff'; g.font = '22px sans-serif'; g.fillText('14207日', 120, 70);
});

export function buildStation(scene, map, keep) {
  const W = M.width(map), H = M.height(map);
  const updates = [];
  const std = (o) => keep(new THREE.MeshStandardMaterial(o));
  const basic = (o) => keep(new THREE.MeshBasicMaterial(o));
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat); m.position.set(x, y, z); scene.add(m); return m; };
  const flat = (w, d, mat, x, z, y = 0.012) => { const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), mat); m.rotation.set(-Math.PI / 2, 0, 0); m.position.set(x, y, z); scene.add(m); return m; };
  const floorOf = (x, y) => M.TILE[M.charAt(map, x, y)] === 'floor';
  const openOf = (x, y) => { const c = M.charAt(map, x, y); return floorOf(x, y) || 'QDPLXkg='.includes(c); };
  const pTex = keep(poolTex());
  const pool = (x, z, w, d, color, opacity) => flat(w, d, basic({ map: pTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }), x, z, 0.014);

  /* 床 */
  const fTex = keep(floorTex());
  fTex.wrapS = fTex.wrapT = THREE.RepeatWrapping;
  fTex.repeat.set(W, H);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(W * T, H * T)), std({ map: fTex, roughness: 0.75, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W * T / 2, 0, H * T / 2);
  scene.add(floor);

  /* 壁: 奥の壁だけ高くし、ほかは低く切って中を見せる (倉庫と同じ) */
  const tallGeo = keep(new THREE.BoxGeometry(T, WALL_H, T));
  const lowGeo = keep(new THREE.BoxGeometry(T, LOW_H, T));
  const topMat = std({ color: 0x4a4e5a, roughness: 0.7, metalness: 0.2 });
  const sideMat = std({ color: 0x24262e, roughness: 0.85 });
  const faceMat = std({ map: keep(wallTex()), roughness: 0.6, metalness: 0.1 });
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

  /* 線路: ホームより一段低い砂利と、2本のレール。ホームの縁に黄色い点字の帯 */
  const tr = M.find(map, '=');
  if (tr.length) {
    const xs = tr.map(p => p.x), ys = tr.map(p => p.y);
    const x0 = Math.min(...xs) * T, x1 = (Math.max(...xs) + 1) * T, z0 = Math.min(...ys) * T, z1 = (Math.max(...ys) + 1) * T;
    const tt = keep(trackTex());
    tt.wrapS = tt.wrapT = THREE.RepeatWrapping;
    tt.repeat.set((x1 - x0) / 2, 1);
    const bed = flat(x1 - x0, z1 - z0, std({ map: tt, roughness: 0.95 }), (x0 + x1) / 2, (z0 + z1) / 2, -0.5);
    bed.receiveShadow = false;
    box(x1 - x0, 0.5, 0.1, sideMat, (x0 + x1) / 2, -0.25, z1 - 0.05);           // ホームの縁の壁
    flat(x1 - x0, z1 - z0, basic({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }), (x0 + x1) / 2, (z0 + z1) / 2, -0.49);
    const rail = std({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.9 });
    for (const dz of [-0.75, 0.75]) box(x1 - x0, 0.12, 0.1, rail, (x0 + x1) / 2, -0.42, (z0 + z1) / 2 + dz);
    flat(x1 - x0, 0.36, std({ color: 0xd8b02a, roughness: 0.6 }), (x0 + x1) / 2, z1 + 0.3, 0.013);
  }

  /* 待つ機体の列: 細い人型。目を閉じて、線路の方を向いて立っている (39年、同じ姿勢) */
  const shell = std({ color: 0xa9adb5, roughness: 0.55, metalness: 0.35 });
  const coat = std({ color: 0x3c4152, roughness: 0.8 });
  const visor = std({ color: 0x15181d, roughness: 0.3, metalness: 0.4 });
  const bodyGeo = keep(new THREE.CylinderGeometry(0.2, 0.26, 1.15, 12));
  const headGeo = keep(new THREE.SphereGeometry(0.2, 12, 10));
  const r = rnd(41);
  for (const p of M.find(map, 'Q')) {
    const c = cell(p.x, p.y);
    for (let i = 0; i < 2; i++) {
      const x = c.x + (i ? 0.45 : -0.45) + (r() - 0.5) * 0.15, z = c.z + (r() - 0.5) * 0.3;
      const b = new THREE.Mesh(bodyGeo, coat); b.position.set(x, 0.7, z); scene.add(b);
      const h = new THREE.Mesh(headGeo, shell); h.position.set(x, 1.45, z); scene.add(h);
      box(0.24, 0.05, 0.04, visor, x, 1.47, z - 0.18);
    }
  }

  /* 発車標: 柱と黒い板。「遅延」の字がゆっくり瞬く */
  const boardOn = keep(boardTex(true)), boardOff = keep(boardTex(false));
  for (const p of M.find(map, 'D')) {
    const c = cell(p.x, p.y);
    const pole = std({ color: 0x30343c, roughness: 0.5, metalness: 0.7 });
    box(0.12, 2.6, 0.12, pole, c.x, 1.3, c.z);
    box(2.2, 0.86, 0.16, pole, c.x, 2.9, c.z);
    const face = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.0, 0.75)), basic({ map: boardOn, toneMapped: false }));
    face.position.set(c.x, 2.9, c.z + 0.09);
    scene.add(face);
    const l = new THREE.PointLight(0xffb547, 1.6, 5, 1.6);
    l.position.set(c.x, 2.6, c.z + 0.8);
    scene.add(l);
    updates.push((t) => { const on = Math.sin(t * 1.4) > -0.3; const m = on ? boardOn : boardOff; if (face.material.map !== m) { face.material.map = m; face.material.needsUpdate = true; } });
  }

  /* 聖域: 白い細長い柱の体と、頭の上でゆっくり回る光の輪。足もとに冷たい光 (凍らせる機体) */
  for (const p of M.find(map, 'P')) {
    const c = cell(p.x, p.y);
    const white = std({ color: 0xe8eef6, roughness: 0.25, metalness: 0.3, emissive: 0x223044, emissiveIntensity: 0.4 });
    box(0.9, 0.2, 0.9, std({ color: 0x3a4458, roughness: 0.4, metalness: 0.7 }), c.x, 0.1, c.z);
    const col = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.28, 0.4, 2.3, 18)), white);
    col.position.set(c.x, 1.35, c.z);
    scene.add(col);
    const eye = box(0.4, 0.06, 0.05, basic({ color: 0x9fe8ff, toneMapped: false }), c.x, 2.2, c.z + 0.28);
    const halo = new THREE.Mesh(keep(new THREE.TorusGeometry(0.55, 0.035, 8, 40)), basic({ color: 0xcdf4ff, toneMapped: false }));
    halo.position.set(c.x, 2.85, c.z);
    halo.rotation.x = Math.PI / 2;
    scene.add(halo);
    const l = new THREE.PointLight(0xa8e6ff, 3, 6, 1.6);
    l.position.set(c.x, 2.4, c.z + 0.8);
    scene.add(l);
    pool(c.x, c.z + 0.6, 3.2, 3.2, 0x9fe8ff, 0.22);
    updates.push((t) => { halo.rotation.z = t * 0.6; halo.position.y = 2.85 + Math.sin(t * 1.5) * 0.05; const k = 0.75 + 0.25 * Math.sin(t * 2.2); eye.material.color.setRGB(0.62 * k, 0.91 * k, k); });
  }

  /* ベンチ: 木の座面と鉄の脚 */
  const wood = std({ color: 0x6b4a2e, roughness: 0.8 });
  const leg = std({ color: 0x2a2d33, roughness: 0.5, metalness: 0.7 });
  for (const p of M.find(map, 'L')) {
    const c = cell(p.x, p.y);
    box(T - 0.1, 0.1, 0.6, wood, c.x, 0.5, c.z);
    box(T - 0.1, 0.5, 0.08, wood, c.x, 0.85, c.z - 0.3);
    box(0.08, 0.5, 0.5, leg, c.x - 0.8, 0.25, c.z);
    box(0.08, 0.5, 0.5, leg, c.x + 0.8, 0.25, c.z);
  }

  /* 改札: 灰色の筐体と青い小さな画面。窓口 (k) は少し高く、画面が明るい。通り道 (g) は赤い扉が閉じている */
  const caseMat = std({ color: 0x8d939d, roughness: 0.4, metalness: 0.5 });
  const scrMat = basic({ color: 0x3d9bff, toneMapped: false });
  for (const p of M.find(map, 'X')) {
    const c = cell(p.x, p.y);
    box(T * 0.5, 1.0, T * 0.9, caseMat, c.x, 0.5, c.z);
    box(0.3, 0.04, 0.24, scrMat, c.x, 1.02, c.z + 0.2);
  }
  for (const p of M.find(map, 'k')) {
    const c = cell(p.x, p.y);
    box(T * 0.8, 1.3, T * 0.9, caseMat, c.x, 0.65, c.z);
    const scr = box(0.7, 0.4, 0.05, basic({ color: 0x7fd3ff, toneMapped: false }), c.x, 1.05, c.z + T * 0.46);
    const l = new THREE.PointLight(0x7fd3ff, 1.6, 4, 1.6);
    l.position.set(c.x, 1.2, c.z + 1.0);
    scene.add(l);
    updates.push((t) => { const k = 0.7 + 0.3 * Math.sin(t * 3); scr.material.color.setRGB(0.5 * k, 0.83 * k, k); });
  }
  const flaps = [];
  for (const p of M.find(map, 'g')) {
    const c = cell(p.x, p.y);
    const leaf = box(T * 0.9, 0.7, 0.06, std({ color: 0xc8352c, roughness: 0.5 }), c.x, 0.6, c.z);
    flaps.push(leaf);
  }

  /* 西日: ホームの上は橙、コンコースは天井の白い灯 */
  const sunset = new THREE.DirectionalLight(0xffb070, 1.1);
  sunset.position.set(W * T * 0.9, 8, -2);
  sunset.target.position.set(W * T * 0.4, 0, H * T * 0.3);
  scene.add(sunset, sunset.target);
  for (const rc of map.rects || []) {
    if (rc.z === 'B' || rc.z === 'A') continue;
    const cx = (rc.x0 + rc.x1 + 1) / 2 * T, cz = (rc.y0 + rc.y1 + 1) / 2 * T;
    const plat = rc.z === 'P';
    const l = new THREE.PointLight(plat ? 0xffc89a : 0xdde8ff, plat ? 3 : 3.5, 16, 1.3);
    l.position.set(cx, 3.4, cz);
    scene.add(l);
    pool(cx, cz, plat ? 12 : 8, 5, plat ? 0xffc89a : 0xdde8ff, 0.08);
  }
  scene.add(new THREE.HemisphereLight(0xb0a0c8, 0x1c1a22, 1.5));

  /* 西日の中を漂うほこり */
  const DN = 90;
  const dGeo = keep(new THREE.BufferGeometry());
  const dArr = new Float32Array(DN * 3);
  const rr = rnd(17);
  for (let i = 0; i < DN; i++) { dArr[i * 3] = rr() * W * T; dArr[i * 3 + 1] = 0.3 + rr() * 3; dArr[i * 3 + 2] = (1 + rr() * (H - 2)) * T; }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dArr, 3));
  scene.add(new THREE.Points(dGeo, basic({ color: 0xffd8b0, size: 0.035, transparent: true, opacity: 0.3, depthWrite: false })));
  updates.push((t, dt) => {
    for (let i = 0; i < DN; i++) { dArr[i * 3 + 1] += Math.sin(t * 0.5 + i) * dt * 0.05; }
    dGeo.attributes.position.needsUpdate = true;
  });

  return {
    update: (t, dt) => { for (const u of updates) u(t, dt); },
    syncDoors: (state) => { for (const f of flaps) f.visible = !M.isOpen(map, state, 'g'); }
  };
}
