/* =========================================================================
 * オンラインの観戦の賭け: 人どうしの対戦を観ている人たちが、どちらが勝つかに CHIP を賭ける
 *   賭けるのは CHIP (ゲームの中のポイント) だけ。現金・課金とはつながらない
 *   倍率は観客の賭けの合計で決まる (パリミュチュエル。胴元の見せ金と取り分 5% は下の定数)。賭けが集まった側ほど下がる
 *   受付は序盤だけ (両者合わせて 4 手番を終えるまで)。1部屋1回、取り消しなし
 *   賭けた CHIP はその場で払う。払い戻しはサーバーが決着で額を決め、観客の画面が betClaim で1度だけ受け取る
 *   (決着を見届けずに閉じても、次にオンラインのロビーを開いたときに受け取れる)
 *   サーバーの写し: supabase/functions/_shared/roombet.js (計算がずれないことは test/roombet.test.js が確かめる)
 * ========================================================================= */
import * as G from './gacha.js';
import { earnedChips } from './chips.js';

export const ROOM_BET_AMOUNTS = [5, 15, 30, 50];
export const ROOM_BET_TURNS = 4;
export const ROOM_BET_SEED = 50;
export const ROOM_BET_CUT = 0.05;

export function roomBetOdds(pools) {
  const p = [Math.max(0, pools[0] | 0), Math.max(0, pools[1] | 0)];
  const total = p[0] + p[1] + ROOM_BET_SEED * 2;
  return p.map((x) => Math.max(1.1, Math.floor((total * (1 - ROOM_BET_CUT)) / (x + ROOM_BET_SEED) * 10) / 10));
}
export function roomBetPayout(amount, odds) {
  return Math.ceil((amount * odds) / 5) * 5;
}
export function roomBetPools(bets) {
  const pools = [0, 0];
  for (const b of bets || []) if (b && (b.side === 0 || b.side === 1)) pools[b.side] += b.amount | 0;
  return pools;
}
export function roomBetSettle(bet, winner, pools) {
  if (winner !== 0 && winner !== 1) return { result: 'refund', payout: bet.amount };
  if (bet.side !== winner) return { result: 'lose', payout: 0 };
  return { result: 'win', payout: roomBetPayout(bet.amount, roomBetOdds(pools)[winner]) };
}

/** 受付の残り (あと何手番で締め切るか)。締め切っていれば 0 */
export function turnsLeft(bet) {
  return bet && bet.open ? Math.max(0, (bet.closeTurns | 0) - (bet.turns | 0)) : 0;
}

