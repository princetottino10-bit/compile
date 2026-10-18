-- オンラインの観戦で、観ている人どうしがどちらが勝つかに CHIP (ゲームの中のポイント) を賭ける (secure-room の op "bet" / "betClaim")
--   賭けは1人1部屋1回。受付は序盤 (両者合わせて 4 手番を終えるまで) だけ。倍率は観客の賭けの合計で決まる (パリミュチュエル)
--   CHIP は現金・課金とつながらない。CHIP の持ち分は端末側 (gacha.js) にあり、ここは賭けの帳簿と払い戻しの額だけを持つ
--   部屋 (secure_rooms) は決着の24時間後に消えるので、賭けの行は部屋に外部キーで結ばない (消えても払い戻しを受け取れるように)
create table if not exists public.room_bets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  room_code text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  side smallint not null check (side in (0, 1)),
  amount integer not null check (amount in (5, 15, 30, 50)),
  names jsonb,                                 -- 賭けたときの対戦者の名前 [作った人, 参加した人] (受け取りの知らせに出す)
  created_at timestamptz not null default now(),
  result text check (result in ('win', 'lose', 'refund')),
  payout integer,                              -- 戻る CHIP (賭けた分こみ)。lose は 0
  claimed boolean not null default false,
  unique (room_id, user_id)
);
create index if not exists room_bets_room_idx on public.room_bets (room_id);
create index if not exists room_bets_user_idx on public.room_bets (user_id, claimed);

alter table public.room_bets enable row level security;
revoke all on public.room_bets from anon, authenticated;

-- いま観ている人 (観戦の画面がときどき知らせる)。観客の人数を出すだけ
create table if not exists public.room_watchers (
  room_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.room_watchers enable row level security;
revoke all on public.room_watchers from anon, authenticated;

-- 片付け: 部屋に加えて、受け取り済み・30日たった賭けと、1時間来ていない観客
create or replace function public.cleanup_secure_rooms()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.secure_rooms
  where
    (status = 'waiting' and updated_at < now() - interval '2 hours')
    or (status in ('setup', 'draft') and updated_at < now() - interval '6 hours')
    or (status in ('playing', 'finished') and updated_at < now() - interval '24 hours');
  delete from public.room_bets
  where (claimed and created_at < now() - interval '2 days') or created_at < now() - interval '30 days';
  delete from public.room_watchers where seen_at < now() - interval '1 hour';
$$;

revoke all on function public.cleanup_secure_rooms() from public, anon, authenticated;
