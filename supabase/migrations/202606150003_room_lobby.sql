alter table public.secure_rooms
  add column if not exists title text not null default '対戦募集'
    check (char_length(title) between 1 and 30),
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'private')),
  add column if not exists password_salt text,
  add column if not exists password_hash text;

create index if not exists secure_rooms_lobby_idx
  on public.secure_rooms(status, visibility, created_at desc)
  where guest_id is null;
