# 効果DSL仕様(v1)

Phase 1 成果物の設計書。`data/effects.json` に全90枚の効果を宣言的JSONで定義し、
engine.js のインタープリタが実行する。自然文パースは行わない。

前提: `data/cards.json` は公式エラッタ適用済み。カード番号は公式 0–5 を 1–6 に+1シフトしたもの
(例: JSON の METAL_2 = 公式 Metal 1)。effects.json は JSON の id をキーにする。

## 1. トップレベル構造

```json
{
  "DARKNESS_1": {
    "middle": { "ops": [ ... ] },
    "upper":  { "static": ... } | { "trigger": ... },
    "lower":  { "trigger": ... } | { "restriction": ... }
  }
}
```

スロットの種別は3つ:
- **ops** — 逐次実行する命令列(middle、およびトリガーの本体)
- **static** — 常在効果(値修正・許可/禁止)。値計算や合法手列挙のたびに評価
- **trigger** — イベントフック。`{ "on": <event>, "ops": [...] }`

## 2. 命令(op)語彙

### 2.1 カード移動・操作
| op | パラメータ | 使用カード例 |
|---|---|---|
| `draw` | `count`, `player`(self/opp), `fromOpp`(相手デッキから) | DARKNESS_1, LOVE_1, LOVE_6 |
| `discard` | `count`, `player`, `optional`, `min`/`upTo`(FIRE_5の1枚以上), `bind`(枚数を変数に) | FIRE_5, PLAGUE_3, PSYCHIC_1 |
| `flip` | `select`, `optional`, `bind` | FIRE_1, LIGHT_1, APATHY_4 |
| `delete` | `select` | DEATH_4, HATE_1 |
| `return` | `select` | FIRE_3, WATER_5 |
| `shift` | `select`, `dest`(anyOther/thisLine/fromOrToThisLine), `optional` | DARKNESS_5, GRAVITY_2 |
| `play` | `source`(hand/topDeck/oppTopDeck), `facing`, `dest`, `player` | DARKNESS_4, GRAVITY_6, WATER_2 |
| `reveal` | `select` / `target:"hand"`(LIGHT_5), `bind` | LIGHT_3, LOVE_4 |
| `giveCard` | `count`(手札を相手に渡す) | LOVE_1 lower, LOVE_3 |
| `takeRandom` | 相手の手札からランダムに1枚 | LOVE_3 |
| `rearrange` | `whose`(self/opp/either) | PSYCHIC_3, WATER_3 |
| `swapProtocols` | 自分のプロトコル2枚交換 | SPIRIT_5 |
| `refresh` | 通常リフレッシュ(control 消費含む) | SPIRIT_1, LOVE_2 |

### 2.2 制御
| op | 説明 | 使用カード例 |
|---|---|---|
| `ifDone` | 直前の op が完了した場合のみ `ops` を実行(「そうした場合」) | FIRE_2, FIRE_3, LIFE_3 |
| `ifState` | 状態条件(`thisCovers` 等)を満たす場合のみ実行 | LIFE_5 |
| `choice` | 二者択一(「〜するか、〜する」) | SPIRIT_2 lower |
| `forEachLine` | 対象ライン群を記録→持ち主が選んだ順に1ラインずつ `ops` 実行 | DEATH_1, LIFE_1, WATER_2 |
| `repeatPer` | `per`(ライン内カード2枚ごと等)の回数だけ実行 | GRAVITY_1 |
| `drawByValue` | 直前に bind したカードの**現在値**だけドロー | LIGHT_1 |
| `drawByCount` | bind した枚数 + `plus` 枚ドロー | FIRE_5, PLAGUE_3 |
| `noCompileNextTurn` | 相手は次ターンコンパイル不可 | METAL_2 |

