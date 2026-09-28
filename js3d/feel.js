/* =========================================================================
 * 手触りの小さな演出 (docs/design-resources.md の「モーション・エフェクト」を素の CSS / JS で)
 *   - 合計値が変わったら、そのラインの上に「+3」「−2」が浮かぶ (Kinetics 系の数字の動き)
 *   - ラインがコンパイル圏に入った瞬間、光の輪と「READY」(CSS Text Effects 系)
 *   - CPU が考えている間、相手の名札の横に三重のリング (Circle Loaders 系。オンラインの待ちと同じ形)
 *   - 手応えの震え (スマホの振動。対応している端末だけ)
 *   動きを減らす設定では、浮かぶ数字と輪は出さず、震えもしない
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';

const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const v = new THREE.Vector3();

/* 3D の位置 → 画面の位置 (見えていなければ null) */
function toScreen(stage, pos) {
  v.copy(pos).project(stage.camera);
  if (v.z > 1) return null;
  const r = stage.renderer.domElement.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
}

function layer() {
  let el = document.getElementById('feelLayer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'feelLayer';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
}

/** 合計値の増減を、その位置から浮かせる。delta > 0 は明るい色、< 0 は赤み */
export function floatDelta(stage, pos, delta, color) {
  if (calm() || !delta) return;
  const p = toScreen(stage, pos);
  if (!p) return;
  const el = document.createElement('b');
  el.className = 'fl-delta ' + (delta > 0 ? 'up' : 'down') + (delta <= -5 ? ' big' : '');
  el.textContent = (delta > 0 ? '+' : '−') + Math.abs(delta);
  if (color) el.style.setProperty('--fc', color);
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  layer().appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

/** コンパイル圏に入った: その位置に「READY」 */
export function readyBurst(stage, pos, color) {
  if (calm()) return;
  const p = toScreen(stage, pos);
  if (!p) return;
  const el = document.createElement('div');
  el.className = 'fl-ready';
  el.innerHTML = '<i></i><b data-text="READY">READY</b>';
  if (color) el.style.setProperty('--fc', color);
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  layer().appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

/** CPU が考えている間の印 (相手の名札の横)。短い考えではちらつかないよう、少し待ってから出す */
let thinkTimer = null;
export function setThinking(on) {
  clearTimeout(thinkTimer);
  const tag = document.getElementById('vsTag');
  const old = document.getElementById('aiThink');
  if (!on) { if (old) old.remove(); return; }
  thinkTimer = setTimeout(() => {
    if (!tag || tag.hidden || document.getElementById('aiThink')) return;
    const el = document.createElement('span');
    el.id = 'aiThink';
    el.className = 'ai-think';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', '相手が考えています');
    el.innerHTML = '<i></i><i></i><i></i>';
    tag.appendChild(el);
  }, 250);
}

/** 手応えの震え (ms か [ms, 休み, ms…])。対応していない端末 (iPhone など) では何もしない */
export function buzz(pattern) {
  try {
    if (calm() || !navigator.vibrate) return;
    /* まだ画面に触れていないと、ブラウザが振動を断ってエラーを出す (CPU どうしの観戦など) */
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(pattern);
  } catch (e) { /* 震えなくても遊べる */ }
}
