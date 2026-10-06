/* Use legal actions, including effect exceptions, as the sole source of buttons. */
export function placementChoices(actions, uid, turn) {
  return actions.filter(a => a.type === 'play' && a.card === uid)
    .map(a => ({ ...a, side: a.side ?? turn }));
}

/* totalAfter(action): 置いたあとのそのラインの合計 (効果を解く前)。無ければ出さない
   blocked(side, line): そのラインで出せない向きと理由 [{ faceUp, reason }]。鍵付きのボタンで見せ、押すと理由を言う (notice)
   valueNote(action): 置いた札の数え方がふつうと違うとき { base, value } (勝ち抜き戦のパッチなど)。「5→10」と添える */
export function renderPlayChoices(root, options, protocols, title, choose, cancel, totalAfter, blocked, notice, valueNote) {
  root.replaceChildren();
  root.hidden = !title;
  document.body.classList.toggle('choosing-placement', !!title);
  if (!title) return;
  /* 配置方式は右側の一覧ではなく、各ラインの真上に置く。
     選べる向きだけを出すため、対応ラインは「表 / 裏」、それ以外は「裏」だけになる。 */
  const cancelButton = document.createElement('button');
  cancelButton.className = 'placement-cancel';
  cancelButton.type = 'button'; cancelButton.textContent = 'CANCEL'; cancelButton.onclick = cancel;
  cancelButton.setAttribute('aria-label', title + 'の配置選択を解除');
  root.append(cancelButton);
  for (const side of [0, 1]) {
    for (let line = 0; line < 3; line++) {
      const choices = options.filter(a => a.side === side && a.line === line)
        .sort((a, b) => Number(b.faceUp) - Number(a.faceUp));
      const locked = blocked ? blocked(side, line) || [] : [];
      if (!choices.length && !locked.length) continue;
      const cell = document.createElement('section');
      cell.className = 'placement-lane';
      cell.dataset.side = side; cell.dataset.line = line;
      /* プロトコル名はすぐ下のプロトコル板にあるので出さない (読み上げ用のラベルにだけ使う) */
      const name = protocols[side][line].name;
      for (const action of choices) {
        const button = document.createElement('button'); button.type = 'button';
        const face = document.createElement('span');
        face.textContent = action.faceUp ? '表' : '裏';
        button.append(face);
        const total = totalAfter ? totalAfter(action) : null;
        if (Number.isFinite(total)) {
          const t = document.createElement('small');
          t.className = 'place-total';
          const arrow = document.createElement('i');
          arrow.textContent = '→';
          t.append(arrow, String(total));
          button.append(t);
        }
        const vn = valueNote ? valueNote(action) : null;
        let why = '';
        if (vn) {
          const n = document.createElement('b');
          n.className = 'place-note ' + (vn.value > vn.base ? 'up' : 'down');
          n.textContent = vn.base + '→' + vn.value;
          button.append(n);
          why = 'パッチの効果で、この札は ' + vn.base + ' ではなく ' + vn.value + ' として数えます';
          button.title = why;
        }
        button.className = action.faceUp ? 'place-faceup' : 'place-facedown';
        button.setAttribute('aria-label', name + 'に' + (action.faceUp ? '表で置く' : '裏で置く')
          + (Number.isFinite(total) ? '。置くと合計 ' + total : '') + (why ? '。' + why : ''));
        button.onclick = () => choose(action); cell.append(button);
      }
      /* 出せない向き: 鍵付きで残し、押すと理由 (前は黙って消えていて、なぜ表で出せないか分からなかった) */
      for (const b of locked) {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'place-locked ' + (b.faceUp ? 'place-faceup' : 'place-facedown');
        const face = document.createElement('span');
        face.textContent = (b.faceUp ? '表' : '裏');
        const lock = document.createElement('i');
        lock.className = 'place-lock'; lock.setAttribute('aria-hidden', 'true'); lock.textContent = '🔒';
        button.append(face, lock);
        button.setAttribute('aria-label', name + 'に' + (b.faceUp ? '表' : '裏') + 'では出せない。' + b.reason);
        button.title = b.reason;
        button.onclick = () => { if (notice) notice(b.reason); };
        if (b.faceUp) cell.prepend(button); else cell.append(button);
      }
      root.append(cell);
    }
  }
}
