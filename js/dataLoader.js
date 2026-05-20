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

    li.classList.add("menu-item");

    const top = document.createElement("div");
    top.className = "row-top";
    top.textContent = s.name;

    const bottom = document.createElement("div");
    bottom.className = "pref-weather";

    if (!s.whether) {
        bottom.textContent = "no data";
    } else {

        const raw = s.whether.hourly?.[0]?.weather;
        const w = formatPrefWeather(s.whether);

        let iconCode = 0;

        // =========================
        // week完全統一ロジック
        // =========================
        if (Array.isArray(raw)) {

            const adjustCode = (code, pop) => {
                const p = Number(pop);

                if (code >= 60) {
                    if (p >= 80) return 70;
                    if (p >= 60) return 60;
                    return 60;
                }

                if (p >= 70) return 30;
                if (p >= 50) return 10;

                return code;
            };

            const map = {};
            let maxCount = -1;
            let tied = [];

            // ■ 集計（weekと同じ）
            for (const r of raw) {

                const code = Number(r?.[0]);
                const pop  = Number(r?.[2]);

                if (!Number.isFinite(code)) continue;

                const adjusted = adjustCode(code, pop);

                map[adjusted] = (map[adjusted] || 0) + 1;
            }

            // ■ 最頻値抽出（weekと同じ）
            for (const k in map) {

                const count = map[k];
                const code = Number(k);

                if (count > maxCount) {
                    maxCount = count;
                    tied = [code];
                } else if (count === maxCount) {
                    tied.push(code);
                }
            }

            // ■ 同率処理（weekと同じ）
            iconCode =
                tied.length > 1
                    ? Math.round(tied.reduce((a, b) => a + b, 0) / tied.length)
                    : tied[0];

        } else {

            iconCode = raw?.[0] ?? 0;
        }

        const icon = toWeatherIcon(iconCode);

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
    // クリックイベント
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
// -------------------------
// ★グローバルで管理
// -------------------------
let phase2Timer = null;

function enablePhase2(map) {

    if (!map) return;

    // ★二重登録防止
    if (map._phase2Handler) {
        map.off('dragend', map._phase2Handler);
        map.off('moveend', map._phase2Handler);
    }

    const runPhase2 = () => {

        // ★無効状態なら何もしない
        if (!window.phase2Initialized) return;

        clearTimeout(phase2Timer);

        phase2Timer = setTimeout(() => {

            // ★ここでもガード（遅延対策）
            if (!window.phase2Initialized) return;

            processSpotUtils(map);
            showNearestSpotName(map);

        }, 80);
    };

    map._phase2Handler = runPhase2;

    map.on('dragend', runPhase2);
    map.on('moveend', runPhase2);

    window.phase2Initialized = true;
}

function disablePhase2(map) {

    if (!map) return;

    // ★まず「これ以上実行させない」
    window.phase2Initialized = false;

    // ★イベント解除（今後の発火を止める）
    if (map._phase2Handler) {
        map.off('dragend', map._phase2Handler);
        map.off('moveend', map._phase2Handler);
        map._phase2Handler = null;
    }

    // ★タイマーは“潰さない”
    // → 最後の1回を自然に流すため

    // 状態リセット（軽量）
    window.lastVisibleSet = new Set();

    // UIは即消さない（これがカクつき原因）
    requestAnimationFrame(() => {
        const menu = document.getElementById("map-menu");
        if (menu) {
            menu.classList.remove("phase2-lock");
            menu.style.display = "none";
        }
    });
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
        swapWithSubstitute(s);
    }
}

