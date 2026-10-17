/* =========================================================================
 * お知らせ (更新情報)。タイトル画面の右上の「お知らせ」と、入口のページ (index.html) で見せる
 *   - 新しいお知らせは NEWS の先頭に足す。id は一度出したら変えない (読んだ印に使う)
 *   - img は art/news/ の 16:9 のスクショ (800×450 の webp)。無くてもよい
 *   - 書くのは遊ぶ人に見える変化だけ。管理者だけの機能 (STORY・ORACLE のオート操作) は書かない
 *   - ほかのモジュールを import しない (index.html からも素のまま読むため)
 * ========================================================================= */

/* kind: new = 新しく遊べるもの / tune = 強さ・遊び心地の調整 / fix = 直したこと / info = そのほか */
export const KINDS = {
  new: '新しい遊び',
  tune: '調整',
  fix: '直したこと',
  info: 'お知らせ'
};

export const NEWS = [
  {
    id: '2026-10-17-rainbow-neos', date: '2026-10-17', kind: 'new',
    title: 'ヒーロー融合に「レインボーネオス」',
    body: [
      'カオス勝ち抜き戦の異変「ヒーロー融合」で、シャイニングフレアウィングマンかフェニックスガイと、表向きの LIGHT のカードが自分の側にそろうと、手番の終わりにレインボーネオスに融合します。',
      '攻撃力 4500。出てきたときに相手の一番上のカードをすべて削除し、次の手番のはじめの攻撃でライフ 4000 を一撃で削り切ります。'
    ],
    go: 'run'
  },
  {
    id: '2026-10-17-hero-fusion', date: '2026-10-17', kind: 'new',
    img: 'art/news/hero-fusion.webp', alt: 'ヒーロー融合の異変。上にライフ 4000 の札、場にシャイニングフレアウィングマン',
    title: 'カオス勝ち抜き戦に「ヒーロー融合」',
    body: [
      'どちらもライフ 4000 で始まる異変です。FIRE 1 (フェザーマン) と FIRE 3 (バーストレディ) が自分の側にそろっているとき、相手がコンパイルするとシャイニングフレアウィングマン、自分がコンパイルするとフェニックスガイに融合します。',
      'どちらも攻撃力 2100。自分の手番のはじめに相手を攻撃して 2100 ダメージを与えます。2回通ればライフが尽きて勝ちです。フェニックスガイは表向きの間、効果では削除されません。'
    ],
    go: 'run'
  },
  {
    id: '2026-10-17-chaos-rules', date: '2026-10-17', kind: 'new',
    img: 'art/news/chaos-rules.webp', alt: '天地逆転の異変で、上下さかさまになった対戦画面',
    title: 'カオス勝ち抜き戦に、遊び方を壊す異変',
    body: [
      '目隠し (自分の手札も裏向きの札も見えない)、5秒ルール (時間切れならでたらめに打つ)、天地逆転 (画面が上下さかさま) が加わりました。どれも勝てばクレジット +4 です。',
      '負けるが勝ち (先にコンパイルし終えた方の負け) と、手札交換 (4手番ごとに相手と手札がまるごと入れ替わる) も出るようになりました。'
    ],
    go: 'run'
  },
  {
    id: '2026-10-17-chaos-run', date: '2026-10-17', kind: 'new',
    img: 'art/news/chaos-run.webp', alt: 'カオス勝ち抜き戦の戦う前の画面。異変が3つ並んでいる',
    title: 'RUN に「カオス勝ち抜き戦」',
    body: [
      'RUN の3つ目のモードです。地図はいつもと同じですが、試合ごとに「異変」がスロットで 1〜3 個かかります。手札 7 枚、値が 2 倍、Ω の雨、デッキの入れ替わり、酔っぱらいの CPU など、18 種類あります。',
      'はじめからパッチを2つもらえます (LEGENDARY も出ます)。イベントには Ω の祭壇・運命のルーレット・コピー機・地下カジノ・闇の商人があり、宝箱はときどきミミックです。',
      'ボスを倒すと LOOP。ボスの Ω カードを奪って、異変が増えた新しい地図をもう1周できます。',
      'ふつうの勝ち抜き戦の途中は、そのまま取っておかれます。'
    ],
    go: 'run'
  },
  {
    id: '2026-10-16-honki', date: '2026-10-16', kind: 'new',
    img: 'art/news/honki.webp', alt: 'CHALLENGE の強敵の一覧。本気紫苑・本気瑠璃・本気杏・本気茜が並ぶ',
    title: 'CHALLENGE に「本気の4人」が登場',
    body: [
      '紫苑・瑠璃・杏・茜が、得意のプロトコルを入れた本気のデッキで挑んできます。CHALLENGE の強敵から選べます。',
      '実績 GAUNTLET は、GATEKEEPER と本気の4人に勝つと達成になりました。',
      'ロック特化と挑戦者は CHALLENGE の一覧から外し、「自由に選ぶ」から選べるようにしました。'
    ],
    go: 'challenge'
  },
  {
    id: '2026-10-16-gatekeeper', date: '2026-10-16', kind: 'info',
    img: 'art/news/gatekeeper.webp', alt: 'CHALLENGE の GATEKEEPER の札',
    title: 'CPU「最強」の名前を GATEKEEPER に変えました',
    body: [
      '本気の4人・ORACLE がさらに上に並び、いちばん強い CPU ではなくなったためです。強さは変わりません。',
      '戦績・称号の説明・下剋上・勝ち抜き戦の最終ボスの名前も GATEKEEPER になっています。'
    ]
  },
  {
    id: '2026-10-16-omega', date: '2026-10-16', kind: 'new',
    img: 'art/news/omega.webp', alt: 'RUN の勝ち抜き戦の入口',
    title: '勝ち抜き戦のボスの山札に Ω カード',
    body: [
      'ORACLE が「この盤面なら勝てる」と考えて作った Ω カードが、RUN のボスの山札に入りました。',
      '最終ボス GATEKEEPER には2枚、ほかの6体のボスには1枚ずつ入ります。Ω カードはボスだけが使い、あなたは手に入れられません。'
    ],
    go: 'run'
  },
  {
    id: '2026-10-16-cpu-read', date: '2026-10-16', kind: 'tune',
    img: 'art/news/cpu-read.webp', alt: 'CPU との対戦の盤面',
    title: 'つよい以上の CPU の読みを強くしました',
    body: [
      '2本コンパイル済みで DIVERSITY 0 を持っていると、場のカードの種類をそろえて3本目を取りに来ます。',
      'GATEKEEPER 以上の CPU は、HATE 3 と SPIRIT 1 を割りに行き、コントロールで並べ替えられる見込みも読みます。',
      'あなたのロックのラインのコンパイルが決まったら、CPU は張り合わずにほかのラインかリフレッシュを選びます。',
      'CPU が、表になって見えたカードの行方を覚えて読みに使います。つよい以上の CPU は SPEED 0 と 3 を場に残して使い回します。'
    ]
  },
  {
    id: '2026-10-16-ui-fix', date: '2026-10-16', kind: 'fix',
    img: 'art/news/ui-fix.webp', alt: '並べ替えの帯。右端に大きな確定のボタン',
    title: 'スマホで決定ボタンが帯に重なるのを直しました',
    body: [
      '手札を捨てる選択で、縦持ちのとき決定ボタンが帯の文に重なっていました。帯に「何枚捨てるか」も書くようにしました。',
      'プロトコルの並べ替えの「確定」を帯の右端に固定し、大きくしました。'
    ]
  },
  {
    id: '2026-10-15-oracle', date: '2026-10-15', kind: 'new',
    img: 'art/news/oracle.webp', alt: 'CHALLENGE の ORACLE の札',
    title: 'ORACLE に CHALLENGE で挑めるように',
    body: [
      '管理者の自動プレイに使っている ORACLE と、CHALLENGE の CPU 戦で誰でも戦えるようになりました。',
      'ORACLE 戦の曲はボス戦の曲です。'
    ],
    go: 'challenge'
  },
  {
    id: '2026-10-15-online-time', date: '2026-10-15', kind: 'tune',
    title: 'オンライン対戦の持ち時間を延ばしました',
    body: ['1手 300 秒・1試合 30 分になりました。効果の選択でじっくり考えても、時間切れになりにくくなっています。']
  },
  {
    id: '2026-10-15-bgm', date: '2026-10-15', kind: 'new',
    title: 'BGM の「おまかせ」で曲をシャッフル',
    body: ['設定の BGM で「おまかせ」を選ぶと、曲を順番を変えながら流します。']
  },
  {
    id: '2026-10-15-fixes', date: '2026-10-15', kind: 'fix',
    img: 'art/news/logo.webp', alt: 'タイトル画面。COMPILE のロゴが切れずに出ている',
    title: 'CPU の考える速さなど、いくつか直しました',
    body: [
      'CPU の読みが約4倍速くなりました (選ぶ手は変わりません)。相手があと1本の終盤で CPU が長く止まることも直しました。',
      'WATER 3 などで「すべて戻す・すべて削除する」とき、カードが効果を解き終える前に着地していたのを直しました。',
      '勝ち抜き戦で強化したカードの効果発動回数が、戦績に数えられていなかったのを直しました。',
      '広い画面でタイトルのロゴが「COMPIL」と切れていたのを直しました。'
    ]
  }
];

