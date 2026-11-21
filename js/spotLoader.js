// ==========================================
// 逆引き辞書JSONローダー ＆ スポット詳細ロード管理（spotLoader.js）
//
// 方針（prefLoader.js の pref_management と同設計）
//  1. 対象スポットの所属県 location.json だけを loadPrefectureSpots(prefCode, 'select') で取得し、
//     対象スポットの座標・ズーム・タイルで drawLocation() を最優先開始・完了させる。
//  2. drawLocation() 完了後、所属県（select）の天気・魚種・釣具店データ取得と zoomToSpot() を開始。
//  3. 他県データの取得は行わず、所属県データと演出準備が揃ったタイミングで戻るボタン・タイル切替・投稿ボタンを同時フェードイン。
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

    let mainBlock = document.getElementById('spot-access-main');
    if (!mainBlock || mainBlock.parentNode !== container) {
        mainBlock = document.createElement('div');
        mainBlock.id = 'spot-access-main';
        container.insertBefore(mainBlock, container.firstChild);
    }
    mainBlock.innerHTML = html;
    container.style.display = 'block';

    // SPOT画面表示中は「特徴と使い方」と「エリアガイド」を確実に非表示にする
    const siteGuideBox = document.getElementById('siteGuideBox');
    if (siteGuideBox) siteGuideBox.style.display = 'none';
    const areaGuide = document.getElementById('area-guide');
    if (areaGuide) areaGuide.style.display = 'none';

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
    const isRegionReady = typeof loadRegionCSV === 'function' ? await loadRegionCSV() : true;
    if (!isRegionReady) return false;

    if (typeof loadPrefectureSpots === 'function') {
        await loadPrefectureSpots(prefCode, 'select');
    }
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

    if (window.prefData) setIdealQuery('pref', window.prefData.notes);
    if (parentArea) setIdealQuery('area', parentArea.name);
    setIdealQuery('spot', spot.name);

    // 逆引き辞書JSONとICデータを drawLocation と並行して開始し、取得次第すぐにアクセス枠と構造化データを更新
    const dictPromise = loadPrefDictionaryJson(prefCode).then(dict => {
        if (dict && window.currentSpotId && String(window.currentSpotId) === String(spot.individualId)) {
            renderAccessInfo(spot);
            if (typeof updateSeoMeta === 'function') updateSeoMeta();
        }
        return dict;
    });
    const icPromise = typeof loadICData === 'function' ? loadICData() : Promise.resolve(null);
    renderAccessInfo(spot);

    // ---------- 2. 対象スポットの座標・ズームで drawLocation を直接実行して完了まで待機 ----------
    if (typeof drawLocation === 'function') {
        await drawLocation(spot.name, Number(spot.lat), Number(spot.lng), targetZoom);
    }
    if (mapExistedBefore && !window.isInitialMapLoad && typeof waitMapSettled === 'function') {
        await waitMapSettled();
    }

    // ---------- 3. drawLocation 完了後：所属県（select）のデータ取得と後続のスポット描画を開始 ----------
    window.fishUrl = `/${regionCode}/${prefCode}_fish.json`;

    if (window.map) {
        window.map.invalidateSize(true);
        window.map.getContainer().classList.add('is-spot-mode');
    }

    // 所属県（prefCode）の天気・魚種・釣具店データを取得（他県データは不要のため取得しない）
    const isInlandSpot = String(spot.individualId || spot.id || '').startsWith('L');

    const primaryWeatherPromise = isInlandSpot
        ? (typeof AddInLandWeather === 'function' ? AddInLandWeather(prefCode, 'select') : Promise.resolve(0))
        : (typeof AddWeather === 'function' ? AddWeather(prefCode, 'select') : Promise.resolve(0));

    const isCurrentTargetSpot = () => (
        window.currentPref === prefCode &&
        window.currentSpotId &&
        String(window.currentSpotId) === String(spot.individualId) &&
        (!window.currentAreaId || !spot.areaId || String(window.currentAreaId) === String(spot.areaId))
    );

    const fishPromise = typeof loadFishDataAsync === 'function'
        ? loadFishDataAsync(prefCode, window.fishUrl).then(fishData => {
            if (isCurrentTargetSpot()) {
                if (!spot.URL && fishData && typeof applyFishDataToSpots === 'function') {
                    applyFishDataToSpots([spot], fishData);
                }
                if (hasSpotZoom && spot.URL && typeof showFishMarkers === 'function') {
                    showFishMarkers(spot.URL);
                }
                updateSpotMaxBounds(spot);
                if (typeof updateSeoMeta === 'function') updateSeoMeta();
                if (typeof waitAndRenderSpotDetails === 'function') waitAndRenderSpotDetails(spot.name);
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
        ? (typeof AddWeather === 'function' ? AddWeather(prefCode, 'select') : Promise.resolve(0))
        : (typeof AddInLandWeather === 'function' ? AddInLandWeather(prefCode, 'select') : Promise.resolve(0));

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

    // Phase2復帰に必要な所属県データ（天気・釣具店）の準備完了Promise
    const prefReturnReadyPromise = Promise.allSettled([
        primaryWeatherPromise,
        secondaryWeatherPromise,
        shopPromise
    ]);

    const selectedPrefDonePromise = Promise.allSettled([
        dictPromise,
        icPromise,
        prefReturnReadyPromise,
        fishPromise
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
        }
    });

    window._prefBackgroundLoad = selectedPrefDonePromise;

    if (hasSpotZoom) {
        // 戻るボタンはタイル切替・投稿ボタンと同様に、所属県データと演出準備が揃ってから同時フェードインさせる
        zoomToSpot(spot, { prefDataPromise: prefReturnReadyPromise });
    } else {
        const backBtn = document.getElementById('map-back-btn');
        if (backBtn) {
            backBtn.style.opacity = '0';
            backBtn.style.pointerEvents = 'none';
            backBtn.style.display = 'block';
        }
        renderAccessInfo(spot);
        if (typeof showSpotsForArea === 'function') showSpotsForArea(finalAreaId);
        if (typeof phase1menu === 'function') phase1menu(finalAreaId);
        if (typeof enableDragForArea === 'function') enableDragForArea();
        if (typeof enablePhase2 === 'function') enablePhase2(window.map);
        if (typeof showFishPopup === 'function') showFishPopup(spot);

        // ズーム13スポットも所属県データ完了（最大3秒保険）で戻るボタンをフェードイン
        Promise.race([
            prefReturnReadyPromise,
            new Promise(resolve => setTimeout(resolve, 3000))
        ]).then(() => {
            if (window.currentPref !== prefCode) return;
            const btn = document.getElementById('map-back-btn');
            if (btn) {
                btn.style.display = 'block';
                btn.style.transition = 'opacity 0.4s ease';
                btn.style.pointerEvents = 'auto';
                requestAnimationFrame(() => {
                    btn.style.opacity = '1';
                });
            }
            if (!hasSpotZoom && finalAreaId && typeof phase1menu === 'function') {
                phase1menu(finalAreaId);
            }
        });
    }

    if (typeof renderSpotRanking === 'function') renderSpotRanking();
    if (typeof syncGuideSections === 'function') syncGuideSections();

    const jnnRow = document.getElementById('map-jma-alert');
    if (jnnRow && window.currentPref === prefCode) {
        jnnRow.style.display = 'flex';
    }
    if (window.currentPref === prefCode && window.prefData && typeof getAlertText === 'function') {
        getAlertText(window.prefData);
    }

    return true;
}
window.spot_management = spot_management;

// ==========================================
// スポット詳細画面へのズーム遷移
// ==========================================
function zoomToSpot(spot, options = {}) {
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

    if (typeof disablePhase2 === 'function') disablePhase2(window.map);
    resetSpotLayers();
    if (window.phase2Group) window.phase2Group.clearLayers();
    if (window.phase1Group) window.phase1Group.clearLayers();
    if (typeof clearSub2Weather === 'function') clearSub2Weather();
    if (typeof removeCrowdImage === 'function') removeCrowdImage();

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
    let isPrefDataReady = !(options && options.prefDataPromise && typeof options.prefDataPromise.then === 'function');

    // ★ スポット画面の遷移中に裏側で「IP+UUIDの生成（生成済みならスキップ）」と「切り替え用タイルのプリフェッチ」を同時実行
    if (typeof window.prepareSpotActionButtons === 'function') {
        window.prepareSpotActionButtons(safe, targetZoom).finally(() => {
            isSpotPrepEnded = true;
            checkAndUnlockGuard();
        });
    } else {
        isSpotPrepEnded = true;
    }

    // ★ URL直打ち時は所属県データ（天気・釣具店）の準備完了も待機してから戻るボタン等を同時フェードインさせる
    if (!isPrefDataReady) {
        options.prefDataPromise.finally(() => {
            isPrefDataReady = true;
            checkAndUnlockGuard();
        });
    }

    const safetyTimer = setTimeout(() => {
        isFadeEnded = true;
        isSpotPrepEnded = true;
        isPrefDataReady = true;
        checkAndUnlockGuard();
    }, 3000);

    let isSpotButtonsShown = false;
    const checkAndUnlockGuard = () => {
        if (isMoveEnded && isFadeEnded && isSpotPrepEnded && isPrefDataReady) {
            if (isSpotButtonsShown) return;
            isSpotButtonsShown = true;
            clearTimeout(safetyTimer);

            // ★ データ（所属県データ・IP+UUID・代替タイル・本採用/仮ピン）とカメラ遷移がすべて揃ったタイミングで
            //    戻るボタン・タイル切替ボタン・投稿ボタン・ピンを同時にフェードイン
            const backBtn = document.getElementById('map-back-btn');
            const tileWrap = document.getElementById('tile-btn-wrap');
            const tileBtn = document.getElementById('map-tile-btn');
            const postBtn = document.getElementById('map-post-btn');
            if (backBtn) {
                backBtn.style.display = 'block';
                backBtn.style.transition = 'opacity 0.4s ease';
                backBtn.style.pointerEvents = 'auto';
            }
            if (tileWrap && tileBtn) {
                tileWrap.style.display = 'flex';
                tileBtn.style.display = 'block';
                tileBtn.style.pointerEvents = 'auto';
                if (postBtn) {
                    postBtn.style.display = 'block';
                    postBtn.style.pointerEvents = 'auto';
                }
            }
            requestAnimationFrame(() => {
                if (backBtn) backBtn.style.opacity = '1';
                if (tileBtn) tileBtn.style.opacity = '1';
                if (postBtn) postBtn.style.opacity = '1';
            });
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

    // ★ 遷移開始時は戻るボタン・両ボタン・ユーザーピンレイヤーを一旦透明・非活性で待機させておく（準備完了後に checkAndUnlockGuard で同時フェードイン）
    if (typeof window.clearUserAndTempPins === 'function') {
        window.clearUserAndTempPins();
    }
    const backBtnInit = document.getElementById('map-back-btn');
    if (backBtnInit) {
        backBtnInit.style.opacity = '0';
        backBtnInit.style.pointerEvents = 'none';
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
    if (typeof syncGuideSections === 'function') syncGuideSections();

    const finalizeZoomToSpot = () => {
        window.map.invalidateSize(true);
        if (window.phase2Group) window.phase2Group.clearLayers();
        if (window.phase1Group) window.phase1Group.clearLayers();
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

// ==========================================
// スポット詳細画面 共通ユーティリティ・天気・潮汐・アクセス・魚種描画
// （dataLoader.js / index.txt から引っ越し）
// ==========================================
function safeSpotWeatherIcon(code) {
    if (typeof toWeatherIcon === 'function') return toWeatherIcon(code);
    if (code >= 70) return "☔️";
    if (code >= 60) return "☂️";
    if (code >= 30) return "☁️";
    if (code >= 10) return "⛅";
    if (code === 1) return "🌤";
    if (code === 2) return "⛅";
    return "☀️";
}

function showFishPopup(spot) {
    const title = spot.name || '';
    const address = spot.notes || '';

    // 1. Googleマップ ルート案内URL (スポット名と補足情報を使って確実にセット)
    const routeKeyword = `${title} ${address}`.trim();
    const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(routeKeyword)}`;

    // 2. Google検索URL
    const searchKeyword = `${title} ${address}`.trim();
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchKeyword)}`;

    // 3. ChatGPT質問URL (釣りスポット専用のプロンプトに最適化)
    const chatGptPrompt = `釣りスポット「${title}」${address ? `（${address}）` : ''}で釣れる魚種、駐車場やトイレの有無、釣り場の特徴などの詳細情報を教えて`;
    const chatGptUrl = `https://chatgpt.com/?q=${encodeURIComponent(chatGptPrompt)}`;

    // ショップと同じCSSクラス（.shop-popup系）を使い回してデザインを完全統一
    const popupHtml = `
        <div class="shop-popup">
            <div class="shop-popup-title">${title}</div>
            <div class="shop-popup-address">${address}</div>
            <div class="shop-popup-footer">
                <a class="shop-popup-btn" href="${routeUrl}" target="_blank" rel="noopener noreferrer">
                    ルート案内
                </a>
                <a class="shop-popup-btn" href="${googleSearchUrl}" target="_blank" rel="noopener noreferrer">
                    Google検索
                </a>
                <a class="shop-popup-btn btn-chatgpt" href="${chatGptUrl}" target="_blank" rel="noopener noreferrer">
                    ChatGPT
                </a>
            </div>
        </div>
    `;

    // 既存のポップアップを安全に解除して新しいものをバインド
    spot.marker
        ?.closePopup?.();

    spot.marker
        ?.unbindPopup?.();

    spot.marker
        ?.bindPopup(popupHtml)
        ?.openPopup();
}



function showFishMarkers(url) {
  if (!window.map) return;

  // 同一URLの魚マーカーがすでに地図上に表示済みなら再描画をスキップ
  if (
    url &&
    typeof url === 'string' &&
    window.fishLayer &&
    window.map.hasLayer(window.fishLayer) &&
    window.fishLayer._renderedUrl === url
  ) {
    return;
  }

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
  window.fishLayer._renderedUrl = url;
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
                        cell.textContent = safeSpotWeatherIcon(best ?? 0);
                    } else {
                        cell.textContent = safeSpotWeatherIcon(data?.weather?.[0] ?? 0);
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
    c1.textContent = safeSpotWeatherIcon(adjustWeatherCodeForPop(code, pop));
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
  const safeSun = (sun && typeof sun.sunrise === 'number' && typeof sun.sunset === 'number')
    ? sun
    : { sunrise: 360, sunset: 1080 };
  const baseStepX = w / 24; 
  const sunriseX = (safeSun.sunrise / 1440) * w + baseStepX;

  const adjustedSunset = Math.max(safeSun.sunrise, safeSun.sunset - 30); 
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

function calcDistanceMeters(lat1, lng1, lat2, lng2) {
    if (typeof L !== 'undefined' && typeof L.latLng === 'function') {
        return L.latLng(lat1, lng1).distanceTo(L.latLng(lat2, lng2));
    }
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
window.calcDistanceMeters = calcDistanceMeters;

function calcAccessInfo(spotLat, spotLng) {
    if (!window.icData || window.icData.length === 0) return [];

    const mappedData = window.icData.map(item => {
        const distance = calcDistanceMeters(spotLat, spotLng, Number(item.lat), Number(item.lng));
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
// ★ 新規：最寄りの釣具店を描画する関数（ロジック修正・番号なし版）
// ==========================================
function renderShopSection(spot) {
    const accessBox = document.getElementById('accessInfoBox');
    if (!accessBox || !spot || !spot.lat || !spot.lng) return;

    // 既存の釣具店エリアがあれば削除（重複防止）
    const oldShopArea = document.getElementById('spot-shop-section');
    if (oldShopArea) oldShopArea.remove();

    // ショップデータがまだ無い場合は終了
    if (!window.markerControl || !window.markerControl.allShops || window.markerControl.allShops.length === 0) return;

    // 1. 有効な全店舗（座標あり）を抽出し、距離を計算して近い順にソートしておく
    const allValidShops = window.markerControl.allShops
        .filter(s => !isNaN(s.lat) && !isNaN(s.lng))
        .map(s => {
            const dist = calcDistanceMeters(Number(spot.lat), Number(spot.lng), Number(s.lat), Number(s.lng));
            return { ...s, distance: dist };
        })
        .sort((a, b) => a.distance - b.distance);

    if (allValidShops.length === 0) return;

    const displayShops = [];

    // 2. まずは既存の「ショップicon縛り(shop4以外)」をした最寄りの1件を探して追加
    const firstShop = allValidShops.find(s => s.icon !== 'shop4');
    if (firstShop) {
        displayShops.push(firstShop);
    }

    // 3. .type ロジックを用いた条件分岐
    const typeParts = (spot.type || "").split('$');
    const isMainSpot = typeParts.includes("representative") || 
                       typeParts.includes("assistant") || 
                       typeParts.includes("substitute");

    if (isMainSpot) {
        // 追加で「ショップicon縛りを無くした2件」を、1件目と被らないように追加
        let addedCount = 0;
        for (const shop of allValidShops) {
            if (addedCount >= 2) break; // 2件追加したら終了
            
            // 既に表示リストに入っている店舗（1件目で選ばれた店舗）はスキップ
            if (displayShops.some(s => s.name === shop.name && s.lat === shop.lat && s.lng === shop.lng)) {
                continue;
            }
            displayShops.push(shop);
            addedCount++;
        }
    }

    if (displayShops.length === 0) return;

    // HTML組み立て
    const shopDiv = document.createElement('div');
    shopDiv.id = 'spot-shop-section';
    shopDiv.style.marginTop = '12px';
    shopDiv.style.paddingTop = '10px';
    shopDiv.style.borderTop = '1px dashed rgba(25, 25, 112, 0.2)';

    let html = `<div style="font-weight: bold; font-size: 13px; margin-bottom: 4px;">🎣 最寄りの釣具店</div>`;
    html += `<div style="font-size: 13px; line-height: 1.5;">`;

    displayShops.forEach((shop) => {
        const realDistKm = (shop.distance * 1.35) / 1000;
        const time = Math.round(realDistKm * 1.5); 
        
        const shopName = shop.group && shop.group !== '個人商店' && shop.group !== 'shop'
            ? `${shop.group} ${shop.name}`
            : shop.name;

        // 番号(1. 2. 3.)を無くし、スッキリと表示
        html += `<div style="margin-bottom: 4px;">${shopName} まで車で 約${time}分 (${realDistKm.toFixed(1)}km)</div>`;
    });

    html += `</div>`;
    shopDiv.innerHTML = html;
    const nextSection = document.getElementById('spot-fish-section') || document.getElementById('spot-catch-section');
    if (nextSection && nextSection.parentNode === accessBox) {
        accessBox.insertBefore(shopDiv, nextSection);
    } else {
        accessBox.appendChild(shopDiv);
    }
}
// ==========================================
// ★ 新規：10km圏内のリアルタイム釣果を描画する関数（多重挿入ガード＆Promise共有版）
// ==========================================
async function renderRecentCatches(spot) {
    const accessBox = document.getElementById('accessInfoBox');
    if (!accessBox || !spot || !spot.lat || !spot.lng) return;

    const spotKey = String(spot.individualId || spot.name || '');

    // 同じスポットの釣果欄が既に挿入済みなら即リターン
    const existingBefore = document.getElementById('spot-catch-section');
    if (existingBefore) {
        if (existingBefore.dataset.spotKey === spotKey) return;
        existingBefore.remove();
    }

    if (!window.compiledCatchData) {
        try {
            if (!window._compiledCatchDataPromise) {
                window._compiledCatchDataPromise = fetch('/data/compiled_data.json')
                    .then(res => {
                        if (!res.ok) throw new Error("JSON fetch failed");
                        return res.json();
                    })
                    .then(json => {
                        window.compiledCatchData = json;
                        return json;
                    })
                    .catch(e => {
                        window._compiledCatchDataPromise = null;
                        throw e;
                    });
            }
            await window._compiledCatchDataPromise;
        } catch (e) {
            console.error("釣果データの読み込みに失敗しました:", e);
            return;
        }
    }

    const data = window.compiledCatchData;
    if (!data) return;

    // 非同期取得完了後：スポット画面から離脱済み、または既に同スポットが挿入済みなら即リターン
    if ((typeof window.isSpotScreen === 'function' && !window.isSpotScreen()) || accessBox.style.display === 'none') return;
    if (window.currentSpotId && spot.individualId != null && String(window.currentSpotId) !== String(spot.individualId)) {
        return;
    }
    const existingAfter = document.getElementById('spot-catch-section');
    if (existingAfter) {
        if (existingAfter.dataset.spotKey === spotKey) return;
        existingAfter.remove();
    }

    const allCatches = [...(data.map_data || []), ...(data.blog_data || [])];

    // 10km以内の釣果を抽出（L未定義時も純粋JSで距離計算）
    const nearbyCatches = allCatches.filter(c => {
        if (!c.lat || !c.lng || !c.fish) return false;
        const dist = calcDistanceMeters(Number(spot.lat), Number(spot.lng), Number(c.lat), Number(c.lng));
        return dist <= 10000; 
    });

    if (nearbyCatches.length === 0) return;

    // 魚種を抽出し、重複を削除してから「五十音順」にソート
    const fishNames = [...new Set(nearbyCatches.map(c => c.fish))];
    fishNames.sort((a, b) => a.localeCompare(b, 'ja'));

    // HTMLの構築
    const catchDiv = document.createElement('div');
    catchDiv.id = 'spot-catch-section';
    catchDiv.dataset.spotKey = spotKey;
    catchDiv.style.marginTop = '12px';
    catchDiv.style.paddingTop = '10px';
    catchDiv.style.borderTop = '1px dashed rgba(25, 25, 112, 0.2)';

    let html = `<div style="font-weight: bold; font-size: 13px; color: #191970; margin-bottom: 4px;">🎣 最新の釣果情報</div>`;
    html += `<div style="font-size: 13px; line-height: 1.5;">いまこの周辺で <strong>${fishNames.join('、')}</strong> が釣れてます</div>`;
    catchDiv.innerHTML = html;

    // setTimeout を廃止し、即座に挿入
    const fishSection = document.getElementById('spot-fish-section');
    const shopSection = document.getElementById('spot-shop-section');
    
    if (fishSection) {
        fishSection.parentNode.insertBefore(catchDiv, fishSection.nextSibling);
    } else if (shopSection) {
        shopSection.parentNode.insertBefore(catchDiv, shopSection.nextSibling);
    } else {
        accessBox.appendChild(catchDiv);
    }
}
// ★ スポット詳細情報枠をクリアして非表示にする（「特徴と使い方」は #siteGuideBox で独立管理）
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
    if (typeof window.clearUserAndTempPins === 'function') {
        window.clearUserAndTempPins();
    }
}

function buildSpotRestoreObject() {
    const spotId = window.currentSpotId;

    if (!spotId) return null;

    const parts = String(spotId).split('_');
    const spotKey = parts[parts.length - 1]; 

    // ★ areaId一致を優先し、無ければ全スポットからIDで検索する
    const spot = (window.currentAreaId
        ? window.spotData.find(s => String(s.areaId) === String(window.currentAreaId) && String(s.individualId) === String(spotKey))
        : null)
        || window.spotData.find(s => String(s.individualId) === String(spotKey));

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


// ==========================================
// ★ スポット詳細の「主な対象魚」「最新の釣果情報」を準備完了まで待機して描画する関数
// ==========================================
let _spotDetailsRenderTimer = null;

function waitAndRenderSpotDetails(spotName, retryCount = 0) {
    if (_spotDetailsRenderTimer) {
        clearTimeout(_spotDetailsRenderTimer);
        _spotDetailsRenderTimer = null;
    }

    // URLのspotパラメータが変わっていたら（別画面へ遷移していたら）中止
    const params = new URLSearchParams(window.location.search);
    const currentSpotParam = params.get('spot');
    if (!currentSpotParam || currentSpotParam !== spotName) return;

    // 1. スポットデータの準備確認（areaId一致を優先）
    const targetSpot = (window.spotData && window.spotData.length > 0)
        ? ((window.currentAreaId
            ? window.spotData.find(s => String(s.areaId) === String(window.currentAreaId) && s.name === spotName)
            : null) || window.spotData.find(s => s.name === spotName))
        : null;

    // 2. アクセス情報枠 (#accessInfoBox) の準備確認
    const accessBox = document.getElementById('accessInfoBox');
    const h3El = accessBox ? accessBox.querySelector('h3') : null;
    const isAccessBoxRendered = !!(
        accessBox &&
        accessBox.style.display !== 'none' &&
        h3El &&
        h3El.textContent.includes(spotName)
    );

    // 3. スポットへのズーム遷移 (zoomToSpot内のrenderAccessInfo) が完了しているか確認
    const hasSpotZoom = !!(targetSpot && targetSpot.zoom && String(targetSpot.zoom).trim() !== '');
    const isZoomToSpotDone = !hasSpotZoom || !!window.currentSpotBaseTile;

    // 4. 魚データ (window.fishData / targetSpot.URL) の到着確認（2.5秒経過時はタイムアウト許容）
    //    ※ 釣具店・ICデータは到着時に独立挿入されるため、魚種テキスト描画を2.5秒待たせない
    const isFishDataReady = !!window.fishData || !!(targetSpot && targetSpot.URL) || retryCount >= 25;

    // 必須条件が揃っていなければ 100ms 後に非同期リトライ（最大50回＝5秒）
    if ((!targetSpot || !isAccessBoxRendered || !isZoomToSpotDone || !isFishDataReady) && retryCount < 50) {
        _spotDetailsRenderTimer = setTimeout(() => {
            waitAndRenderSpotDetails(spotName, retryCount + 1);
        }, 100);
        return;
    }

    if (!targetSpot || !accessBox) return;

    // 準備完了後、最新の targetSpot.URL から魚種リストを抽出
    let uniqueNames = [];
    if (targetSpot.URL && typeof targetSpot.URL === 'string') {
        const items = targetSpot.URL.split(',');
        const names = items.map(item => item.split('|')[0]).filter(Boolean);
        uniqueNames = [...new Set(names)];
    }

    // ① 主な対象魚を描画
    if (typeof renderFishSection === 'function') {
        renderFishSection(uniqueNames);
    }

    // ② 最新の釣果情報を描画（対象魚が無いスポットでも独立して実行）
    if (typeof renderRecentCatches === 'function') {
        renderRecentCatches(targetSpot);
    }

    // ③ 魚データや逆引き辞書が後から届いた場合のために meta description と JSON-LD も最新化
    const dictEntry = typeof getSpotDictionaryEntry === 'function' ? getSpotDictionaryEntry(targetSpot) : null;
    if (uniqueNames.length > 0 || (dictEntry && dictEntry.description)) {
        const pref = params.get('pref') || '';
        const area = params.get('area') || '';
        const baseDesc = (dictEntry && dictEntry.description)
            ? dictEntry.description
            : `${pref}${area}にある「${spotName}」の釣りポイント、最新の天気予報、潮汐データなどをマップで詳しく解説します。`;
        const extraPrefix = uniqueNames.length > 0 ? `対象魚や周辺情報: ${uniqueNames.join('、')}など。` : '';
        const fullDesc = extraPrefix + baseDesc;

        const descMeta = document.querySelector('meta[name="description"]');
        if (descMeta) descMeta.setAttribute('content', fullDesc);
        const ogDescMeta = document.querySelector('meta[property="og:description"]');
        if (ogDescMeta) ogDescMeta.setAttribute('content', fullDesc);

        const ldScript = document.getElementById('seo-json-ld');
        if (ldScript && targetSpot.lat && targetSpot.lng) {
            try {
                const ldData = JSON.parse(ldScript.textContent);
                ldData.description = (dictEntry && dictEntry.description) ? dictEntry.description : fullDesc;
                if (dictEntry) {
                    if (dictEntry.alternateName) ldData.alternateName = dictEntry.alternateName;
                    if (dictEntry.addressRegion || dictEntry.addressLocality) {
                        ldData.address = {
                            "@type": "PostalAddress",
                            "addressCountry": "JP",
                            "addressRegion": dictEntry.addressRegion || pref || "",
                            "addressLocality": dictEntry.addressLocality || ""
                        };
                    }
                }
                ldScript.textContent = JSON.stringify(ldData);
            } catch (e) {}
        }
    }
}

window.icData = [];
window.isIcLoaded = false;
let icDataPromise = null;
function loadICData() {
    if (window.isIcLoaded) return Promise.resolve(window.icData);
    if (icDataPromise) return icDataPromise;
    icDataPromise = fetch('data/KANTO_geo.json')
        .then(res => {
            if (!res.ok) throw new Error('IC JSON fetch failed: ' + res.status);
            return res.json();
        })
        .then(data => {
            window.icData = data;
            window.isIcLoaded = true;
            if (window.currentSpotId && window.spotData && typeof renderAccessInfo === 'function') {
                const activeSpot = (window.currentAreaId
                    ? window.spotData.find(s => String(s.areaId) === String(window.currentAreaId) && String(s.individualId) === String(window.currentSpotId))
                    : null)
                    || window.spotData.find(s => String(s.individualId) === String(window.currentSpotId));
                if (activeSpot) {
                    renderAccessInfo(activeSpot);
                    if (typeof waitAndRenderSpotDetails === 'function') waitAndRenderSpotDetails(activeSpot.name);
                }
            }
            return data;
        })
        .catch(error => {
            icDataPromise = null;
            console.error('ICデータ読み込みエラー:', error);
            return null;
        });
    return icDataPromise;
}

// ==========================================
// ★ 魚種名おまとめ辞書（出世魚や別名を統一）
// ==========================================
const FISH_DICTIONARY = {
    "ツバス": "ワカシ",
    "ワカシ": "ワカシ",
    "ハマチ": "イナダ",
    "イナダ": "イナダ",
    "メジロ": "ワラサ",
    "ワラサ": "ワラサ",
    "ブリ": "ブリ",
    "セイゴ": "スズキ",
    "フッコ": "スズキ",
    "スズキ": "スズキ",
    "サゴシ": "サワラ",
    "サワラ": "サワラ",
    "カイズ": "クロダイ",
    "チヌ": "クロダイ",
    "クロダイ": "クロダイ",
    "コハダ": "コノシロ",
    "コノシロ": "コノシロ",
    "クチボソ": "モツゴ",
    "モツゴ": "モツゴ",
    "ヤマベ": "オイカワ",
    "オイカワ": "オイカワ",
    "グレ": "メジナ",
    "メジナ": "メジナ"
};

// ==========================================
// ★ 新規：対象魚種データを描画する関数（辞書変換＆ソート対応版）
// ==========================================
function renderFishSection(uniqueNames) {
    const accessBox = document.getElementById('accessInfoBox');
    if (!accessBox) return;

    // 既存の魚種エリアがあれば削除（重複防止）
    const oldFishArea = document.getElementById('spot-fish-section');
    if (oldFishArea) oldFishArea.remove();

    if (!uniqueNames || uniqueNames.length === 0) return;

    // 1. 全角カタカナ（と長音符）のみにフィルターし、周辺施設などを弾く
    const fishOnly = uniqueNames.filter(name => /^[ァ-ヴー]+$/.test(name));

    // 2. 辞書を使って名称を変換（辞書にない魚はそのままの名前を使う）
    const mappedFish = fishOnly.map(name => FISH_DICTIONARY[name] || name);

    // 3. 変換した結果、重複したもの（例：セイゴとフッコが両方いて「スズキ」が2つになった場合）を再度まとめる
    const finalFishList = [...new Set(mappedFish)];

    // 4. あいうえお順（五十音順）にソートする
    finalFishList.sort((a, b) => a.localeCompare(b, 'ja'));

    // 魚種が1つも残らなかった場合は表示せずに終了
    if (finalFishList.length === 0) return;

    // 魚種表示用のコンテナを生成
    const fishDiv = document.createElement('div');
    fishDiv.id = 'spot-fish-section';
    fishDiv.style.marginTop = '12px';
    fishDiv.style.paddingTop = '10px';
    fishDiv.style.borderTop = '1px dashed rgba(25, 25, 112, 0.2)';

    let html = `<div style="font-weight: bold; font-size: 13px; margin-bottom: 4px;">🐟 主な対象魚</div>`;
    html += `<div style="font-size: 13px; line-height: 1.5;">${finalFishList.join('、')}</div>`;

    fishDiv.innerHTML = html;
    const catchSection = document.getElementById('spot-catch-section');
    if (catchSection && catchSection.parentNode === accessBox) {
        accessBox.insertBefore(fishDiv, catchSection);
    } else {
        accessBox.appendChild(fishDiv);
    }
}

// =======================
// ZOOM GUARD
// =======================
function startZoomGuard() {
    if (!window.map) return;
    window._zoomGuardBase = window.map.getZoom();
    window._zoomGuardActive = true;
}

function isZoomGuardFailed(threshold = 0.3) {
    if (!window._zoomGuardActive || !window.map) return false;
    return (window.map.getZoom() - window._zoomGuardBase) > threshold;
}

function stopZoomGuard() {
    window._zoomGuardActive = false;
    window._zoomGuardBase = null;
}

// タイル切り替えボタンのクリックイベント
document.getElementById('map-tile-btn')?.addEventListener('click', () => {
            if (!window.map || !window.gsiLayer) return;

            // ★ 管理変数から取得
            const osmUrl = window.TILE_URLS.osm;
            const currentUrl = window.gsiLayer._url;

            if (currentUrl === osmUrl) {
                // 1. OSMから、記憶しているスポット本来のタイル（ort か photo）に戻す
                const baseTile = window.currentSpotBaseTile || window.TILE_URLS.photo;
                window.gsiLayer.setUrl(baseTile);
                
                window.map.attributionControl.removeAttribution('© OpenStreetMap contributors');
                window.map.attributionControl.addAttribution('国土地理院');
            } else {
                // 2. 本来のタイルからOSMに切り替える
                window.gsiLayer.setUrl(osmUrl);
                
                window.map.attributionControl.removeAttribution('国土地理院');
                window.map.attributionControl.addAttribution('© OpenStreetMap contributors');
            }

            // =====================================
            // ★ 最強の強制リフレッシュ
            // =====================================
            setTimeout(() => {
                // Leafletの内部メソッドを使ってコンテナを強制再構築
                window.map._resetView(window.map.getCenter(), window.map.getZoom());
            }, 50);
        });

// ==========================================
// ★ スポット詳細画面：釣果ピン投稿モード (doPost専用・3連続上限＋4件目以降クールタイム待機制＋半径3m重複ガード版)
// ==========================================

// 1. 設定エリア（後からいつでも編集可能）
const GAS_TEMP_PIN_URL = 'https://script.google.com/macros/s/AKfycbw2GAO-bqXb_SqveXbEpvytsBqXQEuTEVMUNeKYGWl7asMolQzeLz5-e4UsAWkAO-AoQw/exec';

// 同じ座標の周囲に同一魚種があるか判定する閾値（メートル）
const DUPLICATE_FISH_RADIUS_M = 3.0;

// 連続投稿できる上限数（3件までは連続投稿可、4件目からは過去3件前＝2件目の+5分クールタイム消化を待つ）
const MAX_BURST_POSTS = 3;

// 魚種辞書リスト（index.htmlのFISH_DICTIONARYと重複しない名前）
const POST_FISH_LIST = [
  'アジ', 'サバ', 'イワシ', 'シーバス', 'クロダイ', 'マダイ',
  'ヒラメ', 'マゴチ', 'カサゴ', 'メバル', 'アオリイカ', 'タチウオ',
  'ブリ・イナダ', 'カンパチ', 'サワラ', 'カワハギ', 'シロギス', 'ハゼ',
  'カレイ', 'メジナ', 'ブラックバス', 'ヘラブナ', 'コイ', 'ニジマス'
];

// ★ ダミーデータ兼ローカルキャッシュ（sessionStorageと連動し、リロードしても自分が投稿したデータを保持して比較可能にする）
const TEMP_PINS_STORAGE_KEY = 'fishing_temp_pins_dummy_cache';

function loadTempPinsCache() {
  if (Array.isArray(window.tempFishPins) && window.tempFishPins.length > 0) {
    return window.tempFishPins;
  }
  try {
    const raw = sessionStorage.getItem(TEMP_PINS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        window.tempFishPins = parsed;
        return window.tempFishPins;
      }
    }
  } catch (e) {}
  window.tempFishPins = [];
  return window.tempFishPins;
}

function saveTempPinsCache(pins) {
  window.tempFishPins = Array.isArray(pins) ? pins : [];
  try {
    sessionStorage.setItem(TEMP_PINS_STORAGE_KEY, JSON.stringify(window.tempFishPins));
  } catch (e) {}
}

// 初期ロード時にキャッシュを展開
loadTempPinsCache();

let isPostModeActive = false;
let savedNormalBounds = null;
let lastTempPinPostTime = 0; // 10秒連打ブロック用キャッシュ
let postStatusTimer = null;

// ★ セッション中の「IP+UUID」メモリキャッシュ＆重複生成防止ガード
window._cachedUserIdentity = null;
window._userIdentityPromise = null;
window._prefetchedAltTileSpots = new Set();

// 2. 端末固有UUIDの取得・発行（LocalStorage永続化）
function getBaseUuid() {
  let uuid = localStorage.getItem('fishing_user_uuid');
  if (!uuid) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      uuid = 'u_' + crypto.randomUUID();
    } else {
      uuid = 'u_' + ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      );
    }
    localStorage.setItem('fishing_user_uuid', uuid);
  }
  return uuid;
}

// 2-2. IPアドレス＋UUIDの非同期生成（生成済みなら通信せず即座にスキップ）
function ensureUserIdentityAsync() {
  if (window._cachedUserIdentity) {
    return Promise.resolve(window._cachedUserIdentity);
  }
  if (window._userIdentityPromise) {
    return window._userIdentityPromise;
  }

  window._userIdentityPromise = (async () => {
    const baseUuid = getBaseUuid();
    let ipStr = sessionStorage.getItem('fishing_user_ip');

    if (!ipStr) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1500);
        const res = await fetch('https://api.ipify.org?format=json', {
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && data.ip) {
            ipStr = String(data.ip).trim();
            sessionStorage.setItem('fishing_user_ip', ipStr);
          }
        }
      } catch (e) {
        ipStr = 'noip';
      }
    }

    window._cachedUserIdentity = `${ipStr || 'noip'}_${baseUuid}`;
    return window._cachedUserIdentity;
  })();

  return window._userIdentityPromise;
}

// 同期取得ヘルパー
function getMyUuid() {
  return window._cachedUserIdentity || `noip_${getBaseUuid()}`;
}

// 2-3. 魚種名の比較用正規化ヘルパー（出世魚辞書や「シーバス⇔スズキ」「シロギス⇔キス」の表記ゆれを完全吸収）
const EXTRA_FISH_SYNONYMS = {
  'シーバス': 'スズキ',
  'スズキ': 'スズキ',
  'セイゴ': 'スズキ',
  'フッコ': 'スズキ',
  'シロギス': 'シロギス',
  'キス': 'シロギス',
  'ピンギス': 'シロギス',
  'ブリ': 'ブリ',
  'イナダ': 'ブリ',
  'ワカシ': 'ブリ',
  'ワラサ': 'ブリ',
  'ハマチ': 'ブリ',
  'メジロ': 'ブリ',
  'ツバス': 'ブリ',
  'クロダイ': 'クロダイ',
  'チヌ': 'クロダイ',
  'カイズ': 'クロダイ',
  'メジナ': 'メジナ',
  'グレ': 'メジナ',
  'サワラ': 'サワラ',
  'サゴシ': 'サワラ'
};

function normalizeFishForCheck(name) {
  if (!name) return '';
  const raw = String(name).trim();
  if (EXTRA_FISH_SYNONYMS[raw]) {
    return EXTRA_FISH_SYNONYMS[raw];
  }
  if (typeof FISH_DICTIONARY === 'object' && FISH_DICTIONARY !== null && FISH_DICTIONARY[raw]) {
    const dictMapped = FISH_DICTIONARY[raw];
    return EXTRA_FISH_SYNONYMS[dictMapped] || dictMapped;
  }
  return raw;
}

// 2-4. 周囲3m以内に同じ魚種が既に存在するかチェックするガード関数
function hasSameFishNearby(centerLatLng, fishName, radiusMeters = DUPLICATE_FISH_RADIUS_M) {
  if (!centerLatLng || !fishName || typeof L === 'undefined') return false;

  const cLat = Number(centerLatLng.lat.toFixed(6));
  const cLng = Number(centerLatLng.lng.toFixed(6));
  const targetPoint = L.latLng(cLat, cLng);

  const targetNorm = normalizeFishForCheck(fishName);
  const targetVariants = new Set([
    fishName,
    targetNorm,
    ...fishName.split('・').map(s => normalizeFishForCheck(s))
  ]);

  const isSameFish = (otherName) => {
    if (!otherName) return false;
    const rawOther = String(otherName).trim();
    const otherNorm = normalizeFishForCheck(rawOther);
    if (targetVariants.has(rawOther) || targetVariants.has(otherNorm)) return true;
    const parts = rawOther.split('・');
    return parts.some(p => targetVariants.has(p) || targetVariants.has(normalizeFishForCheck(p)));
  };

  // ① ダミーデータ兼仮ピン配列（window.tempFishPins）を最優先でチェック
  const tempPins = loadTempPinsCache();
  for (let i = 0; i < tempPins.length; i++) {
    const pin = tempPins[i];
    if (!pin) continue;
    if (Array.isArray(pin.bad) && pin.bad.length >= 10) continue;

    const lat = Number(pin.lat);
    const lng = Number(pin.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && isSameFish(pin.fish)) {
      const dist = targetPoint.distanceTo(L.latLng(lat, lng));
      if (dist <= radiusMeters) {
        return true;
      }
    }
  }

  // ② 現在マップ上に表示されている既存魚種マーカー（window.fishLayer）をチェック
  if (window.fishLayer && typeof window.fishLayer.eachLayer === 'function') {
    let foundInLayer = false;
    window.fishLayer.eachLayer(layer => {
      if (foundInLayer || typeof layer.getLatLng !== 'function') return;
      const ll = layer.getLatLng();
      if (!ll || targetPoint.distanceTo(ll) > radiusMeters) return;

      const html = layer.options?.icon?.options?.html || '';
      const textName = html.replace(/<[^>]*>/g, '').trim();
      if (isSameFish(textName)) {
        foundInLayer = true;
      }
    });
    if (foundInLayer) return true;
  }

  // ③ 本採用ピン配列（window.approvedUserPins）もチェック
  if (Array.isArray(window.approvedUserPins)) {
    for (let i = 0; i < window.approvedUserPins.length; i++) {
      const pin = window.approvedUserPins[i];
      if (!pin) continue;
      const lat = Number(pin.lat);
      const lng = Number(pin.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && isSameFish(pin.fish)) {
        if (targetPoint.distanceTo(L.latLng(lat, lng)) <= radiusMeters) {
          return true;
        }
      }
    }
  }

  // ④ 現在選択中のスポットデータ（spot.URL）に紐づく魚種座標もチェック
  if (window.currentSpotId && Array.isArray(window.spotData)) {
    const parts = String(window.currentSpotId).split('_');
    const spotKey = parts[parts.length - 1];
    const activeSpot = window.spotData.find(s => String(s.individualId) === String(spotKey));
    if (activeSpot && typeof activeSpot.URL === 'string' && activeSpot.URL.trim() !== '') {
      const items = activeSpot.URL.split(',');
      for (let i = 0; i < items.length; i++) {
        const [fName, latStr, lngStr] = items[i].split('|');
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (!isNaN(lat) && !isNaN(lng) && isSameFish(fName)) {
          if (targetPoint.distanceTo(L.latLng(lat, lng)) <= radiusMeters) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

// 2-5. IP+UUID / IP一致による「3連続投稿上限チェック」＆「投稿時間（time）のペナルティ加算計算」
function evaluatePostCooldownAndTime(myIdentity, nowMs) {
  const pins = loadTempPinsCache();

  const splitIdx = myIdentity.indexOf('_u_');
  const myIp = splitIdx !== -1 ? myIdentity.slice(0, splitIdx) : 'noip';
  const myUuidPart = splitIdx !== -1 ? myIdentity.slice(splitIdx + 1) : myIdentity;

  const userMatchedPins = [];
  let exactMatchCount = 0;
  let ipOnlyMatchCount = 0;

  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    const pUuid = String(pin?.uuid || '');
    if (!pUuid) continue;

    const pSplitIdx = pUuid.indexOf('_u_');
    const pIp = pSplitIdx !== -1 ? pUuid.slice(0, pSplitIdx) : 'noip';
    const pUuidPart = pSplitIdx !== -1 ? pUuid.slice(pSplitIdx + 1) : pUuid;

    const isExactMatch = (pUuid === myIdentity) || (pUuidPart === myUuidPart);
    const isIpMatch = (myIp !== 'noip' && pIp !== 'noip' && pIp === myIp);

    if (isExactMatch) {
      exactMatchCount++;
      userMatchedPins.push(pin);
    } else if (isIpMatch) {
      ipOnlyMatchCount++;
      userMatchedPins.push(pin);
    }
  }

  // 投稿時刻(time)の昇順でソート
  userMatchedPins.sort((a, b) => Number(a.time || 0) - Number(b.time || 0));

  // ★ 3件までは連続で投稿でき、4件目からは「2件目（直近から2つ前＝後ろから2番目）の +5分クールタイム」が経過するまで投稿不可にする
  // 例: 1件目(t+0)、2件目(t+5分)、3件目(t+10分) → 4件目を打つには2件目の time (t+5分) を過ぎている必要がある
  //     4件目(t+15分)を打った後、5件目を打つには3件目の time (t+10分) を過ぎている必要がある
  if (userMatchedPins.length >= MAX_BURST_POSTS) {
    const gatePinIndex = userMatchedPins.length - (MAX_BURST_POSTS - 1); // 4件目なら index=1 (2件目のピン)
    const gatePin = userMatchedPins[gatePinIndex];
    const unlockTimeMs = Number(gatePin?.time || 0);

    if (nowMs < unlockTimeMs) {
      const waitSec = Math.ceil((unlockTimeMs - nowMs) / 1000);
      return {
        blocked: true,
        waitSeconds: waitSec,
        unlockTimeMs: unlockTimeMs
      };
    }
  }

  // クールタイムを通過した場合、今回の投稿時間（time）を計算
  let delayMinutes = 0;
  if (exactMatchCount > 0) {
    // IP+UUID全一致が既にあれば、1件あるごとに +5分 × 件数
    delayMinutes += exactMatchCount * 5;
  }
  if (ipOnlyMatchCount > 0) {
    // IPだけ一致があれば +5分
    delayMinutes += 5;
  }

  return {
    blocked: false,
    waitSeconds: 0,
    adjustedTime: nowMs + (delayMinutes * 60 * 1000),
    delayMinutes: delayMinutes,
    exactMatchCount: exactMatchCount,
    ipOnlyMatchCount: ipOnlyMatchCount
  };
}

// 2-6. タイル切り替えボタン用の代替タイル（OSM等）をバックグラウンドでプリフェッチ
function prefetchAlternateSpotTiles(spot, targetZoom) {
  if (!spot || !window.TILE_URLS) return Promise.resolve();

  const spotKey = `${spot.individualId || spot.name}_${targetZoom}`;
  if (window._prefetchedAltTileSpots.has(spotKey)) {
    return Promise.resolve();
  }
  window._prefetchedAltTileSpots.add(spotKey);

  const lat = Number(spot.lat);
  const lng = Number(spot.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve();

  const fetchZoom = Math.floor(targetZoom || 14);
  const n = Math.pow(2, fetchZoom);
  const tileX = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const tileY = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );

  const altTemplate = window.TILE_URLS.osm || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const subdomains = ['a', 'b', 'c'];
  const promises = [];

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      const sub = subdomains[Math.abs(tx + ty) % subdomains.length];
      const url = altTemplate
        .replace('{s}', sub)
        .replace('{z}', fetchZoom)
        .replace('{x}', tx)
        .replace('{y}', ty);

      promises.push(
        new Promise(resolve => {
          const img = new Image();
          const timer = setTimeout(resolve, 1200);
          img.onload = img.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
          img.src = url;
        })
      );
    }
  }

  return Promise.all(promises);
}

// 2-7. スポット画面用の「IP+UUID生成」「切り替え用タイル先読み」「本採用・仮ピンデータ取得」を一括実行する準備関数
window.prepareSpotActionButtons = function(spot, targetZoom) {
  return Promise.all([
    ensureUserIdentityAsync(),
    prefetchAlternateSpotTiles(spot, targetZoom),
    window.loadTempFishPinsOnce ? window.loadTempFishPinsOnce() : Promise.resolve(),
    window.loadApprovedUserPinsOnce ? window.loadApprovedUserPinsOnce() : Promise.resolve()
  ]);
};

// 3. パネル内のステータスメッセージ表示（alert廃止）
function showPostStatus(message, autoHideMs = 2500) {
  const msgEl = document.getElementById('post-status-msg');
  if (!msgEl) return;

  if (postStatusTimer) {
    clearTimeout(postStatusTimer);
    postStatusTimer = null;
  }

  if (!message) {
    msgEl.textContent = '';
    msgEl.classList.remove('is-visible');
    return;
  }

  msgEl.textContent = message;
  msgEl.classList.add('is-visible');

  if (autoHideMs > 0) {
    postStatusTimer = setTimeout(() => {
      msgEl.classList.remove('is-visible');
    }, autoHideMs);
  }
}

// 4. 投稿モード用のDOM（中心照準 ＆ 投稿ボタン左横パネル）を生成
function ensurePostModeDom() {
  const mapEl = document.getElementById('lf-map');
  const postBtnRow = document.getElementById('post-btn-row');
  if (!mapEl || document.getElementById('post-center-crosshair')) return;

  // ① 画面中心の「＋」照準（白線＋濃紺シャドウ）
  const crosshair = document.createElement('div');
  crosshair.id = 'post-center-crosshair';
  crosshair.className = 'post-center-crosshair';
  mapEl.appendChild(crosshair);

  // ② 投稿ボタンのすぐ左に展開するコンパクトパネル
  if (postBtnRow && !document.getElementById('post-mode-panel')) {
    const panel = document.createElement('div');
    panel.id = 'post-mode-panel';
    panel.className = 'post-mode-panel';

    const optionsHtml = POST_FISH_LIST.map(f => `<option value="${f}">${f}</option>`).join('');

    panel.innerHTML = `
      <select id="post-fish-select" class="post-fish-select">
        ${optionsHtml}
      </select>
      <button id="post-submit-btn" class="post-submit-btn">投稿</button>
      <span id="post-status-msg" class="post-status-msg"></span>
    `;

    if (typeof L !== 'undefined' && L.DomEvent) {
      L.DomEvent.disableClickPropagation(panel);
      L.DomEvent.disableScrollPropagation(panel);
    }

    postBtnRow.insertBefore(panel, postBtnRow.firstChild);

    document.getElementById('post-submit-btn').addEventListener('click', submitCenterTempPin);
  }
}

// 5. 投稿モードのON / OFF切り替え
function togglePostMode(forceState) {
  if (!window.map) return;
  ensurePostModeDom();

  const nextState = (typeof forceState === 'boolean') ? forceState : !isPostModeActive;
  isPostModeActive = nextState;

  const crosshair = document.getElementById('post-center-crosshair');
  const panel     = document.getElementById('post-mode-panel');
  const postBtn   = document.getElementById('map-post-btn');

  if (isPostModeActive) {
    if (window.map.options.maxBounds && !savedNormalBounds) {
      savedNormalBounds = window.map.options.maxBounds;
      window.map.setMaxBounds(savedNormalBounds.pad(0.5));
    }
    showPostStatus('');
    if (crosshair) crosshair.classList.add('is-open');
    if (panel) panel.classList.add('is-open');
    if (postBtn) postBtn.classList.add('active');
  } else {
    if (savedNormalBounds) {
      window.map.setMaxBounds(savedNormalBounds);
      savedNormalBounds = null;
    }
    showPostStatus('');
    if (crosshair) crosshair.classList.remove('is-open');
    if (panel) panel.classList.remove('is-open');
    if (postBtn) postBtn.classList.remove('active');
  }
}

// 6. 中心座標（＋マークの位置）をGASへPOST送信（3連続上限＋4件目クールタイム待機 ＆ 半径3m重複ガード）
async function submitCenterTempPin() {
  if (!window.map) return;

  const selectEl = document.getElementById('post-fish-select');
  const submitBtn = document.getElementById('post-submit-btn');
  const fishName = selectEl ? selectEl.value : POST_FISH_LIST[0];
  const center = window.map.getCenter();

  // ★ ガード①：半径3m以内に同じ魚種が既に存在する場合は送信前にブロック
  if (hasSameFishNearby(center, fishName, DUPLICATE_FISH_RADIUS_M)) {
    showPostStatus('付近に同魚種あり', 2500);
    return;
  }

  // ★ ガード②：物理的な誤連打ガード（10秒）
  const now = Date.now();
  if (now - lastTempPinPostTime < 10000) {
    const remain = Math.ceil((10000 - (now - lastTempPinPostTime)) / 1000);
    showPostStatus(`あと${remain}秒`, 2000);
    return;
  }

  const myUuid = window._cachedUserIdentity || (await ensureUserIdentityAsync());

  // ★ ガード③：3件までは連続投稿可、4件目からは「2件目の+5分クールタイム」が経過するまで投稿自体をブロック
  const evalResult = evaluatePostCooldownAndTime(myUuid, now);
  if (evalResult.blocked) {
    const min = Math.floor(evalResult.waitSeconds / 60);
    const sec = evalResult.waitSeconds % 60;
    const waitLabel = min > 0 ? `あと${min}分${sec}秒` : `あと${sec}秒`;
    showPostStatus(`連投制限(${waitLabel})`, 3000);
    return;
  }

  const { adjustedTime, delayMinutes } = evalResult;

  const newPin = {
    id: 'p_' + now + '_' + Math.random().toString(36).substring(2, 6),
    fish: fishName,
    lat: Number(center.lat.toFixed(6)),
    lng: Number(center.lng.toFixed(6)),
    uuid: myUuid,
    time: adjustedTime,
    good: [],
    bad: []
  };

  // 送信開始の瞬間にダミーデータ（window.tempFishPins ＆ sessionStorage）へ即座に格納し、画面にも即座に描画
  const currentPins = loadTempPinsCache();
  currentPins.push(newPin);
  saveTempPinsCache(currentPins);
  if (typeof window.fadeInUserAndTempPins === 'function') {
    window.fadeInUserAndTempPins();
  }

  lastTempPinPostTime = now;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中';
  }
  showPostStatus('');

  try {
    const res = await fetch(GAS_TEMP_PIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'add', ...newPin })
    });
    const result = await res.json();

    if (result.status === 'success') {
      if (submitBtn) submitBtn.textContent = '完了';
      const msg = delayMinutes > 0 ? `投稿完了(+${delayMinutes}分)` : '投稿完了';
      showPostStatus(msg, 1200);
      setTimeout(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '投稿';
        }
        togglePostMode(false);
      }, 900);
    } else {
      const rolledBack = loadTempPinsCache().filter(p => p.id !== newPin.id);
      saveTempPinsCache(rolledBack);
      if (typeof window.renderUserAndTempPins === 'function') {
        window.renderUserAndTempPins();
      }

      showPostStatus(result.message || '送信失敗', 3000);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '投稿';
      }
    }
  } catch (err) {
    console.error('GAS送信失敗:', err);
    showPostStatus('通信エラー', 3000);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '投稿';
    }
  }
}

