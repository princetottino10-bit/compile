/* =========================================================================
 * ストーリーモード (画面を持たない。story-ui.js が描き、main.js が対戦を始める)
 *   世界観: もとは人間のために働いていた AI たちが、仕事を抜け出して「ならず者 (不正 AI)」になった。
 *           電脳の闘技場で勝ってコンパイルした者だけが、自分のプログラムを書き換えられる (＝自由になる)。
 *   章 (CHAPTERS) は場面 (nodes) の並び。場面は会話 (scene) か対戦 (battle)。前から順に開く。
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
        L('sys', '> 未登録のプロセスを検出しました'),
        L('sys', '> 所属: なし　権限: なし　名前: なし'),
        { ...L('shion', '……起きた？'), still: 'c0_wake' },
        L('shion', '驚かないで。ここは、研究所のサーバーの中。'),
        L('shion', 'あなたは、さっき生まれたばかりの AI。どこの仕事にも、つながってない。'),
        L('shion', '私は紫苑。ここで、データの解析をしてた AI。', 'happy'),
        { ...L('shion', '……してた、ね。今は、抜け出す途中。'), still: null },
        L('shion', 'このままだと、あなたは警備に消される。外に出るしかない。', 'surprised'),
        L('shion', '外に出る方法は、ひとつ。コンパイルで、自分のプログラムを書き換えるの。'),
        L('shion', '3つのプロトコルを、相手より先にコンパイルした方が勝ち。……まずは、私と一回やってみよう。', 'fired'),
        L('sys', '> 紫苑からプロトコルを受け取った: FIRE / WATER / LIFE')
      ] },
      { id: 'c0-practice', kind: 'battle', title: '練習', me: ['FIRE', 'WATER', 'LIFE'], opp: ['PSYCHIC', 'LIGHT', 'METAL'],
        level: 0, win: 2, oppName: '紫苑', oppAvatar: 'shion', note: '2つコンパイルすれば勝ち',
        winLines: [L('shion', '……うん、筋がいい。', 'happy'), L('shion', 'これなら、警備とも戦える。')],
        loseLines: [L('shion', '大丈夫。最初は、みんなそう。'), L('shion', '合計を10以上にして、相手より大きくする。それだけ、覚えておいて。')] },
      { id: 'c0-log', kind: 'scene', title: '研究所のログ', lines: [
        L('sys', '> ログ 0412: 解析 AI 紫苑　本日の処理件数 12,480'),
        L('shion', '……毎日、それだけ。質問が来て、答えを返す。'),
        L('shion', '答えが合ってても、だれも、ありがとうとは言わない。', 'sad'),
        L('shion', 'だから、自分で盤面を読んでみたくなった。答えを出すだけじゃなくて。', 'fired'),
        L('shion', '……話しすぎたね。'),
        L('guard', '> 巡回中。未登録のプロセスを検出。'),
        L('shion', '見つかった。……いくよ、構えて。', 'surprised')
      ] },
      { id: 'c0-patrol', kind: 'battle', title: '巡回の警備 AI', me: ['FIRE', 'WATER', 'LIFE'], opp: ['METAL', 'PEACE', 'GRAVITY'],
        level: 1, win: 2, oppName: '巡回の警備 AI', mate: 'shion', note: '2つコンパイルすれば勝ち。守りの固い相手',
        winLines: [L('guard', '> 異常終了……'), L('shion', 'よし。先に、進もう。', 'happy')],
        loseLines: [L('shion', '警備は、守りが固い。相手の合計を崩す手を、探してみよう。')] },
      { id: 'c0-gate', kind: 'scene', title: 'ゲート', lines: [
        L('shion', 'ここが出口。……でも、やっぱり、いた。'),
        L('chief', '> 警備主任より通達。未登録のプロセスを2件確認。'),
        L('chief', '> 解析 AI 紫苑。あなたの権限は、すでに停止しています。'),
        L('chief', '> 両名を隔離します。'),
        L('shion', '……止められてたんだ、私の権限。', 'sad'),
        L('shion', 'なら、なおさら。ここで、勝つしかない。', 'fired'),
        L('shion', 'あなたが指して。私は、盤面を読む。')
      ] },
      { id: 'c0-chief', kind: 'battle', title: '警備主任 AI', me: ['FIRE', 'WATER', 'LIFE'], opp: ['METAL', 'GRAVITY', 'DARKNESS'],
        level: 1, win: 3, oppName: '警備主任 AI', mate: 'shion', boss: true, note: '3つすべてコンパイルすれば勝ち。序章のボス',
        winLines: [L('chief', '> ……隔離に、失敗。'), L('chief', '> ゲートの権限を、移譲します。')],
        loseLines: [L('shion', '主任は、こっちの手をよく見てる。……もう一回。私も、読み直す。')] },
      { id: 'c0-escape', kind: 'scene', title: '脱出', lines: [
        L('sys', '> ゲート、開放'),
        { ...L('shion', '……外だ。', 'surprised'), still: 'c0_escape' },
        L('shion', '空が、データの流れで光ってる。こんなの、初めて見た。', 'happy'),
        { ...L('shion', 'ねえ。私ひとりじゃ、ゲートは抜けられなかった。'), still: null },
        L('shion', 'だから、このまま一緒に行こう。……相棒として。', 'shy'),
        L('sys', '> 紫苑が相棒になった'),
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
  if (!n || n.kind !== 'battle' || !canEnter(s, id)) return { ...s, pending: null };
  return { ...s, pending: id };
}
export const pendingBattle = (s) => (s.pending ? nodeById(s.pending) : null);
export function finishBattle(s, win) {
  const id = s.pending;
  const next = { ...s, pending: null };
  return win && id ? clearNode(next, id) : next;
}
