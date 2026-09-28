/* 声つきキャラのセリフを VOICEVOX に読ませたときのカナを一覧にする (漢字の読み間違いを探す用)。
 *   node scripts/voice_readings.mjs [id ...] > readings.tsv
 * VOICEVOX のエンジン (http://127.0.0.1:50021) を先に起動しておく。
 * 出力: キャラ / 種類_番号 / 声にする文 (fixReading 後) / VOICEVOX の読み (カナ) */
import { AVATARS } from '../js3d/avatar.js';
import { fixReading } from './voice_fix.mjs';

const ENGINE = 'http://127.0.0.1:50021';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(AVATARS).filter(id => AVATARS[id].voice);
const kanji = /[一-鿿]/;
for (const id of ids) {
  for (const [kind, list] of Object.entries(AVATARS[id].lines)) {
    for (let i = 0; i < list.length; i++) {
      const text = fixReading(Array.isArray(list[i]) ? list[i][1] : list[i]);
      if (!kanji.test(text)) continue;        // かなだけの文は読み違えない
      const q = await fetch(ENGINE + '/audio_query?speaker=3&text=' + encodeURIComponent(text), { method: 'POST' });
      const query = await q.json();
      const kana = query.accent_phrases.map(p => p.moras.map(m => m.text).join('')).join(' ');
      console.log([id, kind + '_' + i, text, kana].join('\t'));
    }
  }
}
