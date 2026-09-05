/* =========================================================================
 * 3Dビュー: engine の request.prompt を日本語に訳す辞書
 *   文言は auto-play.html の PROMPT_TEXT と揃える。
 * ========================================================================= */

export const PROMPT_TEXT = {
  'flip': '反転させるカードを選択', 'delete': '削除するカードを選択', 'return': '手札に戻すカードを選択',
  'shift': '移動させるカードを選択', 'reveal': '公開するカードを選択',
  'optional-flip': '反転させるカードを選択(任意)', 'optional-delete': '削除するカードを選択(任意)',
  'optional-return': '戻すカードを選択(任意)', 'optional-shift': '移動させるカードを選択(任意)',
  'optional-reveal': '公開するカードを選択(任意)',
  'discard': '捨て札にするカードを選択', 'clear-cache': '手札が6枚以上: 捨て札にするカードを選択',
  'shift-dest': '移動先のラインを選択', 'play-dest': 'プレイ先のラインを選択',
  'choose-line': '対象のラインを選択', 'choose-line-8plus': '対象のライン(8枚以上)を選択',
  'each-line-order': '処理するラインを選択', 'each-order': '処理するカードを選択',
  'trigger-order': '先に解決する効果を選択', 'uncover-order': '先に解決するカードを選択',
  'start-order': '解決順を選択', 'end-order': '解決順を選択',
  'compile-line': 'コンパイルするラインを選択', 'compile-replace-shift': '移動先のラインを選択',
  'mass-shift-dest': '移動先のラインを選択', 'control-rearrange': 'コントロール: プロトコルを並べ替えますか?',
  'rearrange': '新しい並び順を選択', 'give-card': '相手に渡すカードを選択',
  'reveal-hand-card': '公開する手札を選択', 'play-card': 'プレイするカードを選択',
  'play-free': 'プレイするカードとラインを選択', 'choice': '効果を選択',
  'optional-draw': 'カードを引きますか?', 'optional-discard': '捨て札にしますか?', 'optional-give': '手札を渡しますか?',
  'declare-value': '値を1つ宣言する', 'declare-protocol': 'プロトコルを1つ宣言する',
  'optional-discard-top': '公開したカードを捨て札にしますか?', 'optional-play': 'このカードをプレイしますか?',
  'discard-order': '先に手札を捨てるのはどちら?', 'swap-stack-1': '入れ替えるスタック(1つ目)を選択',
  'swap-stack-2': '入れ替えるスタック(2つ目)を選択', 'mirror-middle': 'コピーする相手の中段を選択',
  'steal-to-hand': '手札に加える相手の裏向きカードを選択', 'play-from-trash': 'プレイする捨て札のカードを選択',
  'search-pick': '手札に加えるカードを選択'
};

export const OP_LABEL = {
  flip: '反転する', shift: '移動する', discard: '手札を捨てる',
  draw: 'カードを引く', 'delete': '削除する', 'return': '戻す'
};

/* request の見出し文を組み立てる (context にカード名が入る場合は前置き) */
export function reqText(req, cardName) {
  let t = PROMPT_TEXT[req.prompt] || '選択してください';
  if (req.context) {
    const label = (cardName && cardName(req.context)) || req.context;
    t = '[' + label + '] ' + t;
  }
  return t;
}

export function optionLabel(o) {
  if (o === null || o === undefined) return '';
  if (typeof o === 'string') return OP_LABEL[o] || o;
  return String(o.label || o.text || o);
}
