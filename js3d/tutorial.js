/* =========================================================================
 * チュートリアル (?tutorial=1..)
 *   実際の盤面で、ルールを1つずつ試しながら覚える。
 *   レッスンごとに「決まった盤面・説明・課題・判定」を持つ。盤面は問題と同じ
 *   Engine.newPuzzle で作り、相手の手番は CPU (かんたん) が進める。
 *   判定は1つの操作を解決し終えるたびに judgeStep で行い、その途中経過 (trace) から
 *   起きたことを順に check(ctx) へ渡す:
 *     ctx.phase: 'mine'   自分の手番が終わった (endSt = 手番を終えた時点の盤面)
 *                'theirs' 相手の手番が終わって自分の手番に戻った
 *                'end'    決着した
 *   相手の手番がコンパイルだけで終わると、1回の操作で 'mine' と 'theirs' が続けて起きる。
 *   戻り値 { ok: true|false, text } で終了、null なら続ける。
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

export const LESSONS = [
  {
    title: 'カードを表向きで置く',
    spec: {
      sides: [
        { protos: ME_PROTOS, lines: [[], [], []], hand: ['SPEED_2', 'FIRE_6', 'LIFE_5'] },
        { protos: OPP_PROTOS, lines: [[up('METAL_5')], [], []], hand: [] }
      ]
    },
    intro: [
      '<b>COMPILE は、自分の3つのプロトコルを全部「コンパイル」したら勝ちのゲームです。</b>' +
        '真ん中に並んだ札がプロトコル。手前の3つがあなた、奥の3つが相手のものです。',
      'プロトコルごとに縦の<b>ライン</b>が3本あります。自分の手番では、手札を1枚、どこかのラインに置きます。' +
        'カードの右上の数字が<b>値</b>で、ラインに置いたカードの値の合計を競います。',
      '<b>表向き</b>で置けるのは、カードと<b>同じプロトコルのライン</b>だけです。' +
        '表向きで置くと、カードの真ん中に書かれた効果がすぐに発動します。'
    ],
    task: 'SPEED 1 を、SPEED のラインに表向きで置こう',
    how: '手札の SPEED 1 をタップして選び、SPEED のラインに出る「表」を押します。',
    check(ctx) {
      if (ctx.phase !== 'mine') return null;
      const st = ctx.endSt;
      if (hasCard(st, ctx.me, lineOf(st, ctx.me, 'SPEED'), 'SPEED_2', true)) {
        return { ok: true, text: 'SPEED 1 の効果「カードを2枚引く」が発動して、手札が増えました。表向きで置くと、真ん中の効果がこうして発動します。' };
      }
      return { ok: false, text: 'SPEED 1 は SPEED のラインに表向きで置きます。表向きで置けるのは、カードと同じプロトコルのラインだけです。' };
    }
  },
  {
    title: '裏向きで置いて、コンパイルする',
    spec: {
      sides: [
        { protos: ME_PROTOS, lines: [[], [up('FIRE_6'), up('FIRE_2'), up('FIRE_3')], []], hand: ['SPEED_6', 'LIFE_3', 'SPEED_3'] },
        { protos: OPP_PROTOS, lines: [[], [up('LIGHT_4')], []], hand: ['LIGHT_2', 'WATER_6'] }
      ]
    },
    intro: [
      'あるラインの合計が<b>10 以上</b>で、しかも<b>相手より大きい</b>と、次の自分の手番の始めにそのプロトコルが<b>コンパイル</b>されます。',
      '<b>裏向き</b>なら、どのラインにも置けます。裏向きのカードの値は、どのカードでも<b>2</b>です。' +
        '(効果は発動しません。中身は相手には見えません)',
      'いま FIRE のラインは 8。でも手札に FIRE のカードはありません。' +
        'カードを選ぶと各ラインに「表」「裏」のボタンが出るので、FIRE のラインの<b>「裏」</b>を押してみましょう。'
    ],
    task: 'FIRE のラインの合計を 10 以上にして、コンパイルしよう',
    wait: 'FIRE のラインが 10 になりました。相手の手番のあと、あなたの手番の始めにコンパイルされます',
    how: '手札を選び、FIRE のラインの「裏」を押します。相手の手番のあと、あなたの手番の始めにコンパイルされます。',
    check(ctx) {
      const fire = lineOf(ctx.st, ctx.me, 'FIRE');
      if (ctx.phase === 'mine') {
        if (readyLines(ctx.endSt, ctx.me, ctx.total).includes(fire)) return null;   // 相手の手番のあとでコンパイル
        return { ok: false, text: 'FIRE のラインは 8 です。どのカードでも裏向きなら値は 2 なので、FIRE のラインに裏向きで置けば 10 になります。' };
      }
      if (ctx.st.players[ctx.me].protocols[fire].compiled) {
        return { ok: true, text: 'FIRE がコンパイルされました。コンパイルすると、そのラインのカードは両者とも捨て札になり、プロトコルが「Compiled」に変わります。' };
      }
      return { ok: false, text: 'FIRE をコンパイルできませんでした。もう一度試してみましょう。' };
    }
  },
  {
    title: '手札をリフレッシュする',
    spec: {
      sides: [
        { protos: ME_PROTOS, lines: [[up('SPEED_5')], [up('FIRE_3')], []], hand: ['LIFE_2'] },
        { protos: OPP_PROTOS, lines: [[up('METAL_4')], [], [up('WATER_6')]], hand: [] }
      ]
    },
    intro: [
      '自分の手番でできることは、「カードを1枚置く」か「<b>リフレッシュ</b>」のどちらか1つです。',
      'リフレッシュは、カードを置く代わりに、手札が<b>5枚になるまで</b>山札から引く行動です。' +
        '手札が5枚未満のときだけできます。'
    ],
    task: 'リフレッシュして、手札を5枚にしよう',
    how: '手札の横にある「リフレッシュ」ボタンを押します。',
    check(ctx) {
      if (ctx.phase !== 'mine') return null;
      if (ctx.endSt.players[ctx.me].hand.length >= 5) {
        return { ok: true, text: '手札が5枚になりました。置けるカードが少ないときや、欲しいカードを探したいときに使います。' };
      }
      return { ok: false, text: 'カードを置くと、その手番はそれで終わりです。手札の横の「リフレッシュ」ボタンを押してみましょう。' };
    }
  },
  {
    title: '効果で相手のコンパイルを止める',
    spec: {
      sides: [
        { protos: ME_PROTOS, lines: [[up('SPEED_5')], [], [up('LIFE_5')]], hand: ['FIRE_2', 'SPEED_2', 'LIFE_4'] },
        { protos: OPP_PROTOS, lines: [[], [up('LIGHT_6'), up('LIGHT_2'), up('LIGHT_5')], []], hand: [] }
      ]
    },
    intro: [
      '相手の LIGHT のラインは 10。このままだと、相手の次の手番の始めに LIGHT がコンパイルされてしまいます。',
      'カードの効果で止めましょう。<b>FIRE 1</b> の効果は「手札を1枚捨てる。そうしたらカードを1枚<b>削除</b>する」。' +
        '削除したカードは捨て札になり、ラインの合計から外れます。',
      'ほかのカードに<b>覆われている</b>カード (下に重なっているカード) は、ふつうは削除できません。狙えるのは各スタックの一番上です。'
    ],
    task: '相手が次の手番でコンパイルできないようにしよう',
    how: 'FIRE 1 を FIRE のラインに「表」で置き、手札を1枚捨ててから、相手の LIGHT のラインの一番上のカードを削除します。',
    check(ctx) {
      if (ctx.phase === 'theirs' || ctx.phase === 'end') {
        return { ok: false, text: '相手が LIGHT をコンパイルしました。FIRE 1 で、LIGHT のラインの一番上のカード (値4) を削除しましょう。' };
      }
      if (!readyLines(ctx.endSt, 1 - ctx.me, ctx.total).length) {
        return { ok: true, text: '相手の LIGHT のラインが 10 を下回り、コンパイルを止めました。合計を上げるだけでなく、相手の合計を下げるのも大事な手です。' };
      }
      return { ok: false, text: '相手の LIGHT のラインがまだ 10 以上です。FIRE 1 を表向きで置いて、LIGHT のラインの一番上のカード (値4) を削除しましょう。' };
    }
  },
  {
    title: '3つ目をコンパイルして勝つ',
    spec: {
      sides: [
        { protos: ME_PROTOS, compiled: [false, true, true], lines: [[up('SPEED_4'), up('SPEED_6')], [], []], hand: ['LIFE_5', 'FIRE_5', 'SPEED_2'] },
        { protos: OPP_PROTOS, lines: [[up('METAL_5')], [up('LIGHT_3')], []], hand: ['LIGHT_2', 'WATER_6'] }
      ]
    },
    intro: [
      'FIRE と LIFE はもうコンパイル済みです。残るは SPEED。3つ全部コンパイルすれば勝ちです。',
      'SPEED のラインは 8、相手は 5。これまでのことを使って、SPEED をコンパイルできる形にしましょう。'
    ],
    task: 'SPEED のラインを 10 以上にして、勝利しよう',
    wait: 'SPEED のラインが 10 になりました。相手の手番のあと、3つ目のコンパイルです',
    how: 'SPEED 1 を表向きで置くと 9 にしかなりません。裏向き (値2) なら…？',
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
const OUTRO = 'ここまでで基本はおしまいです。慣れてきたら、カードの上段 (常に有効) と下段 (一番上にあるときだけ有効) の効果、' +
  'ラインで優位を取ると得られる「コントロール」のルールも試してみてください。';

/* ---------- 画面 ---------- */

