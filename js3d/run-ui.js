/* =========================================================================
 * 勝ち抜き戦の画面 (進行と保存は run.js)
 *   openRun: ドラフト・報酬・戦う前の画面。戦う相手が決まったら { me, ai, level } で返す
 *   runHud: 対戦中のライフ表示
 *   showRunAfterGame: 決着後に結果を入れて、次へ進む画面を出す
 * ========================================================================= */
import { loadWeekly } from './weekly.js';
import * as RUN from './run.js';
import { emblemDataURL } from './emblems.js';
import { levelLabel } from './aidecks.js';
import { showProtocolCards } from './protocards.js';
import { confetti, playCapsule, RAR_COLORS } from './gachafx.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function overlay() {
  let el = document.getElementById('runOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'runOv';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '勝ち抜き戦');
    document.body.appendChild(el);
  }
  el.classList.add('show');
  return el;
}

function lifeBar(run, lost) {
  const pips = [];
  for (let i = 0; i < run.maxLife; i++) {
    const cls = i < run.life - (lost || 0) ? 'on' : i < run.life ? 'hit' : '';
    pips.push('<i class="' + cls + '"></i>');
  }
  return '<div class="rn-life" aria-label="ライフ ' + Math.max(0, run.life - (lost || 0)) + ' / ' + run.maxLife + '">' +
    '<b>LIFE</b><span>' + pips.join('') + '</span><em>' + Math.max(0, run.life - (lost || 0)) + '<small>/' + run.maxLife + '</small></em></div>';
}

/* いま何段目か (地図に出る前は -1) */
function rowNow(run) {
  const n = RUN.nodeById(run, run.pos);
  return n ? n.row : -1;
}
const ROW_H = 58;
/* 地図 (下から上へ登る)。進めるマスだけ押せる。通った道は太く、進める道は光らせる */
function mapHtml(run, canMove) {
  const rows = run.map.rows;
  const H = RUN.MAP_ROWS * ROW_H;
  const y = (r) => (RUN.MAP_ROWS - 1 - r) * ROW_H + ROW_H / 2;
  const reach = canMove ? RUN.reachable(run) : [];
  const vis = run.visited || [];
  const lines = [];
  for (const row of rows) for (const n of row) for (const id of n.next) {
    const t = RUN.nodeById(run, id);
    const taken = vis.indexOf(id) > 0 && vis[vis.indexOf(id) - 1] === n.id;
    const open = canMove && n.id === run.pos && reach.includes(id);
    lines.push('<line x1="' + (n.x * 100) + '" y1="' + y(n.row) + '" x2="' + (t.x * 100) + '" y2="' + y(t.row) + '" class="' +
      (taken ? 'taken' : open ? 'open' : '') + '"/>');
  }
  const nodes = rows.flat().map(n => {
    const N = RUN.NODES[n.type];
    const cls = ['rn-node', n.type, vis.includes(n.id) ? 'visited' : '', n.id === run.pos ? 'here' : '', reach.includes(n.id) ? 'reach' : ''].join(' ');
    return '<button type="button" class="' + cls + '" style="left:' + (n.x * 100) + '%;top:' + y(n.row) + 'px" ' +
      (reach.includes(n.id) ? 'data-node="' + n.id + '"' : 'tabindex="-1"') + ' title="' + esc(N.name + ' — ' + N.text) + '" aria-label="' + esc(N.name) + '">' +
      '<span>' + N.icon + '</span></button>';
  }).join('');
  return '<div class="rn-map-wrap"><div class="rn-map" style="height:' + H + 'px">' +
    '<svg viewBox="0 0 100 ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + lines.join('') + '</svg>' + nodes + '</div></div>' +
    '<div class="rn-legend">' + Object.keys(RUN.NODES).map(k => '<span class="' + k + '"><i>' + RUN.NODES[k].icon + '</i>' + RUN.NODES[k].name + '</span>').join('') + '</div>';
}

/* ---------- 演出 (お祭りなので派手に。gachafx.js) ---------- */
/* ガチャの演出: 出てきたパッチの名前で */
function playGacha(host, result) {
  if (!result) return Promise.resolve();
  const info = RUN.patchInfo(result.id);
  return playCapsule(host, result.rar, info ? info.name : '');
}

