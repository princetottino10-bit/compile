/* =========================================================================
 * ストーリーのモブ (名前のない機体) だけが使う「量産プロトコル」3つ (名前はどれも仮)
 *   元のカードと β カードは名前のある人物が使う。モブはこの3つでデッキを組む (タッグの相方も同じ3つ。並びだけ変える)。
 *   ROUTINE: 決まった手順 (少しだけ引く) / CONVEY: 運ぶ (自分のカードを動かす) / SCRAP: 片付け (捨て札・自分のカードの反転)
 *   どれも値 0〜5 の6枚で、元のプロトコルより弱い (引くのは1枚まで、相手のカードには触らない、効果の無いカードが2枚)。
 *   cards.json には入れないので、カードリスト・ふつうの対戦・勝ち抜き戦には出てこない。
 *   エンジン (engine.js の init の3つ目。newProto) と CPU の Worker、画面の protoIndex / defIndex に登録する。
 *   名前を決めたら MOB_PROTOCOLS の name を書き換える (カードの id も 名前_番号 になる)
 * ========================================================================= */

const DISCARD_SELF = { types: ['discard'], middle: 'あなたは手札を1枚捨て札にする。', ops: [{ op: 'discard', count: 1 }] };
const BLANK = { types: [] };

const SPECS = [
  { name: 'ROUTINE', tags: '量産／手順', color: '#7d8590', cards: [
    { types: ['draw'], middle: 'カードを1枚引く。', ops: [{ op: 'draw', count: 1 }] },
    { types: ['draw', 'discard'], middle: 'カードを1枚引く。あなたは手札を1枚捨て札にする。', ops: [{ op: 'draw', count: 1 }, { op: 'discard', count: 1 }] },
    BLANK,
    { types: ['draw'], middle: 'カードを1枚引く。', ops: [{ op: 'draw', count: 1 }] },
    BLANK,
    DISCARD_SELF
  ] },
  { name: 'CONVEY', tags: '量産／運搬', color: '#8a7f6a', cards: [
    { types: ['shift'], middle: 'あなたは自分のカードを1枚移動させることができる。', ops: [{ op: 'shift', select: { owner: 'self' }, optional: true }] },
    { types: ['shift'], middle: 'あなたはこのカードを移動させることができる。', ops: [{ op: 'shift', select: { ref: 'this' }, optional: true }] },
    BLANK,
    { types: ['shift'], middle: 'あなたは自分の裏向きのカードを1枚移動させることができる。', ops: [{ op: 'shift', select: { owner: 'self', facing: 'down' }, optional: true }] },
    BLANK,
    DISCARD_SELF
  ] },
  { name: 'SCRAP', tags: '量産／片付け', color: '#6f7f86', cards: [
    { types: ['other'], middle: 'あなたの捨て札置き場にあるすべてのカードをデッキに戻してシャッフルすることができる。', ops: [{ op: 'shuffleTrashIntoDeck', optional: true }] },
    { types: ['flip'], middle: 'あなたは自分のカードを1枚反転させることができる。', ops: [{ op: 'flip', select: { owner: 'self' }, optional: true }] },
    BLANK,
    { types: ['flip'], middle: '表向きで覆われているあなたのカード１枚を反転させることができる。', ops: [{ op: 'flip', select: { owner: 'self', facing: 'up', coverage: 'covered' }, optional: true }] },
    BLANK,
    DISCARD_SELF
  ] }
];

/** 画面に足すプロトコル (cards.json の protocols と同じ形。mob: true で、プロトコルを並べて選ぶ画面や数え方からは外す) */
export const MOB_PROTOCOLS = SPECS.map(s => ({
  name: s.name, displayName: s.name, tags: s.tags, color: s.color, set: 'Mob', mob: true,
  cards: s.cards.map((c, i) => ({ id: s.name + '_' + (i + 1), number: i + 1, value: i, upper: '', middle: c.middle || '', lower: '', effectTypes: c.types }))
}));
export const MOB_NAMES = MOB_PROTOCOLS.map(p => p.name);
/** モブのデッキ (相手) と、タッグの相方のデッキ (同じ3つを並べ替えたもの) */
export const MOB_DECK = MOB_NAMES.slice();
export const MOB_MATE_DECK = [MOB_NAMES[1], MOB_NAMES[2], MOB_NAMES[0]];
export const isMobProto = (name) => MOB_NAMES.includes(name);

/** 量産プロトコルの定義。engine: engine.js の init の3つ目に足す形 / ui: 画面の defIndex に足す形 / protocols: protoIndex に足す形 */
export function buildMobDefs() {
  const engine = [], ui = [];
  MOB_PROTOCOLS.forEach((p, pi) => {
    p.cards.forEach((c, i) => {
      const src = SPECS[pi].cards[i];
      const eff = src.ops ? { middle: { _text: src.middle, ops: JSON.parse(JSON.stringify(src.ops)) } } : {};
      engine.push({ id: c.id, proto: p.name, value: c.value, eff, newProto: true });
      ui.push({ id: c.id, proto: p.name, color: p.color, number: c.number, set: p.set, value: c.value,
        upper: c.upper, middle: c.middle, lower: c.lower, effectTypes: c.effectTypes });
    });
  });
  return { engine, ui, protocols: MOB_PROTOCOLS };
}
