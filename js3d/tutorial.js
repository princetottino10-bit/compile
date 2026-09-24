/* =========================================================================
 * チュートリアル (?tutorial=1..)
 *   実際の盤面で、ルールを1つずつ試しながら覚える。
 *   レッスンごとに「決まった盤面・案内・判定」を持つ。盤面は問題と同じ
 *   Engine.newPuzzle で作り、相手の手番は CPU (かんたん) が進める。
 *
 *   案内 (steps) は「次へ」で送らない。いまの操作の状態から自動で選ぶ:
 *     c.sel     選んでいる手札のカード (def ID) / null
 *     c.ask     答えを求められている選択 (req.prompt。'discard' / 'delete' など) / null
 *     c.waiting 自分の手番を終え、相手の手番やコンパイルを待っている
 *   when(c) が真になる最後の案内を出す (先頭は常に出せる)。focus で押す場所を光らせる:
 *     { card: 'SPEED_2' } その手札だけ明るく / { button: 'btnRefresh' } そのボタン /
 *     { line: 'SPEED', face: 'up' | 'down' } そのラインの「表」「裏」
 *
 *   判定は1つの操作を解決し終えるたびに judgeStep で行い、その途中経過 (trace) から
 *   起きたことを順に check(ctx) へ渡す:
 *     ctx.phase: 'mine'   自分の手番が終わった (endSt = 手番を終えた時点の盤面)
 *                'theirs' 相手の手番が終わって自分の手番に戻った
 *                'end'    決着した
 *   相手の手番がコンパイルだけで終わると、1回の操作で 'mine' と 'theirs' が続けて起きる。
 *   戻り値 { ok: true|false, text } で終了、null なら続ける。
 *   終わったら自動で次のレッスン (失敗ならやり直し) に進む。
 * ========================================================================= */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ME_PROTOS = ['SPEED', 'FIRE', 'LIFE'];
const OPP_PROTOS = ['METAL', 'LIGHT', 'WATER'];

const up = (id) => [id, true];

/* 盤面の見方 (手元の側のラインは 自分のプロトコルの名前で呼ぶ) */
function lineOf(st, side, name) {
  return st.players[side].protocols.findIndex(p => p.name === name);
}
function hasCard(st, side, line, defId, faceUp) {
  return st.lines[line][side].some(u => st.cards[u].def === defId && (faceUp === undefined || st.cards[u].faceUp === faceUp));
}
/* 10 以上で、相手より大きいライン (= 次の手番の始めにコンパイルされる) */
export function readyLines(st, side, total) {
  return [0, 1, 2].filter(l => total(st, l, side) >= 10 && total(st, l, side) > total(st, l, 1 - side));
}

/* 1つの操作 (自分の手・相手の手) を解決し終えたところで判定する。
   trace の各盤面は出来事の直前のもの。trace[0] が自分の手番なら、その操作は自分の手番のもの */
export function judgeStep(lesson, { st, trace, me, total }) {
  const states = (trace || []).map(t => t && t.st).filter(Boolean);
  const leftMe = states.find(s => s.turn !== me);
  const ctx = (phase, endSt) => ({ st, endSt, phase, me, total });
  if (states.length && states[0].turn === me && leftMe) {
    const r = lesson.check(ctx('mine', leftMe));
    if (r) return r;
  }
  if (st.winner !== null) return lesson.check(ctx('end', st));
  if (st.turn === me && leftMe) return lesson.check(ctx('theirs', st));
  return null;
}

/* いまの操作の状態に合う案内の番号 (when が真になる最後のもの)。
   レッスンが想定していない選択を求められている (違うカードの効果など) ときは -1 (汎用の案内) */
export function coachStep(lesson, c) {
  let at = 0;
  lesson.steps.forEach((s, i) => { if (i > 0 && s.when && s.when(c)) at = i; });
  if (c.ask && !(at > 0 && !lesson.steps[at].when({ ...c, ask: null }))) return -1;
  return at;
}

const ASK_TEXT = 'カードの効果で選ぶ場面です。表示された指示に従って選ぼう。';

