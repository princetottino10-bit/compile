/* =========================================================================
 * 勝ち抜き戦の試合中スコア (ライフ表示 #runHud の中の大きな数字)
 *   自分の1手ごとに、動いたラインから「+40」が飛び出してスコアに吸い込まれ、数え上がる。
 *   点 = (ラインの伸び + 相手の減り) × 10 (+ コンパイル 100)、チェーンで × (1 + 0.5 × つながった数)、
 *   さらに COMBO の倍率 (手応えのある手 = 4 以上動かす手 が続くと上がる。小さな手・コンパイルされると切れる)。
 *   SCORE_PER_CREDIT 点ごとにクレジット +1 (1試合 RUN_BONUS_MAX まで、勝てばもらえる)。
 *   途中で読み直しても続きから (sessionStorage。勝ち抜き戦の1戦ごとの鍵)
 * ========================================================================= */
import { sfx } from './audio.js';
import { calm } from './prefs.js';
import { RUN_BONUS_MAX } from './run.js';

export const SCORE_PER_CREDIT = 300;
const COMBO_STEP = 0.25;            // COMBO 1 つごとの倍率
const COMBO_MAX = 12;               // 倍率は 4 倍まで
const COMBO_MIN_SWING = 4;          // これ以上動かした手で COMBO が続く

let key = '';
let st = { score: 0, combo: 0, best: 0 };
const load = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const save = () => { if (key) try { sessionStorage.setItem(key, JSON.stringify(st)); } catch (e) { /* private mode */ } };

/** この1戦のスコアを読み込む (k = 勝ち抜き戦の1戦ごとの鍵) */
export function scoreBegin(k) {
  key = k || '';
  st = { score: 0, combo: 0, best: 0, ...(load(key) || {}) };
  renderScore(false);
}
export const scoreNow = () => st.score | 0;
export const comboMult = (combo = st.combo) => 1 + Math.min(COMBO_MAX, combo | 0) * COMBO_STEP;
/** スコアから、勝てばもらえるクレジット */
export const scoreCredits = (score = st.score) => Math.min(RUN_BONUS_MAX, Math.floor((score | 0) / SCORE_PER_CREDIT));

/** 1手の点 (純粋な計算。テスト用にも) */
export function actionPoints({ swing, chain, compiled }, combo) {
  const base = Math.max(0, swing | 0) * 10 + (compiled ? 100 : 0);
  const chainMul = chain >= 2 ? 1 + 0.5 * (chain - 1) : 1;
  return Math.round(base * chainMul * comboMult(combo));
}

