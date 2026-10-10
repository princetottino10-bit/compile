-- 共有リプレイ: 表をそのまま読めると、全件の一覧・符号・作った人の番号 (created_by) まで誰でも読めた (2026-10-10 の点検)。
-- 表を直接は読めないようにし、ID を渡したときだけその1件の符号を返す関数で読む (リンクを知っている人だけ)
drop policy if exists "shared replays are readable" on public.shared_replays;
revoke all on public.shared_replays from anon, authenticated;
create or replace function public.get_shared_replay(p_id text) returns text
language sql
stable
security definer
set search_path = public
as $$
  select code from shared_replays where id = p_id
$$;
revoke all on function public.get_shared_replay(text) from public;
grant execute on function public.get_shared_replay(text) to anon, authenticated;

-- 週替わりのクリア一覧: みんなに見せるのは週・名前・クリアした日時だけ。挑戦回数 (attempts)・人の番号 (user_id)・デッキは読めないようにする
revoke select on public.weekly_clears from anon, authenticated;
grant select (week, name, cleared_at) on public.weekly_clears to anon, authenticated;
