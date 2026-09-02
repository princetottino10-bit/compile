/* =========================================================================
 * Compile ルールエンジン
 *   仕様: docs/rules-spec.md / docs/effects-dsl.md
 *   - 純粋関数 API: apply(state, action) -> { state, requests, log, winner }
 *   - 選択が必要な地点で request を返して停止し、{type:"choose"} で再開する。
 *     再開は「基準状態 + 選択列のリプレイ」で実現する(シード付き乱数で決定的)。
 *   - ブラウザ: window.CompileEngine / Node: module.exports
 * ========================================================================= */
(function (global) {
'use strict';

/* ---------- ユーティリティ ---------- */

function clone(o) {
  return (typeof structuredClone === 'function') ? structuredClone(o) : JSON.parse(JSON.stringify(o));
}
function knowCard(st, uid, side) {
  const c = st.cards[uid];
  if (c) c.knownTo = (c.knownTo || 0) | (1 << side);
}
function revealCardToAll(st, uid) {
  const c = st.cards[uid];
  if (c) c.knownTo = 3;
}
function forgetDeckOrder(st, side) {
  for (const uid of st.players[side].deck) st.cards[uid].knownTo = 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function rand(st) { const f = mulberry32((st.seed | 0) + st.rngN * 0x9E3779B9); st.rngN++; return f(); }
function shuffle(st, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(st) * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}

/* ---------- カード定義データ ---------- */

let DEFS = null;     // defId -> {id, proto, value, eff}
let PROTOS = null;   // protoName -> [defId x6]

function init(cardsJson, effectsJson) {
  DEFS = {}; PROTOS = {};
  for (const p of cardsJson.protocols) {
    PROTOS[p.name] = [];
    for (const c of p.cards) {
      DEFS[c.id] = { id: c.id, proto: p.name, value: c.value, eff: (effectsJson && effectsJson[c.id]) || {} };
      PROTOS[p.name].push(c.id);
    }
  }
}

/* ---------- 状態アクセスヘルパ ---------- */

function locate(st, uid) {
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) {
    const idx = st.lines[l][s].indexOf(uid);
    if (idx >= 0) return { line: l, side: s, idx };
  }
  return null;
}
function isTop(st, loc) { return loc.idx === st.lines[loc.line][loc.side].length - 1; }
function defOf(st, uid) { return DEFS[st.cards[uid].def]; }
function removeFrom(arr, x) { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); return i >= 0; }

/* トレース: log 1行ごとに盤面スナップショットを記録 (UI のステップ再生用)。
   setTrace(true) で有効化。テストや AI のロールアウトでは無効のまま */
let TRACE = false;
function setTrace(v) { TRACE = !!v; }

function log(ctx, msg, uid) {
  ctx.log.push(msg);
  ctx.st.actionLog.push(msg);
  if (ctx.st.actionLog.length > 300) ctx.st.actionLog.shift();
  if (TRACE && ctx.trace) ctx.trace.push({ msg, uid: uid || null, st: clone(ctx.st) });
}

/* ---------- 常在効果(static) ---------- */

/* static は { uid, line, sideIdx(スタック側), ...DSL定義 } の形で列挙する。
   DSL の side("self"/"opp") はスタック側 index と衝突しないよう sideIdx を別に持つ */
function activeStatics(st) {
  const out = [];
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) {
    const stack = st.lines[l][s];
    for (let i = 0; i < stack.length; i++) {
      const uid = stack[i], c = st.cards[uid];
      if (!c.faceUp) continue;
      const eff = DEFS[c.def].eff, top = i === stack.length - 1;
      if (eff.upper && eff.upper.static) out.push(Object.assign({}, eff.upper.static, { uid, line: l, sideIdx: s }));
      // middle の常在効果 (SMOKE_3等) は uncovered + 表向きのみ有効
      if (top && eff.middle && eff.middle.static) out.push(Object.assign({}, eff.middle.static, { uid, line: l, sideIdx: s }));
      if (top && eff.lower && eff.lower.static) out.push(Object.assign({}, eff.lower.static, { uid, line: l, sideIdx: s }));
    }
  }
  return out;
}

function cardValue(st, uid) {
  const c = st.cards[uid];
  const loc = locate(st, uid);
  if (!loc) {
    // 場外: trash は表向き=印刷値、それ以外(deck/hand)は非公開=2 (Light 0 裁定)
    return (c.zone.indexOf('trash') === 0) ? DEFS[c.def].value : 2;
  }
  let v = c.faceUp ? DEFS[c.def].value : 2;
  for (const s of activeStatics(st)) {
    if (s.kind === 'setValue' && s.filter.zone === 'thisStack'
        && s.line === loc.line && s.sideIdx === loc.side
        && (s.filter.facing === 'any' || (s.filter.facing === 'down') === !c.faceUp)) {
      v = s.value;
    }
  }
  return v;
}

function lineTotal(st, line, side) {
  let t = 0;
  for (const uid of st.lines[line][side]) t += cardValue(st, uid);
  for (const s of activeStatics(st)) {
    if (s.kind !== 'modifyLineTotal' || s.line !== line) continue;
    const affect = (s.side === 'self') ? s.sideIdx : 1 - s.sideIdx;
    if (affect !== side) continue;
    if (typeof s.delta === 'number') {
      // 条件付き修正 (DIVERSITY_3: スタックに自プロトコル以外の表向きカードがある場合)
      if (s.cond === 'stackHasOtherProtoFaceUp') {
        const proto = DEFS[st.cards[s.uid].def].proto;
        const ok = st.lines[s.line][s.sideIdx].some(u =>
          st.cards[u].faceUp && DEFS[st.cards[u].def].proto !== proto);
        if (!ok) continue;
      }
      t += s.delta;
    }
    if (s.deltaPer) {
      let n = 0;
      if (s.deltaPer === 'yourHand') {          // CLARITY_1: 手札1枚ごとに+1
        n = st.players[s.sideIdx].hand.length;
      } else if (s.deltaPer === 'oppCardsInLine') { // MIRROR_1: このラインの相手カード1枚ごとに+1
        n = st.lines[line][1 - s.sideIdx].length;
      } else {                                   // 既定(APATHY_1/SMOKE_3): ラインの裏向き1枚ごとに+1
        for (let p = 0; p < 2; p++) for (const uid of st.lines[line][p]) if (!st.cards[uid].faceUp) n++;
      }
      t += n;
    }
  }
  return t;
}

/* (M2ヘルパー群) */
/* フィールドにあるコマンドカードのプロトコル種類数 (DIVERSITY) */
function countProtoKinds(st) {
  const kinds = new Set();
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++)
    for (const uid of st.lines[l][s]) kinds.add(DEFS[st.cards[uid].def].proto);
  return kinds.size;
}
/* フィールドにある指定プロトコルのカード枚数 (UNITY)。excludeUid は除外 */
function countProtoOnField(st, proto, excludeUid) {
  let n = 0;
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++)
    for (const uid of st.lines[l][s])
      if (uid !== excludeUid && DEFS[st.cards[uid].def].proto === proto) n++;
  return n;
}
/* ライン内のプロトコル種類数 (DIVERSITY_2) */
function countProtoKindsInLine(st, line) {
  const kinds = new Set();
  for (let s = 0; s < 2; s++) for (const uid of st.lines[line][s]) kinds.add(DEFS[st.cards[uid].def].proto);
  return kinds.size;
}

/* ---------- プレイ許可 ---------- */

function canPlay(st, player, uid, line, faceUp) {
  for (const s of activeStatics(st)) {
    if (s.kind !== 'playPermission') continue;
    if (s.rule === 'oppNoPlayThisLine' && player !== s.sideIdx && line === s.line) return false;
    if (s.rule === 'oppNoFaceDownThisLine' && player !== s.sideIdx && line === s.line && !faceUp) return false;
    if (s.rule === 'oppFaceDownOnly' && player !== s.sideIdx && faceUp) return false;
  }
  if (faceUp) {
    let needMatch = true;
    for (const s of activeStatics(st)) {
      if (s.kind === 'playPermission' && s.rule === 'youFaceUpAnyLine' && s.sideIdx === player) needMatch = false;
      // UNITY_2 lower: このラインには UNITY カードを表向きでプレイできる
      if (s.kind === 'playPermission' && s.rule === 'protoFaceUpThisLine' && s.line === line
          && defOf(st, uid).proto === DEFS[st.cards[s.uid].def].proto) needMatch = false;
    }
    // CHAOS_4/CORRUPTION_1 lower: このカード自体がプロトコル不問でプレイできる(手札で有効)
    const selfEff = DEFS[st.cards[uid].def].eff;
    if (selfEff.lower && (selfEff.lower.handStatic === 'thisAnyLine' || selfEff.lower.handStatic === 'thisAnyLineEitherSide')) needMatch = false;
    if (needMatch) {
      const names = [st.players[0].protocols[line].name, st.players[1].protocols[line].name];
      if (names.indexOf(defOf(st, uid).proto) < 0) return false;
    }
  }
  return true;
}

function ignoreMiddleAt(st, line) {
  return activeStatics(st).some(s => s.kind === 'ignoreMiddle' && (s.scope === 'field' || s.line === line));
}
/* FEAR_1: あなたの手番中、相手のカードの中段コマンドはないものとして扱う */
function middleSuppressed(st, uid) {
  const loc = locate(st, uid);
  if (!loc) return false;
  return activeStatics(st).some(s => s.kind === 'suppressOppMiddle'
    && s.sideIdx !== loc.side && st.turn === s.sideIdx);
}
/* ICE_4: このカードを反転させることはできない */
function cannotFlip(st, uid) {
  return activeStatics(st).some(s => s.kind === 'cannotFlipThis' && s.uid === uid);
}
function skipCacheFor(st, side) {
  return activeStatics(st).some(s => s.kind === 'skipCheckCache' && s.sideIdx === side);
}

/* ---------- 選択(request / 再開) ---------- */

function choose(ctx, req) {
  ctx.qn++;
  req.id = 'q' + ctx.qn;
  if (ctx.ci < ctx.choices.length) {
    const picks = ctx.choices[ctx.ci++];
    validatePicks(req, picks);
    return picks;
  }
  throw { __suspend: req };
}

function validatePicks(req, picks) {
  if (!Array.isArray(picks)) bad('picks は配列であること');
  const k = req.kind;
  if (k === 'pickCard' || k === 'pickHand') {
    const min = req.min !== undefined ? req.min : 1;
    const max = req.max !== undefined ? req.max : 1;
    if (picks.length < min || picks.length > max) bad(`選択数が不正 (要 ${min}..${max})`);
    for (const p of picks) if (req.candidates.indexOf(p) < 0) bad('候補外の選択: ' + p);
    if (new Set(picks).size !== picks.length) bad('重複選択');
  } else if (k === 'pickLine') {
    if (picks.length !== 1 || req.lines.indexOf(picks[0]) < 0) bad('ライン選択が不正');
  } else if (k === 'option') {
    if (req.optional && picks.length === 0) return;
    if (picks.length !== 1 || typeof picks[0] !== 'number' || picks[0] < 0 || picks[0] >= req.options.length) bad('選択肢が不正');
  } else if (k === 'yesNo') {
    if (picks.length > 1) bad('yes/no 選択が不正');
  } else if (k === 'arrange') {
    if (picks.length !== 3 || [0, 1, 2].some(i => picks.indexOf(i) < 0)) bad('並べ替えが不正');
    if (picks[0] === 0 && picks[1] === 1 && picks[2] === 2) bad('並べ替えは必ず変化させること');
    if (req.exact === 'transposition') {
      const moved = picks.filter((v, i) => v !== i).length;
      if (moved !== 2) bad('2枚の入れ替えであること');
    }
  }
  function bad(m) { throw { __err: m }; }
}

/* ---------- イベント / トリガー ---------- */

function eventMatches(on, ev, cardSide, st, uid) {
  switch (on) {
    case 'afterOppDiscard':    return ev.on === 'discard' && ev.player !== cardSide;
    case 'afterYouDiscard':    return ev.on === 'discard' && ev.player === cardSide;
    case 'afterYouDiscardOppTurn': // PEACE_4: 相手の手番中にあなたが捨てたあと
      return ev.on === 'discard' && ev.player === cardSide && st.turn !== cardSide;
    case 'afterYouDraw':       return ev.on === 'draw' && ev.player === cardSide;
    case 'afterOppDraw':       return ev.on === 'draw' && ev.player !== cardSide;
    case 'afterYouDelete':     return ev.on === 'delete' && ev.actor === cardSide;
    case 'afterYouClearCache': return ev.on === 'clearCache' && ev.player === cardSide;
    case 'afterYouShuffle':    return ev.on === 'shuffle' && ev.player === cardSide;
    case 'afterYouRefresh':    return ev.on === 'refresh' && ev.player === cardSide;
    case 'afterOppRefresh':    return ev.on === 'refresh' && ev.player !== cardSide;
    case 'afterAnyRefresh':    return ev.on === 'refresh';
    case 'afterOppCompile':    return ev.on === 'compile' && ev.player !== cardSide;
    case 'afterOppPlayInThisLine': { // ICE_1: 相手がこのラインにプレイしたあと
      if (ev.on !== 'play' || ev.player === cardSide) return false;
      const loc = locate(st, uid);
      return !!loc && loc.line === ev.line;
    }
    default: return false;
  }
}

function collectListeners(st, ev) {
  const out = [];
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) {
    const stack = st.lines[l][s];
    for (let i = 0; i < stack.length; i++) {
      const uid = stack[i], c = st.cards[uid];
      if (!c.faceUp) continue;
      const eff = DEFS[c.def].eff, top = i === stack.length - 1;
      for (const slot of ['upper', 'lower']) {
        const tr = eff[slot] && eff[slot].trigger;
        if (!tr) continue;
        if (slot === 'lower' && !top) continue;
        if (eventMatches(tr.on, ev, s, st, uid)) out.push({ uid, slot });
      }
    }
  }
  return out;
}

function fireEvent(ctx, ev) {
  if (ctx.depth > 80) throw { __err: '解決の深さ上限を超過 (無限ループの疑い)' };
  ctx.depth++;
  try {
    let pendings = collectListeners(ctx.st, ev);
    const fired = new Set();
    while (true) {
      pendings = pendings.filter(p => !fired.has(p.uid + p.slot) && triggerVisible(ctx.st, p.uid, p.slot));
      if (!pendings.length) break;
      let pick;
      if (pendings.length === 1) pick = pendings[0];
      else {
        const ans = choose(ctx, {
          kind: 'pickCard', player: ctx.st.turn, prompt: 'trigger-order',
          candidates: pendings.map(p => p.uid), context: ev.on
        });
        pick = pendings.find(p => p.uid === ans[0]);
      }
      fired.add(pick.uid + pick.slot);
      execTrigger(ctx, pick.uid, pick.slot);
    }
  } finally { ctx.depth--; }
}

function triggerVisible(st, uid, slot) {
  const loc = locate(st, uid);
  if (!loc) return false;
  const c = st.cards[uid];
  if (!c.faceUp) return false;
  if (slot !== 'upper' && !isTop(st, loc)) return false;
  return true;
}

function execTrigger(ctx, uid, slot, locked) {
  const loc = locate(st_of(ctx), uid);
  if (!loc) return;
  const tr = defOf(ctx.st, uid).eff[slot].trigger;
  const fr = { source: uid, slot, controller: loc.side, line: loc.line, bind: {}, done: false, locked: !!locked };
  log(ctx, `[${defOf(ctx.st, uid).id}] ${slot === 'upper' ? '上段' : '下段'}効果が発動`, uid);
  execOps(ctx, fr, tr.ops);
}
function st_of(ctx) { return ctx.st; }

/* wouldBeCovered / wouldBeCoveredOrFlipped の事前処理 */
function fireWouldBeCovered(ctx, uid, coveringUid) {
  runWouldBeCovered(ctx, collectWouldBeCovered(ctx, uid, coveringUid));
}
function collectWouldBeCovered(ctx, uid, coveringUid) {
  const c = ctx.st.cards[uid];
  if (!c || !c.faceUp) return [];
  const eff = DEFS[c.def].eff;
  const out = [];
  for (const slot of ['upper', 'lower']) {
    const tr = eff[slot] && eff[slot].trigger;
    if (!tr) continue;
    if (tr.on !== 'wouldBeCovered' && tr.on !== 'wouldBeCoveredOrFlipped') continue;
    // UNITY_1: 特定プロトコルのカードで覆われるときのみ発動
    if (tr.byProto && (!coveringUid || DEFS[ctx.st.cards[coveringUid].def].proto !== tr.byProto)) continue;
    if (!triggerVisible(ctx.st, uid, slot)) continue;
    out.push({ uid, slot });
  }
  return out;
}
function runWouldBeCovered(ctx, triggers) {
  for (const t of triggers) execTrigger(ctx, t.uid, t.slot, true);
}
function fireWouldBeFlipped(ctx, uid) {
  const c = ctx.st.cards[uid];
  if (!c.faceUp) return;
  const eff = DEFS[c.def].eff;
  for (const slot of ['upper', 'lower']) {
    const tr = eff[slot] && eff[slot].trigger;
    if (!tr || tr.on !== 'wouldBeCoveredOrFlipped') continue;
    if (!triggerVisible(ctx.st, uid, slot)) continue;
    execTrigger(ctx, uid, slot);
  }
}

/* ---------- カード移動プリミティブ ---------- */

/* committed 化の共通処理: commitStack登録 + 通し番号の記録 */
function markCommitted(st, uid) {
  st.cards[uid].zone = 'committed';
  st.cards[uid].commitSeq = ++st.commitSeq;
  st.commitStack.push(uid);
}

/* スタックからの物理除去 (committed 化)。uncover情報を返す */
function extractCard(ctx, uid) {
  const st = ctx.st;
  const loc = locate(st, uid);
  if (!loc) return null;
  const stack = st.lines[loc.line][loc.side];
  const wasTop = loc.idx === stack.length - 1;
  stack.splice(loc.idx, 1);
  markCommitted(st, uid);
  st.cards[uid].commitDest = null;
  if (wasTop && stack.length) {
    const nt = stack[stack.length - 1];
    if (st.cards[nt].faceUp) return { uncoverUid: nt };
  }
  return {};
}
function fireUncover(ctx, info) {
  if (info && info.uncoverUid) resolveMiddle(ctx, info.uncoverUid, 'uncover');
}

/* ラインへの着地: 自分より後にcommittedになったカードの下へ挿入する。
   これで複数カードが移動中でも「移動中になった順番」でスタックに入る */
function landLine(ctx, uid, line, side) {
  const st = ctx.st;
  const c = st.cards[uid];
  const stack = st.lines[line][side];
  const seq = c.commitSeq || 0;
  let i = stack.length;
  while (i > 0 && (st.cards[stack[i - 1]].commitSeq || 0) > seq) i--;
  stack.splice(i, 0, uid);
  c.zone = 'field';
  c.commitDest = null;
  removeFrom(st.commitStack, uid);
}

