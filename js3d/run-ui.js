/* =========================================================================
 * 勝ち抜き戦の画面 (進行と保存は run.js)
 *   openRun: ドラフト・報酬・戦う前の画面。戦う相手が決まったら { me, ai, level } で返す
 *   runHud: 対戦中のライフ表示
 *   showRunAfterGame: 決着後に結果を入れて、次へ進む画面を出す
 * ========================================================================= */
import { loadWeekly } from './weekly.js';
import * as RUN from './run.js';
import { emblemDataURL } from './emblems.js';
import { levelLabel } from './aidecks.js';
import { showProtocolCards } from './protocards.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function overlay() {
  let el = document.getElementById('runOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'runOv';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '勝ち抜き戦');
    document.body.appendChild(el);
  }
  el.classList.add('show');
  return el;
}

function lifeBar(run, lost) {
  const pips = [];
  for (let i = 0; i < run.maxLife; i++) {
    const cls = i < run.life - (lost || 0) ? 'on' : i < run.life ? 'hit' : '';
    pips.push('<i class="' + cls + '"></i>');
  }
  return '<div class="rn-life" aria-label="ライフ ' + Math.max(0, run.life - (lost || 0)) + ' / ' + run.maxLife + '">' +
    '<b>LIFE</b><span>' + pips.join('') + '</span><em>' + Math.max(0, run.life - (lost || 0)) + '<small>/' + run.maxLife + '</small></em></div>';
}

function floorTrack(run) {
  return '<ol class="rn-track" aria-label="全' + RUN.FLOORS.length + '戦">' + RUN.FLOORS.map((f, i) =>
    '<li class="' + (i < run.floor ? 'done' : i === run.floor ? 'now' : '') + (f.boss ? ' boss' : '') + '">' +
      (f.boss ? 'BOSS' : i + 1) + '</li>').join('') + '</ol>';
}

function protoChip(p, attrs) {
  return '<button type="button" class="rn-proto" style="--pc:' + esc(p.color) + '" ' + (attrs || '') + '>' +
    '<img alt="" src="' + emblemDataURL(p.name, p.color, 64, true) + '"><b>' + esc(p.name) + '</b></button>';
}

function deckLine(names, byName) {
  return '<span class="rn-deck">' + names.map(n => '<i style="--pc:' + esc((byName[n] || {}).color || '#b9a4ff') + '">' + esc(n) + '</i>').join('') + '</span>';
}

/* 戦う相手が決まるまで画面を進める。null ならタイトルへ戻る、{ go: 'weekly' } なら週替わり3連戦へ。
   opts.hub: タイトルから来たとき。勝ち抜き戦の途中でも、まず入口 (続きから / 週替わり) を出す */
