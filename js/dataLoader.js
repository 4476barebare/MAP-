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
        window.map.attributionControl.setPosition('topright');

        window.currentTileLayer =
    L.tileLayer(tileUrl, {
        attribution: '© 国土地理院',
        keepBuffer: 8
    }).addTo(window.map);
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
    disableAreaSwipe(); // ★ここ追加
    window.map.off('move');
    window.map.setMaxBounds(null);

    drawLocation(selectName, spotLat, spotLng, 13);

    if (window.markerControl) {
        markerControl.clearShop01();
        markerControl.clearShop02();
    }

    // ★ここだけ変更
    const areaKey = window.currentAreaId;

    if (window.markerControl) {
        markerControl.showShop02(areaKey);
    }

    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    if (window.currentTileLayer) {
        window.map.removeLayer(window.currentTileLayer);
    }

    window.currentTileLayer =
        L.tileLayer(tileUrl, {
            attribution: '© OpenStreetMap contributors',
            keepBuffer: 8,
            updateWhenIdle: true
        }).addTo(window.map);

    window.map.once('moveend', () => {
        enableDragForArea();
    });
}

function enableDragForArea() {
    if (!window.areaBounds) return;

    window.map.dragging.enable();
    window.map.setMaxBounds(window.areaBounds);
    window.map.options.maxBoundsViscosity = 1.0;
}

function goBack(hash) {

    // -----------------------
    // map制御リセット
    // -----------------------
    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;

    window.areaBounds = null;

    // スポット系レイヤー削除
    resetSpotLayers();

    // -----------------------
    // 現在hash取得
    // -----------------------
    hash = hash || window.currentHash || '';

    const parts = decodeURIComponent(hash.replace(/^#/, '')).split('/');
    const areaName = parts[0];
    const spotName = parts[1];

    // -----------------------
    // spot → areaへ戻る
    // -----------------------
if (spotName) {
    stopZoomGuard();

    const rawAreaName = decodeURIComponent(areaName || '').trim();

    const area = window.areaData.find(
        a => (a.name || '').trim() === rawAreaName
    );

    if (!area) return;

    // ★ハッシュ修正
    const newHash = encodeURIComponent(area.name);
    history.replaceState(null, '', '#' + newHash);
    window.currentHash = '#' + newHash;

    // ★ここ重要：地図状態リセット
    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;

    window.map.dragging.enable();
    window.map.scrollWheelZoom.disable(); // ←pref仕様に合わせる
    window.map.doubleClickZoom.disable();
    window.map.touchZoom.disable();



    // ★再描画
    selectArea(area.name);
    return;
}

    // -----------------------
    // area → prefへ戻る（県画面）
    // -----------------------
    if (areaName) {

        // 県中心へ戻す
        drawLocation(
            window.prefData.name,
            window.prefData.lat,
            window.prefData.lng,
            window.prefData.zoom
        );

        // hashリセット
        location.hash = '';
        // ★状態は必ずURLから再構築
        updateStateFromHash();

        // 県用スポット表示
        showPrefSpots();
        
        window.map.invalidateSize(true);
        
        document.getElementById('map-back-btn').style.display = 'none';
        initAreaUI();

        return;
    }

}




window.selectArea = selectArea;
window.selectSpot = selectSpot;
window.goBack = goBack;
window.drawLocation = drawLocation;
window.loadLocationCSV = loadLocationCSV;

function showSpotsForArea(areaKey) {

    // 既存マーカー削除
    window.map.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            window.map.removeLayer(layer);
        }
    });

    document.querySelectorAll('.spot-label').forEach(el => el.remove());

    window.spotMarkers = [];

    const spots = window.spotData.filter(s => s.areaId === areaKey);
    if (!spots.length) return;

    let minLat = 999, maxLat = -999;
    let minLng = 999, maxLng = -999;

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

marker.on('click', function () {

    const zoom = window.map.getZoom();

    // ★ phase判定（stateなし運用）
    const isPhase1 =
        window.currentAreaId &&
        zoom <= 12 &&
        !window.currentSpotId;

    if (isPhase1) {
        selectSpot(areaKey, spot.name, spot.lat, spot.lng);
    
        return;
    }

    // phase2
    if (isFish) {
        showFishPopup(marker, spot);
    } else {

        // ★ここでspotを安全化する（追加のみ）
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
    }
});


        marker.addTo(window.map);
        window.spotMarkers.push(marker);

        if (spot.lat < minLat) minLat = spot.lat;
        if (spot.lat > maxLat) maxLat = spot.lat;
        if (spot.lng < minLng) minLng = spot.lng;
        if (spot.lng > maxLng) maxLng = spot.lng;
    });

    const latSize = maxLat - minLat;
    const lngSize = maxLng - minLng;

    const latBuffer = Math.max(latSize * 0.2, 0.05);
    const lngBuffer = Math.max(lngSize * 0.2, 0.05);

    window.areaBounds = L.latLngBounds(
        [minLat - latBuffer, minLng - lngBuffer],
        [maxLat + latBuffer, maxLng + lngBuffer]
    );
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
    window.map.setView(
        [safeSpot.lat, safeSpot.lng],
        safeSpot.zoom || 15,
        { animate: true }
    );

    resetSpotLayers();

    // -----------------------
    // 安定後処理
    // -----------------------
    window.map.once('moveend', function () {

        const bounds = window.map.getBounds();
        const initialZoom = window.map.getZoom();

        // 範囲固定
        window.map.setMaxBounds(bounds);
        window.map.options.maxBoundsViscosity = 1.0;

        // ズーム制限
        window.map.setMinZoom(initialZoom);
        window.map.setMaxZoom(18);

        // 操作復帰
        window.map.dragging.enable();
        window.map.scrollWheelZoom.enable();
        window.map.doubleClickZoom.enable();
        window.map.touchZoom.enable();

        //showDebug("moveend fired");
    });

    // -----------------------
    // ★ズームガード（確実起動）
    // -----------------------
    setTimeout(() => {
        if (!window.map) return;

        window._zoomGuardBase = window.map.getZoom();
        window._zoomGuardActive = true;

        //showDebug("ZG START base=" + window._zoomGuardBase);
    }, 150);
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
