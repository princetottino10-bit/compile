alter table public.secure_rooms
  drop constraint if exists secure_rooms_status_check;

alter table public.secure_rooms
  add constraint secure_rooms_status_check
  check (status in ('waiting','setup','draft','playing','finished'));
