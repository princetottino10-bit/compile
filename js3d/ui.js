/* =========================================================================
 * 3Dビュー: DOM 側の HUD (3D の上に薄く重ねる情報レイヤ)
 *   盤面そのものは 3D が担当し、ここは数値・ログ・選択ダイアログだけを持つ。
 * ========================================================================= */

import { selectHead, bindSelectHead, optionBody, choiceLabel } from './selectui.js';
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

/* ログの整形。カード名を実際の表記へ直し、触れるようにする。
   main.js が defIndex と座席を知っているので、そちらから差し込む。 */
let logFormatter = null;
let logCardTap = null;
export function bindLogFormatter(format, onCardTap) {
  logFormatter = format;
  logCardTap = onCardTap;
}

export function pushLog(lines) {
  const el = $('#log');
  if (!el || !lines || !lines.length) return;
  for (const l of lines) {
    const raw = typeof l === 'string' ? l : (l.msg || '');
    const row = document.createElement('div');
    row.className = 'log-row';
    const parts = logFormatter ? logFormatter(raw) : [{ text: raw }];
    if (parts.turn !== undefined) {
      row.classList.add('turn');
      if (parts.turn === 0) row.dataset.mine = '1';
      row.textContent = parts.label;
    } else {
      for (const part of parts) {
        if (part.card) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'log-card';
          b.textContent = part.text;
          b.onclick = () => { if (logCardTap) logCardTap(part.card); };
          row.appendChild(b);
        } else {
          row.appendChild(document.createTextNode(part.text));
        }
      }
    }
    el.appendChild(row);
  }
  while (el.children.length > 80) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

/* カードのテキストだけを小さく出す。
   盤面の拡大プレビューはスマホだと邪魔になるので、ログから引くときはこちら。
   o: { title, color, rows: [{ zone, text }] } */
export function showCardNote(o) {
  let el = $('#cardNote');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cardNote';
    document.body.appendChild(el);
  }
  el.style.setProperty('--accent', o.color || '#63f3ff');
  /* place: 'top' | 'bottom'。触ったカード自身を隠さない側に出す */
  el.dataset.place = o.place || 'bottom';
  el.classList.toggle('large', !!o.large);
  el.innerHTML =
    '<div class="cn-head"><b>' + o.title + '</b>' +
      (o.badge ? '<span class="cn-badge">' + o.badge + '</span>' : '') +
      '<button type="button" class="cn-close" aria-label="閉じる">×</button></div>' +
    (o.note ? '<div class="cn-note">' + o.note + '</div>' : '') +
    (o.rows.length
      ? o.rows.map(r => '<div class="cn-row' + (r.inactive ? ' off' : '') + '"><span class="cn-zone">' + r.zone + '</span>' +
          '<span class="cn-text">' + r.text + '</span></div>').join('')
      : '<div class="cn-row"><span class="cn-text">テキストなし</span></div>');
  el.classList.add('show');
  el.querySelector('.cn-close').onclick = () => el.classList.remove('show');
  clearTimeout(el._t);
  /* 盤面から開いたときは、別の場所を触るまで出したままにする */
  if (!o.persist) el._t = setTimeout(() => el.classList.remove('show'), 9000);
}

