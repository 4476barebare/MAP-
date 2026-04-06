// dataLoader.js

// グローバル変数
window.prefData = null;  // 選択された県本体
window.areaData = [];    // 選択県直下のエリア
window.spotData = [];    // 選択県直下のスポット

/**
 * CSV読み込み関数
 * @param {string} csvUrl - CSVファイルURL
 * @param {string} currentFile - 現在のHTMLファイル名
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
                } else if (parent && parent.toUpperCase() === filePref) {
                    spots.push(obj);
                }
            }

            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;

            alert("CSVロード完了: " + main.name);

            return { main, areas, spots };
        })
        .catch(err => { alert("CSV読み込みエラー: " + err); });
}

/**
 * 初期マップ描画
 */
function drawMap(lat, lng, zoom) {
    if (!window.map) {
        window.map = L.map('lf-map', {
            center: [lat, lng],
            zoom: zoom,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            dragging: false,
            zoomControl: false
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
 */
function parseHash(data) {
    const hash = location.hash || '';
    if (!hash) return null;

    const [areaName, spotName] = decodeURIComponent(hash.substring(1)).split('/');
    const area = data.areas.find(a => a.name === areaName);
    if (!area) return null;

    return { area, spotName };
}

/**
 * 共通エリア選択処理
 */
function selectArea(area, fly = true) {
    if (!window.map) { alert("mapが未生成です"); return; }

    if (fly) {
        window.map.flyTo([area.lat, area.lng], area.zoom || window.prefData.zoom);
    } else {
        window.map.setView([area.lat, area.lng], area.zoom || window.prefData.zoom);
    }

    // メニュー非表示
    const menu = document.getElementById('map-menu');
    if (menu) menu.style.display = 'none';

    // ハッシュ更新
    location.hash = encodeURIComponent(area.name);
}

/**
 * 初期ロード処理
 */
function initMapFromCSV(csvUrl) {
    const currentFile = location.pathname.split('/').pop();
    loadLocationCSV(csvUrl, currentFile).then(data => {
        const hashResult = parseHash(data);
        if (hashResult) {
            drawMap(hashResult.area.lat, hashResult.area.lng, hashResult.area.zoom);
        } else {
            drawMap(window.prefData.lat, window.prefData.lng, window.prefData.zoom);
        }
    });
}

// グローバルに公開
window.initMapFromCSV = initMapFromCSV;
window.selectArea = selectArea;