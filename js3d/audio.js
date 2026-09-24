/* =========================================================================
 * 3Dビュー: 効果音
 *   カードを動かす音・コンパイルの衝撃は録音素材 (sfx/*.mp3、Kenney の CC0 素材)、
 *   メニュー操作・ターン・勝敗の合図は合成音 (オシレータ + ノイズ)。
 *   素材は解錠時に読み込み、読み終わるまでは合成音で代わりに鳴らす。
 *   コンパイルや効果の発動などには、合成した残響を薄く足して奥行きを出す。
 *   ブラウザの自動再生制限があるため、最初のユーザー操作で initAudio() を
 *   呼んで AudioContext を解錠する。未解錠の間の sfx() は静かに無視。
 * ========================================================================= */

let actx = null;
let master = null;
let noiseBuf = null;
let reverbIn = null;
let muted = false;

/* 効果音の音量 (0..100)。80 がこれまでの音量。
   BGM は無し (以前の合成 BGM は低音がずっと「ブーー」と鳴って耳障りだったので削除) */
let sfxBus = null;
let sfxLevel = 1;
export function setSfxVolume(pct) {
  sfxLevel = Math.max(0, Math.min(1.25, (+pct || 0) / 80));
  if (sfxBus) sfxBus.gain.setTargetAtTime(sfxLevel, actx.currentTime, 0.05);
}

export function setMuted(v) { muted = !!v; }
export function isMuted() { return muted; }

/* 出力の土台 (マスター → コンプレッサー、効果音バス、残響) を ctx に作る */
function buildGraph(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 6;
  const m = ctx.createGain();
  m.gain.value = 0.42;
  m.connect(comp);
  comp.connect(ctx.destination);
  const bus = ctx.createGain();
  bus.gain.value = sfxLevel;
  bus.connect(m);
  /* 残響: 減衰するノイズを畳み込む (素材なしで部屋鳴りを作る) */
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, 1.6, 3.2);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  conv.connect(wet);
  wet.connect(bus);
  return { master: m, bus, reverb: conv };
}

function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function makeNoise(ctx) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function initAudio() {
  if (actx) {
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  /* 音を作れないブラウザ (アプリ内ブラウザ等) では、例外を出さずに音なしで進める */
  try {
    actx = new AC();
    const g = buildGraph(actx);
    master = g.master; sfxBus = g.bus; reverbIn = g.reverb;
    noiseBuf = makeNoise(actx);
    loadSamples();
  } catch (e) {
    actx = null; master = null; sfxBus = null; reverbIn = null;
  }
}

/* ---------- 録音素材 ---------- */

const SAMPLE_DIR = 'sfx/';
const SAMPLE_FILES = [
  'card-place-1', 'card-place-2', 'card-place-3', 'card-place-4',
  'card-slide-1', 'card-slide-2', 'card-slide-3', 'card-slide-4', 'card-slide-5', 'card-slide-7', 'card-slide-8',
  'card-shove-1', 'card-shove-2', 'card-shove-3', 'card-shove-4', 'card-fan-1',
  'forceField_000', 'forceField_002', 'explosionCrunch_000', 'lowFrequency_explosion_001',
  'impactMetal_002', 'impactMetal_004'
];
const buffers = new Map();
let samplesRequested = false;

function decode(data) {
  /* 古い Safari はコールバック形式しか受け付けない */
  return new Promise((resolve, reject) => actx.decodeAudioData(data, resolve, reject));
}

function loadSamples() {
  if (samplesRequested || !actx) return;
  samplesRequested = true;
  for (const name of SAMPLE_FILES) {
    fetch(SAMPLE_DIR + name + '.mp3')
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then(decode)
      .then(buf => { buffers.set(name, buf); })
      .catch(() => { /* 読めなかった音は合成音のまま */ });
  }
}

function now() { return actx.currentTime; }

/* 残響へ送る量 (0..1)。送らないなら何もしない */
function sendVerb(node, amount) {
  if (!amount || !reverbIn) return;
  const s = actx.createGain();
  s.gain.value = amount;
  node.connect(s);
  s.connect(reverbIn);
}

/* 素材を1つ鳴らす。names から読み込み済みのものを無作為に選ぶ。鳴らせたら true。
   o: { vol, rate, delay, verb }。ピッチはわずかに揺らして、同じ音の連打を機械的にしない */
function sample(names, o = {}) {
  const ready = names.filter(n => buffers.has(n));
  if (!ready.length) return false;
  const src = actx.createBufferSource();
  src.buffer = buffers.get(ready[Math.floor(Math.random() * ready.length)]);
  src.playbackRate.value = (o.rate || 1) * (0.96 + Math.random() * 0.08);
  const g = actx.createGain();
  g.gain.value = o.vol === undefined ? 0.6 : o.vol;
  src.connect(g);
  g.connect(sfxBus || master);
  sendVerb(g, o.verb);
  src.start(now() + (o.delay || 0));
  return true;
}

/* ---------- 合成音 ---------- */

/* 減衰付きゲインノード */
function envGain(t0, vol, attack, dur, verb) {
  const g = actx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(sfxBus || master);
  sendVerb(g, verb);
  return g;
}

/* 単音。freq→end へスイープできる */
function tone(o) {
  const t0 = now() + (o.delay || 0);
  const osc = actx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.end) osc.frequency.exponentialRampToValueAtTime(o.end, t0 + o.dur);
  const g = envGain(t0, o.vol || 0.2, o.attack || 0.004, o.dur, o.verb);
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
  const g = envGain(t0, o.vol || 0.2, o.attack || 0.004, o.dur, o.verb);
  src.connect(f);
  f.connect(g);
  src.start(t0);
  src.stop(t0 + o.dur + 0.05);
}