/** 受け取った賭けの知らせの文 */
export function claimText(c) {
  const vs = Array.isArray(c.names) ? (c.names[0] || '?') + ' vs ' + (c.names[1] || '?') : c.code;
  const who = Array.isArray(c.names) ? c.names[c.side] || '?' : (c.side ? 'B' : 'A');
  if (c.result === 'win') return vs + ': ' + who + ' に賭けて当たり。' + c.payout + ' CHIP が戻りました';
  if (c.result === 'refund') return vs + ': 対戦が決着しなかったので、賭けた ' + c.amount + ' CHIP を戻しました';
  return vs + ': ' + who + ' に賭けた ' + c.amount + ' CHIP は外れました';
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 観戦の画面の賭けの板 ----------
   opts.api(op, extra): サーバーへの問い合わせ (room.js の roomApi)。opts.name(): 賭けた人として出す名前。
   opts.toast(msg, ms): 短い知らせ。update(rm) は観戦の問い合わせのたびに呼ぶ (rm.bet が賭けのようす) */
export function mountRoomBet(opts) {
  let el = document.getElementById('roomBet');
  if (!el) {
    el = document.createElement('section');
    el.id = 'roomBet';
    el.setAttribute('aria-label', '観客の賭け');
    document.body.appendChild(el);
  }
  let bet = null, names = ['?', '?'], status = 'playing';
  let side = null, amount = 15, sending = false;
  /* 開いているか: はじめは受付中なら開く。賭けたら閉じる (盤面を隠さないように)。押せば開き直せる */
  let open = true, touched = false;

  const render = () => {
    if (!bet) { el.classList.remove('show'); return; }
    const chips = G.chipsOf(G.loadGacha(), earnedChips());
    const mine = bet.mine;
    const left = turnsLeft(bet);
    const pool = bet.pools[0] + bet.pools[1];
    const head = '<button type="button" class="rb-head" data-toggle="1" aria-expanded="' + open + '">' +
      '<b>観客の賭け</b><span>' + (bet.open ? '<i class="rb-live">受付中</i>' : '<i>締め切り</i>') +
      ' 観客 ' + Math.max(bet.watchers | 0, 1) + ' 人 ・ ' + bet.count + ' 人が賭けて合計 ' + pool + '</span>' +
      '<em aria-hidden="true">' + (open ? '▾' : '▸') + '</em></button>';
    if (!open) { el.innerHTML = head; el.classList.add('show'); return; }
    const pays = (k) => roomBetPayout(amount, bet.odds[k]);
    const canPick = bet.open && !mine;
    const team = (k) => '<button type="button" class="rb-side' + (side === k && canPick ? ' on' : '') + (mine && mine.side === k ? ' mine' : '') + '" data-side="' + k + '"' +
      (canPick ? ' aria-pressed="' + (side === k) + '"' : ' disabled') + '>' +
      '<b>' + esc(names[k] || (k ? 'GUEST' : 'HOST')) + '</b>' +
      '<em>' + bet.odds[k].toFixed(1) + ' 倍</em>' +
      '<small>' + bet.pools[k] + ' CHIP ・ ' + (bet.counts ? bet.counts[k] : bet.bettors.filter(b => b.side === k).length) + ' 人</small></button>';
    let body = '<div class="rb-sides">' + team(0) + team(1) + '</div>';
    if (mine) {
      const res = mine.result;
      body += '<p class="rb-mine">' + (res === 'win' ? '当たり。' + mine.payout + ' CHIP が戻ります'
        : res === 'lose' ? '外れました (' + esc(names[mine.side]) + ' に ' + mine.amount + ')'
        : res === 'refund' ? '不成立なので ' + mine.amount + ' CHIP を戻します'
        : 'あなた: ' + esc(names[mine.side]) + ' に ' + mine.amount + ' CHIP (いまの倍率なら ' + roomBetPayout(mine.amount, bet.odds[mine.side]) + ' 戻る)') + '</p>';
    } else if (bet.open) {
      const can = side !== null && chips >= amount && !sending;
      body += '<div class="rb-amounts"><span>CHIP <b>' + chips + '</b></span>' + ROOM_BET_AMOUNTS.map(v =>
        '<button type="button" class="lvl' + (v === amount ? ' on' : '') + '" data-amount="' + v + '" aria-pressed="' + (v === amount) + '"' +
        (chips < v ? ' disabled' : '') + '>' + v + '</button>').join('') + '</div>' +
        '<button type="button" class="rb-go" data-go="1"' + (can ? '' : ' disabled') + '>' +
          (side === null ? '勝つと思う方を選ぶ' : chips < amount ? 'CHIP が足りません'
            : esc(names[side]) + ' に ' + amount + ' 賭ける (いまなら ' + pays(side) + ' 戻る)') + '</button>' +
        '<p class="rb-note">受付はあと ' + left + ' 手番。倍率は締め切りまで観客の賭けで動き、決着の時点の倍率で払い戻します</p>';
    } else {
      body += '<p class="rb-note">' + (status === 'finished' ? '決着しました' : '受付は締め切りました。決着を待っています') + '</p>';
    }
    const recent = bet.bettors.slice(-5).reverse();
    if (recent.length) body += '<ul class="rb-list">' + recent.map(b => '<li><b>' + esc(b.name) + '</b> → ' + esc(names[b.side] || '?') + ' <em>' + b.amount + '</em></li>').join('') + '</ul>';
    el.innerHTML = head + '<div class="rb-body">' + body + '</div>';
    el.classList.add('show');
  };

  const place = async () => {
    if (sending || side === null || !bet || !bet.open || bet.mine) return;
    const earned = earnedChips();
    if (G.chipsOf(G.loadGacha(), earned) < amount) { render(); return; }
    sending = true; render();
    try {
      const r = await opts.api('bet', { code: opts.code, side, amount, name: opts.name ? opts.name() : '' });
      /* サーバーが受け付けてから払う (受け付けられなかった賭けで CHIP が減らないように) */
      G.spendChips(amount, earned);
      if (r && r.bet) bet = r.bet;
      opts.toast && opts.toast(names[side] + ' に ' + amount + ' CHIP 賭けました', 2200);
      open = false;
    } catch (e) {
      opts.toast && opts.toast((e && e.message) || '賭けられませんでした', 3000);
    }
    sending = false;
    render();
  };

  el.onclick = (ev) => {
    const t = ev.target.closest('button');
    if (!t || t.disabled) return;
    if (t.dataset.toggle) { open = !open; touched = true; render(); return; }
    if (t.dataset.side) { side = +t.dataset.side; render(); return; }
    if (t.dataset.amount) { amount = +t.dataset.amount; render(); return; }
    if (t.dataset.go) place();
  };

  return {
    update(rm) {
      if (!rm) return;
      if (Array.isArray(rm.names)) names = rm.names;
      if (rm.status) status = rm.status;
      if (!rm.bet) { if (!bet) return; render(); return; }
      const first = !bet;
      bet = rm.bet;
      /* 自分で開け閉めしていなければ: 受付中で賭けていないときだけ開いておく */
      /* 狭い・背の低い画面は、はじめは閉じておく (開くと盤面の半分を覆う)。押せば開く */
      const small = typeof matchMedia === 'function' && matchMedia('(max-width:700px),(max-height:500px)').matches;
      if (!touched) open = !!(bet.open && !bet.mine && !small);
      else if (first) open = true;
      render();
    },
    unmount() { el.classList.remove('show'); el.innerHTML = ''; el.onclick = null; },
  };
}

/** まだ受け取っていない賭けの払い戻しを受け取る。受け取ったものの一覧を返す (知らせは呼んだ側で) */
export async function claimRoomBets(api) {
  let r;
  try { r = await api('betClaim', {}); } catch (e) { return []; }
  const got = (r && Array.isArray(r.claimed)) ? r.claimed : [];
  for (const c of got) if (c.payout > 0) G.giveChips(c.payout);
  return got;
}
