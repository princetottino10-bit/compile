/* =========================================================================
 * ストーリーの世界の背景 (three.js)。夜の、人のいない研究所を、地図 (story-map.js) から組み立てる (案8。2026-10-04)
 *   奥の壁 = 塗り壁と腰壁 (区画ごとに 判定室 / 端末室 / 廊下 / 正面ホール) / 手前の壁 = 低く切り落とす (中が見えるジオラマ)
 *   床 = 長尺シートの床、蛍光灯の下の明るみ、壁ぎわの陰 / 天井の蛍光灯 (廊下の1本はちらつく) / 廊下の回転灯
 *   引き戸 (閉=赤ランプ、開=緑ランプ) / 散らばった書類、倒れた椅子、台車、枯れた鉢植え (人がいなくなってからの時間)
 *   外 = アスファルトと街灯、明かりがついているのに誰もいない街
 *   buildScenery(scene, map, keep) → { update(t, dt), syncDoors(state), term, pod }
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import * as M from './story-map.js';

const T = 2;
const WALL_H = 3.4;
const LOW_H = 0.32;
/* 区画ごとの壁の色 (A 判定室 = 白いタイル / B 端末室 = 青みの灰 / C 廊下 = 薄いベージュ / D 正面ホール = 木の腰壁) */
const ZONE = {
  A: { top: '#d8dde2', low: '#aab3bc', line: '#8e98a2', light: 0xe8f4ff },
  B: { top: '#b9c3cf', low: '#7d8896', line: '#5f6a78', light: 0xd6e6ff },
  C: { top: '#d6d0c2', low: '#9a9386', line: '#7d766a', light: 0xfff4dc },
  D: { top: '#cfc6b6', low: '#6e5640', line: '#4e3c2c', light: 0xffe6c4 },
  E: { top: '#2a2f3a', low: '#1d212a', line: '#14171e', light: 0xffb060 }
};

