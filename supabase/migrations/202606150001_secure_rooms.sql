create extension if not exists pgcrypto;

create table if not exists public.secure_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  status text not null default 'waiting' check (status in ('waiting','setup','playing','finished')),
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  host_name text not null check (char_length(host_name) between 1 and 20),
  guest_name text check (guest_name is null or char_length(guest_name) between 1 and 20),
  host_protocols text[],
  guest_protocols text[],
  game_state jsonb,
  pending_request jsonb,
  version bigint not null default 0,
  last_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists secure_rooms_code_idx on public.secure_rooms(code);
create index if not exists secure_rooms_players_idx on public.secure_rooms(host_id, guest_id);

alter table public.secure_rooms enable row level security;

-- Room state contains hidden cards. Browser clients must never read or write this table.
revoke all on public.secure_rooms from anon, authenticated;

create or replace function public.cleanup_secure_rooms()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.secure_rooms where updated_at < now() - interval '24 hours';
$$;

revoke all on function public.cleanup_secure_rooms() from public, anon, authenticated;
