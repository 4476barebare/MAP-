// グローバル
window.prefData = null;
window.areaData = [];
window.spotData = [];
window.currentHash = '';
window.currentAreaId = null;
//window.currentPhase = 'pref'; // pref / area / spot

function loadLocationCSV(csvUrl) {
    return fetch(csvUrl)
        .then(r => r.text())
        .then(text => {

            const lines = text.trim().split('\n');

            let main = null;
            const areas = [];
            const spots = [];

            // -----------------------
            // 全行パース（ここでは純データのみ）
            // -----------------------
            const allRows = lines.slice(1).map(line => {
                const cols = line.split(',');

                return {
                    name: cols[0].trim(),
                    zoom: parseFloat(cols[1]),
                    individualId: cols[2] ? cols[2].trim() : '',
                    lat: parseFloat(cols[3]),
                    lng: parseFloat(cols[4]),
                    areaId: cols[5] ? cols[5].trim() : '',
                    url: cols[6] ? cols[6].trim() : '',
                    notes: cols[7] ? cols[7].trim() : '',
                    icon: cols[8] ? cols[8].trim().toLowerCase() : null,

                    // 初期値（ここでは触らない）
                    squareX: null,
                    squareY: null
                };
            });

            // -----------------------
            // main（県）
            // -----------------------
            allRows.forEach(row => {
                if (!row.areaId && row.name === window.currentPref) {
                    main = row;
                }
            });

            // -----------------------
            // areas（←ここだけgrid処理）
            // -----------------------
            allRows.forEach(row => {

                if ((row.areaId || '').trim() === window.currentPref) {

                    // grid解析（エリアだけ）
                    if (row.url && row.url.includes('x:') && row.url.includes('y:')) {
                        const grid = parseGrid(row.url);
                        row.squareX = grid.x;
                        row.squareY = grid.y;
                    }

                    areas.push(row);
                }
            });

            // -----------------------
            // spots
            // -----------------------
            allRows.forEach(row => {
                const icon = row.icon;
                if (!icon) return;

                if (icon === 'spot' || icon.startsWith('fish')) {
                    spots.push(row);
                }
            });

            // -----------------------
            // セット
            // -----------------------
            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;

            // -----------------------
            // グラフ生成
            // -----------------------
            buildAreaGraphFromGrid(areas);

            return { main, areas, spots };
        });
}

function parseGrid(str) {
    if (!str) return { x: null, y: null };

    const x = str.match(/x\s*:\s*(-?\d+)/);
    const y = str.match(/y\s*:\s*(-?\d+)/);

    return {
        x: x ? parseInt(x[1]) : null,
        y: y ? parseInt(y[1]) : null
    };
}

function buildAreaGraphFromGrid(areas) {

    const gridMap = {};
    const graph = {};

    // 座標 → エリア
    areas.forEach(row => {
        if (row.squareX == null || row.squareY == null) return;
        gridMap[row.squareX + "," + row.squareY] = row;
    });

    // 隣接構築
    areas.forEach(row => {

        if (row.squareX == null || row.squareY == null) return;

        const x = row.squareX;
        const y = row.squareY;

        graph[row.name] = {
            up:    gridMap[x + "," + (y-1)]?.name || null,
            down:  gridMap[x + "," + (y+1)]?.name || null,
            left:  gridMap[(x-1) + "," + y]?.name || null,
            right: gridMap[(x+1) + "," + y]?.name || null
        };
    });

    // ★これが無かった
    window.areaGraph = graph;
}


function enableAreaSwipe() {

    if (window._areaSwipeEnabled) return;

    let startX = 0;
    let startY = 0;

    const el = window.map.getContainer();

    function onStart(e) {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
    }

    function onEnd(e) {

        const t = e.changedTouches[0];

        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        if (Math.abs(dx) < 50 && Math.abs(dy) < 50) return;

        const id = window.currentAreaId?.split('_')[1];

        const currentArea = window.areaData.find(a =>
            String(a.individualId) === String(id)
        );

        if (!currentArea) return;

        const graph = window.areaGraph[currentArea.name];
        if (!graph) return;

        let nextName = null;

        if (Math.abs(dx) > Math.abs(dy)) {
            nextName = dx > 0 ? graph.left : graph.right;
        } else {
            nextName = dy > 0 ? graph.down : graph.up;
        }

        if (!nextName) return;

        const nextArea = window.areaData.find(a => a.name === nextName);
        if (!nextArea) return;

        disableAreaSwipe();
        
        // ★ここが重要（順番固定）
        location.hash = '#' + encodeURIComponent(nextArea.name);
        updateStateFromHash();
        
        window.map.setMaxBounds(null);
        window.map.options.maxBoundsViscosity = 0;
        window.areaBounds = null;
        
        selectArea(nextArea.name);
        
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });

    window._areaSwipeStart = onStart;
    window._areaSwipeEnd = onEnd;

    window._areaSwipeEnabled = true;
}


