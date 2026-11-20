window.selectArea = selectArea;
window.selectSpot = selectSpot;
window.prefData = window.prefData ?? null;
window.areaData = window.areaData || [];
window.spotData = window.spotData || [];
window.currentAreaId = window.currentAreaId ?? null;
window.fishDataCache = window.fishDataCache || {};

// loadLocationJSON / drawLocation / タイル待機キュー(runAfterTileLoad等) は index.txt へ移動済み

// ==========================================
// ★ SEO対策用：HTML文字列を一括生成する関数（対象魚非表示版）
// ==========================================
function buildSeoHtmlString(mainData, areasData, spotsData) {
    if (!mainData) return '';
    const regionName = window.currentRegion || '関東地方';
    const prefName = mainData.notes;
    let html = '';
    
    areasData.forEach(area => {
        const areaKey = area.areaId + '_' + area.individualId;
        
        // ★ 修正：null, undefined, 空文字('') をすべて弾き、確実にzoom値があるものだけを厳選
        const areaSpots = spotsData.filter(s => 
            s.areaId === areaKey && 
            s.icon && s.icon.trim() !== '' &&
            s.zoom != null && s.zoom !== '' 
        );
        
        if (areaSpots.length > 0) {
            html += `<h3 style="margin-top:15px; border-bottom:1px solid #ccc;">${area.name}</h3>`;
            html += `<ul style="list-style-type:none; padding-left:10px;">`;
            
            areaSpots.forEach(spot => {
                const url = `/?region=${encodeURIComponent(regionName)}&pref=${encodeURIComponent(prefName)}&area=${encodeURIComponent(area.name)}&spot=${encodeURIComponent(spot.name)}`;
                
                html += `<li style="margin:5px 0;"><a href="${url}" style="color:#0066cc; text-decoration:underline;">${spot.name}</a></li>`;
            });
            
            html += `</ul>`;
        }
    });
    return html;
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
        
        // 1. クエリを更新（日本語名notesを使用）
        if (window.prefData) setIdealQuery('pref', window.prefData.notes);
        setIdealQuery('area', nextArea.name);
        setIdealQuery('spot', null);

        // 2. システム変数を直接更新
        window.currentAreaId = nextArea.areaId + '_' + nextArea.individualId;
        window.currentSpotId = null;
        
        window.map.setMaxBounds(null);
        window.map.options.maxBoundsViscosity = 0;
        window.areaBounds = null;
        window.goBackGuard = true;
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
    if (typeof showPrefSpots === 'function') showPrefSpots();
    
    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;
    
    if (window.spotLayer) {
        window.map.removeLayer(window.spotLayer);
        window.spotLayer = null;
    }

    if (window.markerControl?.shop01Layer) {
        window.map.removeLayer(markerControl.shop01Layer);
        markerControl.shop01Layer = null;
    }

    prefetchAround(areaObj);
    
    const targetZoom = areaObj.zoom || window.prefData.zoom;
    const center = window.map.getCenter();
    const isSameLoc = center && Math.abs(center.lat - areaObj.lat) < 0.0001 && 
                      Math.abs(center.lng - areaObj.lng) < 0.0001 && 
                      window.map.getZoom() === targetZoom;

    drawLocation(
        areaObj.name,
        areaObj.lat,
        areaObj.lng,
        targetZoom
    );
    
    document.getElementById('map-menu').style.display = 'none';

    const finalizeArea = () => {
        window.map.invalidateSize(true);
        openArea(areaObj.individualId);
        showSpotsForArea(window.currentAreaId);
        // 👇【ここに追加】県スワイプをOFFにしてから、エリアスワイプをONにする
        if (typeof disablePrefSwipe === 'function') disablePrefSwipe();
        enableAreaSwipe();
        phase1menu(window.currentAreaId);
        //clearSpotUI();

        

        


        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (window.markerControl) {
                    markerControl.showShop01(window.currentAreaId);
                }

                const btn = document.getElementById('map-back-btn');
                if (btn) {
                    btn.style.opacity = '0';
                    btn.style.display = 'block';
                    requestAnimationFrame(() => {
                        btn.style.transition = 'opacity 0.4s ease';
                        btn.style.pointerEvents = 'auto';
                        btn.style.opacity = '1';
                    });
                }
                   window.goBackGuard = false;
                   showRoadLayers();


                   saveMapState();
            });
        });
    };

    if (isSameLoc) {
        finalizeArea();
    } else {
        window.map.once('moveend', finalizeArea);
    }
}