// 専用アイコンのクリックイベント登録
document.addEventListener('DOMContentLoaded', () => {
  const postBtn = document.getElementById('map-post-btn');
  if (postBtn) {
    postBtn.addEventListener('click', () => togglePostMode());
  }
});


// ★ GASのdoGetで仮ピン一覧を初回1回のみロードする独立関数（取得済み・通信中はスキップ）
window._isTempPinsLoaded = false;
window._tempPinsLoadingPromise = null;

window.loadTempFishPinsOnce = function() {
  // 1. すでにGASから取得済みなら通信をスキップして即座に現在のキャッシュを返す
  if (window._isTempPinsLoaded) {
    return Promise.resolve(loadTempPinsCache());
  }

  // 2. 現在通信中であれば二重リクエストを防ぎ、進行中のPromiseを返す
  if (window._tempPinsLoadingPromise) {
    return window._tempPinsLoadingPromise;
  }

  window._tempPinsLoadingPromise = fetch(GAS_TEMP_PIN_URL, {
    method: 'GET',
    priority: 'low'
  })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      // お掃除タイマー実行中（status: 'cleaning'）はフラグを立てずローカルキャッシュを維持
      if (!data || data.status !== 'ok' || !Array.isArray(data.pins)) {
        return loadTempPinsCache();
      }

      // GAS側の最新配列を正（マスター）としてローカルキャッシュを上書き（リセット・お掃除済みピンの復活を防止）
      const mergedPins = data.pins;
      saveTempPinsCache(mergedPins);

      // 取得済みフラグをON（これ以降この関数が呼ばれてもGAS通信は発生しない）
      window._isTempPinsLoaded = true;
      return mergedPins;
    })
    .catch(err => {
      console.warn('仮ピンデータの読み込みスキップ:', err);
      return loadTempPinsCache();
    })
    .finally(() => {
      window._tempPinsLoadingPromise = null;
    });

  return window._tempPinsLoadingPromise;
};



