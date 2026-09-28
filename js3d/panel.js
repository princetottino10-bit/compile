/* =========================================================================
 * 3Dビュー: ライン端のプロトコルカード
 *   実物と同じく2面ある板として扱う。
 *     表 = "LOADING..."  (art/Fire.webp)
 *     裏 = "COMPILED"    (art/Fire_Glitched.webp)
 *   コンパイルすると板が裏返り、以後はっきり違う見た目になる。
 * ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { COLOR, FONT } from './theme.js';
import * as LAYOUT from './layout.js';
import * as TW from './tween.js';
import { drawEmblem } from './emblems.js';

/* 板は大きめに (ラインの間隔 1.62 と、スタックの1枚目の手前まで)。
   テクスチャは 2 倍の解像度で描き、斜めから見ても文字がつぶれないようにする */
const TEX_W = 512, TEX_H = 262, TEX_SCALE = 2;
const PANEL_W = 1.56, PANEL_D = 0.80;

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
  const h = String(hex || '#b9a4ff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/* 合計値の札の、板のテクスチャ上の位置と大きさ */
const BADGE = { w: 128, h: 112, x: TEX_W - 128 - 18, y: (TEX_H - 112) / 2 + 8 };

/* 合計値の札。10 以上はコンパイル圏内なので塗りを反転させる。
   済パネルでも合計はライン比較 (コントロール等) に効くため表示する */
function paintBadge(ctx, bx, by, total, compiled, accent) {
  const bw = BADGE.w, bh = BADGE.h;
  const hot = !compiled && total >= 10;
  ctx.fillStyle = hot ? accent : (compiled ? 'rgba(4,6,12,.72)' : 'rgba(255,255,255,.09)');
  roundRect(ctx, bx, by, bw, bh, 16); ctx.fill();
  if (!hot) {
    ctx.strokeStyle = rgba(accent, 0.55);
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, bw, bh, 16); ctx.stroke();
  }
  ctx.font = '800 80px ' + FONT.hud;
  ctx.fillStyle = hot ? '#05070f' : '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(total), bx + bw / 2, by + bh / 2 + 2);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

/* 板1面を描く。compiled=true なら「COMPILED」面 */
/* 絵を (x0..x1) の幅の中央に合わせて敷く */
function drawArt(ctx, art, x0, x1, H, alpha, muted) {
  const w = x1 - x0;
  const s = Math.max(w / art.width, H / art.height);
  const dw = art.width * s, dh = art.height * s;
  ctx.globalAlpha = alpha;
  /* コンパイル済みの板は絵の色を抜いて「済んだ」側に見せる (filter が使えない古い端末では色のまま) */
  if (muted && 'filter' in ctx) ctx.filter = 'grayscale(0.85) brightness(0.85)';
  ctx.drawImage(art, x0 + (w - dw) / 2, (H - dh) / 2 - H * 0.12, dw, dh);
  if (muted && 'filter' in ctx) ctx.filter = 'none';
  ctx.globalAlpha = 1;
}

/* arts: 絵 (複合プロトコルは2つの配列。読み込み前は null) */
function paint(ctx, info, arts) {
  const list = Array.isArray(arts) ? arts : [arts];
  const art = list[0];
  const W = TEX_W, H = TEX_H;
  const accent = info.color || '#b9a4ff';
  const compiled = !!info.compiled;
  ctx.setTransform(TEX_SCALE, 0, 0, TEX_SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);

  /* 下地 */
  ctx.fillStyle = compiled ? '#0d0716' : '#070a14';
  roundRect(ctx, 0, 0, W, H, 22); ctx.fill();

  ctx.save();
  roundRect(ctx, 0, 0, W, H, 22); ctx.clip();

  /* アート。複合プロトコルは2つの絵を斜めに半分ずつ (どちらも同じ扱い) */
  const alpha = compiled ? 0.5 : 0.66;          // コンパイル済みは絵を少し沈めて「済んだ」側に見せる
  if (info.parts) {
    const cut = [W * 0.56, W * 0.44];          // 上の端・下の端での境目
    for (let k = 0; k < 2; k++) {
      ctx.save();
      ctx.beginPath();
      if (k === 0) { ctx.moveTo(0, 0); ctx.lineTo(cut[0], 0); ctx.lineTo(cut[1], H); ctx.lineTo(0, H); }
      else { ctx.moveTo(cut[0], 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(cut[1], H); }
      ctx.closePath();
      ctx.clip();
      if (list[k]) drawArt(ctx, list[k], k === 0 ? 0 : cut[1], k === 0 ? cut[0] : W, H, alpha, compiled);
      else { ctx.fillStyle = rgba(info.parts[k].color, 0.18); ctx.fillRect(0, 0, W, H); }
      ctx.restore();
    }
    /* 境目の細い光 */
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cut[0], 0); ctx.lineTo(cut[1], H); ctx.stroke();
  } else if (art) drawArt(ctx, art, 0, W, H, alpha, compiled);

  /* 左からアクセント、右へ暗転。文字を必ず読ませる */
  const g = ctx.createLinearGradient(0, 0, W, 0);
  if (compiled) {
    /* 色を全面に塗ると「いまアツい板」に見えて、済んだことが伝わらなかった。色は左端に少しだけ */
    g.addColorStop(0, rgba(accent, 0.38));
    g.addColorStop(0.4, 'rgba(10,6,20,.8)');
    g.addColorStop(1, 'rgba(10,6,20,.9)');
  } else {
    g.addColorStop(0, 'rgba(6,9,18,.82)');
    g.addColorStop(0.46, 'rgba(6,9,18,.34)');
    g.addColorStop(1, 'rgba(6,9,18,.86)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  /* コンパイル済みは走査線を薄く敷く (済んだ板の地模様) */
  if (compiled) {
    ctx.fillStyle = rgba(accent, 0.08);
    for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 3);
  }
  ctx.restore();

  /* 紋章。タッグの複合プロトコルは2つを同じ大きさで、それぞれの名前の横に */
  const ROW = [H * 0.43, H * 0.74];
  if (info.parts) {
    for (let k = 0; k < 2; k++) {
      drawEmblem(ctx, info.parts[k].name, 30, ROW[k] - 29, 58, compiled ? 'rgba(255,255,255,.95)' : rgba(info.parts[k].color, 0.95), 6);
    }
  } else {
    drawEmblem(ctx, info.name, 16, (H - 84) / 2, 84,
      compiled ? 'rgba(255,255,255,.95)' : rgba(accent, 0.95), 7);
  }

  /* 状態ラベル。コンパイル済みは白地の札「✓ COMPILED」(小さな文字だけでは、特にスマホで読めなかった) */
  if (compiled) {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 108, 20, 196, 38, 8); ctx.fill();
    ctx.font = '800 25px ' + FONT.hud;
    ctx.fillStyle = '#0a0614';
    ctx.fillText('✓ COMPILED', 120, 48);
  } else {
    ctx.font = '700 22px ' + FONT.hud;
    ctx.fillStyle = rgba(accent, 0.9);
    ctx.fillText('LOADING...', 112, 48);
  }

  /* プロトコル名。複合プロトコルは2段 (上に1人目、下に + 2人目) */
  const fit = (text, max, from) => {
    let px = from;
    do {
      ctx.font = '800 ' + px + 'px ' + FONT.hud;
      if (ctx.measureText(text).width <= max) break;
      px -= 2;
    } while (px > 18);
  };
  ctx.textBaseline = 'middle';
  if (info.parts) {
    /* 2つの名前は同じ大きさ (長い方に合わせる)・同じ白で */
    const longer = info.parts[0].name.length >= info.parts[1].name.length ? info.parts[0].name : info.parts[1].name;
    fit(longer, W - 270, 44);
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 2; k++) ctx.fillText(info.parts[k].name, 112, ROW[k]);
  } else {
    fit(info.name, W - 270, 60);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(info.name, 112, H * 0.62);
  }
  ctx.textBaseline = 'alphabetic';

  /* 合計値。並べ替えで板が動いている間は板には描かない (合計はラインのカードのもので、板についていかない。
     その間はラインの位置に止めた札 (badgeAt) が、板の上に重ねて出す) */
  if (!info.hideTotal) paintBadge(ctx, BADGE.x, BADGE.y, info.total, compiled, accent);
  /* コンパイル済みの印: 合計値の左上に白い丸の ✓ シール。遠目・スマホでも形で分かる大きさ */
  if (compiled) {
    const cx = BADGE.x - 4, cy = BADGE.y + 6, r = 40;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.9);
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#0a0614';
    ctx.lineWidth = 11;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy + 1);
    ctx.lineTo(cx - 5, cy + 15);
    ctx.lineTo(cx + 19, cy - 14);
    ctx.stroke();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  }

  /* 枠 */
  ctx.strokeStyle = compiled ? '#ffffff' : rgba(accent, 0.5);
  ctx.lineWidth = compiled ? 6 : 4;
  roundRect(ctx, 3, 3, W - 6, H - 6, 20); ctx.stroke();
}

