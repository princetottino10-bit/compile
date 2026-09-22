/* =========================================================================
 * 問題 (トレーニングの盤面を共有して解いてもらう)
 *   盤面・課題・クリア条件を URL (?puzzle=...) に詰める。開いた人は、
 *   その盤面の自分の手番から始め、手番を終えた時点でクリア条件を判定する。
 *   カードは「プロトコルの番号 (0-2) + 値の番号 (1-6)」の2文字で書き、URL を短くする。
 * ========================================================================= */

/* クリア条件。判定は手番を終えた時点 (相手の開始フェイズより前) の盤面で行う */
export const PUZZLE_GOALS = {
  ready: '次のターンにコンパイルできる状態にする',
  block: '相手が次のターンにコンパイルできない状態にする',
  win: '勝利する',
  none: '判定しない (自由に考える)'
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function toB64url(text) {
  const bin = unescape(encodeURIComponent(text));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4))));
}

/* いまの盤面 (エンジンの state) を問題のコードにする */
export function encodePuzzle(st, task, goal) {
  const side = (p) => {
    const protos = st.players[p].protocols.map(x => x.name);
    const code = (uid) => {
      const d = st.cards[uid].def;
      const i = d.lastIndexOf('_');
      return protos.indexOf(d.slice(0, i)) + d.slice(i + 1);
    };
    return {
      p: protos,
      c: st.players[p].protocols.map(x => (x.compiled ? 1 : 0)).join(''),
      l: [0, 1, 2].map(l => st.lines[l][p].map(u => code(u) + (st.cards[u].faceUp ? 'u' : 'd')).join('')),
      h: st.players[p].hand.map(code).join(''),
      t: st.players[p].trash.map(code).join(''),
      d: st.players[p].deck.map(code).join('')
    };
  };
  return toB64url(JSON.stringify({ v: 1, s: [side(0), side(1)], q: String(task || '').slice(0, 200), g: goal }));
}

/* 問題のコードを、エンジンの newPuzzle に渡す形へ戻す。壊れていれば null */
export function decodePuzzle(code) {
  try {
    const o = JSON.parse(fromB64url(code));
    if (!o || o.v !== 1 || !Array.isArray(o.s) || o.s.length !== 2) return null;
    const sides = o.s.map((sd) => {
      const def = (tok) => sd.p[+tok[0]] + '_' + tok[1];
      const pairs = (str) => (String(str || '').match(/../g) || []).map(def);
      return {
        protos: sd.p,
        compiled: String(sd.c || '000').split('').map(x => x === '1'),
        lines: (sd.l || ['', '', '']).map(str => (String(str).match(/...?/g) || [])
          .filter(t => t.length === 3).map(t => [def(t.slice(0, 2)), t[2] === 'u'])),
        hand: pairs(sd.h), trash: pairs(sd.t), deck: pairs(sd.d)
      };
    });
    return { spec: { sides }, task: String(o.q || ''), goal: PUZZLE_GOALS[o.g] ? o.g : 'none' };
  } catch (e) {
    return null;
  }
}

/* 手番を終えた時点の盤面: 途中経過 (trace) で相手の手番に移った最初の盤面。
   trace の各盤面はその出来事の直前のものなので、自分の手番中の最後の記録では
   最後に置いたカードがまだ入っていない。移っていなければ (決着など) いまの盤面 */
export function endOfTurnState(trace, me, fallback) {
  for (const t of (trace || [])) if (t.st && t.st.turn !== me) return t.st;
  return fallback;
}

export function puzzleUrl(code) {
  return location.origin + location.pathname + '?puzzle=' + code;
}

/* クリア条件の判定。endSt = 手番を終えた時点の盤面、finalSt = いまの盤面。
   total(st, line, side) はラインの合計値。戻り値 { ok: true|false|null, text } */
export function judgePuzzle(goal, endSt, finalSt, me, total) {
  const op = 1 - me;
  const canCompile = (st, side) => [0, 1, 2].filter(l => !st.players[side].protocols[l].compiled
    && total(st, l, side) >= 10 && total(st, l, side) > total(st, l, 1 - side));
  if (finalSt.winner === me) return { ok: goal !== 'none' ? true : null, text: '勝利しました' };
  if (finalSt.winner === op) return { ok: goal === 'none' ? null : false, text: '相手が勝利しました' };
  if (goal === 'ready') {
    const lines = canCompile(endSt, me);
    return lines.length
      ? { ok: true, text: endSt.players[me].protocols[lines[0]].name + ' をコンパイルできる状態です' }
      : { ok: false, text: 'コンパイルできる (10以上で相手より大きい) ラインがありません' };
  }
  if (goal === 'block') {
    const lines = canCompile(endSt, op);
    return lines.length
      ? { ok: false, text: '相手は次のターンに ' + endSt.players[op].protocols[lines[0]].name + ' をコンパイルできます' }
      : { ok: true, text: '相手がコンパイルできるラインはありません' };
  }
  if (goal === 'win') return { ok: false, text: 'この手番では勝利できませんでした' };
  return { ok: null, text: '手番を終えました' };
}

