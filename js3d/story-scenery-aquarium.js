/* =========================================================================
 * 1章「順路」の背景: 閉館した水族館 (story-world.js が呼ぶ。story-scenery.js の研究所と同じ形で返す)
 *   電源だけが残っている。天井の明かりは消えていて、光は水槽の青と、床の順路の矢印と、非常口の緑だけ。
 *   W 大水槽 (水と明かりだけで、何もいない) / J クラゲの水槽 (空) / Q 案内カウンター / X 通せんぼの柵 / x 明かりの落ちた通路
 *   buildAquarium(scene, map, keep) → { update(t, dt), syncDoors(state) }
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

/* 水: 下ほど暗い青と、ゆらぐ光の網 (水面から差す光)。テクスチャを横に流して揺らす */
const waterTex = () => canvasTex(256, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#2c8fd0'); gr.addColorStop(0.45, '#0d4f8c'); gr.addColorStop(1, '#03152e');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = rnd(7);
  g.strokeStyle = 'rgba(160,230,255,.22)';
  for (let i = 0; i < 40; i++) {
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    let x = r() * w, y = r() * h * 0.6;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 60; y += r() * 30; g.lineTo(x, y); }
    g.stroke();
  }
});
/* 床: 黒に近い紺の、磨いた石 */
const floorTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
  const r = rnd(3);
  for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(120,160,210,' + (r() * 0.05) + ')'; g.fillRect(r() * w, r() * h, 2, 2); }
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
});
/* 順路の矢印 (床に貼った案内の印) */
const arrowTex = () => canvasTex(128, 64, (g) => {
  g.fillStyle = '#ffc65c';
  g.beginPath(); g.moveTo(14, 22); g.lineTo(78, 22); g.lineTo(78, 8); g.lineTo(116, 32); g.lineTo(78, 56); g.lineTo(78, 42); g.lineTo(14, 42); g.closePath(); g.fill();
});
/* 光だまり (床に落ちる水槽の光) */
const poolTex = () => canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});
/* 壁: 濃い紺の板。継ぎ目の線だけ */
const wallTex = () => canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#101a2c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#0a1120'; g.fillRect(0, h * 0.78, w, h * 0.22);
  g.strokeStyle = 'rgba(140,180,230,.08)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h * 0.78);
});

/* 同じ印のマスのまとまり (左上と右下)。水槽は1つの大きな箱にする */
function bounds(map, ch) {
  const ps = M.find(map, ch);
  if (!ps.length) return null;
  const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs) + 1, y0: Math.min(...ys), y1: Math.max(...ys) + 1 };
}