/* hooks.onChange(events): 合計値が変わった板と、コンパイル圏に入った板を知らせる (手触りの演出 feel.js 用)。
   events: [{ line, side, delta, total, ready, pos: 板の 3D 位置, color }] */
export function createPanels(stage, me, hooks) {
  /* 表裏で別テクスチャを貼るため、板は2枚のメッシュで作る */
  const geo = new THREE.PlaneGeometry(PANEL_W, PANEL_D);
  geo.rotateX(-Math.PI / 2);
  const glowGeo = new THREE.PlaneGeometry(PANEL_W * 1.1, PANEL_D * 1.35);
  glowGeo.rotateX(-Math.PI / 2);
  const panels = [];

  function makeFace(flipped) {
    const cv = document.createElement('canvas');
    cv.width = TEX_W * TEX_SCALE; cv.height = TEX_H * TEX_SCALE;
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

      /* 次の手番の開始でコンパイルが起きるラインの目印: 板の下に敷く光 (自分=ミント / 相手=ピンク) */
      const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
        color: side === me ? COLOR.mint : COLOR.pink, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      glow.position.set(slot.pos[0], 0.004, slot.pos[2]);
      glow.visible = false;
      glow.renderOrder = 0;
      stage.scene.add(glow);

      panels.push({ line, side, group, loading, compiled, glow, threat: false, shown: null, art: {} });
    }
  }

  function repaint(p, info) {
    /* プロトコルの並べ替えでこのパネルの担当が変わったら、
       前のプロトコルのアートを捨てて読み直す */
    /* 複合プロトコル (タッグ) は2つの絵。1つずつ読み、揃ったところから描き直す */
    const names = info.parts ? info.parts.map(x => x.name) : [info.name];
    if (p.artName !== info.name) {
      p.artName = info.name;
      p.art.loading = names.map(() => null);
      p.art.compiled = names.map(() => null);
    }
    p.info = info;                        // 絵の読み込みが後から終わったときは、そのときの内容で描く
    const draw = () => {
      paint(p.loading.ctx, { ...p.info, compiled: false }, p.art.loading);
      p.loading.tex.needsUpdate = true;
      paint(p.compiled.ctx, { ...p.info, compiled: true }, p.art.compiled);
      p.compiled.tex.needsUpdate = true;
    };
    /* 描く中身が前と同じなら描き直さない。板の絵 (1024×524) を毎回 GPU に送り直していて、
       盤面が動くたびに 0.2 秒ほど画面が止まっていた (絵が届いたときは下の読み込みから描く) */
    const key = JSON.stringify(info);
    if (p.paintedKey !== key) { p.paintedKey = key; draw(); }
    if (!ART_SETS.has(info.set)) return;
    const want = info.name;
    names.forEach((n, k) => {
      for (const face of ['loading', 'compiled']) {
        if (p.art[face][k]) continue;
        loadArt(protoArtUrl(n, face === 'compiled'), (img) => {
          if (p.artName !== want) return;      // 読込中にまた入れ替わった
          p.art[face][k] = img;
          draw();
        });
      }
    });
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

  /* rows: [line][side] の表示内容。opts.animate なら、並べ替えで担当が変わった板を
     元のラインから新しいラインへ滑らせて見せる (どれとどれが入れ替わったか分かるように)。
     戻り値は動きが終わる Promise */
  function update(rows, opts) {
    const moves = [];
    if (opts && opts.animate) {
      for (const side of [0, 1]) {
        const was = {};
        for (const p of panels) if (p.side === side && p.artName !== undefined) was[p.artName] = p.line;
        for (const p of panels) {
          if (p.side !== side) continue;
          const info = rows[p.line][p.side];
          const from = was[info.name];
          if (p.artName !== undefined && p.artName !== info.name && from !== undefined && from !== p.line) {
            moves.push({ p, info, from });
          }
        }
      }
    }
    const moving = new Set(moves.map(m => m.p));
    /* 合計値の変化 (同じプロトコルのまま変わったときだけ。並べ替え・はじめての表示では知らせない) */
    const events = [];
    for (const p of panels) {
      const info = rows[p.line][p.side];
      const same = p.artName !== undefined && p.artName === info.name && !moving.has(p);
      if (same && p.lastTotal !== undefined && (info.total !== p.lastTotal || (!!info.threat && !p.threat))) {
        const pos = new THREE.Vector3();
        p.group.getWorldPosition(pos);
        events.push({ line: p.line, side: p.side, delta: info.total - p.lastTotal, total: info.total,
          ready: !!info.threat && !p.threat && !info.compiled, pos, color: info.color });
      }
      p.lastTotal = info.total;
    }
    for (const p of panels) p.threat = !!rows[p.line][p.side].threat;
    if (events.length && hooks && hooks.onChange) { try { hooks.onChange(events); } catch (e) { /* 演出だけなので遊ぶのには関係ない */ } }
    for (const p of panels) {
      if (moving.has(p)) continue;
      const info = rows[p.line][p.side];
      /* 並べ替えで担当プロトコルが変わった場合は「コンパイルの反転演出」
         ではないので、アニメなしで面を合わせる */
      const nameChanged = p.artName !== undefined && p.artName !== info.name;
      repaint(p, info);
      if (p.shown === null || nameChanged) {
        p.group.rotation.x = info.compiled ? Math.PI : 0;
        p.group.position.y = 0.012;
      } else if (p.shown !== info.compiled) {
        flip(p, info.compiled);
      }
      p.shown = info.compiled;
    }
    /* 動く板のラインには、合計値の札だけをその場に残す (板と一緒に数字が入れ替わって見えないように) */
    const stays = moves.map(m => badgeAt(m.p, m.info));
    return Promise.all(moves.map((m, i) => slideFrom(m.p, m.info, m.from, i))).then(() => { for (const off of stays) off(); });
  }

  /* 板が並べ替えで動いている間、そのラインの位置に合計値の札だけを出しておく。返り値を呼ぶと消える */
  const badgeGeo = new THREE.PlaneGeometry(BADGE.w / TEX_W * PANEL_W, BADGE.h / TEX_H * PANEL_D);
  badgeGeo.rotateX(-Math.PI / 2);
  function badgeAt(p, info) {
    const cv = document.createElement('canvas');
    cv.width = BADGE.w * TEX_SCALE; cv.height = BADGE.h * TEX_SCALE;
    const ctx = cv.getContext('2d');
    ctx.setTransform(TEX_SCALE, 0, 0, TEX_SCALE, 0, 0);
    ctx.fillStyle = '#070a14';
    roundRect(ctx, 0, 0, BADGE.w, BADGE.h, 16); ctx.fill();
    paintBadge(ctx, 0, 0, info.total, !!info.compiled, info.color || '#b9a4ff');
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    /* 板が下をくぐっても隠れないよう、いつも一番上に描く */
    const mesh = new THREE.Mesh(badgeGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    mesh.renderOrder = 20;
    /* 板の中での札の位置 (板の中心からのずれ) を、板と同じ向きで床に置く */
    const slot = LAYOUT.protoSlot(p.line, p.side, me);
    const holder = new THREE.Group();
    holder.position.set(slot.pos[0], slot.pos[1] + 0.004, slot.pos[2]);
    holder.rotation.set(slot.rot[0], slot.rot[1], slot.rot[2]);
    mesh.position.set((BADGE.x + BADGE.w / 2 - TEX_W / 2) / TEX_W * PANEL_W, 0,
      (BADGE.y + BADGE.h / 2 - TEX_H / 2) / TEX_H * PANEL_D);
    holder.add(mesh);
    stage.scene.add(holder);
    return () => { stage.scene.remove(holder); tex.dispose(); mesh.material.dispose(); };
  }

  /* 板を元のライン (fromLine) の位置から自分のラインへ弧を描いて滑らせる。
     すれ違う板どうしが重ならないよう、弧の高さを交互に変える */
  function slideFrom(p, info, fromLine, order) {
    repaint(p, { ...info, hideTotal: true });
    p.group.rotation.x = info.compiled ? Math.PI : 0;
    p.shown = info.compiled;
    const slot = LAYOUT.protoSlot(p.line, p.side, me);
    const x0 = LAYOUT.protoSlot(fromLine, p.side, me).pos[0];
    const x1 = slot.pos[0];
    const lift = 0.35 + (order % 2) * 0.3;
    p.group.position.x = x0;
    return TW.tween(560, (t) => {
      p.group.position.x = x0 + (x1 - x0) * t;
      p.group.position.y = slot.pos[1] + Math.sin(Math.PI * t) * lift;
    }, TW.Ease.inOutCubic, () => {
      p.group.position.set(slot.pos[0], slot.pos[1], slot.pos[2]);
      repaint(p, info);                 // 着いたら、そのラインの合計を板に戻す
    });
  }

  /* 手で板を並べ替えている間 (main.js の arrangeOnBoard)、その側の合計値を板から消し、ラインの位置に止めた札で出す。
     数字はラインのもの (板についてくるものではない) なので、板を動かしても数字は動かない。返り値を呼ぶと元に戻る */
  function holdTotals(side) {
    const ps = panels.filter(p => p.side === side && p.info);
    const offs = ps.map(p => badgeAt(p, p.info));
    for (const p of ps) repaint(p, { ...p.info, hideTotal: true });
    return () => {
      for (const off of offs) off();
      for (const p of ps) repaint(p, { ...p.info, hideTotal: false });
    };
  }

  /* コンパイル演出から明示的に呼ぶ (板を裏返す瞬間を演出に合わせたいとき) */
  function flipAt(line, side, toCompiled) {
    const p = panels.find(x => x.line === line && x.side === side);
    if (!p || p.shown === toCompiled) return Promise.resolve();
    p.shown = toCompiled;
    return flip(p, toCompiled);
  }

  /* 毎フレーム: コンパイルが起きるラインの光を脈打たせる */
  function tick(t) {
    for (const p of panels) {
      p.glow.visible = p.threat;
      if (p.threat) p.glow.material.opacity = 0.32 + 0.22 * Math.sin((t || 0) * 3.6 + p.line);
    }
  }

  return { update, flipAt, tick, holdTotals, panels };
}
