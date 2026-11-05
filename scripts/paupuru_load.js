'use strict';
/*
 * ぱうぷるの棋譜 (サーバーの collected_replays を短い書式で書き出したもの) を読む。
 * 1行1局: 番号|mode|kind|level|cpuName|win|init (' を " に)|手 (空白区切り)
 *   kind の末尾の @1 は、ぱうぷるが P2 (p1) 側だった対局 (オンラインのゲスト)。無ければ P1 (p0)
 *   P のカードを出す: p0:FIRE_4@1u (u 表 / d 裏)、リフレッシュ: R、選択: q1=a,b (数字は数に)、戻る: Bq1、投了: S0
 * 使い方: const { loadGames } = require('./paupuru_load.js'); loadGames('_paupuru')
 */
const fs = require('node:fs');
const path = require('node:path');

function parseAction(tok) {
  if (tok === 'R') return { type: 'refresh' };
  if (/^S\d$/.test(tok)) return { type: 'surrender', player: +tok[1] };
  if (/^Bq\d+$/.test(tok)) return { type: 'back', id: tok.slice(1) };
  let m = /^(q\d+)=(.*)$/.exec(tok);
  if (m) {
    const picks = m[2] === '' ? [] : m[2].split(',').map(s => (/^-?\d+$/.test(s) ? +s : s));
    return { type: 'choose', id: m[1], picks };
  }
  m = /^(p[01]:[^@]+)@(\d)([ud])$/.exec(tok);
  if (m) return { type: 'play', card: m[1], line: +m[2], faceUp: m[3] === 'u' };
  throw new Error('読めない手: ' + tok);
}

function parseLine(line) {
  const f = line.split('|');
  /* 選択の答えに "p0:SPEED_4|1|u" のような | 入りの文字列があるので、手の欄は 7 番目以降をつなぎ直す */
  const [n, mode, kind, level, cpuName, win, initTxt] = f;
  const acts = f.slice(7).join('|');
  const init = JSON.parse(initTxt.replace(/'/g, '"'));
  const side = /@1$/.test(kind) ? 1 : 0;
  return { n: +n, mode, kind: kind.replace(/@\d$/, '') || null, side, level: +level, cpuName, win: win === 'true', init,
    actions: acts.trim() ? acts.trim().split(/\s+/).map(parseAction) : [] };
}

function loadGames(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter(f => /^raw_\d+\.txt$/.test(f)).sort()) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) if (line.trim()) out.push(parseLine(line));
  }
  return out.sort((a, b) => a.n - b.n);
}

module.exports = { loadGames, parseLine, parseAction };
