'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const secureHtml = fs.readFileSync('secure-room.html', 'utf8');
for (const [i, match] of [...secureHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
  new vm.Script(match[1], { filename: `secure-room-inline-${i}.js` });
}
const autoPlayHtml = fs.readFileSync('auto-play.html', 'utf8');
for (const [i, match] of [...autoPlayHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
  new vm.Script(match[1], { filename: `auto-play-inline-${i}.js` });
}

const sql = fs.readdirSync('supabase/migrations').sort()
  .map((file) => fs.readFileSync(path.join('supabase', 'migrations', file), 'utf8')).join('\n');
const fn = fs.readFileSync('supabase/functions/secure-room/index.ts', 'utf8');
const requiredSql = [
  'enable row level security',
  'revoke all on public.secure_rooms from anon, authenticated',
  'pending_request jsonb',
  'password_hash text',
  "visibility in ('public', 'private')",
  "status in ('waiting','setup','draft','playing','finished')",
];
for (const text of requiredSql) {
  if (!sql.includes(text)) throw new Error(`migration missing: ${text}`);
}
const requiredFn = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'privateAction(',
  'cardAliases(',
  'eq("version", room.version)',
  'pending.player !== side',
  'action.type !== "surrender"',
  'action.player = side',
  'result.view',
  'pending: result.state?.pending || null',
  'Engine.setTrace(true)',
  'base.trace = Array.isArray(st.__trace)',
  'nextGame.__trace = Array.isArray(result.trace)',
  'engineState(room.game_state)',
  'PBKDF2',
  '.select("code,title,host_name,password_hash,draft_state,created_at")',
];
for (const text of requiredFn) {
  if (!fn.includes(text)) throw new Error(`function missing: ${text}`);
}
const requiredAutoPlayUi = [
  '公開ルームへ参加するか、部屋を作成します',
  '公式ルールでドラフトする',
  'このルームに入るにはパスワードが必要です',
  '現在、募集中の公開ルームはありません',
  '一覧を取得できませんでした',
  '前回のルームに戻る',
  '今すぐ対戦',
  '招待リンクをコピー',
  'COMPILE READY',
  'まいりました',
  'confirmSurrender',
  'roomTraceEntries',
  'roomNewTraceEntries',
  "typeof nq.target === 'number'",
  'function playerName(side)',
  '光っているカードをプレイできます',
];
for (const text of requiredAutoPlayUi) {
  if (!autoPlayHtml.includes(text)) throw new Error(`auto-play room UI text missing: ${text}`);
}
const listSelect = fn.match(/\.select\("([^"]+)"\)\s*\n\s*\.eq\("visibility", "public"\)/);
if (!listSelect) throw new Error('room list select not found');
for (const forbidden of ['game_state', 'pending_request', 'password_salt', 'host_id', 'guest_id']) {
  if (listSelect[1].includes(forbidden)) throw new Error(`room list leaks: ${forbidden}`);
}
if (/service_role\s*[:=]\s*["'][A-Za-z0-9._-]{20}/i.test(fs.readFileSync('secure-room-config.js', 'utf8'))) {
  throw new Error('service role key must not be present in browser config');
}
for (const [source, shared] of [
  ['engine.js', 'engine.js'],
  [path.join('data', 'cards.json'), 'cards.json'],
  [path.join('data', 'effects.json'), 'effects.json'],
]) {
  const a = fs.readFileSync(source);
  const b = fs.readFileSync(path.join('supabase', 'functions', '_shared', shared));
  if (!a.equals(b)) throw new Error(`shared asset is stale: ${shared}`);
}
console.log('secure room static/security checks OK');