export function openRun(protocols, cardsOf, opts) {
  const names = protocols.map(p => p.name);
  const byName = Object.fromEntries(protocols.map(p => [p.name, p]));
  const el = overlay();
  return new Promise((resolve) => {
    let run = RUN.loadRun();
    let swapAdd = null;          // 報酬で入れ替えるプロトコル (選んだあと、外すほうを選ぶ)
    let confirmQuit = false;
    let hub = !!(opts && opts.hub);
    const set = (next) => { run = next; RUN.saveRun(run); render(); };
    const done = (v) => { el.classList.remove('show'); resolve(v); };
    /* カード一覧は、いま候補に出ているものと自分のデッキをタブで切り替えられるように */
    const info = (name) => {
      const p = byName[name];
      if (!p || !cardsOf) return;
      const list = [...new Set([...((run && run.offers) || []), ...((run && run.deck) || [])])]
        .filter(n => byName[n]).map(n => ({ name: n, color: byName[n].color }));
      showProtocolCards(name, p.color, cardsOf, list);
    };

    /* 入口: 2つのモードを同じ大きさのカードで並べる (どちらを遊ぶかが一目で分かるように) */
    const hubHtml = () => {
      const active = run && run.phase !== 'over' && run.phase !== 'clear';
      const best = RUN.loadBest();
      const runStatus = active
        ? '<em class="now">第' + (run.floor + 1) + '戦の途中 ・ ライフ ' + run.life + '</em>'
        : best ? '<em>最高記録: ' + (best.reached > RUN.FLOORS.length ? '全勝クリア (ライフ ' + best.life + ' 残し)' : best.reached + '戦目まで') + '</em>'
          : '<em>まだ挑戦していません</em>';
      const w = loadWeekly();
      const weekStatus = w.phase === 'clear' ? '<em class="done">今週はクリア済み</em>'
        : w.phase === 'battle' || w.phase === 'choose' ? '<em class="now">第' + (w.stage + 1) + '戦の途中 (' + w.attempt + '回目の挑戦)</em>'
          : w.attempt ? '<em>今週 ' + w.attempt + '回挑戦 ・ 最高 ' + (w.bestStage || 0) + '勝</em>' : '<em>今週はまだ挑戦していません</em>';
      return '<p class="rn-pick">遊ぶモードを選んでください</p><div class="rn-modes">' +
        '<section class="rn-mcard"><small>ROGUELIKE</small><h3>勝ち抜き戦</h3><ul>' +
          '<li>' + RUN.FLOORS.length + '人の CPU を順に倒す (1試合 ' + RUN.RUN_WIN_COMPILES + '本先取)</li>' +
          '<li>ライフ ' + RUN.RUN_LIFE + '。コンパイルされるたびに 1 減る</li>' +
          '<li>勝つたびにプロトコルの入れ替えか回復</li></ul>' + runStatus +
          (active ? '<button type="button" class="rn-go" data-act="resume">続きから</button>'
            : '<button type="button" class="rn-go" data-act="start">はじめる</button>') + '</section>' +
        '<section class="rn-mcard"><small>WEEKLY</small><h3>週替わり3連戦</h3><ul>' +
          '<li>毎週配られる9つのプロトコルで戦う</li>' +
          '<li>3つずつ使い切って、3人に連勝する</li>' +
          '<li>クリアすると名前が一覧に載る</li></ul>' + weekStatus +
          '<button type="button" class="rn-go" data-act="weekly">開く</button></section>' +
      '</div><div class="rn-btns"><button type="button" data-act="title">タイトルへ</button></div>';
    };
    const render = () => {
      let body = '';
      const active = run && run.phase !== 'over' && run.phase !== 'clear';
      if ((hub && active) || !active) {
        el.innerHTML = '<div class="rn-card"><div class="rn-head"><b>// RUN</b><span>2つのモード</span></div>' + hubHtml() + '</div>';
        return;
      }
      if (run.phase === 'draft') {
        /* はじめの1つを選ぶときだけ、何をするモードなのかを書いておく (いきなり選ばされても分からないので) */
        const intro = !run.deck.length && run.floor === 0
          ? '<p class="rn-lead">まず<b>プロトコルを3つ</b>、1つずつ選んでデッキを作ります。' +
            'そのデッキで <b>CPU ' + (RUN.FLOORS.length - 1) + '人と BOSS</b> を順に倒します (1試合 ' + RUN.RUN_WIN_COMPILES + '本先取)。<br>' +
            '上の <b>LIFE</b> は、相手にコンパイルされるたびに 1 減り、0 になったら終わり。' +
            '負けても同じ相手とやり直せます。勝つたびに、プロトコルの入れ替えかライフ回復を選べます。</p>'
          : '';
        body = '<h2>プロトコルを選ぶ <small>' + (run.deck.length + 1) + ' / 3</small></h2>' + intro +
          (run.deck.length ? '<p class="rn-note">選んだもの ' + deckLine(run.deck, byName) + '</p>' : '') +
          '<div class="rn-offers">' + run.offers.map(n => '<div class="rn-offer">' + protoChip(byName[n], 'data-pick="' + esc(n) + '"') +
            (cardsOf ? '<button type="button" class="rn-info" data-info="' + esc(n) + '">カードを見る</button>' : '') + '</div>').join('') + '</div>';
      } else if (run.phase === 'reward') {
        body = '<h2>勝利！ 報酬を1つ選ぶ</h2>' + (swapAdd
          ? '<p class="rn-note"><b>' + esc(swapAdd) + '</b> を入れる代わりに、外すプロトコルを選ぶ</p>' +
            '<div class="rn-offers">' + run.deck.map(n => protoChip(byName[n], 'data-remove="' + esc(n) + '"')).join('') + '</div>' +
            '<div class="rn-btns"><button type="button" data-act="unswap">戻る</button></div>'
          : '<p class="rn-note">今のデッキ ' + deckLine(run.deck, byName) + '</p>' +
            '<h3>プロトコルを入れ替える</h3><div class="rn-offers">' + run.offers.map(n => '<div class="rn-offer">' +
              protoChip(byName[n], 'data-add="' + esc(n) + '"') +
              (cardsOf ? '<button type="button" class="rn-info" data-info="' + esc(n) + '">カードを見る</button>' : '') + '</div>').join('') + '</div>' +
            '<div class="rn-btns"><button type="button" class="rn-heal" data-act="heal"' + (run.life >= run.maxLife ? ' disabled' : '') + '>' +
              'ライフを ' + RUN.RUN_HEAL + ' 回復</button><button type="button" data-act="skip">そのまま進む</button></div>');
      } else if (run.phase === 'battle') {
        const last = run.history[run.history.length - 1];
        const retry = last && last.floor === run.floor && !last.win;
        body = '<h2>' + (run.opp.boss ? 'BOSS — ' : '') + '第' + (run.floor + 1) + '戦 <small>/ ' + RUN.FLOORS.length + '</small></h2>' +
          (retry ? '<p class="rn-warn">負けたので同じ相手とやり直しです (ライフ −' + last.damage + ')</p>' : '') +
          '<div class="rn-vs"><div><small>あなた</small>' + deckLine(run.deck, byName) + '</div><b>VS</b>' +
          '<div><small>' + esc(levelLabel(run.opp.level)) + '</small>' + deckLine(run.opp.deck, byName) + '</div></div>' +
          (confirmQuit
            ? '<p class="rn-warn">この勝ち抜き戦をあきらめて終わりにしますか？ (記録は残ります)</p>' +
              '<div class="rn-btns"><button type="button" class="rn-danger" data-act="quitYes">あきらめる</button><button type="button" data-act="quitNo">続ける</button></div>'
            : '<div class="rn-btns"><button type="button" class="rn-go" data-act="fight">戦う</button>' +
              '<button type="button" data-act="title">タイトルへ (続きはあとで)</button><button type="button" data-act="quit">あきらめる</button></div>');
      }
      el.innerHTML = '<div class="rn-card"><div class="rn-head"><b>// RUN</b><span>勝ち抜き戦</span></div>' +
        (run && run.phase !== 'over' && run.phase !== 'clear' ? lifeBar(run) + floorTrack(run) : '') + body + '</div>';
    };

    el.onclick = (ev) => {
      const t = ev.target.closest('button');
      if (!t) return;
      if (t.dataset.info) { info(t.dataset.info); return; }
      if (t.dataset.pick) { set(RUN.draftPick(run, t.dataset.pick, names)); return; }
      if (t.dataset.add) { swapAdd = t.dataset.add; render(); return; }
      if (t.dataset.remove) { const add = swapAdd; swapAdd = null; set(RUN.applyReward(run, { type: 'swap', add, remove: t.dataset.remove }, names)); return; }
      switch (t.dataset.act) {
        case 'start': hub = false; set(RUN.newRun(names)); break;
        case 'resume': hub = false; render(); break;
        case 'weekly': done({ go: 'weekly' }); break;
        case 'title': done(null); break;
        case 'unswap': swapAdd = null; render(); break;
        case 'heal': set(RUN.applyReward(run, { type: 'heal' }, names)); break;
        case 'skip': set(RUN.applyReward(run, { type: 'skip' }, names)); break;
        case 'fight': done({ me: run.deck.slice(), ai: run.opp.deck.slice(), level: run.opp.level, kind: 'run' }); break;
        case 'quit': confirmQuit = true; render(); break;
        case 'quitNo': confirmQuit = false; render(); break;
        case 'quitYes': confirmQuit = false; set({ ...run, phase: 'over' }); break;
        default: break;
      }
    };
    render();
  });
}

