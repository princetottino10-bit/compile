/* =========================================================================
 * 週替わり3連戦の画面 (進行は weekly.js、クリア者一覧の読み書きは account.js)
 *   openWeekly: 今週の9つと相手・クリア者一覧 → 3つ選ぶ → 戦う相手が決まったら { me, ai, level, kind } を返す
 *               { go: 'hub' } なら RUN の入口へ戻る
 *   weeklyHud: 対戦中の表示 / showWeeklyAfterGame: 決着後
 * ========================================================================= */
import { showTitleBack, hideTitleBack } from './titleback.js';
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
    /* 挑戦回数はみんなには見せない (何回かかったかは本人の画面だけ)。並びはクリアした順 */
    return '<ol class="wk-clears">' + rows.map((r, i) => '<li><b>' + (i + 1) + '</b><span>' + esc(r.name) + '</span></li>').join('') + '</ol>';
  } catch (e) {
    /* サーバーに表がまだ無い (マイグレーション未適用) ときは、準備中とだけ出す */
    if (/Could not find the table|未設定/.test(e.message)) return '<p class="rn-note">クリア者の一覧は準備中です</p>';
    return '<p class="rn-note">クリア者の一覧を読み込めませんでした (' + esc(e.message) + ')</p>';
  }
}

/* クリアしたのに一覧に載せていない挑戦を載せる (結果の画面と、週替わりの画面を開いたときに自動で)。
   以前は結果の画面のボタンを押したときだけだったので、閉じてしまうと載せる方法がなかった。
   サーバーは今週と先週の分を受け付けるので、週が変わった直後でも載る。
   返り値: 'ok' (載せた) / 'skip' (載せるものがない・ログインしていない) / 失敗の理由の文 */
