// グローバル
window.prefData = null;
window.areaData = [];
window.spotData = [];
window.currentHash = '';
window.currentAreaId = null;

function loadLocationCSV(csvUrl, currentFile) {
    return fetch(csvUrl)
        .then(r => r.text())
        .then(text => {

            const lines = text.trim().split('\n');
            const filePref = currentFile.replace('.html', '').toUpperCase();

            let main = null;
            const areas = [];
            const spots = [];

            const allRows = lines.slice(1).map(line => {
                const cols = line.split(',');
                return {
                    name: cols[0].trim(),
                    zoom: parseFloat(cols[1]),
                    maxZoom: cols[2] ? parseFloat(cols[2]) : null,
                    lat: parseFloat(cols[3]),
                    lng: parseFloat(cols[4]),
                    areaId: cols[5] ? cols[5].trim() : '',
                    url: cols[6] ? cols[6].trim() : '',
                    notes: cols[7] ? cols[7].trim() : '',
                    icon: cols[8] ? cols[8].trim().toLowerCase() : null
                };
            });

            // メイン
            allRows.forEach(row => {
                if (!row.areaId && row.name.toUpperCase() === filePref) {
                    main = row;
                }
            });

            // エリア
            allRows.forEach(row => {
                if (row.areaId === filePref) {
                    areas.push(row);
                }
            });

            // スポット
            allRows.forEach(row => {
                const icon = row.icon;
                if (!icon) return;

                if (icon === 'spot' || icon.startsWith('fish')) {
                    spots.push(row);
                }
            });

            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;
        
            
            








            return { main, areas, spots };
        });
        
        
        
        
}

function drawLocation(name, lat, lng, zoom, maxZoom = null, options = {}) {

    const defaultOptions = {
        center: [lat, lng],
        zoom: zoom,
        zoomControl: false,
        scrollWheelZoom: false,
        dragging: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false
    };

    const mapOptions = { ...defaultOptions, ...options };

    const tileUrl =
        'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg';

    if (window.map) {

        // 元の通り
        window.map.flyTo([lat, lng], zoom, { duration: 0.5 });

        if (window.currentTileLayer) {
            window.map.removeLayer(window.currentTileLayer);
        }

        window.currentTileLayer =
            L.tileLayer(tileUrl, { attribution: '© 国土地理院' })
                .addTo(window.map);

        mapOptions.scrollWheelZoom
            ? window.map.scrollWheelZoom.enable()
            : window.map.scrollWheelZoom.disable();

        mapOptions.dragging
            ? window.map.dragging.enable()
            : window.map.dragging.disable();

        mapOptions.doubleClickZoom
            ? window.map.doubleClickZoom.enable()
            : window.map.doubleClickZoom.disable();

        mapOptions.boxZoom
            ? window.map.boxZoom.enable()
            : window.map.boxZoom.disable();

        mapOptions.keyboard
            ? window.map.keyboard.enable()
            : window.map.keyboard.disable();

        mapOptions.touchZoom
            ? window.map.touchZoom.enable()
            : window.map.touchZoom.disable();

        if (window.map.tap) {
            mapOptions.tap
                ? window.map.tap.enable()
                : window.map.tap.disable();
        }

    } else {

        window.map = L.map('lf-map', mapOptions);
        window.map.attributionControl.setPosition('topright');

        window.currentTileLayer =
            L.tileLayer(tileUrl, { attribution: '© 国土地理院' })
                .addTo(window.map);
    }

    window.currentHash = location.hash;

    if (!window.currentAreaId) {
        showPrefSpots();
    }
}


function selectArea(areaName) {

    // -----------------------
    // shop01レイヤ完全リセット
    // -----------------------
    if (window.markerControl && markerControl.shop01Layer) {
        window.map.removeLayer(markerControl.shop01Layer);
        markerControl.shop01Layer = null;
    }

    const area = window.areaData.find(a => a.name === areaName);
    if (!area) return;

    hidePrefSpots();

    // -----------------------
    // キー生成（固定）
    // -----------------------
    const area_Id = (area.areaId || '').trim();
    const notes   = (area.notes || '').trim();
    const areaKey = area_Id + "_" + notes;

    // -----------------------
    // 競合防止ID
    // -----------------------
    const reqId = Date.now();
    window._shop01RequestId = reqId;

    // -----------------------
    // 地図移動
    // -----------------------
    drawLocation(
        area.name,
        area.lat,
        area.lng,
        area.zoom || window.prefData.zoom
    );

    location.hash = encodeURIComponent(area.name);

    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('map-back-btn').style.display = 'block';

    // -----------------------
    // 描画（順序固定）
    // -----------------------
    window.map.once('moveend', () => {

        enableDragForArea();
        showSpotsForArea(areaKey);

        if (window._shop01RequestId !== reqId) return;

        // ★重要：2フレーム待ってから描画確定
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {

                markerControl.showShop01(areaKey);

            });
        });

    });
}




