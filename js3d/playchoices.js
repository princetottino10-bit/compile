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
  const heading = document.createElement('div');
  heading.className = 'placement-heading';
  const label = document.createElement('strong');
  label.textContent = title + '：置き方を選択';
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = '選択解除'; close.onclick = cancel;
  heading.append(label, close); root.append(heading);
  for (const side of [0, 1]) {
    if (side === 1 && !options.some(a => a.side === 1)) continue;
    const grid = document.createElement('div'); grid.className = 'placement-grid';
    for (let line = 0; line < 3; line++) {
      const cell = document.createElement('section');
      cell.dataset.side = side; cell.dataset.line = line;
      const name = document.createElement('h3');
      name.textContent = (side ? '相手 ' : '') + ['左 ', '中央 ', '右 '][line] + protocols[side][line].name;
      cell.append(name);
      const choices = options.filter(a => a.side === side && a.line === line).sort((a,b) => Number(b.faceUp) - Number(a.faceUp));
      for (const action of choices) {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = action.faceUp ? '表で置く' : '裏で置く';
        button.className = action.faceUp ? 'place-faceup' : 'place-facedown';
        button.setAttribute('aria-label', name.textContent + 'に' + button.textContent);
        button.onclick = () => choose(action); cell.append(button);
      }
      if (!choices.length) { const note = document.createElement('p'); note.textContent = '配置不可'; cell.append(note); }
      grid.append(cell);
    }
    root.append(grid);
  }
}
