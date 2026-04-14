// ===============================
// markerControl.js（function版）
// ===============================

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

            // ★ここ重要：areaId単体でグルーピング
            

            parsed.forEach(r => {

                const key = r.areaId; // ←これだけ

                if (!markerControl.shop01AreaCache[key]) {
                    markerControl.shop01AreaCache[key] = [];
                }

                markerControl.shop01AreaCache[key].push(r);
            });

        });
}

window.showDebug = function(msg) {

    var debugEl = document.getElementById('debug');

    if (!debugEl) {
        debugEl = document.createElement('div');
        debugEl.id = 'debug';

        debugEl.style.position = 'fixed';
        debugEl.style.top = '0';
        debugEl.style.left = '0';
        debugEl.style.background = 'rgba(255,255,0,0.9)';
        debugEl.style.zIndex = '999999';
        debugEl.style.padding = '6px';
        debugEl.style.fontSize = '12px';
        debugEl.style.maxWidth = '320px';
        debugEl.style.maxHeight = '40vh';
        debugEl.style.overflow = 'auto';
        debugEl.style.whiteSpace = 'pre-wrap';
        debugEl.style.pointerEvents = 'none';

        document.body.appendChild(debugEl);
    }

    if (typeof msg !== "string") {
        try {
            msg = JSON.stringify(msg);
        } catch (e) {
            msg = String(msg);
        }
    }

    debugEl.textContent += msg + "\n";
    debugEl.scrollTop = debugEl.scrollHeight;
};
// -----------------------
// show phase1
// -----------------------

function showShop01(areaKey) {
    

    window.showDebug("==== showShop01 START ====");
    window.showDebug("areaKey: " + areaKey);

// ★ここに追加（これだけ）
    window.map.invalidateSize();

    if (!window.map) {
        window.showDebug("NO MAP");
        return;
    }




    if (!window.map) {
        window.showDebug("NO MAP");
        return;
    }

    // ★ここが修正ポイント（レイヤ安定化）
    if (!markerControl.shop01Layer || !window.map.hasLayer(markerControl.shop01Layer)) {
        markerControl.shop01Layer = L.layerGroup().addTo(window.map);
        window.showDebug("LAYER CREATED");
    } else {
        window.showDebug("LAYER REUSED");
    }

    if (!markerControl.shop01AreaCache) {
        window.showDebug("CACHE NOT FOUND");
        return;
    }

    const keys = Object.keys(markerControl.shop01AreaCache || {});
    window.showDebug("CACHE KEYS: " + keys.join(","));

    const shops = markerControl.shop01AreaCache[areaKey] || [];

    window.showDebug("LOOKUP: " + areaKey);
    window.showDebug("COUNT: " + shops.length);

    if (shops.length === 0) {
        window.showDebug("EMPTY");
        return;
    }

    markerControl.shop01Layer.clearLayers();
    window.showDebug("LAYER CLEARED");

    for (let i = 0; i < shops.length; i++) {

        const s = shops[i];

        if (i === 0) {
            window.showDebug("FIRST: " + s.lat + "," + s.lng);
        }

        if (isNaN(s.lat) || isNaN(s.lng)) {
            window.showDebug("SKIP NaN");
            continue;
        }

        const marker = L.circleMarker([s.lat, s.lng], {
            radius: 3,
            color: '#191970',
            weight: 1,
            fillColor: '#fff',
            fillOpacity: 1
        });

        marker.addTo(markerControl.shop01Layer);
    }

    window.showDebug("==== showShop01 DONE ====");
    window.showDebug("pane count: " + Object.keys(window.map._panes || {}).length);
window.showDebug("layers: shop01=" + !!markerControl.shop01Layer +
                  " spot=" + !!window.spotMarkers +
                  " pref=" + !!window.prefSpotLayer);
}

// -----------------------
// show phase2
// -----------------------
function showShop02(areaKey) {

    if (!window.map) return;

    if (!markerControl.shop02Layer) {
        markerControl.shop02Layer = L.layerGroup().addTo(window.map);
    }

    markerControl.clearShop02();

    // ★ここが正しいキー分解
    var areaId = areaKey;

    var shops =
        markerControl.shop01AreaCache?.[areaId] || [];

    if (!shops.length) return;

    shops.forEach(function(shop) {

        if (isNaN(shop.lat) || isNaN(shop.lng)) return;

        var iconId = getIconId(shop.icon);

        var html =
            '<div style="' +
            'width:34px;height:34px;background:#fff;border:2px solid #191970;' +
            'border-radius:50%;display:flex;align-items:center;justify-content:center;' +
            'box-shadow:0 1px 3px rgba(0,0,0,0.25);">' +
            '<svg width="18" height="18">' +
            '<use href="/MAP-/icon/sprite.svg#icon-' + iconId + '"></use>' +
            '</svg></div>';

        var marker = L.marker([shop.lat, shop.lng], {
            icon: L.divIcon({
                className: '',
                html: html,
                iconSize: [34, 34],
                iconAnchor: [17, 17]
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