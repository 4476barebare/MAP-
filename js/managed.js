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
        window.runAfterTileLoad(async () => {
            try {
                if (typeof showAllRegionSpots === 'function') {
                    await showAllRegionSpots();
                }
                if (typeof window.showSnsSonarLayer === 'function') {
                    await window.showSnsSonarLayer();
                }
            } catch (e) {
                throw e;
            } finally {
                if (typeof renderCrowdImage === 'function') {
                    renderCrowdImage();
                }
            }
        });
    } else if (typeof showAllRegionSpots === 'function') {
        showAllRegionSpots().then(async () => {
            try {
                if (typeof window.showSnsSonarLayer === 'function') {
                    await window.showSnsSonarLayer();
                }
            } finally {
                if (typeof renderCrowdImage === 'function') {
                    renderCrowdImage();
                }
            }
        }).catch(() => {});
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
    if (!isRegionReady) return;

    if (window.regionData) {
        drawLocation(
            window.regionData.name,
            window.regionData.lat,
            window.regionData.lng,
            window.regionData.zoom
        );
    }

    if (typeof updateSeoMeta === 'function') updateSeoMeta();

    const prefList = (window.regionPrefData || []).map(item => item.prefCode).filter(Boolean);

    // 県別スポットデータと同時に、道路・等深線・ICの共通JSONは通信だけ先行させる。
    Promise.all([
        typeof window.loadRoadData === 'function' ? window.loadRoadData() : Promise.resolve(null),
        typeof DepthMapController !== 'undefined' ? DepthMapController.loadData() : Promise.resolve(null),
        typeof loadICData === 'function' ? loadICData() : Promise.resolve(null)
    ]).catch(error => {
        console.error('共通データ先行取得エラー:', error);
    });

    await Promise.all(prefList.map(prefCode => fetchSinglePrefSpots(prefCode)));

    // マーカーは天気・fishの取得を待たずに生成を開始
    if (typeof showAllRegionSpots === 'function') showAllRegionSpots();

    const dataPromises = prefList.map(prefCode => {
        const fishUrl = `/${window.currentRegion || 'KANTO'}/${prefCode}_fish.json`;
        return Promise.all([
            typeof loadRegionWeatherForPref === 'function'
                ? loadRegionWeatherForPref(prefCode)
                : Promise.resolve(null),
            typeof loadFishDataForPref === 'function'
                ? loadFishDataForPref(prefCode, fishUrl)
                : Promise.resolve(null)
        ]);
    });

    renderRegion();
    await Promise.all(dataPromises);
    if (typeof rebuildAllSpotData === 'function') rebuildAllSpotData();
    if (typeof renderSpotRanking === 'function') renderSpotRanking();
    return true;
}