function landTrash(ctx, uid) {
  const c = ctx.st.cards[uid];
  c.zone = 'trash' + c.owner;
  c.faceUp = true;
  c.commitDest = null;
  ctx.st.players[c.owner].trash.push(uid);
  revealCardToAll(ctx.st, uid);
  removeFrom(ctx.st.commitStack, uid);
}
function landHand(ctx, uid) {
  const c = ctx.st.cards[uid];
  c.zone = 'hand' + c.owner;
  c.faceUp = false;
  c.commitDest = null;
  ctx.st.players[c.owner].hand.push(uid);
  knowCard(ctx.st, uid, c.owner);
  removeFrom(ctx.st.commitStack, uid);
}

/* 表示用ラベル: 場/移動中の裏向きカードは秘匿情報なので名前を伏せる(L1) */
function cardLabel(st, uid) {
  const c = st.cards[uid];
  if (c && !c.faceUp && (c.zone === 'field' || c.zone === 'committed')) return '裏向きカード';
  return DEFS[c.def].id;
}

function doDelete(ctx, uid, actor) {
  if (!locate(ctx.st, uid)) return false;
  const info = extractCard(ctx, uid);
  ctx.st.cards[uid].commitDest = 'trash';
  fireUncover(ctx, info);
  landTrash(ctx, uid);
  log(ctx, `${defOf(ctx.st, uid).id} を削除`, uid);
  fireEvent(ctx, { on: 'delete', actor, count: 1 });
  return true;
}

function doReturn(ctx, uid) {
  const st = ctx.st;
  if (!locate(st, uid)) return false;
  const label = cardLabel(st, uid);
  const owner = st.cards[uid].owner;
  // CORRUPTION_2 lower: カードが相手の手札に戻るとき、代わりに相手のデッキトップに裏向きで置く
  const redirect = activeStatics(st).some(s => s.kind === 'returnToDeckTop' && s.sideIdx !== owner);
  const info = extractCard(ctx, uid);
  st.cards[uid].commitDest = redirect ? 'deck' : 'hand';
  fireUncover(ctx, info);
  if (redirect) {
    const c = st.cards[uid];
    c.zone = 'deck' + owner;
    c.faceUp = false;
    c.commitDest = null;
    st.players[owner].deck.unshift(uid);
    removeFrom(st.commitStack, uid);
    log(ctx, `${label} は手札の代わりにデッキの一番上へ戻された`, uid);
  } else {
    landHand(ctx, uid);
    log(ctx, `${label} を手札に戻す`, uid);
  }
  return true;
}

function doFlip(ctx, uid, ignoreMiddleOnce) {
  const st = ctx.st;
  if (!locate(st, uid)) return false;
  if (cannotFlip(st, uid)) { log(ctx, `${cardLabel(st, uid)} は反転できない`); return false; }
  const c = st.cards[uid];
  if (c.faceUp) {
    fireWouldBeFlipped(ctx, uid);                  // METAL_6: 先に自己削除
    if (!locate(st, uid)) return true;             // 反転は消費された扱い
  }
  c.faceUp = !c.faceUp;
  if (c.faceUp) revealCardToAll(st, uid);
  log(ctx, `${DEFS[c.def].id} を${c.faceUp ? '表' : '裏'}に反転`, uid);
  const loc = locate(st, uid);
  // LUCK_2: 反転による中段は無視する
  if (c.faceUp && loc && isTop(st, loc) && !ignoreMiddleOnce) resolveMiddle(ctx, uid, 'flip');
  return true;
}

function doShift(ctx, uid, destLine) {
  const st = ctx.st;
  const loc = locate(st, uid);
  if (!loc || loc.line === destLine) return false;
  const side = loc.side;
  const label = cardLabel(st, uid);            // L1: 裏向きは伏せる
  const wasCovered = !isTop(st, loc);          // E2: 移動前に覆われていたか
  // E3: コミット前に移動先を先に提示する
  log(ctx, `${label} をライン${destLine + 1}へ移動`, uid);
  const info = extractCard(ctx, uid);
  st.cards[uid].commitDest = 'line' + destLine;
  fireUncover(ctx, info);
  const dest = st.lines[destLine][side];
  if (dest.length) fireWouldBeCovered(ctx, dest[dest.length - 1], uid);
  landLine(ctx, uid, destLine, side);
  // E2: 覆われた状態から移動し、移動先で表向き・uncovered になったら中段が場に入る
  const nloc = locate(st, uid);
  if (wasCovered && st.cards[uid].faceUp && nloc && isTop(st, nloc)) resolveMiddle(ctx, uid, 'uncover');
  return true;
}

/* プレイ(手札/デッキトップ → field)。belowUid 指定で「このカードの下」へ挿入 */
function playToField(ctx, uid, line, side, faceUp, belowUid) {
  const st = ctx.st;
  const c = st.cards[uid];
  removeFrom(st.players[0].hand, uid); removeFrom(st.players[1].hand, uid);
  removeFrom(st.players[0].deck, uid); removeFrom(st.players[1].deck, uid);
  markCommitted(st, uid);
  c.commitDest = 'line' + line;
  c.faceUp = faceUp;
  if (faceUp) revealCardToAll(st, uid);
  const stack = st.lines[line][side];
  if (belowUid) {
    const i = stack.indexOf(belowUid);
    stack.splice(i < 0 ? 0 : i, 0, uid);
  } else {
    const coveredTriggers = stack.length ? collectWouldBeCovered(ctx, stack[stack.length - 1], uid) : [];
    stack.push(uid);
    log(ctx, `P${side + 1}: ${faceUp ? DEFS[c.def].id : 'カード'} をライン${line + 1}に${faceUp ? '表' : '裏'}でプレイ`, uid);
    c.commitDest = 'line' + line;
    runWouldBeCovered(ctx, coveredTriggers);
    c.zone = 'field';
    c.commitDest = null;
    removeFrom(st.commitStack, uid);
    const loc = locate(st, uid);
    if (st.cards[uid].faceUp && loc && isTop(st, loc)) resolveMiddle(ctx, uid, 'play');
    fireEvent(ctx, { on: 'play', player: side, line, card: uid });
    return;
  }
  c.zone = 'field';
  c.commitDest = null;
  removeFrom(st.commitStack, uid);
  log(ctx, `P${side + 1}: ${faceUp ? DEFS[c.def].id : 'カード'} をライン${line + 1}に${faceUp ? '表' : '裏'}でプレイ`, uid);
  const loc = locate(st, uid);
  if (st.cards[uid].faceUp && loc && isTop(st, loc)) resolveMiddle(ctx, uid, 'play');
  fireEvent(ctx, { on: 'play', player: side, line, card: uid });
}

function resolveMiddle(ctx, uid, why) {
  const st = ctx.st;
  const loc = locate(st, uid);
  if (!loc) return;
  if (ignoreMiddleAt(st, loc.line)) { log(ctx, `${defOf(st, uid).id} の中段は無視された`); return; }
  if (middleSuppressed(st, uid)) { log(ctx, `${defOf(st, uid).id} の中段はないものとして扱われた`); return; }
  const eff = DEFS[st.cards[uid].def].eff;
  if (!eff.middle || !eff.middle.ops) return;  // 中段が常在効果のみ(SMOKE_3)の場合はコマンドなし
  if (ctx.depth > 80) throw { __err: '解決の深さ上限を超過 (無限ループの疑い)' };
  ctx.depth++;
  try {
    log(ctx, `[${defOf(st, uid).id}] 中段コマンド解決 (${why})`, uid);
    const fr = { source: uid, slot: 'middle', controller: loc.side, line: loc.line, bind: {}, done: false };
    execOps(ctx, fr, eff.middle.ops);
  } finally { ctx.depth--; }
}

/* ---------- ドロー / 捨て札 ---------- */

/* ICE_6: 手札が1枚以上ある場合ドロー不可 */
function cannotDraw(st, side) {
  return st.players[side].hand.length >= 1 &&
    activeStatics(st).some(s => s.kind === 'cannotDraw' && s.sideIdx === side);
}

function drawCards(ctx, side, n, fromOpp) {
  const st = ctx.st;
  if (cannotDraw(st, side)) { log(ctx, `P${side + 1}: ドローできない`); return 0; }
  const src = fromOpp ? 1 - side : side;
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const d = st.players[src];
    if (!d.deck.length && d.trash.length) {
      d.deck = d.trash; d.trash = [];
      for (const u of d.deck) { st.cards[u].zone = 'deck' + src; st.cards[u].faceUp = false; }
      shuffle(st, d.deck);
      forgetDeckOrder(st, src);
      log(ctx, `P${src + 1}: トラッシュをシャッフルしてデッキを再構成`);
      fireEvent(ctx, { on: 'shuffle', player: src });
    }
    if (!d.deck.length) break;
    const u = d.deck.shift();
    const c = st.cards[u];
    c.zone = 'hand' + side;
    if (fromOpp) c.owner = side;
    st.players[side].hand.push(u);
    knowCard(st, u, side);
    drawn++;
  }
  if (drawn) {
    log(ctx, `P${side + 1}: ${drawn}枚ドロー${fromOpp ? '(相手のデッキから)' : ''}`);
    fireEvent(ctx, { on: 'draw', player: side, count: drawn });
  }
  return drawn;
}

/* デッキシャッフル(効果由来)。shuffleイベントを発行 */
function shuffleDeck(ctx, side) {
  shuffle(ctx.st, ctx.st.players[side].deck);
  forgetDeckOrder(ctx.st, side);
  log(ctx, `P${side + 1}: デッキをシャッフル`);
  fireEvent(ctx, { on: 'shuffle', player: side });
}

function discardCards(ctx, side, uids) {
  const st = ctx.st;
  for (const u of uids) {
    removeFrom(st.players[side].hand, u);
    landTrash(ctx, u);
  }
  if (uids.length) {
    log(ctx, `P${side + 1}: ${uids.length}枚捨て札`);
    fireEvent(ctx, { on: 'discard', player: side, count: uids.length });
  }
  return uids.length;
}

/* 枚数指定の捨て札 (選択込み)。戻り値: 捨てた枚数 */
function discardN(ctx, side, min, max, promptCtx) {
  const st = ctx.st;
  const hand = st.players[side].hand;
  min = Math.min(min, hand.length);
  max = Math.min(max, hand.length);
  if (max <= 0) return 0;
  let picks;
  if (hand.length === min && min === max) picks = hand.slice();
  else picks = choose(ctx, { kind: 'pickHand', player: side, candidates: hand.slice(), min, max, prompt: 'discard', context: promptCtx });
  return discardCards(ctx, side, picks);
}

/* ---------- 一括(all)処理 ---------- */

function massRemove(ctx, uids, destKind, actor) {
  const st = ctx.st;
  const prevTops = {};
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) {
    const stk = st.lines[l][s];
    if (stk.length) prevTops[l + ':' + s] = stk[stk.length - 1];
  }
  const present = uids.filter(u => locate(st, u));
  for (const u of present) {
    const loc = locate(st, u);
    st.lines[loc.line][loc.side].splice(loc.idx, 1);
    markCommitted(st, u);
    st.cards[u].commitDest = destKind === 'trash' ? 'trash' : 'hand';
  }
  for (const u of present) (destKind === 'trash' ? landTrash : landHand)(ctx, u);
  if (present.length) log(ctx, `${present.length}枚を同時に${destKind === 'trash' ? '削除' : '手札に戻'}した`);
  // 一括処理後、新たに uncovered になった表向きカードの中段が場に入る
  let news = [];
  for (const key in prevTops) {
    const l = +key.split(':')[0], s = +key.split(':')[1];
    const stk = st.lines[l][s];
    if (!stk.length) continue;
    const nt = stk[stk.length - 1];
    if (nt !== prevTops[key] && st.cards[nt].faceUp) news.push(nt);
  }
  while (news.length) {
    news = news.filter(u => { const lo = locate(st, u); return lo && isTop(st, lo) && st.cards[u].faceUp; });
    if (!news.length) break;
    let pick;
    if (news.length === 1) pick = news[0];
    else pick = choose(ctx, { kind: 'pickCard', player: st.turn, candidates: news.slice(), prompt: 'uncover-order' })[0];
    removeFrom(news, pick);
    resolveMiddle(ctx, pick, 'uncover');
  }
  if (destKind === 'trash' && present.length) fireEvent(ctx, { on: 'delete', actor, count: present.length });
  return present.length;
}

/* ---------- リフレッシュ / コントロール / コンパイル ---------- */

function useControlBenefit(ctx, side, reason, line, darknessPowered) {
  const st = ctx.st;
  if (!st.useControl || st.control !== side) return;
  st.control = -1;
  log(ctx, `P${side + 1}: コントロールを消費`);
  const ans = choose(ctx, {
    kind: 'option', player: side, optional: false, prompt: 'control-rearrange',
    options: ['自分のプロトコルを並べ替える', '相手のプロトコルを並べ替える', '並べ替えない'],
    controlReason: reason, controlLine: line, darknessPowered: !!darknessPowered,
    protocols: st.players[side].protocols.map(protocol => ({ name: protocol.name, compiled: protocol.compiled }))
  });
  const controlContext = { controlReason: reason, controlLine: line, darknessPowered: !!darknessPowered };
  if (ans[0] === 0) doRearrange(ctx, side, side, undefined, controlContext);
  else if (ans[0] === 1) doRearrange(ctx, side, 1 - side);
}

function doRearrange(ctx, chooser, target, exact, controlContext) {
  const st = ctx.st;
  const cur = st.players[target].protocols;
  const ans = choose(ctx, {
    kind: 'arrange', player: chooser, target, exact: exact || undefined,
    current: cur.map(p => p.name), compiled: cur.map(p => !!p.compiled), prompt: 'rearrange',
    controlReason: controlContext && controlContext.controlReason,
    controlLine: controlContext && controlContext.controlLine,
    darknessPowered: !!(controlContext && controlContext.darknessPowered)
  });
  st.players[target].protocols = ans.map(i => cur[i]);
  log(ctx, `P${target + 1} のプロトコルを並べ替え: ` + st.players[target].protocols.map(p => p.name).join('/'));
}

function doRefresh(ctx, side) {
  const st = ctx.st;
  if (st.players[side].hand.length >= 5) return false;
  useControlBenefit(ctx, side, 'refresh');
  drawCards(ctx, side, 5 - st.players[side].hand.length);
  log(ctx, `P${side + 1}: リフレッシュ`);
  fireEvent(ctx, { on: 'refresh', player: side });
  return true;
}

function compilableLines(st, side) {
  const out = [];
  for (let l = 0; l < 3; l++) {
    const mine = lineTotal(st, l, side), theirs = lineTotal(st, l, 1 - side);
    if (mine >= 10 && mine > theirs) out.push(l);
  }
  return out;
}

function doCompile(ctx, side, line) {
  const st = ctx.st;
  log(ctx, `P${side + 1}: ライン${line + 1}をコンパイル`);
  const darknessPowered = st.lines[line][side].some(uid =>
    st.cards[uid].faceUp && st.cards[uid].def === 'DARKNESS_3'
  );
  useControlBenefit(ctx, side, 'compile', line, darknessPowered);
  // 置換効果 (SPEED_3): コンパイル削除の代わりに移動
  for (let s = 0; s < 2; s++) {
    for (const uid of st.lines[line][s].slice()) {
      const c = st.cards[uid];
      if (!c.faceUp) continue;
      const eff = DEFS[c.def].eff;
      const tr = eff.upper && eff.upper.trigger;
      if (tr && tr.on === 'wouldBeDeletedByCompile') {
        const dests = [0, 1, 2].filter(l2 => l2 !== line);
        const ans = choose(ctx, { kind: 'pickLine', player: s, lines: dests, prompt: 'compile-replace-shift', context: DEFS[c.def].id });
        const loc = locate(st, uid);
        st.lines[loc.line][loc.side].splice(loc.idx, 1);
        const dstack = st.lines[ans[0]][s];
        markCommitted(st, uid);
        st.cards[uid].commitDest = 'line' + ans[0];
        if (dstack.length) fireWouldBeCovered(ctx, dstack[dstack.length - 1], uid);
        landLine(ctx, uid, ans[0], s);
        log(ctx, `${DEFS[c.def].id} は削除の代わりにライン${ans[0] + 1}へ移動`);
      }
    }
  }
  // 全カード同時削除 (トリガーなし)
  const removed = [];
  for (let s = 0; s < 2; s++) {
    for (const uid of st.lines[line][s]) { markCommitted(st, uid); st.cards[uid].commitDest = 'trash'; removed.push(uid); }
    st.lines[line][s] = [];
  }
  for (const uid of removed) landTrash(ctx, uid);
  if (removed.length) fireEvent(ctx, { on: 'delete', actor: side, count: removed.length });
  // プロトコル反転 / リコンパイル
  const prot = st.players[side].protocols[line];
  if (!prot.compiled) {
    prot.compiled = true;
    log(ctx, `P${side + 1}: ${prot.name} をコンパイル！`);
    if (st.players[side].protocols.every(p => p.compiled)) {
      st.winner = side;
      log(ctx, `P${side + 1} の勝利！`);
    }
  } else {
    log(ctx, `P${side + 1}: リコンパイル — 相手のデッキトップを獲得`);
    drawCards(ctx, side, 1, true);
  }
  fireEvent(ctx, { on: 'compile', player: side, line });
}

/* ---------- Start / End / Cache フェイズ ---------- */

function doStartEnd(ctx, phase) {
  const st = ctx.st;
  const side = st.turn;
  let noted = [];
  for (let l = 0; l < 3; l++) {
    const stack = st.lines[l][side];
    for (let i = 0; i < stack.length; i++) {
      const uid = stack[i], c = st.cards[uid];
      if (!c.faceUp) continue;
      const eff = DEFS[c.def].eff, top = i === stack.length - 1;
      for (const slot of ['upper', 'lower']) {
        const tr = eff[slot] && eff[slot].trigger;
        if (!tr || tr.on !== phase) continue;
        if (slot === 'lower' && !top) continue;
        noted.push({ uid, slot });
      }
    }
  }
  while (noted.length) {
    noted = noted.filter(p => {
      const loc = locate(st, p.uid);
      return loc && loc.side === side && triggerVisible(st, p.uid, p.slot);
    });
    if (!noted.length) break;
    let pick;
    if (noted.length === 1) pick = noted[0];
    else {
      const ans = choose(ctx, { kind: 'pickCard', player: side, candidates: noted.map(p => p.uid), prompt: phase + '-order' });
      pick = noted.find(p => p.uid === ans[0]);
    }
    noted.splice(noted.indexOf(pick), 1);
    execTrigger(ctx, pick.uid, pick.slot);
  }
}

function doCheckCache(ctx) {
  const st = ctx.st;
  const side = st.turn;
  if (skipCacheFor(st, side)) { log(ctx, `P${side + 1}: キャッシュ確認を省略`); return; }
  const hand = st.players[side].hand;
  if (hand.length <= 5) return;
  const n = hand.length - 5;
  const picks = choose(ctx, { kind: 'pickHand', player: side, candidates: hand.slice(), min: n, max: n, prompt: 'clear-cache' });
  discardCards(ctx, side, picks);
  log(ctx, `P${side + 1}: キャッシュクリア`);
  fireEvent(ctx, { on: 'clearCache', player: side });
}

