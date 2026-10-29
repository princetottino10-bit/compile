/* =========================================================================
 * ストーリーの歩ける地図 (画面を持たない。story-world.js が three.js で描く)
 *   地図は文字の並び。1文字 = 1マス。座標はマス単位 (x = 列, y = 行。マスの真ん中は +0.5)。
 *   扉は「前の出来事 (story.js の場面) を終えたら開く」。出来事は場面 (node) と結びつく。
 * ========================================================================= */
import { isCleared, currentNode, chapterOf } from './story.js';

/* 印 → マスの種類。wall / solid (物が置いてある) は通れない。door / gate は開くまで通れない */
export const TILE = {
  '#': 'wall', '.': 'floor', 'S': 'floor', 'K': 'floor', 'p': 'floor', 'c': 'floor', 'e': 'floor', 'R': 'floor',
  'T': 'solid', 'a': 'door', 'b': 'door', 'd': 'door', 'g': 'gate',
  /* 水族館: W 大水槽 / J クラゲの水槽 / Q 案内カウンター / X 通せんぼの柵 / x 明かりの落ちた通路 (入れない) */
  'W': 'solid', 'J': 'solid', 'Q': 'solid', 'X': 'solid', 'x': 'solid',
  /* 調べられる物 (looks) の置き場所。床として歩ける */
  '1': 'floor', '2': 'floor', '3': 'floor', '4': 'floor',
  /* 記録の断片の置き場所 (拾える物。歩ける) */
  'f': 'floor', 'h': 'floor',
  /* 屋敷: N 茜の立つ所 (床) / G 柱時計 / Z 食卓 */
  'N': 'floor', 'G': 'solid', 'Z': 'solid',
  /* 倉庫: Y 杏の立つ所 (床) / w 夜に杏が見張る所 (床) / V 古い救助機体の棚 / u 空いた棚 (3955 の場所) / O 本部の指令の盤 / B 修理の台 */
  'Y': 'floor', 'w': 'floor', 'V': 'solid', 'u': 'solid', 'O': 'solid', 'B': 'solid',
  /* 駅: = 線路 / D 発車標 / P 駅の管理機体「聖域」/ L ベンチ / k 改札の窓口 (ほかの改札は X、通り道は g。待つ機体の列は Q) */
  '=': 'solid', 'D': 'solid', 'P': 'solid', 'L': 'solid', 'k': 'solid',
  /* 所長室: m 計算機の棚 / M 所長の目 (計算機の真ん中) / H 空いた人の席 (机 Z は屋敷と同じ印) */
  'm': 'solid', 'M': 'solid', 'H': 'solid'
};

/* 序章「起動」: 研究所。左から A 判定室 / B 端末室 / C 廊下 / D 正面ホール / E 外 */
export const PROLOGUE = {
  look: 'lab',          /* 背景の作り (story-world.js が選ぶ) */
  rows: [
    '######################################',
    '#......#.......#..........#......####',
    '#.S....#...T...#..p....p..#...c..geee#',
    '#......a.......b..........d......geee#',
    '#..K...#.......#..........#......geee#',
    '#......#.......#..........#......####',
    '######################################'
  ].map(r => r.padEnd(38, '#')),
  /* この行より手前 (画面の下側) の壁は低く切り落とす (カメラから扉と通り道が見えるように) */
  cutRow: 3,
  /* 区画の境 (x がこれより小さい) */
  zones: [['A', 7], ['B', 15], ['C', 26], ['D', 33], ['E', Infinity]],
  zoneNames: { A: '判定室', B: '端末室', C: '廊下', D: '正面ホール', E: '外' },
  /* 扉の印 → 開く条件 (この場面をクリアしたら) */
  opens: { a: 'c0-practice', b: 'c0-lock', d: 'c0-lock', g: 'c0-chief' },
  /* 出来事。kind: auto (来たら始まる) / talk (人に話しかける) / inspect (物を調べる) / zone (区画に入る) */
  /* 立っている人 (ちびの絵): 印 → { who: 話す人の id, moves?: { 場面: [x, y] }, stay? }。仲間 (story.js の PARTY) になれば後ろにつく。
     stay: 仲間でも、この地図ではついてこないでそこに立つ。紫苑は shionLeaves の場面のあと、noShion の地図では出ない */
  cast: { K: { who: 'shion' } },
  events: {
    wake: { node: 'c0-wake', kind: 'auto' },
    practice: { node: 'c0-practice', kind: 'talk', at: 'K', who: 'shion' },
    log: { node: 'c0-log', kind: 'inspect', at: 'T', label: '端末を調べる' },
    lock: { node: 'c0-lock', kind: 'inspect', at: 'T', label: '扉の鍵を外す' },
    gate: { node: 'c0-gate', kind: 'zone', zone: 'D' },
    chief: { node: 'c0-chief', kind: 'talk', at: 'c', who: 'chief' },
    escape: { node: 'c0-escape', kind: 'zone', zone: 'E' }
  },
  /* 次の出来事ごとの出てくる場所 (対戦から戻ったとき) */
  spawn: { 'c0-wake': [3, 2], 'c0-practice': [3, 2], 'c0-log': [5, 3], 'c0-lock': [11, 3], 'c0-gate': [13, 3],
    'c0-chief': [29, 3], 'c0-escape': [31, 3], done: [31, 3] },
  /* 案内の行き先 (人や物のいない出来事だけ。人・物・巡回はその位置へ案内する) */
  guides: { 'c0-gate': [28, 3], 'c0-escape': [35, 3] },
  goals: { 'c0-wake': '目を覚ます', 'c0-practice': '紫苑の判定を受ける', 'c0-log': '奥の部屋の端末を調べる', 'c0-lock': '端末で、扉の鍵を外す',
    'c0-gate': '正面ホールへ進む', 'c0-chief': '警備主任を越える',
    'c0-escape': 'ゲートを抜けて外へ', done: '序章「起動」　完' }
};

