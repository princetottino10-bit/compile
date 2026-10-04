-- 観戦を許すか (部屋を作るときに選ぶ。はじめは許す)。観戦は公開・合言葉なし・1対1の対戦だけ (secure-room の op "watch")
alter table public.secure_rooms add column if not exists allow_watch boolean not null default true;
