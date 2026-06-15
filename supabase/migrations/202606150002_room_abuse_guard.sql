create index if not exists secure_rooms_host_created_idx
  on public.secure_rooms(host_id, created_at desc);
