/* =========================================================================
 * 3Dビュー: ルーム対戦 (オンライン) クライアント
 *   サーバー権威 (Supabase Edge Function: secure-room) は auto-play と共通。
 *   ここは通信・状態変換・ロビーUIだけを持ち、描画は main.js / board.js の
 *   ソロと同じ経路 (差分アニメ + ステップ再生) を流用する。
 *
 *   サーバーの publicState → ローカル=index0 に正規化した擬似エンジン状態。
 *   相手の手札と両者の山札は中身が秘匿されるため、枚数分のプレースホルダ
 *   uid (`opp:h0` / `me:d0`...) を立てて裏向きカードとして描画させる。
 * ========================================================================= */

/* ---------- 依存 (Supabase SDK + 設定) を遅延ロード ---------- */
let depsLoaded = false;
let sb = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (Array.from(document.scripts).some(s => s.src && s.src.indexOf(src) >= 0)) { resolve(); return; }
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(src + ' を読み込めませんでした'));
    document.head.appendChild(el);
  });
}

export async function roomLoadDeps() {
  if (depsLoaded) return;
  await loadScript('vendor/supabase-2.108.2.js');
  if (!window.COMPILE_ROOM_CONFIG) {
    try { await loadScript('secure-room-config.js'); } catch (e) { /* 未設定は configured() で弾く */ }
  }
  depsLoaded = true;
}

export function roomConfigured() {
  const cfg = window.COMPILE_ROOM_CONFIG || {};
  return /^https:\/\//.test(cfg.url || '') && String(cfg.anonKey || '').length > 20 && !!window.supabase;
}

function client() {
  if (!sb) {
    const cfg = window.COMPILE_ROOM_CONFIG;
    sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
      /* OAuth の認可コードは URL に残さず、SDK が起動時にセッションへ交換する。 */
      auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce' }
    });
  }
  return sb;
}

/* ログアウト (Google / GitHub / メール / ゲストの切り替えに使う) */
export async function roomSignOut() {
  const r = await client().auth.signOut();
  if (r.error) throw new Error(r.error.message);
}

export async function roomSession() {
  const got = await client().auth.getSession();
  return got.data.session;
}

/* OAuth コールバックで SDK がセッションを復元した直後に、一時パラメータを
   アドレスバーと履歴から消す。通常起動では依存 SDK を読み込まない。 */
