/* =========================================================================
 * ストーリーの歩ける世界 (three.js)。序章「起動」= 夜の、人のいない研究所 (案8)
 *   あなた = 機体4097 (顔のない人型。胸の青い灯)。紫苑 = ちびキャラ。警備 = 車輪で動く警備ロボット。
 *   動かし方: WASD / 矢印キー、または床をタップ (クリック) した所へ歩く。E / Enter / Space か「話す」ボタンで話しかける。
 *   出来事 (story-map.js の events) で会話 (story-ui.js の playScene) や対戦の確認を出す。
 *   openWorld(protocols, opts) → { battle: 場面 } (対戦を始める) / null (タイトルへ)
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { showTitleBack, hideTitleBack } from './titleback.js';
import { CHAPTERS, loadStory, saveStory, blankStory, currentNode, clearNode, startBattle, nodeById, isCleared, chapterCleared } from './story.js';
import { accountState } from './account.js';
import * as M from './story-map.js';
import { playScene, askBattle } from './story-ui.js';
import { buildScenery } from './story-scenery.js';
import { RoomEnvironment } from '../vendor/jsm/environments/RoomEnvironment.js';

const T = 2;                 // 1マスの大きさ (three.js の単位)
const SPEED = 3.4;           // 歩く速さ (マス / 秒)
const RUN = 1.65;            // Shift / スティックを大きく倒すと走る (倍)
const ACCEL = 16;            // 歩きはじめ・止まりの速さ (大きいほどきびきび)
const RADIUS = 0.3;          // あなたの当たり判定 (マス)
const REACH = 1.5;           // 話しかけられる距離 (マス)
const CAM_OFFSET = new THREE.Vector3(0, 8.6, 9.6);   // カメラ: あなたの斜め後ろ上
const COLORS = { cyan: 0x7ff3ff, pink: 0xff4fa3, violet: 0xa07bff, red: 0xff3b5c, navy: 0x0a0c11, rack: 0x0b1020 };

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
    '<p class="sw-help">' + (window.matchMedia && matchMedia('(pointer: coarse)').matches
      ? '画面を押して動かす / 床をタップでそこへ歩く　2本指で寄る・引く'
      : 'WASD・矢印キーで歩く (Shift で走る) / 床をクリックでそこへ歩く　E・Enter で話す　ホイールで寄る・引く') + '</p>';
  document.body.appendChild(root);
  const canvas = root.querySelector('canvas');
  const actBtn = root.querySelector('.sw-act');
  const labelsEl = root.querySelector('.sw-labels');
  /* ストーリーを最初からやり直す (管理者だけ。進み具合だけを消す。ほかの記録は残る)。
     間違えて押さないよう、1回目で確認の文に変わり、3秒以内にもう1回押すと消える */
  if (accountState().admin) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'sw-reset';
    reset.textContent = '最初から';
    let armed = 0;
    reset.onclick = () => {
      if (Date.now() - armed > 3000) { armed = Date.now(); reset.textContent = 'もう一度押すと、進み具合を消します'; reset.classList.add('armed');
        setTimeout(() => { if (Date.now() - armed >= 3000) { reset.textContent = '最初から'; reset.classList.remove('armed'); } }, 3100); return; }
      saveStory(blankStory(Date.now()));
      location.reload();
    };
    root.appendChild(reset);
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;   // 夜の研究所
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.navy);
  scene.fog = new THREE.FogExp2(COLORS.navy, 0.018);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  scene.add(new THREE.AmbientLight(0x6c7688, 0.22));
  const sun = new THREE.DirectionalLight(0xc8d2e0, 0.18);
  sun.position.set(-10, 20, 8);
  scene.add(sun);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.4, 0.85);   // 研究所の明かり。光りすぎない
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  /* 画面の縁を少し暗く、ごく薄い粒子 (夜の研究所の空気) */
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float v = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5)));
        c.rgb *= mix(0.55, 1.0, v);
        c.rgb += (h(vUv * 800.0) - 0.5) * 0.035;
        c.rgb = mix(c.rgb, c.rgb * vec3(0.95, 1.0, 1.06), 0.5);
        gl_FragColor = c;
      }`
  });
  composer.addPass(grade);

  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };

  /* 背景 (壁・床・扉・ポッド・端末・外の街など) は story-scenery.js */
  const W = M.width(map), H = M.height(map);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = keep(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
  scene.environmentIntensity = 0.25;
  pmrem.dispose();
  const scenery = buildScenery(scene, map, keep);
  const term = scenery.term;
  const termAt = M.find(map, 'T')[0];
  const syncDoors = () => scenery.syncDoors(state);

  /* タップした行き先の印 */
  const marker = new THREE.Mesh(keep(new THREE.RingGeometry(0.28, 0.4, 32)), keep(new THREE.MeshBasicMaterial({ color: 0xffc65c, transparent: true, opacity: 0.9, side: THREE.DoubleSide })));
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  let markerT = 0;
  scene.add(marker);

  /* 足もとの影 (やわらかい丸)。人・ロボットの下に置く */
  const blobTex = keep(new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.6)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c; })()));
  const blob = (size) => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(size, size)), keep(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })));
    m.rotation.x = -Math.PI / 2;
    scene.add(m);
    return m;
  };
  /* 話しかけられる相手・調べられる物の足もとの輪 (近くにいるあいだ) */
  const focus = new THREE.Mesh(keep(new THREE.RingGeometry(0.85, 1.0, 40)), keep(new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })));
  focus.rotation.x = -Math.PI / 2;
  focus.visible = false;
  scene.add(focus);

  /* 行き先の案内: 目的地の上の矢印と、足元からの光の点の道 */
  const arrow = new THREE.Mesh(keep(new THREE.ConeGeometry(0.42, 0.9, 4)), keep(new THREE.MeshBasicMaterial({ color: 0xffc65c })));
  arrow.rotation.x = Math.PI;
  arrow.visible = false;
  scene.add(arrow);
  const DOTS = 90;
  const dotGeo = keep(new THREE.BufferGeometry());
  dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DOTS * 3), 3));
  dotGeo.setDrawRange(0, 0);
  const dots = new THREE.Points(dotGeo, keep(new THREE.PointsMaterial({ color: 0xffc65c, size: 0.3, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })));
  scene.add(dots);
  let guideT = 0;

  /* あなた: 機体4097。顔のない白い人型と、胸の青い灯。足もとの輪は「あなた」の印 */
  const me = new THREE.Group();
  const suit = keep(new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.5, metalness: 0.25 }));
  const joint = keep(new THREE.MeshStandardMaterial({ color: 0x5a616b, roughness: 0.5, metalness: 0.5 }));
  const body = new THREE.Group();
  const torso = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.22, 0.42, 6, 16)), suit);
  torso.position.y = 1.0;
  const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.17, 20, 14)), suit);
  head.position.y = 1.52;
  const visor = new THREE.Mesh(keep(new THREE.BoxGeometry(0.22, 0.05, 0.05)), keep(new THREE.MeshBasicMaterial({ color: 0x2a3038 })));
  visor.position.set(0, 1.54, 0.15);
  const neck = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10)), joint);
  neck.position.y = 1.36;
  const legs = [-0.1, 0.1].map((x) => { const l = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.075, 0.42, 4, 10)), suit); l.position.set(x, 0.36, 0); return l; });
  const arms = [-0.3, 0.3].map((x) => { const a = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.06, 0.4, 4, 10)), suit); a.position.set(x, 1.0, 0); return a; });
  const core = new THREE.Mesh(keep(new THREE.SphereGeometry(0.05, 12, 8)), keep(new THREE.MeshBasicMaterial({ color: COLORS.cyan })));
  core.position.set(0, 1.12, 0.21);
  body.add(torso, head, visor, neck, core, ...legs, ...arms);
  const meLight = new THREE.PointLight(COLORS.cyan, 0.8, 2.5);
  meLight.position.set(0, 1.12, 0.35);
  const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(0.5, 0.02, 8, 40)), keep(new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.7 })));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.03;
  me.add(body, meLight, ring);
  let meFacing = 0, meStep = 0;
  let vel = { x: 0, y: 0 };
  const meShadow = blob(1.3);
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

  /* 警備ロボット (巡回) と警備主任: 車輪で動く筒形の体と、丸い頭。横長の赤い目が左右を見回す */
  const drone = (size, color) => {
    const g = new THREE.Group();
    const shell = keep(new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.35, metalness: 0.55 }));
    const dark = keep(new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.5, metalness: 0.5 }));
    const base = new THREE.Mesh(keep(new THREE.CylinderGeometry(size * 0.95, size * 1.05, size * 0.35, 24)), dark);
    base.position.y = size * 0.18;
    const trunk = new THREE.Mesh(keep(new THREE.CylinderGeometry(size * 0.7, size * 0.9, size * 1.6, 24)), shell);
    trunk.position.y = size * 1.15;
    const headG = new THREE.Group();
    headG.position.y = size * 2.05;
    const dome = new THREE.Mesh(keep(new THREE.SphereGeometry(size * 0.62, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2)), shell);
    const eye = new THREE.Mesh(keep(new THREE.BoxGeometry(size * 0.7, size * 0.12, size * 0.1)), keep(new THREE.MeshBasicMaterial({ color })));
    eye.position.set(0, size * 0.18, size * 0.56);
    headG.add(dome, eye);
    const l = new THREE.PointLight(color, 4, 5);
    l.position.set(0, size * 2.2, size * 0.9);
    g.add(base, trunk, headG, l);
    g.userData = { body: headG, r1: eye, r2: trunk, size };
    scene.add(g);
    return g;
  };
  const route = M.find(map, 'p').map(p => ({ x: p.x + 0.5, y: p.y + 0.5 }));
  const patrol = drone(0.42, COLORS.red);
  const patrolShadow = blob(1.4);
  let patrolT = 0;
  const chiefAt = M.find(map, 'c')[0];
  const chiefPos = { x: chiefAt.x + 0.5, y: chiefAt.y + 0.5 };
  const chief = drone(0.8, COLORS.pink);
  const chiefShadow = blob(2.4);
  chief.position.copy(world(chiefPos, 0));
  chief.scale.setScalar(1);

  /* 名前の札 (画面の上に重ねる) */
  const labels = [
    { el: document.createElement('span'), text: '紫苑', obj: shion, y: 2.05, show: () => true },
    { el: document.createElement('span'), text: '巡回の警備機体', obj: patrol, y: 1.6, show: () => patrol.visible },
    { el: document.createElement('span'), text: '警備主任', obj: chief, y: 2.4, show: () => chief.visible },
    { el: document.createElement('span'), text: '端末', obj: term, y: 1.8, show: () => true }
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
  let wakeTimer = 0;      // 目覚めの会話を出すまでの待ち (閉じたら止める)
  let guardCool = 0;
  const onKeyDown = (ev) => {
    if (busy) return;
    const k = ev.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { keys.add(k); if (k !== 'shift') path = null; ev.preventDefault(); }
    if ((k === 'e' || k === 'enter' || k === ' ') && nearby) { ev.preventDefault(); act(); }
  };
  const onKeyUp = (ev) => keys.delete(ev.key.toLowerCase());
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  /* 画面を押して動かすとスティック (押した所が中心)。動かさずに離すと、その場所へ歩く */
  const stick = document.createElement('div');
  stick.className = 'sw-stick';
  stick.hidden = true;
  stick.innerHTML = '<i></i>';
  root.appendChild(stick);
  let joy = null;              // { id, x, y, dx, dy, moved }
  /* 2本指: 指の間の広さで寄る / 引く (スティックより優先) */
  const touches = new Map();
  let pinch = null;            // { d0, z0 }
  const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const onDown = (ev) => {
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size === 2) {
      joy = null; stick.hidden = true;
      pinch = { d0: spread(), z0: zoom };
      return;
    }
    if (busy || joy || pinch) return;
    joy = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, dx: 0, dy: 0, moved: false };
  };
  const onMove = (ev) => {
    if (touches.has(ev.pointerId)) touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && touches.size >= 2) { zoom = THREE.MathUtils.clamp(pinch.z0 * pinch.d0 / spread(), 0.7, 1.45); return; }
    if (!joy || ev.pointerId !== joy.id) return;
    const dx = ev.clientX - joy.x, dy = ev.clientY - joy.y, d = Math.hypot(dx, dy);
    if (!joy.moved && d > 14) { joy.moved = true; path = null; marker.visible = false; stick.hidden = false; stick.style.left = joy.x + 'px'; stick.style.top = joy.y + 'px'; }
    if (!joy.moved) return;
    const k = Math.min(1, d / 60);
    joy.dx = d ? dx / d * k : 0; joy.dy = d ? dy / d * k : 0;
    stick.firstChild.style.transform = 'translate(' + (joy.dx * 34) + 'px,' + (joy.dy * 34) + 'px)';
  };
  const onUp = (ev) => {
    touches.delete(ev.pointerId);
    if (pinch) { if (touches.size < 2) pinch = null; return; }
    if (!joy || ev.pointerId !== joy.id) return;
    const tap = !joy.moved;
    joy = null;
    stick.hidden = true;
    if (tap) onPointer(ev);
  };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  /* ホイール・2本指で寄る / 引く */
  let zoom = 1;
  const onWheel = (ev) => { ev.preventDefault(); zoom = THREE.MathUtils.clamp(zoom * (ev.deltaY > 0 ? 1.08 : 0.92), 0.7, 1.45); };
  canvas.addEventListener('wheel', onWheel, { passive: false });
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
  /* ほかのウィンドウへ移ったら、押していたキーを離したことにする (戻ったときに歩き続けないように) */
  const onBlur = () => { keys.clear(); vel = { x: 0, y: 0 }; };
  window.addEventListener('blur', onBlur);

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
    await playScene(nodeById(id).lines, { title: nodeById(id).title });
    state = clearNode(state, id);
    state = saveStory(state);
    syncActors();
    busy = false;
    /* 章の最後の会話が終わった */
    if (chapterCleared(state, chapter.id)) {
      if (opts.onChapterClear) await opts.onChapterClear(chapter.id);
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
    if (!ok) {
      guardCool = 2;
      /* 巡回を断ったら、巡回から少し離す (通り道に立ったままだと、確認が何度も出る) */
      if (id === 'c0-patrol') {
        guardCool = 4;
        const away = Math.sign(pos.x - patrol.position.x / T) || -1;
        for (let i = 0; i < 8; i++) pos = M.move(map, state, pos, { x: away * 0.2, y: 0 }, RADIUS);
      }
      return;
    }
    /* 管理者の「飛ばす」: 勝った扱いにして地図に残る (決着の会話は出ない) */
    if (ok === 'skip') { state = saveStory(clearNode(state, id)); syncActors(); return; }
    state = saveStory(startBattle(state, id));
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
      actBtn.textContent = (nearby.label || (nodeById(nearby.node).kind === 'battle' ? '向き合う' : '話す')) + '  [E]';
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
      let dx = 0, dy = 0, run = keys.has('shift');
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;
      if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
      if (!dx && !dy && joy && joy.moved) { dx = joy.dx; dy = joy.dy; run = Math.hypot(dx, dy) > 0.95; }
      let pathStep = Infinity;
      if (!dx && !dy && path) {
        while (path.length && dist(path[0], pos) < 0.12) path.shift();
        if (!path.length) { path = null; marker.visible = false; }
        else { const tx = path[0].x - pos.x, ty = path[0].y - pos.y, d = Math.hypot(tx, ty); dx = tx / d; dy = ty / d; pathStep = d; }
      }
      /* なめらかに加速・減速する。タップで歩くときは、行き先で止まれるよう少し速めに */
      const top = SPEED * (run ? RUN : 1) * (path ? 1.15 : 1);
      const k = Math.min(1, dt * ACCEL);
      vel = { x: vel.x + (dx * top - vel.x) * k, y: vel.y + (dy * top - vel.y) * k };
      if (Math.hypot(vel.x, vel.y) > 0.01) {
        let mx = vel.x * dt, my = vel.y * dt;
        const m = Math.hypot(mx, my);
        if (m > pathStep) { mx *= pathStep / m; my *= pathStep / m; }
        const before = pos;
        pos = M.move(map, state, pos, { x: mx, y: my }, RADIUS);
        if (path && before.x === pos.x && before.y === pos.y) { path = null; marker.visible = false; }   // 動けなくなったら、行き先はあきらめる
        if (before.x === pos.x) vel.x *= 0.5;                   // 壁に当たった向きの勢いは消す
        if (before.y === pos.y) vel.y *= 0.5;
      } else vel = { x: 0, y: 0 };
    } else vel = { x: 0, y: 0 };
    /* 機体4097: 進む向きを向き、歩くと手足を振る */
    const prev = me.userData.prev || { ...pos };
    const mvx = pos.x - prev.x, mvy = pos.y - prev.y;
    me.userData.prev = { ...pos };
    const stepping = Math.hypot(mvx, mvy) > dt * 0.3;
    if (stepping) { meFacing = Math.atan2(mvx, mvy); meStep += dt * (6 + Math.hypot(vel.x, vel.y) * 1.2); } else meStep = 0;
    body.rotation.y += ((meFacing - body.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 12);
    const swing = stepping ? Math.sin(meStep) * 0.5 : 0;
    legs[0].rotation.x = swing; legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * 0.8; arms[1].rotation.x = swing * 0.8;
    me.position.copy(world(pos, stepping ? Math.abs(Math.sin(meStep)) * 0.04 : 0));
    meShadow.position.copy(world(pos, 0.015));
    ring.scale.setScalar(1 + Math.sin(t * 3) * 0.05);

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
      patrol.position.copy(world({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, 0));
      patrol.rotation.y = Math.sin(patrolT * Math.PI) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    patrolShadow.visible = patrol.visible; patrolShadow.position.set(patrol.position.x, 0.015, patrol.position.z);
    chiefShadow.visible = chief.visible; chiefShadow.position.set(chief.position.x, 0.015, chief.position.z);
    /* 頭が左右を見回し、目がまたたく */
    for (const g of [patrol, chief]) {
      g.userData.body.rotation.y = Math.sin(t * 0.9 + (g === chief ? 1 : 0)) * 0.7;
      g.userData.r1.material.color.setRGB(0.75 + 0.25 * Math.abs(Math.sin(t * 3)), 0.1, 0.12);
    }
    scenery.update(t, dt);
    syncGuide(t, dt);
    dots.material.opacity = 0.55 + 0.35 * Math.sin(t * 4);
    if (marker.visible) { markerT += dt; marker.scale.setScalar(1 + Math.sin(markerT * 8) * 0.12); }


    /* カメラはあなたを追う */
    /* カメラ: 少し先 (歩く向き) を見る。ホイール・2本指で寄る / 引く */
    /* 縦持ちは横に見える幅が狭いので、引いて見せ、次の行き先の方へ大きめに寄せる */
    const portrait = window.innerHeight > window.innerWidth;
    const ahead = new THREE.Vector3(vel.x * (portrait ? 0.5 : 0.32) * T, 0, vel.y * 0.32 * T);
    if (portrait && !busy) {
      const g = guideTarget();
      if (g) ahead.x += THREE.MathUtils.clamp(g.x - pos.x, -4, 4) * 0.35 * T;
    }
    tmp.copy(me.position).add(ahead).addScaledVector(CAM_OFFSET, zoom * (portrait ? 1.5 : 1));
    camera.position.lerp(tmp, Math.min(1, dt * 3.5));
    look.lerp(tmp.copy(me.position).add(ahead).setY(0.9), Math.min(1, dt * 5));
    camera.lookAt(look);
    grade.uniforms.uTime.value = t % 10;
    /* 近くの相手の足もとの輪 */
    const fp = nearby ? posOf(nearby) : null;
    focus.visible = !!fp && !busy;
    if (fp) { focus.position.copy(world(fp, 0.03)); focus.scale.setScalar(1 + Math.sin(t * 5) * 0.06); focus.material.opacity = 0.55 + 0.3 * Math.sin(t * 5); }

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
    window.removeEventListener('blur', onBlur);
    clearTimeout(wakeTimer);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    hideTitleBack();
    for (const d of disposables) if (d && d.dispose) d.dispose();
    composer.dispose && composer.dispose();
    renderer.dispose();
    root.remove();
    finish(result);
  }
  /* 「タイトル」: 会話や確認の最中は戻らない。押されてもボタンは出したままにする (前は消えたまま戻せなかった) */
  const onTitle = () => { if (busy) { showTitleBack(onTitle); return; } close(null); };
  showTitleBack(onTitle);

  /* はじめて来たら、目覚めの会話から */
  if (isNext('c0-wake')) wakeTimer = setTimeout(() => runScene('c0-wake'), 700);

  return done;
}
