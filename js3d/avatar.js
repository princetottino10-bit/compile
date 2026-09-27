/* =========================================================================
 * 対戦のそばに出すキャラ (アバター)。タッグフォースのように、胸から上を画面の隅に出し、
 * 手に合わせて表情を変え、吹き出しでひとこと言う。
 *   自分 (と味方) は左下、相手は右上 (向かい合うよう左右を反転)。タッグの味方は自分のキャラの後ろに立ち、
 *   指す番の人が前に出る。
 *   表情は差し替えの絵 (art/avatar/<id>_<表情>.webp、背景は透明)。数秒ごとにまばたき、ゆっくり息をする。
 *   動きを減らす設定では、息とまばたきと吹き出しの動きを止める (表情とセリフは出す)
 * ========================================================================= */
import { settings } from './settings.js';
import { isMuted } from './audio.js';

export const FACES = ['normal', 'blink', 'happy', 'fired', 'frustrated', 'surprised'];

/* キャラ。lines は性格ごとのセリフ ({card} は出したカードの名前) */
export const AVATARS = {
  shion: {
    name: '紫苑', color: '#a07bff',
    lines: {
      play: ['行って、{card}！', '{card}、お願い。', 'ここは {card} で。'],
      compile: ['コンパイル、完了。', 'ひとつ、もらったよ。'],
      compiled: ['くっ……', 'まだ、これから。'],
      hurt: ['えっ……', 'そう来るの？'],
      almost: ['あと少し……', '次で、決める。'],
      win: ['勝った。ありがとう。', 'いい対戦だった。'],
      lose: ['……次は負けない。', '悔しいな。'],
      hello: ['よろしくね。', '始めようか。'],
      /* チュートリアル: 案内役 */
      lesson: ['まずは、ここから。', 'ゆっくりでいいよ。', '一緒にやってみよう。'],
      good: ['よくできました。', 'その調子。'],
      retry: ['もう一回やってみよう。', '大丈夫、もう一度。']
    }
  },
  nadeshiko: {
    name: '撫子', color: '#ff4fa3',
    lines: {
      play: ['{card}、やっちゃって！', 'ほら、{card}よ！', 'これでどう？ {card}！'],
      compile: ['もらったわ！', 'ふふん、当然でしょ。'],
      compiled: ['ちょっと、何よそれ！', 'ま、まだまだよ！'],
      hurt: ['なっ……！', 'やるじゃない。'],
      almost: ['あと一押しね。', '覚悟しなさい。'],
      win: ['私の勝ちね！', 'また遊んであげる。'],
      lose: ['……今日は譲ってあげる。', '次は絶対勝つんだから！'],
      hello: ['手加減しないわよ。', '勝負よ！']
    }
  },
  asagi: {
    name: '浅葱', color: '#5fd6d0',
    lines: {
      play: ['{card}、いっけー！', 'えいっ、{card}！', '任せて、{card}！'],
      compile: ['やったぁ、コンパイル！', 'ナイス、決まったね！'],
      compiled: ['あちゃー……', 'ドンマイ、取り返そ！'],
      hurt: ['わわっ！', 'うそー！'],
      almost: ['もうちょっと！', 'あとひと押しだよ！'],
      win: ['やったね、勝ったよ！', '最高のコンビだね！'],
      lose: ['うう、負けちゃった……', '次はもっと頑張る！'],
      hello: ['一緒に頑張ろ！', 'よろしくね、相棒！']
    }
  },
  yamabuki: {
    name: '山吹', color: '#ffc94a',
    lines: {
      play: ['{card}、どーん！', '見てて、{card}！', 'よっしゃ、{card}！'],
      compile: ['よっしゃー！', 'いただきっ！'],
      compiled: ['ぐぬぬ……', 'まだ終わってないぞ！'],
      hurt: ['おわっ！？', 'そりゃないって！'],
      almost: ['あとちょい！', 'いける、いける！'],
      win: ['勝ったー！', 'へへっ、楽しかった！'],
      lose: ['くやしー！', 'もう一回！'],
      hello: ['いっくぞー！', '全力でいくよ！']
    }
  }
,
  /* ---- ゲスト: VOICEVOX のキャラ (声つき)。立ち絵は坂本アヒルさんの素材、声は VOICEVOX で作って art/voice/<id>/ に入れる。
     セリフは [画面に出す文, 声で言う文] (声はカード名を言わない短い形)。声のファイルは <種類>_<番号>.mp3 */
  zundamon: {
    name: 'ずんだもん', color: '#7ccf4a', guest: true, voice: true, credit: 'VOICEVOX:ずんだもん',
    lines: {
      play: [['{card}、いくのだ！', 'いくのだ！'], ['{card}の出番なのだ！', 'でばんなのだ！'], ['くらえ、{card}なのだ！', 'くらえなのだ！']],
      compile: ['コンパイルなのだ！', '勝ちに一歩近づいたのだ！'],
      compiled: ['ぐぬぬ……ずるいのだ！', 'まだ負けてないのだ！'],
      hurt: ['なんでなのだ！？', 'ひどいのだ……'],
      almost: ['あと少しなのだ！', '次で決めるのだ！'],
      win: ['ぼくの勝ちなのだ！', 'ずんだパワーの勝利なのだ！'],
      lose: ['負けたのだ……', '次は負けないのだ！'],
      hello: ['よろしくなのだ！', 'ずんだもんが相手なのだ！'],
      lesson: ['ぼくが教えてあげるのだ！', 'ゆっくりやるのだ。'],
      good: ['すごいのだ！', 'よくできたのだ！'],
      retry: ['もう一回やってみるのだ！', '大丈夫なのだ、もう一回なのだ。']
    }
  },
  metan: {
    name: '四国めたん', color: '#ff6fb5', guest: true, voice: true, credit: 'VOICEVOX:四国めたん',
    lines: {
      play: [['{card}、お行きなさい！', 'おいきなさい！'], ['{card}の出番ですわ！', 'でばんですわ！'], ['この{card}で決めますわ。', 'これで決めますわ。']],
      compile: ['コンパイル、いただきましたわ！', '当然の結果ですわね。'],
      compiled: ['くっ……やりますわね。', 'まだ終わっていませんわ！'],
      hurt: ['なっ……！', 'ちょっと、ずいぶんですわね！'],
      almost: ['あと一押しですわ。', 'ふふ、次で決めますわ。'],
      win: ['わたくしの勝ちですわ！', 'おーっほっほっほ！'],
      lose: ['……今日は負けを認めますわ。', '次は負けませんわよ！'],
      hello: ['よろしくてよ。', '四国めたん、参りますわ。'],
      lesson: ['わたくしが教えてさしあげますわ。', '落ち着いてやればできますわ。'],
      good: ['お見事ですわ！', 'やりますわね。'],
      retry: ['もう一度ですわ。', '大丈夫、次はできますわ。']
    }
  },
  tsumugi: {
    name: '春日部つむぎ', color: '#f5c34a', guest: true, voice: true, credit: 'VOICEVOX:春日部つむぎ',
    lines: {
      play: [['{card}、いっちゃえ！', 'いっちゃえ！'], ['{card}でキメるし！', 'キメるし！'], ['ほい、{card}！', 'ほいっ！']],
      compile: ['コンパイル、キタコレ！', 'やったじゃん、あーしら最強！'],
      compiled: ['えー、マジ？', 'ちょ、待って待って！'],
      hurt: ['うそでしょ！？', 'それはナシっしょ！'],
      almost: ['あとちょいじゃん！', '次でキメるよ！'],
      win: ['勝ったー！ サイコー！', 'あーしの勝ちー！'],
      lose: ['くやしー！', '次は負けないし！'],
      hello: ['よろしくー！', '春日部つむぎ、いくよー！'],
      lesson: ['あーしが教えたげる！', 'ゆっくりでいいよー。'],
      good: ['やるじゃん！', 'いいね、その調子！'],
      retry: ['ドンマイ、もう一回！', 'だいじょぶ、次いける！']
    }
  }
};

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
export const avatarIds = () => Object.keys(AVATARS);
export const faceURL = (id, face) => 'art/avatar/' + id + '_' + (face || 'normal') + '.webp';

