/* =========================================================================
 * 壊れた保存の控え
 *   保存 (localStorage) が読めなかったとき、空として扱う前に元の文字列を別の場所に控える。
 *   空のまま次の保存で上書きすると、持ち物・戦績・実績が戻せなくなるため (控えがあれば、調べて戻せる)。
 *   控えは鍵ごとに1つ (最初に壊れていたもの)。大きすぎれば控えない
 * ========================================================================= */
export function keepBroken(key, raw) {
  try {
    if (raw == null || raw === '' || raw.length > 400000) return;
    const k = 'compileBroken:' + key;
    if (localStorage.getItem(k) !== null) return;
    localStorage.setItem(k, JSON.stringify({ at: Date.now(), raw }));
  } catch (e) { /* 容量が足りなければ諦める */ }
}