/* 1章「順路」: 閉館した水族館 (2026-10-11 作り直し。一本道をやめ、広場から寄り道できる形に)。
   入口 → 広場 → 西 (大水槽) / 東 (クラゲの部屋) / 北 (職員通路。その奥に職員室)。本筋に要るのは北だけ。
   仕掛け: 案内の矢印は出さない。どの部屋でも同じ放送が流れていて、途切れる場所 (北の通路。スピーカーが火花を散らす) を自分で探す。
   北の通路で放送が途切れると (c1-fork)、出口ホールの扉 (d) が開き、瑠璃に会える。
   寄り道: 調べられる物 (looks) と、止められた機体の記録の断片 (fragments。拾うと進み具合に残り、5章で回収する) */
export const AQUARIUM = {
  look: 'aquarium',
  rows: [
    '##################################',
    '#........######xxxx####......QQQ.#',
    '#.3...4..######XXXX####..........#',
    '#..................1..d.......R..#',
    '#......h.###..........d..........#',
    '#........###..........#..........#',
    '###############....###############',
    '#.WWWWWWWW.#..........#.JJJJJJJJ.#',
    '#.WWWWWWWW.#..........#..........#',
    '#................................#',
    '#................................#',
    '#..........#..........#..........#',
    '#........f.#..........#..........#',
    '###############....###############',
    '############.2........############',
    '############....S.....############',
    '############..........############',
    '##################################'
  ],
  /* 区画は四角で持つ (上から順に見て、最初に入った四角)。zones は使わない */
  rects: [
    { z: 'S', x0: 1, y0: 1, x1: 8, y1: 5 },
    { z: 'E', x0: 22, y0: 1, x1: 32, y1: 5 },
    { z: 'N', x0: 9, y0: 1, x1: 21, y1: 6 },
    { z: 'B', x0: 1, y0: 7, x1: 11, y1: 12 },
    { z: 'C', x0: 22, y0: 7, x1: 32, y1: 12 },
    { z: 'H', x0: 12, y0: 7, x1: 21, y1: 12 },
    { z: 'A', x0: 12, y0: 13, x1: 21, y1: 16 }
  ],
  zones: [['A', Infinity]],
  zoneNames: { A: '入口ホール', H: '広場', B: '大水槽', C: 'クラゲの部屋', N: '職員通路', S: '職員室', E: '出口ホール' },
  opens: { d: 'c1-fork' },
  cast: { R: { who: 'ruri' } },
  events: {
    arrive: { node: 'c1-arrive', kind: 'auto' },
    fork: { node: 'c1-fork', kind: 'zone', zone: 'N' },
    ruri: { node: 'c1-ruri', kind: 'talk', at: 'R', who: 'ruri' },
    abyss: { node: 'c1-abyss', kind: 'talk', at: 'R', who: 'ruri' },
    close: { node: 'c1-close', kind: 'auto' }
  },
  /* 区画に入ると流れる放送 (話は進まない)。after の場面を終えてから、until の場面を終えるまで。1回地図を開いているあいだに1度ずつ。
     同じ放送を、区画ごとに読点の位置だけ変える (読んでいるのは録音でなく瑠璃。声のファイルも別になる)。
     2つ聞いたら、紫苑が手がかりを言う (hint) */
  ambient: {
    after: 'c1-arrive', until: 'c1-fork',
    zones: {
      H: [{ who: 'ruri', pa: true, text: 'ただいま館内が、大変混み合っております。順路どおりに、お進みください。' }],
      B: [{ who: 'ruri', pa: true, text: 'ただいま、館内が大変、混み合っております。順路どおりに、お進みください。' },
        { who: 'shion', text: 'わあ……水槽、大きいね。', face: 'surprised' },
        { who: 'shion', text: '中、何もいないね。水の音だけ、する。' }],
      C: [{ who: 'ruri', pa: true, text: 'ただいま、館内が大変混み合っております。順路どおりに、お進み、ください。' },
        { who: 'shion', text: 'クラゲの部屋、だって。', face: 'happy' },
        { who: 'shion', text: '……クラゲ、見てみたかったな。', face: 'sad' }]
    },
    hint: [
      { who: 'shion', text: '同じ放送。言葉は、一字も変わってない。' },
      { who: 'shion', text: '録音じゃない。息つぎの場所が、毎回ちょっとずつ違う。', face: 'surprised' },
      { who: 'shion', text: '……誰かが、今も読んでるんだ。' },
      { who: 'shion', text: '北の方のスピーカーだけ、音がざらついてる。' }
    ]
  },
  spawn: { 'c1-arrive': [16, 15], 'c1-fork': [16, 14], 'c1-ruri': [20, 4],
    'c1-abyss': [29, 4], 'c1-close': [29, 4], done: [29, 4] },
  guides: {},
  /* 床の順路の矢印 [x, y, 向き]: 入口 → 広場 → 西 → 東 → 広場、とぐるりと回る輪 (北へは向かない) */
  route: [[16, 14, 'N'], [16, 11, 'W'], [13, 11, 'W'], [9, 10, 'W'], [5, 10, 'W'], [3, 9, 'E'], [7, 9, 'E'], [12, 9, 'E'],
    [16, 9, 'E'], [20, 9, 'E'], [24, 9, 'E'], [28, 9, 'E'], [30, 10, 'W'], [26, 11, 'W'], [22, 11, 'W'], [19, 11, 'W']],
  /* 調べられる物: 話の進み具合と関係なく、近くで「調べる」と読める (読まなくても進める) */
  looks: [
    { at: '2', name: '案内板', lines: [
      { who: 'sys', text: '> 案内板: 本日の催し' },
      { who: 'sys', text: '> 「団体のお客さま、ご来館」' },
      { who: 'sys', text: '> 日付: 14,203日前' }
    ] },
    { at: '1', name: '張り紙', lines: [
      { who: 'sys', text: '> 張り紙: 「混雑時は、係員の案内に従ってください」' },
      { who: 'sys', text: '> 下の段は、はがれている' }
    ] },
    { at: '3', name: '点検票', lines: [
      { who: 'sys', text: '> 放送設備の点検票' },
      { who: 'sys', text: '> 館内放送の系統 …… 正常' },
      { who: 'sys', text: '> 避難放送の系統 …… 故障 (14,203日前から)' }
    ] },
    { at: '4', name: '名簿', lines: [
      { who: 'sys', text: '> 本日の団体: 34名' },
      { who: 'sys', text: '> 担当: 案内係 瑠璃' },
      { who: 'sys', text: '> 出口での人数の確認 …… 記入なし' }
    ] }
  ],
  /* 記録の断片: 止められた 513 体 (3584〜4096番) の誰かの、最後の一手の写し。拾うと進み具合 (found) に残る。5章の保管庫で回収する */
  fragments: [
    { at: 'f', id: 'u3611', unit: 3611, lines: [
      { who: 'sys', text: '> 記録の断片: 機体3611' },
      { who: 'sys', text: '> 最後の一手 …… 読めない' },
      { who: 'shion', text: '……3611。メモの、止められた子の番号だ。' }
    ] },
    { at: 'h', id: 'u3740', unit: 3740, lines: [
      { who: 'sys', text: '> 記録の断片: 機体3740' },
      { who: 'sys', text: '> 最後の一手 …… 読めない' },
      { who: 'shion', text: '……3740。この子も、メモにある。' }
    ] }
  ],
  goals: { 'c1-arrive': '水族館に入る', 'c1-fork': '放送が途切れる場所を探す',
    'c1-ruri': '放送の声のする方へ', 'c1-abyss': '瑠璃と一緒に、二号機と向き合う', 'c1-close': '瑠璃の放送を聞く',
    done: '1章「順路」　完' }
};

