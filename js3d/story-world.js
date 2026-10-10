/* =========================================================================
 * ストーリーの歩ける世界 (three.js)。章ごとの地図 (story-map.js の MAPS) を歩く。
 *   序章「起動」= 夜の、人のいない研究所 / 1章「順路」= 閉館した水族館 (案8)
 *   あなた = 機体4097 (顔のない人型。胸の青い灯)。紫苑 = ちびキャラ。警備 = 車輪で動く警備ロボット。
 *   動かし方: WASD / 矢印キー、または床をタップ (クリック) した所へ歩く。E / Enter / Space か「話す」ボタンで話しかける。
 *   出来事 (story-map.js の events) で会話 (story-ui.js の playNode) や対戦の確認を出す。
 *   openWorld(protocols, opts) → { battle: 場面 } (対戦を始める) / { reopen: true } (章が終わり、次の章の地図を開き直す) / null (タイトルへ)
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { showTitleBack, hideTitleBack } from './titleback.js';
import { loadStory, saveStory, blankStory, currentNode, clearNode, startBattle, nodeById, isCleared, chapterCleared, chapterOf, addFound } from './story.js';
import { accountState } from './account.js';
import * as M from './story-map.js';
import { playNode, playScene, askBattle } from './story-ui.js';
import { buildScenery } from './story-scenery.js';
import { buildAquarium } from './story-scenery-aquarium.js';
import { RoomEnvironment } from '../vendor/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';

const T = 2;
const HERO_VER = 2;            // 主人公の glb を作り直したら上げる (古いモデルがしばらく出るのを防ぐ)
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;   // タッチの端末 (キーの印を出さない)                 // 1マスの大きさ (three.js の単位)
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
  let state = loadStory();
  const chapter = chapterOf(state);
  const map = M.mapFor(chapter.id);
  const aquarium = map.look === 'aquarium';

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
  /* 記録: この章で終えた会話をもう一度見る (前は一度見た場面を見直せなかった)。見るだけで、進み具合は変わらない */
  const recallBtn = document.createElement('button');
  recallBtn.type = 'button';
  recallBtn.className = 'sw-recall';
  recallBtn.textContent = '記録';
  recallBtn.title = 'この章で見た会話をもう一度見る';
  root.appendChild(recallBtn);
  recallBtn.onclick = () => {
    if (busy) return;
    const seen = (chapter.nodes || []).filter(n => n.kind === 'scene' && isCleared(state, n.id));
    let box = root.querySelector('.sw-recall-list');
    if (box) { box.remove(); return; }
    box = document.createElement('div');
    box.className = 'sw-recall-list';
    const frags = (map.fragments || []).filter(f => (state.found || []).includes(f.id));
    const fragHtml = (map.fragments || []).length ? '<b>拾った記録 ' + frags.length + ' / ' + map.fragments.length + '</b>' +
      frags.map(f => '<p>機体' + (f.unit | 0) + ' の最後の一手</p>').join('') : '';
    box.innerHTML = fragHtml + (seen.length
      ? '<b>見た会話</b>' + seen.map(n => '<button type="button" data-node="' + String(n.id).replace(/[<>&"]/g, '') + '">' + String(n.title || n.id).replace(/[<>&"]/g, '') + '</button>').join('')
      : '<b>見た会話</b><p>まだありません。この章で話を進めると、ここから見直せます</p>');
    root.appendChild(box);
    box.onclick = async (ev) => {
      const b = ev.target.closest('[data-node]');
      if (!b || busy) return;
      box.remove();
      busy = true;
      keys.clear(); path = null;
      try { await playNode(nodeById(b.dataset.node)); } finally { busy = false; }
    };
  };
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
  renderer.toneMappingExposure = aquarium ? 0.9 : 0.8;   // 夜の研究所 / 水槽の明かりだけの水族館
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const bg = aquarium ? 0x02070f : COLORS.navy;
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.FogExp2(bg, aquarium ? 0.024 : 0.018);
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
  const scenery = (aquarium ? buildAquarium : buildScenery)(scene, map, keep);
  const term = scenery.term || null;           // 研究所の端末 (序章だけ)
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

  /* あなた (機体4097) の3Dモデル: Blender で作った art/models/hero4097.glb (scripts/blender/chibi_rig.py。見た目の決まりは
     .claude/skills/compile-cast/hero-4097.md)。読めたら、仮の人型と入れ替える。読めなければ仮の人型のまま。
     アニメ調に見せるため、色はトゥーン (3段の陰)、外側に黒い縁 (裏返した殻) を付ける。腕と足は付け根で振る */
  let heroModel = null;
  const heroLimbs = {};
  const toonRamp = keep(new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat));
  toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  const outlineMat = keep(new THREE.MeshBasicMaterial({ color: 0x0b0f18, side: THREE.BackSide }));
  new GLTFLoader().load('art/models/hero4097.glb?v=' + HERO_VER, (gltf) => {
    const g = gltf.scene;
    if (closed) { g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); return; }   // 閉じたあとに読み終えた
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });    // 先に集める (縁を足しながらたどると、足した縁もたどってしまう)
    meshes.forEach((o) => {
      keep(o.geometry);
      const src = o.material;
      src.dispose && setTimeout(() => src.dispose(), 0);     // 元の材質は置き換えたら要らない
      const core = src.name === 'Core';
      o.material = keep(core ? new THREE.MeshBasicMaterial({ color: 0x6ff0ff })
        : new THREE.MeshToonMaterial({ color: src.color, gradientMap: toonRamp, emissive: src.color.clone().multiplyScalar(0.32) }));   // 紫苑の絵 (光を受けない) と明るさをそろえる
      if (!core) {
        const hull = new THREE.Mesh(o.geometry, outlineMat);     // 縁: 同じ形を少し大きく、裏側だけ描く
        hull.scale.setScalar(1.035);
        o.add(hull);
      }
    });
    for (const n of ['LegL', 'LegR', 'ArmL', 'ArmR']) heroLimbs[n] = g.getObjectByName(n);
    heroModel = new THREE.Group();
    g.scale.setScalar(1.12);                  // 紫苑のちびと背丈をそろえる
    heroModel.add(g);
    me.add(heroModel);
    body.visible = false;
    meLight.intensity = 0.25;                 // 白い外套が胸の灯で白く飛ばないように
  }, undefined, () => { /* 読めなければ仮の人型のまま */ });
  const joined = () => chapter.id !== 'ch0' || isCleared(state, 'c0-practice');
  /* 相棒になったあとは、あなたの少し後ろ (左が壁なら同じ所) に立つ */
  const behind = M.walkable(map, state, Math.floor(pos.x - 1.2), Math.floor(pos.y)) ? { x: pos.x - 1.2, y: pos.y } : { ...pos };
  let shionPos = joined() || !shionAt ? behind : { x: shionAt.x + 0.5, y: shionAt.y + 0.5 };
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
  const chiefPos = chiefAt ? { x: chiefAt.x + 0.5, y: chiefAt.y + 0.5 } : { x: -99, y: -99 };
  const chief = drone(0.8, COLORS.pink);
  const chiefShadow = blob(2.4);
  chief.position.copy(world(chiefPos, 0));
  chief.scale.setScalar(1);

  /* 瑠璃 (1章の案内係): ちびキャラの絵ができるまでの仮の姿。水色の制服の人型と、頭のクラゲ (半透明の傘)。
     名乗るまでは名札を「案内係」にする */
  const ruriAt = M.find(map, 'R')[0];
  const ruriPos = ruriAt ? { x: ruriAt.x + 0.5, y: ruriAt.y + 0.5 } : { x: -99, y: -99 };
  const ruri = new THREE.Group();
  if (ruriAt) {
    const uni = keep(new THREE.MeshStandardMaterial({ color: 0xe8eef6, roughness: 0.6 }));
    const navy = keep(new THREE.MeshStandardMaterial({ color: 0x223a6b, roughness: 0.6 }));
    const hair = keep(new THREE.MeshStandardMaterial({ color: 0x9fdcf0, roughness: 0.5 }));
    const skirt = new THREE.Mesh(keep(new THREE.ConeGeometry(0.3, 0.5, 18)), navy);
    skirt.position.y = 0.62;
    const top = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.17, 0.3, 6, 14)), uni);
    top.position.y = 1.02;
    const headR = new THREE.Mesh(keep(new THREE.SphereGeometry(0.18, 20, 14)), hair);
    headR.position.y = 1.42;
    const tails = [-0.2, 0.2].map((x) => { const t = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8)), hair); t.position.set(x, 1.3, -0.04); return t; });
    const jelly = new THREE.Mesh(keep(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
      keep(new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.55 })));
    jelly.position.set(0.08, 1.58, 0);
    const shins = [-0.08, 0.08].map((x) => { const l = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.05, 0.3, 4, 8)), uni); l.position.set(x, 0.22, 0); return l; });
    const glow = new THREE.PointLight(0x7fdcff, 1.2, 3);
    glow.position.set(0, 1.6, 0.4);
    ruri.add(skirt, top, headR, jelly, glow, ...tails, ...shins);
    ruri.userData = { jelly };
    ruri.position.copy(world(ruriPos, 0));
    scene.add(ruri);
    blob(1.1).position.copy(world(ruriPos, 0.015));
  } else ruri.visible = false;

  /* 記録の断片: 床の上で、ゆっくり回って光る小さな欠片。拾うと消える */
  const fragMat = keep(new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.9, toneMapped: false }));
  const fragGeo = keep(new THREE.OctahedronGeometry(0.16, 0));
  const fragGlowGeo = keep(new THREE.SphereGeometry(0.42, 16, 10));
  const fragGlowMat = keep(new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const frags = (map.fragments || []).map((f) => {
    const m = M.find(map, f.at)[0];
    const p = { x: m.x + 0.5, y: m.y + 0.5 };
    const mesh = new THREE.Mesh(fragGeo, fragMat);
    mesh.position.copy(world(p, 0.7));
    mesh.visible = !(state.found || []).includes(f.id);
    const glow = new THREE.Mesh(fragGlowGeo, fragGlowMat);       // 点光源は使わない (拾ったときに光源の数が変わると、スマホで一瞬止まる)
    mesh.add(glow);
    scene.add(mesh);
    return { ...f, p, mesh, fragment: true, label: '拾う' };
  });
  const closeRecall = () => { const l = root.querySelector('.sw-recall-list'); if (l) l.remove(); };
  let lastZone = null;
  const heard = new Set();

  /* 名前の札 (画面の上に重ねる) */
  const labels = [
    { el: document.createElement('span'), text: '紫苑', obj: shion, y: 2.05, show: () => true },
    { el: document.createElement('span'), text: '巡回の警備機体', obj: patrol, y: 1.6, show: () => patrol.visible },
    { el: document.createElement('span'), text: '警備主任', obj: chief, y: 2.4, show: () => chief.visible },
    { el: document.createElement('span'), text: '端末', obj: term, y: 1.8, show: () => true },
    { el: document.createElement('span'), text: '案内係', obj: ruri, y: 2.0, show: () => !!ruriAt, name: () => (isCleared(state, 'c1-ruri') ? '瑠璃' : '案内係') },
    /* 調べられる物の名札 */
    ...(map.looks || []).map(l => { const m = M.find(map, l.at)[0]; const o = new THREE.Object3D(); if (m) o.position.copy(world({ x: m.x + 0.5, y: m.y + 0.5 }, 0));
      return { el: document.createElement('span'), text: l.name, obj: m ? o : null, y: 1.7, show: () => true }; })
  ].filter(l => l.obj);
  for (const l of labels) { l.el.textContent = l.text; labelsEl.appendChild(l.el); }

  const syncActors = () => {
    patrol.visible = route.length >= 2 && !isCleared(state, 'c0-lock');      /* 扉が開いたら、主任へ知らせに行っていなくなる */
    chief.visible = !!chiefAt && !isCleared(state, 'c0-chief');
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
  let closed = false;     // close() を2回通らない
  let wakeTimer = 0;      // 目覚めの会話を出すまでの待ち (閉じたら止める)
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
  canvas.addEventListener('pointerdown', () => { const l = root.querySelector('.sw-recall-list'); if (l) l.remove(); });   // 記録の一覧は、床を押したら閉じる
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
  const markAt = (ch) => { const m = M.find(map, ch)[0]; return m ? { x: m.x + 0.5, y: m.y + 0.5 } : null; };
  const posOf = (ev) => ev.fragment ? ev.p : (ev.at === 'K' ? shionPos : ev.at === 'c' ? chiefPos : ev.at === 'R' ? ruriPos
    : ev.at === 'T' && termAt ? { x: termAt.x + 0.5, y: termAt.y + 1.5 } : ev.look ? markAt(ev.at) : null);
  /* 調べられる物 (地図の looks)。話の進み具合と関係なく読める */
  const looks = (map.looks || []).map(l => ({ ...l, look: true, label: '調べる' }));

  let finish;
  const done = new Promise((resolve) => { finish = resolve; });

  async function runScene(id) {
    if (busy || closed) return;              // 「記録」で見ている会話や、ほかの会話と重ねない
    busy = true;
    closeRecall();
    nearby = null;                           // 押しっぱなしのキーで、終えた場面をもう一度始めない
    actBtn.hidden = true;                    // 会話のあいだは「話す・調べる」を隠す
    keys.clear(); path = null;
    try { await playNode(nodeById(id)); } catch (e) { busy = false; throw e; }
    state = clearNode(state, id);
    state = saveStory(state);
    syncActors();
    /* 章の最後の会話が終わった (XP を足し終えるまで動かさない。タイトルも押させない) */
    if (chapterCleared(state, chapter.id)) {
      if (opts.onChapterClear) await opts.onChapterClear(chapter.id);
      busy = false;
      /* 次の章があれば、その地図を開き直す */
      close(currentNode(state) ? { reopen: true } : null);
      return;
    }
    busy = false;
    /* 会話のすぐあとが、その場の人との対戦なら、そのまま確認を出す */
    const next = currentNode(state);
    if (next && next.kind !== 'scene') {
      const ev = eventFor(next.id);
      if (ev && (ev.kind === 'talk' || ev.kind === 'inspect') && dist(posOf(ev), pos) < REACH + 1.5) await runBattle(next.id);
    }
  }
  async function runBattle(id) {
    if (busy || closed) return;
    busy = true;
    nearby = null;
    actBtn.hidden = true;
    keys.clear(); path = null;
    const ok = await askBattle(nodeById(id), protocols);
    busy = false;
    if (!ok) return;
    /* 管理者の「飛ばす」: 勝った扱いにして地図に残る (決着の会話は出ない) */
    if (ok === 'skip') { state = saveStory(clearNode(state, id)); syncActors(); startAuto(); return; }
    state = saveStory(startBattle(state, id));
    close({ battle: nodeById(id) });
  }
  /* 記録の断片を拾う: 読んで、進み具合 (found) に残す。光る欠片は消える */
  async function pickFragment(f) {
    closeRecall();
    busy = true;
    nearby = null;
    actBtn.hidden = true;
    keys.clear(); path = null;
    try {
      await playScene(f.lines, { title: '記録の断片' });
      state = saveStory(addFound(state, f.id));
      f.mesh.visible = false;
    } finally { busy = false; }
  }
  async function readLook(l) {
    busy = true;
    nearby = null;
    actBtn.hidden = true;
    keys.clear(); path = null;
    try { await playScene(l.lines, { title: l.name }); } finally { busy = false; }
  }
  function act() {
    if (!nearby || busy) return;
    if (nearby.look) { readLook(nearby); return; }
    if (nearby.fragment) { pickFragment(nearby); return; }
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
    if (!nearby) for (const l of looks) { const p = posOf(l); if (p && dist(p, pos) < REACH) nearby = l; }
    if (!nearby) for (const f of frags) { if (f.mesh.visible && dist(f.p, pos) < REACH) nearby = f; }
    if (nearby) {
      actBtn.hidden = false;
      actBtn.textContent = (nearby.label || (nodeById(nearby.node).kind === 'battle' ? '向き合う' : '話す')) + (TOUCH ? '' : '  [E]');
    } else actBtn.hidden = true;
    /* 区画に入ると始まる会話 */
    for (const ev of Object.values(map.events)) {
      if (ev.kind === 'zone' && isNext(ev.node) && M.zoneAt(map, pos) === ev.zone) { runScene(ev.node); return; }
    }
    /* 区画に入ると流れる放送 (map.ambient。話は進まない)。地図を開いているあいだ、区画ごとに1度。2つ聞いたら手がかりの一言 */
    const amb = map.ambient;
    const z = M.zoneAt(map, pos);
    if (amb && z !== lastZone && isCleared(state, amb.after) && !isCleared(state, amb.until)) {
      lastZone = z;
      if (amb.zones[z] && !heard.has(z)) {
        heard.add(z);
        const lines = amb.zones[z].concat(heard.size === 2 && amb.hint ? amb.hint : []);
        readLines(lines).catch(() => { busy = false; });
      }
    }
  };
  async function readLines(lines) {
    closeRecall();
    busy = true;
    nearby = null;
    actBtn.hidden = true;
    keys.clear(); path = null;
    try { await playScene(lines); } finally { busy = false; }
  }

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
    if (heroModel) {
      heroModel.rotation.y = body.rotation.y;
      const sw = stepping ? Math.sin(meStep) * 0.5 : 0;
      if (heroLimbs.LegL) { heroLimbs.LegL.rotation.x = sw; heroLimbs.LegR.rotation.x = -sw; }
      if (heroLimbs.ArmL) { heroLimbs.ArmL.rotation.x = -sw * 0.8; heroLimbs.ArmR.rotation.x = sw * 0.8; }
    }
    me.position.copy(world(pos, stepping ? Math.abs(Math.sin(meStep)) * (heroModel ? 0.06 : 0.04) : 0));
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
    if (ruriAt) { ruri.rotation.y = Math.atan2(pos.x - ruriPos.x, pos.y - ruriPos.y); ruri.userData.jelly.position.y = 1.58 + Math.sin(t * 1.6) * 0.03; }
    for (const f of frags) if (f.mesh.visible) { f.mesh.rotation.y = t * 1.2; f.mesh.position.y = 0.7 + Math.sin(t * 2 + f.p.x) * 0.06; }
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
      if (l.name) { const n = l.name(); if (l.el.textContent !== n) l.el.textContent = n; }
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
    if (closed) return;
    closed = true;
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
    bloom.dispose();                         // composer.dispose は自分の描き先しか片付けない
    grade.material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();             // 章を開き直すたびに WebGL の文脈が残らないように
    root.remove();
    finish(result);
  }
  /* 「タイトル」: 会話や確認の最中は戻らない。押されてもボタンは出したままにする (前は消えたまま戻せなかった) */
  const onTitle = () => { if (busy) { showTitleBack(onTitle); return; } close(null); };
  showTitleBack(onTitle);

  /* 来たら始まる会話 (目覚め・朝・決着のあとの会話) */
  function startAuto() {
    const auto = Object.values(map.events).find(e => e.kind === 'auto' && isNext(e.node));
    clearTimeout(wakeTimer);
    if (auto) wakeTimer = setTimeout(() => runScene(auto.node), 700);
  }
  startAuto();

  return done;
}
