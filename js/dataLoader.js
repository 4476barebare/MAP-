// グローバル
window.prefData = null;
window.areaData = [];
window.spotData = [];
window.currentHash = '';

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

            // メイン
            allRows.forEach(row => {
                if (!row.parent && row.name.toUpperCase() === filePref) {
                    main = row;
                }
            });

            // エリア（★areaId生成）
            allRows.forEach(row => {
                if (row.parent.toUpperCase() === filePref) {
                    row.areaId = filePref + "_" + (row.notes || row.name);
                    areas.push(row);
                }
            });

            // スポット（★areaId付与）
            allRows.forEach(row => {
                const icon = row.icon;
                if (!icon) return;

                if (icon === 'spot' || icon.startsWith('fish')) {

                    const parentArea = areas.find(a => a.name === row.parent);

                    if (parentArea) {
                        row.areaId = parentArea.areaId;
                    }

                    spots.push(row);
                }
            });

            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;

            alert(
                "CSV LOAD\n" +
                "areas: " + areas.length + "\n" +
                "spots: " + spots.length + "\n" +
                "sample areaId: " + (areas[0] ? areas[0].areaId : "none")
            );

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

    if (!window.currentAreaName) {
        showPrefSpots();
    }
}

function selectArea(areaName) {

    window.currentAreaName = areaName;
    hidePrefSpots();

    const area = window.areaData.find(a => a.name === areaName);
    if (!area) {
        alert("area not found: " + areaName);
        return;
    }

    alert(
        "AREA SELECT\n" +
        "name: " + area.name + "\n" +
        "areaId: " + area.areaId
    );

    drawLocation(area.name, area.lat, area.lng, area.zoom || window.prefData.zoom);

    location.hash = encodeURIComponent(area.name);

    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('map-back-btn').style.display = 'block';

    showSpotsForArea(area.areaId);
}

function selectSpot(areaId, selectName, spotLat, spotLng) {
    window.map.setMaxBounds(null);

    drawLocation(selectName, spotLat, spotLng, 13);

    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    if (window.currentTileLayer) {
        window.map.removeLayer(window.currentTileLayer);
    }

    window.currentTileLayer = L.tileLayer(tileUrl, {
        attribution: '© OpenStreetMap contributors',
        keepBuffer: 8,
        updateWhenIdle: true
    }).addTo(window.map);
}

function showSpotsForArea(areaId) {

    if (window.spotMarkers) {
        window.spotMarkers.forEach(m => window.map.removeLayer(m));
    }
    window.spotMarkers = [];

    if (!areaId) {
        alert("no areaId");
        return;
    }

    const spots = window.spotData.filter(s => s.areaId === areaId);

    alert(
        "SPOT FILTER\n" +
        "areaId: " + areaId + "\n" +
        "spots: " + spots.length
    );

    if (!spots.length) return;

    let minLat = 999, maxLat = -999, minLng = 999, maxLng = -999;

    spots.forEach(spot => {

        const iconId = spot.icon || 'spot';
        const isFish = iconId.startsWith('fish');

        const marker = L.marker([spot.lat, spot.lng], {
            icon: L.divIcon({
                className: '',
                html: `
                <div class="spot-label ${iconId}">
                    <svg width="16" height="16">
                        <use href="/MAP-/icon/sprite.svg#icon-${iconId}"></use>
                    </svg>
                    <span>${spot.name}</span>
                </div>`,
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

        window.spotMarkers.push(marker);
        marker.addTo(window.map);

        if (spot.lat < minLat) minLat = spot.lat;
        if (spot.lat > maxLat) maxLat = spot.lat;
        if (spot.lng < minLng) minLng = spot.lng;
        if (spot.lng > maxLng) maxLng = spot.lng;
    });

    const latBuffer = Math.max((maxLat - minLat) * 0.2, 0.05);
    const lngBuffer = Math.max((maxLng - minLng) * 0.2, 0.05);

    window.areaBounds = L.latLngBounds(
        [minLat - latBuffer, minLng - lngBuffer],
        [maxLat + latBuffer, maxLng + lngBuffer]
    );
}

function goBack() {
    window.currentAreaName = null;

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

    document.getElementById('map-menu').style.display = 'block';
    document.getElementById('map-back-btn').style.display = 'none';

    showPrefSpots();
}

window.selectArea = selectArea;
window.selectSpot = selectSpot;
window.goBack = goBack;
window.drawLocation = drawLocation;
window.loadLocationCSV = loadLocationCSV;

/* =========================
   プリセットレイヤー
========================= */

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
}

function showPrefSpots() {
    createPrefSpotLayer();
    if (!window.map.hasLayer(window.prefSpotLayer)) {
        window.prefSpotLayer.addTo(window.map);
    }
}

function hidePrefSpots() {
    if (window.prefSpotLayer && window.map.hasLayer(window.prefSpotLayer)) {
        window.map.removeLayer(window.prefSpotLayer);
    }
}