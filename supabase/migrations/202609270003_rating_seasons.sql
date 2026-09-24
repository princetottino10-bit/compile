-- レートのシーズン (1か月ごと、日本時間)。
-- 月が変わって最初のレート戦で、前のシーズンの結果を rated_seasons に残し、レートを 1500 へ半分近づけて始め直す (ソフトリセット)。
-- まだ次の月に遊んでいない人は rated_players に前のシーズンのまま残っている (順位は両方の表から数える)。
alter table public.rated_players
  add column if not exists season text,
  add column if not exists name text;

create table if not exists public.rated_seasons (
  user_id uuid not null references auth.users(id) on delete cascade,
  season text not null check (season ~ '^S[0-9]{6}$'),
  name text,
  rating integer not null,
  games integer not null,
  wins integer not null,
  archived_at timestamptz not null default now(),
  primary key (user_id, season)
);
alter table public.rated_seasons enable row level security;
revoke all on public.rated_seasons from anon, authenticated;

create or replace function public.current_rated_season() returns text
language sql stable
as $$ select 'S' || to_char(now() at time zone 'Asia/Tokyo', 'YYYYMM') $$;

-- 今まで遊んでいた人は、今のシーズンに入れる (これまでの通算がこのシーズンの成績になる)
update public.rated_players set season = public.current_rated_season() where season is null;

-- シーズンが変わっていたら、前のシーズンを残してソフトリセットする
create or replace function public.rated_roll_season(p_user uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur text := current_rated_season();
  r record;
begin
  select * into r from rated_players where user_id = p_user for update;
  if not found or r.season = cur then return; end if;
  if r.season is not null and r.games > 0 then
    insert into rated_seasons(user_id, season, name, rating, games, wins)
    values (p_user, r.season, r.name, r.rating, r.games, r.wins)
    on conflict (user_id, season) do nothing;
  end if;
  update rated_players set season = cur, games = 0, wins = 0,
    rating = round(1500 + (rating - 1500) / 2.0), updated_at = now()
  where user_id = p_user;
end;
$$;
revoke all on function public.rated_roll_season(uuid) from public, anon, authenticated;

-- 対局結果の一意登録とElo更新 (シーズンの切り替えと名前の記録を足した)
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

  insert into rated_players(user_id, season) values (p_host_id, current_rated_season()) on conflict (user_id) do nothing;
  insert into rated_players(user_id, season) values (p_guest_id, current_rated_season()) on conflict (user_id) do nothing;

  -- UUID順で処理して、同時終了した別対局同士のデッドロックを避ける。
  if p_host_id < p_guest_id then
    perform rated_roll_season(p_host_id);
    perform rated_roll_season(p_guest_id);
    select rating into host_before from rated_players where user_id = p_host_id for update;
    select rating into guest_before from rated_players where user_id = p_guest_id for update;
  else
    perform rated_roll_season(p_guest_id);
    perform rated_roll_season(p_host_id);
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

  update rated_players set rating = host_after, games = games + 1, name = p_host_name,
    wins = wins + case when p_winner = 0 then 1 else 0 end, updated_at = now() where user_id = p_host_id;
  update rated_players set rating = guest_after, games = games + 1, name = p_guest_name,
    wins = wins + case when p_winner = 1 then 1 else 0 end, updated_at = now() where user_id = p_guest_id;
end;
$$;

revoke all on function public.record_rated_match(uuid, uuid, uuid, text, text, text[], text[], smallint)
  from public, anon, authenticated;

-- シーズンの順位表 (上位 limit 人)。今のシーズンは rated_players、過去は rated_seasons と、まだ切り替わっていない rated_players
create or replace function public.rated_leaderboard(p_season text, p_limit integer default 20) returns table(user_id uuid, name text, rating integer, games integer, wins integer, rank bigint)
language sql stable
security definer
set search_path = public
as $$
  with rows as (
    select s.user_id, s.name, s.rating, s.games, s.wins from rated_seasons s where s.season = p_season
    union all
    select p.user_id, p.name, p.rating, p.games, p.wins from rated_players p where p.season = p_season and p.games > 0
  )
  select user_id, name, rating, games, wins, rank() over (order by rating desc, games desc) as rank
  from rows order by rating desc, games desc limit greatest(1, least(p_limit, 100));
$$;
revoke all on function public.rated_leaderboard(text, integer) from public, anon, authenticated;

-- 自分の過去のシーズン (最終レートと順位)
create or replace function public.rated_my_seasons(p_user uuid) returns table(season text, rating integer, games integer, wins integer, rank bigint, players bigint)
language sql stable
security definer
set search_path = public
as $$
  with mine as (
    select season from rated_seasons where user_id = p_user
    union
    select season from rated_players where user_id = p_user and season is not null and season <> current_rated_season() and games > 0
  ), rows as (
    select s.season, s.user_id, s.rating, s.games, s.wins from rated_seasons s where s.season in (select season from mine)
    union all
    select p.season, p.user_id, p.rating, p.games, p.wins from rated_players p where p.season in (select season from mine) and p.games > 0
  ), ranked as (
    select *, rank() over (partition by season order by rating desc, games desc) as rank, count(*) over (partition by season) as players from rows
  )
  select season, rating, games, wins, rank, players from ranked where user_id = p_user order by season desc;
$$;
revoke all on function public.rated_my_seasons(uuid) from public, anon, authenticated;