/* 「すべて」・未読の数・自動で開くのに使うお知らせ。直したことは「直したこと」のタブでだけ見せる
   (ソシャゲのお知らせと同じく、目に入る一覧は新しい遊びと調整に絞る) */
export const isHeadline = (n) => n.kind !== 'fix';
export const headlines = (list = NEWS) => list.filter(isHeadline);

const SEEN_KEY = 'compileNewsSeen';      // 読んだお知らせの id (配列)
const POPPED_KEY = 'compileNewsPopped';  // 自動で開いたときの、いちばん新しいお知らせの id

function store() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (e) { return null; }
}
export function seenIds(ls = store()) {
  try {
    const v = JSON.parse((ls && ls.getItem(SEEN_KEY)) || 'null');
    return Array.isArray(v) ? v : null;
  } catch (e) { return null; }
}
/** まだ読んでいないお知らせ。一度も開いていない人 (seen が null) は、全部まだ */
export function unreadNews(seen = seenIds(), list = NEWS) {
  const s = new Set(seen || []);
  return headlines(list).filter(n => !s.has(n.id));
}
export function markAllRead(ls = store(), list = NEWS) {
  try { if (ls) ls.setItem(SEEN_KEY, JSON.stringify(list.map(n => n.id))); } catch (e) { /* private mode */ }
}
/** メニューを出したときに自動で開くか。読んでいないものがあり、いちばん新しいもので一度も開いていなければ */
export function shouldPop(ls = store(), list = NEWS) {
  if (!list.length || !unreadNews(seenIds(ls), list).length) return false;
  try { return !ls || ls.getItem(POPPED_KEY) !== list[0].id; } catch (e) { return false; }
}
export function markPopped(ls = store(), list = NEWS) {
  try { if (ls && list.length) ls.setItem(POPPED_KEY, list[0].id); } catch (e) { /* private mode */ }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** 2026-10-16 → 10/16 */
export const shortDate = (d) => String(d).replace(/^\d{4}-0?(\d+)-0?(\d+)$/, '$1/$2');

/** 一覧の HTML。unread に入っているものには NEW。open の id のものは開いた形で出す。
 *  goLabel があれば、遊びの入口へ行くボタンを付ける (data-news-go に mode)。base は画像のパスの前に付ける */
export function newsListHtml(list, { unread = new Set(), open = null, goLabel = null, base = '' } = {}) {
  if (!list.length) return '<p class="nw-empty">このなかまのお知らせはまだありません</p>';
  return list.map(n =>
    '<details class="nw-item" data-kind="' + esc(n.kind) + '"' + (n.id === open ? ' open' : '') + '>' +
      '<summary><span class="nw-meta"><time datetime="' + esc(n.date) + '">' + shortDate(n.date) + '</time>' +
        '<i class="nw-tag">' + esc(KINDS[n.kind] || KINDS.info) + '</i>' +
        (unread.has(n.id) ? '<i class="nw-new">NEW</i>' : '') + '</span>' +
        '<b>' + esc(n.title) + '</b>' +
        /* 一覧では小さく、開くと大きく (ソシャゲのお知らせのバナーのように) */
        (n.img ? '<img class="nw-thumb" alt="" loading="lazy" width="96" height="54" src="' + esc(base + n.img) + '">' : '') + '</summary>' +
      '<div class="nw-body">' +
        (n.img ? '<img class="nw-shot" loading="lazy" width="800" height="450" alt="' + esc(n.alt || '') + '" src="' + esc(base + n.img) + '">' : '') + n.body.map(p => '<p>' + esc(p) + '</p>').join('') +
        (n.go && goLabel && goLabel(n.go) ? '<button type="button" class="nw-go" data-news-go="' + esc(n.go) + '">' + esc(goLabel(n.go)) + '</button>' : '') +
      '</div></details>'
  ).join('');
}

const TABS = [['all', 'すべて'], ['new', KINDS.new], ['tune', KINDS.tune], ['fix', KINDS.fix]];
const GO_LABEL = { challenge: 'CHALLENGE を開く', run: 'RUN を開く' };

/** お知らせの小窓。onGo(mode) を渡すと、記事から遊びの入口へ行ける (タイトル画面から開いたとき) */
export function openNews({ onGo = null, onClose = null } = {}) {
  let el = document.getElementById('newsOv');
  if (!el) {
    el = document.createElement('div');
    el.id = 'newsOv';
    el.className = 'pz-ov';
    document.body.appendChild(el);
  }
  /* 開いたときに読んでいなかったものだけ NEW (開いたら読んだことにする。ソシャゲの「お知らせ」と同じ)。
     直したことにも NEW は付ける (未読の数には数えないが、タブを開けば新しいものが分かる) */
  const seen = new Set(seenIds() || []);
  const unread = new Set(NEWS.filter(n => !seen.has(n.id)).map(n => n.id));
  const first = headlines().find(n => unread.has(n.id)) || headlines()[0];
  markAllRead();
  el.innerHTML = '<div class="pz-card st-card nw-card" role="dialog" aria-modal="true" aria-label="お知らせ">' +
    '<div class="pz-head"><b>NEWS<small>お知らせ・更新情報</small></b><button type="button" class="pz-x"><span>閉じる</span></button></div>' +
    '<div class="nw-tabs" role="tablist">' + TABS.map(([k, label], i) =>
      '<button type="button" role="tab" data-tab="' + k + '" aria-selected="' + (i === 0) + '">' + label + '</button>').join('') + '</div>' +
    '<div class="nw-list pz-scroll"></div></div>';
  const listEl = el.querySelector('.nw-list');
  const goLabel = onGo ? (m) => GO_LABEL[m] : null;
  const show = (tab, open) => {
    const list = tab === 'all' ? headlines() : NEWS.filter(n => n.kind === tab);
    listEl.innerHTML = newsListHtml(list, { unread, open, goLabel });
    listEl.scrollTop = 0;
  };
  show('all', first && first.id);
  el.classList.add('show');
  const close = () => {
    el.classList.remove('show');
    if (onClose) onClose();
  };
  el.onclick = (ev) => {
    if (ev.target === el) { close(); return; }
    const tab = ev.target.closest('[data-tab]');
    if (tab) {
      for (const b of el.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b === tab));
      show(tab.dataset.tab, null);
      return;
    }
    const go = ev.target.closest('[data-news-go]');
    if (go && onGo) { close(); onGo(go.dataset.newsGo); }
  };
  el.querySelector('.pz-x').onclick = close;
}
