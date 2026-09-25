'use strict';
/* 詰めコンパイルの候補 (tsume_gen.js の出力) から、遊ぶ問題を選んで data/tsume.json に書く。
 *   node scripts/tsume_pick.js 候補1.json 候補2.json ...
 * 初級5問・中級10問・上級10問。どの段にも相手の盤面を使う問題を混ぜ、お題とプロトコルが偏らないように選ぶ。
 * 手順 (模範解答) を読める文にして一緒に書き、種 1 の盤面で解けることを確かめる。
 * 選ばなかった候補 (読む量 7 以上) は、日替わりの「今日の問題」用に data/tsume-daily.json へ */
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');

const root = path.join(__dirname, '..');
const cards = JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8'));
E.init(cards, JSON.parse(fs.readFileSync(path.join(root, 'data/effects.json'), 'utf8')));
E.setTrace(true);

const PER_TIER_OF = { 1: 5, 2: 10, 3: 10 };   // 初級は慣らしの数問だけ。中級・上級を厚く
const ME = 0;
const defs = {};
for (const p of cards.protocols) for (const c of p.cards) defs[c.id] = { proto: p.name, value: c.value };
const cardName = (def) => defs[def] ? defs[def].proto + ' ' + defs[def].value : def;

/* 段は読む量 (連鎖の長さ + 考える選択の数) で決める。6 以下は短すぎるので使わない */
function tierOf(p) {
  if (p.depth >= 12) return 3;
  if (p.depth >= 9) return 2;
  if (p.depth >= 7) return 1;
  return 0;
}

/* 手順を文にする。盤面を1手ずつ進めながら、選んだカードやラインの名前を引く */
async function describe(p, PROMPT_TEXT, optionLabel) {
  let res = E.newPuzzle(p.spec, { seed: 1 });
  const steps = [];
  const protoOf = (st, side, l) => st.players[side].protocols[l].name;
  for (const a of p.solution) {
    const st = res.view || res.state;          // 選択の途中は view が解決途中の盤面 (state は手の前のまま)
    if (a.type === 'play') {
      const c = st.cards[a.card];
      const side = a.side === undefined ? ME : a.side;
      steps.push('手札の ' + cardName(c.def) + ' を ' + (side === ME ? '' : '相手の ') + protoOf(st, side, a.line) + ' のラインに' + (a.faceUp ? '表' : '裏') + '向きでプレイ');
    } else if (a.type === 'refresh') {
      steps.push('リフレッシュ (手札を5枚まで引く)');
    } else if (a.type === 'compile') {
      steps.push(protoOf(st, ME, a.line) + ' をコンパイル');
    } else if (a.type === 'choose') {
      const req = res.requests[0];
      const src = req.context && defs[req.context] ? '〈' + cardName(req.context) + '〉 ' : '';
      const what = PROMPT_TEXT[req.prompt] || '選ぶ';
      let ans;
      if (req.kind === 'pickCard' || req.kind === 'pickHand') {
        ans = a.picks.length ? a.picks.map(u => {
          const c = st.cards[u];
          const free = String(u).split('|');       // 「カードとライン」を一度に選ぶ形: uid|ライン|u(表)/d(裏)
          if (free.length === 3 && st.cards[free[0]]) {
            return cardName(st.cards[free[0]].def) + ' を ' + protoOf(st, ME, +free[1]) + ' のラインに' + (free[2] === 'u' ? '表' : '裏') + '向きで';
          }
          if (!c) {                        // 効果の解決順などは、カードではなく効果の印を選ぶ
            const m = String(u).match(/[A-Z]+_\d/);
            return m ? cardName(m[0]) : String(u);
          }
          let where = c.zone.startsWith('hand') ? '手札の ' : '';
          if (c.zone === 'field') {
            const l = [0, 1, 2].find(i => st.lines[i][c.owner].includes(u));
            where = (c.owner === ME ? '自分の ' : '相手の ') + protoOf(st, c.owner, l) + ' ラインの ';
          }
          const hidden = c.zone === 'field' && !c.faceUp && c.owner !== ME;
          return where + (hidden ? '裏向きのカード' : cardName(c.def)) + (c.zone === 'field' && !c.faceUp && !hidden ? ' (裏)' : '');
        }).join('、') : '選ばない';
      } else if (req.kind === 'pickLine') {
        const side = req.side === undefined ? null : req.side;
        ans = a.picks.map(l => side === null
          ? protoOf(st, ME, l) + ' / ' + protoOf(st, 1 - ME, l) + ' のライン'
          : (side === ME ? '' : '相手の ') + protoOf(st, side, l) + ' のライン').join('、');
      } else if (req.kind === 'yesNo') {
        steps.push(src + (/[?？]$/.test(what) ? what : '効果を使う') + ' → ' + (a.picks.length ? 'はい' : 'いいえ'));
        res = E.apply(res.state, a);
        if (res.error) throw new Error('手順が通らない: ' + res.error);
        continue;
      } else if (req.kind === 'option') {
        ans = a.picks.length ? optionLabel((req.options || [])[a.picks[0]]) || (a.picks[0] + 1) + '番目' : '選ばない';
      } else {
        ans = '並び: ' + a.picks.map(i => protoOf(st, ME, i)).join(' / ');
      }
      steps.push(src + what.replace(/を選択.*$/, '') + ' → ' + ans);
    }
    res = E.apply(res.state, a);
    if (res.error) throw new Error('手順が通らない: ' + res.error);
  }
  return { steps, res };
}