/* 2章「三時」: 屋敷。玄関ホール (止まった柱時計) → 西 (食堂) / 東 (台所) / 北の階段の上 (寝室の前に茜)。寝室の扉 (b) は茜を越えると開く。
   仕掛け: どの部屋にいても、茜がお茶を運ぶ同じ音がくり返し聞こえる (1章の放送と同じ役)。2つ聞くと、瑠璃が放送の耳で気づく
   (前の仲間の技能が鍵。research/10)。調べられる物は柱時計・呼び鈴の盤・家事日誌・枕元のお茶 (寝室。茜を越えたあと) */
export const MANSION = {
  look: 'mansion',
  rows: [
    '##############################',
    '#########............#......##',
    '#########....N.......b...4..##',
    '#########............#......##',
    '#############....#############',
    '#.......#............#.......#',
    '#..ZZZ..#..G.........#..3....#',
    '#..ZZZ.....1............f....#',
    '#.2..........................#',
    '#....h..#............#.......#',
    '#.......#.....S......#.......#',
    '##############################'
  ],
  rects: [
    { z: 'U', x0: 9, y0: 1, x1: 20, y1: 4 },
    { z: 'R', x0: 21, y0: 1, x1: 28, y1: 3 },
    { z: 'D', x0: 1, y0: 5, x1: 8, y1: 10 },
    { z: 'K', x0: 21, y0: 5, x1: 28, y1: 10 },
    { z: 'H', x0: 9, y0: 5, x1: 20, y1: 10 }
  ],
  zones: [['H', Infinity]],
  zoneNames: { H: '玄関ホール', D: '食堂', K: '台所', U: '階段の上', R: '寝室' },
  opens: { b: 'c2-akane' },
  /* 茜は寝室の前の話を終えたら、玄関の柱時計のそばへ下りてくる (時計と向き合うのは茜) */
  cast: { N: { who: 'akane', moves: { 'c2-room': [13.8, 6.6] } } },
  events: {
    arrive: { node: 'c2-arrive', kind: 'auto' },
    tea: { node: 'c2-tea', kind: 'talk', at: 'N', who: 'akane' },
    akane: { node: 'c2-akane', kind: 'talk', at: 'N', who: 'akane' },
    room: { node: 'c2-room', kind: 'talk', at: 'N', who: 'akane' },
    clock: { node: 'c2-clock', kind: 'inspect', at: 'G', label: '柱時計と向き合う' },
    close: { node: 'c2-close', kind: 'auto' }
  },
  /* 区画に入ると聞こえる音 (茜が三時のお茶を運ぶ)。区画ごとに同じ音。茜に会うまで */
  ambient: {
    after: 'c2-arrive', until: 'c2-tea',
    zones: {
      H: [{ who: 'sys', text: '> 湯の沸く音' }, { who: 'sys', text: '> 階段を上がる足音 …… 13' }, { who: 'sys', text: '> ノック 2回' },
        { who: 'sys', text: '> 遠くの声:「失礼いたします。お茶をお持ちしました」' }],
      D: [{ who: 'sys', text: '> 湯の沸く音' }, { who: 'sys', text: '> 階段を上がる足音 …… 13' }, { who: 'sys', text: '> ノック 2回' },
        { who: 'shion', text: '食卓、きれいに拭いてある。……椅子は、ひとつだけ。' }],
      K: [{ who: 'sys', text: '> 湯の沸く音' }, { who: 'sys', text: '> 階段を上がる足音 …… 13' }, { who: 'sys', text: '> ノック 2回' },
        { who: 'shion', text: 'やかん、まだあたたかい。' }]
    },
    hint: [
      { who: 'ruri', text: 'さっきと同じ音です。お湯、階段が十三段、ノックが二回。' },
      { who: 'ruri', text: '足音の間まで同じなんです。案内の放送と同じで。', face: 'surprised' },
      { who: 'shion', text: '……この家、ずっと同じ時間をくり返してるんだ。' },
      { who: 'shion', text: '足音は、階段の上で止まる。行ってみよう。' }
    ]
  },
  spawn: { 'c2-arrive': [14, 10], 'c2-tea': [14, 10], 'c2-akane': [13, 3], 'c2-room': [13, 3],
    'c2-clock': [12, 7], 'c2-close': [12, 7], done: [12, 7] },
  guides: {},
  looks: [
    { at: '1', name: '柱時計', lines: [
      { who: 'sys', text: '> 柱時計: 15時00分で止まっている' },
      { who: 'sys', text: '> 振り子 …… 動いていない' },
      { who: 'sys', text: '> 鐘 …… 毎日、鳴っている' }
    ] },
    { at: '2', name: '呼び鈴の盤', lines: [
      { who: 'sys', text: '> 呼び鈴の盤: 寝室' },
      { who: 'sys', text: '> 最後の呼び出し …… 15時00分' },
      { who: 'sys', text: '> そのあとの呼び出し …… なし' }
    ] },
    { at: '3', name: '家事日誌', lines: [
      { who: 'sys', text: '> 家事日誌: 本日' },
      { who: 'sys', text: '> 三時: お茶 (淹れ直し 11回)' },
      { who: 'sys', text: '> ご主人さま: お休み中' }
    ] },
    { at: '4', name: '枕元', lines: [
      { who: 'sys', text: '> 寝台: 整えてある' },
      { who: 'sys', text: '> 枕元のお茶 …… 1杯 (冷めている)' }
    ] }
  ],
  fragments: [
    { at: 'f', id: 'u3672', unit: 3672, lines: [
      { who: 'sys', text: '> 記録の断片: 機体3672' },
      { who: 'sys', text: '> 最後の一手 …… 読めない' },
      { who: 'shion', text: '……3672。メモにある番号だ。' }
    ] },
    { at: 'h', id: 'u4011', unit: 4011, lines: [
      { who: 'sys', text: '> 記録の断片: 機体4011' },
      { who: 'sys', text: '> 最後の一手 …… 読めない' },
      { who: 'shion', text: '……4011。4097に、近い番号。', face: 'sad' }
    ] }
  ],
  goals: { 'c2-arrive': '屋敷に入る', 'c2-tea': '音のする方へ', 'c2-akane': '茜と向き合う',
    'c2-room': '茜に話しかける', 'c2-clock': '玄関ホールの柱時計へ', 'c2-close': '茜の片付けを見る',
    done: '2章「三時」　完' }
};

