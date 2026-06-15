# Secure Room setup

1. Supabaseでプロジェクトを作成する。
2. Authentication > ProvidersでAnonymous Sign-Insを有効にする。
3. SQL Editorで`supabase/migrations/202606150001_secure_rooms.sql`を実行する。
4. Supabase CLIをインストールしてログインする。
5. `supabase functions deploy secure-room`を実行する。
6. Edge FunctionのSecretsへ`ALLOWED_ORIGINS=https://princetottino10-bit.github.io`を設定する。
7. `secure-room-config.js`へProject URLとPublishable/anon keyを設定する。

`service_role`キーはSupabaseがEdge Functionへ提供します。HTMLや設定JSへ記載しないでください。

## Security model

- `secure_rooms`はRLS有効かつ`anon`/`authenticated`から直接アクセス不可。
- 全操作はJWT付きEdge Function経由。
- Edge Functionが参加者、手番、選択権、合法手、バージョンを検証。
- 相手の手札・デッキ・裏向きカード定義はレスポンスから除外。
- 楽観ロックにより二重操作と同時更新を拒否。
- CORSは公開サイトとローカル開発環境だけを許可。

