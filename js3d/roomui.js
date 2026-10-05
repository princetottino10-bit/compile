/* =========================================================================
 * 3Dビュー: ルーム対戦のロビーUI
 *   ログイン → ロビー (クイック/作成/参加) → 待機 → ドラフト or 3択 →
 *   status が playing になった publicState を resolve して返す。
 *   戻るを押した場合は null を resolve する (呼び出し側でソロ設定へ)。
 * ========================================================================= */
import { showTitleBack, hideTitleBack } from './titleback.js';
import { displayName, setDisplayName, nameFieldHtml, bindNameField } from './displayname.js';
import { myBadge, myLook } from './cosmetics-ui.js';
import { settings } from './settings.js';
import { roomApi, roomLeaveKeepalive, roomIsAnonymous, roomLogin, roomSession, roomSignIn, roomSignInWithGitHub, roomSignInWithGoogle, roomSignOut, roomSignUp } from './room.js';
import { emblemDataURL } from './emblems.js';
import { showProtocolCards } from './protocards.js';
/* 呼ぶ (音・振動・見ていないタブの名前を点滅)。対戦中と同じもの */
import { callMe } from './callme.js';

const $ = (sel) => document.querySelector(sel);

function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

/* ドラフトのルールを1行で (例: 候補ランダム10個・BAN 各1つ) */
function ruleText(rules) {
  const r = rules || {};
  return 'ドラフト: ' + (r.poolSize ? '候補ランダム' + r.poolSize + '個' : '全プロトコル') +
    (r.bans ? '・BAN 各' + r.bans + 'つ' : '');
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : s;
  return d.innerHTML;
}

