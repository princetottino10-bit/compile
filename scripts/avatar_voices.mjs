/* 対戦キャラのうち声つき (VOICEVOX のキャラ) のセリフを、手元の VOICEVOX で声にして art/voice/<id>/<種類>_<番号>.mp3 に書く。
 *   node scripts/avatar_voices.mjs [id ...]
 * VOICEVOX のエンジン (E:\AI-Pipeline\tools\VOICEVOX\windows-cpu\run.exe) を先に起動しておく (http://127.0.0.1:50021)。
 * セリフは js3d/avatar-lines.js (AVATARS[id].lines。声で言う文は [画面の文, 声の文] の2つ目)。ffmpeg で mp3 (64kbps・モノラル) にする。
 * 声を出すときは、そのキャラのクレジット (例: VOICEVOX:ずんだもん) を画面のどこかに載せること */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AVATARS } from '../js3d/avatar.js';

const ENGINE = 'http://127.0.0.1:50021';
/* キャラごとの声 (VOICEVOX の speaker id)。種類によって声色を変える */
const SPEAKER = {
  zundamon: { base: 3, happy: 1, angry: 7, sad: 76, whisper: 22, hiso: 38, tired: 75 },   // ノーマル / あまあま / ツンツン / なみだめ / ささやき / ヒソヒソ / ヘロヘロ
  metan: { base: 2, happy: 0, angry: 6, whisper: 36, hiso: 37 },                           // ノーマル / あまあま / ツンツン / ささやき / ヒソヒソ
  tsumugi: { base: 8, happy: 8, angry: 8 },
  whitecul: { base: 23, happy: 24, angry: 25, sad: 25, cry: 26 }      // ノーマル / たのしい / かなしい / びえーん
};
/* セリフごとの演技指導 (scripts/voice_directions/<id>.json。{声の文: { style, speed, pitch, intonation }})。
   場面の種類で一律に決めず、セリフの中身に合わせて決めたもの (2026-10-04)。無いセリフは下の TONE で決める */
const directionsOf = (id) => {
  const p = path.join('scripts', 'voice_directions', id + '.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
};
const TONE = { compile: 'happy', win: 'happy', good: 'happy', hello: 'happy', chain: 'happy', control: 'happy', fav: 'happy', reach: 'happy', lead: 'happy', recompile: 'happy', sure: 'happy', doomed: 'angry', compiled: 'angry', hurt: 'angry', handes: 'angry', behind: 'angry', crushed: 'angry' };
/* キャラごとの声色の差し替え (ずんだもんは、やられたときに怒るより泣く) */
const TONE_OF = { zundamon: { compiled: 'sad', hurt: 'sad', handes: 'sad', lose: 'sad', behind: 'sad', crushed: 'sad', doomed: 'sad' } };

import { fixReading } from './voice_fix.mjs';

/* ずんだもんは「あまあま」だと元気がなく聞こえた (2026-10-04)。ふつう・明るいセリフはノーマルの声で、
   基本は抑揚強め (B)、気合いの入ったセリフ (「！」で盛り上がる場面) はさらに元気に (C)。泣く・怒るの声色はそのまま */
const ZUN_VOICE = { base: { speed: 1.1, intonation: 1.35 }, hype: { speed: 1.15, intonation: 1.5, pitch: 0.04 } };
const BRIGHT = { zundamon: { base: 3, happy: 3 }, metan: { base: 2, happy: 2 }, tsumugi: { base: 8, happy: 8 }, whitecul: { base: 23, happy: 24 } };
const ZUN_HYPE_KINDS = new Set(['compile', 'win', 'chain', 'reach', 'fav', 'ace', 'sure', 'recompile', 'lead', 'boost', 'control', 'good', 'wipe', 'tag_in']);
const zunHype = (kind, text, d) => /！/.test(text) && (ZUN_HYPE_KINDS.has(kind) || /^own_/.test(kind) || d.style === 'happy' || (d.intonation || 0) >= 1.3);

/* エンジンがたまに接続を落とす (fetch failed)。少し待って3回まで試す */
async function synth(text, speaker, d = {}) {
  for (let n = 1; ; n++) {
    try { return await synthOnce(text, speaker, d); } catch (e) {
      if (n >= 3) throw e;
      await new Promise(r => setTimeout(r, 1500 * n));
    }
  }
}
async function synthOnce(text, speaker, d) {
  text = fixReading(text);
  const q = await fetch(ENGINE + '/audio_query?speaker=' + speaker + '&text=' + encodeURIComponent(text), { method: 'POST' });
  if (!q.ok) throw new Error('audio_query ' + q.status);
  const query = await q.json();
  query.speedScale = d.speed ?? 1.08;        // 対戦の吹き出しに合わせて少し速め
  if (d.pitch !== undefined) query.pitchScale = d.pitch;
  if (d.intonation !== undefined) query.intonationScale = d.intonation;
  const r = await fetch(ENGINE + '/synthesis?speaker=' + speaker, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query)
  });
  if (!r.ok) throw new Error('synthesis ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

/* 何も指定しなければ VOICEVOX の4人だけ (紫苑たちの声は ElevenLabs で作る: scripts/voice_lines.py。ここで作ると上書きしてしまう) */
/* --missing: いまある声は消さず、足りない分だけ作る (セリフを末尾に足したとき用。並びを変えたときは付けずに全部作り直す) */
const onlyMissing = process.argv.includes('--missing');
const named = process.argv.slice(2).filter(a => !a.startsWith('--'));
const ids = named.length ? named : Object.keys(SPEAKER);
const tmp = path.join(process.env.TEMP || '.', 'compile-voice.wav');
let n = 0;
for (const id of ids) {
  const def = AVATARS[id];
  const sp = SPEAKER[id];
  if (!def || !def.voice || !sp) { console.log('skip', id); continue; }
  const direct = directionsOf(id);
  const dir = path.join('art', 'voice', id);
  fs.mkdirSync(dir, { recursive: true });
  /* 並びが変わると番号がずれるので、前の声は消してから作り直す */
  if (!onlyMissing) for (const f of fs.readdirSync(dir)) if (f.endsWith('.mp3')) fs.unlinkSync(path.join(dir, f));
  for (const [kind, list] of Object.entries(def.lines)) {
    for (let i = 0; i < list.length; i++) {
      const text = Array.isArray(list[i]) ? list[i][1] : list[i];
      const d = direct[text] || {};
      const tone = d.style || (TONE_OF[id] && TONE_OF[id][kind]) || TONE[kind] || 'base';
      if (d.style && sp[d.style] === undefined) console.log('  声色が無い', id, d.style, '→ ふつうの声で', text);
      let speaker = sp[tone] ?? sp.base;
      let dd = d;
      /* ずんだもん・めたん・つむぎ・WhiteCUL のふつう・明るいセリフ: 基本は抑揚強め、気合いの入ったセリフはさらに元気に。
         明るいセリフの声色は、ずんだもん・めたんはノーマル (「あまあま」だと元気がない)、WhiteCUL は「たのしい」 */
      if (BRIGHT[id] && (tone === 'base' || tone === 'happy')) {
        speaker = tone === 'happy' ? BRIGHT[id].happy : BRIGHT[id].base;
        dd = { ...d, ...(zunHype(kind, text, d) ? ZUN_VOICE.hype : ZUN_VOICE.base) };
      }
      const out = path.join(dir, kind + '_' + i + '.mp3');
      if (onlyMissing && fs.existsSync(out)) continue;
      fs.writeFileSync(tmp, await synth(text, speaker, dd));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-b:a', '64k', out]);
      n++;
    }
  }
  console.log(id, 'ok');
}
console.log(n, '本');
