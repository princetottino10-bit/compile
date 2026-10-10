/* =========================================================================
 * ストーリーモードの画面 (story.js の中身を描く)
 *   playScene(lines)          会話 (ノベル風)。タップ・Enter・Space で1行ずつ。勝手には進まない
 *   playNode(node)            場面の会話と、あれば選択肢 (node.choice)。again の選択肢は、その会話のあと選び直し
 *   showStoryResult(win, node, actions)  決着のあと: 勝ち負けの会話 → ボタン (次へ・もう一度・地図・タイトル)
 * ========================================================================= */
import { faceFor, faceURL, VOICE_VER, voiceGain } from './avatar.js';
import { accountState } from './account.js';
import { playClip, isMuted, sfx } from './audio.js';
import { duckBgm } from './bgm.js';
import { settings } from './settings.js';
import { SPEAKERS } from './story.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TYPE_MS = 26;       // 1文字の間
const TYPE_MS_TERMINAL = 18;   // 端末の文字は、機械が打つ速さで

/* セリフの印 (声のファイル名)。scripts/voice_lines.py の fnv1a と同じ: UTF-8 の FNV-1a 32bit を 8桁の16進で */
export function lineKey(text) {
  const bytes = new TextEncoder().encode(text);
  let h = 0x811c9dc5;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/* 会話の声: 設定の「キャラの声の音量」で鳴らし、次の行へ進んだら止める。無い行は黙って飛ばす */
function makeVoice() {
  let stop = null, seq = 0, endsAt = 0;
  const halt = () => { seq++; endsAt = 0; if (stop) { stop(); stop = null; } };
  const play = (id, text, pa = false) => {
    halt();
    if (!id || isMuted()) return;
    const vol = Math.max(0, Math.min(1, ((settings().voiceVol ?? 80) | 0) / 100)) * voiceGain(id);
    if (!vol) return;
    const my = seq;
    /* 館内放送の行は、天井のスピーカーの音にして、チャイムのあとに鳴らす (avatar.js の PA_LEAD_MS と同じ間) */
    playClip('art/voice/' + id + '/story/' + lineKey(text) + '.mp3?v=' + VOICE_VER, vol, pa ? { pa: true, delay: 0.75 } : {}).then((h) => {
      if (!h) return;
      if (my !== seq) { h.stop(); return; }
      stop = h.stop;
      endsAt = performance.now() + h.duration * 1000;
      duckBgm(h.duration * 1000 + 200);
    }, () => { /* 声が無くても読める */ });
  };
  /* 声の残り (ミリ秒)。鳴っていなければ 0 */
  const left = () => Math.max(0, endsAt - performance.now());
  return { play, halt, left };
}

/* ---------- 既読・ログ・オート (ADV の当たり前の機能。.claude/skills/story-craft/research/06_adv_ui.md) ---------- */
const READ_KEY = 'compileStoryRead';
const AUTO_KEY = 'compileStoryAuto';
const LOG_MAX = 200;
const AUTO_WAIT = 900, AUTO_PER_CHAR = 55;      // オート: 読み終えてから次へ進むまでの間 (文字が多いほど長く)
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
};
const readSet = new Set(store.get(READ_KEY, []));
const lineId = (line) => lineKey((line.who || '') + '|' + line.text);
const isRead = (line) => readSet.has(lineId(line));
function markRead(line) {
  const k = lineId(line);
  if (readSet.has(k)) return;
  readSet.add(k);
  store.set(READ_KEY, [...readSet].slice(-5000));
}
/* 会話のログ: 場面をまたいで、地図を開いているあいだ残す (古いものから捨てる) */
const LOG = [];
const logPush = (name, text, color) => { LOG.push({ name, text, color }); if (LOG.length > LOG_MAX) LOG.shift(); };
export const logChoice = (label) => logPush('▶', label, '#ffc65c');

function overlay(id, label) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el);
  }
  el.setAttribute('aria-label', label);
  return el;
}

