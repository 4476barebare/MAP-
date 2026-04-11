enableNearestAreaClick();

// =====================
// グローバル
// =====================
window.prefData = null;
window.areaData = [];
window.spotData = [];
window.currentHash = '';

window.spotMarkers = [];
window.currentAreaName = null;
window.areaBounds = null;

// =====================
// CSV読込
// =====================
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

            allRows.forEach(row => {
                if (!row.parent && row.name.toUpperCase() === filePref) {
                    main = row;
                }
            });

            allRows.forEach(row => {
                if (row.parent.toUpperCase() === filePref) {
                    areas.push(row);
                }
            });

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

// =====================
// 地図描画
// =====================
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

        // ズーム時再描画
        window.map.on('zoomend', () => {
            if (window.currentAreaName !== null) {
                showSpotsForArea(window.currentAreaName);
            }
        });
    }

    window.currentHash = location.hash;
}

// =====================
// エリアbounds生成
// =====================
function setAreaBounds(areaName) {

    const points = [];

    window.spotData.forEach(spot => {
        if (spot.parent === areaName) {
            points.push([spot.lat, spot.lng]);
        }
    });

    if (points.length === 0) return;

    let bounds = L.latLngBounds(points);

    bounds = bounds.pad(0.2);

    window.areaBounds = bounds;

    window.map.setMaxBounds(bounds);
}

// =====================
// エリア選択
// =====================
function selectArea(areaName) {

    const area = window.areaData.find(a => a.name === areaName);
    if (!area) return;

    window.currentAreaName = areaName;

    drawLocation(
        area.name,
        area.lat,
        area.lng,
        area.zoom || window.prefData.zoom,
        null,
        { dragging: true }
    );

    setAreaBounds(areaName);

    location.hash = encodeURIComponent(area.name);

    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('map-back-btn').style.display = 'block';

    showSpotsForArea(area.name);
}

// =====================
// スポット描画
// =====================
function showSpotsForArea(areaName) {

    window.spotMarkers.forEach(obj => window.map.removeLayer(obj.marker));
    window.spotMarkers = [];

    const isPrefView = (areaName === null);

    window.spotData.forEach(spot => {

        if (!isPrefView && spot.parent !== areaName) return;

        const html = createSpotHTML(spot, isPrefView);
        if (!html) return;

        const marker = L.marker([spot.lat, spot.lng], {
            icon: L.divIcon({
                html: html,
                className: '',
                iconSize: null
            })
        }).addTo(map);

        // ★ここが重要
        if (!isPrefView) {
            marker.on('click', () => {
                selectSpot(areaName, spot.name, spot.lat, spot.lng);
            });
        }

        window.spotMarkers.push({ marker, spot });
    });
}

// =====================
// HTML生成（phase制御）
// =====================
function createSpotHTML(spot, isPrefView) {

    const iconId = (spot.icon || '').toLowerCase();

    // ===== 旧スポット =====
    if (iconId === 'spot') {

        if (isPrefView) {
            return `<div style="width:5px;height:5px;background:#191970;"></div>`;
        }

        return `
        <div class="spot-label">
            <svg width="18" height="18">
                <use href="/MAP-/icon/sprite.svg#icon-spot"></use>
            </svg>
            <span>${spot.name}</span>
        </div>`;
    }

    // ===== 新釣り場 =====
    if (iconId.startsWith('fish')) {

        let color = '#ffffff';
        if (iconId === 'fish1') color = '#1e90ff';
        if (iconId === 'fish2') color = '#32cd32';
        if (iconId === 'fish3') color = '#ff8c00';
        if (iconId === 'fish4') color = '#ba55d3';

        if (isPrefView) {
            return `
            <div>
                <svg width="16" height="16" style="fill:${color}">
                    <use href="/MAP-/icon/sprite.svg#icon-${iconId}"></use>
                </svg>
            </div>`;
        }

        return `
        <div class="spot-label">
            <svg width="18" height="18" style="fill:${color}">
                <use href="/MAP-/icon/sprite.svg#icon-${iconId}"></use>
            </svg>
            <span>${spot.name}</span>
        </div>`;
    }

    return '';
}

// =====================
// スポット選択
// =====================
function selectSpot(areaName, selectName, spotLat, spotLng) {

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

    window.map.once('moveend', () => {
        enableDragForArea();
    });
}

// =====================
// ドラッグ制御
// =====================
function enableDragForArea() {

    if (!window.areaBounds) return;

    window.map.dragging.enable();
    window.map.options.inertia = false;

    window.map.off('move');

    window.map.on('move', () => {
        window.map.panInsideBounds(window.areaBounds, { animate: false });
    });
}

// =====================
// 戻る
// =====================
function goBack(hash) {

    hash = hash || window.currentHash || '';

    const parts = decodeURIComponent(hash.replace(/^#/, '')).split('/');
    const areaName = parts[0];
    const spotName = parts[1];

    if (spotName) {

        alert("未実装");

    } else if (areaName) {

        window.map.off('move');

        drawLocation(
            window.prefData.name,
            window.prefData.lat,
            window.prefData.lng,
            window.prefData.zoom,
            window.prefData.maxZoom
        );

        window.map.setMaxBounds(null);
        window.areaBounds = null;

        window.spotMarkers.forEach(obj => window.map.removeLayer(obj.marker));
        window.spotMarkers = [];

        window.currentAreaName = null;

        location.hash = '';
        window.currentHash = '';

        // ★県全域スポット再表示
        showSpotsForArea(null);
    }

    document.getElementById('map-menu').style.display = 'block';
    document.getElementById('map-back-btn').style.display = 'none';
}


function enableNearestAreaClick() {

    map.on('click', function(e) {

        // エリア選択中やスポット中は無効
        if (window.currentAreaName !== null) return;

        const clickedLatLng = e.latlng;

        let nearestArea = null;
        let minDist = Infinity;

        window.areaData.forEach(area => {

            const dist = map.distance(
                clickedLatLng,
                L.latLng(area.lat, area.lng)
            );

            if (dist < minDist) {
                minDist = dist;
                nearestArea = area;
            }
        });

        if (nearestArea) {
            selectArea(nearestArea.name);
        }
    });
}