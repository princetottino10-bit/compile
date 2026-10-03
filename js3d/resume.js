/* =========================================================================
 * 中断した対戦の再開
 *   CPU 戦などを始めたら、はじめの状態 (init) と、それからの手 (actions) を端末に書き残す。
 *   画面ごと落ちたり閉じたりしたあとに開き直すと、タイトルの前に「続きから遊ぶか」を聞き、
 *   init から手を並べ直して (replays.js の rebuild と同じやり方) その手番から続ける。
 *   決着・自分でメニューへ戻ったら消す (crashwatch.js の battleEnded と同じところ)。
 *   meta: { mode, level, me, opp, story?, run?, quick?, oppAvatar? }
 * ========================================================================= */
export const RESUME_KEY = 'compileResume';
const MAX_AGE = 24 * 3600 * 1000;

let live = null;       // いま記録している対戦 (始めていなければ null)

function save() {
  try { localStorage.setItem(RESUME_KEY, JSON.stringify(live)); } catch (e) { /* private mode・容量いっぱい */ }
}

export function startResume(meta, init, now = Date.now(), actions = []) {
  live = { v: 1, at: now, meta: { ...meta }, init: JSON.parse(JSON.stringify(init)), actions: JSON.parse(JSON.stringify(actions)) };
  save();
}
export function logResume(action) {
  if (!live) return;
  live.actions.push(JSON.parse(JSON.stringify(action)));
  save();
}
/* 取り消し (UNDO): 手の数を n に戻す */
export function truncateResume(n) {
  if (!live) return;
  live.actions.length = Math.max(0, Math.min(live.actions.length, n | 0));
  save();
}
export const resumeLength = () => (live ? live.actions.length : 0);
export const resumeActive = () => !!live;
export function endResume() {
  live = null;
  try { localStorage.removeItem(RESUME_KEY); } catch (e) { /* private mode */ }
}

/* 再開できる記録 (無ければ null)。1日より前・壊れている・手が1つも無いものは再開しない */
export function loadResume(now = Date.now()) {
  let r = null;
  try { r = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); } catch (e) { return null; }
  if (!r || !r.init || !r.meta || !Array.isArray(r.actions) || !r.actions.length) return null;
  if (!(now - r.at < MAX_AGE)) return null;
  return r;
}

export function resumeLabel(r) {
  const opp = (r.meta.opp || []).join(' / ');
  return '相手 ' + opp + '　(' + r.actions.length + '手まで進んでいます)';
}

/* 「続きから遊ぶか」を聞く (ストーリーの確認と同じ見た目)。true = 続きから */
export function askResume(r) {
  const box = document.createElement('div');
  box.className = 'sm-confirm';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', '中断した対戦');
  box.innerHTML = '<div class="sm-card"><small>RESUME</small><h3>中断した対戦があります</h3>' +
    '<p class="sm-note"></p>' +
    '<div class="sm-btns"><button type="button" class="sm-go">続きから遊ぶ</button><button type="button" class="sm-back">やめる</button></div></div>';
  box.querySelector('.sm-note').textContent = resumeLabel(r);
  document.body.appendChild(box);
  return new Promise((resolve) => {
    const end = (v) => { box.remove(); resolve(v); };
    box.querySelector('.sm-go').onclick = () => end(true);
    box.querySelector('.sm-back').onclick = () => end(false);
    box.querySelector('.sm-go').focus();
  });
}

/* はい / いいえ の確認 (ブラウザの confirm の代わり。confirm はゲームパッドで押せず、出ている間ゲームが止まった)。はいで true */
export function askConfirm(title, note) {
  const box = document.createElement('div');
  box.className = 'sm-confirm';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', title);
  box.innerHTML = '<div class="sm-card"><small>CONFIRM</small><h3></h3>' + (note ? '<p class="sm-note"></p>' : '') +
    '<div class="sm-btns"><button type="button" class="sm-go" data-v="1">はい</button><button type="button" data-v="">戻る</button></div></div>';
  box.querySelector('h3').textContent = title;
  if (note) box.querySelector('.sm-note').textContent = note;
  document.body.appendChild(box);
  return new Promise((resolve) => {
    box.querySelectorAll('[data-v]').forEach(b => { b.onclick = () => { box.remove(); resolve(!!b.dataset.v); }; });
    box.querySelector('.sm-go').focus();
  });
}

/* 対戦の途中でメニューへ戻るとき: 'suspend' (中断してあとで続きから) / 'quit' (やめる) / null (戻る) */
export function askLeave() {
  const box = document.createElement('div');
  box.className = 'sm-confirm';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'メニューに戻る');
  box.innerHTML = '<div class="sm-card"><small>MENU</small><h3>メニューに戻りますか？</h3>' +
    '<p class="sm-note">中断すると、次にゲームを開いたときに続きから遊べます。</p>' +
    '<div class="sm-btns"><button type="button" class="sm-go" data-v="suspend">中断する</button>' +
    '<button type="button" data-v="quit">対戦をやめる</button><button type="button" data-v="">戻る</button></div></div>';
  document.body.appendChild(box);
  return new Promise((resolve) => {
    box.querySelectorAll('[data-v]').forEach(b => { b.onclick = () => { box.remove(); resolve(b.dataset.v || null); }; });
    box.querySelector('.sm-go').focus();
  });
}
