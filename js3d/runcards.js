/* =========================================================================
 * 勝ち抜き戦 (ローグライク) だけのカード
 *   ★ (オリジナル): 各プロトコルに1枚。報酬・ショップ・宝箱でデッキに足せる (山札が 18 枚より増える)
 *   ＋ (強化): 元のカードの値 +1。休憩所・ショップ・イベントで、デッキのカードを1枚ずつ強化する。
 *              id は元の id に _UP を付けたもの (★ も強化できる)。値 6 のカードは強化できない
 *   効果は effects.json と同じ書き方 (docs/effects-dsl.md)。絵は元のカードの絵を使う (★ は art の番号の絵)
 *   エンジン (engine.js の init の3つ目) と CPU の Worker にも同じものを登録する
 * ========================================================================= */

export const UP = '_UP';
export const MAX_VALUE = 6;
export const isUpgraded = (id) => String(id).endsWith(UP);
export const baseOf = (id) => (isUpgraded(id) ? String(id).slice(0, -UP.length) : String(id));
export const upgradeOf = (id) => (isUpgraded(id) ? null : String(id) + UP);
export const isStar = (id) => /^X_[A-Z]+$/.test(baseOf(id));

/* ★ カード。art: 絵に使う元のカードの番号 (1〜6) */
export const STAR_CARDS = [
  { id: 'X_FIRE', proto: 'FIRE', value: 2, art: 6, types: ['discard', 'delete'],
    middle: 'あなたは手札を1枚捨て札にする。そうした場合、カードを2枚削除する。',
    ops: [{ op: 'discard', count: 1 }, { op: 'ifDone', ops: [{ op: 'delete' }, { op: 'delete' }] }] },
  { id: 'X_WATER', proto: 'WATER', value: 2, art: 5, types: ['draw', 'return'],
    middle: 'カードを2枚引く。カードを1枚戻す。',
    ops: [{ op: 'draw', count: 2 }, { op: 'return' }] },
  { id: 'X_DEATH', proto: 'DEATH', value: 3, art: 6, types: ['delete'],
    middle: '相手のカードを1枚削除する。',
    ops: [{ op: 'delete', select: { owner: 'opp' } }] },
  { id: 'X_LIFE', proto: 'LIFE', value: 2, art: 5, types: ['draw', 'flip'],
    middle: 'カードを2枚引く。あなたのカードを1枚反転させることができる。',
    ops: [{ op: 'draw', count: 2 }, { op: 'flip', select: { owner: 'self' }, optional: true }] },
  { id: 'X_SPEED', proto: 'SPEED', value: 1, art: 4, types: ['draw'],
    middle: 'カードを3枚引く。',
    ops: [{ op: 'draw', count: 3 }] },
  { id: 'X_PSYCHIC', proto: 'PSYCHIC', value: 2, art: 5, types: ['discard', 'reveal'],
    middle: '相手は手札を2枚捨て札にし、そのあと手札を公開する。',
    ops: [{ op: 'discard', count: 2, player: 'opp' }, { op: 'reveal', target: 'oppHand' }] },
  { id: 'X_LIGHT', proto: 'LIGHT', value: 3, art: 5, types: ['flip', 'draw'],
    middle: 'カードを1枚反転させる。カードを2枚引く。',
    ops: [{ op: 'flip' }, { op: 'draw', count: 2 }] },
  { id: 'X_DARKNESS', proto: 'DARKNESS', value: 1, art: 5, types: ['flip'],
    middle: '相手のカードを2枚反転させる。',
    ops: [{ op: 'flip', select: { owner: 'opp' } }, { op: 'flip', select: { owner: 'opp' } }] },
  { id: 'X_GRAVITY', proto: 'GRAVITY', value: 2, art: 5, types: ['shift', 'draw'],
    middle: 'カードを2枚移動させる。カードを1枚引く。',
    ops: [{ op: 'shift' }, { op: 'shift' }, { op: 'draw', count: 1 }] },
  { id: 'X_PLAGUE', proto: 'PLAGUE', value: 1, art: 5, types: ['discard', 'flip'],
    middle: '相手は手札を1枚捨て札にする。相手のカードを1枚反転させる。',
    ops: [{ op: 'discard', count: 1, player: 'opp' }, { op: 'flip', select: { owner: 'opp' } }] },
  { id: 'X_HATE', proto: 'HATE', value: 3, art: 5, types: ['delete', 'discard'],
    middle: 'カードを1枚削除する。相手は手札を1枚捨て札にする。',
    ops: [{ op: 'delete' }, { op: 'discard', count: 1, player: 'opp' }] },
  { id: 'X_LOVE', proto: 'LOVE', value: 2, art: 5, types: ['draw'],
    middle: 'カードを3枚引く。相手はカードを1枚引く。',
    ops: [{ op: 'draw', count: 3 }, { op: 'draw', count: 1, player: 'opp' }] }
];
const STAR = Object.fromEntries(STAR_CARDS.map(s => [s.id, s]));
export const starOf = (proto) => STAR_CARDS.find(s => s.proto === proto) || null;

/** 勝ち抜き戦のカードの定義を作る。
 *  engine: engine.js に登録する形 [{ id, proto, value, eff }]
 *  ui: 画面 (main.js の defIndex) に足す形 (元のカードの見た目に mark: '＋' / '★' を付ける) */
export function buildRunDefs(cardsJson, effectsJson) {
  const engine = [], ui = [];
  const add = (e, u) => { engine.push(e); ui.push(u); };
  for (const p of cardsJson.protocols) {
    const look = (n) => p.cards.find(c => c.number === n) || p.cards[p.cards.length - 1];
    for (const c of p.cards) {
      if (c.value >= MAX_VALUE) continue;
      const base = { proto: p.name, color: p.color, set: p.set, number: c.number, upper: c.upper, middle: c.middle, lower: c.lower, effectTypes: c.effectTypes || [] };
      add({ id: c.id + UP, proto: p.name, value: c.value + 1, eff: (effectsJson && effectsJson[c.id]) || {} },
        { ...base, id: c.id + UP, value: c.value + 1, mark: '＋', baseId: c.id });
    }
    const s = STAR_CARDS.find(x => x.proto === p.name);
    if (!s) continue;
    const eff = { middle: { _text: s.middle, ops: s.ops } };
    const face = { proto: p.name, color: p.color, set: p.set, number: look(s.art).number, upper: '', middle: s.middle, lower: '', effectTypes: s.types };
    add({ id: s.id, proto: p.name, value: s.value, eff }, { ...face, id: s.id, value: s.value, mark: '★' });
    if (s.value < MAX_VALUE) {
      add({ id: s.id + UP, proto: p.name, value: s.value + 1, eff }, { ...face, id: s.id + UP, value: s.value + 1, mark: '★＋', baseId: s.id });
    }
  }
  return { engine, ui };
}

/** カードの呼び名 (「FIRE 3」「FIRE 4＋」「FIRE ★」) */
export function runCardLabel(id, defIndex) {
  const d = defIndex && defIndex[id];
  if (!d) return String(id);
  if (STAR[baseOf(id)]) return d.proto + ' ★' + (isUpgraded(id) ? '＋' : '') + ' (' + d.value + ')';
  return d.proto + ' ' + d.value + (isUpgraded(id) ? '＋' : '');
}
