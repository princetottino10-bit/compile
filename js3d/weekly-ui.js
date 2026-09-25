/* =========================================================================
 * 週替わり3連戦の画面 (進行は weekly.js、クリア者一覧の読み書きは account.js)
 *   openWeekly: 今週の9つと相手・クリア者一覧 → 3つ選ぶ → 戦う相手が決まったら { me, ai, level, kind } を返す
 *               { go: 'hub' } なら RUN の入口へ戻る
 *   weeklyHud: 対戦中の表示 / showWeeklyAfterGame: 決着後
 * ========================================================================= */
import { listReplays } from './replays.js';
import { displayName } from './displayname.js';
import * as W from './weekly.js';
import { levelLabel } from './aidecks.js';
import { emblemDataURL } from './emblems.js';
import { showProtocolCards } from './protocards.js';
import { fetchWeeklyClears, submitWeeklyClear, accountState } from './account.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function overlay() {
  let el = document.getElementById('runOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'runOv';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el);
  }
  el.setAttribute('aria-label', '週替わり3連戦');
  el.classList.add('show');
  return el;
}

function deckLine(names, byName, usedSet) {
  return '<span class="rn-deck">' + names.map(n => '<i data-info="' + esc(n) + '" title="' + esc(n) + ' のカードを見る" class="' + (usedSet && usedSet.has(n) ? 'used' : '') + '" style="--pc:' +
    esc((byName[n] || {}).color || '#b9a4ff') + '">' + esc(n) + '</i>').join('') + '</span>';
}

function stageTrack(s) {
  return '<ol class="rn-track wk">' + [0, 1, 2].map(i =>
    '<li class="' + (i < s.stage || s.phase === 'clear' ? 'done' : i === s.stage && s.phase !== 'lost' ? 'now' : '') + (i === 2 ? ' boss' : '') + '">' +
      (i === 2 ? 'BOSS' : '第' + (i + 1) + '戦') + '</li>').join('') + '</ol>';
}

/* クリア者一覧 (読めなくても画面は出す) */
async function clearsHtml(week) {
  try {
    const rows = await fetchWeeklyClears(week);
    if (!rows.length) return '<p class="rn-note">まだ誰もクリアしていません。一番乗りを目指しましょう</p>';
    return '<ol class="wk-clears">' + rows.map((r, i) => '<li><b>' + (i + 1) + '</b><span>' + esc(r.name) + '</span><small>' +
      r.attempts + '回目でクリア</small></li>').join('') + '</ol>';
  } catch (e) {
    /* サーバーに表がまだ無い (マイグレーション未適用) ときは、準備中とだけ出す */
    if (/Could not find the table|未設定/.test(e.message)) return '<p class="rn-note">クリア者の一覧は準備中です</p>';
    return '<p class="rn-note">クリア者の一覧を読み込めませんでした (' + esc(e.message) + ')</p>';
  }
}

