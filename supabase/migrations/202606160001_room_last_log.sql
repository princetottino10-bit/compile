-- 直近アクションの公開ゲームログを保持する。
-- クライアントはこれを使って「発動効果の表示」と「着地→解決」の演出を再現する。
-- 隠し情報(手札の中身・伏せ札の正体)はログに出ないため、両プレイヤーへ返してよい。
alter table public.secure_rooms add column if not exists last_log jsonb;