/* CPU (ヒューリスティック) がそのまま解けてしまう問題は、簡単すぎるので使わない */
E.setAiLevel(1);
function aiSolves(p) {
  for (let t = 0; t < 2; t++) {
    let res = E.newPuzzle(p.spec, { seed: 1 });
    for (let i = 0; i < 200 && res.state.turn === ME && res.state.winner === null; i++) {
      const q = res.requests[0];
      if (q && q.player !== ME) break;
      const a = q ? { type: 'choose', id: q.id, picks: E.ai.answer(res.state, q) } : (E.ai.action(res.state) || E.legalActions(res.state)[0]);
      const nx = E.apply(res.state, a);
      if (nx.error) break;
      res = nx;
    }
    if (solved(p, res)) return true;
  }
  return false;
}

function endState(res) {
  for (const t of (res.trace || [])) if (t.st && t.st.turn !== ME) return t.st;
  return res.state;
}

function solved(p, res) {
  const es = endState(res);
  if (res.state.winner === ME) return p.goal.kind === 'ready';
  if (p.goal.kind === 'ready') return E.compilableLines(es, ME).length > 0;
  if (p.goal.kind === 'emptyHand') return es.players[ME].hand.length === 0;
  return E.lineTotal(es, p.goal.line, ME) === p.goal.value;
}