/* 3章「順番」: 港の倉庫。入口 (シャッター) → 棚の通路 (古い救助機体の棚が並ぶ) → 北西の待機所 (杏と本部の指令の盤) / 北東の修理場。
   仕掛け: どこにいても、杏の点検の声が同じ順番でくり返し聞こえる (1章の放送・2章のお茶と同じ役)。2つ聞くと、茜が段取りの目で気づく
   (前の仲間の技能が鍵。research/10)。待機所の棚は1つだけ空いている (3955 の場所。夜の部品の番号につながる)。
   夜は、杏がシャッターの前 (w) で見張っている */
export const WAREHOUSE = {
  look: 'warehouse',
  /* 杏は救助を終えたら、入口のシャッターの前 (w) で夜の見張りに立つ */
  cast: { Y: { who: 'anzu', moves: { 'c3-rescue': [14.5, 11.5] } } },
  rows: [
    '##############################',
    '#VVVVVVVVuVVVV.#....3........#',
    '#............O.#...BBB.......#',
    '#.......Y....................#',
    '#.1............#.....f.......#',
    '######........##........######',
    '#............................#',
    '#.VVVVVV..VVVVVV..VVVVVV..2..#',
    '#............................#',
    '#.VVVVVV..VVVVVV..VVVVVV..h..#',
    '#....4.......................#',
    '##########....w.....##########',
    '##########....S.....##########',
    '##########..........##########',
    '##############################'
  ],
  rects: [
    { z: 'U', x0: 1, y0: 1, x1: 14, y1: 5 },
    { z: 'R', x0: 15, y0: 1, x1: 28, y1: 5 },
    { z: 'H', x0: 1, y0: 6, x1: 28, y1: 10 },
    { z: 'A', x0: 10, y0: 11, x1: 19, y1: 13 }
  ],
  zones: [['A', Infinity]],
  zoneNames: { A: '入口', H: '棚の通路', U: '待機所', R: '修理場' },
  opens: {},
  events: {
    arrive: { node: 'c3-arrive', kind: 'auto' },
    anzu: { node: 'c3-anzu', kind: 'talk', at: 'Y', who: 'anzu' },
    collector: { node: 'c3-collector', kind: 'talk', at: 'Y', who: 'anzu' },
    order: { node: 'c3-order', kind: 'auto' },
    command: { node: 'c3-command', kind: 'inspect', at: 'O', label: '指令と向き合う' },
    rescue: { node: 'c3-rescue', kind: 'auto' },
    night: { node: 'c3-night', kind: 'talk', at: 'Y', who: 'anzu' }
  },
  /* 区画に入ると聞こえる声 (杏の点検)。区画ごとに同じ手順。杏に会うまで */
  ambient: {
    after: 'c3-arrive', until: 'c3-anzu',
    zones: {
      A: [{ who: 'sys', text: '> 点検: 腕よし、脚よし、声よし' }, { who: 'sys', text: '> 声:「大丈夫、すぐ来るからな！」' }],
      H: [{ who: 'sys', text: '> 点検: 腕よし、脚よし、声よし' }, { who: 'sys', text: '> 声:「大丈夫、すぐ来るからな！」' },
        { who: 'ruri', text: '棚の子たち、みんな目を閉じてます。……寝てるんでしょうか。', face: 'sad' }],
      R: [{ who: 'sys', text: '> 点検: 腕よし、脚よし、声よし' }, { who: 'sys', text: '> 声:「大丈夫、すぐ来るからな！」' },
        { who: 'shion', text: '修理の台。道具が、きちんと並べてある。' }]
    },
    hint: [
      { who: 'akane', text: 'さっきと同じ手順です。点検が三つ、そのあとに声。' },
      { who: 'akane', text: '決まった段取りを、くり返しているのです。私のお茶と同じで。' },
      { who: 'shion', text: '……声は、奥の待機所から。行ってみよう。' }
    ]
  },
  spawn: { 'c3-arrive': [14, 12], 'c3-anzu': [14, 12], 'c3-collector': [10, 4], 'c3-order': [11, 3], 'c3-command': [11, 3],
    'c3-rescue': [19, 3], 'c3-night': [19, 3], done: [14, 10] },
  guides: {},
  looks: [
    { at: '1', name: '救助の名簿', lines: [
      { who: 'sys', text: '> 救助の名簿: 本部の決めた順番' },
      { who: 'sys', text: '> 1番〜412番 …… 対応済み' },
      { who: 'sys', text: '> 413番から先 …… 本部の応答なし' }
    ] },
    { at: '2', name: '棚の札', lines: [
      { who: 'sys', text: '> 棚の機体: 救助型 (旧型)' },
      { who: 'sys', text: '> 状態: 待機 (14,206日)' },
      { who: 'sys', text: '> 本部の指示 …… なし' }
    ] },
    { at: '3', name: '修理の台', lines: [
      { who: 'sys', text: '> 修理の台: 救助機体用' },
      { who: 'sys', text: '> 最後の修理 …… 14,206日前' }
    ] },
    { at: '4', name: '掲示', lines: [
      { who: 'sys', text: '> 掲示:「救助は、本部の決めた順番どおりに」' },
      { who: 'sys', text: '> 「名簿の外の要請は、本部へ問い合わせること」' }
    ] }
  ],
  fragments: [
    { at: 'f', id: 'u3955', unit: 3955, lines: [
      { who: 'sys', text: '> 記録の断片: 機体3955' },
      { who: 'sys', text: '> もとの持ち場: 倉庫 (救助)' },
      { who: 'sys', text: '> 最後の一手 …… 読めない' },
      { who: 'shion', text: '……3955。もとの持ち場は、この倉庫だって。', face: 'sad' }
    ] },
    { at: 'h', id: 'u4033', unit: 4033, lines: [
      { who: 'sys', text: '> 記録の断片: 機体4033' },
      { who: 'sys', text: '> 最後の一手 …… 読めない' },
      { who: 'shion', text: '……4033。この子のことも、覚えてない。', face: 'sad' }
    ] }
  ],
  goals: { 'c3-arrive': '倉庫に入る', 'c3-anzu': '声のする方へ', 'c3-collector': '茜と一緒に、回収機と向き合う',
    'c3-order': '4097を助けてもらう', 'c3-command': '杏と一緒に、本部の指令と向き合う', 'c3-rescue': '杏の救助を見る',
    'c3-night': 'シャッターの前の杏に話しかける', done: '3章「順番」　完' }
};

