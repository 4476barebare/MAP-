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



// ==========================================
// ★ スポット用データをJSONから読み込む関数（爆速化版）
// ==========================================
function loadLocationJSON(jsonUrl) {
    const pref = window.currentPref; // 現在の県コード（例: "CHIBA"）

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

        if (window[`${pref}_areaGraph`]) {
            window.areaGraph = window[`${pref}_areaGraph`];
        } else {
            buildAreaGraphFromGrid(window.areaData);
            window[`${pref}_areaGraph`] = window.areaGraph;
        }

        // ★ キャッシュからSEOリストを復元してDOMに即反映
        const container = document.getElementById('seo-link-container');
        const titleSpan = document.getElementById('seo-list-title');
        if (container && titleSpan && window.prefData) {
            titleSpan.textContent = `${window.prefData.notes}の釣りスポット一覧を見る`;
            container.innerHTML = window[`${pref}_seoHtml`] || '';
        }

        return Promise.resolve({
            main: window.prefData,
            areas: window.areaData,
            spots: window.spotData
        });
    }

    // ==========================================
    // ★ 分岐B：まだ無い場合は続行して fetch してJSONを直接使用する
    // ==========================================
    return fetch(jsonUrl)
        .then(r => r.json()) // ★ text() から json() に変更
        .then(allRows => {   // ★ CSVをカンマでsplitするループが丸ごと消滅！
            
            let main = null;
            const areas = [];
            const spots = [];

            // 既存の squareX/Y を追加する処理
            allRows.forEach(row => {
                row.squareX = null;
                row.squareY = null;
            });

            // 県本体（main）の抽出
            allRows.forEach(row => {
                if (!row.areaId && row.name === pref) {
                    main = row;
                }
            });

            // エリア（areas）の抽出とグリッド計算
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

            // スポット（spots）の抽出
            allRows.forEach(row => {
                const icon = row.icon;
                if (!icon) return;
                if (icon === 'spot' || icon.startsWith('fish')) {
                    spots.push(row);
                }
            });

            // グローバル変数へ代入
            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;

            // キャッシュ用変数へ代入
            window[`${pref}_prefData`] = main;
            window[`${pref}_areaData`] = areas;
            window[`${pref}_spotData`] = spots;

            // エリアグラフの構築とキャッシュ
            buildAreaGraphFromGrid(areas);
            window[`${pref}_areaGraph`] = window.areaGraph;

            // ★ 4. SEO用HTML文字列を生成して金庫にキャッシュ
            const seoHtml = buildSeoHtmlString(main, areas, spots);
            window[`${pref}_seoHtml`] = seoHtml;

            // ★ 5. 初回ロード時にDOMへ即座に書き出す
            const container = document.getElementById('seo-link-container');
            const titleSpan = document.getElementById('seo-list-title');
            if (container && titleSpan && main) {
                titleSpan.textContent = `${main.notes}の釣りスポット一覧を見る`;
                container.innerHTML = seoHtml;
            }

            return { main, areas, spots };
        });
}

