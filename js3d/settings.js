/* =========================================================================
 * 設定 (演出の速さ・音量・発動の待ち時間) と、その画面
 *   ブラウザに保存し、次に開いたときも同じにする。
 *   タイトルの OPTION と、対戦中の上のバーの ⚙ から同じ画面を開く。
 * ========================================================================= */
import { BGM_RELEASED } from './rewards.js';
import { openDiscord, copyReportInfo, addReportLines, canCopyScreenshot, copyScreenshot } from './support.js';
import { raise } from './dialogs.js';
import { setMotionPrefs, osReducedMotion, calm } from './prefs.js';
import { isMuted, setMuted, onMuteChange } from './audio.js';
import { isPhoneLike } from './envcheck.js';
const BGM_SHOWN = true;                 // 対戦の BGM (bgm.js の BATTLE_BGM_ON) があるので音量は出す

const KEY = 'compileSettings';
/* 対戦のキャラの項目 (相手の声・クレジット) を見せるか。キャラを出すまでは管理者だけ (main.js が決める) */
let avatarOptionsShown = () => false;
let avatarList = () => [];
/* shown: キャラの項目を見せるか。list: 相手に選べるキャラ [[id, 名前], ...] */
export function setAvatarOptionsGate(shown, list) { avatarOptionsShown = shown; if (list) avatarList = list; }
/* mat 以下は見た目 (レベルの報酬、cosmetics-ui.js) */
/* autoPick: 選べるものが1つしかない選択は自動で選ぶ (最初はオフ。何が選ばれたか分からないまま進むことがあったので) / oppSummary: 相手の番のまとめ / beginner: 初心者モード (おすすめの手の HINT を出す。最初はオフ) */
const DEFAULTS = { speed: 1, sfx: 80, bgmVol: 30, voiceVol: 80, bgm: 'burst', bgmMenu: '', bgmBattle: '', pauses: true, autoPick: false, oppSummary: true, beginner: false, gamepad: false, foil: true, mat: 'neon', sleeve: 'default', marker: 'default', ccolor: 'default',
  victory: 'default', title: '', icon: '',
  /* おまかせで今すぐ始める: 相手の強さ (0 かんたん / 1 ふつう / 2 つよい) と、今日のデイリーのプロトコルを自分に入れるか */
  quickLevel: 0, quickDaily: false,
  /* 対戦のそばのキャラ (アバター) の key (avatar.js の AVATARS)。false なら出さない。oppVoice: 相手のキャラの声 */
  avatar: 'shion', oppVoice: true, avatarShow: true, oppAvatar: 'random',
  /* 見やすさ: 画質 ('auto' / 'high' / 'normal' / 'light')・省電力 (30 コマ)・動きを減らす ('auto' は端末の設定に合わせる)・振動・
     文字の大きさ ('normal' / 'large')・くっきり表示 (板を濃く、薄い文字を明るく) */
  gfx: 'auto', powerSave: false, motion: 'auto', vibrate: true, textSize: 'normal', contrast: false };
/* 「初期設定に戻す」で戻す項目 (この画面で変えられるもの。COLLECTION で選んだ見た目とキャラは戻さない) */
const RESETTABLE = ['speed', 'sfx', 'bgmVol', 'voiceVol', 'pauses', 'autoPick', 'oppSummary', 'beginner', 'gamepad', 'foil', 'quickLevel', 'quickDaily',
  'oppVoice', 'avatarShow', 'oppAvatar', 'gfx', 'powerSave', 'motion', 'vibrate', 'textSize', 'contrast'];
const GFX_MODES = [['auto', '自動'], ['high', '高'], ['normal', '標準'], ['light', '軽量']];
const GFX_LEVEL_NAMES = ['高', '標準', '軽め', '軽量'];           // stage.js の段 (0〜3)
const MOTION_MODES = [['auto', '端末に合わせる'], ['less', '減らす'], ['full', '減らさない']];
const QUICK_LEVELS = ['かんたん', 'ふつう', 'つよい'];
const SPEEDS = [
  { v: 0.65, label: 'ゆっくり' },          // 何が起きたかを1つずつ追いたい人向け
  { v: 1, label: 'ふつう' },
  { v: 1.6, label: 'はやい' },
  { v: 2.5, label: 'とてもはやい' }
];

