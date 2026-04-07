// dataloader.js

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
 * スポット選択
 */
function selectSpot(areaName, spotName) {
    //removeNearestClick();
    const spot = window.spotData.find(s => s.name === spotName && s.parent === areaName);
    if (!spot) return;
    drawLocation(spot.name, spot.lat, spot.lng, spot.zoom || window.prefData.zoom);
    

    location.hash = encodeURIComponent(areaName + '/' + spotName);

    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('map-back-btn').style.display = 'block';
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
    // 既存スポットマーカーを削除
    if (window.spotMarkers) {
        window.spotMarkers.forEach(marker => window.map.removeLayer(marker));
    }
    window.spotMarkers = [];

    if (!areaName) return;

    const normAreaName = areaName.trim().toLowerCase();
    const spots = window.spotData.filter(s => s.parent && s.parent.trim().toLowerCase() === normAreaName);

    // --- 確認用ログ ---
    console.log('Filtered spots for area:', normAreaName, spots);
    if (spots.length > 0) {
        alert(`スポット1件目: 名前=${spots[0].name}, icon=${spots[0].icon}`);
    }

    spots.forEach(spot => {
        const iconId = spot.icon || 'spot';

        // --- SVG sprite 確認用 ---
        const testSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const useEl = document.createElementNS("http://www.w3.org/2000/svg", "use");
        useEl.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `/MAP-/icon/sprite.svg#${iconId}`);
        testSvg.appendChild(useEl);
        testSvg.style.position = 'absolute';
        testSvg.style.top = '0';
        testSvg.style.left = '0';
        testSvg.style.width = '24px';
        testSvg.style.height = '24px';
        testSvg.style.background = 'rgba(255,0,0,0.2)'; // 赤半透明で見えるように
        document.body.appendChild(testSvg);

        const html = `
            <div class="spot-marker">
                <svg class="spot-icon" width="24" height="24">
                    <use href="/MAP-/icon/sprite.svg#${iconId}"></use>
                </svg>
                <span class="spot-name">${spot.name}</span>
            </div>
        `;

        const marker = L.marker([spot.lat, spot.lng], {
            title: spot.name,
            icon: L.divIcon({
                html: html,
                className: 'spot-div-icon',
                iconSize: [150, 24], // 適宜調整
                iconAnchor: [0, 12] // 左端中央に合わせる
            })
        }).addTo(window.map);

        marker.on('click', () => selectSpot(spot.parent, spot.name));

        window.spotMarkers.push(marker);
    });
}