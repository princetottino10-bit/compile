/* =========================================================================
 * BGM (煉獄庭園の曲。art/bgm/<key>.mp3、96kbps に縮めたもの)
 *   タイトル・メニューは MENU_BGMS から、対戦は NORMAL_BGMS / 強敵 / ボスの曲 (COLLECTION の BGM を出したら選んだ曲)。
 *   音量は設定の「BGM」(bgmVol、0 でオフ)。🔇 で効果音と一緒に止まる。キャラが喋る間は小さくする (duckBgm)。
 *   iPhone は <audio> の volume が効かないので、audio.js の Web Audio のゲインを通す。
 *   ブラウザの自動再生の制限で鳴らせなかったときは、次に画面に触れたときに鳴らし直す
 *   クレジット (必須): 煉獄庭園 (設定の画面と COLLECTION の BGM に出す)
 * ========================================================================= */
import { routeMedia, isMuted, initAudio, onMuteChange, kickAudio, audioOut } from './audio.js';
import { settings, onSettings } from './settings.js';
import { BGM_RELEASED, COSMETICS } from './rewards.js';
import { LoopPlayer } from './bgm-loop.js';
import { isTrack, chosenTrack, TRACKS, ownsTrack, trackOf } from './bgm-shop.js';

export const TITLE_BGM = 'orange_tunnel';
export const BGM_CREDIT = '煉獄庭園';
/* 対戦で流す曲 (COLLECTION で選ぶ仕組み BGM_RELEASED とは別)。2026-09-28: ボスは「彷徨いの言葉は天に導かれ」、
   強敵は Z･E･R･O。タイトルは無音 */
export const BATTLE_BGM_ON = true;
/* ふつうの対戦のいつもの13曲 (2026-10-15 からおまかせはシャッフルで、持っている曲すべてから選ぶ。この13曲は鳴らせる曲の印と、iPhone の下準備に使う): OpenTracks (旧 DOVA-SYNDROME) (2026-10-13 に、まんぼう二等兵の BPM 135〜165 の8曲を足した。2026-11-01 に本人が Musio Studio で作った Iron Meridian (176 BPM) と Protocol Drive (154 BPM) を足した。
   あと1本の曲 TENSE_BGMS より遅くして、切り替わったときの差を残す)。
   OpenTracks の規約 (ファイルのまま取り出せる形で置かない) に合わせて m4a に変換して置いている */
export const NORMAL_BGMS = ['cho_zunou', 'reflect', 'kaidoku', 'crescendo_jitter', 'switcheroo', 'monolith_black', 'particle_tones', 'tsuisekisha', 'clock_jitter', 'joudou_catharsis', 'blaze_a_trail', 'killer_roll', 'iron_meridian', 'protocol_drive',
  'handshake', 'cold_boot', 'odd_protocol', 'kernel_march'];   // 本人作 (2026-11-04): Handshake・Cold Boot・Odd Protocol (7/8)・Kernel March
/* 強敵の曲: 本人作の Overclock (2026-11-01 に Z･E･R･O から替えた。Z･E･R･O は COLLECTION でいまも選べる) */
export const STRONG_BGM = 'overclock';
/* タイトル・メニュー (対戦以外) の落ち着いた4曲。2026-10-15 からおまかせはシャッフルになったので、選ぶのには使っていない (鳴らせる曲の印) */
export const MENU_BGMS = ['planetarium', 'madoromu_neon', 'nine_jack', 'kidou', 'circuit_red', 'far_shore'];
/* Main 3 に合わせて足した本人作の曲 (2026-11-04)。Bot Routine: 公式ソロモード (BOT) の対戦。Third Gate: 勝ち抜き戦のボスと
   週替わり3連戦の3戦目 (前は彷徨いの言葉は天に導かれ)。Circuit Red・Far Shore: メニューのシャッフル (COLLECTION の BGM にも) */
export const BOT_BGM = 'bot_routine';
export const GATE_BGM = 'third_gate';
/* 勝ち抜き戦のボスごとの曲 (本人作、2026-11-04)。キーは run.js の BOSSES / FINAL_BOSS の id。
   GATEKEEPER は CHALLENGE の「最強」でも流す。週替わりの3戦目は Third Gate のまま */
export const BOSS_THEMES = { inferno: 'boss_inferno', abyss: 'boss_abyss', clock: 'boss_clock', mirror: 'boss_mirror',
  sanctuary: 'boss_sanctuary', glacier: 'boss_glacier', strongest: 'boss_gatekeeper' };
/* 4人のテーマ曲 (本人作、2026-11-04)。キーは avatar.js の id。本気の4人 (CHALLENGE) ではその子の曲、
   ふつうの CPU 戦でその子が相手なら THEME_RATE の確率で (おまかせのときだけ) */
export const CHAR_THEMES = { shion: 'theme_shion', nadeshiko: 'theme_akane', asagi: 'theme_ruri', yamabuki: 'theme_anzu',
  zundamon: 'theme_zundamon', metan: 'theme_metan', tsumugi: 'theme_tsumugi', whitecul: 'theme_whitecul' };   // ゲスト4人 (2026-11-04)