function disableAreaSwipe() {

    if (!window._areaSwipeEnabled) return;

    const el = window.map.getContainer();

    el.removeEventListener('touchstart', window._areaSwipeStart);
    el.removeEventListener('touchend', window._areaSwipeEnd);

    window._areaSwipeEnabled = false;
}

function drawLocation(name, lat, lng, zoom, options = {}) {
    const defaultOptions = {
        center: [lat, lng],
        zoom: zoom,
        zoomControl: false,
        scrollWheelZoom: false,
        dragging: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        //tap: false,
        touchZoom: false,
    };
    
    //window.baseZoom = zoom;

    const mapOptions = { ...defaultOptions, ...options };

    const tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg';

    if (window.map) {
        window.map.flyTo([lat, lng], zoom, { duration: 0.5 });

        if (window.currentTileLayer) {
            window.map.removeLayer(window.currentTileLayer);
        }

        window.currentTileLayer =
    L.tileLayer(tileUrl, {
        attribution: '© 国土地理院',
        keepBuffer: 8
    }).addTo(window.map);

        mapOptions.scrollWheelZoom
            ? window.map.scrollWheelZoom.enable()
            : window.map.scrollWheelZoom.disable();

        mapOptions.dragging
            ? window.map.dragging.enable()
            : window.map.dragging.disable();

        mapOptions.doubleClickZoom
            ? window.map.doubleClickZoom.enable()
            : window.map.doubleClickZoom.disable();

        mapOptions.boxZoom
            ? window.map.boxZoom.enable()
            : window.map.boxZoom.disable();

        mapOptions.keyboard
            ? window.map.keyboard.enable()
            : window.map.keyboard.disable();

        mapOptions.touchZoom
            ? window.map.touchZoom.enable()
            : window.map.touchZoom.disable();

        if (window.map.tap) {
            mapOptions.tap
                ? window.map.tap.enable()
                : window.map.tap.disable();
        }
    } else {
        window.map = L.map('lf-map', mapOptions);
        window.map.options.zoomSnap = 0.5;
        window.map.options.zoomDelta = 0.5;
        window.map.attributionControl.setPosition('topright');

if (!window.currentTileLayer) {
    window.currentTileLayer = L.tileLayer(tileUrl, {
        attribution: '© 国土地理院',
        keepBuffer: 8
    }).addTo(window.map);
}
    }


    window.currentHash = location.hash;

    if (!window.currentAreaId) {
        showPrefSpots();
    }
}




function prefetchAround(area) {

    if (!window.map) return;

    const offsets = [
        [0, 0],
        [0.005, 0],
        [-0.005, 0],
        [0, 0.005],
        [0, -0.005]
    ];

    offsets.forEach(([dx, dy]) => {

        const lat = area.lat + dx;
        const lng = area.lng + dy;

        // ★ viewは動かさない（重要）
        const temp = L.latLng(lat, lng);

        window.map._getZoomSpan?.(); // 何もしない安全呼び出し

        // tileだけ裏で発火させる（実質キャッシュ目的）
        window.map.panInsideBounds?.(window.map.getBounds());
    });
}

function selectArea(areaName) {

    if (window.spotLayer) {
        window.map.removeLayer(window.spotLayer);
        window.spotLayer = null;
    }

    if (window.markerControl && markerControl.shop01Layer) {
        window.map.removeLayer(markerControl.shop01Layer);
        markerControl.shop01Layer = null;
    }

    const area = window.areaData.find(a => a.name === areaName);
    if (!area) return;

    if (window.prefSpotLayer) {
        window.map.removeLayer(window.prefSpotLayer);
        window.prefSpotLayer = null;
    }

    const reqId = Date.now();
    window._shop01RequestId = reqId;
    
    prefetchAround(area);

    drawLocation(
        area.name,
        area.lat,
        area.lng,
        area.zoom || window.prefData.zoom
    );

    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('map-back-btn').style.display = 'block';



    window.map.once('moveend', () => {
        
        window.map.invalidateSize(true);
        enableDragForArea();

        showSpotsForArea(window.currentAreaId);
        
        enableAreaSwipe(); // ←これ追加

        if (window._shop01RequestId !== reqId) return;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                markerControl.showShop01(window.currentAreaId);
            });
        });
    });
}

