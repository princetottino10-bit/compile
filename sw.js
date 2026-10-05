/* =========================================================================
 * COMPILE 3D ARENA のサービスワーカー (いちばん控えめな形)
 *   ・同じサイトの読み込みは、いつも先にネットへ取りに行く (つながっているときに古い版を出さない)
 *   ・ネットに届かなかったとき (オフライン) だけ、前に読み込んだ控えを出す
 *   ・ほかのサイト (サーバー・書体) には手を出さない
 *   止めたいとき: サイトに sw-off という名前のファイルを置く (開いた人の登録を外す)。
 *   1人だけなら、アドレスに ?nosw=1 を付けて開く (js3d/firstrun.js が登録を外す)
 * ========================================================================= */
const VERSION = 'v1';
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
      const res = await fetch(req);
      /* 取れたものだけ控える (控えるのに失敗しても、届いたものはそのまま返す) */
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        ev.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}));
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
