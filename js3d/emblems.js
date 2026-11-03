/* =========================================================================
 * 3Dビュー: プロトコル紋章 (45種)
 *   100x100 のデザイン空間に線画で描くパラメトリックな紋章。
 *   プロトコル選択・盤面パネル・カットインで共用し、ゲーム全体の
 *   「ブランド」をつくる。SVGパスの手書きではなく Canvas プリミティブで
 *   組む (形が崩れないこと・色とサイズを自由に振れることを優先)。
 * ========================================================================= */

/* ---- プリミティブ (すべて現在のストローク設定で描く) ---- */
function line(c, x1, y1, x2, y2) {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}
function poly(c, pts, close) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  if (close) c.closePath();
  c.stroke();
}
function ring(c, x, y, r, fill) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  if (fill) c.fill(); else c.stroke();
}
function arc(c, x, y, r, a0, a1, ccw) {
  c.beginPath(); c.arc(x, y, r, a0, a1, !!ccw); c.stroke();
}
function bez(c, pts) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i + 2 < pts.length; i += 3) {
    c.bezierCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i + 2][0], pts[i + 2][1]);
  }
  c.stroke();
}
const TAU = Math.PI * 2;

/* ---- 紋章 (中心 50,50 / 半径 ~34 に収める) ---- */
export const EMBLEMS = {
  /* Main 1 */
  DARKNESS(c) {                       // 三日月と星
    c.beginPath();
    c.arc(50, 50, 28, -0.42 * Math.PI, 0.62 * Math.PI);
    c.arc(62, 42, 24, 0.55 * Math.PI, -0.35 * Math.PI, true);
    c.closePath(); c.stroke();
    ring(c, 72, 28, 3.4, true);
  },
  DEATH(c) {                          // 鎌
    arc(c, 44, 42, 26, -0.92 * Math.PI, 0.12 * Math.PI);
    line(c, 44, 16, 44, 86);
    line(c, 34, 72, 54, 72);
  },
  FIRE(c) {                           // 炎
    bez(c, [[50, 16], [76, 40], [70, 62], [50, 86], [30, 62], [24, 40], [50, 16]]);
    bez(c, [[50, 44], [60, 56], [58, 64], [50, 74], [42, 64], [40, 56], [50, 44]]);
  },
  GRAVITY(c) {                        // 惑星と軌道
    ring(c, 50, 50, 17);
    c.save(); c.translate(50, 50); c.rotate(-0.34); c.scale(1, 0.36);
    ring(c, 0, 0, 33);
    c.restore();
  },
  LIFE(c) {                           // 芽吹き
    line(c, 50, 86, 50, 42);
    bez(c, [[50, 62], [34, 60], [26, 50], [26, 38], [40, 40], [48, 50], [50, 62]]);
    bez(c, [[50, 52], [66, 50], [74, 40], [74, 28], [60, 30], [52, 40], [50, 52]]);
    ring(c, 50, 26, 6.5);
  },
  LIGHT(c) {                          // 光芒
    ring(c, 50, 50, 14);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      line(c, 50 + Math.cos(a) * 21, 50 + Math.sin(a) * 21,
              50 + Math.cos(a) * 33, 50 + Math.sin(a) * 33);
    }
  },
  METAL(c) {                          // 六角装甲
    const p = [];
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 - Math.PI / 2;
      p.push([50 + Math.cos(a) * 31, 50 + Math.sin(a) * 31]);
    }
    poly(c, p, true);
    ring(c, 50, 50, 11);
  },
  PLAGUE(c) {                         // 三葉の病巣
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 - Math.PI / 2;
      ring(c, 50 + Math.cos(a) * 19, 50 + Math.sin(a) * 19, 13);
    }
    ring(c, 50, 50, 5.5, true);
  },
  PSYCHIC(c) {                        // 眼
    c.beginPath();
    c.moveTo(16, 50); c.quadraticCurveTo(50, 18, 84, 50);
    c.quadraticCurveTo(50, 82, 16, 50);
    c.closePath(); c.stroke();
    ring(c, 50, 50, 11);
    ring(c, 50, 50, 3.6, true);
  },
  SPEED(c) {                          // 三連シェブロン
    for (let i = 0; i < 3; i++) {
      const x = 26 + i * 17;
      poly(c, [[x, 28], [x + 18, 50], [x, 72]]);
    }
  },
  SPIRIT(c) {                        // 立ちのぼる魂
    bez(c, [[50, 88], [36, 72], [64, 58], [50, 42]]);
    bez(c, [[50, 42], [42, 34], [46, 26], [54, 22]]);
    ring(c, 58, 16, 5);
    ring(c, 34, 46, 3, true);
    ring(c, 68, 62, 3, true);
  },
  WATER(c) {                          // 波
    bez(c, [[16, 44], [30, 30], [42, 30], [50, 44], [58, 58], [70, 58], [84, 44]]);
    bez(c, [[16, 64], [30, 50], [42, 50], [50, 64], [58, 78], [70, 78], [84, 64]]);
  },

  /* Aux 1 */
  APATHY(c) {                         // 伏し目
    arc(c, 50, 38, 30, 0.15 * Math.PI, 0.85 * Math.PI);
    for (let i = 0; i < 3; i++) {
      const a = (0.3 + i * 0.2) * Math.PI;
      line(c, 50 + Math.cos(a) * 32, 38 + Math.sin(a) * 32,
              50 + Math.cos(a) * 40, 38 + Math.sin(a) * 40);
    }
  },
  HATE(c) {                           // 罅割れた心臓
    bez(c, [[50, 82], [18, 56], [24, 26], [50, 36], [76, 26], [82, 56], [50, 82]]);
    poly(c, [[50, 38], [44, 50], [54, 58], [46, 72]]);
  },
  LOVE(c) {                           // 心臓
    bez(c, [[50, 82], [18, 56], [24, 26], [50, 36], [76, 26], [82, 56], [50, 82]]);
    ring(c, 50, 56, 5, true);
  },

  /* Main 2 */
  CHAOS(c) {                          // 螺旋の乱れ
    c.beginPath();
    for (let t = 0; t < 2.6 * TAU; t += 0.12) {
      const r = 3 + t * 4.2;
      const x = 50 + Math.cos(t) * r, y = 50 + Math.sin(t) * r * 0.9;
      if (t === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    ring(c, 76, 30, 3, true);
    ring(c, 24, 66, 3, true);
  },
  CLARITY(c) {                        // 宝珠
    poly(c, [[50, 16], [76, 44], [50, 84], [24, 44]], true);
    line(c, 24, 44, 76, 44);
    line(c, 50, 16, 38, 44); line(c, 50, 16, 62, 44);
    line(c, 38, 44, 50, 84); line(c, 62, 44, 50, 84);
  },
  CORRUPTION(c) {                     // 侵蝕される枠
    poly(c, [[26, 26], [74, 26], [74, 52], [66, 52], [66, 60], [74, 60], [74, 74], [48, 74], [48, 66], [38, 66], [38, 74], [26, 74]], true);
    ring(c, 50, 46, 6, true);
    ring(c, 60, 66, 2.6, true);
  },
  COURAGE(c) {                        // 盾
    c.beginPath();
    c.moveTo(28, 24); c.lineTo(72, 24); c.lineTo(72, 52);
    c.quadraticCurveTo(72, 72, 50, 84);
    c.quadraticCurveTo(28, 72, 28, 52);
    c.closePath(); c.stroke();
    line(c, 50, 32, 50, 74);
  },
  FEAR(c) {                           // 見開かれた眼
    ring(c, 50, 50, 19);
    ring(c, 50, 50, 6, true);
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + 0.28;
      line(c, 50 + Math.cos(a) * 25, 50 + Math.sin(a) * 25,
              50 + Math.cos(a) * (32 + (i % 2) * 5), 50 + Math.sin(a) * (32 + (i % 2) * 5));
    }
  },
  ICE(c) {                            // 雪華
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      const dx = Math.cos(a), dy = Math.sin(a);
      line(c, 50, 50, 50 + dx * 32, 50 + dy * 32);
      const px = 50 + dx * 21, py = 50 + dy * 21;
      const oa = a + TAU / 4;
      line(c, px, py, px + Math.cos(a + 0.5) * 8, py + Math.sin(a + 0.5) * 8);
      line(c, px, py, px + Math.cos(a - 0.5) * 8, py + Math.sin(a - 0.5) * 8);
      void oa;
    }
  },
  LUCK(c) {                           // 賽
    c.save();
    c.translate(50, 50); c.rotate(0.16);
    c.beginPath();
    const r = 8;
    c.moveTo(-26 + r, -26); c.arcTo(26, -26, 26, 26, r);
    c.arcTo(26, 26, -26, 26, r); c.arcTo(-26, 26, -26, -26, r);
    c.arcTo(-26, -26, 26, -26, r); c.closePath(); c.stroke();
    ring(c, -12, -12, 4.4, true);
    ring(c, 0, 0, 4.4, true);
    ring(c, 12, 12, 4.4, true);
    c.restore();
  },
  MIRROR(c) {                         // 対の像
    line(c, 50, 20, 50, 80);
    poly(c, [[42, 30], [24, 70], [42, 70]], true);
    poly(c, [[58, 30], [76, 70], [58, 70]], true);
  },
  PEACE(c) {                          // ピースマーク
    ring(c, 50, 50, 30);
    line(c, 50, 20, 50, 80);
    line(c, 50, 50, 29, 71);
    line(c, 50, 50, 71, 71);
  },
  SMOKE(c) {                          // 立ちのぼる煙
    bez(c, [[34, 84], [26, 66], [42, 58], [34, 40], [28, 28], [38, 22], [40, 16]]);
    bez(c, [[52, 86], [44, 66], [60, 60], [52, 40], [46, 28], [56, 22], [58, 14]]);
    bez(c, [[70, 82], [62, 68], [76, 60], [70, 44]]);
  },
  TIME(c) {                           // 砂時計
    line(c, 30, 22, 70, 22);
    line(c, 30, 78, 70, 78);
    poly(c, [[34, 22], [66, 22], [50, 50]], true);
    poly(c, [[34, 78], [66, 78], [50, 50]], true);
    ring(c, 50, 68, 3, true);
  },
  WAR(c) {                            // 交差する剣
    line(c, 26, 26, 70, 70);
    line(c, 74, 26, 30, 70);
    line(c, 62, 70, 78, 70); line(c, 70, 62, 70, 78);
    line(c, 22, 70, 38, 70); line(c, 30, 62, 30, 78);
    poly(c, [[26, 26], [26, 34], [34, 26]], true);
    poly(c, [[74, 26], [74, 34], [66, 26]], true);
  },

  /* Aux 2 */
  ASSIMILATION(c) {                   // 中心への取り込み
    ring(c, 50, 50, 11);
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + Math.PI / 4;
      const ox = Math.cos(a), oy = Math.sin(a);
      poly(c, [
        [50 + ox * 34 - oy * 7, 50 + oy * 34 + ox * 7],
        [50 + ox * 20, 50 + oy * 20],
        [50 + ox * 34 + oy * 7, 50 + oy * 34 - ox * 7]
      ]);
    }
  },
  DIVERSITY(c) {                      // 異なる三つの形
    ring(c, 34, 34, 13);
    poly(c, [[66, 21], [79, 47], [53, 47]], true);
    poly(c, [[38, 56], [62, 56], [62, 80], [38, 80]], true);
  },
  UNITY(c) {                          // 交わる三環
    ring(c, 50, 38, 15);
    ring(c, 39, 58, 15);
    ring(c, 61, 58, 15);
  },

  /* Main 3 (2026-11-03) */
  AMBUSH(c) {                         // 草むらに伏せた刃
    poly(c, [[50, 16], [57, 30], [57, 62], [43, 62], [43, 30]], true);
    line(c, 36, 62, 64, 62);
    bez(c, [[20, 84], [26, 74], [30, 68], [32, 58]]);
    bez(c, [[34, 84], [38, 76], [40, 72], [42, 66]]);
    bez(c, [[80, 84], [74, 74], [70, 68], [68, 58]]);
    bez(c, [[66, 84], [62, 76], [60, 72], [58, 66]]);
  },
  ENVY(c) {                           // 鎌首をもたげる蛇
    bez(c, [[28, 84], [70, 84], [74, 60], [50, 56], [26, 52], [30, 26], [56, 24]]);
    poly(c, [[56, 18], [74, 24], [56, 30]], true);
    line(c, 74, 24, 82, 20); line(c, 74, 24, 82, 28);
  },
  FULCRUM(c) {                        // 支点と梃子
    poly(c, [[50, 50], [36, 76], [64, 76]], true);
    line(c, 22, 82, 78, 82);
    line(c, 16, 56, 84, 44);
    ring(c, 22, 44, 7);
    poly(c, [[70, 30], [82, 30], [82, 40], [70, 40]], true);
  },
  GLUTTONY(c) {                       // 山盛りの椀と箸
    arc(c, 50, 52, 30, 0, Math.PI);
    line(c, 18, 52, 82, 52);
    arc(c, 50, 52, 20, Math.PI, TAU);
    line(c, 58, 18, 82, 40); line(c, 66, 14, 86, 36);
  },
  GREED(c) {                          // 宝石
    poly(c, [[30, 34], [70, 34], [82, 46], [50, 82], [18, 46]], true);
    line(c, 18, 46, 82, 46);
    poly(c, [[38, 34], [32, 46], [50, 82], [68, 46], [62, 34]]);
    line(c, 50, 34, 50, 46);
  },
  LUST(c) {                           // 薔薇
    ring(c, 50, 36, 18);
    bez(c, [[50, 36], [56, 30], [44, 26], [42, 34], [40, 44], [58, 46], [60, 34]]);
    line(c, 50, 54, 50, 86);
    bez(c, [[50, 72], [58, 62], [70, 64], [72, 66]]);
    bez(c, [[72, 66], [64, 74], [56, 74], [50, 72]]);
  },
  MOMENTUM(c) {                       // 回りつづける矢
    arc(c, 50, 50, 28, Math.PI * 0.15, Math.PI * 1.75);
    poly(c, [[64, 18], [78, 28], [62, 36]]);
    ring(c, 50, 50, 6, true);
  },
  NOVA(c) {                           // 爆ぜる星
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = i * TAU / 16 - Math.PI / 2, r = i % 2 ? 14 : (i % 4 ? 26 : 36);
      pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
    }
    poly(c, pts, true);
    ring(c, 50, 50, 6, true);
  },
  OVERWHELM(c) {                      // 押し寄せる山並み (小さいものから大きいものへ)
    poly(c, [[10, 80], [24, 58], [38, 80]]);
    poly(c, [[26, 80], [44, 46], [62, 80]]);
    poly(c, [[46, 80], [68, 26], [90, 80]]);
    line(c, 8, 80, 92, 80);
  },
  PRIDE(c) {                          // 王冠
    poly(c, [[20, 70], [16, 30], [34, 50], [50, 22], [66, 50], [84, 30], [80, 70]], true);
    line(c, 20, 80, 80, 80);
    ring(c, 50, 58, 4, true);
  },
  SLOTH(c) {                          // 枝にぶら下がって眠る
    line(c, 12, 26, 88, 26);
    bez(c, [[30, 26], [30, 70], [70, 70], [70, 26]]);
    poly(c, [[58, 40], [70, 40], [58, 52], [70, 52]]);
    poly(c, [[74, 58], [82, 58], [74, 66], [82, 66]]);
  },
  WRATH(c) {                          // 稲妻
    poly(c, [[58, 12], [30, 54], [48, 54], [38, 88], [72, 42], [54, 42], [66, 12]], true);
  },

  /* Aux 3 (2026-11-03) */
  FLEXIBLE(c) {                       // しなる帯
    bez(c, [[14, 40], [32, 14], [50, 66], [86, 34]]);
    bez(c, [[14, 66], [32, 40], [50, 92], [86, 60]]);
    line(c, 14, 40, 14, 66); line(c, 86, 34, 86, 60);
  },
  INERT(c) {                          // 落ちた電源
    arc(c, 50, 54, 28, -Math.PI * 0.32, Math.PI * 1.32);
    line(c, 50, 18, 50, 50);
    line(c, 20, 86, 80, 22);
  },
  RIGID(c) {                          // 組んだ鉄の格子
    poly(c, [[22, 22], [78, 22], [78, 78], [22, 78]], true);
    line(c, 41, 22, 41, 78); line(c, 59, 22, 59, 78);
    line(c, 22, 41, 78, 41); line(c, 22, 59, 78, 59);
  }
};

/* ---- 描画 API (icons.js と同じ流儀) ---- */
export function drawEmblem(ctx, name, x, y, size, color, lineWidth) {
  const fn = EMBLEMS[name];
  if (!fn) return false;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = (lineWidth === undefined ? 6 : lineWidth) * 100 / size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  fn(ctx);
  ctx.restore();
  return true;
}

/* DOM 用: 紋章を dataURL 化して <img> で使う (キャッシュ付き) */
const urlCache = new Map();
export function emblemDataURL(name, color, size, glow) {
  const key = name + '|' + color + '|' + size + '|' + (glow ? 1 : 0);
  if (urlCache.has(key)) return urlCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.07;
  }
  drawEmblem(ctx, name, 0, 0, size, color);
  const url = cv.toDataURL('image/png');
  cv.width = cv.height = 0;                  // 使い終わったキャンバスのメモリをすぐ返す (iPhone はなかなか返さない)
  urlCache.set(key, url);
  /* 覚えておくのは最近の 40 個まで (大きい紋章は 1 個で数百 KB の文字列になる) */
  while (urlCache.size > 40) urlCache.delete(urlCache.keys().next().value);
  return url;
}