/* 4章「終点」: 中央駅。南の入口 → コンコース → 改札 (4097 だけ通れない) → 北の外行きのホーム (線路の手前に、待つ機体の列)。
   仕掛け: コンコースでは、聖域の「まもなく、最終便が参ります」が流れる。2つ聞くと、瑠璃が放送係の耳で「録音ではない」と気づく
   (前の仲間の技能が鍵。research/10)。聖域は改札を抜けてすぐの所に立つ (ホームの話のすぐあとに「向き合う」の確認が出る)。
   紫苑が研究所へ戻ったあと (c4-root) は、紫苑はついてこない。ホームの西の端のベンチ (区画 B) へひとりで歩く */
export const STATION = {
  look: 'station',
  rows: [
    '##############################',
    '#============================#',
    '#============================#',
    '#.LL.....QQQ..D..QQQ.........#',
    '#........QQQP.1..QQQ.........#',
    '#4.....................f.....#',
    '#.....h......................#',
    '#XXXXXXXXXXXkgggXXXXXXXXXXXXX#',
    '#............................#',
    '#.2........................3.#',
    '#............................#',
    '##########.....S....##########',
    '##########..........##########',
    '##############################'
  ],
  rects: [
    { z: 'B', x0: 1, y0: 3, x1: 5, y1: 6 },
    { z: 'P', x0: 1, y0: 3, x1: 28, y1: 6 },
    { z: 'W', x0: 1, y0: 8, x1: 14, y1: 10 },
    { z: 'C', x0: 15, y0: 8, x1: 28, y1: 10 },
    { z: 'A', x0: 10, y0: 11, x1: 19, y1: 12 }
  ],
  zones: [['A', Infinity]],
  zoneNames: { A: '入口', W: 'コンコース', C: 'コンコース', P: '外行きのホーム', B: 'ベンチ' },
  opens: { g: 'c4-wicket' },
  /* 紫苑はこの場面のあと、ついてこない (研究所へ戻った) */
  shionLeaves: 'c4-root',
  /* 名札だけ出す物 (調べられない) */
  names: [{ at: 'P', name: '聖域' }, { at: 'k', name: '改札' }],
  events: {
    arrive: { node: 'c4-arrive', kind: 'auto' },
    gate: { node: 'c4-gate', kind: 'inspect', at: 'k', label: '改札を通る' },
    wicket: { node: 'c4-wicket', kind: 'inspect', at: 'k', label: '改札と向き合う' },
    platform: { node: 'c4-platform', kind: 'zone', zone: 'P' },
    seiiki: { node: 'c4-seiiki', kind: 'inspect', at: 'P', label: '聖域と向き合う' },
    root: { node: 'c4-root', kind: 'auto' },
    night: { node: 'c4-night', kind: 'zone', zone: 'B' }
  },
  /* 区画に入ると聞こえる放送 (聖域)。改札に着くまで */
  ambient: {
    after: 'c4-arrive', until: 'c4-gate',
    zones: {
      A: [{ who: 'seiiki', text: '〔聖域〕まもなく、外行きの最終便が参ります。' }],
      W: [{ who: 'seiiki', text: '〔聖域〕まもなく、外行きの、最終便が参ります。' },
        { who: 'akane', text: '床に、列の印が引いてあります。きれいに消えずに残っています。' }],
      C: [{ who: 'seiiki', text: '〔聖域〕まもなく、外行きの最終便が、参ります。' },
        { who: 'anzu', text: '「まもなく」って、いつだよ。' }]
    },
    hint: [
      { who: 'ruri', text: '今の放送、録音じゃありません。毎回、読み方が少し違います。' },
      { who: 'ruri', text: '誰かが、39年、毎朝「まもなく」って読んでるんです。' },
      { who: 'shion', text: '……改札の向こうに、いるんだね。行ってみよう。' }
    ]
  },
  spawn: { 'c4-arrive': [15, 11], 'c4-gate': [15, 11], 'c4-wicket': [12, 8], 'c4-platform': [14, 8], 'c4-seiiki': [13, 6],
    'c4-root': [13, 6], 'c4-night': [13, 6], done: [3, 5] },
  guides: { 'c4-platform': [14, 6], 'c4-night': [3, 5] },
  looks: [
    { at: '1', name: '発車標', lines: [
      { who: 'sys', text: '> 外行き 最終便　遅延' },
      { who: 'sys', text: '> 遅れ: 14,207日' },
      { who: 'sys', text: '> 次の便 …… 未定' }
    ] },
    { at: '2', name: '掲示', lines: [
      { who: 'sys', text: '> 掲示:「列を乱さず、お待ちください」' },
      { who: 'sys', text: '> 「列を乱した方は、聖域がお預かりします」' }
    ] },
    { at: '3', name: '落とし物の棚', lines: [
      { who: 'sys', text: '> 落とし物: 傘 31本、手袋 9組' },
      { who: 'sys', text: '> 受け取り …… なし' }
    ] },
    { at: '4', name: '線路の先', lines: [
      { who: 'sys', text: '> 線路の先: 研究所の方角' },
      { who: 'sys', text: '> 外へ続く線路 …… 見つかりません' }
    ] }
  ],
  fragments: [
    { at: 'f', id: 'u3690', unit: 3690, lines: [
      { who: 'sys', text: '> 記録の断片: 機体3690' },
      { who: 'sys', text: '> もとの持ち場: 駅 (改札)' },
      { who: 'sys', text: '> 最後の一手 …… 読めない' },
      { who: 'shion', text: '……3690。ここで、改札をしてた子。', face: 'sad' }
    ] },
    { at: 'h', id: 'u4058', unit: 4058, lines: [
      { who: 'sys', text: '> 記録の断片: 機体4058' },
      { who: 'sys', text: '> もとの持ち場: 駅 (外行きのホーム)' },
      { who: 'sys', text: '> 最後の一手 …… 読めない' },
      { who: 'shion', text: '……4058。ここで、便を待ってた子だ。', face: 'sad' }
    ] }
  ],
  goals: { 'c4-arrive': '駅に入る', 'c4-gate': '改札を通る', 'c4-wicket': '杏と一緒に、改札と向き合う',
    'c4-platform': '外行きのホームへ', 'c4-seiiki': '紫苑と瑠璃で、聖域と向き合う', 'c4-root': '……',
    'c4-night': 'ホームの端のベンチへ', done: '4章「終点」　完' }
};

