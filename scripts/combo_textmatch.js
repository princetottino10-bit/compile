#!/usr/bin/env node
/* カード文を「起こすこと (出力)」と「反応すること・条件 (入力)」に分解して、出力が別の札の入力になる組を並べる。
   2026-11-03 ユーザー「入力と出力の分解でやってけば何か見えるかな」「デメリットがトリガーになるやつとか、色々あるはず」。
   effects.json の ops / trigger.on / static / ifState から機械的に拾うので、読み違いは人が見て落とす。
   使い方: node scripts/combo_textmatch.js [--out file.json] [--drawback]   (--drawback: デメリットの出力だけ) */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const cards = JSON.parse(fs.readFileSync(path.join(root, 'data', 'cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(root, 'data', 'effects.json'), 'utf8'));
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

const info = {};
for (const p of cards.protocols) for (const c of p.cards) {
  info[c.id] = { id: c.id, proto: p.name, value: c.value, name: p.name + ' ' + c.value, text: { upper: c.upper || '', middle: c.middle || '', lower: c.lower || '' } };
}

/* 出力: [イベント, デメリットか]。デメリット = 自分の手札が減る・自分の札が裏返る/消える・相手が得をする */
function outputsOf(ops, out, ctx) {
  for (const o of ops || []) {
    if (!o || typeof o !== 'object') continue;
    const opp = o.player === 'opp' || o.actor === 'opp';
    const self = o.select && o.select.ref === 'this';
    switch (o.op) {
      case 'draw': case 'drawByValue': case 'drawByCount': case 'drawDynamic': case 'searchDeck':
        out.push(opp ? ['oppDraw', true] : ['youDraw', false]); break;
      case 'oppDrawsFromYourDeck': case 'giveCard': out.push(['oppDraw', true]); break;
      case 'discard': case 'randomDiscard':
        if (opp) out.push(['oppDiscard', false]);
        else out.push(['youDiscard', !o.optional], ...(o.count === 'all' ? [['youHandEmpty', false]] : [])); break;
      case 'bothDiscardAll': out.push(['youDiscard', true], ['oppDiscard', false], ['youHandEmpty', false], ['oppHandEmpty', false]); break;
      case 'flip':
        if (self) out.push(['selfFlip', true]);
        else if (o.select && o.select.facing === 'down') out.push(['flipUp', false]);
        else out.push(['flip', false]);
        break;
      case 'delete':
        if (self) out.push(['selfDelete', true], ['youDelete', false]);
        else if (opp) out.push(['oppDelete', false]);
        else out.push(['youDelete', false]);
        break;
      case 'play':
        if (o.facing === 'down') out.push(opp ? ['oppPlayDown', true] : ['youPlayDown', false]);
        else out.push(opp ? ['oppPlay', true] : ['youPlay', false]);
        if (o.source === 'topDeck' && !opp) out.push(['deckShrink', false]);
        break;
      case 'refresh': out.push(['youRefresh', false]); break;
      case 'loseControl': out.push(opp ? ['oppLoseControl', false] : ['youLoseControl', !o.optional]); break;
      case 'gainControl': out.push(['youGainControl', false]); break;
      case 'return': out.push(o.select && o.select.owner === 'self' ? ['youReturnOwn', true] : ['return', false]); break;
      case 'shift': out.push(['shift', false]); break;
      case 'rearrange': case 'swapProtocols': out.push(['youRearrange', false]); break;
      case 'compileLine': out.push(['youCompile', false]); break;
      case 'discardTop': case 'discardDeck': out.push(['deckShrink', o.op === 'discardDeck']); break;
      case 'shuffleTrashIntoDeck': out.push(['youShuffle', false]); break;
    }
    for (const k of ['ops', 'else']) if (Array.isArray(o[k])) outputsOf(o[k], out, ctx);
  }
  return out;
}

/* 入力: 誘発 (trigger.on) と、条件・数える量 */
const ON = {
  afterYouDraw: 'youDraw', afterOppDraw: 'oppDraw', afterYouDiscard: 'youDiscard', afterOppDiscard: 'oppDiscard',
  afterYouDiscardOppTurn: 'youDiscard', afterYouDelete: 'youDelete', afterYouRefresh: 'youRefresh', afterOppRefresh: 'oppRefresh',
  afterAnyRefresh: 'youRefresh', afterYouClearCache: 'youOverflow', afterAnyClearCache: 'youOverflow', afterOppGainControl: 'youLoseControl',
  afterAnyCompile: 'youCompile', afterYouCompile: 'youCompile', afterOppCompile: 'oppCompile', afterAnyRearrange: 'youRearrange',
  afterYouRearrange: 'youRearrange', afterYouPlayDownAction: 'youPlayDown', afterYouShuffle: 'youShuffle', afterOppPlayInThisLine: 'oppPlayDown',
  wouldBeCovered: 'cover', wouldBeCoveredOrFlipped: 'cover'
};
function inputsOf(slot, ins) {
  if (!slot) return ins;
  const tr = slot.trigger;
  if (tr && ON[tr.on]) ins.push(ON[tr.on]);
  const st = slot.static;
  if (st && st.kind === 'modifyLineTotal') {
    if (st.deltaPer === 'yourHand') ins.push('youDraw');
    else if (st.deltaPer && st.deltaPer.facing === 'down') ins.push('youPlayDown', 'oppPlayDown');
  }
  const walk = (ops) => { for (const o of ops || []) { if (!o) continue;
    if (o.op === 'ifState' && o.cond === 'handEmpty') ins.push('youHandEmpty');
    if (o.op === 'drawByValue') ins.push('bigFaceDown');
    for (const k of ['ops', 'else']) if (Array.isArray(o[k])) walk(o[k]); } };
  walk(slot.ops); if (tr) walk(tr.ops);
  return ins;
}

const rows = [];
for (const id of Object.keys(info)) {
  const e = effects[id] || {};
  info[id].out = []; info[id].in = [];
  for (const s of ['upper', 'middle', 'lower']) {
    const slot = e[s]; if (!slot) continue;
    const ops = slot.ops || (slot.trigger && slot.trigger.ops) || [];
    for (const [ev, bad] of outputsOf(ops, [], {})) info[id].out.push({ ev, bad, slot: s });
    for (const ev of inputsOf(slot, [])) info[id].in.push({ ev, slot: s });
  }
  if (info[id].value >= 5) info[id].out.push({ ev: 'bigFaceDown', bad: false, slot: 'value' });
}
/* 手札があふれる (キャッシュのクリア) のは、大きく引く札 */
for (const id of Object.keys(info)) if (info[id].out.filter(o => o.ev === 'youDraw').length && /[3-9]枚引く|と同じ枚数/.test(info[id].text.middle)) info[id].out.push({ ev: 'youOverflow', bad: false, slot: 'middle' });

const onlyBad = args.includes('--drawback');
for (const P of Object.values(info)) for (const po of P.out) {
  if (onlyBad && !po.bad) continue;
  for (const C of Object.values(info)) {
    if (C.id === P.id) continue;
    for (const ci of C.in) if (ci.ev === po.ev) rows.push({ ev: po.ev, drawback: po.bad, from: P.name, fromSlot: po.slot, to: C.name, toSlot: ci.slot, sameProto: P.proto === C.proto, fromText: P.text[po.slot] || '', toText: C.text[ci.slot] || '' });
  }
}
const seen = new Set(), uniq = [];
for (const r of rows) { const k = r.from + '>' + r.to + '>' + r.ev; if (seen.has(k)) continue; seen.add(k); uniq.push(r); }
const out = opt('--out');
if (out) fs.writeFileSync(out, JSON.stringify(uniq, null, 1));
const by = {};
for (const r of uniq) by[r.ev + (r.drawback ? '*' : '')] = (by[r.ev + (r.drawback ? '*' : '')] || 0) + 1;
console.log(uniq.length + ' 組', JSON.stringify(by));
