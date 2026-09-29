/* =========================================================================
 * 対戦のそばに出すキャラ (アバター)。タッグフォースのように、胸から上を画面の隅に出し、
 * 手に合わせて表情を変え、吹き出しでひとこと言う。
 *   自分 (と味方) は左下、相手は右上 (向かい合うよう左右を反転)。タッグの味方は自分のキャラの後ろに立ち、
 *   指す番の人が前に出る。
 *   表情は差し替えの絵 (art/avatar/<id>_<表情>.webp、背景は透明)。数秒ごとにまばたき、ゆっくり息をする。
 *   動きを減らす設定では、息とまばたきと吹き出しの動きを止める (表情とセリフは出す)
 * ========================================================================= */
import { settings } from './settings.js';
import { isMuted, playClip } from './audio.js';
import { duckBgm } from './bgm.js';
import { LINES, FAVORITE } from './avatar-lines.js';
import { BOSS_LINES } from './avatar-boss-lines.js';

export const FACES = ['normal', 'blink', 'happy', 'fired', 'frustrated', 'surprised'];

/* キャラ。lines は性格ごとのセリフ ({card} は出したカードの名前) */
export const AVATARS = {
  shion: {
    name: '紫苑', color: '#a07bff',
    lines: null
  },
  nadeshiko: {
    name: '撫子', color: '#ff4fa3',
    lines: null
  },
  asagi: {
    name: '浅葱', color: '#5fd6d0',
    lines: null
  },
  yamabuki: {
    name: '杏', color: '#ffc94a',   /* id は yamabuki のまま (持っている記録が id で残っているため)。名前は色の名前 (杏色) */
    lines: null
  }
,
  /* ---- ゲスト: VOICEVOX のキャラ (声つき)。立ち絵は坂本アヒルさんの素材、声は VOICEVOX で作って art/voice/<id>/ に入れる。
     セリフは [画面に出す文, 声で言う文] (声はカード名を言わない短い形)。声のファイルは <種類>_<番号>.mp3 */
  zundamon: {
    name: 'ずんだもん', color: '#7ccf4a', guest: true, voice: true, credit: 'VOICEVOX:ずんだもん', facing: 'left',
    lines: null
  },
  metan: {
    name: '四国めたん', color: '#ff6fb5', guest: true, voice: true, credit: 'VOICEVOX:四国めたん', facing: 'left',
    lines: null
  },
  tsumugi: {
    name: '春日部つむぎ', color: '#f5c34a', guest: true, voice: true, credit: 'VOICEVOX:春日部つむぎ', facing: 'left',
    lines: null
  }
,
  whitecul: {
    name: 'WhiteCUL', color: '#8fc8ff', guest: true, voice: true, credit: 'VOICEVOX:WhiteCUL', facing: 'left',
    lines: null
  }
};

/* 勝ち抜き戦のボス (run.js の BOSSES)。ボス戦で相手のキャラの代わりに出る。絵は1枚 (表情は変わらない: single)、声は無し。
   ガチャ・COLLECTION・ランダムの相手には出ない (boss) */
const BOSS_LOOK = { inferno: ['業火の王', '#ff5a3c'], abyss: ['深淵の主', '#8a4dff'], clock: ['時計塔の番人', '#ffc85a'],
  mirror: ['鏡の迷宮', '#7cf0ff'], sanctuary: ['聖域の守り手', '#bfe8a0'], glacier: ['氷結の女帝', '#9fd8ff'], strongest: ['最強', '#ff4fa3'] };
for (const [id, [name, color]] of Object.entries(BOSS_LOOK)) AVATARS['boss_' + id] = { name, color, boss: true, single: true, lines: null };

/* セリフは avatar-lines.js (ボスは avatar-boss-lines.js)。得意プロトコル (fav) も */
for (const [id, def] of Object.entries(AVATARS)) { def.lines = LINES[id] || BOSS_LINES[id] || {}; def.fav = FAVORITE[id] || null; }

/* プロトコルごとのセリフ (カードを表で出したときに、ときどきこちらを言う) */
export const PROTO_LINES = {
  FIRE: '燃やして、{card}！', WATER: '流れを変える、{card}。', SPEED: '先に動く、{card}！', DEATH: '終わらせて、{card}。',
  LIFE: '育って、{card}。', LIGHT: '照らして、{card}！', DARKNESS: '闇に紛れて、{card}。', GRAVITY: '引き寄せて、{card}！',
  METAL: '固めるよ、{card}。', PSYCHIC: '心を読んで、{card}。', SPIRIT: '魂を込めて、{card}！', PLAGUE: '広がって、{card}。',
  APATHY: '……{card}。', HATE: '消し去って、{card}！', LOVE: '届いて、{card}！', CHAOS: 'かき回して、{card}！',
  CLARITY: '見通すよ、{card}。', CORRUPTION: '染めてあげる、{card}。', COURAGE: '勇気を、{card}！', FEAR: '怯えなさい、{card}。',
  ICE: '凍らせて、{card}。', LUCK: '運を試すよ、{card}！', MIRROR: '映して返す、{card}。', PEACE: '静かに、{card}。',
  SMOKE: '煙に巻いて、{card}。', TIME: '時を刻んで、{card}。', WAR: '攻めるよ、{card}！', ASSIMILATION: '取り込んで、{card}。',
  DIVERSITY: 'いろいろ試そう、{card}！', UNITY: 'ひとつになって、{card}！'
};

