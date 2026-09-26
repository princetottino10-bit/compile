-- チュートリアルの対戦は戦績に数えない (ゲーム側と同じ)。勝ち数・対戦数・レベルから外す。遊んだモードの内訳には残す
create or replace function public.admin_players(max_rows integer default 300) returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(p order by p->>'last_active' desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', left(u.id::text, 8),
      'name', nullif(btrim(s.data ->> 'compileRoomName'), ''),
      'provider', coalesce(u.raw_app_meta_data ->> 'provider', ''),
      'created_at', u.created_at,
      'last_active', greatest(s.updated_at, r.last_played, x.last_xp, u.last_sign_in_at),
      'games', coalesce(r.games, 0),
      'wins', coalesce(r.wins, 0),
      'xp_total', (coalesce(r.rxp, 0) + coalesce(x.bonus, 0))::int,
      'level', public.player_level_of((coalesce(r.rxp, 0) + coalesce(x.bonus, 0))::int),
      'modes', coalesce(r.modes, '{}'::jsonb),
      'xp', coalesce(x.counts, '{}'::jsonb),
      'gacha', coalesce(public.safe_jsonb(s.data ->> 'compileGacha') ->> 'pulls', '0'),
      'run', public.safe_jsonb(s.data ->> 'compileRun') ->> 'phase',
      'last_mode', case
        when r.last_played is null and x.last_xp is null then null
        when x.last_xp is null or (r.last_played is not null and r.last_played >= x.last_xp) then coalesce(r.last_mode, 'cpu?')
        else x.last_src end,
      'last_mode_at', greatest(r.last_played, x.last_xp)
    ) as p
    from auth.users u
    left join public.player_saves s on s.user_id = u.id
    left join lateral (
      select count(*) filter (where not tut) as games, count(*) filter (where win and not tut) as wins, max(played_at) as last_played,
        sum(case when tut then 0 else 1 + case when win then 2 + case when level >= 2 then 1 else 0 end else 0 end end) as rxp,
        (select jsonb_object_agg(m, n) from (
          select coalesce(mode, 'unknown') as m, count(*) as n from public.player_records where user_id = u.id group by 1) t) as modes,
        (select mode from public.player_records where user_id = u.id order by played_at desc limit 1) as last_mode
      from (select *, coalesce(mode, '') = 'tutorial' as tut from public.player_records where user_id = u.id) pr
    ) r on true
    left join lateral (
      select max(earned_at) as last_xp, sum(xp) as bonus,
        jsonb_build_object(
          'online', count(*) filter (where src = 'online'),
          'lesson', count(*) filter (where src = 'lesson'),
          'tsume', count(*) filter (where id like 'k:ts:%'),
          'dailyPuzzle', count(*) filter (where id like 'k:dp:%'),
          'puzzle', count(*) filter (where src = 'puzzle'),
          'runClear', count(*) filter (where src = 'run'),
          'weeklyClear', count(*) filter (where src = 'weekly'),
          'daily', count(*) filter (where src = 'daily'),
          'trophy', count(*) filter (where src = 'trophy')
        ) as counts,
        (select case when id like 'k:ts:%' or id like 'k:dp:%' then 'tsume' else src end
           from public.player_xp where user_id = u.id and src not in ('trophy', 'daily') order by earned_at desc limit 1) as last_src
      from public.player_xp where user_id = u.id
    ) x on true
    where coalesce(u.is_anonymous, false) = false
    order by greatest(s.updated_at, r.last_played, x.last_xp, u.last_sign_in_at) desc nulls last
    limit greatest(1, least(coalesce(max_rows, 300), 1000))
  ) y;
$$;

revoke all on function public.admin_players(integer) from public, anon, authenticated;
