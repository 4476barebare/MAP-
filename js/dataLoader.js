window.selectArea = selectArea;
window.selectSpot = selectSpot;
window.goBack = goBack;
window.drawLocation = drawLocation;
window.loadLocationCSV = loadLocationCSV;
// グローバル
window.prefData = null;
window.areaData = [];
window.spotData = []
window.currentAreaId = null;
window.phase1Group = L.layerGroup().addTo(map);
window.phase2Group = L.layerGroup().addTo(map);

function loadLocationCSV(csvUrl) {

    function parseGrid(str) {
        if (!str) return { x: null, y: null };

        const x = str.match(/x\s*:\s*(-?\d+)/);
        const y = str.match(/y\s*:\s*(-?\d+)/);

        return {
            x: x ? parseInt(x[1]) : null,
            y: y ? parseInt(y[1]) : null
        };
    }

    return fetch(csvUrl)
        .then(r => r.text())
        .then(text => {

            const lines = text.trim().split('\n');

            let main = null;
            const areas = [];
            const spots = [];

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
                    squareX: null,
                    squareY: null
                };
            });

            allRows.forEach(row => {
                if (!row.areaId && row.name === window.currentPref) {
                    main = row;
                }
            });

            allRows.forEach(row => {
                if ((row.areaId || '').trim() === window.currentPref) {

                    if (row.url && row.url.includes('x:') && row.url.includes('y:')) {
                        const grid = parseGrid(row.url);
                        row.squareX = grid.x;
                        row.squareY = grid.y;
                    }

                    areas.push(row);
                }
            });

            allRows.forEach(row => {
                const icon = row.icon;
                if (!icon) return;

                if (icon === 'spot' || icon.startsWith('fish')) {
                    spots.push(row);
                }
            });

            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;

            buildAreaGraphFromGrid(areas);

            return { main, areas, spots };
        });
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
        zoom,
        zoomControl: false,
        scrollWheelZoom: false,
        dragging: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
    };

    const mapOptions = { ...defaultOptions, ...options };

    // 初回のみ生成
    if (!window.map) {

        window.map = L.map('lf-map', mapOptions);

        window.map.options.zoomSnap = 0.5;
        window.map.options.zoomDelta = 0.5;
        window.map.attributionControl.setPosition('topright');

        // ★初期はGSI固定（ここだけ）
        window.gsiLayer = L.tileLayer(
            'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg',
            {
                attribution: '© 国土地理院',
                keepBuffer: 8
            }
        ).addTo(window.map);
        
        if (window.currentAreaId === null) {
            showPrefSpots();
        }
        return;
    }

    window.map.flyTo([lat, lng], zoom, { duration: 0.5 });

    // UI制御だけ
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
}

function showPrefSpots() {

    if (window.prefSpotLayer) {
        window.map.removeLayer(window.prefSpotLayer);
    }

    window.prefSpotLayer = L.layerGroup();

    window.spotData.forEach(spot => {

        if (!spot.icon) return;

        let type = 'spot';

        if (spot.icon.startsWith('fish')) {
            const match = spot.icon.match(/fish\d+/);
            if (match) type = match[0];
        }

        const marker = L.marker([spot.lat, spot.lng], {
            icon: L.divIcon({
                className: '',
                html: `<div class="pref-dot ${type}"></div>`,
                iconSize: [5, 5],
                iconAnchor: [2.5, 2.5]
            }),
            interactive: false
        });

        window.prefSpotLayer.addLayer(marker);
    });

    window.prefSpotLayer.addTo(window.map);
}

function prefetchAround(area) {

    if (!window.map) return;

    // -------------------------
    // 防御（ここ重要）
    // -------------------------
    if (!area || typeof area !== 'object') return;
    if (area.lat == null || area.lng == null) return;
    if (isNaN(area.lat) || isNaN(area.lng)) return;

    const lat0 = Number(area.lat);
    const lng0 = Number(area.lng);

    const offsets = [
        [0, 0],
        [0.005, 0],
        [-0.005, 0],
        [0, 0.005],
        [0, -0.005]
    ];

    const bounds = window.map.getBounds();

    offsets.forEach(([dx, dy]) => {

        const lat = lat0 + dx;
        const lng = lng0 + dy;

        // 無効値ガード
        if (!isFinite(lat) || !isFinite(lng)) return;

        // Leaflet内部トリガー（キャッシュ目的）
        const temp = L.latLng(lat, lng);

        // 既存ロジック維持（安全呼び出し）
        window.map._getZoomSpan?.();

        // tileプリフェッチ目的
        window.map.panInsideBounds?.(bounds);
    });
}



