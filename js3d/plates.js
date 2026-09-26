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
    img.src = emblemDataURL(plate.icon.name, plate.icon.color || '#b9a4ff', 40, true);
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
}

export function showPlates({ me, opp }) {
  const oppEl = document.getElementById('vsTag');
  const meEl = document.getElementById('meTag');
  if (oppEl) fill(oppEl, opp, 'VS');
  if (meEl) fill(meEl, me, '');
}

export function hidePlates() {
  for (const id of ['vsTag', 'meTag']) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
}
