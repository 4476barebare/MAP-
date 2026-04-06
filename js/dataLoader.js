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
 * 指定の座標とズームで地図描画、maxZoom がある場合はアラート
 * @param {string} name - 場所の名前
 * @param {number} lat - 緯度
 * @param {number} lng - 経度
 * @param {number} zoom - ズームレベル
 * @param {number|null} maxZoom - 最大ズームレベル
 * @param {object} options - 上書き可能な地図オプション
 */
function drawLocation(name, lat, lng, zoom, maxZoom = null, options = {}) {
  if (maxZoom !== null) {
    alert(`"${name}" に最大ズームが設定されています: ${maxZoom}`);
    return;
  }

  // デフォルトは航空写真、全操作禁止
  const defaultOptions = {
    center: [lat, lng],
    zoom: zoom,
    scrollWheelZoom: false,
    dragging: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
  };

  const mapOptions = { ...defaultOptions, ...options };

  const tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg';

  if (window.map) {
    window.map.flyTo([lat, lng], zoom, { duration: 0.5 });
    if (window.currentTileLayer) window.map.removeLayer(window.currentTileLayer);
    window.currentTileLayer = L.tileLayer(tileUrl, { attribution: '© 国土地理院' }).addTo(window.map);

    // 上書きオプションを反映
    mapOptions.scrollWheelZoom ? window.map.scrollWheelZoom.enable() : window.map.scrollWheelZoom.disable();
    mapOptions.dragging ? window.map.dragging.enable() : window.map.dragging.disable();

  } else {
    window.map = L.map('lf-map', mapOptions);
    window.currentTileLayer = L.tileLayer(tileUrl, { attribution: '© 国土地理院' }).addTo(window.map);
  }
}

window.drawLocation = drawLocation;