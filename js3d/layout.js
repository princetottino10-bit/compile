/* =========================================================================
 * 3Dビュー: 盤面座標の計算
 *   engine の state から「どのカードがどこに立つか」を決めるだけの純関数群。
 *   me = 視点プレイヤー。me 側が手前(+Z)、相手が奥(-Z)。
 * ========================================================================= */
import { BOARD, CARD, VIEW } from './theme.js';

/* 手札: カメラに正対する緩い扇 */
export function handSlot(i, n) {
  const t = n <= 1 ? 0 : (i / (n - 1) - 0.5);      // -0.5 .. 0.5
  const k = VIEW.k;                                 // 縦長画面では小さく・奥に
  const width = Math.min(n * 0.66, 4.05) * (1 - 0.18 * k);
  return {
    pos: [t * width, BOARD.handY - Math.abs(t) * 0.26,
      BOARD.handZ + 0.55 * k + Math.abs(t) * 0.30],
    rot: [1.02, 0, -t * 0.40],
    scale: 1.06 - 0.22 * k
  };
}

/* 手札のホバー / 選択状態 */
export function handSlotRaised(i, n) {
  const s = handSlot(i, n);
  return {
    pos: [s.pos[0], s.pos[1] + 0.50, s.pos[2] - 0.30],
    rot: [0.86, 0, s.rot[2] * 0.35],
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
  const baseZ = near ? BOARD.stackZ[1] : BOARD.stackZ[0];
  return {
    pos: [BOARD.laneX[line], 1.05, baseZ + dir * 0.42],
    rot: [dir * -0.16, near ? 0 : Math.PI, 0.05],
    scale: 1.06
  };
}

/* 移動中 (行き先がトラッシュ/手札/山札): 行き先方向の上空で待機 */
export function transitPileSlot(dest, side, me) {
  const near = side === me;
  const dir = near ? 1 : -1;
  const x = (dest === 'trash' ? -2.6 : 2.6) * dir;
  return {
    pos: [x, 1.0, dir * 2.0],
    rot: [dir * -0.16, near ? 0 : Math.PI, dest === 'trash' ? -0.06 : 0.06],
    scale: 1.0
  };
}

/* 山札 / 捨札 */
export function pilePos(kind, side, me, depth) {
  const near = side === me;
  const k = VIEW.k;                                 // 縦長では画面内に寄せる
  const z = (near ? 2.75 : -2.75) * (1 + 0.16 * k);
  const x = (kind === 'deck' ? 3.45 : -3.45) * (near ? 1 : -1) * (1 - 0.2 * k);
  return {
    pos: [x, CARD.thickness / 2 + (depth || 0) * 0.013, z],
    rot: [0, near ? 0 : Math.PI, 0],
    scale: 1
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
