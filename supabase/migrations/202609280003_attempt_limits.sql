-- いたずら対策の回数の記録 (secure-room だけが読み書きする)。
--   join-pass: 鍵付きの部屋のパスワードを間違えた (人ごと・部屋ごとに数えて、総当たりを止める)
--   weekly:    週替わり3連戦のクリアの送信 (送信のたびにサーバーが3試合ぶん再生するので、連打を止める)
-- 1日たった記録は数えるときに消す
create table if not exists public.attempt_log (
  id bigserial primary key,
  user_id uuid not null,
  kind text not null check (kind in ('join-pass', 'weekly')),
  room_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists attempt_log_user_kind_at on public.attempt_log (user_id, kind, created_at);
create index if not exists attempt_log_room_at on public.attempt_log (room_id, created_at) where room_id is not null;

alter table public.attempt_log enable row level security;
revoke all on public.attempt_log from anon, authenticated;
revoke all on sequence public.attempt_log_id_seq from anon, authenticated;
