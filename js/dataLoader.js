window.selectArea = selectArea;
window.selectSpot = selectSpot;
window.goBack = goBack;
window.drawLocation = drawLocation;
window.loadLocationCSV = loadLocationCSV;
//window._preparedFishAreas = window._preparedFishAreas || new Set();
// グローバル
window.prefData = null;
window.areaData = [];
window.spotData = []
window.currentAreaId = null;
window.gsiLayers = {
  ort: 'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg',
  photo: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'
};

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
                    whether: cols[9] ? cols[9].trim() : '',
                    type: cols[10] ? cols[10].trim() : '',
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

function prepareFishForArea(areaId) {

  const loadPromise = window.fishData
    ? Promise.resolve()
    : fetch(window.fishUrl)
        .then(res => {
          if (!res.ok) throw new Error("fetch失敗: " + res.status);
          return res.text();
        })
        .then(text => {
          const lines = text.trim().split('\n');
          const headers = lines[0].split(',');

          window.fishData = lines.slice(1).map(line => {
            const cols = line.split(',');
            const obj = {};
            headers.forEach((h, i) => obj[h] = cols[i]);

            obj.lat = parseFloat(obj.lat);
            obj.lng = parseFloat(obj.lng);

            return obj;
          });
        });

  return loadPromise.then(() => {
    if (!window.spotData) return [];
    const targetSpots = window.spotData.filter(
      s => s.areaId && s.areaId.trim() === areaId.trim()
    );
    const targetFish = window.fishData.filter(
      f => f.registration && f.registration.trim() === areaId.trim()
    );

    targetSpots.forEach(spot => {
      const fishList = targetFish
        .filter(f => f.parent && f.parent.trim() === spot.name.trim())
        .map(f => `${f.name}|${f.lat}|${f.lng}`);
        spot.URL = fishList.join(',');
    });

    return targetSpots;

  }).catch(err => {
    console.error(err);
    return [];
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

  if (!window.map) {

    window.map = L.map('lf-map', mapOptions);

    window.map.options.zoomSnap = 0.5;
    window.map.options.zoomDelta = 0.5;
    window.map.attributionControl.setPosition('topright');

    window.phase1Group = L.layerGroup().addTo(map);
    window.phase2Group = L.layerGroup().addTo(map);

    window.gsiLayer = L.tileLayer(
      window.gsiLayers.ort,
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
    prefetchAround(areaObj);
    
    drawLocation(
        areaObj.name,
        areaObj.lat,
        areaObj.lng,
        areaObj.zoom || window.prefData.zoom
    );
    
    

    // -------------------------
    // UI更新
    // -------------------------
    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('map-back-btn').style.display = 'block';
    prepareFishForArea(window.currentAreaId);

    // -------------------------
    // 移動後処理
    // -------------------------
    window.map.once('moveend', () => {
        window.map.invalidateSize(true);
        showSpotsForArea(window.currentAreaId);
        enableAreaSwipe();
        phase1menu(window.currentAreaId);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                markerControl.showShop01(window.currentAreaId);
            });
        });
    });
    
    //disablePhase2(window.map);
}

function saveMapState() {

    // GSIが存在して、かつ現在マップに載っているかだけを見る
    const isOrt = !!(window.gsiLayer && window.map.hasLayer(window.gsiLayer));

    window.mapStateSnapshot = {
        isOrt: isOrt
    };
}

