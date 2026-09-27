/* この端末 (ブラウザ) のランダムな番号。個人とは結びつかない。
   ガチャで使った CHIP を端末ごとに数えるのと、遊ばれ方の匿名の記録 (playlog.js) に使う */
const KEY = 'compileDeviceId';
export function deviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id || !/^[a-z0-9]{3,24}$/.test(id)) { id = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem(KEY, id); }
    return id;
  } catch (e) {
    return 'local';
  }
}
