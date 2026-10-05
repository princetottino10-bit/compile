-- 棋譜を残す (本人の許可を取った人だけ) を、保存 (★) したリプレイとは別の表にする。
--   202610040004 は同じ名前の player_replays を作ろうとしていたが、★のリプレイの表がすでにあったので作られず、
--   (1) 棋譜は形の違う★の表に入れようとして毎回失敗していた (1件も残っていなかった)
--   (2) 同じ移行で★の表からブラウザの権限を外してしまい、★のリプレイをアカウントに残せなくなっていた
--   ここで棋譜の表を分け、★の表の権限を元に戻す。

create table if not exists public.collected_replays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 262144),
  created_at timestamptz not null default now()
);
create index if not exists collected_replays_user_idx on public.collected_replays(user_id, created_at desc);
-- ブラウザからは読み書きできない (サーバーの関数 secure-room の saveReplay だけが入れ、管理者の画面だけが読む)
alter table public.collected_replays enable row level security;
revoke all on public.collected_replays from anon, authenticated;

-- ★のリプレイ: ブラウザ (ログインした本人) の読み書きを元に戻す (行ごとの決まりは 202609260003 のまま)
grant select, insert, update, delete on public.player_replays to authenticated;
