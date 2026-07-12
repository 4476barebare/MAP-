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

// =====================
// 1. Locationの読み込み (動的グローバル変数による爆速キャッシュ・完全版)
// =====================
function loadLocationCSV(csvUrl) {
    const pref = window.currentPref; // 現在の県コード（例: "CHIBA"）

    // ★ 前回の書き漏らし：これが無いとエラーで止まります
    function parseGrid(str) {
        if (!str) return { x: null, y: null };
        const x = str.match(/x\s*:\s*(-?\d+)/);
        const y = str.match(/y\s*:\s*(-?\d+)/);
        return {
            x: x ? parseInt(x[1]) : null,
            y: y ? parseInt(y[1]) : null
        };
    }

    // ==========================================
    // ★ 分岐A：既にデータが生成されていれば、リネーム（代入）して即リターン
    // ==========================================
    if (window[`${pref}_prefData`] && window[`${pref}_areaData`] && window[`${pref}_spotData`]) {
        
        window.prefData = window[`${pref}_prefData`];
        window.areaData = window[`${pref}_areaData`];
        window.spotData = window[`${pref}_spotData`];

        // ご指摘の通り再計算はせず、グラフもキャッシュから復元するだけにする
        if (window[`${pref}_areaGraph`]) {
            window.areaGraph = window[`${pref}_areaGraph`];
        } else {
            buildAreaGraphFromGrid(window.areaData);
            window[`${pref}_areaGraph`] = window.areaGraph;
        }

        // 後続の処理が止まらないよう、解決済みのPromiseを返す
        return Promise.resolve({
            main: window.prefData,
            areas: window.areaData,
            spots: window.spotData
        });
    }

    // ==========================================
    // ★ 分岐B：まだ無い場合は続行して fetch とパースを行う
    // ==========================================
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
                    name: cols[0]?.trim() || '',
                    zoom: cols[1] && cols[1].trim() !== '' ? parseFloat(cols[1]) : '',
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
                if (!row.areaId && row.name === pref) {
                    main = row;
                }
            });

            allRows.forEach(row => {
                if ((row.areaId || '').trim() === pref) {
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

            // 1. 現在のグローバル変数にセット
            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;

            // 2. ★ 次回以降のために、動的な変数名でストック（保存）しておく
            window[`${pref}_prefData`] = main;
            window[`${pref}_areaData`] = areas;
            window[`${pref}_spotData`] = spots;

            // 3. グラフも構築して保存しておく
            buildAreaGraphFromGrid(areas);
            window[`${pref}_areaGraph`] = window.areaGraph;

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
          const lines = text.split(/\r?\n/);
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
      s => s.areaId && s.areaId === areaId   // ★ trim削除
    );

    const targetFish = window.fishData.filter(
      f => f.registration && f.registration === areaId  // ★ trim削除
    );

    targetSpots.forEach(spot => {
      const fishList = targetFish
        .filter(f => f.parent && f.parent === spot.name) // ★ trim削除
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

// =====================================
// ■ マーカーレイヤーの保存用金庫
// =====================================
window.prefSpotLayerCache = window.prefSpotLayerCache || {};

function showPrefSpots() {
    // 既存のレイヤーがマップ上にあれば外す（非表示にする）
    if (window.prefSpotLayer) {
        window.map.removeLayer(window.prefSpotLayer);
        window.prefSpotLayer = null;
    }

    // ★ ご提案の分岐：既にこの県のレイヤーが金庫にあれば、表示に戻して即リターン
    if (window.currentPref && window.prefSpotLayerCache[window.currentPref]) {
        window.prefSpotLayer = window.prefSpotLayerCache[window.currentPref];
        window.prefSpotLayer.addTo(window.map);
        return;
    }

    // 無ければ続行して生成（初回アクセス時のみ実行される重い処理）
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

    // ★ 新しく作ったレイヤーを金庫に保存しておく
    if (window.currentPref) {
        window.prefSpotLayerCache[window.currentPref] = window.prefSpotLayer;
    }

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
        openArea(areaObj.individualId);
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
    }

    if (!window.areaSpotLayer) {
        window.areaSpotLayer = L.layerGroup().addTo(window.map);
    } else {
        window.areaSpotLayer.clearLayers();
    }

    // 【変更点1】エリアが一致し、かつ「icon列が空欄ではない（値が存在する）」ものだけを抽出
    const spots = window.spotData.filter(s => 
        s.areaId === areaKey && s.icon && s.icon.trim() !== ''
    );
    
    if (!spots.length) return;

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    spots.forEach(spot => {
        // 【変更点2】空欄はすでに弾かれているので、入力されているiconの値をそのまま使う
        const iconId = spot.icon; 
        
        // スタイル分岐の維持（例：fishから始まるかどうかでz-indexを変えるなど）
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
            selectSpot(spot);
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
    const currentZoom = window.map.getZoom();

    if (currentZoom === 13) {
        // ★ NaNではなく、「空欄（空文字）ではないか」で判別する
        if (spot.zoom !== '') {
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
            className: 'osm-solid-layer',
            
            updateWhenIdle: false,
            updateWhenZooming: true,
            updateWhenDragging: true,

            // ▼ 限界突破のピース1：先読み量をあえて少し「減らす」
            keepBuffer: 4, 
            
            // ▼ 限界突破のピース2：タイルの「フワッと表示」を強制オフ！
            fadeAnimation: false
        }
    ).addTo(window.map);

    disableAreaSwipe();

    window.map.setMaxBounds(null);

    drawLocation(spot.name, spot.lat, spot.lng, 13);

    window.map.once('moveend', () => {
        window.map.invalidateSize(true);
        
        window.map.dragging.enable();
        window.map.options.maxBoundsViscosity = 1.0;

        requestAnimationFrame(() => {
            window.map.setMaxBounds(window.areaBounds);
        });
    });

    enablePhase2(window.map);
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
    // 補欠
    // -------------------------
    window.substitute = window.spotData.find(s =>
        s.areaId === areaId &&
        s.type === "substitute"
    ) || null;

    // =====================
    // リスト削除（スッキリ書き換え）
    // =====================
    const oldItems = ul.querySelectorAll('li'); // 古い :scope > li:not(.menu-header-row) の指定を削除
    oldItems.forEach(el => el.remove());
    // =====================
    // リスト生成
    // =====================
    for (const s of items) {
        const li = createMenuItem(s);
        ul.appendChild(li);
    }

    // =====================
    // menu表示
    // =====================
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

        let icon = '';

        // =========================
        // 2時間刻み集計（prefと同一ロジック）
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

            const m = {};
            const a = {};

            for (let i = 0; i < raw.length; i++) {

                const r = raw[i];
                const code = Number(r?.[0]);
                const pop = Number(r?.[2]);

                if (!Number.isFinite(code)) continue;

                const adj = adjustCode(code, pop);
                const hour = i * 2;

                if (hour <= 12) {
                    m[adj] = (m[adj] || 0) + 1;
                } else if (hour >= 14 && hour <= 20) {
                    a[adj] = (a[adj] || 0) + 1;
                }
            }

            const pick = (map) => {
                let max = -1;
                let res = [];

                for (const k in map) {
                    const v = map[k];
                    const n = Number(k);

                    if (v > max) {
                        max = v;
                        res = [n];
                    } else if (v === max) {
                        res.push(n);
                    }
                }

                return res.length > 1
                    ? Math.round(res.reduce((s, x) => s + x, 0) / res.length)
                    : res[0];
            };

            const iconMorning = pick(m);
            const iconAfternoon = pick(a);

            const mIcon = iconMorning != null ? toWeatherIcon(iconMorning) : '';
            const aIcon = iconAfternoon != null ? toWeatherIcon(iconAfternoon) : '';

            icon = (mIcon && aIcon && mIcon !== aIcon)
                ? `${mIcon}<span class="unit-text">→</span>${aIcon}`
                : (mIcon || aIcon);
        }

        bottom.innerHTML = `
            <span class="col-icon">${icon}</span>

            <div class="col-temp">
                <span class="num-fixed">${w.temp}</span><span class="unit-text">°C</span>
            </div>

            <div class="col-label">
                <span class="unit-text">降水</span>
            </div>

            <div class="col-pop">
                <span class="num-fixed">${Math.min(w.pop, 99)}</span><span class="unit-text">%</span>
            </div>

            <div class="col-wind">
                <span class="num-fixed">${w.wind}</span><span class="unit-text">m/s</span>
            </div>
        `;
    }

    li.appendChild(top);
    li.appendChild(bottom);

    li.addEventListener("click", () => {

        const spot = window.spotData.find(x =>
            (x.id || x.name) === li.dataset.key
        );

        if (!spot) return;

        selectSpot(spot);
    });

    return li;
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
    renderCrowdImage();
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

    // -------------------------
    // ズーム分離（ここが重要）
    // -------------------------
    const rawZoom = map.getZoom();              // 小数ズーム（表示用）
    const tileZoomBase = Math.floor(rawZoom);   // タイル計算用（整数）

    // 512 + zoomOffset:-1 の補正
    const effectiveZoom = tileZoomBase + 1;

    // URL生成
    const baseUrl = window.gsiLayers.photo.replace('{z}', effectiveZoom);

    const n = Math.pow(2, effectiveZoom);

    let tileCount = 0;

    for (const s of visibleSpots) {

        const lat = Number(s.lat);
        const lng = Number(s.lng);

        if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

        const tileX = Math.floor((lng + 180) / 360 * n);

        const latRad = lat * Math.PI / 180;

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
    renderSub2Weather(nearest);
    
}

function renderSub2Weather(spot) {

    const container = document.querySelector(".map-ui-sub2");
    if (!container) return;

    container.style.display = "inline-flex";
    container.innerHTML = "";

    // ★ここを先に判定する
    if (!spot || !spot.whether) {
        container.style.display = "none";
        container.textContent = "";
        return;
    }

    const raw = spot.whether.hourly?.[0]?.weather;
    const w = formatPrefWeather(spot.whether);

    let icon = '';

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

        const m = {};
        const a = {};

        for (let i = 0; i < raw.length; i++) {

            const r = raw[i];
            const code = Number(r?.[0]);
            const pop = Number(r?.[2]);

            if (!Number.isFinite(code)) continue;

            const adj = adjustCode(code, pop);
            const hour = i * 2;

            if (hour <= 12) {
                m[adj] = (m[adj] || 0) + 1;
            } else if (hour >= 14 && hour <= 20) {
                a[adj] = (a[adj] || 0) + 1;
            }
        }

        const pick = (map) => {
            let max = -1;
            let res = [];

            for (const k in map) {
                const v = map[k];
                const n = Number(k);

                if (v > max) {
                    max = v;
                    res = [n];
                } else if (v === max) {
                    res.push(n);
                }
            }

            return res.length > 1
                ? Math.round(res.reduce((s, x) => s + x, 0) / res.length)
                : res[0];
        };

        const iconMorning = pick(m);
        const iconAfternoon = pick(a);

        const mIcon = iconMorning != null ? toWeatherIcon(iconMorning) : '';
        const aIcon = iconAfternoon != null ? toWeatherIcon(iconAfternoon) : '';

        icon = (mIcon && aIcon && mIcon !== aIcon)
            ? `${mIcon}<span>→</span>${aIcon}`
            : (mIcon || aIcon);
    }

    container.innerHTML = `
        <div class="sub2-weather">

            <span class="col-icon">${icon}</span>

            <div class="col-temp">最高気温
                <span class="num-fixed">${w.temp}</span><span class="unit-text">°C</span>
            </div>
            <div class="col-pop">降水確率
                <span class="num-fixed">${Math.min(w.pop, 99)}</span><span class="unit-text">%</span>
            </div>

            <div class="col-wind">最大風速
                <span class="num-fixed">${w.wind}</span><span class="unit-text">m/s</span>
            </div>

        </div>
    `;
}

function clearSub2Weather() {

    const container = document.querySelector(".map-ui-sub2");
    if (!container) return;

    container.innerHTML = "";
    container.style.display = "none";
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

    if (!window.map || !spot) return;

    window.mapStateSnapshot = null;

    disablePhase2(window.map);
    resetSpotLayers();
    clearSub2Weather();
    removeCrowdImage();

    // ========================
    // レイヤー再構築
    // ========================

    // ========================
    // データ整形
    // ========================
    // ========================
    // データ整形
    // ========================
    const safe = spot;
    const typeParts = (safe.type || '').split('$');

    // 【変更】座標は type の中身に関わらず、常に spot の lat/lng を使う
    const targetLat = safe.lat;
    const targetLng = safe.lng;
    let tileUrl;

    if (typeParts[0] === 'special') {
        // specialの場合：2番目の要素（typeParts[1]）でタイルを判定する
        if (typeParts[1] === 'ort') {
            tileUrl = window.gsiLayers.ort;
        } else {
            tileUrl = window.gsiLayers.photo; // photo または空欄時のデフォルト
        }
    } else {
        // special以外の場合：従来通り最初の要素で判定
        if (typeParts[0] === 'ort') {
            tileUrl = window.gsiLayers.ort;
        } else {
            tileUrl = window.gsiLayers.photo;
        }
    }


    if (window.gsiLayer) {
        window.map.removeLayer(window.gsiLayer);
    }
    window.gsiLayer = L.tileLayer(tileUrl, {
        attribution: '国土地理院',
        detectRetina: false
    }).addTo(window.map);
    
    if (window.osmLayer) {
        window.map.removeLayer(window.osmLayer);
        window.osmLayer = null;
    }

    // ----------------------------------------------------
    // 【修正点1】ジャンプする段階から、あらかじめズームを引き上げておく
    // ----------------------------------------------------
    // もしここが safe.zoom（12.5など）のままだと、移動完了した瞬間に
    // 「広すぎる画面範囲」を getBounds() が拾ってしまい、制限がガバガバになります。
    const targetZoom = safe.zoom < 13.5 ? 13.5 : safe.zoom;

    // ========================
    // 操作ロック
    // ========================
    window.map.dragging.disable();
    window.map.scrollWheelZoom.disable();
    window.map.doubleClickZoom.disable();
    window.map.touchZoom.disable();

    // ========================
    // 移動（targetZoom で飛ばす）
    // ========================
    window.map.flyTo(
        [targetLat, targetLng],
        targetZoom, // safe.zoom から targetZoom に変更
        { duration: 0.5 }
    );

    // ========================
    // UI更新
    // ========================
    const el = document.getElementById("nearest-spot");
    if (el) el.textContent = safe.name || '';

    if (safe?.individualId != null) {
        const hash = location.hash.replace('#', '');
        if (!hash.endsWith('/' + safe.individualId)) {
            location.hash = hash + '/' + safe.individualId;
            updateStateFromHash();
        }
    }

    // ========================
    // 移動完了後処理
    // ========================
    window.map.once('moveend', function () {
        
        // ----------------------------------------------------
        // 【修正点2】setTimeout で1回目特有のタイミングバグをシャットアウトする
        // ----------------------------------------------------
        // 移動直後はLeafletの内部座標計算がまだ不安定な場合があります。
        // 100ミリ秒だけ処理をずらすことで、ブラウザの描画を完全に確定させ、
        // 1回目でも2回目でも「常に100%正確な画面範囲」を確実に掴み取ります。
        setTimeout(function () {
            
            // マップのサイズ認識を強制同期
            window.map.invalidateSize();

            showFishMarkers(safe.URL);
            createWeekItem(safe.whether);

            window.map.setMaxZoom(18);

            // 正確に確定した初期表示の画面範囲を取得
            let bounds = window.map.getBounds();
            let zoomLimit;

            if (safe.zoom < 13.5) {
                // 本来の広域ズーム（12.5など）との差分だけ制限範囲を外側に広げる
                const paddingDiff = 13.5 - safe.zoom; 
                bounds = bounds.pad(paddingDiff);
                zoomLimit = 13.5;
            } else {
                zoomLimit = safe.zoom;
            }

            // 確定した正確な範囲でドラッグをロック
            window.map.setMaxBounds(bounds);
            window.map.options.maxBoundsViscosity = 1.0; // 境界線でピタッと止める

            // ズームガード
            window._zoomGuardBase = zoomLimit;
            window._zoomGuardActive = true;

            // 操作復帰（初期表示の範囲内であれば、ズームもドラッグも自由！）
            window.map.dragging.enable();
            window.map.scrollWheelZoom.enable();
            window.map.doubleClickZoom.enable();
            window.map.touchZoom.enable();

        }, 100); // 100ミリ秒のウェイト
    });
}


function showFishMarkers(url) {
  if (!window.map) return;

  // 1. 古い魚のマーカーが残っていればマップから削除する
  if (window.fishLayer) {
    window.map.removeLayer(window.fishLayer);
    window.fishLayer = null;
  }

  // =========================================================
  // ★ 追加ガード：URLデータが存在しない、または空文字の場合は
  // 古いマーカーを消した状態のまま、エラーを出さずに安全に終了する
  // =========================================================
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return;
  }

  window.fishLayer = L.layerGroup();

  const fishList = url.split(',');

  // ★ 追加ガード：万が一「緯度・経度」が空の不正なデータが混ざっていても
  // Leafletのマーカー生成エラー（NaNエラー）を回避するようフィルタリング
  const markers = fishList.map(item => {
    const parts = item.split('|');
    return {
      name: parts[0],
      lat: parseFloat(parts[1]),
      lng: parseFloat(parts[2])
    };
  }).filter(fish => !isNaN(fish.lat) && !isNaN(fish.lng));

  function renderMarkers() {
    if (!window.fishLayer) return;
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

window.activeCol = null;

function createWeekItem(weekData) {
    if (typeof weekData === "string" && weekData !== "") {
        try {
            weekData = JSON.parse(weekData);
        } catch (e) {
            console.error("JSONパースエラー:", e);
            return;
        }
    }

    if (!weekData || (!weekData.hourly && !weekData.daily)) return;
    
    const weekEl = document.querySelector(".week");
    if (!weekEl) return;

    weekEl.style.display = "flex";

    const labelsContainer = document.getElementById("weekLabels");
    const tableContainer = document.getElementById("weekTable");

    if (!labelsContainer || !tableContainer) return;

    labelsContainer.innerHTML = "";
    tableContainer.innerHTML = "";

    const hourlyList = weekData?.hourly || [];
    const rawDaily = weekData?.daily || [];
    const tideList = window.tideWeek || [];

    const dailyList = rawDaily.map(d => {
        if (!d) return null;
        if (Array.isArray(d)) return d;
        if (typeof d === "string") {
            return d.split("|").map(v => Number(v));
        }
        return d;
    });

    const list = [
        ...hourlyList.map(v => ({ type: "hourly", data: v })),
        ...dailyList.map(v => ({ type: "daily", data: v }))
    ].filter(v => v && v.data);

    // =========================
    // Util: 値と単位の生成 (Hourlyと共通)
    // =========================
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
        num.textContent = value; // 既に丸め・桁処理済みの値が入る

        const u = document.createElement("div");
        u.className = "unit";
        u.textContent = unit;

        wrap.appendChild(num);
        wrap.appendChild(u);
        return wrap;
    };

    // =========================
    // ラベルの生成
    // =========================
    const labels = ["", "", "", "気温", "水温", "波高"];
    for (const text of labels) {
        const div = document.createElement("div");
        div.className = "week-label";
        
        const span = document.createElement("span");
        span.className = "label-text";
        span.textContent = text;
        
        div.appendChild(span);
        labelsContainer.appendChild(div);
    }

    const today = new Date();
    const getDate = (i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    for (let row = 0; row < 6; row++) {
        const tr = document.createElement("div");
        tr.className = "week-row";

        for (let col = 0; col < 7; col++) {
            const cell = document.createElement("div");
            cell.className = "week-cell";
            const item = list[col];

            if (window.activeCol === col) {
                cell.classList.add("active");
            }

            // =========================
            // row0: 日付
            // =========================
            if (row === 0) {
                cell.classList.add("text-center");
                cell.textContent = getDate(col);
            }

            // =========================
            // row1: 潮
            // =========================
            if (row === 1) {
                cell.classList.add("text-center");
                const tide = tideList?.[col]?.tide ?? tideList?.[col];
                cell.textContent = tide ?? "—";

                if (tide === "大潮") {
                    cell.style.color = "#ff4500";
                    cell.style.fontWeight = "bold";
                }
            }

            // =========================
            // row2: 天気
            // =========================
            if (row === 2) {
                cell.classList.add("text-center");
                if (!item) {
                    cell.textContent = "—";
                } else {
                    const data = item.data;
                    if (item.type === "hourly") {
                        const weatherList = data?.hourly2 ?? data?.weather ?? [];
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

                        for (const r of weatherList) {
                            const rawCode = Number(r?.[0]);
                            const pop = r?.[3];
                            if (!Number.isFinite(rawCode)) continue;
                            const adjusted = adjustCode(rawCode, pop);
                            map[adjusted] = (map[adjusted] || 0) + 1;
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
                        const best = tied.length > 1 ? Math.round(tied.reduce((a, b) => a + b, 0) / tied.length) : tied[0];
                        cell.textContent = toWeatherIcon(best ?? 0);
                    } else {
                        cell.textContent = toWeatherIcon(data?.weather?.[0] ?? 0);
                    }
                }
            }

            // =========================
            // row3: 気温 (単位: °C)
            // =========================
            if (row === 3) {
                let val = "—";
                if (item) {
                    const data = item.data;
                    if (item.type === "hourly") {
                        let max = -Infinity;
                        const list = data?.hourly2 ?? data?.weather ?? [];
                        for (const r of list) {
                            const t = r?.[1];
                            if (typeof t === "number" && t > max) max = t;
                        }
                        if (max !== -Infinity) val = Math.round(max);
                    } else {
                        const temp = data?.weather?.[1];
                        if (temp != null) val = Math.round(temp);
                    }
                }
                cell.appendChild(createValueWrap(val, "°C"));
            }

            // =========================
            // row4: 水温 (単位: °C)
            // =========================
            if (row === 4) {
                let val = "—";
                if (item) {
                    const data = item.data;
                    if (item.type === "hourly") {
                        const water = data?.oneday?.avg;
                        if (water != null) val = Math.round(water);
                    } else {
                        const water = data?.dailyEx?.avg;
                        if (water != null) val = Math.round(water);
                    }
                }
                cell.appendChild(createValueWrap(val, "°C"));
            }

            // =========================
            // row5: 波高 (単位: m)
            // =========================
            if (row === 5) {
                let val = "—";
                if (item) {
                    const data = item.data;
                    if (item.type === "hourly") {
                        let max = -Infinity;
                        const list = data?.hourly2 ?? data?.weather ?? [];
                        for (const r of list) {
                            const wave = r?.[6];
                            if (typeof wave === "number" && wave > max) max = wave;
                        }
                        if (max !== -Infinity) val = max.toFixed(1);
                    } else {
                        const wave = data?.dailyEx?.wave;
                        if (wave != null) val = wave.toFixed(1);
                    }
                }
                cell.appendChild(createValueWrap(val, "m"));
            }

            // =========================
            // clickイベント
            // =========================
            cell.style.cursor = "pointer";
            cell.addEventListener("click", () => {
                const it = list[col];
                if (!it) return;

                const isSame = window.activeCol === col;
                if (isSame) {
                    resetWeatherUI();
                    return;
                }

                window.activeCol = col;
                createWeekItem(weekData);

                const data = it.data;
                const sun = data?.oneday || data?.dailyEx;

                if (it.type === "hourly" || it.type === "daily") {
                    createHourlyWeather(data, it.type);
                    if (data?.tide) createTideGraph(data.tide, sun);
                }
            });

            tr.appendChild(cell);
        }
        tableContainer.appendChild(tr);
    }

    if (window.activeCol == null && list.length > 0) {
        window.activeCol = 0;
        const data = list[0].data;
        const sun = data?.oneday || data?.dailyEx;

        createHourlyWeather(data, "hourly");
        if (data?.tide) createTideGraph(data.tide, sun);

        requestAnimationFrame(() => {
            const rows = tableContainer.querySelectorAll(".week-row");
            rows.forEach(row => {
                const cells = row.querySelectorAll("div");
                if (cells[0]) cells[0].classList.add("active");
            });
        });
    }
}


function resetWeatherUI() {

  const weatherRoot = document.querySelector(".weather");
  if (weatherRoot) {
    weatherRoot.innerHTML = "";
  }

  // ==============================
  // ★変更：canvasではなくwrapperを制御対象に統一
  // ==============================
  const wrapper = document.querySelector(".tide-wrapper");
  if (wrapper) {
    wrapper.style.display = "none";
  }

  // ==============================
  // ★変更：canvasは初期化のみ（非表示制御しない）
  // ==============================
  const canvas = document.getElementById("tideCanvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");

    // 破棄ではなくクリアだけにする（再表示時の事故防止）
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  window.activeCol = null;
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




// 単位付き表示ヘルパー
function withUnit(value, unit, round = true) {
  if (value == null || isNaN(value)) return "—";
  const v = round ? Math.round(value) : value;
  return `${v}<span class="unit">${unit}</span>`;
}

function createHourlyWeather(hourlyData,type) {

  const root = document.querySelector(".weather");
  if (!root || !hourlyData) return;

  root.innerHTML = "";

  const list = Array.isArray(hourlyData.hourly2)
    ? hourlyData.hourly2
    : Array.isArray(hourlyData.weather)
      ? hourlyData.weather
      : null;

  if (!Array.isArray(list)) return;

  const hours = [0,2,4,6,8,10,12,14,16,18,20,22];
  
  if (type === "daily") {
      const root = document.querySelector(".weather");
      if (!root || !hourlyData) return;

      root.innerHTML = "";

      const timeRow = document.createElement("div");
      timeRow.className = "weather-row time-row";

      const hours = [0,2,4,6,8,10,12,14,16,18,20,22];

      for (let i = 0; i < 12; i++) {
        const cell = document.createElement("div");
        cell.className = "weather-cell";
        cell.textContent = `${hours[i]}`;
        timeRow.appendChild(cell);
      }

      const tableEl = document.createElement("div");
      tableEl.className = "weather-table";
      tableEl.appendChild(timeRow);

      root.appendChild(tableEl);

      return;
  }

  const step = Math.floor(list.length / 12) || 1;

  const sliced = [];
  for (let i = 0; i < 12; i++) {
    sliced.push(list[i * step] ?? null);
  }

  // =====================================================
  // ★ 追加：1日のうちに有効な「風向データ（r[5]）」が1つでも存在するか判定
  // =====================================================
  const hasWindDir = sliced.some(r => r && r[5] != null && !isNaN(r[5]));

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

  const adjustWeatherCodeForPop = (code, pop) => {
    const p = normalizePop(pop);

    if (code >= 60) {
      if (p >= 80) return 70;
      if (p >= 60) return 60;
      return 60;
    }

    if (p >= 70) return 30;
    if (p >= 50) return 10;

    return code;
  };

  // =========================
  // ラベル
  // =========================

  // ★ 修正：風向データが存在しない場合は、最後の "WIND" ラベルを配列から取り除く
  const labels = ["","","","雨","","風"];
  if (hasWindDir) {
      labels.push("");
  }

  const labelsEl = document.createElement("div");
  labelsEl.className = "weather-labels";

  for (const text of labels) {
      const div = document.createElement("div");
      div.className = "weather-label";

      const span = document.createElement("span");
      span.className = "label-text";
      span.textContent = text;

      div.appendChild(span);
      labelsEl.appendChild(div);
  }

  // =========================
  // テーブル
  // =========================

  // labels.length に連動して、風向がない場合は自動的に1行減る
  const tableEl = document.createElement("div");
  tableEl.className = "weather-table";

  const rows = Array.from({ length: labels.length - 1 }, () => {
    const row = document.createElement("div");
    row.className = "weather-row";
    return row;
  });

  const timeRow = document.createElement("div");
  timeRow.className = "weather-row time-row";

  // =========================
  // データ埋め
  // =========================

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
    timeRow.appendChild(c0);

    // 天気
    const c1 = document.createElement("div");
    c1.className = "weather-cell";
    c1.textContent = toWeatherIcon(adjustWeatherCodeForPop(code, pop));
    rows[0].appendChild(c1);

    // 気温
    const c2 = document.createElement("div");
    c2.className = "weather-cell";
    c2.appendChild(createValueWrap(temp, "°C"));
    rows[1].appendChild(c2);

    // 降水量
    const c3 = document.createElement("div");
    c3.className = "weather-cell";
    c3.appendChild(createValueWrap(rain, "mm"));
    rows[2].appendChild(c3);

    // 降水確率
    const c4 = document.createElement("div");
    c4.className = "weather-cell";
    c4.appendChild(createValueWrap(normalizePop(pop), "%"));
    rows[3].appendChild(c4);

    // 風速
    const c5 = document.createElement("div");
    c5.className = "weather-cell";
    c5.appendChild(createValueWrap(wind, "m/s"));
    rows[4].appendChild(c5);

    // ★ 修正：風向データが存在する場合のみ、セルを生成して6行目（rows[5]）に追加する
    if (hasWindDir) {
        const c6 = document.createElement("div");
        c6.className = "weather-cell wind-dir";
        c6.textContent = degToDir(dir);
        rows[5].appendChild(c6);
    }
  }

  tableEl.appendChild(timeRow);
  rows.forEach(r => tableEl.appendChild(r));

  root.appendChild(labelsEl);
  root.appendChild(tableEl);
}


function createTideGraph(data, sun) {

  const canvas = document.getElementById("tideCanvas");
  if (!canvas) return;

  const wrapper = document.querySelector(".tide-wrapper");
  
  // =====================================================
  // ★ 追加ガード：データが無い、または中身がすべて null の場合は非表示にして終了
  // =====================================================
  const hasValidData = data && Array.isArray(data) && data.some(v => v !== null && !isNaN(v));
  if (!hasValidData || data.length < 3) {
      if (wrapper) wrapper.style.display = "none";
      return;
  }

  const ctx = canvas.getContext("2d");

  // データが正常な場合のみ枠を表示する
  if (wrapper) wrapper.style.display = "block";

  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (!w || !h) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // =====================================================
  // スケール
  // =====================================================
  const MIN_LEVEL = -30;
  const MAX_LEVEL = 170;

  const SCALE = 0.7;
  const range = (MAX_LEVEL - MIN_LEVEL) / SCALE;
  const mid = (MAX_LEVEL + MIN_LEVEL) / 2;

  const scaleY = v =>
    h / 2 + ((v - mid) / range) * (h * 0.7);

  const hoursPerStep = 24 / (data.length - 1);

  // =====================================================
  // 1. 本物の「満潮点」と「干潮点」を精密に抽出する
  // =====================================================
  const peaks = [];
  
  // 0時の状態を最初の点として登録
  peaks.push({ hour: 0, level: data[0] });

  // 前後2時間を見て、そこが「地域最高値（満潮）」か「地域最安値（干潮）」かを判定
  const windowSize = 2;
  for (let i = 1; i < data.length - 1; i++) {
    const curr = data[i];
    let isMax = true;
    let isMin = true;

    for (let g = -windowSize; g <= windowSize; g++) {
      const idx = i + g;
      if (idx >= 0 && idx < data.length && idx !== i) {
        if (data[idx] > curr) isMax = false;
        if (data[idx] < curr) isMin = false;
      }
    }

    if (isMax || isMin) {
      // 隣り合う重複を平滑化するため、同じ値が並んでいたらその中央を採用
      let left = i;
      while (left > 0 && data[left - 1] === curr) left--;
      let right = i;
      while (right < data.length - 1 && data[right + 1] === curr) right++;
      const centerIdx = Math.floor((left + right) / 2);

      // すでに同じ時間が登録されていなければ追加
      const hour = centerIdx * hoursPerStep;
      if (!peaks.some(p => p.hour === hour)) {
        peaks.push({ hour: hour, level: data[centerIdx] });
      }
    }
  }

  // 24時の状態を最後の点として登録
  const lastHour = 24;
  if (!peaks.some(p => p.hour === lastHour)) {
    peaks.push({ hour: lastHour, level: data[data.length - 1] });
  }

  // 時間順にソート
  peaks.sort((a, b) => a.hour - b.hour);

  // 描画用の座標(x, y)に変換
  const pts = peaks.map(p => ({
    x: (p.hour / 24) * w,
    y: scaleY(Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, p.level)))
  }));

  // =====================================================
  // 2. 極値ベースの完全平滑化ベジェ曲線 (Hermiteベース)
  // =====================================================
  const buildStrokePath = () => {
    const path = new Path2D();
    
    path.moveTo(pts[0].x, pts[0].y);

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];

      // この区間の横幅
      const dx = p1.x - p0.x;

      const cp1x = p0.x + dx / 3;
      const cp1y = p0.y; // 傾き0

      const cp2x = p1.x - dx / 3;
      const cp2y = p1.y; // 傾き0

      path.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p1.x, p1.y);
    }

    return path;
  };

  const strokePath = buildStrokePath();

  // =====================================================
  // 塗りパス
  // =====================================================
  const fillPath = new Path2D(strokePath);
  fillPath.lineTo(w, h);
  fillPath.lineTo(0, h);
  fillPath.closePath();

  // =====================================================
  // 昼夜（マズメ対応グラデーション・日の入り30分前倒し）
  // =====================================================
  const baseStepX = w / 24; 
  const sunriseX = (sun.sunrise / 1440) * w + baseStepX;

  const adjustedSunset = Math.max(sun.sunrise, sun.sunset - 30); 
  const sunsetX  = (adjustedSunset / 1440) * w + baseStepX;

  const twilightWidth = (60 / 1440) * w; 

  const skyGrad = ctx.createLinearGradient(0, 0, w, 0);

  const nightColor = "rgba(0,0,0,0.5)";          
  const dayColor   = "rgba(255,220,150,0.08)";    

  skyGrad.addColorStop(0, nightColor);
  
  const sunriseStart = Math.max(0, (sunriseX - twilightWidth / 2) / w);
  const sunriseEnd   = Math.min(1, (sunriseX + twilightWidth / 2) / w);
  skyGrad.addColorStop(sunriseStart, nightColor);
  skyGrad.addColorStop(sunriseEnd, dayColor);

  const sunsetStart = Math.max(0, (sunsetX - twilightWidth / 2) / w);
  const sunsetEnd   = Math.min(1, (sunsetX + twilightWidth / 2) / w);
  skyGrad.addColorStop(sunsetStart, dayColor);
  skyGrad.addColorStop(sunsetEnd, nightColor);

  skyGrad.addColorStop(1, nightColor);

  ctx.save();
  ctx.fillStyle = skyGrad;
  ctx.fill(fillPath);
  ctx.restore();

  // =====================================================
  // フェード付き線
  // =====================================================
  const fadeCell = 2;
  const fade = (baseStepX * fadeCell) / w;

  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "rgba(25,25,112,0)");
  grad.addColorStop(fade, "rgba(25,25,112,1)");
  grad.addColorStop(1 - fade, "rgba(25,25,112,1)");
  grad.addColorStop(1, "rgba(25,25,112,0)");

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke(strokePath);

  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.2;
  ctx.stroke(strokePath);
}