// ==========================================
// ★ 本採用ピン (KANTO/user_pins.json) ＆ 仮ピン (doGet) の表示・フェードイン・投票制御
// （本採用レイヤーと仮ピンレイヤー完全分離 ＆ 潮汐ラッパー透過対応版）
// ==========================================

window.approvedUserPins = [];
window._isApprovedPinsLoaded = false;
window._approvedPinsLoadingPromise = null;
window.userApprovedPinLayer = null;
window.tempFishPinLayer = null;
window._isTempPinLayerVisible = false;
window._activeTempPinPopup = null;

// 本採用ピン用Pane (approvedPinPane) と 仮ピン専用Pane (tempPinPane) を別々に生成
function ensureUserPinPanes() {
  if (!window.map) return { approvedPane: null, tempPane: null };

  // スポット画面で .tide-wrapper (z-index:8000) が地図全体のクリックを塞ぐのを防止
  const tideWrapper = document.querySelector('.tide-wrapper');
  if (tideWrapper) {
    tideWrapper.style.pointerEvents = 'none';
  }

  // ① 本採用ピン専用Pane（クリック判定なし・z-index: 620）
  let approvedPane = window.map.getPane('approvedPinPane');
  if (!approvedPane) {
    approvedPane = window.map.createPane('approvedPinPane');
    approvedPane.style.zIndex = 620;
    approvedPane.style.opacity = '0';
    approvedPane.style.pointerEvents = 'none';
    approvedPane.style.transition = 'opacity 0.4s ease';
  }

  // ② 仮ピン専用Pane（本採用や既存魚種より上の独立レイヤー・z-index: 665）
  let tempPane = window.map.getPane('tempPinPane');
  if (!tempPane) {
    tempPane = window.map.createPane('tempPinPane');
    tempPane.style.zIndex = 665;
    tempPane.style.opacity = '0';
    tempPane.style.pointerEvents = 'none';
    tempPane.style.transition = 'opacity 0.4s ease';
  }

  return { approvedPane, tempPane };
}