export const THEME_RATE = 0.3;
/* 本人が Musio Studio で作った曲 (2026-11-01)。依頼書は project-files の bgm-requests/song-requests-2026-11-01.md。
   起動: メニューのシャッフルに入れる (COLLECTION の BGM にも)。判定: ストーリーの機体戦 (boss の付いた対戦)。止めていい: 終章の所長との最後の判定 (前の2戦は判定)。
   2026-11-01 の2回目に3曲とも作り直した版へ差し替え、対戦の3曲 (Protocol Drive: ふつうの対戦 / Last Compile: あと1本 / Overclock: 強敵) を足した。
   依頼書は bgm-requests/battle-song-requests-2026-11-01.md */
export const STORY_BATTLE_BGM = 'hantei';
export const DIRECTOR_BGM = 'halt_shocho';
/* つなぎ目なしで繰り返す曲と、その長さ (秒。元の WAV のサンプル数から)。末尾の余韻を冒頭に重ねたループ素材なので、
   <audio loop> の一瞬の途切れを避けて Web Audio で鳴らす (bgm-loop.js) */
const LOOP_SECONDS = { kidou: 4712727 / 48000, hantei: 5501538 / 48000, halt_shocho: 128,
  protocol_drive: 8078961 / 48000, last_compile: 3789474 / 48000, overclock: 6020000 / 48000,
  /* 2026-11-04 に足した12曲 */
  bot_routine: 7920000 / 48000, third_gate: 7488000 / 48000, circuit_red: 6240000 / 48000, last_line: 5120000 / 48000,
  last_signal: 4822326 / 48000, deadlock: 5068800 / 48000, handshake: 7783784 / 48000, cold_boot: 7346087 / 48000,
  far_shore: 5376000 / 48000, odd_protocol: 4803158 / 48000, kernel_march: 5934545 / 48000, zero_margin: 4411915 / 48000,
  /* 4人のテーマとボスの曲 (2026-11-04) */
  theme_shion: 4237714 / 48000, theme_akane: 4114286 / 48000, theme_ruri: 4369655 / 48000, theme_anzu: 3840000 / 48000,
  theme_zundamon: 4114286 / 48000, theme_metan: 4538182 / 48000, theme_tsumugi: 3927273 / 48000, theme_whitecul: 5280000 / 48000,
  boss_inferno: 4320000 / 48000, boss_abyss: 5068800 / 48000, boss_clock: 4224000 / 48000, boss_mirror: 3993600 / 48000,
  boss_sanctuary: 4320000 / 48000, boss_glacier: 3756522 / 48000, boss_gatekeeper: 3793171 / 48000 };
/* ループ素材の m4a は、曲の前後にループの続きを 2048 サンプル (44.1kHz) ずつ付けて符号化してある (bgm-loop.js の pad)。
   作り方: WAV を3回つなげて 44.1kHz に直し、真ん中の1周とその前後 2048 サンプルを切り出して 96kbps の AAC に
   ffmpeg -stream_loop 2 -i <wav> -af "aresample=44100:resampler=soxr:precision=28,atrim=start_sample=<S-2048>:end_sample=<2S+2048>" -c:a aac -b:a 96k <key>.m4a
   (S = WAV のサンプル数 × 44100 / 48000 を丸めた値) */
const LOOP_PAD = 2048 / 44100;
/* 勝ち抜き戦 (RUN) の対戦以外の画面 (入口・地図・ショップ・休憩所など): 沈殿するイルカ */
export const RUN_BGM = 'iruka';
/* ストーリー (2026-10-23): 章の地図の曲と、会話の山場で替える曲。甘茶の音楽工房 (https://amachamusic.chagasi.com/) の曲。
   規約: ゲームの BGM として商用も可、曲だけの再配布は不可、表記は任意 (設定のクレジットに出す)。OpenTracks と同じく m4a に変換して置く */
