/* =========================================================================
 * ストーリーモードの画面 (story.js の中身を描く)
 *   openStory(protocols)      章の地図。会話はその場で再生し、対戦を選んだら { battle: 場面 } で返す (null はタイトルへ)
 *   playScene(lines)          会話 (ノベル風)。タップ・Enter・Space で1行ずつ。勝手には進まない
 *   showStoryResult(win, node, actions)  決着のあと: 勝ち負けの会話 → ボタン (次へ・もう一度・地図・タイトル)
 * ========================================================================= */
import { showTitleBack, hideTitleBack } from './titleback.js';
import { faceFor } from './avatar.js';
import { accountState } from './account.js';
import { CHAPTERS, SPEAKERS, loadStory, saveStory, canEnter, isCleared, currentNode, clearNode, startBattle, nodeById } from './story.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LEVELS = ['かんたん', 'ふつう', 'つよい'];
const TYPE_MS = 26;       // 1文字の間

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
  el.innerHTML = '<img class="ss-still" alt="">' + '<div class="ss-veil"></div><img class="ss-portrait" alt="">' +
    '<div class="ss-box"><div class="ss-name"></div><p class="ss-text"></p><span class="ss-next" aria-hidden="true">▼</span></div>' +
    '<button type="button" class="ss-skip">SKIP ▸▸</button>';
  el.classList.add('show');
  const portrait = el.querySelector('.ss-portrait');
  const still = el.querySelector('.ss-still');
  let stillOn = false;
  const nameEl = el.querySelector('.ss-name');
  const textEl = el.querySelector('.ss-text');
  const box = el.querySelector('.ss-box');
  let i = -1, typing = null, full = '';

  return new Promise((resolve) => {
    const finish = () => {
      clearInterval(typing);
      window.removeEventListener('keydown', onKey);
      el.classList.remove('show');
      el.innerHTML = '';
      resolve();
    };
    const show = (k) => {
      const line = lines[k];
      const sp = SPEAKERS[line.who] || SPEAKERS.sys;
      const terminal = !sp.portrait;
      box.classList.toggle('terminal', terminal);
      box.style.setProperty('--sc', sp.color);
      nameEl.textContent = sp.name;
      /* スチル (一枚絵): 出ているあいだは立ち絵を出さない (絵の中にその子がいる) */
      if (line.still !== undefined) {
        stillOn = !!line.still;
        if (stillOn) still.src = 'art/still/' + line.still + '.webp';
        still.classList.toggle('on', stillOn);
        el.classList.toggle('with-still', stillOn);
      }
      if (sp.portrait && !stillOn) {
        portrait.src = 'art/avatar/' + sp.portrait + '_' + faceFor(sp.portrait, line.face || 'normal') + '.webp';
        portrait.classList.add('on');
      } else portrait.classList.remove('on');
      full = line.text;
      textEl.textContent = '';
      let n = 0;
      clearInterval(typing);
      typing = setInterval(() => {
        n++;
        textEl.textContent = full.slice(0, n);
        if (n >= full.length) { clearInterval(typing); typing = null; }
      }, TYPE_MS);
    };
    const advance = () => {
      if (typing) {                          // 途中なら、まず全部出す
        clearInterval(typing);
        typing = null;
        textEl.textContent = full;
        return;
      }
      i++;
      if (i >= lines.length) { finish(); return; }
      show(i);
    };
    const onKey = (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); advance(); }
      else if (ev.key === 'Escape' && opts.skippable !== false) { ev.preventDefault(); finish(); }
    };
    el.querySelector('.ss-skip').onclick = (ev) => { ev.stopPropagation(); finish(); };
    el.onclick = advance;
    window.addEventListener('keydown', onKey);
    advance();
  });
}