export const LESSONS = [
  {
    title: 'カードを表向きで置く',
    task: 'SPEED 1 を、SPEED のラインに表向きで置こう',
    spec: {
      sides: [
        { protos: ME_PROTOS, lines: [[], [], []], hand: ['SPEED_2', 'FIRE_6', 'LIFE_5'] },
        { protos: OPP_PROTOS, lines: [[up('METAL_5')], [], []], hand: [] }
      ]
    },
    steps: [
      { text: '真ん中の札が<b>プロトコル</b> (手前があなた、奥が相手)。3つとも<b>コンパイル</b>すれば勝ちです。' +
          'まずは光っている手札の <b>SPEED 1</b> をタップしよう。',
        focus: { card: 'SPEED_2' } },
      { when: (c) => c.sel === 'SPEED_2',
        text: '<b>表向き</b>で置けるのは、カードと<b>同じプロトコルのライン</b>だけ。SPEED のラインの<b>「表」</b>を押そう。',
        focus: { line: 'SPEED', face: 'up' } },
      { when: (c) => !!c.sel && c.sel !== 'SPEED_2',
        text: 'それは SPEED 1 ではありません。光っている <b>SPEED 1</b> を選び直そう。',
        focus: { card: 'SPEED_2' } }
    ],
    check(ctx) {
      if (ctx.phase !== 'mine') return null;
      const st = ctx.endSt;
      if (hasCard(st, ctx.me, lineOf(st, ctx.me, 'SPEED'), 'SPEED_2', true)) {
        return { ok: true, text: '表向きで置くと、カードの真ん中の効果が発動します。SPEED 1 の「カードを2枚引く」で手札が増えました。' };
      }
      return { ok: false, text: 'SPEED 1 は SPEED のラインに表向きで置きます。表向きで置けるのは、カードと同じプロトコルのラインだけです。' };
    }
  },
  {
    title: '裏向きで置いて、コンパイルする',
    task: 'FIRE のラインの合計を 10 以上にして、コンパイルしよう',
    spec: {
      sides: [
        { protos: ME_PROTOS, lines: [[], [up('FIRE_6'), up('FIRE_2'), up('FIRE_3')], []], hand: ['SPEED_6', 'LIFE_3', 'SPEED_3'] },
        { protos: OPP_PROTOS, lines: [[], [up('LIGHT_4')], []], hand: ['LIGHT_2', 'WATER_6'] }
      ]
    },
    steps: [
      { text: 'ラインの合計が<b>10 以上</b>で<b>相手より大きい</b>と、次の自分の手番の始めにコンパイルされます。' +
          'FIRE のラインは今 8。手札のどれかをタップしよう。' },
      { when: (c) => !!c.sel,
        text: '手札に FIRE のカードはないけれど、<b>裏向き</b>ならどのラインにも置けて、値は<b>2</b>。FIRE のラインの<b>「裏」</b>を押そう。',
        focus: { line: 'FIRE', face: 'down' } },
      { when: (c) => c.waiting,
        text: 'FIRE のラインが 10 になりました。相手の手番のあと、あなたの手番の始めにコンパイルされます…' }
    ],
    check(ctx) {
      const fire = lineOf(ctx.st, ctx.me, 'FIRE');
      if (ctx.phase === 'mine') {
        if (readyLines(ctx.endSt, ctx.me, ctx.total).includes(fire)) return null;   // 相手の手番のあとでコンパイル
        return { ok: false, text: 'FIRE のラインは 8。どのカードでも裏向きなら値は 2 なので、FIRE のラインに裏向きで置けば 10 になります。' };
      }
      if (ctx.st.players[ctx.me].protocols[fire].compiled) {
        return { ok: true, text: 'コンパイルすると、そのラインのカードは両者とも捨て札になり、プロトコルが「COMPILED」に変わります。' };
      }
      return { ok: false, text: 'FIRE をコンパイルできませんでした。もう一度試してみましょう。' };
    }
  },
  {
    title: '手札をリフレッシュする',
    task: 'リフレッシュして、手札を5枚にしよう',
    spec: {
      sides: [
        { protos: ME_PROTOS, lines: [[up('SPEED_5')], [up('FIRE_3')], []], hand: ['LIFE_2'] },
        { protos: OPP_PROTOS, lines: [[up('METAL_4')], [], [up('WATER_6')]], hand: [] }
      ]
    },
    steps: [
      { text: '自分の手番でできるのは「カードを1枚置く」か「<b>リフレッシュ</b>」のどちらか。' +
          'リフレッシュは手札が<b>5枚になるまで</b>引きます。光っている<b>「REFRESH」</b>を押そう。',
        focus: { button: 'btnRefresh' } },
      { when: (c) => !!c.sel,
        text: 'カードを置くと、その手番はそれで終わりです。今回は<b>「REFRESH」</b>を押そう。',
        focus: { button: 'btnRefresh' } }
    ],
    check(ctx) {
      if (ctx.phase !== 'mine') return null;
      if (ctx.endSt.players[ctx.me].hand.length >= 5) {
        return { ok: true, text: '手札が5枚になりました。置けるカードが少ないときや、欲しいカードを探したいときに使います。' };
      }
      return { ok: false, text: 'カードを置くと、その手番はそれで終わりです。手札の横の「REFRESH」を押してみましょう。' };
    }
  },
  {
    title: '重ねて覆う (上段・中段・下段)',
    task: 'FIRE 0 の上にカードを重ねて、FIRE 0 の下段を発動させよう',
    spec: {
      sides: [
        { protos: ME_PROTOS, lines: [[], [up('FIRE_1')], []], hand: ['SPEED_6', 'LIFE_5', 'SPEED_3'] },
        { protos: OPP_PROTOS, lines: [[up('METAL_5')], [], []], hand: [] }
      ]
    },
    steps: [
      { text: 'カードの文は3段。<b>上段</b>は表向きなら覆われていても有効、<b>中段</b>は置いた (表になった) ときに1回、' +
          '<b>下段</b>は一番上にあるときだけ有効。FIRE 0 の下段は「<b>覆われることになったとき</b>：先に1枚引き、他のカードを1枚反転」。手札をタップしよう。' },
      { when: (c) => !!c.sel,
        text: '裏向きでも上に重ねれば「覆う」ことになります。FIRE のラインの<b>「裏」</b>を押して FIRE 0 を覆おう。',
        focus: { line: 'FIRE', face: 'down' } },
      { when: (c) => c.ask === 'flip',
        text: '覆われる直前に FIRE 0 の下段が発動しました。反転するカードを選ぼう。相手の <b>METAL 4</b> (値4) を裏にすると、値は2に下がります。' }
    ],
    check(ctx) {
      if (ctx.phase !== 'mine') return null;
      const st = ctx.endSt;
      const fire = st.lines[lineOf(st, ctx.me, 'FIRE')][ctx.me];
      if (fire.length >= 2 && st.cards[fire[0]].def === 'FIRE_1') {
        return { ok: true, text: '覆われる直前に FIRE 0 の下段が動いて、1枚引いて1枚反転しました。覆われたあとの下段は無効ですが、上段なら覆われても効き続けます。' };
      }
      return { ok: false, text: 'FIRE 0 の上にカードを重ねてみましょう。裏向きならどのカードでも FIRE のラインに置けます。' };
    }
  },
  {
    title: '効果で相手のコンパイルを止める',
    task: '相手が次の手番でコンパイルできないようにしよう',
    spec: {
      sides: [
        { protos: ME_PROTOS, lines: [[up('SPEED_5')], [], [up('LIFE_5')]], hand: ['FIRE_2', 'SPEED_2', 'LIFE_4'] },
        { protos: OPP_PROTOS, lines: [[], [up('LIGHT_6'), up('LIGHT_2'), up('LIGHT_5')], []], hand: [] }
      ]
    },
    steps: [
      { text: '相手の LIGHT は 10。このままだと相手の次の手番でコンパイルされます。' +
          '<b>FIRE 1</b> の効果「手札を1枚捨てる → カードを1枚<b>削除</b>」で止めよう。FIRE 1 をタップ。',
        focus: { card: 'FIRE_2' } },
      { when: (c) => c.sel === 'FIRE_2',
        text: '効果を使うので<b>表向き</b>で。FIRE のラインの<b>「表」</b>を押そう。',
        focus: { line: 'FIRE', face: 'up' } },
      { when: (c) => !!c.sel && c.sel !== 'FIRE_2',
        text: '使うのは光っている <b>FIRE 1</b>。選び直そう。',
        focus: { card: 'FIRE_2' } },
      { when: (c) => c.ask === 'discard',
        text: 'まず手札を1枚捨てます。どれでも大丈夫。選んで<b>「決定」</b>。' },
      { when: (c) => c.ask === 'delete',
        text: '削除するカードを選ぼう。下に<b>覆われた</b>カードは選べません。狙うのは LIGHT のラインの<b>一番上 (値4)</b>。' }
    ],
    check(ctx) {
      if (ctx.phase === 'theirs' || ctx.phase === 'end') {
        return { ok: false, text: '相手が LIGHT をコンパイルしました。FIRE 1 で、LIGHT のラインの一番上のカード (値4) を削除しましょう。' };
      }
      if (!readyLines(ctx.endSt, 1 - ctx.me, ctx.total).length) {
        return { ok: true, text: '相手の LIGHT が 10 を下回りました。合計を上げるだけでなく、相手の合計を下げるのも大事な手です。' };
      }
      return { ok: false, text: '相手の LIGHT がまだ 10 以上です。FIRE 1 を表向きで置いて、LIGHT のラインの一番上のカード (値4) を削除しましょう。' };
    }
  },
  {
    title: '手札の上限 (キャッシュ)',
    task: 'FIRE 0 を表向きで置いて、手札を増やしてみよう',
    spec: {
      sides: [
        { protos: ME_PROTOS, lines: [[], [], []], hand: ['FIRE_1', 'SPEED_6', 'LIFE_5', 'FIRE_4', 'LIFE_3'] },
        { protos: OPP_PROTOS, lines: [[up('METAL_5')], [], []], hand: [] }
      ]
    },
    steps: [
      { text: '手札は<b>手番の終わりに5枚まで</b>。6枚以上あると、5枚になるまで捨てます (<b>キャッシュのクリア</b>)。' +
          'FIRE 0 は置くと「他のカードを1枚反転、<b>2枚引く</b>」。光っている <b>FIRE 0</b> をタップしよう。',
        focus: { card: 'FIRE_1' } },
      { when: (c) => c.sel === 'FIRE_1',
        text: 'FIRE のラインの<b>「表」</b>を押そう。',
        focus: { line: 'FIRE', face: 'up' } },
      { when: (c) => !!c.sel && c.sel !== 'FIRE_1',
        text: '使うのは光っている <b>FIRE 0</b>。選び直そう。',
        focus: { card: 'FIRE_1' } },
      { when: (c) => c.ask === 'flip',
        text: '反転するカードを選ぼう。相手の <b>METAL 4</b> を裏にすると値が2に下がります。' },
      { when: (c) => c.ask === 'clear-cache',
        text: '2枚引いて手札が<b>6枚</b>。手番の終わりに5枚まで捨てます。いらないカードを1枚選んで<b>「決定」</b>。' }
    ],
    check(ctx) {
      if (ctx.phase !== 'mine') return null;
      const st = ctx.endSt;
      if (hasCard(st, ctx.me, lineOf(st, ctx.me, 'FIRE'), 'FIRE_1', true) && st.players[ctx.me].hand.length <= 5) {
        return { ok: true, text: '引きすぎたぶんは手番の終わりに捨てます。手札が多いときは、たくさん引く効果より置いて得をするカードを選ぶのがコツです。' };
      }
      return { ok: false, text: 'FIRE 0 を FIRE のラインに表向きで置いて、2枚引いてみましょう。' };
    }
  },
  {
    title: 'コントロールを取る',
    task: '2つのラインで相手より大きくして、コントロールを取ろう',
    spec: {
      useControl: true,
      sides: [
        { protos: ME_PROTOS, lines: [[up('SPEED_5')], [up('FIRE_3')], []], hand: ['SPEED_6', 'FIRE_6'] },
        { protos: OPP_PROTOS, lines: [[up('METAL_4')], [up('LIGHT_5')], []], hand: [] }
      ]
    },
    steps: [
      { text: '合計が相手より大きいラインが<b>2つ以上</b>あると、次の自分の手番の始めに<b>コントロール</b> (真ん中の印) を取れます。' +
          '今リードしているのは SPEED だけ (4 対 3)。LIFE は 0 対 0。手札をタップしよう。' },
      { when: (c) => !!c.sel,
        text: 'LIFE のラインに<b>裏向き (値2)</b> で置けば 2 対 0 でリード。LIFE のラインの<b>「裏」</b>を押そう。',
        focus: { line: 'LIFE', face: 'down' } },
      { when: (c) => c.waiting,
        text: '相手の手番のあと、あなたの手番の始めにコントロールを確かめます…' }
    ],
    check(ctx) {
      const leads = (st) => [0, 1, 2].filter(l => ctx.total(st, l, ctx.me) > ctx.total(st, l, 1 - ctx.me)).length;
      if (ctx.phase === 'mine') {
        if (leads(ctx.endSt) >= 2) return null;   // 相手の手番のあとで取れる
        return { ok: false, text: 'リードしているラインが1つだけです。LIFE のラインに裏向きで置けば、2つのラインでリードできます。' };
      }
      if (ctx.st.control === ctx.me) {
        return { ok: true, text: 'コントロールを取りました。持っている間にコンパイルかリフレッシュをすると、プロトコルを並べ替えられます (次のレッスン)。' };
      }
      return { ok: false, text: 'コントロールを取れませんでした。手番の始めに2つのラインでリードしている必要があります。' };
    }
  },
  {
    title: 'コントロールで並べ替える',
    task: 'リフレッシュのときにコントロールを使い、相手のコンパイルを空振りさせよう',
    spec: {
      useControl: true,
      control: 0,
      sides: [
        { protos: ME_PROTOS, lines: [[up('SPEED_5')], [], []], hand: ['LIFE_2'] },
        { protos: OPP_PROTOS, compiled: [true, false, false], lines: [[], [up('LIGHT_6'), up('LIGHT_4'), up('LIGHT_3')], []], hand: ['WATER_6'] }
      ]
    },
    steps: [
      { text: 'あなたは<b>コントロール</b>を持っています。相手の LIGHT は 13 点、次の相手の手番でコンパイルされます。' +
          'コントロールを持ったまま<b>コンパイルかリフレッシュ</b>をすると、どちらかのプロトコルを<b>並べ替え</b>られます。<b>「REFRESH」</b>を押そう。',
        focus: { button: 'btnRefresh' } },
      { when: (c) => !!c.sel,
        text: '今回はカードを置かずに<b>「REFRESH」</b>を押そう。',
        focus: { button: 'btnRefresh' } },
      { when: (c) => c.ask === 'control-rearrange',
        text: '<b>「相手のプロトコルを並べ替える」</b>を選ぼう。' },
      { when: (c) => c.ask === 'rearrange',
        text: 'カードはラインに残り、プロトコルだけが入れ替わります。相手の <b>13 点のラインの位置</b>に、<b>コンパイル済みの METAL</b> を持ってこよう。' +
          '済んだプロトコルでもう一度コンパイルしても (<b>リコンパイル</b>)、相手は勝ちに近づけません。' }
    ],
    check(ctx) {
      if (ctx.phase !== 'mine') return null;
      const st = ctx.endSt, op = 1 - ctx.me;
      const big = [0, 1, 2].find(l => ctx.total(st, l, op) >= 10);
      if (big !== undefined && st.players[op].protocols[big].compiled) {
        return { ok: true, text: '相手の 13 点のラインが、コンパイル済みの METAL の位置になりました。相手のコンパイルはリコンパイル (相手のデッキの上の1枚をもらうだけ) になります。' };
      }
      return { ok: false, text: '相手の 13 点のラインの位置に、コンパイル済みの METAL を並べ替えましょう。リフレッシュ → 「相手のプロトコルを並べ替える」です。' };
    }
  },
  {
    title: '3つ目をコンパイルして勝つ',
    task: 'SPEED のラインを 10 以上にして、勝利しよう',
    spec: {
      sides: [
        { protos: ME_PROTOS, compiled: [false, true, true], lines: [[up('SPEED_4'), up('SPEED_6')], [], []], hand: ['LIFE_5', 'FIRE_5', 'SPEED_2'] },
        { protos: OPP_PROTOS, lines: [[up('METAL_5')], [up('LIGHT_3')], []], hand: ['LIGHT_2', 'WATER_6'] }
      ]
    },
    steps: [
      { text: 'FIRE と LIFE はコンパイル済み。残る <b>SPEED</b> (8 対 5) をコンパイルすれば勝ちです。手札をタップしよう。' },
      { when: (c) => c.sel === 'SPEED_2',
        text: 'SPEED 1 を表で置いても 9。10 には届きません。<b>裏向き (値2)</b> なら…？ SPEED のラインの<b>「裏」</b>を押そう。',
        focus: { line: 'SPEED', face: 'down' } },
      { when: (c) => !!c.sel && c.sel !== 'SPEED_2',
        text: '裏向きならどのカードでも値は 2。SPEED のラインの<b>「裏」</b>を押せば 10 になります。',
        focus: { line: 'SPEED', face: 'down' } },
      { when: (c) => c.waiting,
        text: 'SPEED が 10 になりました。相手の手番のあと、3つ目のコンパイルです…' }
    ],
    check(ctx) {
      if (ctx.phase === 'end') {
        return ctx.st.winner === ctx.me
          ? { ok: true, text: '3つのプロトコルをすべてコンパイルして、勝利しました！' }
          : { ok: false, text: '相手が勝ちました。もう一度試してみましょう。' };
      }
      const speed = lineOf(ctx.st, ctx.me, 'SPEED');
      if (ctx.phase === 'mine') {
        if (readyLines(ctx.endSt, ctx.me, ctx.total).includes(speed)) return null;
        return { ok: false, text: 'SPEED のラインは 8。どのカードでも裏向きで置けば値2なので、10 になります。' };
      }
      return null;
    }
  }
];

