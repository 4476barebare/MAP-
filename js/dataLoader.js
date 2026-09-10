window.selectArea = selectArea;
window.selectSpot = selectSpot;
window.goBack = goBack;
window.drawLocation = drawLocation;
window.prefData = null;
window.areaData = [];
window.spotData = []
window.currentAreaId = null;

// ==========================================
// ★ スポット用データを金庫(allspotData)から読み込む関数
//    ＋ 魚データを各スポットへ付与
// ==========================================
async function loadLocationJSON() {

    const pref = window.currentPref;


    // ==========================================
    // グリッド座標解析
    // ==========================================
    function parseGrid(str) {

        if (!str) {
            return {
                x: null,
                y: null
            };
        }

        const x = str.match(/x\s*:\s*(-?\d+)/);
        const y = str.match(/y\s*:\s*(-?\d+)/);

        return {
            x: x ? parseInt(x[1]) : null,
            y: y ? parseInt(y[1]) : null
        };
    }

    // ==========================================
    // ★ fishDataを準備
    //
    // 既に存在する場合は再取得しない
    // ==========================================
    let fishData = window.fishData || null;


    if (!fishData && window.fishUrl) {

        try {

            const response =
                await fetch(window.fishUrl);


            if (response.ok) {

                fishData =
                    await response.json();

                window.fishData =
                    fishData;
            }

        } catch (error) {

            console.error(
                '魚データ読み込みエラー:',
                error
            );

            fishData = null;
        }
    }


    // ==========================================
    // 分岐A：
    // 既に県データが生成されている場合
    // ==========================================
    if (
        window[`${pref}_prefData`] &&
        window[`${pref}_areaData`] &&
        window[`${pref}_spotData`]
    ) {

        window.prefData = window[`${pref}_prefData`];
        window.areaData = window[`${pref}_areaData`];
        window.spotData = window[`${pref}_spotData`];
        
        // 👇【ここに追加】キャッシュからBoundsも復元する
        window.prefBounds = window[`${pref}_prefBounds`] || null;



        // ------------------------------------------
        // ★ キャッシュされたスポットにも
        //   fishデータを再付与
        // ------------------------------------------
        applyFishDataToSpots(
            window.spotData,
            fishData
        );


        // ------------------------------------------
        // エリアグラフ
        // ------------------------------------------
        if (
            window[`${pref}_areaGraph`]
        ) {

            window.areaGraph =
                window[`${pref}_areaGraph`];

        } else if (
            typeof buildAreaGraphFromGrid === 'function'
        ) {

            buildAreaGraphFromGrid(
                window.areaData
            );

            window[`${pref}_areaGraph`] =
                window.areaGraph;
        }


        // ------------------------------------------
        // SEO
        // ------------------------------------------
        const container =
            document.getElementById(
                'seo-link-container'
            );

        const titleSpan =
            document.getElementById(
                'seo-list-title'
            );


        if (
            container &&
            titleSpan &&
            window.prefData
        ) {

            titleSpan.textContent =
                `${window.prefData.notes}の釣りスポット一覧を見る`;

            container.innerHTML =
                window[`${pref}_seoHtml`] || '';
        }


        return {
            main: window.prefData,
            areas: window.areaData,
            spots: window.spotData
        };
    }


    // ==========================================
    // 分岐B：
    // 金庫(allspotData)から対象県を抽出
    // ==========================================
    const vaultData =
        window.allspotData ||
        window.ALL_REGION_SPOTS ||
        [];


    let main = null;
    const areas = [];
    const spots = [];


    // ==========================================
    // 対象県のデータを抽出
    // ==========================================
    const targetRows =
        vaultData.filter(row => {

            return (
                row._prefCode === pref ||

                (!row.areaId &&
                    row.name === pref) ||

                row.areaId === pref ||

                (
                    row.areaId &&
                    typeof row.areaId === 'string' &&
                    row.areaId.startsWith(
                        pref + '_'
                    )
                )
            );
        });


    // ==========================================
    // squareX / squareY 初期化
    // ==========================================
    targetRows.forEach(row => {

        row.squareX = null;
        row.squareY = null;
    });


    // ==========================================
    // 県本体(main)の抽出
    // ==========================================
    targetRows.forEach(row => {

        if (
            (!row.areaId ||
                row.individualId === 'parent') &&
            row.name === pref
        ) {

            main = row;
        }
    });


    // ==========================================
    // エリア(areas)の抽出
    // ==========================================
    targetRows.forEach(row => {

        if (
            (row.areaId || '').trim() === pref
        ) {

            if (
                row.url &&
                row.url.includes('x:') &&
                row.url.includes('y:')
            ) {

                const grid =
                    parseGrid(row.url);

                row.squareX =
                    grid.x;

                row.squareY =
                    grid.y;
            }


            areas.push(row);
        }
    });


// ==========================================
// スポット(spots)の抽出
// ==========================================
targetRows.forEach(row => {
    // pref や area などの親データは除外
    if (row.type === 'pref' || row.type === 'area') return;

    const icon = row.icon;

    // iconが入っているものを全てスポットとして抽出
    if (icon && icon.trim() !== '') {
        spots.push(row);
    }
});


    // ==========================================
    // ★ 魚データをスポットへ付与
    // ==========================================
    applyFishDataToSpots(
        spots,
        fishData
    );


    // ==========================================
    // グローバル変数へ代入
    // ==========================================
    window.prefData = main;
    window.areaData = areas;
    window.spotData = spots;

    // 👇【ここに追加】県全体の Bounds を計算して window.prefBounds に格納する
    window.prefBounds = null;
    if (spots.length > 0 && typeof L !== 'undefined') {
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;
        spots.forEach(spot => {
            const lat = Number(spot.lat);
            const lng = Number(spot.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
            }
        });
        // 画面端のスポットも確実に入るように10%（0.1）の余白をつける
        const latBuffer = Math.max((maxLat - minLat) * 0.1, 0.05);
        const lngBuffer = Math.max((maxLng - minLng) * 0.1, 0.05);
        window.prefBounds = L.latLngBounds(
            [minLat - latBuffer, minLng - lngBuffer],
            [maxLat + latBuffer, maxLng + lngBuffer]
        );
    }

    // ==========================================
    // キャッシュ用変数へ保存
    // ==========================================
    window[`${pref}_prefData`] = main;
    window[`${pref}_areaData`] = areas;
    window[`${pref}_spotData`] = spots;
    
    // 👇【ここに追加】計算したBoundsを次回のためにキャッシュしておく
    window[`${pref}_prefBounds`] = window.prefBounds; 




    // ==========================================
    // エリアグラフの構築
    // ==========================================
    if (
        typeof buildAreaGraphFromGrid === 'function'
    ) {

        buildAreaGraphFromGrid(
            areas
        );

        window[`${pref}_areaGraph`] =
            window.areaGraph;
    }


    // ==========================================
    // SEO用HTML
    // ==========================================
    if (
        typeof buildSeoHtmlString === 'function'
    ) {

        const seoHtml =
            buildSeoHtmlString(
                main,
                areas,
                spots
            );


        window[`${pref}_seoHtml`] =
            seoHtml;


        const container =
            document.getElementById(
                'seo-link-container'
            );

        const titleSpan =
            document.getElementById(
                'seo-list-title'
            );


        if (
            container &&
            titleSpan &&
            main
        ) {

            titleSpan.textContent =
                `${main.notes}の釣りスポット一覧を見る`;

            container.innerHTML =
                seoHtml;
        }
    }


    // ==========================================
    // 完了
    // ==========================================
    return {
        main,
        areas,
        spots
    };
}