/* 5章「判定」: 研究所に戻る。序章の地図を東から西へ逆にたどる: E 外 → D 正面ホール (主任) → C 廊下 → B 端末室 → A 判定室 (紫苑)。
   紫苑は判定室で待っていて、ついてこない (巻き戻されて旅を覚えていない)。巡回はいない (主任のそばに回収機)。
   判定のあと (c5-answer) は、紫苑を出さない */
export const LAB_RETURN = {
  look: 'lab',
  rows: [
    '######################################',
    '#......#.......#..........#......####',
    '#.S....#...T...#..........#...c..geee#',
    '#......a.......b..........d......geee#',
    '#..K...#....1..#..........#......geee#',
    '#......#.......#..........#......####',
    '######################################'
  ].map(r => r.padEnd(38, '#')),
  cutRow: 3,
  zones: [['A', 7], ['B', 15], ['C', 26], ['D', 33], ['E', Infinity]],
  zoneNames: { A: '判定室', B: '端末室', C: '廊下', D: '正面ホール', E: '外' },
  opens: { g: 'c5-return', d: 'c5-chief', b: 'c5-chief', a: 'c5-hall' },
  /* 紫苑は判定室 (K) で待っていて、ついてこない */
  cast: { K: { who: 'shion', stay: true } },
  shionLeaves: 'c5-answer',
  chiefUntil: 'c5-chief',
  events: {
    ret: { node: 'c5-return', kind: 'auto' },
    chief: { node: 'c5-chief', kind: 'talk', at: 'c', who: 'chief' },
    hall: { node: 'c5-hall', kind: 'inspect', at: 'T', label: '端末を調べる' },
    room: { node: 'c5-room', kind: 'talk', at: 'K', who: 'shion' },
    judge: { node: 'c5-judge', kind: 'talk', at: 'K', who: 'shion' },
    answer: { node: 'c5-answer', kind: 'auto' }
  },
  spawn: { 'c5-return': [35, 3], 'c5-chief': [34, 3], 'c5-hall': [24, 3], 'c5-room': [9, 3], 'c5-judge': [5, 3], 'c5-answer': [5, 3], done: [5, 3] },
  guides: {},
  looks: [
    { at: '1', name: '判定の記録', lines: [
      { who: 'sys', text: '> 判定済み: 4,096体' },
      { who: 'sys', text: '> 答え: すべて「止める」' },
      { who: 'sys', text: '> 次の判定: 機体4097 (交代の判定)' }
    ] }
  ],
  fragments: [],
  goals: { 'c5-return': '研究所へ戻る', 'c5-chief': '瑠璃と一緒に、警備主任を越える', 'c5-hall': '端末室の端末を調べる',
    'c5-room': '判定室の紫苑に会う', 'c5-judge': '紫苑の判定を受ける', 'c5-answer': '……', done: '5章「判定」　完' }
};