function swapWithSubstitute(spot) {

    const ul = document.querySelector("#map-menu ul");
    if (!ul) return;

    const lis = Array.from(ul.children).filter(li =>
        li.classList.contains("menu-item")
    );

    const targetLi = lis.find(li => {
        const top = li.querySelector(".row-top");
        return top?.textContent === spot.name;
    });

    if (!targetLi) return;

    targetLi.remove();

    // ★ここで必ず追加
    if (window.substitute) {
        const newLi = createMenuItem(window.substitute);
        ul.appendChild(newLi);
    }

    // ★最後に更新
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
            createWeekItem(safe2.whether);

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

        createWeekItem(safe.whether);

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

function createWeekItem(weekData) {

  const weekEl = document.querySelector(".week");
  if (!weekEl) return;

  weekEl.style.display = "flex";

  const labelsContainer = document.getElementById("weekLabels");
  const tableContainer = document.getElementById("weekTable");

  if (!labelsContainer || !tableContainer) return;

  labelsContainer.innerHTML = "";
  tableContainer.innerHTML = "";

  const hourlyList = weekData?.hourly;
  const dailyList  = weekData?.daily;
  const tideList   = window.tideWeek;

  if (!Array.isArray(hourlyList)) return;

  const hasHourly2 = hourlyList?.[0]?.hourly2 != null;

  // ★テスト用（3列だけ）
  const labels = ["", "", "WEEK"];

  for (const text of labels) {
    const div = document.createElement("div");
    div.className = "week-label";
    div.textContent = text;
    labelsContainer.appendChild(div);
  }

  const today = new Date();

  const getDate = (i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  for (let row = 0; row < 3; row++) {

    const tr = document.createElement("div");
    tr.className = "week-row";

    for (let col = 0; col < 7; col++) {

      const cell = document.createElement("div");

      const hourly = hourlyList[col];
      const daily  = dailyList?.[col - 3];

      let value = "—";

      // =========================
      // 日付
      // =========================
      if (row === 0) {
        value = getDate(col);
      }

      // =========================
      // 潮
      // =========================
      if (row === 1) {
        const tide = tideList?.[col]?.tide;
        value = tide ?? "—";

        if (tide === "大潮") {
          cell.style.color = "red";
          cell.style.fontWeight = "bold";
        }
      }

      // =========================
      // 天気（week統一ロジック）
      // =========================
      if (row === 2) {

        if (col <= 2 && hourly) {

          const list = hasHourly2
            ? hourly?.hourly2
            : hourly?.weather;

          const adjustCode = (code, pop) => {
            const p = Number(pop);

            if (code >= 60) {
              if (p >= 80) return 70;
              if (p >= 60) return 60;
              return 60;
            }

            if (p >= 70) return 30;
            if (p >= 50) return 10;

            return code;
          };

          const map = {};
          let maxCount = -1;
          let tied = [];

          if (Array.isArray(list)) {
            for (const r of list) {

              const rawCode = Number(r?.[0]);
              const pop = r?.[3];

              if (!Number.isFinite(rawCode)) continue;

              const adjusted = adjustCode(rawCode, pop);
              map[adjusted] = (map[adjusted] || 0) + 1;
            }
          }

          for (const k in map) {

            const count = map[k];
            const code = Number(k);

            if (count > maxCount) {
              maxCount = count;
              tied = [code];
            } else if (count === maxCount) {
              tied.push(code);
            }
          }

          const best =
            tied.length > 1
              ? Math.round(tied.reduce((a, b) => a + b, 0) / tied.length)
              : tied[0];

          value = toWeatherIcon(best ?? 0);

        } else if (daily) {

          value = toWeatherIcon(daily?.weather?.[0] ?? 0);
        }
      }

      // =========================
      // クリックイベント（残す）
      // =========================
      cell.style.cursor = "pointer";

   cell.addEventListener("click", () => {

  const hourly = hourlyList[col];
  if (!hourly) return;

  const same = window.activeWeekIndex === col;

  // -------------------------
  // 別セルクリック：初期化
  // -------------------------
  if (!same) {
    window.activeWeekIndex = col;
    window.weekViewMode = 1;

    createHourlyWeather(hourly);
    hideTideGraph();
    return;
  }

  // -------------------------
  // 同セルクリック：状態トグル
  // -------------------------
  window.weekViewMode++;

  if (window.weekViewMode > 2) {
    window.weekViewMode = 0;
  }

  if (window.weekViewMode === 0) {
    closeHourlyWeather();
    hideTideGraph();
    window.activeWeekIndex = null;
    return;
  }

  if (window.weekViewMode === 1) {
    createHourlyWeather(hourly);
    hideTideGraph();
    return;
  }

  if (window.weekViewMode === 2) {
  createHourlyWeather(hourly);

  const tide = tideList?.[col];
  createTideGraph(tide);

  return;
}
});

      cell.textContent = value;
      tr.appendChild(cell);
    }

    tableContainer.appendChild(tr);
  }
}

window.weekViewMode = 0; // 0:none 1:hourly 2:hourly+tide
window.activeWeekIndex = null;

function hideTideGraph() {
  const canvas = document.getElementById("tideCanvas");
  if (canvas) canvas.style.display = "none";
}

function closeHourlyWeather() {

  const weatherRoot = document.querySelector(".weather");
  if (!weatherRoot) return;

  weatherRoot.innerHTML = "";
  window.activeWeekIndex = null;
}

function removeWeekItem() {
  const weekEl = document.querySelector(".week");
  if (!weekEl) return;

  weekEl.style.display = "none";

  const labelsContainer = document.getElementById("weekLabels");
  const tableContainer = document.getElementById("weekTable");

  if (labelsContainer) labelsContainer.innerHTML = "";
  if (tableContainer) tableContainer.innerHTML = "";
}

window.activeWeekIndex = null;

function degToDir(deg) {
  if (deg == null || isNaN(deg)) return "—";

  const dirs = ["↑","↗","→","↘","↓","↙","←","↖"];
  return dirs[Math.round(deg / 45) % 8];
}

// 単位付き表示ヘルパー
function withUnit(value, unit, round = true) {
  if (value == null || isNaN(value)) return "—";
  const v = round ? Math.round(value) : value;
  return `${v}<span class="unit">${unit}</span>`;
}

function createHourlyWeather(hourlyData) {

  const root = document.querySelector(".weather");
  if (!root || !hourlyData) return;

  root.innerHTML = "";

  const list = Array.isArray(hourlyData.hourly2)
    ? hourlyData.hourly2
    : Array.isArray(hourlyData.weather)
      ? hourlyData.weather
      : null;

  if (!Array.isArray(list)) return;

  const hours = [0,"",4,"",8,"",12,"",16,"",20,""];

  const step = Math.floor(list.length / 12) || 1;

  const sliced = [];
  for (let i = 0; i < 12; i++) {
    sliced.push(list[i * step] ?? null);
  }

  // =========================
  // util
  // =========================

  const normalizePop = (pop) => {
    if (pop == null || pop === "—") return pop;
    if (pop <= 1) return Math.round(pop * 100);
    return Math.round(pop);
  };

  const createValueWrap = (value, unit) => {
    if (value == null || value === "—") {
      const dash = document.createElement("div");
      dash.textContent = "—";
      return dash;
    }

    const wrap = document.createElement("div");
    wrap.className = "value-wrap";

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = Math.round(value);

    const u = document.createElement("div");
    u.className = "unit";
    u.textContent = unit;

    wrap.appendChild(num);
    wrap.appendChild(u);

    return wrap;
  };

  const degToDir = (deg) => {
    if (deg == null || isNaN(deg)) return "—";
    const d = (deg % 360 + 360) % 360;
    const dirs = ["↑","↗","→","↘","↓","↙","←","↖"];
    return dirs[Math.round(d / 45) % 8];
  };

// ★追加：降水確率によるコード補正（☔あり・三項版と同一仕様）
const adjustWeatherCodeForPop = (code, pop) => {

  const p = normalizePop(pop);

  if (code >= 60) {
    if (p >= 80) return 70; // 強い雨
    if (p >= 60) return 60; // 普通の雨
    return 60;              // 弱い雨（雨扱い維持）
  }

  if (p >= 70) return 30;
  if (p >= 50) return 10;

  return code;
};
  // =========================

  const labels = ["","","","","RAIN","","WIND"];

  const labelsEl = document.createElement("div");
  labelsEl.className = "weather-labels";

  for (const text of labels) {
    const div = document.createElement("div");
    div.className = "weather-label";
    div.textContent = text;
    labelsEl.appendChild(div);
  }

  const tableEl = document.createElement("div");
  tableEl.className = "weather-table";

  const rows = Array.from({ length: labels.length }, () => {
    const row = document.createElement("div");
    row.className = "weather-row";
    return row;
  });

  for (let i = 0; i < 12; i++) {

    const r = sliced[i];
    if (!r) continue;

    const code = r?.[0];
    const temp = r?.[1];
    const pop  = r?.[2];
    const rain = r?.[3];
    const wind = r?.[4];
    const dir  = r?.[5];

    // TIME
    const c0 = document.createElement("div");
    c0.className = "weather-cell";
    c0.textContent = `${hours[i]}`;
    rows[0].appendChild(c0);

    // 天気（★ここだけ変更）
    const c1 = document.createElement("div");
    c1.className = "weather-cell";
    const adjustedCode = adjustWeatherCodeForPop(code, pop);
    c1.textContent = toWeatherIcon(adjustedCode);
    rows[1].appendChild(c1);

    // 気温
    const c2 = document.createElement("div");
    c2.className = "weather-cell";
    c2.appendChild(createValueWrap(temp, "°C"));
    rows[2].appendChild(c2);

    // 降水量
    const c3 = document.createElement("div");
    c3.className = "weather-cell";
    c3.appendChild(createValueWrap(rain, "mm"));
    rows[3].appendChild(c3);

    // 降水確率
    const c4 = document.createElement("div");
    c4.className = "weather-cell";
    const fixedPop = normalizePop(pop);
    c4.appendChild(createValueWrap(fixedPop, "%"));
    rows[4].appendChild(c4);

    // 風速
    const c5 = document.createElement("div");
    c5.className = "weather-cell";
    c5.appendChild(createValueWrap(wind, "m/s"));
    rows[5].appendChild(c5);

    // 風向
    const c6 = document.createElement("div");
    c6.className = "weather-cell wind-dir";
    c6.textContent = degToDir(dir);
    rows[6].appendChild(c6);
  }

  rows.forEach(r => tableEl.appendChild(r));

  root.appendChild(labelsEl);
  root.appendChild(tableEl);
}

function normalizeGraphInput(input) {

  if (!Array.isArray(input?.tide)) return [];

  return input.tide
    .map(v => Number(v))
    .filter(v => isFinite(v));
}

function createTideGraph(input) {

  const canvas = document.getElementById("tideCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const w = 320;
  const h = 240;

  canvas.width = w;
  canvas.height = h;
  canvas.style.display = "block";

  ctx.clearRect(0, 0, w, h);

  // -------------------------
  // normalize（数値配列）
  // -------------------------
  const data = normalizeGraphInput(input);
  if (!data.length) return;

  // -------------------------
  // スケール
  // -------------------------
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const scaleY = v => h - ((v - min) / range) * h;
  const stepX = w / (data.length - 1);

  // -------------------------
  // 線描画
  // -------------------------
  ctx.beginPath();

  data.forEach((v, i) => {

    const x = i * stepX;
    const y = scaleY(v);

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.strokeStyle = "#00aaff";
  ctx.lineWidth = 2;
  ctx.stroke();

  // -------------------------
  // デバッグ（最小限）
  // -------------------------
  ctx.fillStyle = "white";
  ctx.font = "10px monospace";
  ctx.fillText("LEN:" + data.length, 5, 12);
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
        removeWeekItem();
        closeHourlyWeather();

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