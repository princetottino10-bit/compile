-- 戦績に「短縮マッチ (3本より少ないコンパイルで決着)」の印 short を足し、試合の種類 mode に tag (タッグデュエル) を足す。
-- 前は short を送っておらず、tag は決まりに無いので空 (null) で送っていた。さらにアプリは mode を読み戻していなかったので、
-- 別の端末から来た戦績は種類が分からず、勝ち抜き戦のボスの最強に勝った分まで制覇に数えるなど、端末ごとに実績の判定が食い違った (2026-10-10)
alter table public.player_records add column if not exists short boolean;
alter table public.player_records drop constraint if exists player_records_mode_check;
alter table public.player_records add constraint player_records_mode_check
  check (mode is null or mode in ('cpu', 'quick', 'run', 'weekly', 'tutorial', 'tag'));
