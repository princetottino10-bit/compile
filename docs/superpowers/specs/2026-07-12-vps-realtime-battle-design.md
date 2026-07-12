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
│                    #   Socket.IOイベント型、RoomView型（隠蔽済みビュー）、REST DTO
├── apps/
│   ├── server/      # Fastify(REST: 認証・戦績) + Socket.IO(対戦) + Drizzle(MySQL)
│   └── web/         # Vite + React + TS（盤面UI: CPU戦 + ルーム対戦）
├── static/          # solo-play.html / cardlist.html / control-tracker.html を当面そのまま配信
└── deploy/          # Docker Compose定義・Caddyfile・CI/CD
```

### 設計原則

- **エンジンは聖域**: `engine.js` は純粋関数API・シード付き決定的乱数という優れた設計が既にあり、テストも存在する。JSのまま共有パッケージ化し、型定義だけ与える。書き換えない。
- **サーバー権威型を継承**: secure-room Edge Functionで確立済みの「サーバーでエンジン実行 → 合法手検証 → 相手の非公開情報を隠蔽したビューだけ配信」という設計をWebSocketに移植する。
- **ビューの隠蔽はサーバーの責務**: 相手の手札・デッキ・裏向きカード定義はサーバーから出ない（現行 `index.ts` のredactロジックを移植）。

## 3. 対戦サーバー設計

### 3.1 ゲームセッション管理

- 進行中ゲームはメモリ上の `Map<roomId, GameSession>` で保持。
- 全アクションは `game_actions` テーブルへ追記（シード + アクション列）。
- エンジンは決定的なので、**リプレイにより状態を完全復元可能**。サーバー再起動時は進行中ルームをDBから復元する。
- 現行の楽観ロック方式を踏襲: 各ビューにバージョン番号を付け、クライアントのアクションはバージョン一致時のみ受理。

### 3.2 Socket.IOイベント設計

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

### 3.3 再接続・切断処理

- Socket.IO接続時にCookieセッションを検証し、進行中ゲームがあれば最新ビューを再送して即復帰。
- 相手には `presence` で切断/復帰を通知。
- 切断猶予タイマー（60秒想定、設定可能）超過で不戦勝処理。
- ターンタイマー（現行機能踏襲）はサーバー側で強制し、時間切れはサーバーが処理する。

### 3.4 バリデーション

- 全C→SメッセージはzodスキーマでValidate（`packages/protocol` に定義、web側でも型を共有）。
- 合法手チェックはエンジンAPIで実施（現行Edge Function踏襲）。
- レート制限: 接続数・メッセージ頻度の簡易ガード（現行 `room_abuse_guard` 相当）。

## 4. 認証・DB設計

### 4.1 認証

- ユーザー名 + パスワード（argon2idハッシュ）。メール認証なし（メールサーバー不要に保つ）。
- サーバーサイドセッション: HTTPオンリー・Secure・SameSite=LaxのCookieにセッションIDを格納、実体は `sessions` テーブル。
- Socket.IOハンドシェイク時に同一Cookieセッションを検証。
- REST: `POST /api/auth/register` / `POST /api/auth/login` / `POST /api/auth/logout` / `GET /api/me`。

### 4.2 テーブル（Drizzle / MySQL）

| テーブル | 主な列 | 用途 |
|---|---|---|
| `users` | id, username(unique), password_hash, display_name, created_at | アカウント |
| `sessions` | id, user_id, expires_at | サーバーサイドセッション |
| `rooms` | id, code(unique), title, host_user_id, status, visibility, password_digest, created_at | ルーム |
| `games` | id, room_id, p1_user_id, p2_user_id, winner, seed, started_at, ended_at | 対戦記録（戦績の源泉） |
| `game_actions` | id, game_id, seq, actor, payload(JSON), created_at | アクションログ（リプレイ・復元用） |

- 戦績APIは `games` の集計（勝敗数・対戦履歴）。レーティング用の列・テーブルは今回作らないが、`games` に必要情報（対戦者・勝敗・時刻）が揃うよう設計しておく。

## 5. フロントエンド設計（React）

- Vite + React + TypeScript。状態管理はzustand。
- **`GameBoard` を共有コンポーネント化**し、2つのモードで使用:
  - **CPU戦**: ブラウザ内でengineをローカル実行（現行と同じ。オフライン動作可）
  - **ルーム戦**: サーバーからの `game:view` を描画。アクションはSocket.IO送信
- 両モードの差は「アクションをどこに送るか・状態をどこから得るか」だけになるよう、`GameClient` インターフェース（local実装 / socket実装）で抽象化する。
- 既存のCPU AIロジック（auto-play.html内）は独立TSモジュールに切り出して移植。初期実装は現行同様メインスレッド実行とし、Web Worker化は性能問題が確認された場合のみ行う。
- 既存CSS・アニメーション・演出は可能な限り流用し、コンポーネント単位に分割。
- 画面: ホーム / ログイン・登録 / ロビー（公開ルーム一覧）/ ルーム待機（ドラフト含む）/ 対戦盤面 / 戦績・履歴。

## 6. インフラ・デプロイ

- **Docker Compose** on VPS:
  - `caddy` — TLS自動取得（Let's Encrypt）。webのビルド成果物と `static/` を直接配信し、`/api` と `/socket.io` のみappへリバースプロキシ
  - `app` — Node.jsサーバー（API + Socket.IO専用。静的配信はしない）
  - `mysql` — MySQL 8系、ボリューム永続化
- **CI/CD**: GitHub Actions — push → lint/テスト → Dockerイメージビルド → VPSへSSHデプロイ（compose pull & up）
- **バックアップ**: mysqldump日次cron + ローテーション
- シークレット（DBパスワード等）は `.env`（gitignore）+ GitHub Actions Secrets。

## 7. 実装フェーズ

各フェーズ末に動作確認可能な状態を保つ。

1. **Phase 0 — モノレポ土台**: pnpm workspaces、TS設定、engineパッケージ化、既存テストのVitest移設、CI（lint+test）
2. **Phase 1 — サーバー骨格**: Fastify + Socket.IO + Drizzle/MySQL起動、認証API、セッション
3. **Phase 2 — 対戦コア**: ルーム管理、engine統合、ビュー隠蔽、楽観ロック、再接続、ターンタイマー（Edge Functionロジック移植）。socket.io-client結合テストで検証
4. **Phase 3 — React盤面UI**: CPU戦から先に構築（通信なしで盤面UI完成・検証できるため）。AIモジュール移植
5. **Phase 4 — ルーム対戦結合**: SocketGameClient実装、ロビー・ルーム待機・ドラフトUI、チャット、戦績画面
6. **Phase 5 — デプロイ・切替**: VPS本番構築、E2E検証、旧実装削除（`room-play.html`、`supabase/`、Firebase依存、GitHub Pages導線整理）

## 8. テスト戦略

- **engine**: 既存 `test/engine.test.js` をVitestへそのまま移設（挙動保証の要。エンジン本体は無変更なので全テストが通ること）
- **server**: socket.io-clientを使った結合テスト — 2クライアントでルーム作成→ドラフト→対戦→決着までの主要フロー、不正アクション拒否、再接続復帰
- **web**: GameClient抽象のユニットテスト + 主要コンポーネントのレンダリングテスト
- **E2E**: Playwrightで「2ブラウザでルーム対戦1ゲーム完走」スモーク

## 9. スコープ外（将来フェーズ）

- レーティング・自動マッチング
- ソロプレイ / カード一覧 / コントロールトラッカーのReact移植
- 観戦機能・リプレイ再生UI（`game_actions` に素材は揃う）
- メール認証・パスワードリセット
