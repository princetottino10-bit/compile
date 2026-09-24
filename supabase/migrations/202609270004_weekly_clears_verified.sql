-- 週替わり3連戦のクリア者一覧は、サーバー (secure-room の weeklySubmit) がリプレイで勝ちを確かめてから載せる。
-- 画面から直接書き込めないようにする (自己申告で載せられないように)。読むのは今まで通り誰でも
drop policy if exists weekly_clears_insert_own on public.weekly_clears;
revoke insert on public.weekly_clears from authenticated;
