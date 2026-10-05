/* =========================================================================
 * 呼ぶ: 音・振動、見ていないタブならタブの名前を点滅させる (戻ってきたら元に)
 *   オンラインで相手が来た・自分の番になった・持ち時間が少ない、など
 *   ほかのタブで待っていても気づけるように
 * ========================================================================= */
import { sfx } from './audio.js';
import { buzz } from './feel.js';

let titleBlink = null;
export function callMe(text, sound = 'yourTurn') {
  try { sfx(sound); } catch (e) { /* 音なしで続ける */ }
  try { buzz([60, 40, 60]); } catch (e) { /* 振動なしで続ける */ }
  if (typeof document === 'undefined' || !document.hidden || titleBlink) return;
  const base = document.title;
  let on = false;
  titleBlink = setInterval(() => { on = !on; document.title = on ? '● ' + text : base; }, 900);
  const stop = () => { clearInterval(titleBlink); titleBlink = null; document.title = base; document.removeEventListener('visibilitychange', stop); };
  document.addEventListener('visibilitychange', stop);
}