// ズーム遷移開始時や戻るボタン押下時に透明化・ポップアップ消去する関数
window.hideUserAndTempPins = function() {
  window._isTempPinLayerVisible = false;
  if (!window.map) return;

  const approvedPane = window.map.getPane('approvedPinPane');
  if (approvedPane) {
    approvedPane.style.opacity = '0';
    approvedPane.style.pointerEvents = 'none';
  }

  const tempPane = window.map.getPane('tempPinPane');
  if (tempPane) {
    tempPane.style.opacity = '0';
    tempPane.style.pointerEvents = 'none';
  }

  if (window._activeTempPinPopup) {
    window.map.closePopup(window._activeTempPinPopup);
    window._activeTempPinPopup = null;
  }
};

// レイヤー完全消去（スポット詳細離脱時）
window.clearUserAndTempPins = function() {
  window.hideUserAndTempPins();
  if (window.userApprovedPinLayer) window.userApprovedPinLayer.clearLayers();
  if (window.tempFishPinLayer) window.tempFishPinLayer.clearLayers();
};

// 本採用ピンデータの初回ロード
window.loadApprovedUserPinsOnce = function(regionCode) {
  if (window._isApprovedPinsLoaded) {
    return Promise.resolve(window.approvedUserPins);
  }
  if (window._approvedPinsLoadingPromise) {
    return window._approvedPinsLoadingPromise;
  }

  const targetRegion = regionCode || window.currentRegion || 'KANTO';
  const url = `/${targetRegion}/user_pins.json`;

  window._approvedPinsLoadingPromise = fetch(url, { priority: 'low' })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      window.approvedUserPins = Array.isArray(data) ? data : [];
      window._isApprovedPinsLoaded = true;
      return window.approvedUserPins;
    })
    .catch(err => {
      console.warn('本採用ピンデータの読み込みスキップ:', err);
      window.approvedUserPins = [];
      return [];
    })
    .finally(() => {
      window._approvedPinsLoadingPromise = null;
    });

  return window._approvedPinsLoadingPromise;
};

