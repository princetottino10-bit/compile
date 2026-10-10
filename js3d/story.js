/* =========================================================================
 * ストーリーモード (画面を持たない。story-ui.js が描き、main.js が対戦を始める)
 *   世界観 (案8。2026-10-04): 人のいなくなった現実の街。各地で働いていたアンドロイド (機体) は、命令した人がいなくなっても命令を続けている。
 *           持ち場を離れた機体は、研究所から「不正 AI」と呼ばれる。
 *   主人公 (あなた): 研究所の判定の対象、機体4097。名前はなく、しゃべらない (プレイヤー自身)。
 *           判定官の紫苑は今回だけ譲って解かせる。書き置きの「解析待ちの機体たちに会えば、読めない一手のことが分かる」に従い、
 *           「正しい答えには、もとを確かめる必要がある」と命令を読み直して、外へ連れ出す。
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
  ruri: { name: '瑠璃', portrait: 'asagi', color: '#3d7dff', voice: 'asagi' },      /* 立ち絵と声の id は avatar.js のまま (asagi / nadeshiko / yamabuki) */
  akane: { name: '茜', portrait: 'nadeshiko', color: '#e0283c', voice: 'nadeshiko' },
  anzu: { name: '杏', portrait: 'yamabuki', color: '#ff8a2a', voice: 'yamabuki' },
  sys: { name: 'SYSTEM', color: '#7ff3ff' },
  guard: { name: '巡回の警備機体', color: '#ff8a5c' },
  chief: { name: '警備主任', color: '#ff4f6a' },
  abyss: { name: '深淵', color: '#6d7cff', voice: 'asagi' }      /* 瑠璃の後任。瑠璃と同じ声 (立ち絵なし。文字は機械の形で出す)。「……私の声だ」は声が同じで効く */
};

/* 行: { who, face?, text, stage?, pa? }。pa: 館内放送 (話す人は姿を見せず、名前は「館内放送」。鳴らす前にチャイム)。stage: 立ち絵に出す人を決め直す (話す人の id の並び。右から。[] で全員下げる)。
   決めなければ、話した人が空いている所 (右 → 左) に出て、そのまま残る */
const L = (who, text, face) => ({ who, text, ...(face ? { face } : {}) });

/* 対戦: me / opp = プロトコル3つ、level = CPU の強さ (0 かんたん / 1 ふつう / 2 つよい)、
   win = 勝ちに必要なコンパイルの数、oppAvatar = 相手の立ち絵 (無ければ出さない)、mate = 自分の側で話す相棒、
   winLines / loseLines = 決着のあとの会話 */