function drawSmooth(ctx, pts) {
  ctx.beginPath();

  for (let i = 0; i < pts.length; i++) {

    const p = pts[i];

    if (i === 0) {
      ctx.moveTo(p.x, p.y);
      continue;
    }

    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p_1 = pts[i - 2] || p0;
    const p2 = pts[i + 1] || p1;

    const cp1x = p0.x + (p1.x - p_1.x) / 6;
    const cp1y = p0.y + (p1.y - p_1.y) / 6;

    const cp2x = p1.x - (p2.x - p0.x) / 6;
    const cp2y = p1.y - (p2.y - p0.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p1.x, p1.y);
  }
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

    const url = new URL(location.href);
    const prefCode = url.searchParams.get('pref');
    const hash = decodeURIComponent(location.hash.replace('#', ''));

    // クエリ(pref)もハッシュもないプレーンな場合はすぐにリターン
    if (!prefCode && !hash) {
        window.currentAreaId = null;
        window.currentSpotId = null;
        return;
    }

    const parts = hash.split('/');
    const areaName = parts[0] || null;
    const spotKey = parts[1] || null;

    let resolvedAreaId = null;

    if (areaName && window.areaData) {
        const area = window.areaData.find(a => a.name === areaName);
        if (area) {
            resolvedAreaId = window.currentPref + "_" + area.individualId;
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
        window.currentSpotId = resolvedAreaId ? (resolvedAreaId + "_" + spotKey) : null;
    }
}


function goBack() {
    // =====================================================
    // ⓪ 県トップ画面(PREF) → 広域マップ(REGION)へ戻る
    // =====================================================
    if (!window.currentAreaId && !window.currentSpotId) {
        
        // ★ URLを消す前に現在いる Region を控えておく
        const regionToLoad = window.currentRegion || 'KANTO';

        // 1. URLをプレーンに戻す
        const url = new URL(location.href);
        url.searchParams.delete('pref');
        history.replaceState(null, '', url);

        // 2. 状態のリセット (currentRegion は消さない)
        window.currentPref = null;
        window.prefData = null;
        location.hash = '';

        // 3. UIとレイヤーのクリーンアップ
        if (typeof destroyAreaUI === 'function') destroyAreaUI();
        if (typeof removeCrowdImage === 'function') removeCrowdImage();
        if (window.markerControl && typeof window.markerControl.clearLayers === 'function') {
            window.markerControl.clearLayers();
        }
        if (window.phase1Group) window.phase1Group.clearLayers();
        if (window.areaSpotLayer) window.areaSpotLayer.clearLayers();
        
        if (window.prefSpotLayer) {
            window.map.removeLayer(window.prefSpotLayer);
            window.prefSpotLayer = null;
        }
        
        const alertBar = document.getElementById("alert-bar");
        if (alertBar) alertBar.textContent = "";

        document.getElementById('map-back-btn').style.display = 'none';

        // 4. ★ 控えておいた Region を指定してマップを再読み込みする
        loadRegionMap(regionToLoad);
        return;
    }
    
    // --- ここから下は元の処理 ---
    
    // ※エラー防止のため map → window.map に統一しています
    window.map.touchZoom.disable();
    window.map.dragging.disable();

    const area = window.areaData.find(a =>
        String(a.individualId) === String(window.currentAreaId?.split('_')[1])
    );

    if (!area) return;

    const z = window.map.getZoom();
    const restoreSpot = buildSpotRestoreObject();
    const isSpecial = restoreSpot && restoreSpot.type && restoreSpot.type.split('$')[0] === 'special';

    // -----------------------------------------------------
    // ★ ご提案のフェイルセーフフラグを1行追加！
    // OSMレイヤーが存在していれば「確実にPhase2にいる」と判定できる
    // -----------------------------------------------------
    const isPhase2 = !!window.osmLayer;

    // =====================================================
    // ① phase2 → phase1（※実質：スポット詳細 → Phase2 へ戻る）
    // =====================================================
    // isPhase2がtrue（OSM展開済み）の時はここをブロックし、isSpecialによる無限ループを防ぐ
    if ((z > 13 || isSpecial) && !isPhase2) {
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

        if (!restoreSpot) return;

        // spotキー除去
        const spotKey = window.currentSpotId?.split('_')[2];
        if (spotKey) {
            location.hash = location.hash.replace('/' + spotKey, '');
        }

        updateStateFromHash();
        removeWeekItem();
        resetWeatherUI();

        // 再構築
        showSpotsForArea(window.currentAreaId);
        selectSpot(restoreSpot);
        enablePhase2(window.map);
        phase1menu(window.currentAreaId);
        
        return;
    }

    // =====================================================
    // ② phase1維持（※実質：Phase2 → Phase1 へ戻る）
    // =====================================================
    // ズームが13.01などにブレていても、isPhase2がtrueなら確実にここを通しOSMを剥がす
    if (z === 13 || isPhase2) {
        disablePhase2(window.map);
        clearSub2Weather();
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
        renderCrowdImage();
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
    
    // ★変更点：県レベルに戻ったとき、さらにRegionへ戻れるようボタンは「表示」したままにする
    document.getElementById('map-back-btn').style.display = 'block';

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

        resetAreaGuide();
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
    individualId: spot.individualId || spot.id || '',
    type: spot.type || ''
};
    
}