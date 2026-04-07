// グローバルに保持
window.prefData = null;  // 選択された県本体
window.areaData = [];    // 選択県直下のエリア
window.spotData = [];    // 選択県直下のスポット

/**
 * CSV読み込み
 * @param {string} csvUrl
 * @param {string} currentFile
 */
function loadLocationCSV(csvUrl, currentFile) {
    return fetch(csvUrl)
        .then(r => r.text())
        .then(text => {
            const lines = text.trim().split('\n');
            const headers = lines[0].split(',');

            let main = null;
            const areas = [];
            const spots = [];

            const filePref = currentFile.replace('.html', '').toUpperCase();

            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',');
                const name = cols[0].trim();
                const zoom = parseFloat(cols[1]);
                const maxZoom = cols[2] ? parseFloat(cols[2]) : null;
                const lat = parseFloat(cols[3]);
                const lng = parseFloat(cols[4]);
                const parent = cols[5] ? cols[5].trim() : '';
                const style = cols[6] ? cols[6].trim() : '';
                const restricted = cols[7] ? parseFloat(cols[7]) : null;
                const icon = cols[8] ? cols[8].trim() : null;

                const obj = { name, zoom, maxZoom, lat, lng, parent, style, restricted, icon };

                if (!parent && name.toUpperCase() === filePref) {
                    main = obj;
                } else if (parent.toUpperCase() === filePref) {
                    areas.push(obj);
                } else if (parent && areas.find(a => a.name.toUpperCase() === parent.toUpperCase())) {
                    spots.push(obj);
                }
            }

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
        window.map.attributionControl.setPosition('topright');

        if (window.currentTileLayer) window.map.removeLayer(window.currentTileLayer);
        window.currentTileLayer = L.tileLayer(tileUrl, { attribution: '© 国土地理院' }).addTo(window.map);

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

        window.currentTileLayer = L.tileLayer(tileUrl, {
            attribution: '© 国土地理院'
        }).addTo(window.map);
    }
}

/**
 * エリア選択
 */
function selectArea(areaName, fromBackButton = false) {
    const area = window.areaData.find(a => a.name === areaName);
    if (!area) return;

    drawLocation(area.name, area.lat, area.lng, area.zoom || window.prefData.zoom);

    const menu = document.getElementById('map-menu');
    const backBtn = document.getElementById('map-back-btn');

    if (!fromBackButton) {
        location.hash = encodeURIComponent(areaName);
        window.currentHash = location.hash;
    }

    menu.style.display = 'none';
    backBtn.style.display = 'block';
}

/**
 * スポット選択
 */
function selectSpot(areaName, spotName) {
    const spot = window.spotData.find(s => s.name === spotName && s.parent === areaName);
    if (!spot) return;

    drawLocation(spot.name, spot.lat, spot.lng, spot.zoom || window.prefData.zoom);

    location.hash = encodeURIComponent(areaName + '/' + spotName);
    window.currentHash = location.hash;

    const menu = document.getElementById('map-menu');
    const backBtn = document.getElementById('map-back-btn');

    menu.style.display = 'none';
    backBtn.style.display = 'block';
}

/**
 * 戻るボタン
 */
window.goBack = function() {
    if (!window.currentHash) return;

    const parts = decodeURIComponent(window.currentHash.substring(1)).split('/');
    const areaName = parts[0];
    const spotName = parts[1];

    const menu = document.getElementById('map-menu');
    const backBtn = document.getElementById('map-back-btn');

    if (spotName) {
        selectArea(areaName, true);
    } else {
        drawLocation(window.prefData.name, window.prefData.lat, window.prefData.lng, window.prefData.zoom, window.prefData.maxZoom);
        window.currentHash = '';
        location.hash = '';

        menu.style.display = 'block';
        backBtn.style.display = 'none';
    }
};