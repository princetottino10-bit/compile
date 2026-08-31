/* =========================================================================
 * 3Dビュー: 対戦開始前のプロトコル選択
 *   30 プロトコルから3つ選ぶ。相手は残りから自動で組む。
 * ========================================================================= */

const AI_LABELS = ['かんたん', 'ふつう', 'つよい'];

export function runSetup(protocols) {
  const root = document.getElementById('setup');
  const grid = document.getElementById('setupGrid');
  const startBtn = document.getElementById('setupStart');
  const levelWrap = document.getElementById('setupLevels');
  const countEl = document.getElementById('setupCount');

  const picked = [];
  let level = 1;

  /* 難易度 */
  levelWrap.innerHTML = '';
  AI_LABELS.forEach((label, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lvl' + (i === level ? ' on' : '');
    b.textContent = label;
    b.onclick = () => {
      level = i;
      levelWrap.querySelectorAll('.lvl').forEach((el, j) => el.classList.toggle('on', j === i));
    };
    levelWrap.appendChild(b);
  });

  /* プロトコル一覧 */
  grid.innerHTML = '';
  for (const p of protocols) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'proto';
    b.dataset.name = p.name;
    b.style.setProperty('--accent', p.color || '#63f3ff');
    b.innerHTML =
      '<span class="proto-art" style="background-image:url(&quot;art/' +
        p.name.charAt(0) + p.name.slice(1).toLowerCase() + '.webp&quot;)"></span>' +
      '<span class="proto-name">' + p.name + '</span>' +
      '<span class="proto-set">' + (p.set || '') + '</span>';
    b.onclick = () => {
      const i = picked.indexOf(p.name);
      if (i >= 0) picked.splice(i, 1);
      else if (picked.length < 3) picked.push(p.name);
      else return;
      b.classList.toggle('on', picked.includes(p.name));
      sync();
    };
    grid.appendChild(b);
  }

  function sync() {
    countEl.textContent = picked.length + ' / 3';
    startBtn.disabled = picked.length !== 3;
    grid.querySelectorAll('.proto').forEach((el) => {
      el.classList.toggle('dim', picked.length >= 3 && !picked.includes(el.dataset.name));
    });
  }
  sync();

  root.classList.add('show');

  return new Promise((resolve) => {
    startBtn.onclick = () => {
      if (picked.length !== 3) return;
      const rest = protocols.map(p => p.name).filter(n => !picked.includes(n));
      /* 相手は残りからランダムに3つ */
      const ai = [];
      while (ai.length < 3 && rest.length) {
        ai.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
      }
      root.classList.remove('show');
      setTimeout(() => { root.style.display = 'none'; }, 500);
      resolve({ me: picked.slice(), ai, level });
    };
  });
}
