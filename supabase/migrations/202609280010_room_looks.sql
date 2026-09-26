-- 部屋の両者の見た目 (盤面の柄・マーカー・スリーブ)。相手の画面にも出すため
alter table public.secure_rooms
  add column if not exists host_look jsonb,
  add column if not exists guest_look jsonb;