/* ---------- 効果インタープリタ ---------- */

function slotActive(st, fr) {
  const loc = locate(st, fr.source);
  if (!loc) return false;
  const c = st.cards[fr.source];
  if (!c.faceUp) return false;
  if (fr.locked) return true;
  if (fr.slot !== 'upper' && !isTop(st, loc)) return false;
  return true;
}

function execOps(ctx, fr, ops) {
  for (const op of ops) {
    if (!slotActive(ctx.st, fr)) { log(ctx, `[${defOf(ctx.st, fr.source).id}] テキストが無効になり残りを中断`); return; }
    execOp(ctx, fr, op);
  }
}

function actorOf(fr, op) { return op.player === 'opp' || op.actor === 'opp' ? 1 - fr.controller : fr.controller; }

function execOp(ctx, fr, op) {
  const st = ctx.st;
  switch (op.op) {

    case 'draw': {
      const who = actorOf(fr, op);
      if (op.optional) {
        const ans = choose(ctx, { kind: 'yesNo', player: who, prompt: 'optional-draw', context: defOf(st, fr.source).id });
        if (!ans.length) { fr.done = false; return; }
      }
      const drawn = drawCards(ctx, who, op.count, !!op.fromOppDeck);
      fr.done = drawn === op.count;
      return;
    }

    case 'discard': {
      const who = actorOf(fr, op);
      let min, max;
      if (op.countFrom) { const n = (fr.bind[op.countFrom.ref] || 0) + (op.countFrom.plus || 0); min = max = n; }
      else if (op.count === 'all') { min = max = st.players[who].hand.length; }  // CHAOS_5/FEAR_2: 手札すべて
      else if (typeof op.count === 'object') { min = op.count.min; max = op.count.max === 'any' ? 99 : op.count.max; }
      else { min = max = op.count; }
      if (op.count === 'all' && max === 0) { if (op.bind) fr.bind[op.bind] = 0; fr.done = true; return; }
      if (op.optional) {
        const handLen = st.players[who].hand.length;
        if (handLen >= 1) {
          const ans = choose(ctx, { kind: 'yesNo', player: who, prompt: 'optional-discard', context: defOf(st, fr.source).id });
          if (!ans.length) { fr.done = false; return; }
        } else { fr.done = false; return; }
      }
      const want = max;
      const did = discardN(ctx, who, min, max, defOf(st, fr.source).id);
      if (op.bind) fr.bind[op.bind] = did;
      fr.done = (typeof op.count === 'object') ? did >= Math.min(min, 1) && did > 0 : did === want && want > 0;
      if (op.countFrom) fr.done = did > 0;
      return;
    }

    case 'flip': case 'delete': case 'return': case 'shift': case 'reveal': {
      execTargetedOp(ctx, fr, op);
      return;
    }

    case 'play': {
      execPlayOp(ctx, fr, op);
      return;
    }

    case 'giveCard': {
      const who = fr.controller;
      const hand = st.players[who].hand;
      if (!hand.length) { fr.done = false; return; }
      if (op.optional) {
        const ans = choose(ctx, { kind: 'yesNo', player: who, prompt: 'optional-give', context: defOf(st, fr.source).id });
        if (!ans.length) { fr.done = false; return; }
      }
      const picks = hand.length === 1 ? hand.slice()
        : choose(ctx, { kind: 'pickHand', player: who, candidates: hand.slice(), min: 1, max: 1, prompt: 'give-card' });
      for (const u of picks) {
        removeFrom(hand, u);
        st.cards[u].owner = 1 - who;
        st.cards[u].zone = 'hand' + (1 - who);
        st.players[1 - who].hand.push(u);
        knowCard(st, u, 1 - who);
      }
      log(ctx, `P${who + 1}: 手札を1枚相手に渡した`);
      fr.done = true;
      return;
    }

    case 'takeRandom': {
      const who = fr.controller;
      const oh = st.players[1 - who].hand;
      if (!oh.length) { fr.done = false; return; }
      const i = Math.floor(rand(st) * oh.length);
      const u = oh.splice(i, 1)[0];
      st.cards[u].owner = who;
      st.cards[u].zone = 'hand' + who;
      st.players[who].hand.push(u);
      knowCard(st, u, who);
      log(ctx, `P${who + 1}: 相手の手札からランダムに1枚引いた`);
      fireEvent(ctx, { on: 'draw', player: who, count: 1 });
      fr.done = true;
      return;
    }

    case 'rearrange': {
      const target = op.whose === 'opp' ? 1 - fr.controller : fr.controller;
      doRearrange(ctx, fr.controller, target);
      fr.done = true;
      return;
    }

    case 'swapProtocols': {
      doRearrange(ctx, fr.controller, fr.controller, 'transposition');
      fr.done = true;
      return;
    }

    case 'refresh': {
      fr.done = doRefresh(ctx, fr.controller);
      return;
    }

    case 'ifDone': {
      if (fr.done) execOps(ctx, fr, op.ops);
      return;
    }

    case 'ifState': {
      const loc = locate(st, fr.source);
      let ok = false;
      if (op.cond === 'handEmpty') ok = st.players[fr.controller].hand.length === 0;
      else if (op.cond === 'handGe2') ok = st.players[fr.controller].hand.length >= 2;
      else if (op.cond === 'trashNonEmpty') ok = st.players[fr.controller].trash.length > 0;
      else if (op.cond === 'protoKindsGe6') ok = countProtoKinds(st) >= 6;
      else if (op.cond === 'protoKindsLe3') ok = countProtoKinds(st) <= 3;
      else if (op.cond === 'otherProtoCardOnField') ok = countProtoOnField(st, defOf(st, fr.source).proto, fr.source) > 0;
      else if (op.cond === 'protoCountGe5') ok = countProtoOnField(st, defOf(st, fr.source).proto) >= 5;
      else if (loc) {
        if (op.cond === 'thisCovered') ok = !isTop(st, loc);
        if (op.cond === 'thisCovers') ok = loc.idx > 0;
        if (op.cond === 'oppLeadsThisLine') ok = lineTotal(st, loc.line, 1 - fr.controller) > lineTotal(st, loc.line, fr.controller);
      }
      if (ok) execOps(ctx, fr, op.ops);
      else fr.done = false;
      return;
    }

    case 'choice': {
      const labels = op.options.map((branch, i) => branch.map(o => o.op).join('+'));
      const ans = choose(ctx, {
        kind: 'option', player: fr.controller, optional: !!op.optional,
        options: labels, prompt: 'choice', context: defOf(st, fr.source).id
      });
      if (ans.length) { execOps(ctx, fr, op.options[ans[0]]); fr.done = true; }
      else fr.done = false;
      return;
    }

    case 'forEachLine': {
      let lines = [];
      if (op.lines === 'otherLines') lines = [0, 1, 2].filter(l => l !== fr.line);
      else if (op.lines === 'linesWithYourCards') lines = [0, 1, 2].filter(l => st.lines[l][fr.controller].length > 0);
      else if (op.lines === 'linesWithCovered') // CHAOS_1: 覆われているカードがある各ライン
        lines = [0, 1, 2].filter(l => st.lines[l][0].length > 1 || st.lines[l][1].length > 1);
      else if (op.lines === 'linesWithFaceDown') // SMOKE_1: 裏向きカードが1枚以上ある各ライン
        lines = [0, 1, 2].filter(l => [0, 1].some(s => st.lines[l][s].some(u => !st.cards[u].faceUp)));
      while (lines.length) {
        if (!slotActive(st, fr)) return;            // LIFE_1: 処理中に覆われたら中断
        let l;
        if (lines.length === 1) l = lines[0];
        else l = choose(ctx, { kind: 'pickLine', player: fr.controller, lines: lines.slice(), prompt: 'each-line-order', context: defOf(st, fr.source).id })[0];
        removeFrom(lines, l);
        fr.currentLine = l;
        execOps(ctx, fr, op.ops);
      }
      fr.currentLine = undefined;
      fr.done = true;
      return;
    }

    case 'repeatPer': {
      let n = 0;
      if (op.per.count === 'cardsInThisLine') {
        n = Math.floor((st.lines[fr.line][0].length + st.lines[fr.line][1].length) / (op.per.divisor || 1));
      }
      for (let i = 0; i < n; i++) {
        if (!slotActive(st, fr)) return;
        execOps(ctx, fr, op.ops);
      }
      fr.done = n > 0;
      return;
    }

    /* ---------- Main 2 / Aux 2 拡張 ---------- */

    case 'oppDrawsFromYourDeck': { // CHAOS_1 lower / ASSIMILATION_4: 相手はあなたのデッキトップを引く
      fr.done = drawCards(ctx, 1 - fr.controller, op.count || 1, true) > 0;
      return;
    }

    case 'revealTopDiscard': { // CLARITY_2 upper: デッキトップ公開、捨ててもよい
      const deck = st.players[fr.controller].deck;
      if (!deck.length) { fr.done = false; return; }
      const top = deck[0];
      st.revealed = { kind: 'card', uid: top, player: fr.controller };
      revealCardToAll(st, top);
      log(ctx, `P${fr.controller + 1}: デッキトップ ${DEFS[st.cards[top].def].id} を公開`, top);
      const ans = choose(ctx, { kind: 'yesNo', player: fr.controller, prompt: 'optional-discard-top', context: DEFS[st.cards[top].def].id });
      if (ans.length) {
        deck.shift();
        landTrash(ctx, top);
        log(ctx, `P${fr.controller + 1}: 公開したカードを捨て札`, top);
        fireEvent(ctx, { on: 'discard', player: fr.controller, count: 1 });
      }
      fr.done = true;
      return;
    }

    case 'searchDeck': { // CLARITY_3/4, UNITY_5: デッキ公開→該当カードを手札に→シャッフル
      const p = st.players[fr.controller];
      let matches;
      if (op.proto) matches = p.deck.filter(u => DEFS[st.cards[u].def].proto === op.proto);
      else matches = p.deck.filter(u => DEFS[st.cards[u].def].value === op.value);
      log(ctx, `P${fr.controller + 1}: デッキを公開`);
      const take = op.all ? matches : matches.slice(0, 1);
      for (const u of take) {
        removeFrom(p.deck, u);
        st.cards[u].zone = 'hand' + fr.controller;
        p.hand.push(u);
        revealCardToAll(st, u);
      }
      if (take.length) log(ctx, `P${fr.controller + 1}: ${take.map(u => DEFS[st.cards[u].def].id).join(', ')} を手札に加えた`);
      shuffleDeck(ctx, fr.controller);
      fr.done = take.length > 0;
      return;
    }

    case 'shuffleTrashIntoDeck': { // CLARITY_5, TIME_1/3
      const p = st.players[fr.controller];
      if (!p.trash.length) { fr.done = false; return; }
      if (op.optional) {
        const ans = choose(ctx, { kind: 'yesNo', player: fr.controller, prompt: 'optional-' + op.op, context: defOf(st, fr.source).id });
        if (!ans.length) { fr.done = false; return; }
      }
      for (const u of p.trash) { st.cards[u].zone = 'deck' + fr.controller; st.cards[u].faceUp = false; p.deck.push(u); }
      p.trash = [];
      log(ctx, `P${fr.controller + 1}: 捨て札置き場をデッキに戻す`);
      shuffleDeck(ctx, fr.controller);
      fr.done = true;
      return;
    }

    case 'discardTop': { // LUCK_3/5: デッキトップを捨て札にする。bindで参照可
      const who = op.player === 'opp' ? 1 - fr.controller : fr.controller;
      const deck = st.players[who].deck;
      if (!deck.length) { fr.done = false; return; }
      const u = deck.shift();
      landTrash(ctx, u);
      log(ctx, `P${who + 1}: デッキトップ ${DEFS[st.cards[u].def].id} を捨て札`, u);
      if (op.bind) fr.bind[op.bind] = u;
      fireEvent(ctx, { on: 'discard', player: who, count: 1 });
      fr.done = true;
      return;
    }

    case 'discardDeck': { // TIME_2: あなたのデッキのカードをすべて捨て札にする
      const p = st.players[fr.controller];
      const n = p.deck.length;
      while (p.deck.length) landTrash(ctx, p.deck.shift());
      if (n) {
        log(ctx, `P${fr.controller + 1}: デッキ${n}枚をすべて捨て札`);
        fireEvent(ctx, { on: 'discard', player: fr.controller, count: n });
      }
      fr.done = n > 0;
      return;
    }

    case 'declare': { // LUCK_1/4: 値またはプロトコルを宣言する
      if (op.what === 'value') {
        const opts = [0, 1, 2, 3, 4, 5, 6];
        const ans = choose(ctx, { kind: 'option', player: fr.controller, options: opts.map(String), prompt: 'declare-value', context: defOf(st, fr.source).id });
        fr.bind[op.bind || 'declared'] = opts[ans[0]];
        log(ctx, `P${fr.controller + 1}: 値 ${opts[ans[0]]} を宣言`);
      } else {
        // 宣言候補は実際にゲームで使われている6プロトコル(両者の編成)のみ。
        // 相手のデッキにはこの6種しか入らないため、全30種から選ぶ意味はない
        const names = [];
        for (let s = 0; s < 2; s++) for (const p of st.players[s].protocols)
          if (names.indexOf(p.name) < 0) names.push(p.name);
        const ans = choose(ctx, { kind: 'option', player: fr.controller, options: names, prompt: 'declare-protocol', context: defOf(st, fr.source).id });
        fr.bind[op.bind || 'declared'] = names[ans[0]];
        log(ctx, `P${fr.controller + 1}: プロトコル ${names[ans[0]]} を宣言`);
      }
      fr.done = true;
      return;
    }

    case 'ifBindMatches': { // LUCK_4: 捨てたカードが宣言と一致した場合
      const u = fr.bind[op.ref];
      if (u === undefined) { fr.done = false; return; }
      const d = DEFS[st.cards[u].def];
      const declared = fr.bind[op.declared || 'declared'];
      const ok = op.match === 'protocol' ? d.proto === declared : d.value === declared;
      if (ok) execOps(ctx, fr, op.ops);
      else fr.done = false;
      return;
    }

    case 'drawRevealPlay': { // LUCK_1: 3枚引き、宣言値のカードを公開してプレイできる
      const declared = fr.bind[op.declared || 'declared'];
      const p = st.players[fr.controller];
      const before = p.hand.length;
      drawCards(ctx, fr.controller, op.count || 3);
      const drawn = p.hand.slice(before);
      const matches = drawn.filter(u => DEFS[st.cards[u].def].value === declared);
      if (!matches.length) { fr.done = false; return; }
      let pick = matches[0];
      if (matches.length > 1) {
        const ans = choose(ctx, { kind: 'pickHand', player: fr.controller, candidates: matches, min: 1, max: 1, prompt: 'reveal-hand-card', context: defOf(st, fr.source).id });
        pick = ans[0];
      }
      st.revealed = { kind: 'card', uid: pick, player: fr.controller };
      revealCardToAll(st, pick);
      log(ctx, `P${fr.controller + 1}: ${DEFS[st.cards[pick].def].id} を公開`, pick);
      const yn = choose(ctx, { kind: 'yesNo', player: fr.controller, prompt: 'optional-play', context: DEFS[st.cards[pick].def].id });
      if (yn.length) {
        const faces = [];
        for (let l = 0; l < 3; l++) {
          if (canPlay(st, fr.controller, pick, l, true)) faces.push({ l, f: true });
          if (canPlay(st, fr.controller, pick, l, false)) faces.push({ l, f: false });
        }
        if (faces.length) {
          const opts = faces.map(x => 'ライン' + (x.l + 1) + (x.f ? '(表)' : '(裏)'));
          const sel = choose(ctx, { kind: 'option', player: fr.controller, options: opts, prompt: 'play-dest', context: DEFS[st.cards[pick].def].id });
          const f = faces[sel[0]];
          playToField(ctx, pick, f.l, fr.controller, f.f);
        }
      }
      fr.done = true;
      return;
    }

    case 'swapStacks': { // MIRROR_3: 自分の2スタックの全カードを入れ替える
      const nonEmpty = [0, 1, 2].filter(l => st.lines[l][fr.controller].length > 0);
      if (nonEmpty.length < 2) { fr.done = false; return; }
      const a = choose(ctx, { kind: 'pickLine', player: fr.controller, lines: nonEmpty, prompt: 'swap-stack-1', context: defOf(st, fr.source).id })[0];
      const rest = nonEmpty.filter(l => l !== a);
      const b = rest.length === 1 ? rest[0]
        : choose(ctx, { kind: 'pickLine', player: fr.controller, lines: rest, prompt: 'swap-stack-2', context: defOf(st, fr.source).id })[0];
      const sa = st.lines[a][fr.controller], sb = st.lines[b][fr.controller];
      st.lines[a][fr.controller] = sb;
      st.lines[b][fr.controller] = sa;
      log(ctx, `P${fr.controller + 1}: ライン${a + 1}とライン${b + 1}のスタックを入れ替え`);
      // 入れ替え後、新たにuncoveredになった表向きカードの中段はプレイに入らない(移動ではなくswap)
      fr.done = true;
      return;
    }

    case 'mirrorMiddle': { // MIRROR_2: 相手カード1枚の中段を、このカード上にあるかのように解決
      const cands = [];
      for (let l = 0; l < 3; l++) for (const uid of st.lines[l][1 - fr.controller]) {
        const c = st.cards[uid];
        if (c.faceUp && DEFS[c.def].eff.middle && DEFS[c.def].eff.middle.ops) cands.push(uid);
      }
      if (!cands.length) { fr.done = false; return; }
      const pick = cands.length === 1 ? cands[0]
        : choose(ctx, { kind: 'pickCard', player: fr.controller, candidates: cands, prompt: 'mirror-middle', context: defOf(st, fr.source).id })[0];
      log(ctx, `[${defOf(st, fr.source).id}] ${DEFS[st.cards[pick].def].id} の中段コマンドをコピー解決`, fr.source);
      const loc = locate(st, fr.source);
      const sub = { source: fr.source, slot: 'middle', controller: fr.controller, line: loc ? loc.line : fr.line, bind: {}, done: false };
      execOps(ctx, sub, DEFS[st.cards[pick].def].eff.middle.ops);
      fr.done = true;
      return;
    }

    case 'randomDiscard': { // FEAR_5: 相手はランダムに1枚捨て札にする
      const who = op.player === 'opp' ? 1 - fr.controller : fr.controller;
      const hand = st.players[who].hand;
      if (!hand.length) { fr.done = false; return; }
      const i = Math.floor(rand(st) * hand.length);
      discardCards(ctx, who, [hand[i]]);
      fr.done = true;
      return;
    }

    case 'bothDiscardAll': { // PEACE_1: 両プレイヤーは手札をすべて捨て札にする(順序は発動者が選ぶ)
      let order = [fr.controller, 1 - fr.controller];
      if (st.players[0].hand.length && st.players[1].hand.length) {
        const ans = choose(ctx, { kind: 'option', player: fr.controller, options: ['自分から', '相手から'], prompt: 'discard-order', context: defOf(st, fr.source).id });
        if (ans[0] === 1) order = [1 - fr.controller, fr.controller];
      }
      let n = 0;
      for (const who of order) n += discardCards(ctx, who, st.players[who].hand.slice());
      fr.done = n > 0;
      return;
    }

    case 'stealToHand': { // ASSIMILATION_1: 相手の裏向きカード1枚をあなたの手札に加える(所有権変更)
      const cands = [];
      for (let l = 0; l < 3; l++) for (const uid of st.lines[l][1 - fr.controller]) {
        if (!st.cards[uid].faceUp) cands.push(uid);
      }
      if (!cands.length) { fr.done = false; return; }
      const pick = cands.length === 1 ? cands[0]
        : choose(ctx, { kind: 'pickCard', player: fr.controller, candidates: cands, prompt: 'steal-to-hand', context: defOf(st, fr.source).id })[0];
      const info = extractCard(ctx, pick);
      st.cards[pick].commitDest = 'hand';
      fireUncover(ctx, info);
      st.cards[pick].owner = fr.controller;
      landHand(ctx, pick);
      log(ctx, `${cardLabel(st, pick)} を自分の手札に加えた`, pick);
      fr.done = true;
      return;
    }

    case 'discardToOppTrash': { // ASSIMILATION_2 lower: 手札1枚を相手の捨て札置き場に置く
      const hand = st.players[fr.controller].hand;
      if (!hand.length) { fr.done = false; return; }
      const pick = hand.length === 1 ? hand[0]
        : choose(ctx, { kind: 'pickHand', player: fr.controller, candidates: hand.slice(), min: 1, max: 1, prompt: 'discard', context: defOf(st, fr.source).id })[0];
      removeFrom(hand, pick);
      const c = st.cards[pick];
      c.owner = 1 - fr.controller;   // 相手のトラッシュに入る=相手の山に戻る
      landTrash(ctx, pick);
      log(ctx, `P${fr.controller + 1}: 手札1枚を相手の捨て札置き場に置いた`, pick);
      fr.done = true;
      return;
    }

    case 'setProtocolCompiled': { // DIVERSITY_1 / UNITY_2: 自分の該当プロトコルをコンパイル完了にする
      const proto = op.proto || defOf(st, fr.source).proto;
      const idx = st.players[fr.controller].protocols.findIndex(p => p.name === proto);
      if (idx < 0 || st.players[fr.controller].protocols[idx].compiled) { fr.done = false; return; }
      st.players[fr.controller].protocols[idx].compiled = true;
      log(ctx, `P${fr.controller + 1}: ${proto} をコンパイル完了にした！`);
      if (op.deleteLine) {
        const uids = st.lines[idx][0].concat(st.lines[idx][1]);
        massRemove(ctx, uids, 'trash', fr.controller);
      }
      if (st.players[fr.controller].protocols.every(p => p.compiled)) {
        st.winner = fr.controller;
        log(ctx, `P${fr.controller + 1} の勝利！`);
      }
      fr.done = true;
      return;
    }

    case 'drawDynamic': { // UNITY_3 / DIVERSITY_2: 可変枚数ドロー
      let n = 0;
      if (op.count === 'protoOnField') n = countProtoOnField(st, defOf(st, fr.source).proto);
      else if (op.count === 'protoKindsInThisLine') n = countProtoKindsInLine(st, fr.currentLine !== undefined ? fr.currentLine : fr.line);
      if (n > 0) drawCards(ctx, fr.controller, n);
      fr.done = n > 0;
      return;
    }

    case 'playFromTrash': { // TIME_1/4: 捨て札置き場のカードをプレイする
      const trash = st.players[fr.controller].trash;
      if (!trash.length) { fr.done = false; return; }
      const pick = trash.length === 1 ? trash[0]
        : choose(ctx, { kind: 'pickCard', player: fr.controller, candidates: trash.slice(), prompt: 'play-from-trash', context: defOf(st, fr.source).id })[0];
      if (op.facing === 'down') {
        // TIME_4: このカードとは別のラインに裏向きでプレイ
        const lines = [0, 1, 2].filter(l => l !== fr.line);
        const l = choose(ctx, { kind: 'pickLine', player: fr.controller, lines, prompt: 'play-dest', context: DEFS[st.cards[pick].def].id })[0];
        st.revealed = { kind: 'card', uid: pick, player: fr.controller };
        log(ctx, `P${fr.controller + 1}: 捨て札の ${DEFS[st.cards[pick].def].id} を公開`, pick);
        removeFrom(trash, pick);
        playToField(ctx, pick, l, fr.controller, false);
      } else {
        // TIME_1: 通常プレイ(表は対応ライン、裏は任意)
        const faces = [];
        for (let l = 0; l < 3; l++) {
          if (canPlay(st, fr.controller, pick, l, true)) faces.push({ l, f: true });
          if (canPlay(st, fr.controller, pick, l, false)) faces.push({ l, f: false });
        }
        if (!faces.length) { fr.done = false; return; }
        const opts = faces.map(x => 'ライン' + (x.l + 1) + (x.f ? '(表)' : '(裏)'));
        const sel = choose(ctx, { kind: 'option', player: fr.controller, options: opts, prompt: 'play-dest', context: DEFS[st.cards[pick].def].id });
        const f = faces[sel[0]];
        removeFrom(trash, pick);
        playToField(ctx, pick, f.l, fr.controller, f.f);
      }
      fr.done = true;
      return;
    }

    case 'drawByValue': {
      const uid = fr.bind[op.ref];
      if (uid === undefined) { fr.done = false; return; }
      const v = cardValue(st, uid);
      if (v > 0) drawCards(ctx, fr.controller, v);
      fr.done = true;
      return;
    }

    case 'drawByCount': {
      const n = (fr.bind[op.ref] || 0) + (op.plus || 0);
      if (n > 0) drawCards(ctx, actorOf(fr, op), n);
      fr.done = true;
      return;
    }

    case 'noCompileNextTurn': {
      st.players[1 - fr.controller].cannotCompile = true;
      log(ctx, `P${2 - fr.controller}: 次のターンはコンパイル不可`);
      fr.done = true;
      return;
    }

    default:
      throw { __err: '未知の op: ' + op.op };
  }
}

