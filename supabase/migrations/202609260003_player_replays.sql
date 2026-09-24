-- 保存 (★) したリプレイをアカウントに残す (js3d/replays.js)。
-- 中身は「始めの条件 + 指した手の列」で 1戦 5KB ほど。1人 30件まで。
create table if not exists public.player_replays (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9]{4,24}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 65536),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.player_replays enable row level security;
revoke all on public.player_replays from anon, authenticated;
grant select, insert, update, delete on public.player_replays to authenticated;

-- ゲスト (匿名ログイン) は対象外。本人の行だけ。
drop policy if exists player_replays_select_own on public.player_replays;
create policy player_replays_select_own on public.player_replays
  for select to authenticated
  using (user_id = auth.uid() and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists player_replays_insert_own on public.player_replays;
create policy player_replays_insert_own on public.player_replays
  for insert to authenticated
  with check (user_id = auth.uid() and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists player_replays_update_own on public.player_replays;
create policy player_replays_update_own on public.player_replays
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists player_replays_delete_own on public.player_replays;
create policy player_replays_delete_own on public.player_replays
  for delete to authenticated
  using (user_id = auth.uid());

-- 1人 30件まで (ブラウザ側の上限と同じ。少し余裕を見て 40)
create or replace function public.player_replays_cap() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from player_replays where user_id = new.user_id) >= 40 then
    raise exception 'player_replays limit reached';
  end if;
  return new;
end;
$$;

drop trigger if exists player_replays_cap on public.player_replays;
create trigger player_replays_cap before insert on public.player_replays
  for each row execute function public.player_replays_cap();
