/* =========================================================================
 * 3Dビュー: DOM 側の HUD (3D の上に薄く重ねる情報レイヤ)
 *   盤面そのものは 3D が担当し、ここは数値・ログ・選択ダイアログだけを持つ。
 * ========================================================================= */

import { selectHead, bindSelectHead, optionBody, choiceLabel } from './selectui.js';
import { drawVictoryBackdrop, drawDefeatBackdrop } from './backdrops.js';
import { condHtml } from './cardtext.js';

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

export function setCounts(me, opp) {
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  set('#meDeck', me.deck); set('#meTrash', me.trash);
  set('#oppDeck', opp.deck); set('#oppTrash', opp.trash);
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
      ? o.rows.map(r => '<div class="cn-row' + (r.empty ? ' empty' : r.inactive ? ' off' : '') + '"><span class="cn-zone">' + r.zone + '</span>' +
          '<span class="cn-text">' + (r.empty ? 'なし' : condHtml(r.text)) + '</span></div>').join('')
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
        '<div class="rv-pickwrap"><button type="button" class="rv-pick" data-i="' + i + '">' +
          '<img alt="" src="' + it.img + '"><span>' + it.label + '</span></button>' +
          '<button type="button" class="rv-zoom" data-z="' + i + '" aria-label="' + it.label + ' を拡大">🔍</button></div>').join('') +
      '</div>' +
      (o.optional
        ? '<div class="rv-hint"><button type="button" class="arr-btn" id="pkSkip">選ばない</button></div>'
        : '<div class="rv-hint">タップして選ぶ</div>');
    el.classList.add('show');
    el.querySelectorAll('.rv-pick').forEach((b) => {
      b.onclick = () => finish([items[+b.dataset.i].value]);
    });
    el.querySelectorAll('.rv-zoom').forEach((b) => {
      b.onclick = () => { const it = items[+b.dataset.z]; zoomCard(it.img, it.label); };
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
/* コンパイルの進み具合: 3つの枠のうち済んだぶんを埋め、今コンパイルした枠を光らせる */
function ccPips(remaining) {
  const done = Math.max(1, 3 - (remaining || 0));
  let html = '<div class="cc-pips" aria-label="' + done + ' / 3 コンパイル">';
  for (let i = 0; i < 3; i++) html += '<i class="' + (i < done - 1 ? 'on' : i === done - 1 ? 'now' : '') + '"></i>';
  return html + '</div>';
}

export function compileCutIn(info) {
  const el = $('#compileCut');
  if (!el) return Promise.resolve();
  const accent = info.color || '#63f3ff';
  el.style.setProperty('--accent', accent);
  el.innerHTML =
    '<div class="cc-veil"></div>' +
    (info.art ? '<div class="cc-art" style="background-image:url(&quot;' + info.art + '&quot;)"></div>' : '') +
    (info.emblem ? '<img class="cc-emblem" alt="" src="' + info.emblem + '">' : '') +
    '<div class="cc-ghost" aria-hidden="true"><span>COMPILED COMPILED COMPILED COMPILED</span></div>' +
    '<div class="cc-ring"></div><div class="cc-ring r2"></div><div class="cc-ring r3"></div>' +
    '<div class="cc-slash"></div><div class="cc-slash thin"></div>' +
    '<div class="cc-body">' +
      '<div class="cc-kicker">PROTOCOL COMPILED</div>' +
      '<div class="cc-name" data-text="' + info.name + '">' + info.name + '</div>' +
      ccPips(info.remaining) +
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
  el.style.setProperty('--dir', mine ? '1' : '-1');
  el.classList.toggle('opp', !mine);
  const chev = mine ? '›' : '‹';
  const chevs = '<i>' + chev + '</i><i>' + chev + '</i><i>' + chev + '</i>';
  el.innerHTML =
    '<div class="tc-glow"></div>' +
    '<div class="tc-band"></div>' +
    '<div class="tc-line a"></div><div class="tc-line b"></div>' +
    '<div class="tc-chev l">' + chevs + '</div><div class="tc-chev r">' + chevs + '</div>' +
    '<div class="tc-text">' + (mine ? 'YOUR TURN' : 'OPPONENT TURN') + '</div>' +
    '<div class="tc-sub">' + (mine ? 'COMMAND READY' : 'STAND BY') + '</div>';
  el.classList.add('show');
  return new Promise((resolve) => setTimeout(() => {
    el.classList.remove('show');
    el.innerHTML = '';
    resolve();
  }, 1250));
}

/* -------------------------------------------------------------------------
 * カードの詳細パネル (マスターデュエル式)
 *   最後に触ったカードを左上に出したままにする (あとから触ったほうに入れ替わる)。
 *   効果の発動は右上の帯 (showFxBanner) に出す。
 *   絵は小さく添えるだけにして、効果の文を読ませる。
 *   o: { title, value, proto, color, img, badge, note, hidden, facedown,
 *        rows: [{ key: 'upper'|'middle'|'lower', text, inactive }] }
 *   opts.transient: 縦持ちのスマホ用。少しで閉じる
 * ------------------------------------------------------------------------- */
const PANEL_ZONE = { upper: '▲ 上段', middle: '◆ 中段', lower: '▼ 下段' };
let hideTimer = null;

/* お気に入りのカード (main.js が渡す): isFav(defId) / toggle(defId) / winsOf(defId) */
let favHandler = null;
export function setFavoriteHandler(h) { favHandler = h; }
function favButton(o) {
  if (!favHandler || !o.defId || o.hidden || o.defId === '__unknown__') return '';
  const on = favHandler.isFav(o.defId);
  const w = favHandler.winsOf(o.defId);
  return '<button type="button" class="cp-fav" data-fav="' + o.defId + '" aria-pressed="' + on + '" title="' +
    (on ? 'お気に入りを外す' : 'お気に入りにする') + '">' + (on ? '★' : '☆') + '</button>' +
    (w && w.tier ? '<span class="cp-tier t-' + w.tier.key + '" title="表で出して ' + w.wins + '勝">' + w.tier.name + '</span>' : '') +
    (w && w.effects ? '<span class="cp-fxn" title="このカードの効果が発動した回数 (これまでの合計)">効果 ' + w.effects + '</span>' : '');
}

export function showCardPanel(o, opts) {
  const el = $('#preview');
  if (!el || !o) return;
  clearTimeout(hideTimer);
  el.style.setProperty('--accent', o.color || '#63f3ff');
  const rows = o.rows || [];
  el.innerHTML =
    '<div class="cp-head"><b>' + (o.proto || o.title) + '</b>' + favButton(o) +
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
      ? '<div class="cp-rows">' + rows.map(r => '<div class="cp-row' + (r.empty ? ' empty' : r.inactive ? ' off' : '') + '">' +
          '<span class="cp-zone">' + (PANEL_ZONE[r.key] || '') + '</span><p>' + (r.empty ? 'なし' : condHtml(r.text)) + '</p></div>').join('') + '</div>'
      : '');
  const fav = el.querySelector('.cp-fav');
  if (fav) fav.onclick = (ev) => { ev.stopPropagation(); favHandler.toggle(o.defId); showCardPanel(o, opts); };
  el.classList.add('show');
  if (opts && opts.transient) hideTimer = setTimeout(hideCardPanel, 2400);
}

export function hideCardPanel() {
  const el = $('#preview');
  if (!el) return;
  clearTimeout(hideTimer);
  el.classList.remove('show');
}

/* -------------------------------------------------------------------------
 * 効果の発動 (マスターデュエル風): 右上に帯が滑り込み、発動した段の文を出す。
 *   少しで右へ滑って消える。続けて発動したら、新しいほうに差し替える。
 *   左上の詳細パネル (触ったカード) は替えない。
 *   o: { name, color, zone: 'upper'|'middle'|'lower', text, mine }
 * ------------------------------------------------------------------------- */
const FX_ZONE = { upper: '▲ 上段', middle: '◆ 中段', lower: '▼ 下段' };
let fxBannerTimer = null;
export function showFxBanner(o, ms) {
  let el = $('#fxBanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fxBanner';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  clearTimeout(fxBannerTimer);
  el.style.setProperty('--pc', o.color || '#63f3ff');
  el.innerHTML =
    '<div class="fx-body">' +
      '<div class="fx-head"><b>' + o.name + '</b><span class="fx-tag">発動</span>' +
        '<span class="fx-who ' + (o.mine ? 'me' : 'opp') + '">' + (o.mine ? 'あなた' : '相手') + '</span></div>' +
      '<p><span class="fx-zone">' + (FX_ZONE[o.zone] || '') + '</span>' + condHtml(o.text) + '</p>' +
    '</div>' +
    '<i class="fx-sweep"></i>';
  /* 毎回滑り込ませ直す (続けて発動しても、新しい発動だと分かるように) */
  el.classList.remove('show', 'out');
  void el.offsetWidth;
  el.classList.add('show');
  fxBannerTimer = setTimeout(hideFxBanner, ms || 2800);
}

export function hideFxBanner() {
  const el = $('#fxBanner');
  clearTimeout(fxBannerTimer);
  if (!el || !el.classList.contains('show')) return;
  el.classList.add('out');
  fxBannerTimer = setTimeout(() => el.classList.remove('show', 'out'), 320);
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
  if (grew) chainBurst(el, el.querySelector('.ch-link.enter'), links.length);
}

/* チェーンがつながった瞬間: 積まれたカードの上に「CHAIN n」を大きく一瞬出す。
   チェーン表示の中 (position:fixed の箱) に絶対配置で置き、カードの配置 (offset*) から中心を求める。
   カードは滑り込み中 (transform 付き) なので、画面座標ではなく変形を含まない配置を使う */
function chainBurst(root, link, n) {
  const card = link && link.querySelector('.ch-card');
  if (!card) return;
  const b = document.createElement('div');
  b.className = 'ch-burst';
  b.setAttribute('aria-hidden', 'true');
  b.innerHTML = '<small>CHAIN</small><b>' + n + '</b>';
  b.style.left = Math.round(link.offsetLeft + card.offsetLeft + card.offsetWidth / 2) + 'px';
  b.style.top = Math.round(link.offsetTop + card.offsetTop + card.offsetHeight / 2) + 'px';
  root.appendChild(b);
  setTimeout(() => b.remove(), 1200);
}

/* カードの拡大表示: 一覧 (捨て札・スタック・公開・山札から選ぶ) のカードを大きく出す。どこを触っても閉じる */
export function zoomCard(img, label) {
  let el = $('#zoomOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'zoomOv';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el);
  }
  el.setAttribute('aria-label', label || 'カード');
  el.innerHTML = '<figure><img alt="" src="' + img + '"><figcaption>' + (label || '') + '</figcaption></figure><div class="zm-hint">タップで閉じる</div>';
  el.classList.add('show');
  el.onclick = (ev) => { ev.stopPropagation(); el.classList.remove('show'); };
}

export function hideChain() {
  const el = $('#chainUi');
  chainKey = '';
  if (el) el.classList.remove('show');
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
    '<div class="rv-cards">' + items.map((it, i) =>
      '<figure data-z="' + i + '"><img alt="" src="' + it.img + '"><figcaption>' + it.label + '</figcaption></figure>'
    ).join('') + '</div><div class="rv-hint">カードをタップで拡大・ほかをタップで閉じる</div>';
  el.classList.add('show');
  /* 一覧そのもの、またはほかの場所に触れたら閉じる。ほかの場所への最初のタッチは閉じるだけにして、
     下の盤面の操作 (手札を選ぶ等) まで一緒に起こさない */
  const outside = (ev) => {
    if (el.contains(ev.target)) return;
    const zoom = $('#zoomOv');
    if (zoom && zoom.contains(ev.target)) return;      // 拡大表示を閉じるタッチでは一覧を閉じない
    ev.stopPropagation();
    ev.preventDefault();
    close();
  };
  const close = () => {
    el.classList.remove('show');
    clearTimeout(el._t);
    document.removeEventListener('pointerdown', outside, true);
  };
  /* カードに触れたら拡大 (一覧は閉じない)、それ以外に触れたら閉じる */
  el.onclick = (ev) => {
    const f = ev.target.closest('[data-z]');
    if (f) {
      clearTimeout(el._t);
      const it = items[+f.dataset.z];
      zoomCard(it.img, it.label);
      return;
    }
    close();
  };
  clearTimeout(el._t);
  /* 相手の手札公開は6秒で閉じる。捨て札・スタックの一覧 (見出しあり) は自分で閉じるまで出しておく */
  if (!titleOverride) el._t = setTimeout(close, 6000);
  document.removeEventListener('pointerdown', el._outside || outside, true);
  el._outside = outside;
  /* 開いたタッチそのもので閉じないよう、次のタッチから見張る */
  setTimeout(() => { if (el.classList.contains('show')) document.addEventListener('pointerdown', outside, true); }, 0);
}

/* 決着のカットイン */
export function resultCutIn(win) {
  const el = $('#resultCut');
  if (!el) return Promise.resolve();
  el.style.setProperty('--accent', win ? '#6dffc2' : '#ff3b9d');
  el.innerHTML =
    '<div class="rc-veil"></div>' +
    '<canvas class="rc-art" aria-hidden="true"></canvas>' +
    '<div class="rc-rays"></div>' +
    '<div class="rc-body">' +
      '<div class="rc-title">' + (win ? 'VICTORY' : 'DEFEAT') + '</div>' +
      '<div class="rc-rule"></div>' +
      '<div class="rc-sub">' + (win ? 'ALL PROTOCOLS COMPILED' : 'SYSTEM OVERWRITTEN') + '</div>' +
    '</div>';
  el.classList.add('show');
  const art = el.querySelector('.rc-art');
  try { (win ? drawVictoryBackdrop : drawDefeatBackdrop)(art); } catch (e) { art.remove(); }
  return new Promise((resolve) => setTimeout(() => {
    el.classList.remove('show');
    el.innerHTML = '';
    resolve();
  }, 3600));
}