/* ---- 対象を取る op (flip/delete/return/shift/reveal) ---- */

function execTargetedOp(ctx, fr, op) {
  const st = ctx.st;
  const sel = op.select || {};
  const chooser = op.actor === 'opp' ? 1 - fr.controller : fr.controller;

  // reveal target=hand 系
  if (op.op === 'reveal' && op.target) {
    if (op.target === 'oppHand') {
      const oh = st.players[1 - fr.controller].hand;
      for (const uid of oh) revealCardToAll(st, uid);
      log(ctx, `P${2 - fr.controller}: 手札を公開: ` + oh.map(u => DEFS[st.cards[u].def].id).join(', '));
      st.revealed = { kind: 'hand', player: 1 - fr.controller, cards: oh.map(u => DEFS[st.cards[u].def].id) };
      fr.done = true; return;
    }
    if (op.target === 'ownHandCard') {
      const hand = st.players[fr.controller].hand;
      if (!hand.length) { fr.done = false; return; }
      const picks = hand.length === 1 ? hand.slice()
        : choose(ctx, { kind: 'pickHand', player: fr.controller, candidates: hand.slice(), min: 1, max: 1, prompt: 'reveal-hand-card' });
      log(ctx, `P${fr.controller + 1}: 手札の ${DEFS[st.cards[picks[0]].def].id} を公開`);
      fr.done = true; return;
    }
  }

  // ref 直接参照 ("this card" / "that card")
  if (sel.ref) {
    const uid = sel.ref === 'this' ? fr.source : fr.bind[sel.ref];
    if (uid === undefined || !locate(st, uid)) { fr.done = false; return; }
    if (op.optional) {
      const ans = choose(ctx, { kind: 'yesNo', player: chooser, prompt: 'optional-' + op.op, context: defOf(st, uid).id });
      if (!ans.length) { fr.done = false; return; }
    }
    fr.done = performVerb(ctx, fr, op, uid);
    if (op.bind) fr.bind[op.bind] = uid;
    return;
  }

  const mode = sel.mode || 'pick';

  // 対象候補の計算
  const found = collectCandidates(ctx, fr, op, sel, chooser);
  if (found === null) { fr.done = false; return; }   // chosenLine 等で候補なし
  const cands = found;

  if (mode === 'all') {
    fr.done = performMass(ctx, fr, op, cands);
    return;
  }

  if (mode === 'each') {
    let noted = cands.slice();
    let any = false;
    while (noted.length) {
      if (!slotActive(st, fr)) return;
      noted = noted.filter(u => matchesSel(st, fr, u, sel));
      if (!noted.length) break;
      let u;
      if (noted.length === 1) u = noted[0];
      else u = choose(ctx, { kind: 'pickCard', player: chooser, candidates: noted.slice(), prompt: 'each-order', context: defOf(st, fr.source).id })[0];
      removeFrom(noted, u);
      if (performVerb(ctx, fr, op, u)) any = true;
    }
    fr.done = any;
    return;
  }

  // mode: pick
  if (!cands.length) { fr.done = false; return; }
  let uid;
  if (op.optional) {
    const picks = choose(ctx, {
      kind: 'pickCard', player: chooser, candidates: cands, min: 0, max: 1,
      prompt: 'optional-' + op.op, context: defOf(st, fr.source).id
    });
    if (!picks.length) { fr.done = false; return; }
    uid = picks[0];
  } else if (cands.length === 1) {
    uid = cands[0];
  } else {
    uid = choose(ctx, {
      kind: 'pickCard', player: chooser, candidates: cands, min: 1, max: 1,
      prompt: op.op, context: defOf(st, fr.source).id
    })[0];
  }
  fr.done = performVerb(ctx, fr, op, uid);
  if (op.bind) fr.bind[op.bind] = uid;
}

function matchesSel(st, fr, uid, sel) {
  const loc = locate(st, uid);
  if (!loc) return false;
  const c = st.cards[uid];
  if (c.zone === 'committed') return false;  // 移動中(未着地)のカードは効果の対象外
  const coverage = sel.coverage || (sel.mode === 'all' ? 'all' : 'uncovered');
  const top = isTop(st, loc);
  if (coverage === 'uncovered' && !top) return false;
  if (coverage === 'covered' && top) return false;
  if (sel.owner === 'self' && loc.side !== fr.controller) return false;
  if (sel.owner === 'opp' && loc.side !== 1 - fr.controller) return false;
  if (sel.facing === 'up' && !c.faceUp) return false;
  if (sel.facing === 'down' && c.faceUp) return false;
  if (sel.exclude === 'thisCard' && uid === fr.source) return false;
  if (sel.zone === 'thisLine' && loc.line !== fr.line) return false;
  if (sel.zone === 'thisStack' && (loc.line !== fr.line)) return false;
  if (sel.zone === 'currentLine' && loc.line !== fr.currentLine) return false;
  if (sel.zone === 'lineWhereOppLeads') { // COURAGE_2: 相手合計が自分より大きいライン
    if (lineTotal(st, loc.line, 1 - fr.controller) <= lineTotal(st, loc.line, fr.controller)) return false;
  }
  if (sel.zone === 'sameLineAsRef') {     // MIRROR_4: bindカードと同じライン
    const ref = fr.bind[sel.refKey || 't'];
    const rloc = ref !== undefined ? locate(st, ref) : null;
    if (!rloc || rloc.line !== loc.line) return false;
  }
  if (sel.proto && DEFS[c.def].proto !== sel.proto) return false;
  if (sel.notProto && DEFS[c.def].proto === sel.notProto) return false;
  if (sel.value && typeof sel.value === 'object') {
    const v = cardValue(st, uid);
    if (sel.value.in && sel.value.in.indexOf(v) < 0) return false;
    if (sel.value.eq !== undefined && v !== sel.value.eq) return false;
    if (sel.value.ltProtoKinds && v >= countProtoKinds(st)) return false;                    // DIVERSITY_4
    if (sel.value.gtHandCount && v <= st.players[fr.controller].hand.length) return false;  // PEACE_3
    if (sel.value.eqBindPrinted) {  // LUCK_5: bindカードの印刷値と同値
      const ref = fr.bind[sel.value.eqBindPrinted];
      if (ref === undefined || v !== DEFS[st.cards[ref].def].value) return false;
    }
  }
  return true;
}

function collectCandidates(ctx, fr, op, sel, chooser) {
  const st = ctx.st;
  let zoneLines = null; // 制限ライン

  if (sel.zone === 'chosenLine') {
    const valid = [0, 1, 2].filter(l => allInLine(l).some(u => matchesSel(st, fr, u, stripZone(sel))));
    if (!valid.length) return null;
    let l;
    if (valid.length === 1) l = valid[0];
    else l = choose(ctx, { kind: 'pickLine', player: chooser, lines: valid, prompt: 'choose-line', context: defOf(st, fr.source).id })[0];
    zoneLines = [l];
  } else if (sel.zone === 'otherLineWith8plus') {
    const valid = [0, 1, 2].filter(l => l !== fr.line && (st.lines[l][0].length + st.lines[l][1].length) >= 8);
    if (!valid.length) return null;
    let l;
    if (valid.length === 1) l = valid[0];
    else l = choose(ctx, { kind: 'pickLine', player: chooser, lines: valid, prompt: 'choose-line-8plus', context: defOf(st, fr.source).id })[0];
    zoneLines = [l];
  }

  let cands = [];
  for (let l = 0; l < 3; l++) {
    if (zoneLines && zoneLines.indexOf(l) < 0) continue;
    for (let s = 0; s < 2; s++) {
      for (const uid of st.lines[l][s]) {
        const sel2 = zoneLines ? stripZone(sel) : sel;
        if (matchesSel(st, fr, uid, sel2)) cands.push(uid);
      }
    }
  }

  // shift dest=thisLine の場合、既にこのラインにあるカードは対象外
  if (op.op === 'shift' && op.dest === 'thisLine') {
    cands = cands.filter(u => locate(st, u).line !== fr.line);
  }

  // highest / lowest
  if (sel.value === 'highest' || sel.value === 'lowest') {
    if (cands.length) {
      const vals = cands.map(u => cardValue(st, u));
      const best = sel.value === 'highest' ? Math.max.apply(null, vals) : Math.min.apply(null, vals);
      cands = cands.filter((u, i) => vals[i] === best);
    }
  }
  return cands;

  function allInLine(l) {
    return st.lines[l][0].concat(st.lines[l][1]);
  }
  function stripZone(s) { const o = Object.assign({}, s); delete o.zone; return o; }
}

function performVerb(ctx, fr, op, uid) {
  const st = ctx.st;
  switch (op.op) {
    case 'flip':   return doFlip(ctx, uid, op.ignoreMiddle);
    case 'delete': return doDelete(ctx, uid, fr.controller);
    case 'return': return doReturn(ctx, uid);
    case 'reveal': {
      const c = st.cards[uid];
      revealCardToAll(st, uid);
      log(ctx, `${DEFS[c.def].id} を公開`);
      st.revealed = { kind: 'card', uid, def: DEFS[c.def].id };
      return true;
    }
    case 'shift': {
      const loc = locate(st, uid);
      if (!loc) return false;
      let dest;
      const d = op.dest || 'anyOther';
      if (d === 'thisLine') dest = fr.line;
      else if (d === 'oppHighestLine') { // COURAGE_4: 相手の最大合計値のライン(同値は選択)
        const totals = [0, 1, 2].map(l => lineTotal(st, l, 1 - fr.controller));
        const best = Math.max.apply(null, totals);
        const lines = [0, 1, 2].filter(l => totals[l] === best && l !== loc.line);
        if (!lines.length) return false;
        dest = pickDest(lines);
      }
      else if (d === 'fromOrToThisLine') {
        if (loc.line === fr.line) dest = pickDest([0, 1, 2].filter(l => l !== loc.line));
        else dest = fr.line;
      } else { // anyOther
        dest = pickDest([0, 1, 2].filter(l => l !== loc.line));
      }
      if (dest === loc.line) return false;
      return doShift(ctx, uid, dest);

      function pickDest(lines) {
        if (lines.length === 1) return lines[0];
        return choose(ctx, { kind: 'pickLine', player: fr.controller, lines, prompt: 'shift-dest', context: cardLabel(st, uid) })[0];
      }
    }
  }
  return false;
}

function performMass(ctx, fr, op, cands) {
  const st = ctx.st;
  if (!cands.length) return false;
  if (op.op === 'delete') return massRemove(ctx, cands, 'trash', fr.controller) > 0;
  if (op.op === 'return') return massRemove(ctx, cands, 'hand', fr.controller) > 0;
  if (op.op === 'flip') {
    // 同時反転 (APATHY_2: 表→裏のみ。中段は発動しない)
    for (const u of cands.slice()) {
      if (!locate(st, u)) continue;
      if (st.cards[u].faceUp) fireWouldBeFlipped(ctx, u); // METAL_6
      if (!locate(st, u)) continue;
      st.cards[u].faceUp = !st.cards[u].faceUp;
    }
    log(ctx, `${cands.length}枚を同時に反転`);
    return true;
  }
  if (op.op === 'shift') {
    // LIGHT_4: 1つの他ラインへ相対順を維持して移動
    const lines = [0, 1, 2].filter(l => l !== fr.line);
    const dest = choose(ctx, { kind: 'pickLine', player: fr.controller, lines, prompt: 'mass-shift-dest', context: defOf(st, fr.source).id })[0];
    const prevTops = {};
    for (let s = 0; s < 2; s++) {
      const stk = st.lines[fr.line][s];
      if (stk.length) prevTops[s] = stk[stk.length - 1];
    }
    for (let s = 0; s < 2; s++) {
      const moving = st.lines[fr.line][s].filter(u => cands.indexOf(u) >= 0);
      if (!moving.length) continue;
      st.lines[fr.line][s] = st.lines[fr.line][s].filter(u => cands.indexOf(u) < 0);
      const dstack = st.lines[dest][s];
      for (const u of moving) { markCommitted(st, u); st.cards[u].commitDest = 'line' + dest; }
      if (dstack.length) fireWouldBeCovered(ctx, dstack[dstack.length - 1], moving[0]);
      for (const u of moving) landLine(ctx, u, dest, s);
    }
    // 移動元で新たに uncovered になった表向きカード
    for (let s = 0; s < 2; s++) {
      const stk = st.lines[fr.line][s];
      if (!stk.length) continue;
      const nt = stk[stk.length - 1];
      if (nt !== prevTops[s] && st.cards[nt].faceUp) resolveMiddle(ctx, nt, 'uncover');
    }
    log(ctx, `${cands.length}枚をライン${dest + 1}へ同時に移動`);
    return true;
  }
  return false;
}

/* ---- play op ---- */