export async function roomRestoreOAuthRedirect() {
  const query = new URLSearchParams(location.search);
  const hasCallback = /(?:^#|[&])(?:access_token|error)=/.test(location.hash) ||
    query.has('code') || query.has('error') || query.has('error_description');
  if (!hasCallback) return false;
  /* Google の画面で「キャンセル」した・断られたときは error が付いて戻ってくる。
     ACCOUNT を開いて「中断しました」と知らせる (account.js が読む)。オンラインへ直行する目印は消す */
  if (query.has('error') || query.has('error_description') || /(?:^#|[&])error=/.test(location.hash)) {
    try { sessionStorage.setItem('compileOAuthError', '1'); } catch (e) { /* private mode */ }
    try { localStorage.setItem('compileAccountResume', String(Date.now())); } catch (e) { /* private mode */ }
    clearOnlineResume();
  }
  /* ログインの部品を読めなかった (通信) ときは、アドレスの code を消さない。再読み込みでログインをやり直せるように
     (前は消してから失敗し、再読み込みしてもログインが成り立たなかった) */
  await roomLoadDeps();
  try {
    await roomSession();
  } finally {
    const clean = new URL(location.href);
    clean.hash = '';
    clean.searchParams.delete('code');
    clean.searchParams.delete('error');
    clean.searchParams.delete('error_description');
    history.replaceState(null, document.title, clean.pathname + clean.search);
  }
  return true;
}

export async function roomLogin(displayName) {
  const r = await client().auth.signInAnonymously({ options: { data: { display_name: displayName } } });
  if (r.error) throw new Error(r.error.message);
  return r.data.session;
}

export function roomIsAnonymous(session) {
  return !!(session && session.user && session.user.is_anonymous);
}

async function setDisplayName(displayName) {
  const r = await client().auth.updateUser({ data: { display_name: displayName } });
  if (r.error) throw new Error(r.error.message);
  return r.data.user;
}

/* レート戦用の恒久アカウント。Supabase Auth の Email provider を使う。 */
export async function roomSignIn(email, password, displayName) {
  const r = await client().auth.signInWithPassword({ email, password });
  if (r.error) throw new Error(r.error.message);
  if (displayName) await setDisplayName(displayName);
  const session = await roomSession();
  if (!session) throw new Error('ログイン状態を確認できませんでした');
  return session;
}

export async function roomSignUp(email, password, displayName) {
  const r = await client().auth.signUp({ email, password, options: { data: { display_name: displayName } } });
  if (r.error) throw new Error(r.error.message);
  if (!r.data.session) throw new Error('確認メールを送信しました。メール内のリンクを開いてからログインしてください。');
  return r.data.session;
}

/* OAuth はページを離れる。戻り先はタイトル画面なので、
   オンラインへ直行するための目印を残しておく (main.js が読む)。目印は時刻で、古いもの (15 分より前) は読む側で捨てる
   (Google の画面で「戻る」やタブを閉じると目印が残り、数日後に開いたときロビーへ勝手に飛んでいた) */
export const resumeFresh = (v) => { const t = Number(v); return Number.isFinite(t) && t > 0 && Date.now() - t < 15 * 60 * 1000; };
function markOnlineResume() {
  try { localStorage.setItem('compileOnlineResume', String(Date.now())); } catch (e) { /* private mode */ }
}
function clearOnlineResume() {
  try { localStorage.removeItem('compileOnlineResume'); } catch (e) { /* private mode */ }
}

export async function roomSignInWithGitHub() {
  markOnlineResume();
  const r = await client().auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: location.origin + location.pathname }
  });
  if (r.error) { clearOnlineResume(); throw new Error(r.error.message); }
}

export async function roomSignInWithGoogle() {
  markOnlineResume();
  const r = await client().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname }
  });
  if (r.error) { clearOnlineResume(); throw new Error(r.error.message); }
}

/* アカウント (戦績の保存) から使う。ログイン後はタイトルへ戻り、アカウントの画面を開き直す */
export function roomClient() { return client(); }
export async function accountSignInWithGoogle() {
  try { localStorage.setItem('compileAccountResume', String(Date.now())); } catch (e) { /* private mode */ }
  const r = await client().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname }
  });
  if (r.error) {
    try { localStorage.removeItem('compileAccountResume'); } catch (e) { /* private mode */ }
    throw new Error(r.error.message);
  }
}

let lastToken = null;              // 直近の問い合わせに使った鍵 (ページを閉じる瞬間の「退出」に使う)
export async function roomApi(op, extra) {
  const cfg = window.COMPILE_ROOM_CONFIG;
  const s = await roomSession();
  if (!s) throw new Error('セッションが切れました。再接続してください');
  lastToken = s.access_token;
  const r = await fetch(cfg.url + '/functions/v1/secure-room', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + s.access_token,
      'apikey': cfg.anonKey
    },
    body: JSON.stringify(Object.assign({ op }, extra || {}))
  });
  let d;
  try { d = await r.json(); } catch (e) { throw new Error('サーバーに接続できませんでした (' + r.status + ')'); }
  if (!r.ok) throw new Error(d.error || '通信エラー');
  return d;
}

/* ページを閉じる・離れる瞬間に「部屋から抜けた」を送る (返事は待たない)。
   待機中の部屋がロビーに残って、次の人が無人の部屋に入らないように */
export function roomLeaveKeepalive(code) {
  const cfg = window.COMPILE_ROOM_CONFIG;
  if (!cfg || !lastToken || !code) return;
  try {
    fetch(cfg.url + '/functions/v1/secure-room', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + lastToken, 'apikey': cfg.anonKey },
      body: JSON.stringify({ op: 'leave', code })
    }).catch(() => {});
  } catch (e) { /* 送れなくても片付けは時間で行われる */ }
}

