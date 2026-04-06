// dataLoader.js

// グローバル保持
window.locationData = null; // 県本体
window.areaData = [];       // 直下のエリア
window.spotData = [];       // スポット

/**
 * CSV読み込み
 * @param {string} csvUrl
 * @returns {Promise<{main: object, areas: object[], spots: object[]}>}
 */
function loadLocationCSV(csvUrl) {
    return fetch(csvUrl)
        .then(r => r.text())
        .then(text => {
            const lines = text.trim().split('\n');
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

                if (!parent) {
                    // 親を持たない本体
                    window.locationData = obj;
                } else if (parent === window.locationData?.name) {
                    // 本体直下のエリア
                    window.areaData.push(obj);
                } else {
                    // スポット
                    window.spotData.push(obj);
                }
            }

            return {
                main: window.locationData,
                areas: window.areaData,
                spots: window.spotData
            };
        });
}

/**
 * 地図描画関数
 * @param {string} name
 * @param {number} lat
 * @param {number} lng
 * @param {number} zoom
 * @param {number|null} maxZoom
 * @param {'std'|'pale'|'photo'} type
 */
function drawLocation(name, lat, lng, zoom, maxZoom = null, type = 'std') {
    if (maxZoom !== null) {
        alert(`"${name}" に最大ズームがあります: ${maxZoom}`);
        return;
    }

    let tileUrl = '';
    switch(type) {
        case 'std': tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'; break;
        case 'pale': tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'; break;
        case 'photo': tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg'; break;
        default: tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
    }

    if (window.map) {
        window.map.flyTo([lat, lng], zoom, { duration: 0.5 });
        if (window.currentTileLayer) window.map.removeLayer(window.currentTileLayer);
        window.currentTileLayer = L.tileLayer(tileUrl, { attribution: '© 国土地理院' }).addTo(window.map);
    } else {
        window.map = L.map('lf-map', { center: [lat, lng], zoom });
        window.currentTileLayer = L.tileLayer(tileUrl, { attribution: '© 国土地理院' }).addTo(window.map);
    }
}

window.loadLocationCSV = loadLocationCSV;
window.drawLocation = drawLocation;