function execPlayOp(ctx, fr, op) {
  const st = ctx.st;
  const who = actorOf(fr, op);
  const source = op.source || 'hand';

  // 行き先ライン決定
  let line;
  const d = op.dest;
  if (d === 'thisLine') line = fr.line;
  else if (d === 'currentLine') line = fr.currentLine;
  else if (d === 'underThisCard') line = (locate(st, fr.source) || { line: fr.line }).line;
  else if (d === 'otherLine') {
    const lines = [0, 1, 2].filter(l => l !== fr.line);
    line = null; // 後でカードと同時に選択
    var destChoices = lines;
  }
  else if (d === 'lineWithFaceDown') { // SMOKE_4: 裏向きカードが1枚以上あるライン
    const lines = [0, 1, 2].filter(l => [0, 1].some(s => st.lines[l][s].some(u => !st.cards[u].faceUp)));
    if (!lines.length) { fr.done = false; return; }
    line = null;
    destChoices = lines;
  } // dest 未指定 (SPEED_1) は通常プレイ → カード選択後にライン選択

  if (source === 'topDeck' || source === 'oppTopDeck') {
    const deckOwner = source === 'oppTopDeck' ? 1 - who : who;
    const deck = st.players[deckOwner].deck;
    if (!deck.length) { fr.done = false; return; }   // デッキ0枚: リシャッフルしない (ルール仕様 §5.2)
    const uid = deck[0];
    // ASSIMILATION_3/6: 特定スタックの上に裏向きでプレイ
    if (d === 'thisStack' || d === 'oppStack') {
      const stSide = d === 'thisStack' ? (locate(st, fr.source) || { side: fr.controller }).side : 1 - fr.controller;
      let l2;
      if (d === 'thisStack') l2 = (locate(st, fr.source) || { line: fr.line }).line;
      else {
        const nonEmpty = [0, 1, 2].filter(l3 => st.lines[l3][stSide].length > 0);
        const lines2 = nonEmpty.length ? nonEmpty : [0, 1, 2];
        l2 = lines2.length === 1 ? lines2[0]
          : choose(ctx, { kind: 'pickLine', player: fr.controller, lines: lines2, prompt: 'play-dest', context: defOf(st, fr.source).id })[0];
      }
      deck.shift();
      playToField(ctx, uid, l2, stSide, false);
      fr.done = true;
      return;
    }
    let l = line;
    if (l === null || l === undefined) {
      if (typeof destChoices !== 'undefined') {
        l = destChoices.length === 1 ? destChoices[0]
          : choose(ctx, { kind: 'pickLine', player: who, lines: destChoices, prompt: 'play-dest', context: defOf(st, fr.source).id })[0];
      } else if (d === 'anyLine') { // LUCK_2: 任意のラインに裏向きでプレイ
        l = choose(ctx, { kind: 'pickLine', player: who, lines: [0, 1, 2], prompt: 'play-dest', context: defOf(st, fr.source).id })[0];
      } else l = fr.line;
    }
    const faceUp = op.facing === 'up';
    if (!canPlay(st, who, uid, l, faceUp)) { fr.done = false; return; }
    deck.shift();
    playToField(ctx, uid, l, who, faceUp, op.dest === 'underThisCard' ? fr.source : undefined);
    if (op.bind) fr.bind[op.bind] = uid;   // LUCK_2: プレイしたカードを後続opが参照
    fr.done = true;
    return;
  }

  // source: hand (committed=移動中のカードは除外)
  let hand = st.players[who].hand.filter(u => st.cards[u].zone !== 'committed');
  if (op.filterValue !== undefined) hand = hand.filter(u => DEFS[st.cards[u].def].value === op.filterValue);   // CLARITY_3
  if (op.notProto) hand = hand.filter(u => DEFS[st.cards[u].def].proto !== op.notProto);                        // DIVERSITY_1
  if (!hand.length) { fr.done = false; return; }

  if (op.facing === 'down') {
    // 裏向き固定: カードとラインを選ぶ
    const lines = (typeof destChoices !== 'undefined') ? destChoices : [0, 1, 2];
    const validLines = lines.filter(l => canPlay(st, who, hand[0], l, false));
    if (!validLines.length) { fr.done = false; return; }
    const cu = hand.length === 1 ? hand[0]
      : choose(ctx, { kind: 'pickHand', player: who, candidates: hand.slice(), min: 1, max: 1, prompt: 'play-card', context: defOf(st, fr.source).id })[0];
    const l = validLines.length === 1 ? validLines[0]
      : choose(ctx, { kind: 'pickLine', player: who, lines: validLines, prompt: 'play-dest', context: defOf(st, fr.source).id })[0];
    playToField(ctx, cu, l, who, false);
    fr.done = true;
    return;
  }

  // 通常プレイ (SPEED_1): 表/裏自由・通常ルール
  const allowedLines = (line !== undefined && line !== null) ? [line]
    : (typeof destChoices !== 'undefined') ? destChoices : [0, 1, 2];
  const opts = [];
  for (const u of hand) for (const l of allowedLines) {
    if (canPlay(st, who, u, l, true)) opts.push(u + '|' + l + '|u');
    if (canPlay(st, who, u, l, false)) opts.push(u + '|' + l + '|d');
  }
  if (!opts.length) { fr.done = false; return; }
  const pick = opts.length === 1 ? opts[0]
    : choose(ctx, { kind: 'pickCard', player: who, candidates: opts, min: 1, max: 1, prompt: 'play-free', context: defOf(st, fr.source).id })[0];
  const parts = pick.split('|');
  playToField(ctx, parts[0], +parts[1], who, parts[2] === 'u');
  fr.done = true;
}

/* ---------- ターン進行 ---------- */

function runTurnLoop(ctx) {
  const st = ctx.st;
  let guard = 0;
  while (st.winner === null) {
    if (++guard > 500) throw { __err: 'ターンループ上限超過' };
    switch (st.phase) {
      case 'start':
        log(ctx, `--- P${st.turn + 1} のターン ---`);
        doStartEnd(ctx, 'start');
        st.phase = 'checkControl';
        break;
      case 'checkControl': {
        if (st.useControl) {
          let wins = 0;
          for (let l = 0; l < 3; l++) if (lineTotal(st, l, st.turn) > lineTotal(st, l, 1 - st.turn)) wins++;
          if (wins >= 2 && st.control !== st.turn) {
            st.control = st.turn;
            log(ctx, `P${st.turn + 1}: コントロールを獲得`);
          }
        }
        st.phase = 'checkCompile';
        break;
      }
      case 'checkCompile': {
        const p = st.players[st.turn];
        if (p.cannotCompile) {
          p.cannotCompile = false;
          log(ctx, `P${st.turn + 1}: このターンはコンパイルできない`);
          st.phase = 'action';
          break;
        }
        const lines = compilableLines(st, st.turn);
        if (lines.length) {
          let l;
          if (lines.length === 1) l = lines[0];
          else l = choose(ctx, { kind: 'pickLine', player: st.turn, lines, prompt: 'compile-line' })[0];
          doCompile(ctx, st.turn, l);
          st.phase = 'checkCache';
        } else st.phase = 'action';
        break;
      }
      case 'action': {
        const acts = legalActions(st);
        if (!acts.length) {
          log(ctx, `P${st.turn + 1}: アクションをスキップ`);
          st.phase = 'checkCache';
          break;
        }
        return; // プレイヤー入力待ち
      }
      case 'checkCache':
        doCheckCache(ctx);
        st.phase = 'end';
        break;
      case 'end':
        doStartEnd(ctx, 'end');
        st.turn = 1 - st.turn;
        st.phase = 'start';
        break;
      default:
        throw { __err: '不明なフェイズ: ' + st.phase };
    }
  }
}

/* CORRUPTION_1: どちらのプレイヤー側でもプレイできるカードか */
function canPlayEitherSide(st, uid) {
  const eff = DEFS[st.cards[uid].def].eff;
  return !!(eff.lower && eff.lower.handStatic === 'thisAnyLineEitherSide');
}

function legalActions(st) {
  if (st.winner !== null || st.phase !== 'action') return [];
  const p = st.turn;
  const out = [];
  for (const uid of st.players[p].hand) {
    for (let l = 0; l < 3; l++) {
      if (canPlay(st, p, uid, l, true)) out.push({ type: 'play', card: uid, line: l, faceUp: true });
      if (canPlay(st, p, uid, l, false)) out.push({ type: 'play', card: uid, line: l, faceUp: false });
      if (canPlayEitherSide(st, uid)) { // 相手側スタックへのプレイ
        out.push({ type: 'play', card: uid, line: l, faceUp: true, side: 1 - p });
        out.push({ type: 'play', card: uid, line: l, faceUp: false, side: 1 - p });
      }
    }
  }
  if (st.players[p].hand.length < 5) out.push({ type: 'refresh' });
  return out;
}

/* ---------- アクション実行 / apply ---------- */

function performAction(ctx, action) {
  const st = ctx.st;
  if (action.type === '_begin') return; // newGame: start フェイズから進行
  if (st.winner !== null) throw { __err: 'ゲームは終了している' };
  if (action.type === 'surrender') {
    const loser = action.player === 0 || action.player === 1 ? action.player : st.turn;
    st.winner = 1 - loser;
    st.phase = 'finished';
    log(ctx, `P${loser + 1}: まいりました`);
    return;
  }
  if (st.phase !== 'action') throw { __err: 'アクションフェイズではない' };
  const p = st.turn;
  if (action.type === 'play') {
    if (st.players[p].hand.indexOf(action.card) < 0) throw { __err: '手札にないカード' };
    const destSide = (action.side === 0 || action.side === 1) ? action.side : p;
    if (destSide !== p && !canPlayEitherSide(st, action.card)) throw { __err: '相手側にはプレイできないカード' };
    if (destSide === p && !canPlay(st, p, action.card, action.line, action.faceUp)) throw { __err: 'そのプレイは許可されていない' };
    playToField(ctx, action.card, action.line, destSide, !!action.faceUp);
    st.phase = 'checkCache';
  } else if (action.type === 'refresh') {
    if (st.players[p].hand.length >= 5) throw { __err: '手札が5枚以上ではリフレッシュできない' };
    doRefresh(ctx, p);
    st.phase = 'checkCache';
  } else {
    throw { __err: '不明なアクション: ' + action.type };
  }
}

function runReplay(base, action, choices) {
  const st = clone(base);
  st.revealed = null;
  if (!Array.isArray(st.commitStack)) st.commitStack = [];  // 外部由来のstate(詰めCompile共有盤面など)に対する防御
  if (typeof st.commitSeq !== 'number') st.commitSeq = 0;
  const ctx = { st, choices, ci: 0, qn: 0, depth: 0, log: [], trace: TRACE ? [] : null };
  try {
    performAction(ctx, action);
    runTurnLoop(ctx);
    st.pending = null;
    return { state: st, requests: [], log: ctx.log, trace: ctx.trace || [], winner: st.winner, error: null };
  } catch (e) {
    if (e && e.__suspend) {
      const out = clone(base);
      out.pending = { base, action, choices, requestId: e.__suspend.id };
      return { state: out, view: ctx.st, requests: [e.__suspend], log: ctx.log, trace: ctx.trace || [], winner: null, error: null };
    }
    if (e && e.__err) {
      return { state: base, requests: [], log: [], winner: base.winner, error: e.__err };
    }
    throw e;
  }
}

function apply(state, action) {
  if (!DEFS) throw new Error('Engine.init(cards, effects) を先に呼ぶこと');
  if (action.type === 'choose') {
    const pend = state.pending;
    if (!pend) return { state, requests: [], log: [], winner: state.winner, error: '選択待ちではない' };
    if (action.id !== pend.requestId) {
      return { state, requests: [], log: [], winner: state.winner, error: '古い選択操作です' };
    }
    return runReplay(pend.base, pend.action, pend.choices.concat([action.picks]));
  }
  const base = clone(state);
  base.pending = null;
  return runReplay(base, action, []);
}

/* ---------- ゲーム作成 ---------- */

function newGame(opts) {
  if (!DEFS) throw new Error('Engine.init(cards, effects) を先に呼ぶこと');
  const seed = opts.seed === undefined ? 1 : opts.seed;
  const st = {
    seed, rngN: 0,
    useControl: opts.useControl !== false,
    turn: opts.first || 0,
    phase: 'start',
    control: -1,
    winner: null,
    players: [],
    lines: [[[], []], [[], []], [[], []]],
    cards: {},
    actionLog: [],
    commitStack: [],
    commitSeq: 0,
    revealed: null,
    pending: null
  };
  const chosen = [opts.p0, opts.p1];
  for (let p = 0; p < 2; p++) {
    const protos = chosen[p];
    if (!protos || protos.length !== 3) throw new Error('各プレイヤーは3プロトコルを指定すること');
    const deck = [];
    for (const name of protos) {
      if (!PROTOS[name]) throw new Error('未知のプロトコル: ' + name);
      for (const defId of PROTOS[name]) {
        const uid = 'p' + p + ':' + defId;
        st.cards[uid] = { uid, def: defId, owner: p, faceUp: false, zone: 'deck' + p, knownTo: 0 };
        deck.push(uid);
      }
    }
    st.players.push({
      protocols: protos.map(n => ({ name: n, compiled: false })),
      deck, hand: [], trash: [], cannotCompile: false
    });
  }
  shuffle(st, st.players[0].deck);
  shuffle(st, st.players[1].deck);
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < 5; i++) {
      const u = st.players[p].deck.shift();
      st.cards[u].zone = 'hand' + p;
      st.players[p].hand.push(u);
      knowCard(st, u, p);
    }
  }
  return runReplay(st, { type: '_begin' }, []);
}

/* ---------- AI ---------- */

let AI_LEVEL = 1; // 0=easy, 1=normal, 2=hard
let AI_THINK_BUDGET_MS = 590;
const AI_BREADTH = { rootEval: 999, rootSearch: 24, reply: 14, shallow: 6 };
function setAiLevel(v) { AI_LEVEL = Math.max(0, Math.min(2, v | 0)); }
/* 1手あたりの思考時間(ms)。ベンチや自己対戦で探索量を振るために外から変更できる */
function setAiThinkBudget(ms) { AI_THINK_BUDGET_MS = Math.max(1, ms | 0); }
function setAiBreadth(rootEval, rootSearch, reply, shallow) {
  if (rootEval > 0) AI_BREADTH.rootEval = rootEval | 0;
  if (rootSearch > 0) AI_BREADTH.rootSearch = rootSearch | 0;
  if (reply > 0) AI_BREADTH.reply = reply | 0;
  if (shallow > 0) AI_BREADTH.shallow = shallow | 0;
}

/* 評価の重み。ai_arena の --weights で振り、昇格戦を通った値だけ既定値へ反映する。 */
const AI_W = {
  ctrlHold: 65, ctrlHoldLev: 0.7,     // コントロールを持っている
  ctrlOpp: 90, ctrlOppLev: 0.75,      // 相手が持っている
  leadGain: 50, oppLeadGain: 78,      // 2ラインリード=次のコントロールフェイズで奪える見込み
  leadBonus: 18, oppLeadBonus: 24,    // リードそのものの価値
  // 各ラインの合計値差。CONTROLを直接追うのではなく、盤面差を広げた結果として獲得する
  marginLead: 6, marginTrail: 6,
  // リフレッシュはターンを丸ごと使う。引ける枚数が少ないほど割に合わない
  refreshPerCard: 13, refreshTempo: 26, compileSafety: 1,
};
function setAiWeights(obj) { for (const k in obj) if (k in AI_W) AI_W[k] = obj[k]; }
let AI_SPECIALIST_ENABLED = false;
let AI_SPECIALIST_SIDE = -1;
function setAiSpecialist(enabled, side) {
  AI_SPECIALIST_ENABLED = !!enabled;
  AI_SPECIALIST_SIDE = side === 0 || side === 1 ? side : -1;
}
const AI_DSH_W = {
  think: 1.5, rootSearch: 32, reply: 18, shallow: 8,
  opponentInfo: 1,
  ctrlHold: 65, ctrlHoldLev: 0.7, ctrlOpp: 90, ctrlOppLev: 0.75,
  leadGain: 50, oppLeadGain: 78, leadBonus: 18, oppLeadBonus: 24,
  marginLead: 6, marginTrail: 6, refreshPerCard: 13, refreshTempo: 26,
  compileSafety: 1, hateDownPenalty: 20, speedDownPenalty: 20, speedPairStrategy: 1,
};
function setAiSpecialistWeights(obj) {
  for (const k in obj) if (k in AI_DSH_W && Number.isFinite(obj[k])) AI_DSH_W[k] = obj[k];
}

/* --- Phase A: 評価関数 --- */

function aiCount(x, fallback) {
  if (typeof x === 'number') return x;
  if (x && typeof x === 'object') {
    if (typeof x.min === 'number') return x.min;
    if (typeof x.plus === 'number') return x.plus + 1;
  }
  return fallback || 1;
}

function aiOpsValue(ops, depth) {
  if (!Array.isArray(ops) || depth > 4) return 0;
  let v = 0;
  for (const op of ops) {
    if (!op || !op.op) continue;
    const actor = op.player === 'opp' || op.actor === 'opp' ? -1 : 1;
    switch (op.op) {
      case 'draw': v += actor * aiCount(op.count, 1) * 16; break;
      case 'drawByValue': case 'drawByCount': v += actor * 24; break;
      case 'discard': v += (op.player === 'opp' ? 1 : -1) * aiCount(op.count, 1) * 15; break;
      case 'delete': v += 34; break;
      case 'return': v += 23; break;
      case 'shift': v += 17; break;
      case 'flip': v += 11; break;
      case 'play': v += actor * 19; break;
      case 'refresh': v += 18; break;
      case 'rearrange': case 'swapProtocols': v += 34; break;
      case 'noCompileNextTurn': v += 38; break;
      case 'reveal': v += 5; break;
      case 'takeRandom': v += 24; break;
      case 'giveCard': v -= aiCount(op.count, 1) * 11; break;
      case 'choice': {
        const vals = (op.options || []).map(o => aiOpsValue(o, depth + 1));
        v += vals.length ? Math.max(0, Math.max.apply(null, vals)) : 0;
        break;
      }
      case 'ifDone': case 'ifState':
        v += aiOpsValue(op.ops, depth + 1) * 0.8;
        break;
      case 'forEachLine':
        v += aiOpsValue(op.ops, depth + 1) * 1.5;
        break;
      case 'repeatPer':
        v += aiOpsValue(op.ops, depth + 1) * 1.3;
        break;
    }
  }
  return v;
}

function aiMiddleValue(def) {
  return def && def.eff && def.eff.middle ? aiOpsValue(def.eff.middle.ops, 0) : 0;
}

function aiTriggerValue(def, slot) {
  const tr = def && def.eff && def.eff[slot] && def.eff[slot].trigger;
  return tr ? aiOpsValue(tr.ops, 0) : 0;
}

function aiLineLeadCount(st, side) {
  const op = 1 - side;
  let wins = 0;
  for (let l = 0; l < 3; l++) if (lineTotal(st, l, side) > lineTotal(st, l, op)) wins++;
  return wins;
}

