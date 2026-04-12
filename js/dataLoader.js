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
                if (!row.parent && row.name.toUpperCase() === filePref) main = row;
            });

            // エリア
            allRows.forEach(row => {
                if (row.parent.toUpperCase() === filePref) areas.push(row);
            });

            // スポット
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

            // ★アラート（spot生成確認）
            alert(
                "SPOT LOAD\n\n" +
                spots.map(s =>
                    s.name + " | parent=" + s.parent + " | areaId=" + s.areaId
                ).join("\n")
            );

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
    const tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg';

    if (window.map) {
        window.map.flyTo([lat, lng], zoom, { duration: 0.5 });
        if (window.currentTileLayer) window.map.removeLayer(window.currentTileLayer);
        window.currentTileLayer = L.tileLayer(tileUrl, { attribution: '© 国土地理院' }).addTo(window.map);
    } else {
        window.map = L.map('lf-map', mapOptions);
        window.map.attributionControl.setPosition('topright');
        window.currentTileLayer = L.tileLayer(tileUrl, { attribution: '© 国土地理院' }).addTo(window.map);
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
    if (!area) return;

    drawLocation(area.name, area.lat, area.lng, area.zoom || window.prefData.zoom);

    location.hash = encodeURIComponent(area.name);

    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('map-back-btn').style.display = 'block';

    showSpotsForArea(area.name);
}

function selectSpot(areaName, selectName, spotLat, spotLng) {
    window.map.setMaxBounds(null);

    drawLocation(selectName, spotLat, spotLng, 13);

    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    if (window.currentTileLayer) window.map.removeLayer(window.currentTileLayer);

    window.currentTileLayer = L.tileLayer(tileUrl, {
        attribution: '© OpenStreetMap contributors'
    }).addTo(window.map);
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

    showPrefSpots();
    document.getElementById('map-menu').style.display = 'block';
    document.getElementById('map-back-btn').style.display = 'none';
}

window.selectArea = selectArea;
window.selectSpot = selectSpot;
window.goBack = goBack;
window.drawLocation = drawLocation;
window.loadLocationCSV = loadLocationCSV;

/* -----------------------------
   エリアスポット表示
----------------------------- */
function showSpotsForArea(areaName) {

    alert("AREA CLICK RAW\n" + areaName);

    if (window.spotMarkers) {
        window.spotMarkers.forEach(m => window.map.removeLayer(m));
    }
    window.spotMarkers = [];

    if (!areaName) return;

    const area = window.areaData.find(a => a.name === areaName);

    alert(
        "AREA MATCH CHECK\n" +
        "areaName=" + areaName + "\n" +
        "found=" + JSON.stringify(area, null, 2)
    );

    if (!area) return;

    const areaId = area.areaId;

    alert("USING AREA ID\n" + areaId);

    const spots = window.spotData.filter(s => s.areaId === areaId);

    alert(
        "FILTER RESULT\n" +
        spots.map(s => s.name + " => " + s.areaId).join("\n")
    );

    let minLat = 999, maxLat = -999, minLng = 999, maxLng = -999;

    spots.forEach(spot => {

        const iconId = spot.icon || 'spot';
        const isFish = iconId.startsWith('fish');

        const marker = L.marker([spot.lat, spot.lng]).addTo(window.map);

        window.spotMarkers.push(marker);

        if (spot.lat < minLat) minLat = spot.lat;
        if (spot.lat > maxLat) maxLat = spot.lat;
        if (spot.lng < minLng) minLng = spot.lng;
        if (spot.lng > maxLng) maxLng = spot.lng;
    });
}

/* -----------------------------
   県レイヤー（そのまま）
----------------------------- */
function showPrefSpots() {

    if (!window.prefSpotLayer) {
        const layer = L.layerGroup();

        window.spotData.forEach(spot => {
            const marker = L.circleMarker([spot.lat, spot.lng], {
                radius: 2
            });
            layer.addLayer(marker);
        });

        window.prefSpotLayer = layer;
    }

    window.prefSpotLayer.addTo(window.map);
}

function hidePrefSpots() {
    if (window.prefSpotLayer) {
        window.map.removeLayer(window.prefSpotLayer);
    }
}