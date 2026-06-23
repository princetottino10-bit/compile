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
    if (typeof s.delta === 'number') t += s.delta;
    if (s.deltaPer) {
      let n = 0;
      for (let p = 0; p < 2; p++) for (const uid of st.lines[line][p]) if (!st.cards[uid].faceUp) n++;
      t += n;
    }
  }
  return t;
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
    }
    if (needMatch) {
      const names = [st.players[0].protocols[line].name, st.players[1].protocols[line].name];
      if (names.indexOf(defOf(st, uid).proto) < 0) return false;
    }
  }
  return true;
}

function ignoreMiddleAt(st, line) {
  return activeStatics(st).some(s => s.kind === 'ignoreMiddle' && s.line === line);
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

function eventMatches(on, ev, cardSide) {
  switch (on) {
    case 'afterOppDiscard':    return ev.on === 'discard' && ev.player !== cardSide;
    case 'afterYouDraw':       return ev.on === 'draw' && ev.player === cardSide;
    case 'afterYouDelete':     return ev.on === 'delete' && ev.actor === cardSide;
    case 'afterYouClearCache': return ev.on === 'clearCache' && ev.player === cardSide;
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
        if (eventMatches(tr.on, ev, s)) out.push({ uid, slot });
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
function fireWouldBeCovered(ctx, uid) {
  runWouldBeCovered(ctx, collectWouldBeCovered(ctx, uid));
}
function collectWouldBeCovered(ctx, uid) {
  const c = ctx.st.cards[uid];
  if (!c || !c.faceUp) return [];
  const eff = DEFS[c.def].eff;
  const out = [];
  for (const slot of ['upper', 'lower']) {
    const tr = eff[slot] && eff[slot].trigger;
    if (!tr) continue;
    if (tr.on !== 'wouldBeCovered' && tr.on !== 'wouldBeCoveredOrFlipped') continue;
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

/* スタックからの物理除去 (committed 化)。uncover情報を返す */
function extractCard(ctx, uid) {
  const st = ctx.st;
  const loc = locate(st, uid);
  if (!loc) return null;
  const stack = st.lines[loc.line][loc.side];
  const wasTop = loc.idx === stack.length - 1;
  stack.splice(loc.idx, 1);
  st.cards[uid].zone = 'committed';
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

function landTrash(ctx, uid) {
  const c = ctx.st.cards[uid];
  c.zone = 'trash' + c.owner;
  c.faceUp = true;
  ctx.st.players[c.owner].trash.push(uid);
}
function landHand(ctx, uid) {
  const c = ctx.st.cards[uid];
  c.zone = 'hand' + c.owner;
  ctx.st.players[c.owner].hand.push(uid);
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
  if (!locate(ctx.st, uid)) return false;
  const label = cardLabel(ctx.st, uid);
  const info = extractCard(ctx, uid);
  ctx.st.cards[uid].commitDest = 'hand';
  fireUncover(ctx, info);
  landHand(ctx, uid);
  log(ctx, `${label} を手札に戻す`, uid);
  return true;
}

function doFlip(ctx, uid) {
  const st = ctx.st;
  if (!locate(st, uid)) return false;
  const c = st.cards[uid];
  if (c.faceUp) {
    fireWouldBeFlipped(ctx, uid);                  // METAL_6: 先に自己削除
    if (!locate(st, uid)) return true;             // 反転は消費された扱い
  }
  c.faceUp = !c.faceUp;
  log(ctx, `${DEFS[c.def].id} を${c.faceUp ? '表' : '裏'}に反転`, uid);
  const loc = locate(st, uid);
  if (c.faceUp && loc && isTop(st, loc)) resolveMiddle(ctx, uid, 'flip');
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
  if (dest.length) fireWouldBeCovered(ctx, dest[dest.length - 1]);
  dest.push(uid);
  st.cards[uid].zone = 'field';
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
  c.zone = 'committed';
  c.commitDest = 'line' + line;
  c.faceUp = faceUp;
  const stack = st.lines[line][side];
  if (belowUid) {
    const i = stack.indexOf(belowUid);
    stack.splice(i < 0 ? 0 : i, 0, uid);
  } else {
    const coveredTriggers = stack.length ? collectWouldBeCovered(ctx, stack[stack.length - 1]) : [];
    stack.push(uid);
    c.zone = 'field';
    log(ctx, `P${side + 1}: ${faceUp ? DEFS[c.def].id : 'カード'} をライン${line + 1}に${faceUp ? '表' : '裏'}でプレイ`, uid);
    runWouldBeCovered(ctx, coveredTriggers);
    const loc = locate(st, uid);
    if (st.cards[uid].faceUp && loc && isTop(st, loc)) resolveMiddle(ctx, uid, 'play');
    return;
  }
  c.zone = 'field';
  log(ctx, `P${side + 1}: ${faceUp ? DEFS[c.def].id : 'カード'} をライン${line + 1}に${faceUp ? '表' : '裏'}でプレイ`, uid);
  const loc = locate(st, uid);
  if (st.cards[uid].faceUp && loc && isTop(st, loc)) resolveMiddle(ctx, uid, 'play');
}

function resolveMiddle(ctx, uid, why) {
  const st = ctx.st;
  const loc = locate(st, uid);
  if (!loc) return;
  if (ignoreMiddleAt(st, loc.line)) { log(ctx, `${defOf(st, uid).id} の中段は無視された`); return; }
  const eff = DEFS[st.cards[uid].def].eff;
  if (!eff.middle) return;
  if (ctx.depth > 80) throw { __err: '解決の深さ上限を超過 (無限ループの疑い)' };
  ctx.depth++;
  try {
    log(ctx, `[${defOf(st, uid).id}] 中段コマンド解決 (${why})`, uid);
    const fr = { source: uid, slot: 'middle', controller: loc.side, line: loc.line, bind: {}, done: false };
    execOps(ctx, fr, eff.middle.ops);
  } finally { ctx.depth--; }
}

/* ---------- ドロー / 捨て札 ---------- */

function drawCards(ctx, side, n, fromOpp) {
  const st = ctx.st;
  const src = fromOpp ? 1 - side : side;
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const d = st.players[src];
    if (!d.deck.length && d.trash.length) {
      d.deck = d.trash; d.trash = [];
      for (const u of d.deck) { st.cards[u].zone = 'deck' + src; st.cards[u].faceUp = false; }
      shuffle(st, d.deck);
      log(ctx, `P${src + 1}: トラッシュをシャッフルしてデッキを再構成`);
    }
    if (!d.deck.length) break;
    const u = d.deck.shift();
    const c = st.cards[u];
    c.zone = 'hand' + side;
    if (fromOpp) c.owner = side;
    st.players[side].hand.push(u);
    drawn++;
  }
  if (drawn) {
    log(ctx, `P${side + 1}: ${drawn}枚ドロー${fromOpp ? '(相手のデッキから)' : ''}`);
    fireEvent(ctx, { on: 'draw', player: side, count: drawn });
  }
  return drawn;
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
    st.cards[u].zone = 'committed';
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

function useControlBenefit(ctx, side) {
  const st = ctx.st;
  if (!st.useControl || st.control !== side) return;
  st.control = -1;
  log(ctx, `P${side + 1}: コントロールを消費`);
  const ans = choose(ctx, {
    kind: 'option', player: side, optional: false, prompt: 'control-rearrange',
    options: ['自分のプロトコルを並べ替える', '相手のプロトコルを並べ替える', '並べ替えない']
  });
  if (ans[0] === 0) doRearrange(ctx, side, side);
  else if (ans[0] === 1) doRearrange(ctx, side, 1 - side);
}

function doRearrange(ctx, chooser, target, exact) {
  const st = ctx.st;
  const cur = st.players[target].protocols;
  const ans = choose(ctx, {
    kind: 'arrange', player: chooser, target, exact: exact || undefined,
    current: cur.map(p => p.name), prompt: 'rearrange'
  });
  st.players[target].protocols = ans.map(i => cur[i]);
  log(ctx, `P${target + 1} のプロトコルを並べ替え: ` + st.players[target].protocols.map(p => p.name).join('/'));
}

function doRefresh(ctx, side) {
  const st = ctx.st;
  if (st.players[side].hand.length >= 5) return false;
  useControlBenefit(ctx, side);
  drawCards(ctx, side, 5 - st.players[side].hand.length);
  log(ctx, `P${side + 1}: リフレッシュ`);
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
  useControlBenefit(ctx, side);
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
        if (dstack.length) fireWouldBeCovered(ctx, dstack[dstack.length - 1]);
        dstack.push(uid);
        log(ctx, `${DEFS[c.def].id} は削除の代わりにライン${ans[0] + 1}へ移動`);
      }
    }
  }
  // 全カード同時削除 (トリガーなし)
  const removed = [];
  for (let s = 0; s < 2; s++) {
    for (const uid of st.lines[line][s]) { st.cards[uid].zone = 'committed'; st.cards[uid].commitDest = 'trash'; removed.push(uid); }
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
      else if (typeof op.count === 'object') { min = op.count.min; max = op.count.max === 'any' ? 99 : op.count.max; }
      else { min = max = op.count; }
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
      if (loc) {
        if (op.cond === 'thisCovered') ok = !isTop(st, loc);
        if (op.cond === 'thisCovers') ok = loc.idx > 0;
      }
      if (ok) execOps(ctx, fr, op.ops);
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
      if (n > 0) drawCards(ctx, fr.controller, n);
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
  if (sel.value && typeof sel.value === 'object') {
    const v = cardValue(st, uid);
    if (sel.value.in && sel.value.in.indexOf(v) < 0) return false;
    if (sel.value.eq !== undefined && v !== sel.value.eq) return false;
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
    case 'flip':   return doFlip(ctx, uid);
    case 'delete': return doDelete(ctx, uid, fr.controller);
    case 'return': return doReturn(ctx, uid);
    case 'reveal': {
      const c = st.cards[uid];
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
      if (dstack.length) fireWouldBeCovered(ctx, dstack[dstack.length - 1]);
      for (const u of moving) st.lines[dest][s].push(u);
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
  } // dest 未指定 (SPEED_1) は通常プレイ → カード選択後にライン選択

  if (source === 'topDeck') {
    const deck = st.players[who].deck;
    if (!deck.length) { fr.done = false; return; }   // デッキ0枚: リシャッフルしない (ルール仕様 §5.2)
    const uid = deck[0];
    let l = line;
    if (l === null || l === undefined) {
      if (typeof destChoices !== 'undefined') {
        l = destChoices.length === 1 ? destChoices[0]
          : choose(ctx, { kind: 'pickLine', player: who, lines: destChoices, prompt: 'play-dest', context: defOf(st, fr.source).id })[0];
      } else l = fr.line;
    }
    const faceUp = op.facing === 'up';
    if (!canPlay(st, who, uid, l, faceUp)) { fr.done = false; return; }
    deck.shift();
    playToField(ctx, uid, l, who, faceUp, op.dest === 'underThisCard' ? fr.source : undefined);
    fr.done = true;
    return;
  }

  // source: hand
  const hand = st.players[who].hand;
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
  const opts = [];
  for (const u of hand) for (let l = 0; l < 3; l++) {
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

function legalActions(st) {
  if (st.winner !== null || st.phase !== 'action') return [];
  const p = st.turn;
  const out = [];
  for (const uid of st.players[p].hand) {
    for (let l = 0; l < 3; l++) {
      if (canPlay(st, p, uid, l, true)) out.push({ type: 'play', card: uid, line: l, faceUp: true });
      if (canPlay(st, p, uid, l, false)) out.push({ type: 'play', card: uid, line: l, faceUp: false });
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
    if (!canPlay(st, p, action.card, action.line, action.faceUp)) throw { __err: 'そのプレイは許可されていない' };
    playToField(ctx, action.card, action.line, p, !!action.faceUp);
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
        st.cards[uid] = { uid, def: defId, owner: p, faceUp: false, zone: 'deck' + p };
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
    }
  }
  return runReplay(st, { type: '_begin' }, []);
}

/* ---------- AI ---------- */

let AI_LEVEL = 1; // 0=easy, 1=normal, 2=hard
function setAiLevel(v) { AI_LEVEL = Math.max(0, Math.min(2, v | 0)); }

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

function aiActionBias(st, action, side) {
  if (!action) return 0;
  const op = 1 - side;
  if (action.type === 'refresh') {
    let v = (5 - st.players[side].hand.length) * 13;
    if (st.control === side) v += aiControlLeverage(st, side) * 0.35;
    return v;
  }
  if (action.type !== 'play') return 0;
  const c = st.cards[action.card], d = DEFS[c.def];
  const mine = lineTotal(st, action.line, side), theirs = lineTotal(st, action.line, op);
  const gap = Math.max(0, 10 - mine);
  let v = 0;
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

function aiScore(st, me) {
  if (st.winner === me) return 1e9;
  if (st.winner === 1 - me) return -1e9;
  const op = 1 - me;
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

  if (st.useControl) {
    let myWins = aiLineLeadCount(st, me), opWins = aiLineLeadCount(st, op);

    if (st.control === me) {
      sc += 55 + aiControlLeverage(st, me) * 0.7;
      if (myComp >= 1) sc += 15;
      if (myComp >= 2) sc += 45;
    } else if (st.control === op) {
      sc -= 65 + aiControlLeverage(st, op) * 0.75;
      if (opComp >= 1) sc -= 15;
      if (opComp >= 2) sc -= 50;
    }

    if (myWins >= 2 && st.control !== me) sc += 42;
    if (opWins >= 2 && st.control !== op) sc -= 52;
    if (myWins >= 2) sc += 18;
    if (opWins >= 2) sc -= 24;
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

function aiChoiceScore(st, req, picks, me) {
  const res = apply(st, { type: 'choose', id: req.id, picks });
  if (!res || res.error) return -1e8;
  const out = res.requests && res.requests.length ? resolveRequests(res.state, smartPicks, 8) : res;
  if (!out || out.error || (out.requests && out.requests.length)) return -1e8;
  return aiScore(out.state, me);
}

function smartPicks(st, req) {
  const me = req.player;
  const op = 1 - me;
  switch (req.kind) {
    case 'pickCard': {
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
        }
        s += (c.zone ? cardValue(st, uid) : DEFS[c.def].value) * 2;
        return { uid, s };
      });
      scored.sort((a, b) => b.s - a.s);
      const min = req.min !== undefined ? req.min : 1;
      const max = Math.min(req.max !== undefined ? req.max : 1, scored.length);
      if (min === 0 && (!scored.length || scored[0].s < 8)) return [];
      return scored.slice(0, Math.max(min, Math.min(max, 1))).map(x => x.uid);
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
      if (min === 0 && (!scored.length || scored[0].s > 8)) return [];
      return scored.slice(0, Math.max(min, 1)).map(x => x.uid);
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
      return [bestLine];
    }
    case 'option': {
      if (req.options.length <= 1) return [0];
      let bestIdx = 0, bestSc = -Infinity;
      for (let i = 0; i < req.options.length; i++) {
        const s = aiChoiceScore(st, req, [i], me);
        if (s > bestSc) { bestSc = s; bestIdx = i; }
      }
      return [bestIdx];
    }
    case 'yesNo': {
      const yS = aiChoiceScore(st, req, ['yes'], me);
      const nS = aiChoiceScore(st, req, [], me);
      return yS >= nS ? ['yes'] : [];
    }
    case 'arrange': {
      const perms = req.exact === 'transposition'
        ? [[1, 0, 2], [0, 2, 1], [2, 1, 0]]
        : [[1, 2, 0], [2, 0, 1], [0, 2, 1], [1, 0, 2], [2, 1, 0]];
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

function resolveRequests(state, pickFn, limit) {
  let res = { state, requests: [], error: null, log: [] };
  if (state.pending) {
    res = apply(state, { type: '_begin' });
    if (!res || res.error) return res;
  }
  let guard = 0;
  while (res && !res.error && res.requests.length && guard++ < (limit || 30)) {
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
    return resolveRequests(res.state, pickFn, 30);
  } finally { TRACE = wasTrace; }
}

/* --- Easy AI (旧ロジック: 1-ply random rollout) --- */

const AI_ROLLOUT_SAMPLES = 6;

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
  const acts = legalActions(state);
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
  const acts = legalActions(state);
  if (!acts.length) return null;
  if (acts.length === 1) return acts[0];
  let best = null, bestSc = -Infinity;
  for (const a of acts) {
    const res = applyAndResolve(state, a, smartPicks);
    const sc = (!res || res.error || res.requests.length)
      ? -1e8 : aiScore(res.state, me) + aiActionBias(state, a, me);
    if (sc + Math.random() * 0.5 > bestSc) { bestSc = sc; best = a; }
  }
  return best;
}

/* --- Hard AI (2-ply minimax + alpha-beta) --- */

function aiActionHard(state) {
  const me = state.turn;
  const acts = legalActions(state);
  if (!acts.length) return null;
  if (acts.length === 1) return acts[0];

  const wasTrace = TRACE; TRACE = false;
  try {
    const deadline = aiNow() + 600;
    const ordered = orderMoves(acts, state, me);
    const limit = Math.min(ordered.length, 24);
    let alpha = -Infinity, best = ordered[0].a;
    for (let i = 0; i < limit; i++) {
      if (aiNow() > deadline) break;
      const a = ordered[i].a;
      const res = applyAndResolve(state, a, smartPicks);
      if (!res || res.error || res.requests.length) continue;
      const s1 = res.state;
      let val;
      if (s1.winner !== null || s1.phase === 'finished' || s1.turn === me) {
        val = aiScore(s1, me);
      } else {
        val = minimaxMin(s1, me, alpha, Infinity, deadline);
      }
      val += aiActionBias(state, a, me);
      if (val > alpha) { alpha = val; best = a; }
    }
    return best;
  } finally { TRACE = wasTrace; }
}

function minimaxMin(state, me, alpha, beta, deadline) {
  if (state.turn === me || state.winner !== null) return aiScore(state, me);
  const op = 1 - me;
  const acts = legalActions(state);
  if (!acts.length) return aiScore(state, me);
  const ordered = orderMoves(acts, state, op);
  const limit = Math.min(ordered.length, 12);
  let val = Infinity;
  for (let i = 0; i < limit; i++) {
    if (deadline && aiNow() > deadline) break;
    const res = applyAndResolve(state, ordered[i].a, smartPicks);
    if (!res || res.error || res.requests.length) continue;
    const sc = aiScore(res.state, me);
    if (sc < val) val = sc;
    if (val <= alpha) return val;
    if (val < beta) beta = val;
  }
  return val === Infinity ? aiScore(state, me) : val;
}

function orderMoves(acts, state, side) {
  const scored = acts.map(a => {
    const res = applyAndResolve(state, a, smartPicks);
    const sc = (!res || res.error) ? -1e8 : aiScore(res.state, side) + aiActionBias(state, a, side);
    return { a, sc };
  });
  scored.sort((a, b) => b.sc - a.sc);
  return scored;
}

/* --- 難易度に応じたディスパッチ --- */

function aiAction(state) {
  if (AI_LEVEL >= 2) return aiActionHard(state);
  if (AI_LEVEL >= 1) return aiActionNormal(state);
  return aiActionEasy(state);
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
  if (AI_LEVEL >= 1) {
    return smartPicks(state, req);
  }
  const me = req.player;
  const options = enumeratePicks(req);
  if (options.length === 1) return options[0];
  let best = options[0], bestSc = -Infinity;
  for (const picks of options) {
    const sc = avgRolloutScore(state, { type: 'choose', id: req.id, picks }, me) + Math.random();
    if (sc > bestSc) { bestSc = sc; best = picks; }
  }
  return best;
}

/* ---------- 公開 API ---------- */

const Engine = {
  init, newGame, apply, legalActions, setTrace, setAiLevel,
  lineTotal, cardValue, compilableLines, canPlay, locate,
  ai: { action: aiAction, answer: aiAnswer, score: aiScore, randomPicks, smartPicks },
  get defs() { return DEFS; },
  get protos() { return PROTOS; }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
global.CompileEngine = Engine;

})(typeof globalThis !== 'undefined' ? globalThis : this);