export function hideCardNote() {
  const el = $('#cardNote');
  if (el) { clearTimeout(el._t); el.classList.remove('show'); }
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

/* 山札の中から選ぶ (CLARITY 3 のサーチ等)。
   候補は盤面にも手札にも無いので、カードの絵と名前を並べて直接選ばせる。
   デッキ公開のオーバーレイに隠れると「勝手に決まった」ように見えるため、
   公開表示は閉じ、こちらを最前面に出す。
   items: { img, label, value } / 戻り値: [value] (選ばない場合は []) */
export function pickFaces(items, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    const reveal = $('#revealOv');
    if (reveal) { clearTimeout(reveal._t); reveal.classList.remove('show'); }
    let el = $('#pickOv');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pickOv';
      document.body.appendChild(el);
    }
    const finish = (picks) => {
      activeModalFinish = null;
      el.classList.remove('show');
      el.innerHTML = '';
      resolve(picks);
    };
    activeModalFinish = finish;
    el.innerHTML = '<div class="rv-title">' + (o.title || 'カードを選ぶ') + '</div>' +
      '<div class="rv-cards">' + items.map((it, i) =>
        '<button type="button" class="rv-pick" data-i="' + i + '">' +
          '<img alt="" src="' + it.img + '"><span>' + it.label + '</span></button>').join('') +
      '</div>' +
      (o.optional
        ? '<div class="rv-hint"><button type="button" class="arr-btn" id="pkSkip">選ばない</button></div>'
        : '<div class="rv-hint">タップして選ぶ</div>');
    el.classList.add('show');
    el.querySelectorAll('.rv-pick').forEach((b) => {
      b.onclick = () => finish([items[+b.dataset.i].value]);
    });
    const skip = el.querySelector('#pkSkip');
    if (skip) skip.onclick = () => finish([]);
  });
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

    const source = ctx.sourceInfo ? ctx.sourceInfo(req.context) : null;
    const multi = (req.kind === 'pickCard' || req.kind === 'pickHand') && (req.max === undefined ? 1 : req.max) > 1;
    const head = (count) => {
      title.innerHTML = selectHead(req, source, {
        optional: req.optional || req.min === 0, count, max: multi ? req.max : 0
      });
      bindSelectHead(title, ctx.onSource);
    };
    head(0);
    body.innerHTML = '';
    body.className = '';

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
      /* ラインは両者のプロトコル名で見分ける (番号だけでは盤面と対応が取りにくい) */
      body.className = 'sel-lines';
      for (const l of req.lines) {
        const info = ctx.lineInfo ? ctx.lineInfo(l) : null;
        addBtn('<span class="sel-ln">' + (l + 1) + '</span>' +
          (info ? '<span class="sel-lp"><b style="color:' + info.mine.color + '">' + info.mine.name + '</b>' +
            '<small>相手 <em style="color:' + info.opp.color + '">' + info.opp.name + '</em></small></span>' : ''),
          () => finish([l]), 'sel-line');
      }
    } else if (req.kind === 'option') {
      const special = optionBody(req, ctx);
      if (special) {
        body.insertAdjacentHTML('beforeend', special.html);
        special.bind(body, finish);
      } else {
        req.options.forEach((o, i) => addBtn(choiceLabel(o), () => finish([i])));
      }
      if (req.optional) addBtn('何もしない', () => finish([]), 'ghost');
    } else if (req.kind === 'arrange') {
      /* 現在の並びのまま (恒等順列) はルール上選べないので出さない */
      const perms = req.exact === 'transposition'
        ? [[1, 0, 2], [0, 2, 1], [2, 1, 0]]
        : [[1, 2, 0], [2, 0, 1], [0, 2, 1], [1, 0, 2], [2, 1, 0]];
      body.className = 'sel-arrange';
      for (const p of perms) {
        addBtn(p.map(i => (ctx.protoName ? ctx.protoName(i) : i + 1)).join(' → '), () => finish(p));
      }
      addBtn('盤面で選ぶに戻る', () => finish('__board__'), 'ghost');
    } else {
      /* pickCard / pickHand: 候補をカード名で並べる */
      const min = req.min === undefined ? 1 : req.min;
      const max = req.max === undefined ? 1 : req.max;
      /* 手札から選ぶ (捨てる等) は、1枚でも選んでから決定する */
      const confirmHand = req.kind === 'pickHand';
      const chosen = [];
      const rerender = () => {
        body.innerHTML = '';
        body.className = 'sel-cards';
        if (multi) head(chosen.length);
        for (const uid of req.candidates) {
          const on = chosen.includes(uid);
          const thumb = ctx.cardThumb ? ctx.cardThumb(uid) : null;
          const label = (thumb ? '<span class="sel-thumb"' + (thumb.color ? ' style="--pc:' + thumb.color + '"' : '') + '>' +
              (thumb.img ? '<img alt="" src="' + thumb.img + '">' : '<i>?</i>') + '</span>' : '') +
            '<span class="sel-cl">' + (ctx.cardLabel ? ctx.cardLabel(uid) : uid) + '</span>' +
            (on && multi ? '<span class="sel-no">' + (chosen.indexOf(uid) + 1) + '</span>' : '');
          const b = addBtn(label, () => {
            const i = chosen.indexOf(uid);
            if (i >= 0) chosen.splice(i, 1);
            else if (max === 1) { chosen.length = 0; chosen.push(uid); }
            else if (chosen.length < max) chosen.push(uid);
            if (!confirmHand && max === 1 && chosen.length === 1) { finish(chosen.slice()); return; }
            rerender();
          }, on ? 'on' : '');
          if (ctx.onHoverCandidate) {
            b.onmouseenter = () => ctx.onHoverCandidate(uid, true);
            b.onmouseleave = () => ctx.onHoverCandidate(uid, false);
          }
        }
        if (max > 1 || min === 0 || confirmHand) {
          const ok = addBtn(chosen.length === 0 && min === 0 ? '選ばない' : '決定', () => {
            if (chosen.length >= min) finish(chosen.slice());
          }, 'yes sel-ok');
          if (chosen.length < min) ok.disabled = true;
        }
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
/* フェイズの開始を示す小さな帯。
   ターン構造 (開始 → コントロール確認 → コンパイル確認 → アクション →
   キャッシュ確認 → 終了) のどこに居るのかを、演出の前に一言で出す。 */
const PHASE_LABEL = {
  start: ['START', '開始フェイズ'],
  checkControl: ['CONTROL CHECK', 'コントロール確認'],
  checkCompile: ['COMPILE CHECK', 'コンパイル確認'],
  action: ['ACTION', 'アクション'],
  checkCache: ['CACHE CHECK', 'キャッシュ確認'],
  end: ['END', '終了フェイズ']
};

export function showPhase(phase, mine) {
  const label = PHASE_LABEL[phase];
  if (!label) return;
  let el = $('#phaseChip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'phaseChip';
    document.body.appendChild(el);
  }
  el.style.setProperty('--accent', mine ? '#6dffc2' : '#ff3b9d');
  el.dataset.side = mine ? 'me' : 'opp';
  /* アニメーションを毎回頭から流すため、作り直してから show を付ける */
  el.classList.remove('show');
  el.innerHTML =
    '<div class="ph-band"></div>' +
    '<div class="ph-body">' +
      '<span class="ph-en">' + label[0] + '</span>' +
      '<span class="ph-rule"></span>' +
      '<span class="ph-ja">' + (mine ? 'あなた' : '相手') + ' / ' + label[1] + '</span>' +
    '</div>';
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1500);
}

/* 宣言の演出 (LUCK 0 / LUCK 3)。
   何を宣言したか、当たったか外れたかを画面の中央で見せる。
   o: { label, value, tone: 'call'|'hit'|'miss', note } */
export function declareCutIn(o) {
  let el = $('#declareCut');
  if (!el) {
    el = document.createElement('div');
    el.id = 'declareCut';
    document.body.appendChild(el);
  }
  const tone = o.tone || 'call';
  el.dataset.tone = tone;
  el.innerHTML =
    '<div class="dc-body">' +
      '<div class="dc-label">' + (o.label || '宣言') + '</div>' +
      '<div class="dc-value">' + (o.value === undefined ? '' : o.value) + '</div>' +
      (o.note ? '<div class="dc-note">' + o.note + '</div>' : '') +
    '</div>';
  el.classList.add('show');
  const hold = tone === 'call' ? 900 : 1150;
  return new Promise((resolve) => setTimeout(() => {
    el.classList.remove('show');
    setTimeout(resolve, 180);
  }, hold));
}

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
/* -------------------------------------------------------------------------
 * カードの詳細パネル (マスターデュエル式)
 *   最後に触ったカード・発動したカードを左上に出したままにする (あとから来たほうに入れ替わる)。
 *   絵は小さく添えるだけにして、効果の文を読ませる。
 *   o: { title, value, proto, color, img, badge, note, hidden, facedown,
 *        rows: [{ key: 'upper'|'middle'|'lower', text, inactive }] }
 *   opts.fire: 発動した段 ('upper' 等)。その段を光らせ、枠をしばらく光らせる
 *   opts.transient: 縦持ちのスマホ用。発動の表示だけ出して、少しで閉じる
 * ------------------------------------------------------------------------- */
const PANEL_ZONE = { upper: '▲ 上段', middle: '◆ 中段', lower: '▼ 下段' };
let fireTimer = null;
let hideTimer = null;

export function showCardPanel(o, opts) {
  const el = $('#preview');
  if (!el || !o) return;
  const fire = (opts && opts.fire) || null;
  clearTimeout(fireTimer);
  clearTimeout(hideTimer);
  el.style.setProperty('--accent', o.color || '#63f3ff');
  const rows = o.rows || [];
  el.innerHTML =
    '<div class="cp-head"><b>' + (o.proto || o.title) + '</b>' +
      (fire ? '<span class="cp-fire">発動</span>' : '') +
      (o.value !== undefined && o.value !== null ? '<span class="cp-val">' + o.value + '</span>' : '') +
    '</div>' +
    '<div class="cp-top">' +
      '<div class="cp-img' + (o.facedown ? ' facedown' : '') + '">' +
        (o.img ? '<img alt="" src="' + o.img + '">' : '<i></i>') + '</div>' +
      '<div class="cp-meta">' +
        (o.hidden ? '' : '<span class="cp-proto">' + (o.proto || '') + '</span>') +
        (o.badge ? '<span class="cp-tag">' + o.badge + '</span>' : '') +
        (o.note ? '<span class="cp-note">' + o.note + '</span>' : '') +
      '</div>' +
    '</div>' +
    (rows.length
      ? '<div class="cp-rows">' + rows.map(r => {
          const on = fire && r.key === fire;
          return '<div class="cp-row' + (on ? ' fire' : r.inactive ? ' off' : '') + '">' +
            '<span class="cp-zone">' + (PANEL_ZONE[r.key] || '') + '</span><p>' + r.text + '</p></div>';
        }).join('') + '</div>'
      : '');
  /* 発動は枠を付け直して光を毎回再生する。光はしばらくで収め、表示は残す */
  el.classList.remove('firing');
  if (fire) {
    void el.offsetWidth;
    el.classList.add('firing');
    fireTimer = setTimeout(() => el.classList.remove('firing'), 2400);
  }
  el.classList.add('show');
  const lit = el.querySelector('.cp-row.fire');
  if (lit) lit.scrollIntoView({ block: 'nearest' });
  if (opts && opts.transient) hideTimer = setTimeout(hideCardPanel, 2400);
}

export function hideCardPanel() {
  const el = $('#preview');
  if (!el) return;
  clearTimeout(fireTimer);
  clearTimeout(hideTimer);
  el.classList.remove('show', 'firing');
}

/* 効果の発動: 詳細パネルに出し、発動した段を光らせる */
export function showActivation(o) {
  showCardPanel(o, { fire: o.fire, transient: o.transient });
}

/* 効果の途中で別の効果が割り込んだときの「処理中の効果の山」。
   links: 外側 (1番) → 内側 (いま解決中) の順に { img, name, zone, color }。
   1番を下に、いま解決中を一番上に積む。2つ以上のときだけ出す (割り込みが無ければ出さない) */
const CHAIN_ZONE = { play: 'プレイ', middle: '中段', upper: '上段', lower: '下段' };
let chainKey = '';
export function showChain(links) {
  let el = $('#chainUi');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chainUi';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  if (!links || links.length < 2) { hideChain(); return; }
  const key = links.map(k => k.name + k.zone).join('>');
  if (key === chainKey && el.classList.contains('show')) return;
  const grew = key.indexOf(chainKey) === 0 && links.length > chainKey.split('>').length;
  chainKey = key;
  el.innerHTML = links.map((k, i) =>
    '<div class="ch-link' + (i === links.length - 1 ? ' now' : '') + (grew && i === links.length - 1 ? ' enter' : '') + '"'
      + ' style="--pc:' + (k.color || '#63f3ff') + '">'
      + '<div class="ch-card">' + (k.img ? '<img alt="" src="' + k.img + '">' : '<i></i>') + '</div>'
      + '<b class="ch-no">' + (i + 1) + '</b>'
      + '<span class="ch-name">' + k.name + '<small>' + (CHAIN_ZONE[k.zone] || '') + '</small></span>'
      + '</div>').join('');
  el.classList.add('show');
}

export function hideChain() {
  const el = $('#chainUi');
  chainKey = '';
  if (el) el.classList.remove('show');
}

/* 選択操作に入るときは、発動の光だけ止める (表示は残す) */
export function hideActivation() {
  const el = $('#preview');
  clearTimeout(fireTimer);
  if (el) el.classList.remove('firing');
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
export function showPile(title, items) {
  showRevealedHand(items, title);
}

export function showRevealedHand(items, titleOverride) {
  if (!items || !items.length) return;
  let el = $('#revealOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'revealOv';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="rv-title">' +
      (titleOverride || (items.length === 1 ? '相手が手札を1枚公開した' : '相手の手札が公開された')) + '</div>' +
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

