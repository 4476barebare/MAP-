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
// -----------------------
// show phase1
// -----------------------
function showShop01(areaKey) {

    alert("[showShop01] called: " + areaKey);

    if (!window.map) {
        alert("[showShop01] NO MAP");
        return;
    }

    if (!markerControl.shop01Layer) {
        markerControl.shop01Layer = L.layerGroup().addTo(window.map);
        alert("[shop01Layer] CREATED");
    } else {
        alert("[shop01Layer] EXISTS");
    }

    alert("[cache exists] " + !!markerControl.shop01AreaCache);

    alert(
        "[cache keys] " +
        Object.keys(markerControl.shop01AreaCache || {}).join(",")
    );

    var shops = markerControl.shop01AreaCache?.[areaKey] || [];

    alert("[lookup key] " + areaKey);
    alert("[shops length] " + shops.length);

    if (!shops.length) {
        alert("[showShop01] EMPTY RESULT for key=" + areaKey);
        return;
    }

    alert("[first shop raw] " + JSON.stringify(shops[0]));

    markerControl.clearShop01();

    alert(
        "[after clear] layer count = " +
        (markerControl.shop01Layer
            ? markerControl.shop01Layer.getLayers().length
            : "no layer")
    );

    shops.forEach(function (shop, i) {

        if (i === 0) {
            alert("[first marker lat/lng] " + shop.lat + "," + shop.lng);
        }

        if (isNaN(shop.lat) || isNaN(shop.lng)) {
            alert("[SKIP NaN] " + JSON.stringify(shop));
            return;
        }

        var marker = L.circleMarker([shop.lat, shop.lng], {
            radius: 3,
            color: '#191970',
            weight: 1,
            fillColor: '#fff',
            fillOpacity: 1
        });

        marker.addTo(markerControl.shop01Layer);
    });

    alert("[showShop01] DONE");
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