export const STORY_BGMS = {
  ch0: 'genjitsunosukima',        // 序章 研究所 (夜): 現実の隙間
  ch1: 'mizunishizumupiano',      // 1章 水族館: 水に沈むピアノ
  ch2: 'janegreynoshouzou',       // 2章 屋敷: ジェーン・グレイの肖像
  ch3: 'rokugatsunoamaoto',       // 3章 倉庫: 6月の雨音
  ch4: 'kanatanikasumujoukisen',  // 4章 駅 (夕方): 彼方に霞む蒸気船
  ch5: 'elegyfourstrings2',       // 5章 研究所 (朝): エレジー・フォー・ストリングスⅡ
  ch6: 'inishienohiseki'          // 終章 所長室: 古の碑石
};
/* 会話の中で替える曲 (story.js の行の bgm / 場面の bgm に書く名前) */
export const STORY_SCENE_BGMS = ['gozennijinomunashisa', 'natsunokiri', 'sangatsunosundasora'];   // 午前2時の虚しさ・夏の霧・3月の澄んだ空
const STORY_TRACKS = [...Object.values(STORY_BGMS), ...STORY_SCENE_BGMS];
export const STORY_BGM_CREDIT = '甘茶の音楽工房';
/* 曲が替わったときに出す曲名と作者 (songInfo)。COLLECTION の一覧 (bgm-shop.js) に無い曲だけここに書く */
const OPENTRACKS_MANBOU = 'まんぼう二等兵 (OpenTracks)';
const EXTRA_SONGS = {
  /* あと1本の曲 (既製曲) */
  interception: ['Interception', OPENTRACKS_MANBOU], strike_despair: ['Strike the Despair', OPENTRACKS_MANBOU],
  lobelia: ['ロベリア', OPENTRACKS_MANBOU], will_you_cry: ['Will you still cry?', OPENTRACKS_MANBOU],
  tactical_encounter: ['タクティカルエンカウンター', OPENTRACKS_MANBOU], hangeki: ['反撃の一矢', OPENTRACKS_MANBOU],
  /* ストーリーの曲 */
  genjitsunosukima: ['現実の隙間'], mizunishizumupiano: ['水に沈むピアノ'], janegreynoshouzou: ['ジェーン・グレイの肖像'],
  rokugatsunoamaoto: ['6月の雨音'], kanatanikasumujoukisen: ['彼方に霞む蒸気船'], elegyfourstrings2: ['エレジー・フォー・ストリングスⅡ'],
  inishienohiseki: ['古の碑石'], gozennijinomunashisa: ['午前2時の虚しさ'], natsunokiri: ['夏の霧'], sangatsunosundasora: ['3月の澄んだ空']
};
for (const k of STORY_TRACKS) if (EXTRA_SONGS[k]) EXTRA_SONGS[k][1] = STORY_BGM_CREDIT;
/** 曲名と作者: { title, by, own }。by は表記の要る曲なら表記 (「BGM 煉獄庭園」など)、own は本人 (Ryunosuke) が作った曲。知らない曲は null */
export function songInfo(key) {
  const t = trackOf(key);
  if (t) return { title: t.title, by: t.credit || t.by, own: t.by === OWN_COMPOSER };
  const x = EXTRA_SONGS[key];
  if (x) return { title: x[0], by: x[1], own: false };
  const r = COSMETICS.bgm.find(([k]) => k === key);   // 煉獄庭園の曲 (mp3)
  if (r) return { title: r[1], by: 'BGM ' + BGM_CREDIT, own: false };
  return null;
}
export const OWN_COMPOSER = 'Ryunosuke';
/** ストーリーの対戦の曲: 場面に battleBgm があればそれ (終章の所長戦)、boss の付いた対戦 (機体戦) は判定。ほかは null (ふつうの対戦の曲) */
export const storyBattleBgm = (node) => (node && node.battleBgm) || (node && node.boss ? STORY_BATTLE_BGM : null);
/** その章の地図の曲 */
export const storyBgm = (chapterId) => STORY_BGMS[chapterId] || STORY_BGMS.ch0;
/* COLLECTION の BGM で「メニューで流す」を選んでいればその曲、おまかせならシャッフル */
export const menuBgm = () => chosenTrack(settings(), 'bgmMenu') || shuffleMenuBgm();
/** ふつうの対戦の曲: 「対戦で流す」を選んでいればその曲、おまかせならシャッフル (持っている曲から無作為に。1曲ごとに替える) */
export const normalBattleBgm = () => chosenTrack(settings(), 'bgmBattle') || shuffleBattleBgm();
/* オンライン対戦の曲: 選んだ曲に決めず、いつもシャッフル (同じ曲ばかり流れないように) */
export function onlineBattleBgm() {
  shuffleCtx = 'online';
  return (shuffled = pickShuffleBgm(Math.random, battlePool()));
}
export const BOSS_BGM = 'samayoi';
/* 機械仕掛けの神 (CHALLENGE の CODE:PURPLE) の曲 */
export const DEUS_BGM = 'destroy_god';
/* すべてを見る者 (ALL-SEEING) の曲 */
export const PEEK_BGM = 'final_2sec';
/* どちらかが勝ちまであと1本になったら (ふつうの3本勝負なら2本目のコンパイルのあと) 切り替える曲。
   まんぼう二等兵 (OpenTracks) の速くて緊張感のある6曲 (BPM 162〜216。ふつうの対戦の曲は 140〜170) から、試合ごとにランダム */
export const TENSE_BGMS = ['interception', 'strike_despair', 'lobelia', 'will_you_cry', 'tactical_encounter', 'hangeki',
  'last_compile',    // 本人作の Last Compile (190 BPM、2026-11-01)
  'last_line', 'last_signal', 'deadlock', 'zero_margin'];   // 本人作 (2026-11-04): 180・172・200・188 BPM
/* 本人作の曲は合わせて半分の確率で選ぶ (7曲で同じ重みだと7試合に1回しか流れない。本人の専用曲を「あと1本」の合図にする。2026-11-03) */
export const OWN_TENSE_BGMS = ['last_compile', 'last_line', 'last_signal', 'deadlock', 'zero_margin'];
const OWN_TENSE_RATE = 0.5;
/** あと1本の曲を1つ選ぶ。avoid (いま流している曲) は選ばない。前の試合と同じ既製曲も選ばない
    (本人作は前の試合と同じでも選ぶ: 合図の曲なので続いてよい) */
const LAST_TENSE_KEY = 'compileLastTenseBgm';
export function pickTenseBgm(rnd = Math.random, avoid = null) {
  let last = null;
  try { last = localStorage.getItem(LAST_TENSE_KEY); } catch (e) { /* private mode */ }
  const own = OWN_TENSE_BGMS.filter(k => k !== avoid);
  let others = TENSE_BGMS.filter(k => !OWN_TENSE_BGMS.includes(k) && k !== last && k !== avoid);
  if (!others.length) others = TENSE_BGMS.filter(k => !OWN_TENSE_BGMS.includes(k) && k !== avoid);
  const pick = own.length && rnd() < OWN_TENSE_RATE ? own[Math.floor(rnd() * own.length)] : others[Math.floor(rnd() * others.length)];
  try { localStorage.setItem(LAST_TENSE_KEY, pick); } catch (e) { /* private mode */ }
  return pick;
}
/* 曲のテンポ (BPM。2026-11-05 に測った)。対戦のシャッフルとテーマ曲は BATTLE_MIN_BPM 以上の曲だけ (本人「対戦で使う曲はある程度 BPM 欲しい」)。
   本人作は作曲の MIDI に書いた値 (正確)。ほかは音声解析 (librosa のオンセットの自己相関) で、倍・半分・3:2 の取り違えが出やすいので、
   候補のうち曲の感じに合う方を取った推定値 (~ は自信がない値)。曲を足したらここにも書く (test/bgm-shuffle.test.js が確かめる) */
