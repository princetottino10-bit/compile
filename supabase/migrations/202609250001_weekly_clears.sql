-- 週替わり3連戦のクリア者一覧。誰でも読める。ログインした本人だけが、その週に1回だけ載せられる。
-- 名前は Google の名前ではなく、本人が入力したものを載せる (1〜16文字)。
create table if not exists public.weekly_clears (
  week text not null check (week ~ '^W[0-9]{3,6}$'),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 16 and name !~ '[[:cntrl:]]'),
  attempts integer not null check (attempts between 1 and 999),
  decks jsonb not null check (jsonb_typeof(decks) = 'array' and pg_column_size(decks) < 1024),
  cleared_at timestamptz not null default now(),
  primary key (week, user_id)
);

create index if not exists weekly_clears_week_idx on public.weekly_clears(week, cleared_at);

alter table public.weekly_clears enable row level security;
revoke all on public.weekly_clears from anon, authenticated;
grant select on public.weekly_clears to anon, authenticated;
grant insert, delete on public.weekly_clears to authenticated;

drop policy if exists weekly_clears_read on public.weekly_clears;
create policy weekly_clears_read on public.weekly_clears for select to anon, authenticated using (true);

-- ゲスト (匿名ログイン) は載せられない。載せられるのは今週と先週のぶんだけ (日本時間の週番号)
drop policy if exists weekly_clears_insert_own on public.weekly_clears;
create policy weekly_clears_insert_own on public.weekly_clears for insert to authenticated
  with check (
    user_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and substring(week from 2)::integer between
      floor((floor(extract(epoch from now() + interval '9 hours') / 86400) + 3) / 7)::integer - 1
      and floor((floor(extract(epoch from now() + interval '9 hours') / 86400) + 3) / 7)::integer
  );

drop policy if exists weekly_clears_delete_own on public.weekly_clears;
create policy weekly_clears_delete_own on public.weekly_clears for delete to authenticated using (user_id = auth.uid());