/* ---------- publicState → 擬似エンジン状態 ---------- */

export function normLegalActions(rm) {
  return (rm?.legalActions || []).map(action => action.side === undefined ? action
    : { ...action, side: action.side === rm.side ? 0 : 1 });
}

export function toRoomAction(action, seat) {
  return action?.side === undefined ? action
    : { ...action, side: action.side === 0 ? seat : 1 - seat };
}

/* 3D は st.cards に居るカードしか描かないため、秘匿カードも uid を立てる */
function pushPlaceholders(cards, list, prefix, count, zone, owner) {
  for (let i = 0; i < (count || 0); i++) {
    const uid = prefix + i;
    cards[uid] = { uid, def: null, owner, faceUp: false, zone, knownTo: 0 };
    list.push(uid);
  }
}

export function buildRoomState(rm, valOf) {
  const g = rm.game, me = rm.side, op = 1 - me;
  const li = (owner) => (owner === me ? 0 : 1);
  const cards = {};
  const lines = [[[], []], [[], []], [[], []]];
  const totals = [];

  for (let l = 0; l < 3; l++) {
    totals[l] = [g.totals[l][me], g.totals[l][op]];
    for (let owner = 0; owner < 2; owner++) {
      const lo = li(owner);
      for (const card of g.lines[l][owner]) {
        cards[card.uid] = {
          uid: card.uid, def: card.def, owner: lo, faceUp: card.faceUp,
          zone: 'field', knownTo: card.def ? 3 : 0, _value: card.value
        };
        lines[l][lo].push(card.uid);
      }
    }
  }

  const myHand = [];
  for (const card of (g.hand || [])) {
    cards[card.uid] = {
      uid: card.uid, def: card.def, owner: 0, faceUp: false,
      zone: 'hand0', knownTo: 1, _value: valOf ? valOf(card.def) : 0
    };
    myHand.push(card.uid);
  }
  /* 観戦: 手前の人の手札は中身が来ない (hand は空)。枚数だけ伏せた札を置く */
  if (rm.spectator && !(g.hand || []).length) pushPlaceholders(cards, myHand, 'me:h', g.counts[me].hand, 'hand0', 0);

  const trash = [[], []];
  (g.trash || []).forEach((list, owner) => {
    const lo = li(owner);
    for (const card of (list || [])) {
      if (!cards[card.uid]) {
        cards[card.uid] = {
          uid: card.uid, def: card.def, owner: lo, faceUp: true,
          zone: 'trash' + lo, knownTo: 3, _value: valOf ? valOf(card.def) : 0
        };
      }
      trash[lo].push(card.uid);
    }
  });

  /* 移動中 (committed) のカード: transit 演出のために zone を再現する */
  const commitStack = [];
  for (const card of (g.committed || [])) {
    cards[card.uid] = {
      uid: card.uid, def: card.def, owner: li(card.owner), faceUp: card.faceUp,
      zone: 'committed', commitDest: card.commitDest,
      knownTo: card.def ? 3 : 0, _value: valOf && card.def ? valOf(card.def) : 2
    };
    commitStack.push(card.uid);
  }

  const oppHand = [];
  pushPlaceholders(cards, oppHand, 'opp:h', g.counts[op].hand, 'hand1', 1);
  const myDeck = [];
  pushPlaceholders(cards, myDeck, 'me:d', g.counts[me].deck, 'deck0', 0);
  const opDeck = [];
  pushPlaceholders(cards, opDeck, 'opp:d', g.counts[op].deck, 'deck1', 1);

  return {
    useControl: true,
    turn: li(g.turn),
    phase: g.phase,
    /* 宣言の演出はローカル視点の側番号で持つ */
    announce: g.announce ? { ...g.announce, player: li(g.announce.player) } : null,
    control: g.control < 0 ? -1 : li(g.control),
    winner: g.winner === null ? null : li(g.winner),
    players: [
      { protocols: g.protocols[me], hand: myHand, deck: myDeck, trash: trash[0], cannotCompile: false },
      { protocols: g.protocols[op], hand: oppHand, deck: opDeck, trash: trash[1], cannotCompile: false }
    ],
    lines, cards,
    commitStack,
    /* 手札公開: player はローカル座席に変換 */
    revealed: g.revealed
      ? { kind: g.revealed.kind, player: li(g.revealed.player), cards: g.revealed.cards, seq: g.revealed.seq }
      : null,
    _totals: totals, _room: true,
    /* オンラインのタッグ: 両チームのいまの人 (ローカルの側の順)。mine = 自分が何人目か (0 / 1) */
    ...(g.tag ? { tag: { pilot: [g.tag.pilot[me], g.tag.pilot[op]], mine: rm.seat >= 0 ? Math.floor(rm.seat / 2) : 0, online: true } } : {})
  };
}

