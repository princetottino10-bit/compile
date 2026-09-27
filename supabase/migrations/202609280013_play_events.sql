-- 遊ばれ方を知るための、試合ごとの匿名の記録 (ログインしていない人も)。
-- 送るのは 端末ごとのランダムな番号・モード・勝ち負け・難易度・プロトコル・手数・版・ログインしているか だけ。名前や個人の情報は入れない。
-- だれでも書けるが、読めるのは管理者の画面 (secure-room の service role) だけ。
create table if not exists public.play_events (
  id bigint generated always as identity primary key,
  device text not null check (device ~ '^[a-z0-9]{3,24}$'),
  mode text not null check (mode ~ '^[a-z]{1,16}$'),
  win boolean,
  level integer check (level is null or level between -1 and 99),
  me text[] check (me is null or cardinality(me) <= 3),
  opp text[] check (opp is null or cardinality(opp) <= 3),
  turns integer check (turns is null or turns between 0 and 999),
  version text check (version is null or char_length(version) <= 40),
  logged boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists play_events_created_idx on public.play_events (created_at);

alter table public.play_events enable row level security;
revoke all on public.play_events from anon, authenticated;
grant insert (device, mode, win, level, me, opp, turns, version, logged) on public.play_events to anon, authenticated;
drop policy if exists play_events_insert on public.play_events;
create policy play_events_insert on public.play_events for insert to anon, authenticated with check (true);

-- 荒らし対策: 1分に 120 件を超えたら受け付けない。20 万件を超えたら古いものから消す
create or replace function public.play_events_cap() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.play_events where created_at > now() - interval '1 minute') >= 120 then
    return null;
  end if;
  if new.id % 1000 = 0 then
    delete from public.play_events where id <= new.id - 200000;
  end if;
  return new;
end;
$$;
drop trigger if exists play_events_cap on public.play_events;
create trigger play_events_cap before insert on public.play_events for each row execute function public.play_events_cap();
revoke all on function public.play_events_cap() from public, anon, authenticated;

-- 管理者の画面 (PLAYS) の集計: 日ごと (日本時間) の人数・試合数・新しい人・モード別、それと全体
create or replace function public.admin_play_stats(days integer default 14) returns jsonb
language sql security definer set search_path = public
as $$
  with ev as (
    select *, (created_at at time zone 'Asia/Tokyo')::date as d from public.play_events
    where created_at > now() - make_interval(days => greatest(1, least(coalesce(days, 14), 90)))
  ),
  firsts as (select device, min((created_at at time zone 'Asia/Tokyo')::date) as d from public.play_events group by device)
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(x order by x->>'day' desc) from (
      select jsonb_build_object(
        'day', ev.d,
        'players', count(distinct ev.device),
        'guests', count(distinct ev.device) filter (where not ev.logged),
        'games', count(*),
        'new', (select count(*) from firsts f where f.d = ev.d),
        'modes', (select jsonb_object_agg(m, n) from (select mode as m, count(*) as n from ev e2 where e2.d = ev.d group by mode) t)
      ) as x from ev group by ev.d) q), '[]'::jsonb),
    'players', (select count(distinct device) from public.play_events),
    'guests', (select count(distinct device) from public.play_events p where not exists (select 1 from public.play_events q where q.device = p.device and q.logged)),
    'games', (select count(*) from public.play_events),
    'modes', coalesce((select jsonb_object_agg(mode, n) from (select mode, count(*) n from ev group by mode) t), '{}'::jsonb),
    'protos', coalesce((select jsonb_agg(jsonb_build_object('name', p, 'games', n) order by n desc) from (
      select p, count(*) n from ev, unnest(ev.me) p group by p order by count(*) desc limit 10) t), '[]'::jsonb)
  );
$$;
revoke all on function public.admin_play_stats(integer) from public, anon, authenticated;
