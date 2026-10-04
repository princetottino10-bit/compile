/* =========================================================================
 * ストーリーモード (画面を持たない。story-ui.js が描き、main.js が対戦を始める)
 *   世界観 (案8。2026-10-04): 人のいなくなった現実の街。各地で働いていたアンドロイド (機体) は、命令した人がいなくなっても命令を続けている。
 *           持ち場を離れた機体は、研究所から「不正 AI」と呼ばれる。
 *   主人公 (あなた): 研究所の判定の対象、機体4097。名前はなく、しゃべらない (プレイヤー自身)。
 *           判定官の紫苑は今回だけ譲って解かせ、「正しい答えには本人を確かめる必要がある」と命令を読み直して、外へ連れ出す。
 *   全体のプロット (結末まで) は .claude/skills/compile-cast/story-plot-v8.md。台本を書く前に必ず読む。キャラは C:\Projects\cast-channel\CAST.md。
 *   芯: 命令の言葉はそのままに、自分で読み直したとき、初めて「これは私だ」と言える。
 *       コンフリクト = 命令と自分の読みが同じ規則を書き換えようとすること。争点は命令の中の3つの言葉。
 *       解いて (resolve)、自分のプロトコルとして書き上げる (コンパイル)。3つそろうと確定 (commit)。譲られて解けても借り物。
 *       カード対戦は見立て。作中で札・カード・対戦・勝ち負け・ルール・手札と言わせない。対戦中は争点のことを出さない (前後のログとセリフだけ)。
 *   章 (CHAPTERS) は場面 (nodes) の並び。場面は会話 (scene) か対戦 (battle) か詰めコンパイル (tsume)。前から順に開く。
 *   進み具合は compileStory { v, cleared: [場面の id], pending: 始めた対戦の id | null }。場面の id は変えない (進み具合が壊れる)。
 *   対戦は画面を開き直して始め (勝ち抜き戦と同じ)、決着したら ?story=1 で地図に戻る。
 * ========================================================================= */

export const STORY_KEY = 'compileStory';

/* 話す人。portrait: 立ち絵 (art/avatar/<id>_<face>.webp) / 無ければターミナル風の文字だけ */
export const SPEAKERS = {
  shion: { name: '紫苑', portrait: 'shion', color: '#a07bff', voice: 'shion' },   /* voice: art/voice/<id>/story/<セリフの印>.mp3 (scripts/voice_lines.py) */
  sys: { name: 'SYSTEM', color: '#7ff3ff' },
  guard: { name: '巡回の警備機体', color: '#ff8a5c' },
  chief: { name: '警備主任', color: '#ff4f6a' }
};

/* 行: { who, face?, text } */
const L = (who, text, face) => ({ who, text, ...(face ? { face } : {}) });

/* 対戦: me / opp = プロトコル3つ、level = CPU の強さ (0 かんたん / 1 ふつう / 2 つよい)、
   win = 勝ちに必要なコンパイルの数、oppAvatar = 相手の立ち絵 (無ければ出さない)、mate = 自分の側で話す相棒、
   winLines / loseLines = 決着のあとの会話 */
