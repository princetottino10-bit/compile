-- 戦績・経験値以外のブラウザの保存 (設定・見た目・お気に入り・RUN・WEEKLY・デイリーミッションなど) を
-- 1人1行の jsonb にまとめて保存する (js3d/cloudsave.js)。数KB なので通信も保存量も小さい。
create table if not exists public.player_saves (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 131072),
  updated_at timestamptz not null default now()
);

alter table public.player_saves enable row level security;
revoke all on public.player_saves from anon, authenticated;
grant select, insert, update on public.player_saves to authenticated;

-- ゲスト (匿名ログイン) は対象外。本人の行だけ。
drop policy if exists player_saves_select_own on public.player_saves;
create policy player_saves_select_own on public.player_saves
  for select to authenticated
  using (user_id = auth.uid() and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists player_saves_insert_own on public.player_saves;
create policy player_saves_insert_own on public.player_saves
  for insert to authenticated
  with check (user_id = auth.uid() and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists player_saves_update_own on public.player_saves;
create policy player_saves_update_own on public.player_saves
  for update to authenticated
  using (user_id = auth.uid() and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  with check (user_id = auth.uid());

-- 書き換えた時刻はサーバーが付ける (どちらが新しいかの判定に使う)
create or replace function public.player_saves_touch() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists player_saves_touch on public.player_saves;
create trigger player_saves_touch before insert or update on public.player_saves
  for each row execute function public.player_saves_touch();