function selectSpot(areaName, selectName, spotLat, spotLng) {
    
    disablePhase2(window.map);
    
    disableAreaSwipe();
    window.map.off('move');
    window.map.setMaxBounds(null);

    drawLocation(selectName, spotLat, spotLng, 13);

    if (window.markerControl) {
        markerControl.clearShop01();
        markerControl.clearShop02();
    }

    const areaKey = window.currentAreaId;

    if (window.markerControl) {
        markerControl.showShop02(areaKey);
    }

    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    if (window.currentTileLayer) {
        window.map.removeLayer(window.currentTileLayer);
    }

    window.currentTileLayer = L.tileLayer(tileUrl, {
        attribution: '© OpenStreetMap contributors',
        keepBuffer: 8,
        updateWhenIdle: true
    }).addTo(window.map);

    // 通常のmoveend（これは残す）
    window.map.once('moveend', () => {
        enableDragForArea();
    });

    enablePhase2(window.map);
}

function enableDragForArea() {
    if (!window.areaBounds) return;

    window.map.dragging.enable();
    window.map.setMaxBounds(window.areaBounds);
    window.map.options.maxBoundsViscosity = 1.0;
}

function goBack() {

    // -----------------------
    // mapリセット
    // -----------------------
    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;
    window.areaBounds = null;

    resetSpotLayers();

    const areaId = window.currentAreaId;
    const spotId = window.currentSpotId;

    const rawId = areaId.split('_')[1];

    const area = window.areaData.find(
        a => String(a.individualId) === rawId
    );

    if (!area) return;

    // =====================================================
    // spot → area
    // =====================================================
    if (spotId) {

        const spotKey = spotId.split('_')[2];

        const spot = window.spotData.find(
            s =>
                String(s.individualId) === String(spotKey) &&
                String(s.areaId) === String(areaId)
        );

        if (!spot) return;

        const spotName = spot.name;

        // map状態復帰（areaモード）
        window.map.dragging.enable();
        window.map.scrollWheelZoom.disable();
        window.map.doubleClickZoom.disable();
        window.map.touchZoom.disable();

        enableDragForArea();
        showSpotsForArea(window.currentAreaId);
        // URLからspot削除 → state再同期
        location.hash = location.hash.replace('/' + spotKey, '');
        updateStateFromHash();
    
        // spot復帰描画
        selectSpot(area.name, spotName, spot.lat, spot.lng);
        return;
    }

    // =====================================================
    // area → pref
    // =====================================================
    const z = window.map.getZoom();

    if (z >= 12.8) {
        selectArea(area.name);
        return;
    }

    drawLocation(
        window.prefData.name,
        window.prefData.lat,
        window.prefData.lng,
        window.prefData.zoom
    );

    window.currentAreaId = null;
    window.currentSpotId = null;

    location.hash = '';
    showPrefSpots();

    window.map.invalidateSize(true);

    document.getElementById('map-back-btn').style.display = 'none';
    initAreaUI();
}

window.selectArea = selectArea;
window.selectSpot = selectSpot;
window.goBack = goBack;
window.drawLocation = drawLocation;
window.loadLocationCSV = loadLocationCSV;

