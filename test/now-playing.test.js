'use strict';
/* 曲が替わったときのカード (bgm.js の songInfo): 流れうる曲すべてに曲名と作者があり、本人の曲と外部の曲を区別する */
const { test } = require('node:test');
const assert = require('node:assert');

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const load = () => import('../js3d/bgm.js');

test('流れうる曲はすべて曲名と作者がある', async () => {
  const B = await load();
  const keys = new Set([...B.NORMAL_BGMS, ...B.MENU_BGMS, ...B.TENSE_BGMS, ...Object.values(B.STORY_BGMS), ...B.STORY_SCENE_BGMS,
    ...Object.values(B.BOSS_THEMES), ...Object.values(B.CHAR_THEMES), ...Object.keys(B.BPM), ...B.shufflePool(),
    B.TITLE_BGM, B.STRONG_BGM, B.BOSS_BGM, B.DEUS_BGM, B.PEEK_BGM, B.BOT_BGM, B.GATE_BGM, B.RUN_BGM, B.STORY_BATTLE_BGM, B.DIRECTOR_BGM]);
  for (const k of keys) {
    const s = B.songInfo(k);
    assert.ok(s && s.title && s.by, '曲名と作者が無い: ' + k);
  }
});

test('本人の曲は own、外部の曲は作者・表記', async () => {
  const B = await load();
  assert.deepStrictEqual(B.songInfo('iron_meridian'), { title: 'Iron Meridian', by: 'Ryunosuke', own: true });
  assert.deepStrictEqual(B.songInfo('mizunishizumupiano'), { title: '水に沈むピアノ', by: '甘茶の音楽工房', own: false });
  assert.deepStrictEqual(B.songInfo('lobelia'), { title: 'ロベリア', by: 'まんぼう二等兵 (OpenTracks)', own: false });
  assert.strictEqual(B.songInfo('zero').by, 'BGM 煉獄庭園');
  assert.strictEqual(B.songInfo('destroy_god').title, '神を破壊せよ');
  assert.strictEqual(B.songInfo('cyber_prisoner').by, 'BGM：hitoshi by Senses Circuit');
  assert.strictEqual(B.songInfo('nope'), null);
});