const cell = (x, y, h = 0) => new THREE.Vector3((x + 0.5) * T, h, (y + 0.5) * T);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const rnd = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* ---- テクスチャ ---- */
/* 床: 長尺シート。継ぎ目と、薄いこすれ跡 */
const floorTex = () => canvasTex(256, 256, (g) => {
  g.fillStyle = '#8c8a83'; g.fillRect(0, 0, 256, 256);
  const r = rnd(7);
  for (let i = 0; i < 220; i++) { g.fillStyle = 'rgba(60,56,50,' + (r() * 0.07) + ')'; g.fillRect(r() * 256, r() * 256, 2 + r() * 10, 1 + r() * 2); }
  g.strokeStyle = 'rgba(50,46,40,.35)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
});
/* 外のアスファルト */
const asphaltTex = () => canvasTex(128, 128, (g) => {
  g.fillStyle = '#3a3c41'; g.fillRect(0, 0, 128, 128);
  const r = rnd(11);
  for (let i = 0; i < 600; i++) { g.fillStyle = 'rgba(255,255,255,' + (r() * 0.05) + ')'; g.fillRect(r() * 128, r() * 128, 1, 1); }
});
/* 壁の正面: 上は塗り壁、下は腰壁、すそに幅木 */
const wallTex = (z) => canvasTex(128, 256, (g) => {
  const c = ZONE[z];
  g.fillStyle = c.top; g.fillRect(0, 0, 128, 256);
  if (z === 'A') {                                            // 判定室: 白いタイルの目地
    g.strokeStyle = 'rgba(120,130,140,.25)'; g.lineWidth = 1;
    for (let y = 0; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
    for (let x = 0; x < 128; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  }
  /* 上から下へ、うっすら汚れ (人のいない年月) */
  const dirt = g.createLinearGradient(0, 0, 0, 170);
  dirt.addColorStop(0, 'rgba(0,0,0,.18)'); dirt.addColorStop(0.3, 'rgba(0,0,0,0)');
  g.fillStyle = dirt; g.fillRect(0, 0, 128, 170);
  g.fillStyle = c.low; g.fillRect(0, 170, 128, 86);
  g.fillStyle = c.line; g.fillRect(0, 166, 128, 5); g.fillRect(0, 244, 128, 12);
});
/* 窓の外 (廊下の窓): 夜の街の明かり。人はいない */
const nightTex = () => canvasTex(128, 96, (g) => {
  const sky = g.createLinearGradient(0, 0, 0, 96);
  sky.addColorStop(0, '#05070d'); sky.addColorStop(1, '#1a2333');
  g.fillStyle = sky; g.fillRect(0, 0, 128, 96);
  const r = rnd(3);
  for (let i = 0; i < 9; i++) {
    const bw = 10 + r() * 16, bh = 25 + r() * 55, bx = r() * 120;
    g.fillStyle = '#0a0d14'; g.fillRect(bx, 96 - bh, bw, bh);
    for (let y = 96 - bh + 4; y < 92; y += 7) for (let x = bx + 2; x < bx + bw - 3; x += 5) if (r() < 0.25) { g.fillStyle = 'rgba(255,214,150,.85)'; g.fillRect(x, y, 2, 3); }
  }
});
/* 画面 (端末と判定台のモニター): 文字 */
const screenText = (lines, color = '#9fe8ff') => canvasTex(256, 160, (g) => {
  g.fillStyle = '#071018'; g.fillRect(0, 0, 256, 160);
  g.fillStyle = color; g.font = 'bold 16px monospace';
  lines.forEach((l, i) => g.fillText(l, 12, 28 + i * 26));
});
/* 案内板・標識 */
const signTex = (text, bg, fg, w = 256, h = 64, size = 30) => canvasTex(w, h, (g) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = 'bold ' + size + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
});
/* 建物の窓 (外の街) */
const buildingTex = () => canvasTex(128, 256, (g) => {
  g.fillStyle = '#10141c'; g.fillRect(0, 0, 128, 256);
  const r = rnd(19);
  for (let y = 10; y < 256; y += 14) for (let x = 8; x < 120; x += 14) {
    if (r() < 0.78) continue;
    g.fillStyle = r() < 0.85 ? 'rgba(255,208,140,.9)' : 'rgba(190,220,255,.8)';
    g.fillRect(x, y, 7, 8);
  }
});
/* 丸い光だまり (蛍光灯・街灯の下の床) */
const poolTex = () => canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,.55)'); r.addColorStop(0.5, 'rgba(255,255,255,.18)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});
/* 壁ぎわの陰 (上が濃く、下へ消える) */
const edgeTex = () => canvasTex(16, 64, (g) => {
  const r = g.createLinearGradient(0, 0, 0, 64);
  r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 16, 64);
});
/* 床に落ちた書類 */
const paperTex = () => canvasTex(64, 80, (g) => {
  g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, 64, 80);
  g.fillStyle = 'rgba(40,40,40,.45)';
  for (let y = 12; y < 72; y += 8) g.fillRect(8, y, 30 + (y * 7) % 18, 2);
});