/* ---------- 会話 ---------- */
export function playScene(lines, opts = {}) {
  const el = overlay('storyScene', '会話');
  /* opts.title: 場面の題。上に出したままにする (字間が縮まって決まる)。
     line.alert: その行のあいだだけ、警告の帯を出す (見つかった・止められた場面) */
  el.innerHTML = '<img class="ss-still" alt="">' + '<div class="ss-veil"></div>' +
    '<img class="ss-portrait" data-slot="l" alt=""><img class="ss-portrait" data-slot="r" alt="">' +
    (opts.title ? '<div class="ss-title"><b>' + esc(opts.title) + '</b></div>' : '') +
    '<div class="ss-alert" aria-hidden="true"><b></b></div>' +
    '<div class="ss-box"><div class="ss-name"></div><p class="ss-text"></p><span class="ss-next" aria-hidden="true">▼</span></div>' +
    '<div class="ss-tools"><button type="button" class="ss-skip" title="読んだ所を飛ばす (Esc)">SKIP ▸▸</button>' +
    '<button type="button" class="ss-auto" title="自動で進める (A)">AUTO</button>' +
    '<button type="button" class="ss-log" title="これまでの会話 (L・ホイールを上へ)">LOG</button>' +
    '<button type="button" class="ss-hide" title="文字の枠を消す (H・右クリック)。画面を押すと戻る">HIDE</button></div>';
  el.classList.add('show');
  /* 立ち絵は右と左の2か所。話している人は明るく、聞いている人は少し暗く */
  const slots = ['r', 'l'].map(k => ({ el: el.querySelector('.ss-portrait[data-slot="' + k + '"]'), who: null, face: 'normal' }));
  const portraitOf = (who) => (SPEAKERS[who] || {}).portrait;
  const setStage = (list) => slots.forEach((s, j) => { s.who = list[j] && portraitOf(list[j]) ? list[j] : null; s.face = 'normal'; });
  let lastWho = null;
  const enter = (who) => {
    if (slots.some(s => s.who === who)) return;
    const s = slots.find(x => !x.who) || slots.find(x => x.who !== lastWho) || slots[0];
    s.who = who; s.face = 'normal';
  };
  const still = el.querySelector('.ss-still');
  let stillOn = false;
  const nameEl = el.querySelector('.ss-name');
  const textEl = el.querySelector('.ss-text');
  const box = el.querySelector('.ss-box');
  const alertEl = el.querySelector('.ss-alert');
  let i = -1, typing = null, full = '';
  const voice = makeVoice();
  const skipBtn = el.querySelector('.ss-skip'), autoBtn = el.querySelector('.ss-auto'), logBtn = el.querySelector('.ss-log');
  let auto = !!store.get(AUTO_KEY, false), autoTimer = 0, armed = 0, logView = null;
  autoBtn.classList.toggle('on', auto);

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(autoTimer);
      el.oncontextmenu = null; el.onwheel = null;
      clearInterval(typing);
      voice.halt();
      window.removeEventListener('keydown', onKey);
      el.classList.remove('show', 'with-still', 'hide-ui');
      el.innerHTML = '';
      resolve();
    };
    /* オート: 文字を出し終え、声も終えたら、少し待って次へ */
    const scheduleAuto = () => {
      clearTimeout(autoTimer);
      if (!auto || typing || logView) return;
      autoTimer = setTimeout(() => { if (auto && !logView && !el.classList.contains('hide-ui')) advance(); },
        voice.left() + AUTO_WAIT + full.length * AUTO_PER_CHAR);
    };
    /* quiet: 既読を飛ばすときの途中の行。立ち絵・一枚絵の入れ替わりだけ反映して、音も文字の動きも出さない */
    const show = (k, quiet = false) => {
      const line = lines[k];
      const sp = SPEAKERS[line.who] || SPEAKERS.sys;
      /* 館内放送: 話す人は姿を見せない。名前は「館内放送」、チャイムのあとに読む */
      const pa = !!line.pa;
      const terminal = !sp.portrait && !pa;
      box.classList.toggle('terminal', terminal);
      box.classList.toggle('pa', pa);
      box.style.setProperty('--sc', pa ? '#ffd36b' : sp.color);
      nameEl.textContent = pa ? '館内放送' : sp.name;
      logPush(nameEl.textContent, line.text, pa ? '#ffd36b' : sp.color);
      markRead(line);
      if (pa && !quiet) sfx('pa');
      alertEl.classList.remove('on');
      if (line.alert) {
        alertEl.style.setProperty('--sc', sp.color);
        alertEl.firstChild.textContent = line.alert;
        void alertEl.offsetWidth;            // 続けて出すときも、帯の動きを最初からやり直す
        alertEl.classList.add('on');
      }
      /* スチル (一枚絵): 出ているあいだは立ち絵を出さない (絵の中にその子がいる) */
      if (line.still !== undefined) {
        stillOn = !!line.still;
        if (stillOn) still.src = 'art/still/' + line.still + '.webp';
        still.classList.toggle('on', stillOn);
        el.classList.toggle('with-still', stillOn);
      }
      if (Array.isArray(line.stage)) setStage(line.stage);
      const speaker = pa ? null : line.who;
      if (sp.portrait && !pa) { enter(line.who); lastWho = line.who; }
      for (const s of slots) {
        const on = !!s.who && !stillOn;
        if (on) {
          const pid = portraitOf(s.who);
          if (s.who === speaker) s.face = line.face || 'normal';
          const src = faceURL(pid, faceFor(pid, s.face));
          if (s.el.getAttribute('src') !== src) s.el.src = src;
        }
        s.el.classList.toggle('on', on);
        s.el.classList.toggle('dim', on && s.who !== speaker);
      }
      full = line.text;
      if (quiet) { voice.halt(); textEl.textContent = full; return; }
      voice.play(sp.voice, line.text, pa);
      textEl.textContent = '';
      box.classList.add('typing');           // 端末の文字は、打っているあいだ印が点いたまま (打ち終えると点滅)
      let n = 0;
      clearInterval(typing);
      typing = setInterval(() => {
        n++;
        textEl.textContent = full.slice(0, n);
        if (n >= full.length) { clearInterval(typing); typing = null; box.classList.remove('typing'); scheduleAuto(); }
      }, terminal ? TYPE_MS_TERMINAL : TYPE_MS);
    };
    const advance = () => {
      clearTimeout(autoTimer);
      if (typing) {                          // 途中なら、まず全部出す
        clearInterval(typing);
        typing = null;
        textEl.textContent = full;
        box.classList.remove('typing');
        scheduleAuto();
        return;
      }
      i++;
      if (i >= lines.length) { finish(); return; }
      show(i);
    };
    /* SKIP: 読んだことのある行だけ飛ばし、まだ読んでいない行で止まる。
       すぐ次が未読なら、ボタンが「未読も飛ばす?」に変わり、3秒以内にもう一度押すと場面の最後まで飛ばす (誤って押して話を失わないように) */
    const skip = () => {
      if (opts.skippable === false) return;
      if (Date.now() - armed < 3000) { finish(); return; }
      let j = i + 1;
      while (j < lines.length && isRead(lines[j])) j++;
      if (j >= lines.length) { finish(); return; }
      if (j === i + 1) {
        armed = Date.now();
        skipBtn.textContent = '未読も飛ばす?';
        skipBtn.classList.add('armed');
        setTimeout(() => { if (Date.now() - armed >= 3000) { skipBtn.textContent = 'SKIP ▸▸'; skipBtn.classList.remove('armed'); } }, 3100);
        return;
      }
      clearTimeout(autoTimer);
      clearInterval(typing); typing = null; box.classList.remove('typing');
      for (let k = i + 1; k < j; k++) show(k, true);
      i = j;
      show(i);
    };
    const toggleAuto = () => {
      auto = !auto;
      store.set(AUTO_KEY, auto);
      autoBtn.classList.toggle('on', auto);
      if (auto && !typing) scheduleAuto(); else clearTimeout(autoTimer);
    };
    /* ログ: これまでの会話を、上へさかのぼって読める。どこかを押すか、Esc・L で閉じる */
    const closeLog = () => { if (!logView) return; logView.remove(); logView = null; scheduleAuto(); };
    const openLog = () => {
      if (logView) return;
      clearTimeout(autoTimer);
      logView = document.createElement('div');
      logView.className = 'ss-logview';
      logView.setAttribute('role', 'log');
      logView.innerHTML = '<div class="ss-logwrap">' + LOG.map(e => '<p><b style="--sc:' + esc(e.color) + '">' + esc(e.name) + '</b>' + esc(e.text) + '</p>').join('') +
        '</div><span class="ss-logclose">閉じる ×</span>';
      logView.onclick = (ev) => { ev.stopPropagation(); closeLog(); };
      el.appendChild(logView);
      const wrap = logView.firstChild;
      wrap.scrollTop = wrap.scrollHeight;
    };
    /* 文字の枠を消して、一枚絵や立ち絵を見る (H・右クリック)。もう一度押すか、画面を押すと戻る */
    const toggleHide = () => { el.classList.toggle('hide-ui'); if (el.classList.contains('hide-ui')) clearTimeout(autoTimer); else scheduleAuto(); };
    const onKey = (ev) => {
      if (logView) { if (ev.key === 'Escape' || ev.key.toLowerCase() === 'l') { ev.preventDefault(); closeLog(); } return; }
      const k = ev.key.toLowerCase();
      if (el.classList.contains('hide-ui') && (k === 'enter' || k === ' ' || k === 'h' || k === 'escape')) { ev.preventDefault(); toggleHide(); return; }
      if (k === 'enter' || k === ' ') { ev.preventDefault(); advance(); }
      else if (k === 'escape') { ev.preventDefault(); skip(); }
      else if (k === 'a') { ev.preventDefault(); toggleAuto(); }
      else if (k === 'l') { ev.preventDefault(); openLog(); }
      else if (k === 'h') { ev.preventDefault(); toggleHide(); }
    };
    skipBtn.onclick = (ev) => { ev.stopPropagation(); skip(); };
    autoBtn.onclick = (ev) => { ev.stopPropagation(); toggleAuto(); };
    logBtn.onclick = (ev) => { ev.stopPropagation(); openLog(); };
    el.querySelector('.ss-hide').onclick = (ev) => { ev.stopPropagation(); toggleHide(); };
    el.onclick = () => { if (el.classList.contains('hide-ui')) { toggleHide(); return; } advance(); };
    el.oncontextmenu = (ev) => { ev.preventDefault(); toggleHide(); };
    el.onwheel = (ev) => { if (ev.deltaY < 0) openLog(); };
    window.addEventListener('keydown', onKey);
    advance();
  });
}