export function buildAquarium(scene, map, keep) {
  const W = M.width(map), H = M.height(map);
  const updates = [];
  const std = (o) => keep(new THREE.MeshStandardMaterial(o));
  const basic = (o) => keep(new THREE.MeshBasicMaterial(o));
  const box = (w, h, d, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const flat = (w, d, mat, x, z, y = 0.012, ry = 0) => { const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), mat); m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(x, y, z); scene.add(m); return m; };
  const floorOf = (x, y) => M.TILE[M.charAt(map, x, y)] === 'floor';
  const pTex = keep(poolTex());
  const pool = (x, z, w, d, color, opacity) => flat(w, d, basic({ map: pTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }), x, z, 0.014);

  /* 床 */
  const fTex = keep(floorTex());
  fTex.wrapS = fTex.wrapT = THREE.RepeatWrapping;
  fTex.repeat.set(W, H);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(W * T, H * T)), std({ map: fTex, roughness: 0.25, metalness: 0.2, envMapIntensity: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W * T / 2, 0, H * T / 2);
  scene.add(floor);

  /* 壁: 奥は高く、手前 (cutRow より下) は低く切り落とす */
  const tallGeo = keep(new THREE.BoxGeometry(T, WALL_H, T));
  const lowGeo = keep(new THREE.BoxGeometry(T, LOW_H, T));
  const topMat = std({ color: 0x080d18, roughness: 0.9 });
  const sideMat = std({ color: 0x18233a, roughness: 0.85 });
  const faceMat = std({ map: keep(wallTex()), roughness: 0.8 });
  const faceGeo = keep(new THREE.PlaneGeometry(T, WALL_H));
  for (const w of M.find(map, '#')) {
    const n = floorOf(w.x, w.y - 1), s = floorOf(w.x, w.y + 1), e = floorOf(w.x + 1, w.y), wv = floorOf(w.x - 1, w.y);
    if (!n && !s && !e && !wv) continue;
    if (w.y > map.cutRow) {
      const low = new THREE.Mesh(lowGeo, topMat);
      low.position.copy(cell(w.x, w.y, LOW_H / 2));
      scene.add(low);
      continue;
    }
    const b = new THREE.Mesh(tallGeo, [sideMat, sideMat, topMat, topMat, sideMat, sideMat]);
    b.position.copy(cell(w.x, w.y, WALL_H / 2));
    scene.add(b);
    if (s) {
      const face = new THREE.Mesh(faceGeo, faceMat);
      face.position.copy(cell(w.x, w.y, WALL_H / 2)).add(new THREE.Vector3(0, 0, T / 2 + 0.01));
      scene.add(face);
    }
  }

  /* 水槽: 奥に光る水の面、手前にガラス、縁の枠。水の光は床へこぼれる */
  const tank = (b, tint, glow) => {
    if (!b) return;
    const x0 = b.x0 * T, x1 = b.x1 * T, zBack = b.y0 * T + 0.2, zFront = b.y1 * T;
    const w = x1 - x0, cx = (x0 + x1) / 2;
    const wt = keep(waterTex());
    wt.wrapS = THREE.RepeatWrapping;
    wt.repeat.set(w / 6, 1);
    const water = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, WALL_H - 0.4)), basic({ map: wt, color: tint, toneMapped: false }));
    water.position.set(cx, (WALL_H - 0.4) / 2 + 0.2, zBack);
    scene.add(water);
    const sideG = keep(new THREE.PlaneGeometry(zFront - zBack, WALL_H - 0.4));
    for (const sx of [x0, x1]) {
      const side = new THREE.Mesh(sideG, basic({ color: glow, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
      side.rotation.y = Math.PI / 2;
      side.position.set(sx, water.position.y, (zBack + zFront) / 2);
      scene.add(side);
    }
    const glass = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, WALL_H - 0.4)),
      std({ color: 0x9fd8ff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.2 }));
    glass.position.set(cx, water.position.y, zFront - 0.02);
    scene.add(glass);
    const frame = std({ color: 0x0c1322, roughness: 0.6, metalness: 0.4 });
    box(w + 0.2, 0.2, 0.3, frame, cx, 0.1, zFront);
    box(w + 0.2, 0.25, 0.3, frame, cx, WALL_H - 0.1, zFront);
    for (let k = 0; k <= Math.round(w / 6); k++) box(0.12, WALL_H, 0.3, frame, x0 + k * w / Math.round(w / 6), WALL_H / 2, zFront);
    /* 水の光: 前に置いた明かりと、床の光だまり */
    const n = Math.max(1, Math.round(w / 6));
    const lights = [];
    for (let k = 0; k < n; k++) {
      const l = new THREE.PointLight(glow, 7, 10, 1.4);
      l.position.set(x0 + (k + 0.5) * w / n, 1.6, zFront + 1.2);
      scene.add(l);
      lights.push(l);
    }
    const p = pool(cx, zFront + 1.8, w + 1, 4.2, glow, 0.28);
    /* 泡: 水の中をのぼる小さな点 */
    const N = Math.round(w * 3);
    const geo = keep(new THREE.BufferGeometry());
    const arr = new Float32Array(N * 3);
    const r = rnd(11);
    for (let i = 0; i < N; i++) { arr[i * 3] = x0 + r() * w; arr[i * 3 + 1] = r() * WALL_H; arr[i * 3 + 2] = zBack + 0.1 + r() * (zFront - zBack - 0.3); }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const bubbles = new THREE.Points(geo, basic({ color: 0xcff4ff, size: 0.06, transparent: true, opacity: 0.6, depthWrite: false }));
    scene.add(bubbles);
    updates.push((t, dt) => {
      wt.offset.x = (t * 0.02) % 1;
      for (let i = 0; i < N; i++) { arr[i * 3 + 1] += dt * (0.25 + (i % 5) * 0.06); if (arr[i * 3 + 1] > WALL_H - 0.3) arr[i * 3 + 1] = 0.2; }
      geo.attributes.position.needsUpdate = true;
      const k = 0.85 + 0.15 * Math.sin(t * 0.9);
      for (const l of lights) l.intensity = 7 * k;
      p.material.opacity = 0.28 * k;
    });
  };
  tank(bounds(map, 'W'), 0xffffff, 0x3aa8ff);
  tank(bounds(map, 'J'), 0xb9a4ff, 0x8a7bff);

  /* 床の順路の矢印: 一本道に沿って右へ。分かれ道では、明かりの落ちた通路へは向けない */
  const aMat = basic({ map: keep(arrowTex()), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  const arrows = [];
  for (let x = 3; x < W - 4; x += 3) arrows.push(flat(1.1, 0.55, aMat, (x + 0.5) * T, 4.0 * T, 0.016));
  updates.push((t) => { aMat.opacity = 0.65 + 0.25 * Math.sin(t * 2.2); });

  /* 明かりの落ちた通路: 柵の向こうは真っ暗な床。ずっと奥まで続いて見えるように、地図の外へも伸ばす */
  const dark = bounds(map, 'x');
  if (dark) {
    const x0 = dark.x0 * T, w = (dark.x1 - dark.x0) * T;
    const voidMat = basic({ color: 0x010205 });
    flat(w, 30, voidMat, x0 + w / 2, -15 + dark.y1 * T, 0.02);
    for (const sx of [x0 - 0.2, x0 + w + 0.2]) box(0.4, WALL_H, 30, sideMat, sx, WALL_H / 2, -15 + dark.y1 * T);
  }
  /* 通せんぼの柵: 金属の支柱と、赤い帯 */
  const posts = M.find(map, 'X');
  if (posts.length) {
    const postMat = std({ color: 0xb0b6be, roughness: 0.3, metalness: 0.8 });
    const tapeMat = basic({ color: 0xa8182c });
    const xs = posts.map(p => p.x), y = posts[0].y;
    const x0 = Math.min(...xs) * T + 0.3, x1 = (Math.max(...xs) + 1) * T - 0.3;
    for (let k = 0; k <= 3; k++) {
      const px = x0 + (x1 - x0) * k / 3;
      box(0.08, 0.95, 0.08, postMat, px, 0.48, (y + 0.5) * T);
      box(0.3, 0.05, 0.3, postMat, px, 0.03, (y + 0.5) * T);
    }
    box(x1 - x0, 0.08, 0.02, tapeMat, (x0 + x1) / 2, 0.86, (y + 0.5) * T);
  }

  /* 案内カウンター: 低い台と、卓上のマイク (館内放送はここから) */
  const desk = bounds(map, 'Q');
  if (desk) {
    const x0 = desk.x0 * T, w = (desk.x1 - desk.x0) * T, z = (desk.y0 + 0.5) * T;
    box(w, 1.0, 1.0, std({ color: 0xd9dee6, roughness: 0.5 }), x0 + w / 2, 0.5, z);
    box(w + 0.1, 0.06, 1.1, std({ color: 0x3d7dff, roughness: 0.4 }), x0 + w / 2, 1.03, z);
    const mic = std({ color: 0x22262c, roughness: 0.4, metalness: 0.6 });
    box(0.03, 0.35, 0.03, mic, x0 + w / 2, 1.22, z - 0.2);
    box(0.08, 0.1, 0.08, mic, x0 + w / 2, 1.42, z - 0.17);
    const lamp = box(0.06, 0.06, 0.06, basic({ color: 0xff3b3b }), x0 + w / 2 + 0.2, 1.08, z - 0.3);
    updates.push((t) => { lamp.visible = Math.sin(t * 3) > -0.3; });   // 放送中の赤い印
    const l = new THREE.PointLight(0xffe2b0, 3, 6, 1.6);
    l.position.set(x0 + w / 2, 2.4, z + 1.2);
    scene.add(l);
    pool(x0 + w / 2, z + 1.6, 5, 3.4, 0xffd9a0, 0.18);
  }

  /* 調べられる物 (地図の looks) の掲示板: 細い脚と、うっすら光る白い板 */
  for (const l of map.looks || []) {
    const m = M.find(map, l.at)[0];
    if (!m) continue;
    const c = cell(m.x, m.y);
    const legMat = std({ color: 0x3a4456, roughness: 0.5, metalness: 0.5 });
    box(0.05, 1.0, 0.05, legMat, c.x - 0.3, 0.5, c.z - 0.6);
    box(0.05, 1.0, 0.05, legMat, c.x + 0.3, 0.5, c.z - 0.6);
    box(0.8, 0.55, 0.04, basic({ color: 0xcfd8e6, toneMapped: false }), c.x, 1.15, c.z - 0.6);
  }

  /* 非常口の緑の灯 (出口ホールの奥の壁) と、入口ホールの弱い明かり */
  const exitX = (W - 3) * T;
  box(0.9, 0.4, 0.06, basic({ color: 0x2bd96b, toneMapped: false }), exitX, 2.9, 1 * T + T + 0.05);
  const exitL = new THREE.PointLight(0x2bd96b, 1.5, 5);
  exitL.position.set(exitX, 2.6, 2.6 * T);
  scene.add(exitL);
  /* 全体の、ごく弱い青 (真っ暗で床が見えなくならないように) */
  scene.add(new THREE.HemisphereLight(0x3a5a9a, 0x05080f, 0.6));
  const hall = new THREE.PointLight(0x8fb4ff, 3, 10, 1.6);
  hall.position.set(3 * T, 2.8, 3.5 * T);
  scene.add(hall);
  pool(3.5 * T, 3.6 * T, 5, 4, 0x8fb4ff, 0.14);

  /* 漂うほこり (水槽の光の中で見える) */
  const DN = 160;
  const dGeo = keep(new THREE.BufferGeometry());
  const dArr = new Float32Array(DN * 3);
  const r = rnd(5);
  for (let i = 0; i < DN; i++) { dArr[i * 3] = r() * W * T; dArr[i * 3 + 1] = 0.3 + r() * 3; dArr[i * 3 + 2] = (2 + r() * 3) * T; }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dArr, 3));
  scene.add(new THREE.Points(dGeo, basic({ color: 0x9fd0ff, size: 0.035, transparent: true, opacity: 0.35, depthWrite: false })));
  updates.push((t, dt) => {
    for (let i = 0; i < DN; i++) { dArr[i * 3 + 1] += Math.sin(t * 0.5 + i) * dt * 0.05; }
    dGeo.attributes.position.needsUpdate = true;
  });

  return {
    update: (t, dt) => { for (const u of updates) u(t, dt); },
    syncDoors: () => {}
  };
}