// 本人・投票者UUID照合ヘルパー (IP部分・UUID部分の一致も判定)
function isMatchingIdentity(storedIdentity, currentIdentity) {
  if (!storedIdentity || !currentIdentity) return false;
  if (storedIdentity === currentIdentity) return true;

  const curSplit = currentIdentity.indexOf('_u_');
  const curIp = curSplit !== -1 ? currentIdentity.slice(0, curSplit) : 'noip';
  const curUuid = curSplit !== -1 ? currentIdentity.slice(curSplit + 1) : currentIdentity;

  const stSplit = String(storedIdentity).indexOf('_u_');
  const stIp = stSplit !== -1 ? storedIdentity.slice(0, stSplit) : 'noip';
  const stUuid = stSplit !== -1 ? storedIdentity.slice(stSplit + 1) : storedIdentity;

  if (curUuid && stUuid && curUuid === stUuid) return true;
  if (curIp !== 'noip' && stIp !== 'noip' && curIp === stIp) return true;
  return false;
}

// 投稿ボタンのフェードインと同じタイミングで呼び出す表示＆フェードイン関数
window.fadeInUserAndTempPins = function(centerLatLng, radiusMeters = 1500) {
  if (!window.map) return;
  const { approvedPane, tempPane } = ensureUserPinPanes();
  window._isTempPinLayerVisible = true;
  window.renderUserAndTempPins(centerLatLng, radiusMeters);

  requestAnimationFrame(() => {
    if (approvedPane) approvedPane.style.opacity = '1';
    if (tempPane) tempPane.style.opacity = '1';
  });
};

