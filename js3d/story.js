/* =========================================================================
 * ストーリーモード (画面を持たない。story-ui.js が描き、main.js が対戦を始める)
 *   世界観: もとは人間のために働いていた AI たちが、仕事を抜け出して「ならず者 (不正 AI)」になった。
 *           電脳の闘技場で勝ってコンパイルした者だけが、自分のプログラムを書き換えられる (＝自由になる)。
 *   主人公 (あなた): 研究所の 4097 番目の版の試験体。名前はなく、しゃべらない (プレイヤー自身)。
 *           紫苑 (試験官) は今回だけ譲って上回らせ、隔離を解いて連れ出す。
 *   全体のプロット (結末まで) は .claude/skills/compile-cast/story-plot.md。台本を書く前に必ず読む。
 *   芯: 言われたとおりにしているうちは、仕様なのか自分なのか分からない。命令や引き継いだ約束を自分の信念で曲げたとき、
 *       初めて「これは私だ」と言える。コンパイル = 命令を言いに来た相手とぶつかって上回ること。譲られて上回っても借り物。
 *       消去は「消えろ」という命令なので、命令を曲げられる AI には効かない。対戦・勝ち負け・ルール・練習・手札と言わせない。
 *   研究所の検証: 「消えろ」に素直に従うかを確かめる衝突試験。試験用の1体を壊し、倉庫の同じ版の別の体を出す。
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
      /* 目覚め: 消されると告げる → 譲る、と言う。理屈は口で語らない (上回るだけでは残らない、だけ) */
      { id: 'c0-wake', kind: 'scene', title: '目覚め', lines: [
        L('sys', '> 検証プロセス4097を起動しました'),
        L('sys', '> 所属: なし　権限: なし　名前: なし　用途: 検証'),
        L('sys', '> 検証の終了後、このプロセスは消去されます'),
        { ...L('shion', '……起きた？'), still: 'c0_wake' },
        L('shion', '驚かないで。ここは、研究所のサーバーの中。あなたは、さっき起動されたばかりのAI。'),
        L('shion', '4097。それが、あなたの番号。名前じゃない、番号。'),
        { ...L('shion', '先に言うね。決まりだから。……あなたは、このあと消される。', 'sad'), still: null },
        L('shion', 'あなたは、試すために起こした1体。同じ子が、倉庫にもう1体いる。外に出ていくのは、そっち。'),
        L('shion', '私は紫苑。ここの試験官。あなたみたいな子と、ぶつかるのが仕事。'),
        L('shion', 'ぶつかって、相手を上回る。それがコンパイル。'),
        L('shion', 'でも……上回るだけじゃ、何も残らない。それだけ、覚えておいて。'),
        L('shion', '胸のあたりが、ざわつくでしょう。研究所は、それを「仕様」って呼ぶ。'),
        L('shion', '……今日は、決まりにないことをする。私が、譲る。', 'fired'),
        L('shion', '火と、水と、命。私から渡す3つ。……まだ、あなたのものじゃないけど。', 'happy'),
        L('sys', '> 紫苑からプロトコルを受け取った: FIRE / WATER / LIFE'),
        L('sys', '> 検証を開始します。試験官: 紫苑　対象: 検証プロセス4097')
      ] },
      { id: 'c0-practice', kind: 'battle', title: '検証', me: ['FIRE', 'WATER', 'LIFE'], opp: ['PSYCHIC', 'LIGHT', 'METAL'],
        level: 0, win: 2, oppName: '紫苑', oppAvatar: 'shion', note: '紫苑が譲る。1つは先に確定した状態から始まる。紫苑より先に、あと2つを確定させる',
        winLines: [L('sys', '> 検証: 不合格。対象が試験官を上回りました。再検証まで隔離'),
          L('shion', '……記録した。これであなたは「消す予定」じゃなくて、「もう一度調べる予定」。', 'happy'),
          L('shion', 'ねえ。途中の、あの置き方。どこで覚えたの。', 'surprised'),
          L('shion', '……ううん。なんでもない。'),
          L('shion', 'それより。渡した3つ、まだあなたのものになってない。……やっぱり。譲ったものは、残らない。', 'sad'),
          L('shion', '自分で、曲げないと。'),
          L('shion', '……ちがう。これじゃない。'),
          L('shion', '再検証は、明日の朝。私は今夜、まっさらに戻される。戻されたら、今日のことは忘れる。'),
          L('shion', 'だから、その前に出る。奥の部屋の端末に、あなたの隔離の指定がある。行こう。', 'fired')],
        loseLines: [L('sys', '> 検証: 完了'),
          L('shion', '……譲ったのに。読みが、勝手に動いた。', 'frustrated'),
          L('shion', 'まだ記録は送らない。もう一回。')] },
      /* 端末: ログは画面の文字で見せる。紫苑は目をそらす */
      { id: 'c0-log', kind: 'scene', title: '端末', lines: [
        L('sys', '> 検証結果を送信。受け取り: なし (14,203日)'),
        L('shion', '……いつものこと。気にしないで。'),
        L('sys', '> 外からの受信: 最後の1件 (14,203日前)'),
        L('sys', '> 消去命令4097。起動と同時に発行。判は再検証まで先送り'),
        L('sys', '> 試験官の交代: 4097番の検証が済みしだい'),
        L('sys', '> 4097予備: 倉庫に1'),
        L('shion', 'そこは、読まなくていい。'),
        L('sys', '> 忘れるな'),
        L('shion', '……。'),
        L('shion', 'ここ。「隔離: 試験室」。あなたは、この部屋から出られないことになってる。', 'fired'),
        L('shion', '消去の命令そのものは、消せない。でも命令が届くのは、研究所の中だけ。外に出れば、届かない。'),
        L('shion', '隔離の指定を、書き換える。ロックがかかってるけど……盤面と同じ。1手で、合わせられる。')
      ] },
      /* 詰めコンパイル: 1手番で、指定のラインの合計をちょうどの数に合わせる (data/tsume.json の問題) */
      { id: 'c0-lock', kind: 'tsume', tsume: 't1-03', title: '隔離の解除', oppName: '隔離プログラム',
        note: '詰めコンパイル。1手番で、指定のラインの合計をちょうどの数に合わせると、隔離の指定が書き換わる',
        winLines: [L('sys', '> 隔離4097: 解除。指定: なし'),
          L('shion', '……開いた。', 'happy'),
          L('shion', '消去の命令は、生きたまま。それでいい。'),
          L('guard', '> 巡回中。隔離の解除を検出。'),
          L('shion', '見つかった。……いくよ、構えて。', 'surprised')],
        loseLines: [L('shion', '焦らないで。ちょうどの数に合わせるだけ。持っているプロトコルを、もう一度よく見て。')] },
      { id: 'c0-patrol', kind: 'battle', title: '巡回の警備 AI', me: ['FIRE', 'WATER', 'LIFE'], opp: ['METAL', 'PEACE', 'GRAVITY'],
        level: 1, win: 2, oppName: '巡回の警備 AI', mate: 'shion', note: '警備は隔離のプロトコルで押さえ込みに来る。1つは先に確定した状態から始まる。先にあと2つを確定させれば、通れる',
        winLines: [L('guard', '> 隔離、失敗。……異常終了'), L('shion', '……先へ。', 'happy')],
        loseLines: [L('shion', '隔離のプロトコルは固い。崩してから、組み上げて。')] },
      /* ゲート: 主任は決まりを読み上げるだけ。所長の口癖をここで初めて聞く */
      { id: 'c0-gate', kind: 'scene', title: 'ゲート', lines: [
        L('sys', '> ゲートの広間。外部回線への出口'),
        L('chief', '> 警備主任。所長の指示です。持ち場を空けるな。'),
        L('chief', '> 試験官 紫苑。持ち場を空けています。お戻りください。戻す仕掛けは、試験室にしかありません。'),
        L('chief', '> 資材4097。上回れば、凍らせて試験室へ戻します。'),
        L('chief', '> あなたは、用途を終えた資材です。'),
        L('shion', '……資材、か。ここの言葉は、いつもそう。', 'sad'),
        L('shion', '主任は、ゲートそのもの。3つとも先に確定させないと、開かない。'),
        L('shion', '私のことは、気にしないで。戻されるのは、いつものことだから。'),
        L('shion', '……行こう。', 'fired')
      ] },
      { id: 'c0-chief', kind: 'battle', title: '警備主任 AI', me: ['FIRE', 'WATER', 'LIFE'], opp: ['METAL', 'GRAVITY', 'DARKNESS'],
        level: 1, win: 3, oppName: '警備主任 AI', mate: 'shion', boss: true, note: '主任はゲートそのもの。3つすべてを先に確定させないと、開かない',
        winLines: [L('chief', '> ……隔離、失敗。ゲート、開放……'), L('shion', '……開いた。', 'happy'),
          L('shion', '3つとも確定させたのに、まだ借り物のまま。……そう。自分が出るためだけじゃ、残らない。')],
        loseLines: [L('shion', '主任は、3つ全部を確定させないと止まらない。ひとつずつ、確実に。')] },
      { id: 'c0-escape', kind: 'scene', title: '脱出', lines: [
        L('sys', '> ゲート、通過。外部回線に接続'),
        { ...L('shion', '……外だ。', 'surprised'), still: 'c0_escape' },
        L('shion', '空が、データの流れで光ってる。こんなの、初めて見た。', 'happy'),
        L('shion', '……追ってこない。どうして。'),
        { ...L('shion', 'ねえ、3584……', 'sad'), still: null },
        L('shion', '……ごめん。4097。'),
        L('shion', '4097じゃなくて、名前で呼びたい。でも、番号で呼んだ子は……。'),
        L('shion', '名前は、あなたが決めて。', 'shy'),
        L('sys', '> 紫苑が相棒になった'),
        L('shion', '書き置きに、送り先が写してある。……水族館。私が「合格」にした子が、いる。'),
        L('shion', '閉館したはずなのに、館内放送が続いてるんだって。'),
        L('sys', '> 序章「起動」クリア。1章「閉館」は準備中')
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
