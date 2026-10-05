/* =========================================================================
 * はじめて開いた人・スマホの人への、遊びを止めない小さな案内 (notice.js のカード。× で閉じるまで残る)
 *   ・アプリの中のブラウザ (LINE など) で開いた → ふつうのブラウザで開き直すと音やログインが使える
 *   ・iPhone で初めて → 音が出ないときはマナースイッチ
 *   ・はじめての人 → 初心者モードを最初からオン (最初の CPU 戦で「オフにできます」と伝える)
 *   ・スマホを縦持ちで最初の対戦 → 横持ちがおすすめ (1回だけ)
 *   ・スマホで何戦か遊んだ → ホーム画面に追加 (1回だけ。Android は追加の画面、iPhone は手順)
 *   ・設定がオフのときにコントローラーをつないだ → 「使う?」(このタブで1回)
 *   ・オフラインでも開けるように、控えめなサービスワーカー (sw.js) を登録する
 * ========================================================================= */
import { notice, once, seen, markSeen } from './notice.js';
import { inAppBrowser, isIOSDevice, isPhoneLike } from './envcheck.js';
import { settings, setSetting } from './settings.js';

const COUNT_KEY = 'compileMatchCount';
const INSTALL_AFTER = 3;                 // この数だけ対戦を始めたら「ホーム画面に追加」を出す
let installPrompt = null;               // Android の Chrome などが渡す「追加」の画面

const standalone = () => {
  try { return matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true; } catch (e) { return false; }
};
const sessionOnce = (key) => {
  try { if (sessionStorage.getItem(key)) return false; sessionStorage.setItem(key, '1'); } catch (e) { /* 毎回出ても困らない */ }
  return true;
};

/** 起動時に1回 (main.js)。newcomer: まだ1戦もしていない人か (title.js の isNewcomer) */
export function initFirstRun({ newcomer }) {
  registerServiceWorker();
  window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); installPrompt = ev; });
  window.addEventListener('appinstalled', () => { installPrompt = null; markSeen('installHint'); });
  const app = inAppBrowser();
  if (app && sessionOnce('compileInAppNote')) {
    notice({ id: 'inapp', title: app + ' の中で開いています', tone: 'warn',
      text: 'このままだと音やログインが使えないことがあります。右上 (または下) のメニューから「ブラウザで開く」を選び、Chrome か Safari で開くのがおすすめです' });
  }
  /* iPhone はマナーモードだとゲームの音も止まる (audio.js の「環境音」の扱い) */
  if (isIOSDevice() && once('iosMuteNote')) {
    notice({ id: 'iosmute', title: '音について', text: '音が出ないときは、iPhone の横のマナースイッチ (着信/サイレント) を確認してください' });
  }
  /* はじめての人は、初心者モード (CPU 戦の HINT) を最初からオンにする。自分で切ったあとは戻さない */
  if (newcomer && once('beginnerAuto') && !settings().beginner) setSetting('beginner', true);
  window.addEventListener('compile:gamepad-offer', () => {
    if (settings().gamepad || !sessionOnce('compileGamepadOffer')) return;
    notice({ id: 'gamepad', title: 'コントローラーを検出', text: 'コントローラーで操作しますか? (あとから設定の「ゲームパッドで遊ぶ」で変えられます)',
      actions: [{ label: '使う', main: true, onClick: () => setSetting('gamepad', true) }] });
  });
}

/** 対戦を始めたとき (main.js)。kind: 'cpu' (ふつうの CPU 戦など) / 'tutorial' / 'other' (問題・観戦・リプレイ) */
export function onMatchStart(kind) {
  if (kind === 'other') return;
  let n = 0;
  try { n = (parseInt(localStorage.getItem(COUNT_KEY), 10) || 0) + 1; localStorage.setItem(COUNT_KEY, String(n)); } catch (e) { /* 数えられなければ追加の案内は出さない */ }
  /* 初心者モードを自分で入れたのではないことを、最初の CPU 戦で伝える (HINT ボタンが出る対戦) */
  if (kind === 'cpu' && seen('beginnerAuto') && settings().beginner && once('beginnerTold')) {
    notice({ id: 'beginner', title: '初心者モード: オン', text: '困ったら HINT を押すと、CPU ならどう打つかが光ります。慣れたら設定の「対戦の進み方」でオフにできます' });
  }
  /* 縦持ちのスマホ: 盤面が小さくなるので横持ちを勧める (遊ぶのは止めない) */
  if (isPhoneLike() && window.innerHeight > window.innerWidth && once('landscapeTip')) {
    notice({ id: 'landscape', title: '横持ちがおすすめ', text: 'スマホを横にすると、盤面とカードが大きく見えます。縦のままでも遊べます' });
  }
  if (n >= INSTALL_AFTER && isPhoneLike() && !standalone() && !seen('installHint')) showInstallHint();
}

function showInstallHint() {
  if (installPrompt) {
    markSeen('installHint');
    notice({ id: 'install', title: 'ホーム画面に追加', text: 'アプリのように全画面で、すぐ開けるようになります',
      actions: [{ label: '追加する', main: true, onClick: () => { const p = installPrompt; installPrompt = null; try { p.prompt(); } catch (e) { /* 出せなければ何もしない */ } } }] });
  } else if (isIOSDevice()) {
    markSeen('installHint');
    notice({ id: 'install', title: 'ホーム画面に追加', text: 'Safari の下の共有ボタン (□↑) →「ホーム画面に追加」で、アプリのように全画面で開けます' });
  }
  /* どちらでもない (追加の画面を出せないブラウザ) ときは、出さずに次の機会を待つ */
}

/* サービスワーカー: https で、手元の確認 (localhost) ではないときだけ。
   ?nosw=1 で開くか、サイトに sw-off があれば登録を外す (困ったときの止め方。sw.js の頭を参照) */
function registerServiceWorker() {
  try {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
    const off = new URLSearchParams(location.search).get('nosw') === '1';
    const unregisterAll = () => navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))).catch(() => {});
    if (off) { unregisterAll(); return; }
    /* 起動を遅らせないよう、読み込みが落ち着いてから */
    setTimeout(() => {
      fetch('sw-off', { cache: 'no-store' }).then(r => (r.ok ? unregisterAll() : navigator.serviceWorker.register('sw.js').catch(() => {}))).catch(() => {
        /* オフラインなどで確かめられないときは、登録だけ済ませる (前の登録があればそのまま) */
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }, 4000);
  } catch (e) { /* 登録できなくても遊べる */ }
}
