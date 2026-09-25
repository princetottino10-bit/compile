-- 遊んでいる人の画面で起きたエラーを記録する (報告がなくても気づけるように)。
-- だれでも (ログインしていない人も) 書けるが、読めるのは管理者の画面 (secure-room の service role) だけ。
-- 中身は エラーの文・どこで起きたか (ファイルと行)・画面の種類・版の印・端末のおおまかな種類 だけで、個人の情報は入れない。
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  message text not null check (char_length(message) between 1 and 300),
  source text check (source is null or char_length(source) <= 300),
  mode text check (mode is null or char_length(mode) <= 40),
  version text check (version is null or char_length(version) <= 40),
  device text check (device is null or char_length(device) <= 60),
  created_at timestamptz not null default now()
);

alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
grant insert (message, source, mode, version, device) on public.client_errors to anon, authenticated;
drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors for insert to anon, authenticated with check (true);

-- 増えすぎないように: 5000 件を超えたら古いものから消す。1分に 60 件を超えたら受け付けない (荒らし対策)
create or replace function public.client_errors_cap() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.client_errors where created_at > now() - interval '1 minute') >= 60 then
    return null;
  end if;
  delete from public.client_errors where id <= (select max(id) - 5000 from public.client_errors);
  return new;
end;
$$;
drop trigger if exists client_errors_cap on public.client_errors;
create trigger client_errors_cap before insert on public.client_errors for each row execute function public.client_errors_cap();
revoke all on function public.client_errors_cap() from public, anon, authenticated;