/* わずかなピッチ揺らぎ (同じ音の連打を機械的にしない) */
function j(v) { return v * (0.94 + Math.random() * 0.12); }

const PLACE = ['card-place-1', 'card-place-2', 'card-place-3', 'card-place-4'];

const SOUNDS = {
  /* 操作 (メニュー) */
  tick() { tone({ freq: j(1500), dur: 0.05, type: 'triangle', vol: 0.07 }); },
  select() {
    tone({ freq: j(880), dur: 0.07, type: 'triangle', vol: 0.1, verb: 0.15 });
    tone({ freq: j(1320), dur: 0.09, type: 'sine', vol: 0.08, delay: 0.03, verb: 0.15 });
  },
  /* 手札のカードを選ぶ: 紙の軽いこすれ */
  pick() {
    if (!sample(['card-slide-4', 'card-slide-2'], { vol: 0.16, rate: 1.2 })) SOUNDS.select();
  },

  /* カードの動き */
  lift() {
    if (!sample(['card-slide-1', 'card-slide-2', 'card-slide-4'], { vol: 0.5 })) {
      noise({ freq: 900, end: 2600, dur: 0.16, vol: 0.1, q: 1.4 });
    }
  },
  land() {
    if (sample(PLACE, { vol: 0.85 })) {
      /* 盤に叩きつける重みだけ、低い胴鳴りを薄く足す */
      tone({ freq: 78, end: 44, dur: 0.2, type: 'sine', vol: 0.2, attack: 0.002 });
      return;
    }
    tone({ freq: 82, end: 44, dur: 0.22, type: 'sine', vol: 0.55, attack: 0.002 });
    noise({ freq: 420, end: 140, dur: 0.14, vol: 0.32, kind: 'lowpass', attack: 0.002 });
    noise({ freq: 3200, dur: 0.05, vol: 0.12, attack: 0.001 });
  },
  draw() {
    if (!sample(['card-slide-1', 'card-slide-3', 'card-slide-5'], { vol: 0.6 })) {
      noise({ freq: 1100, end: 3000, dur: 0.12, vol: 0.13, q: 2 });
    }
  },
  flip() {
    if (sample(['card-place-2', 'card-place-4'], { vol: 0.7, rate: 1.25 })) {
      tone({ freq: j(1240), dur: 0.06, type: 'triangle', vol: 0.05, delay: 0.03 });
      return;
    }
    tone({ freq: j(760), dur: 0.05, type: 'triangle', vol: 0.14 });
    tone({ freq: j(1240), dur: 0.07, type: 'triangle', vol: 0.11, delay: 0.045 });
  },
  shift() {
    if (!sample(['card-slide-7', 'card-slide-8'], { vol: 0.6 })) {
      noise({ freq: 700, end: 1700, dur: 0.15, vol: 0.1, q: 1.6 });
    }
  },
  trash() {
    if (sample(['card-shove-1', 'card-shove-2', 'card-shove-3', 'card-shove-4'], { vol: 0.6 })) return;
    noise({ freq: 900, end: 260, dur: 0.2, vol: 0.16, kind: 'lowpass' });
    tone({ freq: 300, end: 130, dur: 0.16, type: 'triangle', vol: 0.12, delay: 0.02 });
  },
  /* コンパイルでラインのカードが消える */
  shatter() {
    sample(['impactMetal_002', 'impactMetal_004'], { vol: 0.3, verb: 0.35 });
    sample(['card-fan-1'], { vol: 0.45, delay: 0.05 });
    noise({ freq: 3400, end: 1300, dur: 0.34, vol: 0.16, kind: 'highpass', attack: 0.002, verb: 0.2 });
    for (let i = 0; i < 4; i++) {
      tone({ freq: j(2300 - i * 380), dur: 0.09, type: 'triangle', vol: 0.05, delay: 0.03 + i * 0.05, verb: 0.3 });
    }
  },

  /* チェーンがつながった: 金属の打音 + つながるたびに高くなる上昇音 (n = チェーンの長さ) */
  chain(n) {
    const k = Math.max(2, Math.min(6, n || 2)) - 2;
    const up = Math.pow(1.12, k);
    sample(['impactMetal_002', 'impactMetal_004'], { vol: 0.34, rate: 0.9 + k * 0.08, verb: 0.35 });
    noise({ freq: 600, end: 4200, dur: 0.28, vol: 0.09, q: 2.2, attack: 0.01, verb: 0.3 });
    [0, 4, 7].forEach((semi, i) => {
      const f = 587 * up * Math.pow(2, semi / 12);
      tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.11, delay: 0.04 + i * 0.055, verb: 0.35 });
      tone({ freq: f * 2, dur: 0.18, type: 'sine', vol: 0.035, delay: 0.04 + i * 0.055, verb: 0.35 });
    });
    tone({ freq: 587 * up * 2, dur: 0.6, type: 'sine', vol: 0.05, delay: 0.2, verb: 0.5 });
  },

  /* 効果発動: 電気の立ち上がり + 澄んだ2音 */
  effect() {
    sample(['forceField_000', 'forceField_002'], { vol: 0.16, rate: 1.2, verb: 0.3 });
    tone({ freq: j(1050), dur: 0.12, type: 'sine', vol: 0.1, verb: 0.3 });
    tone({ freq: j(1580), dur: 0.16, type: 'sine', vol: 0.08, delay: 0.05, verb: 0.3 });
  },

  /* コンパイル */
  charge() {
    tone({ freq: 90, end: 760, dur: 0.62, type: 'triangle', vol: 0.16, attack: 0.05, verb: 0.3 });
    tone({ freq: 180, end: 1520, dur: 0.62, type: 'sawtooth', vol: 0.04, attack: 0.08, verb: 0.3 });
    noise({ freq: 300, end: 3400, dur: 0.62, vol: 0.1, q: 3, attack: 0.05, verb: 0.3 });
  },
  boom() {
    const hit = sample(['lowFrequency_explosion_001'], { vol: 0.85 });
    sample(['explosionCrunch_000'], { vol: 0.4, verb: 0.45 });
    if (!hit) {
      tone({ freq: 60, end: 30, dur: 1.0, type: 'sine', vol: 0.7, attack: 0.002 });
      noise({ freq: 340, end: 60, dur: 0.7, vol: 0.4, kind: 'lowpass', attack: 0.002 });
    }
    [880, 1320, 1980].forEach((f, i) => {
      tone({ freq: f, dur: 0.8, type: 'sine', vol: 0.045, delay: 0.08 + i * 0.05, verb: 0.5 });
    });
  },

  /* ターン / 決着 */
  turn() {
    tone({ freq: 520, dur: 0.11, type: 'triangle', vol: 0.12, verb: 0.2 });
    tone({ freq: 780, dur: 0.15, type: 'triangle', vol: 0.1, delay: 0.09, verb: 0.2 });
  },
  /* 自分の番が回ってきた合図。相手の番より明るく、上へ抜ける三音 */
  yourTurn() {
    [660, 880, 1320].forEach((f, i) => {
      tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.14, delay: i * 0.07, verb: 0.25 });
      tone({ freq: f * 2, dur: 0.16, type: 'sine', vol: 0.045, delay: i * 0.07, verb: 0.25 });
    });
    tone({ freq: 1760, dur: 0.5, type: 'sine', vol: 0.05, delay: 0.22, verb: 0.35 });
  },
  /* 勝ち: 音階を駆け上がる「ファンファーレ」はやめ、重い一撃 → 和音がふくらむ → 上で細かく瞬く → 鐘で締める */
  win() {
    tone({ freq: 70, end: 38, dur: 0.7, type: 'sine', vol: 0.42 });                 // 低い一撃
    noise({ kind: 'lowpass', freq: 500, end: 7000, dur: 0.55, vol: 0.07, attack: 0.2, verb: 0.4 });
    /* D の9th の和音 (D A C# E F#)。わずかにずらした2本を重ねて厚みを出す */
    [146.8, 220, 277.2, 329.6, 370].forEach((f, i) => {
      for (const d of [1, 1.004]) {
        tone({ freq: f * d, dur: 2.2, type: i ? 'triangle' : 'sine', vol: i ? 0.05 : 0.1, attack: 0.35, delay: 0.12, verb: 0.6 });
      }
    });
    [1760, 2217, 2637, 2960, 3520].forEach((f, i) => {                               // 瞬き
      tone({ freq: f, dur: 0.5, type: 'sine', vol: 0.034, delay: 0.42 + i * 0.09, verb: 0.75 });
    });
    tone({ freq: 1174.7, dur: 2.0, type: 'sine', vol: 0.09, attack: 0.01, delay: 0.95, verb: 0.7 });  // 鐘
    tone({ freq: 2349.3, dur: 1.4, type: 'sine', vol: 0.018, attack: 0.01, delay: 0.95, verb: 0.7 });
  },
  /* 勝ち (AURORA): 澄んだ鐘が順に重なり、柔らかい和音が長く残る */
  winAurora() {
    tone({ freq: 55, end: 40, dur: 0.9, type: 'sine', vol: 0.3 });
    [587.3, 740, 880, 1108.7, 1318.5].forEach((f, i) => {
      tone({ freq: f, dur: 1.8, type: 'sine', vol: 0.07, attack: 0.01, delay: 0.1 + i * 0.16, verb: 0.8 });
      tone({ freq: f * 2.01, dur: 1.2, type: 'sine', vol: 0.02, attack: 0.01, delay: 0.1 + i * 0.16, verb: 0.8 });
    });
    [146.8, 185, 220, 277.2].forEach((f) => {
      tone({ freq: f, dur: 2.6, type: 'triangle', vol: 0.05, attack: 0.5, delay: 0.3, verb: 0.7 });
    });
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) => {
      tone({ freq: f, dur: 0.5, type: 'triangle', vol: 0.14, delay: i * 0.22, verb: 0.35 });
    });
    tone({ freq: 49, dur: 1.4, type: 'sine', vol: 0.25, delay: 0.66 });
  }
};

/* 名前で再生。未解錠・ミュート・未知名は無視。arg は音ごとの引数 (chain の長さ等) */
export function sfx(name, arg) {
  if (!actx || muted || actx.state !== 'running') return;
  const fn = SOUNDS[name];
  if (fn) {
    try { fn(arg); } catch (e) { /* 音は落としてもゲームは止めない */ }
  }
}

/* 音量の釣り合いを確かめる: 1つの効果音を無音のまま書き出し、最大値と実効値を返す (確認用) */
export async function measureSfx(name) {
  if (!actx || !SOUNDS[name]) return null;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new OAC(1, Math.floor(actx.sampleRate * 2.5), actx.sampleRate);
  const saved = [actx, master, sfxBus, reverbIn, noiseBuf];
  const g = buildGraph(off);
  actx = off; master = g.master; sfxBus = g.bus; reverbIn = g.reverb; noiseBuf = makeNoise(off);
  try { SOUNDS[name](); } finally { [actx, master, sfxBus, reverbIn, noiseBuf] = saved; }
  const out = (await off.startRendering()).getChannelData(0);
  let peak = 0, sum = 0;
  for (const v of out) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / out.length).toFixed(4) };
}
