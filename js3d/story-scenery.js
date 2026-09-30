/* =========================================================================
 * ストーリーの世界の背景 (three.js)。研究所のサーバーを、地図 (story-map.js) から組み立てる
 *   奥の壁 = LED がまたたくサーバーラック / 横の壁 = ネオンの継ぎ目のパネル / 手前の壁 = 低く切り落とす (中が見えるジオラマ)
 *   床 = つやのある暗い床 + ゲートへ流れる光のデータ / 部屋ごとの色の明かり・光の円すい / ケーブル・ホログラム・柱
 *   buildScenery(scene, map, keep) → { update(t, dt), syncDoors(state), term, pod }
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import * as M from './story-map.js';

const T = 2;
const WALL_H = 3.4;
const LOW_H = 0.32;
/* 区画ごとの色 (A 目覚めの部屋 = 水色 / B 保管庫 = 紫 / C 巡回路 = 警報の赤 / D ゲートの広間 = マゼンタ / E 外 = 水色) */
const ZONE_COLOR = { A: 0x3fd8ff, B: 0x8b5cf6, C: 0xff3355, D: 0xff4fa3, E: 0x7ff3ff };

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

/* ---- シェーダー ---- */
const rackShader = (time, tint) => new THREE.ShaderMaterial({
  uniforms: { uTime: time, uTint: { value: new THREE.Color(tint) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform float uTime; uniform vec3 uTint; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec3 col = vec3(0.020, 0.028, 0.055);
      float unitY = fract(uv.y * 14.0);
      float gap = step(0.9, unitY);
      col += gap * vec3(0.0);
      float frame = step(uv.x, 0.04) + step(0.96, uv.x);
      col = mix(col, vec3(0.05,0.06,0.10), clamp(frame,0.0,1.0));
      vec2 g = vec2(floor(uv.x * 16.0), floor(uv.y * 14.0));
      vec2 f = vec2(fract(uv.x * 16.0), unitY);
      float r = h(g);
      float led = step(0.35, f.x) * step(f.x, 0.62) * step(0.35, f.y) * step(f.y, 0.55);
      float on = step(0.5, fract(r * 7.0 + uTime * (0.3 + r * 1.6)));
      vec3 lc = r < 0.72 ? uTint : (r < 0.9 ? vec3(1.0,0.31,0.64) : vec3(0.5,1.0,0.6));
      col += led * on * lc * 2.6 * (1.0 - frame);
      float stripe = smoothstep(0.02, 0.0, abs(uv.x - 0.08)) * 0.6;
      col += stripe * uTint * (0.5 + 0.5 * sin(uTime * 2.0 + uv.y * 20.0));
      gl_FragColor = vec4(col, 1.0);
    }`
});
const flowShader = (time, color) => new THREE.ShaderMaterial({
  uniforms: { uTime: time, uColor: { value: new THREE.Color(color) } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
    void main(){
      float dash = smoothstep(0.0, 0.25, fract(vUv.x * 18.0 - uTime * 1.2)) * (1.0 - smoothstep(0.25, 0.5, fract(vUv.x * 18.0 - uTime * 1.2)));
      float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
      gl_FragColor = vec4(uColor * (0.12 + dash * 0.8) * edge, (0.12 + dash * 0.5) * edge);
    }`
});
/* 光の円すい: 上は明るく、下へ消える */
const coneShader = (color) => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(color) } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 uColor; varying float vY; void main(){ gl_FragColor = vec4(uColor, pow(vY, 2.6) * 0.14); }'
});
/* 閉じた扉のレーザーの幕 (横の線がゆらぐ) */
const laserShader = (time, color) => new THREE.ShaderMaterial({
  uniforms: { uTime: time, uColor: { value: new THREE.Color(color) } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
    void main(){
      float lines = smoothstep(0.08, 0.0, abs(fract(vUv.y * 7.0 + sin(vUv.x * 12.0 + uTime * 3.0) * 0.04) - 0.5) - 0.42);
      float flick = 0.75 + 0.25 * sin(uTime * 23.0);
      float fade = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
      gl_FragColor = vec4(uColor * 2.4, (lines * flick + 0.06) * fade);
    }`
});
/* ホログラムの画面 (走査線とゆらぎ) */
const holoShader = (time, map, color) => new THREE.ShaderMaterial({
  uniforms: { uTime: time, uMap: { value: map }, uColor: { value: new THREE.Color(color) } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform float uTime; uniform sampler2D uMap; uniform vec3 uColor; varying vec2 vUv;
    void main(){
      vec4 t = texture2D(uMap, vUv);
      float scan = 0.75 + 0.25 * sin(vUv.y * 180.0 - uTime * 6.0);
      float border = step(vUv.x, 0.015) + step(0.985, vUv.x) + step(vUv.y, 0.02) + step(0.98, vUv.y);
      float a = (t.r * 0.9 + 0.12 + border * 0.6) * scan;
      gl_FragColor = vec4(uColor * (1.2 + t.r), a * 0.85);
    }`
});

const holoText = (lines) => canvasTex(256, 160, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#fff'; g.font = 'bold 17px monospace';
  lines.forEach((l, i) => g.fillText(l, 14, 30 + i * 28));
});
const holoGraph = () => canvasTex(256, 160, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 160);
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath();
  for (let x = 0; x <= 256; x += 8) { const y = 90 + Math.sin(x / 18) * 26 + Math.sin(x / 7) * 10; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  g.fillStyle = '#fff';
  for (let i = 0; i < 12; i++) g.fillRect(14 + i * 19, 140 - (i * 37 % 60), 10, 4 + (i * 37 % 60));
});
const floorTex = () => canvasTex(256, 256, (g) => {
  g.fillStyle = '#0b1122'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120,150,220,.22)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
  g.strokeStyle = 'rgba(120,150,220,.08)'; g.lineWidth = 1;
  for (const v of [64, 128, 192]) { g.beginPath(); g.moveTo(v, 0); g.lineTo(v, 256); g.moveTo(0, v); g.lineTo(256, v); g.stroke(); }
  g.fillStyle = 'rgba(127,243,255,.5)';
  for (const [x, y] of [[4, 4], [248, 4], [4, 248], [248, 248]]) g.fillRect(x, y, 4, 4);
});
const panelTex = () => canvasTex(128, 256, (g) => {
  g.fillStyle = '#0c1226'; g.fillRect(0, 0, 128, 256);
  g.strokeStyle = 'rgba(160,180,255,.18)'; g.lineWidth = 2;
  for (const y of [40, 110, 190]) g.strokeRect(10, y, 108, y === 110 ? 70 : 50);
  g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, 0, 128, 6);
});
const cityTex = () => canvasTex(128, 256, (g) => {
  g.fillStyle = '#060a18'; g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 256; y += 12) for (let x = 8; x < 120; x += 12) {
    if (Math.random() < 0.55) continue;
    g.fillStyle = Math.random() < 0.8 ? 'rgba(127,243,255,.9)' : 'rgba(255,79,163,.9)';
    g.fillRect(x, y, 5, 6);
  }
});