export function openWeekly(protocols, cardsOf) {
  const names = protocols.map(p => p.name);
  const byName = Object.fromEntries(protocols.map(p => [p.name, p]));
  const key = W.weekKey();
  const set = W.weeklySet(key, names);
  const el = overlay();
  return new Promise((resolve) => {
    let s = W.loadWeekly(key);
    let picked = [];
    let clears = '<p class="rn-note">クリア者を読み込み中…</p>';
    const save = (next) => { s = next; W.saveWeekly(s); render(); };
    const done = (v) => { el.classList.remove('show'); resolve(v); };

    const oppRow = (o, i) => '<li class="' + (s.phase !== 'idle' && s.phase !== 'lost' && s.phase !== 'clear' && i === s.stage ? 'now' : '') + '">' +
      '<small>' + (o.boss ? 'BOSS' : '第' + (i + 1) + '戦') + ' ・ ' + esc(levelLabel(o.level)) + '</small>' + deckLine(o.deck, byName) + '</li>';

    const render = () => {
      const used = new Set(W.usedOf(s));
      let body;
      if (s.phase === 'choose') {
        const opp = set.opponents[s.stage];
        const left = set.nine.filter(n => !used.has(n));
        body = stageTrack(s) +
          '<h2>' + (opp.boss ? 'BOSS — ' : '') + '第' + (s.stage + 1) + '戦 <small>/ 3 ・ 挑戦 ' + s.attempt + '回目</small></h2>' +
          '<div class="rn-vs"><div><small>あなた (3つ選ぶ)</small>' + deckLine(picked, byName) + '</div><b>VS</b>' +
          '<div><small>' + esc(levelLabel(opp.level)) + '</small>' + deckLine(opp.deck, byName) + '</div></div>' +
          '<div class="wk-pick">' + set.nine.map(n => {
            const p = byName[n];
            const u = used.has(n), on = picked.includes(n);
            return '<button type="button" class="rn-proto' + (on ? ' on' : '') + '" style="--pc:' + esc(p.color) + '" data-pick="' + esc(n) + '"' +
              (u ? ' disabled' : '') + ' aria-pressed="' + on + '"><img alt="" src="' + emblemDataURL(n, p.color, 48, true) + '"><b>' + esc(n) + '</b>' +
              (u ? '<small>使用済み</small>' : '') + '</button>';
          }).join('') + '</div>' +
          (left.length > 3 ? '<p class="rn-note">残りの戦いのぶんも考えて選びましょう。使ったプロトコルは、この挑戦ではもう使えません。</p>' : '') +
          '<div class="rn-btns">' + (cardsOf ? '<button type="button" data-act="cards">カードを見る</button>' : '') +
          '<button type="button" data-act="giveup">この挑戦をやめる</button>' +
          '<button type="button" class="rn-go" data-act="fight"' + (picked.length === 3 ? '' : ' disabled') + '>戦う</button></div>';
      } else {
        body = '<h2>週替わり3連戦 <small>' + esc(W.weekRange(key)) + '</small></h2>' +
          '<p class="rn-lead">今週配られた<b>9つのプロトコル</b>を3つずつに分け、3人の相手に勝ち抜きます。' +
          '1戦ごとに、まだ使っていないものから3つ選びます (<b>1つのプロトコルは1回だけ</b>)。1試合は2本先取、負けたらその挑戦は終わりです。' +
          '相手は全員に同じ。何度でも挑戦できます。</p>' +
          '<h3>今週の9つ</h3>' + deckLine(set.nine, byName) +
          '<h3>今週の相手</h3><ol class="wk-opps">' + set.opponents.map(oppRow).join('') + '</ol>' +
          (s.phase === 'clear' ? '<p class="rn-best">今週は<b>クリア済み</b> (' + s.attempt + '回目)</p>' : '') +
          (s.phase === 'lost' ? '<p class="rn-warn">前回は第' + (s.stage + 1) + '戦で敗退しました</p>' : '') +
          '<h3>今週のクリア者</h3><div id="wkClears">' + clears + '</div>' +
          '<div class="rn-btns"><button type="button" data-act="hub">戻る</button>' +
          (cardsOf ? '<button type="button" data-act="cards">カードを見る</button>' : '') +
          '<button type="button" class="rn-go" data-act="start">' + (s.attempt ? 'もう一度挑戦する' : '挑戦する') + '</button></div>';
      }
      el.innerHTML = '<div class="rn-card"><div class="rn-head"><b>// WEEKLY</b><span>週替わり3連戦</span></div>' + body + '</div>';
    };

    /* 今週の9つ → 相手の順に、重なりなく並べる (カード一覧のタブ) */
    const tabList = () => [...new Set([...set.nine, ...set.opponents.flatMap(o => o.deck)])]
      .filter(n => byName[n]).map(n => ({ name: n, color: byName[n].color }));
    const openCards = (n) => { if (cardsOf && byName[n]) showProtocolCards(n, byName[n].color, cardsOf, tabList()); };
    el.onclick = (ev) => {
      const chip = ev.target.closest('[data-info]');
      if (chip) { openCards(chip.dataset.info); return; }
      const t = ev.target.closest('button');
      if (!t || t.disabled) return;
      if (t.dataset.pick) {
        const n = t.dataset.pick;
        picked = picked.includes(n) ? picked.filter(x => x !== n) : picked.length < 3 ? picked.concat(n) : picked;
        render();
        return;
      }
      switch (t.dataset.act) {
        case 'hub': done({ go: 'hub' }); break;
        case 'start': picked = []; save(W.startAttempt(s)); break;
        case 'giveup': picked = []; save({ ...s, phase: 'lost' }); break;
        case 'cards': {
          const n = picked[picked.length - 1] || set.nine.find(x => !W.usedOf(s).includes(x)) || set.nine[0];
          openCards(n);
          break;
        }
        case 'fight': {
          const next = W.chooseDeck(s, picked, set);
          if (next === s) return;
          W.saveWeekly(next);
          const opp = set.opponents[s.stage];
          done({ me: picked.slice(), ai: opp.deck.slice(), level: opp.level, kind: 'weekly' });
          break;
        }
        default: break;
      }
    };
    render();
    clearsHtml(key).then((h) => { clears = h; const box = el.querySelector('#wkClears'); if (box) box.innerHTML = h; });
  });
}

