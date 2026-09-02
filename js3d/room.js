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
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
  return sb;
}

export async function roomSession() {
  const got = await client().auth.getSession();
  return got.data.session;
}

export async function roomLogin(displayName) {
  const r = await client().auth.signInAnonymously({ options: { data: { display_name: displayName } } });
  if (r.error) throw new Error(r.error.message);
  return r.data.session;
}

export async function roomApi(op, extra) {
  const cfg = window.COMPILE_ROOM_CONFIG;
  const s = await roomSession();
  if (!s) throw new Error('セッションが切れました。再接続してください');
  const r = await fetch(cfg.url + '/functions/v1/secure-room', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + s.access_token,
      'apikey': cfg.anonKey
    },
    body: JSON.stringify(Object.assign({ op }, extra || {}))
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || '通信エラー');
  return d;
}

/* ---------- publicState → 擬似エンジン状態 ---------- */

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
      ? { kind: g.revealed.kind, player: li(g.revealed.player), cards: g.revealed.cards }
      : null,
    _totals: totals, _room: true
  };
}

/* サーバーのリクエストは常に自分宛て。player をローカル index0 に正規化 */
export function normRequest(rm) {
  if (!rm.request) return null;
  const nq = JSON.parse(JSON.stringify(rm.request));
  nq.player = 0;
  if (typeof nq.target === 'number') nq.target = (nq.target === rm.side ? 0 : 1);
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
        uid: entry.uid || null
      }));
    }
  };
}
