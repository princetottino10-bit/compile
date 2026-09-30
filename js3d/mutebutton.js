/* =========================================================================
 * すべての音を消すボタン (タイトル・待合室・ストーリーの地図の左下)。対戦中は右上の #btnMute が同じ役
 *   状態は audio.js (端末に覚えておく)。ここは見た目とクリックだけ
 * ========================================================================= */
import { initAudio, setMuted, isMuted, onMuteChange } from './audio.js';

/* スピーカーの形 (消しているときは斜線) */
export function muteIcon(off) {
  return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/>' +
    (off ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>') + '</svg>';
}

export function mountMuteButton() {
  if (document.getElementById('muteAll')) return;
  const b = document.createElement('button');
  b.id = 'muteAll';
  b.type = 'button';
  const sync = () => {
    b.innerHTML = muteIcon(isMuted());
    b.classList.toggle('off', isMuted());
    b.setAttribute('aria-pressed', isMuted() ? 'true' : 'false');
    b.setAttribute('aria-label', isMuted() ? '音を鳴らす' : 'すべての音を消す');
    b.title = isMuted() ? '音を鳴らす' : 'すべての音を消す';
  };
  b.onclick = () => { initAudio(); setMuted(!isMuted()); };
  onMuteChange(sync);
  sync();
  document.body.appendChild(b);
}
