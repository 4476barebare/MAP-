// ==========================================
// 逆引き辞書JSONローダー ＆ スポット詳細遷移（spotLoader.js）
// ==========================================
window.prefDictionaryCache = window.prefDictionaryCache || {};
window.prefDictionaryPromises = window.prefDictionaryPromises || {};

function loadPrefDictionaryJson(prefCode = window.currentPref) {
    if (!prefCode) return Promise.resolve(null);

    // "KANTO_CHIBA" や "/KANTO/CHIBA_location.json" などが渡された場合でも県コードだけを抽出
    let cleanPref = String(prefCode).trim();
    if (cleanPref.includes('/')) {
        cleanPref = cleanPref.split('/').pop().split('_')[0];
    } else if (cleanPref.includes('_')) {
        const parts = cleanPref.split('_');
        cleanPref = (parts[0] === 'KANTO') ? parts[1] : parts[0];
    }

    const regionCode = window.currentRegion || 'KANTO';
    const key = regionCode + '_' + cleanPref;

    // 1. 読み込み済みであれば即リターン
    if (window.prefDictionaryCache[key]) {
        window.spotDictionary = window.prefDictionaryCache[key];
        return Promise.resolve(window.prefDictionaryCache[key]);
    }

    // 2. 現在通信中であればそのPromiseを共有して多重リクエストを防止
    if (window.prefDictionaryPromises[key]) {
        return window.prefDictionaryPromises[key];
    }

    const url = '/' + regionCode + '/' + cleanPref + '_dictionary.json';

    window.prefDictionaryPromises[key] = fetch(url)
        .then(res => {
            if (!res.ok) throw new Error('Dictionary JSON fetch failed: ' + res.status);
            return res.json();
        })
        .then(data => {
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid Dictionary JSON format: ' + url);
            }
            window.prefDictionaryCache[key] = data;
            window.spotDictionary = data;
            return data;
        })
        .catch(err => {
            delete window.prefDictionaryPromises[key];
            console.warn('逆引き辞書JSON取得スキップまたは未配置:', cleanPref, err.message);
            return null;
        });

    return window.prefDictionaryPromises[key];
}
window.loadPrefDictionaryJson = loadPrefDictionaryJson;

// ==========================================
// スポット詳細画面へのズーム遷移（同時に逆引き辞書JSONをロード）
// ==========================================
function zoomToSpot(spot) {
    if (!window.map || !spot) return;

    // ★ スポット所属県（または現在選択中の県）の逆引き辞書JSONを非同期で先行ロード
    const targetPrefCode = spot._prefCode || (spot.areaId ? String(spot.areaId).split('_')[0] : '') || window.currentPref;
    if (typeof loadPrefDictionaryJson === 'function' && targetPrefCode) {
        loadPrefDictionaryJson(targetPrefCode);
    }

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

    const targetZoom = isSpecial ? 14 : (safe.zoom < 14 ? 14 : safe.zoom);

    let isMoveEnded = false;
    let isFadeEnded = !hasOSM; 
    let isSpotPrepEnded = false;

    // ★ スポット画面の遷移中に裏側で「IP+UUIDの生成（生成済みならスキップ）」と「切り替え用タイルのプリフェッチ」を同時実行
    if (typeof window.prepareSpotActionButtons === 'function') {
        window.prepareSpotActionButtons(safe, targetZoom).finally(() => {
            isSpotPrepEnded = true;
            checkAndUnlockGuard();
        });
    } else {
        isSpotPrepEnded = true;
    }

    const safetyTimer = setTimeout(() => {
        isFadeEnded = true;
        isSpotPrepEnded = true;
        checkAndUnlockGuard();
    }, 3000);

    let isSpotButtonsShown = false;
    const checkAndUnlockGuard = () => {
        if (isMoveEnded && isFadeEnded && isSpotPrepEnded) {
            if (isSpotButtonsShown) return;
            isSpotButtonsShown = true;
            clearTimeout(safetyTimer);

            // ★ データ（IP+UUID・代替タイル・本採用/仮ピン）とカメラ遷移がすべて揃ったタイミングで両ボタンとピンを同時にフェードイン
            const tileWrap = document.getElementById('tile-btn-wrap');
            const tileBtn = document.getElementById('map-tile-btn');
            const postBtn = document.getElementById('map-post-btn');
            if (tileWrap && tileBtn) {
                tileWrap.style.display = 'flex';
                tileBtn.style.display = 'block';
                tileBtn.style.pointerEvents = 'auto';
                if (postBtn) {
                    postBtn.style.display = 'block';
                    postBtn.style.pointerEvents = 'auto';
                }
                requestAnimationFrame(() => {
                    tileBtn.style.opacity = '1';
                    if (postBtn) postBtn.style.opacity = '1';
                });
            }
            if (typeof window.fadeInUserAndTempPins === 'function') {
                window.fadeInUserAndTempPins(safe);
            }

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

    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;
    window.map.dragging.disable();
    window.map.scrollWheelZoom.disable();
    window.map.doubleClickZoom.disable();
    window.map.touchZoom.disable();

    // ★ 遷移開始時は両ボタンとユーザーピンレイヤーを一旦透明・非活性で待機させておく（準備完了後に checkAndUnlockGuard で同時フェードイン）
    if (typeof window.clearUserAndTempPins === 'function') {
        window.clearUserAndTempPins();
    }
    const tileWrap = document.getElementById('tile-btn-wrap');
    const tileBtn = document.getElementById('map-tile-btn');
    const postBtn = document.getElementById('map-post-btn');
    if (tileWrap && tileBtn) {
        tileBtn.style.opacity = '0';
        tileBtn.style.pointerEvents = 'none';
        if (postBtn) {
            postBtn.style.opacity = '0';
            postBtn.style.pointerEvents = 'none';
        }
    }

    window.map.flyTo([targetLat, targetLng], targetZoom, { duration: 0.5 });

    const el = document.getElementById("nearest-spot");
    if (el) el.textContent = safe.name || '';

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
window.zoomToSpot = zoomToSpot;