/* 最後のレッスンのあとに出す、ここから先のルール */
const OUTRO = 'ここまでで基本はおしまいです。あとは実戦で、プロトコルごとのカードの組み合わせを試してみてください。' +
  '選択画面の「?」で、各プロトコルの6枚の効果を読めます。';

/* 結果を読む時間 (文の長さに合わせる) */
export function readingMs(text) {
  return Math.max(2600, Math.min(7000, 1600 + String(text).length * 60));
}

/* ---------- 画面 ---------- */

function lessonTag(index) {
  return 'LESSON ' + (index + 1) + ' / ' + LESSONS.length;
}

function coachEl() {
  let el = document.getElementById('tutorialCoach');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tutorialCoach';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    /* 案内の下端を CSS に渡す。横持ちのスマホでは左上の詳細パネルをこの下に出す (重ならないように) */
    if (typeof ResizeObserver === 'function') new ResizeObserver(syncCoachBottom).observe(el);
    window.addEventListener('resize', syncCoachBottom);
  }
  return el;
}

function syncCoachBottom() {
  const el = document.getElementById('tutorialCoach');
  const shown = !!el && el.classList.contains('show');
  document.body.classList.toggle('coach-on', shown);
  if (shown) document.documentElement.style.setProperty('--coach-bottom', Math.round(el.getBoundingClientRect().bottom) + 'px');
}

