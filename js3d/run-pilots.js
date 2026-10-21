/* =========================================================================
 * 勝ち抜き戦の「挑む子」(2026-10-19 ユーザー「入れていい」。案は ideas/roguelike-ideas-2026-10-16.md の 3)
 *   Slay the Spire のキャラ選び。ストーリーの4人から1人を選んで始める (選ばずに、いままでどおり始めてもよい)
 *   ・はじめのプロトコル (start) が、はじめからデッキのいちばん左に入っていて外れない。
 *     弱いプロトコル (protocol-strength.js で勝率 0.44 未満) から1人1つ (2026-10-21 ユーザー「弱いプロトコルに入れ替えたい」。
 *     はじめは得意プロトコル (avatar-lines.js の FAVORITE) で、そのあと値 −1 にしていた)
 *     (ドラフトは残りの2つ。精鋭の入れ替え・転送装置でも外れない)
 *   ・その子だけのパッチ (専用パッチ) が1つ、はじめから付いている。系統 (HAND など) には数えない
 *   ・地図をその子のちび (art/chibi/) が歩く
 *   効き目は run.js が pilotPerk(run, 'xxx') で見る
 * ========================================================================= */
/* id はアバターの id (茜 = nadeshiko、瑠璃 = asagi、杏 = yamabuki のまま。記録が id で残っているため)。
   start: はじめのプロトコル。性格に寄せて選んだ (紫苑 = 解析して取り込む ASSIMILATION、茜 = 冷めた APATHY、
   瑠璃 = 本気のデッキにも入る LIGHT、杏 = みんなで助ける UNITY)。METAL・CHAOS は余り
   perk: 専用パッチ。効き目は run.js (deepScan: battleOpts / tideGuide: healAmount / responder: battleOpts / tidyUp: removePrice) */
export const PILOTS = [
  { id: 'shion', name: '紫苑', color: '#a07bff', start: 'ASSIMILATION', bio: 'もと研究所の解析 AI。細かいところに気づいて、言い当てる',
    perk: { id: 'deepScan', name: 'DEEP SCAN', text: '相手のはじめの手札 −1' } },
  { id: 'nadeshiko', name: '茜', color: '#e0283c', start: 'APATHY', bio: 'もとお屋敷の家事 AI。いらないものは、きれいに片付ける',
    perk: { id: 'tidyUp', name: 'TIDY UP', text: 'ショップのカード除去が、いつも 3 クレジット安い (最低 1)' } },
  { id: 'asagi', name: '瑠璃', color: '#3d7dff', start: 'LIGHT', bio: 'もと水族館の案内 AI。みんなを無事に送り届ける',
    perk: { id: 'tideGuide', name: 'TIDE GUIDE', text: '休憩所で休むと、ライフの回復が +3' } },
  { id: 'yamabuki', name: '杏', color: '#ff8a2a', start: 'UNITY', bio: 'もと警備・レスキューの AI。誰より先に駆けつける',
    perk: { id: 'responder', name: 'FIRST RESPONDER', text: 'いつも先攻' } }
];

const BY_ID = Object.fromEntries(PILOTS.map(p => [p.id, p]));
export const pilotOf = (run) => (run && run.pilot && BY_ID[run.pilot]) || null;
export const pilotInfo = (id) => BY_ID[id] || null;
/** その専用パッチが効いているか */
export const pilotPerk = (run, perkId) => { const p = pilotOf(run); return !!(p && p.perk.id === perkId); };
/** 外せないプロトコル (挑む子のはじめのプロトコル。選んでいなければ null) */
export const lockedProto = (run) => { const p = pilotOf(run); return p ? p.start : null; };

/* ちびの絵 (art/chibi/<id>_<向き>_<足>.webp)。向き: front / back / side、足: stand / walk1 / walk2 */
export const chibiArt = (id, dir = 'front', frame = 'stand') => 'art/chibi/' + id + '_' + dir + '_' + frame + '.webp';