export const BATTLE_MIN_BPM = 120;
export const BPM = {
  /* 本人作 (MIDI の値) */
  iron_meridian: 176, protocol_drive: 154, overclock: 144, last_compile: 190, hantei: 156, halt_shocho: 120, kidou: 88,
  bot_routine: 128, third_gate: 160, circuit_red: 96, far_shore: 90, handshake: 148, cold_boot: 138, odd_protocol: 152, kernel_march: 132,
  last_line: 180, last_signal: 172, deadlock: 200, zero_margin: 188,
  theme_shion: 140, theme_akane: 168, theme_ruri: 116, theme_anzu: 156, theme_zundamon: 168, theme_metan: 132, theme_tsumugi: 176, theme_whitecul: 96,
  boss_inferno: 160, boss_abyss: 100, boss_clock: 150, boss_mirror: 150, boss_sanctuary: 128, boss_glacier: 138, boss_gatekeeper: 164,
  /* 既製の曲 (推定) */
  cho_zunou: 129, reflect: 172, kaidoku: 161, crescendo_jitter: 140, zero: 192,
  samayoi: 100,   // ~ (倍の 199 も出る。ボスの曲 BOSS_BGM としてはそのまま。シャッフルからは外す)
  switcheroo: 145, monolith_black: 136, particle_tones: 165, tsuisekisha: 140, clock_jitter: 144, joudou_catharsis: 148, blaze_a_trail: 144, killer_roll: 140,
  interception: 215, strike_despair: 199, lobelia: 199, will_you_cry: 178, tactical_encounter: 172, hangeki: 161,
  noesis: 91, sagittarius: 148, engram: 152, objective_point: 144, virus_entry: 156, uso_ni_naru: 88, siege_buster: 129, electric_highway: 157,
  grenade: 152, midnight_breaker: 144, rapid4: 180, irregular: 166, rapid5: 144, under_world: 136, cyber10: 160, cyber_prisoner: 148,
  destroy_god: 148, final_2sec: 120,
  /* メニュー・勝ち抜き戦の画面の曲 (落ち着いた曲として選んだもの。解析では倍の値も出るが、聞いた感じは遅い方) */
  planetarium: 80, madoromu_neon: 70, nine_jack: 92, iruka: 85
};
/** 対戦で流してよい速さの曲か (BPM の分からない曲は通す) */
export const fastEnough = (key) => !!key && (BPM[key] ?? BATTLE_MIN_BPM) >= BATTLE_MIN_BPM;
/** 対戦のシャッフルで選ぶ曲: 持っている曲のうち、メニュー・勝ち抜き戦の画面の曲と遅い曲を除いたもの
    (外した曲はメニューのシャッフルには残る。COLLECTION で「対戦で流す」に選べば対戦でも流れる) */
export const battlePool = () => shufflePool().filter(k => !MENU_BGMS.includes(k) && k !== RUN_BGM && fastEnough(k));
/* 曲のファイル (無ければ <key>.mp3) */
const FILES = { ...Object.fromEntries(STORY_TRACKS.map(k => [k, k + '.m4a'])), cho_zunou: 'cho_zunou.m4a', reflect: 'reflect.m4a', kaidoku: 'kaidoku.m4a', crescendo_jitter: 'crescendo_jitter.m4a',
  planetarium: 'planetarium.m4a', madoromu_neon: 'madoromu_neon.m4a', nine_jack: 'nine_jack.m4a', iruka: 'iruka.m4a',
  /* COLLECTION の BGM で交換する曲 (bgm-shop.js) */
  ...Object.fromEntries(['noesis', 'sagittarius', 'engram', 'objective_point', 'virus_entry', 'uso_ni_naru', 'siege_buster', 'electric_highway', 'grenade',
    'midnight_breaker', 'rapid4', 'irregular', 'rapid5', 'under_world', 'cyber10', 'cyber_prisoner'].map(k => [k, k + '.m4a'])),
  /* 本人が Musio Studio で作った曲 */
  ...Object.fromEntries(Object.keys(LOOP_SECONDS).map(k => [k, k + '.m4a'])),
  /* 作り直した版 (2026-11-01 の2回目)。前の版と名前を変え、端末に残った前の版 (前後のつなぎが無い) を読まないように */
  kidou: 'kidou_v2.m4a', hantei: 'hantei_v2.m4a', halt_shocho: 'halt_shocho_v2.m4a',
  /* ふつうの対戦に足した曲と、あと1本の曲 */
  ...Object.fromEntries(['switcheroo', 'monolith_black', 'particle_tones', 'tsuisekisha', 'clock_jitter', 'joudou_catharsis', 'blaze_a_trail', 'killer_roll', 'interception', 'strike_despair', 'lobelia', 'will_you_cry', 'tactical_encounter', 'hangeki'].map(k => [k, k + '.m4a'])),
  /* 本人が Musio Studio で作った曲 (2026-11-01) */
  iron_meridian: 'iron_meridian.m4a' };
