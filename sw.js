// GSI tile cache: Cache Storage / 14-day retention
const CACHE_NAME = 'tile-cache-v1';
const CACHE_META_NAME = 'tile-cache-meta-v1';
const TILE_HOST = 'cyberjapandata.gsi.go.jp';
const MAX_AGE = 14 * 24 * 60 * 60 * 1000;

self.addEventListener('install', event => {
  // 新しいService Workerを待機させず、更新を適用する
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.includes(TILE_HOST)) return;

  // 地図タイル以外のGSIリソースは対象外
  if (!/\/xyz\/[^/]+\/\d+\/\d+\/\d+\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(request.url)) return;

  event.respondWith(handleTileRequest(request));
});

async function handleTileRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const meta = await caches.open(CACHE_META_NAME);
  const cached = await cache.match(request);

  if (cached) {
    const savedAt = await meta.match(request.url);
    const savedAtText = savedAt ? await savedAt.text() : '';
    const timestamp = Number(savedAtText);

    // メタ情報がない既存キャッシュは、今回から14日間の起点として扱う
    if (!savedAt || !Number.isFinite(timestamp)) {
      await meta.put(request.url, new Response(String(Date.now())));
      return cached;
    }

    if (Date.now() - timestamp < MAX_AGE) return cached;

    // 期限切れは一度ネットワーク更新を試みる
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok) {
        await cache.put(request, fresh.clone());
        await meta.put(request.url, new Response(String(Date.now())));
        return fresh;
      }
      return cached;
    } catch (error) {
      // オフライン時は期限切れでも手元のタイルを表示
      return cached;
    }
  }

  const response = await fetch(request);
  if (response && response.ok && (response.type === 'basic' || response.type === 'cors' || response.type === 'default')) {
    // Cache Storageへの書き込み完了を待ってから応答する
    await cache.put(request, response.clone());
    await meta.put(request.url, new Response(String(Date.now())));
  }
  return response;
}
