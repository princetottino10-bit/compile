-- レート対戦はルーム本体（24時間で掃除される）と分離して永続保存する。
alter table public.secure_rooms
  add column if not exists rated boolean not null default false;

create table if not exists public.rated_players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rating integer not null default 1500 check (rating >= 100),
  games integer not null default 0 check (games >= 0),
  wins integer not null default 0 check (wins >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.rated_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid unique references public.secure_rooms(id) on delete set null,
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  host_name text not null,
  guest_name text not null,
  host_protocols text[] not null,
  guest_protocols text[] not null,
  winner smallint not null check (winner in (0, 1)),
  host_rating_before integer not null,
  host_rating_after integer not null,
  guest_rating_before integer not null,
  guest_rating_after integer not null,
  ended_at timestamptz not null default now()
);

create index if not exists rated_matches_host_ended_idx on public.rated_matches(host_id, ended_at desc);
create index if not exists rated_matches_guest_ended_idx on public.rated_matches(guest_id, ended_at desc);

alter table public.rated_players enable row level security;
alter table public.rated_matches enable row level security;
revoke all on public.rated_players, public.rated_matches from anon, authenticated;

-- 対局結果の一意登録とElo更新を同一トランザクションで処理する。
create or replace function public.record_rated_match(
  p_room_id uuid,
  p_host_id uuid,
  p_guest_id uuid,
  p_host_name text,
  p_guest_name text,
  p_host_protocols text[],
  p_guest_protocols text[],
  p_winner smallint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  host_before integer;
  guest_before integer;
  host_score numeric;
  host_after integer;
  guest_after integer;
begin
  select id into existing_id from rated_matches where room_id = p_room_id;
  if existing_id is not null then return; end if;
  if p_winner not in (0, 1) then raise exception 'invalid winner'; end if;

  insert into rated_players(user_id) values (p_host_id) on conflict (user_id) do nothing;
  insert into rated_players(user_id) values (p_guest_id) on conflict (user_id) do nothing;

  -- UUID順でロックして、同時終了した別対局同士のデッドロックを避ける。
  if p_host_id < p_guest_id then
    select rating into host_before from rated_players where user_id = p_host_id for update;
    select rating into guest_before from rated_players where user_id = p_guest_id for update;
  else
    select rating into guest_before from rated_players where user_id = p_guest_id for update;
    select rating into host_before from rated_players where user_id = p_host_id for update;
  end if;
  host_score := case when p_winner = 0 then 1 else 0 end;
  host_after := round(host_before + 32 * (host_score - 1 / (1 + power(10::numeric, (guest_before - host_before) / 400::numeric))));
  guest_after := guest_before + host_before - host_after;

  insert into rated_matches(
    room_id, host_id, guest_id, host_name, guest_name, host_protocols, guest_protocols, winner,
    host_rating_before, host_rating_after, guest_rating_before, guest_rating_after
  ) values (
    p_room_id, p_host_id, p_guest_id, p_host_name, p_guest_name, p_host_protocols, p_guest_protocols, p_winner,
    host_before, host_after, guest_before, guest_after
  );

  update rated_players set rating = host_after, games = games + 1,
    wins = wins + case when p_winner = 0 then 1 else 0 end, updated_at = now() where user_id = p_host_id;
  update rated_players set rating = guest_after, games = games + 1,
    wins = wins + case when p_winner = 1 then 1 else 0 end, updated_at = now() where user_id = p_guest_id;
end;
$$;

revoke all on function public.record_rated_match(uuid, uuid, uuid, text, text, text[], text[], smallint)
  from public, anon, authenticated;