export function buildScenery(scene, map, keep) {
  const time = { value: 0 };
  const W = M.width(map), H = M.height(map);
  const floorOf = (x, y) => { const t = M.TILE[M.charAt(map, x, y)]; return t && t !== 'wall'; };
  const zoneOf = (x) => M.zoneAt(map, { x: x + 0.5, y: 0 });
  const updates = [];

  /* 床: つやのある暗い床 (部屋の明かりが映る) */
  const fTex = keep(floorTex());
  fTex.wrapS = fTex.wrapT = THREE.RepeatWrapping;
  fTex.repeat.set(W, H);
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(W * T, H * T)),
    keep(new THREE.MeshStandardMaterial({ map: fTex, color: 0x6a7496, roughness: 0.36, metalness: 0.7, envMapIntensity: 0.14 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W * T / 2, 0, H * T / 2);
  scene.add(floor);

  /* 壁 */
  const rackGeo = keep(new THREE.PlaneGeometry(T, WALL_H));
  const tallGeo = keep(new THREE.BoxGeometry(T, WALL_H, T));
  const lowGeo = keep(new THREE.BoxGeometry(T, LOW_H, T));
  const pTex = keep(panelTex());
  const shellMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a4466, map: pTex, roughness: 0.7, metalness: 0.3, envMapIntensity: 0.1 }));
  const topMat = keep(new THREE.MeshStandardMaterial({ color: 0x05070f, roughness: 0.9 }));
  const rackMats = {};
  const rackMat = (z) => rackMats[z] || (rackMats[z] = keep(rackShader(time, ZONE_COLOR[z])));
  const trimMats = {};
  const trimMat = (z) => trimMats[z] || (trimMats[z] = keep(new THREE.MeshBasicMaterial({ color: ZONE_COLOR[z] })));
  const trimGeoX = keep(new THREE.BoxGeometry(T, 0.05, 0.05));
  const trimGeoZ = keep(new THREE.BoxGeometry(0.05, 0.05, T));
  const seamGeo = keep(new THREE.BoxGeometry(0.04, WALL_H * 0.8, 0.04));

  for (const w of M.find(map, '#')) {
    const n = floorOf(w.x, w.y - 1), s = floorOf(w.x, w.y + 1), e = floorOf(w.x + 1, w.y), wv = floorOf(w.x - 1, w.y);
    if (!n && !s && !e && !wv) continue;                          // 周りに床がない壁は見えないので置かない
    const z = zoneOf(w.x);
    /* 手前 (床が北にだけある) は低く切り落とす */
    if (n && !s && !e && !wv) {
      const low = new THREE.Mesh(lowGeo, topMat);
      low.position.copy(cell(w.x, w.y, LOW_H / 2));
      const edge = new THREE.Mesh(trimGeoX, trimMat(z));
      edge.position.copy(cell(w.x, w.y, LOW_H + 0.02)).add(new THREE.Vector3(0, 0, -T / 2 + 0.03));
      scene.add(low, edge);
      continue;
    }
    const box = new THREE.Mesh(tallGeo, [shellMat, shellMat, topMat, topMat, shellMat, shellMat]);
    box.position.copy(cell(w.x, w.y, WALL_H / 2));
    scene.add(box);
    /* 床に面した奥の壁 (床が南) = サーバーラックの正面 */
    if (s) {
      const face = new THREE.Mesh(rackGeo, rackMat(z));
      face.position.copy(cell(w.x, w.y, WALL_H / 2)).add(new THREE.Vector3(0, 0, T / 2 + 0.01));
      scene.add(face);
      const base = new THREE.Mesh(trimGeoX, trimMat(z));
      base.position.copy(cell(w.x, w.y, 0.04)).add(new THREE.Vector3(0, 0, T / 2 + 0.04));
      scene.add(base);
    }
    /* 横の壁: ネオンの継ぎ目と足元の線 */
    for (const [side, dx] of [[e, 1], [wv, -1]]) {
      if (!side) continue;
      const seam = new THREE.Mesh(seamGeo, trimMat(zoneOf(w.x + dx)));
      seam.position.copy(cell(w.x, w.y, WALL_H * 0.45)).add(new THREE.Vector3(dx * (T / 2 + 0.03), 0, 0));
      const base = new THREE.Mesh(trimGeoZ, trimMat(zoneOf(w.x + dx)));
      base.position.copy(cell(w.x, w.y, 0.04)).add(new THREE.Vector3(dx * (T / 2 + 0.04), 0, 0));
      scene.add(seam, base);
    }
  }

  /* ゲートへ流れる光のデータ (真ん中の通路に2本) */
  const midRow = 3;
  for (const off of [-0.32, 0.32]) {
    const len = (W - 2) * T;
    const flow = new THREE.Mesh(keep(new THREE.PlaneGeometry(len, 0.16)), keep(flowShader(time, 0x7ff3ff)));
    flow.rotation.x = -Math.PI / 2;
    flow.position.set(T + len / 2, 0.012, (midRow + 0.5 + off) * T);
    scene.add(flow);
  }

  /* 部屋ごとの明かりと、光の円すい */
  const zoneLights = [];
  for (const [z, xEnd] of map.zones) {
    if (!isFinite(xEnd)) continue;
    const start = z === 'A' ? 1 : map.zones[map.zones.findIndex(q => q[0] === z) - 1][1] + 1;
    const cx = (start + xEnd) / 2;
    const l = new THREE.PointLight(ZONE_COLOR[z], 26, 16, 1.4);
    l.position.copy(cell(cx - 0.5, 2.5, 3.6));
    scene.add(l);
    zoneLights.push({ z, l, base: 26 });
  }
  const cone = (x, y, color, r = 1.3) => {
    const c = new THREE.Mesh(keep(new THREE.ConeGeometry(r, 3.8, 32, 1, true)), keep(coneShader(color)));
    c.position.copy(cell(x, y, 1.9));
    scene.add(c);
    const lamp = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20)), keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.6) })));
    lamp.position.copy(cell(x, y, 3.82));
    scene.add(lamp);
  };

  /* 目覚めのポッド: ガラスの筒の中に光る液体と泡、台座の輪 */
  const podAt = M.find(map, 'S')[0];
  const pod = new THREE.Group();
  pod.position.copy(cell(podAt.x, podAt.y));
  const glass = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.72, 0.72, 2.3, 32, 1, true)),
    keep(new THREE.MeshPhysicalMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide })));
  glass.position.y = 1.35;
  const liquid = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.66, 0.66, 1.5, 32)),
    keep(new THREE.MeshBasicMaterial({ color: 0x1fb8d8, transparent: true, opacity: 0.28 })));
  liquid.position.y = 0.95;
  const capGeo = keep(new THREE.CylinderGeometry(0.85, 0.85, 0.2, 32));
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0x1a2240, roughness: 0.35, metalness: 0.8 }));
  const capB = new THREE.Mesh(capGeo, metal); capB.position.y = 0.1;
  const capT = new THREE.Mesh(capGeo, metal); capT.position.y = 2.55;
  const podRing = new THREE.Mesh(keep(new THREE.TorusGeometry(0.86, 0.035, 8, 48)), keep(new THREE.MeshBasicMaterial({ color: 0x7ff3ff })));
  podRing.rotation.x = Math.PI / 2; podRing.position.y = 0.22;
  const bubbles = new THREE.Points(keep(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(Array.from({ length: 90 }, (_, i) =>
    i % 3 === 1 ? Math.random() * 1.5 + 0.2 : (Math.random() - 0.5) * 1.0)), 3))),
    keep(new THREE.PointsMaterial({ color: 0xbffaff, size: 0.05, transparent: true, opacity: 0.9, depthWrite: false })));
  pod.add(glass, liquid, capB, capT, podRing, bubbles);
  scene.add(pod);
  cone(podAt.x, podAt.y, 0x7ff3ff, 1.2);
  updates.push((t, dt) => {
    const a = bubbles.geometry.attributes.position.array;
    for (let i = 1; i < a.length; i += 3) { a[i] += dt * 0.6; if (a[i] > 1.7) a[i] = 0.2; }
    bubbles.geometry.attributes.position.needsUpdate = true;
    podRing.scale.setScalar(1 + Math.sin(t * 2) * 0.04);
  });

  /* ケーブル (床を這って壁へ) */
  const cableMat = keep(new THREE.MeshStandardMaterial({ color: 0x0d1428, roughness: 0.5, metalness: 0.5, emissive: 0x13305a, emissiveIntensity: 0.6 }));
  const cable = (pts, r = 0.07) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, h]) => new THREE.Vector3(x * T, h, y * T)));
    scene.add(new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 48, r, 8)), cableMat));
  };
  cable([[podAt.x + 0.5, podAt.y + 0.9, 0.07], [podAt.x + 0.2, podAt.y + 1.6, 0.07], [1.15, podAt.y + 2.4, 0.07], [1.05, podAt.y + 2.4, 0.9]]);
  cable([[podAt.x + 0.9, podAt.y + 0.3, 0.07], [podAt.x + 2.2, 1.35, 0.07], [podAt.x + 3.4, 1.1, 0.07], [podAt.x + 3.5, 1.02, 1.2]], 0.05);
  cable([[17.5, 1.2, 0.06], [20.5, 1.35, 0.06], [23.5, 1.2, 0.06], [25.6, 1.25, 0.06]], 0.09);
  cable([[16.4, 5.6, 0.06], [19.0, 5.45, 0.06], [22.0, 5.62, 0.06], [25.5, 5.5, 0.06]], 0.06);

  /* ログの端末: 机と、宙に浮く3枚の画面 */
  const termAt = M.find(map, 'T')[0];
  const term = new THREE.Group();
  term.position.copy(cell(termAt.x, termAt.y));
  const desk = new THREE.Mesh(keep(new THREE.BoxGeometry(1.8, 0.9, 1.0)), metal);
  desk.position.y = 0.45;
  const deskEdge = new THREE.Mesh(keep(new THREE.BoxGeometry(1.82, 0.03, 0.03)), keep(new THREE.MeshBasicMaterial({ color: 0x8b5cf6 })));
  deskEdge.position.set(0, 0.9, 0.5);
  term.add(desk, deskEdge);
  const holos = [];
  const holo = (group, tex, color, x, y, z, ry, w = 1.3, h = 0.8) => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), keep(holoShader(time, keep(tex), color)));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    group.add(m);
    holos.push({ m, y, k: Math.random() * 6 });
    return m;
  };
  holo(term, holoText(['> LOG 0412', '> 解析 AI: 紫苑', '> 処理件数 12,480', '> 状態: 権限停止']), 0xb9a4ff, 0, 1.7, 0.2, 0);
  holo(term, holoGraph(), 0x7ff3ff, -1.2, 1.55, 0.35, 0.5, 0.9, 0.6);
  holo(term, holoText(['> QUERY', '> ANSWER', '> QUERY', '> ANSWER']), 0x7ff3ff, 1.2, 1.55, 0.35, -0.5, 0.9, 0.6);
  scene.add(term);
  cone(termAt.x, termAt.y + 0.3, 0x8b5cf6, 1.4);

  /* 保管庫と巡回路の壁ぎわのホログラム */
  const wallHolo = new THREE.Group();
  holo(wallHolo, holoGraph(), 0x8b5cf6, 9.5 * T, 1.9, 1.15 * T, 0, 1.4, 0.8);
  holo(wallHolo, holoText(['!! ALERT', '> 巡回中', '> 未登録プロセス: 0']), 0xff3355, 20.5 * T, 2.1, 1.15 * T, 0, 1.6, 0.9);
  scene.add(wallHolo);
  updates.push((t) => { for (const h of holos) h.m.position.y = h.y + Math.sin(t * 1.3 + h.k) * 0.04; });

  /* 巡回路の警報灯 (赤い明かりが脈打つ) */
  updates.push((t) => {
    for (const z of zoneLights) if (z.z === 'C') z.l.intensity = z.base * (0.55 + 0.45 * Math.abs(Math.sin(t * 1.6)));
  });
  cone(20.5, 3, 0xff3355, 1.2);

  /* 扉: 両脇の柱 + 閉じているあいだはレーザーの幕、開いたら水色の門 */
  const pillarGeo = keep(new THREE.BoxGeometry(0.34, WALL_H + 0.2, 0.34));
  const pillarMat = keep(new THREE.MeshStandardMaterial({ color: 0x141b33, roughness: 0.4, metalness: 0.7 }));
  const openMat = keep(new THREE.MeshBasicMaterial({ color: 0x7ff3ff }));
  const postGeo = keep(new THREE.BoxGeometry(0.06, WALL_H - 0.4, 0.06));
  const beamGeo = keep(new THREE.BoxGeometry(0.06, 0.06, T * 0.9));
  const doors = [];
  for (const ch of Object.keys(map.opens)) {
    const tiles = M.find(map, ch);
    const gate = ch === 'g';
    const color = gate ? 0xff2a4a : 0xff3355;
    const laserMat = keep(laserShader(time, color));
    for (const d of tiles) {
      const g = new THREE.Group();
      g.position.copy(cell(d.x, d.y));
      const curtain = new THREE.Mesh(keep(new THREE.PlaneGeometry(T, WALL_H - 0.3)), laserMat);
      curtain.rotation.y = Math.PI / 2;
      curtain.position.y = (WALL_H - 0.3) / 2;
      const frame = new THREE.Group();
      for (const zz of [-0.45, 0.45]) {
        const post = new THREE.Mesh(postGeo, openMat);
        post.position.set(0, (WALL_H - 0.4) / 2, zz * T);
        frame.add(post);
      }
      const beam = new THREE.Mesh(beamGeo, openMat);
      beam.position.y = WALL_H - 0.4;
      frame.add(beam);
      g.add(curtain, frame);
      scene.add(g);
      doors.push({ ch, curtain, frame });
    }
    /* 柱は扉の上下 (壁の端) に */
    const ys = tiles.map(t => t.y);
    for (const y of [Math.min(...ys) - 0.5, Math.max(...ys) + 0.5]) {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set((tiles[0].x + 0.5) * T, (WALL_H + 0.2) / 2, (y + 0.5) * T);
      const strip = new THREE.Mesh(keep(new THREE.BoxGeometry(0.36, 0.06, 0.36)), keep(new THREE.MeshBasicMaterial({ color })));
      strip.position.set(p.position.x, WALL_H + 0.22, p.position.z);
      scene.add(p, strip);
    }
  }
  const syncDoors = (state) => {
    for (const d of doors) {
      const open = M.isOpen(map, state, d.ch);
      d.curtain.visible = !open;
      d.frame.visible = open;
    }
  };

  /* ゲートの広間: 主任の足元の輪と、光の円すい */
  const chiefAt = M.find(map, 'c')[0];
  const dais = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.3, 1.5, 0.18, 40)), metal);
  dais.position.copy(cell(chiefAt.x, chiefAt.y, 0.09));
  const daisRing = new THREE.Mesh(keep(new THREE.TorusGeometry(1.35, 0.04, 8, 56)), keep(new THREE.MeshBasicMaterial({ color: 0xff4fa3 })));
  daisRing.rotation.x = Math.PI / 2;
  daisRing.position.copy(cell(chiefAt.x, chiefAt.y, 0.2));
  scene.add(dais, daisRing);
  cone(chiefAt.x, chiefAt.y, 0xff4fa3, 1.5);
  updates.push((t) => { daisRing.rotation.z = t * 0.6; });

  /* 外: 光る床、空の明るみ、遠くの街の影 */
  for (const e of M.find(map, 'e')) {
    const glow = new THREE.Mesh(keep(new THREE.PlaneGeometry(T, T)), keep(new THREE.MeshBasicMaterial({ color: 0x3fe0ff, transparent: true, opacity: 0.22 })));
    glow.rotation.x = -Math.PI / 2;
    glow.position.copy(cell(e.x, e.y, 0.015));
    scene.add(glow);
  }
  const sky = new THREE.Mesh(keep(new THREE.PlaneGeometry(60, 30)), keep(new THREE.ShaderMaterial({
    depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ vec3 a = vec3(0.02,0.03,0.08); vec3 b = vec3(0.1,0.7,0.9); gl_FragColor = vec4(mix(b, a, smoothstep(0.0, 0.7, vUv.y)), 1.0); }'
  })));
  sky.rotation.y = -Math.PI / 2;
  sky.position.set((W + 14) * T, 6, H * T / 2);
  scene.add(sky);
  const cTex = keep(cityTex());
  const cityMat = keep(new THREE.MeshBasicMaterial({ map: cTex, color: 0xffffff }));
  for (let i = 0; i < 14; i++) {
    const h = 3 + Math.random() * 9, w = 1.5 + Math.random() * 2.5;
    const b = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, w)), cityMat);
    b.position.set((W + 5 + Math.random() * 7) * T, h / 2, (Math.random() * (H + 6) - 3) * T);
    scene.add(b);
  }
  const outside = new THREE.PointLight(0x7ff3ff, 40, 20, 1.3);
  outside.position.copy(cell(W - 2, 3, 3));
  scene.add(outside);

  /* 漂うデータの粒 */
  const N = 320;
  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pts[i * 3] = Math.random() * W * T; pts[i * 3 + 1] = Math.random() * 4; pts[i * 3 + 2] = Math.random() * H * T; }
  const pGeo = keep(new THREE.BufferGeometry());
  pGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  scene.add(new THREE.Points(pGeo, keep(new THREE.PointsMaterial({ color: 0x9ff6ff, size: 0.06, transparent: true, opacity: 0.65, depthWrite: false }))));
  updates.push((t, dt) => {
    const a = pGeo.attributes.position.array;
    for (let i = 1; i < a.length; i += 3) { a[i] += dt * 0.22; if (a[i] > 4) a[i] = 0; }
    pGeo.attributes.position.needsUpdate = true;
  });

  return {
    term, pod,
    syncDoors,
    update(t, dt) { time.value = t; for (const f of updates) f(t, dt); }
  };
}
