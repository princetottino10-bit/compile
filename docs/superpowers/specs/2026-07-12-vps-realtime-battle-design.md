# VPS対戦システム移行 設計書

日付: 2026-07-12
ブランチ: `feature/vps-realtime-battle`
ステータス: 承認済み

## 1. 背景と目的

現在のCompileアプリはビルドツールなしのバニラJS構成で、GitHub Pagesから配信されている。マルチプレイヤーは2系統が併存する:

1. **Firebase Realtime Database版** (`room-play.html`) — クライアント信頼型のレガシー実装
2. **Supabase Edge Function + Postgres版** (`secure-room`) — サーバー権威型だが、通信は1.3秒間隔のHTTPポーリング

これを **自前VPS上のWebSocket（双方向通信）対戦システムに完全置き換え**、あわせてコードベースをフル近代化する。

### 決定事項（ヒアリング結果）

| 項目 | 決定 |
|---|---|
| 既存マルチプレイヤー実装 | Firebase版・Supabase版とも**廃止**、VPS一本化 |
| インフラ | VPS契約済み・ドメインあり（TLSはCaddyで自動取得） |
| リファクタリング度 | フル近代化（モノレポ + TypeScript + Vite） |
| UIフレームワーク | React |
| アカウント | アカウント制導入。範囲は**認証 + 戦績**（レーティングは将来） |
| マッチング | 従来通りルームコード + ロビー（自動マッチングなし） |
| React移植範囲 | ルーム対戦 + CPU対戦（盤面UI共有）。ソロプレイ・カード一覧・トラッカーは静的のまま配信し後続フェーズで移植 |
| サーバー技術 | Node.js + Fastify + Socket.IO |
| DB | MySQL + Drizzle ORM |

## 2. 全体アーキテクチャ

```
compile-app/ (pnpm workspaces)
├── packages/
│   ├── engine/      # 既存engine.js + data/cards.json + data/effects.json をパッケージ化
│   │                #   実績あるJSのまま変更しない。手書き型定義(index.d.ts)を付与
│   │                #   既存 test/engine.test.js をVitestへ移設
│   └── protocol/    # client/server共有のTS型とzodスキーマ
│                    #   Socket.IOイベント型、BoardView型（隠蔽済みビュー）と射影関数、REST DTO
├── apps/
│   ├── server/      # Fastify(REST: 認証・戦績) + Socket.IO(対戦) + Drizzle(MySQL)
│   └── web/         # Vite + React + TS（盤面UI: CPU戦 + ルーム対戦）
├── static/          # solo-play.html / cardlist.html / control-tracker.html を当面そのまま配信
└── deploy/          # Docker Compose定義・Caddyfile・CI/CD
```

### 設計原則

- **エンジンは聖域**: `engine.js` は純粋関数API・シード付き決定的乱数という優れた設計が既にあり、テストも存在する。JSのまま共有パッケージ化し、型定義だけ与える。書き換えない。
- **サーバー権威型を継承**: secure-room Edge Functionで確立済みの「サーバーでエンジン実行 → 合法手検証 → 相手の非公開情報を隠蔽したビューだけ配信」という設計をWebSocketに移植する。
- **ビューの隠蔽はサーバーの責務**: 相手の手札・デッキ・裏向きカード定義はサーバーから出ない。ただし現行 `index.ts` の別名生成は**そのまま移植しない**（下記3.2参照。現行方式には裏向きカードの正体を推測できる脆弱性がある）。

## 3. 対戦サーバー設計

### 3.1 ゲームセッション管理

- 進行中ゲームはメモリ上の `Map<roomId, GameSession>` で保持。
- 全アクションは `game_actions` テーブルへ追記し、**DBのログを正とする**（詳細は3.3）。
- エンジンは決定的なので、**ゲーム初期条件 + アクション列のリプレイで状態を完全復元可能**。サーバー再起動時は進行中ルームをDBから復元する。
- リプレイ復元の成立条件として、`games` に**不変のゲーム初期条件を保存する**:
  - `game_config`（JSON）: 両者のプロトコル3つ（`p0`/`p1`）、`seed`、`first`（先手）、`useControl` 等、`Engine.newGame()` に渡した引数の完全な記録
  - `ruleset_version`: エンジンのバージョン識別子 + `cards.json`/`effects.json` の内容ハッシュ。エンジンやカードデータの更新後は旧バージョンのゲームを現行コードでリプレイしない（バージョン不一致の進行中ゲームは復元対象外とし、無効試合として終了処理する。頻度は低い想定なのでスナップショット互換層は作らない = YAGNI）
- 現行の楽観ロック方式を踏襲: 各ビューにバージョン番号を付け、クライアントのアクションはバージョン一致時のみ受理。

### 3.2 カードIDの隠蔽（不透明ID）

