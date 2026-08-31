# 3D ARENA (three-play.html)

マスターデュエル的な手触りを狙った 3D 対戦ビュー。
**ルールは既存の `engine.js` をそのまま使い、このビューは描画と入力だけを担当する。**

## 起動

```bash
python scripts/dev_server.py 8080
```

`http://localhost:8080/three-play.html` を開く。
`file://` では ES モジュールと `data/*.json` の取得ができないため、必ず HTTP で開くこと。

URL パラメータでプロトコル選択を飛ばせる:

```
three-play.html?me=DARKNESS,FIRE,LIGHT&ai=APATHY,FEAR,ICE
```

指定がなければ起動時にプロトコル選択画面が出る。

### 観戦デモ

```
three-play.html?demo=1
```

ランダム編成の AI 同士が自動で対戦し、選択もすべて AI が答える。
操作系は隠れ、決着すると少し置いて次の対戦が始まる。演出の確認や見せるときに使う。

## 操作

| 操作 | 動作 |
|------|------|
| 手札にカーソル | カードが持ち上がり、左に拡大プレビュー |
| 手札をクリック | 選択。置けるラインに着地パッドが光る |
| **手札をドラッグ** | 掴んで指に追従。パッド上で離すとプレイ (推奨操作) |
| 着地パッドをクリック | そのラインにプレイ (クリック派向けの従来操作) |
| Shift 押下 / 「裏向きでプレイ」 | 裏向きプレイに切り替え (どのラインにも置ける) |
| Esc | 選択解除 |
| 盤面カードにカーソル | 拡大プレビュー (相手のカードは盤面上では逆さ向きのため) |

## 見せ場 (演出)

| きっかけ | 演出 |
|----------|------|
| カードプレイ | 構え → カメラが寄る → 弧を描いて落下 (裏向きなら空中で反転) → 衝撃リング + 光柱 + シェイク |
| 効果発動 | **解決を1ステップずつ再生**。各段で発動カードが浮いて発光し、上部にカード名 + 効果テキストの帯 |
| コンパイル | ラインが白熱 → 光柱が立つ + 衝撃波 + 画面フラッシュ → ライン上のカードが**砕けて飛散** → 全画面カットイン |
| ターン開始 | 斜めの帯が横切る YOUR TURN / OPPONENT バナー |
| 決着 | 3ライン同時の光柱 + 放射光線の VICTORY / DEFEAT カットイン |

コンパイルにはプロトコル別のバーストが重なる (`fx.js` の `BURST_FAMILY`)。
30種を5系統に丸めている: **flame**(火の粉) / **crystal**(結晶) / **mist**(霧) /
**rings**(波紋) / **streaks**(光条)。

### 効果音

`js3d/audio.js` — 素材ファイルなしの WebAudio 合成。着地・ドロー・反転・粉砕・
コンパイルのチャージ/解放・勝敗ファンファーレなど15種。ブラウザの自動再生制限が
あるため最初のクリックで解錠される。ドックの 🔊 でミュート。

コンパイルのカットインには `art/{Proto}_Glitched.webp` を背景に使う (全30プロトコル)。

### アートの出どころ

| セット | 供給元 |
|--------|--------|
| Main 1 / Aux 1 | 公式イラスト (`Compile 1/` → `scripts/build_card_art.py`) |
| Aux 2 | 公式イラスト (`Compile 2/Compile_ Aux 2/Toolkit/Illustrations/` → `scripts/build_card_art_2.py`)。個別カードは大判からの6クロップ |
| Main 2 | **手続き生成** (`scripts/build_card_art_2.py`)。公式ツールキットにイラストが同梱されていないため、実物の商品写真 (`Compile 2/Compile_ Main 2/Photo/`) と同じモザイク・シャード様式を、`data/cards.json` のプロトコル色で決定的に合成する |

再生成は `python scripts/build_card_art_2.py` (シード固定・再実行安全)。

## 実物のルールに合わせている点

付属のルールシート (`_rulesheet.txt`) の記述に従って盤面を組んでいる。
**ここを崩すと盤面が読めなくなるので、変更するときは根拠を確認すること。**

### カードの構成 (Card Anatomy)