/* ---------- 選択肢 ---------- */
/* options: [{ label }]。選んだ番号を返す。数字キー (1, 2 …) でも選べる */
export function askChoice(options) {
  const el = overlay('storyChoice', '選択');
  el.innerHTML = '<div class="sc-list">' + options.map((o, k) =>
    '<button type="button" data-k="' + k + '"><i>' + (k + 1) + '</i>' + esc(o.label) + '</button>').join('') + '</div>';
  el.classList.add('show');
  return new Promise((resolve) => {
    const end = (k) => { window.removeEventListener('keydown', onKey); el.classList.remove('show'); el.innerHTML = ''; resolve(k); };
    const onKey = (ev) => { const k = parseInt(ev.key, 10) - 1; if (k >= 0 && k < options.length) { ev.preventDefault(); end(k); } };
    window.addEventListener('keydown', onKey);
    el.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => end(+b.dataset.k); });
    el.querySelector('[data-k]').focus();
  });
}

/* 場面の会話 → 選択肢。again の選択肢は、その会話のあとにもう一度選ぶ (記録が無い道。話は先へ進まない) */
export async function playNode(n) {
  await playScene(n.lines, { title: n.title });
  if (!n.choice) return;
  let wavered = false;                 // 選び直しの道を一度選んだ
  for (;;) {
    const o = n.choice.options[await askChoice(n.choice.options)];
    logChoice(o.label);
    const lines = [...(wavered && o.ifAgain ? o.ifAgain : []), ...(o.lines || [])];
    if (lines.length) await playScene(lines);
    if (!o.again) return;
    wavered = true;
  }
}

