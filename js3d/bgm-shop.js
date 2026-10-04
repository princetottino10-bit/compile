/* =========================================================================
 * BGM の一覧 (COLLECTION の BGM で、メニューの曲・対戦の曲を選ぶ)
 *   free: はじめから選べる (いま流している曲)。それ以外は CHIP で交換 (持っているかはガチャの帳簿 'track:<key>')。
 *   試し聴きは頭の15秒だけ (OpenTracks は「ゲーム内の音楽鑑賞機能」を通常の許可の外としているので、
 *   曲を選ぶための短い試し聴きにとどめる。2026-10-04 に本人と決めた)。
 *   credit: 曲が流れている画面にも出す (煉獄庭園・魔王魂・Senses Circuit は表記が必要。ほかも出しておく)
 *   曲を足したら: art/bgm/<key>.m4a (96kbps の aac)、bgm.js の LOUDNESS に大きさ、settings.js のクレジット
 * ========================================================================= */
import { loadGacha, buyItem } from './gacha.js';

export const TRACK_PRICE = 300;               // ガチャ20回分

/* [key, 曲名, 作者・出どころ, 表記, free] */
const ROWS = [
  /* はじめから選べる (いま流している曲) */
  ['cho_zunou', '超頭脳バトル', 'Yuyake Monster (OpenTracks)', '', true],
  ['reflect', 'Reflect', 'まんぼう二等兵 (OpenTracks)', '', true],
  ['kaidoku', '解読', '田中芳典 (OpenTracks)', '', true],
  ['crescendo_jitter', 'Crescendo Jitter', 'まんぼう二等兵 (OpenTracks)', '', true],
  ['planetarium', 'プラネタリウムガーデン', 'まんぼう二等兵 (OpenTracks)', '', true],
  ['madoromu_neon', 'まどろむネオンの部屋', 'NEKOZOU (OpenTracks)', '', true],
  ['nine_jack', 'Nine Jack', 'まんぼう二等兵 (OpenTracks)', '', true],
  ['iruka', '沈殿するイルカ', 'まんぼう二等兵 (OpenTracks)', '', true],
  ['zero', 'Z･E･R･O', '煉獄庭園', 'BGM 煉獄庭園', true],
  ['samayoi', '彷徨いの言葉は天に導かれ', '煉獄庭園', 'BGM 煉獄庭園', true],
  /* CHIP で交換 (2026-10-04 に足した) */
  ['noesis', 'Noesis', 'まんぼう二等兵 (OpenTracks)', '', false],
  ['sagittarius', 'Sagittarius', 'まんぼう二等兵 (OpenTracks)', '', false],
  ['engram', 'ENGRAM', 'まんぼう二等兵 (OpenTracks)', '', false],
  ['objective_point', 'Objective Point', 'まんぼう二等兵 (OpenTracks)', '', false],
  ['virus_entry', 'Virus Entry', 'まんぼう二等兵 (OpenTracks)', '', false],
  ['uso_ni_naru', '私の全てが嘘になる', 'のる (OpenTracks)', '', false],
  ['siege_buster', 'Siege Buster', 'POLARIS PLUS (OpenTracks)', '', false],
  ['electric_highway', 'Electric Highway', 'チョコミント (OpenTracks)', '', false],
  ['grenade', 'Grenade', 'shimtone (OpenTracks)', '', false],
  ['midnight_breaker', 'ミッドナイトブレイカー', "K'z Art Storage (OpenTracks)", '', false],
  ['rapid4', 'Rapid4', 'PeriTune', 'BGM PeriTune', false],
  ['irregular', 'Irregular', 'PeriTune', 'BGM PeriTune', false],
  ['rapid5', 'Rapid5', 'PeriTune', 'BGM PeriTune', false],
  ['under_world', 'サイバー39「Under World」', '魔王魂', '音楽：魔王魂', false],
  ['cyber10', 'サイバー10', '魔王魂', '音楽：魔王魂', false],
  ['cyber_prisoner', 'Cyber Prisoner', 'hitoshi (Senses Circuit)', 'BGM：hitoshi by Senses Circuit', false]
];
export const TRACKS = ROWS.map(([key, title, by, credit, free]) => ({ key, title, by, credit, free }));
export const trackOf = (key) => TRACKS.find(t => t.key === key) || null;
export const isTrack = (key) => !!trackOf(key);

export function ownsTrack(key, st = loadGacha()) {
  const t = trackOf(key);
  return !!t && (t.free || !!st.owned['track:' + key]);
}
export const trackPrice = (key) => { const t = trackOf(key); return t && !t.free ? TRACK_PRICE : 0; };
/** 交換する (CHIP が足りない・もう持っていれば false) */
export const buyTrack = (key, earned) => !!trackPrice(key) && buyItem('track', key, TRACK_PRICE, earned);

/** 設定で選んだ曲 (slot: 'bgmMenu' / 'bgmBattle')。おまかせ・持っていない曲なら null */
export function chosenTrack(settings, slot) {
  const k = settings && settings[slot];
  return k && ownsTrack(k) ? k : null;
}
