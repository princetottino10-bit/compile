/* =========================================================================
 * 3Dビュー: 対戦開始前のプロトコル選択
 *   30 プロトコルから3つ選ぶ。相手は残りから自動で組む。
 * ========================================================================= */

import { emblemDataURL } from './emblems.js';

const AI_LABELS = ['かんたん', 'ふつう', 'つよい', '最強', 'ロック特化'];
/* 最強はこの固定編成 + 特化戦略で戦う (auto-play と同じ) */
export const STRONGEST_AI = ['DARKNESS', 'SPEED', 'HATE'];
/* ロック特化: サイキック①を覆って「相手は裏向きでしかプレイできない」を永続させる。
   ダークネス②で覆われた①を表にするか、スピード③の終了時の移動で①を覆う */
export const LOCK_AI = ['PSYCHIC', 'DARKNESS', 'SPEED'];
/* 難易度ごとの AI 固定編成 (無い難易度はランダム編成) */
const FIXED_AI = { 3: STRONGEST_AI, 4: LOCK_AI };

export function runSetup(protocols, options = {}) {
  const training = !!options.training;
  const root = document.getElementById('setup');
  const grid = document.getElementById('setupGrid');
  const startBtn = document.getElementById('setupStart');
  const levelWrap = document.getElementById('setupLevels');
  const countEl = document.getElementById('setupCount');

  const picked = [];
  let level = 1;

  document.querySelector('#setupHead h1').innerHTML = training ? '<b>//</b> TRAINING SETUP' : '<b>//</b> PROTOCOL SELECT';
  document.querySelector('#setupHead p').textContent = training
    ? 'まず自分のプロトコルを3つ選ぶ。次に相手の3つを選ぶ。置けるのはこの6つのカードだけ。'
    : '使用するプロトコルを3つ選ぶ。相手は残りから自動で編成される。';
  startBtn.textContent = training ? '次へ: 相手のプロトコル' : '対戦開始';
  /* トレーニングは 自分 → 相手 の2段階で選ぶ */
  let trainingMine = null;
  let sameBtn = document.getElementById('setupSame');
  if (sameBtn) sameBtn.remove();
  sameBtn = null;
  const onlineBtn = document.getElementById('setupOnline');
  onlineBtn.hidden = training || options.allowOnline === false;
  levelWrap.hidden = training;

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
      /* 固定編成の難易度では、AI が使うプロトコルをプレイヤーは選べない */
      const fixed = FIXED_AI[level] || [];
      for (const n of fixed) {
        const idx = picked.indexOf(n);
        if (idx >= 0) picked.splice(idx, 1);
      }
      grid.querySelectorAll('.proto').forEach((el) => {
        const locked = fixed.includes(el.dataset.name);
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
    if (onlineBtn) onlineBtn.onclick = () => {
      root.classList.remove('show');
      resolve({ online: true });
    };
    const finishTraining = (mine, opp) => {
      if (sameBtn) sameBtn.remove();
      root.classList.remove('show');
      setTimeout(() => { root.style.display = 'none'; }, 500);
      resolve({ me: mine, ai: opp, level, training });
    };
    startBtn.onclick = () => {
      if (picked.length !== 3) return;
      let ai;
      if (training && !trainingMine) {
        trainingMine = picked.slice();
        picked.length = 0;
        document.querySelector('#setupHead h1').innerHTML = '<b>//</b> TRAINING — 相手のプロトコル';
        document.querySelector('#setupHead p').textContent =
          '自分: ' + trainingMine.join(' / ') + '　相手の3つを選ぶ (同じプロトコルも選べる)';
        startBtn.textContent = 'トレーニング開始';
        grid.querySelectorAll('.proto').forEach(el => el.classList.remove('on'));
        sameBtn = document.createElement('button');
        sameBtn.id = 'setupSame';
        sameBtn.type = 'button';
        sameBtn.className = 'lvl';
        sameBtn.style.marginLeft = 'auto';
        sameBtn.textContent = '自分と同じ3つ';
        sameBtn.onclick = () => finishTraining(trainingMine.slice(), trainingMine.slice());
        startBtn.before(sameBtn);
        sync();
        return;
      }
      if (training) {
        finishTraining(trainingMine.slice(), picked.slice());
        return;
      } else if (FIXED_AI[level]) {
        ai = FIXED_AI[level].slice();
      } else {
        const rest = protocols.map(p => p.name).filter(n => !picked.includes(n));
        ai = [];
        while (ai.length < 3 && rest.length) {
          ai.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
        }
      }
      root.classList.remove('show');
      setTimeout(() => { root.style.display = 'none'; }, 500);
      resolve({ me: picked.slice(), ai, level, training });
    };
  });
}