/* 管理者の AUTO をオンラインで使うときの、CPU に渡す盤面。
   画面用の盤面 (buildRoomState) は、見えないカード (相手の手札・山札・相手の裏向き) の中身が空なので、
   エンジンの読みがそのままでは動かない。見えないカードには「その人のデッキのうち、まだ見えていないカード」を仮に入れる。
   中身はどうせ読みのたびに並べ替えられる (engine の aiInformationState) ので、本当の中身は使わない (のぞき見はしない)。
   並べ替えはカード名の頭 ('p0:' / 'p1:') で出自を分けるため、見えないカードは 'p<側>:?<元の名前>' に付け替え、
   CPU の答え (手・選択) は toRoom で元の名前に戻してからサーバーへ送る。作れないとき (タッグの複合プロトコル等) は null */
export function buildRoomAiState(rm, Engine, valOf, oppKnown) {
  if (!rm || !rm.game || rm.mode === 'tag' || rm.game.tag) return null;
  const view = buildRoomState(rm, valOf);
  const protos = Engine.protos || {};
  const defs = Engine.defs || {};
  const sides = [0, 1];
  if (!sides.every(p => view.players[p].protocols.every(pr => protos[pr.name]))) return null;
  /* その側のデッキの全カード (各プロトコルのカード) から、見えているものを引いた残り */
  const pool = sides.map(p => view.players[p].protocols.flatMap(pr => protos[pr.name].slice()));
  const ownerOf = (c) => {
    const proto = defs[c.def] && defs[c.def].proto;
    const has = (p) => view.players[p].protocols.some(pr => pr.name === proto);
    return has(c.owner) ? c.owner : has(1 - c.owner) ? 1 - c.owner : c.owner;
  };
  for (const c of Object.values(view.cards)) {
    if (!c.def) continue;
    const list = pool[ownerOf(c)];
    const i = list.indexOf(c.def);
    if (i >= 0) list.splice(i, 1);
  }
  /* 公開されて覚えている相手の手札 (trackOppHand)。プールから先に抜いて、相手の手札の頭から本当の中身として置く */
  const known = Array.isArray(oppKnown) ? oppKnown.filter(d => defs[d]) : [];
  const knownLeft = [];
  for (const d of known) { const i = pool[1].indexOf(d); if (i >= 0) { pool[1].splice(i, 1); knownLeft.push(d); } }
  const rename = {}, back = {};
  const cards = {};
  for (const uid of Object.keys(view.cards)) {
    const c = { ...view.cards[uid] };
    delete c._value;
    if (!c.def) {
      const side = /^hand1|^deck1/.test(c.zone) ? 1 : /^hand0|^deck0/.test(c.zone) ? 0 : c.owner;
      if (c.zone === 'hand1' && knownLeft.length) {
        c.def = knownLeft.shift();
        c.uid = 'p1:!' + uid;
        c.knownTo = 3;                                  // 公開されたので、こちらも知っている (並べ替えの対象にしない)
        rename[uid] = c.uid;
        back[c.uid] = uid;
        cards[c.uid] = c;
        continue;
      }
      const list = pool[side].length ? pool[side] : view.players[side].protocols.flatMap(pr => protos[pr.name]);
      c.def = pool[side].length ? list.shift() : list[0];
      c.uid = 'p' + side + ':?' + uid;
      c.knownTo = c.zone === 'hand1' ? 2 : 0;          // 相手の手札は相手だけが知っている
      rename[uid] = c.uid;
      back[c.uid] = uid;
    } else if (c.zone === 'field' || c.zone === 'committed') {
      c.knownTo = c.faceUp ? 3 : c.owner === 0 ? 1 : 3;   // 自分の裏向きは自分だけ、見えている相手の裏向きは両方
    } else if (c.zone === 'hand0') c.knownTo = 1;
    cards[c.uid] = c;
  }
  /* 'uid|段' の形 (選択の候補) も、頭の uid だけ付け替える */
  const swap = (map) => (v) => {
    if (typeof v !== 'string') return v;
    if (map[v]) return map[v];
    const i = v.indexOf('|');
    return i > 0 && map[v.slice(0, i)] ? map[v.slice(0, i)] + v.slice(i) : v;
  };
  const ren = swap(rename);
  const st = {
    seed: (Math.random() * 0x7fffffff) | 0, rngN: 0,
    useControl: view.useControl, turn: view.turn, phase: view.phase, control: view.control, winner: view.winner,
    players: view.players.map(p => ({
      protocols: p.protocols.map(pr => ({ ...pr })), hand: p.hand.map(ren), deck: p.deck.map(ren),
      trash: p.trash.slice(), cannotCompile: false
    })),
    lines: view.lines.map(line => line.map(stack => stack.map(ren))),
    cards, actionLog: [], commitStack: (view.commitStack || []).map(ren), commitSeq: 0,
    revealed: null, announce: null, pending: null
  };
  const toRoom = swap(back);
  return {
    state: st,
    /* サーバーの選択の問いを、この盤面の名前に */
    request: (req) => {
      if (!req) return req;
      const out = JSON.parse(JSON.stringify(req));
      /* 候補に、この盤面に無いカード (山札から出す札など。サーバーは中身を伏せたまま別名で渡す) があれば、
         山札の仮の札を1枚その名前に付け替えて置く (読みが、無いカードを引いて止まらないように) */
      for (const v of Array.isArray(out.candidates) ? out.candidates : []) {
        const u = typeof v === 'string' ? v.split('|')[0] : null;
        if (!u || st.cards[ren(u)]) continue;
        const p = st.players[0].deck.length ? 0 : st.players[1].deck.length ? 1 : -1;
        if (p < 0) break;
        const from = st.players[p].deck.pop();
        const c = { ...st.cards[from], uid: u };
        delete st.cards[from];
        st.cards[u] = c;
        st.players[p].deck.push(u);
        delete back[from];
      }
      if (Array.isArray(out.candidates)) out.candidates = out.candidates.map(ren);
      if (Array.isArray(out.focus)) out.focus = out.focus.map(ren);
      else if (out.focus) out.focus = ren(out.focus);
      return out;
    },
    /* CPU の手・選択を、サーバーの名前に戻す */
    action: (a) => (a && a.card ? { ...a, card: toRoom(a.card) } : a),
    picks: (picks) => (Array.isArray(picks) ? picks.map(p => (Array.isArray(p) ? p.map(toRoom) : toRoom(p))) : picks)
  };
}

