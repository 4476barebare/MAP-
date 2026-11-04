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

  event.respondWith(handleTileRequest(request, event));
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

function reportTileCacheDebug(event, request, result) {
  if (!event || !event.clientId) return;

  // fetchイベントの非同期処理後にwaitUntil()を呼ぶと、
  // Safari / FirefoxでInvalidStateErrorになる場合がある。
  // デバッグ通知は応答処理の寿命管理に含めず、失敗してもタイル取得に影響させない。
  self.clients.get(event.clientId).then(client => {
    if (client) {
      client.postMessage({
        type: 'TILE_CACHE_DEBUG',
        url: request.url,
        result: result
      });
    }
  }).catch(() => {});
}

async function handleTileRequest(request, event) {
  let cache;
  let meta;
  try {
    cache = await caches.open(CACHE_NAME);
    meta = await caches.open(CACHE_META_NAME);
  } catch (error) {
    reportTileCacheDebug(event, request, 'cache-open-error→fetch');
    try {
      return await fetch(request);
    } catch (fetchError) {
      reportTileCacheDebug(event, request, 'fetch-error');
      throw fetchError;
    }
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
      reportTileCacheDebug(event, request, 'cache-hit-no-meta');
      return cached;
    }

    if (Date.now() - timestamp < MAX_AGE) {
      reportTileCacheDebug(event, request, 'cache-hit');
      return cached;
    }

    // 期限切れは一度ネットワーク更新を試みる
    try {
      const fresh = await fetch(request);
      if (fresh && (fresh.ok || fresh.type === 'opaque')) {
        try {
          await cache.put(request, fresh.clone());
          await meta.put(request.url, new Response(String(Date.now())));
        } catch (error) {
          // 更新保存に失敗しても取得したタイルを返す
        }
        reportTileCacheDebug(event, request, 'expired-cache→fetch-update');
        return fresh;
      }
      reportTileCacheDebug(event, request, 'expired-cache→fetch-failed-status-' + fresh.status);
      return cached;
    } catch (error) {
      // オフライン時は期限切れでも手元のタイルを表示
      reportTileCacheDebug(event, request, 'expired-cache→fetch-error');
      return cached;
    }
  }

  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      try {
        await cache.put(request, response.clone());
        await meta.put(request.url, new Response(String(Date.now())));
        reportTileCacheDebug(event, request, 'cache-miss→fetch-and-save');
      } catch (error) {
        reportTileCacheDebug(event, request, 'cache-miss→fetch-save-error');
      }
    } else {
      reportTileCacheDebug(event, request, 'cache-miss→fetch-status-' + (response ? response.status : 'no-response'));
    }
    return response;
  } catch (error) {
    reportTileCacheDebug(event, request, 'cache-miss→fetch-error');
    throw error;
  }
}
