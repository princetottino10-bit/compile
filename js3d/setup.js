/* =========================================================================
 * 3Dビュー: 対戦開始前のプロトコル選択
 *   30 プロトコルから3つ選ぶ。相手は残りから自動で組む。
 * ========================================================================= */

import { emblemDataURL } from './emblems.js';

const AI_LABELS = ['かんたん', 'ふつう', 'つよい', '最強'];
/* 最強はこの固定編成 + 特化戦略で戦う (auto-play と同じ) */
export const STRONGEST_AI = ['DARKNESS', 'SPEED', 'HATE'];

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
      /* 最強はAIが DARKNESS/SPEED/HATE を使うため、プレイヤーは選べない */
      if (level === 3) {
        for (const n of STRONGEST_AI) {
          const idx = picked.indexOf(n);
          if (idx >= 0) picked.splice(idx, 1);
        }
      }
      grid.querySelectorAll('.proto').forEach((el) => {
        const locked = level === 3 && STRONGEST_AI.includes(el.dataset.name);
        el.classList.toggle('locked', locked);
        el.classList.toggle('on', picked.includes(el.dataset.name));
      });
      sync();
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
      '<img class="proto-emblem" alt="" src="' + emblemDataURL(p.name, p.color || '#63f3ff', 96, true) + '">' +
      '<span class="proto-name">' + p.name + '</span>' +
      '<span class="proto-set">' + (p.set || '') + '</span>';
    b.onclick = () => {
      if (b.classList.contains('locked')) return;
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
    const onlineBtn = document.getElementById('setupOnline');
    if (onlineBtn) onlineBtn.onclick = () => {
      root.classList.remove('show');
      resolve({ online: true });
    };
    startBtn.onclick = () => {
      if (picked.length !== 3) return;
      let ai;
      if (level === 3) {
        ai = STRONGEST_AI.slice();
      } else {
        const rest = protocols.map(p => p.name).filter(n => !picked.includes(n));
        ai = [];
        while (ai.length < 3 && rest.length) {
          ai.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
        }
      }
      root.classList.remove('show');
      setTimeout(() => { root.style.display = 'none'; }, 500);
      resolve({ me: picked.slice(), ai, level });
    };
  });
}
