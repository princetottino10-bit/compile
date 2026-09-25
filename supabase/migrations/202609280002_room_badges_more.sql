-- 称号を増やした (js3d/rewards.js の TITLES / secure-room の BADGES) のに、部屋の称号の列が古い6種類しか受け付けず、
-- 新しい称号を付けた人が部屋を作れない・入れなかった。受け付ける一覧を合わせる
alter table public.secure_rooms drop constraint if exists secure_rooms_host_badge_check;
alter table public.secure_rooms drop constraint if exists secure_rooms_guest_badge_check;
alter table public.secure_rooms
  add constraint secure_rooms_host_badge_check check (host_badge is null or host_badge in (
    'compiler','veteran','tactician','expert','architect','master','legend','ascended','underdog',
    'chainer','flawless','grandmaster','platinum')),
  add constraint secure_rooms_guest_badge_check check (guest_badge is null or guest_badge in (
    'compiler','veteran','tactician','expert','architect','master','legend','ascended','underdog',
    'chainer','flawless','grandmaster','platinum'));
