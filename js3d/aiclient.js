/* CPU の手を Web Worker で考えてもらう窓口。
   Worker が使えない・落ちた・返事が遅すぎるときは、今まで通り画面側で考える (対戦は止めない) */
const WAIT_MS = 8000;

export function createAiClient(Engine, { cards, effects, engineUrl }) {
  let worker = null;
  let seq = 0;
  const waiting = new Map();
  let config = { level: 1, budget: 900, specialist: false, kind: 'dsh' };

  function dropWorker() {
    if (worker) { try { worker.terminate(); } catch { /* 片付けの失敗は無視 */ } }
    worker = null;
    for (const [, w] of waiting) w.reject(new Error('worker stopped'));
    waiting.clear();
  }

  try {
    if (typeof Worker !== 'undefined') {
      /* import map に版付きの URL があればそれを使う (更新したら古い Worker が残らないように) */
      let href = null;
      try { href = import.meta.resolve('./ai-worker.js'); } catch { /* 古いブラウザ */ }
      const url = new URL(href || './ai-worker.js', import.meta.url);
      if (engineUrl) url.searchParams.set('engine', engineUrl);
      worker = new Worker(url);
      worker.onmessage = (e) => {
        const w = waiting.get(e.data && e.data.id);
        if (!w) return;
        waiting.delete(e.data.id);
        if (e.data.ok) w.resolve(e.data.result); else w.reject(new Error(e.data.error));
      };
      worker.onerror = (e) => { console.warn('AI worker error', e && e.message); dropWorker(); };
      post({ type: 'init', cards, effects }).catch(() => dropWorker());
    }
  } catch (err) {
    console.warn('AI worker unavailable', err);
    worker = null;
  }

  function post(msg) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        if (!waiting.has(id)) return;
        waiting.delete(id);
        reject(new Error('worker timeout'));
      }, WAIT_MS);
      waiting.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });
      worker.postMessage({ ...msg, id });
    });
  }

  /* trace (演出用の記録) は重いので送らない */
  function lean(st) {
    if (!st || (!st.__trace && !(st.pending && st.pending.base && st.pending.base.__trace))) return st;
    const out = { ...st };
    delete out.__trace;
    if (out.pending && out.pending.base && out.pending.base.__trace) {
      out.pending = { ...out.pending, base: { ...out.pending.base } };
      delete out.pending.base.__trace;
    }
    return out;
  }

  function local(fn) {
    Engine.setTrace(false);
    try { return fn(); } finally { Engine.setTrace(true); }
  }

  async function ask(type, st, req) {
    if (worker) {
      try { return await post({ type, state: lean(st), req, config }); }
      catch (err) { console.warn('AI worker fallback', err && err.message); dropWorker(); }
    }
    return local(() => (type === 'answer' ? Engine.ai.answer(st, req) : Engine.ai.action(st)));
  }

  return {
    setConfig(c) { config = { ...config, ...c }; },
    action: (st) => ask('action', st),
    answer: (st, req) => ask('answer', st, req),
    get usesWorker() { return !!worker; }
  };
}