export const bgmFile = (key) => 'art/bgm/' + (FILES[key] || key + '.mp3');
/* 曲ごとの大きさ (ラウドネス、LUFS。ffmpeg の ebur128 で測った値)。曲によって 10 dB 近く違ったので、
   鳴らすときに LOUD_TARGET へそろえる (大きい曲は下げ、小さい曲は少しだけ上げる)。曲を足したら測って書き足す:
   ffmpeg -i art/bgm/<曲> -af ebur128=framelog=quiet -f null -   (最後の I: の値) */
const LOUDNESS = {
  a: -15.1, burst: -12.1, cho_zunou: -11.8, crazy_cat: -12.3, crescendo_jitter: -5.6, destroy_god: -6.6, final_2sec: -9.4,
  iruka: -6.6, junk_smash: -13.5, kaidoku: -14.5, kessen_asa: -8.8, madoromu_neon: -14.3, nine_jack: -7.6, orange_tunnel: -11.0,
  planetarium: -8.5, reaper_phoenix: -9.1, reflect: -7.9, samayoi: -8.9, zero: -13.4,
  noesis: -5.5, sagittarius: -6.9, engram: -6.1, objective_point: -7.1, virus_entry: -8.0, uso_ni_naru: -11.4, siege_buster: -7.0,
  electric_highway: -9.3, grenade: -7.8, midnight_breaker: -9.9, rapid4: -6.8, irregular: -8.3, rapid5: -8.2, under_world: -9.7, cyber10: -6.5, cyber_prisoner: -6.9,
  interception: -4.3, strike_despair: -6.5, lobelia: -5.6, will_you_cry: -6.2, tactical_encounter: -6.4, hangeki: -5.8,
  switcheroo: -6.2, monolith_black: -6.4, particle_tones: -5.6, tsuisekisha: -8.5, clock_jitter: -6.2, joudou_catharsis: -5.4, blaze_a_trail: -8.1, killer_roll: -6.4,
  iron_meridian: -12.1,   // 本人作
  /* 本人作の作り直し版と対戦の3曲 (2026-11-01 の2回目)。WAV の段階で -11 にそろえてある。起動だけ -14 (ピアノの立ち上がりを潰さないため)
     で、ここで +3 dB 上げて鳴らす (上げ幅の上限 1.6 倍 = +4 dB の内側なので、前の版のように WAV を上げてから変換しなくてよい) */
  kidou: -14.0, hantei: -11.1, halt_shocho: -11.2, protocol_drive: -11.1, last_compile: -11.0, overclock: -11.1,
  /* 2026-11-04 に足した本人作の12曲。メニューの2曲は -14 (静かな曲) */
  bot_routine: -11.0, third_gate: -11.1, circuit_red: -14.1, last_line: -11.0, last_signal: -11.0, deadlock: -11.1,
  handshake: -11.1, cold_boot: -11.1, far_shore: -14.0, odd_protocol: -11.0, kernel_march: -11.1, zero_margin: -11.0,
  theme_shion: -11.1, theme_akane: -11.1, theme_ruri: -11.0, theme_anzu: -11.1, theme_zundamon: -11.1, theme_metan: -11.1, theme_tsumugi: -11.1, theme_whitecul: -11.1, boss_inferno: -11.1, boss_abyss: -11.1,
  boss_clock: -11.1, boss_mirror: -11.1, boss_sanctuary: -11.1, boss_glacier: -11.1, boss_gatekeeper: -11.1,
  /* ストーリー (甘茶の音楽工房)。静かな曲が多く、上げられるのは 1.6 倍までなので、対戦の曲より少し小さく鳴る (会話の後ろに置く曲なのでそのまま) */
  genjitsunosukima: -19.3, mizunishizumupiano: -16.9, janegreynoshouzou: -14.2, rokugatsunoamaoto: -15.2, kanatanikasumujoukisen: -16.1,
  elegyfourstrings2: -14.3, inishienohiseki: -14.3, gozennijinomunashisa: -15.9, natsunokiri: -17.7, sangatsunosundasora: -17.4
};
const LOUD_TARGET = -11;              // 曲の真ん中あたり (全体の大きさは今までと同じくらいに)
/** その曲を LOUD_TARGET にそろえる倍率 (上げるのは 1.6 倍まで。測っていない曲は 1) */
export function trackGain(key) {
  const l = LOUDNESS[key];
  return l === undefined ? 1 : Math.min(1.6, Math.pow(10, (LOUD_TARGET - l) / 20));
}
/** ふつうの対戦の曲を1つ選ぶ。前の対戦と同じ曲は選ばない (ただのランダムだと、4曲でも同じ曲が続くことがよくある)。
    前の曲は端末に覚えておく (対戦はページを開き直して始まることがあるため) */
const LAST_KEY = 'compileLastBgm';
export function pickNormalBgm(rnd = Math.random, extra = []) {
  let last = null;
  try { last = localStorage.getItem(LAST_KEY); } catch (e) { /* private mode */ }
  const all = NORMAL_BGMS.concat(extra.filter(k => !NORMAL_BGMS.includes(k)));
  const pool = all.filter(k => k !== last);
  const from = pool.length ? pool : all;
  const pick = from[Math.floor(rnd() * from.length)];
  try { localStorage.setItem(LAST_KEY, pick); } catch (e) { /* private mode */ }
  return pick;
}