/* 持っているパッチと HEAT (いつも上に出す) */
function patchStrip(run) {
  const list = (run.patches || []).map(id => RUN.patchInfo(id)).filter(Boolean);
  return '<div class="rn-patches"><span class="rn-credit" title="勝つと増える。GACHA に使う">CREDIT ' + (run.credits | 0) + '</span>' +
    (run.heat ? '<span class="rn-heatb">HEAT ' + run.heat + '</span>' : '') +
    buildHtml(run) +
    list.map(p => '<span class="rn-pchip ' + p.kind + ' r' + p.rar + ((p.id === 'failsafe' && run.failsafeUsed) || (p.id === 'phoenix' && run.phoenixUsed) ? ' used' : '') + '" title="' + esc(p.text) + '">' +
      esc(p.name) + '</span>').join('') + '</div>';
}

/* GACHA (戦いの合間に出す)。直前に引いた結果もここに */
function gachaBox(run) {
  if (!['map', 'shop', 'reward'].includes(run.phase)) return '';
  const cost = RUN.gachaCost(run);
  const r = run.lastPull;
  const p = r && RUN.patchInfo(r.id);
  const greed = RUN.setLevel(run, 'GREED') >= 2 ? 2 : 1;
  return '<div class="rn-gacha">' +
    '<div class="rn-gacha-h"><b>GACHA</b><span>' + cost + ' クレジットで1回。LEGENDARY ' + RUN.RARITY.L.weight * greed + '% ・ EPIC ' + RUN.RARITY.E.weight * greed +
      '% ・ RARE ' + RUN.RARITY.R.weight + '%。持っているパッチが出たらライフ +1</span>' +
      '<button type="button" class="rn-pull" data-act="gacha"' + (RUN.canPull(run) ? '' : ' disabled') + '>引く <small>' + (run.credits | 0) + ' / ' + cost + '</small></button></div>' +
    (p ? '<div class="rn-capsule r' + r.rar + '" role="status"><small>' + RUN.RARITY[r.rar].name + (r.dupe ? ' ・ かぶり → ライフ +1' : ' ・ NEW') + '</small>' +
      '<b>' + esc(p.name) + '</b><span>' + esc(p.text) + '</span></div>' : '') +
    '</div>';
}

/* ビルド: 系統ごとの数と、付いているボーナス */
function buildHtml(run) {
  const tags = Object.keys(RUN.TAGS).filter(t => RUN.tagCount(run, t) > 0);
  if (!tags.length) return '';
  return '<span class="rn-build">' + tags.map(t => {
    const T = RUN.TAGS[t], n = RUN.tagCount(run, t), lv = RUN.setLevel(run, t);
    const tip = T.label + ' の系統: 2つで「' + T.bonus[0] + '」、3つで「' + T.bonus[1] + '」';
    return '<i class="lv' + lv + '" style="--tc:' + T.color + '" title="' + esc(tip) + '">' + T.name + ' ' + n + (lv ? ' ★'.repeat(lv) : '') + '</i>';
  }).join('') + '</span>';
}
/* 付いているボーナスの一覧 (戦う前の画面に) */
function bonusList(run) {
  const on = Object.keys(RUN.TAGS).flatMap(t => RUN.TAGS[t].bonus.slice(0, RUN.setLevel(run, t)).map(b => '<li style="--tc:' + RUN.TAGS[t].color + '"><b>' + t + '</b>' + esc(b) + '</li>'));
  return on.length ? '<ul class="rn-bonus">' + on.join('') + '</ul>' : '';
}

function patchCard(p, attrs) {
  return '<button type="button" class="rn-patch ' + p.kind + ' r' + p.rar + '" ' + (attrs || '') + '>' +
    '<em class="rn-tag" style="--tc:' + RUN.TAGS[p.tag].color + '">' + p.tag + '</em>' +
    '<small>' + (p.kind === 'game' ? 'BATTLE PATCH' : 'SYSTEM PATCH') + ' ・ ' + RUN.RARITY[p.rar].name + '</small><b>' + esc(p.name) + '</b><span>' + esc(p.text) + '</span></button>';
}

function protoChip(p, attrs) {
  return '<button type="button" class="rn-proto" style="--pc:' + esc(p.color) + '" ' + (attrs || '') + '>' +
    '<img alt="" src="' + emblemDataURL(p.name, p.color, 64, true) + '"><b>' + esc(p.name) + '</b></button>';
}

