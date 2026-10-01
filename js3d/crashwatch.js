/* =========================================================================
 * 対戦の途中で画面が落ちたかを知る (落ちるとエラーを送れないので、次に開いたときに知らせる)
 *   対戦を始めたら印を置き、決着・メニューへ戻るで消す。次に開いたとき印が残っていれば、途中で終わっている。
 *   ページを閉じた・読み直した (pagehide) か、裏に回った (visibilitychange) かも残すので、
 *   「どちらも無い」なら画面ごと落ちた (スマホのブラウザがメモリ不足で落とした など) と見分けられる。
 *   知らせる先はエラーの一覧 (errorreport.js の client_errors)
 * ========================================================================= */
import { reportError } from './errorreport.js';

const KEY = 'compileLiveGame';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
const write = (v) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* private mode */ } };

/** 対戦を始めた。mode: cpu / weekly / run / online など */
export function battleStarted(mode, me, opp) {
  write({ mode, me: (me || []).slice(0, 3), opp: (opp || []).slice(0, 3), at: Date.now(), turns: 0, hidden: false, closed: false });
}
/** 手番が進んだ (どこまで進んで落ちたかを見るため) */
export function battleProgress(turns) {
  const v = read();
  if (v && v.turns !== turns) write({ ...v, turns, last: Date.now() });
}
/** いま何をしているか (落ちたときに、最後に何をしていたかを知るため)。what: 'compile' など、info: 数字など少し */
export function battleNote(what, info) {
  const v = read();
  if (v) write({ ...v, what: String(what).slice(0, 24), info: info == null ? null : String(info).slice(0, 40), whatAt: Date.now() });
}
/** 決着した・自分でメニューへ戻った: 印を消す */
export function battleEnded() { write(null); }

/** 起動のはじめに1回: 前の対戦が途中で終わっていれば知らせる */
export function checkLastBattle() {
  const v = read();
  write(null);
  if (!v) return null;
  const secs = Math.round(((v.last || v.at) - v.at) / 1000);
  const how = v.closed ? 'ページを閉じた・読み直した' : v.hidden ? '裏に回ったあと' : '画面ごと落ちた (閉じた記録なし)';
  const text = v.mode + ' ・ ' + (v.turns | 0) + '手番 ・ 始めて' + secs + '秒 ・ ' + how +
    ' ・ ' + (v.me || []).join('/') + ' vs ' + (v.opp || []).join('/') +
    (v.what ? ' ・ 最後: ' + v.what + (v.info ? ' (' + v.info + ')' : '') : '');
  reportError('対戦が途中で終わった: ' + text, 'crashwatch');
  /* Discord に貼る情報 (support.js) にも出す */
  try { localStorage.setItem('compileLastCrash', new Date(v.last || v.at).toLocaleString('ja-JP') + ' ・ ' + text); } catch (e) { /* private mode */ }
  return v;
}

/* 閉じた・裏に回ったを印に残す (落ちたときはどちらも起きない) */
window.addEventListener('pagehide', () => { const v = read(); if (v) write({ ...v, closed: true }); });
document.addEventListener('visibilitychange', () => {
  const v = read();
  if (v) write({ ...v, hidden: document.visibilityState === 'hidden' ? true : v.hidden });
});
