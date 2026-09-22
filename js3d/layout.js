/* =========================================================================
 * 3Dビュー: 盤面座標の計算
 *   engine の state から「どのカードがどこに立つか」を決めるだけの純関数群。
 *   me = 視点プレイヤー。me 側が手前(+Z)、相手が奥(-Z)。
 * ========================================================================= */
import { BOARD, CARD, VIEW } from './theme.js';

/* 手札を起こす角度 (水平から) */
const HAND_TILT = 1.02;

/* 手札: PC は扇、縦持ちではまっすぐな段組み */
export function handSlot(i, n) {
  const tucked = VIEW.handOpen ? 0 : 1;
  /* 縦持ちで扇を維持すると、両端の札が盤面へ大きく食い込み、
     その札が Raycaster を先に拾って盤面操作まで奪ってしまう。
     5枚ごとの水平な段にして、カードと盤面の操作領域を分ける。 */
  if (VIEW.k >= .5) {
    /* 縦持ちのカメラは手札をほぼ真上から見下ろす。PC と同じように札を立てると
       画面上で縦に潰れて読めないので、ほぼ寝かせてカメラに正対させる。
       幅いっぱいに大きく並べ、読みやすさを最優先にする。 */
    const perRow = 5;
    const row = Math.floor(i / perRow);
    const rowStart = row * perRow;
    const rowCount = Math.min(perRow, n - rowStart);
    const rowIndex = i - rowStart;
    const t = rowCount <= 1 ? 0 : (rowIndex / (rowCount - 1) - .5);
    /* 画面幅に収まる範囲でできるだけ大きく。5枚並びで両端が切れないよう、
       並べた全幅 (間隔×(枚数-1) + 1枚ぶん) を 4.7 以内に抑える */
    const PORTRAIT_SCALE = Math.min(1.12, 4.7 / (CARD.w * (1.04 * Math.max(0, perRow - 1) + 1)));
    const step = PORTRAIT_SCALE * CARD.w * 1.04;         // 隣と重ならない間隔
    /* 6枚目以降は1列目の「後ろ」に重ね、見出し (プロトコル名と数字) だけ覗かせる。
       1列ぶん丸ごと上へずらすと自分の場のスタックの隣に並び、
       プレイ済みのカードに見えてしまった。手札の帯の中に収める。 */
    const PEEK = 0.62;                                   // 後ろの列が覗く量 (カード高さの約半分)
    return {
      pos: [t * step * Math.max(0, rowCount - 1),
        BOARD.handY + 0.35 - row * 0.12 - tucked * .22,    // 後ろの列は低くして前の列に隠れる
        BOARD.handZ + 0.95 - row * PEEK + tucked * 1.2],
      rot: [0.18, 0, 0],
      scale: PORTRAIT_SCALE * (tucked ? .9 : 1)
    };
  }
  /* 8枚以上は2列にする。1列のまま重ねると中央の札が完全に隠れ、
     見た目だけでなくRaycasterでも選べなくなる。 */
  const split = n > 7;
  const frontCount = split ? Math.ceil(n / 2) : n;
  const backRow = split && i >= frontCount;
  const rowCount = backRow ? n - frontCount : frontCount;
  const rowIndex = backRow ? i - frontCount : i;
  const t = rowCount <= 1 ? 0 : (rowIndex / (rowCount - 1) - 0.5); // -0.5 .. 0.5
  const k = VIEW.k;                                 // 縦長画面では小さく・奥に
  const width = Math.min(rowCount * (split ? 0.82 : 0.66), split ? 4.4 : 4.05) * (1 - 0.18 * k);
  const rowY = backRow ? 0.46 : 0;
  const rowZ = backRow ? -0.54 : 0;
  const rowScale = backRow ? 0.90 : 1;
  /* 扇は札の面の中で回す (rot.y)。札の縦軸まわりにひねると (rot.z) 隣の札と面が交差し、
     重なりの境目がギザギザにめり込んで汚く見えた。
     端の札を下げるのも面の中で行い、重ね順は「右の札ほど手前」に面の法線方向でずらす */
  const up = [Math.sin(HAND_TILT), -Math.cos(HAND_TILT)];        // 札の面の「上」(y, z)
  const nrm = [Math.cos(HAND_TILT), Math.sin(HAND_TILT)];        // 札の面の法線 (y, z)
  const droop = (2 * t) * (2 * t) * 0.16;
  const layer = rowIndex * 0.024;
  return {
    /* 盤面を読むときはカードを画面下へ引き、少し縮めて重なりも減らす。 */
    pos: [t * width,
      BOARD.handY + rowY - droop * up[0] + layer * nrm[0] - tucked * (0.12 + 0.08 * k),
      BOARD.handZ + rowZ + 0.55 * k - droop * up[1] + layer * nrm[1] + tucked * (0.38 + 0.20 * k)],
    rot: [HAND_TILT, -t * 0.26, 0],
    scale: (1.06 - 0.22 * k) * (tucked ? 0.92 : 1) * rowScale
  };
}