/* ---------- 対戦の前の確認 ---------- */
/* 対戦の中身 (自分と相手のデッキ・強さ・勝ちの条件) を見せて、対戦するか聞く。true = 対戦する */
export function askBattle(n, protocols) {
  const byName = Object.fromEntries(protocols.map(p => [p.name, p]));
  const chips = (names) => '<span class="sm-deck">' + names.map(x =>
    '<i style="--pc:' + esc((byName[x] || {}).color || '#b9a4ff') + '">' + esc(x) + '</i>').join('') + '</span>';
  const box = overlay('storyConfirm', '対戦の確認');
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

/* ---------- 章の地図 ---------- */
export function openStory(protocols) {
  const el = overlay('storyMap', 'ストーリー');
  let state = loadStory();

  return new Promise((resolve) => {
    const done = (v) => { el.classList.remove('show'); hideTitleBack(); resolve(v); };
    showTitleBack(() => done(null));

    const render = () => {
      const cur = currentNode(state);
      el.innerHTML = '<div class="sm-wrap">' + CHAPTERS.map(ch =>
        '<section class="sm-ch"><header><b>// ' + esc(ch.title) + '「' + esc(ch.name) + '」</b><span>' + esc(ch.place) + '</span></header><ol class="sm-path">' +
        ch.nodes.map(n => {
          const clear = isCleared(state, n.id), next = cur && cur.id === n.id;
          const cls = clear ? 'clear' : next ? 'next' : 'lock';
          return '<li class="sm-node ' + cls + ' ' + n.kind + '"><button type="button" data-node="' + esc(n.id) + '"' + (canEnter(state, n.id) ? '' : ' disabled') + '>' +
            '<span class="sm-kind">' + (n.kind === 'battle' ? 'BATTLE' : 'TALK') + '</span>' +
            '<b>' + esc(n.title) + '</b>' +
            (n.kind === 'battle' ? '<small>' + esc(n.oppName) + ' · ' + LEVELS[n.level] + '</small>' : '') +
            '<span class="sm-state">' + (clear ? '✓ CLEAR' : next ? 'NEXT' : 'LOCKED') + '</span></button></li>';
        }).join('') + '</ol></section>').join('') +
        '<p class="sm-more">1章「閉館」は準備中</p></div>';
      el.classList.add('show');
      el.querySelectorAll('[data-node]').forEach(b => { b.onclick = () => enter(b.dataset.node); });
      const nextBtn = el.querySelector('.sm-node.next button');
      if (nextBtn) nextBtn.scrollIntoView({ block: 'center' });
    };

    const enter = async (id) => {
      const n = nodeById(id);
      if (!n || !canEnter(state, id)) return;
      if (n.kind === 'scene') {
        await playScene(n.lines);
        state = clearNode(state, id);
        saveStory(state);
        render();
        /* 会話のすぐ次が対戦なら、そのまま対戦の前の確認へ */
        const cur = currentNode(state);
        if (cur && cur.kind === 'battle') confirmBattle(cur);
        return;
      }
      confirmBattle(n);
    };

    const confirmBattle = async (n) => {
      if (!(await askBattle(n, protocols))) return;
      state = startBattle(state, n.id);
      saveStory(state);
      done({ battle: n });
    };

    render();
    const first = currentNode(state);
    if (first && first.kind === 'scene') enter(first.id);
  });
}

/* ---------- 決着のあと ---------- */
/* actions: { next(), retry(), map(), title() }。勝ったら「次へ」、負けたら「もう一度」を大きく */
export async function showStoryResult(win, node, actions) {
  const lines = win ? node.winLines : node.loseLines;
  if (lines && lines.length) await playScene(lines);
  const el = overlay('storyResult', win ? 'クリア' : 'もう一度');
  el.innerHTML = '<div class="sty-res ' + (win ? 'win' : 'lose') + '"><small>' + esc(node.title) + '</small>' +
    '<b>' + (win ? 'CLEAR' : 'FAILED') + '</b>' +
    '<div class="sm-btns">' + (win
      ? '<button type="button" data-a="next" class="sm-go">次へ</button>'
      : '<button type="button" data-a="retry" class="sm-go">もう一度</button><button type="button" data-a="map">地図へ</button>') +
    '<button type="button" data-a="title">タイトル</button></div></div>';
  el.classList.add('show');
  el.querySelectorAll('[data-a]').forEach(b => {
    b.onclick = () => { el.classList.remove('show'); (actions[b.dataset.a] || (() => {}))(); };
  });
}
