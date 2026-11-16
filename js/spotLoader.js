// ==========================================
// 逆引き辞書JSONローダー ＆ スポット詳細ロード管理（spotLoader.js）
//
// 方針（prefLoader.js の pref_management と同設計）
//  1. 対象スポットの所属県 location.json だけを loadPrefectureSpots(prefCode, 'select') で取得し、
//     対象スポットの座標・ズーム・タイルで drawLocation() を最優先開始・完了させる。
//  2. drawLocation() 完了後、後続のスポット画面描画（逆引き辞書・アクセス情報・zoomToSpot）を開始。
//  3. 天気・魚種・釣具店データもまず対象スポットの所属県（select）だけを先行取得して即時反映。
//  4. 所属県の先行処理が終わった後、裏で他県データ（other -> all）と他県天気を順次取得。
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
// 逆引き辞書からスポット情報を取得するヘルパー
// ==========================================
function getSpotDictionaryEntry(spot) {
    if (!spot || !spot.name) return null;
    const spotName = String(spot.name).trim();
    const regionCode = window.currentRegion || 'KANTO';
    const prefCode = spot._prefCode || (spot.areaId ? String(spot.areaId).split('_')[0] : '') || window.currentPref;

    if (prefCode && window.prefDictionaryCache) {
        const cleanPref = String(prefCode).trim().split('/').pop().split('_')[0];
        const key = regionCode + '_' + cleanPref;
        if (window.prefDictionaryCache[key] && window.prefDictionaryCache[key][spotName]) {
            return window.prefDictionaryCache[key][spotName];
        }
    }

    if (window.spotDictionary && window.spotDictionary[spotName]) {
        return window.spotDictionary[spotName];
    }

    if (window.prefDictionaryCache) {
        for (const k of Object.keys(window.prefDictionaryCache)) {
            const dict = window.prefDictionaryCache[k];
            if (dict && dict[spotName]) {
                return dict[spotName];
            }
        }
    }

    return null;
}
window.getSpotDictionaryEntry = getSpotDictionaryEntry;

// ==========================================
// スポット詳細情報（逆引き辞書＋周辺アクセス情報）をDOMに描画
// ==========================================
function escapeSpotHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderAccessInfo(spot) {
    const container = document.getElementById('accessInfoBox');
    if (!container || !spot || !spot.lat || !spot.lng) {
        if (container) container.style.display = 'none';
        return;
    }

    const dictEntry = getSpotDictionaryEntry(spot);
    const accessTexts = typeof calcAccessInfo === 'function' ? calcAccessInfo(spot.lat, spot.lng) : [];

    // 1. waterName + 半角スペース + regionalName（未設定・存在しなければ省略）
    const waterName = dictEntry && dictEntry.waterName ? String(dictEntry.waterName).trim() : '';
    const regionalName = dictEntry && dictEntry.regionalName ? String(dictEntry.regionalName).trim() : '';
    const waterRegionalText = [waterName, regionalName].filter(Boolean).join(' ');

    // 2. alternateName と fishingCooperative（1行改行し上に詰めて横並び・右揃え）
    let altText = '';
    if (dictEntry && dictEntry.alternateName) {
        if (Array.isArray(dictEntry.alternateName)) {
            altText = dictEntry.alternateName.map(a => String(a).trim()).filter(Boolean).join('・');
        } else {
            altText = String(dictEntry.alternateName).trim();
        }
    }
    const coopText = dictEntry && dictEntry.fishingCooperative ? String(dictEntry.fishingCooperative).trim() : '';

    // 3. description
    const descText = dictEntry && dictEntry.description ? String(dictEntry.description).trim() : '';

    let html = '<div class="spot-header-wrap">';
    if (waterRegionalText) {
        html += `<div class="spot-water-regional">${escapeSpotHtml(waterRegionalText)}</div>`;
    }
    html += `<h3 class="spot-main-title">${escapeSpotHtml(spot.name)}</h3>`;
    if (altText || coopText) {
        html += '<div class="spot-sub-meta">';
        if (altText) {
            html += `<span class="spot-alt-name">${escapeSpotHtml(altText)}</span>`;
        }
        if (coopText) {
            html += `<span class="spot-coop-name">${escapeSpotHtml(coopText)}</span>`;
        }
        html += '</div>';
    }
    html += '</div>';

    if (descText) {
        const descClass = accessTexts.length > 0 ? 'spot-description has-access-list' : 'spot-description';
        html += `<p class="${descClass}">${escapeSpotHtml(descText)}</p>`;
    }

    if (accessTexts.length > 0) {
        html += '<ul class="spot-access-list">';
        accessTexts.forEach(text => {
            html += `<li>${text}</li>`;
        });
        html += '</ul>';
    }

    // 初期ガイドが残っている場合はクリアし、#spot-access-main のみ更新して後続セクション（釣具店・対象魚・釣果）を維持
    if (container.querySelector('#default-site-guide')) {
        container.innerHTML = '';
    }

    let mainBlock = document.getElementById('spot-access-main');
    if (!mainBlock || mainBlock.parentNode !== container) {
        mainBlock = document.createElement('div');
        mainBlock.id = 'spot-access-main';
        container.insertBefore(mainBlock, container.firstChild);
    }
    mainBlock.innerHTML = html;
    container.style.display = 'block';

    if (typeof renderShopSection === 'function') {
        renderShopSection(spot);
    }
}
window.renderAccessInfo = renderAccessInfo;