let coachTimer = null;
let coachKey = '';

/* 案内を出す (同じ案内なら描き直さない) */
export function showCoach(index, stepNo, onRetry) {
  const lesson = LESSONS[index];
  const key = index + ':' + stepNo;
  if (key === coachKey) return;
  coachKey = key;
  clearTimeout(coachTimer);
  const el = coachEl();
  el.className = 'show';
  el.onclick = null;
  el.innerHTML =
    '<div class="tc-head"><span class="tc-tag">' + lessonTag(index) + '</span><b>' + esc(lesson.title) + '</b>' +
      '<button type="button" class="tc-retry" aria-label="このレッスンをやり直す">やり直す</button></div>' +
    '<p class="tc-say">' + (stepNo < 0 ? ASK_TEXT : lesson.steps[stepNo].text) + '</p>' +
    '<p class="tc-goal"><span>課題</span>' + esc(lesson.task) + '</p>';
  el.querySelector('.tc-retry').onclick = (ev) => { ev.stopPropagation(); onRetry(); };
  syncCoachBottom();
}

/* 結果を出している間の「画面のどこでもタップ」の受け口。閉じるときに必ず外す */
let resultUnhook = null;

/* 結果を出し、読む時間が過ぎたら (画面をタップしたらすぐ) onDone。取り消し関数を返す */
export function showCoachResult(index, result, onDone) {
  coachKey = '';
  clearTimeout(coachTimer);
  const el = coachEl();
  const ms = readingMs(result.text);
  const last = index === LESSONS.length - 1;
  el.className = 'show result ' + (result.ok ? 'ok' : 'ng');
  el.innerHTML =
    '<div class="tc-head"><span class="tc-tag">' + lessonTag(index) + '</span>' +
      '<b class="tc-verdict">' + (result.ok ? 'クリア！' : 'もう一度') + '</b></div>' +
    '<p class="tc-say">' + esc(result.text) + '</p>' +
    '<p class="tc-next">' + (result.ok ? (last ? 'まとめへ' : '次のレッスンへ') : 'もう一度やってみよう') + '…<small>画面のどこかをタップですぐ進む</small></p>' +
    '<i class="tc-bar" style="animation-duration:' + ms + 'ms"></i>';
  let done = false;
  /* 結果を読んでいる間は、画面のどこをタップしても進む。そのタップは盤面の操作に渡さない
     (押した瞬間に進め、続く pointerup / click も握りつぶす)。ボタン (メニュー・設定など) はそのまま使える */
  const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  const onTap = (ev) => {
    const btn = ev.target.closest && ev.target.closest('button, a, input, select, textarea');
    if (btn && !el.contains(btn)) return;
    swallow(ev);
    document.addEventListener('pointerup', swallow, { capture: true, once: true });
    document.addEventListener('click', swallow, { capture: true, once: true });
    go();
  };
  const unhook = () => { document.removeEventListener('pointerdown', onTap, true); if (resultUnhook === unhook) resultUnhook = null; };
  if (resultUnhook) resultUnhook();
  resultUnhook = unhook;
  const go = () => { if (done) return; done = true; clearTimeout(coachTimer); unhook(); onDone(); };
  coachTimer = setTimeout(go, ms);
  document.addEventListener('pointerdown', onTap, true);
  syncCoachBottom();
  return () => { done = true; clearTimeout(coachTimer); unhook(); };
}

