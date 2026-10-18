/* オンラインの観戦の賭け: 倍率と払い戻しの計算 (js3d/roombet.js) と、サーバーの写し (supabase/functions/_shared/roombet.js) */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const C = await import('../js3d/roombet.js');
const S = await import('../supabase/functions/_shared/roombet.js');

test('定数と計算がサーバーの写しと同じ', () => {
  assert.deepEqual(S.ROOM_BET_AMOUNTS, C.ROOM_BET_AMOUNTS);
  assert.equal(S.ROOM_BET_TURNS, C.ROOM_BET_TURNS);
  assert.equal(S.ROOM_BET_SEED, C.ROOM_BET_SEED);
  assert.equal(S.ROOM_BET_CUT, C.ROOM_BET_CUT);
  for (const pools of [[0, 0], [15, 0], [0, 50], [130, 45], [5, 995], [1000, 1000]]) {
    assert.deepEqual(C.roomBetOdds(pools), S.roomBetOdds(pools), String(pools));
    for (const w of [0, 1, null]) for (const side of [0, 1]) {
      assert.deepEqual(C.roomBetSettle({ side, amount: 30 }, w, pools), S.roomBetSettle({ side, amount: 30 }, w, pools));
    }
  }
});

test('誰も賭けていなければ両側 1.9 倍。賭けが集まった側ほど倍率が下がる', () => {
  assert.deepEqual(C.roomBetOdds([0, 0]), [1.9, 1.9]);
  const [a, b] = C.roomBetOdds([200, 20]);
  assert.ok(a < 1.9 && b > 1.9, a + ' / ' + b);
  assert.ok(C.roomBetOdds([5000, 0])[0] >= 1.1, '1.1 倍より下げない');
});

test('胴元が損をしすぎない: 賭けが多ければ払い戻しの合計は賭けの合計を大きく超えない', () => {
  const bets = [{ side: 0, amount: 50 }, { side: 0, amount: 30 }, { side: 1, amount: 15 }, { side: 1, amount: 50 }, { side: 0, amount: 50 }];
  const pools = C.roomBetPools(bets);
  assert.deepEqual(pools, [130, 65]);
  const total = pools[0] + pools[1];
  for (const w of [0, 1]) {
    const paid = bets.reduce((n, b) => n + C.roomBetSettle(b, w, pools).payout, 0);
    /* 見せ金 (両側 50) ぶんと 5 の倍数への切り上げぶんまでは出る */
    assert.ok(paid <= total + C.ROOM_BET_SEED + 5 * bets.length, w + ': ' + paid + ' / ' + total);
  }
});

test('外れは 0、不成立は賭けた分を戻す、当たりは決着の倍率で5の倍数に切り上げ', () => {
  const pools = [30, 15];
  assert.deepEqual(C.roomBetSettle({ side: 1, amount: 15 }, 0, pools), { result: 'lose', payout: 0 });
  assert.deepEqual(C.roomBetSettle({ side: 1, amount: 15 }, null, pools), { result: 'refund', payout: 15 });
  const odds = C.roomBetOdds(pools)[0];
  const r = C.roomBetSettle({ side: 0, amount: 30 }, 0, pools);
  assert.equal(r.result, 'win');
  assert.equal(r.payout % 5, 0);
  assert.ok(r.payout >= 30 * odds && r.payout < 30 * odds + 5);
});

test('受付の残りと、受け取りの知らせの文', () => {
  assert.equal(C.turnsLeft({ open: true, closeTurns: 4, turns: 1 }), 3);
  assert.equal(C.turnsLeft({ open: false, closeTurns: 4, turns: 1 }), 0);
  assert.match(C.claimText({ result: 'win', names: ['RYU', 'KEN'], side: 1, amount: 15, payout: 30 }), /KEN に賭けて当たり。30 CHIP/);
  assert.match(C.claimText({ result: 'lose', names: ['RYU', 'KEN'], side: 0, amount: 15, payout: 0 }), /RYU に賭けた 15 CHIP は外れ/);
  assert.match(C.claimText({ result: 'refund', names: null, code: 'ABC234', side: 0, amount: 5, payout: 5 }), /5 CHIP を戻しました/);
});
