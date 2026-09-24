-- CPU 戦の戦績をアカウントに保存する (Google 等でログインしたときだけ)。
-- ブラウザの記録 (stats.js) と同じ形で、端末をまたいで同期する。id はブラウザ側で振る。
create table if not exists public.player_records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{8,40}$'),
  me text[] not null check (array_to_string(me, ',') ~ '^[A-Z]{2,16}(,[A-Z]{2,16}){2}$'),
  opp text[] not null check (array_to_string(opp, ',') ~ '^[A-Z]{2,16}(,[A-Z]{2,16}){2}$'),
  win boolean not null,
  level smallint check (level between 0 and 20),
  -- 決着までの手番の数 (最短ターン勝利の記録) と、その試合で取った実績の id
  turns smallint check (turns between 0 and 999),
  feats text[] not null default '{}' check (cardinality(feats) <= 32),
  -- その試合で自分が表で出したカード (カードごとの戦績・使って勝つほど光る枠)
  cards text[] not null default '{}' check (cardinality(cards) <= 64),
  -- 自分のカードの効果が発動した回数 { "FIRE_1": 3, ... }
  effects jsonb not null default '{}'::jsonb check (jsonb_typeof(effects) = 'object' and pg_column_size(effects) < 4096),
  played_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists player_records_user_played_idx on public.player_records(user_id, played_at desc);

alter table public.player_records enable row level security;
revoke all on public.player_records from anon, authenticated;
grant select, insert, delete on public.player_records to authenticated;

-- ゲスト (匿名ログイン) は対象外。本人の行だけ読める・足せる・消せる。
drop policy if exists player_records_select_own on public.player_records;
create policy player_records_select_own on public.player_records
  for select to authenticated
  using (user_id = auth.uid() and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists player_records_insert_own on public.player_records;
create policy player_records_insert_own on public.player_records
  for insert to authenticated
  with check (user_id = auth.uid() and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and played_at <= now() + interval '1 day');

drop policy if exists player_records_delete_own on public.player_records;
create policy player_records_delete_own on public.player_records
  for delete to authenticated
  using (user_id = auth.uid());

-- 1人あたりの行数に上限を置く (大量書き込みで表が膨らまないように)。
create or replace function public.player_records_cap() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from player_records where user_id = new.user_id) >= 5000 then
    raise exception 'player_records limit reached';
  end if;
  return new;
end;
$$;

drop trigger if exists player_records_cap on public.player_records;
create trigger player_records_cap before insert on public.player_records
  for each row execute function public.player_records_cap();
