/* =========================================================================
 * 3Dビュー: タイトルとモード選択
 * ========================================================================= */
import { playBgm, menuBgm } from './bgm.js';
import { xpLog } from './xp.js';
import { displayName, onDisplayNameChange } from './displayname.js';
import { dailyView } from './daily.js';
import { emblemDataURL } from './emblems.js';
import { iconArt } from './face-icons.js';
import { drawTitleBackdrop } from './backdrops.js';
import { initAudio, sfx } from './audio.js';
import { openSettings } from './settings.js';
import { openStats } from './stats.js';
import { openAccount, accountState, onAccountChange, loginNudgeNeeded } from './account.js';
import { openAdmin } from './admin-ui.js';
import { openReport } from './support.js';
import { openCardList } from './cardlist-ov.js';
import { settings } from './settings.js';
import { profileOf } from './cosmetics-ui.js';
import { localRecords } from './stats.js';
import { openProfile } from './profile.js';
import { openGacha, chipsNow } from './gacha-ui.js';
import { openCosmetics, hasNewCosmetics } from './cosmetics-mode.js';
import { loadResume, resumeLabel } from './resume.js';
import { loadRun, nodeById, MAP_ROWS } from './run.js';
import { loadWeekly } from './weekly.js';
import { conquered, conquerable } from './stats-data.js';

const BOOT_LINES = [
  '> COMPILE OS v3.1 — boot sequence initiated',
  '> loading protocols .......... 30/30 OK',
  '> arena renderer ............. OK',
  '> audio synthesizer .......... OK',
  '> control component .......... NEUTRAL',
  '> awaiting operator input _'
];

const STARTED_KEY = 'compileStarted';

/* メニューのボタンの右上の小さな札 (いまの進み具合。押す前に「続きがある」「まだやっていない」が分かる) */
const badge = (b) => (b ? '<i class="tt-badge' + (b.hot ? ' hot' : '') + '">' + b.text + '</i>' : '');
function runBadge() {
  try {
    const run = loadRun();
    if (run && run.phase !== 'over' && run.phase !== 'clear') {
      const n = nodeById(run, run.pos);
      return { text: '続き ' + (n ? n.row + 1 : 1) + '/' + MAP_ROWS + '段', hot: true };
    }
    const w = loadWeekly();
    if (w.phase === 'clear') return null;
    if (w.phase === 'battle' || w.phase === 'choose') return { text: 'WEEKLY 第' + (w.stage + 1) + '戦', hot: true };
    if (!w.attempt) return { text: 'WEEKLY 未挑戦' };
  } catch (e) { /* 札なしで */ }
  return null;
}
function chipBadge() {
  try { const n = chipsNow(); return n > 0 ? '<i class="tt-chipn" aria-label="CHIP ' + n + '">CHIP ' + n + '</i>' : ''; } catch (e) { return ''; }
}
function challengeBadge(protocols) {
  try {
    const total = conquerable(protocols.map(p => p.name)).length;
    const n = conquered(localRecords()).size;
    return n < total ? { text: '制覇 ' + n + '/' + total } : null;
  } catch (e) { return null; }
}    // このタブで START を押した (sessionStorage)

/* COLLECTION を閉じたら (タイトル・プロフィール・設定・報酬のどこから開いても)、見終わった NEW の印を消す */
window.addEventListener('compile:cosmetics-closed', () => {
  const d = document.querySelector('#title .tt-cos .tt-newdot');
  if (d && !hasNewCosmetics()) d.remove();
});

/* まだ1戦もしておらず、チュートリアルも1つも終えていない人 */
function isNewcomer() {
  return !localRecords().length && !xpLog().some(e => /^k:tu:/.test(e.id || ''));
}