let current = load();
const listeners = [];
/* 文字の大きさ・くっきり表示・動きを減らすを、画面全体 (html / body の印と --text-scale) に当てる */
function applyLook(s) {
  try {
    const root = document.documentElement;
    root.classList.toggle('ui-big', s.textSize === 'large');
    root.style.setProperty('--text-scale', s.textSize === 'large' ? '1.15' : '1');
    document.body.classList.toggle('hi-contrast', !!s.contrast);
  } catch (e) { /* 画面がまだ無い (テスト) */ }
  setMotionPrefs(s);
}
applyLook(current);
/* 画質の段と FPS を見る口 (main.js が 3D の画面を作ったら渡す)。() => { level, fps, mode, auto } */
let gfxSource = () => null;
export function setGfxSource(fn) { gfxSource = fn; }
/* ログインしているか (account.js が渡す)。ログイン中は「この設定はアカウントにも保存されます」と添える */
let signedIn = () => false;
export function setSignedInGate(fn) { signedIn = fn; }
/* 報告用の情報に、初期値から変えた設定を入れる (見た目・名前は入れない) */
addReportLines(() => {
  const diff = RESETTABLE.filter(k => current[k] !== DEFAULTS[k]).map(k => k + '=' + current[k]);
  return ['変えた設定: ' + (diff.length ? diff.join(' ') : 'なし') + (isMuted() ? ' (音はすべてオフ)' : '')];
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...raw };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function settings() {
  return current;
}

export function setSetting(key, value) {
  setSettings({ [key]: value });
}
/** いくつかまとめて変える (知らせは1回) */
export function setSettings(patch) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) { /* private mode */ }
  applyLook(current);
  for (const cb of listeners) cb(current);
}


const volText = (v) => (+v ? String(v) : 'オフ');
/* 「画質」の下の小さな文: 自動ならいまの段と FPS */
function gfxNowText(s) {
  const g = gfxSource();
  if (!g) return (s.gfx || 'auto') === 'auto' ? '自動: 重い端末では軽くします' : '';
  const name = GFX_LEVEL_NAMES[g.level] || '?';
  return ((s.gfx || 'auto') === 'auto' ? 'いまの自動: ' + name : 'いま: ' + name) + (g.fps ? ' (' + g.fps + ' fps)' : '');
}
/* 左下の 🔊 で切り替えたときも、設定の「すべての音」の印を合わせる */
onMuteChange((m) => { const c = document.getElementById('stAllSound'); if (c) c.checked = !m; });

/* 設定が変わったら (と、登録した直後に一度) cb(settings) を呼ぶ */
export function onSettings(cb) {
  listeners.push(cb);
  cb(current);
}

/* 設定の画面を「左に項目の一覧、右にその中身」に組み替える (幅が狭いときは一覧が上の1段になる)。
   見出し (.st-group) ごとに、次の見出しまでをひとつの中身にまとめる。最後に開いていた項目を覚えておく */
let lastPane = '';
function framePanes(card) {
  const heads = [...card.querySelectorAll(':scope > .st-group')];
  if (!heads.length) return;
  const frame = document.createElement('div');
  frame.className = 'st-frame';
  const nav = document.createElement('div');
  nav.className = 'st-nav';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-orientation', 'vertical');
  const body = document.createElement('div');
  body.className = 'st-body pz-scroll';
  heads[0].before(frame);
  frame.append(nav, body);
  const names = heads.map(h => h.textContent);
  heads.forEach((h, i) => {
    const pane = document.createElement('section');
    pane.className = 'st-pane';
    pane.id = 'stPane' + i;
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-label', names[i]);
    for (let n = h.nextElementSibling; n && !n.classList.contains('st-group') && n !== frame; ) {
      const next = n.nextElementSibling;
      pane.append(n);
      n = next;
    }
    h.remove();
    body.append(pane);
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', pane.id);
    tab.textContent = names[i];
    tab.onclick = () => select(i);
    nav.append(tab);
  });
  function select(i) {
    lastPane = names[i];
    [...nav.children].forEach((t, k) => { t.classList.toggle('on', k === i); t.setAttribute('aria-selected', String(k === i)); });
    [...body.children].forEach((p, k) => { p.hidden = k !== i; });
    body.scrollTop = 0;
  }
  select(Math.max(0, names.indexOf(lastPane)));
}

