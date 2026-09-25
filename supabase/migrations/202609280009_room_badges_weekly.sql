-- 称号を足した (週替わりの WEEKLY REGULAR / WEEKLY LEGEND)。部屋の称号の列が受け付ける一覧を合わせる
alter table public.secure_rooms drop constraint if exists secure_rooms_host_badge_check;
alter table public.secure_rooms drop constraint if exists secure_rooms_guest_badge_check;
alter table public.secure_rooms
  add constraint secure_rooms_host_badge_check check (host_badge is null or host_badge in (
    'compiler','veteran','tactician','expert','architect','master','legend','ascended','underdog',
    'chainer','flawless','grandmaster','platinum','puzzler','compuzzler','gambler','highroller','fortune','regular','weeklylegend')),
  add constraint secure_rooms_guest_badge_check check (guest_badge is null or guest_badge in (
    'compiler','veteran','tactician','expert','architect','master','legend','ascended','underdog',
    'chainer','flawless','grandmaster','platinum','puzzler','compuzzler','gambler','highroller','fortune','regular','weeklylegend'));