function deckLine(names, byName) {
  return '<span class="rn-deck">' + names.map(n => '<i style="--pc:' + esc((byName[n] || {}).color || '#b9a4ff') + '">' + esc(n) + '</i>').join('') + '</span>';
}

/* デッキのカード (外したものは打ち消し線)。pick: カード除去で押せるようにする */
function deckCards(run, byName, pick) {
  const removed = new Set(run.removed || []);
  return '<div class="rn-cards">' + run.deck.map(n => {
    const p = byName[n];
    if (!p) return '';
    return '<div class="rn-cardcol" style="--pc:' + esc(p.color) + '"><h4>' + esc(n) + '</h4>' + p.cards.map(c => {
      const gone = removed.has(c.id);
      const text = c.middle || c.upper || c.lower || '';
      const inner = '<b>' + esc(n + ' ' + c.value) + '</b><span>' + esc(text.length > 38 ? text.slice(0, 37) + '…' : text) + '</span>';
      return pick && !gone
        ? '<button type="button" class="rn-c" data-rm="' + esc(c.id) + '" title="' + esc(text) + '">' + inner + '</button>'
        : '<div class="rn-c' + (gone ? ' gone' : '') + '" title="' + esc(text) + '">' + inner + '</div>';
    }).join('') + '</div>';
  }).join('') + '</div>';
}

/* 戦う相手が決まるまで画面を進める。null ならタイトルへ戻る、{ go: 'weekly' } なら週替わり3連戦へ。
   opts.hub: タイトルから来たとき。勝ち抜き戦の途中でも、まず入口 (続きから / 週替わり) を出す */
