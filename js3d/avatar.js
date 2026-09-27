/* =========================================================================
 * 対戦のそばに出すキャラ (アバター)。タッグフォースのように、胸から上を画面の隅に出し、
 * 手に合わせて表情を変え、吹き出しでひとこと言う。
 *   自分 (と味方) は左下、相手は右上 (向かい合うよう左右を反転)。タッグの味方は自分のキャラの後ろに立ち、
 *   指す番の人が前に出る。
 *   表情は差し替えの絵 (art/avatar/<id>_<表情>.webp、背景は透明)。数秒ごとにまばたき、ゆっくり息をする。
 *   動きを減らす設定では、息とまばたきと吹き出しの動きを止める (表情とセリフは出す)
 * ========================================================================= */
import { settings } from './settings.js';
import { isMuted, routeMedia } from './audio.js';

export const FACES = ['normal', 'blink', 'happy', 'fired', 'frustrated', 'surprised'];

/* キャラ。lines は性格ごとのセリフ ({card} は出したカードの名前) */
export const AVATARS = {
  shion: {
    name: '紫苑', color: '#a07bff',
    lines: {
      rearrange: ['並びを、変えておくね。', 'この順番のほうがいい。'],
      wipe: ['まとめて、片付けた。', '盤面を、整理しよう。'],
      handes: ['手札が……！', 'それは困るな。'],
      turn: ['私の番。', 'さて、どうしようか。', '集中していこう。', 'ここが勝負どころ。'],
      down: ['伏せておくね。', 'まだ内緒。'],
      watch: ['そう来たか。', 'なるほどね。'],
      chain: ['つながった。', 'いい流れ。'],
      refresh: ['少し補充するね。', '手札を整えよう。'],
      idle: ['ゆっくり考えて。', '迷ってる？'],
      control: ['主導権、もらったよ。', '流れはこっちだね。'],
      boost: ['いい調子。', '積み上がってきた。'],
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
      rearrange: ['並べ替えてあげるわ。', 'この並びで勝負よ！'],
      wipe: ['まとめて消えなさい！', 'きれいさっぱりね。'],
      handes: ['ちょっと、私の手札に何するのよ！', '返しなさいよ！'],
      turn: ['私の番ね！', 'さあ、行くわよ。', '見てなさい。', 'ここからが本番よ！'],
      down: ['何を伏せたか、当ててみなさい。', 'ふふ、内緒よ。'],
      watch: ['ふーん、そう来るの。', '甘いわね。'],
      chain: ['まだまだ続くわよ！', '止まらないわよ！'],
      refresh: ['補充よ、補充！', '手札が寂しいわね。'],
      idle: ['早くしなさいよ。', 'いつまで考えてるの？'],
      control: ['主導権は私のものよ。', '流れはいただいたわ。'],
      boost: ['どんどん行くわよ！', '見なさい、この数字！'],
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
      rearrange: ['入れ替えちゃお！', 'よし、並び替え完了！'],
      wipe: ['どかーん！すっきり！', '一気にいったー！'],
      handes: ['あーっ、手札がー！', 'ひどいよー！'],
      turn: ['よーし、いくよ！', '私の番だね！', 'がんばるぞー！', '次は何しよっかな〜。'],
      down: ['こっそり置いとこ。', 'ひみつ〜。'],
      watch: ['おおっ、やるね！', 'そうきたかー！'],
      chain: ['つながったー！', '連鎖だ、連鎖！'],
      refresh: ['手札、補充しよっと。', 'ドローだ〜！'],
      idle: ['のんびりでいいよ〜。', '考え中？'],
      control: ['コントロール、ゲット！', '流れ来てる！'],
      boost: ['いい感じ！', 'ぐんぐん伸びてる！'],
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
    name: '杏', color: '#ffc94a',   /* id は yamabuki のまま (持っている記録が id で残っているため)。名前は色の名前 (杏色) */
    lines: {
      rearrange: ['ぐるっと入れ替え！', 'シャッフルだー！'],
      wipe: ['ぜーんぶ吹っ飛べ！', '大掃除だー！'],
      handes: ['おい、手札返せー！', 'ずるいぞ！'],
      turn: ['よっしゃ、いくぞ！', 'こっちの番だ！', '全力でいくぞー！', 'まだまだこれから！'],
      down: ['伏せとくぜ！', '何かはお楽しみ！'],
      watch: ['おっ、やるな！', 'そうきたか！'],
      chain: ['つながれー！', 'いけいけー！'],
      refresh: ['補充補充！', 'ドロー！'],
      idle: ['まだかー？', '早く早く！'],
      control: ['コントロール、もらった！', '流れはこっちだ！'],
      boost: ['どんどん積むぞ！', 'いいぞいいぞ！'],
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
    name: 'ずんだもん', color: '#7ccf4a', guest: true, voice: true, credit: 'VOICEVOX:ずんだもん', facing: 'left',
    lines: {
      rearrange: ['並び替えるのだ！', 'この順番が最強なのだ！'],
      wipe: ['まとめて片付けたのだ！', 'すっきりしたのだ！'],
      handes: ['ぼくの手札が減ったのだ！', 'ひどいのだ、返すのだ！'],
      turn: ['ぼくの番なのだ！', 'どうしようかな、なのだ。', 'ずんだパワー全開なのだ！', '見てるのだ！'],
      down: ['こっそり置くのだ。', 'ひみつなのだ！'],
      watch: ['そう来たのだ！？', 'なかなかやるのだ。'],
      chain: ['つながったのだ！', '止まらないのだ！'],
      refresh: ['補充するのだ！', '手札を引くのだ。'],
      idle: ['ゆっくり考えるのだ。', 'まだなのだ？'],
      control: ['主導権はぼくのものなのだ！', '流れが来てるのだ！'],
      boost: ['いい感じなのだ！', 'ぐんぐん伸びるのだ！'],
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
    name: '四国めたん', color: '#ff6fb5', guest: true, voice: true, credit: 'VOICEVOX:四国めたん', facing: 'left',
    lines: {
      rearrange: ['並びを整えますわ。', 'この順番がよろしくてよ。'],
      wipe: ['一掃いたしましたわ。', 'すっきりしましたわね。'],
      handes: ['わたくしの手札に、なんてことを！', 'お行儀が悪いですわ！'],
      turn: ['わたくしの番ですわ。', 'さあ、参りますわよ。', 'わたくしの腕の見せどころですわ。', '優雅に参りますわよ。'],
      down: ['伏せておきますわ。', '何かは秘密ですわ。'],
      watch: ['あら、そう来ますの。', 'なかなかやりますわね。'],
      chain: ['まだ続きますわよ！', '見事な連なりですわ。'],
      refresh: ['補充いたしますわ。', '手札を整えますわ。'],
      idle: ['ごゆっくりお考えになって。', 'まだですの？'],
      control: ['主導権はいただきましたわ。', '流れはわたくしのものですわ。'],
      boost: ['順調ですわね。', '積み上がってきましたわ。'],
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
    name: '春日部つむぎ', color: '#f5c34a', guest: true, voice: true, credit: 'VOICEVOX:春日部つむぎ', facing: 'left',
    lines: {
      rearrange: ['並び替えちゃお！', 'こっちのほうが映えるし！'],
      wipe: ['まとめてバイバーイ！', '全部どかしちゃった！'],
      handes: ['ちょ、あーしの手札！', 'それはナシっしょ〜！'],
      turn: ['あーしの番！', 'よーし、いくよー！', 'あーしに任せて！', 'テンション上げてくよー！'],
      down: ['こっそり置いとくね。', 'ナイショ〜。'],
      watch: ['え、やるじゃん！', 'そうくるかー！'],
      chain: ['つながったじゃん！', '止まんないし！'],
      refresh: ['手札補充〜！', 'ドローするね！'],
      idle: ['ゆっくりでいいよー。', '考え中？'],
      control: ['コントロール、いただき！', '流れキテるじゃん！'],
      boost: ['いい感じじゃん！', 'ぐんぐんいくよ！'],
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
,
  whitecul: {
    name: 'WhiteCUL', color: '#8fc8ff', guest: true, voice: true, credit: 'VOICEVOX:WhiteCUL', facing: 'left',
    lines: {
      play: [['{card}、出します。', '出します。'], ['……{card}で。', 'これで。'], ['{card}、お願い……！', 'おねがい……！']],
      compile: ['コンパイル、完了です。', '……やった。'],
      compiled: ['……っ、やられました。', 'まだ、冷静に……'],
      hurt: ['ひゃっ……！', 'そ、そんな……'],
      almost: ['あと少し、です。', '次で、決めます。'],
      win: ['勝ちました。……ほっ。', 'よかった……勝てました。'],
      lose: ['……負け、ですね。', '次は、負けません。'],
      hello: [['WhiteCULです。よろしく。', 'ホワイトカルです。よろしく。'], '……よろしくお願いします。'],
      lesson: ['私が案内します。', '落ち着いて、やりましょう。'],
      good: ['お見事です。', '上手ですね。'],
      retry: ['もう一度、どうぞ。', '大丈夫、落ち着いて。'],
      turn: ['私の番、ですね。', '……考えます。', '……落ち着いて、いきます。', 'ここは、冷静に。'],
      down: ['伏せておきます。', '見せません。'],
      watch: ['……なるほど。', 'そう来ましたか。'],
      chain: ['つながりました。', 'いい流れです。'],
      refresh: ['補充します。', '手札を整えます。'],
      idle: ['ごゆっくり。', '……迷っていますか？'],
      control: ['主導権、いただきます。', '流れが来ました。'],
      boost: ['順調です。', '積み上がってきました。'],
      handes: ['手札が……！', 'や、やめてください……'],
      wipe: ['まとめて、片付けます。', 'すっきりしました。'],
      rearrange: ['並びを、変えます。', 'この順番で。']
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
    handes: 'frustrated', wipe: 'fired', rearrange: 'fired' };
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
    for (const [k, v] of Object.entries(vars || {})) text = text.split('{' + k + '}').join(v);
    const ms = kind === 'win' || kind === 'lose' ? 5000 : 2400;
    const canned = () => {
      if (def.voice && own && voiceOn) playVoice('art/voice/' + id + '/' + kind + '_' + i + '.mp3');
      say(text, FACE_OF[kind], ms);
    };
    /* AI でしゃべらせる (opts.talk): 表情だけ先に変え、答えが来たら言う (声は無し)。来なければいつものセリフ。
       待っている間に次のひとことが来たら、古い答えは捨てる */
    const ask = opts.talk && opts.talk(def, kind, vars);
    if (!ask) { talkSeq++; canned(); return; }
    const my = ++talkSeq;
    setFace(FACE_OF[kind], 4000);
    ask.then((line) => { if (my === talkSeq && el.isConnected) (line ? say(line, FACE_OF[kind], Math.max(ms, 1200 + line.length * 90)) : canned()); },
      () => { if (my === talkSeq && el.isConnected) canned(); });
  }
  let talkSeq = 0;
  /* 声: 設定の「キャラの声の音量」で鳴らす。消音中は鳴らさない。前の声は止める */
  let voiceEl = null;
  /* 声を出すか (相手のキャラは設定の「相手のキャラの声」で消せる) */
  let voiceOn = opts.voice !== false;
  function setVoice(on) { voiceOn = !!on; if (!on && voiceEl) voiceEl.pause(); }
  function playVoice(url) {
    try {
      if (isMuted()) return;
      /* 設定の「キャラの声の音量」(0 でオフ)。iPhone でも効くよう Web Audio を通す */
      const vol = Math.max(0, Math.min(1, ((settings().voiceVol ?? 80) | 0) / 100));
      if (!vol) return;
      if (voiceEl) voiceEl.pause();
      voiceEl = new Audio(url);
      routeMedia(voiceEl, vol);
      /* 声の長さが分かったら、言い終わる時刻を声の終わりまで延ばす */
      const v = voiceEl;
      v.addEventListener('loadedmetadata', () => { if (v === voiceEl && isFinite(v.duration)) speakEnd = Math.max(speakEnd, Date.now() + v.duration * 1000 + 200); });
      voiceEl.play().catch(() => { /* まだ画面に触れていないなど */ });
    } catch (e) { /* 声が無くても遊べる */ }
  }
  /* タッグ: 後ろに下がる / 前に出る */
  function setBack(on) { el.classList.toggle('av-back', !!on); }
  function destroy() { clearTimeout(faceTimer); clearTimeout(sayTimer); clearTimeout(blinkTimer); clearTimeout(speakTimer); if (voiceEl) voiceEl.pause(); el.remove(); }
  /** 言い終わるまでの残り (ミリ秒)。0 なら話していない */
  const idleIn = () => Math.max(0, speakEnd - Date.now());
  return { react, say, setFace, setBack, setVoice, destroy, idleIn, id, el };
}
