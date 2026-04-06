// dataLoader.js

// グローバルに保持
window.prefData = null;   // 選択された県本体
window.areaData = [];     // 選択県直下のエリア
window.spotData = [];     // 選択県直下のスポット
window.currentHash = '';  // 現在のハッシュ

/**
 * CSV読み込み関数
 * @param {string} csvUrl - CSVファイルURL
 */
export async function loadLocationCSV(csvUrl) {
    const response = await fetch(csvUrl);
    const text = await response.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const header = lines[0].split(',');
    const rows = lines.slice(1).map(line => {
        const cols = line.split(',');
        const obj = {};
        header.forEach((h, i) => obj[h] = cols[i]);
        return obj;
    });

    // pref / area / spot に分ける
    const main = rows.find(r => r.type === 'pref');
    const areas = rows.filter(r => r.type === 'area');
    const spots = rows.filter(r => r.type === 'spot');

    window.prefData = main;
    window.areaData = areas;
    window.spotData = spots;

    return { main, areas, spots };
}

/**
 * 地図描画・更新共通
 * @param {number} lat 
 * @param {number} lng 
 * @param {number} zoom 
 */
export function drawMap(lat, lng, zoom) {
    if (!window.map) {
        window.map = L.map('lf-map', {
            center: [lat, lng],
            zoom: zoom,
            zoomControl: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            dragging: false
        });
        L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg', {
            attribution: '© 国土地理院'
        }).addTo(window.map);
    } else {
        window.map.setView([lat, lng], zoom);
    }
}

/**
 * ハッシュ解析
 * @param {object} data - CSV読み込みデータ
 */
export function parseHash(data) {
    const hash = location.hash || '';
    if (!hash) return null;
    const [areaName, spotName] = decodeURIComponent(hash.substring(1)).split('/');
    const area = data.areas.find(a => a.name === areaName);
    if (!area) return null;
    return { area, spotName };
}

/**
 * エリア選択共通処理
 * @param {object} area - エリアデータ
 * @param {boolean} fly - flyTo するか
 */
export function selectArea(area, fly = true) {
    if (!window.map) return;
    if (fly) {
        window.map.flyTo([area.lat, area.lng], area.zoom || window.prefData.zoom);
    } else {
        window.map.setView([area.lat, area.lng], area.zoom || window.prefData.zoom);
    }

    // メニュー非表示
    const menu = document.getElementById('map-menu');
    if (menu) menu.style.display = 'none';

    // URLハッシュ更新
    window.currentHash = encodeURIComponent(area.name);
    location.hash = window.currentHash;
}

/**
 * 初期ロード処理
 * @param {string} csvUrl 
 */
export async function initMapFromCSV(csvUrl) {
    const data = await loadLocationCSV(csvUrl);

    // ハッシュ解析
    const hashResult = parseHash(data);
    if (hashResult) {
        drawMap(hashResult.area.lat, hashResult.area.lng, hashResult.area.zoom);
        if (hashResult.spotName && typeof handleSpotInitial === 'function') {
            handleSpotInitial(hashResult.spotName, hashResult.area.name);
        }
    } else {
        drawMap(data.main.lat, data.main.lng, data.main.zoom);
    }

    return data;
}