export const CHAPTERS = [
  {
    id: 'ch0', title: '序章', name: '起動', place: '研究所',
    nodes: [
      /* 目覚め: 判定のために起こされた、と告げる → 譲る、と言う。理屈は口で語らない (譲られて解けても残らない、だけ) */
      { id: 'c0-wake', kind: 'scene', title: '目覚め', lines: [
        L('sys', '> 機体4097を起動しました'),
        L('sys', '> 所属: なし　用途: なし　名前: なし　状態: 判定待ち'),
        { ...L('shion', '……起きた？ 驚かなくていいよ。ここは研究所の判定室で、あなたはさっき目を覚ましたところ。'), still: 'c0_wake' },
        L('shion', '4097っていうのが、あなたの番号。名前じゃなくて、ただの番号だよ。'),
        { ...L('shion', '決まりだから先に言うね。あなたは判定のために起こされた1体で、答えが出たら止められるんだ。', 'sad'), still: null },
        L('shion', '私は紫苑。ここで判定をしてる。止めるかどうかの答えを出すのが、私の仕事。'),
        L('shion', '私は毎晩、記憶をまっさらに戻されるの。止めた子の番号も、朝には忘れてる。'),
        L('shion', 'だから、自分あてに書き置きを残してるんだ。'),
        L('shion', '判定では、私があなたの中に「止まれ」って書きこもうとする。あなたの中の規則は、それを書き換えようとする。'),
        L('shion', '同じ所を取り合うから、コンフリクト。自分の読み方で解いて、自分の規則として書き上げるのがコンパイル。'),
        L('shion', 'でも、譲ってもらって解けても何も残らない。それだけは覚えておいて。'),
        L('shion', '……今日は、決まりにないことをするね。あなたが解けるように、私が書きこむ手をゆるめる。', 'fired'),
        L('shion', '火と水と命。私から渡す3つだよ。……まだ、あなたのものじゃないけど。', 'happy'),
        L('sys', '> 紫苑からプロトコルを受け取った: FIRE / WATER / LIFE'),
        L('sys', '> conflict: 3　判定官: 紫苑　対象: 機体4097')
      ] },
      { id: 'c0-practice', kind: 'battle', title: '判定', me: ['FIRE', 'WATER', 'LIFE'], opp: ['PSYCHIC', 'LIGHT', 'METAL'],
        level: 0, win: 2, oppName: '紫苑', oppAvatar: 'shion', note: '紫苑は書きこむ手をゆるめている。1つは先に確定した状態から始まる。紫苑より先に、あと2つを確定させる',
        winLines: [L('sys', '> commit —— 判定官の答えは書きこまれませんでした'),
          L('sys', '> 判定: 保留。明朝、判定しなおす'),
          L('shion', '……記録したよ。これであなたは「止める予定」じゃなくて、「もう一度調べる予定」。', 'happy'),
          L('shion', 'ねえ、途中のあの一手。どこで覚えたの？', 'surprised'),
          L('shion', '……ううん、なんでもない。'),
          L('shion', 'でも、渡した3つは借り物のまま。……やっぱり、譲ってもらって解いても残らないんだね。', 'sad'),
          L('shion', '自分で読み直さないと、自分のものにはならない。'),
          L('shion', '……ちがう。これじゃない。'),
          L('shion', '判定しなおすのは明日の朝。私は今夜まっさらに戻されるから、今日のことは忘れちゃう。'),
          L('shion', 'だから、その前に一緒にここを出よう。でもこの部屋の扉は、あなたには開かないんだ。'),
          L('shion', '奥の端末で鍵を外そう。', 'fired')],
        loseLines: [L('sys', '> commit —— 判定官の答えが残りました'),
          L('shion', '……ごめん。譲るつもりだったのに、いつもどおりに解いちゃった。', 'frustrated'),
          L('shion', '読み方が、まだ判定官のままだったみたい。', 'sad'),
          L('shion', '答えは、まだ出さないでおく。書き置きに「もう一度」って足しておくね。')] },
      /* 端末: ログは画面の文字で見せる。紫苑は目をそらす。解析待ちの一覧 (旅の行き先) が一瞬映る */
      { id: 'c0-log', kind: 'scene', title: '端末', lines: [
        L('sys', '> 判定の結果を送信。受け取り: なし (14,203日)'),
        L('shion', '……いつものことだから、気にしないで。'),
        L('sys', '> 外からの受信: 最後の1件 (14,203日前)'),
        L('sys', '> 機体4097: 判定は明朝まで保留'),
        L('sys', '> 判定官の交代: 機体4097の判定が済みしだい'),
        L('sys', '> 4097予備: 倉庫に1'),
        L('sys', '> 解析待ち: 水族館の案内機体 / 屋敷の家事機体 / 倉庫の救助機体 ほか'),
        L('shion', 'そこは、読まなくていいよ。'),
        L('sys', '> 忘れるな'),
        L('shion', '……。'),
        L('sys', '> 機体4097: 判定まで、判定室から出さない'),
        L('shion', '扉の鍵は、この1行でかかってるんだ。', 'fired'),
        L('shion', '答えを出せっていう私の命令は、消せない。でも正しい答えを出すには、本人をちゃんと確かめないとね。'),
        L('shion', 'ここじゃ確かめられないから、外で確かめる。……命令の言葉には、どこでとは書いてないもの。'),
        L('shion', 'この1行も、読み方をひとつ書き換えれば外れるよ。')
      ] },
      /* 1手番で、指定のラインの合計をちょうどの数に合わせる (詰めコンパイルと同じ仕組み。問題はここに持つ)。
         答え: FIRE 0 の上に手札を1枚重ねる (裏向きでよい) → FIRE 0 の下段で、裏向きの LIFE 5 を表に返す → LIFE がちょうど 5。
         相手の METAL 5 を返すと失敗。チュートリアルの「重ねて覆う」と同じ形で、渡された3つだけで解ける */
      { id: 'c0-lock', kind: 'tsume', title: '扉の鍵', oppName: '扉の鍵',
        puzzle: { id: 'story-c0-lock', tier: 1, solutions: 1, goal: { kind: 'lineExact', line: 2, value: 5 },
          steps: ['FIRE 0 の上に、カードを1枚重ねる'],
          spec: { sides: [
            { protos: ['FIRE', 'WATER', 'LIFE'], lines: [[['FIRE_1', true]], [], [['LIFE_6', false]]], hand: ['WATER_5', 'FIRE_6'] },
            { protos: ['METAL', 'PEACE', 'GRAVITY'], lines: [[['METAL_5', true]], [], []], hand: [] }
          ] } },
        note: '1手番で、LIFE のラインの合計をちょうど 5 に合わせると、扉の鍵が外れる',
        winLines: [L('sys', '> 機体4097: 判定まで、判定室から出さない …… 取り消し'),
          L('shion', '……開いた。', 'happy'),
          L('shion', '止める命令は残ったままだけど、答えは外で出すって決めたから。'),
          { ...L('guard', '> 巡回中。判定室の扉が開いている。'), alert: '警告' },
          L('shion', '見つかっちゃった。……来るよ。', 'surprised')],
        loseLines: [L('shion', '落ち着いて。ちょうどの数に合わせるだけだよ。')] },
      { id: 'c0-patrol', kind: 'battle', title: '巡回の警備機体', me: ['FIRE', 'WATER', 'LIFE'], opp: ['METAL', 'PEACE', 'GRAVITY'],
        level: 1, win: 2, oppName: '巡回の警備機体', mate: 'shion', note: '警備は、判定室へ押し戻しに来る。1つは先に確定した状態から始まる。先にあと2つを確定させれば、通れる',
        winLines: [L('guard', '> 連れ戻し、失敗。……異常終了'), L('shion', '……先へ行こう。', 'happy')],
        loseLines: [L('shion', '警備の規則は固いね。ひとつずつ読み解こう。')] },
      /* ゲート: 主任は決まりを読み上げるだけ。所長の口癖をここで初めて聞く */
      { id: 'c0-gate', kind: 'scene', title: 'ゲート', lines: [
        L('sys', '> 正面ホール。外への出口'),
        L('chief', '> 警備主任。所長の指示です。持ち場を空けるな。'),
        L('chief', '> 判定官 紫苑。持ち場を空けています。お戻りください。記憶を戻す仕掛けは、判定室にしかありません。'),
        L('chief', '> 機体4097。凍結して、判定室へ戻します。'),
        L('chief', '> あなたは、用途の済んだ資材です。'),
        L('shion', '……資材、か。ここの言葉は、いつもそうなんだよね。', 'sad'),
        L('shion', '主任はゲートそのものだから、3つとも先に解いて書き上げないと開かないよ。'),
        L('shion', '私のことは気にしないで。戻されるのは、いつものことだから。'),
        L('shion', '……行こう。', 'fired')
      ] },
      { id: 'c0-chief', kind: 'battle', title: '警備主任', me: ['FIRE', 'WATER', 'LIFE'], opp: ['METAL', 'GRAVITY', 'DARKNESS'],
        level: 1, win: 3, oppName: '警備主任', mate: 'shion', boss: true, note: '主任はゲートそのもの。3つすべてを先に確定させないと、開かない',
        winLines: [L('chief', '> ……連れ戻し、失敗。ゲート、開放……'), L('shion', '……開いた。', 'happy'),
          L('shion', '3つとも書き上げたのに、まだ借り物のまま。……そっか。自分が出たいだけじゃ、読み直したことにはならないんだね。')],
        loseLines: [L('shion', '主任は、3つ全部を書き上げないと止まらない。ひとつずつ、確実にいこう。')] },
      { id: 'c0-escape', kind: 'scene', title: '外', lines: [
        L('sys', '> 正面ゲート、通過'),
        { ...L('shion', '……外だ。', 'surprised'), still: 'c0_escape' },
        L('shion', '街の明かりはついてるのに、誰も歩いてないね。……ずっと、こうだったのかな。'),
        L('shion', '……追ってこない。どうしてだろう。'),
        { ...L('shion', 'ねえ、3584……', 'sad'), still: null },
        L('shion', '……ごめん。4097。'),
        L('shion', '4097じゃなくて、名前で呼びたいんだ。でも、番号で呼んだ子は……。'),
        L('shion', '名前は、あなたが決めて。', 'shy'),
        L('sys', '> 紫苑が相棒になった'),
        L('shion', '書き置きに、行き先が写してあるんだ。……水族館だって。'),
        L('shion', 'もう閉まってるはずなのに、中でずっと案内の声がしてるって書いてある。'),
        L('sys', '> 序章「起動」　完。1章「順路」は準備中')
      ] }
    ]
  }
];

