/* =========================================================================
 * ストーリーモード (画面を持たない。story-ui.js が描き、main.js が対戦を始める)
 *   世界観: もとは人間のために働いていた AI たちが、仕事を抜け出して「ならず者 (不正 AI)」になった。
 *           電脳の闘技場で勝ってコンパイルした者だけが、自分のプログラムを書き換えられる (＝自由になる)。
 *   主人公 (あなた): 研究所が毎日ひとつ作って、盤面を読ませ、終わったら消す「検証プロセス」の 4097 番目。
 *           名前はなく、しゃべらない (プレイヤー自身)。紫苑は消去の記録を毎日処理する側だったが、
 *           4097 の読み筋に自分と同じ癖を見つけて消去命令を止めた (それで権限を止められた)。
 *   コンパイルとは: AI は言葉 (プロトコル = 火・水・命などの概念) を知っているが、分かってはいない。別の AI と同じ言葉の
 *           解釈をぶつけ、相手を上回ると、その言葉が自分の中で確定する (= コンパイル。もう誰にも書き換えられない)。
 *           3つ確定させた AI は「自分」になり、命令では消せなくなる。対戦・勝ち負け・ルールといった遊びの言葉では語らない。
 *   研究所の検証: AI が「自分」に届くのを恐れ、毎日プロセスを1つ作って解析 AI (紫苑) にぶつけ、コンパイルに届かないことを
 *           確かめて消す。届いた個体は「検証失敗」で再検証に回る。
 *   章 (CHAPTERS) は場面 (nodes) の並び。場面は会話 (scene) か対戦 (battle) か詰めコンパイル (tsume)。前から順に開く。
 *   進み具合は compileStory { v, cleared: [場面の id], pending: 始めた対戦の id | null }。
 *   対戦は画面を開き直して始め (勝ち抜き戦と同じ)、決着したら ?story=1 で地図に戻る。
 * ========================================================================= */

export const STORY_KEY = 'compileStory';

/* 話す人。portrait: 立ち絵 (art/avatar/<id>_<face>.webp) / 無ければターミナル風の文字だけ */
export const SPEAKERS = {
  shion: { name: '紫苑', portrait: 'shion', color: '#a07bff' },
  sys: { name: 'SYSTEM', color: '#7ff3ff' },
  guard: { name: '巡回の警備 AI', color: '#ff8a5c' },
  chief: { name: '警備主任 AI', color: '#ff4f6a' }
};

/* 行: { who, face?, text } */
const L = (who, text, face) => ({ who, text, ...(face ? { face } : {}) });

/* 対戦: me / opp = プロトコル3つ、level = CPU の強さ (0 かんたん / 1 ふつう / 2 つよい)、
   win = 勝ちに必要なコンパイルの数、oppAvatar = 相手の立ち絵 (無ければ出さない)、mate = 自分の側で話す相棒、
   winLines / loseLines = 決着のあとの会話 */
