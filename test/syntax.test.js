import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/* 画面のモジュールはテストで読み込まないものが多い (DOM を使うため)。
   書き換えで括弧が崩れても気づけるよう、js3d の全ファイルを構文だけ確かめる */
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js3d');

test('js3d の全モジュールが構文として正しい', () => {
  const bad = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: src, encoding: 'utf8' });
    if (r.status !== 0) bad.push(f + ': ' + (r.stderr || '').split('\n').slice(0, 3).join(' '));
  }
  assert.deepEqual(bad, []);
});