export function hideCoach() {
  coachKey = '';
  clearTimeout(coachTimer);
  if (resultUnhook) resultUnhook();
  const el = document.getElementById('tutorialCoach');
  if (el) { el.className = ''; el.onclick = null; }
  syncCoachBottom();
}

/* 全レッスンを終えたときのまとめ */
export function showTutorialDone(handlers) {
  hideCoach();
  let el = document.getElementById('tutorialResult');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tutorialResult';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="pz-card tu-card" role="dialog" aria-modal="true">' +
    '<div class="pz-result ok"><b>チュートリアル完了！</b>' +
      '<p>3つのプロトコルをすべてコンパイルして、勝利しました！</p><p>' + esc(OUTRO) + '</p></div>' +
    '<div class="pz-row">' +
      '<button type="button" class="pz-main" id="tuPlay">CPU と対戦する</button>' +
      '<button type="button" id="tuTop">トップページへ</button>' +
      '<button type="button" id="tuAgain">最初から</button>' +
    '</div></div>';
  el.classList.add('show');
  el.querySelector('#tuPlay').onclick = handlers.onPlay;
  el.querySelector('#tuTop').onclick = handlers.onTop;
  el.querySelector('#tuAgain').onclick = () => { el.classList.remove('show'); handlers.onRestart(); };
}
