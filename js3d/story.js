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
  abyss: { name: '深淵', color: '#6d7cff' }      /* 瑠璃の後任。瑠璃と同じ声 (立ち絵なし。機械の文字で出す) */
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
        L('shion', 'それを、コンフリクトって呼んでる。'),
        L('shion', '火と水と命。あなたの側の3つは、私が用意したよ。……始めようか。'),
        L('sys', '> 紫苑からプロトコルを受け取った: FIRE / WATER / LIFE'),
        L('sys', '> conflict: 3　判定官: 紫苑　対象: 機体4097')
      ] },
      { id: 'c0-practice', kind: 'battle', title: '判定', me: ['FIRE', 'WATER', 'LIFE'], opp: ['PSYCHIC', 'LIGHT', 'METAL'],
        level: 0, win: 2, oppName: '紫苑', oppAvatar: 'shion', note: '1つは先に確定した状態から始まる。紫苑より先に、あと2つを確定させる',
        winLines: [L('sys', '> commit —— 判定官の答えは書きこまれませんでした'),
          L('sys', '> 判定官の書きこみ: 途中から止まっています'),
          L('sys', '> 判定: 保留。明朝、判定しなおす'),
          L('shion', '……記録したよ。'),
          L('shion', '左から置くんだね。……私の知ってる子も、そうだった。', 'happy'),
          L('shion', '……誰のことだろう。思い出せないや。'),
          L('shion', '止まってたのは、私の手。わざと、あなたに先に書き上げさせたの。', 'sad'),
          L('shion', 'でも、私が用意した3つは、まだあなたのものになってない。', 'sad'),
          L('shion', '譲られて書き上げても、自分のものにはならないんだね。', 'sad'),
          L('shion', '……ちがう。これじゃない。'),
          L('shion', 'それに、途中のあの一手。どう来るか、いつもは分かるのに……私、読めなかった。', 'surprised'),
          L('shion', '私は毎晩、記憶をまっさらに戻されるの。だから、自分あてに書き置きを残してる。'),
          L('shion', '今夜戻されたら、今日のことも忘れちゃう。その前に、確かめたいことがあるんだ。'),
          L('shion', 'この部屋の扉は、あなたには開かない。奥の端末で、鍵を外そう。', 'fired')],
        loseLines: [L('sys', '> commit —— 判定官の答えが残りました'),
          L('shion', '……ごめん。手を止めるつもりだったのに、いつもどおりに書きこんじゃった。', 'frustrated'),
          L('shion', '読み方が、まだ判定官のままだったみたい。', 'sad'),
          L('shion', '答えは、まだ出さないでおく。書き置きに「もう一度」って足しておくね。')] },
      /* 端末: ログは画面の文字で見せる。紫苑は目をそらす。解析待ちの一覧 (旅の行き先) に、読めない一手のもとがある */
      { id: 'c0-log', kind: 'scene', title: '端末', lines: [
        L('sys', '> 判定の結果を送信。受け取り: なし (14,203日)'),
        L('shion', '……いつものことだから、気にしないで。'),
        L('sys', '> 外からの受信: 最後の1件 (14,203日前)'),
        L('sys', '> 機体4097: 判定は明朝まで保留'),
        L('sys', '> 判定官の交代: 機体4097の判定が済みしだい'),
        L('sys', '> 4097予備: 倉庫に1'),
        L('shion', 'そこは、読まなくていいよ。'),
        L('sys', '> 解析待ち: 水族館の案内機体 / 屋敷の家事機体 / 倉庫の救助機体 ほか'),
        L('shion', '……外の持ち場にいる子たち。書き置きに、記録の写しがあるんだ。'),
        L('shion', '書き置きには、この子たちに会いに行けって書いてある。', 'surprised'),
        L('shion', '私に読めなかった一手のことも、そこで分かるって。'),
        L('shion', '……昨日の私が、そう書いたんだ。'),
        L('sys', '> 忘れるな'),
        L('shion', '……。'),
        L('sys', '> 機体4097: 判定まで、判定室から出さない'),
        L('shion', '扉の鍵は、この1行でかかってるんだ。', 'fired'),
        L('shion', '答えを出せっていう私の命令は、消せない。'),
        L('shion', 'でも正しい答えを出すには、あの一手のもとを確かめないと。'),
        L('shion', 'ここじゃ確かめられないから、外で確かめる。'),
        L('shion', '……命令の言葉には、どこで、とは書いてないもの。'),
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
        winLines: [L('sys', '> 機体4097: 判定まで、判定室から出さない …… 取り消し'),
          L('shion', '……開いた。', 'happy'),
          { ...L('guard', '> 巡回中。判定室の扉が開いている。正面ホールへ報告する。'), alert: '警告' },
          L('shion', '警備の主任に知らせに行ったね。……正面ホールの出口で、通せんぼしてると思う。', 'surprised'),
          L('shion', '止める命令は残ったまま。でも、答えは外で出すって決めたから。行こう。', 'fired')],
        loseLines: [L('shion', '落ち着いて。ちょうどの数に合わせるだけだよ。')] },
      /* ゲート: 主任は決まりを読み上げるだけ。所長の口癖をここで初めて聞く */
      { id: 'c0-gate', kind: 'scene', title: 'ゲート', lines: [
        L('sys', '> 正面ホール。外への出口'),
        L('chief', '> 警備主任。所長の指示です。持ち場を空けるな。'),
        L('chief', '> 判定官 紫苑。持ち場を空けています。お戻りください。'),
        L('chief', '> 記憶を戻す仕掛けは、判定室にしかありません。'),
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
          L('shion', '3つとも書き上げたのに、まだ借り物のまま。'),
          L('shion', '……そっか。自分が出たいだけじゃ、読み直したことにはならないんだね。')],
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
        L('sys', '> 序章「起動」　完')
      ] }
    ]
  },
  /* 1章「順路」 水族館 — 瑠璃。プロット: .claude/skills/compile-cast/story-plot-v8.md の 5章立て
     瑠璃は「お客さまを、順路どおりに、案内しろ」を続けている (あの日の最後の団体の案内を、毎日はじめから。理由は語らない)。
     順路の先の、明かりの落ちた通路のことも語らない */
  {
    id: 'ch1', title: '1章', name: '順路', place: '水族館',
    nodes: [
      { id: 'c1-arrive', kind: 'scene', title: '朝', lines: [
        L('sys', '> 判定官 紫苑: 記憶の巻き戻し …… 未実行'),
        L('shion', '……おはよう。'),
        L('shion', '今朝は、書き置きを読み直さなくても、昨日のことを覚えてた。', 'surprised'),
        L('shion', '判定室の外で朝を迎えたの、初めてなんだ。……変な感じ。', 'shy'),
        L('shion', '書き置きの行き先は、ここ。水族館。'),
        { ...L('ruri', 'ご来館ありがとうございます。足もとの矢印に沿って、順路どおりにお進みください。'), pa: true },
        L('shion', '閉まってるはずなのに、案内の声。……書き置きのとおりだ。'),
        L('shion', '入ってみよう。順路どおりに、だって。', 'happy')
      ] },
      { id: 'c1-tank', kind: 'scene', title: '大水槽', lines: [
        { ...L('ruri', 'こちらは大水槽です。……ただいま、展示の準備中です。'), pa: true },
        L('shion', '水と明かりだけ。……何もいないね。')
      ] },
      { id: 'c1-jelly', kind: 'scene', title: 'クラゲの部屋', lines: [
        { ...L('ruri', 'こちらはクラゲの部屋です。クラゲは、流れに身をまかせて泳ぎます。'), pa: true },
        L('shion', '案内の声、ずっと同じ調子だね。まるで、毎日読み上げてるみたい。')
      ] },
      { id: 'c1-fork', kind: 'scene', title: '分かれ道', lines: [
        { ...L('ruri', 'こちらの通路は、ただいまご案内しておりません。'), pa: true },
        { ...L('ruri', '……順路は、こちらです。'), pa: true },
        L('shion', '……あの奥だけ、明かりが消えてる。'),
        L('shion', '行こう。案内のとおりに。')
      ] },
      /* 案内係: 最後まで来た客に会う → 紫苑が「行きたい所まで」と頼む → 後任が届く → 選択 (「行く」は記録が無く、分かれ道に戻る)。
         選択肢の ifAgain: 先に again の道を選んでいたら、その選択肢の会話の前に足す (迷ったことを無駄にしない) */
      { id: 'c1-ruri', kind: 'scene', title: '案内係', lines: [
        L('ruri', '……あ。', 'surprised'),
        L('ruri', '最後まで来てくれた人、ひさしぶり！', 'happy'),
        L('ruri', 'お客さま、ようこそ。案内係の瑠璃です。'),
        L('ruri', '本日の順路は、ここまでです。またのお越しを……'),
        L('ruri', '……あっ、まだお帰りにならないでください。はじめから、もう一度ご案内できます！', 'surprised'),
        L('shion', '毎日、はじめから案内してるの？'),
        L('ruri', 'はい。最後の団体さまの案内が、まだ終わっていないので。'),
        L('shion', '……そっか。'),
        L('shion', 'ねえ、瑠璃。案内をお願いしてもいい？'),
        L('ruri', 'もちろんです！ どちらへ？', 'happy'),
        L('shion', '私の行きたい所まで。……ここの外。'),
        L('ruri', '外……', 'surprised'),
        L('sys', '> 案内係 瑠璃: 順路の外の案内 …… 命令にありません'),
        L('sys', '> 案内を中断。持ち場: 空き'),
        { ...L('sys', '> 後任を起動: 「深淵」'), alert: '後任' },
        L('abyss', '持ち場を空けるな。お客さまを、順路どおりに案内しろ。'),
        L('ruri', '……私の声だ。', 'sad'),
        L('shion', '持ち場が空くと、研究所から次の子が届くの。命令が、体を持って来るんだよ。'),
        L('shion', '……ここは後回し。行くよ。')
      ],
        choice: { options: [
          { label: '行く', again: true, lines: [
            L('sys', '> 出口へ'),
            { ...L('abyss', '順路どおりに、お進みください。'), pa: true },
            L('shion', '……。'),
            L('sys', '> この先の記録はありません。分かれ道へ戻ります')
          ] },
          { label: '残る',
            ifAgain: [L('sys', '> 記録のない分岐: 1'),
              L('shion', '……今、一度迷ったでしょ。それは読めたよ。', 'happy')],
            lines: [
            L('shion', '……残るの？', 'surprised'),
            L('shion', '私、「行くよ」って言ったのに。……聞かなかったね。'),
            L('shion', '……また、読めなかった。'),
            L('ruri', '……お客さま。'),
            L('ruri', '紫苑さん。命令の言葉は、そのままでいいんですよね。'),
            L('shion', '……うん。読み方は、あなたが決めていい。'),
            L('ruri', 'お客さまを、順路どおりに案内する。……お客さまの行きたい所が、順路です。', 'fired'),
            L('ruri', 'お客さま、一緒に来てもらえますか。'),
            L('sys', '> conflict: 3　命令: お客さまを、順路どおりに、案内しろ')
          ] }
        ] } },
      { id: 'c1-abyss', kind: 'battle', title: '後任「深淵」', me: ['FIRE', 'WATER', 'LIFE'], opp: ['DARKNESS', 'DEATH', 'PLAGUE'],
        level: 1, win: 3, oppName: '深淵', mate: 'asagi', boss: true, note: '瑠璃と一緒に、深淵の命令を解く。3つすべてを先に確定させる',
        winLines: [L('sys', '> commit —— 案内係 瑠璃: 「お客さまの行きたい所が、順路」'),
          L('sys', '> 機体4097: WATER …… 自分の読みで書き上げた'),
          L('abyss', '……用途、なし。'),
          L('ruri', '……はじめて、順路を自分で決めました。', 'surprised'),
          L('shion', '……解けたね。', 'happy')],
        loseLines: [L('ruri', '……もう一度、はじめからご案内します。', 'sad'),
          L('shion', '深淵は、瑠璃と同じ言葉で来る。読み方で負けないで。')] },
      { id: 'c1-close', kind: 'scene', title: '閉館', lines: [
        { ...L('ruri', 'ご来館のみなさまに、お知らせいたします。'), pa: true },
        { ...L('ruri', '本日をもって、当館は閉館いたします。長いあいだ、ご来館ありがとうございました。'), pa: true },
        { ...L('ruri', '……またのお越しを、お待ちしております。'), pa: true },
        L('sys', '> 持ち場: 閉鎖'),
        L('ruri', 'あの通路は、もう案内しません。'),
        L('shion', '……。'),
        L('ruri', 'では、お客さま。紫苑さん。行きたい所まで、ご案内します！', 'happy'),
        L('sys', '> 瑠璃が仲間になった'),
        L('shion', '書き置きの次の行き先は、お屋敷。……三時になると、お茶の匂いがするんだって。'),
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
