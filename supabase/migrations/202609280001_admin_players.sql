-- 管理者の画面 (ADMIN → PLAYERS): ログインして遊んでいる人の一覧。
-- 出すのは本人が決めた表示名 (player_saves の compileRoomName) と、登録日・最後に遊んだ日・CPU 戦の数だけ。
-- メールアドレスや認証の提供元のプロフィール (本名など) は出さない。ゲスト (匿名) は含めない。
-- secure-room (service role) からだけ呼ぶ。
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
      'last_active', greatest(s.updated_at, r.last_played, u.last_sign_in_at),
      'games', coalesce(r.games, 0),
      'wins', coalesce(r.wins, 0)
    ) as p
    from auth.users u
    left join public.player_saves s on s.user_id = u.id
    left join (
      select user_id, count(*) as games, count(*) filter (where win) as wins, max(played_at) as last_played
      from public.player_records group by user_id
    ) r on r.user_id = u.id
    where coalesce(u.is_anonymous, false) = false
    order by greatest(s.updated_at, r.last_played, u.last_sign_in_at) desc nulls last
    limit greatest(1, least(coalesce(max_rows, 300), 1000))
  ) x;
$$;

revoke all on function public.admin_players(integer) from public, anon, authenticated;
