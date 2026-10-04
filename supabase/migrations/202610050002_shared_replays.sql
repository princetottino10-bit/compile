-- リプレイの共有リンクを短くする: 棋譜の符号 (replayshare.js の encodeReplay) を短い ID で預かる。
-- 書くのは secure-room の op shareReplay (ログインした人、1時間に60件まで)。読むのは誰でも (リンクを知っている人)
create table if not exists public.shared_replays (
  id text primary key,
  code text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists shared_replays_by_user on public.shared_replays (created_by, created_at desc);
alter table public.shared_replays enable row level security;
drop policy if exists "shared replays are readable" on public.shared_replays;
create policy "shared replays are readable" on public.shared_replays for select using (true);