/** キャラを出す。opts.side: 'me' (左下) / 'opp' (右上)。opts.back: 自分の後ろに立つ (タッグの味方)。
 *  返り値: { react(kind, vars), say(text, face, ms), setFace(face, ms), setBack(on), destroy(), id } */
export function mountAvatar(id, opts = {}) {
  const def = AVATARS[id];
  if (!def) return null;
  const el = document.createElement('div');
  el.className = 'avatar ' + (opts.side === 'opp' ? 'av-opp' : 'av-me') + (opts.back ? ' av-back' : '');
  el.style.setProperty('--av-c', def.color);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="av-body">' + FACES.map(f =>
    '<img alt="" draggable="false" data-face="' + f + '" src="' + faceURL(id, f) + '"' + (f === 'normal' ? ' class="on"' : '') + '>').join('') +
    '</div><div class="av-bubble" role="status"><b class="av-name">' + def.name + '</b><p class="av-text"></p></div>';
  (opts.root || document.body).appendChild(el);
  if (calm()) el.classList.add('calm');

  let face = 'normal', faceTimer = null, sayTimer = null, blinkTimer = null;
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
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => bubble.classList.remove('show'), ms || 2600);
    if (f) setFace(f, (ms || 2600) + 400);
    if (opts.onSay) { try { opts.onSay(id, text); } catch (e) { /* 声は無くても遊べる */ } }
  }
  /* 手に合わせて: play (表で出した) / compile / compiled (された) / hurt (大きく減らされた) / almost (コンパイル目前) / win / lose / hello */
  const FACE_OF = { play: 'fired', compile: 'happy', compiled: 'frustrated', hurt: 'surprised', almost: 'fired', win: 'happy', lose: 'frustrated', hello: 'happy',
    lesson: 'normal', good: 'happy', retry: 'normal' };
  function react(kind, vars) {
    /* そのキャラに無い種類 (チュートリアルの案内など) は紫苑のセリフを借りる (声は無し) */
    const own = def.lines[kind];
    const lines = own || AVATARS.shion.lines[kind];
    if (!lines) return;
    const proto = vars && vars.card ? String(vars.card).split(' ')[0] : null;
    const i = Math.floor(Math.random() * lines.length);
    const entry = lines[i];
    /* 声つきのキャラは、プロトコルごとのセリフを使わず、声のあるセリフだけ */
    let text = !def.voice && kind === 'play' && proto && PROTO_LINES[proto] && Math.random() < 0.45 ? PROTO_LINES[proto]
      : Array.isArray(entry) ? entry[0] : entry;
    if (def.voice && own) playVoice('art/voice/' + id + '/' + kind + '_' + i + '.mp3');
    for (const [k, v] of Object.entries(vars || {})) text = text.split('{' + k + '}').join(v);
    say(text, FACE_OF[kind], kind === 'win' || kind === 'lose' ? 5000 : 2400);
  }
  /* 声: 効果音の音量で鳴らす。消音中は鳴らさない。前の声は止める */
  let voiceEl = null;
  function playVoice(url) {
    try {
      if (isMuted()) return;
      const vol = Math.max(0, Math.min(1, ((settings().sfx ?? 80) | 0) / 100));
      if (!vol) return;
      if (voiceEl) voiceEl.pause();
      voiceEl = new Audio(url);
      voiceEl.volume = vol;
      voiceEl.play().catch(() => { /* まだ画面に触れていないなど */ });
    } catch (e) { /* 声が無くても遊べる */ }
  }
  /* タッグ: 後ろに下がる / 前に出る */
  function setBack(on) { el.classList.toggle('av-back', !!on); }
  function destroy() { clearTimeout(faceTimer); clearTimeout(sayTimer); clearTimeout(blinkTimer); if (voiceEl) voiceEl.pause(); el.remove(); }
  return { react, say, setFace, setBack, destroy, id, el };
}
