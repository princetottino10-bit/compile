/* 対戦中の名札: 相手 (左上) と自分 (左下) に、アイコン・名前・称号 (CPU は難易度) を出す。
   CPU 戦・勝ち抜き戦・週替わり・オンラインで共通。観戦・問題・チュートリアル・トレーニングでは出さない。
   plate: { name, sub, level, icon: { name, color } | null, frame } (sub は称号や難易度。無ければ出さない。frame は名札の枠の見た目) */
import { emblemDataURL } from './emblems.js';

function fill(el, plate, lead) {
  el.textContent = '';
  if (!plate || !plate.name) { el.hidden = true; return; }
  el.dataset.frame = plate.frame && /^[a-z0-9_]{1,24}$/.test(plate.frame) ? plate.frame : 'default';
  /* プロトコルの習熟度の名札 (p_fire など) は、そのプロトコルの色 */
  if (plate.frameColor) el.style.setProperty('--pfc', plate.frameColor); else el.style.removeProperty('--pfc');
  const ic = document.createElement('span');
  ic.className = 'pl-icon';
  if (plate.icon) {
    const img = document.createElement('img');
    img.alt = '';
    /* 顔のアイコン (CHIP で交換) は絵をそのまま、プロトコルは記号 */
    img.src = plate.icon.src || emblemDataURL(plate.icon.name, plate.icon.color || '#b9a4ff', 40, true);
    if (plate.icon.face) img.className = 'face';
    ic.style.setProperty('--pc', plate.icon.color || '#b9a4ff');
    ic.append(img);
  } else {
    ic.textContent = plate.name.slice(0, 1).toUpperCase();
  }
  const text = document.createElement('span');
  text.className = 'pl-text';
  const top = document.createElement('span');
  top.className = 'pl-top';
  if (lead) {
    const i = document.createElement('i');
    i.textContent = lead;
    top.append(i);
  }
  const b = document.createElement('b');
  b.textContent = plate.name;
  top.append(b);
  if (plate.level) {
    const lv = document.createElement('em');
    lv.textContent = 'LV ' + plate.level;
    top.append(lv);
  }
  text.append(top);
  if (plate.sub) {
    const s = document.createElement('small');
    s.textContent = plate.sub;
    text.append(s);
  }
  el.append(ic, text);
  el.hidden = false;
  /* 名前と称号は省略しない: 入りきらなければ文字を小さくして全部見せる */
  requestAnimationFrame(() => { fitText(b, 8); const sm = text.querySelector('small'); if (sm) fitText(sm, 7); });
}

/* 1行に入りきらないとき、入るまで文字を小さくする (下限 min px) */
function fitText(node, min) {
  if (!node || !node.isConnected) return;
  node.style.fontSize = '';
  let size = parseFloat(getComputedStyle(node).fontSize) || 14;
  for (let k = 0; k < 12 && node.scrollWidth > node.clientWidth + 1 && size > min; k++) {
    size = Math.max(min, size - 1);
    node.style.fontSize = size + 'px';
  }
}

export function showPlates({ me, opp }) {
  const oppEl = document.getElementById('vsTag');
  const meEl = document.getElementById('meTag');
  if (oppEl) fill(oppEl, opp, 'VS');
  if (meEl) fill(meEl, me, '');
}

/* 勝ちまでの進み具合: 名札の横に、コンパイル済みの数だけ埋まった丸 (●●○)。
   need: 勝ちに要るコンパイルの数 (ボス戦などで側ごとに違う)。名札が出ていないときは何もしない */
export function setCompileProgress(me, opp) {
  for (const [id, v] of [['meTag', me], ['vsTag', opp]]) {
    const el = document.getElementById(id);
    if (!el || el.hidden || !v) continue;
    let box = el.querySelector('.pl-comp');
    if (!box) {
      box = document.createElement('span');
      box.className = 'pl-comp';
      /* 名前の下の段に置く (横に伸ばすと、自分の名札は「SHOW HAND」に隠れていた) */
      (el.querySelector('.pl-text') || el).append(box);
    }
    const need = Math.max(1, Math.min(6, v.need | 0));
    const done = Math.max(0, Math.min(need, v.done | 0));
    box.title = 'コンパイル ' + done + ' / ' + need + ' (そろえば勝ち)';
    box.setAttribute('aria-label', box.title);
    box.innerHTML = '<i>COMPILE</i>' + Array.from({ length: need }, (_, i) => '<b class="' + (i < done ? 'on' : '') + '"></b>').join('');
  }
}

/* いま番が来ている側の名札に「TURN」の印を出したままにする (side: 'me' / 'opp' / null で消す)。
   番の知らせの帯は一瞬で消えるので、目を離して戻ると、待つのか動くのかが分からなかった */
export function setTurnPlate(side) {
  for (const [id, key] of [['meTag', 'me'], ['vsTag', 'opp']]) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('turn', side === key);
  }
}

export function hidePlates() {
  for (const id of ['vsTag', 'meTag']) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
}
