/* =========================================================================
 * 3Dビュー: DOM 側の HUD (3D の上に薄く重ねる情報レイヤ)
 *   盤面そのものは 3D が担当し、ここは数値・ログ・選択ダイアログだけを持つ。
 * ========================================================================= */

import { reqText, optionLabel } from './prompts.js';
import { svgIcon } from './icons.js';

const $ = (sel) => document.querySelector(sel);

export function toast(msg, ms) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms || 1900);
}

export function setPrompt(text, tone) {
  const el = $('#prompt');
  if (!el) return;
  el.textContent = text || '';
  el.dataset.tone = tone || 'idle';
  el.classList.toggle('hidden', !text);
}

export function setTurnBadge(text, isMine) {
  const el = $('#turnBadge');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('mine', !!isMine);
}

/* ライン別の合計値表示。
   勝利条件は「3プロトコルすべてをコンパイル」なので、
   どのラインが済んでいるかを最優先で読ませる。 */
export function renderLines(rows) {
  const el = $('#lines');
  if (!el) return;
  const cell = (proto, total, done, who) => (
    '<div class="lane-' + who + (done ? ' done' : '') + '">' +
      '<span class="lane-proto">' + (done ? '<i class="chk">✓</i>' : '') + proto + '</span>' +
      '<b>' + total + '</b>' +
    '</div>'
  );
  el.innerHTML = rows.map((r) => (
    '<div class="lane' + (r.compiledMe ? ' done-me' : '') + (r.compiledOpp ? ' done-opp' : '') + '">' +
      cell(r.oppProto, r.oppTotal, r.compiledOpp, 'opp') +
      '<div class="lane-bar"><i style="width:' + Math.min(100, r.meTotal / 10 * 100) + '%"></i>' +
        '<u style="width:' + Math.min(100, r.oppTotal / 10 * 100) + '%"></u></div>' +
      cell(r.meProto, r.meTotal, r.compiledMe, 'me') +
    '</div>'
  )).join('');
}

