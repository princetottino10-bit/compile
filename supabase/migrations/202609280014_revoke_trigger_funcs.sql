-- 行数の上限をかけるトリガー用の関数は、外から直接呼ぶものではないので、実行権を外す
-- (トリガーからの呼び出しはそのまま動く)
revoke all on function public.player_records_cap() from public, anon, authenticated;
revoke all on function public.player_replays_cap() from public, anon, authenticated;
revoke all on function public.player_xp_cap() from public, anon, authenticated;