export function weeklyHud() {
  const s = W.loadWeekly();
  if (s.phase !== 'battle') return;
  let el = document.getElementById('runHud');
  if (!el) {
    el = document.createElement('div');
    el.id = 'runHud';
    document.body.appendChild(el);
  }
  el.innerHTML = '<small>週替わり 第' + (s.stage + 1) + '戦 / 3</small><b class="wk-hud">2本先取</b>';
}

/* 決着後: 次の戦い / 敗退 / クリア (名前を載せる) */
export function showWeeklyAfterGame(win, protocols) {
  const byName = Object.fromEntries(protocols.map(p => [p.name, p]));
  const before = W.loadWeekly();
  if (before.phase !== 'battle') return;
  const s = W.finishMatch(before, win);
  W.saveWeekly(s);
  const el = overlay();
  el.classList.add('after');
  const title = s.phase === 'clear' ? '3連勝！ クリア' : s.phase === 'lost' ? '敗退' : '勝利';
  const line = s.phase === 'clear' ? s.attempt + '回目の挑戦でクリアしました。'
    : s.phase === 'lost' ? '第' + (before.stage + 1) + '戦で負けました。何度でも挑戦できます。'
      : '次は第' + (s.stage + 1) + '戦。残りのプロトコルから3つ選びます。';
  const user = accountState().user;
  el.innerHTML = '<div class="rn-card"><div class="rn-head"><b>// WEEKLY</b><span>週替わり3連戦</span></div>' +
    '<h2>' + title + '</h2>' + stageTrack(s) + '<p class="rn-lead">' + line + '</p>' +
    (s.phase === 'clear'
      ? '<p class="rn-best">報酬: +30 XP ・ 初クリアで専用スリーブ LAUREL ・ 3週で称号 WEEKLY REGULAR と専用マーカー ・ 10週で称号 WEEKLY LEGEND</p>' +
        '<p class="rn-note">使ったデッキ ' + s.decks.map(d => deckLine(d, byName)).join(' ') + '</p>' +
        (s.submitted ? '<p class="rn-best">クリア者の一覧に載せました</p>'
          : user
            ? '<div class="wk-name"><label for="wkName">載せる名前 (1〜16文字)</label><input id="wkName" maxlength="16" autocomplete="nickname" value="' + esc(displayName()) + '">' +
              '<button type="button" class="rn-go" data-act="submit">一覧に載せる</button></div><p class="rn-note" id="wkMsg" role="status"></p>'
            : '<p class="rn-note">ログインすると、今週のクリア者の一覧に名前を載せられます (タイトル右上のログインから)。</p>')
      : '') +
    '<div class="rn-btns">' +
      (s.phase === 'choose' ? '<button type="button" class="rn-go" data-act="next">次へ</button>' : '') +
      (s.phase === 'lost' ? '<button type="button" class="rn-go" data-act="next">もう一度挑戦する</button>' : '') +
      '<button type="button" data-act="board">盤面を見る</button><button type="button" data-act="title">タイトルへ</button></div></div>';
  el.onclick = async (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.act === 'next') location.href = location.pathname + '?run=1';
    else if (t.dataset.act === 'title') location.href = location.pathname;
    else if (t.dataset.act === 'board') {
      el.classList.remove('show');
      const back = document.createElement('button');
      back.type = 'button';
      back.id = 'runBack';
      back.textContent = '週替わり3連戦へ戻る';
      back.onclick = () => { back.remove(); el.classList.add('show'); };
      document.body.appendChild(back);
    } else if (t.dataset.act === 'submit') {
      const msg = el.querySelector('#wkMsg');
      const name = W.cleanName(el.querySelector('#wkName').value);
      if (!name) { msg.textContent = '名前は1〜16文字で入れてください'; return; }
      t.disabled = true;
      try {
        /* サーバーが3戦の勝ちをリプレイで確かめる。直近のリプレイ (自動で10戦残る) から、この挑戦の3戦を探す */
        const same = (x, y) => x.slice().sort().join() === y.slice().sort().join();
        const wins = listReplays().filter(r => r.kind === 'weekly' && r.win);
        const reps = s.decks.map(d => wins.find(r => same(r.init.p0, d)));
        if (reps.some(r => !r)) throw new Error('3戦のリプレイが見つかりません (直近10戦までしか残らないため)');
        await submitWeeklyClear(s.week, name, s.attempt, reps);
        W.saveWeekly({ ...W.loadWeekly(), submitted: true });
        msg.textContent = '一覧に載せました';
      } catch (e) {
        msg.textContent = '載せられませんでした: ' + e.message;
        t.disabled = false;
      }
    }
  };
}