export function openRun(protocols, cardsOf, opts) {
  const names = protocols.map(p => p.name);
  const byName = Object.fromEntries(protocols.map(p => [p.name, p]));
  const el = overlay();
  return new Promise((resolve) => {
    let run = RUN.loadRun();
    let swapAdd = null;          // 報酬で入れ替えるプロトコル (選んだあと、外すほうを選ぶ)
    let confirmQuit = false;
    let showDeck = false;        // 地図の画面でデッキを広げる
    let hub = !!(opts && opts.hub);
    let heatSel = RUN.unlockedHeat();      // はじめるときの HEAT (解放した一番上から)
    let pulling = false;                   // ガチャの演出中 (二度押しを受けない)
    const set = (next) => { run = next; RUN.saveRun(run); render(); };
    /* defId → 「FIRE 2」 (カードに印刷された値で) */
    const cardLabel = (id) => {
      const proto = String(id).replace(/_\d+$/, '');
      const c = byName[proto] && byName[proto].cards.find(x => x.id === id);
      return c ? proto + ' ' + c.value : id;
    };
    const done = (v) => { el.classList.remove('show'); resolve(v); };
    /* カード一覧は、いま候補に出ているものと自分のデッキをタブで切り替えられるように */
    const info = (name) => {
      const p = byName[name];
      if (!p || !cardsOf) return;
      const list = [...new Set([...((run && run.offers) || []), ...((run && run.deck) || [])])]
        .filter(n => byName[n]).map(n => ({ name: n, color: byName[n].color }));
      showProtocolCards(name, p.color, cardsOf, list);
    };

    /* 入口: 2つのモードを同じ大きさのカードで並べる (どちらを遊ぶかが一目で分かるように) */
    const hubHtml = () => {
      const active = run && run.phase !== 'over' && run.phase !== 'clear';
      const best = RUN.loadBest();
      const top = RUN.unlockedHeat();
      const bestText = (b) => (b.heat ? 'HEAT ' + b.heat + ' で ' : '') +
        (b.reached > (b.rows || RUN.MAP_ROWS) ? 'BOSS 撃破 (ライフ ' + b.life + ' 残し)' : b.rows ? b.reached + ' / ' + b.rows + ' 段まで' : b.reached + '戦目まで');
      const runStatus = active
        ? '<em class="now">' + (rowNow(run) + 1) + ' / ' + RUN.MAP_ROWS + ' 段 ・ ライフ ' + run.life + (run.heat ? ' ・ HEAT ' + run.heat : '') + '</em>'
        : best ? '<em>最高記録: ' + bestText(best) + '</em>' : '<em>まだ挑戦していません</em>';
      /* HEAT: クリアするたびに1段ずつ解放。上の段は下の段の条件を全部含む */
      const heatPick = !active && top > 0
        ? '<div class="rn-heat" role="group" aria-label="HEAT (難しさ)"><small>HEAT</small>' +
            RUN.HEATS.slice(0, top + 1).map(h => '<button type="button" data-heat="' + h.lv + '" class="' + (h.lv === heatSel ? 'on' : '') + '" title="' + esc(h.text) + '">' + h.lv + '</button>').join('') +
            '<span>' + esc(heatSel ? RUN.HEATS.slice(1, heatSel + 1).map(h => h.text).join(' / ') : '標準の難しさ') + '</span></div>'
        : '';
      const w = loadWeekly();
      const weekStatus = w.phase === 'clear' ? '<em class="done">今週はクリア済み</em>'
        : w.phase === 'battle' || w.phase === 'choose' ? '<em class="now">第' + (w.stage + 1) + '戦の途中 (' + w.attempt + '回目の挑戦)</em>'
          : w.attempt ? '<em>今週 ' + w.attempt + '回挑戦 ・ 最高 ' + (w.bestStage || 0) + '勝</em>' : '<em>今週はまだ挑戦していません</em>';
      return '<p class="rn-pick">遊ぶモードを選んでください</p><div class="rn-modes">' +
        '<section class="rn-mcard"><small>ROGUELIKE</small><h3>勝ち抜き戦</h3><ul>' +
          '<li>地図を下から登り、頂上の BOSS を倒す (1試合 ' + RUN.RUN_WIN_COMPILES + '本先取)</li>' +
          '<li>道は自分で選ぶ: 戦闘・精鋭・イベント・休憩所・ショップ・宝箱</li>' +
          '<li>ライフ ' + RUN.RUN_LIFE + '。コンパイルされるたびに 1 減る</li>' +
          '<li>パッチ (改造) を集めてビルドを組む。カードを外してデッキを研ぐ</li>' +
          '<li>クレジットでショップと GACHA</li>' +
          '<li>クリアすると次の HEAT (難しさ) が開く</li></ul>' + runStatus + heatPick +
          (active ? '<button type="button" class="rn-go" data-act="resume">続きから</button>'
            : '<button type="button" class="rn-go" data-act="start">はじめる</button>') + '</section>' +
        '<section class="rn-mcard"><small>WEEKLY</small><h3>週替わり3連戦</h3><ul>' +
          '<li>毎週配られる9つのプロトコルで戦う</li>' +
          '<li>3つずつ使い切って、3人に連勝する</li>' +
          '<li>クリアすると名前が一覧に載る</li>' +
          '<li>クリアで +30 XP。初クリアで専用スリーブ LAUREL、3週で称号 WEEKLY REGULAR、10週で WEEKLY LEGEND</li></ul>' + weekStatus +
          '<button type="button" class="rn-go" data-act="weekly">開く</button></section>' +
      '</div><div class="rn-btns"><button type="button" data-act="title">タイトルへ</button></div>';
    };

    const phaseBody = () => {
      const node = RUN.nodeById(run, run.pos);
      switch (run.phase) {
        case 'draft': {
          /* はじめの1つを選ぶときだけ、何をするモードなのかを書いておく */
          const intro = !run.deck.length
            ? '<p class="rn-lead">まず<b>プロトコルを3つ</b>、1つずつ選んでデッキを作ります。そのあと<b>地図を下から登り</b>、頂上の <b>BOSS</b> を倒せばクリア。<br>' +
              '<b>LIFE</b> は相手にコンパイルされるたびに 1 減り、0 で終わり。負けても同じ相手とやり直せます。<br>' +
              '道の途中で<b>パッチ</b> (改造) を集め、<b>カードを外して</b>デッキを研ぎ、自分だけのビルドを作ってください。</p>'
            : '';
          return '<h2>プロトコルを選ぶ <small>' + (run.deck.length + 1) + ' / 3</small></h2>' + intro +
            (run.deck.length ? '<p class="rn-note">選んだもの ' + deckLine(run.deck, byName) + '</p>' : '') +
            '<div class="rn-offers">' + run.offers.map(n => '<div class="rn-offer">' + protoChip(byName[n], 'data-pick="' + esc(n) + '"') +
              (cardsOf ? '<button type="button" class="rn-info" data-info="' + esc(n) + '">カードを見る</button>' : '') + '</div>').join('') + '</div>';
        }
        case 'patch': {
          const first = !run.pos;
          const why = first ? 'この勝ち抜き戦のあいだ、ずっと効きます。同じ系統 (HAND / GUARD / GREED / TEMPO) を集めるとボーナス。'
            : run.after === 'battle' ? '選んだら、警報で強くなった相手と戦います。'
              : node && node.type === 'treasure' ? '宝箱を開けた。' : '精鋭の戦利品です。';
          return '<h2>' + (first ? 'はじめのパッチを選ぶ' : 'パッチを1つ選ぶ') + '</h2><p class="rn-note">' + why + '</p>' +
            '<div class="rn-patchlist">' + (run.patchOffers || []).map(id => patchCard(RUN.patchInfo(id), 'data-patch="' + esc(id) + '"')).join('') + '</div>' +
            '<div class="rn-btns"><button type="button" data-act="nopatch">取らない</button></div>';
        }
        case 'map':
          return '<h2>進むマスを選ぶ <small>' + (rowNow(run) + 2) + ' / ' + RUN.MAP_ROWS + ' 段</small></h2>' +
            (run.removedNow ? '<p class="rn-note">' + esc(cardLabel(run.removedNow)) + ' をデッキから外した</p>' : '') +
            mapHtml(run, true) +
            '<div class="rn-deckbar"><span>デッキ ' + deckLine(run.deck, byName) + ' <em>除去 ' + (run.removed || []).length + ' / ' + RUN.MAX_REMOVED + '</em></span>' +
              '<button type="button" data-act="deck">' + (showDeck ? 'デッキを閉じる' : 'デッキを見る') + '</button></div>' +
            (showDeck ? deckCards(run, byName, false) : '') +
            '<div class="rn-btns"><button type="button" data-act="title">タイトルへ (続きはあとで)</button><button type="button" data-act="quit">あきらめる</button></div>';
        case 'event': {
          const ev = RUN.EVENTS[run.event];
          return '<h2>? EVENT — ' + esc(ev.title) + '</h2><p class="rn-lead">' + esc(ev.text) + '</p>' +
            '<div class="rn-routes">' + ev.options.map((o, i) => '<button type="button" class="rn-route event" data-event="' + i + '"' +
              (o.need && !o.need(run) ? ' disabled' : '') + '><b>' + esc(o.label) + '</b></button>').join('') + '</div>';
        }
        case 'rest':
          return '<h2>✚ 休憩所</h2><p class="rn-lead">焚き火のそばで一息つく。どちらか1つ。</p><div class="rn-routes">' +
            '<button type="button" class="rn-route rest" data-act="rest"' + (run.life >= run.maxLife ? ' disabled' : '') + '><small>REST</small><b>休む</b><span>ライフ +' + RUN.healAmount(run) + '</span></button>' +
            '<button type="button" class="rn-route smith" data-act="restRemove"' + (RUN.canRemove(run) ? '' : ' disabled') + '><small>PURGE</small><b>研ぐ</b><span>デッキからカードを1枚外す</span></button>' +
            '</div>';
        case 'remove':
          return '<h2>外すカードを選ぶ <small>除去 ' + (run.removed || []).length + ' / ' + RUN.MAX_REMOVED + '</small></h2>' +
            '<p class="rn-note">外したカードは、この勝ち抜き戦のあいだ山札に入りません (プロトコルを入れ替えると戻ります)。</p>' +
            deckCards(run, byName, true) +
            '<div class="rn-btns"><button type="button" data-act="unremove">やめる' + (run.after === 'shop' ? ' (代金は戻ります)' : '') + '</button></div>';
        case 'shop': {
          const credits = run.credits | 0;
          const items = run.shop.patches.map(id => {
            const p = RUN.patchInfo(id), price = RUN.patchPrice(run, id), sold = run.shop.sold.includes(id);
            return '<div class="rn-ware">' + patchCard(p, sold || credits < price ? 'disabled data-buy="' + esc(id) + '"' : 'data-buy="' + esc(id) + '"') +
              '<em class="' + (sold ? 'sold' : credits < price ? 'short' : '') + '">' + (sold ? 'SOLD' : price + ' CR') + '</em></div>';
          }).join('');
          const rp = RUN.removePrice(run), hp = RUN.healPrice(run);
          return '<h2>$ ショップ <small>CREDIT ' + credits + '</small></h2>' +
            '<div class="rn-patchlist">' + items + '</div>' +
            '<div class="rn-routes">' +
              '<button type="button" class="rn-route smith" data-act="buyRemove"' + (RUN.canRemove(run) && credits >= rp ? '' : ' disabled') + '><small>' + rp + ' CR</small><b>カード除去</b><span>デッキから1枚外す (買うたびに +2)</span></button>' +
              '<button type="button" class="rn-route rest" data-act="buyHeal"' + (!run.shop.healed && run.life < run.maxLife && credits >= hp ? '' : ' disabled') + '><small>' + hp + ' CR</small><b>修理</b><span>ライフ +' + RUN.RUN_HEAL + ' (1回だけ)</span></button>' +
            '</div><div class="rn-btns"><button type="button" class="rn-go" data-act="leave">店を出る</button></div>';
        }
        case 'reward':
          return '<h2>勝利！ <small>+' + (run.lastGain | 0) + ' CREDIT</small></h2>' +
            (run.cursedWin ? '<p class="rn-cursebreak">CURSE BROKEN — 呪いを破った！ RARE 以上確定の GACHA を引いた</p>' : '') + (swapAdd
            ? '<p class="rn-note"><b>' + esc(swapAdd) + '</b> を入れる代わりに、外すプロトコルを選ぶ</p>' +
              '<div class="rn-offers">' + run.deck.map(n => protoChip(byName[n], 'data-remove="' + esc(n) + '"')).join('') + '</div>' +
              '<div class="rn-btns"><button type="button" data-act="unswap">戻る</button></div>'
            : '<p class="rn-note">今のデッキ ' + deckLine(run.deck, byName) + '</p>' +
              '<h3>プロトコルを入れ替える (取らなくてもよい)</h3><div class="rn-offers">' + run.offers.map(n => '<div class="rn-offer">' +
                protoChip(byName[n], 'data-add="' + esc(n) + '"') +
                (cardsOf ? '<button type="button" class="rn-info" data-info="' + esc(n) + '">カードを見る</button>' : '') + '</div>').join('') + '</div>' +
              '<div class="rn-btns"><button type="button" class="rn-go" data-act="skip">取らずに進む</button></div>') +
            (run.pendingPatch && !swapAdd ? '<p class="rn-note rn-elite">精鋭の戦利品: このあとパッチを1つ選べます</p>' : '');
        case 'battle': {
          const last = run.history[run.history.length - 1];
          const retry = last && last.row === (node ? node.row : -1) && !last.win;
          const kind = run.opp.boss ? 'BOSS' : run.opp.elite ? '精鋭' : '戦闘';
          return (run.opp.boss ? '<div class="rn-bossban" data-text="FINAL BOSS" aria-hidden="true">FINAL BOSS</div>' : '') +
            '<h2>' + (run.opp.boss ? '♛' : run.opp.elite ? '☠' : '⚔') + ' ' + kind + ' <small>' + (rowNow(run) + 1) + ' / ' + RUN.MAP_ROWS + ' 段</small></h2>' +
            bonusList(run) +
            (run.route === 'cursed' ? '<p class="rn-cursed">CURSED — この試合は 自分の手札 4 枚・相手 7 枚。勝てば RARE 以上確定の GACHA</p>' : '') +
            (retry ? '<p class="rn-warn">負けたので同じ相手とやり直しです (ライフ −' + last.damage + ')' + (last.saved === 'phoenix' ? ' — PHOENIX でよみがえった！' : last.saved ? ' — FAILSAFE が作動してライフ 1 で耐えました' : '') + '</p>' : '') +
            (run.swapped ? '<p class="rn-note">転送装置: <b>' + esc(run.swapped.out) + '</b> が <b>' + esc(run.swapped.add) + '</b> に入れ替わった</p>' : '') +
            (run.opp.elite ? '<p class="rn-note rn-elite">ELITE — 勝つとクレジット多めとパッチを1つ</p>' : run.route === 'alarm' ? '<p class="rn-warn">警報が鳴っている — 相手が1段強い</p>' : '') +
            '<div class="rn-vs"><div><small>あなた' + ((run.removed || []).length ? ' (除去 ' + run.removed.length + ' 枚)' : '') + '</small>' + deckLine(run.deck, byName) + '</div><b>VS</b>' +
            '<div><small>' + esc(levelLabel(run.opp.level)) + '</small>' + deckLine(run.opp.deck, byName) + '</div></div>' +
            (confirmQuit ? '' : '<div class="rn-btns"><button type="button" class="rn-go" data-act="fight">戦う</button>' +
              '<button type="button" data-act="title">タイトルへ (続きはあとで)</button><button type="button" data-act="quit">あきらめる</button></div>');
        }
        default: return '';
      }
    };

    const render = () => {
      const active = run && run.phase !== 'over' && run.phase !== 'clear';
      if ((hub && active) || !active) {
        el.innerHTML = '<div class="rn-card"><div class="rn-head"><b>// RUN</b><span>2つのモード</span></div>' + hubHtml() + '</div>';
        return;
      }
      const quit = confirmQuit
        ? '<p class="rn-warn">この勝ち抜き戦をあきらめて終わりにしますか？ (記録は残ります)</p>' +
          '<div class="rn-btns"><button type="button" class="rn-danger" data-act="quitYes">あきらめる</button><button type="button" data-act="quitNo">続ける</button></div>'
        : '';
      el.innerHTML = '<div class="rn-card rn-ph-' + run.phase + '"><div class="rn-head"><b>// RUN</b><span>勝ち抜き戦</span></div>' +
        (run.phase !== 'draft' ? lifeBar(run) + patchStrip(run) : '') + phaseBody() + quit +
        (!swapAdd && !confirmQuit ? gachaBox(run) : '') + '</div>';
      /* 地図は、いまの段が見えるところまで送る */
      const wrap = el.querySelector('.rn-map-wrap');
      if (wrap) {
        const here = wrap.querySelector('.rn-node.reach') || wrap.querySelector('.rn-node.here');
        if (here) wrap.scrollTop = Math.max(0, here.offsetTop - wrap.clientHeight * 0.6);
      }
    };

    el.onclick = (ev) => {
      const t = ev.target.closest('button');
      if (!t || t.disabled) return;
      if (t.dataset.info) { info(t.dataset.info); return; }
      if (t.dataset.heat) { heatSel = +t.dataset.heat; render(); return; }
      if (t.dataset.node) { set(RUN.chooseNode(run, t.dataset.node, names)); return; }
      if (t.dataset.patch) { set(RUN.choosePatch(run, t.dataset.patch, names)); return; }
      if (t.dataset.buy) { set(RUN.buyPatch(run, t.dataset.buy)); return; }
      if (t.dataset.rm) { set(RUN.removeCard(run, t.dataset.rm)); return; }
      if (t.dataset.event) { set(RUN.resolveEvent(run, +t.dataset.event, names)); return; }
      if (t.dataset.pick) { set(RUN.draftPick(run, t.dataset.pick, names)); return; }
      if (t.dataset.add) { swapAdd = t.dataset.add; render(); return; }
      if (t.dataset.remove) { const add = swapAdd; swapAdd = null; set(RUN.applyReward(run, { type: 'swap', add, remove: t.dataset.remove }, names)); return; }
      switch (t.dataset.act) {
        case 'start': hub = false; set(RUN.newRun(names, Math.random, heatSel)); break;
        case 'nopatch': set(RUN.choosePatch(run, null, names)); break;
        case 'gacha': {
          if (pulling) break;
          const next = RUN.gachaPull(run);
          if (next === run) break;
          pulling = true;
          playGacha(el, next.lastPull).then(() => { pulling = false; set(next); });
          break;
        }
        case 'deck': showDeck = !showDeck; render(); break;
        case 'rest': set(RUN.restHeal(run)); break;
        case 'restRemove': set(RUN.restRemove(run)); break;
        case 'unremove': set(RUN.cancelRemove(run)); break;
        case 'buyRemove': set(RUN.buyRemove(run)); break;
        case 'buyHeal': set(RUN.buyHeal(run)); break;
        case 'leave': set(RUN.leaveShop(run)); break;
        case 'resume': hub = false; render(); break;
        case 'weekly': done({ go: 'weekly' }); break;
        case 'title': done(null); break;
        case 'unswap': swapAdd = null; render(); break;
        case 'skip': set(RUN.applyReward(run, { type: 'skip' }, names)); break;
        case 'fight': done({ me: run.deck.slice(), ai: run.opp.deck.slice(), level: run.opp.level, kind: 'run' }); break;
        case 'quit': confirmQuit = true; render(); break;
        case 'quitNo': confirmQuit = false; render(); break;
        case 'quitYes': confirmQuit = false; set({ ...run, phase: 'over' }); break;
        default: break;
      }
    };
    render();
  });
}

