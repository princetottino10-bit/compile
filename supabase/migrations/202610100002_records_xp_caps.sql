-- 戦績・経験値の1人あたりの行数の上限を 5000 → 50000 に広げ、上限に届いたときの断り方を「決まり違反 (23514)」にする。
-- 前は raise exception (P0001) で、アプリが「その行だけ飛ばす」扱いにできず、上限に届いた人はどの端末でも同期がずっと止まった (2026-10-10)
create or replace function public.player_records_cap() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from player_records where user_id = new.user_id) >= 50000 then
    raise exception 'player_records limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.player_xp_cap() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from player_xp where user_id = new.user_id) >= 50000 then
    raise exception 'player_xp limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
