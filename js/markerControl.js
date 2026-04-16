window.markerControl = {
    shop01Cache: {},
    shop01AreaCache: {},
    shop01Layer: null,
    shop02Layer: null
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

    window.map.invalidateSize(true);

    if (!markerControl.shop01Layer || !window.map.hasLayer(markerControl.shop01Layer)) {
        markerControl.shop01Layer = L.layerGroup().addTo(window.map);
    }

    const shops = markerControl.shop01AreaCache[areaKey] || [];
    if (!shops.length) return;

    markerControl.shop01Layer.clearLayers();

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

        marker.addTo(markerControl.shop01Layer);
    }
}

// -----------------------
// phase2
// -----------------------
function showShop02(areaKey) {
    if (!window.map) return;

    if (!markerControl.shop02Layer) {
        markerControl.shop02Layer = L.layerGroup().addTo(window.map);
    }

    markerControl.clearShop02();

    const shops = markerControl.shop01AreaCache?.[areaKey] || [];
    if (!shops.length) return;

    shops.forEach(shop => {

        if (isNaN(shop.lat) || isNaN(shop.lng)) return;

        const iconId = getIconId(shop.icon);

        // ▼ アイコンのみ（○囲み）
        const html = `
<div class="shop-marker">
    <svg class="shop-icon">
        <use href="/MAP-/icon/sprite.svg#icon-${iconId}"></use>
    </svg>
</div>
`;

        const marker = L.marker([shop.lat, shop.lng], {
            icon: L.divIcon({
                className: '',
                html: html,
                iconSize: [24, 24],
                iconAnchor: [12, 12] // ★完全に中心
            })
        });

        // -----------------------
        // ポップアップ内容
        // -----------------------
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

        marker.addTo(markerControl.shop02Layer);
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

// -----------------------
// clear
// -----------------------
function clearShop01() {
    if (markerControl.shop01Layer) {
        markerControl.shop01Layer.clearLayers();
    }
}

function clearShop02() {
    if (markerControl.shop02Layer) {
        markerControl.shop02Layer.clearLayers();
    }
}

// -----------------------
// bind
// -----------------------
markerControl.preloadShop01 = preloadShop01;
markerControl.showShop01 = showShop01;
markerControl.showShop02 = showShop02;
markerControl.getIconId = getIconId;
markerControl.clearShop01 = clearShop01;
markerControl.clearShop02 = clearShop02;