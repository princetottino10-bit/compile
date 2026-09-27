/* =========================================================================
 * AI でしゃべらせる: 対戦のキャラのひとことを、プレイヤーが用意した API キーで AI に作らせる
 *   キー・会社・モデル・1日の上限は、このブラウザにだけ置く (compileAiTalk。アカウントの同期には入れない)。
 *   キーは選んだ会社のサーバーにだけ、ブラウザから直接送る。料金はキーの持ち主が払う。
 *   AI に渡すのは、だれでも見えることだけ (出来事・表で出たカードの名前・ターン数・コンパイルの数)。伏せたカードや手札は渡さない。
 *   声は付かない (吹き出しだけ)。失敗・上限・時間切れのときは、いつものセリフに戻る
 * ========================================================================= */
const KEY = 'compileAiTalk';
const TIMEOUT_MS = 3500;
const DEF = { on: false, provider: 'anthropic', model: '', base: '', key: '', cap: 300, day: '', used: 0 };

export const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', model: 'claude-haiku-4-5-20251001' },
  openai: { label: 'OpenAI', model: 'gpt-4o-mini', base: 'https://api.openai.com/v1' },
  custom: { label: 'OpenAI 互換 (URL を指定)', model: '', base: '' }
};

/* 出来事の説明 (AI に渡す)。{card} はカードの名前 */
const EVENT = {
  play: '自分が「{card}」を表向きで出した', down: '自分がカードを裏向きで伏せた', watch: '相手がカードを出したのを見た',
  compile: '自分がプロトコルをコンパイルした (大きな前進)', compiled: '相手にプロトコルをコンパイルされた',
  hurt: '相手の効果で、自分の盤面を大きく崩された', almost: 'あと少しでコンパイルできる', boost: '自分のラインの合計を大きく伸ばした',
  win: '対戦に勝った', lose: '対戦に負けた', hello: '対戦が始まる。相手にあいさつする', turn: '自分の番が来た',
  chain: '自分のカードの効果が次々につながった', refresh: '手札を引き直して整えた', idle: '自分の番なのに、長く考え込んでいる (自分に声をかける)',
  control: '主導権 (コントロール) を取った', handes: '相手の効果で手札を捨てさせられた', wipe: '自分の効果で、盤面のカードをまとめて片付けた',
  rearrange: '自分のプロトコルの並びを入れ替えた'
};
/* チュートリアルの案内は、決まった言い方のほうがわかりやすいので AI にしない */
const SKIP = new Set(['lesson', 'good', 'retry']);

/* いまは管理者だけ (みんなに出すのは待ち)。main.js が管理者かどうかを教える */
let talkOpen = () => false;
export function setTalkGate(fn) { talkOpen = fn; }
export const talkShown = () => { try { return !!talkOpen(); } catch (e) { return false; } };

