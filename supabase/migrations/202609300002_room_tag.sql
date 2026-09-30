-- オンラインのタッグ戦 (2対2)。部屋の種類と、4つの席 (A1・B1・A2・B2) を足す。
-- 席は [null | { uid, name, badge, look, protocols, cpu }] の並び (secure-room の _shared/tag.js が読み書きする)。
-- 1対1 の部屋は mode = 'duel' のまま、seats は使わない。
alter table public.secure_rooms add column if not exists mode text not null default 'duel';
alter table public.secure_rooms drop constraint if exists secure_rooms_mode_check;
alter table public.secure_rooms add constraint secure_rooms_mode_check check (mode in ('duel', 'tag'));
alter table public.secure_rooms add column if not exists seats jsonb;
