// GSI tile cache: Cache Storage / 14-day retention
const CACHE_NAME = 'tile-cache-v1';
const CACHE_META_NAME = 'tile-cache-meta-v1';
const MAP_DATA_CACHE_NAME = 'map-data-cache-v1';
const TILE_HOST = 'cyberjapandata.gsi.go.jp';
const MAX_AGE = 14 * 24 * 60 * 60 * 1000;

self.addEventListener('install', event => {
  // 新しいService Workerを待機させず、更新を適用する
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('map-data-cache-') && key !== MAP_DATA_CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (isLongLivedMapData(request)) {
    event.respondWith(handleMapDataRequest(request));
    return;
  }
  if (!request.url.includes(TILE_HOST)) return;

  // 地図タイル以外のGSIリソースは対象外
  if (!/\/xyz\/[^/]+\/\d+\/\d+\/\d+\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(request.url)) return;

  event.respondWith(handleTileRequest(request));
});

function isLongLivedMapData(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return /^\/(?:KANTO\/enc_(?:motorway|trunk|depth(?:20|50|100|150|200))\.json|data\/KANTO_geo\.json)$/.test(url.pathname);
}

async function handleMapDataRequest(request) {
  const cache = await caches.open(MAP_DATA_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    try { await cache.put(request, response.clone()); }
    catch (error) { /* 保存失敗時もネットワーク応答を返す */ }
  }
  return response;
}

async function handleTileRequest(request) {
  let cache;
  let meta;
  try {
    cache = await caches.open(CACHE_NAME);
    meta = await caches.open(CACHE_META_NAME);
  } catch (error) {
    return fetch(request);
  }
  const cached = await cache.match(request);

  if (cached) {
    const savedAt = await meta.match(request.url);
    const savedAtText = savedAt ? await savedAt.text() : '';
    const timestamp = Number(savedAtText);

    // メタ情報がない既存キャッシュは、今回から14日間の起点として扱う
    if (!savedAt || !Number.isFinite(timestamp)) {
      try {
        await meta.put(request.url, new Response(String(Date.now())));
      } catch (error) {
        // メタ情報を保存できなくても既存タイルを表示する
      }
      return cached;
    }

    if (Date.now() - timestamp < MAX_AGE) return cached;

    // 期限切れは一度ネットワーク更新を試みる
    try {
      const fresh = await fetch(request);
      if (fresh && (fresh.ok || fresh.type === 'opaque')) {
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
  if (response && (response.ok || response.type === 'opaque')) {
    // 保存に失敗しても地図表示自体は止めない
    try {
      await cache.put(request, response.clone());
      await meta.put(request.url, new Response(String(Date.now())));
    } catch (error) {
      // ストレージ容量不足などの場合はネットワーク応答をそのまま返す
    }
  }
  return response;
}