function selectArea(area) {

    const areaObj = typeof area === 'string'
        ? window.areaData.find(a => a.name === area)
        : area;

    if (!areaObj) return;

    // -------------------------
    // phase2停止
    // -------------------------
    

    // -------------------------
    // レイヤー削除
    // -------------------------
    if (window.spotLayer) {
        window.map.removeLayer(window.spotLayer);
        window.spotLayer = null;
    }

    if (window.markerControl?.shop01Layer) {
        window.map.removeLayer(markerControl.shop01Layer);
        markerControl.shop01Layer = null;
    }

    if (window.prefSpotLayer) {
        window.map.removeLayer(window.prefSpotLayer);
        window.prefSpotLayer = null;
    }

    // -------------------------
    // prefetch
    // -------------------------
    prefetchAround(areaObj);

    // -------------------------
    // 地図移動
    // -------------------------
    drawLocation(
        areaObj.name,
        areaObj.lat,
        areaObj.lng,
        areaObj.zoom || window.prefData.zoom
    );
    
    saveMapState();

    // -------------------------
    // UI更新
    // -------------------------
    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('map-back-btn').style.display = 'block';

    // -------------------------
    // 移動後処理
    // -------------------------
    window.map.once('moveend', () => {
        window.map.invalidateSize(true);
        showSpotsForArea(window.currentAreaId);
        enableAreaSwipe();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                markerControl.showShop01(window.currentAreaId);
            });
        });
    });
    disablePhase2(window.map);
}

function saveMapState() {

    let tile = null;

    if (window.gsiLayer && window.map.hasLayer(window.gsiLayer)) {
        tile = window.gsiLayer;
    }

    window.mapStateSnapshot = {
        tileLayer: tile
    };
}


