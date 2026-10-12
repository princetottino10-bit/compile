/* CPU の思考を画面の処理と別に回す (探索に最大1秒あまりかかり、その間アニメが止まっていたため)。
   main.js の aiclient.js から使う。エンジンは画面と同じ版を読み込む (URL の engine= で渡される) */
/* global importScripts, CompileEngine */
const params = new URL(self.location.href).searchParams;
importScripts(params.get('engine') || '../engine.js');
const Engine = self.CompileEngine;
Engine.setTrace(false);

let VALNET;   // 学習モデルの重み (undefined = まだ読んでいない、null = 読めなかった)
function valnetModel() {
  if (VALNET === undefined) {
    try {
      const x = new XMLHttpRequest();
      x.open('GET', '../data/valnet.json', false);   // 作業スレッドの中なので、待っても画面は止まらない
      x.send();
      VALNET = x.status === 200 ? JSON.parse(x.responseText) : null;
    } catch (e) { VALNET = null; }
  }
  return VALNET;
}

function configure(cfg) {
  if (!cfg) return;
  Engine.setAiLevel(cfg.level);
  if (Engine.setAiBlunder) Engine.setAiBlunder(cfg.blunder || 0);
  Engine.setAiThinkBudget(cfg.budget);
  /* specSide: 特化をどちらの側に使うか (ふだんは CPU = 1。管理者の AUTO は自分の側 = 0) */
  if (Engine.setAiSpecialist) Engine.setAiSpecialist(!!cfg.specialist, cfg.specSide === 0 ? 0 : 1, cfg.kind || 'dsh');
  /* ALL-SEEING (のぞき見の敵): CPU の側だけ、こちらの手札・裏向き・山札の並びを本当のまま見て読む */
  if (Engine.setAiPeek) Engine.setAiPeek(cfg.peek ? 1 : -1);
  /* 学習モデル (盤面の良し悪し、data/valnet.json): 管理者の AUTO だけ。重みは使うときに初めて読む */
  if (Engine.setAiValueNet) Engine.setAiValueNet(cfg.valnet ? valnetModel() : null, cfg.valnet || 0);
}

self.onmessage = (e) => {
  const m = e.data || {};
  try {
    if (m.type === 'init') { Engine.init(m.cards, m.effects, m.extra); self.postMessage({ id: m.id, ok: true }); return; }
    configure(m.config);
    const result = m.type === 'answer' ? Engine.ai.answer(m.state, m.req) : Engine.ai.action(m.state);
    self.postMessage({ id: m.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) });
  }
};
