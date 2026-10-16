import test from 'node:test';
import assert from 'node:assert/strict';
import { NEWS, KINDS, headlines, unreadNews, markAllRead, seenIds, shouldPop, markPopped, newsListHtml, shortDate } from '../js3d/news.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('お知らせ: id は重ならず、新しいものが先頭、なかまと日付の形がそろっている', () => {
  assert.equal(new Set(NEWS.map(n => n.id)).size, NEWS.length);
  for (let i = 1; i < NEWS.length; i++) assert.ok(NEWS[i - 1].date >= NEWS[i].date, NEWS[i].id + ' が前のものより新しい');
  for (const n of NEWS) {
    assert.match(n.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(KINDS[n.kind], n.id + ' のなかま');
    assert.ok(n.title && n.body.length, n.id);
  }
});

test('はじめは全部まだ読んでいない。全部読んだら0、あとから足したものだけ未読', () => {
  const ls = mem();
  assert.equal(seenIds(ls), null);
  assert.equal(unreadNews(seenIds(ls)).length, headlines().length);
  markAllRead(ls);
  assert.equal(unreadNews(seenIds(ls)).length, 0);
  const more = [{ id: 'later', date: '2099-01-01', kind: 'new', title: 't', body: ['b'] }, ...NEWS];
  assert.deepEqual(unreadNews(seenIds(ls), more).map(n => n.id), ['later']);
});

test('自動で開くのは、新しいお知らせ1つにつき一度だけ', () => {
  const ls = mem();
  assert.equal(shouldPop(ls), true);
  markPopped(ls);
  assert.equal(shouldPop(ls), false);
  const more = [{ id: 'later', date: '2099-01-01', kind: 'new', title: 't', body: ['b'] }, ...NEWS];
  assert.equal(shouldPop(ls, more), true);
  markAllRead(ls, more);
  assert.equal(shouldPop(ls, more), false, '読み終えていれば開かない');
});

test('一覧の HTML: 未読に NEW、文字は書き換えられないように', () => {
  const list = [{ id: 'x', date: '2026-10-16', kind: 'fix', title: '<b>&', body: ['"a"'], go: 'run' }];
  const html = newsListHtml(list, { unread: new Set(['x']), open: 'x', goLabel: () => 'RUN を開く' });
  assert.match(html, /NEW/);
  assert.match(html, / open>/);
  assert.match(html, /&lt;b&gt;&amp;/);
  assert.match(html, /data-news-go="run"/);
  assert.doesNotMatch(newsListHtml(list), /NEW|data-news-go/);
  assert.equal(shortDate('2026-01-05'), '1/5');
});

test('直したことは「すべて」・未読の数・自動で開くのに入れない', () => {
  assert.ok(NEWS.some(n => n.kind === 'fix'), '直したことのお知らせがある');
  assert.ok(headlines().every(n => n.kind !== 'fix'));
  const fixOnly = [{ id: 'f', date: '2099-01-01', kind: 'fix', title: 't', body: ['b'] }];
  const ls = mem();
  assert.equal(unreadNews(null, fixOnly).length, 0);
  assert.equal(shouldPop(ls, fixOnly), false);
});