function overlay(id, html) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="pz-card tu-card" role="dialog" aria-modal="true">' + html + '</div>';
  el.classList.add('show');
  const close = () => el.classList.remove('show');
  return { el, close };
}

function lessonTag(index) {
  return 'LESSON ' + (index + 1) + ' / ' + LESSONS.length;
}

/* 説明を1枚ずつ見せ、最後に「やってみる」で閉じる */
export function showLessonIntro(index) {
  const lesson = LESSONS[index];
  return new Promise((resolve) => {
    let page = 0;
    const render = () => {
      const last = page === lesson.intro.length - 1;
      const { el, close } = overlay('tutorialIntro',
        '<div class="tu-head"><span class="pz-tag">' + lessonTag(index) + '</span><b>' + esc(lesson.title) + '</b></div>' +
        '<p class="tu-text">' + lesson.intro[page] + '</p>' +
        (last ? '<p class="tu-task"><span>課題</span>' + esc(lesson.task) + '</p>' : '') +
        '<div class="tu-foot"><span class="tu-dots">' + lesson.intro.map((_, i) => '<i class="' + (i === page ? 'on' : '') + '"></i>').join('') + '</span>' +
          (page > 0 ? '<button type="button" id="tuPrev">戻る</button>' : '') +
          '<button type="button" class="pz-main" id="tuNext">' + (last ? 'やってみる' : '次へ') + '</button></div>');
      el.onclick = null;
      const prev = el.querySelector('#tuPrev');
      if (prev) prev.onclick = () => { page--; render(); };
      el.querySelector('#tuNext').onclick = () => {
        if (!last) { page++; render(); return; }
        close();
        resolve();
      };
    };
    render();
  });
}

