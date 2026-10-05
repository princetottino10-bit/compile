import test from 'node:test';
import assert from 'node:assert/strict';
import { friendlyError, friendlyMessage, stripFiles, noteError, recentErrors, rawText } from '../js3d/errtext.js';
import { inAppBrowser } from '../js3d/envcheck.js';

test('通信の失敗は「通信できませんでした」と次の一手', () => {
  for (const raw of ['Failed to fetch', 'TypeError: NetworkError when attempting to fetch resource.', 'Load failed', 'net::ERR_INTERNET_DISCONNECTED']) {
    const f = friendlyError(new TypeError(raw));
    assert.equal(f.kind, 'network', raw);
    assert.match(f.text, /通信できませんでした/);
    assert.ok(f.next.length > 0);
    assert.equal(f.raw, raw);
  }
});

test('オフラインなら、元の文に関わらず「オフラインです」', () => {
  assert.equal(friendlyError('Failed to fetch', { online: false }).kind, 'offline');
});

test('時間切れ・ログイン切れ・混雑・サーバーの番号', () => {
  assert.equal(friendlyError('The operation timed out').kind, 'timeout');
  assert.equal(friendlyError(Object.assign(new Error('AbortError'), {})).kind, 'timeout');
  assert.equal(friendlyError('JWT expired').kind, 'auth');
  assert.equal(friendlyError({ message: 'x', status: 401 }).kind, 'auth');
  assert.equal(friendlyError({ message: 'Too Many Requests', status: 429 }).kind, 'busy');
  assert.equal(friendlyError('data/cards.json を読み込めませんでした (404)').kind, 'notfound');
  assert.equal(friendlyError({ message: 'Edge Function returned a non-2xx status code', context: { status: 502 } }).kind, 'server');
  assert.equal(friendlyError('Internal Server Error').kind, 'server');
});

test('3D の土台が無い・作れないときは、ブラウザの案内', () => {
  const f = friendlyError(new Error('Error creating WebGL context.'));
  assert.equal(f.kind, 'webgl');
  assert.match(f.next, /Chrome か Safari の最新版/);
  assert.equal(friendlyError('WebGL is not available').kind, 'webgl');
});

test('日本語で書かれた文はそのまま。開発用のファイル名は外す', () => {
  assert.equal(friendlyMessage('ルームが見つかりません'), 'ルームが見つかりません');
  assert.equal(friendlyMessage('オンライン対戦は未設定です (secure-room-config.js)'), 'この環境ではオンラインの機能を使えません。CPU 戦はこのまま遊べます');
  assert.equal(stripFiles('読めません (engine.js?v=abc)'), '読めません');
  assert.equal(friendlyError('vendor/supabase-2.108.2.js を読み込めませんでした').kind, 'network');
});

test('知らない英語のエラーは、再読み込みと報告を勧める', () => {
  const f = friendlyError(new Error('Cannot read properties of undefined (reading x)'));
  assert.equal(f.kind, 'unknown');
  assert.match(f.next, /再読み込み/);
});

test('rawText は Error・文字列・Supabase の形から文を取り出す', () => {
  assert.equal(rawText(null), '');
  assert.equal(rawText('abc'), 'abc');
  assert.equal(rawText({ error_description: 'access_denied' }), 'access_denied');
});

test('最近のエラーは5件まで、同じ文は続けて入れない。鍵やメールは伏せる', () => {
  for (let i = 0; i < 7; i++) noteError('e' + i);
  noteError('e6');
  assert.deepEqual(recentErrors(), ['e2', 'e3', 'e4', 'e5', 'e6']);
  noteError('bad token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc for a@b.com');
  const last = recentErrors().pop();
  assert.ok(!/eyJ|a@b\.com/.test(last), last);
});

test('アプリの中のブラウザを見分ける', () => {
  assert.equal(inAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit Mobile/15E148 Line/13.6.1'), 'LINE');
  assert.equal(inAppBrowser('Mozilla/5.0 (Linux; Android 13) Instagram 300.0.0'), 'Instagram');
  assert.equal(inAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/400.0]'), 'Facebook');
  assert.equal(inAppBrowser('Mozilla/5.0 (Linux; Android 13) TwitterAndroid'), 'X');
  assert.equal(inAppBrowser('Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36'), null);
  assert.equal(inAppBrowser('Mozilla/5.0 Timeline/1.0'), null);
});
