create or replace function public.cleanup_secure_rooms()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.secure_rooms
  where
    (status = 'waiting' and updated_at < now() - interval '2 hours')
    or (status in ('setup', 'draft') and updated_at < now() - interval '6 hours')
    or (status in ('playing', 'finished') and updated_at < now() - interval '24 hours');
$$;

revoke all on function public.cleanup_secure_rooms() from public, anon, authenticated;
