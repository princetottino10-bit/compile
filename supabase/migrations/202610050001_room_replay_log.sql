-- オンラインのリプレイ: 始めの条件 (種・プロトコル・先手) と指した手の列。決着したら参加者に返す (secure-room の op replay)
alter table public.secure_rooms add column if not exists replay_log jsonb;
