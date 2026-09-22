/* Use legal actions, including effect exceptions, as the sole source of buttons. */
export function placementChoices(actions, uid, turn) {
  return actions.filter(a => a.type === 'play' && a.card === uid)
    .map(a => ({ ...a, side: a.side ?? turn }));
}

/* preview(action) -> { from, to }: 置く前と置いたあとのラインの合計値 (無ければ出さない) */
export function renderPlayChoices(root, options, protocols, title, choose, cancel, preview) {
  root.replaceChildren();
  root.hidden = !title;
  document.body.classList.toggle('choosing-placement', !!title);
  if (!title) return;
  /* 配置方式は右側の一覧ではなく、各ラインの真上に置く。
     選べる向きだけを出すため、対応ラインは「表 / 裏」、それ以外は「裏」だけになる。 */
  const cancelButton = document.createElement('button');
  cancelButton.className = 'placement-cancel';
  cancelButton.type = 'button'; cancelButton.textContent = '選択解除'; cancelButton.onclick = cancel;
  cancelButton.setAttribute('aria-label', title + 'の配置選択を解除');
  root.append(cancelButton);
  for (const side of [0, 1]) {
    for (let line = 0; line < 3; line++) {
      const choices = options.filter(a => a.side === side && a.line === line)
        .sort((a, b) => Number(b.faceUp) - Number(a.faceUp));
      if (!choices.length) continue;
      const cell = document.createElement('section');
      cell.className = 'placement-lane';
      cell.dataset.side = side; cell.dataset.line = line;
      const label = document.createElement('span');
      label.className = 'placement-lane-label';
      label.textContent = protocols[side][line].name;
      const first = preview ? preview(choices[0]) : null;
      if (first) {
        const now = document.createElement('i');
        now.className = 'placement-now';
        now.textContent = first.from;
        label.append(' ', now);
      }
      cell.append(label);
      for (const action of choices) {
        const button = document.createElement('button'); button.type = 'button';
        const p = preview ? preview(action) : null;
        const face = action.faceUp ? '表' : '裏';
        /* 置いたあとの合計値を添える (「表 →10」)。今の合計値はライン名の横 */
        if (p) {
          const b = document.createElement('b'); b.textContent = face;
          const small = document.createElement('small'); small.textContent = '→' + p.to;
          button.append(b, small);
        } else {
          button.textContent = face;
        }
        button.className = action.faceUp ? 'place-faceup' : 'place-facedown';
        button.setAttribute('aria-label', protocols[side][line].name + 'に' + (action.faceUp ? '表で置く' : '裏で置く') +
          (p ? ' (合計 ' + p.from + ' → ' + p.to + ')' : ''));
        button.onclick = () => choose(action); cell.append(button);
      }
      root.append(cell);
    }
  }
}