function aiControlLeverage(st, side) {
  if (!st.useControl) return 0;
  const op = 1 - side;
  const myComp = st.players[side].protocols.filter(p => p.compiled).length;
  const opComp = st.players[op].protocols.filter(p => p.compiled).length;
  let v = 20 + myComp * 16 + opComp * 22;
  for (let l = 0; l < 3; l++) {
    const mine = lineTotal(st, l, side), theirs = lineTotal(st, l, op);
    if (!st.players[side].protocols[l].compiled && mine >= 10 && mine > theirs) v += 18;
    if (!st.players[op].protocols[l].compiled && theirs >= 10 && theirs > mine) v += 28;
  }
  return v;
}

function aiHandPotential(st, side) {
  const op = 1 - side;
  const vals = [];
  for (const uid of st.players[side].hand) {
    const c = st.cards[uid], d = DEFS[c.def];
    let best = -10;
    for (let l = 0; l < 3; l++) {
      if (st.players[side].protocols[l].compiled) continue;
      const names = [st.players[0].protocols[l].name, st.players[1].protocols[l].name];
      if (names.indexOf(d.proto) < 0) continue;
      const mine = lineTotal(st, l, side), theirs = lineTotal(st, l, op);
      const face = d.value + Math.max(0, aiMiddleValue(d)) * 0.18;
      const down = 2 + (d.value < 2 ? 2 : 0);
      let s = Math.max(face, down);
      const gap = Math.max(0, 10 - mine);
      if (gap <= Math.max(d.value, 2)) s += 18;
      if (mine + Math.max(d.value, 2) > theirs) s += 8;
      best = Math.max(best, s);
    }
    vals.push(best);
  }
  vals.sort((a, b) => b - a);
  return vals.slice(0, 4).reduce((a, b) => a + b, 0);
}

function aiBoardEffectScore(st, side) {
  let v = 0;
  for (let l = 0; l < 3; l++) for (let s = 0; s < 2; s++) {
    const stack = st.lines[l][s];
    for (let i = 0; i < stack.length; i++) {
      const uid = stack[i], c = st.cards[uid];
      if (!c.faceUp) continue;
      const d = DEFS[c.def];
      let cv = 0;
      if (d.eff.upper && d.eff.upper.static) cv += 10;
      if (i === stack.length - 1 && d.eff.lower && d.eff.lower.static) cv += 12;
      cv += aiTriggerValue(d, 'upper') * 0.18;
      if (i === stack.length - 1) cv += aiTriggerValue(d, 'lower') * 0.22;
      v += c.owner === side ? cv : -cv;
    }
  }
  return v;
}

function aiIsDshSpecialist(st, side) {
  return AI_SPECIALIST_ENABLED && !!st.players[side]
    && (AI_SPECIALIST_SIDE < 0 || AI_SPECIALIST_SIDE === side);
}

function aiWeightsFor(st, side) {
  return aiIsDshSpecialist(st, side) ? AI_DSH_W : AI_W;
}

function aiHasDefOnField(st, side, defId) {
  for (let line = 0; line < 3; line++) {
    if (st.lines[line][side].some(uid => st.cards[uid].def === defId)) return true;
  }
  return false;
}

function aiHasDefInHand(st, side, defId) {
  return st.players[side].hand.some(uid => st.cards[uid].def === defId);
}

/* 中段の対象取り効果 (shift/flip/delete/return) が今の盤面で
   空撃ちになるかの近似判定。fr を仮組みして matchesSel を再利用する。
   bind 依存のセレクタは判定できないため「対象あり」扱いで除外 */
function aiMiddleFizzles(st, side, action, d) {
  const mid = d.eff && d.eff.middle && d.eff.middle.ops;
  if (!Array.isArray(mid)) return false;
  const fr = { controller: side, source: action.card, line: action.line,
    currentLine: action.line, bind: {} };
  let sawTargeted = false;
  for (const op of mid) {
    if (['shift', 'flip', 'delete', 'return'].indexOf(op.op) < 0) continue;
    const sel = op.select;
    if (!sel || sel.ref) continue;
    if (sel.zone === 'sameLineAsRef' || (sel.value && sel.value.eqBindPrinted)) continue;
    sawTargeted = true;
    for (let l = 0; l < 3; l++) {
      for (let s2 = 0; s2 < 2; s2++) {
        for (const uid of st.lines[l][s2]) {
          if (matchesSel(st, fr, uid, sel)) return false;   // 対象あり
        }
      }
    }
  }
  return sawTargeted;   // 対象取り効果があり、どれも空
}

function aiActionBias(st, action, side) {
  if (!action) return 0;
  const op = 1 - side;
  const W = aiWeightsFor(st, side);
  if (action.type === 'refresh') {
    /* リフレッシュは手札を5枚まで補充するだけでターンを1つ丸ごと使う。
       手札4枚なら1枚しか引けず、盤面を進める1手より明確に損。
       引ける枚数に比例した価値からテンポ損を差し引き、少枚数の補充は負にする */
    const draws = 5 - st.players[side].hand.length;
    let v = draws * W.refreshPerCard - W.refreshTempo;
    if (st.control === side) v += aiControlLeverage(st, side) * 0.35;
    return v;
  }
  if (action.type !== 'play') return 0;
  // CORRUPTION_1等の相手側プレイ: 相手の表向きuncoveredカードを覆って無効化できるときだけ前向き
  if (action.side !== undefined && action.side !== side) {
    const oppStack = st.lines[action.line][op];
    if (oppStack.length) {
      const topC = st.cards[oppStack[oppStack.length - 1]];
      if (topC.faceUp) return DEFS[topC.def].value * 8 - 20;
    }
    return -60;  // 相手に値を与えるだけの手は避ける
  }
  const c = st.cards[action.card], d = DEFS[c.def];
  const mine = lineTotal(st, action.line, side), theirs = lineTotal(st, action.line, op);
  const gap = Math.max(0, 10 - mine);
  let v = 0;
  /* 対象がいない盤面で対象取りの中段を表で切るのは効果の空撃ち。
     裏でプレイするか温存する方が価値が残る (例: 序盤の SPEED 3) */
  if (action.faceUp && aiMiddleFizzles(st, side, action, d)) {
    v -= 12 + aiMiddleValue(d) * 0.6;
  }
  if (aiIsDshSpecialist(st, side) && W.speedPairStrategy
      && (d.id === 'SPEED_1' || d.id === 'SPEED_4')) {
    const pairOnField = aiHasDefOnField(st, side, 'SPEED_1') || aiHasDefOnField(st, side, 'SPEED_4');
    if (!pairOnField) {
      const pairReady = aiHasDefInHand(st, side, 'SPEED_1') && aiHasDefInHand(st, side, 'SPEED_4');
      if (!pairReady) v -= 180;
      else if (d.id === 'SPEED_1' && action.faceUp) v += 220;
      else v -= 160;
    }
  }
  const compiledLine = !!st.players[side].protocols[action.line].compiled;
  if (compiledLine) {
    const add = action.faceUp ? d.value : 2;
    const likelyRecompile = mine + add >= 10 && mine + add > theirs;
    v -= likelyRecompile ? 160 : 75;
  }
  if (action.faceUp) {
    const mv = aiMiddleValue(d);
    v += mv * 0.35;
    v += (d.value - 2) * 7;
    if (gap <= d.value && mine + d.value > theirs && !st.players[side].protocols[action.line].compiled) v += 150;
    if (mv < 8 && d.value < 2) v -= 20;
    if (gap <= d.value && !st.players[side].protocols[action.line].compiled) v += 22;
    if (mine + d.value > theirs) v += 8;
  } else {
    v += (2 - d.value) * 5;
    if (['HATE_4', 'HATE_5'].includes(d.id)) v -= W.hateDownPenalty || 0;
    if (['SPEED_2', 'SPEED_4'].includes(d.id)) v -= W.speedDownPenalty || 0;
    if (gap <= 2 && mine + 2 > theirs && !st.players[side].protocols[action.line].compiled) v += 115;
    if (aiMiddleValue(d) > 35) v -= 24;
    if (gap <= 2 && !st.players[side].protocols[action.line].compiled) v += 12;
    if (mine + 2 > theirs) v += 5;
  }
  return v;
}

function aiNow() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function aiTransitionScore(before, result, side) {
  if (!before || !result || !result.state) return 0;
  const beforeLog = before.actionLog || [];
  const afterLog = result.state.actionLog || [];
  const ownTag = `P${side + 1}: リコンパイル`;
  const oppTag = `P${2 - side}: リコンパイル`;
  const count = (logs, tag) => logs.reduce((n, line) => n + (String(line).includes(tag) ? 1 : 0), 0);
  const own = Math.max(0, count(afterLog, ownTag) - count(beforeLog, ownTag));
  const opp = Math.max(0, count(afterLog, oppTag) - count(beforeLog, oppTag));
  return opp * 55 - own * 35;
}

function aiDisruptionValue(ops, depth) {
  if (!Array.isArray(ops) || depth > 4) return 0;
  let value = 0;
  for (const op of ops) {
    if (!op || !op.op) continue;
    if (op.op === 'delete' || op.op === 'return') value = Math.max(value, 5);
    else if (op.op === 'shift') value = Math.max(value, 4);
    else if (op.op === 'flip') value = Math.max(value, 3);
    else if (op.op === 'play') value = Math.max(value, 2);
    else if (op.op === 'rearrange' || op.op === 'swapProtocols') value = Math.max(value, 3);
    else if (op.op === 'choice') {
      for (const option of op.options || []) value = Math.max(value, aiDisruptionValue(option, depth + 1));
    } else if (op.op === 'ifDone' || op.op === 'ifState' || op.op === 'forEachLine' || op.op === 'repeatPer') {
      value = Math.max(value, aiDisruptionValue(op.ops, depth + 1));
    }
  }
  return value;
}

function aiDefResponseValue(st, defId, line) {
  const d = DEFS[defId];
  let value = 2;
  const names = [st.players[0].protocols[line].name, st.players[1].protocols[line].name];
  if (names.indexOf(d.proto) >= 0) {
    value = Math.max(value, d.value + aiDisruptionValue(d.eff.middle && d.eff.middle.ops, 0));
  }
  return value;
}

function aiCardResponseValue(st, uid, line) {
  return aiDefResponseValue(st, st.cards[uid].def, line);
}

/* 次の相手手番を越えてコンパイル条件を保てる確率。未知札は残存プールからのみ推定する。 */
function aiCompilePassChance(st, side, line, observer) {
  const opponent = 1 - side;
  const mine = lineTotal(st, line, side), theirs = lineTotal(st, line, opponent);
  if (mine < 10 || mine <= theirs) return 0;
  const requiredSwing = mine - theirs;

  for (const uid of st.players[opponent].hand) {
    if (aiCardKnownTo(st, uid, observer) && aiCardResponseValue(st, uid, line) >= requiredSwing) return 0;
  }

  const remaining = new Map();
  for (const protocol of st.players[opponent].protocols) {
    for (const defId of PROTOS[protocol.name] || []) remaining.set(defId, (remaining.get(defId) || 0) + 1);
  }
  const origin = 'p' + opponent + ':';
  for (const uid of Object.keys(st.cards)) {
    if (uid.indexOf(origin) !== 0 || !aiCardKnownTo(st, uid, observer)) continue;
    const defId = st.cards[uid].def;
    const count = remaining.get(defId) || 0;
    if (count <= 1) remaining.delete(defId); else remaining.set(defId, count - 1);
  }

  let unknownCount = 0, answers = 0;
  for (const [defId, count] of remaining) {
    const response = aiDefResponseValue(st, defId, line);
    unknownCount += count;
    if (response >= requiredSwing) answers += count;
  }
  const unknownHand = st.players[opponent].hand.reduce((n, uid) => n + (aiCardKnownTo(st, uid, observer) ? 0 : 1), 0);
  if (!unknownHand || !unknownCount || !answers) return 1;
  let noAnswer = 1;
  for (let i = 0; i < Math.min(unknownHand, unknownCount); i++) {
    noAnswer *= Math.max(0, unknownCount - answers - i) / (unknownCount - i);
  }
  return Math.max(0, Math.min(1, noAnswer));
}

function aiCompileSafetyScore(st, observer) {
  let score = 0;
  const opponent = 1 - observer;
  if (st.turn === opponent) {
    for (let line = 0; line < 3; line++) {
      if (st.players[observer].protocols[line].compiled) continue;
      if (lineTotal(st, line, observer) < 10 || lineTotal(st, line, observer) <= lineTotal(st, line, opponent)) continue;
      const chance = aiCompilePassChance(st, observer, line, observer);
      score += chance * 90 - (1 - chance) * 35;
    }
  }
  if (st.turn === observer) {
    for (let line = 0; line < 3; line++) {
      if (st.players[opponent].protocols[line].compiled) continue;
      if (lineTotal(st, line, opponent) < 10 || lineTotal(st, line, opponent) <= lineTotal(st, line, observer)) continue;
      const chance = aiCompilePassChance(st, opponent, line, observer);
      score -= chance * 100 - (1 - chance) * 30;
    }
  }
  return score;
}

function aiScore(st, me) {
  if (st.winner === me) return 1e9;
  if (st.winner === 1 - me) return -1e9;
  const op = 1 - me;
  const W = aiWeightsFor(st, me);
  let sc = 0;
  const myComp = st.players[me].protocols.filter(p => p.compiled).length;
  const opComp = st.players[op].protocols.filter(p => p.compiled).length;

  sc += myComp * 380;
  sc -= opComp * 410;

  const lineInfo = [];
  for (let l = 0; l < 3; l++) {
    const mine = lineTotal(st, l, me), theirs = lineTotal(st, l, op);
    const myProt = st.players[me].protocols[l], opProt = st.players[op].protocols[l];
    lineInfo.push({ mine, theirs, myComp: myProt.compiled, opComp: opProt.compiled });
  }

  for (const li of lineInfo) {
    const margin = Math.max(-12, Math.min(12, li.mine - li.theirs));
    sc += margin >= 0 ? margin * W.marginLead : margin * W.marginTrail;
  }

  const myGaps = [], opGaps = [];
  for (let l = 0; l < 3; l++) {
    const li = lineInfo[l];

    if (!li.myComp) {
      const gap = Math.max(0, 10 - li.mine);
      myGaps.push(gap);
      const lead = li.mine - li.theirs;
      if (li.mine >= 10 && li.mine > li.theirs) {
        sc += 125 + Math.min(lead, 8) * 7;
      } else if (gap === 0) {
        sc += 55;
      } else if (gap <= 2) {
        sc += 42 + (3 - gap) * 14;
      } else if (gap <= 5) {
        sc += gap <= 3 ? 15 : 8;
      }
      sc += Math.min(li.mine, 14) * 2.4;
      if (li.mine > li.theirs) sc += 12;
      else if (li.mine > 0 && li.mine === li.theirs) sc += 2;
    } else {
      myGaps.push(-1);
      sc += 5;
    }

    if (!li.opComp) {
      const oGap = Math.max(0, 10 - li.theirs);
      opGaps.push(oGap);
      const oLead = li.theirs - li.mine;
      if (li.theirs >= 10 && li.theirs > li.mine) {
        sc -= 150 + Math.min(oLead, 8) * 8;
      } else if (oGap === 0) {
        sc -= 70;
      } else if (oGap <= 2) {
        sc -= 48 + (3 - oGap) * 16;
      } else if (oGap <= 4) {
        sc -= 10;
      }
      sc -= Math.min(li.theirs, 14) * 1.9;
    } else {
      opGaps.push(-1);
      sc -= 5;
    }
  }

  const myNeedLines = myGaps.filter(g => g >= 0).sort((a, b) => a - b);
  const opNeedLines = opGaps.filter(g => g >= 0).sort((a, b) => a - b);
  const myNeed = 3 - myComp;
  const opNeed = 3 - opComp;

  if (myNeed > 0 && myNeedLines.length >= myNeed) {
    const bestN = myNeedLines.slice(0, myNeed);
    const avgGap = bestN.reduce((a, b) => a + b, 0) / myNeed;
    sc += Math.max(0, 30 - avgGap * 5);
    if (myComp === 2 && bestN[0] <= 2) sc += 85;
    if (myComp === 2 && bestN[0] === 0) sc += 80;
  }
  if (opNeed > 0 && opNeedLines.length >= opNeed) {
    const bestN = opNeedLines.slice(0, opNeed);
    const avgGap = bestN.reduce((a, b) => a + b, 0) / opNeed;
    sc -= Math.max(0, 35 - avgGap * 5);
    if (opComp === 2 && bestN[0] <= 2) sc -= 105;
    if (opComp === 2 && bestN[0] === 0) sc -= 95;
  }

  const myHand = st.players[me].hand.length, opHand = st.players[op].hand.length;
  sc += Math.min(myHand, 7) * 3;
  sc -= Math.min(opHand, 7) * 2;
  if (myHand === 0) sc -= 15;
  if (myHand >= 3) {
    let playable = 0;
    for (const uid of st.players[me].hand) {
      const d = DEFS[st.cards[uid].def];
      for (let l = 0; l < 3; l++) {
        const names = [st.players[0].protocols[l].name, st.players[1].protocols[l].name];
        if (names.indexOf(d.proto) >= 0 && !lineInfo[l].myComp) { playable++; break; }
      }
    }
    sc += playable * 2;
  }
  sc += aiHandPotential(st, me) * 0.9;
  sc -= aiHandPotential(st, op) * 0.75;
  sc += aiBoardEffectScore(st, me);
  sc += aiCompileSafetyScore(st, me) * W.compileSafety;

  if (st.useControl) {
    let myWins = aiLineLeadCount(st, me), opWins = aiLineLeadCount(st, op);

    if (st.control === me) {
      sc += W.ctrlHold + aiControlLeverage(st, me) * W.ctrlHoldLev;
      if (myComp >= 1) sc += 15;
      if (myComp >= 2) sc += 45;
    } else if (st.control === op) {
      sc -= W.ctrlOpp + aiControlLeverage(st, op) * W.ctrlOppLev;
      if (opComp >= 1) sc -= 15;
      if (opComp >= 2) sc -= 50;
    }

    // 2ライン以上リードしていれば次の自分のコントロールフェイズで奪える見込み
    if (myWins >= 2 && st.control !== me) sc += W.leadGain;
    if (opWins >= 2 && st.control !== op) sc -= W.oppLeadGain;
    if (myWins >= 2) sc += W.leadBonus;
    if (opWins >= 2) sc -= W.oppLeadBonus;

    // With one protocol left, control turns any successful compile into a win.
    // Treat keeping/taking it as a tactical requirement, not a small positional bonus.
    if (opComp === 2) {
      if (st.control === op) sc -= 520;
      else if (opWins >= 2) sc -= 320;
      if (st.control === me) sc += 130;
      if (myWins >= 2) sc += 110;
    }
    if (myComp === 2) {
      if (st.control === me) sc += 420;
      else if (myWins >= 2) sc += 260;
      if (st.control === op) sc -= 150;
    }
  }

  if (st.turn === me) sc += 5;
  return sc;
}

/* --- Phase B: ヒューリスティックpicks --- */