/* 公開された相手の手札 (PSYCHIC 0 など) を覚えておく。サーバーは公開したその手の盤面にしか載せないので、こちらで持ち越す。
   mem: 前の { defs: 覚えている相手の手札, hand: 相手の手札の枚数, deck: 相手の山札の枚数, seen: 相手の見えているカード } (無ければ null)。
   相手の手札から出たカードが全部見えている (表で出した・捨てた) あいだだけ覚えておく。裏で出すなど、
   どれが出たか分からなくなったら忘れる (違う中身を確かなものとして読むより、知らないほうがよい)。新しい mem を返す */
export function trackOppHand(mem, rm) {
  const g = rm && rm.game;
  if (!g || !g.counts) return null;
  const op = 1 - rm.side;
  const hand = g.counts[op].hand | 0, deck = g.counts[op].deck | 0;
  /* 中身の見えているカード (場の、こちらに見えているもの・両方の捨て札・自分の手札)。ここから消えたカードは、相手の手札に入ったかもしれない */
  const seen = [];
  for (const line of g.lines || []) for (const stack of line || []) for (const c of stack || []) if (c.def) seen.push(c.def);
  for (const list of g.trash || []) for (const c of list || []) if (c.def) seen.push(c.def);
  for (const c of g.hand || []) if (c.def) seen.push(c.def);
  let defs = mem && Array.isArray(mem.defs) ? mem.defs.slice() : [];
  if (mem && defs.length) {
    const before = (mem.seen || []).slice();
    const fresh = [];
    for (const d of seen) { const i = before.indexOf(d); if (i >= 0) before.splice(i, 1); else fresh.push(d); }
    const drawn = mem.deck - deck;
    const left = mem.hand + drawn - hand;                         // 手札から出ていった枚数
    /* 見えていたカードが消えた・山札が増えた・どこからか手札に入った: 出入りが追えないので忘れる */
    if (before.length || drawn < 0 || left < 0) defs = [];
    else if (left > 0) {
      const gone = [];
      for (const d of fresh) { const i = defs.indexOf(d); if (i >= 0) { gone.push(d); defs.splice(i, 1); } }
      /* 出ていった枚数が、見えて消せた枚数より多い: 覚えていた札が裏で出たかもしれない */
      if (left > gone.length) defs = [];
    }
  }
  /* いま公開されている相手の手札 (手札ぜんぶの公開) は、そのまま覚え直す */
  const r = g.revealed;
  if (r && r.kind === 'hand' && r.player === op && Array.isArray(r.cards) && r.cards.length === hand) defs = r.cards.slice();
  if (defs.length > hand) defs = [];
  return { defs, hand, deck, seen };
}