/* 手札のホバー / 選択状態 */
export function handSlotRaised(i, n) {
  const s = handSlot(i, n);
  if (VIEW.k >= .5) {
    /* 縦持ちは寝かせたまま少し浮かせて大きくする (立てると潰れて見える) */
    return { pos: [s.pos[0], s.pos[1] + 0.45, s.pos[2] - 0.35], rot: [0.12, 0, 0], scale: s.scale * 1.12 };
  }
  return {
    /* 持ち上げた札は隣の札より手前 (カメラ側) に出す。同じ面にいると隣とめり込む */
    pos: [s.pos[0], s.pos[1] + 0.58, s.pos[2] - 0.17],
    rot: [0.86, s.rot[1] * 0.35, 0],
    scale: 1.24 - 0.2 * VIEW.k
  };
}

/* 盤面スタック: line=0..2, side=カードの持ち主, idx=下から何枚目か */
export function stackSlot(line, side, idx, me) {
  const near = side === me;
  const dir = near ? 1 : -1;
  const baseZ = near ? BOARD.stackZ[1] : BOARD.stackZ[0];
  return {
    pos: [
      BOARD.laneX[line],
      CARD.thickness / 2 + idx * BOARD.coverLift,
      baseZ + dir * idx * BOARD.coverStep
    ],
    /* 相手のスタックは相手から読める向き (実卓と同じ) */
    rot: [0, near ? 0 : Math.PI, 0],
    scale: 1
  };
}

/* 移動中 (committed): 移動先ラインの上空でホバーさせる。
   ルール上「シフト解決まで宙に浮いて対象に取れない」状態を可視化する */
export function transitSlot(line, side, me) {
  const near = side === me;
  const dir = near ? 1 : -1;
  /* スタックの真上に浮かべると、覆っている札を画面上で完全に隠してしまい
     「移動中のカードが邪魔で下のカードが選べない」状態になった。
     両陣営の積み札に挟まれた中央の空き帯へ、低く浮かせて逃がす。
     高さと奥行きは、横長/縦長どちらのカメラでも積み札に重ならない値を
     実測で選んでいる (test/transit.test.js が投影して検証する)。
     持ち主は傾き (dir) と向きで示す。 */
  return {
    pos: [BOARD.laneX[line], near ? 0.7 : 0.4, near ? 0.4 : 0.3],
    rot: [dir * -0.16, near ? 0 : Math.PI, 0.05],
    scale: 1.06
  };
}

/* 移動中 (行き先がトラッシュ/手札/山札): 行き先方向の上空で待機 */
export function transitPileSlot(dest, side, me, idx) {
  const near = side === me;
  const dir = near ? 1 : -1;
  const x = (dest === 'trash' ? -2.6 : 2.6) * dir;
  const k = idx || 0;
  return {
    pos: [x - dir * k * 0.22, 1.0 + k * 0.02, dir * 2.0],
    rot: [dir * -0.16, near ? 0 : Math.PI, dest === 'trash' ? -0.06 : 0.06],
    scale: 1.0
  };
}

/* 山札 / 捨札 */
export function pilePos(kind, side, me, depth) {
  const near = side === me;
  const k = VIEW.k;                                 // 縦長では画面内に寄せる
  const z = (near ? 2.75 : -2.75) * (1 + 0.16 * k);
  /* 縦持ちは画面幅がレーンでほぼ埋まる。レーンの外側 (|x|>2.12) の細い余白に
     小さくして置き、積み札やプロトコル板に重ならないようにする */
  const x = (kind === 'deck' ? 1 : -1) * (near ? 1 : -1) * (3.45 + (2.52 - 3.45) * k);
  return {
    pos: [x, CARD.thickness / 2 + (depth || 0) * 0.013, z],
    rot: [0, near ? 0 : Math.PI, 0],
    scale: 1 - 0.46 * k
  };
}

/* プロトコル見出し板 */
export function protoSlot(line, side, me) {
  const near = side === me;
  return {
    /* 情報表示なので、相手側の板も視点プレイヤーから読める向きにする */
    pos: [BOARD.laneX[line], 0.012, near ? BOARD.protoZ[1] : BOARD.protoZ[0]],
    rot: [0, 0, 0]
  };
}

/* state から「盤面にあるべき配置」を一覧で返す */
export function boardPlacements(st, me) {
  const out = [];
  for (let line = 0; line < 3; line++) {
    for (let side = 0; side < 2; side++) {
      const stack = st.lines[line][side];
      for (let idx = 0; idx < stack.length; idx++) {
        out.push({
          uid: stack[idx],
          zone: 'field',
          line, side, idx,
          top: idx === stack.length - 1,
          slot: stackSlot(line, side, idx, me)
        });
      }
    }
  }
  return out;
}

/* 手札の配置一覧 (視点プレイヤー分のみ表向きに扱う) */
export function handPlacements(st, me) {
  const out = [];
  for (let p = 0; p < 2; p++) {
    const hand = st.players[p].hand;
    for (let i = 0; i < hand.length; i++) {
      out.push({
        uid: hand[i],
        zone: 'hand',
        side: p,
        idx: i,
        slot: p === me ? handSlot(i, hand.length) : oppHandSlot(i, hand.length)
      });
    }
  }
  return out;
}

/* 相手の手札: 奥に伏せて弧を描く */
export function oppHandSlot(i, n) {
  const t = n <= 1 ? 0 : (i / (n - 1) - 0.5);
  const width = Math.min(n * 0.40, 2.4);
  return {
    pos: [-t * width, 1.02 + Math.abs(t) * 0.05, -4.25 - Math.abs(t) * 0.10],
    rot: [-2.42, 0, t * 0.22],
    scale: 0.78
  };
}
