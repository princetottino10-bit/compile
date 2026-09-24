-- CPU 戦の戦績以外で入った経験値 (オンライン対戦・チュートリアル・問題・RUN/WEEKLY のクリア) をアカウントに保存する。
-- ブラウザの帳簿 (js3d/xp.js) と同じ形で、端末をまたいで同期する。id はブラウザ側で振る。
-- 「1回だけ」の分 (レッスンの初回など) は id が key から決まるので、別の端末で取っても2重に入らない。
-- レベルは見た目の解放にしか使わない (強さは変わらない) ので、値は本人の申告をそのまま受ける。
create table if not exists public.player_xp (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_:.-]{1,64}$'),
  src text not null check (src ~ '^[a-z]{1,16}$'),
  xp smallint not null check (xp between 1 and 20),
  earned_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.player_xp enable row level security;
revoke all on public.player_xp from anon, authenticated;
grant select, insert on public.player_xp to authenticated;

-- ゲスト (匿名ログイン) は対象外。本人の行だけ読める・足せる。
drop policy if exists player_xp_select_own on public.player_xp;
create policy player_xp_select_own on public.player_xp
  for select to authenticated
  using (user_id = auth.uid() and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists player_xp_insert_own on public.player_xp;
create policy player_xp_insert_own on public.player_xp
  for insert to authenticated
  with check (user_id = auth.uid() and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and earned_at <= now() + interval '1 day');

-- 1人あたりの行数に上限を置く (大量書き込みで表が膨らまないように)。
create or replace function public.player_xp_cap() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from player_xp where user_id = new.user_id) >= 5000 then
    raise exception 'player_xp limit reached';
  end if;
  return new;
end;
$$;

drop trigger if exists player_xp_cap on public.player_xp;
create trigger player_xp_cap before insert on public.player_xp
  for each row execute function public.player_xp_cap();
