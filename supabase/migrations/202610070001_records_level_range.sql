-- 戦績の難易度 (level) の上限を 20 → 99 に広げる。
-- 下剋上タッグは難易度 21 (aidecks.js の UNDERDOG_TAG_LEVEL) で記録するので、「20 まで」の決まりで断られ、
-- その人の戦績・経験値の送信がまるごと止まっていた (2026-10-07)。今後の CPU の段を足しても困らないよう 99 まで
alter table public.player_records drop constraint if exists player_records_level_check;
alter table public.player_records add constraint player_records_level_check check (level >= 0 and level <= 99);
