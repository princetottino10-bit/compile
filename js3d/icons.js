/* =========================================================================
 * 3Dビュー: 効果種別アイコン
 *   data/cards.json の effectTypes に対応する線画アイコン。
 *   SVG パス文字列を単一情報源にして、
 *     - drawIcon()  … Canvas (カードテクスチャ) へ Path2D で描く
 *     - svgIcon()   … DOM (効果バナー等) へインライン SVG で出す
 *   の両方から使う。24x24 グリッド・ストローク 2.2・丸端。
 * ========================================================================= */

export const ICONS = {
  /* カードを引く: 山札から跳ね上がる矢印 */
  draw: 'M5 20 h9 M5 17 h9 M7 13 V5 m0 0 l-2.5 2.5 M7 5 l2.5 2.5 M14 13 V7 m0 0 l-2.5 2.5 M14 7 l2.5 2.5',
  /* 反転: 円弧を描く2本の矢印 */
  flip: 'M19 12 a7 7 0 0 1 -12.2 4.7 M5 12 a7 7 0 0 1 12.2 -4.7 M5 12 l-1.8 -3 M5 12 l3.4 -0.6 M19 12 l1.8 3 M19 12 l-3.4 0.6',
  /* 移動: 左右の矢印 */
  shift: 'M4 9 h13 m-3 -3 l3 3 -3 3 M20 15 H7 m3 -3 l-3 3 3 3',
  /* 削除: 崩れる四角 + X */
  delete: 'M6 4 h12 v12 M6 4 v12 h8 M9 7 l6 6 M15 7 l-6 6 M16 18 l4 4 M20 18 l-4 4',
  /* 捨て札: トレイへ落ちる矢印 */
  discard: 'M12 3 v10 m-4 -4 l4 4 4 -4 M4 17 v3 h16 v-3',
  /* 手札に戻す: U ターン矢印 */
  return: 'M18 5 a6.5 6.5 0 0 1 0 13 H9 m3 3.5 l-3.5 -3.5 3.5 -3.5',
  /* プレイ: カード枠 + 再生マーク */
  play: 'M5 4 h11 v16 H5 z M9.5 9 l5 3.5 -5 3.5 z',
  /* 並べ替え: 交差する2本の矢印 */
  rearrange: 'M4 7 h5 l6 10 h5 m-3 -3 l3 3 -3 3 M4 17 h5 l1.7 -2.8 M13.3 9.8 15 7 h5 m-3 -3 l3 3 -3 3',
  /* バニラ大型札 (値5): ダイヤ */
  five: 'M12 3 l7 9 -7 9 -7 -9 z M12 8 l3.5 4 -3.5 4 -3.5 -4 z',
  /* その他: アスタリスク */
  other: 'M12 4 v16 M5 8 l14 8 M19 8 l-14 8'
};

export const ICON_LABEL = {
  draw: 'ドロー', flip: '反転', shift: '移動', delete: '削除',
  discard: '捨て札', return: '手札に戻す', play: 'プレイ',
  rearrange: '並べ替え', five: 'バニラ(値5)', other: '特殊'
};

const path2dCache = new Map();

/* Canvas へ描く。(x, y) は左上、size は正方形の一辺 */
export function drawIcon(ctx, name, x, y, size, color, lineWidth) {
  const d = ICONS[name];
  if (!d) return false;
  let p = path2dCache.get(name);
  if (!p) { p = new Path2D(d); path2dCache.set(name, p); }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = (lineWidth === undefined ? 2.2 : lineWidth) * 24 / size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(p);
  ctx.restore();
  return true;
}

/* DOM 用のインライン SVG 文字列 */
export function svgIcon(name, color, size) {
  const d = ICONS[name];
  if (!d) return '';
  const s = size || 14;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
    'style="vertical-align:-2px" aria-label="' + (ICON_LABEL[name] || name) + '">' +
    '<path d="' + d + '" stroke="' + (color || 'currentColor') + '" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
