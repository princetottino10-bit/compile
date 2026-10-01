/* =========================================================================
 * 不具合・要望の窓口 (Discord) と、報告に貼る情報のコピー
 *   Discord に書いてもらうとき、端末や版を聞き返さずに済むように、分かることをまとめて渡す。
 *   ここは通信しない (クリップボードに入れるだけ)
 * ========================================================================= */
import { versionOf, deviceOf } from './errorreport.js';

export const DISCORD_URL = 'https://discord.gg/Xtf4PmxE7f';

const LIVE_KEY = 'compileLiveGame';          // crashwatch.js: いま遊んでいる対戦
const CRASH_KEY = 'compileLastCrash';        // crashwatch.js: 前に途中で終わった対戦 (報告した文)

const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const readText = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };

/** 報告に貼る文 (個人の情報は入れない: 端末の種類・版・画面・対戦の様子だけ) */
export function reportInfo(now = new Date()) {
  const lines = [
    '【報告用の情報】',
    '版: ' + (versionOf() || '?'),
    '端末: ' + deviceOf() + ' ・ 画面 ' + window.innerWidth + 'x' + window.innerHeight,
    '開いている画面: ' + (location.search ? location.search.slice(1, 80) : 'タイトル'),
    '時刻: ' + now.toLocaleString('ja-JP')
  ];
  const live = readJSON(LIVE_KEY);
  if (live) lines.push('対戦中: ' + live.mode + ' ・ ' + (live.turns | 0) + '手番 ・ ' + (live.me || []).join('/') + ' vs ' + (live.opp || []).join('/') +
    (live.what ? ' ・ 最後: ' + live.what : ''));
  const crash = readText(CRASH_KEY);
  if (crash) lines.push('前に途中で終わった対戦: ' + crash);
  return lines.join('\n');
}

/** 情報をコピーする。できなければ選べる形で出す。結果の文を返す (トーストに使う) */
export async function copyReportInfo() {
  const text = reportInfo();
  try {
    await navigator.clipboard.writeText(text);
    return 'コピーしました。Discord の #不具合 に貼ってください';
  } catch (e) {
    window.prompt('この文をコピーして、Discord に貼ってください', text);
    return '';
  }
}

export function openDiscord() {
  window.open(DISCORD_URL, '_blank', 'noopener');
}