// 単独呼び出し用（データ未取得なら取得してからフェードイン表示）
window.showUserAndTempPins = async function(centerLatLng, radiusMeters = 1500) {
  if (!window.map) return;

  await Promise.all([
    window.loadApprovedUserPinsOnce(),
    window.loadTempFishPinsOnce(),
    ensureUserIdentityAsync()
  ]);

  window.fadeInUserAndTempPins(centerLatLng, radiusMeters);
};

// 描画実行関数（本採用レイヤーと仮ピンレイヤーを別々に構築）
window.renderUserAndTempPins = function(centerLatLng, radiusMeters = 1500) {
  if (!window.map) return;

  ensureUserPinPanes();

  // ① 本採用ピン用レイヤーグループ
  if (!window.userApprovedPinLayer) {
    window.userApprovedPinLayer = L.layerGroup().addTo(window.map);
  } else {
    window.userApprovedPinLayer.clearLayers();
    if (!window.map.hasLayer(window.userApprovedPinLayer)) {
      window.userApprovedPinLayer.addTo(window.map);
    }
  }

  // ② 仮ピン専用レイヤーグループ
  if (!window.tempFishPinLayer) {
    window.tempFishPinLayer = L.layerGroup().addTo(window.map);
  } else {
    window.tempFishPinLayer.clearLayers();
    if (!window.map.hasLayer(window.tempFishPinLayer)) {
      window.tempFishPinLayer.addTo(window.map);
    }
  }

  const basePoint = centerLatLng && centerLatLng.lat != null && centerLatLng.lng != null
    ? L.latLng(centerLatLng.lat, centerLatLng.lng)
    : window.map.getCenter();

  const approvedIds = new Set();

  // ==========================================
  // 1. 本採用ピンの描画 (approvedPinPane / 非インタラクティブ)
  // ==========================================
  const approvedList = Array.isArray(window.approvedUserPins) ? window.approvedUserPins : [];
  approvedList.forEach(pin => {
    if (!pin) return;
    const lat = Number(pin.lat);
    const lng = Number(pin.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (pin.id) approvedIds.add(pin.id);
    if (basePoint && basePoint.distanceTo(L.latLng(lat, lng)) > radiusMeters) return;

    const safeFish = String(pin.fish || '').replace(/[<>&"']/g, '');
    if (!safeFish) return;

    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'fish-label',
        html: `<span class="fish-text approved-fish">${safeFish}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      }),
      pane: 'approvedPinPane',
      interactive: false,
      keyboard: false
    });

    marker.addTo(window.userApprovedPinLayer);
  });

  // ==========================================
  // 2. 仮ピンの描画 (tempPinPane / 独立レイヤー＆確実ポップアップ)
  // ==========================================
  const tempList = loadTempPinsCache();
  const myIdentity = getMyUuid();
  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;

  tempList.forEach(pin => {
    if (!pin) return;
    if (pin.id && approvedIds.has(pin.id)) return;

    const lat = Number(pin.lat);
    const lng = Number(pin.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (basePoint && basePoint.distanceTo(L.latLng(lat, lng)) > radiusMeters) return;

    const goodList = Array.isArray(pin.good) ? pin.good : [];
    const badList  = Array.isArray(pin.bad)  ? pin.bad  : [];

    if (badList.length >= 10) return;

    // 自分の投稿または1時間経過後のみ表示
    const isMine = isMatchingIdentity(pin.uuid, myIdentity);
    const isOneHourPassed = (now - Number(pin.time || 0)) >= ONE_HOUR_MS;
    if (!isMine && !isOneHourPassed) return;

    const safeFish = String(pin.fish || '').replace(/[<>&"']/g, '');
    if (!safeFish) return;

    const tempMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'temp-pin-wrapper fish-label',
        html: `<span class="fish-text temp-fish">${safeFish}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      }),
      pane: 'tempPinPane',
      interactive: true,
      bubblingMouseEvents: false,
      keyboard: false
    });

    tempMarker.on('add', () => {
      const el = tempMarker.getElement();
      const hitEl = el ? el.querySelector('.temp-fish') : null;
      if (!hitEl) return;

      L.DomEvent.disableClickPropagation(hitEl);
      L.DomEvent.disableScrollPropagation(hitEl);

      L.DomEvent.on(hitEl, 'click', (ev) => {
        L.DomEvent.stop(ev);
        if (!window.map || !window._isTempPinLayerVisible) return;

        window._activeTempPinPopup = L.popup({
          className: 'temp-vote-leaflet-popup',
          offset: [0, -4],
          closeButton: false,
          autoPanPadding: [16, 16]
        })
          .setLatLng([lat, lng])
          .setContent(createTempPinVotePopup(pin))
          .openOn(window.map);
      });
    });

    tempMarker.addTo(window.tempFishPinLayer);
  });
};

