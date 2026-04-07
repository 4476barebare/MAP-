// dataLoader.js

// グローバルに保持
window.prefData = null;  // 選択された県本体
window.areaData = [];    // 選択県直下のエリア
window.spotData = [];    // 選択県直下のスポット
window.currentHash = null;

/**
 * CSV読み込み関数
 * @param {string} csvUrl - CSVファイルURL
 * @param {string} currentFile - 現在のHTMLファイル名（例: "chiba.html"）
 * @returns {Promise<{main: object, areas: object[], spots: object[]}>}
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
                } else if (parent) {
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
 * 地図描画（初回・エリア・スポット共通）
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
        touchZoom: false,
    };
    const mapOptions = { ...defaultOptions, ...options };
    const tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg';

    if (window.map) {
        window.map.flyTo([lat, lng], zoom, { duration: 0.5 });
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
        window.currentTileLayer = L.tileLayer(tileUrl, { attribution: '© 国土地理院' }).addTo(window.map);
    }
}

/**
 * エリア選択
 */
function selectArea(areaName) {
    const area = window.areaData.find(a => a.name === areaName);
    if (!area) return;
    drawLocation(area.name, area.lat, area.lng, area.zoom || window.prefData.zoom);
    location.hash = encodeURIComponent(area.name);
    window.currentHash = location.hash;
}

/**
 * スポット選択
 */
function selectSpot(spotName, areaName = null) {
    let spot;
    if (areaName) {
        spot = window.spotData.find(s => s.name === spotName && s.parent === areaName);
    } else {
        spot = window.spotData.find(s => s.name === spotName);
    }
    if (!spot) return;
    drawLocation(spot.name, spot.lat, spot.lng, spot.zoom || window.prefData.zoom);
    location.hash = areaName ? encodeURIComponent(areaName + '/' + spot.name)
                             : encodeURIComponent(spot.name);
    window.currentHash = location.hash;
}

window.drawLocation = drawLocation;
window.selectArea = selectArea;
window.selectSpot = selectSpot;