### 2.3 セレクタ(対象選択)
```json
{ "owner": "self|opp|any", "facing": "up|down|any",
  "coverage": "uncovered|covered|all|any",   // 省略時 uncovered (§ルール5.1)
  "zone": "thisLine|otherLine|chosenLine|lineWith8plus|anywhere",
  "value": { "in":[1,2] } | { "eq":2 } | "highest" | "lowestCovered",
  "exclude": "thisCard",
  "count": 1, "mode": "all|each|pick" }
```
- `mode:"all"` = 同時処理・トリガーなし(DEATH_3, WATER_4, APATHY_2, LIGHT_4)
- `mode:"each"` = 記録→1枚ずつ処理・各結果を解決(PLAGUE_4)
- `that` 参照: `bind` で束縛したカードを後続 op が `"select": {"ref":"bound"}` で直接参照
  (covered でも操作可、場を離れても参照維持 — ルール仕様 §5.4)

## 3. static(常在効果)語彙

| kind | 説明 | 使用カード |
|---|---|---|
| `setValue` | 条件に合うカードの値を固定(裏向き=4) | DARKNESS_3 |
| `modifyLineTotal` | このラインの合計値修正(相手-2 / 裏向き1枚ごと+1) | METAL_1, APATHY_1 |
| `playPermission` | プレイ許可/禁止の変更 | METAL_3(相手は裏でこのラインに置けない), PLAGUE_1 lower(相手はこのラインにプレイ不可), PSYCHIC_2(相手は裏のみ), SPIRIT_2(プロトコル不一致で表プレイ可) |
| `ignoreMiddle` | このラインの中段コマンド無効 | APATHY_3 |
| `skipCheckCache` | 自分のキャッシュ確認フェイズを省略 | SPIRIT_1 lower |

## 4. trigger(イベント)語彙

| on | 説明 | 使用カード |
|---|---|---|
| `start` / `end` | Start/End フェイズ(note 方式 — ルール仕様 §3) | DEATH_2, FIRE_4, LIGHT_2, PSYCHIC_2/5, SPEED_4, SPIRIT_2, PLAGUE_5, LIFE_1, LOVE_1 |
| `afterOppDiscard` | 相手が捨て札にしたあと | PLAGUE_2 |
| `afterYouClearCache` | キャッシュクリア後 | SPEED_2 |
| `afterYouDraw` | あなたがカードを引いたあと | SPIRIT_4 |
| `afterYouDelete` | あなたが削除したあと | HATE_4 |
| `wouldBeCovered` | 覆われる直前(committed 着地前に解決) | FIRE_1, LIFE_4, HATE_5, APATHY_3 |
| `wouldBeCoveredOrFlipped` | 覆われる/反転直前 → 置換 | METAL_6 |
| `wouldBeDeletedByCompile` | コンパイル削除の置換(shift) | SPEED_3 |

- upper のトリガーは covered でも有効。lower は uncovered + 表向きのみ
- `wouldBe〜` は置換/先行処理(replacement)としてエンジンが特別扱いする

## 5. エンジンAPI(Phase 2 のインターフェース)

```js
// 純粋関数。UIもAIもこれだけを呼ぶ
const g = Engine.newGame({ protocolsP1, protocolsP2, seed, useControl });
const r = Engine.apply(g, action);
// r = { state, requests, log, winner }
```

- `action` 例: `{type:"playCard", card, line, faceUp}` / `{type:"refresh"}` /
  `{type:"choose", requestId, picks:[...]}` / `{type:"compileLine", line}`
- 解決が選択を要する地点で `requests` に選択要求を返して停止:
  `{ id, player, kind:"pickCard"|"pickLine"|"yesNo"|"order"|"pickHandCards", candidates, context }`
- `Engine.legalActions(state, player)` — 合法手列挙(UIハイライト・AI用)
- 内部は不変更新(各 apply は新 state を返す) → アンドゥ/履歴はスナップショットで実現

## 6. テスト方針(Phase 2)

- `node --test` で実行。1カード=最低1テスト(90+)
- 各テストは固定 seed の最小盤面を組み、apply の結果(state/requests/log)を検証
- ルール仕様 §5.4 の個別ルーリング(Light 0 の値参照、Speed 2 の置換等)は専用テスト
- ランダムAI同士の自動対戦 1000 回で不変条件検査(カード総数36が常に保存される等)