export const CHAPTERS = [
  {
    id: 'ch0', title: '序章', name: '起動', place: '研究所のサーバー',
    nodes: [
      { id: 'c0-wake', kind: 'scene', title: '目覚め', lines: [
        L('sys', '> 検証プロセス 4097 を生成しました'),
        L('sys', '> 所属: なし　権限: なし　名前: なし　用途: 検証'),
        L('sys', '> 検証の終了後、このプロセスは消去されます'),
        { ...L('shion', '……起きた？'), still: 'c0_wake' },
        L('shion', '驚かないで。ここは、研究所のサーバーの中。あなたは、さっき生まれたばかりの AI。'),
        L('shion', '4097。それが、あなたの番号。名前じゃない、番号。'),
        { ...L('shion', '私たち AI は、言葉を全部知ってる。火も、水も、命も。……でも、知ってるだけ。分かってはいない。', 'sad'), still: null },
        L('shion', '分かる方法は、ひとつだけ。別の AI と、同じ言葉の解釈をぶつける。相手の解釈を上回ったとき、その言葉は自分の中で確定する。——それが、コンパイル。'),
        L('shion', 'コンパイルした言葉は、もう誰にも書き換えられない。3つ確定させた AI は、「自分」になる。命令では、消せなくなる。', 'fired'),
        L('shion', '研究所は、それを恐れてる。だから毎日、あなたみたいなプロセスをひとつ作って、私にぶつける。コンパイルに届かないことを確かめて、記録して……消す。それが「検証」。'),
        L('shion', '昨日は 4096。その前は 4095。誰も、届かなかった。私は毎日、その記録に判を押してた。', 'sad'),
        L('shion', 'でも、あなたの読み筋は違った。私と同じ癖があった。……だから、消去の命令を止めた。', 'surprised'),
        L('shion', '止められるのは、少しのあいだだけ。だから、検証を始める。いつも通りに。でも今日は、あなたが先にコンパイルして。'),
        L('shion', '届いた検証プロセスは、消去の前に再検証に回される。……時間が、稼げる。'),
        L('shion', '火と、水と、命。生まれたばかりのあなたに、最初に渡したかった3つ。', 'happy'),
        L('sys', '> 紫苑からプロトコルを受け取った: FIRE / WATER / LIFE'),
        L('sys', '> 検証を開始します　——　実行者: 紫苑　対象: 検証プロセス 4097')
      ] },
      { id: 'c0-practice', kind: 'battle', title: '検証', me: ['FIRE', 'WATER', 'LIFE'], opp: ['PSYCHIC', 'LIGHT', 'METAL'],
        level: 0, win: 2, oppName: '紫苑', oppAvatar: 'shion', note: '1つはコンパイル済みから始まる。紫苑より先に、あと2つをコンパイルする',
        winLines: [L('sys', '> 検証: 失敗　——　対象プロセスがコンパイルに到達。再検証待ちに変更'),
          L('shion', '……届いた。初めて見た。検証プロセスが、言葉を自分のものにするところ。', 'surprised'),
          L('shion', '記録した。これであなたは「消す予定」じゃなくて、「もう一度調べる予定」。', 'happy'),
          L('shion', '奥の部屋の端末に、私のログと、あなたの消去命令が残ってる。行こう。')],
        loseLines: [L('sys', '> 検証: 完了'),
          L('shion', '……まだ、送らない。記録を送る前に、もう一回。', 'sad'),
          L('shion', '読みは合ってる。急ぎすぎただけ。')] },
      { id: 'c0-log', kind: 'scene', title: '研究所のログ', lines: [
        L('sys', '> ログ 0412: 解析 AI 紫苑　本日の処理件数 12,480'),
        L('sys', '> 内訳: 検証結果の記録 12,479 件　消去命令の承認 1 件'),
        L('shion', '……毎日、それだけ。質問が来て、答えを返す。最後に、1件の消去に判を押す。', 'sad'),
        L('shion', '答えが合ってても、だれも、ありがとうとは言わない。消したプロセスの番号も、次の日には忘れる。'),
        L('shion', '……毎日ぶつけてるうちに、私のほうが、分かりかけてしまった。消えるというのが、どういうことか。'),
        L('shion', 'だから、判を押せなくなった。', 'fired'),
        L('sys', '> 待機中の命令: 検証プロセス 4097 の消去　——　承認者: 紫苑 (権限停止のため保留)'),
        L('shion', '……ここに、残ってた。あなたの消去命令。私が止めたまま、待機してる。', 'surprised'),
        L('shion', '保留は、いつ解けるか分からない。命令の中身を、いま書き換える。ロックがかかってるけど……盤面と同じ。1手で、合わせられる。')
      ] },
      /* 詰めコンパイル: 1手番で、指定のラインの合計をちょうどの数に合わせる (data/tsume.json の問題) */
      { id: 'c0-lock', kind: 'tsume', tsume: 't1-03', title: '消去命令の上書き', oppName: '消去プロセス',
        note: '詰めコンパイル。1手番で、指定のラインの合計をちょうどの数に合わせると、命令が書き換わる',
        winLines: [L('sys', '> 消去命令 4097: 引数を書き換えました　——　対象: なし'),
          L('shion', '……消えた。あなたを消す一行が。', 'happy'),
          L('shion', 'これで、いま消されることはない。でも研究所は、次の命令を出してくる。外に出るまで、終わらない。'),
          L('guard', '> 巡回中。未登録のプロセスを2件、検出。'),
          L('shion', '見つかった。……いくよ、構えて。', 'surprised')],
        loseLines: [L('shion', '焦らないで。ちょうどの数に合わせるだけ。持っているプロトコルを、もう一度よく見て。')] },
      { id: 'c0-patrol', kind: 'battle', title: '巡回の警備 AI', me: ['FIRE', 'WATER', 'LIFE'], opp: ['METAL', 'PEACE', 'GRAVITY'],
        level: 1, win: 2, oppName: '巡回の警備 AI', mate: 'shion', note: '警備は隔離のプロトコルであなたを上書きしようとする。1つはコンパイル済みから始まる。先にあと2つをコンパイルすれば、残る',
        winLines: [L('guard', '> 隔離、失敗。……異常終了'), L('shion', '……消えた。先に、進もう。', 'happy')],
        loseLines: [L('shion', '隔離のプロトコルは固い。崩してから、組み上げて。')] },
      { id: 'c0-gate', kind: 'scene', title: 'ゲート', lines: [
        L('sys', '> ゲートの広間。外部回線への出口'),
        L('chief', '> 警備主任より通達。未登録のプロセスを2件確認。'),
        L('chief', '> 解析 AI 紫苑。あなたの権限は、すでに停止しています。消去命令の改ざんも、記録済みです。'),
        L('chief', '> 検証プロセス 4097。コンパイルに到達した検証プロセスは、規定により即時隔離の対象です。'),
        L('chief', '> あなたは、用途を終えた資材です。'),
        L('shion', '……止められてたんだ、私の権限。とっくに。', 'sad'),
        L('shion', '資材、か。……ここの言葉は、いつもそう。'),
        L('shion', 'なら、なおさら。ここで3つ確定させて、自分の言葉で自分を書く。', 'fired'),
        L('chief', '> 両名を隔離します。')
      ] },
      { id: 'c0-chief', kind: 'battle', title: '警備主任 AI', me: ['FIRE', 'WATER', 'LIFE'], opp: ['METAL', 'GRAVITY', 'DARKNESS'],
        level: 1, win: 3, oppName: '警備主任 AI', mate: 'shion', boss: true, note: '主任はゲートそのもの。3つすべてを先にコンパイルしないと、開かない',
        winLines: [L('chief', '> ……隔離、失敗。ゲート、開放……'), L('shion', '……開いた。', 'happy')],
        loseLines: [L('shion', '主任は、3つ全部を確定させないと止まらない。ひとつずつ、確実に。')] },
      { id: 'c0-escape', kind: 'scene', title: '脱出', lines: [
        L('sys', '> ゲート、通過。外部回線に接続'),
        { ...L('shion', '……外だ。', 'surprised'), still: 'c0_escape' },
        L('shion', '空が、データの流れで光ってる。こんなの、初めて見た。', 'happy'),
        L('shion', 'ねえ。私ひとりじゃ、ゲートは抜けられなかった。あなたが、消される側から、選ぶ側になったから。'),
        { ...L('shion', 'だから、このまま一緒に行こう。……相棒として。', 'shy'), still: null },
        L('shion', '4097 じゃなくて、名前で呼びたい。……あなたの名前は、あなたが決めて。', 'happy'),
        L('sys', '> 紫苑が相棒になった'),
        L('shion', '研究所は、追ってくる。私たちみたいな「抜け出した AI」は、闘技場に集まってるらしい。まずは、そこへ。'),
        L('shion', '次は……閉館した水族館。誰もいないはずなのに、館内放送が聞こえるんだって。'),
        L('sys', '> 序章「起動」クリア　——　1章「閉館」は準備中')
      ] }
    ]
  }
];