/* =========================================================================
 * シャッフル (COLLECTION の BGM で「おまかせ」のとき。2026-10-15 に本人の希望で)
 *   メニューとふつうの対戦 (オンラインはいつも) の曲を、持っている COLLECTION の曲 (はじめからの曲と交換した曲) から無作為に選び、
 *   1曲終わるたびに次の曲も無作為に選ぶ (繰り返さない)。
 *   ボス・強敵・機械仕掛けの神・すべてを見る者・あと1本の曲・勝ち抜き戦の画面の曲は、場面の曲なのでそのまま
 * ========================================================================= */
/** シャッフルで選ぶ曲 (持っている COLLECTION の曲) */
export const shufflePool = () => TRACKS.filter(t => ownsTrack(t.key)).map(t => t.key);
/* 最近流した曲 (同じ曲が近くに続かないよう、曲数の半分 (最大8曲) までは選ばない) */
const SHUFFLE_RECENT_KEY = 'compileShuffleRecent';
let shuffleRecent = null;
let shuffled = null;             // シャッフルで選んで流している曲 (終わったら次へ。ほかの曲を鳴らしたら null 扱い)
let shuffleCtx = null;           // 'menu' / 'battle' / 'online' (メニューへ戻ったら、対戦で流していた曲は続けない)
/** シャッフルで次の曲を1つ選ぶ (最近流した曲は避ける) */
export function pickShuffleBgm(rnd = Math.random, pool = shufflePool()) {
  if (!shuffleRecent) {
    try { shuffleRecent = JSON.parse(localStorage.getItem(SHUFFLE_RECENT_KEY) || '[]'); } catch (e) { shuffleRecent = []; }
    if (!Array.isArray(shuffleRecent)) shuffleRecent = [];
  }
  if (!pool.length) return null;
  const keep = Math.min(8, Math.floor(pool.length / 2));
  const recent = shuffleRecent.slice(-keep);
  const fresh = pool.filter(k => !recent.includes(k));
  const from = fresh.length ? fresh : pool;
  const pick = from[Math.floor(rnd() * from.length)];
  shuffleRecent = shuffleRecent.filter(k => k !== pick).concat(pick).slice(-8);
  try { localStorage.setItem(SHUFFLE_RECENT_KEY, JSON.stringify(shuffleRecent)); } catch (e) { /* private mode */ }
  return pick;
}
function shuffleMenuBgm() {
  /* メニューの間は、いま流れている曲を続ける (画面を移るたびに替えない。試し聴きのあともその曲へ戻す) */
  if (shuffleCtx === 'menu' && shuffled) return shuffled;
  shuffleCtx = 'menu';
  return (shuffled = pickShuffleBgm());
}
function shuffleBattleBgm() {
  shuffleCtx = 'battle';
  return (shuffled = pickShuffleBgm(Math.random, battlePool()));
}
/* シャッフルで流している曲か (この曲は繰り返さず、終わったら次の曲へ)。途中で曲を選んだら、その曲は繰り返す */
const shuffling = () => !!want && want === shuffled
  && (shuffleCtx === 'online' || !chosenTrack(settings(), shuffleCtx === 'menu' ? 'bgmMenu' : 'bgmBattle'));
function nextShuffle() {
  const next = pickShuffleBgm(Math.random, (shuffleCtx === 'menu' ? shufflePool() : battlePool()).filter(k => k !== want));
  if (!next) return;
  shuffled = next;
  playBgm(next);
  try { el.currentTime = 0; } catch (e) { /* 読み込み前 */ }
}

let el = null;                   // いま使っている再生器 (<audio> か LoopPlayer)
let route = null;
let audioEl = null, audioRoute = null;
let loopEl = null, loopRoute = null;
let want = null;                 // 鳴らしたい曲 (null なら止める)

/* 音量: 設定の「BGM」(はじめは 30。キャラの声が聞き取りやすいよう控えめに) */
const level = () => (isMuted() ? 0 : Math.max(0, Math.min(1, (settings().bgmVol ?? 30) / 100)) * 0.7 * (want ? trackGain(want) : 1));

function ensure() {
  if (audioEl) return;
  initAudio();                   // まだ触れていなくても作っておく (触れたときに再開する)
  audioEl = new Audio();
  audioEl.loop = true;
  audioEl.preload = 'auto';
  audioEl.addEventListener('ended', () => { if (shuffling()) nextShuffle(); });
  audioRoute = routeMedia(audioEl, level());
  if (!el) { el = audioEl; route = audioRoute; }
}
/* その曲を鳴らす再生器に切り替える (つなぎ目なしの曲は LoopPlayer。Web Audio が使えなければ <audio> のまま) */
function ensureLoop() {
  if (loopEl) return;
  const lp = new LoopPlayer();
  const lr = lp.route(0);
  if (lr) { lp.addEventListener('ended', () => { if (shuffling()) nextShuffle(); }); loopEl = lp; loopRoute = lr; }
}
function usePlayer(key) {
  let p = audioEl, r = audioRoute;
  if (LOOP_SECONDS[key]) {
    ensureLoop();
    if (loopEl) { p = loopEl; r = loopRoute; p.length = LOOP_SECONDS[key]; p.pad = LOOP_PAD; }
  }
  if (el !== p && el) {
    el.pause(); route.set(0);
    if (el === loopEl) el.currentTime = 0;     // <audio> と同じく、別の曲を挟んで戻ったら頭から (読んだ曲はそのまま持っておく)
  }
  el = p; route = r;
}

