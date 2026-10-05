-- オンライン対戦の気配り (棚卸し O2・O3・O6・O18・O22)
--   host_seen_at / guest_seen_at: その人の画面が最後に部屋を見に来た時刻 (相手の接続が切れたかを知らせる)
--   end_reason: 決着の仕方 ('compile' / 'surrender' / 'timeout')。終わった画面に出す
--   host_used_ms / guest_used_ms: 1試合で使った持ち時間の合計 (毎手ぎりぎりまで粘れないよう、1試合ぶんの持ち時間も見る)
--   left_side / left_at: 始まる前に抜けた人と時刻。すぐには片付けず、しばらく戻ってくるのを待つ (うっかり読み直しで部屋が消えていた)
alter table public.secure_rooms
  add column if not exists host_seen_at timestamptz,
  add column if not exists guest_seen_at timestamptz,
  add column if not exists end_reason text,
  add column if not exists host_used_ms integer not null default 0,
  add column if not exists guest_used_ms integer not null default 0,
  add column if not exists left_side smallint,
  add column if not exists left_at timestamptz;