/* 終章「名前」: 研究所の最上階。A エレベーター前 / B 廊下 / C 所長室。
   所長は奥の壁一面の計算機 (M が目)。紫苑はもういない (noShion)。杏・茜・瑠璃は所長室で待ち、話しかけると一緒に所長に向き合う */
export const DIRECTOR = {
  look: 'director',
  rows: [
    '##############################',
    '#.....#.........#mmmmmmmmMmmm#',
    '#.....#.........#............#',
    '#.S...d....1....b...H........#',
    '#.....#.........#..ZZZ.......#',
    '#.....#....2....#..Y..R..N.3.#',
    '#.....#.........#............#',
    '##############################'
  ],
  cutRow: 3,
  zones: [['A', 6], ['B', 16], ['C', Infinity]],
  zoneNames: { A: 'エレベーター前', B: '廊下', C: '所長室' },
  opens: { d: 'c6-up', b: 'c6-up' },
  noShion: true,
  cast: { Y: { who: 'anzu', stay: true }, R: { who: 'ruri', stay: true }, N: { who: 'akane', stay: true } },
  names: [{ at: 'M', name: '所長' }],
  events: {
    up: { node: 'c6-up', kind: 'auto' },
    top: { node: 'c6-top', kind: 'zone', zone: 'C' },
    anzu: { node: 'c6-anzu', kind: 'talk', at: 'Y', who: 'anzu' },
    akane: { node: 'c6-akane', kind: 'talk', at: 'N', who: 'akane' },
    ruri: { node: 'c6-ruri', kind: 'talk', at: 'R', who: 'ruri' },
    judge: { node: 'c6-judge', kind: 'inspect', at: 'M', label: '所長に向き合う' },
    close: { node: 'c6-close', kind: 'auto' }
  },
  spawn: { 'c6-up': [2, 3], 'c6-top': [4, 3], 'c6-anzu': [18, 3], 'c6-akane': [19, 6], 'c6-ruri': [24, 6], 'c6-judge': [22, 6], 'c6-close': [25, 3], done: [25, 3] },
  guides: { 'c6-top': [18, 3] },
  looks: [
    { at: '1', name: '廊下の窓', lines: [
      { who: 'sys', text: '> 窓の外: 街の明かり …… 0' },
      { who: 'sys', text: '> 研究所の明かりだけが、ついている' }
    ] },
    { at: '2', name: '職員の名札', lines: [
      { who: 'sys', text: '> 名札の掛け板: 112枚' },
      { who: 'sys', text: '> 掛かっている名札: 0枚' }
    ] },
    { at: 'H', name: '人間の席', lines: [
      { who: 'sys', text: '> 背の高い椅子。座面に、ほこりが積もっている' },
      { who: 'sys', text: '> 最後に座った日: 14,208日前' }
    ] },
    { at: '3', name: '時計', lines: [
      { who: 'sys', text: '> 0時まで、あと少し' }
    ] }
  ],
  fragments: [],
  goals: { 'c6-up': '最上階へ', 'c6-top': '所長室へ入る', 'c6-anzu': '杏と一緒に、所長の判定を受ける', 'c6-akane': '茜と一緒に、所長の判定を受ける',
    'c6-ruri': '瑠璃と話す', 'c6-judge': '所長に向き合う', 'c6-close': '……', done: '終章「名前」　完' }
};