const today = () => new Date().toLocaleDateString('sv-SE');
export function talkConfig() {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { ...DEF }; }
}
function saveTalk(patch) {
  const next = { ...talkConfig(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* private mode */ }
  return next;
}
/** 今日使った回数 (日が変わると 0) */
export function talkUsed(c = talkConfig()) { return c.day === today() ? (c.used | 0) : 0; }
export const talkReady = (c = talkConfig()) => !!(talkShown() && c.on && c.key && modelOf(c) && (c.provider !== 'custom' || c.base));
const modelOf = (c) => c.model || (PROVIDERS[c.provider] || {}).model || '';
const baseOf = (c) => (c.provider === 'custom' ? c.base : (PROVIDERS[c.provider] || {}).base || '').replace(/\/+$/, '');

let lastError = '';
const recent = {};                                     // キャラごとの、直前に言ったこと (同じことを言わないように)

/* AI の答えを吹き出しの長さにそろえる (1行目だけ・かっこを外す・40字まで) */
export function cleanLine(t) {
  let s = String(t || '').trim().split(/\n/)[0].trim();
  s = s.replace(/^[「『"'“]+|[」』"'”]+$/g, '').replace(/^[^:：]{1,12}[:：]\s*/, '').trim();
  return Array.from(s).slice(0, 40).join('');
}

/** キャラの話し方 (いつものセリフから見本を少し) と、その場のこと から、AI に渡す文を作る */
export function buildPrompt(def, kind, vars, ctx) {
  const samples = [];
  for (const list of Object.values(def.lines || {})) for (const e of list.slice(0, 1)) samples.push(Array.isArray(e) ? e[0] : e);
  let ev = EVENT[kind] || kind;
  for (const [k, v] of Object.entries(vars || {})) ev = ev.split('{' + k + '}').join(v);
  const system = 'あなたはカードゲーム「COMPILE」の対戦者のキャラクター「' + def.name + '」です。' +
    'いつもの話し方の見本: ' + samples.slice(0, 10).map(s => '「' + s + '」').join(' ') +
    '\n見本と同じ口調・一人称で、その場のひとことを1つだけ言ってください。日本語で25字以内。セリフだけを書き、説明・かっこ・名前は付けない。';
  const bits = ['出来事: ' + ev];
  if (ctx) {
    if (ctx.turns) bits.push('ターン: ' + ctx.turns);
    if (ctx.mine !== undefined) bits.push('コンパイルした数: 自分 ' + ctx.mine + ' / 相手 ' + ctx.theirs + ' (3 つで勝ち)');
    if (ctx.foe) bits.push('相手のキャラ: ' + ctx.foe);
  }
  const said = recent[def.name];
  if (said && said.length) bits.push('さっき言ったこと (くり返さない): ' + said.join(' / '));
  return { system, user: bits.join('\n') };
}

async function callAI(c, system, user) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    if (c.provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: modelOf(c), max_tokens: 80, system, messages: [{ role: 'user', content: user }] })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return (j.content || []).map(x => x.text || '').join('');
    }
    const r = await fetch(baseOf(c) + '/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + c.key },
      body: JSON.stringify({ model: modelOf(c), max_tokens: 80, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return ((j.choices || [])[0] || {}).message?.content || '';
  } finally { clearTimeout(timer); }
}

/** ひとことを AI に作らせる。使わないとき・失敗したときは null (いつものセリフを使う) */
export async function aiLine(def, kind, vars, ctx) {
  const c = talkConfig();
  if (!talkReady(c) || SKIP.has(kind) || !EVENT[kind]) return null;
  if (talkUsed(c) >= (c.cap | 0)) return null;
  saveTalk({ day: today(), used: talkUsed(c) + 1 });
  try {
    const { system, user } = buildPrompt(def, kind, vars, ctx);
    const line = cleanLine(await callAI(c, system, user));
    if (!line) return null;
    recent[def.name] = (recent[def.name] || []).concat(line).slice(-4);
    lastError = '';
    return line;
  } catch (e) {
    lastError = e && e.name === 'AbortError' ? '時間切れ (' + TIMEOUT_MS / 1000 + ' 秒)' : String(e && e.message || e);
    return null;
  }
}

/* ---- 設定画面の欄 (settings.js から) ---- */
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
export function talkSettingsHtml() {
  if (!talkShown()) return '';
  const c = talkConfig();
  const keyNote = c.key ? '保存済み (末尾 ' + esc(c.key.slice(-4)) + ')' : 'まだありません';
  return '<div class="st-aitalk">' +
    '<label class="st-row st-check"><span>AI でしゃべらせる<small>キャラのひとことを AI が、その場に合わせて作ります。自分の API キーを使い、料金はキーの持ち主にかかります。声は付かず吹き出しだけ。うまくいかないときは、いつものセリフに戻ります</small></span>' +
      '<input type="checkbox" id="stTalkOn"' + (c.on ? ' checked' : '') + '></label>' +
    '<div class="st-talk-body"' + (c.on ? '' : ' hidden') + '>' +
      '<label class="st-row"><span>AI の会社</span><select class="lv-pick" id="stTalkProv">' +
        Object.entries(PROVIDERS).map(([k, p]) => '<option value="' + k + '"' + (c.provider === k ? ' selected' : '') + '>' + p.label + '</option>').join('') + '</select></label>' +
      '<label class="st-row"><span>モデル<small>空なら ' + esc((PROVIDERS[c.provider] || {}).model || '(指定してください)') + '</small></span>' +
        '<input type="text" class="st-text" id="stTalkModel" autocomplete="off" spellcheck="false" value="' + esc(c.model) + '"></label>' +
      '<label class="st-row"' + (c.provider === 'custom' ? '' : ' hidden') + ' id="stTalkBaseRow"><span>URL<small>…/v1 まで (OpenRouter や手元の AI など)</small></span>' +
        '<input type="url" class="st-text" id="stTalkBase" autocomplete="off" spellcheck="false" placeholder="https://…/v1" value="' + esc(c.base) + '"></label>' +
      '<label class="st-row"><span>API キー<small>' + keyNote + '。このブラウザにだけ保存し、選んだ会社にだけ送ります (アカウントの同期には入りません)</small></span>' +
        '<input type="password" class="st-text" id="stTalkKey" autocomplete="off" spellcheck="false" placeholder="' + (c.key ? '変えるときだけ入力' : 'キーを貼る') + '"></label>' +
      '<label class="st-row"><span>1日に使う上限<small>今日 <i id="stTalkUsed">' + talkUsed(c) + '</i> 回。上限を超えたら、いつものセリフに戻ります</small></span>' +
        '<input type="number" class="st-text st-num" id="stTalkCap" min="0" max="5000" step="10" value="' + (c.cap | 0) + '"></label>' +
      '<div class="pz-row"><button type="button" id="stTalkTest">ためしに1回しゃべらせる</button>' +
        (c.key ? '<button type="button" id="stTalkForget">キーを消す</button>' : '') + '</div>' +
      '<p class="st-talk-out" id="stTalkOut" role="status"></p>' +
    '</div></div>';
}
/** 欄の操作をつなぐ。rerender: 欄を描き直す関数。sample: ためしに話させるキャラを返す (async) */
export function bindTalkSettings(el, rerender, sample) {
  const q = (s) => el.querySelector(s);
  if (!q('#stTalkOn')) return;
  q('#stTalkOn').onchange = (ev) => { saveTalk({ on: ev.target.checked }); rerender(); };
  if (!q('#stTalkProv')) return;
  q('#stTalkProv').onchange = (ev) => { saveTalk({ provider: ev.target.value, model: '' }); rerender(); };
  q('#stTalkModel').onchange = (ev) => saveTalk({ model: ev.target.value.trim() });
  q('#stTalkBase').onchange = (ev) => saveTalk({ base: ev.target.value.trim() });
  q('#stTalkKey').onchange = (ev) => { const v = ev.target.value.trim(); if (v) { saveTalk({ key: v }); rerender(); } };
  q('#stTalkCap').onchange = (ev) => saveTalk({ cap: Math.max(0, Math.min(5000, ev.target.value | 0)) });
  const forget = q('#stTalkForget');
  if (forget) forget.onclick = () => { saveTalk({ key: '' }); rerender(); };
  q('#stTalkTest').onclick = async () => {
    const out = q('#stTalkOut');
    const c = talkConfig();
    if (!talkReady(c)) { out.textContent = c.key ? 'モデルか URL が足りません' : 'API キーを入れてください'; return; }
    out.textContent = '問い合わせ中…';
    const who = await sample();
    const line = await aiLine(who, 'hello', null, { turns: 1, mine: 0, theirs: 0 });
    out.textContent = line ? who.name + '「' + line + '」' : 'うまくいきませんでした: ' + (lastError || '答えが空でした') + '。キー・モデル・URL を確かめてください';
    const used = q('#stTalkUsed');
    if (used) used.textContent = talkUsed();
  };
}