/* ---------- 対戦の前の確認 ---------- */
/* 対戦の中身 (自分と相手のデッキ・強さ・勝ちの条件) を見せて、対戦するか聞く。true = 対戦する */
export function askBattle(n, protocols) {
  const byName = Object.fromEntries(protocols.map(p => [p.name, p]));
  const chips = (names) => '<span class="sm-deck">' + names.map(x =>
    '<i style="--pc:' + esc((byName[x] || {}).color || '#b9a4ff') + '">' + esc(x) + '</i>').join('') + '</span>';
  const box = overlay('storyConfirm', '確認');
  box.className = 'sm-confirm';
  const tsume = n.kind === 'tsume';
  /* 管理者は対戦を飛ばせる (話の確認用)。返り値 'skip' */
  const admin = accountState().admin;
  box.innerHTML = '<div class="sm-card"><small>' + (tsume ? 'OVERWRITE' : 'COMPILE') + '</small><h3>' + esc(n.title) + '</h3>' +
    '<p class="sm-note">' + esc(n.note || '') + '</p>' +
    (tsume ? '<div class="sm-vs"><div><em>あなた</em></div><i>VS</i><div><em>' + esc(n.oppName) + '</em></div></div>'
      : '<div class="sm-vs"><div><em>あなた</em>' + chips(n.me) + '</div><i>VS</i><div><em>' + esc(n.oppName) + '</em>' + chips(n.opp) + '</div></div>') +
    '<div class="sm-btns"><button type="button" class="sm-go">' + (tsume ? '書き換える' : 'コンパイルを始める') + '</button>' +
    (admin ? '<button type="button" class="sm-skip">飛ばす (ADMIN)</button>' : '') +
    '<button type="button" class="sm-back">戻る</button></div></div>';
  box.classList.add('show');
  return new Promise((resolve) => {
    const end = (v) => { box.classList.remove('show'); box.innerHTML = ''; resolve(v); };
    box.querySelector('.sm-back').onclick = () => end(false);
    box.querySelector('.sm-go').onclick = () => end(true);
    if (admin) box.querySelector('.sm-skip').onclick = () => end('skip');
    box.querySelector('.sm-go').focus();
  });
}