/* プレイ中、上に課題を出す。「説明」で説明を読み直せる */
export function showLessonBar(index, handlers) {
  const lesson = LESSONS[index];
  let el = document.getElementById('puzzleBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'puzzleBar';
    document.body.appendChild(el);
  }
  el.innerHTML = '<span class="pz-tag">' + lessonTag(index) + '</span>' +
    '<div class="pz-text"><b>' + esc(lesson.task) + '</b><small>' + esc(lesson.how) + '</small></div>' +
    '<button type="button" id="tuHelp">説明</button>' +
    '<button type="button" id="pzRetry">やり直す</button>';
  el.querySelector('#tuHelp').onclick = handlers.onHelp;
  el.querySelector('#pzRetry').onclick = handlers.onRetry;
}

/* 判定の結果。クリアなら次のレッスンへ、最後なら締めの案内 */
export function showLessonResult(index, result, handlers) {
  const lastLesson = index === LESSONS.length - 1;
  const done = result.ok && lastLesson;
  const { el, close } = overlay('tutorialResult',
    '<div class="pz-result ' + (result.ok ? 'ok' : 'ng') + '"><b>' +
      (done ? 'チュートリアル完了！' : result.ok ? 'クリア！' : 'もう一度') + '</b>' +
      '<p>' + esc(result.text) + '</p>' + (done ? '<p>' + esc(OUTRO) + '</p>' : '') + '</div>' +
    '<div class="pz-row">' +
      (result.ok
        ? (done
          ? '<button type="button" class="pz-main" id="tuPlay">CPU と対戦する</button><button type="button" id="tuTop">トップページへ</button>'
          : '<button type="button" class="pz-main" id="tuNextLesson">次のレッスンへ</button>')
        : '<button type="button" class="pz-main" id="tuAgain">もう一度</button>') +
      '<button type="button" id="tuLook">盤面を見る</button>' +
    '</div>');
  el.onclick = (ev) => { if (ev.target === el) close(); };
  const bind = (id, fn) => { const b = el.querySelector(id); if (b) b.onclick = fn; };
  bind('#tuNextLesson', handlers.onNext);
  bind('#tuAgain', handlers.onRetry);
  bind('#tuPlay', handlers.onPlay);
  bind('#tuTop', handlers.onTop);
  bind('#tuLook', close);
}
