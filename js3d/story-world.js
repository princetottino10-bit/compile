/* =========================================================================
 * ストーリーの歩ける世界 (three.js)。序章「起動」= 研究所のサーバー
 *   あなた = 生まれたばかりの AI のプロセス (光る玉)。紫苑 = 立ち絵の立て看板。警備 = ドローン。
 *   動かし方: WASD / 矢印キー、または床をタップ (クリック) した所へ歩く。E / Enter / Space か「話す」ボタンで話しかける。
 *   出来事 (story-map.js の events) で会話 (story-ui.js の playScene) や対戦の確認を出す。
 *   openWorld(protocols, opts) → { battle: 場面 } (対戦を始める) / null (タイトルへ)
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { showTitleBack, hideTitleBack } from './titleback.js';
import { CHAPTERS, loadStory, saveStory, currentNode, clearNode, startBattle, nodeById, isCleared, chapterCleared } from './story.js';
import * as M from './story-map.js';
import { playScene, askBattle } from './story-ui.js';
import { buildScenery } from './story-scenery.js';
import { RoomEnvironment } from '../vendor/jsm/environments/RoomEnvironment.js';

const T = 2;                 // 1マスの大きさ (three.js の単位)
const SPEED = 3.4;           // 歩く速さ (マス / 秒)
const RADIUS = 0.3;          // あなたの当たり判定 (マス)
const REACH = 1.5;           // 話しかけられる距離 (マス)
const CAM_OFFSET = new THREE.Vector3(0, 8.6, 9.6);   // カメラ: あなたの斜め後ろ上
const COLORS = { cyan: 0x7ff3ff, pink: 0xff4fa3, violet: 0xa07bff, red: 0xff3b5c, navy: 0x05070f, rack: 0x0b1020 };

const world = (p, y = 0) => new THREE.Vector3(p.x * T, y, p.y * T);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ---------- 手続きで作るテクスチャ ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = (rgb) => canvasTex(64, 64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(' + rgb + ',1)'); r.addColorStop(0.35, 'rgba(' + rgb + ',.45)'); r.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});

/* ---------- 世界を作る ---------- */
export function openWorld(protocols, opts = {}) {
  const map = M.PROLOGUE;
  const chapter = CHAPTERS[0];
  let state = loadStory();

  const root = document.createElement('div');
  root.id = 'storyWorld';
  root.innerHTML = '<canvas class="sw-canvas"></canvas>' +
    '<div class="sw-hud"><b>' + chapter.title + '「' + chapter.name + '」</b><span class="sw-zone"></span><p class="sw-goal"></p></div>' +
    '<div class="sw-labels"></div>' +
    '<button type="button" class="sw-act" hidden></button>' +
    '<p class="sw-help">WASD・矢印キー / 床をタップで移動　E・Enter で話す</p>';
  document.body.appendChild(root);
  const canvas = root.querySelector('canvas');
  const actBtn = root.querySelector('.sw-act');
  const labelsEl = root.querySelector('.sw-labels');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.navy);
  scene.fog = new THREE.FogExp2(COLORS.navy, 0.026);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  scene.add(new THREE.AmbientLight(0x4a5690, 0.35));
  const sun = new THREE.DirectionalLight(0xb9a4ff, 0.35);
  sun.position.set(-10, 20, 8);
  scene.add(sun);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  /* 背景 (壁・床・扉・ポッド・端末・外の街など) は story-scenery.js */
  const W = M.width(map), H = M.height(map);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = keep(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
  pmrem.dispose();
  const scenery = buildScenery(scene, map, keep);
  const term = scenery.term;
  const termAt = M.find(map, 'T')[0];
  const syncDoors = () => scenery.syncDoors(state);

  /* タップした行き先の印 */
  const marker = new THREE.Mesh(keep(new THREE.RingGeometry(0.28, 0.4, 32)), keep(new THREE.MeshBasicMaterial({ color: COLORS.pink, transparent: true, opacity: 0.9, side: THREE.DoubleSide })));
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  let markerT = 0;
  scene.add(marker);

  /* 行き先の案内: 目的地の上の矢印と、足元からの光の点の道 */
  const arrow = new THREE.Mesh(keep(new THREE.ConeGeometry(0.42, 0.9, 4)), keep(new THREE.MeshBasicMaterial({ color: COLORS.pink })));
  arrow.rotation.x = Math.PI;
  arrow.visible = false;
  scene.add(arrow);
  const DOTS = 90;
  const dotGeo = keep(new THREE.BufferGeometry());
  dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DOTS * 3), 3));
  dotGeo.setDrawRange(0, 0);
  const dots = new THREE.Points(dotGeo, keep(new THREE.PointsMaterial({ color: COLORS.pink, size: 0.3, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })));
  scene.add(dots);
  let guideT = 0;

  /* あなた: 光るプロセスの玉 */
  const me = new THREE.Group();
  const core = new THREE.Mesh(keep(new THREE.SphereGeometry(0.32, 24, 16)), keep(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: COLORS.cyan, emissiveIntensity: 2.2 })));
  const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(glowTex('127,243,255')), blending: THREE.AdditiveBlending, depthWrite: false })));
  halo.scale.set(2.2, 2.2, 1);
  const meLight = new THREE.PointLight(COLORS.cyan, 8, 7);
  const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.5, 0.025, 8, 40)), keep(new THREE.MeshBasicMaterial({ color: COLORS.cyan })));
  ring.rotation.x = Math.PI / 2;
  me.add(core, halo, meLight, ring);
  scene.add(me);
  let pos = M.spawnFor(map, state);

  /* 紫苑: ちびキャラ。向き (前・横・後ろ) と足の動き (立ち・歩き2枚)。練習のあとは、あなたについてくる。
     横の絵は右向き。左へ歩くときは、絵そのものを左右反転した別のテクスチャを使う
     (Sprite は scale.x を負にしても裏返らない。前に「左へ歩くと後ろ向きに走る」と言われたのはこのため) */
  const shionAt = M.find(map, 'K')[0];
  const loader = new THREE.TextureLoader();
  const chibi = {};
  for (const dir of ['front', 'side', 'back']) {
    for (const fr of ['stand', 'walk1', 'walk2']) {
      const tex = keep(loader.load('art/chibi/shion_' + dir + '_' + fr + '.webp'));
      tex.colorSpace = THREE.SRGBColorSpace;
      chibi[dir + '_' + fr] = tex;
      if (dir === 'side') {
        /* 左向き: 同じ絵を、UV を左右反転して貼る */
        const left = keep(tex.clone());
        left.wrapS = THREE.RepeatWrapping;
        left.repeat.set(-1, 1);
        left.offset.set(1, 0);
        chibi['left_' + fr] = left;
      }
    }
  }
  /* 発光 (ブルーム) で白く飛ばないよう、トーンマップを外して明るさを少し抑える */
  const shionMat = keep(new THREE.SpriteMaterial({ map: chibi.front_stand, transparent: true, toneMapped: false }));
  shionMat.color.setScalar(0.7);
  const shion = new THREE.Sprite(shionMat);
  const CHIBI = 1.8;                          // 絵の一辺 (足もとが下の真ん中)
  shion.center.set(0.5, 0.02);
  shion.scale.set(CHIBI, CHIBI, 1);
  let shionDir = 'front', shionStep = 0;
  const shionShadow = new THREE.Mesh(keep(new THREE.CircleGeometry(0.55, 24)), keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 })));
  shionShadow.rotation.x = -Math.PI / 2;
  scene.add(shion, shionShadow);
  const joined = () => isCleared(state, 'c0-practice');
  /* 相棒になったあとは、あなたの少し後ろ (左が壁なら同じ所) に立つ */
  const behind = M.walkable(map, state, Math.floor(pos.x - 1.2), Math.floor(pos.y)) ? { x: pos.x - 1.2, y: pos.y } : { ...pos };
  let shionPos = joined() ? behind : { x: shionAt.x + 0.5, y: shionAt.y + 0.5 };
  /* あなたの歩いた跡。紫苑はこれをたどる (まっすぐ寄ると壁を抜けるため) */
  const trail = [{ ...shionPos }, { ...pos }];

  /* 警備ドローン (巡回) と警備主任 */
  const drone = (size, color) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(keep(new THREE.OctahedronGeometry(size)), keep(new THREE.MeshStandardMaterial({ color: 0x220812, emissive: color, emissiveIntensity: 1.6, flatShading: true })));
    const r1 = new THREE.Mesh(keep(new THREE.TorusGeometry(size * 1.5, 0.03, 8, 48)), keep(new THREE.MeshBasicMaterial({ color })));
    const r2 = r1.clone();
    r1.rotation.x = Math.PI / 2;
    r2.rotation.y = Math.PI / 2;
    const l = new THREE.PointLight(color, 7, 6);
    g.add(body, r1, r2, l);
    g.userData = { body, r1, r2 };
    scene.add(g);
    return g;
  };
  const route = M.find(map, 'p').map(p => ({ x: p.x + 0.5, y: p.y + 0.5 }));
  const patrol = drone(0.42, COLORS.red);
  let patrolT = 0;
  const chiefAt = M.find(map, 'c')[0];
  const chiefPos = { x: chiefAt.x + 0.5, y: chiefAt.y + 0.5 };
  const chief = drone(0.8, COLORS.pink);
  chief.position.copy(world(chiefPos, 1.6));
  chief.scale.setScalar(1);

  /* 名前の札 (画面の上に重ねる) */
  const labels = [
    { el: document.createElement('span'), text: '紫苑', obj: shion, y: 2.05, show: () => true },
    { el: document.createElement('span'), text: '巡回の警備 AI', obj: patrol, y: 1.2, show: () => patrol.visible },
    { el: document.createElement('span'), text: '警備主任 AI', obj: chief, y: 1.9, show: () => chief.visible },
    { el: document.createElement('span'), text: 'LOG 端末', obj: term, y: 2.4, show: () => true }
  ];
  for (const l of labels) { l.el.textContent = l.text; labelsEl.appendChild(l.el); }

  const syncActors = () => {
    patrol.visible = !isCleared(state, 'c0-patrol');
    chief.visible = !isCleared(state, 'c0-chief');
    syncDoors();
  };
  syncActors();

  /* ---------- 案内 ---------- */
  const hudZone = root.querySelector('.sw-zone'), hudGoal = root.querySelector('.sw-goal');
  const syncHud = () => {
    hudZone.textContent = map.zoneNames[M.zoneAt(map, pos)] || '';
    hudGoal.textContent = '▶ ' + M.objective(state);
  };

  /* ---------- 入力 ---------- */
  const keys = new Set();
  let path = null;       // タップした所までの道 (story-map.js の findPath)
  let busy = false;
  let guardCool = 0;
  const onKeyDown = (ev) => {
    if (busy) return;
    const k = ev.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); path = null; ev.preventDefault(); }
    if ((k === 'e' || k === 'enter' || k === ' ') && nearby) { ev.preventDefault(); act(); }
  };
  const onKeyUp = (ev) => keys.delete(ev.key.toLowerCase());
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const onPointer = (ev) => {
    if (busy) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(ground, hit)) return;
    path = M.findPath(map, state, pos, { x: hit.x / T, y: hit.z / T });
    if (path) { marker.position.set(hit.x, 0.03, hit.z); marker.visible = true; markerT = 0; }
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointer);

  /* ---------- 出来事 ---------- */
  let nearby = null;      // 話しかけられる出来事
  const eventFor = (id) => Object.values(map.events).find(e => e.node === id);
  const isNext = (id) => { const c = currentNode(state); return !!c && c.id === id; };
  const posOf = (ev) => (ev.at === 'K' ? shionPos : ev.at === 'c' ? chiefPos : ev.at === 'T' ? { x: termAt.x + 0.5, y: termAt.y + 1.5 } : null);

  let finish;
  const done = new Promise((resolve) => { finish = resolve; });

  async function runScene(id) {
    busy = true;
    keys.clear(); path = null;
    await playScene(nodeById(id).lines);
    state = clearNode(state, id);
    saveStory(state);
    syncActors();
    busy = false;
    /* 章の最後の会話が終わった */
    if (chapterCleared(state, chapter.id)) {
      if (opts.onChapterClear) await opts.onChapterClear(chapter.id);
      await playScene([{ who: 'sys', text: '> ' + chapter.title + '「' + chapter.name + '」クリア。1章「閉館」は準備中です' }]);
      close(null);
      return;
    }
    /* 会話のすぐあとが、その場の人との対戦なら、そのまま確認を出す */
    const next = currentNode(state);
    if (next && next.kind !== 'scene') {
      const ev = eventFor(next.id);
      if (ev && (ev.kind === 'talk' || ev.kind === 'inspect') && dist(posOf(ev), pos) < REACH + 1.5) await runBattle(next.id);
    }
  }
  async function runBattle(id) {
    busy = true;
    keys.clear(); path = null;
    const ok = await askBattle(nodeById(id), protocols);
    busy = false;
    if (!ok) { guardCool = 2; return; }
    /* 管理者の「飛ばす」: 勝った扱いにして地図に残る (決着の会話は出ない) */
    if (ok === 'skip') { state = clearNode(state, id); saveStory(state); syncActors(); return; }
    state = startBattle(state, id);
    saveStory(state);
    close({ battle: nodeById(id) });
  }
  function act() {
    if (!nearby || busy) return;
    const n = nodeById(nearby.node);
    if (n.kind === 'scene') runScene(n.id);
    else runBattle(n.id);
  }
  actBtn.onclick = act;

  /* 次の出来事の場所 (人・物・巡回はその位置、区画に入る出来事は地図の guides) */
  const guideTarget = () => {
    const c = currentNode(state);
    const ev = c && eventFor(c.id);
    if (!ev) return null;
    if (ev.kind === 'guard') return { x: patrol.position.x / T, y: patrol.position.z / T };
    const p = posOf(ev);
    if (p) return p;
    const g = map.guides && map.guides[c.id];
    return g ? { x: g[0] + 0.5, y: g[1] + 0.5 } : null;
  };
  const syncGuide = (t, dt) => {
    guideT -= dt;
    const goal = busy ? null : guideTarget();
    const far = goal && dist(goal, pos) > REACH;
    arrow.visible = !!far;
    if (far) {
      arrow.position.copy(world(goal, 3.1 + Math.sin(t * 3) * 0.15));
      arrow.rotation.y = t * 1.5;
    }
    if (guideT > 0) return;
    guideT = 0.35;
    const route = far ? M.findPath(map, state, pos, goal) : null;
    const arr = dotGeo.attributes.position.array;
    let n = 0;
    if (route) {
      let prev = pos, carry = 0.6;              // 足元から少し離して置き始める
      for (const q of route) {
        const d = dist(prev, q);
        while (carry <= d && n < DOTS) {
          const k = carry / d;
          const w = world({ x: prev.x + (q.x - prev.x) * k, y: prev.y + (q.y - prev.y) * k }, 0.06);
          arr[n * 3] = w.x; arr[n * 3 + 1] = w.y; arr[n * 3 + 2] = w.z;
          n++;
          carry += 0.55;
        }
        carry -= d;
        prev = q;
      }
    }
    dotGeo.setDrawRange(0, n);
    dotGeo.attributes.position.needsUpdate = true;
  };

  const checkEvents = () => {
    if (busy) return;
    /* 近くの話しかけられる相手 */
    nearby = null;
    for (const ev of Object.values(map.events)) {
      if ((ev.kind !== 'talk' && ev.kind !== 'inspect') || !isNext(ev.node)) continue;
      const p = posOf(ev);
      if (p && dist(p, pos) < REACH) nearby = ev;
    }
    if (nearby) {
      actBtn.hidden = false;
      actBtn.textContent = (nearby.label || (nodeById(nearby.node).kind === 'battle' ? '戦う' : '話す')) + '  [E]';
    } else actBtn.hidden = true;
    /* 区画に入ると始まる会話 */
    for (const ev of Object.values(map.events)) {
      if (ev.kind === 'zone' && isNext(ev.node) && M.zoneAt(map, pos) === ev.zone) { runScene(ev.node); return; }
    }
    /* 巡回にぶつかった */
    if (patrol.visible && isNext('c0-patrol') && guardCool <= 0 && dist({ x: patrol.position.x / T, y: patrol.position.z / T }, pos) < 0.9) {
      runBattle('c0-patrol');
    }
  };

  /* ---------- 描く ---------- */
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w < h ? 60 : 44;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const camPos = world(pos).add(CAM_OFFSET);
  camera.position.copy(camPos);
  const look = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let last = performance.now(), raf = 0, t0 = last;

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    guardCool = Math.max(0, guardCool - dt);

    /* 歩く */
    if (!busy) {
      let dx = 0, dy = 0;
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;
      if (!dx && !dy && path) {
        while (path.length && dist(path[0], pos) < 0.12) path.shift();
        if (!path.length) { path = null; marker.visible = false; }
        else { const tx = path[0].x - pos.x, ty = path[0].y - pos.y, d = Math.hypot(tx, ty); dx = tx / d; dy = ty / d; }
      }
      const len = Math.hypot(dx, dy);
      if (len) {
        const step = Math.min((SPEED * dt) / len, path && path.length ? dist(path[0], pos) : Infinity);
        const before = pos;
        pos = M.move(map, state, pos, { x: dx * step, y: dy * step }, RADIUS);
        if (path && before.x === pos.x && before.y === pos.y) { path = null; marker.visible = false; }   // 動けなくなったら、行き先はあきらめる
      }
    }
    me.position.copy(world(pos, 0.75 + Math.sin(t * 3) * 0.08));
    ring.rotation.z = t * 1.5;
    ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08);

    /* 紫苑 (練習のあとは、あなたの歩いた跡をたどって後ろをついてくる) */
    if (dist(trail[trail.length - 1], pos) > 0.15) { trail.push({ ...pos }); if (trail.length > 80) trail.shift(); }
    let moved = null;
    if (joined()) {
      const goal = trail[Math.max(0, trail.length - 9)];      // 1.3 マスくらい後ろ
      const d = dist(shionPos, goal);
      if (d > 0.05) {
        const k = Math.min(1, dt * 5);
        moved = { x: (goal.x - shionPos.x) * k, y: (goal.y - shionPos.y) * k };
        shionPos = { x: shionPos.x + moved.x, y: shionPos.y + moved.y };
      }
    }
    /* 向き: 左右に進むときは横 (左は反転した絵)、奥 (地図の上) へは後ろ姿、手前へは前。止まったら最後の向きのまま */
    const walking = moved && Math.hypot(moved.x, moved.y) > dt * 0.4;
    if (walking) {
      shionDir = Math.abs(moved.x) >= Math.abs(moved.y) ? (moved.x < 0 ? 'left' : 'side') : moved.y < 0 ? 'back' : 'front';
      shionStep += dt * 7;
    } else shionStep = 0;
    const phase = Math.floor(shionStep) % 4;               // 歩き1 → 立ち → 歩き2 → 立ち
    const shionFrame = !walking ? 'stand' : phase === 0 ? 'walk1' : phase === 2 ? 'walk2' : 'stand';
    const tex = chibi[shionDir + '_' + shionFrame];
    if (shionMat.map !== tex) { shionMat.map = tex; shionMat.needsUpdate = true; }
    /* 上下のゆれはコードで (歩くときは一歩ごとに弾む、止まっているときは息づかい) */
    const bob = walking ? Math.abs(Math.sin(shionStep * Math.PI / 2)) * 0.07 : Math.sin(t * 2) * 0.015;
    shion.position.copy(world(shionPos, bob));
    shionShadow.position.copy(world(shionPos, 0.02));

    /* 巡回: 2点のあいだを行き来する */
    if (patrol.visible && route.length >= 2) {
      patrolT += dt * 0.22;
      const k = (1 - Math.cos(patrolT * Math.PI)) / 2;
      const a = route[0], b = route[route.length - 1];
      patrol.position.copy(world({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, 1.2 + Math.sin(t * 5) * 0.1));
    }
    for (const g of [patrol, chief]) {
      g.userData.body.rotation.y = t * 1.2;
      g.userData.r1.rotation.z = t * 2;
      g.userData.r2.rotation.x = t * 1.4;
    }
    chief.position.y = 1.6 + Math.sin(t * 1.5) * 0.15;
    scenery.update(t, dt);
    syncGuide(t, dt);
    dots.material.opacity = 0.55 + 0.35 * Math.sin(t * 4);
    if (marker.visible) { markerT += dt; marker.scale.setScalar(1 + Math.sin(markerT * 8) * 0.12); }


    /* カメラはあなたを追う */
    tmp.copy(me.position).add(CAM_OFFSET);
    camera.position.lerp(tmp, Math.min(1, dt * 4));
    look.lerp(me.position, Math.min(1, dt * 6));
    camera.lookAt(look);

    /* 名前の札 */
    for (const l of labels) {
      const on = l.show() && l.obj.visible !== false;
      if (!on) { l.el.hidden = true; continue; }
      tmp.copy(l.obj.position); tmp.y += l.y;
      tmp.project(camera);
      l.el.hidden = tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1;
      l.el.style.transform = 'translate(-50%,-100%) translate(' + ((tmp.x + 1) / 2 * window.innerWidth) + 'px,' + ((1 - tmp.y) / 2 * window.innerHeight) + 'px)';
    }

    syncHud();
    checkEvents();
    composer.render();
  };
  look.copy(world(pos, 0.75));
  raf = requestAnimationFrame(frame);

  /* ---------- 片付け ---------- */
  function close(result) {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', resize);
    hideTitleBack();
    for (const d of disposables) if (d && d.dispose) d.dispose();
    composer.dispose && composer.dispose();
    renderer.dispose();
    root.remove();
    finish(result);
  }
  showTitleBack(() => { if (!busy) close(null); });

  /* はじめて来たら、目覚めの会話から */
  if (isNext('c0-wake')) setTimeout(() => runScene('c0-wake'), 700);

  return done;
}