/* ---------- 決着のあと ---------- */
/* actions: { next(), retry(), map(), title() }。勝ったら「次へ」、負けたら「もう一度」を大きく */
export async function showStoryResult(win, node, actions) {
  const lines = win ? node.winLines : node.loseLines;
  if (lines && lines.length) await playScene(lines);
  const el = overlay('storyResult', win ? '先へ' : 'もう一度');
  el.innerHTML = '<div class="sty-res ' + (win ? 'win' : 'lose') + '"><small>' + esc(node.title) + '</small>' +
    '<b>' + (win ? 'COMPILED' : 'OVERWRITTEN') + '</b>' +
    (!win && actions.retryEasy ? '<p class="sty-tip">続けて負けています。「かんたんで挑む」で、この1戦だけ CPU を弱くできます (話の進み方は同じ)</p>' : '') +
    '<div class="sm-btns">' + (win
      ? '<button type="button" data-a="next" class="sm-go">次へ</button>'
      : '<button type="button" data-a="retry" class="sm-go">もう一度</button>' +
        /* 続けて負けたら、CPU を かんたん にして挑める (話の進み方は同じ) */
        (actions.retryEasy ? '<button type="button" data-a="retryEasy">かんたんで挑む</button>' : '') +
        '<button type="button" data-a="map">地図へ</button>') +
    '<button type="button" data-a="title">タイトル</button></div></div>';
  el.classList.add('show');
  el.querySelectorAll('[data-a]').forEach(b => {
    b.onclick = () => { el.classList.remove('show'); (actions[b.dataset.a] || (() => {}))(); };
  });
}