/** 曲を鳴らす (同じ曲なら続きから)。key が無い・'off' なら止める */
export function playBgm(key) {
  /* COLLECTION の BGM をしまっている間は、対戦の2曲だけ鳴らす (タイトルの曲・選んだ曲は鳴らさない) */
  if (!BGM_RELEASED && !(BATTLE_BGM_ON && key && (isTrack(key) || NORMAL_BGMS.includes(key) || MENU_BGMS.includes(key) || key === RUN_BGM || key === STRONG_BGM || key === BOSS_BGM || key === DEUS_BGM || key === PEEK_BGM || TENSE_BGMS.includes(key) || STORY_TRACKS.includes(key) || LOOP_SECONDS[key]))) { stopBgm(); return; }
  clearTimeout(previewTimer);
  want = key && key !== 'off' ? key : null;
  if (!want) { stopBgm(); return; }
  try {
    ensure();
    usePlayer(want);
    const url = bgmFile(want);
    if (!el.src.endsWith(url)) el.src = url;
    refreshBgm();
  } catch (e) { /* BGM が無くても遊べる */ }
  announce();
}

/* 曲が替わったら知らせる (2026-11-08 本人「曲変えたら曲のタイトルと作者のカード出るようにして」。main.js が曲名と作者のカードを出す)。
   対戦の始まり・あと1本の切り替え・次の曲ボタン・シャッフルの次の曲・ストーリーの場面の曲、どれも playBgm を通るのでここで1回だけ。
   同じ曲の続き・試し聴き・音が出ていない (BGM 0・🔇) ときは出さない */
let onSongChange = null;
let announced = null;            // 最後に知らせた曲 (止めたら null。同じ曲でも止めたあとにまた流せば知らせる)
let previewing = false;
export const setSongNotify = (fn) => { onSongChange = fn; };
function announce() {
  if (!want || want === announced || previewing) return;
  /* まだ画面に触れていない (自動再生の制限で音の土台が止まっている) ときは、鳴り始める最初のタップまで待つ (retry が呼び直す) */
  const o = audioOut();
  if (o && o.ctx.state !== 'running') return;
  announced = want;
  if (onSongChange && level() > 0) { try { onSongChange(want); } catch (e) { /* 出せなくても鳴らす */ } }
}

/** 試し聴き: 頭から ms だけ流し、小さくして back() の曲に戻す (曲を選ぶための短い試し聴き。最後まで・繰り返しは流さない) */
let previewTimer = null;
export function previewBgm(key, back, ms = 15000) {
  const keep = announced;          // 試し聴きの曲は知らせない (一覧に曲名が出ている)。戻った曲が前と同じなら出し直さない
  previewing = true;
  playBgm(key);
  previewing = false;
  try { if (el) el.currentTime = 0; } catch (e) { /* 読み込み前 */ }
  previewTimer = setTimeout(() => {
    fadeOutBgm(1200);
    previewTimer = setTimeout(() => { announced = keep; playBgm(back ? back() : null); }, 1300);
  }, ms);
}

/** その曲を先に読んでおく (つなぎ目なしの曲だけ。decode: 音にするところまで。しないならファイルだけ) */
export function prepareBgm(key, decode = true) {
  if (!key || !LOOP_SECONDS[key]) return;
  try { ensure(); ensureLoop(); if (loopEl) loopEl.prepare(bgmFile(key), decode); } catch (e) { /* 読めなくても切り替えのときに読む */ }
}

/** 対戦の途中で曲を替える: いまの曲を ms かけて小さくしてから、次の曲を頭から (ぶつ切りにしない)。
    小さくしている間に次の曲を音にしておく (つなぎ目なしの曲は、読み終わるまで鳴らないため) */
let crossTimer = null;
export function crossBgm(key, ms = 1100) {
  if (!el || !want || !route) { playBgm(key); return; }
  if (want === key) return;
  prepareBgm(key);
  const was = want;
  route.set(0, ms / 1000 / 3);
  /* 小さくしている間にまた替えたら (次の曲ボタンを続けて押した)、あとの曲だけ鳴らす */
  clearTimeout(crossTimer);
  crossTimer = setTimeout(() => {
    if (want !== was) return;             // その間に止めた・別の曲にした (決着など)
    playBgm(key);
  }, ms);
}

/** 次の曲ボタン (2026-11-05 本人の希望): いま流している曲をやめて、持っている曲からシャッフルで次の曲へ替える。
    ctx: 'battle' / 'online' / 'menu' (替えた曲が終わったら、その場のシャッフルを続ける)。
    COLLECTION で曲を選んでいる場合は、替えた曲を繰り返す (選んだ曲には次の対戦で戻る)。替えた曲の key を返す (替えられなければ null) */
export function skipBgm(ctx = 'battle', ms = 600, extra = []) {
  if (!want) return null;                          // 止めている (決着のあと・演出の前) ときは鳴らし始めない
  /* extra: 持っている曲のほかに混ぜる曲 (対戦では、あと1本の曲も。2026-11-08 本人「曲送りはランダムで」) */
  const pool = [...new Set([...(ctx === 'menu' ? shufflePool() : battlePool()), ...extra])];
  const next = pickShuffleBgm(Math.random, pool.filter(k => k !== want && k !== shuffled));
  if (!next) return null;
  shuffleCtx = ctx;
  shuffled = next;
  crossBgm(next, ms);
  return next;
}

