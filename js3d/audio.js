/* =========================================================================
 * 3Dビュー: 効果音 (WebAudio 合成)
 *   素材ファイルなし。すべてオシレータ + ノイズから作る。
 *   ブラウザの自動再生制限があるため、最初のユーザー操作で initAudio() を
 *   呼んで AudioContext を解錠する。未解錠の間の sfx() は静かに無視。
 * ========================================================================= */

let actx = null;
let master = null;
let noiseBuf = null;
let muted = false;

export function initAudio() {
  if (actx) {
    if (actx.state === 'suspended') actx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  actx = new AC();
  const comp = actx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 6;
  master = actx.createGain();
  master.gain.value = 0.42;
  master.connect(comp);
  comp.connect(actx.destination);

  /* 共有ノイズバッファ (2秒) */
  const len = actx.sampleRate * 2;
  noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
}

export function setMuted(v) { muted = !!v; }
export function isMuted() { return muted; }

function now() { return actx.currentTime; }

/* 減衰付きゲインノード */
function envGain(t0, vol, attack, dur) {
  const g = actx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(master);
  return g;
}

/* 単音。freq→end へスイープできる */
function tone(o) {
  const t0 = now() + (o.delay || 0);
  const osc = actx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.end) osc.frequency.exponentialRampToValueAtTime(o.end, t0 + o.dur);
  const g = envGain(t0, o.vol || 0.2, o.attack || 0.004, o.dur);
  osc.connect(g);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

/* ノイズバースト。フィルタ周波数もスイープできる */
function noise(o) {
  const t0 = now() + (o.delay || 0);
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = actx.createBiquadFilter();
  f.type = o.kind || 'bandpass';
  f.frequency.setValueAtTime(o.freq || 1000, t0);
  if (o.end) f.frequency.exponentialRampToValueAtTime(o.end, t0 + o.dur);
  f.Q.value = o.q || 1;
  const g = envGain(t0, o.vol || 0.2, o.attack || 0.004, o.dur);
  src.connect(f);
  f.connect(g);
  src.start(t0);
  src.stop(t0 + o.dur + 0.05);
}

/* わずかなピッチ揺らぎ (同じ音の連打を機械的にしない) */
function j(v) { return v * (0.94 + Math.random() * 0.12); }

const SOUNDS = {
  /* 操作 */
  tick() { tone({ freq: j(1500), dur: 0.05, type: 'triangle', vol: 0.07 }); },
  select() {
    tone({ freq: j(880), dur: 0.07, type: 'triangle', vol: 0.1 });
    tone({ freq: j(1320), dur: 0.09, type: 'sine', vol: 0.08, delay: 0.03 });
  },

  /* カードの動き */
  lift() { noise({ freq: 900, end: 2600, dur: 0.16, vol: 0.1, q: 1.4 }); },
  land() {
    tone({ freq: 82, end: 44, dur: 0.22, type: 'sine', vol: 0.55, attack: 0.002 });
    noise({ freq: 420, end: 140, dur: 0.14, vol: 0.32, kind: 'lowpass', attack: 0.002 });
    noise({ freq: 3200, dur: 0.05, vol: 0.12, attack: 0.001 });
  },
  draw() { noise({ freq: 1100, end: 3000, dur: 0.12, vol: 0.13, q: 2 }); },
  flip() {
    tone({ freq: j(760), dur: 0.05, type: 'triangle', vol: 0.14 });
    tone({ freq: j(1240), dur: 0.07, type: 'triangle', vol: 0.11, delay: 0.045 });
  },
  shift() { noise({ freq: 700, end: 1700, dur: 0.15, vol: 0.1, q: 1.6 }); },
  trash() {
    noise({ freq: 900, end: 260, dur: 0.2, vol: 0.16, kind: 'lowpass' });
    tone({ freq: 300, end: 130, dur: 0.16, type: 'triangle', vol: 0.12, delay: 0.02 });
  },
  shatter() {
    noise({ freq: 3400, end: 1300, dur: 0.34, vol: 0.26, kind: 'highpass', attack: 0.002 });
    for (let i = 0; i < 4; i++) {
      tone({ freq: j(2300 - i * 380), dur: 0.09, type: 'triangle', vol: 0.07, delay: 0.03 + i * 0.05 });
    }
  },

  /* 効果発動 */
  effect() {
    tone({ freq: j(1050), dur: 0.1, type: 'sine', vol: 0.12 });
    tone({ freq: j(1580), dur: 0.14, type: 'sine', vol: 0.09, delay: 0.05 });
  },

  /* コンパイル */
  charge() {
    tone({ freq: 90, end: 760, dur: 0.62, type: 'sawtooth', vol: 0.14, attack: 0.05 });
    noise({ freq: 300, end: 3400, dur: 0.62, vol: 0.1, q: 3, attack: 0.05 });
  },
  boom() {
    tone({ freq: 60, end: 30, dur: 1.0, type: 'sine', vol: 0.7, attack: 0.002 });
    noise({ freq: 340, end: 60, dur: 0.7, vol: 0.4, kind: 'lowpass', attack: 0.002 });
    [880, 1320, 1980].forEach((f, i) => {
      tone({ freq: f, dur: 0.8, type: 'sine', vol: 0.05, delay: 0.08 + i * 0.05 });
    });
  },

  /* ターン / 決着 */
  turn() {
    tone({ freq: 520, dur: 0.11, type: 'triangle', vol: 0.12 });
    tone({ freq: 780, dur: 0.15, type: 'triangle', vol: 0.1, delay: 0.09 });
  },
  win() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      tone({ freq: f, dur: 0.34, type: 'triangle', vol: 0.16, delay: i * 0.12 });
      tone({ freq: f * 2, dur: 0.3, type: 'sine', vol: 0.05, delay: i * 0.12 });
    });
    tone({ freq: 1046, dur: 1.1, type: 'sine', vol: 0.1, delay: 0.62 });
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) => {
      tone({ freq: f, dur: 0.5, type: 'triangle', vol: 0.14, delay: i * 0.22 });
    });
    tone({ freq: 49, dur: 1.4, type: 'sine', vol: 0.25, delay: 0.66 });
  }
};

/* 名前で再生。未解錠・ミュート・未知名は無視 */
export function sfx(name) {
  if (!actx || muted || actx.state !== 'running') return;
  const fn = SOUNDS[name];
  if (fn) {
    try { fn(); } catch (e) { /* 音は落としてもゲームは止めない */ }
  }
}