async function submitPending(name) {
  const st = W.loadStoredWeekly();
  if (!st || st.phase !== 'clear' || st.submitted || !Array.isArray(st.decks) || st.decks.length !== 3) return 'skip';
  /* サーバーが3戦の勝ちをリプレイで確かめる。直近のリプレイ (自動で10戦残る) から、この挑戦の3戦を探す */
  const same = (x, y) => x.slice().sort().join() === y.slice().sort().join();
  const wins = listReplays().filter(r => r.kind === 'weekly' && r.win);
  const reps = st.decks.map(d => wins.find(r => same(r.init.p0, d)));
  if (reps.some(r => !r)) return accountState().user ? '3戦のリプレイが見つかりません (直近10戦までしか残らないため)' : 'skip';
  try {
    await submitWeeklyClear(st.week, W.cleanName(name || displayName()) || 'PLAYER', st.attempt, reps);
  } catch (e) {
    if (/ログイン/.test(e.message)) return 'skip';
    /* もう載っている (別の端末から載せた など) なら、載せた扱いにする */
    if (!/もう載って/.test(e.message)) return e.message;
  }
  const now = W.loadStoredWeekly();
  if (now.week === st.week) W.saveWeekly({ ...now, submitted: true });
  return 'ok';
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
    /* 「この挑戦をやめる」は取り消せないので、2回押しで (RUN のあきらめると同じく、その場で確かめる) */
    let armedGiveup = false;
    const giveupBtn = () => armedGiveup
      ? '<button type="button" class="rn-danger" data-act="giveup">本当にやめる (もう一度押す)</button>'
      : '<button type="button" data-act="giveup">この挑戦をやめる</button>';
    let clears = '<p class="rn-note">クリア者を読み込み中…</p>';
    let submitNote = accountState().user ? 'クリア者の一覧に載せています…' : 'ログインすると、クリア者の一覧に名前が載ります (タイトル右上のログインから)';
    const save = (next) => { s = next; W.saveWeekly(s); render(); };
    const done = (v) => { hideTitleBack(); el.classList.remove('show'); resolve(v); };
    showTitleBack(() => done(null));

    const oppRow = (o, i) => '<li class="' + (s.phase !== 'idle' && s.phase !== 'lost' && s.phase !== 'clear' && i === s.stage ? 'now' : '') + '">' +
      '<small>' + (o.boss ? 'BOSS' : '第' + (i + 1) + '戦') + ' ・ ' + esc(levelLabel(o.level)) + '</small>' + deckLine(o.deck, byName) + '</li>';

    const render = () => {
      const used = new Set(W.usedOf(s));
      let body;
      if (s.phase === 'battle') {
        /* 週替わりの画面が開いた = 対戦の途中で終わっている (アプリが落ちた・閉じたなど) */
        const opp = set.opponents[s.stage];
        body = stageTrack(s) +
          '<h2>' + (opp.boss ? 'BOSS — ' : '') + '第' + (s.stage + 1) + '戦の途中で終わっています <small>/ 挑戦 ' + s.attempt + '回目</small></h2>' +
          '<div class="rn-vs"><div><small>あなた</small>' + deckLine(s.decks[s.stage] || [], byName) + '</div><b>VS</b>' +
          '<div><small>' + esc(levelLabel(opp.level)) + '</small>' + deckLine(opp.deck, byName) + '</div></div>' +
          (W.canResume(s)
            ? '<p class="rn-note">アプリが落ちたときなどのために、同じ3つでこの戦いを<b>1回だけ</b>やり直せます (はじめから)。</p>'
            : '<p class="rn-warn">この戦いのやり直しはもう使いました。この挑戦はここまでです。</p>') +
          '<div class="rn-btns"><button type="button" data-act="hub">戻る</button>' +
          giveupBtn() +
          (W.canResume(s) ? '<button type="button" class="rn-go" data-act="resume">第' + (s.stage + 1) + '戦をやり直す</button>' : '') + '</div>';
      } else if (s.phase === 'choose') {
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
          giveupBtn() +
          '<button type="button" class="rn-go" data-act="fight"' + (picked.length === 3 ? '' : ' disabled') + '>戦う</button></div>';
      } else {
        body = '<h2>週替わり3連戦 <small>' + esc(W.weekRange(key)) + '</small></h2>' +
          '<p class="rn-lead">今週配られた<b>9つのプロトコル</b>を3つずつに分け、3人の相手に勝ち抜きます。' +
          '1戦ごとに、まだ使っていないものから3つ選びます (<b>1つのプロトコルは1回だけ</b>)。1試合は2本先取、負けたらその挑戦は終わりです。' +
          '相手は全員に同じ。何度でも挑戦できます。</p>' +
          '<h3>今週の9つ</h3>' + deckLine(set.nine, byName) +
          '<h3>今週の相手</h3><ol class="wk-opps">' + set.opponents.map(oppRow).join('') + '</ol>' +
          (s.phase === 'clear' ? '<p class="rn-best">今週は<b>クリア済み</b> (' + s.attempt + '回目)</p>' +
            (s.submitted ? '' : '<p class="rn-note" id="wkSubmit" role="status">' + esc(submitNote) + '</p>') : '') +
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
      if (t.dataset.act !== 'giveup') armedGiveup = false;   // ほかを押したら確かめは取り消し
      if (t.dataset.pick) {
        const n = t.dataset.pick;
        picked = picked.includes(n) ? picked.filter(x => x !== n) : picked.length < 3 ? picked.concat(n) : picked;
        render();
        return;
      }
      switch (t.dataset.act) {
        case 'hub': done({ go: 'hub' }); break;
        case 'start': picked = []; save(W.startAttempt(s)); break;
        case 'giveup':
          if (!armedGiveup) { armedGiveup = true; render(); break; }
          armedGiveup = false; picked = []; save({ ...s, phase: 'lost' }); break;
        case 'resume': {
          const next = W.resumeBattle(s);
          if (next === s) return;
          W.saveWeekly(next);
          const opp = set.opponents[s.stage];
          done({ me: s.decks[s.stage].slice(), ai: opp.deck.slice(), level: opp.level, kind: 'weekly' });
          break;
        }
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
    const loadClears = () => clearsHtml(key).then((h) => { clears = h; const box = el.querySelector('#wkClears'); if (box) box.innerHTML = h; });
    /* 載せ損ねたクリアがあれば、先に載せてから一覧を読む */
    submitPending().then((r) => {
      if (r === 'ok') { s = W.loadWeekly(key); render(); }
      else if (r !== 'skip') { submitNote = '一覧に載せられませんでした: ' + r; const n = el.querySelector('#wkSubmit'); if (n) n.textContent = submitNote; }
      else if (!accountState().user) { /* ログインしていない: 案内のまま */ }
      loadClears();
    }, () => loadClears());
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
  /* 対戦中に週が変わっても (日本時間の月曜0時。イギリスでは日曜の夕方)、挑戦した週の中身で決着させる */
  const before = W.loadStoredWeekly();
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
      ? '<p class="rn-best">報酬: +30 XP ・ 初クリアで専用スリーブ LAUREL ・ 3週で専用マーカー</p>' +
        '<p class="rn-note">使ったデッキ ' + s.decks.map(d => deckLine(d, byName)).join(' ') + '</p>' +
        (s.submitted ? '<p class="rn-best">クリア者の一覧に載せました</p>'
          : user
            ? '<p class="rn-note" id="wkMsg" role="status">クリア者の一覧に載せています…</p>'
            : '<p class="rn-note">ログインすると、今週のクリア者の一覧に名前を載せられます (タイトル右上のログインから)。</p>')
      : '') +
    '<div class="rn-btns">' +
      (s.phase === 'choose' ? '<button type="button" class="rn-go" data-act="next">次へ</button>' : '') +
      (s.phase === 'lost' ? '<button type="button" class="rn-go" data-act="next">もう一度挑戦する</button>' : '') +
      '<button type="button" data-act="board">盤面を見る</button><button type="button" data-act="title">タイトルへ</button></div></div>';
  /* クリアしたら、ボタンを押さなくても一覧に載せる (名前は表示名)。失敗したときだけ、もう一度のボタンを出す */
  const sendClear = async () => {
    const msg = el.querySelector('#wkMsg');
    if (!msg) return;
    msg.textContent = 'クリア者の一覧に載せています…';
    const r = await submitPending().catch((e) => e.message);
    if (r === 'ok') msg.textContent = '一覧に載せました (' + (W.cleanName(displayName()) || 'PLAYER') + ')';
    else if (r === 'skip') msg.textContent = W.loadStoredWeekly().submitted ? '一覧に載せました' : 'ログインすると、クリア者の一覧に名前が載ります';
    else msg.innerHTML = '一覧に載せられませんでした: ' + esc(r) + ' <button type="button" class="rn-go" data-act="submit">もう一度載せる</button>';
  };
  if (s.phase === 'clear' && !s.submitted && user) sendClear();
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
      t.disabled = true;
      sendClear();
    }
  };
}
