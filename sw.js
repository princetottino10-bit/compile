/* =========================================================================
 * COMPILE 3D ARENA のサービスワーカー (いちばん控えめな形)
 *   ・同じサイトの読み込みは、いつも先にネットへ取りに行く (つながっているときに古い版を出さない)
 *   ・ネットに届かなかったとき (オフライン) だけ、前に読み込んだ控えを出す
 *   ・ほかのサイト (サーバー・書体) には手を出さない
 *   止めたいとき: サイトに sw-off という名前のファイルを置く (開いた人の登録を外す)。
 *   1人だけなら、アドレスに ?nosw=1 を付けて開く (js3d/firstrun.js が登録を外す)
 * ========================================================================= */
/* v2 (2026-10-10): ページは毎回サーバーに確かめる・同じファイルの古い版の控えを捨てる。上げると前の控えはまとめて捨てられる */
const VERSION = 'v2';
const CACHE = 'compile-arena-' + VERSION;

/* sw-off があれば、自分の登録を外して控えを捨てる */
async function killed() {
  try {
    const r = await fetch(new URL('sw-off', self.registration.scope), { cache: 'no-store' });
    return r.ok;
  } catch (e) {
    return false;
  }
}
async function selfDestruct() {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith('compile-arena-')).map(k => caches.delete(k)));
  await self.registration.unregister();
}

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    if (await killed()) { await selfDestruct(); return; }
    /* 前の版の控えは捨てる */
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('compile-arena-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw-off') || url.pathname.endsWith('/sw.js')) return;
  /* 音の途中から (Range) の読み込みは、控えにできないのでそのまま */
  if (req.headers.has('range')) return;
  ev.respondWith((async () => {
    try {
      /* ページ (three-play.html など) は、ブラウザの控え (最大10分) を使わずサーバーに確かめる。
         古いページが新しい部品を読んで混ざり、「開き直しを2回しないと新しい版にならない」原因になっていた */
      const res = await fetch(req, req.mode === 'navigate' ? { cache: 'no-cache' } : undefined);
      /* 取れたものだけ控える (控えるのに失敗しても、届いたものはそのまま返す) */
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        ev.waitUntil(caches.open(CACHE).then(async (c) => {
          await c.put(req, copy);
          /* 版の付いた部品 (?v=) は、同じファイルの古い版の控えを捨てる (公開のたびに増えて、端末の容量を食っていた) */
          if (url.searchParams.has('v')) {
            for (const k of await c.keys()) {
              const ku = new URL(k.url);
              if (ku.pathname === url.pathname && ku.search !== url.search) await c.delete(k);
            }
          }
        }).catch(() => {}));
      }
      return res;
    } catch (err) {
      /* ネットに届かない: 控えがあれば出す。ページ (?quick=1 など) はアドレスの後ろを無視して探す */
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req) || (req.mode === 'navigate' ? await cache.match(req, { ignoreSearch: true }) : null);
      if (hit) return hit;
      throw err;
    }
  })());
});
