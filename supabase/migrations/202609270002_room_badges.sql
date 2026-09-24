-- オンライン対戦で相手に見せる称号 (js3d/rewards.js の TITLES の key)。
-- 部屋名の title と紛らわしいので badge と呼ぶ。称号は見た目だけなので、決まった一覧にあるものだけ受け付ける
alter table public.secure_rooms
  add column if not exists host_badge text check (host_badge is null or host_badge in ('compiler','veteran','expert','master','underdog','platinum')),
  add column if not exists guest_badge text check (guest_badge is null or guest_badge in ('compiler','veteran','expert','master','underdog','platinum'));
