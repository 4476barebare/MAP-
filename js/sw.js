// sw.js (Service Worker 本体)
const CACHE_NAME = 'tile-cache-v1';

self.addEventListener('fetch', event => {
  // 国土地理院のタイル（cyberjapandata）へのリクエストだけをターゲットにする
  if (event.request.url.includes('cyberjapandata.gsi.go.jp')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        // 1. まずキャッシュ（金庫）の中に画像があるか探す
        const response = await cache.match(event.request);
        
        // 2. キャッシュがあればそれを即座に返す（ゼロ秒表示）
        //    無ければ通常通りネットから取得し、次回のためにキャッシュに保存する
        return response || fetch(event.request).then(netRes => {
          cache.put(event.request, netRes.clone());
          return netRes;
        });
      })
    );
  }
});
