const test = require('node:test');
const assert = require('node:assert');

test('GATEKEEPER と戦えない FIRE / WATER / SPEED は、強敵に勝つと3つ目の印が付く', async () => {
  const { protocolSummary } = await import('../js3d/stats-data.js');
  const { HONKI_BASE } = await import('../js3d/aidecks.js');
  const s = protocolSummary([
    { win: true, level: HONKI_BASE + 1, me: ['FIRE', 'SPEED', 'LIFE'], opp: ['WATER', 'HATE', 'TIME'] },   // 本気瑠璃
    { win: true, level: 4, me: ['WATER', 'DEATH', 'NOVA'], opp: ['PSYCHIC', 'DARKNESS', 'SPEED'] }          // ロック特化
  ]);
  assert.equal(s.get('FIRE').wonStrongest, true);
  assert.equal(s.get('SPEED').wonStrongest, true);
  assert.equal(s.get('WATER').wonStrongest, true);
  assert.equal(s.get('LIFE').wonStrongest, false, 'GATEKEEPER と戦えるプロトコルは GATEKEEPER に勝ったときだけ');
  assert.equal(s.get('NOVA').wonStrongest, false);
});