(async () => {
  const { PROMPT_TEXT, optionLabel } = await import('../js3d/prompts.js');
  const files = process.argv.slice(2);
  if (!files.length) { console.error('候補のファイルを指定してください'); process.exit(1); }
  let all = [];
  for (const f of files) all = all.concat(JSON.parse(fs.readFileSync(f, 'utf8')));
  /* 同じ盤面は1つに */
  const seen = new Set();
  all = all.filter(p => { const k = JSON.stringify(p.spec); if (seen.has(k)) return false; seen.add(k); return true; });
  const before = all.length;
  all = all.filter(p => !aiSolves(p));
  console.log('CPU がそのまま解ける問題を除いた: ' + (before - all.length) + ' / ' + before);

  const out = [];
  const used = new Set();
  for (const tier of [1, 2, 3]) {
    const PER_TIER = PER_TIER_OF[tier];
    /* 相手の盤面を使う問題は 4〜6 割 (全部ではなく、混ぜる) */
    const OPP_MIN = Math.round(PER_TIER * 0.4), OPP_MAX = Math.round(PER_TIER * 0.6);
    /* 決まった順 (再実行で同じ結果)。当てずっぽうで解けにくい (解ける枝の割合が小さい) ものを優先。
       上級は読む量の多いものから、手順が長すぎる (12手を超える) ものは外す */
    const pool = all.filter(p => tierOf(p) === tier && p.solution.length <= 12)
      .sort((a, b) => (tier === 3 ? b.depth - a.depth : 0) || (a.rate - b.rate) || (b.chain - a.chain));
    const picked = [];
    const kinds = { ready: 0, emptyHand: 0, lineExact: 0 };
    const protoUse = {};
    const cap = { ready: 3, emptyHand: 3, lineExact: 6 };
    const take = (p) => {
      if (picked.length >= PER_TIER || picked.includes(p)) return;
      if (kinds[p.goal.kind] >= cap[p.goal.kind]) return;
      if (p.opp && picked.filter(x => x.opp).length >= OPP_MAX) return;
      const protos = p.spec.sides[0].protos;
      if (protos.some(n => (protoUse[n] || 0) >= 3)) return;
      picked.push(p);
      kinds[p.goal.kind]++;
      for (const n of protos) protoUse[n] = (protoUse[n] || 0) + 1;
    };
    for (const p of pool) if (p.opp && picked.filter(x => x.opp).length < OPP_MIN) take(p);
    for (const kind of ['ready', 'emptyHand']) for (const p of pool) if (p.goal.kind === kind && kinds[kind] < 2) take(p);
    for (const p of pool) take(p);
    /* 足りなければ、お題の偏りの上限を外して埋める */
    if (picked.length < PER_TIER) { cap.lineExact = cap.ready = cap.emptyHand = PER_TIER; for (const p of pool) take(p); }
    picked.sort((a, b) => (a.depth - b.depth) || (a.solution.length - b.solution.length));
    for (const p of picked) {
      used.add(p);
      const { steps, res } = await describe(p, PROMPT_TEXT, optionLabel);
      if (!solved(p, res)) throw new Error('種 1 で解けない問題: ' + JSON.stringify(p.goal));
      out.push({
        id: 't' + tier + '-' + String(picked.indexOf(p) + 1).padStart(2, '0'),
        tier, goal: p.goal, opp: !!p.opp, chain: p.chain, depth: p.depth, solutions: p.solutions,
        spec: p.spec, solution: p.solution, steps
      });
    }
    console.log('段 ' + tier + ': ' + picked.length + ' 問 (相手の盤面 ' + picked.filter(x => x.opp).length + ') ' + JSON.stringify(kinds));
  }
  fs.writeFileSync(path.join(root, 'data/tsume.json'), JSON.stringify(out));
  console.log('data/tsume.json に ' + out.length + ' 問');

  /* 今日の問題: 残りの候補。並びは盤面から決まる (再実行で同じ)。どの日に出るかは tsume.js が日付から決める */
  const rest = all.filter(p => !used.has(p) && tierOf(p) >= 1 && p.solution.length <= 12)
    .sort((a, b) => (JSON.stringify(a.spec) < JSON.stringify(b.spec) ? -1 : 1));
  const daily = [];
  for (const p of rest) {
    const { steps, res } = await describe(p, PROMPT_TEXT, optionLabel);
    if (!solved(p, res)) continue;
    daily.push({ id: 'd' + String(daily.length + 1).padStart(3, '0'), tier: tierOf(p), goal: p.goal, opp: !!p.opp,
      chain: p.chain, depth: p.depth, solutions: p.solutions, spec: p.spec, solution: p.solution, steps });
  }
  fs.writeFileSync(path.join(root, 'data/tsume-daily.json'), JSON.stringify(daily));
  console.log('data/tsume-daily.json に ' + daily.length + ' 問 (今日の問題)');
})().catch((e) => { console.error(e); process.exit(1); });
