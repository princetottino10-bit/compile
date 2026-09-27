/* =========================================================================
 * 対戦のそばに出すキャラ (アバター)。タッグフォースのように、画面の左下に胸から上を出し、
 * 手に合わせて表情を変え、吹き出しでひとこと言う。
 *   表情は差し替えの絵 (art/avatar/<id>_<表情>.webp、背景は透明)。数秒ごとにまばたき、ゆっくり息をする。
 *   動きを減らす設定では、息とまばたきを止める (表情と吹き出しは出す)
 * ========================================================================= */
export const AVATARS = {
  shion: {
    name: '紫苑',
    faces: ['normal', 'blink', 'happy', 'fired', 'frustrated', 'surprised'],
    lines: {
      play: ['行って、{card}！', '{card}、お願い。', 'ここは {card} で。'],
      compile: ['コンパイル、完了。', 'ひとつ、もらったよ。'],
      compiled: ['くっ……', 'まだ、これから。'],
      hurt: ['えっ……', 'そう来るの？'],
      win: ['勝った。ありがとう。', 'いい対戦だった。'],
      lose: ['……次は負けない。', '悔しいな。']
    }
  }
};

const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** キャラを出す。返り値: { react(kind, vars), setFace(face, ms), say(text, face, ms), destroy() } */
export function mountAvatar(id, root = document.body) {
  const def = AVATARS[id];
  if (!def) return null;
  const el = document.createElement('div');
  el.id = 'avatar';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="av-body">' + def.faces.map(f =>
    '<img alt="" draggable="false" data-face="' + f + '" src="art/avatar/' + id + '_' + f + '.webp"' + (f === 'normal' ? ' class="on"' : '') + '>').join('') +
    '</div><div class="av-bubble" role="status"><b>' + def.name + '</b><span></span></div>';
  root.appendChild(el);
  if (calm()) el.classList.add('calm');

  let face = 'normal', faceTimer = null, sayTimer = null, blinkTimer = null;
  const show = (f) => el.querySelectorAll('img').forEach(img => img.classList.toggle('on', img.dataset.face === f));
  /* まばたき: ふつうの顔のときだけ、3〜6秒ごとに 0.14 秒 */
  const scheduleBlink = () => {
    clearTimeout(blinkTimer);
    if (calm()) return;
    blinkTimer = setTimeout(() => {
      if (face === 'normal' && el.isConnected) { show('blink'); setTimeout(() => { if (face === 'normal') show('normal'); }, 140); }
      scheduleBlink();
    }, 3000 + Math.random() * 3000);
  };
  scheduleBlink();

  function setFace(f, ms) {
    if (!def.faces.includes(f)) return;
    clearTimeout(faceTimer);
    face = f;
    show(f);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    if (ms) faceTimer = setTimeout(() => { face = 'normal'; show('normal'); }, ms);
  }
  function say(text, f, ms) {
    const bubble = el.querySelector('.av-bubble');
    bubble.querySelector('span').textContent = text;
    bubble.classList.remove('show'); void bubble.offsetWidth; bubble.classList.add('show');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => bubble.classList.remove('show'), ms || 2600);
    if (f) setFace(f, (ms || 2600) + 400);
  }
  /* 手に合わせて: play (表で出した) / compile / compiled (された) / hurt (大きく減らされた) / win / lose */
  const FACE_OF = { play: 'fired', compile: 'happy', compiled: 'frustrated', hurt: 'surprised', win: 'happy', lose: 'frustrated' };
  function react(kind, vars) {
    const lines = def.lines[kind];
    if (!lines) return;
    let text = pick(lines);
    for (const [k, v] of Object.entries(vars || {})) text = text.split('{' + k + '}').join(v);
    say(text, FACE_OF[kind], kind === 'win' || kind === 'lose' ? 5000 : 2400);
  }
  function destroy() { clearTimeout(faceTimer); clearTimeout(sayTimer); clearTimeout(blinkTimer); el.remove(); }
  return { react, setFace, say, destroy, el };
}
