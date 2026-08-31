/* =========================================================================
 * 3Dビュー: ルーム対戦のロビーUI
 *   ログイン → ロビー (クイック/作成/参加) → 待機 → ドラフト or 3択 →
 *   status が playing になった publicState を resolve して返す。
 *   戻るを押した場合は null を resolve する (呼び出し側でソロ設定へ)。
 * ========================================================================= */
import { roomApi, roomLogin, roomSession } from './room.js';
import { emblemDataURL } from './emblems.js';

const $ = (sel) => document.querySelector(sel);

function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : s;
  return d.innerHTML;
}

export function runRoomLobby(protocols) {
  const root = $('#roomOv');
  const protoMap = {};
  for (const p of protocols) protoMap[p.name] = p;

  let room = null;         // 直近の publicState
  let sel = [];            // ドラフト / プロトコル選択の一時状態
  let busy = false;
  let pollTimer = null;
  let lobbyTimer = null;
  let finished = false;

  root.classList.add('show');

  return new Promise((resolve) => {
    const done = (result) => {
      if (finished) return;
      finished = true;
      clearInterval(pollTimer);
      clearInterval(lobbyTimer);
      root.classList.remove('show');
      root.innerHTML = '';
      resolve(result);
    };

    const status = (text, type) => {
      const el = $('#roomStatus');
      if (el) { el.textContent = text || ''; el.dataset.type = type || ''; }
    };

    function frame(title, bodyHtml, backLabel) {
      root.innerHTML =
        '<div class="ro-panel">' +
          '<div class="ro-head"><b>//</b> ' + title + '</div>' +
          bodyHtml +
          '<div class="ro-status" id="roomStatus"></div>' +
          '<button class="ro-ghost" id="roomBack" type="button">' + (backLabel || '← ソロ設定に戻る') + '</button>' +
        '</div>';
      $('#roomBack').onclick = () => {
        clearInterval(pollTimer); clearInterval(lobbyTimer);
        done(null);
      };
    }

    /* ---------- ログイン ---------- */
    async function showLogin() {
      frame('ONLINE — 接続',
        '<p class="ro-sub">対戦相手に表示される名前を決めてください。</p>' +
        '<div class="ro-row"><input class="ro-input" id="roomName" maxlength="12" placeholder="表示名" value="' + esc(lsGet('compileRoomName')) + '">' +
        '<button class="ro-btn" id="roomGo" type="button">接続</button></div>');
      $('#roomGo').onclick = async () => {
        const n = ($('#roomName').value || '').trim();
        if (!n) { status('表示名を入力してください', 'err'); return; }
        lsSet('compileRoomName', n);
        status('接続中…');
        try { await roomLogin(n); showLobby(); }
        catch (e) { status(e.message, 'err'); }
      };
    }

    /* ---------- ロビー ---------- */
    async function showLobby() {
      frame('ONLINE — ロビー',
        '<button class="ro-big" id="roomQuick" type="button">クイックマッチ</button>' +
        '<div class="ro-grid2">' +
          '<div><div class="ro-lbl">ルームを作る</div>' +
            '<input class="ro-input" id="roomPw" maxlength="40" type="password" placeholder="パスワード (任意)">' +
            '<label class="ro-check"><input type="checkbox" id="roomDraft" checked> 公式ドラフトで開始</label>' +
            '<button class="ro-btn" id="roomCreate" type="button">作成</button></div>' +
          '<div><div class="ro-lbl">コードで参加</div>' +
            '<input class="ro-input" id="roomCode" maxlength="6" placeholder="6桁コード">' +
            '<input class="ro-input" id="roomJoinPw" maxlength="40" type="password" placeholder="パスワード (必要な場合)">' +
            '<button class="ro-btn" id="roomJoin" type="button">参加</button></div>' +
        '</div>' +
        '<div class="ro-lbl" style="margin-top:14px">公開ルーム</div><div class="ro-list" id="roomList">読込中…</div>');
      $('#roomCode').oninput = function () { this.value = this.value.toUpperCase().replace(/[^A-Z2-9]/g, ''); };

      const name = () => lsGet('compileRoomName');
      $('#roomQuick').onclick = guard(async () => {
        status('空きルームを探しています…');
        const data = await roomApi('list');
        const open = (data.rooms || []).find(r => !r.locked);
        room = open
          ? await roomApi('join', { name: name(), code: open.code, password: '' })
          : await roomApi('create', { name: name(), title: 'クイック対戦', visibility: 'public', password: '', draft: true });
        enterRoom();
      });
      $('#roomCreate').onclick = guard(async () => {
        const pw = $('#roomPw').value;
        if (pw && pw.length < 4) { status('パスワードは4文字以上です', 'err'); return; }
        room = await roomApi('create', {
          name: name(), title: name() + ' のルーム',
          visibility: pw ? 'private' : 'public',
          password: pw, draft: $('#roomDraft').checked
        });
        enterRoom();
      });
      $('#roomJoin').onclick = guard(async () => {
        const code = $('#roomCode').value;
        if (code.length !== 6) { status('6桁のコードを入力してください', 'err'); return; }
        room = await roomApi('join', { name: name(), code, password: $('#roomJoinPw').value });
        enterRoom();
      });

      const loadList = async () => {
        try {
          const data = await roomApi('list');
          const el = $('#roomList');
          if (!el) return;
          const rooms = data.rooms || [];
          el.innerHTML = rooms.length
            ? rooms.map(r => '<button class="ro-room" data-code="' + esc(r.code) + '" type="button">' +
                esc(r.title || r.code) + (r.locked ? ' 🔒' : '') + '<small>' + esc(r.code) + '</small></button>').join('')
            : '<span class="ro-sub">現在募集中のルームはありません</span>';
          el.querySelectorAll('.ro-room').forEach(b => {
            b.onclick = guard(async () => {
              const pw = prompt('パスワード (不要なら空欄)') || '';
              room = await roomApi('join', { name: name(), code: b.dataset.code, password: pw });
              enterRoom();
            });
          });
        } catch (e) { /* ロビー一覧の失敗は無視 */ }
      };
      loadList();
      clearInterval(lobbyTimer);
      lobbyTimer = setInterval(loadList, 5000);
    }

    function guard(fn) {
      return async () => {
        if (busy) return;
        busy = true;
        try { await fn(); }
        catch (e) { status(e.message || '通信エラー', 'err'); }
        finally { busy = false; }
      };
    }

    /* ---------- 入室後 (待機 / ドラフト / プロトコル選択) ---------- */
    function enterRoom() {
      clearInterval(lobbyTimer);
      sel = [];
      renderRoom();
      clearInterval(pollTimer);
      pollTimer = setInterval(poll, 1300);
    }

    async function poll() {
      if (busy || !room) return;
      let next;
      try { next = await roomApi('get', { code: room.code }); } catch (e) { return; }
      if (next.version === room.version && next.status === room.status) { room = next; return; }
      room = next;
      if (room.status === 'playing' || room.status === 'finished') { done({ rm: room }); return; }
      renderRoom();
    }

    function mode() {
      if (room.status === 'draft') return 'draft';
      return room.names[1] ? 'protocols' : 'waiting';
    }

    function chipGrid(names, taken, limit) {
      return '<div class="ro-chips">' + names.map(n => {
        const p = protoMap[n] || {};
        const isTaken = taken.includes(n);
        const isSel = sel.includes(n);
        return '<button type="button" class="ro-chip' + (isSel ? ' on' : '') + (isTaken ? ' taken' : '') + '" data-name="' + esc(n) + '"' +
          ' style="--accent:' + (p.color || '#63f3ff') + '">' +
          '<img alt="" src="' + emblemDataURL(n, p.color || '#63f3ff', 48, true) + '">' + esc(n) + '</button>';
      }).join('') + '</div>';
    }

    function bindChips(limit, rerender) {
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

    function renderRoom() {
      const m = mode();
      if (m === 'waiting') {
        frame('ONLINE — 待機中',
          '<div class="ro-code">' + esc(room.code) + '</div>' +
          '<p class="ro-sub">' + (room.names[1]
            ? '対戦相手が参加しました。'
            : 'このコードを相手に共有して、参加を待ってください。') + '</p>' +
          '<div class="ro-row"><button class="ro-btn" id="roomCopy" type="button">コードをコピー</button></div>',
          '← 退出してソロ設定に戻る');
        $('#roomCopy').onclick = () => {
          if (navigator.clipboard) navigator.clipboard.writeText(room.code);
          status('コピーしました', 'ok');
        };
        return;
      }
      if (m === 'draft') {
        const d = room.draft || {};
        const mine = d.active === room.side;
        const myP = (room.protocols && room.protocols[room.side]) || [];
        const opP = (room.protocols && room.protocols[1 - room.side]) || [];
        const picked = (list, cls) => list.map(n => '<span class="ro-tag ' + cls + '">' + esc(n) + '</span>').join('') || '<span class="ro-sub">未選択</span>';
        frame('ONLINE — ドラフト',
          '<p class="ro-sub">公式ドラフト: 先手1 → 後手2 → 先手2 → 後手1。' +
            (d.first === room.side ? 'あなたが先手です。' : '相手が先手です。') + '</p>' +
          '<div class="ro-lbl">あなた (' + myP.length + '/3)</div><div>' + picked(myP, 'mine') + '</div>' +
          '<div class="ro-lbl">相手 (' + opP.length + '/3)</div><div>' + picked(opP, '') + '</div>' +
          (mine
            ? '<div class="ro-lbl">プールから ' + d.toPick + ' 個選択</div>' + chipGrid(d.pool || [], [], d.toPick) +
              '<button class="ro-big" id="roomPick" type="button"' + (sel.length === d.toPick ? '' : ' disabled') + '>確定 (' + sel.length + '/' + d.toPick + ')</button>'
            : '<p class="ro-sub">相手がドラフト中です…</p>'),
          '← 退出してソロ設定に戻る');
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
        '<button class="ro-big" id="roomReady" type="button"' + (sel.length === 3 ? '' : ' disabled') + '>準備完了 (' + sel.length + '/3)</button>',
        '← 退出してソロ設定に戻る');
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
        const s = await roomSession();
        if (s) showLobby(); else showLogin();
      } catch (e) { showLogin(); }
    })();
  });
}
