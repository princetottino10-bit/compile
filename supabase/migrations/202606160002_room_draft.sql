-- 公式ドラフト用の進行状態。{ on, pool:[残りプロトコル], first:0|1, step, done }
-- ピック結果は既存の host_protocols / guest_protocols に蓄積する。
alter table public.secure_rooms add column if not exists draft_state jsonb;