/* 対戦中のライフ表示。lost = この試合でここまでにコンパイルされた回数 */
export function runHud(lost) {
  const run = RUN.loadRun();
  if (!run || run.phase !== 'battle') return;
  let el = document.getElementById('runHud');
  if (!el) {
    el = document.createElement('div');
    el.id = 'runHud';
    document.body.appendChild(el);
  }
  const dmg = RUN.damageOf(run, lost);          // FIREWALL は最初の1回を防ぐ
  const label = run.opp && run.opp.boss ? 'BOSS' : (rowNow(run) + 1) + '段目' + (run.opp && run.opp.elite ? ' 精鋭' : '');
  el.innerHTML = '<small>' + label + '</small>' + lifeBar(run, Math.min(run.life, dmg));
  el.classList.toggle('danger', run.life - dmg <= 2);
}

/* 決着後: 結果を入れて、次の画面 (報酬・やり直し・終わり) へ */
export function showRunAfterGame(win, damage, protocols) {
  const names = protocols.map(p => p.name);
  const byName = Object.fromEntries(protocols.map(p => [p.name, p]));
  const before = RUN.loadRun();
  if (!before || before.phase !== 'battle') return;
  const run = RUN.finishBattle(before, win, damage, names);
  RUN.saveRun(run);
  const el = overlay();
  el.classList.add('after');
  const title = run.phase === 'clear' ? 'BOSS 撃破！' : run.phase === 'over' ? 'ライフが尽きた' : win ? '勝利' : '敗北';
  const last = run.history[run.history.length - 1] || { damage };
  const heatNote = run.phase === 'clear' && (run.heat | 0) < RUN.MAX_HEAT ? '<p class="rn-note">HEAT ' + ((run.heat | 0) + 1) + ' が解放されました</p>' : '';
  const line = run.phase === 'clear'
    ? '頂上まで登りきりました。ライフ ' + run.life + ' 残し。'
    : run.phase === 'over' ? (rowNow(run) + 1) + ' 段目で終わりました。'
      : win ? '+' + (run.lastGain | 0) + ' クレジット。報酬を選んでから地図へ戻ります。' : '同じ相手ともう一度戦います。';
  el.innerHTML = '<div class="rn-card"><div class="rn-head"><b>// RUN</b><span>勝ち抜き戦</span></div>' +
    '<h2>' + title + '</h2><p class="rn-note">この試合でコンパイルされた回数 <b>' + damage + '</b> → ライフ −' + last.damage +
      (last.damage < damage ? ' (FIREWALL で1回防いだ)' : '') + '</p>' +
    (last.saved === 'phoenix' ? '<p class="rn-warn rn-phoenix">PHOENIX — ライフ全回復でよみがえった！</p>'
      : last.saved ? '<p class="rn-warn">FAILSAFE が作動 — ライフ 1 で耐えた</p>' : '') +
    lifeBar({ ...run, life: Math.max(0, run.life) }) + '<p class="rn-lead">' + line + '</p>' + heatNote +
    (run.phase === 'over' || run.phase === 'clear' ? '<p class="rn-note">デッキ ' + deckLine(run.deck, byName) + '</p>' + patchStrip(run) : '') +
    '<div class="rn-btns">' +
      (run.phase === 'over' || run.phase === 'clear' ? '' : '<button type="button" class="rn-go" data-act="next">次へ</button>') +
      '<button type="button" data-act="board">盤面を見る</button><button type="button" data-act="title">タイトルへ</button></div></div>';
  if (run.phase === 'clear') { el.classList.add('rn-clear'); confetti(RAR_COLORS.L, 320); setTimeout(() => confetti(RAR_COLORS.E, 200), 900); }
  el.onclick = (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.act === 'next') location.href = location.pathname + '?run=1';
    else if (t.dataset.act === 'title') location.href = location.pathname;
    else if (t.dataset.act === 'board') {
      el.classList.remove('show');
      const back = document.createElement('button');
      back.type = 'button';
      back.id = 'runBack';
      back.textContent = run.phase === 'over' || run.phase === 'clear' ? 'タイトルへ' : '勝ち抜き戦へ戻る';
      back.onclick = () => { back.remove(); el.classList.add('show'); };
      document.body.appendChild(back);
    }
  };
}
