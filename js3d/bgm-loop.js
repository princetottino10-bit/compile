/* =========================================================================
 * つなぎ目なしでループさせる BGM の再生 (2026-11-01、本人が Musio Studio で作った曲のため)
 *   <audio loop> は、頭へ戻るときに一瞬途切れる (ブラウザの作り。m4a の頭の無音とは別)。
 *   本人の曲は「末尾の余韻を冒頭に重ね、ちょうど曲の長さに切った」ループ素材なので、途切れが聞こえる。
 *   そこで曲を一度 decodeAudioData で読み、AudioBufferSourceNode の loopStart/loopEnd でサンプル単位でつなぐ。
 *   bgm.js からは <audio> と同じように扱えるよう、使っている所だけ同じ形にしてある
 *   (src・loop・paused・currentTime・play()・pause()・'ended')。
 *   AAC は頭に符号化の遅れ (ffmpeg の aac は 1024 サンプル) が付く。ブラウザが m4a の edit list を読んで外せば
 *   読んだ長さは曲の長さどおりになる。長ければ、その分は頭の遅れとみなして飛ばす (末尾の詰め物はループの外に置く)。
 * ========================================================================= */
import { audioOut } from './audio.js';

const AAC_DELAY = 1024;          // ffmpeg の aac エンコーダの頭の遅れ (サンプル)

export class LoopPlayer {
  constructor() {
    this._src = '';
    this.loop = true;
    this.paused = true;
    this.length = 0;             // 曲の長さ (秒)。bgm.js の LOOP_SECONDS
    this._buf = null;
    this._bufUrl = '';
    this._loading = null;
    this._node = null;
    this._pos = 0;               // 止めたときの位置 (曲の頭からの秒)
    this._t0 = 0;                // 鳴らし始めた ctx の時刻 - 鳴らし始めた位置
    this._ended = [];
    this._gain = null;
  }
  /* 曲を替えたら止まる (<audio> と同じ。鳴らすのは play()) */
  get src() { return this._src; }
  set src(url) {
    if (url === this._src) return;
    this._stop();
    this._src = url;
    this.paused = true;
    this._pos = 0;
  }
  addEventListener(type, fn) { if (type === 'ended') this._ended.push(fn); }
  /** 音量のつまみ (routeMedia と同じ形: set(v, 時定数)) */
  route(vol) {
    const o = audioOut();
    if (!o) return null;
    this._gain = o.ctx.createGain();
    this._gain.gain.value = vol;
    this._gain.connect(o.out);
    return { set: (v, tc) => this._gain.gain.setTargetAtTime(Math.max(0, v), o.ctx.currentTime, tc || 0.05) };
  }
  _span() {
    const b = this._buf;
    if (!b) return { start: 0, len: this.length || 0 };
    const want = Math.round((this.length || b.duration) * b.sampleRate);
    const extra = b.length - want;
    /* 長さどおり (edit list が効いた) なら頭から。長ければ頭の遅れを飛ばす */
    const skip = extra > 64 ? Math.min(AAC_DELAY, extra) : 0;
    return { start: skip / b.sampleRate, len: Math.min(want, b.length - skip) / b.sampleRate };
  }
  get currentTime() {
    const o = audioOut();
    if (this.paused || !this._node || !o) return this._pos;
    const { len } = this._span();
    const t = o.ctx.currentTime - this._t0;
    return len && this.loop ? t % len : Math.min(t, len);
  }
  set currentTime(v) {
    const was = !this.paused;
    this._stop();
    this._pos = Math.max(0, v || 0);
    if (was) this._start();
  }
  play() {
    this.paused = false;
    return this._load().then(() => { if (!this.paused && !this._node) this._start(); });
  }
  pause() {
    if (this.paused) return;
    this._pos = this.currentTime;
    this.paused = true;
    this._stop();
  }
  _load() {
    const url = this.src;
    if (this._buf && this._bufUrl === url) return Promise.resolve();
    if (this._loading && this._loading.url === url) return this._loading.p;
    const o = audioOut();
    if (!o) return Promise.reject(new Error('no audio'));
    this._buf = null;
    const p = fetch(url).then(r => r.arrayBuffer())
      .then(a => new Promise((ok, ng) => o.ctx.decodeAudioData(a, ok, ng)))
      .then(buf => { if (this.src === url) { this._buf = buf; this._bufUrl = url; } });
    this._loading = { url, p };
    return p;
  }
  _start() {
    const o = audioOut();
    if (!o || !this._buf || !this._gain) return;
    const { start, len } = this._span();
    const n = o.ctx.createBufferSource();
    n.buffer = this._buf;
    n.loop = this.loop;
    n.loopStart = start;
    n.loopEnd = start + len;
    n.connect(this._gain);
    const at = len ? this._pos % len : 0;
    n.onended = () => {
      if (this._node !== n) return;            // 止めた・替えた
      this._node = null;
      this.paused = true;
      this._pos = 0;
      for (const f of this._ended) f();
    };
    if (this.loop) n.start(0, start + at);
    else n.start(0, start + at, Math.max(0, len - at));
    this._node = n;
    this._t0 = o.ctx.currentTime - at;
  }
  _stop() {
    const n = this._node;
    this._node = null;
    if (n) { try { n.stop(); } catch (e) { /* まだ鳴らしていない */ } n.disconnect(); }
  }
  /** loop を途中で替えたとき (シャッフルの設定) に、鳴っている音にも反映する */
  syncLoop() { if (this._node) this._node.loop = this.loop; }
}
