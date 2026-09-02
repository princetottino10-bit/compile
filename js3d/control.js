/* =========================================================================
 * 3Dビュー: コントロールコンポーネント (実卓の物理マーカー)
 *   六角形のパックが盤面左脇に置かれ、保持者の側へ滑って移動する。
 *   中立 (-1) は中央で淡く、保持中は保持者の色で強く光る。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import * as TW from './tween.js';
import { sfx } from './audio.js';
import { shockwave } from './fx.js';

const X = -2.85;              // lane0 とトラッシュの間の余白
const Z = { neutral: 0, me: 1.35, opp: -1.35 };
const MINT = 0x6dffc2, PINK = 0xff3b9d, DIM = 0x44536e;

export function createControlMarker(scene) {
  const grp = new THREE.Group();

  const puck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.38, 0.09, 6),
    new THREE.MeshStandardMaterial({
      color: 0x0a0f1c, roughness: 0.35, metalness: 0.7,
      emissive: new THREE.Color(DIM), emissiveIntensity: 0.5
    })
  );
  puck.castShadow = true;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.028, 10, 6),
    new THREE.MeshBasicMaterial({ color: DIM, transparent: true, opacity: 0.85 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.02;

  /* 上面の "CTRL" 刻印 */
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.font = '900 34px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#eaf4ff';
  ctx.fillText('CTRL', 64, 66);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.9 })
  );
  label.rotation.x = -Math.PI / 2;
  label.position.y = 0.047;

  grp.add(puck, ring, label);
  grp.position.set(X, 0.06, Z.neutral);
  grp.rotation.y = Math.PI / 6;
  scene.add(grp);

  let holder = -1;
  let spin = 0;
  const state = {
    group: grp,
    /* 毎フレーム: 保持中はゆっくり回して「生きている」感を出す */
    tick(dt) {
      spin += dt * (holder === -1 ? 0.15 : 0.55);
      grp.rotation.y = Math.PI / 6 + spin;
    },
    /* me: 自分の座席番号。ctrl: st.control (-1/0/1) */
    update(ctrl, me, animate) {
      if (ctrl === holder) return;
      const from = grp.position.z;
      const to = ctrl === -1 ? Z.neutral : (ctrl === me ? Z.me : Z.opp);
      const col = ctrl === -1 ? DIM : (ctrl === me ? MINT : PINK);
      holder = ctrl;
      puck.material.emissive.setHex(col);
      puck.material.emissiveIntensity = ctrl === -1 ? 0.5 : 1.5;
      ring.material.color.setHex(col);
      if (!animate) { grp.position.z = to; return; }
      /* 獲得/使用の瞬間を衝撃波と音で知らせる */
      sfx(ctrl === -1 ? 'flip' : 'effect');
      shockwave(scene, new THREE.Vector3(X, 0.1, from), col, 2.2, 500);
      TW.tween(520, (t) => {
        grp.position.z = TW.lerp(from, to, TW.Ease.inOutCubic(t));
        grp.position.y = 0.06 + Math.sin(Math.PI * t) * 0.55;
        grp.rotation.y += 0.22;
      }, TW.Ease.linear, () => {
        shockwave(scene, new THREE.Vector3(X, 0.1, to), col, 2.8, 620);
        sfx('land');
      });
    },
    has(ctrl) { return holder === ctrl; }
  };
  return state;
}
