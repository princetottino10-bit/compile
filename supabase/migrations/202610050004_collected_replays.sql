-- 棋譜を残す (本人の許可を取った人だけ) の入れ先を、専用の表 collected_replays に分ける。
-- 202610040004 は、もともと保存 (★) したリプレイの表だった player_replays に入れていた。
--   ・player_replays の id は text で既定値が無いので、サーバーの insert が毎回失敗していた (1件も残らなかった)
--   ・同じファイルの revoke で、ログインした人が自分の ★ を読み書きできなくなっていた
-- ここで ★ の表の権限を元 (202609260003) に戻し、棋譜は collected_replays に入れる。
create table if not exists public.collected_replays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists collected_replays_user_idx on public.collected_replays(user_id, created_at desc);
alter table public.collected_replays enable row level security;
-- ブラウザからは読み書きできない (サーバーの関数 secure-room だけが service role で入れる・読む)
revoke all on public.collected_replays from anon, authenticated;

-- ★ の表の権限を戻す (行ごとの決まり (本人の行だけ) は 202609260003 のまま残っている)
grant select, insert, update, delete on public.player_replays to authenticated;