function applyFishDataToSpots(spots, fishData) {

    if (!Array.isArray(spots)) return;

    if (!fishData || typeof fishData !== 'object') {
        spots.forEach(spot => {
            spot.URL = "";
        });
        return;
    }

    const fishDict = {};

    for (const regKey in fishData) {

        const areaSpots = fishData[regKey];

        if (!areaSpots || typeof areaSpots !== 'object') {
            continue;
        }

        for (const spotName in areaSpots) {
            fishDict[spotName] = areaSpots[spotName];
        }
    }

    spots.forEach(spot => {

        const spotFishData = fishDict[spot.name];

        if (!spotFishData) {
            spot.URL = "";
            return;
        }

        const fishList = [];

        for (const fishName in spotFishData) {

            const info = spotFishData[fishName];

            if (
                info &&
                typeof info.coords === 'string' &&
                info.coords !== ''
            ) {

                const points = info.coords.split('|');

                points.forEach(pt => {

                    const [lat, lng] = pt.split(',');

                    if (lat && lng) {
                        fishList.push(
                            `${fishName}|${lat}|${lng}`
                        );
                    }

                });
            }
        }

        spot.URL = fishList.join(',');
    });
}
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
    showPrefSpots();
    
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

                            clearSpotUI();
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

    if (!spot.zoom || spot.zoom === '') {
        if (typeof showFishPopup === 'function') {
            showFishPopup(spot);
        }
        return;
    }
    

    window.goBackGuard = true;

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
    const hasOSM = window.osmLayer && window.map.hasLayer(window.osmLayer);

    let isMoveEnded = false;
    let isFadeEnded = !hasOSM; 

    const safetyTimer = setTimeout(() => {
        isFadeEnded = true;
        checkAndUnlockGuard();
    }, 3000);

    const checkAndUnlockGuard = () => {
        if (isMoveEnded && isFadeEnded) {
            clearTimeout(safetyTimer);
            setTimeout(() => {
                
                window.goBackGuard = false;
                window.map.scrollWheelZoom.enable();
                window.map.doubleClickZoom.enable();
                window.map.touchZoom.enable();
            }, 100);
        }
    };

    if (hasOSM) {
        if (!window.gsiLayer) {
            window.gsiLayer = L.tileLayer(tileUrl, { 
                attribution: '国土地理院', 
                detectRetina: false,
                opacity: 0, 
                zIndex: 100 
            }).addTo(window.map);
        } else {
            window.gsiLayer.setUrl(tileUrl);
            window.gsiLayer.setOpacity(0);
            window.gsiLayer.setZIndex(100);
            if (!window.map.hasLayer(window.gsiLayer)) {
                window.gsiLayer.addTo(window.map);
            }
        }

        // ★ 修正：キャッシュ済みで load イベントが発火しない対策
        const doGsiFade = () => {
            const gsiContainer = window.gsiLayer.getContainer();
            const osmContainer = window.osmLayer ? window.osmLayer.getContainer() : null;

            if (gsiContainer) {
                gsiContainer.style.transition = 'opacity 2s ease';
                window.gsiLayer.setOpacity(1);
                
                if (osmContainer) {
                    osmContainer.style.transition = 'opacity 2s ease';
                    window.osmLayer.setOpacity(0);
                }
                setTimeout(() => {
                    if (window.osmLayer) window.osmLayer.setZIndex(1);
                    isFadeEnded = true;
                    checkAndUnlockGuard();
                }, 2000);
            } else {
                isFadeEnded = true;
                checkAndUnlockGuard();
            }
        };

        if (window.gsiLayer.isLoading && window.gsiLayer.isLoading()) {
            let isLoaded = false;
            window.gsiLayer.once('load', () => {
                if (isLoaded) return;
                isLoaded = true;
                doGsiFade();
            });
            setTimeout(() => {
                if (!isLoaded) {
                    isLoaded = true;
                    doGsiFade();
                }
            }, 1000);
        } else {
            requestAnimationFrame(doGsiFade);
        }
    } else {
        if (!window.gsiLayer) {
            window.gsiLayer = L.tileLayer(tileUrl, { 
                attribution: '国土地理院', 
                detectRetina: false 
            }).addTo(window.map);
        } else {
            window.gsiLayer.setUrl(tileUrl);
            if (!window.map.hasLayer(window.gsiLayer)) {
                window.gsiLayer.addTo(window.map);
            }
            window.gsiLayer.setZIndex(100);
            window.gsiLayer.setOpacity(1);
        }
    }

    const targetZoom = isSpecial ? 14 : (safe.zoom < 14 ? 14 : safe.zoom);

    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;
    window.map.dragging.disable();
    window.map.scrollWheelZoom.disable();
    window.map.doubleClickZoom.disable();
    window.map.touchZoom.disable();

    window.map.flyTo([targetLat, targetLng], targetZoom, { duration: 0.5 });

    const el = document.getElementById("nearest-spot");
    if (el) el.textContent = safe.name || '';

    const tileWrap = document.getElementById('tile-btn-wrap');
    const tileBtn = document.getElementById('map-tile-btn');
    if (tileWrap && tileBtn) {
        tileWrap.style.display = 'flex';
        tileBtn.style.display = 'block'; 
        requestAnimationFrame(() => { tileBtn.style.opacity = '1'; });
    }

    // ★ 修正：システム変数の強制上書きを削除し、純粋にセットだけ行うように戻す
    if (safe?.individualId != null) {
        if (window.prefData) setIdealQuery('pref', window.prefData.notes);
        const parentArea = window.areaData.find(a => String(a.areaId + '_' + a.individualId) === String(safe.areaId));
        if (parentArea) setIdealQuery('area', parentArea.name);
        setIdealQuery('spot', safe.name);
        window.currentSpotId = safe.individualId;
    }

    window.map.once('moveend', () => {
        window.map.invalidateSize(true);
        showFishMarkers(safe.URL);
        createWeekItem(safe.whether);

        window.map.setMaxZoom(18);

        let bounds = window.map.getBounds();
        let zoomLimit;

        if (isSpecial || safe.zoom < 14) {
            const paddingDiff = 14 - safe.zoom;
            bounds = bounds.pad(paddingDiff);
            zoomLimit = 14;
        } else {
            zoomLimit = safe.zoom;
        }

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
        
        bounds = bounds.pad(0.05);

        window.map.setMaxBounds(bounds);
        window.map.options.maxBoundsViscosity = 1.0; 

        window._zoomGuardBase = zoomLimit;
        window._zoomGuardActive = true;
        window.map.setMinZoom(zoomLimit);

        window.map.dragging.enable();
        showPrefSpots();
        
        isMoveEnded = true;
        checkAndUnlockGuard();
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

// ==========================================
// ★ スポット詳細UI・レイヤーの一括削除
// ==========================================
function clearSpotUI() {
    // -------------------------
    // UI
    // -------------------------
    if (typeof removeWeekItem === 'function') {removeWeekItem();}
    if (typeof resetWeatherUI === 'function') {resetWeatherUI();}
    if (typeof clearSub2Weather === 'function') {clearSub2Weather();}
    if (typeof clearAccessInfo === 'function') {clearAccessInfo();}
    // -------------------------
    // スポット詳細レイヤー
    // -------------------------
    if (window.map && window.fishLayer) {
        window.map.removeLayer(window.fishLayer);
        window.fishLayer = null;
    }
}

window.goBackGuard = false;

function goBack() {
    // 実行中なら弾く
    if (window.goBackGuard) return;

    // ★ 判定に使う変数を先に取得
    const z = window.map ? window.map.getZoom() : 0;
    const area = window.currentAreaId && window.areaData 
        ? window.areaData.find(a => String(a.individualId) === String(window.currentAreaId.split('_')[1])) 
        : null;

    // =====================================
    // 共通処理：各分岐に入った瞬間にガードをかけ、UIを隠す
    // =====================================
    const lockAndHideUI = () => {
        window.goBackGuard = true; // ★ ご指示の通り、分岐の適切な開始位置でロック

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
    };

    // =====================================
    // 共通処理：UIを再表示する（※ロック解除はしない）
    // =====================================
    let isReleased = false;
    const showBackBtnOnly = () => {
        if (isReleased) return;
        isReleased = true;
        // ★ 削除：ここにあった window.goBackGuard = false; を消去
        const backBtn = document.getElementById('map-back-btn');
        if (backBtn) {
            backBtn.style.display = 'block';
            requestAnimationFrame(() => {
                backBtn.style.transition = 'opacity 0.4s ease';
                btn.style.pointerEvents = 'auto';
                backBtn.style.opacity = '1';
                backBtn.style.pointerEvents = 'auto'; 
            });
        }
    };

// ⓪ 県トップ画面(PREF) → 広域マップ(REGION)へ戻る
if (!window.currentAreaId && !window.currentSpotId) {
    lockAndHideUI();

    const regionToLoad = window.currentRegion || 'KANTO';

    setIdealQuery('pref', null);
    setIdealQuery('area', null);
    setIdealQuery('spot', null);

    window.currentPref = null;
    window.prefData = null;
    window.currentAreaId = null;
    window.currentSpotId = null;

    window.prefBounds = null;
    window.areaBounds = null;

    if (typeof destroyAreaUI === 'function') destroyAreaUI();

    if (window.markerControl && typeof window.markerControl.clearLayers === 'function') {
        window.markerControl.clearLayers();
    }

    if (window.phase1Group) {
        window.phase1Group.clearLayers();
    }

    if (window.areaSpotLayer) {
        window.areaSpotLayer.clearLayers();
    }

    if (window.prefSpotLayer) {
        window.map.removeLayer(window.prefSpotLayer);
        window.prefSpotLayer = null;
    }

    const alertBar = document.getElementById("alert-bar");
    if (alertBar) alertBar.textContent = "";

    // -----------------------------------------
    // Regionへの復帰が完全に終わってから後処理
    // -----------------------------------------
    Promise.resolve(loadRegionMap(regionToLoad))
        .then(() => {

            // Region用マーカー状態へ戻す
            showPrefSpots();

            // 戻るボタンはRegionでは非表示
            const backBtn = document.getElementById('map-back-btn');

            if (backBtn) {
                backBtn.style.opacity = '0';
                backBtn.style.pointerEvents = 'none';
                backBtn.style.display = 'none';
            }

            // 最後にガード解除
            window.goBackGuard = false;
        })
        .catch(() => {
            window.goBackGuard = false;
        });

    return;
}
    // ① スポット詳細 → Phase2 (エリアOSM) へ戻る
    if (window.currentSpotId != null) {
        lockAndHideUI(); // ★ ガード開始

        const restoreSpot = buildSpotRestoreObject();

        stopZoomGuard();
        window.map.dragging.enable();
        window.map.scrollWheelZoom.enable();
        window.map.doubleClickZoom.enable();
        window.map.touchZoom.enable();

        window.map.setMinZoom(0);
        window.map.setMaxZoom(18);

        window.map.setMaxBounds(null);
        window.map.options.maxBoundsViscosity = 0;

        if (window.phase2Group) window.phase2Group.clearLayers();

        if (!restoreSpot) {
            window.goBackGuard = false; 
            return;
        }
 
        clearSpotUI();

        if (restoreSpot.areaId && window.currentAreaId !== restoreSpot.areaId) {
            window.currentAreaId = restoreSpot.areaId;
        }

        if (window.prefData) setIdealQuery('pref', window.prefData.notes);
        const parentArea = window.areaData.find(a => window.currentAreaId && String(a.areaId + '_' + a.individualId) === window.currentAreaId);
        if (parentArea) setIdealQuery('area', parentArea.name);
        setIdealQuery('spot', null);
        window.currentSpotId = null;

        showSpotsForArea(window.currentAreaId);
        
        selectSpot(restoreSpot); // ★ ここに渡され、外部で false になる
        showPrefSpots();

        const checkCompletion = setInterval(() => {
            if (window._selectSpotCompleted) {
                clearInterval(checkCompletion);
                window._selectSpotCompleted = false;
                
                //clearSpotUI();
                enablePhase2(window.map);
                phase1menu(window.currentAreaId);
                showBackBtnOnly(); 
            }
        }, 50);
        
        return;
    }

    // ② Phase2 (ズーム13 OSM) → Phase1 (ズーム13.5付近 エリアort) へ戻る
    if (window.currentSpotId == null && window.currentAreaId != null && z >= 12.5 && z <= 13.5) {
        lockAndHideUI(); // ★ ガード開始

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

        if (window.osmLayer) {
            const osmContainer = window.osmLayer.getContainer();
            if (osmContainer) {
                osmContainer.style.transition = 'opacity 2s ease';
                window.osmLayer.setOpacity(0);
                setTimeout(() => {
                    if (window.osmLayer) window.osmLayer.setZIndex(1);
                }, 2000);
            }
        }

        window.map.setMinZoom(0);
        window.map.setMaxZoom(18);

        window.map.setMaxBounds(null);
        window.map.options.maxBoundsViscosity = 0;

        if (window.phase2Group) window.phase2Group.clearLayers();

        if (!window.gsiLayer) {
            window.gsiLayer = L.tileLayer(window.gsiLayers.ort, { opacity: 0, zIndex: 100 }).addTo(window.map);
        } else {
            window.gsiLayer.setUrl(window.gsiLayers.ort);
            if (!window.map.hasLayer(window.gsiLayer)) {
                window.gsiLayer.addTo(window.map);
            }
        }
        
        requestAnimationFrame(() => {
            const gsiContainer = window.gsiLayer.getContainer();
            if (gsiContainer) {
                gsiContainer.style.transition = 'opacity 2s ease';
                window.gsiLayer.setZIndex(100);
                window.gsiLayer.setOpacity(1);
            }
        });

        selectArea(area); // ★ ここに渡され、外部で false になる
        renderCrowdImage();
        
        const targetZoom = area.zoom || window.prefData.zoom;
        const center = window.map.getCenter();
        const isSame = Math.abs(center.lat - area.lat) < 0.0001 && Math.abs(center.lng - area.lng) < 0.0001 && window.map.getZoom() === targetZoom;

        if (isSame) {
            setTimeout(showBackBtnOnly, 50);
        } else {
            window.map.once('moveend', showBackBtnOnly);
            setTimeout(showBackBtnOnly, 800); 
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

    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;

    drawLocation(window.prefData.name, window.prefData.lat, window.prefData.lng, window.prefData.zoom);

    let isPrefReturned = false;
    const completePrefReturn = () => {
        if (isPrefReturned) return;
        isPrefReturned = true;

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

        // 👇【ここに追加！】エリアスワイプをOFFにし、県スワイプをONにする
        if (typeof disableAreaSwipe === 'function') disableAreaSwipe();
        if (typeof enablePrefSwipe === 'function') enablePrefSwipe();

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
    const spotId = window.currentSpotId;

    if (!spotId) return null;

    const parts = String(spotId).split('_');
    const spotKey = parts[parts.length - 1]; 

    // ★ 修正：現在の areaId に依存せず、全スポットからIDだけで検索する
    const spot = window.spotData.find(s => String(s.individualId) === String(spotKey));

    if (!spot) return null;

    return {
        name: spot.name,
        lat: Number(spot.lat),
        lng: Number(spot.lng),
        zoom: 13,
        individualId: spot.individualId || spot.id || '',
        areaId: spot.areaId || '', // ★ 追加：戻る時にエリアを更新するため
        type: spot.type || ''
    };
}