/* 対戦中のライフ表示。lost = この試合でここまでにコンパイルされた回数 */
export function runHud(lost) {
  const run = RUN.loadRun();
  if (!run || run.phase !== 'battle') return;
  let el = document.getElementById('runHud');
  if (!el) {
    el = document.createElement('div');
    el.id = 'runHud';
    document.body.appendChild(el);
  }
  el.innerHTML = '<small>第' + (run.floor + 1) + '戦</small>' + lifeBar(run, lost);
  el.classList.toggle('danger', run.life - lost <= 2);
}

/* 決着後: 結果を入れて、次の画面 (報酬・やり直し・終わり) へ */
export function showRunAfterGame(win, damage, protocols) {
  const names = protocols.map(p => p.name);
  const byName = Object.fromEntries(protocols.map(p => [p.name, p]));
  const before = RUN.loadRun();
  if (!before || before.phase !== 'battle') return;
  const run = RUN.finishBattle(before, win, damage, names);
  RUN.saveRun(run);
  const el = overlay();
  el.classList.add('after');
  const title = run.phase === 'clear' ? '全勝クリア！' : run.phase === 'over' ? 'ライフが尽きた' : win ? '勝利' : '敗北';
  const line = run.phase === 'clear'
    ? RUN.FLOORS.length + '人を勝ち抜きました。ライフ ' + run.life + ' 残し。'
    : run.phase === 'over' ? '第' + (run.floor + 1) + '戦で終わりました。'
      : win ? '次は第' + (run.floor + 1) + '戦。報酬を選んでから進みます。' : '同じ相手ともう一度戦います。';
  el.innerHTML = '<div class="rn-card"><div class="rn-head"><b>// RUN</b><span>勝ち抜き戦</span></div>' +
    '<h2>' + title + '</h2><p class="rn-note">この試合でコンパイルされた回数 <b>' + damage + '</b> → ライフ −' + damage + '</p>' +
    lifeBar({ ...run, life: Math.max(0, run.life) }) + '<p class="rn-lead">' + line + '</p>' +
    (run.phase === 'over' || run.phase === 'clear' ? '<p class="rn-note">デッキ ' + deckLine(run.deck, byName) + '</p>' : '') +
    '<div class="rn-btns">' +
      (run.phase === 'over' || run.phase === 'clear' ? '' : '<button type="button" class="rn-go" data-act="next">次へ</button>') +
      '<button type="button" data-act="board">盤面を見る</button><button type="button" data-act="title">タイトルへ</button></div></div>';
  el.onclick = (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.act === 'next') location.href = location.pathname + '?run=1';
    else if (t.dataset.act === 'title') location.href = location.pathname;
    else if (t.dataset.act === 'board') {
      el.classList.remove('show');
      const back = document.createElement('button');
      back.type = 'button';
      back.id = 'runBack';
      back.textContent = run.phase === 'over' || run.phase === 'clear' ? 'タイトルへ' : '勝ち抜き戦へ戻る';
      back.onclick = () => { back.remove(); el.classList.add('show'); };
      document.body.appendChild(back);
    }
  };
}