// ==========================================
// スポット詳細画面のドラッグ境界・ズームガード更新ヘルパー
// ==========================================
function updateSpotMaxBounds(safe) {
    if (!window.map || !safe || !safe.zoom || String(safe.zoom).trim() === '') return;
    const typeParts = (safe.type || '').split('$');
    const isSpecial = typeParts.includes('special');

    window.map.setMaxBounds(null);
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
}
window.updateSpotMaxBounds = updateSpotMaxBounds;

// ==========================================
// spot_management：SPOT画面の最優先ロード管理（pref_management と同設計）
// ==========================================
async function spot_management(prefCode = window.currentPref, areaId = window.currentAreaId, spotId = window.currentSpotId) {
    if (!prefCode || !spotId) return false;

    const regionCode = window.currentRegion || 'KANTO';
    window.currentPref = prefCode;
    window.prefLocationUrl = `/${regionCode}/${prefCode}_location.json`;
    window.prefWeatherUrl = `/data/${prefCode}_whether.json`;
    window.prefInlandWeatherUrl = `/data/${prefCode}_InLandwhether.json`;
    window.prefShopUrl = `/${regionCode}/${prefCode}_shop.json`;
    // drawLocation完了前に魚データの通信が走らないよう一旦nullにする
    window.fishUrl = null;

    if (window.nearestClickHandler && window.map) {
        window.map.off('click', window.nearestClickHandler);
    }
    window._nearestClickRegistered = false;

    const mapExistedBefore = !!window.map;
    if (window.map) {
        window.map.setMinZoom(0);
        window.map.setMaxZoom(18);
        window.map.setMaxBounds(null);
        window.map.options.maxBoundsViscosity = 0;
        window.map.stop();
    }

    // ---------- 1. 最優先：対象スポット所属県（select）のデータのみ取得してターゲットを特定 ----------
    const isRegionReady = await loadRegionCSV();
    if (!isRegionReady) return false;

    await loadPrefectureSpots(prefCode, 'select');
    if (typeof loadLocationJSON === 'function') {
        await loadLocationJSON();
    }

    const spotParts = String(spotId).split('_');
    const safeAreaId = areaId || '';
    const targetIndivId = spotParts[2] || spotParts[0];
    const list = (window.spotData || []).filter(s => String(s.areaId) === safeAreaId);
    const spot = list.find(s => String(s.individualId) === String(targetIndivId))
        || (window.spotData || []).find(s => String(s.individualId) === String(targetIndivId));

    if (!spot) {
        console.error('spot_management: 対象スポットが見つかりません:', prefCode, areaId, spotId);
        return false;
    }

    if (!window.currentAreaId && spot.areaId) {
        window.currentAreaId = spot.areaId;
    }
    const finalAreaId = window.currentAreaId || safeAreaId;
    const parentArea = (window.areaData || []).find(a => finalAreaId.endsWith(a.individualId));

    const hasSpotZoom = !!(spot.zoom && String(spot.zoom).trim() !== '');
    const typeParts = (spot.type || '').split('$');
    const isSpecial = typeParts.includes('special');
    const targetZoom = hasSpotZoom
        ? (isSpecial ? 14 : (Number(spot.zoom) < 14 ? 14 : Number(spot.zoom)))
        : 13;

    let tileUrl = window.TILE_URLS.ort;
    if (hasSpotZoom) {
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
    } else {
        window.currentSpotBaseTile = null;
    }

    // ---------- 2. 対象スポットの座標・ズームで drawLocation を直接実行して完了まで待機 ----------
    await drawLocation(spot.name, Number(spot.lat), Number(spot.lng), targetZoom);
    if (mapExistedBefore && !window.isInitialMapLoad && typeof waitMapSettled === 'function') {
        await waitMapSettled();
    }

    // ---------- 3. drawLocation 完了後：後続のスポット描画と所属県（select）の先行データ取得を開始 ----------
    window.fishUrl = `/${regionCode}/${prefCode}_fish.json`;

    if (window.prefData) setIdealQuery('pref', window.prefData.notes);
    if (parentArea) setIdealQuery('area', parentArea.name);
    setIdealQuery('spot', spot.name);
    window._selectSpotCompleted = true;

    // 逆引き辞書JSONとICデータを即時開始（完了時にアクセス枠とSEO構造化データを更新）
    const dictPromise = loadPrefDictionaryJson(prefCode).then(dict => {
        if (dict && window.currentSpotId && String(window.currentSpotId) === String(spot.individualId)) {
            renderAccessInfo(spot);
            if (typeof updateSeoMeta === 'function') updateSeoMeta();
        }
        return dict;
    });
    const icPromise = typeof loadICData === 'function' ? loadICData() : Promise.resolve(null);

    if (window.map) {
        window.map.invalidateSize(true);
        window.map.getContainer().classList.add('is-spot-mode');
    }

    if (hasSpotZoom) {
        zoomToSpot(spot);
    } else {
        renderAccessInfo(spot);
        if (typeof showSpotsForArea === 'function') showSpotsForArea(finalAreaId);
        if (typeof phase1menu === 'function') phase1menu(finalAreaId);
        if (typeof enableDragForArea === 'function') enableDragForArea();
        if (typeof enablePhase2 === 'function') enablePhase2(window.map);
        if (typeof showFishPopup === 'function') showFishPopup(spot);
    }

    requestAnimationFrame(() => {
        const btn = document.getElementById('map-back-btn');
        if (btn) {
            btn.style.display = 'block';
            requestAnimationFrame(() => {
                btn.style.opacity = '1';
            });
        }
    });

    if (typeof renderAreaGuide === 'function') renderAreaGuide();
    if (parentArea && typeof openArea === 'function') openArea(parentArea.individualId);

    const jnnRow = document.getElementById('map-jma-alert');
    if (jnnRow && window.currentPref === prefCode) {
        jnnRow.style.display = 'flex';
    }
    if (window.currentPref === prefCode && window.prefData && typeof getAlertText === 'function') {
        getAlertText(window.prefData);
    }

    // 所属県（prefCode）の天気・魚種・釣具店データを先行取得（対象スポットの沿岸/内陸区分を最優先）
    const bgGen = (window._prefBgGen = (window._prefBgGen || 0) + 1);
    const isInlandSpot = String(spot.individualId || spot.id || '').startsWith('L');

    const primaryWeatherPromise = isInlandSpot
        ? AddInLandWeather(prefCode, 'select')
        : AddWeather(prefCode, 'select');

    const fishPromise = typeof loadFishDataAsync === 'function'
        ? loadFishDataAsync(prefCode, window.fishUrl).then(fishData => {
            if (window.currentPref === prefCode && window.currentSpotId && String(window.currentSpotId) === String(spot.individualId)) {
                updateSpotMaxBounds(spot);
            }
            return fishData;
        })
        : Promise.resolve(null);

    primaryWeatherPromise.then(() => {
        if (window.currentPref === prefCode && window.currentSpotId && String(window.currentSpotId) === String(spot.individualId)) {
            if (spot.whether && typeof createWeekItem === 'function') {
                createWeekItem(spot.whether);
            }
        }
    });

    const secondaryWeatherPromise = isInlandSpot
        ? AddWeather(prefCode, 'select')
        : AddInLandWeather(prefCode, 'select');

    const shopPromise = (window.markerControl && typeof window.markerControl.preloadShop01 === 'function')
        ? window.markerControl.preloadShop01(window.prefShopUrl).then(() => {
            if (window.currentPref === prefCode) {
                if (!hasSpotZoom && finalAreaId && typeof window.markerControl.showShop01 === 'function') {
                    window.markerControl.showShop01(finalAreaId);
                }
                if (window.currentSpotId && String(window.currentSpotId) === String(spot.individualId) && typeof renderShopSection === 'function') {
                    renderShopSection(spot);
                }
            }
        })
        : Promise.resolve(null);

    const selectedPrefDonePromise = Promise.allSettled([
        dictPromise,
        icPromise,
        primaryWeatherPromise,
        secondaryWeatherPromise,
        fishPromise,
        shopPromise
    ]).then(() => {
        if (window.currentPref === prefCode) {
            if (window.currentSpotId && String(window.currentSpotId) === String(spot.individualId)) {
                if (spot.whether && typeof createWeekItem === 'function' && window.activeCol == null) {
                    createWeekItem(spot.whether);
                }
                if (typeof waitAndRenderSpotDetails === 'function') {
                    waitAndRenderSpotDetails(spot.name);
                }
            }
            if (typeof renderSpotRanking === 'function') {
                renderSpotRanking();
            }
        }
    });

    // ---------- 4. 所属県の先行処理が完了した後に、裏で他県データ（other -> all）と他県天気を順次取得 ----------
    window._prefBackgroundLoad = selectedPrefDonePromise
        .then(() => loadPrefectureSpots(prefCode, 'other'))
        .then(() => loadPrefectureSpots(prefCode, 'all'))
        .then(() => {
            if (typeof getPrefParentRow === 'function') {
                const finalParent = getPrefParentRow(prefCode);
                if (finalParent) window.prefData = finalParent;
            }
            if (typeof showPrefMarkers === 'function') {
                return showPrefMarkers();
            }
        })
        .then(() => {
            if (window._prefBgDone) return;
            if (typeof runPrefBackgroundLoads === 'function') {
                return runPrefBackgroundLoads(prefCode, Promise.resolve(), bgGen, Promise.resolve());
            }
        })
        .catch(err => {
            console.error('スポット画面バックグラウンド処理エラー:', err);
        });

    return true;
}
window.spot_management = spot_management;