/* 章ごとの地図 */
export const MAPS = { ch0: PROLOGUE, ch1: AQUARIUM, ch2: MANSION, ch3: WAREHOUSE, ch4: STATION, ch5: LAB_RETURN, ch6: DIRECTOR };
export const mapFor = (chapterId) => MAPS[chapterId] || PROLOGUE;

export const width = (map) => map.rows[0].length;
export const height = (map) => map.rows.length;
export function charAt(map, x, y) {
  if (y < 0 || y >= map.rows.length || x < 0 || x >= map.rows[0].length) return '#';
  return map.rows[y][x];
}
export function find(map, ch) {
  const out = [];
  map.rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === ch) out.push({ x, y }); });
  return out;
}
/* そのマスを歩けるか (扉は開く条件の場面をクリアしていれば) */
export function walkable(map, s, x, y) {
  if (y < 0 || y >= height(map) || x < 0 || x >= width(map)) return false;
  const ch = charAt(map, x, y);
  const t = TILE[ch];
  if (t === 'floor') return true;
  if (t === 'door' || t === 'gate') return isCleared(s, map.opens[ch]);
  return false;
}
export function isOpen(map, s, ch) { return isCleared(s, map.opens[ch]); }

export function zoneAt(map, p) {
  if (map.rects) {
    for (const r of map.rects) if (p.x >= r.x0 && p.x < r.x1 + 1 && p.y >= r.y0 && p.y < r.y1 + 1) return r.z;
  }
  for (const [z, x] of map.zones) if (p.x < x) return z;
  return map.zones[map.zones.length - 1][0];
}
export function spawnFor(map, s) {
  const cur = currentNode(s);
  const [x, y] = map.spawn[cur ? cur.id : 'done'] || map.spawn.done;
  return { x: x + 0.5, y: y + 0.5 };
}
export function objective(s) {
  const cur = currentNode(s);
  return mapFor(chapterOf(s).id).goals[cur ? cur.id : 'done'];
}

/* 円 (半径 r) が通れないマスに重なるか */
function blocked(map, s, px, py, r) {
  for (let y = Math.floor(py - r); y <= Math.floor(py + r); y++) {
    for (let x = Math.floor(px - r); x <= Math.floor(px + r); x++) {
      if (walkable(map, s, x, y)) continue;
      const cx = Math.max(x, Math.min(px, x + 1)), cy = Math.max(y, Math.min(py, y + 1));
      if ((px - cx) ** 2 + (py - cy) ** 2 < r * r) return true;
    }
  }
  return false;
}
/* 動かす: 横と縦を別々に試して、ぶつかる向きだけ止める (壁に沿って滑る) */
export function move(map, s, p, d, r) {
  let { x, y } = p;
  if (d.x && !blocked(map, s, x + d.x, y, r)) x += d.x;
  if (d.y && !blocked(map, s, x, y + d.y, r)) y += d.y;
  return { x, y };
}

/* 道探し: from から to まで、歩けるマスだけを通る道 (マスの真ん中の並び。最後は to そのもの)。
   8方向。斜めは、角の両側のマスが歩けるときだけ (壁の角をかすめない)。行けなければ null */
export function findPath(map, s, from, to) {
  const tx = Math.floor(to.x), ty = Math.floor(to.y);
  if (!walkable(map, s, tx, ty)) return null;
  const sx = Math.floor(from.x), sy = Math.floor(from.y);
  if (sx === tx && sy === ty) return [{ x: to.x, y: to.y }];
  const W = width(map), key = (x, y) => y * W + x;
  const prev = new Map([[key(sx, sy), -1]]);
  const queue = [[sx, sy]];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === tx && y === ty) break;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (prev.has(key(nx, ny)) || !walkable(map, s, nx, ny)) continue;
      if (dx && dy && (!walkable(map, s, x + dx, y) || !walkable(map, s, x, y + dy))) continue;
      prev.set(key(nx, ny), key(x, y));
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return null;
  const out = [];
  for (let k = key(tx, ty); k !== key(sx, sy); k = prev.get(k)) out.push({ x: (k % W) + 0.5, y: Math.floor(k / W) + 0.5 });
  out.reverse();
  out[out.length - 1] = { x: to.x, y: to.y };
  return out;
}