3Dビューでは上・中・下段を役割ラベル付きのゾーンに塗り分ける
(▲ 上段・常在 / ◆ 中段・即時 / ▼ 下段・補助)。本文は枠に収まるまで
自動縮小するので切り捨ては起きない (`cardtex.js` の `fitTextBlock`)。

| 記号 | 内容 | 3Dビューでの置き場所 |
|------|------|--------------------|
| A | Protocol Indicator | ヘッダ左 |
| B | Value | ヘッダ右の大きなバッジ |
| D | Top Command (Persistent) | ヘッダ直下の帯 |
| E | Middle Command (Immediate) | アートの下 |
| F | Bottom Command (Auxiliary) | いちばん下 |

> Always ensure that the value and the top command are always visible when covered.

覆われても **値と上段コマンドが常に見えている**必要がある。そのため:

- A / B / D をカード上端にまとめ、`cardtex.js` の `REVEAL_RATIO` (0.285) で
  「必ず見えていなければならない上端の割合」を定義する
- `theme.js` の `coverStep` (0.40) は `カード奥行 × REVEAL_RATIO` を上回るよう取る。
  **この2つは連動しているので、片方だけ変えないこと**

裏向きカードの値は 2 なので、裏面にも同じ位置に値バッジを出している。

### プロトコルカード

実物は2面ある。`Loading...` 側で始まり、コンパイルすると裏返して `Compiled` 側にする。
3Dビューでも板を2枚のメッシュで作り、コンパイル時に x 軸で裏返す (`panel.js`)。

- Loading 面 → `art/{Proto}.webp`
- Compiled 面 → `art/{Proto}_Glitched.webp`

### 盤面の配置

> Each player places their protocols ... in the center of the play area

プロトコルはフィールド**中央**に両者分が並び、各プレイヤーのスタックはそこから
自分側へ伸びる (`BOARD.protoZ` ±0.55 / `BOARD.stackZ` ±1.62)。

## 空間の作り

- **天球** — 上に向かって色が乗るグラデーション + 微細な星 (`arena.js`)
- **外周の枠と支柱** — 盤面の広さと奥行きの手がかり
- **浮遊リング** — 高所をゆっくり回るホログラムの輪。視界には入りすぎない半径に置く
- **塵** — 900 点のパーティクルがゆっくり上昇 (`fx.js` の `createDust`)
- **環境マップ** — `RoomEnvironment` を PMREM に通してカードに映り込みを与える。
  素のままでは明るすぎるので、マテリアル側の `envMapIntensity` で絞る
- **カードの金属枠** — プロトコル色の額縁。ハイライト時はここが最も強く光る

明るいカードアートが bloom を突き抜けるため、`cardtex.js` でアート面に薄い暗幕と
ビネットを敷いてある。ここを外すと LIGHT 系のカードが白い板になる。

## ファイル構成

```
three-play.html      シェル + HUD (DOM レイヤ)
js3d/
  main.js            エントリ。engine 接続 / 進行 / 入力 / HUD 更新
  stage.js           レンダラ・シーン・ライト・床シェーダ・カメラワーク・描画ループ
  board.js           uid ↔ カードメッシュの対応管理と、状態差分からの演出
  card.js            カード1枚のメッシュ (表 / 裏 / 厚み)
  cardtex.js         カード面を Canvas で描いてテクスチャ化
  layout.js          手札・スタック・山札などの座標計算 (純関数)
  panel.js           ライン端のプロトコル表示板
  setup.js           プロトコル選択画面
  arena.js           天球・外周枠・浮遊リング・支柱 (雰囲気だけの静的構造)
  fx.js              大物の演出 (光柱・衝撃波・カード粉砕・塵・プロトコル別バースト)
  audio.js           効果音 (WebAudio 合成、素材ファイルなし)
  icons.js           効果種別アイコン (SVGパスを Canvas / DOM で共用)
  ui.js              HUD・選択ダイアログ・各種カットイン (DOM)
  prompts.js         engine の request.prompt → 日本語
  theme.js           寸法・配色・演出タイミングの単一情報源
  tween.js           最小トゥイーンランタイム
vendor/
  three.module.js / three.core.js   three.js r180
  jsm/postprocessing, jsm/shaders   EffectComposer + UnrealBloom
```