// ==========================================
// ★ SEO対策用：HTML文字列を一括生成する関数（爆速処理用）
// ==========================================
function buildSeoHtmlString(mainData, areasData, spotsData) {
    if (!mainData) return '';
    const regionName = window.currentRegion || '関東地方';
    const prefName = mainData.notes;
    let html = '';
    
    areasData.forEach(area => {
        const areaKey = area.areaId + '_' + area.individualId;
        
        // ★変更点：アイコンがあり、かつ zoom が空欄ではない（詳細情報がある）スポットだけを抽出
        const areaSpots = spotsData.filter(s => 
            s.areaId === areaKey && 
            s.icon && s.icon.trim() !== '' &&
            s.zoom !== '' 
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

function prepareFishForArea(areaId) {
    const loadPromise = window.fishData
        ? Promise.resolve()
        : fetch(window.fishUrl)
            .then(res => {
              if (!res.ok) throw new Error("fetch失敗: " + res.status);
              return res.json(); 
            })
            .then(jsonData => {
              window.fishData = jsonData; 
            });

    return loadPromise.then(() => {
        if (!window.spotData) return [];

        const targetSpots = window.spotData.filter(
            s => s.areaId && s.areaId === areaId
        );

        const areaFishData = window.fishData[areaId] || {};

        targetSpots.forEach(spot => {
            const spotFishData = areaFishData[spot.name];
            
            if (spotFishData) {
                const fishList = [];
                for (const fishName in spotFishData) {
                    const info = spotFishData[fishName];
                    if (info && typeof info.coords === 'string' && info.coords !== '') {
                        const points = info.coords.split('|');
                        points.forEach(pt => {
                            const [lat, lng] = pt.split(',');
                            if (lat && lng) {
                                fishList.push(`${fishName}|${lat}|${lng}`);
                            }
                        });
                    }
                }
                spot.URL = fishList.join(',');
            } else {
                spot.URL = "";
            }
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

    // 既にこの県のレイヤーが金庫にあれば、表示に戻して即リターン
    if (window.currentPref && window.prefSpotLayerCache[window.currentPref]) {
        window.prefSpotLayer = window.prefSpotLayerCache[window.currentPref];
        window.prefSpotLayer.addTo(window.map);
        return;
    }

    // ... 前略 ...
    window.prefSpotLayer = L.layerGroup();

    window.spotData.forEach(spot => {
        if (!spot.icon) return;

        let type = 'spot';
        if (spot.icon.startsWith('fish')) {
            const match = spot.icon.match(/fish\d+/);
            if (match) type = match[0];
        }

        // ★ CanvasをやめてDOMマーカーに戻しつつ、極限まで軽量化する
        const marker = L.marker([spot.lat, spot.lng], {
            icon: L.divIcon({
                className: `pref-dot ${type}`, // コンテナ自体に直接クラスを付与
                html: '',                      // 中身を空にしてDOMノード数を半減
                iconSize: [5, 5],
                iconAnchor: [2.5, 2.5]
            }),
            interactive: false, // タップ判定をオフにしてブラウザ負荷を下げる
            keyboard: false
        });

        window.prefSpotLayer.addLayer(marker);
    });
    // ... 後略 ...

    // 新しく作ったレイヤーを金庫に保存しておく
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

    // ★ 追加: 前の画面(スポット等)のBoundsを確実に破棄
    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;
    
    if (window.spotLayer) {
        window.map.removeLayer(window.spotLayer);
        window.spotLayer = null;
    }
    // ... 以下既存のコード ...

    if (window.markerControl?.shop01Layer) {
        window.map.removeLayer(markerControl.shop01Layer);
        markerControl.shop01Layer = null;
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
    // ★ ここにあった map-back-btn の即時表示を削除しました
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
                if (window.markerControl) {
                    markerControl.showShop01(window.currentAreaId);
                }

                // ★ すべての描画処理が完了した最後のタイミングでボタンをフェードイン
                const btn = document.getElementById('map-back-btn');
                if (btn) {
                    btn.style.opacity = '0';
                    btn.style.display = 'block';
                    requestAnimationFrame(() => {
                        btn.style.transition = 'opacity 0.4s ease';
                        btn.style.opacity = '1';
                        saveMapState();
                    });
                }
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

    // 直リンク対策などの初期化処理はそのまま
    if (!window.prefSpotLayer) {
        if (typeof showPrefSpots === 'function') showPrefSpots();
    }

    if (!window.areaSpotLayer) {
        window.areaSpotLayer = L.layerGroup().addTo(window.map);
    } else {
        window.areaSpotLayer.clearLayers();
    }

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

function selectSpot(spot) {
    if (!window.map || !spot) return;
    
    const currentZoom = window.map.getZoom();

    if (currentZoom === 13) {
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
    if (window.phase1Group) {
        window.phase1Group.clearLayers();
    }
    window.osmLayer = L.tileLayer(
        window.TILE_URLS.osm, // ★ ここを変数に置き換え
        {
            attribution: '© OpenStreetMap contributors',
            className: 'osm-solid-layer',
            updateWhenIdle: false,
            updateWhenZooming: true,
            updateWhenDragging: true,
            keepBuffer: 4,
            fadeAnimation: false
        }
    ).addTo(window.map);



    // 過去のBoundsを解除
    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;
    disableAreaSwipe();

    drawLocation(spot.name, spot.lat, spot.lng, 13);
//enablePhase2(window.map);早過ぎ
    window.map.once('moveend', () => {
        window.map.invalidateSize(true);
//enablePhase2(window.map);遅過ぎ
        requestAnimationFrame(() => {


                enableDragForArea();
                enablePhase2(window.map);

    window.map.getContainer().classList.add('is-spot-mode');
    window._selectSpotCompleted = true;

        });
    });

}

function enableDragForArea() {
    // ★ 追加: 意図しない moveend 暴発時の防御。ズーム13以外では絶対に制限をかけない
   // if (window.map.getZoom() !== 13) return;

    // 1. 県全体のバウンズが未計算の場合、全スポットデータから算出する
    if (!window.prefBounds && window.spotData && window.spotData.length > 0) {
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;

        // エリアで絞り込まず、県内の全件（window.spotData）を走査する
        window.spotData.forEach(spot => {
            const lat = Number(spot.lat);
            const lng = Number(spot.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
            }
        });

        // 県全域をカバーするための余白
        const latBuffer = Math.max((maxLat - minLat) * 0.1, 0.05);
        const lngBuffer = Math.max((maxLng - minLng) * 0.1, 0.05);

        window.prefBounds = L.latLngBounds(
            [minLat - latBuffer, minLng - lngBuffer],
            [maxLat + latBuffer, maxLng + lngBuffer]
        );
    }

    if (!window.prefBounds || !window.prefBounds.isValid()) {
        return;
    }

    window.map.dragging.enable();
    
    // ★ areaBounds ではなく、計算した prefBounds を適用する
    window.map.setMaxBounds(window.prefBounds);
    window.map.options.maxBoundsViscosity = 1.0;
}

// =====================================================
// ★ 新規: ドラッグ移動時にエリアの切り替わりを検知する関数
// =====================================================
function checkAreaChangeOnDrag() {
    // ズーム13（スポット画面）の時だけ判定を走らせる
    if (window.map.getZoom() !== 13) return;

    const center = window.map.getCenter();
    let nearestSpot = null;
    let minDistance = Infinity;

    // 1. 画面の中央に最も近いスポットを探す
    if (window.spotData && window.spotData.length > 0) {
        window.spotData.forEach(spot => {
            const lat = Number(spot.lat);
            const lng = Number(spot.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                // Leafletの距離計算機能を使って一番近いスポットを割り出す
                const distance = center.distanceTo(L.latLng(lat, lng));
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestSpot = spot;
                }
            }
        });
    }

    // 2. 最寄りスポットのエリアが「現在のエリア」と違っていたら更新処理を走らせる
    if (nearestSpot && nearestSpot.areaId !== window.currentAreaId) {
        
        // 現在のエリアIDを上書き
        window.currentAreaId = nearestSpot.areaId;

        // =====================================================
        // ▼ エリアが切り替わった時に実行したい関数群をここに並べる
        // =====================================================

        // 例: ショップマーカー（釣具店など）を新しいエリアのデータで出し直す
        if (window.markerControl && typeof markerControl.showShop02 === 'function') {
            markerControl.showShop02(window.currentAreaId);
        }

        // 例: fishdata のロードなど、必要な関数があればここに追加
        // if (typeof loadFishData === 'function') loadFishData(window.currentAreaId);
        
        // 例: エリア名などを更新するUI関数
        // if (typeof phase1menu === 'function') phase1menu(window.currentAreaId);
        
        console.log("スワイプ移動によりエリアが切り替わりました:", window.currentAreaId);
    }
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
    //showdebug("enablePhase2開始");

    // ★二重登録防止
    if (map._phase2Handler) {
        map.off('dragend', map._phase2Handler);
        map.off('moveend', map._phase2Handler);
    }
    
    const runPhase2 = () => {
        // ★無効状態、または引き戻し（スナップバック）中なら何もしない
        if (!window.phase2Initialized || window._isSnappingBack) return;

        clearTimeout(phase2Timer);

        phase2Timer = setTimeout(() => {
            if (!window.phase2Initialized || window._isSnappingBack) return;

            // 1. 既存の処理
            processSpotUtils(map);
            showNearestSpotName(map);

            // =====================================================
            // ★ 新規: エリア内外の判定と、切り替え・強制引き戻し処理
            // =====================================================
            if (window.map.getZoom() === 13 && window.spotData && window.currentAreaId) {
                const center = window.map.getCenter();
                
                // A. まず、今の座標が「現在のエリア内」かどうかを判定する
                // （areaBounds が存在し、かつその枠内に中心座標が収まっているか）
                const isInsideArea = window.areaBounds ? window.areaBounds.contains(center) : true;

                // B. エリア外にはみ出している時の処理
                if (!isInsideArea) {
                    let nearestSpot = null;
                    let minDistance = Infinity;

                    // 1番近いスポットの座標を計算
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
                        // C. 1番近いスポットが現在のエリアに所属している場合（引き戻し）
                        if (nearestSpot.areaId === window.currentAreaId) {
                            console.log("エリア外検知: 最寄りが同エリアのため強制引き戻します", nearestSpot.name);
                            
                            // ★ イベントリスナーは絶対に外さず、フラグで無限ループをガードする
                            window._isSnappingBack = true;
                            
                            // スムーズに戻れるように一旦バウンズを解除
                            map.setMaxBounds(null);
                            map.options.maxBoundsViscosity = 0;
                            
                            // そのスポットへ強制的に戻す
                            map.flyTo([nearestSpot.lat, nearestSpot.lng], 13, { duration: 0.5 });
                            
                            // 移動完了を待つ
                            map.once('moveend', () => {
                                map.invalidateSize(true);
                                
                                // enableDragForAreaと同等のバウンズ再設定処理
                                if (window.areaBounds && window.areaBounds.isValid()) {
                                    map.setMaxBounds(window.areaBounds);
                                    map.options.maxBoundsViscosity = 1.0;
                                    map.dragging.enable();
                                }
                                
                                // 引き戻し完了後、フラグを下ろして判定を再開させる
                                setTimeout(() => {
                                    window._isSnappingBack = false;
                                }, 100);
                            });
                            
                            return; // 引き戻し中はこれ以降の処理を中断
                        } 
                        // D. 1番近いスポットが別のエリアに所属している場合（エリア更新）
                        else {
                            // 新しいエリアIDに上書き
                            window.currentAreaId = nearestSpot.areaId;
                            
                            // 新しいエリアの areaBounds を裏側で計算・保存しておく
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
                            }

                            // エリア移動に伴う各種データの再ロード
                            if (window.markerControl && typeof markerControl.showShop02 === 'function') {
                                markerControl.showShop02(window.currentAreaId);
                            }
                            
                            console.log("スワイプによるエリア変更を検知:", window.currentAreaId);
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

    window.map.getContainer().classList.add('is-spot-mode');
    window.mapStateSnapshot = null;
    window.currentSpotBaseTile = null;

    disablePhase2(window.map);
    resetSpotLayers();
    clearSub2Weather();
    removeCrowdImage();
    
    renderAccessInfo(spot);

    const safe = spot;
    const typeParts = (safe.type || '').split('$');
    const isSpecial = typeParts.includes('special'); 

    const targetLat = safe.lat;
    const targetLng = safe.lng;
    
    // 目的のタイルURLを決定
    let tileUrl;
    if (typeParts.includes('ort')) {
        tileUrl = window.TILE_URLS.ort;
    } else if (typeParts.includes('airphoto')) {
        tileUrl = window.TILE_URLS.airphoto;
    } else if (typeParts.includes('rinya')) {
        tileUrl = window.TILE_URLS.rinya;
    } else {
        tileUrl = window.TILE_URLS.photo;
    }

    window.currentSpotBaseTile = tileUrl;

    // =====================================================
    // ★ 修正：OSMから目的タイルへのフェードイントランジション（超速化版）
    // =====================================================
    const hasOSM = window.osmLayer && window.map.hasLayer(window.osmLayer);

    if (hasOSM) {
        // --- 1. OSMが存在する場合（通常操作） ---
        if (window.gsiLayer) window.map.removeLayer(window.gsiLayer);
        
        // 透明（opacity: 0）でレイヤーを追加して裏でロードを開始
        window.gsiLayer = L.tileLayer(tileUrl, { 
            attribution: '国土地理院', 
            detectRetina: false,
            opacity: 0, 
            zIndex: 100 
        }).addTo(window.map);

        // loadイベント(全完了)を待たずに、DOMの生成直後にすぐフェードインを開始する
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const container = window.gsiLayer.getContainer();
                if (container) {
                    // flyToの動きに合わせるようにフワッと表示
                    container.style.transition = 'opacity 0.6s ease-in-out';
                    window.gsiLayer.setOpacity(1);
                }
            });
        });

        // ズーム移動(0.5秒) ＋ フェード(0.6秒) が確実に終わる頃に裏のOSMを消去
        setTimeout(() => {
            if (window.osmLayer) {
                window.map.removeLayer(window.osmLayer);
                window.osmLayer = null;
            }
        }, 1200);

    } else {
        // --- 2. URL直打ち等でOSMが存在しない場合 ---
        if (window.gsiLayer) window.map.removeLayer(window.gsiLayer);
        window.gsiLayer = L.tileLayer(tileUrl, { 
            attribution: '国土地理院', 
            detectRetina: false 
        }).addTo(window.map);
    }


    const targetZoom = isSpecial ? 14 : (safe.zoom < 14 ? 14 : safe.zoom);

    // ★ 移動前はロックを完全に外す
    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;
    window.map.dragging.disable();
    window.map.scrollWheelZoom.disable();
    window.map.doubleClickZoom.disable();
    window.map.touchZoom.disable();

    // ズーム移動開始（OSMがある場合はOSMのままズームされていく）
    window.map.flyTo([targetLat, targetLng], targetZoom, { duration: 0.5 });

    // ... (以下、`const el = document.getElementById("nearest-spot");` 以降はそのまま)

    const el = document.getElementById("nearest-spot");
    if (el) el.textContent = safe.name || '';

    const tileWrap = document.getElementById('tile-btn-wrap');
    const tileBtn = document.getElementById('map-tile-btn');
    if (tileWrap && tileBtn) {
        tileWrap.style.display = 'flex';
        tileBtn.style.display = 'block'; 
        requestAnimationFrame(() => { tileBtn.style.opacity = '1'; });
    }

    if (safe?.individualId != null) {
        if (window.prefData) setIdealQuery('pref', window.prefData.notes);
        const parentArea = window.areaData.find(a => String(a.areaId + '_' + a.individualId) === String(safe.areaId));
        if (parentArea) setIdealQuery('area', parentArea.name);
        setIdealQuery('spot', safe.name);
        window.currentSpotId = safe.individualId;
    }

    // ★ 移動アニメーション完了後に、独自のスポットBoundsでロックする
    window.map.once('moveend', () => {
        window.map.invalidateSize(true);
        showFishMarkers(safe.URL);
        createWeekItem(safe.whether);

        window.map.setMaxZoom(18);

        let bounds = window.map.getBounds();
        let zoomLimit;

        // =====================================================
        // 1. ベースとなるズーム制限と可動範囲の設定
        // =====================================================
        if (isSpecial || safe.zoom < 14) {
            const paddingDiff = 14 - safe.zoom;
            bounds = bounds.pad(paddingDiff);
            zoomLimit = 14;
        } else {
            zoomLimit = safe.zoom;
        }

        // =====================================================
        // 2. ★ 修正：すべてのスポットで、魚マーカーが収まるように範囲を拡張する
        // =====================================================
        if (safe.URL && typeof safe.URL === 'string' && safe.URL.trim() !== '') {
            const fishList = safe.URL.split(',');
            fishList.forEach(item => {
                const parts = item.split('|');
                const fLat = parseFloat(parts[1]);
                const fLng = parseFloat(parts[2]);
                if (!isNaN(fLat) && !isNaN(fLng)) {
                    bounds.extend([fLat, fLng]);
                }
            });
        }
        
        // 3. 画面端ギリギリにならないよう、共通で全体に5%の余白を足す
        bounds = bounds.pad(0.05);

        // 確定した正確な範囲でドラッグをロック
        window.map.setMaxBounds(bounds);
        window.map.options.maxBoundsViscosity = 1.0; 

        window._zoomGuardBase = zoomLimit;
        window._zoomGuardActive = true;

        window.map.dragging.enable();
        window.map.scrollWheelZoom.enable();
        window.map.doubleClickZoom.enable();
        window.map.touchZoom.enable();
    });

}

function showFishMarkers(url) {
  if (!window.map) return;

  // 1. 古い魚のマーカーが残っていればマップから削除する
  if (window.fishLayer) {
    window.map.removeLayer(window.fishLayer);
    window.fishLayer = null;
  }

  // URLデータが存在しない、または空文字の場合は安全に終了する
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return;
  }

  window.fishLayer = L.layerGroup();
  const fishList = url.split(',');

  // 緯度・経度が空の不正なデータをフィルタリング
  const markers = fishList.map(item => {
    const parts = item.split('|');
    return {
      name: parts[0],
      lat: parseFloat(parts[1]),
      lng: parseFloat(parts[2])
    };
  }).filter(fish => !isNaN(fish.lat) && !isNaN(fish.lng));

  // =====================================
  // ★ テキストサイズの固定化
  // =====================================
  const el = window.map.getContainer();
  // 拡大用クラスを剥がし、常に最小サイズ（zoom-16相当）に固定する
  el.classList.remove('zoom-18', 'zoom-17');
  el.classList.add('zoom-16');

  // =====================================
  // ★ マーカーの生成と間引きロジック
  // =====================================
  for (let i = 0; i < markers.length; i++) {
    const fish = markers[i];
    const currentLatLng = L.latLng(fish.lat, fish.lng);

    /* 
    // ▼▼▼ 分岐テスト用にコメントアウト中 ▼▼▼
    let hasSameNameWithin3m = false;
    let hasDiffNameWithin5m = false;

    // 他のすべてのマーカーとの距離を比較
    for (let j = 0; j < markers.length; j++) {
      if (i === j) continue; // 自分自身はスキップ
      
      const otherFish = markers[j];
      const dist = currentLatLng.distanceTo([otherFish.lat, otherFish.lng]); // 距離(メートル)

      if (fish.name === otherFish.name && dist <= 3) {
        hasSameNameWithin3m = true;
      }
      if (fish.name !== otherFish.name && dist <= 5) {
        hasDiffNameWithin5m = true;
      }
    }

    // 条件判定: 3m以内に同名があり、かつ5m以内に別名がない場合
    // const isDot = hasSameNameWithin3m && !hasDiffNameWithin5m;
    // ▲▲▲ コメントアウトここまで ▲▲▲ 
    */

    // ★ 現在は強制的にテキスト表示とするため false に固定
    const isDot = false;

    let icon;
    if (isDot) {
      // 間引き用ドットマーカー
      icon = L.divIcon({
        className: 'pref-dot fish1', // ← 色を変えたい場合はクラス名を変更
        html: '',
        iconSize: [5, 5],
        iconAnchor: [2.5, 2.5]
      });
    } else {
      // 通常のテキスト表示
      icon = L.divIcon({
        className: 'fish-label',
        html: `<div class="fish-text">${fish.name}</div>`,
        iconSize: null
      });
    }

    // マーカーの生成（タップ不可にして軽量化）
    const marker = L.marker([fish.lat, fish.lng], { 
        icon, 
        interactive: false,
        keyboard: false
    });
    
    window.fishLayer.addLayer(marker);
  }

  // 最後にまとめてマップへ追加
  window.map.addLayer(window.fishLayer);
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

// ==========================================
// ★ アクセス情報算出ロジック (方位と距離を計算)
// ==========================================
function getBearing(lat1, lng1, lat2, lng2) {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const dLng = (lng2 - lng1) * toRad;
    const y = Math.sin(dLng) * Math.cos(lat2 * toRad);
    const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
              Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLng);
    const bearing = Math.atan2(y, x) * toDeg;
    return (bearing + 360) % 360; 
}

function getAngleDiff(b1, b2) {
    let diff = Math.abs(b1 - b2);
    if (diff > 180) diff = 360 - diff;
    return diff;
}

function calcAccessInfo(spotLat, spotLng) {
    if (!window.icData || window.icData.length === 0) return [];

    const spotLatLng = L.latLng(spotLat, spotLng);
    
    const mappedData = window.icData.map(item => {
        const itemLatLng = L.latLng(item.lat, item.lng);
        const distance = spotLatLng.distanceTo(itemLatLng);
        const bearing = getBearing(spotLat, spotLng, item.lat, item.lng);
        return { ...item, distance, bearing };
    });

    mappedData.sort((a, b) => a.distance - b.distance);

    const icList = mappedData.filter(d => d.category && d.category.includes('IC'));
    const stationList = mappedData.filter(d => d.category && d.category.includes('駅'));
    const mallList = mappedData.filter(d => d.category && (d.category.includes('商業') || d.category.includes('道の駅')));

    const results = [];
    const firstIC = icList[0];
    
    if (firstIC) {
        results.push(firstIC); 
        
        if (firstIC.distance <= 15000) {
            const secondIC = icList.find(ic => getAngleDiff(firstIC.bearing, ic.bearing) >= 90);
            
            // 20km以上の対岸IC弾き処理
            if (secondIC && (secondIC.distance - firstIC.distance) < 20000) {
                results.push(secondIC); 
            } else {
                if (mallList.length > 0) results.push(mallList[0]);
            }
        } else {
            if (mallList.length > 0) results.push(mallList[0]);
        }
    }
    
    // 徒歩15分以内の駅のみ追加
    if (stationList.length > 0) {
        const nearestStation = stationList[0];
        const realDistKm = (nearestStation.distance * 1.35) / 1000;
        const walkTime = Math.round(realDistKm * 15);
        
        if (walkTime <= 15) {
            results.push(nearestStation);
        }
    }

    // テキストとアイコンの変換
    return results.map(item => {
        const realDistKm = (item.distance * 1.35) / 1000; 
        
        let displayName = item.name;
        if (item.category === '駅' && !displayName.endsWith('駅')) {
            displayName += '駅';
        } else if (item.category === 'IC' && !displayName.includes('IC')) {
            displayName += 'IC';
        }

        if (item.category === '駅') {
            const time = Math.round(realDistKm * 15);
            return `🚶‍♂️ ${displayName}から徒歩 約${time}分`;
        } else if (item.category === '商業施設') {
            const time = Math.round(realDistKm * 1.5);
            return `🛍️ ${displayName}から車で 約${time}分 (${realDistKm.toFixed(1)}km)`;
        } else if (item.category === '道の駅') {
            const time = Math.round(realDistKm * 1.5);
            return `🅿️ ${displayName}から車で 約${time}分 (${realDistKm.toFixed(1)}km)`;
        } else {
            const time = Math.round(realDistKm * 1.5);
            return `🚗 ${displayName}から約${time}分 (${realDistKm.toFixed(1)}km)`;
        }
    });
}

// ==========================================
// ★ 本番用：アクセス情報をHTML(DOM)に書き出す関数
// ==========================================
function renderAccessInfo(spot) {
    const container = document.getElementById('accessInfoBox');
    if (!container || !spot || !spot.lat || !spot.lng) {
        if (container) container.style.display = 'none';
        return;
    }

    const accessTexts = calcAccessInfo(spot.lat, spot.lng);

    if (accessTexts.length === 0) {
        container.style.display = 'none';
        return;
    }

    let html = `<h3>${spot.name}の周辺アクセス情報</h3>`;
    html += '<ul>';
    accessTexts.forEach(text => {
        html += `<li>${text}</li>`;
    });
    html += '</ul>';

    container.innerHTML = html;
    container.style.display = 'block';

    // 👇 【ここに追加】アクセス情報を描画した直後に「最寄り釣具店」も追加描画する
    if (typeof renderShopSection === 'function') {
        renderShopSection(spot);
    }
}


// ==========================================
// ★ 新規：最寄りの釣具店を描画する関数
// ==========================================
function renderShopSection(spot) {
    const accessBox = document.getElementById('accessInfoBox');
    if (!accessBox || !spot || !spot.lat || !spot.lng) return;

    // 既存の釣具店エリアがあれば削除（重複防止）
    const oldShopArea = document.getElementById('spot-shop-section');
    if (oldShopArea) oldShopArea.remove();

    // ショップデータがまだ無い場合は終了
    if (!window.markerControl || !window.markerControl.allShops || window.markerControl.allShops.length === 0) return;

    const spotLatLng = L.latLng(spot.lat, spot.lng);

    // ★ 100円均一(shop4)を除外し、緯度経度が正常な店舗だけを抽出
    const validShops = window.markerControl.allShops.filter(s => s.icon !== 'shop4' && !isNaN(s.lat) && !isNaN(s.lng));
    
    // 対象店舗がない場合は終了
    if (validShops.length === 0) return;

    // 距離を計算して近い順に並び替え
    const shopsWithDist = validShops.map(s => {
        const dist = spotLatLng.distanceTo(L.latLng(s.lat, s.lng));
        return { ...s, distance: dist };
    });
    
    shopsWithDist.sort((a, b) => a.distance - b.distance);
    
    // 一番近い店舗を取得して時間を計算（車で時速40km想定）
    const nearestShop = shopsWithDist[0];
    const realDistKm = (nearestShop.distance * 1.35) / 1000;
    const time = Math.round(realDistKm * 1.5); 
    
    // 店舗名（キャスティングや上州屋などのグループ名があればくっつける）
    const shopName = nearestShop.group && nearestShop.group !== '個人商店' && nearestShop.group !== 'shop'
        ? `${nearestShop.group} ${nearestShop.name}`
        : nearestShop.name;

    // HTML組み立て
    const shopDiv = document.createElement('div');
    shopDiv.id = 'spot-shop-section';
    shopDiv.style.marginTop = '12px';
    shopDiv.style.paddingTop = '10px';
    shopDiv.style.borderTop = '1px dashed rgba(25, 25, 112, 0.2)';

    let html = `<div style="font-weight: bold; font-size: 13px; margin-bottom: 4px;">🎣 最寄りの釣具店</div>`;
    html += `<div style="font-size: 13px; line-height: 1.5;">${shopName} まで車で 約${time}分 (${realDistKm.toFixed(1)}km)</div>`;

    shopDiv.innerHTML = html;
    accessBox.appendChild(shopDiv);
}

function clearAccessInfo() {
    const container = document.getElementById('accessInfoBox');
    if (container) {
        container.innerHTML = '';
        container.style.display = 'none';
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

window._isGoingBack = false;

function goBack() {
    if (window._isGoingBack) return;
    window._isGoingBack = true;

    if (window.map) {
        window.map.getContainer().classList.remove('is-spot-mode');
    }

    const backBtn = document.getElementById('map-back-btn');
    if (backBtn) {
        backBtn.style.pointerEvents = 'none'; 
        backBtn.style.transition = 'opacity 0.3s ease';
        backBtn.style.opacity = '0';
    }

    const tileWrap = document.getElementById('tile-btn-wrap');
    const tileBtn = document.getElementById('map-tile-btn');
    if (tileWrap && tileBtn) {
        tileBtn.style.opacity = '0';
        setTimeout(() => { 
            tileWrap.style.display = 'none'; 
            tileBtn.style.display = 'none'; 
        }, 300); 
    }

    const releaseLockAndShowBtn = () => {
        window._isGoingBack = false; 
        if (backBtn) {
            backBtn.style.display = 'block';
            requestAnimationFrame(() => {
                backBtn.style.transition = 'opacity 0.4s ease';
                backBtn.style.opacity = '1';
                backBtn.style.pointerEvents = 'auto'; 
            });
        }
    };

    // ⓪ 県トップ画面
    if (!window.currentAreaId && !window.currentSpotId) {
        const regionToLoad = window.currentRegion || 'KANTO';

        setIdealQuery('pref', null);
        setIdealQuery('area', null);
        setIdealQuery('spot', null);

        window.currentPref = null;
        window.prefData = null;
        window.currentAreaId = null;
        window.currentSpotId = null;
        
        // =====================================================
        // ★ 追加: 他の県に移動した時に備えてBoundsのキャッシュを完全にリセット
        // =====================================================
        window.prefBounds = null;
        window.areaBounds = null;
        if (typeof destroyAreaUI === 'function') destroyAreaUI();
        if (typeof removeCrowdImage === 'function') removeCrowdImage();
        if (window.markerControl && typeof window.markerControl.clearLayers === 'function') window.markerControl.clearLayers();
        if (window.phase1Group) window.phase1Group.clearLayers();
        if (window.areaSpotLayer) window.areaSpotLayer.clearLayers();
        if (window.prefSpotLayer) {
            window.map.removeLayer(window.prefSpotLayer);
            window.prefSpotLayer = null;
        }
        
        const alertBar = document.getElementById("alert-bar");
        if (alertBar) alertBar.textContent = "";

        setTimeout(() => {
            if (backBtn) {
                backBtn.style.display = 'none';
                backBtn.style.pointerEvents = 'auto';
            }
            window._isGoingBack = false; 
        }, 300);

        loadRegionMap(regionToLoad);
        return;
    }

    window.map.touchZoom.disable();
    window.map.dragging.disable();

    const area = window.areaData.find(a => String(a.individualId) === String(window.currentAreaId?.split('_')[1]));
    if (!area) { window._isGoingBack = false; return; }

    const z = window.map.getZoom();
    const restoreSpot = buildSpotRestoreObject();
    const isSpecial = restoreSpot && restoreSpot.type && restoreSpot.type.split('$').includes('special');
    const isPhase2 = window.osmLayer && window.map.hasLayer(window.osmLayer);

    // =====================================================
    // ① Phase2 -> Phase1（スポット詳細からエリア画面に戻る）
    // =====================================================
    if ((z > 13 || isSpecial) && !isPhase2) {
        stopZoomGuard();
        window.map.dragging.enable();
        window.map.scrollWheelZoom.enable();
        window.map.doubleClickZoom.enable();
        window.map.touchZoom.enable();

        window.map.setMinZoom(0);
        window.map.setMaxZoom(18);

        // ★ 戻る直前に過去のバウンズを破壊する
        window.map.setMaxBounds(null);
        window.map.options.maxBoundsViscosity = 0;

        // =====================================================
        // ★ 修正：OSMを「最前面（z-index: 999等）」にかぶせてから flyTo する
        // =====================================================
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
                    zIndex: 999 // ★ 追加：確実に最前面へ被せる
                }
            ).addTo(window.map);
        } else {
            // 既に存在する場合は最前面に持ってくる
            window.osmLayer.setZIndex(999);
        }

        // OSMが被さった裏で、ベースタイルを `ort` (標準) に切り替えておく
        if (window.gsiLayer) {
            // タイルのチラつきを見せずにURLだけすり替える
            window.gsiLayer.setUrl(window.TILE_URLS.ort); 
        }

        if (window.fishLayer) window.map.removeLayer(window.fishLayer);
        if (window.phase2Group) window.phase2Group.clearLayers();

        if (!restoreSpot) {
            window._isGoingBack = false;
            return;
        }

        removeWeekItem();
        resetWeatherUI();
        clearAccessInfo();

        if (window.prefData) setIdealQuery('pref', window.prefData.notes);
        const parentArea = window.areaData.find(a => window.currentAreaId && String(a.areaId + '_' + a.individualId) === window.currentAreaId);
        if (parentArea) setIdealQuery('area', parentArea.name);
        setIdealQuery('spot', null);
        window.currentSpotId = null;

        showSpotsForArea(window.currentAreaId);
        
        disableAreaSwipe();
        
        // OSMが敷かれた状態のまま、ズーム13へ引いていく
        window.map.flyTo([restoreSpot.lat, restoreSpot.lng], 13, { duration: 0.5 });
        window.map.getContainer().classList.add('is-spot-mode');

        const completePhase1Return = () => {
            window.map.invalidateSize(true);
            
            if (typeof enableDragForArea === 'function') {
                enableDragForArea();
            }
            enablePhase2(window.map); 
            
            phase1menu(window.currentAreaId);
            
            window._isGoingBack = false;
            const backBtn = document.getElementById('map-back-btn');
            const tileWrap = document.getElementById('tile-btn-wrap');
            const tileBtn = document.getElementById('map-tile-btn');
            
            if (backBtn) {
                backBtn.style.display = 'block';
                if (tileWrap) tileWrap.style.display = 'flex';
                if (tileBtn) tileBtn.style.display = 'block';
                
                requestAnimationFrame(() => {
                    backBtn.style.transition = 'opacity 0.4s ease';
                    backBtn.style.opacity = '1';
                    backBtn.style.pointerEvents = 'auto';
                    if (tileBtn) tileBtn.style.opacity = '1';
                });
            }
        };

        const center = window.map.getCenter();
        const isSame = Math.abs(center.lat - restoreSpot.lat) < 0.0001 && 
                       Math.abs(center.lng - restoreSpot.lng) < 0.0001 && 
                       window.map.getZoom() === 13;

        if (isSame) {
            setTimeout(completePhase1Return, 50); 
        } else {
            window.map.once('moveend', completePhase1Return);
        }
        
        return;
    }

    // =====================================================
    // ② Phase1 -> Area（エリア画面に戻る）
    // =====================================================
    if (z === 13 || isPhase2) {
        disablePhase2(window.map);
        clearSub2Weather();
        
        const nsEl = document.getElementById("nearest-spot");
        if (nsEl) nsEl.textContent = "";
        
        window.map.eachLayer(layer => {
            if (layer === window.gsiLayer) return;
            if (layer instanceof L.TileLayer) {
                const url = layer._url || '';
                if (url.includes('seamlessphoto')) window.map.removeLayer(layer);
            }
        });

        window.map.eachLayer(layer => {
            if (!(layer instanceof L.TileLayer)) return;
            const url = layer._url || '';
            if (url.includes('openstreetmap')) window.map.removeLayer(layer);
        });

        window.osmLayer = null;

        window.map.setMinZoom(0);
        window.map.setMaxZoom(18);

        // ★ 過去のバウンズを完全に破壊する
        window.map.setMaxBounds(null);
        window.map.options.maxBoundsViscosity = 0;

        if (window.phase2Group) window.phase2Group.clearLayers();

        if (!window.gsiLayer) {
            window.gsiLayer = L.tileLayer(window.gsiLayers.ort);
        } else {
            window.gsiLayer.setUrl(window.gsiLayers.ort);
        }
        window.gsiLayer.addTo(window.map);

        selectArea(area);
        renderCrowdImage();
        
        const targetZoom = area.zoom || window.prefData.zoom;
        const center = window.map.getCenter();
        const isSame = Math.abs(center.lat - area.lat) < 0.0001 && Math.abs(center.lng - area.lng) < 0.0001 && window.map.getZoom() === targetZoom;

        if (isSame) {
            releaseLockAndShowBtn();
        } else {
            window.map.once('moveend', releaseLockAndShowBtn);
        }
        return;
    }

    // =====================================================
    // ③ Area -> Pref（県画面に戻る）
    // =====================================================
    if (window.osmLayer) {
        window.map.removeLayer(window.osmLayer);
        window.osmLayer = null;
    }

    if (window.phase1Group) window.phase1Group.clearLayers();
    if (window.areaSpotLayer) window.areaSpotLayer.clearLayers();

    if (!window.gsiLayer) {
        window.gsiLayer = L.tileLayer(window.gsiLayers.ort).addTo(window.map);
    } else {
        window.gsiLayer.setUrl(window.gsiLayers.ort);
    }

    // ★ 過去のバウンズを完全に破壊する
    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;

    drawLocation(window.prefData.name, window.prefData.lat, window.prefData.lng, window.prefData.zoom);

    const completePrefReturn = () => {
        window.map.invalidateSize(true);
        
        if (window.prefData) setIdealQuery('pref', window.prefData.notes);
        setIdealQuery('area', null);
        setIdealQuery('spot', null);

        window.currentAreaId = null;
        window.currentSpotId = null;

        initAreaUI();
        showPrefSpots();
        renderPrefWeather();
        resetAreaGuide();

        releaseLockAndShowBtn();
    };

    const centerPref = window.map.getCenter();
    const isSamePref = Math.abs(centerPref.lat - window.prefData.lat) < 0.0001 && Math.abs(centerPref.lng - window.prefData.lng) < 0.0001 && window.map.getZoom() === window.prefData.zoom;

    if (isSamePref) {
        completePrefReturn();
    } else {
        window.map.once('moveend', completePrefReturn);
    }
}

function buildSpotRestoreObject() {

    const areaId = window.currentAreaId;
    const spotId = window.currentSpotId;

    if (!areaId || !spotId) return null;

    // ★ 修正：'_' が含まれていてもいなくても、確実に最後の部分（スポットキー）を抜く
    const parts = String(spotId).split('_');
    const spotKey = parts[parts.length - 1]; 

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