// ==========================================
// スポット詳細画面へのズーム遷移
// ==========================================
function zoomToSpot(spot) {
    if (!window.map || !spot) return;

    // ★ スポット所属県（または現在選択中の県）の逆引き辞書JSONを非同期でロードし、完了時に表示とSEO構造化データを更新
    const targetPrefCode = spot._prefCode || (spot.areaId ? String(spot.areaId).split('_')[0] : '') || window.currentPref;
    if (typeof loadPrefDictionaryJson === 'function' && targetPrefCode) {
        loadPrefDictionaryJson(targetPrefCode).then(dict => {
            if (dict && window.currentSpotId && String(window.currentSpotId) === String(spot.individualId)) {
                renderAccessInfo(spot);
                if (typeof updateSeoMeta === 'function') updateSeoMeta();
            }
        });
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
            if (window.gsiLayer._url !== tileUrl) {
                window.gsiLayer.setUrl(tileUrl);
            }
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
            // ★ spot_management の drawLocation で既に同じ tileUrl が設定済みの場合は再リクエストさせない
            if (window.gsiLayer._url !== tileUrl) {
                window.gsiLayer.setUrl(tileUrl);
            }
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

    const el = document.getElementById("nearest-spot");
    if (el) el.textContent = safe.name || '';

    if (safe?.individualId != null) {
        if (window.prefData) setIdealQuery('pref', window.prefData.notes);
        const parentArea = window.areaData.find(a => String(a.areaId + '_' + a.individualId) === String(safe.areaId));
        if (parentArea) setIdealQuery('area', parentArea.name);
        setIdealQuery('spot', safe.name);
        window.currentSpotId = safe.individualId;
    }

    const finalizeZoomToSpot = () => {
        window.map.invalidateSize(true);
        showFishMarkers(safe.URL);
        createWeekItem(safe.whether);

        window.map.setMaxZoom(18);
        updateSpotMaxBounds(safe);

        window.map.dragging.enable();
        // ★ 既に広域ドットが存在する場合のみ非表示化する（未生成時に showAllRegionSpots が暴発するのを防ぐ）
        if (window.regionSpotMarkers && window.regionSpotMarkers.length > 0 && typeof showPrefSpots === 'function') {
            showPrefSpots();
        }

        isMoveEnded = true;
        checkAndUnlockGuard();
    };

    const center = window.map.getCenter();
    const isSameLoc = center &&
        Math.abs(center.lat - Number(targetLat)) < 0.0001 &&
        Math.abs(center.lng - Number(targetLng)) < 0.0001 &&
        window.map.getZoom() === Number(targetZoom);

    if (isSameLoc) {
        finalizeZoomToSpot();
    } else {
        window.map.flyTo([targetLat, targetLng], targetZoom, { duration: 0.5 });
        window.map.once('moveend', finalizeZoomToSpot);
    }
}
window.zoomToSpot = zoomToSpot;
