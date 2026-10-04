-- オンラインの1手取り消し: 直前の盤面 (取り消せる手のときだけ。secure-room の undoPointFor)
alter table public.secure_rooms add column if not exists undo_state jsonb;