/** 決着したときなど: 少しずつ小さくして止める (ms かけて) */
export function fadeOutBgm(ms = 1400) {
  if (!el || !want) return;
  want = null;
  announced = null;
  route.set(0, ms / 1000 / 3);                    // 3 時定数でほぼ無音
  const e = el;
  setTimeout(() => { if (!want) e.pause(); }, ms);
}

/** キャラが喋っている間だけ BGM を小さくする (ms のあいだ。声が聞き取りやすいように) */
let duckTimer = null;
export function duckBgm(ms) {
  if (!el || !want || !route) return;
  route.set(level() * 0.4, 0.06);
  clearTimeout(duckTimer);
  duckTimer = setTimeout(() => { if (want) route.set(level(), 0.3); }, ms);
}

/* 決着のジングル (本人作、2026-11-04): 勝ち・負けで1回だけ鳴らす短い曲。Web Audio で音にしておいて鳴らす
   (<audio> は iPhone で画面に触れた瞬間でないと初めの1回を鳴らせないため)。BGM の音量に合わせ、BGM が 0 なら鳴らさない */
const JINGLES = { win: ['jingle_win.m4a', -12.2], lose: ['jingle_lose.m4a', -14.2] };
const jingleBuf = {};
/** 対戦の始まりに読んでおく (決着のときに読み込みを待たないように) */
export function prepareJingles() {
  const o = audioOut();
  if (!o) return;
  for (const [kind, [file]] of Object.entries(JINGLES)) {
    if (jingleBuf[kind]) continue;
    jingleBuf[kind] = fetch('art/bgm/' + file).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(b => new Promise((res, rej) => o.ctx.decodeAudioData(b, res, rej)))
      .catch(() => { delete jingleBuf[kind]; return null; });
  }
}
/** 'win' / 'lose' のジングルを鳴らす。鳴らせたら true (鳴らせないときは呼んだ側が効果音を鳴らす) */
export async function playJingle(kind) {
  const j = JINGLES[kind];
  const o = audioOut();
  if (!j || !o || isMuted() || !BATTLE_BGM_ON) return false;
  const vol = Math.max(0, Math.min(1, (settings().bgmVol ?? 30) / 100)) * 0.7 * Math.min(1.6, Math.pow(10, (LOUD_TARGET - j[1]) / 20));
  if (!vol) return false;
  prepareJingles();
  const buf = await jingleBuf[kind];
  if (!buf || o.ctx.state !== 'running') return false;
  try {
    const src = o.ctx.createBufferSource();
    const g = o.ctx.createGain();
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(g);
    g.connect(o.out);
    src.start();
    return true;
  } catch (e) { return false; }
}

export function stopBgm() {
  want = null;
  announced = null;
  if (el) el.pause();
}

/** 音量・消音の変更を反映する (設定・🔇 のあと) */
/* すべての音を消す・戻すを切り替えたら、BGM の音量もすぐ合わせる */
onMuteChange(() => refreshBgm());

export function refreshBgm() {
  if (!el) return;
  el.loop = !shuffling();          // シャッフルの曲は1回で終わらせて次へ (設定を切り替えたらすぐ合わせる)
  if (el.syncLoop) el.syncLoop();
  const v = level();
  route.set(v);
  if (!v || !want) { el.pause(); return; }
  if (el.paused) el.play().catch(() => { /* まだ画面に触れていない。触れたときに鳴らす */ });
}

/* 自動再生の制限: 画面に触れたときに鳴らし直す。iPhone の Safari は指を置いた瞬間 (pointerdown) では再生を許さず、
   指を離したとき (touchend)・タップ (click) だけ許すので、どれでも試す (ページを開き直して始まる対戦で鳴らなかった) */
/* kickAudio: 裏から戻ったあとの最初の1回、音の土台を起こし直す (audio.js) */
const retry = () => {
  initAudio(); kickAudio(); prime();
  if (want && el && el.paused && level() > 0) el.play().catch(() => {});
  if (want && want !== announced) setTimeout(announce, 400);   // 触れて鳴り始めた曲のカード (音の土台が起きるのを少し待つ)
};
/* iPhone: 画面に触れた瞬間に一度も鳴らしていない <audio> は、あとからプログラムで鳴らせない。
   対戦は「戦う」を押してから読み込みを待って始まるので、そのときにはもう触れた瞬間ではなく、1戦目の BGM が鳴らなかった。
   最初に触れたときに、無音で一瞬だけ鳴らして止めておく (以後は対戦の始まりにすぐ鳴らせる) */
let primed = false;
function prime() {
  if (primed || want || !BATTLE_BGM_ON) return;
  primed = true;
  try {
    ensure();
    audioRoute.set(0);
    audioEl.src = bgmFile(NORMAL_BGMS[0]);
    const p = audioEl.play();
    if (p && p.then) p.then(() => { if (!want || el !== audioEl) audioEl.pause(); }, () => { primed = false; });
  } catch (e) { primed = false; }
}
const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';   // テスト (node) では見張らない
if (inBrowser) for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, retry, { capture: true, passive: true });
/* 画面を離れたら止め、戻ったら続きから */
if (inBrowser) document.addEventListener('visibilitychange', () => {
  if (!el) return;
  if (document.visibilityState === 'hidden') el.pause(); else refreshBgm();
});
onSettings(() => refreshBgm());

/** いまの様子 (確かめる用) */
export const bgmState = () => ({ want, src: el ? el.src.split('/').pop() : null, paused: el ? el.paused : null, time: el ? el.currentTime : 0, level: level() });