/* ---- 表示 ---- */
function box() { return document.querySelector('#runHud .rs-score'); }
const fmt = (n) => String(n | 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
let shown = 0;
/** ライフ表示の中のスコア欄の HTML (runHud が描くときに入れる) */
export function scoreHtml() {
  shown = st.score | 0;
  const toNext = SCORE_PER_CREDIT - (st.score % SCORE_PER_CREDIT);
  const capped = scoreCredits() >= RUN_BONUS_MAX;
  return '<span class="rs-score" title="試合中スコア: ' + SCORE_PER_CREDIT + ' 点ごとにクレジット +1 (1試合 ' + RUN_BONUS_MAX + ' まで、勝てばもらえる)">' +
    '<small>SCORE</small><b class="rs-num">' + fmt(st.score) + '</b>' +
    '<em class="rs-mult lv' + Math.min(4, Math.floor(st.combo / 3)) + '"' + (st.combo ? '' : ' hidden') + '>×' + comboMult().toFixed(2).replace(/0$/, '') + '</em>' +
    '<i class="rs-bar' + (capped ? ' full' : '') + '"><i style="width:' + (capped ? 100 : ((st.score % SCORE_PER_CREDIT) / SCORE_PER_CREDIT * 100).toFixed(1)) + '%"></i></i>' +
    '<small class="rs-cr">' + (capped ? 'CR MAX' : '+' + scoreCredits() + ' CR ・ あと ' + toNext) + '</small></span>';
}
/* スコア欄だけを描き直す (ライフ表示全体は描き直さない) */
function renderScore(bump) {
  const el = box();
  if (!el) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = scoreHtml();
  const next = tmp.firstChild;
  el.replaceWith(next);
  if (bump && !calm()) next.classList.add('bump');
}

/* 3D の位置 → 画面の位置 */
function screenOf(stage, pos, THREE) {
  const v = new THREE.Vector3().copy(pos).project(stage.camera);
  if (v.z > 1) return null;
  const r = stage.renderer.domElement.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
}

/** 自分の1手を数える。lines = [{ pos (3D), gain (そのラインで稼いだ点の元: 伸び or 減り) }]。返り値 { points, combo, mult, credited } */
export function scoreAction(info, lines, stage, THREE) {
  const before = scoreCredits();
  const keep = (info.swing | 0) >= COMBO_MIN_SWING || info.compiled || info.chain >= 2;
  const combo = keep ? st.combo + 1 : 0;
  const broke = !keep && st.combo >= 3;
  const points = actionPoints(info, keep ? st.combo : 0);
  st = { ...st, combo, score: st.score + points, best: Math.max(st.best | 0, points) };
  save();
  const credited = scoreCredits() - before;
  /* 動いたラインから点を飛ばして、スコアに吸い込ませる。着いたら数え上げる */
  const target = box();
  const tr = target && target.querySelector('.rs-num').getBoundingClientRect();
  const parts = lines.filter(l => l.gain > 0);
  const total = parts.reduce((a, l) => a + l.gain, 0) || 1;
  const fly = calm() || !tr || !stage ? [] : parts.map(l => ({ at: screenOf(stage, l.pos, THREE), pts: Math.round(points * l.gain / total) })).filter(f => f.at);
  if (!fly.length) { renderScore(true); afterCount(credited, broke); return { points, combo, mult: comboMult(), credited }; }
  let landed = 0;
  fly.forEach((f, i) => {
    const el = document.createElement('b');
    el.className = 'rs-pop' + (points >= 200 ? ' big' : '');
    el.textContent = '+' + fmt(f.pts);
    el.style.left = f.at.x + 'px';
    el.style.top = f.at.y + 'px';
    document.body.appendChild(el);
    const dx = tr.left + tr.width / 2 - f.at.x, dy = tr.top + tr.height / 2 - f.at.y;
    const anim = el.animate([
      { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%,-120%) scale(1.35)', opacity: 1, offset: 0.22 },
      { transform: 'translate(-50%,-120%) scale(1.1)', opacity: 1, offset: 0.45 },
      { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.5)', opacity: 0.9 }
    ], { duration: 900 + i * 90, easing: 'cubic-bezier(.5,0,.75,0)' });
    anim.onfinish = () => {
      el.remove();
      sfx('tick');
      if (++landed === fly.length) { countTo(st.score); afterCount(credited, broke); }
    };
  });
  return { points, combo, mult: comboMult(), credited };
}
/* スコア欄の数字を、表示中の数から新しい数まで数え上げる */
function countTo(to) {
  const from = shown;
  renderScore(true);
  const num = box() && box().querySelector('.rs-num');
  if (!num || calm()) return;
  const t0 = performance.now(), ms = 420;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    num.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => { num.textContent = fmt(to); }, ms + 80);
}
function afterCount(credited, broke) {
  const el = box();
  if (credited > 0) {
    sfx('charge');
    if (el) { const c = document.createElement('b'); c.className = 'rs-gain'; c.textContent = '+' + credited + ' CR'; el.appendChild(c); setTimeout(() => c.remove(), 1500); }
  }
  if (broke && el) { const c = document.createElement('b'); c.className = 'rs-gain broke'; c.textContent = 'COMBO BREAK'; el.appendChild(c); setTimeout(() => c.remove(), 1300); }
}
/** 相手にコンパイルされた: COMBO が切れる */
export function scoreHurt() {
  if (!st.combo) return;
  const broke = st.combo >= 3;
  st = { ...st, combo: 0 };
  save();
  renderScore(false);
  if (broke) afterCount(0, true);
}