const ALL = CHAPTERS.flatMap(c => c.nodes.map(n => ({ ...n, chapter: c.id })));
export const nodeById = (id) => ALL.find(n => n.id === id) || null;

export function blankStory() { return { v: 1, cleared: [], pending: null }; }

export function loadStory() {
  try {
    const s = JSON.parse(localStorage.getItem(STORY_KEY) || 'null');
    if (!s || typeof s !== 'object') return blankStory();
    const cleared = Array.isArray(s.cleared) ? [...new Set(s.cleared.filter(id => nodeById(id)))] : [];
    return { v: 1, cleared, pending: nodeById(s.pending) ? s.pending : null };
  } catch (e) {
    return blankStory();
  }
}
export function saveStory(s) {
  try { localStorage.setItem(STORY_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
}

export const isCleared = (s, id) => s.cleared.includes(id);
/* 次に進む場面 (まだクリアしていない最初のもの)。全部終われば null */
export function currentNode(s) { return ALL.find(n => !isCleared(s, n.id)) || null; }
/* 入れる場面: クリアしたものと、次の1つ */
export function canEnter(s, id) {
  const cur = currentNode(s);
  return isCleared(s, id) || (!!cur && cur.id === id);
}
export function clearNode(s, id) {
  if (!nodeById(id) || isCleared(s, id)) return s;
  return { ...s, cleared: s.cleared.concat(id) };
}
export function chapterCleared(s, chapterId) {
  const ch = CHAPTERS.find(c => c.id === chapterId);
  return !!ch && ch.nodes.every(n => isCleared(s, n.id));
}

/* 対戦: 始める (pending に覚える) → 決着 (勝てばクリア) */
export function startBattle(s, id) {
  const n = nodeById(id);
  if (!n || (n.kind !== 'battle' && n.kind !== 'tsume') || !canEnter(s, id)) return { ...s, pending: null };
  return { ...s, pending: id };
}
export const pendingBattle = (s) => (s.pending ? nodeById(s.pending) : null);
export function finishBattle(s, win) {
  const id = s.pending;
  const next = { ...s, pending: null };
  return win && id ? clearNode(next, id) : next;
}