/* レベル・称号・アイコン (設定の「見た目」で選んだもの) */
function profileChip(protocols) {
  const p = profileOf(settings(), localRecords());
  const art = iconArt(p.icon, protocols, 40);
  /* 押すとプロフィール (レベル・経験値・次の報酬) が開く */
  return '<button type="button" data-mode="profile" class="tt-profile" aria-label="プロフィール">' +
    (art ? '<img alt="" class="' + (art.face ? 'face' : '') + '" src="' + art.src + '">' : '') +
    '<b>LV ' + p.level + '</b>' + (p.title ? '<small>' + p.title + '</small>' : '') + dailyBadge(protocols) + '</button>';
}

/* 今日のデイリーミッションの残り (全部済んでいれば出さない)。
   前は今日の問題 (COMPUZZLE) の2つも足して 0/5 と出していて、決着の画面・プロフィールの 0/3 と食い違っていた。
   数えるのはミッションの3つだけにそろえる (今日の問題は COMPUZZLE の画面で分かる) */
function dailyBadge(protocols) {
  const list = dailyView(protocols.map(x => x.name));
  const done = list.filter(m => m.done).length;
  return done < list.length ? '<i class="tt-daily" title="デイリーミッション">DAILY ' + done + '/' + list.length + '</i>' : '';
}

/* ロゴの下の名前。押すとプロフィール (表示名を変えられる)。まだ決めていなければ決めるよう促す */
function helloHtml() {
  const name = displayName();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return '<button type="button" data-mode="profile" class="tt-hello' + (name ? '' : ' unset') + '" title="プロフィール・表示名">' +
    '<small>' + (name ? 'WELCOME BACK' : 'OPERATOR') + '</small>' +
    '<b>' + (name ? esc(name) : '名前を決める') + '</b></button>';
}

/* ロゴ: 「//」と COMPILE。グリッチ用に同じ文字を data-text に持たせる (CSS の ::before/::after でずらす) */
const LOGO = '<div class="tt-logo"><b>//</b><span data-text="COMPILE">COMPILE</span></div>' +
  '<div class="tt-sub">3D ARENA <i>·</i> PROTOCOL CARD BATTLE</div>';

/* 右側: 公式カードの絵を3枚、斜めに切り抜いて並べる。数秒ごとにグリッチをかけて別のプロトコルへ */
function startHero(el, protocols) {
  if (!el || !protocols.length) return () => {};
  const pick = () => {
    const pool = protocols.slice();
    const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  };
  const paint = () => {
    el.innerHTML = pick().map((p, i) => {
      const n = 1 + Math.floor(Math.random() * 6);
      return '<figure class="th-panel" style="--i:' + i + ';--pc:' + (p.color || '#b9a4ff') + '">' +
        '<img alt="" src="art/' + n + p.name.toLowerCase() + '.webp" loading="eager">' +
        '<figcaption><img alt="" src="' + emblemDataURL(p.name, p.color || '#b9a4ff', 40, true) + '">' + p.name + '</figcaption></figure>';
    }).join('');
  };
  paint();
  const t = setInterval(() => {
    el.classList.add('swap');
    setTimeout(() => { paint(); el.classList.remove('swap'); }, 360);
  }, 5200);
  return () => clearInterval(t);
}