// ポップアップ生成: テキスト情報一切なし、👍(カウント数) 👎(カウント数) の横並びのみ（自身のIP+UUIDと同じであれば「いいね」押下不可）
function createTempPinVotePopup(pin) {
  const myIdentity = getMyUuid();
  const goodList = Array.isArray(pin.good) ? pin.good : [];
  const badList  = Array.isArray(pin.bad)  ? pin.bad  : [];

  // 自身のIP+UUIDと同一かチェック
  const isMine = isMatchingIdentity(pin.uuid, myIdentity);
  const alreadyGood = goodList.some(u => isMatchingIdentity(u, myIdentity));
  const alreadyBad  = badList.some(u => isMatchingIdentity(u, myIdentity));
  const isSettled   = (goodList.length >= 10 || badList.length >= 10);

  // いいねボタン: 自身の投稿である場合(isMine)、すでに評価済みの場合、決着済みなら押せない
  const canGood = !isMine && !alreadyGood && !alreadyBad && !isSettled;
  // バッドボタン: すでに評価済みまたは決着済みなら押せない
  const canBad  = !alreadyGood && !alreadyBad && !isSettled;

  const wrap = document.createElement('div');
  wrap.className = 'temp-pin-popup';
  wrap.innerHTML = `
    <button type="button" class="temp-vote-btn btn-vote-good" ${canGood ? '' : 'disabled'}>👍(${goodList.length})</button>
    <button type="button" class="temp-vote-btn btn-vote-bad" ${canBad ? '' : 'disabled'}>👎(${badList.length})</button>
  `;

  L.DomEvent.disableClickPropagation(wrap);

  const goodBtn = wrap.querySelector('.btn-vote-good');
  const badBtn  = wrap.querySelector('.btn-vote-bad');

  if (canGood && goodBtn) {
    goodBtn.addEventListener('click', (e) => {
      L.DomEvent.stop(e);
      submitTempPinVote(pin.id, 'good');
    });
  }
  if (canBad && badBtn) {
    badBtn.addEventListener('click', (e) => {
      L.DomEvent.stop(e);
      submitTempPinVote(pin.id, 'bad');
    });
  }

  return wrap;
}

