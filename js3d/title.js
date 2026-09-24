/* =========================================================================
 * 3Dビュー: タイトルとモード選択
 * ========================================================================= */
import { dailyView } from './daily.js';
import { emblemDataURL } from './emblems.js';
import { drawTitleBackdrop } from './backdrops.js';
import { initAudio, sfx } from './audio.js';
import { openSettings } from './settings.js';
import { openStats } from './stats.js';
import { openAccount, accountState, onAccountChange } from './account.js';
import { openCardList } from './cardlist-ov.js';
import { settings } from './settings.js';
import { profileOf } from './cosmetics-ui.js';
import { localRecords } from './stats.js';
import { openProfile } from './profile.js';

const BOOT_LINES = [
  '> COMPILE OS v3.1 — boot sequence initiated',
  '> loading protocols .......... 30/30 OK',
  '> arena renderer ............. OK',
  '> audio synthesizer .......... OK',
  '> control component .......... NEUTRAL',
  '> awaiting operator input _'
];

/* レベル・称号・アイコン (設定の「見た目」で選んだもの) */
function profileChip(protocols) {
  const p = profileOf(settings(), localRecords());
  const proto = protocols.find(x => x.name === p.icon);
  /* 押すとプロフィール (レベル・経験値・次の報酬) が開く */
  return '<button type="button" data-mode="profile" class="tt-profile" aria-label="プロフィール">' +
    (proto ? '<img alt="" src="' + emblemDataURL(proto.name, proto.color || '#b9a4ff', 40, true) + '">' : '') +
    '<b>LV ' + p.level + '</b>' + (p.title ? '<small>' + p.title + '</small>' : '') + dailyBadge(protocols) + '</button>';
}

/* 今日のデイリーミッションの残り (全部済んでいれば出さない) */
function dailyBadge(protocols) {
  const list = dailyView(protocols.map(x => x.name));
  const left = list.filter(m => !m.done).length;
  return left ? '<i class="tt-daily" title="デイリーミッション">DAILY ' + (list.length - left) + '/' + list.length + '</i>' : '';
}

/* ロゴ: 「//」と COMPILE。グリッチ用に同じ文字を data-text に持たせる (CSS の ::before/::after でずらす) */
const LOGO = '<div class="tt-logo"><b>//</b><span data-text="COMPILE">COMPILE</span></div>' +
  '<div class="tt-sub">3D ARENA <i>·</i> PROTOCOL CARD BATTLE</div>';

/* 右側: 公式カードの絵を3枚、斜めに切り抜いて並べる。数秒ごとにグリッチをかけて別のプロトコルへ */
/* 絵が入っているプロトコル (ほかは三角の模様だけなので、トップには出さない) */
const HERO_ART = new Set(['APATHY', 'ASSIMILATION', 'DARKNESS', 'DEATH', 'DIVERSITY', 'FIRE', 'GRAVITY', 'HATE', 'LIFE',
  'LIGHT', 'LOVE', 'METAL', 'PLAGUE', 'PSYCHIC', 'SPEED', 'SPIRIT', 'UNITY', 'WATER']);

function startHero(el, all) {
  const withArt = all.filter(p => HERO_ART.has(p.name));
  const protocols = withArt.length >= 4 ? withArt : all;
  if (!el || !protocols.length) return () => {};
  el.innerHTML = '<div class="tt-hero-in"></div>';
  const box = el.firstChild;
  const shown = new Set();
  const card = (slot) => {
    const pool = protocols.filter(p => !shown.has(p.name));
    const p = pool[Math.floor(Math.random() * pool.length)] || protocols[0];
    shown.add(p.name);
    const f = document.createElement('figure');
    f.className = 'th-panel';
    f.dataset.slot = slot;
    f.dataset.name = p.name;
    f.innerHTML = '<img alt="" src="art/' + (1 + Math.floor(Math.random() * 6)) + p.name.toLowerCase() + '.webp" decoding="async">' +
      '<figcaption><img alt="" src="' + emblemDataURL(p.name, p.color || '#b9a4ff', 44, true) + '">' + p.name + '</figcaption>';
    box.appendChild(f);
    return f;
  };
  ['l', 'c', 'r'].forEach(card);
  /* 左の札が抜け、中央が左へ、右が中央へ、新しい札が右から入る */
  const t = setInterval(() => {
    const at = (slot) => box.querySelector('.th-panel[data-slot="' + slot + '"]');
    const l = at('l'), c = at('c'), r = at('r');
    if (!l || !c || !r) return;
    l.dataset.slot = 'out';
    shown.delete(l.dataset.name);
    setTimeout(() => l.remove(), 1300);
    c.dataset.slot = 'l';
    r.dataset.slot = 'c';
    const n = card('in');
    void n.offsetWidth;            // 入る前の位置を一度確定させてから動かす
    n.dataset.slot = 'r';
  }, 6000);
  return () => clearInterval(t);
}

