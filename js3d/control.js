/* =========================================================================
 * 3Dビュー: コントロールコンポーネント (実卓の物理マーカー)
 *   コントロールトラッカー (control-tracker.html) と同じ意匠のマーカー:
 *   角を落とした三角形の枠に、三方へ腕の伸びた窓と中心の丸。
 *   盤面左脇に置かれ、保持者の側へ滑って移動する。
 *   中立 (-1) は中央で淡く、保持中は保持者の色で強く光る。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import * as TW from './tween.js';
import { sfx } from './audio.js';
import { shockwave } from './fx.js';
import { VIEW } from './theme.js';

const X_WIDE = -2.85;         // lane0 とトラッシュの間の余白
/* 縦持ちはレーンの外側の細い余白へ寄せ、小さくする (山札・捨て札と同じ扱い) */
const X = () => X_WIDE + (-2.52 - X_WIDE) * VIEW.k;
const SCALE = () => 1 - 0.38 * VIEW.k;
/* 横持ちのスマホは自分の捨て札を奥へ寄せる (layout.js の pilePos) ので、マーカーも板の側に寄せて捨て札に重ねない */
const Z = { neutral: 0, get me() { return VIEW.short ? 0.72 : 1.35; }, get opp() { return VIEW.short ? -0.72 : -1.35; } };
const MINT = 0xa07bff, PINK = 0xff4fa3, DIM = 0x44536e;
/* 見た目 (レベルの報酬): 自分が持ったときの色と、中立のときの色 */
const MARKER_STYLES = {
  default: { me: MINT, dim: DIM }, gold: { me: 0xffd86a, dim: 0x6e5d34 },
  crystal: { me: 0x7ff3ff, dim: 0x2c5c66 }, crimson: { me: 0xff5a6e, dim: 0x5e2430 }, prism: { me: 0xf4f0ff, dim: 0x5d5670 },
  /* ガチャの見た目 */
  emerald: { me: 0x3ff0a0, dim: 0x245c44 }, amber: { me: 0xffa640, dim: 0x5e4220 }, sapphire: { me: 0x4f8cff, dim: 0x22345e },
  obsidian: { me: 0x2b2238, dim: 0x15101c }, nova: { me: 0xfff4c8, dim: 0x6b5e3a }
};

/* トラッカーのマーカー画像 (2048px) の輪郭を、中心をそろえて 120° 対称に整えたもの。
   単位はワールド座標 (外形の半径 ≈ 0.42)、y は上向き */
const OUTER = [[-0.064, 0.415], [-0.392, -0.152], [-0.328, -0.263], [0.328, -0.263], [0.392, -0.152], [0.064, 0.415]];
const WINDOW = [[-0.078, 0.223], [0.078, 0.223], [0.078, 0.133], [0.155, 0.001], [0.232, -0.044], [0.154, -0.179],
  [0.076, -0.135], [-0.076, -0.135], [-0.154, -0.179], [-0.232, -0.044], [-0.155, 0.001], [-0.078, 0.133]];
const DOT_R = 0.079;
const THICK = 0.05;

function tokenGeometry() {
  const shape = new THREE.Shape(OUTER.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.holes.push(new THREE.Path(WINDOW.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: THICK, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2
  });
  /* 押し出しは +z 方向。卓に寝かせ、厚みの中心を y=0 に */
  g.rotateX(-Math.PI / 2);
  g.translate(0, -THICK / 2, 0);
  return g;
}

export function createControlMarker(scene) {
  const grp = new THREE.Group();

  /* 光るのは上面だけ。側面まで光らせると窓の縁がにじんで形が読めない */
  const face = new THREE.MeshStandardMaterial({
    color: 0x0a0f1c, roughness: 0.35, metalness: 0.4,
    emissive: new THREE.Color(DIM), emissiveIntensity: 0.5
  });
  const side = new THREE.MeshStandardMaterial({
    color: 0x0a0f1c, roughness: 0.4, metalness: 0.8,
    emissive: new THREE.Color(DIM), emissiveIntensity: 0.12
  });
  /* ExtrudeGeometry の材質グループ: 0 = 上下の面, 1 = 側面 */
  const puck = new THREE.Mesh(tokenGeometry(), [face, side]);
  puck.castShadow = true;
  /* CylinderGeometry の材質グループ: 0 = 側面, 1 = 上面, 2 = 底面 */
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(DOT_R, DOT_R, THICK + 0.02, 40), [side, face, side]);
  dot.castShadow = true;

  /* 足元の光の輪 */
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.022, 10, 48),
    new THREE.MeshBasicMaterial({ color: DIM, transparent: true, opacity: 0.7 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.03;

  grp.add(puck, dot, ring);
  grp.position.set(X(), 0.06, Z.neutral);
  grp.rotation.y = Math.PI / 6;
  scene.add(grp);

  let holder = -1;
  let spin = 0;
  let style = MARKER_STYLES.default;
  let seat = 0;
  const paint = () => {
    const col = holder === -1 ? style.dim : (holder === seat ? style.me : PINK);
    face.emissive.setHex(col);
    face.emissiveIntensity = holder === -1 ? 0.5 : 1.5;
    side.emissive.setHex(col);
    ring.material.color.setHex(col);
    return col;
  };
  const state = {
    group: grp,
    /* 毎フレーム: 保持中はゆっくり回して「生きている」感を出す */
    tick(dt) {
      spin += dt * (holder === -1 ? 0.15 : 0.55);
      grp.rotation.y = Math.PI / 6 + spin;
      grp.position.x += (X() - grp.position.x) * Math.min(1, dt * 6);   // 向きが変わったら追従
      const sc = SCALE();
      grp.scale.setScalar(grp.scale.x + (sc - grp.scale.x) * Math.min(1, dt * 6));
    },
    /* 見た目の切り替え (設定から) */
    setStyle(key) { style = MARKER_STYLES[key] || MARKER_STYLES.default; paint(); },
    /* me: 自分の座席番号。ctrl: st.control (-1/0/1) */
    update(ctrl, me, animate) {
      if (ctrl === holder) return;
      const from = grp.position.z;
      const to = ctrl === -1 ? Z.neutral : (ctrl === me ? Z.me : Z.opp);
      holder = ctrl;
      seat = me;
      const col = paint();
      if (!animate) { grp.position.z = to; return; }
      /* 獲得/使用の瞬間を衝撃波と音で知らせる */
      sfx(ctrl === -1 ? 'flip' : 'effect');
      shockwave(scene, new THREE.Vector3(X(), 0.1, from), col, 2.2, 500);
      TW.tween(520, (t) => {
        grp.position.z = TW.lerp(from, to, TW.Ease.inOutCubic(t));
        grp.position.y = 0.06 + Math.sin(Math.PI * t) * 0.55;
        grp.rotation.y += 0.22;
      }, TW.Ease.linear, () => {
        shockwave(scene, new THREE.Vector3(X(), 0.1, to), col, 2.8, 620);
        sfx('land');
      });
    },
    has(ctrl) { return holder === ctrl; }
  };
  return state;
}
