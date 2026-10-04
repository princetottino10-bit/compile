/* =========================================================================
 * カードを選ぶときの手助け (盤面・手札の対象選択)
 *   - 選べるカードの上に、脈打つ矢印 (どれを押せばいいか一目で分かるように)
 *   - 何枚か選ぶときは、選んだカードに ① ② … (選んだ順。効果の光の順番の札と同じ形)
 *   - 候補にカーソルを乗せる / 長押しすると、選んだら何が起きるかを札の上に出す
 *     (効果全体の見通しは、その札の吹き出しとは別のウインドウとして横に出す)
 *   - 選択の帯が候補に重なるときは、画面の上へよける
 *   - 選べないカードを押したら、選べない理由を短く出す
 *   位置は毎フレーム、カードの3Dの外形を画面に写して合わせる (手札が持ち上がっても追いかける)
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';

const box = new THREE.Box3();
const v = new THREE.Vector3();

export function createPickAid(stage, board) {
  let layer = null;
  let run = null;          // { cands: [uid], chosen: [uid], multi, marks: Map<uid, el>, ribbon, raf }
  let tip = null;          // 予告の札 { el, uid }
  let reasonTimer = 0;

  function ensureLayer() {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement('div');
    layer.id = 'pickAid';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    return layer;
  }

  /* カードの画面上の外形 (見えていなければ null) */
  function rectOf(uid) {
    const card = board.cards.get(uid);
    if (!card || !card.visible) return null;
    box.setFromObject(card);
    if (box.isEmpty()) return null;
    const r = stage.renderer.domElement.getBoundingClientRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(stage.camera);
      if (v.z > 1) return null;
      const sx = r.left + (v.x + 1) / 2 * r.width, sy = r.top + (1 - v.y) / 2 * r.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { left: x0, top: y0, right: x1, bottom: y1, cx: (x0 + x1) / 2 };
  }

  /* 見通しのウインドウは、吹き出しの右 (入らなければ左) に、少し間をあけて置く */
  function placeLater() {
    if (!tip || !tip.later) return;
    const lw = tip.later;
    const anchor = tip.el.hidden ? null : tip.el.getBoundingClientRect();
    const r = anchor || rectOf(tip.uid);
    if (!r) return;
    const w = lw.offsetWidth, h = lw.offsetHeight;
    let x = r.right + 10;
    if (x + w > window.innerWidth - 8) x = r.left - 10 - w;
    const y = Math.max(8, Math.min(window.innerHeight - h - 8, anchor ? r.top : r.top - h - 8));
    lw.style.left = Math.max(8, x) + 'px';
    lw.style.top = y + 'px';
  }

  function frame() {
    if (!run) return;
    for (const [uid, el] of run.marks) {
      const r = rectOf(uid);
      if (!r) { el.hidden = true; continue; }
      el.hidden = false;
      const n = run.chosen.indexOf(uid);
      el.classList.toggle('chosen', n >= 0);
      el.textContent = n >= 0 ? (run.multi ? String(n + 1) : '✓') : '';
      /* 矢印も選んだ順番も、カードの上辺の真ん中 (右上の角だと、重なった手札では隣のカードの上に出ていた) */
      el.style.left = r.cx + 'px'; el.style.top = (n >= 0 ? r.top + 14 : r.top) + 'px';
    }
    if (tip) {
      const r = rectOf(tip.uid);
      if (r) { tip.el.style.left = r.cx + 'px'; tip.el.style.top = (r.top - 26) + 'px'; }
      placeLater();
    }
    /* 帯のよけ: 候補のどれかに重なっていたら上へ (自分で動かした帯はそのまま) */
    if (run.ribbon && run.ribbon.isConnected && !run.ribbon.classList.contains('dragging') && !run.userMoved()) {
      const rb = run.ribbon.getBoundingClientRect();
      const hit = run.cands.some((u) => {
        const r = rectOf(u);
        return r && r.left < rb.right && r.right > rb.left && r.top < rb.bottom && r.bottom > rb.top;
      });
      if (hit && !run.ribbon.classList.contains('pa-top')) run.ribbon.classList.add('pa-top');
    }
    run.raf = requestAnimationFrame(frame);
  }

  return {
    /* 選択が始まった / 選び直した。opts: { cands, chosen, multi, ribbon, userMoved } */
    show(opts) {
      const L = ensureLayer();
      if (!run) run = { marks: new Map(), raf: 0 };
      run.cands = opts.cands.slice();
      run.chosen = (opts.chosen || []).slice();
      run.multi = !!opts.multi;
      run.ribbon = opts.ribbon || null;
      run.userMoved = opts.userMoved || (() => false);
      for (const [uid, el] of run.marks) if (run.cands.indexOf(uid) < 0) { el.remove(); run.marks.delete(uid); }
      for (const uid of run.cands) {
        if (run.marks.has(uid)) continue;
        const el = document.createElement('b');
        el.className = 'pa-mark';
        L.appendChild(el);
        run.marks.set(uid, el);
      }
      cancelAnimationFrame(run.raf);
      frame();
    },
    hide() {
      if (run) { cancelAnimationFrame(run.raf); for (const el of run.marks.values()) el.remove(); run = null; }
      this.untip();
    },
    /* 選んだら何が起きるか (html) を、そのカードの上に出す。
       later (効果全体の見通し) は、吹き出しとは別のウインドウとして横に並べる */
    tip(uid, html, later) {
      if (!html && !later) { this.untip(); return; }
      if (tip && tip.uid === uid) return;
      this.untip();
      const el = document.createElement('div');
      el.className = 'pa-tip';
      el.innerHTML = html || '';
      el.hidden = !html;
      ensureLayer().appendChild(el);
      let lw = null;
      if (later) {
        lw = document.createElement('div');
        lw.className = 'pa-forecast';
        lw.innerHTML = later;
        ensureLayer().appendChild(lw);
      }
      tip = { el, uid, later: lw };
      if (!run) { const r = rectOf(uid); if (r) { el.style.left = r.cx + 'px'; el.style.top = (r.top - 26) + 'px'; } placeLater(); }
    },
    untip() { if (tip) { tip.el.remove(); if (tip.later) tip.later.remove(); tip = null; } },
    tipUid() { return tip ? tip.uid : null; },
    /* 選べないカードを押した: その上に理由を短く */
    reason(uid, text) {
      const r = rectOf(uid);
      if (!r || !text) return;
      const el = document.createElement('div');
      el.className = 'pa-reason';
      el.textContent = text;
      el.style.left = r.cx + 'px';
      el.style.top = (r.top - 10) + 'px';
      ensureLayer().appendChild(el);
      clearTimeout(reasonTimer);
      for (const old of ensureLayer().querySelectorAll('.pa-reason')) if (old !== el) old.remove();
      reasonTimer = setTimeout(() => el.remove(), 1600);
    }
  };
}