現行Edge Functionの別名生成（内部UIDのソート順に `c0, c1...` を割当）は**移植しない**。内部UIDは `p{side}:{カード定義ID}` 形式（`engine.js:1896`）で、プロトコル構成とカードデータが公開情報である以上、クライアント側で別名→UID→カード定義の対応を完全に再現でき、`def: null` にしても裏向きカードの正体が推測可能なため。

新設計:

- ゲーム開始時に暗号学的乱数で**ゲームごとの秘密値** `card_id_secret` を生成し `games` に保存。
- 公開ID = `HMAC-SHA256(card_id_secret, 内部UID)` の先頭を base64url 化した不透明ID。内部UIDの辞書順・カード定義から一切導出できない。
- 秘密値をDBに永続化するため、サーバー再起動後も同一ゲームでは同じ公開IDが維持される（対応表そのものの保存は不要）。
- クライアント→サーバーのアクションは公開IDで受け、サーバー側で逆引き（ゲーム内36枚の対応表をメモリ保持）して内部UIDへ変換する。

### 3.3 整合性・直列化・冪等性

メモリ状態とDBログの二重管理で起こる不整合を防ぐため、以下を仕様とする。

- **単一appプロセスに限定**する（本アプリの規模ではスケールアウト不要。将来複数プロセス化する場合はルームアフィニティの導入が前提となることを明記しておく）。
- **ルーム単位の直列化**: 各ルームにコマンドキューを持ち、アクション・選択応答・タイムアウト処理を1つずつ順に処理する。同一バージョンのメッセージが並行到着しても後着は必ずバージョン不一致で拒否される。
- **処理順序**: (1) エンジン適用（メモリ上の複製で実行）→ (2) 同一DBトランザクションで `game_actions` 追記 + `games`/`rooms` 更新（終局時の `winner` 確定も同一トランザクション）→ (3) コミット成功後にメモリ状態を確定しビューを配信。コミット失敗時はメモリ状態を破棄し、DBログからのリプレイで復元する。
- **一意制約**: `game_actions` に `UNIQUE(game_id, seq)`。直列化の破れがあってもDBが二重適用を最終防衛する。
- **冪等性**: クライアントは各アクションに `actionId`（UUID）を付与。サーバーは直近の処理済み `actionId` と結果ビューを保持し、ACK消失による再送には同じ結果を返す（二重適用しない）。

### 3.4 Socket.IOイベント設計

| 方向 | イベント | 内容 |
|---|---|---|
| C→S | `lobby:list` | 公開ルーム一覧取得 |
| C→S | `room:create` / `room:join` / `room:leave` | ルーム操作（コード入室・パスワード対応） |
| C→S | `game:action` | エンジンアクション（play/refresh/compile等）+ viewバージョン |
| C→S | `game:choose` | エンジンrequest（選択要求）への応答 |
| C→S | `chat:send` | チャット |
| S→C | `room:state` | ルーム状態（参加者・ステータス） |
| S→C | `game:view` | 隠蔽済みゲームビュー（バージョン付き、push配信） |
| S→C | `game:log` | 行動ログ |
| S→C | `presence` | 相手の切断・再接続通知 |
| S→C | `chat:message` | チャット |

### 3.5 再接続・切断処理

- Socket.IO接続時にCookieセッションを検証し、進行中ゲームがあれば最新ビューを再送して即復帰。
- 相手には `presence` で切断/復帰を通知。
- **切断判定はユーザー単位**: 同一ユーザーの接続数をカウントし、全接続が切れたときのみ切断扱いにする（複数タブの1つが閉じただけでは切断としない）。
- 切断猶予（60秒想定、設定可能）超過で不戦勝処理（システム投了。3.6のタイマー機構に載せる）。

### 3.6 タイマー設計（新規設計）

現行Edge Functionにサーバー側タイマーは存在しない（現行のターンタイマーはクライアント側実装のみ）。したがってこれは移植ではなく新規設計である。

- **時間切れの効果は「システムによる投了」に統一する**。エンジンには `surrender` アクション（`action.player` 指定可）が既にあり、これを利用する。「強制refresh」や「選択要求への既定回答の自動送信」は選択が連鎖するケースの仕様が複雑になるため採用しない。
- **期限は絶対時刻で永続化**: 進行中ゲームに `deadline_at`（絶対時刻）と `deadline_holder`（現在の応答者 = 選択要求中はその回答者、通常時はターンプレイヤー）を保存する。プロセス内 `setTimeout` は起動中の発火手段にすぎず、正は常にDB。
- **切断猶予はターン期限と独立に管理**: 自分のターン期限が進行中に相手が切断するなど、2種の期限は同時に併存しうる。切断猶予はプレイヤー別の `disconnect_deadline_p1` / `disconnect_deadline_p2`（切断中のみ非NULL）で永続化し、ターン期限とは別のタイマーとして扱う。
- **更新条件**: 応答者が変わるたび（新しいターン、新しい選択要求の発生）に期限をリセットする。同一応答者への連続選択要求もリセット対象（1回答ごとに制限時間を与える）。
- **再起動時**: 進行中ゲームの `deadline_at` を読み、タイマーを再登録する。復元時点で既に期限切れのゲームは即座にタイムアウト処理する。
- **記録**: タイムアウト・切断不戦勝は `actor = 'system'` のアクションとして `game_actions` に記録し、リプレイで同じ結果を再現できるようにする。
- ターンタイマー自体は現行同様ルーム設定で有効/無効を選べる（切断猶予は常時有効）。