/* 設定画面。項目は「音」「対戦の進み方」「おまかせで対戦」「見た目」「キャラ」に分け、左の一覧で選んで右に中身を出す (framePanes)。
   extra: 一番上の「この対戦」に並べるボタン [{ label, onClick, note?, warn? }] (対戦中の歯車から開いたときの「メニューに戻る」など) */
export function openSettings(extra) {
  let el = document.getElementById('settingsOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'settingsOv';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  const s = current;
  el.innerHTML = '<div class="pz-card st-card" role="dialog" aria-modal="true" aria-label="設定">' +
    '<div class="pz-head"><b>SETTINGS<small>設定</small></b><button type="button" class="pz-x"><span>閉じる</span></button></div>' +
    (signedIn() ? '<p class="st-synced">この設定はアカウントにも保存されます (別の端末でも同じ設定になります)</p>' : '') +
    (extra && extra.length
      ? '<h4 class="st-group">この対戦</h4>' + extra.map((x, i) => '<div class="st-row st-act"><span>' + x.label + (x.note ? '<small>' + x.note + '</small>' : '') + '</span>' +
          '<button type="button" data-extra="' + i + '" class="' + (x.warn ? 'warn' : '') + '">' + (x.button || x.label) + '</button></div>').join('')
      : '') +
    '<h4 class="st-group">音</h4>' +
    /* すべての音: 左下の 🔊 と同じ (BGM・声・効果音をまとめて止める) */
    '<label class="st-row st-check st-master"><span>すべての音<small>オフにすると BGM・キャラの声・効果音をまとめて止めます (左下の 🔊 と同じ)</small></span>' +
      '<input type="checkbox" id="stAllSound"' + (isMuted() ? '' : ' checked') + '></label>' +
    /* 音量: BGM・キャラの声・効果音 (0 でオフ) */
    (BGM_SHOWN ? '<label class="st-row"><span>BGM の音量 <i id="stBgmV">' + volText(s.bgmVol ?? 30) + '</i></span>' +
      '<input type="range" min="0" max="100" step="5" id="stBgm" value="' + (s.bgmVol ?? 30) + '"></label>' : '') +
    '<label class="st-row"><span>キャラの声の音量 <i id="stVoiceV">' + volText(s.voiceVol ?? 80) + '</i></span>' +
      '<input type="range" min="0" max="100" step="5" id="stVoice" value="' + (s.voiceVol ?? 80) + '"></label>' +
    '<label class="st-row"><span>効果音の音量 <i id="stSfxV">' + volText(s.sfx) + '</i></span>' +
      '<input type="range" min="0" max="100" step="5" id="stSfx" value="' + s.sfx + '"></label>' +
    /* サウンドテスト (sound-test.html): キャラの声・効果音・BGM を鳴らして確かめる。キャラが見える人にだけ (公開前のキャラの声が入っているため) */
    (avatarOptionsShown() ? '<div class="st-row st-act"><span>サウンドテスト<small>キャラのセリフ・効果音・BGM を1つずつ鳴らせます (別の画面で開きます)</small></span>' +
      '<button type="button" id="stSoundTest">開く</button></div>' : '') +
    '<h4 class="st-group">対戦の進み方</h4>' +
    '<div class="st-row"><span>演出の速さ</span><div class="st-seg" role="group" aria-label="演出の速さ">' +
      SPEEDS.map(o => '<button type="button" data-speed="' + o.v + '" class="' + (s.speed === o.v ? 'on' : '') + '">' + o.label + '</button>').join('') +
    '</div>' +
      /* 速さの見本: カードが1枚、置き場へ動く (押すたびにその速さで1回) */
      '<div class="st-speedpv" aria-hidden="true"><i></i><b></b></div></div>' +
    '<label class="st-row st-check"><span>効果が続けて起きるとき、1つずつ止める<small>オフにすると、続けて起きた効果を止めずにまとめて進めます</small></span>' +
      '<input type="checkbox" id="stPauses"' + (s.pauses ? ' checked' : '') + '></label>' +
    '<label class="st-row st-check"><span>選べるものが1つなら自動で選ぶ<small>対象が1つしかない選択は、確認せずに進めます</small></span>' +
      '<input type="checkbox" id="stAutoPick"' + (s.autoPick ? ' checked' : '') + '></label>' +
    '<label class="st-row st-check"><span>相手の番のまとめを出す<small>相手の番が終わったら、何をしたかを短く出します</small></span>' +
      '<input type="checkbox" id="stOppSummary"' + (s.oppSummary ? ' checked' : '') + '></label>' +
    '<label class="st-row st-check"><span>初心者モード<small>CPU 戦で HINT ボタンを出します。押すと、CPU ならどう打つかを盤面で光らせます。はじめての方は最初からオンです</small></span>' +
      '<input type="checkbox" id="stBeginner"' + (s.beginner ? ' checked' : '') + '></label>' +
    '<label class="st-row st-check"><span>ゲームパッドで遊ぶ<small>Xbox・プレステなどのコントローラーで操作します。オンにしたら、コントローラーのボタンを1回押してください</small></span>' +
      '<input type="checkbox" id="stGamepad"' + (s.gamepad ? ' checked' : '') + '></label>' +
    /* キーボードの近道 (main.js)。どこにも書いていないと使われないので、ここに一覧 */
    '<div class="st-row st-keys"><span>キーボードの近道<small>Z 1手戻す ・ H ヒント ・ R 補充 (2回) ・ L ログ ・ I 詳細 ・ 1〜3 置く場所 (Shift で裏) ・ Esc 選び直す / 戻る</small></span></div>' +
    '<h4 class="st-group">おまかせで対戦</h4>' +
    '<div class="st-row"><span>おまかせで対戦する強さ<small>「おまかせで今すぐ始める」の相手</small></span><div class="st-seg" role="group" aria-label="おまかせで対戦する強さ">' +
      QUICK_LEVELS.map((label, i) => '<button type="button" data-qlevel="' + i + '" class="' + ((s.quickLevel | 0) === i ? 'on' : '') + '">' + label + '</button>').join('') +
    '</div></div>' +
    '<label class="st-row st-check"><span>おまかせの編成にデイリーのプロトコルを入れる<small>今日のデイリーミッションで指定されたプロトコルを、自分の3つのうち1つに必ず入れます</small></span>' +
      '<input type="checkbox" id="stQuickDaily"' + (s.quickDaily ? ' checked' : '') + '></label>' +
    '<h4 class="st-group">見た目</h4>' +
    '<div class="st-row"><span>画質<small id="stGfxNow">' + gfxNowText(s) + '</small></span><div class="st-seg" role="group" aria-label="画質">' +
      GFX_MODES.map(([v, label]) => '<button type="button" data-gfx="' + v + '" class="' + ((s.gfx || 'auto') === v ? 'on' : '') + '">' + label + '</button>').join('') +
    '</div></div>' +
    /* 省電力はスマホ・タブレットだけ (PC は電池より滑らかさ) */
    (isPhoneLike() || s.powerSave ? '<label class="st-row st-check"><span>省電力<small>1秒に描く回数を 30 までにします。電池の持ちがよくなり、熱くなりにくくなります</small></span>' +
      '<input type="checkbox" id="stPowerSave"' + (s.powerSave ? ' checked' : '') + '></label>' : '') +
    '<div class="st-row"><span>文字の大きさ<small>対戦のログ・お知らせ・設定などの文字</small></span><div class="st-seg" role="group" aria-label="文字の大きさ">' +
      [['normal', '標準'], ['large', '大']].map(([v, label]) => '<button type="button" data-tsize="' + v + '" class="' + ((s.textSize || 'normal') === v ? 'on' : '') + '">' + label + '</button>').join('') +
    '</div></div>' +
    '<label class="st-row st-check"><span>くっきり表示<small>板の背景を濃くし、薄い文字を明るくします</small></span>' +
      '<input type="checkbox" id="stContrast"' + (s.contrast ? ' checked' : '') + '></label>' +
    '<div class="st-row"><span>動きを減らす<small>' + (osReducedMotion() ? 'この端末は「視差効果を減らす」がオンです' : '端末の設定に合わせると、いまは減らしません') + '。減らすと、浮かぶ数字・画面の揺れ・紙吹雪などを止めます</small></span>' +
      '<div class="st-seg" role="group" aria-label="動きを減らす">' +
      MOTION_MODES.map(([v, label]) => '<button type="button" data-motion="' + v + '" class="' + ((s.motion || 'auto') === v ? 'on' : '') + '">' + label + '</button>').join('') +
    '</div></div>' +
    (navigator.vibrate ? '<label class="st-row st-check"><span>振動<small>カードを置いたとき・コンパイルしたときに、端末を短く震わせます</small></span>' +
      '<input type="checkbox" id="stVibrate"' + (s.vibrate !== false ? ' checked' : '') + '></label>' : '') +
    '<label class="st-row st-check"><span>カードのキラ加工<small>そのカードで勝った数で、縁と面が光る (銅 3勝・銀 10勝・金 25勝・ホロ 50勝)。文字の上には光を乗せません</small></span>' +
      '<input type="checkbox" id="stFoil"' + (s.foil ? ' checked' : '') + '></label>' +
    /* 見た目は専用の画面 (cosmetics-mode.js) で。実物どおりのプレビューと図鑑つき */
    '<div class="st-cosmetics"><div class="st-cos-head"><b>COLLECTION</b><small>盤面・スリーブ・マーカー・称号などは専用の画面で選べます</small></div>' +
      '<div class="pz-row"><button type="button" id="stCosOpen" class="pz-main">COLLECTION を開く</button></div></div>' +
    /* 対戦のキャラ: 相手の声のオンオフと、声と絵のクレジット (キャラが見える人にだけ) */
    (avatarOptionsShown()
      ? '<h4 class="st-group">キャラ</h4>' +
        '<label class="st-row st-check"><span>対戦でキャラを出す<small>画面の隅にキャラが出て、カードやコンパイルに合わせて表情を変え、ひとこと言います。自分のキャラは COLLECTION の「キャラ」で選べます</small></span>' +
          '<input type="checkbox" id="stAvatarShow"' + (s.avatarShow !== false ? ' checked' : '') + '></label>' +
        '<label class="st-row"><span>相手のキャラ<small>ふだんはランダム。自分と同じ子は選ばれません</small></span>' +
          '<select class="lv-pick" id="stOppAvatar">' + [['random', 'ランダム']].concat(avatarList()).map(([id, name]) =>
            '<option value="' + id + '"' + ((s.oppAvatar || 'random') === id ? ' selected' : '') + '>' + name + '</option>').join('') + '</select></label>' +
        '<label class="st-row st-check"><span>相手のキャラの声<small>相手のキャラ (ずんだもんたち) がしゃべるときの声。オフにすると吹き出しだけ出ます</small></span>' +
          '<input type="checkbox" id="stOppVoice"' + (s.oppVoice !== false ? ' checked' : '') + '></label>'
      : '') +
    '<h4 class="st-group">不具合・要望</h4>' +
    '<div class="st-row st-act"><span>Discord<small>不具合や要望は Discord で受け付けています。不具合のときは、下のボタンで情報をコピーして貼ってください</small></span>' +
      '<button type="button" id="stDiscord">Discord を開く</button></div>' +
    '<div class="st-row st-act"><span>報告用の情報<small>版・端末・画質・開いている画面・最近のエラー・変えた設定・途中で終わった対戦の記録 (名前や記録の中身は入りません)。コピーしたら Discord の #不具合 に貼ってください</small></span>' +
      '<button type="button" id="stReportCopy">コピー</button></div>' +
    (canCopyScreenshot() ? '<div class="st-row st-act"><span>画面の写しもコピー<small>いまの盤面の絵をコピーします。報告の文のあとに貼ってください</small></span>' +
      '<button type="button" id="stShotCopy">コピー</button></div>' : '') +
    '<p class="st-msg" id="stReportMsg" role="status"></p>' +
    '<h4 class="st-group">初期設定に戻す</h4>' +
    '<div class="st-row st-act"><span>初期設定に戻す<small>この画面の設定 (音量・速さ・見やすさなど) を最初の状態に戻します。COLLECTION で選んだ見た目とキャラはそのままです</small></span>' +
      '<button type="button" id="stReset" class="warn">戻す</button></div>' +
    '<p class="st-msg" id="stResetMsg" role="status"></p>' +
    '<h4 class="st-group">クレジット</h4>' +
    (avatarOptionsShown() ? '<p class="st-credit">キャラの声 VOICEVOX:ずんだもん / VOICEVOX:四国めたん / VOICEVOX:春日部つむぎ / VOICEVOX:WhiteCUL　立ち絵 坂本アヒル</p><p class="st-credit">紫苑・茜・瑠璃・杏の声 ElevenLabs</p>' : '') +
    '<p class="st-credit">BGM 煉獄庭園 (Z･E･R･O・彷徨いの言葉は天に導かれ' + (BGM_RELEASED ? '・オレンジトンネルを抜ける・Burst ほか' : '') + ') / OpenTracks: Yuyake Monster「超頭脳バトル」・まんぼう二等兵「Reflect」「Crescendo Jitter」「プラネタリウムガーデン」「Nine Jack」「沈殿するイルカ」・田中芳典「解読」・NEKOZOU「まどろむネオンの部屋」 ほか (COLLECTION の BGM の曲は、それぞれの見本に作者を記載) / PeriTune / 音楽：魔王魂 / BGM：hitoshi by Senses Circuit</p>' +
    '</div>';
  framePanes(el.querySelector('.st-card'));
  el.classList.add('show');
  raise(el);   // 開いたままの画面をもう一度開いたときも、いちばん手前へ
  const close = () => el.classList.remove('show');
  el.onclick = (ev) => { if (ev.target === el) close(); };
  el.querySelector('.pz-x').onclick = close;
  /* 速さの見本: 押した速さで、カードが置き場まで動く (ふつうで 0.9 秒。動きを減らす設定では動かさず、秒だけ出す) */
  const pv = el.querySelector('.st-speedpv');
  const pvText = (v) => { pv.querySelector('b').textContent = '1 枚の演出 ≈ ' + (0.9 / v).toFixed(1) + ' 秒'; };
  pvText(s.speed || 1);
  const preview = (v) => {
    pvText(v);
    if (calm()) return;
    pv.classList.remove('go');
    void pv.offsetWidth;                    // 動きを最初からやり直す
    pv.style.setProperty('--pv-ms', Math.round(900 / v) + 'ms');
    pv.classList.add('go');
  };
  el.querySelectorAll('[data-speed]').forEach(b => {
    b.onclick = () => {
      setSetting('speed', +b.dataset.speed);
      el.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b));
      preview(+b.dataset.speed);
    };
  });
  /* 2つ以上から1つを選ぶ段 (画質・文字の大きさ・動きを減らす) */
  const seg = (attr, key, after) => el.querySelectorAll('[data-' + attr + ']').forEach(b => {
    b.onclick = () => {
      setSetting(key, b.dataset[attr]);
      el.querySelectorAll('[data-' + attr + ']').forEach(x => x.classList.toggle('on', x === b));
      if (after) after();
    };
  });
  const gfxNow = () => { const n = el.querySelector('#stGfxNow'); if (n) n.textContent = gfxNowText(current); };
  seg('gfx', 'gfx', () => setTimeout(gfxNow, 50));
  seg('tsize', 'textSize');
  seg('motion', 'motion');
  const check = (id, key) => { const c = el.querySelector(id); if (c) c.onchange = (ev) => setSetting(key, ev.target.checked); };
  check('#stPowerSave', 'powerSave');
  check('#stContrast', 'contrast');
  check('#stVibrate', 'vibrate');
  const all = el.querySelector('#stAllSound');
  all.onchange = (ev) => setMuted(!ev.target.checked);
  /* 初期設定に戻す: 1回目で確かめ、もう一度押したら戻す */
  const reset = el.querySelector('#stReset');
  reset.onclick = () => {
    if (!reset.dataset.armed) { reset.dataset.armed = '1'; reset.textContent = 'もう一度押すと戻します'; return; }
    const patch = {};
    for (const k of RESETTABLE) patch[k] = DEFAULTS[k];
    setSettings(patch);
    setMuted(false);
    openSettings(extra);                    // 戻した値で描き直す
    const m = document.getElementById('stResetMsg');
    if (m) m.textContent = '初期設定に戻しました';
  };
  const range = (id, key, out) => {
    const input = el.querySelector(id);
    input.oninput = () => { el.querySelector(out).textContent = volText(+input.value); setSetting(key, +input.value); };
  };
  range('#stSfx', 'sfx', '#stSfxV');
  if (BGM_SHOWN) range('#stBgm', 'bgmVol', '#stBgmV');
  range('#stVoice', 'voiceVol', '#stVoiceV');
  el.querySelector('#stPauses').onchange = (ev) => setSetting('pauses', ev.target.checked);
  el.querySelector('#stAutoPick').onchange = (ev) => setSetting('autoPick', ev.target.checked);
  el.querySelector('#stOppSummary').onchange = (ev) => setSetting('oppSummary', ev.target.checked);
  el.querySelector('#stBeginner').onchange = (ev) => setSetting('beginner', ev.target.checked);
  el.querySelector('#stGamepad').onchange = (ev) => setSetting('gamepad', ev.target.checked);
  el.querySelector('#stFoil').onchange = (ev) => setSetting('foil', ev.target.checked);
  el.querySelector('#stQuickDaily').onchange = (ev) => setSetting('quickDaily', ev.target.checked);
  const avShow = el.querySelector('#stAvatarShow');
  if (avShow) avShow.onchange = (ev) => setSetting('avatarShow', ev.target.checked);
  const oppAv = el.querySelector('#stOppAvatar');
  if (oppAv) oppAv.onchange = (ev) => setSetting('oppAvatar', ev.target.value);
  const oppVoice = el.querySelector('#stOppVoice');
  if (oppVoice) oppVoice.onchange = (ev) => setSetting('oppVoice', ev.target.checked);
  el.querySelectorAll('[data-qlevel]').forEach(b => {
    b.onclick = () => {
      setSetting('quickLevel', +b.dataset.qlevel);
      el.querySelectorAll('[data-qlevel]').forEach(x => x.classList.toggle('on', x === b));
    };
  });
  el.querySelector('#stDiscord').onclick = () => openDiscord();
  const st = el.querySelector('#stSoundTest');
  if (st) st.onclick = () => { if (!window.open('sound-test.html', '_blank')) location.href = 'sound-test.html'; };
  const reportMsg = el.querySelector('#stReportMsg');
  el.querySelector('#stReportCopy').onclick = async (ev) => {
    const msg = await copyReportInfo();
    if (msg) { ev.target.textContent = 'コピーしました'; reportMsg.textContent = msg; setTimeout(() => { ev.target.textContent = 'コピー'; }, 2400); }
  };
  const shot = el.querySelector('#stShotCopy');
  if (shot) shot.onclick = async () => { reportMsg.textContent = await copyScreenshot(); };
  el.querySelector('#stCosOpen').onclick = () => import('./cosmetics-mode.js').then(m => m.openCosmetics());   // 重ねて開く (戻ると設定に戻る)
  el.querySelectorAll('[data-extra]').forEach(b => {
    b.onclick = () => { const x = extra[+b.dataset.extra]; if (x) x.onClick(b); };
  });
}