/* 小さなダイアログの土台。外側に触れる・× で閉じる */
function overlay(id, html) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="pz-card" role="dialog" aria-modal="true">' + html + '</div>';
  el.classList.add('show');
  const close = () => el.classList.remove('show');
  el.onclick = (ev) => { if (ev.target === el) close(); };
  const x = el.querySelector('.pz-x');
  if (x) x.onclick = close;
  return { el, close };
}

/* 「問題として共有」: 課題とクリア条件を入れて、リンクを作る */
export function openShareDialog(makeCode) {
  const { el } = overlay('puzzleShare',
    '<div class="pz-head"><b>問題として共有</b><button type="button" class="pz-x" aria-label="閉じる">×</button></div>' +
    '<label class="pz-field"><span>課題</span>' +
      '<textarea id="pzTask" maxlength="200" rows="3" placeholder="例: このターンで FIRE をコンパイルできる状態にしよう"></textarea></label>' +
    '<label class="pz-field"><span>クリア条件</span><select id="pzGoal">' +
      Object.keys(PUZZLE_GOALS).map(k => '<option value="' + k + '">' + PUZZLE_GOALS[k] + '</option>').join('') +
    '</select></label>' +
    '<p class="pz-note">いまの盤面 (手札・山札の順番も含む) から、自分の手番として始まります。手番を終えた時点で判定します。</p>' +
    '<button type="button" class="pz-main" id="pzMake">リンクを作る</button>' +
    '<div class="pz-out" id="pzOut" hidden>' +
      '<input id="pzUrl" readonly aria-label="問題のリンク">' +
      '<div class="pz-row"><button type="button" id="pzCopy">コピー</button>' +
      (navigator.share ? '<button type="button" id="pzSend">共有…</button>' : '') +
      '<a id="pzOpen" target="_blank" rel="noopener">開いて試す</a></div>' +
    '</div>');
  const task = el.querySelector('#pzTask');
  task.focus();
  el.querySelector('#pzMake').onclick = () => {
    const url = puzzleUrl(makeCode(task.value.trim(), el.querySelector('#pzGoal').value));
    const out = el.querySelector('#pzOut');
    out.hidden = false;
    const input = el.querySelector('#pzUrl');
    input.value = url;
    input.select();
    el.querySelector('#pzOpen').href = url;
    el.querySelector('#pzCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(url); el.querySelector('#pzCopy').textContent = 'コピーしました'; }
      catch (e) { input.select(); document.execCommand && document.execCommand('copy'); }
    };
    const send = el.querySelector('#pzSend');
    if (send) send.onclick = () => navigator.share({ title: 'COMPILE の問題', text: task.value.trim() || 'COMPILE の問題', url }).catch(() => {});
  };
}

/* 問題を解いている間、上に課題とクリア条件を出す */
export function showPuzzleBar(puzzle, onRetry) {
  let el = document.getElementById('puzzleBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'puzzleBar';
    document.body.appendChild(el);
  }
  el.innerHTML = '<span class="pz-tag">問題</span>' +
    '<div class="pz-text"><b>' + esc(puzzle.task || 'この盤面をどう動かす？') + '</b>' +
      '<small>クリア条件: ' + esc(PUZZLE_GOALS[puzzle.goal]) + '</small></div>' +
    '<button type="button" id="pzRetry">やり直す</button>';
  el.querySelector('#pzRetry').onclick = onRetry;
}

/* 判定の結果 */
export function showPuzzleResult(result, onRetry) {
  const tone = result.ok === true ? 'ok' : result.ok === false ? 'ng' : 'free';
  const title = result.ok === true ? '正解！' : result.ok === false ? '不正解' : '手番を終えました';
  const { el, close } = overlay('puzzleResult',
    '<div class="pz-result ' + tone + '"><b>' + title + '</b><p>' + esc(result.text) + '</p></div>' +
    '<div class="pz-row"><button type="button" class="pz-main" id="pzAgain">もう一度</button>' +
    '<button type="button" id="pzLook">盤面を見る</button></div>');
  el.querySelector('#pzAgain').onclick = onRetry;
  el.querySelector('#pzLook').onclick = close;
}