/* コンパイル進捗 (●●○) */
export function renderProgress(mineDone, oppDone) {
  const set = (id, n) => {
    const e = $(id);
    if (!e) return;
    e.innerHTML = [0, 1, 2].map(i => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('');
  };
  set('#meProgress', mineDone);
  set('#oppProgress', oppDone);
}

export function setCounts(me, opp) {
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  set('#meDeck', me.deck); set('#meTrash', me.trash); set('#meHand', me.hand);
  set('#oppDeck', opp.deck); set('#oppTrash', opp.trash); set('#oppHand', opp.hand);
}

export function pushLog(lines) {
  const el = $('#log');
  if (!el || !lines || !lines.length) return;
  for (const l of lines) {
    const div = document.createElement('div');
    div.className = 'log-row';
    div.textContent = typeof l === 'string' ? l : (l.msg || JSON.stringify(l));
    el.appendChild(div);
  }
  while (el.children.length > 60) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

/* -------------------------------------------------------------------------
 * 選択ダイアログ: engine の request を人間に聞く
 *   resolve には picks 配列を渡す。
 * ------------------------------------------------------------------------- */
let activeModalFinish = null;

/* 外部要因 (オンラインの状態更新等) で表示中のモーダルを破棄する */
export function cancelChoice(val) {
  if (activeModalFinish) activeModalFinish(val);
}

export function askChoice(req, ctx) {
  const wrap = $('#modal');
  const body = $('#modalBody');
  const title = $('#modalTitle');
  const peek = $('#modalPeek');
  if (peek) peek.onclick = () => wrap.classList.toggle('peek');
  wrap.classList.remove('peek');
  return new Promise((resolve) => {
    const finish = (picks) => {
      activeModalFinish = null;
      wrap.classList.remove('show');
      wrap.classList.remove('peek');
      body.innerHTML = '';
      resolve(picks);
    };
    activeModalFinish = finish;

    title.textContent = reqText(req, ctx.cardName) || labelOf(req.kind);
    body.innerHTML = '';

    const addBtn = (label, onClick, cls) => {
      const b = document.createElement('button');
      b.className = 'mchoice' + (cls ? ' ' + cls : '');
      b.innerHTML = label;
      b.onclick = () => onClick();
      body.appendChild(b);
      return b;
    };

    if (req.kind === 'yesNo') {
      addBtn('はい', () => finish(['yes']), 'yes');
      addBtn('いいえ', () => finish([]));
    } else if (req.kind === 'pickLine') {
      for (const l of req.lines) addBtn('ライン ' + (l + 1) + ' <small>' + (ctx.lineLabel ? ctx.lineLabel(l) : '') + '</small>', () => finish([l]));
    } else if (req.kind === 'option') {
      req.options.forEach((o, i) => addBtn(optionLabel(o), () => finish([i])));
      if (req.optional) addBtn('何もしない', () => finish([]));
    } else if (req.kind === 'arrange') {
      /* 現在の並びのまま (恒等順列) はルール上選べないので出さない */
      const perms = req.exact === 'transposition'
        ? [[1, 0, 2], [0, 2, 1], [2, 1, 0]]
        : [[1, 2, 0], [2, 0, 1], [0, 2, 1], [1, 0, 2], [2, 1, 0]];
      for (const p of perms) {
        addBtn(p.map(i => (ctx.protoName ? ctx.protoName(i) : i + 1)).join(' → '), () => finish(p));
      }
      addBtn('盤面で選ぶに戻る', () => finish('__board__'));
    } else {
      /* pickCard / pickHand: 候補をカード名で並べる */
      const min = req.min === undefined ? 1 : req.min;
      const max = req.max === undefined ? 1 : req.max;
      const chosen = [];
      const rerender = () => {
        body.innerHTML = '';
        for (const uid of req.candidates) {
          const on = chosen.includes(uid);
          const b = addBtn(ctx.cardLabel ? ctx.cardLabel(uid) : uid, () => {
            const i = chosen.indexOf(uid);
            if (i >= 0) chosen.splice(i, 1);
            else if (chosen.length < max) chosen.push(uid);
            if (max === 1 && chosen.length === 1) { finish(chosen.slice()); return; }
            rerender();
          }, on ? 'on' : '');
          if (ctx.onHoverCandidate) {
            b.onmouseenter = () => ctx.onHoverCandidate(uid, true);
            b.onmouseleave = () => ctx.onHoverCandidate(uid, false);
          }
        }
        if (max > 1 || min === 0) {
          const ok = addBtn('決定 (' + chosen.length + '/' + max + ')', () => {
            if (chosen.length >= min) finish(chosen.slice());
          }, 'yes');
          if (chosen.length < min) ok.disabled = true;
        }
        if (min === 0) addBtn('選ばない', () => finish([]));
      };
      rerender();
    }

    wrap.classList.add('show');
  });
}

/* -------------------------------------------------------------------------
 * コンパイルのカットイン
 *   CSS アニメーションで一気に見せる。終わるまで待てるよう Promise を返す。
 * ------------------------------------------------------------------------- */
export function compileCutIn(info) {
  const el = $('#compileCut');
  if (!el) return Promise.resolve();
  const accent = info.color || '#63f3ff';
  el.style.setProperty('--accent', accent);
  el.innerHTML =
    '<div class="cc-veil"></div>' +
    (info.art ? '<div class="cc-art" style="background-image:url(&quot;' + info.art + '&quot;)"></div>' : '') +
    (info.emblem ? '<img class="cc-emblem" alt="" src="' + info.emblem + '">' : '') +
    '<div class="cc-slash"></div><div class="cc-slash thin"></div>' +
    '<div class="cc-body">' +
      '<div class="cc-kicker">PROTOCOL COMPILED</div>' +
      '<div class="cc-name">' + info.name + '</div>' +
      '<div class="cc-sub">' + (info.remaining > 0 ? 'あと ' + info.remaining + ' プロトコル' : 'ALL PROTOCOLS COMPILED') + '</div>' +
      '<div class="cc-owner">' + (info.mine ? 'YOU' : 'OPPONENT') + '</div>' +
    '</div>' +
    '<div class="cc-scan"></div>';
  el.classList.add('show');

  return new Promise((resolve) => {
    setTimeout(() => {
      el.classList.remove('show');
      el.innerHTML = '';
      resolve();
    }, 2200);
  });
}

/* ターン開始のバナー */
export function turnCutIn(mine) {
  const el = $('#turnCut');
  if (!el) return Promise.resolve();
  el.style.setProperty('--accent', mine ? '#6dffc2' : '#ff3b9d');
  el.style.setProperty('--from', mine ? 'left' : 'right');
  el.innerHTML =
    '<div class="tc-band"></div>' +
    '<div class="tc-line a"></div><div class="tc-line b"></div>' +
    '<div class="tc-text">' + (mine ? 'YOUR TURN' : 'OPPONENT') + '</div>' +
    '<div class="tc-sub">' + (mine ? 'COMMAND READY' : 'STAND BY') + '</div>';
  el.classList.add('show');
  return new Promise((resolve) => setTimeout(() => {
    el.classList.remove('show');
    el.innerHTML = '';
    resolve();
  }, 1250));
}

/* 効果発動の帯 (カード名 + 効果テキスト) */
let fxTimer = null;
/* マスターデュエル風の発動カットイン:
   発動したカードが金色のオーラをまとって迫り出し、
   発動した段のテキストが光る。連続発動は内容を差し替える */
let cutTimer = null;
export function showActivation(o) {
  let el = $('#fxCut');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fxCut';
    document.body.appendChild(el);
  }
  const accent = o.color || '#efd06c';
  el.style.setProperty('--accent', accent);
  const chip = o.zone && ZONE_CHIP[o.zone] ? ZONE_CHIP[o.zone][0] : '◆ 効果';
  el.innerHTML =
    '<div class="fc-card"><img alt="" src="' + o.img + '"></div>' +
    '<div class="fc-text"><span class="fc-zone">' + chip + '</span>' +
      '<span class="fc-body">' + (o.text || '') + '</span></div>';
  /* 付け直してポップインを毎回再生する */
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(cutTimer);
  cutTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

const ZONE_CHIP = {
  upper: ['▲ 上段・常在', 'rgba(150,200,255,.95)'],
  middle: ['◆ 中段・即時', null],
  lower: ['▼ 下段・補助', 'rgba(190,206,222,.95)']
};

export function showEffect(name, text, color, effectTypes, zone) {
  const el = $('#fxBanner');
  if (!el) return;
  if (!name) { el.classList.remove('show'); return; }
  const accent = color || '#63f3ff';
  el.style.setProperty('--accent', accent);
  const icons = (effectTypes || []).slice(0, 3).map(t => svgIcon(t, accent, 15)).join('');
  const chip = zone && ZONE_CHIP[zone]
    ? '<span class="fx-zone" style="' + (ZONE_CHIP[zone][1] ? 'color:' + ZONE_CHIP[zone][1] : '') + '">'
      + ZONE_CHIP[zone][0] + '</span>'
    : '';
  el.innerHTML = '<span class="fx-name">' + (icons ? icons + ' ' : '') + name + '</span>' + chip +
    '<span class="fx-text">' + (text || '') + '</span>';
  el.classList.add('show');
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => el.classList.remove('show'), 3400);
}

/* 手札公開の帯: 公開されたカードを並べて見せる (タップか6秒で閉じる) */
export function showRevealedHand(items) {
  if (!items || !items.length) return;
  let el = $('#revealOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'revealOv';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="rv-title">相手の手札が公開された</div>' +
    '<div class="rv-cards">' + items.map((it) =>
      '<figure><img alt="" src="' + it.img + '"><figcaption>' + it.label + '</figcaption></figure>'
    ).join('') + '</div><div class="rv-hint">タップで閉じる</div>';
  el.classList.add('show');
  const close = () => el.classList.remove('show');
  el.onclick = close;
  clearTimeout(el._t);
  el._t = setTimeout(close, 6000);
}

/* 決着のカットイン */
export function resultCutIn(win) {
  const el = $('#resultCut');
  if (!el) return Promise.resolve();
  el.style.setProperty('--accent', win ? '#6dffc2' : '#ff3b9d');
  el.innerHTML =
    '<div class="rc-veil"></div>' +
    '<div class="rc-rays"></div>' +
    '<div class="rc-body">' +
      '<div class="rc-title">' + (win ? 'VICTORY' : 'DEFEAT') + '</div>' +
      '<div class="rc-rule"></div>' +
      '<div class="rc-sub">' + (win ? 'ALL PROTOCOLS COMPILED' : 'SYSTEM OVERWRITTEN') + '</div>' +
    '</div>';
  el.classList.add('show');
  return new Promise((resolve) => setTimeout(() => {
    el.classList.remove('show');
    el.innerHTML = '';
    resolve();
  }, 3600));
}

function labelOf(kind) {
  return {
    pickCard: 'カードを選ぶ', pickHand: '手札を選ぶ', pickLine: 'ラインを選ぶ',
    yesNo: '確認', option: '効果を選ぶ', arrange: '並び順を決める'
  }[kind] || '選択';
}
