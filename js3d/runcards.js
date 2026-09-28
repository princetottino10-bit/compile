/* =========================================================================
 * 勝ち抜き戦 (ローグライク) だけのカード
 *   β (オリジナル。コード上は star / X_ のまま): 各プロトコルに1枚。名前は「β-FIRE 2」。報酬・ショップ・イベントでデッキに足せる (山札が 18 枚より増える)
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
    ops: [{ op: 'draw', count: 3 }, { op: 'draw', count: 1, player: 'opp' }] },
  /* ここから (2026-09-29): 同じプロトコルの元のカードの段を組み合わせて作る。from: { 段: 元のカードの値 (配列なら順につなぐ) }。
     文と効果は元のカードからそのまま写す (かみ合わせ・関係が必ずあり、エンジンの仕組みもそのまま動く) */
  { id: 'X_METAL', proto: 'METAL', value: 3, from: { upper: 0 } },
  { id: 'X_SPIRIT', proto: 'SPIRIT', value: 2, from: { upper: 3, middle: 1 } },
  { id: 'X_APATHY', proto: 'APATHY', value: 2, from: { upper: 0, middle: 3 } },
  { id: 'X_CHAOS', proto: 'CHAOS', value: 2, from: { middle: 2, lower: 3 } },
  { id: 'X_CLARITY', proto: 'CLARITY', value: 2, from: { middle: 1, lower: 1 } },
  { id: 'X_CORRUPTION', proto: 'CORRUPTION', value: 2, from: { upper: 2, middle: 2 } },
  { id: 'X_COURAGE', proto: 'COURAGE', value: 3, from: { middle: 1, lower: 2 } },
  { id: 'X_FEAR', proto: 'FEAR', value: 3, from: { middle: [2, 4] } },
  { id: 'X_ICE', proto: 'ICE', value: 2, from: { upper: 3, middle: 1, lower: 1 } },
  /* LUCK 4 の中段を、相手のデッキの一番上で */
  { id: 'X_LUCK', proto: 'LUCK', value: 3, art: 5,
    middle: '相手のデッキの一番上のカードを捨て札にする。そのカードの表面の値と同じ値を持つ、覆われているか覆われていないカードを1枚削除する。',
    ops: [{ op: 'discardTop', player: 'opp', bind: 't' }, { op: 'delete', select: { coverage: 'any', value: { eqBindPrinted: 't' } } }] },
  { id: 'X_MIRROR', proto: 'MIRROR', value: 2, from: { upper: 0, lower: 4 } },
  { id: 'X_PEACE', proto: 'PEACE', value: 2, from: { middle: 2, lower: 4 } },
  { id: 'X_SMOKE', proto: 'SMOKE', value: 2, from: { upper: 2, middle: 3 } },
  { id: 'X_TIME', proto: 'TIME', value: 2, from: { middle: 3 }, append: { text: 'カードを1枚引く。', ops: [{ op: 'draw', count: 1 }] } },
  { id: 'X_WAR', proto: 'WAR', value: 2, from: { middle: 4, lower: 3 } },
  { id: 'X_ASSIMILATION', proto: 'ASSIMILATION', value: 2, from: { middle: 4, lower: 2 } },
  { id: 'X_DIVERSITY', proto: 'DIVERSITY', value: 2, from: { upper: 3, middle: 1 } },
  { id: 'X_UNITY', proto: 'UNITY', value: 2, from: { middle: [0, 2] } }
];
/** オリジナルカードの呼び名: β-プロトコル 値 (元のカードと見分けられるように) */
export const betaName = (proto, value) => 'β-' + proto + ' ' + value;
const STAR = Object.fromEntries(STAR_CARDS.map(s => [s.id, s]));
export const starOf = (proto) => STAR_CARDS.find(s => s.proto === proto) || null;

/** オリジナルカードの文 (画面用。効果の中身は要らない)。proto: cards.json のプロトコル。上段・中段・下段を「 / 」でつなぐ */
export function starText(s, proto) {
  if (!s.from) return s.middle || '';
  const byVal = (v) => proto && proto.cards.find(c => c.value === v);
  const parts = [];
  for (const slot of ['upper', 'middle', 'lower']) {
    const src = s.from[slot];
    if (src === undefined) continue;
    const t = (Array.isArray(src) ? src : [src]).map(v => (byVal(v) || {})[slot] || '').join('') + (slot === 'middle' && s.append ? s.append.text : '');
    if (t) parts.push(t);
  }
  if (s.append && s.from.middle === undefined) parts.push(s.append.text);
  return parts.join(' / ');
}

/* オリジナルカードの効果と文。from (元のカードの段を写す) か、middle + ops (直接書く) */
const copy = (x) => JSON.parse(JSON.stringify(x));
export function starParts(s, proto, effectsJson) {
  if (!s.from) {
    return { eff: { middle: { _text: s.middle, ops: s.ops } }, face: { upper: '', middle: s.middle, lower: '' }, types: s.types || [], art: s.art };
  }
  const byVal = (v) => proto.cards.find(c => c.value === v);
  const eff = {}, face = { upper: '', middle: '', lower: '' }, types = new Set();
  let art = null;
  for (const slot of ['upper', 'middle', 'lower']) {
    const src = s.from[slot];
    if (src === undefined) continue;
    const cards = (Array.isArray(src) ? src : [src]).map(byVal);
    if (cards.some(c => !c || !c[slot] || !(effectsJson && effectsJson[c.id] && effectsJson[c.id][slot]))) throw new Error('β の元が無い: ' + s.id + ' ' + slot);
    for (const c of cards) { (c.effectTypes || []).forEach(t => types.add(t)); if (art === null) art = c.number; }
    face[slot] = cards.map(c => c[slot]).join('');
    eff[slot] = cards.length === 1 ? copy(effectsJson[cards[0].id][slot])
      : { _text: face[slot], ops: cards.flatMap(c => copy(effectsJson[c.id][slot].ops || [])) };
  }
  if (s.append) {
    face.middle += s.append.text;
    eff.middle = { _text: face.middle, ops: ((eff.middle && eff.middle.ops) || []).concat(copy(s.append.ops)) };
  }
  return { eff, face, types: [...types], art: s.art || art || 1 };
}

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
    const { eff, face: text, types, art } = starParts(s, p, effectsJson);
    const face = { proto: p.name, color: p.color, set: p.set, number: look(art).number, upper: text.upper, middle: text.middle, lower: text.lower, effectTypes: types };
    add({ id: s.id, proto: p.name, value: s.value, eff }, { ...face, id: s.id, value: s.value, mark: 'β' });
    if (s.value < MAX_VALUE) {
      add({ id: s.id + UP, proto: p.name, value: s.value + 1, eff }, { ...face, id: s.id + UP, value: s.value + 1, mark: 'β＋', baseId: s.id });
    }
  }
  return { engine, ui };
}

/** カードの呼び名 (「FIRE 3」「FIRE 4＋」「FIRE ★」) */
export function runCardLabel(id, defIndex) {
  const d = defIndex && defIndex[id];
  if (!d) return String(id);
  if (STAR[baseOf(id)]) return betaName(d.proto, d.value) + (isUpgraded(id) ? '＋' : '');
  return d.proto + ' ' + d.value + (isUpgraded(id) ? '＋' : '');
}