function randomPicks(req) {
  function ri(n) { return Math.floor(Math.random() * n); }
  switch (req.kind) {
    case 'pickCard': case 'pickHand': {
      const min = req.min !== undefined ? req.min : 1;
      const max = Math.min(req.max !== undefined ? req.max : 1, req.candidates.length);
      const n = min + ri(Math.max(0, max - min) + 1);
      const pool = req.candidates.slice(), picks = [];
      for (let i = 0; i < n; i++) picks.push(pool.splice(ri(pool.length), 1)[0]);
      return picks;
    }
    case 'pickLine': return [req.lines[ri(req.lines.length)]];
    case 'option': return (req.optional && Math.random() < 0.3) ? [] : [ri(req.options.length)];
    case 'yesNo': return Math.random() < 0.5 ? ['yes'] : [];
    case 'arrange': return req.exact === 'transposition' ? [1, 0, 2] : [1, 2, 0];
  }
  return [];
}

let AI_CHOICE_DEPTH = 0;
let AI_SEARCH_DEADLINE = 0;

function aiSearchExpired() {
  return AI_SEARCH_DEADLINE > 0 && aiNow() >= AI_SEARCH_DEADLINE;
}

function aiChoiceScore(st, req, picks, me) {
  if (aiSearchExpired()) return -1e8;
  AI_CHOICE_DEPTH++;
  try {
    const res = apply(st, { type: 'choose', id: req.id, picks });
    if (!res || res.error) return -1e8;
    const out = res.requests && res.requests.length ? resolveRequests(res, smartPicks, 8) : res;
    if (!out || out.error || (out.requests && out.requests.length)) return -1e8;
    return aiScore(out.state, me) + aiTransitionScore(st, out, me);
  } finally { AI_CHOICE_DEPTH--; }
}

/* 複数枚選択 (max>1) の組合せ探索。
   全組合せは指数的なので、静的スコア順 (ordered) を軸に
   「先頭k枚 / 末尾k枚 / 境界の1枚入替え」だけを候補にし、
   apply→評価で比較する。候補は最大8通り。 */
function aiBestCombo(st, req, ordered, min, max, fallback) {
  const combos = [], seen = new Set();
  const add = (arr) => {
    if (arr.length < min || arr.length > max) return;
    const key = arr.slice().sort().join('|');
    if (!seen.has(key)) { seen.add(key); combos.push(arr); }
  };
  if (fallback) add(fallback.slice());
  if (min === 0) add([]);
  for (let k = Math.max(1, min); k <= Math.min(max, ordered.length); k++) {
    add(ordered.slice(0, k));
    add(ordered.slice(ordered.length - k));
  }
  const base = Math.max(1, min);
  for (let alt = base; alt < Math.min(ordered.length, base + 2); alt++) {
    add(ordered.slice(0, base - 1).concat([ordered[alt]]));
  }
  if (combos.length < 2) return null;
  let best = null, bestScore = -Infinity;
  for (const picks of combos.slice(0, 8)) {
    if (aiSearchExpired()) break;
    const score = aiChoiceScore(st, req, picks, req.player);
    if (score > bestScore) { bestScore = score; best = picks; }
  }
  return bestScore > -1e8 ? best : null;
}

function aiPlayFreePicks(st, req, me) {
  if (aiIsDshSpecialist(st, me) && aiWeightsFor(st, me).speedPairStrategy && req.context === 'SPEED_1'
      && !aiHasDefOnField(st, me, 'SPEED_1') && !aiHasDefOnField(st, me, 'SPEED_4')) {
    const speed3 = req.candidates.find(raw => {
      const parts = String(raw).split('|');
      return parts[2] === 'u' && st.cards[parts[0]] && st.cards[parts[0]].def === 'SPEED_4';
    });
    if (speed3) return [speed3];
  }
  const ranked = req.candidates.map(raw => {
    const parts = String(raw).split('|');
    const uid = parts[0], line = +parts[1], faceUp = parts[2] === 'u';
    const c = st.cards[uid];
    if (!c || line < 0 || line > 2) return { raw, prelim: -1e8 };
    const d = DEFS[c.def];
    let prelim = aiActionBias(st, { type: 'play', card: uid, line, faceUp }, me);
    prelim += (faceUp ? d.value * 7 + aiMiddleValue(d) * 0.3 : 14);
    if (!st.players[me].protocols[line].compiled) prelim += 18;
    return { raw, prelim };
  }).sort((a, b) => b.prelim - a.prelim);
  if (!ranked.length) return [];
  if (AI_CHOICE_DEPTH > 0) return [ranked[0].raw];

  let best = ranked[0].raw, bestScore = -Infinity;
  for (const item of ranked.slice(0, 6)) {
    if (aiSearchExpired()) break;
    const score = aiChoiceScore(st, req, [item.raw], me) + item.prelim * 0.05;
    if (score > bestScore) { bestScore = score; best = item.raw; }
  }
  return [best];
}

function aiStrategicCardPicks(st, req, me, ranked, fallback) {
  const max = req.max !== undefined ? req.max : 1;
  const min = req.min !== undefined ? req.min : 1;
  if (AI_CHOICE_DEPTH > 0 || req.candidates.length < 2
      || /(?:^|-)order$/.test(req.prompt || '')) return fallback;
  if (max !== 1) {
    const deep = aiBestCombo(st, req, ranked.map(x => x.uid), min, max, fallback);
    return deep || fallback;
  }

  let pool = ranked;
  if (pool.length > 8) pool = pool.slice(0, 5).concat(pool.slice(-3));
  const seen = new Set(), options = [];
  if (min === 0) options.push([]);
  for (const item of pool) {
    if (seen.has(item.uid)) continue;
    seen.add(item.uid);
    options.push([item.uid]);
  }

  let best = fallback, bestScore = -Infinity;
  for (const picks of options) {
    if (aiSearchExpired()) break;
    const score = aiChoiceScore(st, req, picks, me);
    if (score > bestScore) { bestScore = score; best = picks; }
  }
  return bestScore > -1e8 ? best : fallback;
}

function aiForcedControlWinPicks(req) {
  if (req.controlReason !== 'compile' || !Number.isInteger(req.controlLine)) return null;
  if (req.kind === 'option' && req.prompt === 'control-rearrange' && Array.isArray(req.protocols)) {
    const pending = req.protocols.map((protocol, index) => ({ protocol, index }))
      .filter(item => !item.protocol.compiled);
    if (pending.length !== 1) return null;
    return pending[0].index === req.controlLine ? [2] : [0];
  }
  if (req.kind === 'arrange' && Array.isArray(req.current) && Array.isArray(req.compiled)) {
    const pending = req.compiled.map((compiled, index) => ({ compiled, index }))
      .filter(item => !item.compiled);
    if (pending.length !== 1 || pending[0].index === req.controlLine) return null;
    const perms = [[1, 2, 0], [2, 0, 1], [0, 2, 1], [1, 0, 2], [2, 1, 0]];
    return perms.find(order => order[req.controlLine] === pending[0].index) || null;
  }
  return null;
}

function smartPicks(st, req) {
  const me = req.player;
  const op = 1 - me;
  const forcedControlWin = aiForcedControlWinPicks(req);
  if (forcedControlWin) return forcedControlWin;
  switch (req.kind) {
    case 'pickCard': {
      if (req.prompt === 'play-free') return aiPlayFreePicks(st, req, me);
      if (aiIsDshSpecialist(st, me) && aiWeightsFor(st, me).speedPairStrategy
          && req.prompt === 'optional-shift' && req.context === 'SPEED_4') {
        const self = req.candidates.find(uid => st.cards[uid] && st.cards[uid].def === 'SPEED_4');
        if (self) return [self];
      }
      const scored = req.candidates.map(uid => {
        const c = st.cards[uid];
        if (!c) return { uid, s: 0 };
        const loc = locate(st, uid);
        let s = 0;
        if (loc) {
          if (loc.side === op) {
            s += 15;
            const lt = lineTotal(st, loc.line, op);
            if (lt >= 8) s += 20;
            if (!st.players[op].protocols[loc.line].compiled && lt >= 10 && lt > lineTotal(st, loc.line, me)) s += 30;
          } else {
            s -= 5;
            const lt = lineTotal(st, loc.line, me);
            if (lt >= 8 && !st.players[me].protocols[loc.line].compiled) s -= 15;
          }
          if (isTop(st, loc)) s += 8;
          if (aiIsDshSpecialist(st, me) && req.prompt === 'shift' && req.context === 'SPEED_4') {
            const stack = st.lines[loc.line][loc.side];
            const index = stack.indexOf(uid);
            if (index > 0 && index === stack.length - 1) {
              const uncovered = st.cards[stack[index - 1]];
              if (uncovered.faceUp) {
                s += 24 + Math.max(0, aiMiddleValue(DEFS[uncovered.def])) * 0.8;
              }
            }
          }
        }
        s += (c.zone ? cardValue(st, uid) : DEFS[c.def].value) * 2;
        return { uid, s };
      });
      scored.sort((a, b) => b.s - a.s);
      const min = req.min !== undefined ? req.min : 1;
      const max = Math.min(req.max !== undefined ? req.max : 1, scored.length);
      const fallback = min === 0 && (!scored.length || scored[0].s < 8)
        ? [] : scored.slice(0, Math.max(min, Math.min(max, 1))).map(x => x.uid);
      return aiStrategicCardPicks(st, req, me, scored, fallback);
    }
    case 'pickHand': {
      const scored = req.candidates.map(uid => {
        const c = st.cards[uid];
        if (!c) return { uid, s: 0 };
        const d = DEFS[c.def];
        let s = d.value;
        let bestLineFit = -Infinity;
        for (let l = 0; l < 3; l++) {
          const names = [st.players[0].protocols[l].name, st.players[1].protocols[l].name];
          if (names.indexOf(d.proto) < 0) continue;
          const lt = lineTotal(st, l, me);
          const gap = Math.max(0, 10 - lt);
          if (!st.players[me].protocols[l].compiled && gap <= d.value + 2) {
            bestLineFit = Math.max(bestLineFit, d.value + 5);
          } else {
            bestLineFit = Math.max(bestLineFit, d.value);
          }
        }
        if (bestLineFit === -Infinity) s -= 5;
        else s = bestLineFit;
        return { uid, s };
      });
      scored.sort((a, b) => a.s - b.s);
      const min = req.min !== undefined ? req.min : 1;
      const max = Math.min(req.max !== undefined ? req.max : 1, scored.length);
      if (min === 0 && max === 1 && scored.length && AI_CHOICE_DEPTH === 0) {
        const skip = aiChoiceScore(st, req, [], me);
        const discard = aiChoiceScore(st, req, [scored[0].uid], me);
        return discard > skip ? [scored[0].uid] : [];
      }
      const fallbackHand = min === 0 && (!scored.length || scored[0].s > 8)
        ? [] : scored.slice(0, Math.max(min, 1)).map(x => x.uid);
      if (AI_CHOICE_DEPTH === 0 && max > 1 && scored.length > 1) {
        const deep = aiBestCombo(st, req, scored.map(x => x.uid), min, max, fallbackHand);
        if (deep) return deep;
      }
      return fallbackHand;
    }
    case 'pickLine': {
      let bestLine = req.lines[0], bestSc = -Infinity;
      for (const l of req.lines) {
        const mine = lineTotal(st, l, me), theirs = lineTotal(st, l, op);
        let s = 0;
        const gap = Math.max(0, 10 - mine);
        if (!st.players[me].protocols[l].compiled) {
          s += (14 - gap) * 3;
          if (mine >= 10 && mine > theirs) s += 50;
          if (mine > theirs) s += 10;
        }
        if (s > bestSc) { bestSc = s; bestLine = l; }
      }
      if (AI_CHOICE_DEPTH === 0 && req.lines.length > 1) {
        let simBest = -Infinity, simLine = bestLine;
        for (const l of req.lines) {
          const score = aiChoiceScore(st, req, [l], me);
          if (score > simBest) { simBest = score; simLine = l; }
        }
        if (simBest > -1e8) bestLine = simLine;
      }
      return [bestLine];
    }
    case 'option': {
      if (aiIsDshSpecialist(st, me) && req.prompt === 'control-rearrange'
          && req.controlReason === 'compile' && req.darknessPowered && Array.isArray(req.protocols)) {
        const darkness = req.protocols.find(protocol => protocol.name === 'DARKNESS');
        const otherPending = req.protocols.some(protocol => protocol.name !== 'DARKNESS' && !protocol.compiled);
        if (darkness && !darkness.compiled && otherPending) return [0];
      }
      if (req.options.length <= 1 && !req.optional) return [0];
      let best = [0], bestSc = -Infinity;
      for (let i = 0; i < req.options.length; i++) {
        const s = aiChoiceScore(st, req, [i], me);
        if (s > bestSc) { bestSc = s; best = [i]; }
      }
      if (req.optional) {
        const skip = aiChoiceScore(st, req, [], me);
        if (skip > bestSc) best = [];
      }
      return best;
    }
    case 'yesNo': {
      const yS = aiChoiceScore(st, req, ['yes'], me);
      const nS = aiChoiceScore(st, req, [], me);
      return yS >= nS ? ['yes'] : [];
    }
    case 'arrange': {
      let perms = req.exact === 'transposition'
        ? [[1, 0, 2], [0, 2, 1], [2, 1, 0]]
        : [[1, 2, 0], [2, 0, 1], [0, 2, 1], [1, 0, 2], [2, 1, 0]];
      if (aiIsDshSpecialist(st, me) && req.target === me && req.controlReason === 'compile'
          && req.darknessPowered && Number.isInteger(req.controlLine)
          && Array.isArray(req.current) && Array.isArray(req.compiled)) {
        const darknessIndex = req.current.indexOf('DARKNESS');
        const candidates = perms.filter(order => {
          const sourceIndex = order[req.controlLine];
          return darknessIndex >= 0 && !req.compiled[darknessIndex]
            && sourceIndex !== darknessIndex && !req.compiled[sourceIndex];
        });
        if (candidates.length) perms = candidates;
      }
      let best = perms[0], bestSc = -Infinity;
      for (const o of perms) {
        const s = aiChoiceScore(st, req, o, me);
        if (s > bestSc) { bestSc = s; best = o; }
      }
      return best;
    }
  }
  return randomPicks(req);
}

/* --- 共通: アクション後のリクエスト解決 --- */

function resolveRequests(initial, pickFn, limit) {
  let res = initial;
  if (!res || !res.state || !Array.isArray(res.requests)) {
    return { state: initial, requests: [], error: 'invalid AI resolution input', log: [] };
  }
  let guard = 0;
  while (res && !res.error && res.requests.length && guard++ < (limit || 30)) {
    if (aiSearchExpired()) break;
    const req = res.requests[0];
    res = apply(res.state, { type: 'choose', id: req.id, picks: pickFn(res.state, req) });
  }
  return res;
}

function applyAndResolve(state, action, pickFn) {
  const wasTrace = TRACE; TRACE = false;
  try {
    const res = apply(state, action);
    if (!res || res.error || !res.requests.length) return res;
    return resolveRequests(res, pickFn, 30);
  } finally { TRACE = wasTrace; }
}

/* --- Easy AI (旧ロジック: 1-ply random rollout) --- */

const AI_ROLLOUT_SAMPLES = 6;

function aiWouldWasteHate4(state, action, side) {
  if (action.type !== 'play') return false;
  const destSide = action.side === 0 || action.side === 1 ? action.side : side;
  if (destSide !== side) return false;
  const stack = state.lines[action.line][side];
  if (!stack.length) return false;
  const hate4 = stack[stack.length - 1];
  if (!state.cards[hate4].faceUp || state.cards[hate4].def !== 'HATE_5') return false;

  const sourceValue = cardValue(state, hate4);
  let otherLowest = Infinity;
  for (let fieldSide = 0; fieldSide < 2; fieldSide++) {
    const fieldStack = state.lines[action.line][fieldSide];
    const coveredEnd = fieldSide === side ? fieldStack.length - 1 : fieldStack.length - 2;
    for (let index = 0; index <= coveredEnd; index++) {
      const uid = fieldStack[index];
      if (uid !== hate4) otherLowest = Math.min(otherLowest, cardValue(state, uid));
    }
  }
  return sourceValue < otherLowest;
}

function aiDecisionActions(state) {
  let acts = legalActions(state);
  const side = state.turn;
  if (aiIsDshSpecialist(state, side) && aiWeightsFor(state, side).speedPairStrategy
      && !aiHasDefOnField(state, side, 'SPEED_1') && !aiHasDefOnField(state, side, 'SPEED_4')
      && aiHasDefInHand(state, side, 'SPEED_1') && aiHasDefInHand(state, side, 'SPEED_4')) {
    const speed0 = acts.filter(action => action.type === 'play' && action.faceUp
      && state.cards[action.card] && state.cards[action.card].def === 'SPEED_1');
    if (speed0.length) acts = speed0;
  }
  const opponent = 1 - side;
  const opponentPending = state.players[opponent].protocols.filter(protocol => !protocol.compiled).length;
  if (state.useControl && opponentPending === 1 && state.control !== opponent) {
    const safe = acts.filter(action => {
      const result = applyAndResolve(state, action, smartPicks);
      if (!result || result.error || result.requests.length) return false;
      return result.state.winner !== opponent && result.state.control !== opponent;
    });
    if (safe.length) acts = safe;
  }

  const avoidsWaste = acts.filter(action => !aiWouldWasteHate4(state, action, side));
  return avoidsWaste.length ? avoidsWaste : acts;
}

function rolloutScore(state, firstAction, me) {
  const res = applyAndResolve(state, firstAction, function(_, req) { return randomPicks(req); });
  if (!res || res.error || res.requests.length) return -1e8;
  return aiScore(res.state, me);
}

function avgRolloutScore(state, action, me) {
  let sum = 0;
  for (let i = 0; i < AI_ROLLOUT_SAMPLES; i++) sum += rolloutScore(state, action, me);
  return sum / AI_ROLLOUT_SAMPLES;
}

function aiActionEasy(state) {
  const me = state.turn;
  const acts = aiDecisionActions(state);
  if (!acts.length) return null;
  if (acts.length === 1) return acts[0];
  let best = null, bestSc = -Infinity;
  for (const a of acts) {
    const sc = avgRolloutScore(state, a, me) + Math.random() * 2;
    if (sc > bestSc) { bestSc = sc; best = a; }
  }
  return best;
}

/* --- Normal AI (1-ply + smart picks + 強化評価) --- */

function aiActionNormal(state) {
  const me = state.turn;
  const acts = aiDecisionActions(state);
  if (!acts.length) return null;
  if (acts.length === 1) return acts[0];
  let best = null, bestSc = -Infinity;
  for (const a of acts) {
    const res = applyAndResolve(state, a, smartPicks);
    const sc = (!res || res.error || res.requests.length)
      ? -1e8 : aiScore(res.state, me) + aiActionBias(state, a, me)
        + aiTransitionScore(state, res, me);
    if (sc + Math.random() * 0.5 > bestSc) { bestSc = sc; best = a; }
  }
  return best;
}