### 3.7 バリデーション

- 全C→SメッセージはzodスキーマでValidate（`packages/protocol` に定義、web側でも型を共有）。
- 合法手チェックはエンジンAPIで実施（現行Edge Function踏襲）。
- レート制限: 接続数・メッセージ頻度の簡易ガード（現行 `room_abuse_guard` 相当）。

## 4. 認証・DB設計

### 4.1 認証

- ユーザー名 + パスワード（argon2idハッシュ）。メール認証なし（メールサーバー不要に保つ）。
- サーバーサイドセッション: HTTPオンリー・Secure・SameSite=LaxのCookieにセッションIDを格納、実体は `sessions` テーブル。
- Socket.IOハンドシェイク時に同一Cookieセッションを検証。
- REST: `POST /api/auth/register` / `POST /api/auth/login` / `POST /api/auth/logout` / `GET /api/me`。

セキュリティ要件（Cookie属性 + zodだけでは不足するため明記）:

- **Origin検証**: Socket.IOハンドシェイクとREST更新系の両方で、許可Originの厳密な一致チェック（環境変数の許可リスト。現行Edge Functionの `ALLOWED_ORIGINS` 方式を踏襲）。
- **CSRF対策**: REST更新系はカスタムヘッダー必須化（`X-Requested-With` 等の存在チェック + Origin検証の併用）。SameSite=Laxは防御の一層にすぎない扱いとする。
- **セッション管理**: ログイン成功時にセッションIDをローテーション。DBにはセッションIDそのものではなく**そのハッシュ**を保存。期限切れセッションの定期削除、ユーザーによる全端末ログアウトAPIを用意。
- **レート制限**: ログイン・登録・ルームパスワード試行・チャットにIP別 + ユーザー別の制限（現行 `room_abuse_guard` 相当をアプリ内ミドルウェアで実装）。
- **XSS**: チャット・表示名・ルーム名は常にテキストとして描画（Reactの既定エスケープに任せ、`dangerouslySetInnerHTML` は使用禁止）。

### 4.2 テーブル（Drizzle / MySQL）

| テーブル | 主な列 | 用途 |
|---|---|---|
| `users` | id, username(unique), password_hash, display_name, created_at | アカウント |
| `sessions` | id, token_hash, user_id, expires_at | サーバーサイドセッション（トークンはハッシュで保存） |
| `rooms` | id, code(unique), title, host_user_id, status, visibility, password_digest, settings(JSON: ターンタイマー等), created_at | ルーム |
| `games` | id, room_id, p1_user_id, p2_user_id, winner, **game_config(JSON)**, **ruleset_version**, **card_id_secret**, **deadline_at**, **deadline_holder**, **disconnect_deadline_p1**, **disconnect_deadline_p2**, started_at, ended_at | 対戦記録（戦績の源泉 + リプレイ初期条件 + タイマー正データ） |
| `game_actions` | id, game_id, seq, actor(player0/1/system), action_id, payload(JSON), created_at — **UNIQUE(game_id, seq)** | アクションログ（リプレイ・復元用） |

- `game_config` は `Engine.newGame()` に渡した引数の完全な記録（プロトコル・seed・先手・useControl）。`ruleset_version` はエンジンバージョン + カード/効果データのハッシュ（3.1参照）。

- 戦績APIは `games` の集計（勝敗数・対戦履歴）。レーティング用の列・テーブルは今回作らないが、`games` に必要情報（対戦者・勝敗・時刻）が揃うよう設計しておく。

## 5. フロントエンド設計（React）

- Vite + React + TypeScript。状態管理はzustand。
- **`GameBoard` を共有コンポーネント化**し、2つのモードで使用:
  - **CPU戦**: ブラウザ内でengineをローカル実行（現行と同じ。オフライン動作可）
  - **ルーム戦**: サーバーからの `game:view` を描画。アクションはSocket.IO送信