/* opts.cardsOf(name) -> そのプロトコルの6枚 (protocards.js の形。ドラフト中に中身を見る) */
export function runRoomLobby(protocols, opts = {}) {
  const root = $('#roomOv');
  const protoMap = {};
  for (const p of protocols) protoMap[p.name] = p;

  let room = null;         // 直近の publicState
  let sel = [];            // ドラフト / プロトコル選択の一時状態
  let busy = false;
  let pollTimer = null;
  let lobbyTimer = null;
  let finished = false;
  let session = null;
  /* レート戦のチェックは覚えておく (ほかのロビーの選択と同じく) */
  let wantRated = (() => { try { return localStorage.getItem('compileRoomRated') === '1'; } catch (e) { return false; } })();
  let pendingJoin = opts.joinCode ? String(opts.joinCode).toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6) : '';
  let waitStart = 0;       // 待機を始めた時刻 (経過時間と「CPU と遊ぶ」の案内に使う)
  let pollFails = 0;       // 問い合わせが続けて失敗した回数

  root.classList.add('show');

  return new Promise((resolve) => {
    const done = (result) => {
      if (finished) return;
      finished = true;
      clearInterval(pollTimer);
      clearInterval(lobbyTimer);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisible);
      hideTitleBack();
      root.classList.remove('show');
      root.innerHTML = '';
      resolve(result);
    };

    /* 失敗の文は、分かる言葉に直して出す (Failed to fetch・サーバーの番号など。元の文は報告用に残す: errtext.js) */
    const status = (text, type) => {
      const el = $('#roomStatus');
      if (type === 'err' && text) { noteError(text); text = friendlyMessage(text, { online: navigator.onLine !== false }); }
      if (el) { el.textContent = text || ''; el.dataset.type = type || ''; }
    };

    function frame(title, bodyHtml, backLabel) {
      root.innerHTML =
        '<div class="ro-panel">' +
          '<div class="ro-head"><b>//</b> ' + title + '</div>' +
          bodyHtml +
          '<div class="ro-status" id="roomStatus" role="status" aria-live="polite"></div>' +
          /* 一段前 (戦績 → ロビー) に戻るときだけ。タイトルへは右上の「タイトル」(待機・ドラフト中なら部屋を出てから) */
          (backLabel ? '<button class="ro-ghost" id="roomBack" type="button">' + backLabel + '</button>' : '') +
        '</div>';
      showTitleBack(() => {
        clearInterval(pollTimer); clearInterval(lobbyTimer);
        leaveRoom();
        done(null);
      });
    }

    /* 待機・ドラフト・プロトコル選択の途中で抜ける: 部屋を片付ける (ロビーに無人の部屋を残さない) */
    function inPregameRoom() {
      return room && room.code && room.status !== 'playing' && room.status !== 'finished';
    }
    let quickHost = null;            // クイックマッチで自分が部屋を作って待っている ({ rated })
    function leaveRoom() {
      if (!inPregameRoom()) return;
      const code = room.code;
      room = null;
      lsSet('compileRoomLast', '');
      roomApi('leave', { code }).catch(() => {});
    }
    function onPageHide() { if (inPregameRoom()) roomLeaveKeepalive(room.code); }
    function onVisible() { if (document.visibilityState === 'visible' && room) poll(); }
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisible);

    /* ---------- ログイン ---------- */
    async function showLogin() {
      clearInterval(lobbyTimer);
      const rateNote = wantRated
        ? '<p class="ro-sub">レート戦はゲスト以外のアカウントでログインしてください。</p>' :
          '<p class="ro-sub">通常戦はゲスト接続でも遊べます。レート戦にはメール・Google・GitHubのアカウントを使います。</p>';
      frame(wantRated ? 'RATED — ログイン' : 'ONLINE — 接続',
        (pendingJoin ? '<p class="ro-sub">招待された部屋 <b>' + esc(pendingJoin) + '</b> に入ります。</p>' : '') +
        /* いちばん手軽な「表示名を決めてゲストで始める」を先頭に */
        '<div class="ro-row"><input class="ro-input" id="roomName" maxlength="12" placeholder="表示名 (対戦相手に見える名前)" value="' + esc(displayName()) + '"></div>' +
        (wantRated ? '' : '<div class="ro-row"><button class="ro-big" id="roomGo" type="button">ゲストで始める (登録なし)</button></div>') +
        rateNote +
        '<div class="ro-row"><button class="' + (wantRated ? 'ro-big' : 'ro-btn') + '" id="roomGoogle" type="button">Googleでログイン</button>' +
        '<button class="ro-btn" id="roomGitHub" type="button">GitHubでログイン</button></div>' +
        '<details class="ro-mail"><summary>メールアドレスでログイン</summary>' +
        '<div class="ro-row"><input class="ro-input" id="roomEmail" type="email" autocomplete="email" placeholder="メールアドレス"></div>' +
        '<div class="ro-row"><input class="ro-input" id="roomPass" type="password" autocomplete="current-password" minlength="8" placeholder="パスワード（8文字以上）"></div>' +
        '<div class="ro-row"><button class="ro-btn" id="roomSignIn" type="button">ログイン</button>' +
        '<button class="ro-btn" id="roomSignUp" type="button">新規登録</button></div></details>',
        '');
      const values = () => ({
        name: ($('#roomName').value || '').trim(), email: ($('#roomEmail').value || '').trim(), password: $('#roomPass').value || ''
      });
      const validate = () => {
        const v = values();
        if (!v.name) throw new Error('表示名を入力してください');
        if (!v.email) throw new Error('メールアドレスを入力してください');
        if (v.password.length < 8) throw new Error('パスワードは8文字以上です');
        setDisplayName(v.name);
        return v;
      };
      $('#roomSignIn').onclick = async () => {
        try {
          const v = validate(); status('ログイン中…');
          session = await roomSignIn(v.email, v.password, v.name); showLobby();
        } catch (e) { status(e.message || 'ログインできませんでした', 'err'); }
      };
      $('#roomSignUp').onclick = async () => {
        try {
          const v = validate(); status('アカウントを作成中…');
          session = await roomSignUp(v.email, v.password, v.name); showLobby();
        } catch (e) { status(e.message || '登録できませんでした', 'err'); }
      };
      $('#roomGitHub').onclick = async () => {
        const name = ($('#roomName').value || '').trim();
        if (name) setDisplayName(name);
        try { await roomSignInWithGitHub(); }
        catch (e) { status(e.message || 'GitHubでログインできませんでした', 'err'); }
      };
      $('#roomGoogle').onclick = async () => {
        const name = ($('#roomName').value || '').trim();
        if (name) setDisplayName(name);
        try { await roomSignInWithGoogle(); }
        catch (e) { status(e.message || 'Googleでログインできませんでした', 'err'); }
      };
      const guest = $('#roomGo');
      if (guest) guest.onclick = async () => {
        const n = ($('#roomName').value || '').trim();
        if (!n) { status('表示名を入力してください', 'err'); return; }
        setDisplayName(n);
        status('接続中…');
        try { session = await roomLogin(n); showLobby(); }
        catch (e) { status(e.message, 'err'); }
      };
    }

    /* ---------- ロビー ---------- */
    /* いま誰でログインしているか (ゲストか、Google 等のアカウントか) */
    function accountLabel() {
      const u = session && session.user;
      if (!u) return '未ログイン';
      if (roomIsAnonymous(session)) return 'ゲスト' + (displayName() ? ' (' + displayName() + ')' : '');
      const m = u.user_metadata || {};
      const via = (u.app_metadata && u.app_metadata.provider) || 'email';
      const provider = { google: 'Google', github: 'GitHub', email: 'メール' }[via] || via;
      /* Google の名前 (本名のことが多い) は出さず、自分で決めた表示名を出す */
      void m;
      return (displayName() || '表示名なし') + ' (' + provider + ')';
    }

    async function showLobby() {
      /* 上から: 自分 (名前・ログイン) → すぐ遊ぶ (クイックマッチ) → 部屋を作る / コードで入る (切り替え) → 募集中・観戦できる対戦 */
      const lobbyTab = lsGet('compileRoomTab') === 'join' ? 'join' : 'create';
      frame('ONLINE',
        '<div class="ro-account"><span><b>' + esc(accountLabel()) + '</b></span>' +
          '<span class="ro-acts"><button class="ro-ghost" id="roomStats" type="button">戦績</button>' +
          '<button class="ro-ghost" id="roomLogout" type="button">ログアウト</button></span></div>' +
        /* 対戦相手や順位表に出る名前。決めていなければ開いておく */
        '<details class="ro-name"' + (displayName() ? '' : ' open') + '><summary>表示名を変える</summary>' + nameFieldHtml('ro') + '</details>' +
        /* 事故で閉じたときの戻り道。参加者本人ならサーバーが再入室を許す */
        (lsGet('compileRoomLast')
          ? '<button class="ro-big ro-resume" id="roomResume" type="button">中断した対戦に戻る (' + esc(lsGet('compileRoomLast')) + ')</button>'
          : '') +
        '<section class="ro-card ro-quick">' +
          '<button class="ro-big" id="roomQuick" type="button">クイックマッチ</button>' +
          (roomIsAnonymous(session)
            ? '<label class="ro-check off"><input type="checkbox" id="roomRated" disabled> レート戦 (ログインすると遊べます)</label>'
            : '<label class="ro-check"><input type="checkbox" id="roomRated"' + (wantRated ? ' checked' : '') + '> レート戦 (結果を記録してレートを更新)</label>') +
          '<p class="ro-online" id="roomOnline">オンラインの人数を確認中…</p>' +
        '</section>' +
        '<div class="ro-seg ro-tabs" role="tablist">' +
          '<button type="button" class="ro-segbtn' + (lobbyTab === 'create' ? ' on' : '') + '" data-tab="create" role="tab" aria-selected="' + (lobbyTab === 'create') + '">部屋を作る</button>' +
          '<button type="button" class="ro-segbtn' + (lobbyTab === 'join' ? ' on' : '') + '" data-tab="join" role="tab" aria-selected="' + (lobbyTab === 'join') + '">コードで入る</button></div>' +
        '<section class="ro-card" id="roomTabCreate"' + (lobbyTab === 'create' ? '' : ' hidden') + '>' +
          /* 1対1 か タッグ (2対2)。タッグはドラフト・レート戦なし */
          '<div class="ro-seg" role="radiogroup" aria-label="対戦の形">' +
            '<button type="button" class="ro-segbtn" data-mode="duel" role="radio">1対1</button>' +
            '<button type="button" class="ro-segbtn" data-mode="tag" role="radio">タッグ (2対2)</button></div>' +
          '<label class="ro-check"><input type="checkbox" id="roomDraft" checked> 公式ドラフトで決める</label>' +
          /* ドラフトのルール: 候補の抽選数と BAN 数 */
          '<div class="ro-rules" id="roomRules">' +
            '<label>候補<select class="ro-input" id="roomPool">' +
              '<option value="0">全プロトコル</option><option value="12">ランダム12個</option>' +
              '<option value="10">ランダム10個</option><option value="8">ランダム8個</option></select></label>' +
            '<label>BAN<select class="ro-input" id="roomBans">' +
              '<option value="0">なし</option><option value="1">各1つ</option><option value="2">各2つ</option></select></label>' +
          '</div>' +
          '<label class="ro-check"><input type="checkbox" id="roomWatch"' + (lsGet('compileRoomWatch') === '0' ? '' : ' checked') + '> 観戦を許す (合言葉なしの1対1だけ)</label>' +
          '<input class="ro-input" id="roomPw" maxlength="40" type="password" autocomplete="new-password" placeholder="合言葉 (任意。付けると一覧に鍵が付く)">' +
          '<button class="ro-btn ro-go" id="roomCreate" type="button">部屋を作る</button>' +
        '</section>' +
        '<section class="ro-card" id="roomTabJoin"' + (lobbyTab === 'join' ? '' : ' hidden') + '>' +
          '<div class="ro-row"><input class="ro-input ro-codein" id="roomCode" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="6桁のコード">' +
            '<button class="ro-btn ro-go" id="roomJoin" type="button">入る</button></div>' +
          '<input class="ro-input" id="roomJoinPw" maxlength="40" type="password" autocomplete="off" placeholder="合言葉 (付いている部屋だけ)">' +
        '</section>' +
        '<div class="ro-lbl">募集中の部屋</div><div class="ro-list" id="roomList"><span class="ro-sub">読込中…</span></div>' +
        '<div class="ro-lbl">観戦できる対戦</div><div class="ro-list" id="roomWatchList"><span class="ro-sub">読込中…</span></div>');
      root.querySelectorAll('.ro-tabs [data-tab]').forEach(b => {
        b.onclick = () => {
          const t = b.dataset.tab;
          lsSet('compileRoomTab', t);
          root.querySelectorAll('.ro-tabs [data-tab]').forEach(x => {
            x.classList.toggle('on', x === b);
            x.setAttribute('aria-selected', String(x === b));
          });
          $('#roomTabCreate').hidden = t !== 'create';
          $('#roomTabJoin').hidden = t !== 'join';
          if (t === 'join') $('#roomCode').focus();
        };
      });
      $('#roomWatch').onchange = function () { lsSet('compileRoomWatch', this.checked ? '1' : '0'); };
      $('#roomCode').oninput = function () { this.value = this.value.toUpperCase().replace(/[^A-Z2-9]/g, ''); };
      $('#roomLogout').onclick = guard(async () => {
        await roomSignOut();
        session = null;
        status('ログアウトしました', 'ok');
        await showLogin();
      });
      /* ルールはドラフトのときだけ選べる。記憶しておき、次に作るときも同じにする */
      let createMode = lsGet('compileRoomMode') === 'tag' ? 'tag' : 'duel';
      const syncRules = () => {
        const tag = createMode === 'tag';
        $('#roomRules').classList.toggle('off', tag || !$('#roomDraft').checked);
        $('#roomDraft').disabled = tag;
        $('#roomDraft').closest('label').classList.toggle('off', tag);
        /* 観戦は合言葉なしの1対1だけ */
        const noWatch = tag || !!$('#roomPw').value;
        $('#roomWatch').disabled = noWatch;
        $('#roomWatch').closest('label').classList.toggle('off', noWatch);
        root.querySelectorAll('.ro-segbtn[data-mode]').forEach(b => {
          const on = b.dataset.mode === createMode;
          b.classList.toggle('on', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
      };
      root.querySelectorAll('.ro-segbtn[data-mode]').forEach(b => {
        b.onclick = () => { createMode = b.dataset.mode; lsSet('compileRoomMode', createMode); syncRules(); };
      });
      $('#roomPool').value = lsGet('compileDraftPool') || '0';
      $('#roomBans').value = lsGet('compileDraftBans') || '0';
      $('#roomDraft').onchange = syncRules;
      $('#roomPw').oninput = syncRules;
      syncRules();

      const name = () => displayName();
      bindNameField($('#roomOv'), 'ro', () => { const acc = $('#roomOv .ro-account b'); if (acc) acc.textContent = accountLabel(); });
      /* 表示名が無いまま対戦しようとしたら、先に決めてもらう */
      const needName = () => {
        if (displayName()) return false;
        status('先に表示名を決めてください (対戦相手や順位表に出ます)', 'err');
        const i = $('#roName');
        if (i) i.focus();
        return true;
      };
      $('#roomQuick').onclick = guard(async () => {
        if (needName()) return;
        status('空きルームを探しています…');
        const data = await roomApi('list');
        const rated = $('#roomRated').checked;
        wantRated = rated;
        if (rated && roomIsAnonymous(session)) { await showLogin(); return; }
        const open = (data.rooms || []).find(r => !r.locked && !!r.rated === rated && r.mode !== 'tag');
        if (!open && (data.rooms || []).some(r => !r.locked && !!r.rated !== rated)) {
          status(rated ? 'レート戦なしで待っている人がいます (チェックを外すと対戦できます)' : 'レート戦で待っている人がいます (ログインしてレート戦にすると対戦できます)', 'ok');
        }
        room = open
          ? await roomApi('join', { name: name(), badge: myBadge(settings()), look: myLook(settings()), code: open.code, password: '' })
          : await roomApi('create', { name: name(), badge: myBadge(settings()), look: myLook(settings()), title: rated ? 'レート戦' : 'クイック対戦', visibility: 'public', password: '', draft: true, rated });
        quickHost = open ? null : { rated };
        enterRoom();
      });
      $('#roomCreate').onclick = guard(async () => {
        if (needName()) return;
        const pw = $('#roomPw').value;
        wantRated = $('#roomRated').checked;
        try { localStorage.setItem('compileRoomRated', wantRated ? '1' : '0'); } catch (e) { /* private mode */ }
        if (wantRated && roomIsAnonymous(session)) { await showLogin(); return; }
        if (pw && pw.length < 4) { status('パスワードは4文字以上です', 'err'); return; }
        const draftRules = { poolSize: +$('#roomPool').value, bans: +$('#roomBans').value };
        if (draftRules.poolSize && draftRules.poolSize < 6 + draftRules.bans * 2) {
          status('候補が足りません (各自3つ + BAN ' + draftRules.bans * 2 + ' つ = ' + (6 + draftRules.bans * 2) + ' 個以上)', 'err');
          return;
        }
        lsSet('compileDraftPool', String(draftRules.poolSize));
        lsSet('compileDraftBans', String(draftRules.bans));
        if (createMode === 'tag') {
          if (wantRated) { status('タッグ戦はレート戦にできません (チェックを外してください)', 'err'); return; }
          room = await roomApi('create', {
            name: name(), badge: myBadge(settings()), look: myLook(settings()), title: name() + ' のタッグ',
            visibility: pw ? 'private' : 'public', password: pw, mode: 'tag'
          });
          enterRoom();
          return;
        }
        room = await roomApi('create', {
          name: name(), badge: myBadge(settings()), look: myLook(settings()), title: name() + ' のルーム',
          visibility: pw ? 'private' : 'public',
          password: pw, draft: $('#roomDraft').checked, draftRules, rated: $('#roomRated').checked, allowWatch: $('#roomWatch').checked
        });
        enterRoom();
      });
      const resumeBtn = $('#roomResume');
      if (resumeBtn) resumeBtn.onclick = guard(async () => {
        const code = lsGet('compileRoomLast');
        status('対戦に復帰しています…');
        try {
          room = await roomApi('join', { name: name(), badge: myBadge(settings()), look: myLook(settings()), code, password: '' });
          enterRoom();
        } catch (e) {
          /* 部屋が消えている / 別アカウントになっている場合は目印を消す */
          lsSet('compileRoomLast', '');
          status(e.message || 'その対戦には戻れませんでした', 'err');
          setTimeout(showLobby, 1200);
        }
      });
      $('#roomStats').onclick = guard(showHistory);
      $('#roomJoin').onclick = guard(async () => {
        if (needName()) return;
        const code = $('#roomCode').value;
        if (code.length !== 6) { status('6桁のコードを入力してください', 'err'); return; }
        room = await roomApi('join', { name: name(), badge: myBadge(settings()), look: myLook(settings()), code, password: $('#roomJoinPw').value });
        enterRoom();
      });

      const loadList = async () => {
        try {
          const data = await roomApi('list');
          const el = $('#roomList');
          if (!el) return;
          const rooms = data.rooms || [];
          /* 合言葉を入れている途中は、一覧を描き直さない (打った文字と入力欄が消えないように) */
          const typing = el.querySelector('.ro-pwrow');
          if (!typing) el.innerHTML = rooms.length
            ? rooms.map(r => '<button class="ro-room" data-code="' + esc(r.code) + '" data-locked="' + (r.locked ? '1' : '0') + '" type="button"><span>' +
                (r.mode === 'tag' ? '<em class="ro-tagmark">TAG ' + (r.seatsTaken | 0) + '/4</em> ' : '') +
                esc(r.title || r.code) + (r.rated ? ' ★' : '') + (r.locked ? ' 🔒' : '') + '</span>' +
                '<small>' + esc(r.code) + (r.mode === 'tag' ? '　タッグ (2対2)' : r.draft ? '　' + esc(ruleText(r.draftRules)) : '　ドラフトなし') +
                (r.createdAt ? '　' + esc(waitingLabel(r.createdAt)) : '') + '</small></button>').join('')
            : '<span class="ro-sub">現在募集中のルームはありません</span>';
          const on = $('#roomOnline');
          if (on) {
            const w = data.waiting || 0, pl = data.playing || 0;
            on.innerHTML = w || pl
              ? '<b>' + w + '</b> 人が対戦相手を待っています ・ <b>' + pl + '</b> 部屋で対戦中'
              : 'いまは誰もいないようです。部屋を作って<b>招待リンク</b>を友達に送るか、クイックマッチで待ってみてください';
          }
          /* 観戦できる対戦 (人どうしの1対1)。押すと、両方の手札を伏せた盤面を見る */
          const wl = $('#roomWatchList');
          if (wl) {
            const live = data.watch || [];
            wl.innerHTML = live.length
              ? live.map(r => '<button class="ro-room ro-watch" data-watch="' + esc(r.code) + '" type="button"><span>' +
                  esc(r.names[0] || '?') + ' <em>vs</em> ' + esc(r.names[1] || '?') + (r.rated ? ' ★' : '') + '</span>' +
                  '<small>' + esc((r.protocols[0] || []).join(' / ')) + '　vs　' + esc((r.protocols[1] || []).join(' / ')) + '</small></button>').join('')
              : '<span class="ro-sub">いま観戦できる対戦はありません</span>';
            wl.querySelectorAll('[data-watch]').forEach(b => {
              b.onclick = guard(async () => {
                const rm = await roomApi('watch', { code: b.dataset.watch });
                done({ rm, watch: true });
              });
            });
          }
          if (!typing) el.querySelectorAll('.ro-room').forEach(b => {
            const join = guard(async (pw) => {
              if (needName()) return;
              if (b.textContent.includes('★') && roomIsAnonymous(session)) { wantRated = true; await showLogin(); return; }
              room = await roomApi('join', { name: name(), badge: myBadge(settings()), look: myLook(settings()), code: b.dataset.code, password: pw || '' });
              enterRoom();
            });
            b.onclick = () => {
              if (b.dataset.locked !== '1') { join(''); return; }
              /* 鍵の付いた部屋: ブラウザの入力ダイアログではなく、その部屋の下に合言葉の欄を出す */
              el.querySelectorAll('.ro-pwrow').forEach(x => x.remove());
              b.insertAdjacentHTML('afterend', '<form class="ro-pwrow"><input class="ro-input" type="password" maxlength="40" autocomplete="off" aria-label="' +
                esc(b.dataset.code) + ' の合言葉" placeholder="合言葉"><button class="ro-btn ro-go" type="submit">入る</button>' +
                '<button class="ro-ghost" type="button" data-cancel="1">やめる</button></form>');
              const form = b.nextElementSibling;
              const input = form.querySelector('input');
              input.focus();
              form.onsubmit = (ev) => { ev.preventDefault(); if (!input.value) { status('合言葉を入れてください', 'err'); input.focus(); return; } join(input.value); };
              form.querySelector('[data-cancel]').onclick = () => { form.remove(); b.focus(); };
              input.onkeydown = (ev) => { if (ev.key === 'Escape') { form.remove(); b.focus(); } };
            };
          });
        } catch (e) {
          const on = $('#roomOnline');
          if (on) on.textContent = '一覧を読み込めませんでした (通信を確認してください)';
        }
      };
      loadList();
      clearInterval(lobbyTimer);
      lobbyTimer = setInterval(loadList, 8000);   // 無料枠の節約 (以前は 5 秒)
      if (pendingJoin) {
        const code = pendingJoin;
        if (needName()) return;
        pendingJoin = '';
        guard(async () => {
          status('招待された部屋 ' + code + ' に入っています…');
          try {
            room = await roomApi('join', { name: name(), badge: myBadge(settings()), look: myLook(settings()), code, password: '' });
          } catch (e) {
            /* 合言葉の付いた部屋: 「コードで入る」にコードを入れた状態で、合言葉の欄へ (前は失敗して止まっていた) */
            if (/パスワード|合言葉/.test((e && e.message) || '')) {
              const tab = root.querySelector('.ro-tabs [data-tab="join"]');
              if (tab) tab.click();
              const codeIn = $('#roomCode'), pw = $('#roomJoinPw');
              if (codeIn) codeIn.value = code;
              status('この部屋には合言葉が付いています。招待した人に聞いて入れてください', 'err');
              if (pw) pw.focus();
              return;
            }
            throw e;
          }
          enterRoom();
        })();
      }
    }

    function csvCell(value) {
      const text = String(value == null ? '' : value);
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    async function showHistory() {
      clearInterval(lobbyTimer);
      frame('RATED — 戦績', '<p class="ro-sub">読み込み中…</p>', '← ロビーへ戻る');
      $('#roomBack').onclick = () => showLobby();
      const data = await roomApi('history');
      const rows = data.matches || [];
      const rate = data.rating || 1500;
      const wins = data.wins || 0;
      const games = data.games || 0;
      /* この端末に残っているリプレイ (オンライン) と合う試合には「リプレイ」を付ける */
      const local = listReplays();
      const matchRow = (m) => {
        const rp = findMatchReplay(local, m);
        return '<div class="ro-room ro-hist" data-opp="' + esc(String(m.opponent || '').toLowerCase()) + '"><b>' + (m.result === 'win' ? 'WIN' : 'LOSS') + '</b>　' + esc(m.opponent) +
          (rp ? '<a class="ro-rplink" href="?replay=' + encodeURIComponent(rp.id) + '">リプレイ</a>' : '') +
          '<small>' + esc((m.myProtocols || []).join(' / ')) + ' vs ' + esc((m.opponentProtocols || []).join(' / ')) +
          '　' + m.ratingBefore + ' → ' + m.ratingAfter + '　' + new Date(m.endedAt).toLocaleString('ja-JP') + '</small></div>';
      };
      const list = rows.length
        ? rows.map(matchRow).join('')
        : '<span class="ro-sub">レート戦の記録はまだありません。</span>';
      /* シーズン (1か月ごと。月が変わるとレートが 1500 へ半分近づいて始め直す) */
      const seasonLabel = (k) => k ? k.slice(1, 5) + '-' + k.slice(5, 7) : '';
      const sGames = data.seasonGames || 0, sWins = data.seasonWins || 0;
      const myRank = (data.leaderboard || []).find(r => r.me);
      const board = (data.leaderboard || []).length
        ? '<ol class="ro-board">' + data.leaderboard.map(r => '<li class="' + (r.me ? 'me' : '') + '"><b>' + r.rank + '</b><span>' + esc(r.name) + '</span>' +
            '<em>' + r.rating + '</em><small>' + r.wins + '-' + (r.games - r.wins) + '</small></li>').join('') + '</ol>'
        : '<span class="ro-sub">今シーズンはまだ誰も遊んでいません。</span>';
      const past = (data.pastSeasons || []).length
        ? '<ul class="ro-past">' + data.pastSeasons.map(p => '<li><b>' + seasonLabel(p.season) + '</b><span>' + p.rank + '位 / ' + p.players + '人</span>' +
            '<em>' + p.rating + '</em><small>' + p.wins + '-' + (p.games - p.wins) + '</small></li>').join('') + '</ul>'
        : '';
      const panel = $('#roomOv .ro-panel');
      panel.querySelector('.ro-status').insertAdjacentHTML('beforebegin',
        '<div class="ro-season"><small>SEASON ' + seasonLabel(data.season) + '</small><b>' + (data.seasonRating || 1500) + '</b>' +
          '<span>' + sWins + '勝 ' + (sGames - sWins) + '敗' + (myRank ? '　' + myRank.rank + '位' : '') + '</span></div>' +
        '<p class="ro-sub">月が変わると、その月の結果を記念に残して、レートを 1500 に半分近づけて始め直します。</p>' +
        '<h4 class="ro-h">LEADERBOARD <small>順位表</small></h4>' + board +
        (past ? '<h4 class="ro-h">PAST SEASONS <small>前のシーズン</small></h4>' + past : '') +
        '<h4 class="ro-h">MATCHES <small>対戦の記録　通算 レート ' + rate + '　' + wins + '勝 ' + (games - wins) + '敗</small></h4>' +
        '<div class="ro-row ro-histbar">' +
          (rows.length ? '<input class="ro-input" id="roomHistFind" type="search" maxlength="20" autocomplete="off" placeholder="相手の名前で絞る" aria-label="相手の名前で絞る">' : '') +
          '<button class="ro-btn" id="roomCsv" type="button">CSVをエクスポート</button></div>' +
        '<p class="ro-sub" id="roomHistCount" role="status" aria-live="polite"></p>' +
        '<div class="ro-list" id="roomHistList">' + list + '</div>' +
        /* CPU 戦の戦績 (RECORD) へ。閉じるとこの画面に戻る */
        '<button class="ro-ghost ro-torecord" id="roomToRecord" type="button">RECORD (CPU 戦の戦績・リプレイ) を開く</button>');
      const find = $('#roomHistFind');
      if (find) {
        find.oninput = () => {
          const q = find.value.trim().toLowerCase();
          let shown = 0;
          root.querySelectorAll('#roomHistList .ro-hist').forEach(r => { const on = !q || r.dataset.opp.includes(q); r.hidden = !on; if (on) shown++; });
          $('#roomHistCount').textContent = q ? (shown ? shown + ' 戦' : '「' + find.value.trim() + '」との試合はありません') : '';
        };
      }
      $('#roomToRecord').onclick = () => import('./stats.js').then(m => m.openStats({ tab: 'まとめ', fromRated: true }));
      $('#roomCsv').onclick = () => {
        const header = ['終了日時', '結果', '相手', '自分のプロトコル', '相手のプロトコル', 'レート前', 'レート後'];
        const csv = [header].concat(rows.map(m => [
          new Date(m.endedAt).toISOString(), m.result === 'win' ? 'WIN' : 'LOSS', m.opponent,
          (m.myProtocols || []).join(' / '), (m.opponentProtocols || []).join(' / '), m.ratingBefore, m.ratingAfter
        ])).map(line => line.map(csvCell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'compile-rated-matches.csv'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
    }

    function guard(fn) {
      return async (...args) => {
        if (busy) return;
        busy = true;
        try { await fn(...args); }
        catch (e) { status(e.message || '通信エラー', 'err'); }
        finally { busy = false; }
      };
    }

    /* ---------- 入室後 (待機 / ドラフト / プロトコル選択) ---------- */
    function enterRoom() {
      clearInterval(lobbyTimer);
      /* 事故で閉じても戻れるよう、部屋のコードを覚えておく */
      if (room && room.code) lsSet('compileRoomLast', room.status === 'finished' ? '' : room.code);   // 終わった対戦は覚えない
      /* 再入室では既に対戦中のことがある (join が playing を返す) */
      if (room.status === 'playing' || room.status === 'finished') { done({ rm: room }); return; }
      sel = [];
      waitStart = Date.now();
      pollFails = 0;
      renderRoom();
      clearInterval(pollTimer);
      pollTimer = setInterval(poll, 2500);   // 相手を待つ間の問い合わせ (無料枠の節約。以前は 1.3 秒)
    }

    /* クイックマッチのすれ違い: 同時に押した2人が別々の部屋を作ると、どちらも待ち続けていた。
       待っている間もときどき一覧を見て、ほかのクイックの部屋があれば、コードの大きいほうが小さいほうへ移る (片方だけが動く) */
    let quickScan = 0;
    async function quickMerge() {
      if (!quickHost || !room || room.status !== 'waiting' || (room.names && room.names[1])) return false;
      if (++quickScan % 4) return false;              // 見張りの 4 回に 1 回
      let data;
      try { data = await roomApi('list'); } catch (e) { return false; }
      const other = (data.rooms || []).filter(r => r.code !== room.code && !r.locked && !!r.rated === quickHost.rated && r.mode !== 'tag'
        && (r.title === 'クイック対戦' || r.title === 'レート戦')).sort((a, b) => (a.code < b.code ? -1 : 1))[0];
      if (!other || !(other.code < room.code)) return false;
      const mine = room.code;
      try {
        const next = await roomApi('join', { name: name(), badge: myBadge(settings()), look: myLook(settings()), code: other.code, password: '' });
        roomApi('leave', { code: mine }).catch(() => {});
        quickHost = null;
        room = next;
        status('ほかに待っていた人の部屋に入りました', 'ok');
        enterRoom();
        return true;
      } catch (e) { return false; }
    }

    async function poll() {
      if (busy || !room) return;
      let next;
      tickWait();
      if (await quickMerge()) return;
      try { next = await roomApi('get', { code: room.code, stamp: room.stamp }); } catch (e) {
        /* 部屋が消えた (相手が抜けた・片付けられた) ならロビーへ。一時的な失敗は何回か続いたら知らせる */
        if (/ルームが見つかりません/.test(e.message || '')) {
          clearInterval(pollTimer);
          room = null;
          lsSet('compileRoomLast', '');
          status('相手が抜けたため、部屋が閉じられました', 'err');
          setTimeout(showLobby, 1400);
          return;
        }
        if (++pollFails >= 3) status('接続が不安定です。再接続を試みています…', 'err');
        return;
      }
      if (pollFails >= 3) status('');
      pollFails = 0;
      if (next.unchanged) return;                                  // 前回から変わっていない (盤面は省かれている)
      if (next.version === room.version && next.status === room.status) { room = next; return; }
      const wasAttn = attention(room);
      room = next;
      const nowAttn = attention(room);
      if (nowAttn && nowAttn !== wasAttn) callMe(nowAttn === 'joined' ? '相手が来ました' : 'あなたの番です');
      if (room.status === 'playing' || room.status === 'finished') { done({ rm: room }); return; }
      renderRoom();
    }

    /* 待機中の経過時間。45秒たったら「CPU と遊ぶ」を出す */
    function tickWait() {
      const el = $('#roomWait');
      if (!el || !waitStart) return;
      const sec = Math.floor((Date.now() - waitStart) / 1000);
      el.textContent = '待機 ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      const cpu = $('#roomCpu');
      if (cpu && sec >= 45) cpu.hidden = false;
    }

    /* 知らせること: 相手が来た / ドラフトで自分の番になった (ほかのタブで待っていても気づけるように) */
    function attention(r) {
      if (!r || !r.names || !r.names[1]) return null;
      if (r.status === 'draft' && r.draft && r.draft.active === r.side) return 'myturn:' + JSON.stringify(r.draft.banned || '') + (r.protocols ? JSON.stringify(r.protocols) : '');
      return 'joined';
    }

    function mode() {
      if (room.mode === 'tag') return room.status === 'setup' ? 'tagpick' : 'tagwait';
      if (room.status === 'draft') return 'draft';
      return room.names[1] ? 'protocols' : 'waiting';
    }

    function chipGrid(names, taken, limit) {
      return '<div class="ro-chips">' + names.map(n => {
        const p = protoMap[n] || {};
        const isTaken = taken.includes(n);
        const isSel = sel.includes(n);
        return '<span class="ro-chipwrap"><button type="button" class="ro-chip' + (isSel ? ' on' : '') + (isTaken ? ' taken' : '') + '" data-name="' + esc(n) + '"' +
          ' aria-pressed="' + isSel + '"' + (isTaken ? ' aria-disabled="true"' : '') +
          ' style="--accent:' + (p.color || '#b9a4ff') + '">' +
          '<img alt="" src="' + emblemDataURL(n, p.color || '#b9a4ff', 48, true) + '">' + esc(n) + '</button>' +
          (opts.cardsOf ? '<button type="button" class="ro-info" data-info="' + esc(n) + '" aria-label="' + esc(n) + ' のカードを見る" title="カードを見る">?</button>' : '') +
          '</span>';
      }).join('') + '</div>';
    }

    function bindChips(limit, rerender) {
      root.querySelectorAll('.ro-info').forEach(b => {
        b.onclick = (ev) => {
          ev.stopPropagation();
          const p = protoMap[b.dataset.info] || {};
          showProtocolCards(b.dataset.info, p.color, opts.cardsOf);
        };
      });
      root.querySelectorAll('.ro-chip').forEach(b => {
        b.onclick = () => {
          if (b.classList.contains('taken')) return;
          const n = b.dataset.name;
          const i = sel.indexOf(n);
          if (i >= 0) sel.splice(i, 1);
          else if (sel.length < limit) sel.push(n);
          rerender();
        };
      });
    }

    /* 招待リンク・コードのコピー (1対1 とタッグで共通) */
    function bindInvite() {
      const link = location.origin + location.pathname + '?room=' + room.code;
      const copy = async (text, label) => {
        try { await navigator.clipboard.writeText(text); status(label + 'をコピーしました', 'ok'); }
        catch (e) { status('コピーできませんでした。' + text, 'err'); }
      };
      $('#roomCopy').onclick = () => copy(room.code, 'コード');
      $('#roomInvite').onclick = async () => {
        if (navigator.share) {
          try { await navigator.share({ title: 'COMPILE で対戦しよう', text: 'COMPILE 3D ARENA の部屋 ' + room.code + ' で待っています', url: link }); return; }
          catch (e) { if (e && e.name === 'AbortError') return; }
        }
        copy(link, '招待リンク');
      };
    }

    /* ---- タッグ (2対2) ----
       席は [A1, B1, A2, B2]。手番もこの順。空いた席は押すと移れる。ホストは空き ⇔ CPU を切り替え、よく使う形を1回で選べる */
    const SEAT_LABEL = ['A1', 'B1', 'A2', 'B2'];
    function seatCard(i) {
      const x = room.seats[i];
      const me = i === room.seat;
      const kind = !x ? 'open' : x.cpu ? 'cpu' : 'human';
      const who = !x ? '空き' : x.cpu ? 'CPU' : esc(x.name) + (me ? ' <em>あなた</em>' : '');
      const hint = me ? '' : kind === 'human' ? '' : 'ここに移る';
      return '<div class="tg-seat ' + kind + (me ? ' me' : '') + '">' +
        '<button type="button" class="tg-sit" data-to="' + i + '"' + (kind === 'human' ? ' disabled' : '') + ' aria-label="' + SEAT_LABEL[i] + ' ' + (x ? (x.cpu ? 'CPU' : esc(x.name)) : '空き') + '">' +
          '<small>' + SEAT_LABEL[i] + '</small><b>' + who + '</b>' + (hint ? '<i>' + hint + '</i>' : '') + '</button>' +
        (room.host && kind !== 'human'
          ? '<button type="button" class="tg-cpu" data-i="' + i + '" data-cpu="' + (kind === 'cpu' ? '0' : '1') + '">' + (kind === 'cpu' ? '空けて待つ' : 'CPU にする') + '</button>'
          : '') +
        '</div>';
    }
    function renderTagWait() {
      const people = room.seats.filter(x => x && !x.cpu).length;
      frame('ONLINE — タッグ (2対2)',
        '<div class="ro-code">' + esc(room.code) + '</div>' +
        '<p class="ro-sub">席を押すと移れます。同じチームの2人が味方です。手番は A1 → B1 → A2 → B2 の順。</p>' +
        '<div class="tg-board">' +
          '<section class="tg-team a"><h4>チーム A</h4>' + seatCard(0) + seatCard(2) + '</section>' +
          '<div class="tg-vs" aria-hidden="true">VS</div>' +
          '<section class="tg-team b"><h4>チーム B</h4>' + seatCard(1) + seatCard(3) + '</section>' +
        '</div>' +
        (room.host
          ? '<div class="ro-lbl">よく使う形</div><div class="ro-row tg-presets">' +
              '<button class="ro-btn" data-preset="coop" type="button">2人で協力<small>相手は CPU 2人</small></button>' +
              '<button class="ro-btn" data-preset="duel" type="button">2人で対決<small>それぞれに CPU の味方</small></button>' +
              '<button class="ro-btn" data-preset="shuffle" type="button">ランダムに分ける</button></div>'
          : '') +
        '<div class="ro-row ro-fill"><button class="ro-btn ro-go" id="roomInvite" type="button">招待リンクを送る</button>' +
        '<button class="ro-btn" id="roomCopy" type="button">コードをコピー</button></div>' +
        (room.host
          ? '<button class="ro-big" id="tagStart" type="button"' + (room.canStart ? '' : ' disabled') + '>' +
              (room.canStart ? 'この席で始める' : people < 2 ? 'もう1人を待っています (招待リンクを送ってください)' : '空いた席を埋めてください (CPU にもできます)') + '</button>'
          : '<p class="ro-sub">部屋を作った人が始めるのを待っています…</p>') +
        '<button class="ro-ghost" id="roomLeave" type="button">部屋を出てロビーへ</button>');
      $('#roomLeave').onclick = () => { clearInterval(pollTimer); leaveRoom(); showLobby(); };
      bindInvite();
      const send = (op, extra) => guard(async () => { room = await roomApi(op, { code: room.code, ...extra }); if (room.status !== 'waiting') { renderRoom(); return; } renderTagWait(); })();
      root.querySelectorAll('.tg-sit').forEach(b => { b.onclick = () => { if (!b.disabled && +b.dataset.to !== room.seat) send('tagSeat', { to: +b.dataset.to }); }; });
      root.querySelectorAll('.tg-cpu').forEach(b => { b.onclick = () => send('tagCpu', { index: +b.dataset.i, cpu: b.dataset.cpu === '1' }); });
      root.querySelectorAll('[data-preset]').forEach(b => { b.onclick = () => send('tagPreset', { kind: b.dataset.preset }); });
      const start = $('#tagStart');
      if (start) start.onclick = () => { if (room.canStart) send('tagStart', {}); };
    }
    function renderTagPick() {
      const mine = room.seats[room.seat] || {};
      const mate = room.seats[(room.seat + 2) % 4] || {};
      const mateTaken = mate.protocols || [];
      const status2 = room.seats.map((x, i) => '<span class="tg-ready' + (x && x.protocols ? ' on' : '') + (i === room.seat ? ' me' : '') + '">' +
        SEAT_LABEL[i] + ' ' + (x ? (x.cpu ? 'CPU' : esc(x.name)) : '') + (x && x.protocols ? ' ✓' : ' …') + '</span>').join('');
      if (mine.protocols) {
        frame('ONLINE — タッグ (2対2)',
          '<div class="ro-lbl">あなたのプロトコル</div><div>' + mine.protocols.map(n => '<span class="ro-tag mine">' + esc(n) + '</span>').join('') + '</div>' +
          '<div class="ro-lbl">みんなの準備</div><div class="tg-readys">' + status2 + '</div>' +
          '<p class="ro-sub">ほかの人が選び終わるのを待っています…</p>');
        return;
      }
      sel = sel.filter(n => !mateTaken.includes(n));
      frame('ONLINE — タッグ (2対2)',
        '<p class="ro-sub">使うプロトコルを3つ。味方 (' + SEAT_LABEL[(room.seat + 2) % 4] + ') が選んだものは使えません。相手と同じものは選べます。</p>' +
        '<div class="tg-readys">' + status2 + '</div>' +
        chipGrid(protocols.map(p => p.name), mateTaken, 3) +
        '<button class="ro-big" id="roomReady" type="button"' + (sel.length === 3 ? '' : ' disabled') + '>準備完了 (' + sel.length + '/3)</button>');
      bindChips(3, renderTagPick);
      $('#roomReady').onclick = guard(async () => {
        const next = await roomApi('protocols', { code: room.code, protocols: sel.slice() });
        room = next;
        if (room.status === 'playing') { done({ rm: room }); return; }
        renderRoom();
      });
    }

    function renderRoom() {
      const m = mode();
      if (m === 'tagwait') { renderTagWait(); return; }
      if (m === 'tagpick') { renderTagPick(); return; }
      if (m === 'waiting') {
        frame('ONLINE — 待機中' + (room.rated ? ' ★ RATED' : ''),
          '<div class="ro-code">' + esc(room.code) + '</div>' +
          '<p class="ro-sub">' + (room.names[1]
            ? '対戦相手が参加しました。'
            : 'このコードを相手に共有して、参加を待ってください。') + '</p>' +
          (room.names[1] ? '' : '<div class="ro-loader" role="status" aria-label="対戦相手を待っています"><i></i><i></i><i></i><b></b></div>') +
          '<p class="ro-wait" id="roomWait"></p>' +
          '<div class="ro-row ro-fill"><button class="ro-btn ro-go" id="roomInvite" type="button">招待リンクを送る</button>' +
          '<button class="ro-btn" id="roomCopy" type="button">コードをコピー</button></div>' +
          '<button class="ro-btn" id="roomCpu" type="button" hidden>待つのをやめて CPU と遊ぶ</button>' +
          '<button class="ro-ghost" id="roomLeave" type="button">部屋を閉じてロビーへ</button>');
        root.querySelector('.ro-panel').classList.add('ro-center');
        $('#roomLeave').onclick = () => { clearInterval(pollTimer); leaveRoom(); showLobby(); };
        tickWait();
        const link = location.origin + location.pathname + '?room=' + room.code;
        const copy = async (text, label) => {
          try { await navigator.clipboard.writeText(text); status(label + 'をコピーしました', 'ok'); }
          catch (e) { status('コピーできませんでした。' + text, 'err'); }
        };
        $('#roomCopy').onclick = () => copy(room.code, 'コード');
        $('#roomInvite').onclick = async () => {
          /* スマホは共有メニュー (LINE など) を出す。使えなければリンクをコピー */
          if (navigator.share) {
            try { await navigator.share({ title: 'COMPILE で対戦しよう', text: 'COMPILE 3D ARENA の部屋 ' + room.code + ' で待っています', url: link }); return; }
            catch (e) { if (e && e.name === 'AbortError') return; }
          }
          copy(link, '招待リンク');
        };
        $('#roomCpu').onclick = () => { clearInterval(pollTimer); leaveRoom(); done({ quick: true }); };
        return;
      }
      if (m === 'draft') {
        const d = room.draft || {};
        const mine = d.active === room.side;
        const myP = (room.protocols && room.protocols[room.side]) || [];
        const opP = (room.protocols && room.protocols[1 - room.side]) || [];
        const picked = (list, cls) => list.map(n => '<span class="ro-tag ' + cls + '">' + esc(n) + '</span>').join('') || '<span class="ro-sub">未選択</span>';
        const isBan = d.kind === 'ban';
        const banned = d.banned || [[], []];
        const bans = (d.rules && d.rules.bans) || 0;
        frame('ONLINE — ドラフト',
          /* いまどちらが選ぶ番か (いちばん上に大きく) */
          '<div class="ro-turn ' + (mine ? 'mine' : 'theirs') + '" role="status">' +
            (mine ? '<b>あなたの番</b><span>' + (isBan ? 'BAN を ' : '') + d.toPick + ' つ' + (isBan ? '' : '選ぶ') + '</span>'
              : '<b>相手の番</b><span>' + (isBan ? 'BAN' : '選択') + 'を待っています…</span>') + '</div>' +
          '<p class="ro-sub">' + esc(ruleText(d.rules)) + '　' +
            (bans ? 'BAN を先手から1つずつ交互に → ' : '') + '先手1 → 後手2 → 先手2 → 後手1。' +
            (d.first === room.side ? 'あなたが先手です。' : '相手が先手です。') + '</p>' +
          '<div class="ro-picks"><span class="ro-lbl">あなた ' + myP.length + '/3</span><div>' + picked(myP, 'mine') + '</div>' +
          '<span class="ro-lbl">相手 ' + opP.length + '/3</span><div>' + picked(opP, '') + '</div>' +
          (bans
            ? '<span class="ro-lbl">BAN</span><div>' +
                (banned[room.side].concat(banned[1 - room.side]).map(n => '<span class="ro-tag ban">' + esc(n) + '</span>').join('')
                  || '<span class="ro-sub">まだありません</span>') + '</div>'
            : '') + '</div>' +
          (mine
            ? '<div class="ro-lbl">' + (isBan ? '相手に使わせたくないプロトコルを ' + d.toPick + ' 個 BAN' : 'プールから ' + d.toPick + ' 個選択') + '</div>' +
              chipGrid(d.pool || [], [], d.toPick) +
              '<button class="ro-big' + (isBan ? ' ban' : '') + '" id="roomPick" type="button"' + (sel.length === d.toPick ? '' : ' disabled') + '>' +
                (isBan ? 'BAN する' : '確定') + ' (' + sel.length + '/' + d.toPick + ')</button>'
            : '<div class="ro-lbl">残りの候補</div>' + chipGrid(d.pool || [], d.pool || [], 0)));
        if (!mine) bindChips(0, renderRoom);          // 相手の番でも「?」でカードは見られる
        if (mine) {
          bindChips(d.toPick, renderRoom);
          $('#roomPick').onclick = guard(async () => {
            const next = await roomApi('draftpick', { code: room.code, version: room.version, picks: sel.slice() });
            sel = [];
            room = next;
            if (room.status === 'playing') { done({ rm: room }); return; }
            renderRoom();
          });
        }
        return;
      }
      /* protocols: 相手が選んだもの以外から3つ */
      const other = (room.protocols && room.protocols[1 - room.side]) || [];
      sel = sel.filter(n => !other.includes(n));
      frame('ONLINE — プロトコル選択',
        '<p class="ro-sub">使用するプロトコルを3つ。相手が選んだものは使えません。</p>' +
        chipGrid(protocols.map(p => p.name), other, 3) +
        '<button class="ro-big" id="roomReady" type="button"' + (sel.length === 3 ? '' : ' disabled') + '>準備完了 (' + sel.length + '/3)</button>');
      bindChips(3, renderRoom);
      $('#roomReady').onclick = guard(async () => {
        const next = await roomApi('protocols', { code: room.code, protocols: sel.slice() });
        room = next;
        if (room.status === 'playing') { done({ rm: room }); return; }
        renderRoom();
      });
    }

    /* ---------- 起動 ---------- */
    (async () => {
      try {
        session = await roomSession();
        const openFirst = takeRoomOpen();
        if (session && openFirst === 'history') guard(showHistory)();   // RECORD の「ONLINE RATED」から来た
        else if (session) showLobby(); else showLogin();
      } catch (e) { showLogin(); }
    })();
  });
}
