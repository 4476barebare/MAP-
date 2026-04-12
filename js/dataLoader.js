// グローバル
window.prefData = null;
window.areaData = [];
window.spotData = [];
window.currentHash = '';

/* =========================
   CSVロード（areaId統一生成）
========================= */
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
                    parent: cols[5] ? cols[5].trim() : '',
                    url: cols[6] ? cols[6].trim() : '',
                    notes: cols[7] ? cols[7].trim() : '',
                    icon: cols[8] ? cols[8].trim().toLowerCase() : null
                };
            });

            // ★メイン
            allRows.forEach(row => {
                if (!row.parent && row.name.toUpperCase() === filePref) {
                    main = row;
                }
            });

            // ★エリア（ここで areaId 確定）
            const areaMap = {};

            allRows.forEach(row => {
                if (row.parent.toUpperCase() === filePref) {
                    row.areaId = filePref + '_' + (row.notes || row.name);
                    areas.push(row);

                    areaMap[row.name] = row.areaId;
                }
            });

            // ★スポット（完全に areaId ベース）
            allRows.forEach(row => {
                const icon = row.icon;

                if (!icon) return;

                if (icon === 'spot' || icon.startsWith('fish')) {

                    row.areaId = areaMap[row.parent];

                    if (!row.areaId) {
                        alert('未一致（CSV確認）: ' + row.parent);
                        return;
                    }

                    spots.push(row);
                }
            });

            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;

            return { main, areas, spots };
        });
}

/* =========================
   地図描画
========================= */
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
    const tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg';

    if (window.map) {
        window.map.flyTo([lat, lng], zoom, { duration: 0.5 });

        if (window.currentTileLayer) {
            window.map.removeLayer(window.currentTileLayer);
        }

        window.currentTileLayer = L.tileLayer(tileUrl, {
            attribution: '© 国土地理院'
        }).addTo(window.map);

    } else {
        window.map = L.map('lf-map', mapOptions);
        window.map.attributionControl.setPosition('topright');

        window.currentTileLayer = L.tileLayer(tileUrl, {
            attribution: '© 国土地理院'
        }).addTo(window.map);
    }

    window.currentHash = location.hash;

    /* ★重要：初回のみ県スポット */
    if (!window.currentAreaId) {
        showPrefSpots();
    }
}

/* =========================
   エリア選択（areaId基準）
========================= */
function selectArea(areaName) {

    const area = window.areaData.find(a => a.name === areaName);
    if (!area) return;

    window.currentAreaId = area.areaId;

    hidePrefSpots();

    drawLocation(
        area.name,
        area.lat,
        area.lng,
        area.zoom || window.prefData.zoom
    );

    location.hash = encodeURIComponent(area.areaId);

    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('map-back-btn').style.display = 'block';

    showSpotsForArea(area.areaId);
}

/* =========================
   スポット表示（areaId一致のみ）
========================= */
function showSpotsForArea(areaId) {

    if (window.spotMarkers) {
        window.spotMarkers.forEach(m => window.map.removeLayer(m));
    }

    window.spotMarkers = [];

    const spots = window.spotData.filter(s => s.areaId === areaId);

    alert('areaId: ' + areaId + '\nspots: ' + spots.length);

    if (!spots.length) return;

    let minLat = 999, maxLat = -999, minLng = 999, maxLng = -999;

    spots.forEach(spot => {

        const iconId = spot.icon || 'spot';
        const isFish = iconId.startsWith('fish');

        const html = `
        <div class="spot-label ${iconId}">
            <svg width="16" height="16">
                <use href="/MAP-/icon/sprite.svg#icon-${iconId}"></use>
            </svg>
            <span>${spot.name}</span>
        </div>`;

        const marker = L.marker([spot.lat, spot.lng], {
            icon: L.divIcon({
                className: '',
                html: html,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            }),
            zIndexOffset: isFish
                ? 600 + Math.floor(Math.random() * 50)
                : Math.floor(Math.random() * 500)
        });

        marker.on('click', () => {
            selectSpot(areaId, spot.name, spot.lat, spot.lng);
        });

        marker.addTo(window.map);
        window.spotMarkers.push(marker);

        if (spot.lat < minLat) minLat = spot.lat;
        if (spot.lat > maxLat) maxLat = spot.lat;
        if (spot.lng < minLng) minLng = spot.lng;
        if (spot.lng > maxLng) maxLng = spot.lng;
    });

    window.areaBounds = L.latLngBounds(
        [minLat, minLng],
        [maxLat, maxLng]
    );
}

/* =========================
   スポット選択
========================= */
function selectSpot(areaId, spotName, lat, lng) {

    drawLocation(spotName, lat, lng, 13);

    window.map.once('moveend', () => {
        enableDragForArea(areaId);
    });
}

/* =========================
   エリア制限
========================= */
function enableDragForArea(areaId) {

    if (!window.areaBounds) return;

    window.map.dragging.enable();

    window.map.off('move');

    window.map.on('move', () => {
        window.map.panInsideBounds(window.areaBounds, { animate: false });
    });
}

/* =========================
   戻る
========================= */
function goBack() {

    window.currentAreaId = null;

    drawLocation(
        window.prefData.name,
        window.prefData.lat,
        window.prefData.lng,
        window.prefData.zoom
    );

    if (window.spotMarkers) {
        window.spotMarkers.forEach(m => window.map.removeLayer(m));
        window.spotMarkers = [];
    }

    location.hash = '';

    document.getElementById('map-menu').style.display = 'block';
    document.getElementById('map-back-btn').style.display = 'none';

    showPrefSpots();
}

/* =========================
   県スポット
========================= */
function showPrefSpots() {

    if (window.prefSpotLayer) {
        window.prefSpotLayer.addTo(window.map);
        return;
    }

    const layer = L.layerGroup();

    window.spotData.forEach(spot => {

        if (!spot.icon) return;

        let type = 'spot';

        if (spot.icon.startsWith('fish')) {
            const match = spot.icon.match(/fish[1-4]/);
            if (match) type = match[0];
        }

        const marker = L.marker([spot.lat, spot.lng], {
            icon: L.divIcon({
                className: '',
                html: `<div class="pref-dot ${type}"></div>`,
                iconSize: [5, 5],
                iconAnchor: [2.5, 2.5]
            }),
            interactive: false
        });

        layer.addLayer(marker);
    });

    window.prefSpotLayer = layer;
    layer.addTo(window.map);
}

/* =========================
   非表示
========================= */
function hidePrefSpots() {
    if (window.prefSpotLayer && window.map.hasLayer(window.prefSpotLayer)) {
        window.map.removeLayer(window.prefSpotLayer);
    }
}