/* CPU の手を Web Worker で考えてもらう窓口。
   Worker が使えない・落ちた・返事が遅すぎるときは、今まで通り画面側で考える (対戦は止めない) */
const WAIT_MS = 8000;

export function createAiClient(Engine, { cards, effects, extra, engineUrl }) {
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
      post({ type: 'init', cards, effects, extra }).catch(() => dropWorker());
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

  /* 画面側で考えるときも、Worker と同じ設定を当てる (前は over を捨てていて、ORACLE が黙ってふつうの強さ・学習モデルなしで指していた)。
     考え終わったら、ふだんの設定 (config) に戻す */
  const valnet = {};               // 学習モデル (名前ごと。undefined = まだ読んでいない、null = 読めなかった)
  async function valnetModel(name) {
    const key = name || 'main';
    if (valnet[key] === undefined) {
      const file = name ? '../data/valnet-' + name + '.json' : '../data/valnet.json';
      try { const r = await fetch(new URL(file, import.meta.url)); valnet[key] = r.ok ? await r.json() : null; } catch { valnet[key] = null; }
    }
    return valnet[key];
  }
  function configure(cfg, model) {
    Engine.setAiLevel(cfg.level);
    if (Engine.setAiBlunder) Engine.setAiBlunder(cfg.blunder || 0);
    Engine.setAiThinkBudget(cfg.budget);
    if (Engine.setAiSpecialist) Engine.setAiSpecialist(!!cfg.specialist, cfg.specSide === 0 ? 0 : 1, cfg.kind || 'dsh');
    if (Engine.setAiPeek) Engine.setAiPeek(cfg.peek ? 1 : -1);
    if (Engine.setAiValueNet) Engine.setAiValueNet(cfg.valnet ? model : null, cfg.valnet || 0);
    /* ORACLE だけの手筋 (サイキック①の仕込みへの備え・ロックを割りに行く・ウォーター①とファイア③を手放さない) */
    if (Engine.setAiOracle) Engine.setAiOracle(!!cfg.oracle);
    if (Engine.setAiOracle) /* 深読み: 2手読みの上位 deep 手だけ、自分の次の手のあとの相手の応手まで読み直す (ORACLE、2026-10-23 の計測で 2,327戦 52.2%) */
    if (Engine.setAiOracle) if (Engine.setAiDeep) Engine.setAiDeep(cfg.deep || 0);
  }
  async function localWith(over, fn) {
    if (!over) return local(fn);
    const cfg = { ...config, ...over };
    configure(cfg, cfg.valnet ? await valnetModel(cfg.valnetModel) : null);
    try { return local(fn); } finally { configure(config, null); }
  }

  /* over: この1回だけの設定 (管理者の自動プレイで、自分の側だけ強い読みにする) */
  async function ask(type, st, req, over) {
    if (worker) {
      try { return await post({ type, state: lean(st), req, config: over ? { ...config, ...over } : config }); }
      catch (err) { console.warn('AI worker fallback', err && err.message); dropWorker(); }
    }
    return localWith(over, () => (type === 'answer' ? Engine.ai.answer(st, req) : Engine.ai.action(st)));
  }

  return {
    setConfig(c) { config = { ...config, ...c }; },
    action: (st, over) => ask('action', st, null, over),
    answer: (st, req, over) => ask('answer', st, req, over),
    get usesWorker() { return !!worker; }
  };
}