/* ログイン中は「ACCOUNT」(名前は重ねたときの説明に)、していなければ「SIGN IN」 */
function accountLabel() {
  return accountState().user ? 'ACCOUNT' : 'SIGN IN';
}
function accountTitle() {
  const u = accountState().user;
  return u ? (displayName() || 'あなた').replace(/[&<>"]/g, '') + ' のアカウント' : 'Google でログイン';
}

export function runTitle(protocols, opts) {
  /* このタブで一度 START を押していたら、対戦のあとなどにタイトルへ戻ったときは起動演出を飛ばしてメニューから
     (毎回 PRESS START を押させていた)。音は、次に画面に触れたときに鳴らし始める */
  const startedBefore = (() => { try { return sessionStorage.getItem(STARTED_KEY) === '1'; } catch (e) { return false; } })();
  const menuOnly = !!(opts && opts.menuOnly) || startedBefore;    // ロビー等から戻るとき: 起動演出を飛ばしてメニューだけ
  const resumeRec = loadResume();
  const root = document.getElementById('title');
  if (!root) return Promise.resolve('single');
  const emblems = protocols
    .map(p => '<img alt="" src="' + emblemDataURL(p.name, p.color || '#b9a4ff', 72, true) + '">')
    .join('');
  root.innerHTML =
    '<canvas class="tt-art" aria-hidden="true"></canvas>' +
    '<div class="tt-hero" id="ttHero" aria-hidden="true"></div>' +
    '<div class="tt-scan"></div><div class="tt-log" id="ttLog"></div>' +
    '<div class="tt-center" id="ttCenter">' + LOGO +
      '<button class="tt-start" id="ttStart" type="button">PRESS START</button></div>' +
    '<div class="tt-marquee"><div class="tt-strip">' + emblems + emblems + '</div></div>' +
    '<div class="tt-foot">30 PROTOCOLS · 180 CARDS</div>' +
    /* 縦持ちのスマホだけに出す (CSS)。タイトル画面の部品なので、ほかの画面を開けば一緒に隠れて重ならない */
    /* 不具合・要望の入口は、メニュー画面にそのまま出しておく (MORE の中だと見つけにくい) */
    '<button type="button" class="tt-report" id="ttReport">不具合・要望</button>' +
    '<div class="tt-corner" id="ttCorner" hidden>' + profileChip(protocols) +
      '<button data-mode="admin" type="button" class="tt-admin"' + (accountState().admin ? '' : ' hidden') + '>ADMIN</button>' +
      '<button data-mode="account" type="button" class="tt-account" title="' + accountTitle() + '"><span>' + accountLabel() + '</span>' +
        '<small' + (accountState().user ? ' hidden' : '') + '>記録を保存・レート戦</small></button>' +
      '<button data-mode="options" type="button" class="tt-gear" title="設定 (演出・音)" aria-label="設定 (演出・音)">⚙</button>' +
    '</div>';
  root.classList.add('show');
  const art = root.querySelector('.tt-art');
  const paint = () => { if (art.isConnected) { try { drawTitleBackdrop(art); } catch (e) { /* 描けなくても従来の背景で進む */ } } };
  paint();
  window.addEventListener('resize', paint);
  const stopHero = startHero(root.querySelector('#ttHero'), protocols);
  const log = root.querySelector('#ttLog');
  let li = 0;
  const logTimer = setInterval(() => {
    if (li >= BOOT_LINES.length) { clearInterval(logTimer); return; }
    const div = document.createElement('div'); div.textContent = BOOT_LINES[li++]; log.appendChild(div);
  }, 210);
  return new Promise((resolve) => {
    let started = false;
    const onKey = (ev) => {
      if (!started && (ev.key === 'Enter' || ev.key === ' ')) start();
    };
    const finish = (mode) => {
      clearInterval(logTimer); stopHero(); window.removeEventListener('keydown', onKey); root.classList.add('gone');
      setTimeout(() => { root.classList.remove('show', 'gone'); root.innerHTML = ''; resolve(mode); }, 420);
    };
    const showMenu = () => {
      const center = root.querySelector('#ttCenter');
      center.innerHTML = LOGO + helloHtml() +
        /* 遊ぶ入口は大きく2つだけ。練習・記録は小さく下に、アカウントと設定は右上の隅に置く */
        '<nav class="tt-menu" aria-label="ゲームモード">' +
          /* はじめての人 (まだ1戦もせず、チュートリアルも触っていない) にだけ、最初の一歩を大きく出す */
          (isNewcomer()
            ? '<div class="tt-first"><b>はじめての方へ</b><span>遊び方は TUTORIAL で5分ほど。すぐ遊びたいなら「おまかせで1戦」</span>' +
              '<div><button data-mode="tutorial" type="button" class="go">TUTORIAL</button>' +
              '<button data-mode="quick" type="button">おまかせで1戦</button></div></div>'
            : '') +
          '<div class="tt-main">' +
            /* 中断した対戦があれば、いちばん上に「続きから」 (前は次にページを開き直したときしか聞かれなかった) */
            (resumeRec ? '<button data-mode="resumeGame" type="button" class="tt-resume">CONTINUE <small>' + resumeLabel(resumeRec).replace(/[&<>"]/g, '') + '</small></button>' : '') +
            '<button data-mode="single" type="button">SINGLE GAME <small>VS CPU</small></button>' +
            '<button data-mode="challenge" type="button">CHALLENGE <small>BOSS · UNDERDOG</small>' + badge(challengeBadge(protocols)) + '</button>' +
            '<button data-mode="run" type="button">RUN <small>ROGUELIKE · WEEKLY</small>' + badge(runBadge()) + '</button>' +
            '<button data-mode="online" type="button">ONLINE GAME <small>ROOMS · RATED</small></button>' +
          '</div>' +
          /* 下の段は4つだけ (ごちゃつかせない)。GACHA は COLLECTION の中、TUTORIAL・TRAINING・CARDS は MORE の中 */
          '<div class="tt-more">' +
            '<button data-mode="tsume" type="button">COMPUZZLE</button>' +
            /* CHIP の残りも小さく (ガチャを開くまで分からなかった) */
            '<button data-mode="cosmetics" type="button" class="tt-cos">COLLECTION' + (hasNewCosmetics() ? '<i class="tt-newdot" aria-label="新しい見た目"></i>' : '') +
              chipBadge() + '</button>' +
            '<button data-mode="record" type="button">RECORD</button>' +
            '<button data-mode="more" type="button" class="tt-morebtn" aria-expanded="false">MORE</button>' +
            '<div class="tt-morepop" hidden>' +
              /* ストーリーは作り直しの間 (案8。2026-10-05〜) 管理者だけ。仕上がったら全員に戻す */
              '<button data-mode="story" type="button"' + (accountState().admin ? '' : ' hidden') + '>STORY <small>序章「起動」</small></button>' +
              '<button data-mode="tutorial" type="button">TUTORIAL <small>遊び方</small></button>' +
              '<button data-mode="training" type="button">TRAINING <small>盤面を自由に</small></button>' +
              '<button data-mode="cards" type="button">CARDS <small>カード一覧</small></button>' +
            '</div>' +
          '</div>' +
        '</nav>';
      root.querySelector('#ttCorner').hidden = false;
      root.classList.add('menu');                    // 起動ログを隠し、左の列にメニューを出す
      /* ログイン状態は裏で読むので、分かったら表示を差し替える */
      const refreshAccount = () => {
        const label = root.querySelector('#ttCorner button[data-mode="account"] span');
        if (!label || !root.classList.contains('show')) return false;
        label.textContent = accountLabel();
        label.parentElement.title = accountTitle();
        const cap = label.parentElement.querySelector('small');
        if (cap) cap.hidden = !!accountState().user;
        /* 遊んだ記録があるのにログインしていなければ、ボタンを目立たせる (記録はこのブラウザだけ) */
        const nudge = loginNudgeNeeded() && (localRecords().length > 0 || xpLog().length > 0);
        label.parentElement.classList.toggle('nudge', nudge);
        if (cap && nudge) cap.textContent = '記録はこのブラウザだけ！';
        root.querySelector('#ttCorner button[data-mode="admin"]').hidden = !accountState().admin;
        const story = root.querySelector('button[data-mode="story"]');
        if (story) story.hidden = !accountState().admin;
        return true;
      };
      /* メニューを出す前にログイン状態が読み終わっていることがある (そのときの知らせは聞き逃している)。
         出した時点でも一度描き直す */
      refreshAccount();
      const offAccount = onAccountChange(() => { if (!refreshAccount()) offAccount(); });
      /* プロフィールやアカウントの画面で表示名を変えたら、ロゴの下も差し替える */
      const offName = onDisplayNameChange(() => {
        const old = root.querySelector('.tt-hello');
        if (!old || !root.classList.contains('show')) { offName(); return; }
        old.outerHTML = helloHtml();
      });
      const onMenu = (ev) => {
        const button = ev.target.closest('button[data-mode]');
        if (!button) return;
        sfx('select');
        /* 設定 (演出の速さ・効果音の音量・待ち時間)。音の ON/OFF は対戦中の 🔊 で */
        if (button.dataset.mode === 'options') openSettings();
        else if (button.dataset.mode === 'record') openStats();
        else if (button.dataset.mode === 'account') openAccount();
        else if (button.dataset.mode === 'admin') openAdmin();
        else if (button.dataset.mode === 'cards') openCardList();
        else if (button.dataset.mode === 'gacha') openGacha();
        else if (button.dataset.mode === 'more') {
          const pop = root.querySelector('.tt-morepop');
          pop.hidden = !pop.hidden;
          button.setAttribute('aria-expanded', String(!pop.hidden));
          /* 開いている間は、外を押す・Esc でも閉じる (前は MORE をもう一度押すしかなかった) */
          if (!pop.hidden) {
            const close = () => {
              pop.hidden = true;
              button.setAttribute('aria-expanded', 'false');
              document.removeEventListener('pointerdown', onOutside, true);
              document.removeEventListener('keydown', onEsc, true);
            };
            const onOutside = (ev) => { if (!pop.contains(ev.target) && !button.contains(ev.target)) close(); };
            const onEsc = (ev) => { if (ev.key === 'Escape') { close(); button.focus(); } };
            button._closeMore = close;
            document.addEventListener('pointerdown', onOutside, true);
            document.addEventListener('keydown', onEsc, true);
          } else if (button._closeMore) button._closeMore();
        }
        else if (button.dataset.mode === 'cosmetics') openCosmetics();
        /* 中断した対戦の続き: 開き直して、聞かずにそのまま続ける */
        else if (button.dataset.mode === 'resumeGame') { try { sessionStorage.setItem('compileResumeNow', '1'); } catch (e) { /* private mode */ } location.href = location.pathname; }
        else if (button.dataset.mode === 'profile') openProfile(protocols);
        else if (button.dataset.mode === 'quick') { location.href = location.pathname + '?quick=1'; }
        else finish(button.dataset.mode);
      };
      center.onclick = onMenu;                        // メニューとロゴの下の名前 (どちらも data-mode のボタン)
      root.querySelector('#ttReport').onclick = () => { sfx('select'); openReport(); };
      root.querySelector('#ttCorner').onclick = onMenu;
    };
    /* 先にメニューを出し、音はそのあと (失敗しても進める)。以前は音の初期化が先で、
       音を作れないブラウザ (アプリ内ブラウザ等) では例外でメニューが出ず、
       started だけ立って二度と押せなくなっていた */
    const start = () => {
      if (started) return;
      started = true;
      const btn = root.querySelector('#ttStart');
      if (btn) btn.remove();
      showMenu();
      try { sessionStorage.setItem(STARTED_KEY, '1'); } catch (e) { /* private mode */ }
      const sound = () => {
        try { initAudio(); sfx('turn'); } catch (e) { /* 音なしで続ける */ }
        playBgm(menuBgm());                         // タイトル・メニューの曲 (対戦以外)
      };
      /* 押さずに始まったとき (戻ってきたとき) は、ブラウザが音を止めているので、最初に触れたときに鳴らす */
      if (startedBefore && !(opts && opts.menuOnly)) document.addEventListener('pointerdown', sound, { once: true, capture: true });
      else sound();
    };
    root.querySelector('#ttStart').onclick = start;
    /* 画面のどこを押しても始まる (右上のレベル・ログイン・設定は除く) */
    const onTap = (ev) => {
      if (ev.target.closest('#ttCorner')) return;
      root.removeEventListener('click', onTap);
      start();
    };
    root.addEventListener('click', onTap);
    window.addEventListener('keydown', onKey);
    if (menuOnly) { clearInterval(logTimer); log.innerHTML = ''; start(); }
    if (opts && opts.after) opts.after();
  });
}