## engine との接続で外せない点

`Engine.apply(state, action)` は**選択待ちで中断すると `state` に「アクション前の基準状態」を返し、
途中経過は `view` に入れる**。そのため:

- 盤面の描画・HUD は必ず `cur.view || cur.state` (`main.js` の `shown()`) を見る
- `Engine.apply` / `Engine.legalActions` / `Engine.ai.*` に渡すのは `cur.state` の方

これを取り違えると、効果解決の途中でカードが手札位置に飛ぶ。

ログ (`res.log`) は再開のたびに先頭から全量返るので、`requests` が残っている間は出力しない。

`Engine.setTrace(true)` にすると `res.trace` に `{msg, uid, st}` が並び、
「どのカードが効果を発動したか」を演出に使える。ただし 1 エントリごとに state を
clone するため、**AI の思考中は必ず切る** (`main.js` の `withoutTrace`)。
切り忘れると探索が桁違いに遅くなる。

## 演出の作り

カードプレイの着地 (`board.js` の `playLanding`) が中心:

1. 手札から抜き出して手前で構える (`playLift`)
2. カメラが着地点へ寄る (`stage.focusOn`) — 移動と並行
3. 弧を描いて落下。裏向きプレイなら空中で裏返る (`playArc`)
4. 着地: 床に衝撃リング + 光柱 + カメラシェイク + カード発光 (`playSettle`)
5. カメラが定位置へ戻る (`camEase`)

タイミングは `theme.js` の `TIMING` に集約してある。実行中に
`window.__3d.timing` を書き換えれば、演出を遅くして各段階を確認できる。

その他の移動 (ドロー / 捨札 / 移動 / 反転) は `applyTransition` が状態差分から
汎用トゥイーンで処理する。**演出の最後には必ず `syncInstant` で正しい配置へ収束させる**ので、
演出が競合しても表示と状態がずれ続けることはない。

### 効果解決のステップ再生

engine の `trace` は各ログ時点の状態スナップショットを持つ。これを順に
`applyTransition` へ流すことで、「反転 → 移動 → 削除」が一息に飛ばず1つずつ見える。

- `visualFingerprint(st)` で**絵が変わらない中間状態は飛ばす** (盤面 / 手札 / 捨札 / 山札 /
  コンパイル状況 / 表裏だけを見る)
- 連鎖が長いときは `MAX_STEPS` (14) まで間引いてテンポを保つ
- 各ステップは `{speed: 0.72}` で少し速めに流し、最後は必ず本物の状態へ合わせる
- 選択待ちで中断するたび trace は切れるので、1回あたりのステップ数は実測 1〜3 程度

### ハイライトの方針

カード面の `emissive` を上げるとアートが白飛びするため、強調は
**床に落とす光輪** (board が scene 直下に持つ) に寄せている。
光輪をカードの子にすると、カードが傾いたときに面へ重なって色を潰すので分離してある。
プレイ可能な手札を光らせるのではなく、**プレイできない札を沈める** (`setDim`)。

## 既知の制約

- 相手の盤面カードは実卓と同じく相手向き (逆さ) に置かれる。読むにはホバーのプレビューを使う
- タブが非表示のときは `requestAnimationFrame` が止まるため、`stage.js` の
  ウォッチドッグ (`setInterval`) がトゥイーンだけ進めて進行が固まらないようにしている

## デバッグ

`window.__3d` に以下を公開している (開発用):

| プロパティ | 用途 |
|-----------|------|
| `cur` | 現在の `{state, view, requests, ...}` |
| `legal()` | 現在の合法手 |
| `play(uid, line, faceUp)` | コードからプレイする |
| `diag()` | busy / 選択中 / 実行中トゥイーン数 |
| `timing` | `TIMING` への参照 (演出を遅くして確認できる) |
| `stage` / `board` | シーンと盤面オブジェクト |
| `testCompile(line, side)` | コンパイル演出だけを再生 (盤面は変えない) |
| `testResult(win)` | 決着演出だけを再生 |

`timing` を書き換えてから `play()` すると、演出を遅くして各段階を確認できる:

```js
Object.assign(__3d.timing, { playLift: 900, playArc: 3000, playSettle: 2400 });
```
