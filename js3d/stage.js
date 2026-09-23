/* =========================================================================
 * 3Dビュー: レンダラ / シーン / カメラ / ライト / 床
 *   カメラワーク (寄り・シェイク) と描画ループもここが持つ。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from '../vendor/jsm/environments/RoomEnvironment.js';
import { COLOR, CAMERA, BOARD, CARD, TIMING, VIEW } from './theme.js';
import * as TW from './tween.js';

/* 床: 手続き的なグリッドと、ライン位置のホットバンド */
const floorVert = `
  varying vec2 vXZ;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vXZ = wp.xz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const floorFrag = `
  precision highp float;
  varying vec2 vXZ;
  uniform vec3 uBase;
  uniform vec3 uGrid;
  uniform vec3 uHot;
  uniform float uTime;
  uniform vec3 uLaneX;
  uniform float uLaneHalf;

  float gridLine(vec2 p, float step, float w) {
    vec2 g = abs(fract(p / step - 0.5) - 0.5) / fwidth(p / step);
    float l = min(g.x, g.y);
    return 1.0 - min(l * w, 1.0);
  }

  void main() {
    vec3 col = uBase;

    /* 細かい格子 + 粗い格子 */
    col += uGrid * gridLine(vXZ, 0.5, 1.0) * 0.16;
    col += uGrid * gridLine(vXZ, 2.0, 1.2) * 0.24;

    /* 3ラインの帯 */
    float lane = 0.0;
    for (int i = 0; i < 3; i++) {
      float d = abs(vXZ.x - uLaneX[i]);
      lane = max(lane, 1.0 - smoothstep(uLaneHalf * 0.82, uLaneHalf, d));
    }
    float laneEdge = 0.0;
    for (int i = 0; i < 3; i++) {
      float d = abs(abs(vXZ.x - uLaneX[i]) - uLaneHalf);
      laneEdge = max(laneEdge, 1.0 - smoothstep(0.0, 0.035, d));
    }
    float depthMask = 1.0 - smoothstep(2.4, 4.6, abs(vXZ.y));
    col += uHot * lane * 0.055 * depthMask;
    col += uHot * laneEdge * 0.55 * depthMask;

    /* 中央のスキャンライン */
    float mid = 1.0 - smoothstep(0.0, 0.045, abs(vXZ.y));
    col += uHot * mid * 0.35;
    float sweep = exp(-pow((vXZ.y - sin(uTime * 0.35) * 3.4) * 1.6, 2.0));
    col += uHot * sweep * 0.03;

    /* 遠方フェード */
    float fall = 1.0 - smoothstep(3.0, 11.0, length(vXZ * vec2(0.62, 0.78)));
    col *= fall;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: false, powerPreference: 'high-performance',
    /* キャンバスを PNG で取り出せるようにする (記録・共有用) */
    preserveDrawingBuffer: true
  });
  /* モバイル/小画面は影解像度を落として GPU 負荷を抑える。
     描画解像度 (ピクセル比) は 2 まで許す。1.5 で頭打ちにすると、表示倍率 3 の
     スマホやタッチ対応ノート PC で手札の文字が半分の解像度で描かれてにじんでいた。 */
  const lowPower = Math.min(window.innerWidth, window.innerHeight) < 700
    || (navigator.maxTouchPoints || 0) > 1;
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR.bg);
  scene.fog = new THREE.Fog(COLOR.fog, 11, 24);

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, container.clientWidth / container.clientHeight, CAMERA.near, CAMERA.far);
  camera.position.set(...CAMERA.home.pos);
  const lookTarget = new THREE.Vector3(...CAMERA.home.look);
  camera.lookAt(lookTarget);

  /* --- 環境マップ ---
     カード表面に映り込みを乗せて、平面的な板から「刷られたカード」に寄せる。
     素の RoomEnvironment は明るすぎるので、マテリアル側の envMapIntensity で絞る。 */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.06);
  scene.environment = envRT.texture;

  /* --- ライト --- */
  /* カードの絵が読めることを最優先にする。環境光をやや上げ、当てる光は抑える */
  scene.add(new THREE.AmbientLight(0x6b7f9c, 0.78));

  const key = new THREE.DirectionalLight(0xdce8ff, 0.85);
  key.position.set(2.6, 8.2, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 22;
  key.shadow.camera.left = -7; key.shadow.camera.right = 7;
  key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
  key.shadow.bias = -0.0016;
  key.shadow.radius = 2.4;
  scene.add(key);

  /* 手前と奥の縁取り。強いとカード面が白く飛ぶので、床を染める程度に留める */
  const rimSelf = new THREE.PointLight(COLOR.mint, 2.2, 6.2, 2.4);
  rimSelf.position.set(0, 0.45, 2.55);
  scene.add(rimSelf);

  const rimOpp = new THREE.PointLight(COLOR.pink, 2.0, 6.2, 2.4);
  rimOpp.position.set(0, 0.45, -2.55);
  scene.add(rimOpp);

  /* 手札を正面から起こすフィル (カメラ側から) */
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.42);
  fill.position.set(0, 4.5, 9.5);
  fill.target.position.set(0, 0.4, 3.2);
  scene.add(fill, fill.target);

  /* --- 床 --- */
  const floorMat = new THREE.ShaderMaterial({
    vertexShader: floorVert,
    fragmentShader: floorFrag,
    uniforms: {
      uBase: { value: new THREE.Color(COLOR.floor) },
      uGrid: { value: new THREE.Color(COLOR.grid) },
      uHot: { value: new THREE.Color(COLOR.gridHot) },
      uTime: { value: 0 },
      uLaneX: { value: new THREE.Vector3(...BOARD.laneX) },
      uLaneHalf: { value: 0.74 }
    },
    fog: false
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  scene.add(floor);

  /* 影を受けるだけの面 (床はシェーダなので別に敷く) */
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 24),
    new THREE.ShadowMaterial({ opacity: 0.46 })
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = -0.014;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  /* --- ポストプロセス (発光) ---
     レンダラの antialias はポストプロセスの描画先には効かない。そのままだと
     カードの縁や盤面の線がすべてギザギザになったので、描画先をマルチサンプルにする */
  const drawSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(drawSize.x, drawSize.y, {
    type: THREE.HalfFloatType, samples: lowPower ? 2 : 4
  }));
  composer.setSize(container.clientWidth, container.clientHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.4,    // strength
    0.72,   // radius
    0.95    // threshold
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* --- カメラ制御 --- */
  const camState = {
    pos: camera.position.clone(),
    look: lookTarget.clone(),
    shake: 0,
    shakeDecay: 0
  };

  function setCamera(pos, look, ms, ease) {
    const p0 = camState.pos.clone(), l0 = camState.look.clone();
    const p1 = new THREE.Vector3(...pos), l1 = new THREE.Vector3(...look);
    return TW.tween(ms, (t) => {
      camState.pos.lerpVectors(p0, p1, t);
      camState.look.lerpVectors(l0, l1, t);
    }, ease || TW.Ease.inOutCubic);
  }

  /* 縦長画面では高く・近く・広角にして3レーンを収める */
  function homePose() {
    const k = VIEW.k;
    const p = CAMERA.home.pos;
    return [p[0], p[1] + (12.4 - p[1]) * k, p[2] + (5.2 - p[2]) * k];
  }
  function home(ms) {
    return setCamera(homePose(), CAMERA.home.look, ms === undefined ? 520 : ms);
  }

  /* 指定ワールド座標に寄る。tightness=0 で定位置、1 で最も寄る */
  function focusOn(target, ms, tightness) {
    const k = Math.max(0, Math.min(1, tightness === undefined ? 1 : tightness));
    const hp = CAMERA.home.pos, hl = CAMERA.home.look;
    const F = CAMERA.focus;
    const nearPos = [target.x * F.swing, F.height, target.z + F.pull];
    const nearLook = [target.x * F.lookSwing, 0.15, target.z];
    const mix = (a, b) => a + (b - a) * k;
    return setCamera(
      [mix(hp[0], nearPos[0]), mix(hp[1], nearPos[1]), mix(hp[2], nearPos[2])],
      [mix(hl[0], nearLook[0]), mix(hl[1], nearLook[1]), mix(hl[2], nearLook[2])],
      ms === undefined ? 420 : ms
    );
  }

  /* 決めのカメラ: レーン中心を低い位置から見上げ、ゆっくり回り込む。
     onFrame ではなく tween 内で毎フレーム更新する (演出時間ぶん占有)。 */
  function cinematicHold(target, ms, opts) {
    const o = opts || {};
    const tgt = new THREE.Vector3(target.x, target.y || 0, target.z);
    const radius = o.radius || 3.6;
    const height = o.height || 2.4;
    const startAng = o.startAngle !== undefined ? o.startAngle : -Math.PI / 2 - 0.5;
    const sweep = o.sweep !== undefined ? o.sweep : 1.0;
    const p0 = camState.pos.clone(), l0 = camState.look.clone();
    const easeIn = 0.16;
    return TW.tween(ms, (t) => {
      const ang = startAng + sweep * TW.Ease.inOutCubic(t);
      const camPos = new THREE.Vector3(
        tgt.x + Math.cos(ang) * radius,
        height,
        tgt.z + Math.sin(ang) * radius
      );
      const look = new THREE.Vector3(tgt.x, tgt.y + 0.5, tgt.z);
      /* 最初だけ現在位置から滑らかに入る */
      const blend = Math.min(1, t / easeIn);
      camState.pos.lerpVectors(p0, camPos, blend);
      camState.look.lerpVectors(l0, look, blend);
    }, TW.Ease.linear);
  }

  function shake(strength, ms) {
    camState.shake = strength;
    camState.shakeDecay = strength / Math.max(1, ms || 380);
  }

  /* --- リサイズ --- */
  let appliedW = -1, appliedH = -1;
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    /* 表示倍率が変わった (別モニタへ移動・ブラウザの拡大縮小) ときも取り直す */
    if (renderer.getPixelRatio() !== pixelRatio()) {
      renderer.setPixelRatio(pixelRatio());
      composer.setPixelRatio(pixelRatio());
      appliedW = -1;
    }
    /* 同じ大きさなら何もしない (下の監視経路から何度呼ばれても安全にする) */
    if (w === appliedW && h === appliedH) return;
    if (w < 2 || h < 2) return;                         // 非表示中の 0 サイズは採らない
    appliedW = w; appliedH = h;
    const aspect = w / Math.max(1, h);
    camera.aspect = aspect;
    const prevK = VIEW.k;
    VIEW.k = Math.max(0, Math.min(1, (1.45 - aspect) / (1.45 - 0.6)));
    const prevShort = VIEW.short;
    VIEW.short = h <= 500 && aspect > 1.2;
    camera.fov = CAMERA.fov + 14 * VIEW.k;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    /* 縦横が切り替わったら定位置を取り直す (演出中でも最後に home へ戻る) */
    if (Math.abs(prevK - VIEW.k) > 0.15 || prevShort !== VIEW.short) home(320);
    /* 手札の並びなど、盤面側の配置も取り直させる */
    window.dispatchEvent(new CustomEvent('compile:viewport', { detail: { w, h, k: VIEW.k } }));
  }
  /* 画面の向きが変わった瞬間は、ブラウザがまだ新しい大きさを返さないことがある。
     resize イベント1回に頼ると、それを取りこぼした時点で二度と追従しなくなった。
     実際の大きさの変化を複数の経路で拾い、最後は毎フレームの照合で必ず追いつく。 */
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => {
    resize();
    setTimeout(resize, 120);
    setTimeout(resize, 450);
  });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => resize()).observe(container);
  /* 起動時にも一度判定する (最初から縦で開くスマホで横画面扱いのまま残らないように) */
  resize();

  /* --- ループ --- */
  const frameCbs = [];
  function onFrame(cb) { frameCbs.push(cb); }

  const clock = new THREE.Clock();
  let elapsed = 0;
  let lastTick = 0;

  function loop() {
    requestAnimationFrame(loop);
    tick();
  }

  /* rAF が止まる状況 (タブが裏、ウィンドウ最小化) でも
     トゥイーンだけは進めて、await が永久に返らなくなるのを防ぐ */
  setInterval(() => {
    if (performance.now() - lastTick > 260) tick(true);
  }, 120);

  function tick(catchUp) {
    lastTick = performance.now();
    /* 最後の砦: イベントを全部取りこぼしても、大きさがずれていたらここで合わせる */
    if (container.clientWidth !== appliedW || container.clientHeight !== appliedH) resize();
    /* 通常フレームは 50ms で頭打ち。ウォッチドッグ経由は間隔が長いので緩める */
    const dt = Math.min(catchUp ? 1.2 : 0.05, clock.getDelta());
    elapsed += dt;
    floorMat.uniforms.uTime.value = elapsed;

    TW.update(dt * 1000);
    for (const cb of frameCbs) cb(dt, elapsed);

    camera.position.copy(camState.pos);
    if (camState.shake > 0.0001) {
      camera.position.x += (Math.random() - 0.5) * camState.shake;
      camera.position.y += (Math.random() - 0.5) * camState.shake;
      camera.position.z += (Math.random() - 0.5) * camState.shake * 0.6;
      camState.shake = Math.max(0, camState.shake - camState.shakeDecay * dt * 1000);
    }
    camera.lookAt(camState.look);
    composer.render();
  }
  loop();

  return {
    THREE, renderer, scene, camera, composer, bloom,
    setCamera, home, focusOn, cinematicHold, shake, onFrame, resize,
    lights: { key, rimSelf, rimOpp, fill }
  };
}

