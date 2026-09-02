/* =========================================================================
 * 3Dビュー: ライン端のプロトコルカード
 *   実物と同じく2面ある板として扱う。
 *     表 = "LOADING..."  (art/Fire.webp)
 *     裏 = "COMPILED"    (art/Fire_Glitched.webp)
 *   コンパイルすると板が裏返り、以後はっきり違う見た目になる。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { COLOR } from './theme.js';
import * as LAYOUT from './layout.js';
import * as TW from './tween.js';
import { drawEmblem } from './emblems.js';

const TEX_W = 512, TEX_H = 232;
const PANEL_W = 1.5, PANEL_D = 0.68;

/* アートが存在するセット (Main 2 / Aux 2 は scripts/build_card_art_2.py で生成) */
const ART_SETS = new Set(['Main 1', 'Aux 1', 'Main 2', 'Aux 2']);
const artCache = new Map();

function loadArt(url, onReady) {
  if (artCache.has(url)) {
    const img = artCache.get(url);
    if (img) onReady(img);
    return;
  }
  const img = new Image();
  img.onload = () => { artCache.set(url, img); onReady(img); };
  img.onerror = () => { artCache.set(url, null); };
  img.src = url;
}

function protoArtUrl(name, compiled) {
  const cap = name.charAt(0) + name.slice(1).toLowerCase();
  return 'art/' + cap + (compiled ? '_Glitched' : '') + '.webp';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rgba(hex, a) {
  const h = String(hex || '#63f3ff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/* 板1面を描く。compiled=true なら「COMPILED」面 */
function paint(ctx, info, art) {
  const W = TEX_W, H = TEX_H;
  const accent = info.color || '#63f3ff';
  const compiled = !!info.compiled;
  ctx.clearRect(0, 0, W, H);

  /* 下地 */
  ctx.fillStyle = compiled ? '#0d0716' : '#070a14';
  roundRect(ctx, 0, 0, W, H, 22); ctx.fill();

  ctx.save();
  roundRect(ctx, 0, 0, W, H, 22); ctx.clip();

  /* アート */
  if (art) {
    const s = Math.max(W / art.width, H / art.height);
    const dw = art.width * s, dh = art.height * s;
    ctx.globalAlpha = compiled ? 0.8 : 0.66;
    ctx.drawImage(art, (W - dw) / 2, (H - dh) / 2 - H * 0.12, dw, dh);
    ctx.globalAlpha = 1;
  }

  /* 左からアクセント、右へ暗転。文字を必ず読ませる */
  const g = ctx.createLinearGradient(0, 0, W, 0);
  if (compiled) {
    g.addColorStop(0, rgba(accent, 0.86));
    g.addColorStop(0.5, 'rgba(10,6,20,.82)');
    g.addColorStop(1, 'rgba(10,6,20,.92)');
  } else {
    g.addColorStop(0, 'rgba(6,9,18,.82)');
    g.addColorStop(0.46, 'rgba(6,9,18,.34)');
    g.addColorStop(1, 'rgba(6,9,18,.86)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  /* コンパイル済みは走査線を重ねて「書き換わった」感じを出す */
  if (compiled) {
    ctx.fillStyle = rgba(accent, 0.16);
    for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 3);
  }
  ctx.restore();

  /* 紋章 */
  drawEmblem(ctx, info.name, 16, (H - 74) / 2, 74,
    compiled ? 'rgba(255,255,255,.95)' : rgba(accent, 0.95), 7);

  /* 状態ラベル */
  ctx.font = '800 19px system-ui, sans-serif';
  ctx.fillStyle = compiled ? '#ffffff' : rgba(accent, 0.9);
  ctx.fillText(compiled ? 'COMPILED' : 'LOADING...', 100, 40);

  /* プロトコル名 */
  let px = 50;
  do {
    ctx.font = '900 ' + px + 'px system-ui, sans-serif';
    if (ctx.measureText(info.name).width <= W - 268) break;
    px -= 2;
  } while (px > 22);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(info.name, 100, H * 0.62);
  ctx.textBaseline = 'alphabetic';

  /* 合計値。10 以上はコンパイル圏内なので塗りを反転させる */
  const hot = info.total >= 10;
  const bw = 116, bh = 96, bx = W - bw - 20, by = (H - bh) / 2 + 8;
  ctx.fillStyle = hot ? accent : 'rgba(255,255,255,.09)';
  roundRect(ctx, bx, by, bw, bh, 16); ctx.fill();
  if (!hot) {
    ctx.strokeStyle = rgba(accent, 0.55);
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, bw, bh, 16); ctx.stroke();
  }
  ctx.font = '900 66px system-ui, sans-serif';
  ctx.fillStyle = hot ? '#05070f' : '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(info.total), bx + bw / 2, by + bh / 2 + 2);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  /* 枠 */
  ctx.strokeStyle = compiled ? '#ffffff' : rgba(accent, 0.5);
  ctx.lineWidth = compiled ? 6 : 4;
  roundRect(ctx, 3, 3, W - 6, H - 6, 20); ctx.stroke();
}

export function createPanels(stage, me) {
  /* 表裏で別テクスチャを貼るため、板は2枚のメッシュで作る */
  const geo = new THREE.PlaneGeometry(PANEL_W, PANEL_D);
  geo.rotateX(-Math.PI / 2);
  const panels = [];

  function makeFace(flipped) {
    const cv = document.createElement('canvas');
    cv.width = TEX_W; cv.height = TEX_H;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false
    }));
    /* 裏面は x 軸で反転させる。グループを x 軸で裏返したときに天地が戻る
       (z 軸で反転させると、裏返した結果が 180 度回転して逆さまに見える) */
    if (flipped) { mesh.rotation.x = Math.PI; mesh.position.y = -0.002; }
    mesh.renderOrder = 1;
    return { cv, ctx: cv.getContext('2d'), tex, mesh };
  }

  for (let line = 0; line < 3; line++) {
    for (let side = 0; side < 2; side++) {
      const group = new THREE.Group();
      const loading = makeFace(false);
      const compiled = makeFace(true);
      group.add(loading.mesh, compiled.mesh);

      const slot = LAYOUT.protoSlot(line, side, me);
      group.position.set(slot.pos[0], slot.pos[1], slot.pos[2]);
      group.rotation.set(slot.rot[0], slot.rot[1], slot.rot[2]);
      stage.scene.add(group);

      panels.push({ line, side, group, loading, compiled, shown: null, art: {} });
    }
  }

  function repaint(p, info) {
    /* プロトコルの並べ替えでこのパネルの担当が変わったら、
       前のプロトコルのアートを捨てて読み直す */
    if (p.artName !== info.name) {
      p.artName = info.name;
      p.art.loading = null;
      p.art.compiled = null;
    }
    const url = ART_SETS.has(info.set) ? protoArtUrl(info.name, false) : null;
    const glitchUrl = ART_SETS.has(info.set) ? protoArtUrl(info.name, true) : null;

    paint(p.loading.ctx, { ...info, compiled: false }, p.art.loading);
    p.loading.tex.needsUpdate = true;
    paint(p.compiled.ctx, { ...info, compiled: true }, p.art.compiled);
    p.compiled.tex.needsUpdate = true;

    if (url && !p.art.loading) {
      loadArt(url, (img) => {
        if (p.artName !== info.name) return;   // 読込中にまた入れ替わった
        p.art.loading = img;
        paint(p.loading.ctx, { ...info, compiled: false }, img);
        p.loading.tex.needsUpdate = true;
      });
    }
    if (glitchUrl && !p.art.compiled) {
      loadArt(glitchUrl, (img) => {
        if (p.artName !== info.name) return;
        p.art.compiled = img;
        paint(p.compiled.ctx, { ...info, compiled: true }, img);
        p.compiled.tex.needsUpdate = true;
      });
    }
  }

  /* 板を裏返す (コンパイル時) */
  function flip(p, toCompiled) {
    const from = p.group.rotation.x;
    const to = toCompiled ? Math.PI : 0;
    return TW.tween(620, (t) => {
      p.group.rotation.x = TW.lerp(from, to, t);
      p.group.position.y = 0.012 + Math.sin(Math.PI * t) * 0.22;
    }, TW.Ease.inOutCubic, () => {
      p.group.rotation.x = to;
      p.group.position.y = 0.012;
    });
  }

  function update(rows) {
    for (const p of panels) {
      const info = rows[p.line][p.side];
      repaint(p, info);
      /* 初回はアニメなしで面を合わせる */
      if (p.shown === null) {
        p.group.rotation.x = info.compiled ? Math.PI : 0;
      } else if (p.shown !== info.compiled) {
        flip(p, info.compiled);
      }
      p.shown = info.compiled;
    }
  }

  /* コンパイル演出から明示的に呼ぶ (板を裏返す瞬間を演出に合わせたいとき) */
  function flipAt(line, side, toCompiled) {
    const p = panels.find(x => x.line === line && x.side === side);
    if (!p || p.shown === toCompiled) return Promise.resolve();
    p.shown = toCompiled;
    return flip(p, toCompiled);
  }

  return { update, flipAt, panels };
}
