/* =========================================================================
 * トレーニング: 検証盤面の操作パネル
 *   - 候補は対局に選んだ6プロトコル (自分3 / 相手3) のカードだけ
 *   - 「効果あり」なら置く・反転・削除・手札に戻すで効果を解決する
 *   - カードを選ぶ → 光っている枠をタップで置く。場・手札のカードは
 *     選ぶと反転や移動のボタンが出る
 *   描画は render(model) に集約し、main.js が状態を持つ。
 * ========================================================================= */
import { faceImageURL } from './cardtex.js';

const ZONE_LABEL = { field: '場', hand: '手札', trash: '捨て札', deck: '山札' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* model: {
     side, effects, faceUp, collapsed, canUndo,
     protocols: [[{name,color}] x3, [..] x3],
     cards: [{ uid, def, zone, line?, faceUp }]   // side ごとの18枚
     sel: uid | null
   } */
export function mountTrainingTools(defs, handlers) {
  const root = document.createElement('aside');
  root.id = 'trainingTools';
  document.body.appendChild(root);
  let model = null;

  function cardTile(c, sel) {
    const d = defs[c.def];
    const zone = c.zone === 'deck' ? '' : '<i class="tr-zone z-' + c.zone + '">' + ZONE_LABEL[c.zone] + '</i>';
    return '<button type="button" class="tr-tile' + (c.uid === sel ? ' on' : '') + (c.zone === 'deck' ? '' : ' used') +
      '" data-uid="' + esc(c.uid) + '" title="' + esc(d.proto + ' ' + d.value) + '">' +
      '<img alt="" src="' + faceImageURL(d) + '" loading="lazy"><b>' + d.value + '</b>' + zone + '</button>';
  }

  function selPanel(m) {
    const c = m.cards.find(x => x.uid === m.sel);
    if (!c) {
      return '<div class="tr-sel empty"><span>カードを選ぶと、ここに操作が出ます</span></div>';
    }
    const d = defs[c.def];
    const btn = (act, label, cls) => '<button type="button" class="tr-act' + (cls ? ' ' + cls : '') + '" data-act="' + act + '">' + label + '</button>';
    let hint = '', acts = '';
    if (c.zone === 'field') {
      hint = '別のラインの光っている枠をタップすると移動 (効果ありならプレイ扱い)';
      acts = btn('flip', c.faceUp ? '裏にする' : '表にする') + btn('hand', '手札へ') + btn('trash', m.effects ? '削除' : '捨て札へ');
    } else if (c.zone === 'hand') {
      hint = '光っている枠をタップしてプレイ';
      acts = btn('trash', '捨てる') + btn('deck', '山札の上へ');
    } else {
      hint = '光っている枠をタップして置く';
      acts = btn('hand', '手札へ') + (c.zone === 'trash' ? btn('deck', '山札の上へ') : btn('trash', '捨て札へ'));
    }
    return '<div class="tr-sel" style="--pc:' + (d.color || '#63f3ff') + '">' +
      '<div class="tr-sel-head"><b>' + esc(d.proto + ' ' + d.value) + '</b><span>' + ZONE_LABEL[c.zone] + '</span>' +
        '<button type="button" class="tr-x" data-act="deselect" aria-label="選択を外して一覧に戻る">×</button></div>' +
      (c.zone === 'field' ? '' :
        '<div class="tr-face"><button type="button" data-face="up" class="' + (m.faceUp ? 'on' : '') + '">表で置く</button>' +
        '<button type="button" data-face="down" class="' + (m.faceUp ? '' : 'on') + '">裏で置く</button></div>') +
      '<p class="tr-hint">' + hint + '</p>' +
      '<div class="tr-acts">' + acts + '</div></div>';
  }

  function render(m) {
    model = m;
    const sideName = m.side === 0 ? '自分' : '相手';
    const groups = [0, 1, 2].map((i) => {
      const proto = m.protocols[m.side][i];
      const list = m.cards.filter(c => defs[c.def].proto === proto.name)
        .sort((a, b) => defs[a.def].value - defs[b.def].value);
      return '<div class="tr-group" style="--pc:' + (proto.color || '#63f3ff') + '">' +
        '<div class="tr-gname">' + esc(proto.name) + '</div>' +
        '<div class="tr-tiles">' + list.map(c => cardTile(c, m.sel)).join('') + '</div></div>';
    }).join('');
    root.classList.toggle('collapsed', !!m.collapsed);
    /* スマホではカードを選んだら一覧を畳み、盤面の置き先を見せる (× で一覧に戻る) */
    root.classList.toggle('has-sel', !!m.cards.find(x => x.uid === m.sel));
    root.innerHTML =
      '<div class="tr-top">' +
        '<b class="tr-title">TRAINING</b>' +
        '<div class="tr-seg" role="group" aria-label="効果の処理">' +
          '<button type="button" data-eff="1" class="' + (m.effects ? 'on' : '') + '">効果あり</button>' +
          '<button type="button" data-eff="0" class="' + (m.effects ? '' : 'on') + '">置くだけ</button></div>' +
        '<button type="button" class="tr-fold" data-act="fold">' + (m.collapsed ? 'カード一覧 ▴' : '▾') + '</button>' +
      '</div>' +
      '<div class="tr-body">' +
        '<div class="tr-sides" role="tablist">' +
          '<button type="button" data-side="0" class="me' + (m.side === 0 ? ' on' : '') + '">自分のカード</button>' +
          '<button type="button" data-side="1" class="opp' + (m.side === 1 ? ' on' : '') + '">相手のカード</button></div>' +
        '<div class="tr-groups">' + groups + '</div>' +
        selPanel(m) +
        '<div class="tr-tools">' +
          '<span>' + sideName + 'の</span>' +
          '<button type="button" data-act="draw">1枚引く</button>' +
          '<button type="button" data-act="start">開始時効果</button>' +
          '<button type="button" data-act="end">終了時効果</button></div>' +
        '<div class="tr-foot">' +
          '<button type="button" data-act="undo"' + (m.canUndo ? '' : ' disabled') + '>↶ 1手戻す</button>' +
          '<button type="button" data-act="reset" class="warn">盤面をリセット</button></div>' +
        '<button type="button" class="tr-share" data-act="share">この盤面を問題として共有</button>' +
      '</div>';
  }

  /* 一覧のカードに触れたら、その効果を詳細パネルに出す */
  root.addEventListener('pointerover', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-uid]');
    if (t && handlers.peek) handlers.peek(t.dataset.uid);
  });
  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t || !model || t.disabled) return;
    if (t.dataset.uid) { handlers.select(t.dataset.uid === model.sel ? null : t.dataset.uid); return; }
    if (t.dataset.eff !== undefined) { handlers.setEffects(t.dataset.eff === '1'); return; }
    if (t.dataset.side !== undefined) { handlers.setSide(+t.dataset.side); return; }
    if (t.dataset.face) { handlers.setFaceUp(t.dataset.face === 'up'); return; }
    const act = t.dataset.act;
    if (act === 'fold') handlers.fold();
    else if (act === 'deselect') handlers.select(null);
    else if (act === 'undo') handlers.undo();
    else if (act === 'share') handlers.share && handlers.share();
    else if (act === 'reset') handlers.reset();
    else if (act === 'draw') handlers.act({ type: 'trainingDraw', side: model.side });
    else if (act === 'start' || act === 'end') handlers.act({ type: 'trainingPhase', side: model.side, which: act });
    else if (act === 'flip') handlers.act({ type: 'trainingFlip', card: model.sel });
    else if (act === 'hand' || act === 'trash' || act === 'deck') handlers.act({ type: 'trainingMove', card: model.sel, to: act });
  });

  return { render, remove: () => root.remove() };
}
