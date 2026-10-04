-- 棋譜を残す (本人の許可を取った人だけ)。replay_collect に載っている人の CPU 戦のリプレイを player_replays に入れる。
-- ブラウザからは読み書きできない (サーバーの関数 secure-room の saveReplay だけが入れる)
create table if not exists public.replay_collect (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.player_replays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists player_replays_user_idx on public.player_replays(user_id, created_at desc);
alter table public.replay_collect enable row level security;
alter table public.player_replays enable row level security;
revoke all on public.replay_collect from anon, authenticated;
revoke all on public.player_replays from anon, authenticated;
