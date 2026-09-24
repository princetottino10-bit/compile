/* =========================================================================
 * 表示名 (オンライン対戦・順位表・VS の表示・WEEKLY の名前の初期値に使う)
 *   プロフィール / ACCOUNT / オンラインのロビーからいつでも変えられる。
 *   Google の名前 (本名のことが多い) は勝手に使わない。
 *   保存はブラウザ (compileRoomName。以前からオンラインの表示名に使っていた key)。アカウントの保存 (cloudsave.js) にも入る
 * ========================================================================= */

const KEY = 'compileRoomName';
export const NAME_MAX = 12;
const listeners = new Set();

/* 使えない文字 (< > と制御文字) を落として、前後の空白を取り、長さを切る */
export function cleanDisplayName(v) {
  return String(v == null ? '' : v).replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX);
}

export function displayName() {
  try { return cleanDisplayName(localStorage.getItem(KEY) || ''); } catch (e) { return ''; }
}

/* 決める。{ ok, name, message } */
export function setDisplayName(v) {
  const name = cleanDisplayName(v);
  if (!name) return { ok: false, message: '表示名は1〜' + NAME_MAX + '文字で入れてください' };
  try { localStorage.setItem(KEY, name); } catch (e) { return { ok: false, message: 'ブラウザに保存できませんでした' }; }
  for (const fn of listeners) fn(name);
  return { ok: true, name };
}

export function onDisplayNameChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/* 表示名を入れる小さな欄 (プロフィール・ACCOUNT・ロビーで共通)。idp: 部品の id の頭 */
export function nameFieldHtml(idp) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return '<div class="dn-field"><label for="' + idp + 'Name">表示名</label>' +
    '<input id="' + idp + 'Name" maxlength="' + NAME_MAX + '" autocomplete="nickname" placeholder="まだ決めていません" value="' + esc(displayName()) + '">' +
    '<button type="button" id="' + idp + 'NameSave">保存</button><small id="' + idp + 'NameMsg" role="status"></small></div>';
}

/* nameFieldHtml を置いたあとに呼ぶ。保存できたら onSaved(name) */
export function bindNameField(root, idp, onSaved) {
  const input = root.querySelector('#' + idp + 'Name');
  const btn = root.querySelector('#' + idp + 'NameSave');
  const msg = root.querySelector('#' + idp + 'NameMsg');
  if (!input || !btn) return;
  const save = () => {
    const r = setDisplayName(input.value);
    msg.textContent = r.ok ? '保存しました' : r.message;
    msg.classList.toggle('err', !r.ok);
    if (r.ok) { input.value = r.name; if (onSaved) onSaved(r.name); }
  };
  btn.onclick = save;
  input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } };
}
