window.markerControl = {
    shop01Cache: {},
    shop01AreaCache: {},
};

function preloadShop01(url) {
    if (markerControl.shop01Cache[url]) return;

    fetch(url)
        .then(res => res.text())
        .then(text => {
            const lines = text.trim().split('\n');

            const parsed = lines.slice(1).map(line => {
                const cols = line.split(',');

                return {
                    group: cols[0] || '',
                    name: cols[1] || '',
                    lat: parseFloat(cols[2]),
                    lng: parseFloat(cols[3]),
                    notes: cols[4] || '',
                    icon: cols[5] || '',
                    areaId: (cols[6] || '').trim()
                };
            });

            parsed.forEach(r => {
                const key = r.areaId;

                if (!markerControl.shop01AreaCache[key]) {
                    markerControl.shop01AreaCache[key] = [];
                }

                markerControl.shop01AreaCache[key].push(r);
            });

            markerControl.shop01Cache[url] = true;
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

            const iconId = getIconId(shop.icon);
            const noCircle = iconId === 'shop4';

            const html = noCircle
                ? `<div class="shop-marker no-circle">
                        <svg class="shop-icon">
                            <use href="/icon/sprite.svg#icon-${iconId}"></use>
                        </svg>
                   </div>`
                : `<div class="shop-marker">
                        <svg class="shop-icon">
                            <use href="/icon/sprite.svg#icon-${iconId}"></use>
                        </svg>
                   </div>`;

            const marker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: '',
                    html: html,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            });

            const title = shop.group && shop.group !== '個人商店'
                ? shop.group + ' ' + (shop.name || '')
                : (shop.name || '');

            const address = shop.notes || '';

            const googleUrl =
                'https://www.google.com/search?q=' +
                encodeURIComponent(title + ' ' + address);

            const popupHtml = `
                <div class="shop-popup">
                    <div class="shop-popup-title">${title}</div>
                    <div class="shop-popup-address">${address}</div>
                    <div class="shop-popup-footer">
                        <a class="shop-popup-btn" href="${googleUrl}" target="_blank">
                            Googleで検索
                        </a>
                    </div>
                </div>
            `;

            marker.bindPopup(popupHtml);

            // ★ここ変更（重要）
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
