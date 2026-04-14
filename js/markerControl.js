// ===============================
// markerControl.js（function版）
// ===============================

window.markerControl = {
    shop01Cache: {},
    shop01AreaCache: {},
    shop01Layer: null,
    shop02Layer: null
};


// -----------------------
// preload
// -----------------------
function preloadShop01(url) {

    const pref = url.split('/').pop().split('_')[0].toUpperCase();

    if (window.markerControl.shop01Cache[pref]) return;

    fetch(url)
        .then(function(res) {
            return res.text();
        })
        .then(function(text) {

            var lines = text.trim().split('\n');

            var parsed = lines.slice(1).map(function(line) {
                var cols = line.split(',');

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

            window.markerControl.shop01Cache[pref] = parsed;
            window.markerControl.shop01AreaCache[pref] = {};

            parsed.forEach(function(r) {
                if (!window.markerControl.shop01AreaCache[pref][r.areaId]) {
                    window.markerControl.shop01AreaCache[pref][r.areaId] = [];
                }
                window.markerControl.shop01AreaCache[pref][r.areaId].push(r);
            });

            if (window.showDebug) {
                showDebug('preload done: ' + pref);
            }
        })
        .catch(function(err) {
            console.error('preload error:', err);
        });
}

// -----------------------
// show phase1
// -----------------------
function showShop01(areaId) {

    if (!window.map) return;

    if (!markerControl.shop01Layer) {
        markerControl.shop01Layer = L.layerGroup().addTo(window.map);
    }

    markerControl.clearShop01();

    var pref = areaId.split('_')[0];

    var shops =
        (markerControl.shop01AreaCache[pref] &&
         markerControl.shop01AreaCache[pref][areaId]) || [];

    if (!shops.length) return;

    shops.forEach(function(shop) {

        if (isNaN(shop.lat) || isNaN(shop.lng)) return;

        var marker = L.circleMarker([shop.lat, shop.lng], {
            radius: 3,
            color: '#191970',
            weight: 1,
            fillColor: '#fff',
            fillOpacity: 1
        });

        marker.addTo(markerControl.shop01Layer);
    });
}


// -----------------------
// show phase2
// -----------------------
function showShop02(areaId) {

    if (!window.map) return;

    if (!markerControl.shop02Layer) {
        markerControl.shop02Layer = L.layerGroup().addTo(window.map);
    }

    markerControl.clearShop02();

    var pref = areaId.split('_')[0];

    var shops =
        (markerControl.shop01AreaCache[pref] &&
         markerControl.shop01AreaCache[pref][areaId]) || [];

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