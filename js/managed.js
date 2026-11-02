// ==========================================
// REGION 初期表示：CSV取得・解析
// ==========================================
async function loadRegionCSV() {
    const regionCode = window.currentRegion || 'KANTO';

    if (
        window.regionPrefData &&
        window.regionPrefData.length > 0 &&
        window.regionPrefData[0].regionCode === regionCode
    ) {
        return true;
    }

    try {
        const text = await fetchRegionCsvText();
        const lines = text.trim().split('\n');
        if (lines.length < 2) return false;

        const headers = lines[0].split(',').map(h => h.trim());
        const typeIdx  = headers.findIndex(h => h.toLowerCase() === 'type');
        const latIdx   = headers.findIndex(h => h.toLowerCase() === 'lat');
        const lngIdx   = headers.findIndex(h => h.toLowerCase() === 'lng');
        const zoomIdx  = headers.findIndex(h => h.toLowerCase() === 'zoom');
        const nameIdx  = headers.findIndex(h => h.toLowerCase() === 'name');
        const urlIdx   = headers.findIndex(h => h.toLowerCase() === 'url');
        const notesIdx = headers.findIndex(h => h.toLowerCase() === 'notes');

        if (typeIdx === -1) return false;

        window.regionData = null;
        window.regionPrefData = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i]) continue;
            const cols = lines[i].split(',').map(c => c.trim());
            const type = cols[typeIdx];

            if (type === 'region' && latIdx !== -1 && lngIdx !== -1 && zoomIdx !== -1) {
                const name = nameIdx !== -1 ? cols[nameIdx] : '地域エリア';
                const lat = parseFloat(cols[latIdx]);
                const lng = parseFloat(cols[lngIdx]);
                const zoom = parseFloat(cols[zoomIdx]);
                window.regionData = { name, lat, lng, zoom };
            }

            if (type === 'pref' && urlIdx !== -1 && notesIdx !== -1) {
                const urlVal = cols[urlIdx];
                const prefName = cols[notesIdx];
                if (!urlVal) continue;

                const parts = urlVal.split('/');
                let prefCode = '';
                let lat, lng;

                if (parts.length >= 4) {
                    prefCode = parts[1].split('_')[0];
                    lat = parseFloat(parts[2]);
                    lng = parseFloat(parts[3]);
                } else if (parts.length === 3) {
                    prefCode = parts[0].split('_')[0];
                    lat = parseFloat(parts[1]);
                    lng = parseFloat(parts[2]);
                } else {
                    continue;
                }

                if (isNaN(lat) || isNaN(lng)) continue;

                window.regionPrefData.push({
                    regionCode: regionCode,
                    prefCode: prefCode,
                    prefName: prefName,
                    lat: lat,
                    lng: lng
                });
            }
        }

        return !!window.regionData;
    } catch (err) {
        console.error("Region CSVの読み込みエラー:", err);
        return false;
    }
}