/* 着地の衝撃で床に広がるリング */
export function spawnImpactRing(scene, pos, colorHex, scaleTo) {
  /* カードの外周から広がるように、内径をカード幅より大きく取る */
  const geo = new THREE.RingGeometry(0.62, 0.74, 64);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.position.set(pos.x, 0.004, pos.z);   // カードの下。重なった部分はカードが隠す
  ring.renderOrder = 3;
  scene.add(ring);

  const to = scaleTo || 3.0;
  TW.tween(TIMING.impactRing, (t) => {
    const s = 1 + (to - 1) * t;
    ring.scale.set(s, 1, s);
    mat.opacity = 0.95 * (1 - t) * (1 - t);
  }, TW.Ease.outCubic, () => {
    scene.remove(ring);
    geo.dispose(); mat.dispose();
  });
}

/* カードが着地した瞬間の縦方向フラッシュ */
export function spawnFlashPillar(scene, pos, colorHex) {
  const geo = new THREE.CylinderGeometry(CARD.w * 0.52, CARD.w * 0.72, 2.6, 28, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const pillar = new THREE.Mesh(geo, mat);
  pillar.position.set(pos.x, 1.3, pos.z);
  pillar.renderOrder = 3;
  scene.add(pillar);

  TW.tween(TIMING.flashPillar, (t) => {
    pillar.scale.set(1 + t * 0.5, 1 - t * 0.72, 1 + t * 0.5);
    pillar.position.y = 1.3 - t * 0.95;
    mat.opacity = 0.72 * (1 - t) * (1 - t * 0.4);
  }, TW.Ease.outQuart, () => {
    scene.remove(pillar);
    geo.dispose(); mat.dispose();
  });
}
