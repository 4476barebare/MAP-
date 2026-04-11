// グローバル
window.prefData = null;
window.areaData = [];
window.spotData = [];
window.currentHash = '';

window.spotMarkers = [];
window.currentAreaName = null;

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
                if (!row.parent && row.name.toUpperCase() === filePref) main = row;
            });

            allRows.forEach(row => {
                if (row.parent.toUpperCase() === filePref) areas.push(row);
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

        if (window.currentTileLayer) window.map.removeLayer(window.currentTileLayer);

        window.currentTileLayer = L.tileLayer(tileUrl, {
            attribution: '© 国土地理院'
        }).addTo(window.map);

    } else {
        window.map = L.map('lf-map', mapOptions);
        window.map.attributionControl.setPosition('topright');

        window.currentTileLayer = L.tileLayer(tileUrl, {
            attribution: '© 国土地理院'
        }).addTo(window.map);

        // ★ 初回だけズームイベント登録
        window.map.on('zoomend', updateSpotMarkers);
    }

    window.currentHash = location.hash;
}

// =====================
// エリア選択
// =====================
function selectArea(areaName) {

    const area = window.areaData.find(a => a.name === areaName);
    if (!area) return;

    window.currentAreaName = areaName;

    drawLocation(area.name, area.lat, area.lng, area.zoom || window.prefData.zoom);

    location.hash = encodeURIComponent(area.name);

    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('map-back-btn').style.display = 'block';

    showSpotsForArea(area.name);
}

// =====================
// スポット生成（初回のみ）
// =====================
function showSpotsForArea(areaName) {

    if (window.spotMarkers.length > 0) return;

    const zoom = map.getZoom();

    window.spotData.forEach(spot => {

        if (spot.parent !== areaName) return;

        const icon = L.divIcon({
            html: createSpotHTML(spot, zoom),
            className: '',
            iconSize: null
        });

        const marker = L.marker([spot.lat, spot.lng], { icon }).addTo(map);

        window.spotMarkers.push({
            marker: marker,
            spot: spot
        });
    });
}

// =====================
// HTML生成
// =====================
function createSpotHTML(spot, zoom) {

    const iconId = (spot.icon || '').toLowerCase();

    // 旧スポット
    if (iconId === 'spot') {
        if (zoom === 9) {
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

    // 新釣り場
    if (iconId.startsWith('fish')) {

        let color = '#ffffff';
        if (iconId === 'fish1') color = '#1e90ff';
        if (iconId === 'fish2') color = '#32cd32';
        if (iconId === 'fish3') color = '#ff8c00';
        if (iconId === 'fish4') color = '#ba55d3';

        return `
        <div class="spot-label">
            <svg width="18" height="18" style="fill:${color}">
                <use href="/MAP-/icon/sprite.svg#icon-${iconId}"></use>
            </svg>
            ${zoom >= 13 ? `<span>${spot.name}</span>` : ``}
        </div>`;
    }

    return '';
}

// =====================
// ズーム時更新（再生成なし）
// =====================
function updateSpotMarkers() {

    const zoom = map.getZoom();

    window.spotMarkers.forEach(obj => {

        const html = createSpotHTML(obj.spot, zoom);

        obj.marker.setIcon(L.divIcon({
            html: html,
            className: '',
            iconSize: null
        }));
    });
}

// =====================
// 戻る処理
// =====================
function goBack(hash) {

    hash = hash || window.currentHash || '';
    const parts = decodeURIComponent(hash.replace(/^#/, '')).split('/');
    const areaName = parts[0];
    const spotName = parts[1];

    if (spotName) {
        alert("未実装");
    } else if (areaName) {

        drawLocation(
            window.prefData.name,
            window.prefData.lat,
            window.prefData.lng,
            window.prefData.zoom,
            window.prefData.maxZoom
        );

        // マーカー削除
        window.spotMarkers.forEach(obj => window.map.removeLayer(obj.marker));
        window.spotMarkers = [];

        window.currentAreaName = null;

        location.hash = '';
        window.currentHash = '';
    }

    document.getElementById('map-menu').style.display = 'block';
    document.getElementById('map-back-btn').style.display = 'none';
}