- `GameClient` インターフェース（local実装 / socket実装）で抽象化する。ただしCPU戦は完全なエンジン状態を持ち、ルーム戦は隠蔽済みビューしか持てないため、**`GameBoard` の入力は共通の `BoardView` 型に固定**する:
  - 状態→`BoardView` の射影関数（隠蔽・別名化を含む）を `packages/protocol` に置き、**サーバーのredact処理と `LocalGameClient` が同一の射影コードを使う**。
  - `LocalGameClient` も完全状態を直接渡さず、この射影を通した `BoardView` を `GameBoard` に渡す（CPU戦ではダミー秘密値で不透明IDを生成）。これにより盤面UIにモード分岐が生じない。
- 既存のCPU AIロジック（auto-play.html内）は独立TSモジュールに切り出して移植。初期実装は現行同様メインスレッド実行とし、Web Worker化は性能問題が確認された場合のみ行う。
- 既存CSS・アニメーション・演出は可能な限り流用し、コンポーネント単位に分割。
- 画面: ホーム / ログイン・登録 / ロビー（公開ルーム一覧）/ ルーム待機（ドラフト含む）/ 対戦盤面 / 戦績・履歴。

## 6. インフラ・デプロイ

- **Docker Compose** on VPS:
  - `caddy` — TLS自動取得（Let's Encrypt）。webのビルド成果物と `static/` を直接配信し、`/api` と `/socket.io` のみappへリバースプロキシ
  - `app` — Node.jsサーバー（API + Socket.IO専用。静的配信はしない）
  - `mysql` — MySQL 8系、ボリューム永続化
- **CI/CD**: GitHub Actions — push → lint/テスト → Dockerイメージビルド → VPSへSSHデプロイ。デプロイ手順は次の順序を固定する:
  1. 新イメージをpull（タグはコミットSHA。`latest` は使わず、直前タグを記録してロールバック可能にする）
  2. **Drizzleマイグレーションをappの起動前に実行**（専用の一時コンテナで `drizzle-kit migrate`）。失敗したらデプロイ中断・旧イメージのまま
  3. app起動 → `/healthz`（DB疎通含む）のヘルスチェック合格を確認して完了。不合格なら直前タグへロールバック
- **バックアップ**: mysqldump日次cron + ローテーションに加え、**暗号化（age等）して外部ストレージへ転送**（VPS障害に耐えるため）。四半期に一度、バックアップからのリストア試験を行う。
- シークレット（DBパスワード等）は `.env`（gitignore）+ GitHub Actions Secrets。

## 7. 実装フェーズ

各フェーズ末に動作確認可能な状態を保つ。

1. **Phase 0 — モノレポ土台**: pnpm workspaces、TS設定、engineパッケージ化、既存テストのVitest移設、CI（lint+test）
2. **Phase 1 — サーバー骨格**: Fastify + Socket.IO + Drizzle/MySQL起動、認証API、セッション
3. **Phase 2 — 対戦コア**: ルーム管理、engine統合、ビュー隠蔽（不透明カードID）、ルーム単位直列化 + トランザクション + 冪等性、楽観ロック、再接続、タイマー（時間切れ=システム投了。現行にサーバー側実装はなく新規設計）。合法手検証・ドラフト進行はEdge Functionロジックを移植。socket.io-client結合テストで検証
4. **Phase 3 — React盤面UI**: CPU戦から先に構築（通信なしで盤面UI完成・検証できるため）。AIモジュール移植
5. **Phase 4 — ルーム対戦結合**: SocketGameClient実装、ロビー・ルーム待機・ドラフトUI、チャット、戦績画面
6. **Phase 5 — デプロイ・切替**: VPS本番構築、E2E検証、旧実装削除（`room-play.html`、`supabase/`、Firebase依存、GitHub Pages導線整理）

## 8. テスト戦略

- **engine**: 既存 `test/engine.test.js` をVitestへそのまま移設（挙動保証の要。エンジン本体は無変更なので全テストが通ること）
- **server**: socket.io-clientを使った結合テスト — 2クライアントでルーム作成→ドラフト→対戦→決着までの主要フロー、不正アクション拒否、再接続復帰。加えて整合性まわりを重点的に: 同一バージョンの並行アクション（片方のみ受理）、`actionId` 再送の冪等性、タイムアウト発火、再起動後のリプレイ復元とタイマー再登録、不透明カードIDの検証（同一ゲーム内で安定・ゲーム間で無相関・カード定義から導出不能）
- **web**: GameClient抽象のユニットテスト + 主要コンポーネントのレンダリングテスト
- **E2E**: Playwrightで「2ブラウザでルーム対戦1ゲーム完走」スモーク

## 9. スコープ外（将来フェーズ）

- レーティング・自動マッチング
- ソロプレイ / カード一覧 / コントロールトラッカーのReact移植
- 観戦機能・リプレイ再生UI（`game_actions` に素材は揃う）
- メール認証・パスワードリセット
