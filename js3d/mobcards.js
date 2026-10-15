/* =========================================================================
 * ストーリーのモブ (名前のない機体) だけが使うカード「量産」
 *   元のカードと同じプロトコル・同じ値で、効果を弱めたもの。名前は「METAL 1 量産」。
 *   story.js の対戦の mob / tag.oppMob (MOB_DECKS の鍵) で、相手 / 相手の味方の山札の元のカードと入れ替える (engine.js newGame の deckMods / tag.mods)。
 *   cards.json には入れないので、カードリスト・ふつうの対戦・勝ち抜き戦には出てこない。
 *   エンジン (engine.js の init の3つ目) と CPU の Worker、画面の defIndex に、runcards.js のカードと一緒に登録する
 * ========================================================================= */

export const MOB_MARK = '量産';

/* base: 弱める元のカード。upper / middle / lower: 書き換える段 ({ text, ops }。誘発の段は on に元と同じきっかけ)。書かない段は元のまま */
export const MOB_CARDS = [
  /* 警備主任 (序章): 規則どおりにしか動かない。元のカードから、引く枚数を1枚に減らした */
  { id: 'M_METAL_2', base: 'METAL_2',
    middle: { text: 'カードを1枚引く。相手は次の手番でコンパイルすることはできない。', ops: [{ op: 'draw', count: 1 }, { op: 'noCompileNextTurn' }] } },
  { id: 'M_GRAVITY_2', base: 'GRAVITY_2',
    middle: { text: 'カードを1枚引く。このラインから、またはこのラインへとカードを1枚移動させる。', ops: [{ op: 'draw', count: 1 }, { op: 'shift', dest: 'fromOrToThisLine' }] } },
  { id: 'M_DARKNESS_1', base: 'DARKNESS_1',
    middle: { text: 'カードを1枚引く。相手の覆われているカードを1枚移動させる。', ops: [{ op: 'draw', count: 1 }, { op: 'shift', select: { owner: 'opp', coverage: 'covered' } }] } },
  /* 巡回の警備機体 (序章・主任の味方): 同じく、引く枚数を1枚に */
  { id: 'M_SPEED_2', base: 'SPEED_2',
    middle: { text: 'カードを1枚引く。', ops: [{ op: 'draw', count: 1 }] } },
  { id: 'M_FEAR_2', base: 'FEAR_2',
    middle: { text: 'カードを1枚引く。相手は自身の手札をすべて捨て札にして、捨て札にした枚数-1枚のカードを引く。',
      ops: [{ op: 'draw', count: 1 }, { op: 'discard', player: 'opp', count: 'all', bind: 'n' }, { op: 'drawByCount', ref: 'n', plus: -1, player: 'opp' }] } },
  { id: 'M_CLARITY_2', base: 'CLARITY_2',
    lower: { text: 'このカードが覆われることになったとき：先にカードを1枚引く。', ops: [{ op: 'draw', count: 1 }], on: 'wouldBeCovered' } }
];

/* モブごとに入れ替えるカード。story.js の対戦の mob に書く */
export const MOB_DECKS = {
  chief: ['M_METAL_2', 'M_GRAVITY_2', 'M_DARKNESS_1'],
  patrol: ['M_SPEED_2', 'M_FEAR_2', 'M_CLARITY_2']
};

const copy = (x) => JSON.parse(JSON.stringify(x));

/** 量産カードの定義を作る。engine: engine.js に登録する形 / ui: 画面の defIndex に足す形 (runcards.js の buildRunDefs と同じ) */
export function buildMobDefs(cardsJson, effectsJson) {
  const engine = [], ui = [];
  for (const m of MOB_CARDS) {
    const p = cardsJson.protocols.find(x => x.cards.some(c => c.id === m.base));
    const c = p && p.cards.find(x => x.id === m.base);
    if (!c) throw new Error('量産の元のカードが無い: ' + m.id);
    const eff = copy((effectsJson && effectsJson[c.id]) || {});
    const face = { upper: c.upper, middle: c.middle, lower: c.lower };
    for (const slot of ['upper', 'middle', 'lower']) {
      if (!m[slot]) continue;
      eff[slot] = m[slot].on ? { _text: m[slot].text, trigger: { on: m[slot].on, ops: copy(m[slot].ops) } } : { _text: m[slot].text, ops: copy(m[slot].ops) };
      face[slot] = m[slot].text;
    }
    engine.push({ id: m.id, proto: p.name, value: c.value, eff });
    ui.push({ id: m.id, proto: p.name, color: p.color, set: p.set, number: c.number, value: c.value, ...face,
      effectTypes: c.effectTypes || [], mark: MOB_MARK });
  }
  return { engine, ui };
}

/** 対戦の deckMods (1人分): 元のカード → 量産カード */
export function mobDeckMods(key) {
  const ids = MOB_DECKS[key];
  if (!ids) return null;
  const swap = {};
  for (const id of ids) {
    const m = MOB_CARDS.find(x => x.id === id);
    if (m) swap[m.base] = m.id;
  }
  return { swap };
}