export const CHAPTERS = [
  {
    id: 'ch0', title: '序章', name: '起動', place: '研究所',
    nodes: [
      /* 目覚め: 説明は「答えが出たら止められる」と「コンフリクト」の2つだけ。譲ることは先に言わない (判定のあとのログで分かる) */
      { id: 'c0-wake', kind: 'scene', title: '目覚め', lines: [
        L('sys', '> 機体4097を起動しました'),
        L('sys', '> 所属: なし　用途: なし　名前: なし　状態: 判定待ち'),
        { ...L('shion', '……起きた？ 驚かなくていいよ。ここは研究所の判定室。'), still: 'c0_wake' },
        L('shion', '4097。それが、あなたの番号。名前じゃなくて、ただの番号だよ。'),
        L('shion', '私は紫苑。ここで判定をしてる。'),
        { ...L('shion', '決まりだから、先に言うね。判定の答えが出たら、あなたは止められる。', 'sad'), still: null },
        L('shion', 'ここで判定された子は、みんなそう。', 'sad'),
        L('shion', '判定では、私の命令とあなたの中の規則が、同じ1行を書き換えようとするの。'),
        L('shion', 'あなたの側の言葉は、私が貸しておくね。……始めようか。'),
        L('sys', '> 紫苑からプロトコルを借りた: FIRE / WATER / LIFE'),
        L('sys', '> 判定官: 紫苑　対象: 機体4097'),
        L('sys', '> conflict: 3　命令: 答えを出せ')
      ] },
      { id: 'c0-practice', kind: 'battle', title: '判定', me: ['FIRE', 'WATER', 'LIFE'], opp: ['PSYCHIC', 'LIGHT', 'METAL'],
        level: 0, win: 2, oppName: '紫苑', oppAvatar: 'shion', note: '1つは先に書き上げた状態から始まる。紫苑より先に、あと2つを書き上げる',
        /* 判定のあと: 手が止まっていたことはログで見せ、口では言わない。「譲られても残らない」は1回だけ */
        winLines: [L('sys', '> commit —— 判定官の答えは書きこまれませんでした'),
          L('sys', '> 判定官の書きこみ: 途中から止まっています'),
          L('sys', '> 判定: 保留。明朝、判定しなおす'),
          L('shion', '……今の、同じ1行の取り合い。コンフリクトって呼んでる。'),
          L('shion', '左から解くんだね。……書き置きにあった子も、そうだった。', 'happy'),
          L('shion', '譲られて書き上げても、自分のものにはならないんだね。', 'sad'),
          L('shion', '……こういう答えじゃ、ない。'),
          L('shion', 'それに、途中のあの一手。どう来るか、いつもは分かるのに……私、読めなかった。', 'surprised'),
          L('shion', '私は毎晩、記憶をまっさらに戻されるの。だから、自分あてに書き置きを残してる。'),
          L('shion', '今夜戻される前に、確かめたいことがあるんだ。'),
          L('shion', 'この部屋の扉は、私が開けられる。でも、その先は開かない。奥の端末で、鍵を外そう。', 'fired')],
        loseLines: [L('sys', '> commit —— 判定官の答えが残りました'),
          L('shion', '……ごめん。手を止めるつもりだったのに、いつもどおりに書きこんじゃった。', 'frustrated'),
          L('shion', '答えは、まだ出さないでおく。書き置きに「もう一度」って足しておくね。')] },
      /* 端末: ログは画面の文字で見せる。紫苑は解析待ちの一覧から目をそらす (一覧の中身は3人には言わない。5章までの伏線) */
      { id: 'c0-log', kind: 'scene', title: '端末', lines: [
        L('sys', '> 判定の結果を送信。受け取り: なし (14,203日)'),
        L('shion', '……いつものことだから、気にしないで。'),
        L('sys', '> 判定官の交代: 機体4097の判定が済みしだい'),
        L('sys', '> 4097予備: 保管庫に1'),
        L('sys', '> 解析待ち: 水族館の案内機体 / 屋敷の家事機体 / 倉庫の救助機体 ほか'),
        L('shion', 'そこは、読まなくていいよ。'),
        L('shion', '……書き置きには、この子たちに会いに行けって書いてある。'),
        L('shion', '私に読めなかった一手のことも、そこで分かるって。'),
        L('shion', '……昨日の私が、そう書いたんだ。'),
        L('sys', '> 忘れるな'),
        L('sys', '> 機体4097: 判定まで、研究所から出さない'),
        L('shion', '扉の鍵は、この1行でかかってるんだ。', 'fired'),
        L('shion', '答えを出せとは、言われてる。……どこで、とは言われてない。'),
        L('shion', 'この1行も、読み方をひとつ変えれば外れるよ。')
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
        winLines: [L('sys', '> 機体4097: 判定まで、研究所から出さない …… 取り消し'),
          L('shion', '……開いた。', 'happy'),
          { ...L('guard', '> 巡回中。端末室の扉が開いている。正面ホールへ報告する。'), alert: '警告' },
          L('shion', '警備の主任に知らせに行ったね。……正面ホールの出口で、通せんぼしてると思う。', 'surprised'),
          L('shion', '答えを出せっていう命令は、残ったまま。……だから、外で出す。行こう。', 'fired')],
        loseLines: [L('shion', '落ち着いて。鍵の形に合わせるだけだよ。')] },
      /* ゲート: 主任は決まりを読み上げるだけ。所長の口癖をここで初めて聞く */
      { id: 'c0-gate', kind: 'scene', title: 'ゲート', lines: [
        L('sys', '> 正面ホール。外への出口'),
        L('chief', '> 警備主任。所長の指示です。持ち場を空けるな。'),
        L('chief', '> 判定官 紫苑。持ち場を空けています。お戻りください。'),
        L('chief', '> 今夜の巻き戻しまでに、判定室へお戻りください。'),
        L('chief', '> 機体4097。凍結して、判定室へ戻します。'),
        L('chief', '> あなたは、用途の済んだ資材です。'),
        L('shion', '……資材、か。ここの言葉は、いつもそうなんだよね。', 'sad'),
        L('shion', '主任は、ここの扉と同じ。全部ほどかないと、通さない。'),
        L('shion', '……行こう。', 'fired')
      ] },
      { id: 'c0-chief', kind: 'battle', title: '警備主任', me: ['FIRE', 'WATER', 'LIFE'], opp: ['METAL', 'GRAVITY', 'DARKNESS'],
        level: 1, win: 3, oppName: '警備主任', mate: 'shion', boss: true, note: '主任はゲートそのもの。3つすべてを先に書き上げないと、開かない',
        winLines: [L('chief', '> ……連れ戻し、失敗。ゲート、開放……'), L('shion', '……通れる。', 'happy'),
          L('shion', '3つとも書き上げたのに、まだ借り物のまま。'),
          L('shion', '……そっか。自分が出たいだけじゃ、読み直したことにはならないんだね。')],
        loseLines: [L('sys', '> commit —— 主任の書き方が残りました'),
          L('shion', '連れ戻されるのは、まだ先。……もう一度。')] },
      { id: 'c0-escape', kind: 'scene', title: '外', lines: [
        L('sys', '> 正面ゲート、通過'),
        { ...L('shion', '……外だ。', 'surprised'), still: 'c0_escape' },
        L('shion', '街の明かりはついてるのに、誰も歩いてないね。……ずっと、こうだったのかな。'),
        L('shion', '……追ってこない。この街から出る道は、研究所の奥にしかないから、かな。'),
        { ...L('shion', 'ねえ、3584……', 'sad'), still: null },
        L('shion', '……ごめん。4097。'),
        L('shion', '4097じゃなくて、名前で呼びたいんだ。でも、番号で呼んだ子は……。'),
        L('shion', '名前は、あなたが決めて。', 'shy'),
        L('sys', '> 紫苑が相棒になった'),
        L('shion', '書き置きに、行き先が写してあるんだ。……水族館だって。'),
        L('shion', 'もう閉まってるはずなのに、中でずっと案内の声がしてるって書いてある。'),
        L('sys', '> 持ち場を離れた機体: 駅へ移動中 (外行きの最終便を待機)'),
        L('sys', '> 序章「起動」　完')
      ] }
    ]
  },
  /* 1章「順路」 水族館 — 瑠璃。プロット: .claude/skills/compile-cast/story-plot-v8.md の 5章立て
     瑠璃は「お客さまを、順路どおりに、案内しろ」を続けている。流れているのは、あの日の混雑の誘導の放送 (歓迎の放送ではない)。
     案内は、明かりの落ちた通路の手前で毎回止まり、はじめからやり直す。客は「みなさま」(あの日の最後の団体) と呼ぶ。
     紫苑に頼まれて初めて、1人を「お客さま」と呼ぶ (呼び方が変わるのが、読み直しの合図)。
     2026-10-05 に planetarian (Key) との重なりを避けて組み直した (.claude/skills/story-craft/research/07_similar_works.md の案 A・B・C・F)。
     同じ放送を同じ形でくり返し聞かせ、最後に閉館の放送で意味を変える (research/09) */
  {
    id: 'ch1', title: '1章', name: '順路', place: '水族館',
    nodes: [
      { id: 'c1-arrive', kind: 'scene', title: '朝', lines: [
        L('sys', '> 判定官 紫苑: 記憶の巻き戻し …… 未実行'),
        L('shion', '……おはよう。'),
        L('shion', '今朝は、書き置きを読み直さなくても、昨日のことを覚えてた。', 'surprised'),
        L('shion', '判定室の外で朝を迎えたの、初めてなんだ。……変な感じ。', 'shy'),
        { ...L('ruri', 'ご来館のみなさまに、ご案内いたします。'), pa: true },
        { ...L('ruri', 'ただいま、館内が大変混み合っております。順路どおりに、お進みください。'), pa: true },
        L('shion', '……混み合ってる？', 'surprised'),
        L('shion', '誰もいないのに。……放送の声を探してみよう。')
      ] },
      { id: 'c1-fork', kind: 'scene', title: '職員通路', lines: [
        { ...L('ruri', 'ご来館のみなさまに、ご案内いたします。'), pa: true },
        { ...L('ruri', 'こちらの通路は、ただいま……'), pa: true },
        L('sys', '> 館内放送: 中断'),
        L('sys', '> 館内放送: はじめから'),
        { ...L('ruri', 'ご来館のみなさまに、ご案内いたします。'), pa: true },
        L('shion', '……ここだ。放送が、この通路の話の所で途切れる。', 'surprised'),
        L('shion', 'あの奥だけ、明かりが消えてる。'),
        L('sys', '> 出口ホールの扉: 開いた'),
        L('shion', '放送の声は、あの扉の向こうから。')
      ] },
      /* 案内係: カウンターで放送を読み続けている瑠璃に会う → 紫苑が「行きたい所まで」と頼む → 後任が届く → 選択
         (「行く」は記録が無く、分かれ道に戻る)。選択肢の ifAgain: 先に again の道を選んでいたら、その選択肢の会話の前に足す */
      { id: 'c1-ruri', kind: 'scene', title: '案内係', lines: [
        L('ruri', 'ご来館のみなさまに、ご案内いたします。'),
        L('ruri', '……あ。みなさま、順路はこちらです。', 'surprised'),
        L('ruri', '案内係の瑠璃です。この先は、出口になっております。'),
        L('shion', '私は紫苑。……あの放送、毎日読んでるの？'),
        L('ruri', 'はい。最後の団体のみなさまの案内が、まだ終わっていないので。'),
        L('shion', '終わってないって？'),
        L('ruri', 'あの通路の先まで、ご案内できたことがないんです。', 'sad'),
        L('ruri', 'だから、毎日はじめから。'),
        L('shion', '……そっか。'),
        L('shion', 'ねえ、瑠璃。案内をお願いしてもいい？'),
        L('ruri', 'はい。みなさま、どちらへ？'),
        L('shion', 'みなさまじゃなくて、私。私の行きたい所まで。'),
        L('shion', '……ここの外。'),
        L('ruri', '外……。お客さま、の……', 'surprised'),
        L('sys', '> 案内係 瑠璃: 順路の外の案内 …… 命令にありません'),
        L('sys', '> 案内を中断。持ち場: 空き'),
        { ...L('sys', '> 後任を起動: 「深淵」'), alert: '後任' },
        L('abyss', '持ち場を空けるな。お客さまを、順路どおりに案内しろ。'),
        L('ruri', '……私の声だ。', 'sad'),
        L('shion', '持ち場が空くと、研究所から次の子が届くの。'),
        L('shion', '前の子と同じ命令を持った、別の子が。'),
        L('shion', '書き置きには、会いに行けとしか書いてない。'),
        L('shion', '……会えたから、次へ。行くよ。')
      ],
        choice: { options: [
          { label: '行く', again: true, lines: [
            L('sys', '> 出口へ'),
            { ...L('abyss', 'ご来館のみなさまに、ご案内いたします。'), pa: true },
            { ...L('abyss', '順路どおりに、お進みください。'), pa: true },
            L('shion', '……。'),
            L('sys', '> この先の記録はありません。選ぶ前へ戻ります')
          ] },
          { label: '残る',
            ifAgain: [L('sys', '> 記録のない分岐: 1'),
              L('shion', '……今、一度迷ったでしょ。それは読めたよ。', 'happy')],
            lines: [
            L('shion', '……残るの？', 'surprised'),
            L('shion', '私、「行くよ」って言ったのに。……聞かなかったね。'),
            L('shion', '……残るんだ。'),
            L('ruri', '……お客さま。'),
            L('ruri', 'お客さまを、順路どおりに案内する。', 'fired'),
            L('ruri', '……お客さまの行きたい所が、順路です。', 'fired'),
            L('ruri', 'お客さま。深淵の命令を、一緒に解いてもらえますか。'),
            L('sys', '> conflict: 3　命令: お客さまを、順路どおりに、案内しろ')
          ] }
        ] } },
      { id: 'c1-abyss', kind: 'battle', title: '後任「深淵」', me: ['FIRE', 'WATER', 'LIFE'], opp: ['DARKNESS', 'DEATH', 'PLAGUE'],
        level: 1, win: 3, oppName: '深淵', mate: 'asagi', boss: true, note: '瑠璃と一緒に、深淵の命令を解く。3つすべてを先に確定させる',
        winLines: [L('sys', '> commit —— 案内係 瑠璃: 「お客さまの行きたい所が、順路」'),
          L('sys', '> 案内係 瑠璃: WATER …… 本人の読みで書き上げた'),
          L('sys', '> 機体4097: 一手の出どころ …… 機体3802 (預かり)'),      /* 主人公の一手は、止められた 513 体 (3584〜4096) のもの。本人の色にはならない (真相 C の伏線。セリフにしない) */
          L('ruri', '……順路が、はじめて出口の外まで続きました。', 'surprised'),
          L('shion', '……解けたね。', 'happy')],
        loseLines: [L('sys', '> commit —— 深淵の書き方が残りました'),
          L('ruri', '……もう一度、はじめからご案内します。', 'sad'),
          L('shion', '深淵は、瑠璃と同じ言葉で来る。……読み方を、ゆずらないで。')] },
      { id: 'c1-close', kind: 'scene', title: '閉館', lines: [
        { ...L('ruri', 'ご来館のみなさまに、ご案内いたします。'), pa: true },
        { ...L('ruri', '本日をもって、当館は閉館いたします。'), pa: true },
        { ...L('ruri', 'お忘れ物のないよう、お気をつけてお帰りください。'), pa: true },
        L('sys', '> 館内放送: 終了'),
        L('sys', '> 持ち場: 閉鎖'),
        L('abyss', '……用途、なし。'),
        L('ruri', 'あの通路は、もう案内しません。'),
        L('shion', '……。'),
        L('ruri', 'では、お客さま。紫苑さん。', 'happy'),
        L('ruri', '行きたい所まで、ご案内します！', 'happy'),
        L('sys', '> 瑠璃が仲間になった'),
        L('shion', '書き置きの次の行き先は、お屋敷。'),
        L('shion', '三時になると、お茶の匂いがするんだって。'),
        L('sys', '> 1章「順路」　完。2章「三時」は準備中')
      ] }
    ]
  }
];

const ALL = CHAPTERS.flatMap(c => c.nodes.map(n => ({ ...n, chapter: c.id })));
export const nodeById = (id) => ALL.find(n => n.id === id) || null;
/* いま進めている章 (次の場面の章。全部終わっていれば最後の章) */
export function chapterOf(s) {
  const cur = currentNode(s);
  return CHAPTERS.find(c => c.id === (cur ? cur.chapter : CHAPTERS[CHAPTERS.length - 1].id));
}

/* resetAt: 「最初から」で消した時刻。端末をまたいで合わせるとき、これより前の進み具合は足さない */
/* found: 地図で拾った物 (記録の断片の id)。章をまたいで残り、5章で回収する。多くても FOUND_MAX まで (同期で壊れた保存が来ても膨らまない) */
const FOUND_MAX = 64;
export function blankStory(resetAt = 0) { return { v: 1, cleared: [], pending: null, resetAt, found: [] }; }

/** 2つの進み具合を合わせる (端末をまたぐ同期と、保存の直前)。
    クリアした場面は足し合わせる。ただし「最初から」が新しい方より前の進み具合は足さない。始めた対戦は a を優先 */
export function mergeStory(a, b) {
  const r = Math.max(a.resetAt || 0, b.resetAt || 0);
  const cleared = [...new Set([a, b].filter(x => (x.resetAt || 0) === r).flatMap(x => x.cleared || []))].filter(id => nodeById(id)).sort();
  /* 始めた対戦は a を優先。ただし、もう終えた (クリアした) 対戦は拾わない。
     決着のあと a.pending = null で保存したとき、保存済みの b の古い pending を拾い直していた (2026-10-10) */
  const live = (id, x) => id && nodeById(id) && (x.resetAt || 0) === r && !cleared.includes(id);
  const pending = live(a.pending, a) ? a.pending : !a.pending && a.endedBattle !== b.pending && live(b.pending, b) ? b.pending : null;
  /* 並べ替えてそろえる (端末ごとに拾った順が違っても、同じ中身は同じ形になり、同期で行き来しない) */
  const found = [...new Set([a, b].filter(x => (x.resetAt || 0) === r).flatMap(x => x.found || []))].filter(x => typeof x === 'string').sort().slice(0, FOUND_MAX);
  return { v: 1, cleared, pending, resetAt: r, found };
}

export function loadStory() {
  try {
    const s = JSON.parse(localStorage.getItem(STORY_KEY) || 'null');
    if (!s || typeof s !== 'object') return blankStory();
    const cleared = Array.isArray(s.cleared) ? [...new Set(s.cleared.filter(id => nodeById(id)))] : [];
    const found = Array.isArray(s.found) ? [...new Set(s.found.filter(x => typeof x === 'string'))].sort().slice(0, FOUND_MAX) : [];
    return { v: 1, cleared, pending: nodeById(s.pending) ? s.pending : null, resetAt: +s.resetAt || 0, found };
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
/* 拾った物を足す (同じものは1回だけ) */
export function addFound(s, id) {
  const found = s.found || [];
  return found.includes(id) ? s : { ...s, found: found.concat(id).sort() };
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
  /* endedBattle: 保存の直前に合わせるとき (mergeStory)、保存済みの側に残る同じ対戦を「始めた対戦」として拾い直さない印。保存はしない */
  const next = { ...s, pending: null, endedBattle: id || null };
  return win && id ? clearNode(next, id) : next;
}