/* --- 終盤ソルバー ---
   自分が2プロトコル済みのとき、「どの相手応手に対しても次の自分の
   コンパイル判定で3本目が確定する」手を実際にエンジンを回して探す。
   apply は相手ターン開始のコンパイル判定まで自動進行するため、
   winner === me を確かめるだけで読み切りになる。
   相手の選択解決は smartPicks 近似 (厳密解ではないが実戦上十分)。 */
function aiForcedWinAction(state, me, deadline) {
  const acts = legalActions(state);
  for (const a of acts) {
    if (deadline && aiNow() > deadline) return null;
    const res = applyAndResolve(state, a, smartPicks);
    if (!res || res.error || res.requests.length) continue;
    const s1 = res.state;
    if (s1.winner === me) return a;                     // 効果や相手の山切れで即決着
    if (s1.winner !== null) continue;
    if (s1.turn !== 1 - me || s1.phase !== 'action') continue;
    let all = true;
    for (const r of legalActions(s1)) {
      if (deadline && aiNow() > deadline) { all = false; break; }
      const r2 = applyAndResolve(s1, r, smartPicks);
      if (!r2 || r2.error || r2.requests.length || r2.state.winner !== me) { all = false; break; }
    }
    if (all) return a;
  }
  return null;
}

/* 逆向き: この手を指すと、相手がどう返してきても止められない即負け筋が
   残るかどうか。s1 (自分の手を指した直後) を渡す。
   相手の応手 r の後、自分の全応手 q でも相手の勝ちを防げなければ true */
function aiIsLosingAfter(s1, me, deadline) {
  const op = 1 - me;
  for (const r of legalActions(s1)) {
    if (deadline && aiNow() > deadline) return false;   // 読み切れない=咎めない
    const r2 = applyAndResolve(s1, r, smartPicks);
    if (!r2 || r2.error || r2.requests.length) continue;
    const s2 = r2.state;
    if (s2.winner === op) return true;                  // 応手だけで決着
    if (s2.winner !== null || s2.turn !== me || s2.phase !== 'action') continue;
    let escapable = false;
    for (const q of legalActions(s2)) {
      if (deadline && aiNow() > deadline) return false;
      const q2 = applyAndResolve(s2, q, smartPicks);
      if (q2 && !q2.error && !q2.requests.length && q2.state.winner !== op) { escapable = true; break; }
    }
    if (!escapable) return true;                        // どう受けても相手の3本目が通る
  }
  return false;
}

/* --- Hard AI (2-ply minimax + alpha-beta) --- */

function aiActionHard(state, collect) {
  const me = state.turn;
  const acts = aiDecisionActions(state);
  if (!acts.length) return null;
  if (acts.length === 1) return acts[0];

  const wasTrace = TRACE, previousDeadline = AI_SEARCH_DEADLINE; TRACE = false;
  try {
    /* 終盤: 自分が2本済みなら、読み切りの勝ち筋を評価探索より先に探す。
       専用の時間枠で行い、本体探索の予算はこの後から数え始める */
    const myCompiled = state.players[me].protocols.filter(pr => pr.compiled).length;
    if (myCompiled === 2) {
      const forced = aiForcedWinAction(state, me, aiNow() + AI_THINK_BUDGET_MS * 0.6);
      if (forced) return forced;
    }

    const specialist = aiIsDshSpecialist(state, me);
    const deadline = aiNow() + AI_THINK_BUDGET_MS * (specialist ? AI_DSH_W.think : 1);
    AI_SEARCH_DEADLINE = deadline;

    // 静的orderingで全手を候補に残す(重い解決はしない=ここで時間を使い切らない)
    const ordered = orderMovesStatic(acts, state, me);
    if (!ordered.length) return acts[0];

    /* --- depth 1: 全手を1-ply評価しきる。ここまでは必ず完走させ、
       時間切れでも Normal 相当の結果を保証する --- */
    let best = ordered[0].a, bestVal = -Infinity;
    const viable = [];
    const evalLimit = Math.min(ordered.length, AI_BREADTH.rootEval);
    for (let i = 0; i < evalLimit; i++) {
      const item = ordered[i];
      const res = resolveOrdered(item, state);
      if (!res || res.error || res.requests.length) continue;
      const bias = aiActionBias(state, item.a, me) + aiTransitionScore(state, res, me);
      const val = aiScore(res.state, me) + bias;
      item.val1 = val; item.bias = bias;
      viable.push(item);
      if (val > bestVal) { bestVal = val; best = item.a; }
    }
    if (!viable.length) return best;
    /* --- depth 2: 時間が残っていれば、1-plyで有望な手から順に相手手番を読む。
       途中で時間切れになっても depth1 の best が残るので劣化しない --- */
    viable.sort((a, b) => b.val1 - a.val1);
    const rootSearch = specialist ? AI_DSH_W.rootSearch : AI_BREADTH.rootSearch;
    const limit = Math.min(viable.length, rootSearch);
    let alpha = -Infinity, best2 = null;
    for (let i = 0; i < limit; i++) {
      if (aiNow() > deadline) break;
      const item = viable[i];
      const s1 = item.res.state;
      let val;
      if (s1.winner !== null || s1.phase === 'finished' || s1.turn === me) {
        val = aiScore(s1, me);
      } else {
        val = minimaxMin(s1, me, alpha, Infinity, deadline);
      }
      val += item.bias;
      item.val2 = val;
      if (val > alpha) { alpha = val; best2 = item.a; }
    }
    if (collect) {
      for (const item of viable) {
        collect.push({ a: item.a, val: item.val2 !== undefined ? item.val2 : item.val1 });
      }
    }

    /* 終盤の受け: 相手が2本済みなら、評価順に「指しても即負け筋が
       残らない」手を選び直す。全候補が負け筋なら評価どおりに指す */
    const opCompiled = state.players[1 - me].protocols.filter(pr => pr.compiled).length;
    if (opCompiled === 2 && viable.length > 1) {
      const vetoDeadline = aiNow() + AI_THINK_BUDGET_MS * 0.8;
      const valOf = (x) => (x.val2 !== undefined ? x.val2 : x.val1);
      const byVal = viable.slice().sort((x, y) => valOf(y) - valOf(x));
      const floor = valOf(byVal[0]) - 120;   // 誤検知で大差の悪手に乗り換えない
      for (const item of byVal) {
        if (aiNow() > vetoDeadline || valOf(item) < floor) break;
        const s1 = item.res.state;
        if (s1.winner === me) return item.a;
        if (s1.winner !== null) continue;
        if (!aiIsLosingAfter(s1, me, vetoDeadline)) return item.a;
      }
    }
    return best2 || best;
  } finally { TRACE = wasTrace; AI_SEARCH_DEADLINE = previousDeadline; }
}

function minimaxMin(state, me, alpha, beta, deadline) {
  if (state.turn === me || state.winner !== null) return aiScore(state, me);
  const op = 1 - me;
  const fairOpponent = aiIsDshSpecialist(state, me) && AI_DSH_W.opponentInfo > 0;
  const searchState = fairOpponent ? aiInformationState(state, op) : state;
  const acts = legalActions(searchState);
  if (!acts.length) return aiScore(state, me);
  const ordered = orderMovesStatic(acts, searchState, op);
  const reply = aiIsDshSpecialist(state, me) ? AI_DSH_W.reply : AI_BREADTH.reply;
  const limit = Math.min(ordered.length, reply);
  let val = Infinity;
  for (let i = 0; i < limit; i++) {
    if (deadline && aiNow() > deadline) break;
    const res = resolveOrdered(ordered[i], searchState);
    if (!res || res.error || res.requests.length) continue;
    if (fairOpponent) aiRestoreKnownCards(res.state, state, me);
    const s2 = res.state;
    const sc = (s2.winner === null && s2.turn === me)
      ? minimaxMaxShallow(s2, me, alpha, beta, deadline)
      : aiScore(s2, me);
    const tactical = sc + aiTransitionScore(searchState, res, me);
    if (tactical < val) val = tactical;
    if (val <= alpha) return val;
    if (val < beta) beta = val;
  }
  return val === Infinity ? aiScore(state, me) : val;
}

function minimaxMaxShallow(state, me, alpha, beta, deadline) {
  if (state.winner !== null || state.turn !== me) return aiScore(state, me);
  const acts = legalActions(state);
  if (!acts.length) return aiScore(state, me);
  const ordered = acts.map(a => ({ a, bias: aiActionBias(state, a, me) }))
    .sort((a, b) => b.bias - a.bias);
  let val = -Infinity;
  const shallow = aiIsDshSpecialist(state, me) ? AI_DSH_W.shallow : AI_BREADTH.shallow;
  for (let i = 0; i < Math.min(ordered.length, shallow); i++) {
    if (deadline && aiNow() > deadline) break;
    const item = ordered[i];
    const res = applyAndResolve(state, item.a, smartPicks);
    if (!res || res.error || res.requests.length) continue;
    const sc = aiScore(res.state, me) + item.bias + aiTransitionScore(state, res, me);
    if (sc > val) val = sc;
    if (val >= beta) return val;
    if (val > alpha) alpha = val;
  }
  return val === -Infinity ? aiScore(state, me) : val;
}

/* 静的move ordering: applyAndResolve(重い完全シミュレーション)を使わず、
   軽量な静的評価だけで並べ替える。全手が必ず候補に残るので、探索が時間切れでも
   「良い手が評価前に捨てられる」事故が起きない。res は遅延評価 (resolveOrdered) */
function orderMovesStatic(acts, state, side) {
  const scored = [];
  for (const a of acts) {
    let sc = aiActionBias(state, a, side);
    if (a.type === 'play') {
      const c = state.cards[a.card];
      const d = c ? DEFS[c.def] : null;
      if (d) {
        // 表向きは値と中段効果、裏向きは固定値2ぶんの盤面寄与を粗く見積もる
        sc += a.faceUp ? d.value * 6 + aiMiddleValue(d) * 0.25 : 12;
      }
    }
    scored.push({ a, sc, res: undefined });
  }
  scored.sort((a, b) => b.sc - a.sc);
  return scored;
}

/* ordered項目の完全解決を必要になった時点で1度だけ行う(結果はキャッシュ) */
function resolveOrdered(item, state) {
  if (item.res === undefined) item.res = applyAndResolve(state, item.a, smartPicks);
  return item.res;
}

/* --- 難易度に応じたディスパッチ --- */

function aiCardKnownTo(st, uid, side) {
  const c = st.cards[uid];
  if (!c) return false;
  if (c.knownTo !== undefined) return !!(c.knownTo & (1 << side));
  if (c.faceUp || (c.zone && c.zone.indexOf('trash') === 0)) return true;
  return c.zone === 'hand' + side;
}

function aiPublicHash(st, side) {
  const parts = [side, st.turn, st.phase, st.control, st.winner, st.commitSeq || 0];
  for (let p = 0; p < 2; p++) {
    const player = st.players[p];
    parts.push('p', p, player.deck.length, player.hand.length, player.trash.length);
    for (const proto of player.protocols) parts.push(proto.name, proto.compiled ? 1 : 0);
  }
  for (let line = 0; line < 3; line++) for (let p = 0; p < 2; p++) {
    parts.push('l', line, p, st.lines[line][p].length);
    for (const uid of st.lines[line][p]) {
      const c = st.cards[uid];
      parts.push(c.faceUp ? c.def : (aiCardKnownTo(st, uid, side) ? 'k:' + c.def : '?'));
    }
  }
  for (const uid of st.players[side].hand) {
    parts.push(aiCardKnownTo(st, uid, side) ? st.cards[uid].def : '?');
  }
  let h = 2166136261;
  const text = parts.join('|');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function aiUnknownSlotKey(st, uid) {
  const c = st.cards[uid];
  for (let p = 0; p < 2; p++) {
    let i = st.players[p].deck.indexOf(uid);
    if (i >= 0) return '0:deck:' + p + ':' + String(i).padStart(3, '0');
    i = st.players[p].hand.indexOf(uid);
    if (i >= 0) return '1:hand:' + p + ':' + String(i).padStart(3, '0');
  }
  for (let line = 0; line < 3; line++) for (let p = 0; p < 2; p++) {
    const i = st.lines[line][p].indexOf(uid);
    if (i >= 0) return '2:field:' + line + ':' + p + ':' + String(i).padStart(3, '0');
  }
  const ci = (st.commitStack || []).indexOf(uid);
  if (ci >= 0) return '3:commit:' + String(ci).padStart(3, '0');
  return '4:other:' + (c.zone || '');
}

function aiRestoreKnownCards(target, source, side) {
  for (const uid of Object.keys(source.cards)) {
    if (target.cards[uid] && aiCardKnownTo(source, uid, side)) {
      target.cards[uid].def = source.cards[uid].def;
    }
  }
}

/* AIには、本人が知るカードを固定し、未知カードだけを同じ出自のプール内で再配置した状態を渡す。 */
function aiInformationState(state, side, salt) {
  const view = clone(state);
  const baseSeed = aiPublicHash(state, side);
  const seed = salt ? (baseSeed ^ Math.imul(salt, 0x9e3779b1)) >>> 0 : baseSeed;
  const rng = mulberry32(seed);
  const groups = [[], []];

  for (const uid of Object.keys(state.cards)) {
    const c = state.cards[uid];
    const hidden = c.zone && (
      c.zone.indexOf('deck') === 0 || c.zone.indexOf('hand') === 0 ||
      (!c.faceUp && (c.zone === 'field' || c.zone === 'committed'))
    );
    if (!hidden || aiCardKnownTo(state, uid, side)) continue;
    const origin = uid.indexOf('p1:') === 0 ? 1 : 0;
    groups[origin].push(uid);
  }

  const mapping = {};
  for (const group of groups) {
    const slots = group.slice().sort((a, b) => aiUnknownSlotKey(state, a).localeCompare(aiUnknownSlotKey(state, b)));
    const defs = group.map(uid => state.cards[uid].def).sort();
    for (let i = defs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = defs[i]; defs[i] = defs[j]; defs[j] = tmp;
    }
    for (let i = 0; i < slots.length; i++) mapping[slots[i]] = defs[i];
  }

  function applyKnowledge(s) {
    if (!s || !s.cards) return;
    s.seed = seed;
    s.rngN = 0;
    for (const uid of Object.keys(mapping)) if (s.cards[uid]) s.cards[uid].def = mapping[uid];
    if (s.pending && s.pending.base) applyKnowledge(s.pending.base);
  }
  applyKnowledge(view);
  view.__unknownCount = groups[0].length + groups[1].length;
  return view;
}

/* PIMC (Perfect Information Monte Carlo):
   相手の非公開カードの並びを salt 違いで K 通りサンプリングし、
   各世界で探索した最善手の多数決を取る。1つの決定化に過剰適応した
   「読み切ったつもりの手」を避けられる。思考予算は K 等分する */
let AI_PIMC = 1;
function setAiPimc(k) { AI_PIMC = Math.max(1, Math.min(9, k | 0)); }

function aiActionPimc(state) {
  const me = state.turn;
  const baseView = aiInformationState(state, me);
  if (AI_PIMC <= 1 || !baseView.__unknownCount) return aiActionHard(baseView);
  /* 基準世界ではフル予算で深く探索し、僅差の上位候補だけを
     別の決定化で1手評価し直して平均する。深さを犠牲にせず、
     「基準世界の並びにしか通用しない手」を退けられる */
  const collect = [];
  const best = aiActionHard(baseView, collect);
  if (collect.length < 2) return best;
  collect.sort((a, b) => b.val - a.val);
  const top = collect.slice(0, 3).filter(t => t.val > collect[0].val - 60);
  if (top.length < 2) return best;

  const wasTrace = TRACE; TRACE = false;
  try {
    const sums = top.map(t => t.val);
    const counts = top.map(() => 1);
    for (let k = 1; k < AI_PIMC; k++) {
      const view = aiInformationState(state, me, k);
      for (let i = 0; i < top.length; i++) {
        const res = applyAndResolve(view, top[i].a, smartPicks);
        counts[i]++;
        if (!res || res.error || res.requests.length) { sums[i] += -1e6; continue; }
        sums[i] += aiScore(res.state, me) + aiActionBias(view, top[i].a, me)
          + aiTransitionScore(view, res, me);
      }
    }
    let bi = 0;
    for (let i = 1; i < top.length; i++) {
      if (sums[i] / counts[i] > sums[bi] / counts[bi]) bi = i;
    }
    return top[bi].a;
  } finally { TRACE = wasTrace; }
}

function aiAction(state) {
  if (AI_LEVEL >= 2) {
    return aiActionPimc(state);
  }
  const view = aiInformationState(state, state.turn);
  if (AI_LEVEL >= 1) return aiActionNormal(view);
  return aiActionEasy(view);
}

function enumeratePicks(req) {
  switch (req.kind) {
    case 'pickLine': return req.lines.map(l => [l]);
    case 'yesNo': return [['yes'], []];
    case 'option': {
      const o = req.options.map((x, i) => [i]);
      if (req.optional) o.push([]);
      return o;
    }
    case 'arrange':
      return req.exact === 'transposition'
        ? [[1, 0, 2], [0, 2, 1], [2, 1, 0]]
        : [[1, 2, 0], [2, 0, 1], [0, 2, 1], [1, 0, 2], [2, 1, 0]];
    case 'pickCard': case 'pickHand': {
      const min = req.min !== undefined ? req.min : 1;
      const max = Math.min(req.max !== undefined ? req.max : 1, req.candidates.length);
      if (max <= 1) {
        const o = req.candidates.slice(0, 12).map(c => [c]);
        if (min === 0) o.push([]);
        return o;
      }
      const opts = [];
      for (let i = 0; i < 8; i++) opts.push(randomPicks(req));
      if (min === 0) opts.push([]);
      return opts;
    }
  }
  return [randomPicks(req)];
}

function aiAnswer(state, req) {
  const view = aiInformationState(state, req.player);
  const forcedControlWin = aiForcedControlWinPicks(req);
  if (forcedControlWin) return forcedControlWin;
  if (AI_LEVEL >= 1) {
    return smartPicks(view, req);
  }
  const me = req.player;
  const options = enumeratePicks(req);
  if (options.length === 1) return options[0];
  let best = options[0], bestSc = -Infinity;
  for (const picks of options) {
    const sc = avgRolloutScore(view, { type: 'choose', id: req.id, picks }, me) + Math.random();
    if (sc > bestSc) { bestSc = sc; best = picks; }
  }
  return best;
}

/* ---------- 公開 API ---------- */

const Engine = {
  init, newGame, apply, legalActions, setTrace, setAiLevel, setAiThinkBudget, setAiBreadth, setAiPimc, setAiWeights, setAiSpecialist, setAiSpecialistWeights,
  lineTotal, cardValue, compilableLines, canPlay, locate,
  ai: { action: aiAction, answer: aiAnswer, score: aiScore, transitionScore: aiTransitionScore, compilePassChance: aiCompilePassChance, informationState: aiInformationState, randomPicks, smartPicks },
  get defs() { return DEFS; },
  get protos() { return PROTOS; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
global.CompileEngine = Engine;

})(typeof globalThis !== 'undefined' ? globalThis : this);