const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
/* 選べる・ランダムに出るキャラ (ボスは除く) */
export const avatarIds = () => Object.keys(AVATARS).filter(id => !AVATARS[id].boss);
export const faceURL = (id, face) => 'art/avatar/' + id + '_' + (AVATARS[id] && AVATARS[id].single ? 'normal' : (face || 'normal')) + '.webp';

/** キャラを出す。opts.side: 'me' (左下) / 'opp' (右上)。opts.back: 自分の後ろに立つ (タッグの味方)。
 *  返り値: { react(kind, vars), say(text, face, ms), setFace(face, ms), setBack(on), destroy(), id } */
export function mountAvatar(id, opts = {}) {
  const def = AVATARS[id];
  if (!def) return null;
  const el = document.createElement('div');
  el.className = 'avatar ' + (opts.side === 'opp' ? 'av-opp' : 'av-me') + (opts.back ? ' av-back' : '');
  el.style.setProperty('--av-c', def.color);
  /* 絵の向き (facing: 'left' は左を向いている絵)。盤面の方を向くよう、CSS で左右を反転する */
  el.dataset.facing = def.facing || 'front';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="av-body">' + FACES.map(f =>
    '<img alt="" draggable="false" data-face="' + f + '" src="' + faceURL(id, f) + '"' + (f === 'normal' ? ' class="on"' : '') + '>').join('') +
    '</div><div class="av-bubble" role="status"><b class="av-name">' + def.name + '</b><p class="av-text"></p></div>';
  (opts.root || document.body).appendChild(el);
  if (calm()) el.classList.add('calm');

  let face = 'normal', faceTimer = null, sayTimer = null, blinkTimer = null, speakTimer = null;
  let speakEnd = 0;                  // 言い終わる時刻 (これより前に次のセリフを言わせない。main.js が待つ)
  const show = (f) => el.querySelectorAll('img').forEach(img => img.classList.toggle('on', img.dataset.face === f));
  /* まばたき: ふつうの顔のときだけ、3〜6秒ごとに 0.14 秒 */
  const scheduleBlink = () => {
    clearTimeout(blinkTimer);
    if (calm()) return;
    blinkTimer = setTimeout(() => {
      if (face === 'normal' && el.isConnected) { show('blink'); setTimeout(() => { if (face === 'normal') show('normal'); }, 140); }
      scheduleBlink();
    }, 3000 + Math.random() * 3000);
  };
  scheduleBlink();

  function setFace(f, ms) {
    if (!FACES.includes(f)) return;
    clearTimeout(faceTimer);
    face = f;
    show(f);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    if (ms) faceTimer = setTimeout(() => { face = 'normal'; show('normal'); }, ms);
  }
  /* セリフ: 1字ずつ流れ込む (リソース集の Kinetics の文字送り)。吹き出しは表情ごとに出方を変える (data-mood) */
  function say(text, f, ms) {
    const bubble = el.querySelector('.av-bubble');
    const p = bubble.querySelector('.av-text');
    p.textContent = '';
    p.setAttribute('aria-label', text);
    Array.from(text).forEach((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch;
      s.style.setProperty('--i', i);
      s.setAttribute('aria-hidden', 'true');
      p.appendChild(s);
    });
    bubble.dataset.mood = f || 'normal';
    bubble.classList.remove('show'); void bubble.offsetWidth; bubble.classList.add('show');
    /* 言い終わる時刻 (吹き出しを読み終わるまで。声がそれより長ければ声の終わり) */
    speakEnd = Date.now() + (ms || 2600);
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => bubble.classList.remove('show'), ms || 2600);
    /* 話している間の印 (縦持ちの狭い画面では、話すときだけ出てくる。CSS) */
    el.classList.add('speaking');
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => el.classList.remove('speaking'), (ms || 2600) + 500);
    if (f) setFace(f, (ms || 2600) + 400);
    if (opts.onSay) { try { opts.onSay(id, text); } catch (e) { /* 声は無くても遊べる */ } }
  }
  /* 手に合わせて: play (表で出した) / compile / compiled (された) / hurt (大きく減らされた) / almost (コンパイル目前) / win / lose / hello */
  const FACE_OF = { play: 'fired', compile: 'happy', compiled: 'frustrated', hurt: 'surprised', almost: 'fired', win: 'happy', lose: 'frustrated', hello: 'happy',
    lesson: 'normal', good: 'happy', retry: 'normal',
    turn: 'normal', down: 'fired', watch: 'surprised', chain: 'happy', refresh: 'normal', idle: 'normal', control: 'happy', boost: 'fired',
    handes: 'frustrated', wipe: 'fired', rearrange: 'fired', fav: 'happy', reach: 'fired', lead: 'happy', behind: 'frustrated', crushed: 'surprised', recompile: 'happy' };
  /* チュートリアルの案内 (tu...): できたら笑顔、ほかはふつう */
  const faceOf = (kind) => FACE_OF[kind] || (/^play_/.test(kind) ? 'fired' : null) || (/^tu\d+ok$/.test(kind) ? 'happy' : /^tu(\d|ask)/.test(kind) ? 'normal' : undefined);
  const lastPick = {};               // 種類ごとに、直前に言ったセリフの番号
  function react(kind, vars) {
    /* そのキャラに無い種類 (チュートリアルの案内など) は紫苑のセリフを借りる (声は無し) */
    const own = def.lines[kind];
    const lines = own || AVATARS.shion.lines[kind];
    if (!lines) return;
    const proto = vars && vars.card ? String(vars.card).split(' ')[0] : null;
    /* 得意プロトコルのカードを表で出したら、専用のセリフ (fav) で */
    if (kind === 'play' && proto && def.fav === proto && def.lines.fav) return react('fav', vars);
    /* プロトコルごとの専用セリフ (play_FIRE など。使うプロトコルが決まっているボス) があれば、7割はそちらで */
    if (kind === 'play' && proto && def.lines['play_' + proto] && Math.random() < 0.7) return react('play_' + proto, vars);
    /* 同じ種類で、直前と同じセリフは続けて言わない */
    let i = Math.floor(Math.random() * lines.length);
    if (lines.length > 1 && lastPick[kind] === i) i = (i + 1 + Math.floor(Math.random() * (lines.length - 1))) % lines.length;
    lastPick[kind] = i;
    const entry = lines[i];
    /* 声つきのキャラは、プロトコルごとのセリフを使わず、声のあるセリフだけ */
    let text = !def.voice && kind === 'play' && proto && PROTO_LINES[proto] && Math.random() < 0.45 ? PROTO_LINES[proto]
      : Array.isArray(entry) ? entry[0] : entry;
    for (const [k, v] of Object.entries(vars || {})) text = text.split('{' + k + '}').join(v);
    /* 長いセリフ (チュートリアルの案内など) は、読み終わるまで出しておく */
    const ms = Math.max(kind === 'win' || kind === 'lose' ? 5000 : 2400, 700 + text.length * 110);
    const canned = () => {
      if (def.voice && own && voiceOn) playVoice('art/voice/' + id + '/' + kind + '_' + i + '.mp3');
      say(text, faceOf(kind), ms);
    };
    /* AI でしゃべらせる (opts.talk): 表情だけ先に変え、答えが来たら言う (声は無し)。来なければいつものセリフ。
       待っている間に次のひとことが来たら、古い答えは捨てる */
    const ask = opts.talk && opts.talk(def, kind, vars);
    if (!ask) { talkSeq++; canned(); return; }
    const my = ++talkSeq;
    setFace(faceOf(kind), 4000);
    ask.then((line) => { if (my === talkSeq && el.isConnected) (line ? say(line, faceOf(kind), Math.max(ms, 1200 + line.length * 90)) : canned()); },
      () => { if (my === talkSeq && el.isConnected) canned(); });
  }
  let talkSeq = 0;
  /* 声: 設定の「キャラの声の音量」で鳴らす。消音中は鳴らさない。前の声は止める */
  let voiceStop = null, voiceSeq = 0;
  /* 声を出すか (相手のキャラは設定の「相手のキャラの声」で消せる) */
  let voiceOn = opts.voice !== false;
  const stopVoice = () => { voiceSeq++; if (voiceStop) { voiceStop(); voiceStop = null; } };
  function setVoice(on) { voiceOn = !!on; if (!on) stopVoice(); }
  function playVoice(url) {
    if (isMuted()) return;
    /* 設定の「キャラの声の音量」(0 でオフ)。効果音と同じ Web Audio で鳴らす (iPhone で止められないように。audio.js の playClip) */
    const vol = Math.max(0, Math.min(1, ((settings().voiceVol ?? 80) | 0) / 100));
    if (!vol) return;
    stopVoice();
    const my = voiceSeq;
    playClip(url, vol).then((h) => {
      if (!h) return;
      if (my !== voiceSeq || !el.isConnected) { h.stop(); return; }
      voiceStop = h.stop;
      duckBgm(h.duration * 1000 + 200);                // 喋っている間は BGM を小さく
      /* 言い終わる時刻を、声の終わりまで延ばす */
      speakEnd = Math.max(speakEnd, Date.now() + h.duration * 1000 + 200);
    }, () => { /* 声が無くても遊べる */ });
  }
  /* タッグ: 後ろに下がる / 前に出る */
  function setBack(on) { el.classList.toggle('av-back', !!on); }
  function destroy() { clearTimeout(faceTimer); clearTimeout(sayTimer); clearTimeout(blinkTimer); clearTimeout(speakTimer); stopVoice(); el.remove(); }
  /** 言い終わるまでの残り (ミリ秒)。0 なら話していない */
  const idleIn = () => Math.max(0, speakEnd - Date.now());
  return { react, say, setFace, setBack, setVoice, destroy, idleIn, id, el };
}
