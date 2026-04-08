

// グローバル
window.prefData = null;
window.areaData = [];
window.spotData = [];
window.currentHash = '';

/**
 * CSV読み込み
 */
function loadLocationCSV(csvUrl, currentFile) {
    return fetch(csvUrl)
        .then(r => r.text())
        .then(text => {
            const lines = text.trim().split('\n');
            const headers = lines[0].split(',');
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
                    style: cols[6] ? cols[6].trim() : '',
                    restricted: cols[7] ? parseFloat(cols[7]) : null,
                    icon: cols[8] ? cols[8].trim() : null
                };
            });

            // 県データ
            allRows.forEach(row => {
                if (!row.parent && row.name.toUpperCase() === filePref) main = row;
            });

            // エリアデータ
            allRows.forEach(row => {
                if (row.parent.toUpperCase() === filePref) areas.push(row);
            });

            // スポットデータ
            allRows.forEach(row => {
                if (row.parent && areas.find(a => a.name === row.parent)) spots.push(row);
            });

            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;

            return { main, areas, spots };
        });
}
/**
 * 地図描画
 */
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
        tap: false,
    };

    const mapOptions = { ...defaultOptions, ...options };
    const tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg';

    if (window.map) {
        window.map.flyTo([lat, lng], zoom, { duration: 0.5 });
        if (window.currentTileLayer) window.map.removeLayer(window.currentTileLayer);
        window.currentTileLayer = L.tileLayer(tileUrl, { attribution: '© 国土地理院' }).addTo(window.map);

        // 操作制御
        mapOptions.scrollWheelZoom ? window.map.scrollWheelZoom.enable() : window.map.scrollWheelZoom.disable();
        mapOptions.dragging ? window.map.dragging.enable() : window.map.dragging.disable();
        mapOptions.doubleClickZoom ? window.map.doubleClickZoom.enable() : window.map.doubleClickZoom.disable();
        mapOptions.boxZoom ? window.map.boxZoom.enable() : window.map.boxZoom.disable();
        mapOptions.keyboard ? window.map.keyboard.enable() : window.map.keyboard.disable();
        mapOptions.touchZoom ? window.map.touchZoom.enable() : window.map.touchZoom.disable();
        if (window.map.tap) mapOptions.tap ? window.map.tap.enable() : window.map.tap.disable();
    } else {
        window.map = L.map('lf-map', mapOptions);
        window.map.attributionControl.setPosition('topright');
        window.currentTileLayer = L.tileLayer(tileUrl, { attribution: '© 国土地理院' }).addTo(window.map);
    }
        window.currentHash = location.hash;
}

/**
 * エリア選択
 */
function selectArea(areaName) {
    //removeNearestClick();
    const area = window.areaData.find(a => a.name === areaName);
    if (!area) return;
    drawLocation(area.name, area.lat, area.lng, area.zoom || window.prefData.zoom);
    //setupNearestClick();
    
    location.hash = encodeURIComponent(area.name);

    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('map-back-btn').style.display = 'block';
    
    
    showSpotsForArea(area.name);



}

/**
 * スポット描画
 * @param {string} areaName
 * @param {boolean} highlightZoom13 - trueならマーカーを大きくして表示
 */
function selectSpot(areaName, spotName, spotLat, spotLng) {
    alert(spotName);
   
    
    drawLocation(spotName, spotLat, spotLng, 13);
    
    
     // LeafletタイルURL（例: OSM標準）
    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    // 既存タイル削除
    if (window.currentTileLayer) window.map.removeLayer(window.currentTileLayer);

    // 新タイル追加
    window.currentTileLayer = L.tileLayer(tileUrl, {
        attribution: '© OpenStreetMap contributors'
    }).addTo(window.map);

    // 13固定でスポットに移動（flyToではなくsetView）
    //window.map.setView([spotLat, spotLng], 13);

    // メニュー・戻るボタンの表示は不要ならそのまま
}






// --- 選択エリア内だけドラッグ許可 ---
function enableDragForArea(areaName) {
    const area = window.areaData.find(a => a.name === areaName);
    if (!area) return;

    const delta = 0.05;
    const bounds = L.latLngBounds(
        [area.lat - delta, area.lng - delta],
        [area.lat + delta, area.lng + delta]
    );

    window.map.setMaxBounds(bounds);
    window.map.dragging.enable();

    // 枠外移動補正
    window.map.on('move', () => {
        window.map.panInsideBounds(bounds, { animate: false });
    });
}




/**
 * 戻る
 */

function goBack(hash) {
    // ハッシュ未指定なら currentHash を使う
    hash = hash || window.currentHash || '';

    // decodeして判定
    const parts = decodeURIComponent(hash.replace(/^#/, '')).split('/');
    const areaName = parts[0];
    const spotName = parts[1];

    if (spotName) {
        // スポット→エリアに戻す（まだピン削除処理は未実装）
        const area = window.areaData.find(a => a.name === areaName);
        if (!area) return;

        // スポットピンを消す処理（未実装）
        // window.spotMarkers.forEach(marker => window.map.removeLayer(marker));
        // window.spotMarkers = [];

        drawLocation(area.name, area.lat, area.lng, area.zoom || window.prefData.zoom);
        location.hash = encodeURIComponent(area.name);
        window.currentHash = location.hash;

    } else if (areaName) {
        // エリア→県に戻す

        drawLocation(
            window.prefData.name,
            window.prefData.lat,
            window.prefData.lng,
            window.prefData.zoom,
            window.prefData.maxZoom
        );

        // 既存スポットマーカーを削除
        if (window.spotMarkers) {
            window.spotMarkers.forEach(marker => window.map.removeLayer(marker));
            window.spotMarkers = [];
        }

        location.hash = '';
        window.currentHash = '';
    }

    // 表示制御はそのまま
    document.getElementById('map-menu').style.display = 'block';
    document.getElementById('map-back-btn').style.display = 'none';
}

window.selectArea = selectArea;
window.selectSpot = selectSpot;
window.goBack = goBack;
window.drawLocation = drawLocation;
window.loadLocationCSV = loadLocationCSV;



function showSpotsForArea(areaName) {
    if (window.spotMarkers) {
        window.spotMarkers.forEach(marker => window.map.removeLayer(marker));
    }
    window.spotMarkers = [];

    if (!areaName) return;

    const normAreaName = areaName.trim().toLowerCase();
    const spots = window.spotData.filter(s => s.parent && s.parent.trim().toLowerCase() === normAreaName);

    spots.forEach(spot => {
        const iconId = spot.icon || 'default-icon';

        // SVGを文字列としてdivIconに埋め込み
        const html = `
            <div class="spot-label">
                <svg width="16" height="16">
                    <use href="/MAP-/icon/sprite.svg#icon-${iconId}"></use>
                </svg>
                <span>${spot.name}</span>
            </div>
        `;

        const marker = L.marker([spot.lat, spot.lng], {
            icon: L.divIcon({
                className: '',
                html: html,
                iconSize: [32, 32],
                iconAnchor: [16, 16] // 左寄せで縦中央
            })
        });

// ここで座標を渡す
    marker.on('click', function() {
        selectSpot(areaName, spot.name, spot.lat, spot.lng);
    });





        window.spotMarkers.push(marker);
        marker.addTo(window.map);
    });
}
