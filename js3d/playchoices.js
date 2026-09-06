/* Use legal actions, including effect exceptions, as the sole source of buttons. */
export function placementChoices(actions, uid, turn) {
  return actions.filter(a => a.type === 'play' && a.card === uid)
    .map(a => ({ ...a, side: a.side ?? turn }));
}

export function renderPlayChoices(root, options, protocols, title, choose, cancel) {
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
      cell.append(label);
      for (const action of choices) {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = action.faceUp ? '表' : '裏';
        button.className = action.faceUp ? 'place-faceup' : 'place-facedown';
        button.setAttribute('aria-label', label.textContent + 'に' + (action.faceUp ? '表で置く' : '裏で置く'));
        button.onclick = () => choose(action); cell.append(button);
      }
      root.append(cell);
    }
  }
}
