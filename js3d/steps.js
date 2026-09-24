/* エンジンの記録 (trace) から、画面で1コマずつ見せる区切りを作る。
   - 盤面の見た目が変わったところで1コマ
   - 見た目が変わらなくてもフェイズが変わったら1コマ (開始フェイズの帯が効果の演出と重ならないように)
   - 見た目の変わらない効果の発動は、次のコマの合図 (cue / acts) として持つ
   - 選択に答えたあとの再実行では、いま出ている絵のところまで早送りする
   visualFingerprint は盤面の見た目の指紋を返す関数 (board.js) */
export function meaningfulSteps(prev, res, visualFingerprint) {
  if (!res || !res.trace || !res.trace.length) return [];
  const shownFp = visualFingerprint(prev);
  const steps = [];
  let last = shownFp;
  let pendingCue = null;
  let pendingActs = [];
  let lastPhase = prev ? prev.phase + ':' + prev.turn : null;
  for (const t of res.trace) {
    if (!t.st) continue;
    /* このコマまでに起きた効果の割り込み (チェーン表示) を、最後に通った記録で持つ */
    if (steps.length) steps[steps.length - 1].tr = t;
    const fp = visualFingerprint(t.st);
    /* フェイズの切り替わりは、絵が変わらなくても1ステップとして残す。
       そうしないと「開始フェイズ」の帯が、開始効果の演出と同時に出てしまう。 */
    const phaseTag = t.st.phase + ':' + t.st.turn;
    if (fp === last && phaseTag !== lastPhase) {
      lastPhase = phaseTag;
      steps.push({ st: t.st, fp, uid: null, msg: '', cue: pendingCue, acts: [], phaseOnly: true, tr: t, chain: t.chain });
      pendingCue = null;
      continue;
    }
    lastPhase = phaseTag;
    if (fp === last) {
      /* 絵は変わらないが、発動カードの合図だけは拾っておく */
      if (t.uid) {
        /* 発動の合図と一緒に、その瞬間の「処理中の効果の並び」も持つ (割り込みの判定に使う) */
        const cue = { uid: t.uid, msg: t.msg, chain: t.chain };
        if (steps.length) steps[steps.length - 1].cue = cue;
        else pendingCue = cue;
        /* 効果の発動 (上段/中段/下段) は、絵が変わる前にいくつ起きても全部残す。
           最後の1つだけにすると、続けて発動した効果が見えないまま処理された */
        if (/[上中下]段/.test(t.msg || '')) {
          if (steps.length) steps[steps.length - 1].acts.push(cue);
          else pendingActs.push(cue);
        }
      }
      continue;
    }
    last = fp;
    steps.push({ st: t.st, fp, uid: t.uid, msg: t.msg, cue: pendingCue, acts: pendingActs, tr: t, chain: t.chain });
    pendingCue = null;
    pendingActs = [];
  }
  /* 選択に答えると、エンジンはアクションを基準状態から再実行する。
     頭から再生すると盤面が巻き戻って見えるので、いま画面に出ている絵と
     一致する最後のステップまで早送りし、その続きだけを再生する */
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].fp === shownFp) return steps.slice(i + 1);
  }
  return steps;
}