function selectSpot(areaName, selectName, spotLat, spotLng) {
window.map.off('move');
    window.map.setMaxBounds(null);

    drawLocation(selectName, spotLat, spotLng, 13);

    // ★ areaレイヤー完全破棄
    if (window.markerControl) {
        markerControl.clearShop01();
        markerControl.clearShop02();
    }

    // ★ spotモードではあるが、phase2を流用するなら再描画
    const areaKey = areaName; // or 必要なら再構成

    if (window.markerControl) {
        markerControl.showShop02(areaKey);
    }

    const tileUrl =
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    if (window.currentTileLayer) {
        window.map.removeLayer(window.currentTileLayer);
    }

    window.currentTileLayer =
        L.tileLayer(tileUrl, {
            attribution: '© OpenStreetMap contributors',
            keepBuffer: 8,
            updateWhenIdle: true
        }).addTo(window.map);


window.map.once('moveend', () => {
    enableDragForArea();
});

}

function enableDragForArea() {
    if (!window.areaBounds) return;

    window.map.dragging.enable();
    window.map.setMaxBounds(window.areaBounds);
    window.map.options.maxBoundsViscosity = 1.0;
}

function goBack(hash) {

    // ★状態リセット
    window.map.off('move');
    window.map.off('moveend');
    window.areaBounds = null;
    window.currentAreaId = null;

    if (window.markerControl) {
        markerControl.clearShop01();
        markerControl.clearShop02();
    }

    if (window.spotMarkers) {
        window.spotMarkers.forEach(m => window.map.removeLayer(m));
        window.spotMarkers = [];
    }

    if (window.prefSpotLayer && window.map.hasLayer(window.prefSpotLayer)) {
        window.map.removeLayer(window.prefSpotLayer);
    }

    hash = hash || window.currentHash || '';

    const parts =
        decodeURIComponent(hash.replace(/^#/, '')).split('/');

    const areaName = parts[0];
    const spotName = parts[1];

    if (spotName) {
        return;

    } else if (areaName) {

        drawLocation(
            window.prefData.name,
            window.prefData.lat,
            window.prefData.lng,
            window.prefData.zoom,
            window.prefData.maxZoom
        );


        location.hash = '';
        window.currentHash = '';

        requestAnimationFrame(() => {
            showPrefSpots();
        });
        window.map.invalidateSize(true);
    }

    document.getElementById('map-menu').style.display = 'block';
    document.getElementById('map-back-btn').style.display = 'none';
    
}


window.selectArea = selectArea;
window.selectSpot = selectSpot;
window.goBack = goBack;
window.drawLocation = drawLocation;
window.loadLocationCSV = loadLocationCSV;

function showSpotsForArea(areaKey) {

    if (window.spotMarkers) {
        window.spotMarkers.forEach(m =>
            window.map.removeLayer(m)
        );
    }
    window.spotMarkers = [];

    const spots = window.spotData.filter(s =>
        s.areaId === areaKey
    );

    if (!spots.length) return;

    let minLat = 999, maxLat = -999;
    let minLng = 999, maxLng = -999;

    spots.forEach(spot => {

        const iconId = spot.icon || 'spot';
        const isFish = iconId.startsWith('fish');

        const marker = L.marker(
            [spot.lat, spot.lng],
            {
                icon: L.divIcon({
                    className: '',
                    html: `
                        <div class="spot-label ${iconId}">
                            <svg width="16" height="16">
                                <use href="/MAP-/icon/sprite.svg#icon-${iconId}"></use>
                            </svg>
                            <span>${spot.name}</span>
                        </div>
                    `,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                }),
                zIndexOffset: isFish
                    ? 600 + Math.floor(Math.random() * 50)
                    : Math.floor(Math.random() * 500)
            }
        );

        marker.on('click', function () {

            selectSpot(
                areaKey,
                spot.name,
                spot.lat,
                spot.lng
            );
        });

        window.spotMarkers.push(marker);
        marker.addTo(window.map);

        if (spot.lat < minLat) minLat = spot.lat;
        if (spot.lat > maxLat) maxLat = spot.lat;
        if (spot.lng < minLng) minLng = spot.lng;
        if (spot.lng > maxLng) maxLng = spot.lng;
    });

    if (spots.length === 0) return;

    const latSize = maxLat - minLat;
    const lngSize = maxLng - minLng;

    const latBuffer = Math.max(latSize * 0.2, 0.05);
    const lngBuffer = Math.max(lngSize * 0.2, 0.05);

    window.areaBounds = L.latLngBounds(
        [minLat - latBuffer, minLng - lngBuffer],
        [maxLat + latBuffer, maxLng + lngBuffer]
    );
}

function createPrefSpotLayer() {

    if (window.prefSpotLayer) return;

    const layer = L.layerGroup();

    window.spotData.forEach(spot => {

        if (!spot.icon) return;

        let type = 'spot';

        if (spot.icon.startsWith('fish')) {
            const match = spot.icon.match(/fish[1-4]/);
            if (match) type = match[0];
        }

        const html =
            `<div class="pref-dot ${type}"></div>`;

        const marker = L.marker(
            [spot.lat, spot.lng],
            {
                icon: L.divIcon({
                    className: '',
                    html: html,
                    iconSize: [5, 5],
                    iconAnchor: [2.5, 2.5]
                }),
                interactive: false
            }
        );

        layer.addLayer(marker);
    });

    window.prefSpotLayer = layer;
}

function showPrefSpots() {
    createPrefSpotLayer();

    if (!window.map.hasLayer(window.prefSpotLayer)) {
        window.prefSpotLayer.addTo(window.map);
    }
}

function hidePrefSpots() {
    if (
        window.prefSpotLayer &&
        window.map.hasLayer(window.prefSpotLayer)
    ) {
        window.map.removeLayer(window.prefSpotLayer);
    }
}