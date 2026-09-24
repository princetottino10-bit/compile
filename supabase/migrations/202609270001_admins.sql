-- 管理者 (ゲーム内の ADMIN 画面を使える人)。読み書きはサーバーの関数 (service role) だけ。
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- 運営者のアカウントを管理者にする (Google でログイン済みのもの。プライバシーポリシーの連絡先と同じ)
insert into public.admins (user_id)
select id from auth.users where email = 'prince.totti.no10@gmail.com' and coalesce(is_anonymous, false) = false
on conflict do nothing;

-- 利用状況 (ADMIN 画面の STATS)。無料枠の減り具合を見るための数だけ返す。個人の情報は返さない
create or replace function public.admin_stats() returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'users', (select count(*) from auth.users where coalesce(is_anonymous, false) = false),
    'guests', (select count(*) from auth.users where coalesce(is_anonymous, false) = true),
    'active_users_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'rooms', (select jsonb_object_agg(status, n) from (select status, count(*) n from secure_rooms group by status) s),
    'online_games_today', (select count(*) from secure_rooms where status in ('playing', 'finished') and created_at > date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'),
    'rated_matches', (select count(*) from rated_matches),
    'rated_matches_30d', (select count(*) from rated_matches where ended_at > now() - interval '30 days'),
    'cpu_records', (select count(*) from player_records),
    'cpu_records_30d', (select count(*) from player_records where created_at > now() - interval '30 days'),
    'xp_entries', (select count(*) from player_xp),
    'replays', (select count(*) from player_replays),
    'weekly_clears', (select count(*) from weekly_clears),
    'db_bytes', pg_database_size(current_database()),
    'tables', (select jsonb_object_agg(relname, pg_total_relation_size(relid))
               from pg_catalog.pg_statio_user_tables where schemaname = 'public')
  );
$$;

revoke all on function public.admin_stats() from public, anon, authenticated;