export function buildScenery(scene, map, keep) {
  const time = { value: 0 };
  const W = M.width(map), H = M.height(map);
  const floorOf = (x, y) => { const t = M.TILE[M.charAt(map, x, y)]; return t && t !== 'wall'; };
  const zoneOf = (x) => M.zoneAt(map, { x: x + 0.5, y: 0 });
  const updates = [];
  const std = (o) => keep(new THREE.MeshStandardMaterial(o));
  const basic = (o) => keep(new THREE.MeshBasicMaterial(o));
  const box = (w, h, d, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const flat = (w, d, mat, x, z, y = 0.012, ry = 0) => { const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), mat); m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(x, y, z); scene.add(m); return m; };
  const outX = map.zones.find(([z]) => z === 'D')[1] + 1;            // ここから右が外

  /* 床: 中は長尺シート、外はアスファルト */
  const fTex = keep(floorTex());
  fTex.wrapS = fTex.wrapT = THREE.RepeatWrapping;
  fTex.repeat.set(outX, H);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(outX * T, H * T)), std({ map: fTex, roughness: 0.5, metalness: 0.05, envMapIntensity: 0.08 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(outX * T / 2, 0, H * T / 2);
  scene.add(floor);
  const aTex = keep(asphaltTex());
  aTex.wrapS = aTex.wrapT = THREE.RepeatWrapping;
  aTex.repeat.set(24, 18);
  const street = new THREE.Mesh(keep(new THREE.PlaneGeometry(48, 36)), std({ map: aTex, roughness: 0.92 }));
  street.rotation.x = -Math.PI / 2;
  street.position.set(outX * T + 24, -0.005, H * T / 2);
  scene.add(street);
  for (let i = 0; i < 6; i++) box(1.6, 0.01, 0.16, basic({ color: 0xcfcfc4 }), (outX + 4.2) * T + i * 3.4, 0.006, H * T / 2 + 5);   // 車道の白線

  /* 壁 */
  const tallGeo = keep(new THREE.BoxGeometry(T, WALL_H, T));
  const lowGeo = keep(new THREE.BoxGeometry(T, LOW_H, T));
  const faceGeo = keep(new THREE.PlaneGeometry(T, WALL_H));
  const topMat = std({ color: 0x2a2d33, roughness: 0.9 });
  const sideMat = std({ color: 0x8a8f96, roughness: 0.85 });
  const faceMats = {};
  const faceMat = (z) => faceMats[z] || (faceMats[z] = std({ map: keep(wallTex(z)), roughness: 0.8 }));
  const capMat = std({ color: 0x9aa0a8, roughness: 0.6 });
  const eTex = keep(edgeTex());
  const edgeMat = basic({ map: eTex, transparent: true, depthWrite: false });

  for (const w of M.find(map, '#')) {
    if (w.x >= outX) continue;                                         // 外に壁は置かない
    const n = floorOf(w.x, w.y - 1), s = floorOf(w.x, w.y + 1), e = floorOf(w.x + 1, w.y), wv = floorOf(w.x - 1, w.y);
    if (!n && !s && !e && !wv) continue;
    if ((n && !s && !e && !wv) || (map.cutRow !== undefined && w.y > map.cutRow)) {   // 手前は低く切り落とす
      const low = new THREE.Mesh(lowGeo, topMat);
      low.position.copy(cell(w.x, w.y, LOW_H / 2));
      const cap = new THREE.Mesh(keep(new THREE.BoxGeometry(T, 0.04, 0.08)), capMat);
      cap.position.copy(cell(w.x, w.y, LOW_H + 0.02)).add(new THREE.Vector3(0, 0, -T / 2 + 0.04));
      scene.add(low, cap);
      continue;
    }
    const b = new THREE.Mesh(tallGeo, [sideMat, sideMat, topMat, topMat, sideMat, sideMat]);
    b.position.copy(cell(w.x, w.y, WALL_H / 2));
    scene.add(b);
    if (s) {                                                           // 床に面した奥の壁 = 区画の色の壁 + 床の陰
      const face = new THREE.Mesh(faceGeo, faceMat(zoneOf(w.x)));
      face.position.copy(cell(w.x, w.y, WALL_H / 2)).add(new THREE.Vector3(0, 0, T / 2 + 0.01));
      scene.add(face);
      flat(T, 0.7, edgeMat, (w.x + 0.5) * T, (w.y + 1) * T + 0.35, 0.011);
    }
    for (const [side, dx] of [[e, 1], [wv, -1]]) {                    // 横の壁の足もとの陰
      if (!side) continue;
      flat(T, 0.6, edgeMat, (w.x + 0.5 + dx * 0.5) * T + dx * 0.3, (w.y + 0.5) * T, 0.011, dx > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }
  const wallZ = (y) => (y + 1) * T + 0.02;                             // 奥の壁 (y 行目の壁) の面の z

  /* 天井の蛍光灯: 中を照らす明かりと、ぶら下がった管と、床の光だまり */
  const tubeMat = basic({ color: 0xf4fbff });
  const housingMat = std({ color: 0x6b7078, roughness: 0.5, metalness: 0.4 });
  const pTex = keep(poolTex());
  const flicker = [];
  const fixture = (x, y, color, flick = false) => {
    box(1.5, 0.08, 0.32, housingMat, x * T, 3.35, y * T);
    const tube = box(1.38, 0.05, 0.12, flick ? basic({ color: 0xf4fbff }) : tubeMat, x * T, 3.29, y * T);
    const l = new THREE.PointLight(color, 5, 9, 1.6);
    l.position.set(x * T, 3.1, y * T);
    scene.add(l);
    const pool = flat(4.6, 3.4, basic({ map: pTex, color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }), x * T, y * T, 0.013);
    if (flick) flicker.push({ l, tube, pool, base: 5 });
  };
  for (const [z, xEnd] of map.zones) {
    if (!isFinite(xEnd)) continue;
    const start = z === 'A' ? 1 : map.zones[map.zones.findIndex(q => q[0] === z) - 1][1] + 1;
    const len = xEnd - start;
    const n = Math.max(1, Math.round(len / 4));
    for (let i = 0; i < n; i++) fixture(start + (i + 0.5) * len / n, 3.0, ZONE[z].light, z === 'C' && i === 1);
  }
  updates.push((t) => {
    for (const f of flicker) {
      const on = Math.sin(t * 11) > -0.2 || Math.sin(t * 2.3) > 0.6;      // ときどき消えかける
      f.l.intensity = on ? f.base : f.base * 0.15;
      f.tube.material.color.setScalar(on ? 0.96 : 0.25);
      f.pool.material.opacity = on ? 0.35 : 0.06;
    }
  });

  /* A 判定室: 判定台 (横になる台と、頭の上の輪の読み取り機)、モニター、壁の札 */
  const podAt = M.find(map, 'S')[0];
  const pod = new THREE.Group();
  pod.position.copy(cell(podAt.x, podAt.y));
  const metal = std({ color: 0x9ca3ab, roughness: 0.35, metalness: 0.75 });
  const white = std({ color: 0xe9ecef, roughness: 0.45 });
  box(0.9, 0.55, 2.0, metal, 0, 0.28, 0.1, pod);
  box(0.84, 0.12, 1.9, white, 0, 0.62, 0.1, pod);
  box(0.7, 0.1, 0.5, white, 0, 0.74, -0.7, pod);                       // 枕
  const scanner = new THREE.Mesh(keep(new THREE.TorusGeometry(0.62, 0.07, 12, 40)), metal);
  scanner.position.set(0, 1.1, -0.55);
  pod.add(scanner);
  const scanGlow = new THREE.Mesh(keep(new THREE.TorusGeometry(0.62, 0.02, 8, 40)), basic({ color: 0x7fe6ff }));
  scanGlow.position.copy(scanner.position);
  pod.add(scanGlow);
  box(0.08, 1.4, 0.08, metal, 0.6, 0.7, -0.55, pod);
  box(0.08, 1.4, 0.08, metal, -0.6, 0.7, -0.55, pod);
  scene.add(pod);
  updates.push((t) => { scanGlow.material.color.setHSL(0.53, 0.9, 0.55 + 0.15 * Math.sin(t * 2)); });
  const monitor = (x, z, lines, parent = scene, ry = 0, w = 1.0, h = 0.62) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    box(w + 0.08, h + 0.08, 0.06, std({ color: 0x24272c, roughness: 0.5 }), 0, 1.45, 0, g);
    const scr = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), basic({ map: keep(screenText(lines)) }));
    scr.position.set(0, 1.45, 0.035);
    g.add(scr);
    box(0.06, 0.5, 0.06, std({ color: 0x24272c }), 0, 1.0, -0.02, g);
    parent.add(g);
    return g;
  };
  const panelOnWall = (x, y, tex, w, h, hgt) => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), basic({ map: keep(tex) }));
    m.position.set(x * T, hgt, wallZ(y));
    scene.add(m);
    return m;
  };
  const am = new THREE.Group();                                        // 判定台の横のモニター
  am.position.copy(cell(podAt.x + 1, podAt.y - 0.2));
  box(0.5, 0.75, 0.5, metal, 0, 0.38, 0, am);
  monitor(0, 0, ['> 判定室', '> 対象: 機体4097', '> 状態: 判定待ち'], am, -0.35);
  scene.add(am);
  panelOnWall(3.5, 0, signTex('判定室', '#1d2a36', '#e6f1f8', 256, 72, 34), 1.4, 0.4, 2.7);

  /* B 端末室: 端末の机と2台のモニター、椅子。奥の壁は書類棚。倒れた椅子 */
  const termAt = M.find(map, 'T')[0];
  const term = new THREE.Group();
  term.position.copy(cell(termAt.x, termAt.y));
  box(1.9, 0.08, 0.9, std({ color: 0x8a8578, roughness: 0.7 }), 0, 0.82, 0, term);
  for (const sx of [-0.85, 0.85]) box(0.08, 0.82, 0.8, metal, sx, 0.41, 0, term);
  monitor(-0.42, -0.15, ['> 判定の記録', '> 受け取り: なし', '> 14,203日'], term, 0.12, 0.8, 0.5).position.y = -0.48;
  monitor(0.48, -0.15, ['> 解析待ち', '> 水族館 / 屋敷', '> 倉庫 ほか'], term, -0.12, 0.8, 0.5).position.y = -0.48;
  const chairMat = std({ color: 0x2f3440 });
  const makeChair = () => {
    const c = new THREE.Group();
    box(0.5, 0.08, 0.5, chairMat, 0, 0.48, 0, c);
    box(0.5, 0.55, 0.08, chairMat, 0, 0.8, 0.22, c);
    box(0.06, 0.45, 0.06, metal, 0, 0.23, 0, c);
    for (const a of [0, 1, 2, 3, 4]) box(0.3, 0.04, 0.05, metal, Math.cos(a * 1.257) * 0.15, 0.03, Math.sin(a * 1.257) * 0.15, c).rotation.y = -a * 1.257;
    return c;
  };
  const chair = makeChair();
  chair.position.set(0, 0, 0.75);
  term.add(chair);
  scene.add(term);
  const fallen = makeChair();                                          // 倒れた椅子
  fallen.position.set((termAt.x + 2.6) * T, 0.25, (termAt.y + 2.3) * T);
  fallen.rotation.set(Math.PI / 2, 0.6, 0);
  scene.add(fallen);
  const cabinetMat = std({ color: 0x8d949c, roughness: 0.5, metalness: 0.5 });
  const binderMats = [0x2f5d8a, 0x8a3b2f, 0x3f6b3a, 0xb59a3c, 0x55606b].map(c => std({ color: c, roughness: 0.8 }));
  for (let x = 8.6; x < 14.4; x += 1.25) {
    if (Math.abs(x - termAt.x - 0.5) < 0.9) continue;
    const cab = new THREE.Group();
    cab.position.set(x * T, 0, wallZ(0) + 0.32);
    box(1.05, 2.4, 0.06, cabinetMat, 0, 1.2, -0.27, cab);               // 背板
    for (const sx of [-0.5, 0.5]) box(0.05, 2.4, 0.6, cabinetMat, sx, 1.2, 0, cab);
    for (let sh = 0; sh <= 4; sh++) box(1.05, 0.04, 0.6, cabinetMat, 0, 0.08 + sh * 0.55, 0, cab);
    for (let sh = 0; sh < 4; sh++) {
      for (let k = 0; k < 7; k++) {
        if ((k * 7 + sh * 3 + Math.round(x * 10)) % 5 === 0) continue;
        box(0.11, 0.42, 0.42, binderMats[(k + sh) % binderMats.length], -0.39 + k * 0.13, 0.32 + sh * 0.55, 0.05, cab);
      }
    }
    scene.add(cab);
  }
  panelOnWall(11.5, 0, signTex('端末室', '#1d2a36', '#e6f1f8', 256, 72, 34), 1.4, 0.4, 3.0).position.z += 0.62;

  /* 床に散らばった書類 (端末室から廊下へ) */
  const paperMat = std({ map: keep(paperTex()), roughness: 0.9, transparent: true });
  const pr = rnd(23);
  for (let i = 0; i < 22; i++) {
    const x = 9 + pr() * 14, y = 2 + pr() * 3;
    if (!floorOf(Math.floor(x), Math.floor(y))) continue;
    flat(0.42, 0.54, paperMat, x * T, y * T, 0.014 + i * 0.0004, pr() * Math.PI * 2);
  }

  /* C 廊下: 窓 (外の夜の街)、消火栓の箱、回転灯、置き去りの台車 */
  const nTex = keep(nightTex());
  const glassMat = std({ color: 0x9fb4c8, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.2 });
  for (let x = 17; x < 26; x += 2.6) {
    const view = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.7, 1.1)), basic({ map: nTex }));
    view.position.set(x * T, 1.95, wallZ(0) + 0.005);
    scene.add(view);
    const glass = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.7, 1.1)), glassMat);
    glass.position.set(x * T, 1.95, wallZ(0) + 0.02);
    scene.add(glass);
    box(1.8, 0.07, 0.08, capMat, x * T, 1.38, wallZ(0) + 0.04);
    box(1.8, 0.07, 0.08, capMat, x * T, 2.52, wallZ(0) + 0.04);
  }
  box(0.6, 0.8, 0.16, std({ color: 0xb3261e, roughness: 0.5 }), 22.3 * T, 0.75, wallZ(0) + 0.08);
  const cart = new THREE.Group();                                      // 台車
  cart.position.set(18.2 * T, 0, 4.9 * T);
  cart.rotation.y = 0.35;
  box(1.0, 0.05, 0.6, metal, 0, 0.75, 0, cart);
  box(1.0, 0.05, 0.6, metal, 0, 0.25, 0, cart);
  for (const [cx, cz] of [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]]) box(0.04, 0.75, 0.04, metal, cx, 0.4, cz, cart);
  box(0.5, 0.3, 0.4, std({ color: 0xb69a6a, roughness: 0.9 }), -0.15, 0.93, 0, cart);   // 段ボール
  scene.add(cart);
  /* 回転灯: 赤い光が回る (巡回中の警報) */
  const beacon = new THREE.Group();
  beacon.position.set(20.5 * T, 3.0, wallZ(0) + 0.25);
  box(0.24, 0.14, 0.24, std({ color: 0x3a3d42 }), 0, 0, 0, beacon);
  const dome = new THREE.Mesh(keep(new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), basic({ color: 0xff3a30 }));
  dome.position.y = 0.07;
  beacon.add(dome);
  const spin = new THREE.SpotLight(0xff3a30, 18, 14, 0.5, 0.5, 1.2);
  spin.position.set(0, 0.1, 0);
  beacon.add(spin, spin.target);
  scene.add(beacon);
  updates.push((t) => {
    const a = t * 3.2;
    spin.target.position.set(Math.cos(a) * 4, -2.6, Math.sin(a) * 4);
    dome.material.color.setRGB(0.6 + 0.4 * Math.abs(Math.sin(a)), 0.12, 0.1);
  });

  /* D 正面ホール: 受付のカウンター、枯れた鉢植え、非常口の緑の札、ガラスの正面扉 (g) */
  const chiefAt = M.find(map, 'c')[0];
  const counter = new THREE.Group();
  counter.position.set((chiefAt.x - 2.2) * T, 0, (chiefAt.y + 0.5) * T);
  box(1.0, 1.05, 2.4, std({ color: 0x6e5640, roughness: 0.6 }), 0, 0.52, 0, counter);
  box(1.1, 0.06, 2.5, std({ color: 0xd7d1c4, roughness: 0.4 }), 0, 1.07, 0, counter);
  scene.add(counter);
  const plant = new THREE.Group();
  plant.position.set((chiefAt.x + 1.2) * T, 0, 1.45 * T);
  box(0.5, 0.55, 0.5, std({ color: 0x4a4038, roughness: 0.8 }), 0, 0.28, 0, plant);
  const twig = std({ color: 0x5c4a36, roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const s = box(0.03, 0.9, 0.03, twig, 0, 1.0, 0, plant);
    s.rotation.set(Math.sin(i * 1.7) * 0.5, i, Math.cos(i * 1.3) * 0.5);
  }
  scene.add(plant);
  panelOnWall(29.5, 0, signTex('正面ホール', '#2a221a', '#f2e6d4', 320, 72, 34), 1.7, 0.4, 2.8);
  const exitSign = panelOnWall(31.5, 0, signTex('非常口  EXIT', '#0d7a3e', '#ffffff', 320, 96, 34), 1.0, 0.3, 3.0);
  exitSign.material.toneMapped = false;

  /* 扉: 引き戸。閉じているあいだは2枚が合わさり、上の札が赤。開くと戸が両脇へ引き込まれ、札が緑になる */
  const doorMat = std({ color: 0x8f969e, roughness: 0.4, metalness: 0.6 });
  const gateGlass = std({ color: 0xa8c4d8, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.3 });
  const frameMat = std({ color: 0x4a4f57, roughness: 0.4, metalness: 0.6 });
  const doors = [];
  for (const ch of Object.keys(map.opens)) {
    const tiles = M.find(map, ch);
    const gate = ch === 'g';
    const ys = tiles.map(t => t.y);
    const y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
    const span = (y1 - y0) * T;
    const g = new THREE.Group();
    g.position.set((tiles[0].x + 0.5) * T, 0, (y0 + y1) / 2 * T);
    const leaves = [];
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(keep(new THREE.BoxGeometry(0.12, WALL_H - 0.5, span / 2)), gate ? gateGlass : doorMat);
      leaf.userData.closed = side * span / 4;
      leaf.userData.open = side * (span / 2 + span / 4 - 0.15);
      leaf.position.set(0, (WALL_H - 0.5) / 2, leaf.userData.closed);
      g.add(leaf);
      leaves.push(leaf);
      if (!gate) {                                                     // 戸の小窓
        const win = new THREE.Mesh(keep(new THREE.PlaneGeometry(span / 4, 0.5)), gateGlass);
        win.rotation.y = Math.PI / 2;
        win.position.set(0.07, 1.9, 0);
        leaf.add(win);
      }
    }
    const header = box(0.2, 0.3, span + 0.3, frameMat, 0, WALL_H - 0.35, 0, g);
    const lamp = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.12, 0.36)), basic({ color: 0xff3030 }));
    lamp.position.set(0.12, WALL_H - 0.35, 0);
    g.add(lamp);
    scene.add(g);
    doors.push({ ch, leaves, lamp, header, k: 0 });
  }
  let doorState = null;
  const syncDoors = (state) => { doorState = state; };
  updates.push((t, dt) => {
    for (const d of doors) {
      const open = doorState ? M.isOpen(map, doorState, d.ch) : false;
      d.k = THREE.MathUtils.clamp(d.k + (open ? dt : -dt) * 2.5, 0, 1);
      for (const leaf of d.leaves) {
        leaf.position.z = THREE.MathUtils.lerp(leaf.userData.closed, leaf.userData.open, d.k);
        leaf.visible = d.k < 0.97;                                     // 開ききったら壁の中へ (手前の壁は低いので、見えると飛び出して見える)
      }
      d.header.visible = d.k < 0.97;
      d.lamp.material.color.set(open ? 0x30e070 : 0xff3030);
    }
  });

  /* 床を這うケーブル (判定台から壁へ) */
  const cableMat = std({ color: 0x1e2126, roughness: 0.6 });
  const cable = (pts, r = 0.06) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, h]) => new THREE.Vector3(x * T, h, y * T)));
    scene.add(new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 48, r, 8)), cableMat));
  };
  cable([[podAt.x + 0.5, podAt.y + 0.1, 0.06], [podAt.x + 0.1, podAt.y - 0.6, 0.06], [podAt.x - 0.6, 1.2, 0.06], [podAt.x - 0.7, 1.02, 0.9]]);
  cable([[podAt.x + 1.3, podAt.y + 0.1, 0.05], [podAt.x + 1.8, 1.4, 0.05], [podAt.x + 2.4, 1.05, 0.6]], 0.045);

  /* 外: 街灯と光だまり、明かりのついた誰もいない建物、夜空 */
  const poleMat = std({ color: 0x3a3d42, roughness: 0.6, metalness: 0.5 });
  for (const [sx, sy] of [[outX + 0.9, 1.0], [outX + 0.9, H - 1.0], [outX + 6, 0.6], [outX + 6, H - 0.6]]) {
    box(0.14, 4.2, 0.14, poleMat, sx * T, 2.1, sy * T);
    box(0.7, 0.1, 0.14, poleMat, sx * T + 0.3, 4.2, sy * T);
    const head = box(0.4, 0.08, 0.26, basic({ color: 0xffc46a }), sx * T + 0.6, 4.14, sy * T);
    head.material.toneMapped = false;
    const l = new THREE.PointLight(0xffa850, 28, 12, 1.3);
    l.position.set(sx * T + 0.6, 3.9, sy * T);
    scene.add(l);
    flat(5, 5, basic({ map: pTex, color: 0xffa850, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }), sx * T + 0.6, sy * T, 0.01);
  }
  const sky = new THREE.Mesh(keep(new THREE.PlaneGeometry(80, 34)), keep(new THREE.ShaderMaterial({
    depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ vec3 a = vec3(0.01,0.015,0.03); vec3 b = vec3(0.08,0.12,0.2); gl_FragColor = vec4(mix(b, a, smoothstep(0.0, 0.8, vUv.y)), 1.0); }'
  })));
  sky.rotation.y = -Math.PI / 2;
  sky.position.set((outX + 20) * T, 8, H * T / 2);
  scene.add(sky);
  const bMat = basic({ map: keep(buildingTex()) });
  const r = rnd(5);
  for (let i = 0; i < 16; i++) {
    const h = 4 + r() * 10, w = 2 + r() * 3;
    box(w, h, w, bMat, (outX + 9 + r() * 10) * T, h / 2, (r() * (H + 10) - 5) * T);
  }

  /* 空気中のほこり (ゆっくり漂う。光らない) */
  const N = 160;
  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pts[i * 3] = Math.random() * outX * T; pts[i * 3 + 1] = Math.random() * 3; pts[i * 3 + 2] = Math.random() * H * T; }
  const pGeo = keep(new THREE.BufferGeometry());
  pGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  scene.add(new THREE.Points(pGeo, keep(new THREE.PointsMaterial({ color: 0xd8d4c8, size: 0.035, transparent: true, opacity: 0.35, depthWrite: false }))));
  updates.push((t, dt) => {
    const a = pGeo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) { a[i] += Math.sin(t * 0.3 + i) * dt * 0.05; a[i + 1] += dt * 0.03; if (a[i + 1] > 3) a[i + 1] = 0; }
    pGeo.attributes.position.needsUpdate = true;
  });

  return {
    term, pod,
    syncDoors,
    update(t, dt) { time.value = t; for (const f of updates) f(t, dt); }
  };
}
