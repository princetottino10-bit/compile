/* =========================================================================
 * ストーリーのモブ (名前のない機体) だけが使うプロトコル「量産」 (名前は仮で MASS)
 *   元のカードと β カードは名前のある人物が使う。モブは3ラインとも、この同じ量産プロトコルで戦う (18 枚 = 同じ6枚 x3)。
 *   cards.json には入れないので、カードリスト・ふつうの対戦・勝ち抜き戦には出てこない。
 *   エンジン (engine.js の init の3つ目。newProto) と CPU の Worker、画面の protoIndex / defIndex に登録する。
 *   名前を決めたら MOB_PROTO を書き換える (カードの id も MOB_PROTO_番号 になる)
 * ========================================================================= */

export const MOB_PROTO = 'MASS';
/** モブのデッキ (3ラインとも同じ) */
export const MOB_DECK = [MOB_PROTO, MOB_PROTO, MOB_PROTO];

/* 6枚。値 0〜5。どれも元のプロトコルのカードより弱い (引くのは1枚まで、相手には手を出さない、効果の無いカードが2枚) */
const CARDS = [
  { value: 0, types: ['draw'], middle: 'カードを1枚引く。', ops: [{ op: 'draw', count: 1 }] },
  { value: 1, types: ['draw', 'discard'], middle: 'カードを1枚引く。あなたは手札を1枚捨て札にする。',
    ops: [{ op: 'draw', count: 1 }, { op: 'discard', count: 1 }] },
  { value: 2, types: [] },
  { value: 3, types: ['shift'], middle: 'あなたは自分のカードを1枚移動させることができる。',
    ops: [{ op: 'shift', select: { owner: 'self' }, optional: true }] },
  { value: 4, types: [] },
  { value: 5, types: ['discard'], middle: 'あなたは手札を1枚捨て札にする。', ops: [{ op: 'discard', count: 1 }] }
];

/** 画面に足すプロトコル (cards.json の protocols の1つと同じ形。mob: true で、プロトコルを並べる画面からは外す) */
export const MOB_PROTOCOL = {
  name: MOB_PROTO, displayName: MOB_PROTO, tags: '量産', color: '#7d8590', set: 'Mob', mob: true,
  cards: CARDS.map((c, i) => ({ id: MOB_PROTO + '_' + (i + 1), number: i + 1, value: c.value, upper: '', middle: c.middle || '', lower: '', effectTypes: c.types }))
};

/** 量産プロトコルの定義。engine: engine.js の init の3つ目に足す形 / ui: 画面の defIndex に足す形 */
export function buildMobDefs() {
  const engine = [], ui = [];
  const p = MOB_PROTOCOL;
  p.cards.forEach((c, i) => {
    const src = CARDS[i];
    const eff = src.ops ? { middle: { _text: src.middle, ops: JSON.parse(JSON.stringify(src.ops)) } } : {};
    engine.push({ id: c.id, proto: p.name, value: c.value, eff, newProto: true });
    ui.push({ id: c.id, proto: p.name, color: p.color, number: c.number, set: p.set, value: c.value,
      upper: c.upper, middle: c.middle, lower: c.lower, effectTypes: c.effectTypes });
  });
  return { engine, ui, protocol: p };
}
