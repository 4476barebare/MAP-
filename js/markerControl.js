window.markerControl = {
    shop01Cache: {},
    shop01AreaCache: {},
    allShops: [] // ★ 距離計算用に全店舗をここにプールする
};

function preloadShop01(url) {
    if (markerControl.shop01Cache[url]) return Promise.resolve();

    return fetch(url)
        .then(res => {
            if (!res.ok) throw new Error("fetch失敗: " + res.status);
            return res.json();
        })
        .then(jsonData => {
            const parsed = jsonData.map(shop => {
                return {
                    group: shop.group || '',
                    name: shop.name || '',
                    lat: shop.lat !== undefined ? parseFloat(shop.lat) : NaN,
                    lng: shop.lng !== undefined ? parseFloat(shop.lng) : NaN,
                    notes: shop.notes || '',
                    icon: shop.icon || '',
                    areaId: (shop.areaId || '').toString().trim()
                };
            });

            // パースした店舗データを全店舗リストに合流
            markerControl.allShops = markerControl.allShops.concat(parsed);

            parsed.forEach(r => {
                const key = r.areaId;

                if (!markerControl.shop01AreaCache[key]) {
                    markerControl.shop01AreaCache[key] = [];
                }

                markerControl.shop01AreaCache[key].push(r);
            });

            markerControl.shop01Cache[url] = true;

            // ★ 追加: ロード完了時に現在アクティブなエリアがあれば自動でマーカーを描画
            if (window.currentAreaId && window.map) {
                const isSpotMode = window.map.getContainer().classList.contains('is-spot-mode');
                const zoom = window.map.getZoom();

                if (isSpotMode || (window.currentSpotId && zoom === 13)) {
                    showShop02(window.currentAreaId);
                } else if (zoom >= 11) {
                    showShop01(window.currentAreaId);
                }
            }
        })
        .catch(err => {
            console.error("Shopデータの読み込みエラー:", err);
        });
}

// -----------------------
// phase1
// -----------------------
function showShop01(areaKey) {
    if (!window.map) return;

    const shops = markerControl.shop01AreaCache[areaKey] || [];
    if (!shops.length) return;

    // -------------------------
    // phase1Groupに統合（ここが本体）
    // -------------------------
    if (!window.phase1Group) {
        window.phase1Group = L.layerGroup().addTo(window.map);
    }

    // 既存shop01だけ消す（グループ内管理）
    window.phase1Group.eachLayer(layer => {
        if (layer.options && layer.options._shop01) {
            window.phase1Group.removeLayer(layer);
        }
    });

    // -------------------------
    // 描画
    // -------------------------
    for (let i = 0; i < shops.length; i++) {
        const s = shops[i];

        if (isNaN(s.lat) || isNaN(s.lng)) continue;

        const marker = L.circleMarker([s.lat, s.lng], {
            radius: 3,
            color: '#191970',
            weight: 1,
            fillColor: '#fff',
            fillOpacity: 1
        });

        // ★識別フラグ
        marker.options._shop01 = true;

        window.phase1Group.addLayer(marker);
    }
}

// -----------------------
// phase2
// -----------------------
function showShop02(areaKey) {
    if (!window.map) return;

    // ★ phase2Groupを使う
    if (!window.phase2Group) {
        window.phase2Group = L.layerGroup();
    }

    window.phase2Group.clearLayers();

    const shops = markerControl.shop01AreaCache?.[areaKey] || [];
    if (!shops.length) return;

    // 表示
    window.phase2Group.addTo(window.map);

    // =========================
    // ① 近い座標をグループ化
    // =========================
    const groups = {};

    shops.forEach(shop => {
        if (isNaN(shop.lat) || isNaN(shop.lng)) return;

        const key = `${Math.round(shop.lat * 500)}_${Math.round(shop.lng * 500)}`;

        if (!groups[key]) groups[key] = [];
        groups[key].push(shop);
    });

    // =========================
    // ② 描画
    // =========================
    Object.values(groups).forEach(group => {

        const count = group.length;

        group.forEach((shop, i) => {

            let lat = shop.lat;
            let lng = shop.lng;

            if (count > 1) {
                const angle = (i / count) * Math.PI * 2;
                const offset = 0.001;

                lat += Math.cos(angle) * offset;
                lng += Math.sin(angle) * offset;
            }

            // ★ テキストの判定: group名があればgroup名（個人商店や空欄を除く）、なければ店舗名
            const displayName = shop.group && shop.group !== '個人商店' && shop.group !== 'shop'
                ? shop.group 
                : (shop.name || '');

            const html = `
                <div class="shop-anchor"></div>
                <div class="shop-text">${displayName}</div>
            `;
            
            const marker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'custom-shop-marker',
                    html: html,
                    iconSize: [0, 0],    // 基準点を完全にゼロにする
                    iconAnchor: [0, 0]   // 座標のど真ん中に強制
                })
            });


            // =====================================
            // ★ ポップアップの遅延生成（3大ボタン実装）
            // =====================================
            marker.bindPopup(() => {
                const title = shop.group && shop.group !== '個人商店'
                    ? shop.group + ' ' + (shop.name || '')
                    : (shop.name || '');

                const address = shop.notes || '';

                // 1. Googleマップ ルート案内URL (緯度・経度へダイレクト)
                // 1. Googleマップ ルート案内URL (店舗名と住所を使って確実にセット)
const routeKeyword = `${title} ${address}`.trim();
const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(routeKeyword)}`;


                // 2. Google検索URL (グループ名・店名・住所のみでスッキリ検索)
                const searchKeyword = `${title} ${address}`.trim();
                const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchKeyword)}`;

                // 3. ChatGPT質問URL (?q= パラメータでプロンプトをセット)
                const chatGptPrompt = `${title}（${address}）の営業時間や定休日、取り扱い商品などの詳細情報を教えて`;
                const chatGptUrl = `https://chatgpt.com/?q=${encodeURIComponent(chatGptPrompt)}`;

                return `
                    <div class="shop-popup">
                        <div class="shop-popup-title">${title}</div>
                        <div class="shop-popup-address">${address}</div>
                        <div class="shop-popup-footer">
                            <a class="shop-popup-btn" href="${routeUrl}" target="_blank" rel="noopener noreferrer">
                                ルート案内
                            </a>
                            <a class="shop-popup-btn" href="${googleSearchUrl}" target="_blank" rel="noopener noreferrer">
                                Google検索
                            </a>
                            <a class="shop-popup-btn btn-chatgpt" href="${chatGptUrl}" target="_blank" rel="noopener noreferrer">
                                ChatGPT
                            </a>
                        </div>
                    </div>
                `;
            });


            // ★ここ変更なし（維持）
            window.phase2Group.addLayer(marker);
        });
    });
}

// -----------------------
// icon
// -----------------------
function getIconId(raw) {
    if (!raw) return 'default';

    return raw
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
}

markerControl.preloadShop01 = preloadShop01;
markerControl.showShop01 = showShop01;
markerControl.showShop02 = showShop02;
markerControl.getIconId = getIconId;
