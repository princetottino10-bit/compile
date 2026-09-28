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
  zundamon: { base: 3, happy: 1, angry: 7, sad: 76 },   // ノーマル / あまあま / ツンツン / なみだめ
  metan: { base: 2, happy: 0, angry: 6 },
  tsumugi: { base: 8, happy: 8, angry: 8 },
  whitecul: { base: 23, happy: 24, angry: 25 }      // ノーマル / たのしい / かなしい
};
const TONE = { compile: 'happy', win: 'happy', good: 'happy', hello: 'happy', chain: 'happy', control: 'happy', fav: 'happy', reach: 'happy', lead: 'happy', compiled: 'angry', hurt: 'angry', handes: 'angry', behind: 'angry' };
/* キャラごとの声色の差し替え (ずんだもんは、やられたときに怒るより泣く) */
const TONE_OF = { zundamon: { compiled: 'sad', hurt: 'sad', handes: 'sad', lose: 'sad', behind: 'sad' } };

/* VOICEVOX が読み間違える言葉は、声にするときだけかなに直す (画面の文はそのまま)。
   見つけ方: audio_query の kana を並べて見る (勝った → マサッタ、手札 → シュサツ などがあった) */
export const READING = [['勝った', 'かった'], ['勝ち', 'かち'], ['手札', 'てふだ'], ['積み上がって', 'つみあがって']];
export const fixReading = (t) => READING.reduce((s, [a, b]) => s.split(a).join(b), t);

async function synth(text, speaker) {
  text = fixReading(text);
  const q = await fetch(ENGINE + '/audio_query?speaker=' + speaker + '&text=' + encodeURIComponent(text), { method: 'POST' });
  if (!q.ok) throw new Error('audio_query ' + q.status);
  const query = await q.json();
  query.speedScale = 1.08;                   // 対戦の吹き出しに合わせて少し速め
  const r = await fetch(ENGINE + '/synthesis?speaker=' + speaker, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query)
  });
  if (!r.ok) throw new Error('synthesis ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(AVATARS).filter(id => AVATARS[id].voice);
const tmp = path.join(process.env.TEMP || '.', 'compile-voice.wav');
let n = 0;
for (const id of ids) {
  const def = AVATARS[id];
  const sp = SPEAKER[id];
  if (!def || !def.voice || !sp) { console.log('skip', id); continue; }
  const dir = path.join('art', 'voice', id);
  fs.mkdirSync(dir, { recursive: true });
  /* 並びが変わると番号がずれるので、前の声は消してから作り直す */
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.mp3')) fs.unlinkSync(path.join(dir, f));
  for (const [kind, list] of Object.entries(def.lines)) {
    for (let i = 0; i < list.length; i++) {
      const text = Array.isArray(list[i]) ? list[i][1] : list[i];
      const tone = (TONE_OF[id] && TONE_OF[id][kind]) || TONE[kind] || 'base';
      const speaker = sp[tone] ?? sp.base;
      fs.writeFileSync(tmp, await synth(text, speaker));
      const out = path.join(dir, kind + '_' + i + '.mp3');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-b:a', '64k', out]);
      n++;
    }
  }
  console.log(id, 'ok');
}
console.log(n, '本');
