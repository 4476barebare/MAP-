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
        const label = (shop.group ? shop.group + ' ' : '') + (shop.name || '');

const html =
    '<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);">' +

        // ▼ 座標ピン（アイコンの代わり）
        '<div style="font-size:18px;line-height:1;color:#191970;">▼</div>' +

        // ラベル（上に小さく）
        '<div style="' +
        'margin-top:2px;font-size:10px;line-height:1;' +
        'color:#191970;background:rgba(255,255,255,0.85);' +
        'border:1px solid #191970;border-radius:3px;' +
        'padding:1px 3px;white-space:nowrap;' +
        '">' +
        label +
        '</div>' +

    '</div>';
    
        const marker = L.marker([shop.lat, shop.lng], {
            icon: L.divIcon({
                className: '',
                html: html,
                iconSize: [34, 50],
                iconAnchor: [17, 17] // ★座標はアイコン中心固定
            })
        });

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