function showSpotsForArea(areaKey) {

    if (window.prefSpotLayer) {
        window.map.removeLayer(window.prefSpotLayer);
        window.prefSpotLayer = null;
    }function saveMapState() {
    let tile = null;
    if (window.gsiLayer && window.map.hasLayer(window.gsiLayer)) {
        tile = window.gsiLayer;
    }
    window.mapStateSnapshot = {
        tileLayer: tile
    };
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
                            <use href="/icon/sprite.svg#icon-${iconId}"></use>
                        </svg>
                        <span>${spot.name}</span>
                    </div>
                `
            }),
            zIndexOffset: isFish
                ? 600 + Math.floor(Math.random() * 50)
                : Math.floor(Math.random() * 500)
        });
spot.marker = marker;


marker.on('click', function () {

//    const iconId = spot.icon || 'spot';
//    const isFish = iconId.startsWith('fish');

    selectSpot(spot); // ←これだけ
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

function phase1menu(areaId) {

    window.substitute = null;

    const menu = document.getElementById("map-menu");
    const ul = menu?.querySelector("ul");
    if (!ul || !window.spotData) return;

    const items = window.spotData
        .filter(s =>
            s.areaId === areaId &&
            (s.type === "representative" || s.type === "assistant")
        )
        .sort((a, b) => b.lat - a.lat);

    // -------------------------
    // ★補欠は1件だけ保持
    // -------------------------
    window.substitute = window.spotData.find(s =>
        s.areaId === areaId &&
        s.type === "substitute"
    ) || null;

    // -------------------------
    // ヘッダー（DOM化）
    // -------------------------
    const header = document.createElement("li");
    header.className = "menu-header-row";
    header.style.cssText = "pointer-events:none; padding:4px 8px;";

    const headerInner = document.createElement("div");
    headerInner.style.cssText = "display:flex; justify-content:flex-end; width:100%;";

    const headerText = document.createElement("div");
    headerText.textContent =
        `${formatDate(window.todayTide?.date)} ${window.todayTide?.tide}`;

    headerInner.appendChild(headerText);
    header.appendChild(headerInner);

    // -------------------------
    // リスト生成（完全DOM化）
    // -------------------------
    ul.innerHTML = ""; // 一旦クリア
    ul.appendChild(header);

    for (const s of items) {

        const li = createMenuItem(s);
        ul.appendChild(li);
    }

    menu.style.display = items.length ? "block" : "none";
}

function createMenuItem(s) {

    const li = document.createElement("li");
    li.dataset.key = s.id || s.name;

    const top = document.createElement("div");
    top.className = "row-top";
    top.textContent = s.name;

    const bottom = document.createElement("div");
    bottom.className = "pref-weather";

    if (!s.whether) {
        bottom.textContent = "no data";
    } else {

        const w = formatPrefWeather(s.whether);
        const icon = toWeatherIcon(w.icon);

        bottom.innerHTML = `
            <span>${icon}</span>
            <div style="width:12px">${w.temp}</div>
            <span style="font-size:8px;">°C 降水</span>
            <div style="width:12px">${w.pop}</div>
            <span style="font-size:8px;">%</span>
            <div style="width:12px">${w.wind}</div>
            <span style="font-size:8px;">m/s</span>
        `;
    }

    li.appendChild(top);
    li.appendChild(bottom);

    // -------------------------
    // ★ここでイベント付与
    // -------------------------
    li.addEventListener("click", () => {

        const spot = window.spotData.find(x =>
            (x.id || x.name) === li.dataset.key
        );

        if (!spot) return;

        selectSpot(spot);
    });

    return li;
}

function selectSpot(spot) {

    const currentZoom = window.map.getZoom();

    // ★ズーム13のみ分岐
    if (currentZoom === 13) {

        if (spot.icon === "spot") {
            zoomToSpot(spot);
        } else {
            showFishPopup(spot);
        }
        return;
    }

    if (window.markerControl) {
        markerControl.showShop02(window.currentAreaId);
    }

    saveMapState();

    if (window.phase1Group) {
        window.phase1Group.clearLayers();
    }

    window.osmLayer = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
            attribution: '© OpenStreetMap contributors',
            keepBuffer: 16,
            updateWhenIdle: true,
            updateWhenZooming: false,
            updateWhenDragging: false
        }
    ).addTo(window.map);

    disableAreaSwipe();

    drawLocation(spot.name, spot.lat, spot.lng, 13);

    window.map.once('moveend', () => {
        window.map.dragging.enable();
        window.map.setMaxBounds(window.areaBounds);
        window.map.options.maxBoundsViscosity = 1.0;
    });

    enablePhase2(window.map);
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

    let phase2Timer = null;

const runPhase2 = () => {

    clearTimeout(phase2Timer);

    phase2Timer = setTimeout(() => {
        processSpotUtils(map);
        showNearestSpotName(map);
    }, 80);
};

    map._phase2Handler = runPhase2;

    map.on('dragend', runPhase2);
    map.on('moveend', runPhase2);
    
    phase2Initialized = true;
}

function disablePhase2(map) {

    if (!map) return;

    if (map._phase2Handler) {
        map.off('dragend', map._phase2Handler);
        map.off('moveend', map._phase2Handler);
        map._phase2Handler = null;
    }

    window.phase2Initialized = false;
    window.lastVisibleSet = new Set();

    // UIは最小限だけ
    const menu = document.getElementById("map-menu");
    if (menu) {
        menu.classList.remove("phase2-lock");
        menu.style.display = "none";
    }
}

function processSpotUtils(map) {

    if (!map) return;

    const bounds = map.getBounds().pad(0.5);

    // -------------------------
    // 視界内スポット取得
    // -------------------------
    const visibleSpots = window.spotData.filter(s =>
        bounds.contains([s.lat, s.lng])
    );

    if (!visibleSpots.length) return;

    const zoom = map.getZoom();

    // ★ photo専用URL固定
    const baseUrl = window.gsiLayers.photo.replace('{z}', zoom);

    let tileCount = 0;

    for (const s of visibleSpots) {

        const n = Math.pow(2, zoom);

        const tileX = Math.floor((s.lng + 180) / 360 * n);

        const latRad = s.lat * Math.PI / 180;

        const tileY = Math.floor(
            (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
        );

        // -------------------------
        // 2x2プリロード
        // -------------------------
        for (let dx = 0; dx <= 1; dx++) {
            for (let dy = 0; dy <= 1; dy++) {

                const url = baseUrl
                    .replace('{x}', tileX + dx)
                    .replace('{y}', tileY + dy);

                const img = new Image();
                img.src = url;

                tileCount++;
            }
        }
    }
    swapWithSubstitute(map, visibleSpots);
}

function swapWithSubstitute(map, spot) {

    const ul = document.querySelector("#map-menu ul");
    if (!ul) return;

    const lis = Array.from(ul.children);

    const targetLi = lis.find(li => {
        const top = li.querySelector(".row-top");
        return top?.textContent === spot.name;
    });

    if (!targetLi) {
        alert("削除対象なし: " + spot.name);
        return;
    }

    const removedName = targetLi.querySelector(".row-top")?.textContent;

    alert("削除対象: " + removedName);

    targetLi.remove();

    window.substitute = spot;
}

function showNearestSpotName(map) {

    const bounds = map.getBounds();
    const center = map.getCenter();

    const visible = window.spotData.filter(s =>
        bounds.contains([s.lat, s.lng])
    );

    if (!visible.length) return;

    let nearest = null;
    let minDist = Infinity;

    for (const s of visible) {

        const dLat = s.lat - center.lat;
        const dLng = s.lng - center.lng;

        const dist = dLat * dLat + dLng * dLng;

        if (dist < minDist) {
            minDist = dist;
            nearest = s;
        }
    }

    if (!nearest) return;

    let el = document.getElementById("nearest-spot");

    if (!el) {
        el = document.createElement("div");
        el.id = "nearest-spot";
        el.style.position = "fixed";
        el.style.bottom = "10px";
        el.style.left = "10px";
        el.style.background = "rgba(0,0,0,0.7)";
        el.style.color = "#fff";
        el.style.padding = "6px 10px";
        el.style.fontSize = "12px";
        el.style.zIndex = 9999;
        document.body.appendChild(el);
    }

    el.textContent = nearest.name;
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

function showFishPopup(spot) {
    
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

    spot.marker
        ?.closePopup?.();

    spot.marker
        ?.unbindPopup?.();

    spot.marker
        ?.bindPopup(popupHtml)
        ?.openPopup();
}


function zoomToSpot(spot) {

    window.mapStateSnapshot = null;
    disablePhase2(window.map);
    resetSpotLayers();

    // ========================
    // ★ レイヤー統一
    // ========================
    if (window.gsiLayer) {
        window.gsiLayer.setUrl(window.gsiLayers.photo);
    } else {
        window.gsiLayer = L.tileLayer(
            window.gsiLayers.photo,
            {
                attribution: '国土地理院',
                maxZoom: 18
            }
        ).addTo(window.map);
    }

    if (window.osmLayer) {
        window.map.removeLayer(window.osmLayer);
        window.osmLayer = null;
    }

    // ========================
    // データ補完
    // ========================
    let safe = spot;

if (!safe.URL) {

    Promise.resolve(prepareFishForArea(window.currentAreaId))
        .then(() => {

            const spotId = window.currentSpotId.split("_");

            const list = window.spotData.filter(s =>
                String(s.areaId) === String(window.currentAreaId)
            );

            const safe2 = list.find(s =>
                String(s.individualId) === String(spotId[2])
            );
            
            document.getElementById("nearest-spot").textContent = safe2.name;
            document.getElementById('map-back-btn').style.display = 'block';

            showFishMarkers(safe2.URL);

            window.map.setMinZoom(safe.zoom || 15);
            window.map.setMaxZoom(18);

            window.map.setMaxBounds(window.map.getBounds());
            window.map.options.maxBoundsViscosity = 1.0;

            window._zoomGuardBase = safe.zoom || 15;
            window._zoomGuardActive = true;

            window.map.dragging.enable();
            window.map.scrollWheelZoom.enable();
            window.map.doubleClickZoom.enable();
            window.map.touchZoom.enable();
        });

    return;
}

    // ========================
    // 通常ルート
    // ========================
    window.map.dragging.disable();
    window.map.scrollWheelZoom.disable();
    window.map.doubleClickZoom.disable();
    window.map.touchZoom.disable();

    window.map.flyTo([safe.lat, safe.lng], safe.zoom, {
        duration: 0.5
    });
    document.getElementById("nearest-spot").textContent = safe.name;

    if (safe && safe.individualId != null) {
        const base = location.hash || '';
        location.hash = base + '/' + safe.individualId;
        updateStateFromHash();
    }

    window.map.once('moveend', function () {
        showFishMarkers(safe.URL);

        window.map.setMinZoom(safe.zoom || 15);
        window.map.setMaxZoom(18);

        window.map.setMaxBounds(window.map.getBounds());
        window.map.options.maxBoundsViscosity = 1.0;

        window._zoomGuardBase = safe.zoom || 15;
        window._zoomGuardActive = true;

        window.map.dragging.enable();
        window.map.scrollWheelZoom.enable();
        window.map.doubleClickZoom.enable();
        window.map.touchZoom.enable();
    });
}

function showFishMarkers(url) {
  if (!window.map) return;

  if (window.fishLayer) {
    window.map.removeLayer(window.fishLayer);
  }

  window.fishLayer = L.layerGroup();

  const fishList = url.split(',');

  const markers = fishList.map(item => {
    const parts = item.split('|');
    return {
      name: parts[0],
      lat: parts[1],
      lng: parts[2]
    };
  });

function renderMarkers() {

  window.fishLayer.clearLayers();

  const zoom = Math.round(window.map.getZoom());
  const el = window.map.getContainer();

  // -------------------------
  // zoomクラス（そのまま維持）
  // -------------------------
  el.classList.remove('zoom-18', 'zoom-17', 'zoom-16');

  if (zoom >= 18) {
    el.classList.add('zoom-18');

  } else if (zoom === 17) {
    el.classList.add('zoom-17');

  } else if (zoom <= 16) {
    el.classList.add('zoom-16');

  }

  // -------------------------
  // マーカー（ドット削除）
  // -------------------------
  for (const fish of markers) {

    const icon = L.divIcon({
      className: 'fish-label',
      html: `<div class="fish-text">${fish.name}</div>`,
      iconSize: null
    });

    const marker = L.marker([fish.lat, fish.lng], { icon });
    window.fishLayer.addLayer(marker);
  }
}


  window.map.addLayer(window.fishLayer);

  renderMarkers();

  window.map.off('zoomend', renderMarkers);
  window.map.on('zoomend', renderMarkers);
}

function resetSpotLayers() {

    if (window.phase1Group) {
        window.phase1Group.clearLayers();
    }

    if (window.phase2Group) {
        window.phase2Group.clearLayers();
    }

    if (window.areaSpotLayer) {
        window.areaSpotLayer.clearLayers();
        window.map.removeLayer(window.areaSpotLayer);
        window.areaSpotLayer = null;
    }

    if (window.prefSpotLayer) {
        window.map.removeLayer(window.prefSpotLayer);
        window.prefSpotLayer = null;
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
    map.touchZoom.disable();
    map.dragging.disable();

    const area = window.areaData.find(a =>
        String(a.individualId) === String(window.currentAreaId?.split('_')[1])
    );

    if (!area) return;

    const z = window.map.getZoom();

    // =====================================================
    // ① phase2 → phase1（z >= 14）
    // =====================================================
    if (z >= 14) {
        stopZoomGuard();
        window.map.dragging.enable();
        window.map.scrollWheelZoom.enable();
        window.map.doubleClickZoom.enable();
        window.map.touchZoom.enable();

        window.map.setMinZoom(0);
        window.map.setMaxZoom(18);
        window.map.setMaxBounds(null);
        window.map.options.maxBoundsViscosity = 0;

        // レイヤ整理
        
        if (window.fishLayer) {
            window.map.removeLayer(window.fishLayer);
        }
        
        if (window.phase2Group) window.phase2Group.clearLayers();

        const restoreSpot = buildSpotRestoreObject();
        if (!restoreSpot) return;

        // spotキー除去
        const spotKey = window.currentSpotId?.split('_')[2];
        if (spotKey) {
            location.hash = location.hash.replace('/' + spotKey, '');
        }

        updateStateFromHash();

        // 再構築
        showSpotsForArea(window.currentAreaId);
        selectSpot(restoreSpot);
        enablePhase2(window.map);
        phase1menu(window.currentAreaId);

        return;
    }

    // =====================================================
    // ② phase1維持（z === 13）
    // =====================================================
    if (z === 13) {
        disablePhase2(window.map);
        document.getElementById("nearest-spot").textContent = "";
        
        window.map.eachLayer(layer => {
            if (layer === window.gsiLayer) return;

            if (layer instanceof L.TileLayer) {
                const url = layer._url || '';
                if (url.includes('seamlessphoto')) {
                    window.map.removeLayer(layer);
                }
            }
        });

        // OSM削除
        window.map.eachLayer(layer => {
            if (!(layer instanceof L.TileLayer)) return;

            const url = layer._url || '';
            if (url.includes('openstreetmap')) {
                window.map.removeLayer(layer);
            }
        });

        window.map.setMinZoom(0);
        window.map.setMaxZoom(18);
        window.map.setMaxBounds(null);
        window.map.options.maxBoundsViscosity = 0;

        if (window.phase2Group) window.phase2Group.clearLayers();

        // タイル確定（ort）
        const s = window.mapStateSnapshot;

        if (!window.gsiLayer) {
            window.gsiLayer = L.tileLayer(window.gsiLayers.ort);
        } else {
            window.gsiLayer.setUrl(window.gsiLayers.ort);
        }

        window.gsiLayer.addTo(window.map);

        selectArea(area);
        return;
    }

    // =====================================================
    // ③ prefへ戻る（z <= 12）
    // =====================================================
    if (window.phase1Group) window.phase1Group.clearLayers();
    if (window.areaSpotLayer) window.areaSpotLayer.clearLayers();

    if (!window.gsiLayer) {
        window.gsiLayer = L.tileLayer(window.gsiLayers.ort).addTo(window.map);
    } else {
        window.gsiLayer.setUrl(window.gsiLayers.ort);
    }
    document.getElementById('map-back-btn').style.display = 'none';


// ② 1フレーム待つ
requestAnimationFrame(() => {

    // ③ サイズ確定後に通知
    window.map.invalidateSize(true);

    // ④ その後に移動
    drawLocation(
        window.prefData.name,
        window.prefData.lat,
        window.prefData.lng,
        window.prefData.zoom
    );
    location.hash = '';
    updateStateFromHash();
    initAreaUI();
    showPrefSpots();
    renderPrefWeather();

});
}

function buildSpotRestoreObject() {

    const areaId = window.currentAreaId;
    const spotId = window.currentSpotId;

    if (!areaId || !spotId) return null;

    const spotKey = spotId.split('_')[2];

    const spot = window.spotData.find(s =>
        String(s.individualId) === String(spotKey) &&
        String(s.areaId) === String(areaId)
    );

    if (!spot) return null;

    return {
        name: spot.name,
        lat: Number(spot.lat),
        lng: Number(spot.lng),
        zoom: 13,
        individualId: spot.individualId || spot.id || ''
    };
}