function showSpotsForArea(areaKey) {

    // =========================
    // 初期化
    // =========================

    // 既存マーカー削除
    window.map.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            window.map.removeLayer(layer);
        }
    });

    // ラベルDOM削除
    document.querySelectorAll('.spot-label').forEach(el => el.remove());

    // 状態リセット
    window.spotMarkers = [];
    window.markerMap = new Map();

    const spots = window.spotData.filter(s => s.areaId === areaKey);
    if (!spots.length) return;

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    // =========================
    // マーカー生成
    // =========================

    spots.forEach(spot => {

        const iconId = spot.icon || 'spot';
        const isFish = iconId.startsWith('fish');

        const marker = L.marker([spot.lat, spot.lng], {
            icon: L.divIcon({
                className: '',
                html: `
                    <div class="spot-label ${iconId}">
                        <svg width="16" height="16">
                            <use href="/MAP-/icon/sprite.svg#icon-${iconId}"></use>
                        </svg>
                        <span>${spot.name}</span>
                    </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            }),
            zIndexOffset: isFish
                ? 600 + Math.floor(Math.random() * 50)
                : Math.floor(Math.random() * 500)
        });

        // =========================
        // クリック処理
        // =========================

        marker.on('click', function () {

            const zoom = window.map.getZoom();

            const isPhase1 =
                window.currentAreaId &&
                zoom <= 12 &&
                !window.currentSpotId;

            if (isPhase1) {
                selectSpot(areaKey, spot.name, spot.lat, spot.lng);
                return;
            }
            if (isFish) {
                showFishPopup(marker, spot);
                return;
            }

            const safeSpot = {
                name: spot.name,
                lat: spot.lat,
                lng: spot.lng,
                zoom: spot.zoom,
                individualId: spot.individualId || spot.id || ''
            };

            location.hash += '/' + safeSpot.individualId;
            updateStateFromHash();

            zoomToSpot(safeSpot);
        });

        // =========================
        // map追加 & 管理登録
        // =========================

        marker.addTo(window.map);

        window.spotMarkers.push(marker);
        window.markerMap.set(spot.id, marker);

        // 初期状態（必要なら）

        // =========================
        // バウンディング計算
        // =========================

        minLat = Math.min(minLat, spot.lat);
        maxLat = Math.max(maxLat, spot.lat);
        minLng = Math.min(minLng, spot.lng);
        maxLng = Math.max(maxLng, spot.lng);
        
    });

    // =========================
    // エリアバウンス設定
    // =========================

    const latSize = maxLat - minLat;
    const lngSize = maxLng - minLng;

    const latBuffer = Math.max(latSize * 0.2, 0.05);
    const lngBuffer = Math.max(lngSize * 0.2, 0.05);

    window.areaBounds = L.latLngBounds(
        [minLat - latBuffer, minLng - lngBuffer],
        [maxLat + latBuffer, maxLng + lngBuffer]
    );
}


let phase2Initialized = false;

function enablePhase2(map) {

    if (map._phase2Handler) return;

    lastVisibleSet = new Set();
    phase2Initialized = false;

    map._phase2Handler = function () {
        updatePhase2NearestSpot(map, window.spotData, window.markerMap);
    };

    map.on('dragend', map._phase2Handler);

    // -------------------------
    // 初回強制実行
    // -------------------------
 // -------------------------
    // ★初回は moveend 後に実行
    // -------------------------
    if (!phase2Initialized) {
        phase2Initialized = true;

        map.once('moveend', function () {
            clearSpotMenu();
            updatePhase2NearestSpot(map, window.spotData, window.markerMap);
        });
    }

}

function disablePhase2(map) {

    if (!map._phase2Handler) return;

    map.off('dragend', map._phase2Handler); // ←ここ修正

    map._phase2Handler = null;

    phase2Initialized = false;

    lastVisibleSet = new Set();
}


let lastVisibleSet = new Set();

function updatePhase2NearestSpot(map, spots, markerMap) {

    // =========================================================
    // ■視界取得
    // =========================================================
    const bounds = map.getBounds();

    const visibleSpots = spots.filter(s =>
        bounds.contains([s.lat, s.lng])
    );

    const currentVisible = new Set(
        visibleSpots.map(s => s.name)
    );

    // =========================================================
    // ■差分検出（新規出現スポット）
    // =========================================================
    const entered = [];

    for (const name of currentVisible) {
        if (!lastVisibleSet.has(name)) {
            entered.push(name);
        }
    }

    // =========================================================
    // ■新規スポットがある場合のみ処理
    // =========================================================
    if (entered.length > 0) {

        const enteredSpots = visibleSpots.filter(s =>
            entered.includes(s.name)
        );

        const spotTargets = enteredSpots.filter(s => s.icon === "spot");
        const otherTargets = enteredSpots.filter(s => s.icon !== "spot");

        // =====================================================
        // ■spot処理（タイルプリフェッチ + メニュー更新）
        // =====================================================
        if (spotTargets.length > 0) {

            // タイルプリフェッチ
            processSpotUtils(map, spotTargets, "prefetch");
            updateSpotMenu(spotTargets, map);
        }

        // =====================================================
        // ■その他処理（未使用）
        // =====================================================
        if (otherTargets.length > 0) {
            // 必要ならここに追加
        }
    }

    // =========================================================
    // ■状態更新
    // =========================================================
    lastVisibleSet = currentVisible;

    return null;
}

function processSpotUtils(map, spots, mode) {

    if (mode === "prefetch") {

        if (!map || !spots || !spots.length) return;

        const zoom = map.getZoom();

        const targets = spots.filter(s => s.icon === "spot");
        if (!targets.length) return;

        const baseUrl =
            'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/' +
            zoom + '/{x}/{y}.jpg';

        const tileSize = 256;

        for (const s of targets) {

            const point = map.project([s.lat, s.lng], zoom);

            const tileX = Math.floor(point.x / tileSize);
            const tileY = Math.floor(point.y / tileSize);

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {

                    const x = tileX + dx;
                    const y = tileY + dy;

                    const url = baseUrl
                        .replace('{x}', x)
                        .replace('{y}', y);

                    // ★ここが本体（強制キャッシュ）
                    const img = new Image();
                    img.src = url;
                }
            }
        }
    }

    if (mode === "bounds") {

        const buffer = 0.002;
        const boundsList = [];

        for (const s of spots) {
            boundsList.push(
                L.latLngBounds(
                    [s.lat - buffer, s.lng - buffer],
                    [s.lat + buffer, s.lng + buffer]
                )
            );
        }

        return boundsList;
    }
}

let spotMenuClickEnabled = true;

function updateSpotMenu(spots, map) {

    const menu = document.getElementById("map-menu");
    const ul = document.querySelector("#map-menu ul");

    if (!ul) return;

    const MAX = 6;
    const center = map.getCenter();

    // =========================
    // 既存DOMから状態取得
    // =========================
    const existing = new Set(
        Array.from(ul.children).map(li => li.dataset.key)
    );

    const buffer = Array.from(ul.children).map(li => ({
        key: li.dataset.key,
        text: li.textContent,
        lat: +li.dataset.lat,
        lng: +li.dataset.lng
    }));

    // =========================
    // 新規追加
    // =========================
    for (const s of spots) {

        const key = s.id || s.name;

        if (existing.has(key)) continue;

        buffer.push({
            key,
            text: s.name,
            lat: s.lat,
            lng: s.lng,
            dist: (s.lat - center.lat) ** 2 + (s.lng - center.lng) ** 2
        });
    }

    // =========================
    // 遠い順削除
    // =========================
    while (buffer.length > MAX) {

        let far = 0;

        for (let i = 1; i < buffer.length; i++) {
            if (buffer[i].dist > buffer[far].dist) {
                far = i;
            }
        }

        buffer.splice(far, 1);
    }

    // =========================
    // 描画
    // =========================
    ul.innerHTML = buffer
        .map(i => `
            <li 
                class="new-item"
                data-key="${i.key}" 
                data-lat="${i.lat}" 
                data-lng="${i.lng}"
            >
                ${i.text}
            </li>
        `)
        .join("");

    // =========================
    // 表示制御
    // =========================
    if (buffer.length > 0) {
        menu.style.display = "block";
    }

    // =========================
    // アニメーション
    // =========================
    requestAnimationFrame(() => {
        document.querySelectorAll("#map-menu li.new-item")
            .forEach(el => el.classList.add("show"));
    });
}

// =========================
// クリック処理（追加）
// =========================
document.getElementById("map-menu").addEventListener("click", (e) => {

    if (!spotMenuClickEnabled) return;

    const li = e.target.closest("li");
    if (!li) return;

    const lat = parseFloat(li.dataset.lat);
    const lng = parseFloat(li.dataset.lng);

    if (!lat || !lng) return;

    window.map.flyTo([lat, lng], 16, {
        animate: true,
        duration: 0.6
    });
});


function clearSpotMenu() {

    const menu = document.getElementById("map-menu");
    const ul = document.querySelector("#map-menu ul");

    if (ul) ul.innerHTML = "";
    if (menu) menu.style.display = "none";
}

function createPrefSpotLayer() {
    if (window.prefSpotLayer) return;

    const layer = L.layerGroup();

    window.spotData.forEach(spot => {
        if (!spot.icon) return;

        let type = 'spot';

        if (spot.icon.startsWith('fish')) {
            const match = spot.icon.match(/fish\d+/);
            if (match) type = match[0];
        }

        const html = `<div class="pref-dot ${type}"></div>`;

        const marker = L.marker(
            [spot.lat, spot.lng],
            {
                icon: L.divIcon({
                    className: '',
                    html: html,
                    iconSize: [5, 5],
                    iconAnchor: [2.5, 2.5]
                }),
                interactive: false
            }
        );

        layer.addLayer(marker);
    });

    window.prefSpotLayer = layer;
}

function showPrefSpots() {
    createPrefSpotLayer();

    if (!window.map.hasLayer(window.prefSpotLayer)) {
        window.prefSpotLayer.addTo(window.map);
    }
}


function showFishPopup(marker, spot) {

    const googleUrl =
        'https://www.google.com/search?q=' +
        encodeURIComponent(spot.name);


const popupHtml = `
    <div class="shop-popup">
        <div class="shop-popup-title"></div>
        <div class="shop-popup-address dummy">${spot.notes || ''}</div>

        <div class="shop-popup-footer">
            <a class="shop-popup-btn" href="${googleUrl}" target="_blank">
                Googleで検索
            </a>
        </div>
    </div>
`;



    // ★ここが本質
    marker.closePopup();
    marker.unbindPopup();

    marker.bindPopup(popupHtml, {
        offset: [0, 0] // 必要なら微調整
    }).openPopup();
}



function zoomToSpot(safeSpot) {
    clearSpotMenu();
    
    disablePhase2(window.map);

    window._spotZoomLock = true;
    window.phase2DetectionEnabled = false;

    disablePhase2(window.map);
    switchToGSIPhoto();

    // -----------------------
    // 操作ロック
    // -----------------------
    window.map.dragging.disable();
    window.map.scrollWheelZoom.disable();
    window.map.doubleClickZoom.disable();
    window.map.touchZoom.disable();

    // -----------------------
    // 移動
    // -----------------------
    drawLocation(
        safeSpot.name,
        safeSpot.lat,
        safeSpot.lng,
        safeSpot.zoom
    );


    resetSpotLayers();

    // -----------------------
    // 安定後処理
    // -----------------------
    window.map.once('moveend', function () {

        // ★ zoomはsafeSpot.zoomをそのまま使用（再取得禁止）
        window.map.setMinZoom(safeSpot.zoom);
        window.map.setMaxZoom(18);

        const bounds = window.map.getBounds();
        window.map.setMaxBounds(bounds);
        window.map.options.maxBoundsViscosity = 1.0;

        window._zoomGuardBase = safeSpot.zoom;
        window._zoomGuardActive = true;

        window.map.dragging.enable();
        window.map.scrollWheelZoom.enable();
        window.map.doubleClickZoom.enable();
        window.map.touchZoom.enable();

        window._spotZoomLock = false;
        window.phase2DetectionEnabled = true;
    });
}


window.gsiPhotoLayer = L.tileLayer(
    'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    {
        attribution: '国土地理院'
    }
);

function switchToGSIPhoto() {
    if (window.currentTileLayer) {
        window.map.removeLayer(window.currentTileLayer);
    }

    window.currentTileLayer = window.gsiPhotoLayer.addTo(window.map);
}


function resetSpotLayers() {

    if (window.markerControl) {
        markerControl.clearShop01();
        markerControl.clearShop02();
    }

    if (window.spotMarkers) {
        window.spotMarkers.forEach(m => window.map.removeLayer(m));
        window.spotMarkers = [];
    }

    if (window.prefSpotLayer && window.map.hasLayer(window.prefSpotLayer)) {
        window.map.removeLayer(window.prefSpotLayer);
    }
}

function updateStateFromHash() {

    const hash = decodeURIComponent(location.hash.replace('#', ''));
    const parts = hash.split('/');

    const areaName = parts[0] || null;
    const spotKey = parts[1] || null;

    let resolvedAreaId = null;

    if (areaName) {
        const area = window.areaData.find(a => a.name === areaName);
        if (area) {
            resolvedAreaId =
                window.currentPref + "_" + area.individualId;
        }
    }

    if (!areaName) {
        window.currentAreaId = null;
        window.currentSpotId = null;
    }
    else if (areaName && !spotKey) {
        window.currentAreaId = resolvedAreaId;
        window.currentSpotId = null;
    }
    else if (areaName && spotKey) {
        window.currentAreaId = resolvedAreaId;
        window.currentSpotId = resolvedAreaId + "_" + spotKey;
    }
}