function saveMapState() {

    // GSIが存在して、かつ現在マップに載っているかだけを見る
    const isOrt = !!(window.gsiLayer && window.map.hasLayer(window.gsiLayer));

    window.mapStateSnapshot = {
        isOrt: isOrt
    };
}

function showSpotsForArea(areaKey) {

    if (!window.areaSpotLayer) {
        window.areaSpotLayer = L.layerGroup().addTo(window.map);
    } else {
        window.areaSpotLayer.clearLayers();
    }

    // 以下そのまま

    // =====================================================
    // ★ 変更点1: マーカー表示用（エリア制限を外して県内全件抽出）
    // =====================================================
    const allPrefSpots = window.spotData.filter(s => 
        s.icon && s.icon.trim() !== ''
    );
    
    // =====================================================
    // ★ 変更点2: ズーム計算用（クリックされたエリアのみ抽出）
    // =====================================================
    const targetAreaSpots = window.spotData.filter(s => 
        s.areaId === areaKey && s.icon && s.icon.trim() !== ''
    );

    if (!allPrefSpots.length) return;

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    // 1. 県内の【全スポット】に対してテキストマーカーを生成して地図に追加
    allPrefSpots.forEach(spot => {
        let type = 'spot';
        if (spot.icon && spot.icon.startsWith('fish')) {
            const match = spot.icon.match(/fish\d+/);
            if (match) type = match[0];
        }

        const isFish = type.startsWith('fish');

        const marker = L.marker([spot.lat, spot.lng], {
            icon: L.divIcon({
                className: 'custom-text-marker',
                html: `<div class="spot-text ${type}">${spot.name}</div>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0]
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
    });

    // 2. カメラの枠（Bounds）計算は【対象エリア】の座標だけを使って行う
    if (targetAreaSpots.length > 0) {
        targetAreaSpots.forEach(spot => {
            const lat = Number(spot.lat);
            const lng = Number(spot.lng);

            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
            }
        });

        // 最低限の広さを保証する余白計算
        const latBuffer = Math.max((maxLat - minLat) * 0.2, 0.05);
        const lngBuffer = Math.max((maxLng - minLng) * 0.2, 0.05);

        window.areaBounds = L.latLngBounds(
            [minLat - latBuffer, minLng - lngBuffer],
            [maxLat + latBuffer, maxLng + lngBuffer]
        );
    }
}

async function selectSpot(spot) {
    if (!window.map || !spot) return;
    hideRoadLayers();

    const currentZoom = window.map.getZoom();

    if (currentZoom === 13 && !window._isRestoringSpot) {
        if (spot.zoom !== '') {
            if (typeof zoomToSpot === 'function') zoomToSpot(spot);
        } else {
            if (typeof showFishPopup === 'function') showFishPopup(spot);
        }
        return;
    }

    if (window.markerControl) {
        markerControl.showShop02(window.currentAreaId);
    }
    if (window.phase1Group) {
        window.phase1Group.clearLayers();
    }

    if (!window.osmLayer) {
        window.osmLayer = L.tileLayer(
            window.TILE_URLS.osm,
            {
                attribution: '© OpenStreetMap contributors',
                className: 'osm-solid-layer',
                updateWhenIdle: false,
                updateWhenZooming: true,
                updateWhenDragging: true,
                keepBuffer: 4,
                fadeAnimation: false,
                opacity: 0,
                zIndex: 999 
            }
        ).addTo(window.map);
    } else {
        if (!window.map.hasLayer(window.osmLayer)) {
            window.osmLayer.addTo(window.map);
        }
        window.osmLayer.setZIndex(999);
        window.osmLayer.setOpacity(0);
    }

    const doOsmFade = () => {
        const osmContainer = window.osmLayer.getContainer();
        const gsiContainer = window.gsiLayer ? window.gsiLayer.getContainer() : null;

        if (osmContainer) {
            osmContainer.style.transition = 'opacity 2s ease';
            window.osmLayer.setOpacity(1);

            if (gsiContainer && window.gsiLayer) {
                gsiContainer.style.transition = 'opacity 2s ease';
                window.gsiLayer.setOpacity(0);
            }
            setTimeout(() => {
                if (window.gsiLayer) window.gsiLayer.setZIndex(1);
            }, 2000);
        }
    };

    if (window.osmLayer.isLoading && window.osmLayer.isLoading()) {
        let isLoaded = false;
        window.osmLayer.once('load', () => {
            if (isLoaded) return;
            isLoaded = true;
            doOsmFade();
        });
        setTimeout(() => {
            if (!isLoaded) {
                isLoaded = true;
                doOsmFade();
            }
        }, 1000);
    } else {
        requestAnimationFrame(doOsmFade);
    }

    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;

    // 👇【ここに追加】スポット詳細では両方のスワイプをOFFにする
    disableAreaSwipe();
    if (typeof disablePrefSwipe === 'function') disablePrefSwipe();



    const center = window.map.getCenter();
    const isSameLoc = center && Math.abs(center.lat - spot.lat) < 0.0001 && 
                      Math.abs(center.lng - spot.lng) < 0.0001 && 
                      window.map.getZoom() === 13;

    drawLocation(spot.name, spot.lat, spot.lng, 13);

    const finalizeSelectSpot = () => {
        window.map.invalidateSize(true);
        if (!window.areaBounds && window.currentAreaId) {
            showSpotsForArea(window.currentAreaId);
        }
        requestAnimationFrame(() => {
            // ★ ここで areaBounds の上書きを消し、純粋に県全体 (prefBounds) をセットする
            if (typeof enableDragForArea === 'function') enableDragForArea();
            
            enablePhase2(window.map);
            window.map.getContainer().classList.add('is-spot-mode');
            window._isRestoringSpot = false;
            window._selectSpotCompleted = true;
            window.goBackGuard = false;
        });
    };

    if (isSameLoc) {
        finalizeSelectSpot();
    } else {
        window.map.once('moveend', finalizeSelectSpot);
    }
}

function enableDragForArea() {
    // 他の操作制限はいじらず、計算済みのBounds適用とドラッグ許可のみを行う
    if (!window.map || !window.prefBounds || !window.prefBounds.isValid()) {
        return;
    }
    
    window.map.dragging.enable();
    window.map.setMaxBounds(window.prefBounds);
    window.map.options.maxBoundsViscosity = 1.0;
}

function phase1menu(areaId) {

    window.substitute = null;

    const menu = document.getElementById("map-menu");
    const ul = menu?.querySelector("ul");
    if (!ul || !window.spotData) return;

    // ==========================================
    // ★ 修正1：メニュー項目の抽出（$で分割し、どれか1つでも含まれていればOK）
    // ==========================================
    const items = window.spotData
        .filter(s => {
            if (s.areaId !== areaId) return false;
            const typeParts = (s.type || "").split('$');
            return typeParts.includes("representative") || typeParts.includes("assistant");
        })
        .sort((a, b) => b.lat - a.lat);

    // ==========================================
    // ★ 修正2：補欠(substitute)の抽出（$で分割し、含まれているか判定）
    // ==========================================
    window.substitute = window.spotData.find(s => {
        if (s.areaId !== areaId) return false;
        const typeParts = (s.type || "").split('$');
        return typeParts.includes("substitute");
    }) || null;

    // =====================
    // リスト削除（スッキリ書き換え）
    // =====================
    const oldItems = ul.querySelectorAll('li');
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
        const w = typeof formatPrefWeather === 'function' ? formatPrefWeather(s.whether) : null;
        if (!w) {
            bottom.textContent = "no data";
        } else {

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

            const mIcon = iconMorning != null && typeof toWeatherIcon === 'function' ? toWeatherIcon(iconMorning) : '';
            const aIcon = iconAfternoon != null && typeof toWeatherIcon === 'function' ? toWeatherIcon(iconAfternoon) : '';

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

let phase2Initialized = false;
let lastVisibleSet = new Set();
// -------------------------
// ★グローバルで管理
// -------------------------
let phase2Timer = null;
// ★ グローバルで引き戻し中のフラグを管理（無限ループ防止）
window._isSnappingBack = false;

function enablePhase2(map) {
    if (!map) return;

    if (map._phase2Handler) {
        map.off('dragend', map._phase2Handler);
        map.off('moveend', map._phase2Handler);
    }
    
    const runPhase2 = () => {
        //clearSpotUI();
        if (!window.phase2Initialized || window._isSnappingBack) return;

        if (window.phase2Timer) {
            clearTimeout(window.phase2Timer);
        }

        window.phase2Timer = setTimeout(() => {
            if (!window.phase2Initialized || window._isSnappingBack) return;

            processSpotUtils(map);
            showNearestSpotName(map);

            if (window.map.getZoom() === 13 && window.spotData && window.currentAreaId) {
                const center = window.map.getCenter();
                const isInsideArea = window.areaBounds ? window.areaBounds.contains(center) : true;

                if (!isInsideArea) {
                    let nearestSpot = null;
                    let minDistance = Infinity;

                    window.spotData.forEach(spot => {
                        const lat = Number(spot.lat);
                        const lng = Number(spot.lng);
                        if (Number.isFinite(lat) && Number.isFinite(lng)) {
                            const distance = center.distanceTo(L.latLng(lat, lng));
                            if (distance < minDistance) {
                                minDistance = distance;
                                nearestSpot = spot;
                            }
                        }
                    });

                    if (nearestSpot) {
                        // C. 最寄りスポットが同エリアなら強制引き戻し
                        if (nearestSpot.areaId === window.currentAreaId) {
                            window._isSnappingBack = true;
                            
                            map.setMaxBounds(null);
                            map.options.maxBoundsViscosity = 0;
                            
                            map.flyTo([nearestSpot.lat, nearestSpot.lng], 13, { duration: 0.5 });
                            
                            map.once('moveend', () => {
                                map.invalidateSize(true);
                                
                                if (!window.areaBounds) {
                                    showSpotsForArea(window.currentAreaId);
                                }
                                
                                // ★ 修正: areaBounds で上書きせず、県全体 (prefBounds) を再セットする
                                if (typeof enableDragForArea === 'function') {
                                    enableDragForArea();
                                }
                                
                                setTimeout(() => {
                                    window._isSnappingBack = false;
                                }, 100);
                            });
                            return;
                        } 
                        // D. 別のエリアに所属している場合はシームレスなエリア更新
                        else {
                            console.log(`エリア変更: ${window.currentAreaId} -> ${nearestSpot.areaId}`);
                            
                            window.currentAreaId = nearestSpot.areaId;
                            window.currentSpotId = null; 

                            const newArea = window.areaData.find(a => String(a.areaId + '_' + a.individualId) === window.currentAreaId);
                            if (newArea && window.prefData && typeof setIdealQuery === 'function') {
                                setIdealQuery('pref', window.prefData.notes);
                                setIdealQuery('area', newArea.name);
                                setIdealQuery('spot', null);
                            }

                            if (typeof clearSpotUI === 'function') clearSpotUI();
                            const nsEl = document.getElementById("nearest-spot");
                            if (nsEl) nsEl.textContent = "";

                            const targetAreaSpots = window.spotData.filter(s => s.areaId === window.currentAreaId);
                            if (targetAreaSpots.length > 0) {
                                let minLat = Infinity, maxLat = -Infinity;
                                let minLng = Infinity, maxLng = -Infinity;
                                
                                targetAreaSpots.forEach(s => {
                                    minLat = Math.min(minLat, s.lat);
                                    maxLat = Math.max(maxLat, s.lat);
                                    minLng = Math.min(minLng, s.lng);
                                    maxLng = Math.max(maxLng, s.lng);
                                });
                                
                                const latBuffer = Math.max((maxLat - minLat) * 0.1, 0.02);
                                const lngBuffer = Math.max((maxLng - minLng) * 0.1, 0.02);
                                
                                window.areaBounds = L.latLngBounds(
                                    [minLat - latBuffer, minLng - lngBuffer],
                                    [maxLat + latBuffer, maxLng + lngBuffer]
                                );
                                
                                // ★ 修正: areaBounds で上書きせず、県全体 (prefBounds) のドラッグ範囲を維持する
                                if (typeof enableDragForArea === 'function') {
                                    enableDragForArea();
                                }
                            }

                            if (typeof phase1menu === 'function') phase1menu(window.currentAreaId);
                            if (window.markerControl && typeof markerControl.showShop02 === 'function') {
                                markerControl.showShop02(window.currentAreaId);
                            }

                            if (typeof updateSeoMeta === 'function') updateSeoMeta();
                        }
                    }
                }
            }
        }, 80);
    };

    map._phase2Handler = runPhase2;

    map.on('dragend', runPhase2);
    map.on('moveend', runPhase2);

    window.phase2Initialized = true; 
    
    runPhase2();

    removeCrowdImage();
}

function disablePhase2(map) {
    if (!map) return;

    window.phase2Initialized = false;

    if (map._phase2Handler) {
        map.off('dragend', map._phase2Handler);
        map.off('moveend', map._phase2Handler);
        map._phase2Handler = null;
    }

    if (window.phase2Timer) {
        clearTimeout(window.phase2Timer);
    }

    window.lastVisibleSet = new Set();
    
    // ★ 追加：広域に戻る時に、プリロード済み履歴をリセットする
    window._preloadedSpots = new Set();

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

    window._preloadedSpots = window._preloadedSpots || new Set();

    const bounds = map.getBounds().pad(0.5);

    // 画面内であり、ズームが設定されているスポットを抽出
    const visibleSpots = window.spotData.filter(s =>
        bounds.contains([s.lat, s.lng]) && s.zoom && s.zoom !== ''
    );

    if (!visibleSpots.length) return;

    // ★ トップ3に絞る制限を削除し、視界内の全スポットをプリロード対象にします

    for (const s of visibleSpots) {
        const spotKey = s.individualId || s.name;
        if (window._preloadedSpots.has(spotKey)) {
            continue; // 処理済みのものはスキップ
        }
        
        window._preloadedSpots.add(spotKey);

        const lat = Number(s.lat);
        const lng = Number(s.lng);

        if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

        const typeParts = (s.type || '').split('$');
        let baseTileUrl;
        if (typeParts.includes('ort')) {
            baseTileUrl = window.TILE_URLS.ort;
        } else if (typeParts.includes('airphoto')) {
            baseTileUrl = window.TILE_URLS.airphoto;
        } else if (typeParts.includes('rinya')) {
            baseTileUrl = window.TILE_URLS.rinya;
        } else {
            baseTileUrl = window.TILE_URLS.photo;
        }

        // =====================================================
        // ★ 実際に飛ぶ先のズームレベルでキャッシュする処理は維持
        // =====================================================
        const isSpecial = typeParts.includes('special');
        // 14未満は14、それ以外は設定値のズーム
        const targetZoom = isSpecial ? 14 : (s.zoom < 14 ? 14 : s.zoom);
        const fetchZoom = Math.floor(targetZoom); 

        const n = Math.pow(2, fetchZoom);
        const baseUrl = baseTileUrl.replace('{z}', fetchZoom);

        const tileX = Math.floor((lng + 180) / 360 * n);
        const latRad = lat * Math.PI / 180;
        const tileY = Math.floor(
            (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
        );

        // 2x2プリロード（計4枚）
        for (let dx = 0; dx <= 1; dx++) {
            for (let dy = 0; dy <= 1; dy++) {
                const url = baseUrl
                    .replace('{x}', tileX + dx)
                    .replace('{y}', tileY + dy);

                const img = new Image();
                img.src = url;
            }
        }

        if (typeof swapWithSubstitute === 'function') {
            swapWithSubstitute(s);
        }
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
    const w = typeof formatPrefWeather === 'function' ? formatPrefWeather(spot.whether) : null;
    if (!w) {
        container.style.display = "none";
        container.textContent = "";
        return;
    }

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

        const mIcon = iconMorning != null && typeof toWeatherIcon === 'function' ? toWeatherIcon(iconMorning) : '';
        const aIcon = iconAfternoon != null && typeof toWeatherIcon === 'function' ? toWeatherIcon(iconAfternoon) : '';

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

// showFishPopup 〜 clearSpotUI は /js/spotLoader.js へ移動済み

// goBack は index.txt へ移動済み


// buildSpotRestoreObject は /js/spotLoader.js へ移動済み



// ==========================================
// 道路レイヤー管理 (非同期バックグラウンドロード ＆ 自動フェードイン版)
// ==========================================

// ★ CSSを一括制御するためのスタイルを動的に追加
const roadStyleEl = document.createElement('style');
roadStyleEl.innerHTML = `
    .road-motorway {
        stroke-width: var(--motorway-weight, 2px) !important;
    }
    .road-trunk {
        stroke-width: var(--trunk-weight, 1.5px) !important;
    }
`;
document.head.appendChild(roadStyleEl);

let roadLayerGroup = null;
let motorwayRenderer = null;
let trunkRenderer = null;

// JSONデータのメモリキャッシュ
let cachedMotorwayData = null;
let cachedTrunkData = null;
let roadDataPromise = null;
let roadRenderPromise = null;

window.isRoadReady = false;
window._isRoadLoading = false;
window._shouldShowRoad = false;
window._roadQueued = false;

function isSpotContextForRoad() {
    if (typeof window.isSpotScreen === 'function') return window.isSpotScreen();
    return !!(window.currentSpotId || new URLSearchParams(window.location.search).get('spot'));
}

function isPhase2ContextForRoad() {
    const mapContainer = (window.map && typeof window.map.getContainer === 'function')
        ? window.map.getContainer()
        : null;
    return !!(
        window.phase2Initialized ||
        window._isRestoringSpot ||
        (mapContainer && mapContainer.classList.contains('is-spot-mode'))
    );
}

function fetchRoadJsonWithRetry(url, retries = 1) {
    return fetch(url, { priority: 'low' }).then(r => {
        if (!r.ok) throw new Error('road JSON fetch failed: ' + r.status);
        return r.json();
    }).catch(err => {
        if (retries > 0) {
            return new Promise(resolve => setTimeout(resolve, 350))
                .then(() => fetchRoadJsonWithRetry(url, retries - 1));
        }
        throw err;
    });
}

// 道路JSONの取得のみ。読み込み中・読み込み済みなら既存Promise/データを再利用する（スポット画面では取得しない）。
window.loadRoadData = function() {
    if (isSpotContextForRoad()) return Promise.resolve(null);
    if (cachedMotorwayData && cachedTrunkData) return Promise.resolve([cachedMotorwayData, cachedTrunkData]);
    if (roadDataPromise) return roadDataPromise;
    const regionCode = window.currentRegion || 'KANTO';
    roadDataPromise = Promise.all([
        fetchRoadJsonWithRetry(`/${regionCode}/enc_motorway.json`, 1),
        fetchRoadJsonWithRetry(`/${regionCode}/enc_trunk.json`, 1)
    ]).then(([motorwayData, trunkData]) => {
        cachedMotorwayData = motorwayData || [];
        cachedTrunkData = trunkData || [];
        return [cachedMotorwayData, cachedTrunkData];
    }).catch(error => {
        roadDataPromise = null;
        console.warn('道路JSON取得スキップ:', error && error.message ? error.message : error);
        return null;
    });
    return roadDataPromise;
};

// 取得済みJSONから道路レイヤーを生成・描画する。
function renderRoadLayers(map) {
    if (!map || window.isRoadReady || isSpotContextForRoad()) return Promise.resolve();
    if (roadRenderPromise) return roadRenderPromise;
    window._isRoadLoading = true;
    if (!map.getPane('trunkPane')) {
        map.createPane('trunkPane');
        const pane = map.getPane('trunkPane');
        pane.style.zIndex = 401;
        pane.style.opacity = '0';
        pane.style.transition = 'opacity 2s ease';
    }
    if (!map.getPane('motorwayPane')) {
        map.createPane('motorwayPane');
        const pane = map.getPane('motorwayPane');
        pane.style.zIndex = 402;
        pane.style.filter = 'drop-shadow(2px 3px 4px rgba(0, 0, 0, 0.7))';
        pane.style.opacity = '0';
        pane.style.transition = 'opacity 2s ease';
    }
    trunkRenderer = L.svg({ pane: 'trunkPane', padding: 1.5 });
    motorwayRenderer = L.svg({ pane: 'motorwayPane', padding: 1.5 });
    roadLayerGroup = L.layerGroup();

    roadRenderPromise = window.loadRoadData().then(data => {
        if (!data || !cachedMotorwayData || !cachedTrunkData || isSpotContextForRoad()) {
            window._isRoadLoading = false;
            roadRenderPromise = null;
            return;
        }
        return new Promise(resolve => {
            let mIdx = 0, tIdx = 0;
            function buildRoadSlice() {
                const start = performance.now();
                while (mIdx < cachedMotorwayData.length && (performance.now() - start) < 4) {
                    const item = cachedMotorwayData[mIdx++];
                    roadLayerGroup.addLayer(L.Polyline.fromEncoded(item.p, {
                        className: 'road-motorway', color: '#155934',
                        interactive: false, renderer: motorwayRenderer
                    }));
                }
                while (tIdx < cachedTrunkData.length && (performance.now() - start) < 4) {
                    const item = cachedTrunkData[tIdx++];
                    roadLayerGroup.addLayer(L.Polyline.fromEncoded(item.p, {
                        className: 'road-trunk', color: '#DCDCDC',
                        interactive: false, renderer: trunkRenderer
                    }));
                }
                if (mIdx < cachedMotorwayData.length || tIdx < cachedTrunkData.length) {
                    requestAnimationFrame(buildRoadSlice);
                } else {
                    window.isRoadReady = true;
                    window._isRoadLoading = false;
                    map.on('zoomend', updateRoadStyle);
                    if (window._shouldShowRoad && !isSpotContextForRoad() && !isPhase2ContextForRoad()) {
                        triggerRoadFadeIn();
                    }
                    resolve();
                }
            }
            requestAnimationFrame(buildRoadSlice);
        });
    }).catch(error => {
        window._isRoadLoading = false;
        roadRenderPromise = null;
        console.warn('道路レイヤー描画スキップ:', error && error.message ? error.message : error);
    });
    return roadRenderPromise;
}

// 準備完了後、レイヤーをマップに追加してフェードインする処理
function triggerRoadFadeIn() {
    if (!window.map || !window.isRoadReady || !roadLayerGroup) return;
    if (!window._shouldShowRoad || isSpotContextForRoad() || isPhase2ContextForRoad()) return;

    if (!window.map.hasLayer(roadLayerGroup)) {
        roadLayerGroup.addTo(window.map);
    }

    // 線の太さを先に更新
    const currentZoom = window.map.getZoom();
    const motorwayPane = window.map.getPane('motorwayPane');
    const trunkPane = window.map.getPane('trunkPane');

    if (motorwayPane && trunkPane && currentZoom <= 13.5) {
        const motorwayWeight = Math.max(1.0, 1.5 + (currentZoom - 10) * 0.8);
        const trunkWeight    = Math.max(0.5, 1 + (currentZoom - 10) * 0.5);

        motorwayPane.style.setProperty('--motorway-weight', motorwayWeight + 'px');
        trunkPane.style.setProperty('--trunk-weight', trunkWeight + 'px');
    }

    // DOMの反映を待ってから opacity を上げてフェードイン
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (!window._shouldShowRoad || isSpotContextForRoad() || isPhase2ContextForRoad()) return;
            const latestZoom = window.map ? window.map.getZoom() : currentZoom;
            if (latestZoom <= 13.5) {
                if (motorwayPane) motorwayPane.style.opacity = '1';
                if (trunkPane) trunkPane.style.opacity = '0.5';
            }
        });
    });
}

function updateRoadStyle() {
    if (!window.map || !roadLayerGroup || !window.map.hasLayer(roadLayerGroup)) return;

    const motorwayPane = window.map.getPane('motorwayPane');
    const trunkPane = window.map.getPane('trunkPane');
    if (!motorwayPane || !trunkPane) return;

    if (!window._shouldShowRoad || isSpotContextForRoad() || isPhase2ContextForRoad()) {
        motorwayPane.style.opacity = '0';
        trunkPane.style.opacity = '0';
        return;
    }

    const currentZoom = window.map.getZoom();

    if (currentZoom <= 13.5) {
        const motorwayWeight = Math.max(1.0, 1.5 + (currentZoom - 10) * 0.8);
        const trunkWeight    = Math.max(0.5, 1.0 + (currentZoom - 10) * 0.5);

        motorwayPane.style.setProperty('--motorway-weight', motorwayWeight + 'px');
        trunkPane.style.setProperty('--trunk-weight', trunkWeight + 'px');

        motorwayPane.style.opacity = '1';
        trunkPane.style.opacity = '0.5'; 
    } else {
        motorwayPane.style.opacity = '0';
        trunkPane.style.opacity = '0';
    }
}

// ==========================================
// ★ Phase2復帰時などに「非表示のまま」バックグラウンドで道路データの取得・生成だけ進める関数
// ==========================================
window.preloadRoadLayers = function() {
    if (!window.map || window.isRoadReady || window._isRoadLoading || isSpotContextForRoad()) return;
    // 表示フラグ(_shouldShowRoad)は立てずに裏で取得・ポリライン生成のみ完了させる
    const runPreload = () => {
        if (!window.map || window.isRoadReady || window._isRoadLoading || isSpotContextForRoad()) return;
        return renderRoadLayers(window.map);
    };
    if (window._firstTileLoaded || typeof window.runAfterTileLoad !== 'function') {
        runPreload();
    } else {
        window.runAfterTileLoad(runPreload);
    }
};

// ==========================================
// ★ レイヤー自体の存在・表示状態のみで判定する関数（初回タイル優先版）
// ==========================================
window.showRoadLayers = function() {
    // ★ スポット詳細画面・Phase2画面では道路を表示しない
    if (isSpotContextForRoad() || isPhase2ContextForRoad()) {
        window._shouldShowRoad = false;
        return;
    }
    window._shouldShowRoad = true;
    if (!window.map) return;
    if (window.isRoadReady) {
        triggerRoadFadeIn();
    } else {
        if (window._roadQueued || window._isRoadLoading) return;
        window._roadQueued = true;
        // JSON取得は先行し、ベースタイル完了後のキューでは描画だけを行う
        const runRoad = () => {
            window._roadQueued = false;
            if (!window._shouldShowRoad || !window.map || isSpotContextForRoad() || isPhase2ContextForRoad()) return;
            return renderRoadLayers(window.map);
        };
        if (typeof window.runAfterTileLoad === 'function') {
            window.runAfterTileLoad(runRoad);
        } else {
            runRoad();
        }
    }
};

window.hideRoadLayers = function() {
    window._shouldShowRoad = false;
    if (!window.map || !roadLayerGroup) return;

    const motorwayPane = window.map.getPane('motorwayPane');
    const trunkPane = window.map.getPane('trunkPane');
    
    if (motorwayPane) motorwayPane.style.opacity = '0';
    if (trunkPane) trunkPane.style.opacity = '0';

    if (window.map.hasLayer(roadLayerGroup)) {
        window.map.removeLayer(roadLayerGroup);
    }
};