function accountLabel() {
  const u = accountState().user;
  return u ? String(u.name).replace(/[&<>"]/g, '') : 'SIGN IN';
}

export function runTitle(protocols, opts) {
  const menuOnly = !!(opts && opts.menuOnly);    // ロビー等から戻るとき: 起動演出を飛ばしてメニューだけ
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
    '<div class="tt-corner" id="ttCorner" hidden>' + profileChip(protocols) +
      '<button data-mode="account" type="button" class="tt-account"><span>' + accountLabel() + '</span></button>' +
      '<button data-mode="options" type="button" class="tt-gear" title="設定 (演出・音)" aria-label="設定 (演出・音)">⚙</button>' +
    '</div>';
  root.classList.add('show');
  const stopHero = startHero(root.querySelector('#ttHero'), protocols);
  const art = root.querySelector('.tt-art');
  const paint = () => { if (art.isConnected) { try { drawTitleBackdrop(art); } catch (e) { /* 描けなくても従来の背景で進む */ } } };
  paint();
  window.addEventListener('resize', paint);
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
      center.innerHTML = LOGO +
        /* 遊ぶ入口は大きく2つだけ。練習・記録は小さく下に、アカウントと設定は右上の隅に置く */
        '<nav class="tt-menu" aria-label="ゲームモード">' +
          '<div class="tt-main">' +
            '<button data-mode="single" type="button">SINGLE GAME <small>VS CPU</small></button>' +
            '<button data-mode="run" type="button">RUN <small>ROGUELIKE · WEEKLY</small></button>' +
            '<button data-mode="online" type="button">ONLINE GAME <small>ROOMS · RATED</small></button>' +
          '</div>' +
          '<div class="tt-more">' +
            '<button data-mode="tutorial" type="button">TUTORIAL <small>LEARN</small></button>' +
            '<button data-mode="training" type="button">TRAINING <small>SANDBOX</small></button>' +
            '<button data-mode="record" type="button">RECORD <small>STATS</small></button>' +
            '<button data-mode="cards" type="button">CARDS <small>CARD LIST</small></button>' +
          '</div>' +
        '</nav>';
      root.querySelector('#ttCorner').hidden = false;
      root.classList.add('menu');                    // 起動ログを隠し、左の列にメニューを出す
      /* ログイン状態は裏で読むので、分かったら表示を差し替える */
      const offAccount = onAccountChange(() => {
        const label = root.querySelector('#ttCorner button[data-mode="account"] span');
        if (!label || !root.classList.contains('show')) { offAccount(); return; }
        label.textContent = accountLabel();
      });
      const onMenu = (ev) => {
        const button = ev.target.closest('button[data-mode]');
        if (!button) return;
        sfx('select');
        /* 設定 (演出の速さ・効果音の音量・待ち時間)。音の ON/OFF は対戦中の 🔊 で */
        if (button.dataset.mode === 'options') openSettings();
        else if (button.dataset.mode === 'record') openStats();
        else if (button.dataset.mode === 'account') openAccount();
        else if (button.dataset.mode === 'cards') openCardList();
        else if (button.dataset.mode === 'profile') openProfile(protocols);
        else finish(button.dataset.mode);
      };
      center.querySelector('.tt-menu').onclick = onMenu;
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
      try { initAudio(); sfx('turn'); } catch (e) { /* 音なしで続ける */ }
    };
    root.querySelector('#ttStart').onclick = start;
    window.addEventListener('keydown', onKey);
    if (menuOnly) { clearInterval(logTimer); log.innerHTML = ''; start(); }
    if (opts && opts.after) opts.after();
  });
}