/* CPU の手が、サーバーの出した合法手のどれかと同じか。同じならサーバーの合法手 (余計な項目の無いもの) を返す */
export function matchLegalAction(legal, action) {
  if (!action || !Array.isArray(legal)) return null;
  const same = (l) => Object.keys(l).every(k => l[k] === undefined || l[k] === action[k])
    && Object.keys(action).every(k => action[k] === undefined || action[k] === l[k]);
  return legal.find(same) || null;
}

/* サーバーのリクエストは常に自分宛て。player をローカル index0 に正規化 */
export function normRequest(rm) {
  if (!rm.request) return null;
  const nq = JSON.parse(JSON.stringify(rm.request));
  nq.player = 0;
  if (typeof nq.target === 'number') nq.target = (nq.target === rm.side ? 0 : 1);
  if (typeof nq.side === 'number') nq.side = (nq.side === rm.side ? 0 : 1);    // ラインを選ぶときの、光らせる側
  return nq;
}

/* trace → ステップ再生用エントリ (前回から増えた分だけ) */
function traceKey(entry) {
  return [entry.msg || '', entry.uid || '',
    JSON.stringify((entry.game && entry.game.lines) || [])].join('|');
}

export function createTraceTracker() {
  let seen = [];
  return {
    reset() { seen = []; },
    /* 続きの再生ができる場合、既に見たエントリを飛ばす */
    take(rm, mayContinue, valOf) {
      const raw = rm.trace || [];
      const keys = raw.map(traceKey);
      let skip = 0;
      if (mayContinue && seen.length) {
        while (skip < keys.length && skip < seen.length && keys[skip] === seen[skip]) skip++;
      }
      seen = keys;
      return raw.slice(skip).map(entry => ({
        st: buildRoomState({ game: entry.game, side: rm.side }, valOf),
        msg: entry.msg || '',
        uid: entry.uid || null,
        chain: Array.isArray(entry.chain) ? entry.chain : []
      }));
    }
  };
}
