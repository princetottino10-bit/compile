/* =========================================================================
 * 3Dビュー: 寸法・配色の単一情報源
 *   ワールド単位は「カード幅 = 1.0」を基準にする。
 * ========================================================================= */

/* --- カード実寸 (幅:奥行 = 1 : 1.4) --- */
export const CARD = {
  w: 1.0,
  h: 1.4,
  thickness: 0.022,
  /* テクスチャ解像度 (幅:高さはカード比と一致させる)。
     cardtex.js は 512x716 のデザイン空間で描き、ここへ拡大される */
  texW: 640,
  texH: 896
};

/* --- 盤面レイアウト --- */
export const BOARD = {
  laneX: [-1.62, 0, 1.62],   // 3ライン (LEFT / MID / RIGHT)
  /* プロトコルカードは実卓と同じくフィールド中央に並び、
     各プレイヤーのスタックはそこから自分側へ伸びる */
  protoZ: [-0.55, 0.55],     // [相手, 自分]
  stackZ: [-1.62, 1.62],     // スタックの1枚目 (プロトコルカードに重ならない位置)
  /* 覆うたびのずらし量。
     ルール「覆われても値と上段コマンドが常に見えること」を満たす幅を確保する
     (カード奥行 × cardtex の REVEAL_RATIO をわずかに上回る値) */
  coverStep: 0.44,
  coverLift: 0.016,
  handZ: 4.0,
  handY: 1.02
};

/* --- ビューポート応答 ---
   k: 0=横長(デスクトップ) .. 1=縦長(スマホ縦持ち)。stage.resize が更新し、
   カメラと手札レイアウトがこれを参照して構図を変える */
export const VIEW = { k: 0 };

/* --- カメラ --- */
export const CAMERA = {
  fov: 46,
  near: 0.1,
  far: 120,
  /* 通常の観戦位置 */
  home: { pos: [0, 8.9, 7.0], look: [0, 0, -0.2] },
  /* カード着地に寄るときの近接パラメータ */
  focus: { height: 5.15, pull: 3.55, swing: 0.32, lookSwing: 0.5 }
};

/* --- 配色 (既存プロトタイプのサイバーパンク暗色を踏襲) --- */
export const COLOR = {
  bg: 0x03040a,
  fog: 0x05060f,
  floor: 0x070a16,
  grid: 0x2b4a63,
  gridHot: 0x63f3ff,
  pink: 0xff3b9d,
  cyan: 0x63f3ff,
  mint: 0x6dffc2,
  gold: 0xefd06c,
  cardEdge: 0x0a0c16,
  cardBackA: '#0a0f1e',
  cardBackB: '#04060e',
  self: 0x6dffc2,
  opp: 0xff3b9d
};

/* --- 演出タイミング (ms) --- */
export const TIMING = {
  handSort: 260,
  drawFly: 380,
  playLift: 190,   // 手札から抜き出して構える
  playArc: 460,    // 弧を描いて盤面へ
  playSettle: 150, // 着地後の沈み込み
  flip: 420,
  shift: 400,
  toTrash: 420,
  camEase: 520,
  impactRing: 560,   // 着地時に床へ広がる輪
  flashPillar: 420   // 着地時の光柱
};