// ==========================================
// REGION 初期表示：SEO・マーカー・レイヤー等
// ==========================================
function renderRegion() {
    if (typeof showdebug === 'function') {
        showdebug('[REGION] renderRegion開始');
        showdebug('[REGION] runAfterTileLoad=' + (typeof window.runAfterTileLoad) + ' / firstTileLoaded=' + window._firstTileLoaded);
        showdebug('[REGION] showAllRegionSpots=' + (typeof showAllRegionSpots) + ' / sonar=' + (typeof window.showSnsSonarLayer) + ' / rain=' + (typeof renderCrowdImage));
    }
    const regionName = window.regionData ? window.regionData.name : '関東地方';
    let regionHtml = '<ul style="list-style-type:none; padding-left:5px; margin:0;">';

    (window.regionPrefData || []).forEach(pref => {
        const linkUrl = `/?region=${encodeURIComponent(regionName)}&pref=${encodeURIComponent(pref.prefName)}`;
        regionHtml += `<li style="margin:8px 0; font-size:14px;"><a href="${linkUrl}" style="color:#191970; text-decoration:none; position:relative; padding-left:12px; transition:opacity 0.2s ease;"><span style="position:absolute; left:0; top:50%; transform:translateY(-50%); font-size:8px; opacity:0.6;">▶</span>${pref.prefName}の釣り場一覧を見る</a></li>`;
    });

    regionHtml += '</ul>';
    const regionTitle = regionName + 'の釣りエリア一覧';
    window.regionSeoHtml = regionHtml;
    window.regionSeoTitle = regionTitle;

    const titleSpan = document.getElementById('seo-list-title');
    const linkContainer = document.getElementById('seo-link-container');
    if (titleSpan) titleSpan.textContent = regionTitle;
    if (linkContainer) linkContainer.innerHTML = regionHtml;

    if (typeof window.runAfterTileLoad === 'function') {
        if (typeof showdebug === 'function') showdebug('[REGION] タイル読み込みキューへ登録');
        window.runAfterTileLoad(async () => {
            if (typeof showdebug === 'function') showdebug('[REGION] キュー実行開始');
            try {
                if (typeof showAllRegionSpots === 'function') {
                    await showAllRegionSpots();
                    if (typeof showdebug === 'function') showdebug('[REGION] showAllRegionSpots完了');
                } else if (typeof showdebug === 'function') {
                    showdebug('[REGION] showAllRegionSpotsが未定義');
                }
                if (typeof window.showSnsSonarLayer === 'function') {
                    if (typeof showdebug === 'function') showdebug('[REGION] ソナー開始');
                    await window.showSnsSonarLayer();
                    if (typeof showdebug === 'function') showdebug('[REGION] ソナー完了');
                } else if (typeof showdebug === 'function') {
                    showdebug('[REGION] showSnsSonarLayerが未定義');
                }
            } catch (e) {
                if (typeof showdebug === 'function') showdebug('[REGION] スポット/ソナー例外: ' + (e && e.message ? e.message : e));
                throw e;
            } finally {
                if (typeof showdebug === 'function') showdebug('[REGION] 雨雲画像呼び出し直前 / renderCrowdImage=' + (typeof renderCrowdImage));
                if (typeof renderCrowdImage === 'function') {
                    renderCrowdImage();
                    if (typeof showdebug === 'function') showdebug('[REGION] 雨雲画像呼び出し完了');
                }
            }
        });
    } else if (typeof showAllRegionSpots === 'function') {
        if (typeof showdebug === 'function') showdebug('[REGION] キューなし分岐で実行');
        showAllRegionSpots().then(async () => {
            try {
                if (typeof window.showSnsSonarLayer === 'function') {
                    if (typeof showdebug === 'function') showdebug('[REGION] ソナー開始（キューなし）');
                    await window.showSnsSonarLayer();
                    if (typeof showdebug === 'function') showdebug('[REGION] ソナー完了（キューなし）');
                }
            } finally {
                if (typeof renderCrowdImage === 'function') {
                    if (typeof showdebug === 'function') showdebug('[REGION] 雨雲画像呼び出し（キューなし）');
                    renderCrowdImage();
                }
            }
        }).catch(e => {
            if (typeof showdebug === 'function') showdebug('[REGION] キューなし分岐の例外: ' + (e && e.message ? e.message : e));
        });
    } else if (typeof showdebug === 'function') {
        showdebug('[REGION] runAfterTileLoadなし / showAllRegionSpotsも未定義');
    }

    if (typeof showRoadLayers === 'function') showRoadLayers();

    window.regionNearestClickHandler = function(e) {
        handleRegionNearest(e.latlng);
    };

    if (window.map) {
        window.map.off('click', window.regionNearestClickHandler);
        window.map.on('click', window.regionNearestClickHandler);
    }
}


// ==========================================
// REGION 初期ロード管理
// ==========================================
async function region_management() {
    if (typeof showdebug === 'function') showdebug('[REGION] region_management開始');
    const btn = document.getElementById('map-back-btn');
    if (btn) btn.style.display = 'none';

    if (window.map) {
        window.map.setMinZoom(0);
        window.map.setMaxZoom(18);
        window.map.setMaxBounds(null);
        window.map.dragging.enable();
        window.map.scrollWheelZoom.enable();
        window.map.doubleClickZoom.enable();
        window.map.touchZoom.enable();
        window.map.stop();

        if (window.nearestClickHandler) {
            window.map.off('click', window.nearestClickHandler);
            window.nearestClickEnabled = false;
        }
    }

    const isRegionReady = await loadRegionCSV();
    if (typeof showdebug === 'function') showdebug('[REGION] loadRegionCSV=' + isRegionReady);
    if (!isRegionReady) return;

    if (window.regionData) {
        drawLocation(
            window.regionData.name,
            window.regionData.lat,
            window.regionData.lng,
            window.regionData.zoom
        );
        if (typeof showdebug === 'function') showdebug('[REGION] drawLocation実行 / map=' + !!window.map);
    } else if (typeof showdebug === 'function') {
        showdebug('[REGION] regionDataなし');
    }

    renderRegion();
    if (typeof renderSpotRanking === 'function') renderSpotRanking();
}