function showSpotsForArea(areaKey) {

    if (window.prefSpotLayer) {
        window.map.removeLayer(window.prefSpotLayer);
        window.prefSpotLayer = null;
    }

    if (!window.areaSpotLayer) {
        window.areaSpotLayer = L.layerGroup().addTo(window.map);
    } else {
        window.areaSpotLayer.clearLayers();
    }

    const spots = window.spotData.filter(s => s.areaId === areaKey);
    if (!spots.length) return;

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

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
                `
            }),
            zIndexOffset: isFish
                ? 600 + Math.floor(Math.random() * 50)
                : Math.floor(Math.random() * 500)
        });

        marker.on('click', function () {
            selectSpot({
                name: spot.name,
                lat: spot.lat,
                lng: spot.lng,
                zoom: spot.zoom,
                individualId: spot.individualId || spot.id || ''
            });
        });

        window.areaSpotLayer.addLayer(marker);

        minLat = Math.min(minLat, spot.lat);
        maxLat = Math.max(maxLat, spot.lat);
        minLng = Math.min(minLng, spot.lng);
        maxLng = Math.max(maxLng, spot.lng);
    });

    const latBuffer = Math.max((maxLat - minLat) * 0.2, 0.05);
    const lngBuffer = Math.max((maxLng - minLng) * 0.2, 0.05);

    window.areaBounds = L.latLngBounds(
        [minLat - latBuffer, minLng - lngBuffer],
        [maxLat + latBuffer, maxLng + lngBuffer]
    );
}


function selectSpot(spot) {

    const {
        name,
        lat,
        lng,
        zoom,
        individualId
    } = spot;

    const currentZoom = window.map.getZoom();

    if (currentZoom === 13) return;

    if (window.phase1Group) {
        window.phase1Group.clearLayers();
    }

    //drawLocation(name, lat, lng, 13);

    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    window.osmLayer = L.tileLayer(tileUrl, {
        attribution: '© OpenStreetMap contributors',
        keepBuffer: 8,
        updateWhenIdle: true
    }).addTo(window.map);

    if (window.markerControl) {
        markerControl.showShop02(window.currentAreaId);
    }

    disableAreaSwipe();

    drawLocation(name, lat, lng, 13);

// ① 移動完了後に制御をかける
window.map.once('moveend', () => {
    window.map.dragging.enable();
    window.map.scrollWheelZoom.enable();
    window.map.doubleClickZoom.enable();
    window.map.touchZoom.enable();
    window.map.setMaxBounds(window.areaBounds);
    window.map.options.maxBoundsViscosity = 1.0;
});

enablePhase2(map);

}

function enableDragForArea() {
    if (!window.areaBounds) return;

    window.map.dragging.enable();
    window.map.setMaxBounds(window.areaBounds);
    window.map.options.maxBoundsViscosity = 1.0;
}


let phase2Initialized = false;
let lastVisibleSet = new Set();

function enablePhase2(map) {

    showDebug("P2: enter");
    showDebug("P2: map exists=" + !!map);
    showDebug("P2: spotData=" + !!window.spotData);

    //if (map._phase2Handler) return;
    showDebug("ここまで");
    const runPhase2 = () => {

        showDebug("P2: runPhase2 fired");

        requestAnimationFrame(() => {

            const bounds = map.getBounds().pad(0.5);

            const visibleSpots = window.spotData.filter(s =>
                bounds.contains([s.lat, s.lng])
            );

            const spotTargets = visibleSpots.filter(s => s.icon === "spot");

            if (spotTargets.length > 0) {
                processSpotUtils(map, spotTargets, "prefetch");
                updateSpotMenu(spotTargets, map);
            }

            lastVisibleSet = new Set(visibleSpots.map(s => s.name));
        });
    };

    map._phase2Handler = runPhase2;

    map.on('dragend', runPhase2);
    map.on('dragend', () => showDebug("P2: dragend fired"));

    map.once('moveend', () => {
        showDebug("P2: moveend fired");
        runPhase2();
    });

    phase2Initialized = true;
}

function disablePhase2(map) {

    // -------------------------
    // イベント解除
    // -------------------------
    if (map._phase2Handler) {
        map.off('dragend', map._phase2Handler);
        map._phase2Handler = null;
    }

    // -------------------------
    // 状態リセット
    // -------------------------
    phase2Initialized = false;
    lastVisibleSet = new Set();

    // -------------------------
    // UIクリア（ここを統合）
    // -------------------------
    const menu = document.getElementById("map-menu");
    const ul = document.querySelector("#map-menu ul");

    if (menu) {
        menu.classList.remove("phase2-lock");
        menu.style.display = "none";
    }

    if (ul) {
        ul.innerHTML = "";
    }
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

        for (const s of targets) {

            const lat = s.lat;
            const lng = s.lng;

            const n = Math.pow(2, zoom);

            const tileX = Math.floor((lng + 180) / 360 * n);

            const latRad = lat * Math.PI / 180;
            const tileY = Math.floor(
                (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
            );

            // ★ここだけ変更（1枚 → 2×2）
            for (let dx = 0; dx <= 1; dx++) {
                for (let dy = 0; dy <= 1; dy++) {

                    const url = baseUrl
                        .replace('{x}', tileX + dx)
                        .replace('{y}', tileY + dy);

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

function updateSpotMenu(spots, map) {

    const menu = document.getElementById("map-menu");
    const ul = menu.querySelector("ul");
    if (!ul) return;

    menu.classList.add("phase2-lock");

    const MAX = 6;
    const center = map.getCenter();

    const existing = new Set(
        Array.from(ul.children).map(li => li.dataset.key)
    );

    const buffer = Array.from(ul.children).map(li => ({
        key: li.dataset.key,
        text: li.textContent,
        lat: +li.dataset.lat,
        lng: +li.dataset.lng,
        dist: (li.dataset.lat - center.lat) ** 2 + (li.dataset.lng - center.lng) ** 2
    }));

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

    while (buffer.length > MAX) {

        let far = 0;

        for (let i = 1; i < buffer.length; i++) {
            if (buffer[i].dist > buffer[far].dist) {
                far = i;
            }
        }

        buffer.splice(far, 1);
    }

    ul.innerHTML = buffer.map(i => `
        <li class="new-item"
            data-key="${i.key}"
            data-lat="${i.lat}"
            data-lng="${i.lng}">
            <span class="spot-text">${i.text}</span>
        </li>
    `).join("");

    if (buffer.length > 0) {
        menu.style.display = "block";
    }

    // -------------------------
    // ここで統合クリック
    // -------------------------
    ul.onclick = (e) => {
        const text = e.target.closest(".spot-text");
        if (!text) return;

        const li = text.closest("li");

        window.map.flyTo(
            [Number(li.dataset.lat), Number(li.dataset.lng)],
            13,
            { animate: true, duration: 0.6 }
        );
    };

    requestAnimationFrame(() => {
        ul.querySelectorAll("li.new-item")
            .forEach(el => el.classList.add("show"));
    });
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

    // -------------------------
    // Phase2停止
    // -------------------------
    disablePhase2(window.map);

    // -------------------------
    // GSIレイヤー（使い回し）
    // -------------------------
    if (!window.gsiPhotoLayer) {
        window.gsiPhotoLayer = L.tileLayer(
            'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
            {
                attribution: '国土地理院'
            }
        );
    }

    if (window.currentTileLayer) {
        window.map.removeLayer(window.currentTileLayer);
    }

    window.currentTileLayer = window.gsiPhotoLayer.addTo(window.map);

    // -------------------------
    // 操作ロック
    // -------------------------
    window.map.dragging.disable();
    window.map.scrollWheelZoom.disable();
    window.map.doubleClickZoom.disable();
    window.map.touchZoom.disable();

    // -------------------------
    // 移動
    // -------------------------
    drawLocation(
        safeSpot.name,
        safeSpot.lat,
        safeSpot.lng,
        safeSpot.zoom
    );

    resetSpotLayers();

    // -------------------------
    // 復帰処理
    // -------------------------
    window.map.once('moveend', function () {

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
    });
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

function goBack() {


    const area = window.areaData.find(a =>
        String(a.individualId) === String(window.currentAreaId?.split('_')[1])
    );

    if (!area) return;

    // =====================================================
    // spot → area
    // =====================================================
    if (window.currentSpotId) {

        const spotKey = window.currentSpotId.split('_')[2];

        const spot = window.spotData.find(
            s =>
                String(s.individualId) === String(spotKey) &&
                String(s.areaId) === String(window.currentAreaId)
        );

        if (!spot) return;

        window.map.dragging.enable();
        window.map.scrollWheelZoom.disable();
        window.map.doubleClickZoom.disable();
        window.map.touchZoom.disable();

        showSpotsForArea(window.currentAreaId);

        location.hash = location.hash.replace('/' + spotKey, '');
        updateStateFromHash();

        // ★ここはそのまま維持
        selectSpot(area.name, spot.name, spot.lat, spot.lng);
        return;
    }

    // =====================================================
    // area → pref
    // =====================================================
    
if (window.phase1Group) {
    window.phase1Group.clearLayers();
}

// エリアマーカーも再利用前提
if (window.areaSpotLayer) {
    window.areaSpotLayer.clearLayers();
}


    const z = window.map.getZoom();

    if (z >= 12.8) {
        
        const s = window.mapStateSnapshot;
        
      window.map.setMinZoom(0);
window.map.setMaxZoom(18); // 元の値に合わせろ

window.map.setMaxBounds(null);
window.map.options.maxBoundsViscosity = 0;
        
        if (window.phase2Group) {
            window.phase2Group.clearLayers();
        }
        if (window.phase1Group) {
            window.phase1Group.addTo(window.map);
        }


if (s && s.tileLayer) {

    s.tileLayer.addTo(window.map);

    window.map.setView(
        [area.lat, area.lng],
        area.zoom || window.prefData.zoom
    );

} else {
    alert("保存されてない");
    selectArea(area);
}
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