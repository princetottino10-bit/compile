'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync('secure-room.html', 'utf8');
for (const [i, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
  new vm.Script(match[1], { filename: `secure-room-inline-${i}.js` });
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
  'PBKDF2',
  '.select("code,title,host_name,password_hash,created_at")',
];
for (const text of requiredFn) {
  if (!fn.includes(text)) throw new Error(`function missing: ${text}`);
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