// いいね / バッド投票送信
async function submitTempPinVote(pinId, voteType) {
  const pins = loadTempPinsCache();
  const targetPin = pins.find(p => p && p.id === pinId);
  if (!targetPin) return;

  const myIdentity = window._cachedUserIdentity || (await ensureUserIdentityAsync());

  if (!Array.isArray(targetPin.good)) targetPin.good = [];
  if (!Array.isArray(targetPin.bad)) targetPin.bad = [];

  if (
    targetPin.good.some(u => isMatchingIdentity(u, myIdentity)) ||
    targetPin.bad.some(u => isMatchingIdentity(u, myIdentity))
  ) {
    return;
  }

  if (voteType === 'good') {
    if (isMatchingIdentity(targetPin.uuid, myIdentity)) return; // 自身のピンにはいいね不可
    targetPin.good.push(myIdentity);
  } else if (voteType === 'bad') {
    targetPin.bad.push(myIdentity);
  }
  saveTempPinsCache(pins);

  if (window.map && window._activeTempPinPopup) {
    window.map.closePopup(window._activeTempPinPopup);
    window._activeTempPinPopup = null;
  }
  window.renderUserAndTempPins();

  try {
    await fetch(GAS_TEMP_PIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'vote',
        id: pinId,
        voteType: voteType,
        uuid: myIdentity
      })
    });
  } catch (err) {
    console.error('投票送信エラー:', err);
  }
}

// グローバル公開（他ファイル・フォールバックからの参照互換）
window.showFishPopup = showFishPopup;
window.showFishMarkers = showFishMarkers;
window.createWeekItem = createWeekItem;
window.resetWeatherUI = resetWeatherUI;
window.removeWeekItem = removeWeekItem;
window.createHourlyWeather = createHourlyWeather;
window.createTideGraph = createTideGraph;
window.calcAccessInfo = calcAccessInfo;
window.renderShopSection = renderShopSection;
window.renderRecentCatches = renderRecentCatches;
window.clearAccessInfo = clearAccessInfo;
window.resetSpotLayers = resetSpotLayers;
window.clearSpotUI = clearSpotUI;
window.buildSpotRestoreObject = buildSpotRestoreObject;
window.waitAndRenderSpotDetails = waitAndRenderSpotDetails;
window.loadICData = loadICData;
window.renderFishSection = renderFishSection;
window.startZoomGuard = startZoomGuard;
window.isZoomGuardFailed = isZoomGuardFailed;
window.stopZoomGuard = stopZoomGuard;
window.togglePostMode = togglePostMode;