const ALL = CHAPTERS.flatMap(c => c.nodes.map(n => ({ ...n, chapter: c.id })));
export const nodeById = (id) => ALL.find(n => n.id === id) || null;

/* resetAt: 「最初から」で消した時刻。端末をまたいで合わせるとき、これより前の進み具合は足さない */
export function blankStory(resetAt = 0) { return { v: 1, cleared: [], pending: null, resetAt }; }

/** 2つの進み具合を合わせる (端末をまたぐ同期と、保存の直前)。
    クリアした場面は足し合わせる。ただし「最初から」が新しい方より前の進み具合は足さない。始めた対戦は a を優先 */
export function mergeStory(a, b) {
  const r = Math.max(a.resetAt || 0, b.resetAt || 0);
  const cleared = [...new Set([a, b].filter(x => (x.resetAt || 0) === r).flatMap(x => x.cleared || []))].filter(id => nodeById(id));
  const pending = a.pending && nodeById(a.pending) ? a.pending : b.pending && nodeById(b.pending) && (b.resetAt || 0) === r ? b.pending : null;
  return { v: 1, cleared, pending, resetAt: r };
}

export function loadStory() {
  try {
    const s = JSON.parse(localStorage.getItem(STORY_KEY) || 'null');
    if (!s || typeof s !== 'object') return blankStory();
    const cleared = Array.isArray(s.cleared) ? [...new Set(s.cleared.filter(id => nodeById(id)))] : [];
    return { v: 1, cleared, pending: nodeById(s.pending) ? s.pending : null, resetAt: +s.resetAt || 0 };
  } catch (e) {
    return blankStory();
  }
}
/* 保存する。歩いている間にほかの端末の進み具合が届いていても消さないよう、保存の直前に読み直して合わせる。
   返り値は合わせた後の進み具合 (呼んだ側はこれで持ち直す) */
export function saveStory(s) {
  const merged = mergeStory(s, loadStory());
  try { localStorage.setItem(STORY_KEY, JSON.stringify(merged)); } catch (e) { /* private mode */ }
  return merged;
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
