/* CPU の思考を画面の処理と別に回す (探索に最大1秒あまりかかり、その間アニメが止まっていたため)。
   main.js の aiclient.js から使う。エンジンは画面と同じ版を読み込む (URL の engine= で渡される) */
/* global importScripts, CompileEngine */
const params = new URL(self.location.href).searchParams;
importScripts(params.get('engine') || '../engine.js');
const Engine = self.CompileEngine;
Engine.setTrace(false);

function configure(cfg) {
  if (!cfg) return;
  Engine.setAiLevel(cfg.level);
  if (Engine.setAiBlunder) Engine.setAiBlunder(cfg.blunder || 0);
  Engine.setAiThinkBudget(cfg.budget);
  if (Engine.setAiSpecialist) Engine.setAiSpecialist(!!cfg.specialist, 1, cfg.kind || 'dsh');
}

self.onmessage = (e) => {
  const m = e.data || {};
  try {
    if (m.type === 'init') { Engine.init(m.cards, m.effects); self.postMessage({ id: m.id, ok: true }); return; }
    configure(m.config);
    const result = m.type === 'answer' ? Engine.ai.answer(m.state, m.req) : Engine.ai.action(m.state);
    self.postMessage({ id: m.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) });
  }
};
