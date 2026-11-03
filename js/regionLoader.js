// ==========================================
// REGION 天気表示用アイコン関数
// ==========================================
function calcRepresentativeIcon(rows) {

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

    for (const r of rows) {

        const code = Number(r?.[0]);
        const pop  = Number(r?.[2]);

        if (!Number.isFinite(code)) continue;

        const adjusted = adjustCode(code, pop);

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

    const iconCode =
        tied.length > 1
            ? Math.round(tied.reduce((a,b)=>a+b,0)/tied.length)
            : tied[0];

    return toWeatherIcon(iconCode);
}

function toWeatherIcon(code) {
    if (code >= 70) return "☔️";
    if (code >= 60) return "☂️";   // 雨
    if (code >= 30) return "☁️";  // 曇り
    if (code >= 10) return "⛅";  // 晴れ時々曇り
    if (code === 1) return "🌤";  // 主に晴れ
    if (code === 2) return "⛅";  // 薄曇り
    return "☀️"; // 0 = 快晴
}

// ==========================================
// REGION関連データ取得・表示処理
// ==========================================
// ==========================================
// REGION 天気データ取得・スポット適用
// ==========================================
window.prefWhetherPromises = window.prefWhetherPromises || {};

function loadRegionWeatherForPref(prefCode) {
    const targetArray = window.prefSpotData?.[prefCode];
    if (!prefCode || !Array.isArray(targetArray)) return Promise.resolve(null);
    if (window.prefWhetherPromises[prefCode]) return window.prefWhetherPromises[prefCode];

    const whetherUrl = `/data/${prefCode}_whether.csv`;
    const regionCode = window.currentRegion || 'KANTO';
    window.prefWhetherPromises[prefCode] = Promise.all([
        loadWhetherCSV(whetherUrl).catch(() => null),
        typeof loadInlandWhetherCSV === 'function'
            ? loadInlandWhetherCSV(regionCode).catch(() => null)
            : Promise.resolve(null)
    ]).then(([whetherCsv, inlandCsv]) => {
        if (whetherCsv) applyWhetherToSpots(whetherCsv, targetArray);
        if (inlandCsv) applyInlandWhetherToSpots(inlandCsv, targetArray);
        return targetArray;
    }).catch(error => {
        delete window.prefWhetherPromises[prefCode];
        console.error("県別天気データ読み込みエラー:", prefCode, error);
        return null;
    });

    return window.prefWhetherPromises[prefCode];
}

// ==========================================
// REGION 初期表示：CSV取得・解析
// ==========================================
async function loadRegionCSV() {
    const regionCode = window.currentRegion || 'KANTO';

    if (window.regionCsvLoadedRegion === regionCode &&
        window.regionData &&
        Array.isArray(window.regionPrefData)) {
        return true;
    }

    if (window.regionCsvLoadPromise && window.regionCsvLoadingRegion === regionCode) {
        return window.regionCsvLoadPromise;
    }

    window.regionCsvLoadingRegion = regionCode;
    window.regionCsvLoadPromise = (async () => {
        try {
            const csvData = await loadRegionCsvData();
            if (!csvData || !csvData.headers.includes('type')) return false;

            const headers = csvData.headers;
            const latIdx = headers.indexOf('lat');
            const lngIdx = headers.indexOf('lng');
            const zoomIdx = headers.indexOf('zoom');
            const nameIdx = headers.indexOf('name');

            window.regionData = null;
            window.regionPrefData = [];

            for (const row of csvData.rows) {
                if (row.type === 'region' && latIdx !== -1 && lngIdx !== -1 && zoomIdx !== -1) {
                    window.regionData = {
                        name: nameIdx !== -1 ? row.name : '地域エリア',
                        lat: parseFloat(row.lat),
                        lng: parseFloat(row.lng),
                        zoom: parseFloat(row.zoom)
                    };
                }
            }

            for (const pref of csvData.prefRows || []) {
                if (isNaN(pref.lat) || isNaN(pref.lng)) continue;

                window.regionPrefData.push({
                    regionCode,
                    prefCode: pref.prefCode,
                    prefName: pref.prefName,
                    lat: pref.lat,
                    lng: pref.lng
                });
            }

            window.regionCsvLoadedRegion = regionCode;
            return !!window.regionData;
        } catch (err) {
            console.error("Region CSVの読み込みエラー:", err);
            return false;
        } finally {
            if (window.regionCsvLoadingRegion === regionCode) {
                window.regionCsvLoadPromise = null;
                window.regionCsvLoadingRegion = null;
            }
        }
    })();

    return window.regionCsvLoadPromise;
}


// ==========================================
// ★ Region CSVを1回取得・共通解析して使い回す
// ==========================================
window.regionCsvParsedData = null;
window.regionCsvParsedPromise = null;
window.regionCsvParsedRegion = null;
window.regionCsvParsedUrl = null;

function loadRegionCsvData() {
    const regionCode = window.currentRegion || 'KANTO';
    const rUrl = window.regionUrl || `/${regionCode}/${regionCode}_region.csv`;

    if (window.regionCsvParsedData &&
        window.regionCsvParsedRegion === regionCode &&
        window.regionCsvParsedUrl === rUrl) {
        return Promise.resolve(window.regionCsvParsedData);
    }

    if (window.regionCsvParsedPromise &&
        window.regionCsvParsedRegion === regionCode &&
        window.regionCsvParsedUrl === rUrl) {
        return window.regionCsvParsedPromise;
    }

    window.regionCsvParsedData = null;
    window.regionCsvParsedRegion = regionCode;
    window.regionCsvParsedUrl = rUrl;

    window.regionCsvParsedPromise = fetch(rUrl)
        .then(res => {
            if (!res.ok) throw new Error("Region CSV fetch failed: " + res.status);
            return res.text();
        })
        .then(text => {
            const lines = text.trim().split('\n');
            if (lines.length < 2) throw new Error("Region CSV is empty: " + rUrl);

            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const rows = [];

            for (let i = 1; i < lines.length; i++) {
                if (!lines[i]) continue;
                const cols = lines[i].split(',').map(c => c.trim());
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = cols[index] || '';
                });
                rows.push(row);
            }

            // 都道府県行のURL情報をここで一度だけ正規化して保持する。
            const prefRows = [];
            for (const row of rows) {
                if (row.type !== 'pref' || !row.url) continue;

                const parts = row.url.split('/');
                let prefCode = '';
                let lat = NaN;
                let lng = NaN;

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

                if (!prefCode) continue;

                prefRows.push({
                    prefCode,
                    prefName: row.notes || '',
                    lat,
                    lng,
                    row
                });
            }

            const parsedData = { regionCode, url: rUrl, headers, rows, prefRows };
            if (window.regionCsvParsedRegion === regionCode &&
                window.regionCsvParsedUrl === rUrl) {
                window.regionCsvParsedData = parsedData;
            }
            return parsedData;
        })
        .catch(err => {
            if (window.regionCsvParsedRegion === regionCode &&
                window.regionCsvParsedUrl === rUrl) {
                window.regionCsvParsedPromise = null;
                window.regionCsvParsedData = null;
                window.regionCsvParsedRegion = null;
                window.regionCsvParsedUrl = null;
            }
            throw err;
        });

    return window.regionCsvParsedPromise;
}

// ==========================================
// ★ 2. 指定した1県だけのlocation.jsonを最速で取得する関数
// ==========================================
window._loadedPrefSet = window._loadedPrefSet || new Set();
window.prefSpotData = window.prefSpotData || {};
window.prefSpotPromises = window.prefSpotPromises || {};

function rebuildAllSpotData() {
    window.allspotData = Object.values(window.prefSpotData).flat();
    window.ALL_REGION_SPOTS = window.allspotData;
    return window.allspotData;
}

async function fetchSinglePrefSpots(prefCode) {
    if (!prefCode) return [];
    if (Array.isArray(window.prefSpotData[prefCode])) return window.prefSpotData[prefCode];
    if (window.prefSpotPromises[prefCode]) return window.prefSpotPromises[prefCode];

    const regionCode = window.currentRegion || 'KANTO';
    const url = `/${regionCode}/${prefCode}_location.json`;

    window.prefSpotPromises[prefCode] = fetch(url)
        .then(res => {
            if (!res.ok) throw new Error("location.json fetch failed: " + res.status);
            return res.json();
        })
        .then(data => {
            if (!Array.isArray(data)) throw new Error("location.json形式エラー: " + prefCode);
            data.forEach(s => s._prefCode = prefCode);
            window.prefSpotData[prefCode] = data;
            window._loadedPrefSet.add(prefCode);
            rebuildAllSpotData();
            return data;
        })
        .catch(error => {
            delete window.prefSpotPromises[prefCode];
            console.error("単一県JSON取得エラー:", error);
            return [];
        });

    return window.prefSpotPromises[prefCode];
}

// =====================================================
// ■ 3. 全県データをバックグラウンドで取得・合体する金庫生成関数
// =====================================================
window._isAllRegionLoaded = false;
window._allRegionSpotsPromise = null;

async function fetchAllRegionSpots() {
    if (window._isAllRegionLoaded && Object.keys(window.prefSpotData).length > 0) {
        return rebuildAllSpotData();
    }
    if (window._allRegionSpotsPromise) return window._allRegionSpotsPromise;

    window._allRegionSpotsPromise = (async () => {
        try {
            const csvData = await loadRegionCsvData();
            if (!csvData.headers.includes('type') || !csvData.headers.includes('url')) {
                return rebuildAllSpotData();
            }

            const prefList = [];
            for (const pref of csvData.prefRows || []) {
                if (pref.prefCode && !prefList.includes(pref.prefCode)) {
                    prefList.push(pref.prefCode);
                }
            }

            await Promise.all(prefList.map(prefCode => fetchSinglePrefSpots(prefCode)));
            window._isAllRegionLoaded = prefList.every(prefCode => Array.isArray(window.prefSpotData[prefCode]));
            if (!window._isAllRegionLoaded) window._allRegionSpotsPromise = null;
            return rebuildAllSpotData();
        } catch (err) {
            console.error("全県データ読み込みエラー:", err);
            window._allRegionSpotsPromise = null;
            return rebuildAllSpotData();
        }
    })();

    return window._allRegionSpotsPromise;
}


// =====================================================
// ■ 広域マップで全県のドットを描画する関数
// =====================================================
async function showAllRegionSpots() {
    if (!window.map) return;

    if (
        window.regionSpotMarkers &&
        window.regionSpotMarkers.length > 0 &&
        window.regionAllSpotLayer &&
        window._isAllRegionLoaded
    ) {
        if (!window.map.hasLayer(window.regionAllSpotLayer)) {
            window.regionAllSpotLayer.addTo(window.map);
        }
        return;
    }

    if (window._buildingRegionSpotsPromise) {
        return window._buildingRegionSpotsPromise;
    }

    window._buildingRegionSpotsPromise = (async () => {
        await fetchAllRegionSpots();
        const allSpots = Object.values(window.prefSpotData || {}).flat();
        const targetSpots = allSpots.filter(
            s => s.type !== 'pref' && s.type !== 'area'
        );

        if (window.regionAllSpotLayer) {
            window.map.removeLayer(window.regionAllSpotLayer);
        }

        window.regionSpotMarkers = [];
        window.regionSpotMarkerMap = new Map();
        window.regionAllSpotLayer = L.layerGroup().addTo(window.map);

        // ★ 1フレームあたり8ms以内に収まる数だけドットを生成し、次フレームへバトンを渡す（カクつきゼロ）
        await new Promise(resolve => {
            let i = 0;
            function addSlice() {
                const start = performance.now();
                while (i < targetSpots.length && (performance.now() - start) < 4) {
                    const spot = targetSpots[i++];
                    const lat = Number(spot.lat);
                    const lng = Number(spot.lng);
                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

                    let type = 'spot';
                    if (spot.icon && spot.icon.startsWith('fish')) {
                        const match = spot.icon.match(/fish\d+/);
                        if (match) type = match[0];
                    }

                    const marker = L.marker(
                        [lat, lng],
                        {
                            icon: L.divIcon({
                                className: `pref-dot ${type}`,
                                html: '',
                                iconSize: [5, 5],
                                iconAnchor: [2.5, 2.5]
                            }),
                            interactive: true,
                            keyboard: false
                        }
                    );

                    marker._spotData = spot;
                    marker._prefCode = spot._prefCode;

                    marker._spotClickHandler = function () {
                        const spotAreaId = String(spot.areaId || '').trim();
                        const areaIndividualId = spotAreaId.replace(`${window.currentPref}_`, '');
                        const area = (window.areaData || []).find(
                            a => String(a.individualId || '').trim() === areaIndividualId
                        );
                        if (!area) return;
                        selectArea(area);
                    };

                    marker._regionClickHandler = function () {
                        handleRegionNearest(marker.getLatLng());
                    };

                    window.regionSpotMarkers.push(marker);
                    window.regionSpotMarkerMap.set(spot, marker);
                    window.regionAllSpotLayer.addLayer(marker);
                }

                if (i < targetSpots.length) {
                    requestAnimationFrame(addSlice);
                } else {
                    resolve();
                }
            }
            requestAnimationFrame(addSlice);
        });

        if (window.regionMarkers && window.regionMarkers.length > 0) {
            window.regionMarkers.forEach(m => {
                if (m.setZIndexOffset) {
                    m.setZIndexOffset(1000);
                }
            });
        }
        window._buildingRegionSpotsPromise = null;
    })();

    return window._buildingRegionSpotsPromise;
}

function showPrefSpots() {
    if (!window.regionSpotMarkers || window.regionSpotMarkers.length === 0) {
        if (typeof showAllRegionSpots === 'function') {
            window.runAfterTileLoad(async () => {
                await showAllRegionSpots();
                showPrefSpots();
            });
        }
        return;
    }

    const selectedPref = String(window.currentPref || '');

    if (window.currentSpotId) {
        window.regionSpotMarkers.forEach(marker => {
            const el = marker.getElement();
            if (!el) return;
            if (marker._regionClickHandler) marker.off('click', marker._regionClickHandler);
            if (marker._spotClickHandler) marker.off('click', marker._spotClickHandler);
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            marker._regionRepresentative = false;
        });
        return;
    }

    if (!window.currentPref) {
        window.regionSpotMarkers.forEach(marker => {
            const el = marker.getElement();
            if (!el) return;
            if (marker._regionClickHandler) marker.off('click', marker._regionClickHandler);
            if (marker._spotClickHandler) marker.off('click', marker._spotClickHandler);
            el.style.opacity = '1';
            el.style.pointerEvents = 'none';
            marker._regionRepresentative = false;
        });
        showRoadLayers();
        return;
    }

    window.regionSpotMarkers.forEach(marker => {
        const spot = marker._spotData;
        const el = marker.getElement();
        if (!spot || !el) return;

        const markerPref = String(marker._prefCode || '');
        if (marker._regionClickHandler) marker.off('click', marker._regionClickHandler);
        if (marker._spotClickHandler) marker.off('click', marker._spotClickHandler);

        if (markerPref === selectedPref) {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            marker.on('click', marker._spotClickHandler);
        } else {
            el.style.opacity = '0.35';
            el.style.pointerEvents = 'none';
        }
        marker._regionRepresentative = false;
    });
    showRoadLayers();
}

function handleRegionNearest(latlng) {
    if (!window.map) return;
    if (!window.regionPrefData || !window.regionPrefData.length) return;

    let nearest = null;
    let minDist = Infinity;

    for (const pref of window.regionPrefData) {
        const dist = window.map.distance(latlng, L.latLng(pref.lat, pref.lng));
        if (dist < minDist) {
            minDist = dist;
            nearest = pref;
        }
    }

    if (!nearest) return;

    if (window.regionNearestClickHandler) {
        window.map.off('click', window.regionNearestClickHandler);
    }

    window.selectPrefecture(`${nearest.regionCode}_${nearest.prefCode}`);
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
        await drawLocation(
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


// ==========================================
// 魚種データ処理
// ==========================================

// ==========================================\n// ★ 魚種データ取得・付与\n// ==========================================
window.fishDataCache = window.fishDataCache || {};
window.fishDataPromises = window.fishDataPromises || {};
window.fishDataPromise = null;

function loadFishDataForPref(pref, fishUrl) {
    if (!pref || !fishUrl) return Promise.resolve(null);
    if (window.fishDataCache[pref]) {
        const cachedSpots = window.prefSpotData?.[pref];
        if (Array.isArray(cachedSpots)) applyFishDataToSpots(cachedSpots, window.fishDataCache[pref]);
        return Promise.resolve(window.fishDataCache[pref]);
    }
    if (window.fishDataPromises[pref]) return window.fishDataPromises[pref];

    window.fishDataPromises[pref] = fetch(fishUrl)
        .then(res => {
            if (!res.ok) throw new Error("fish.json fetch failed: " + res.status);
            return res.json();
        })
        .then(fishData => {
            if (fishData && typeof fishData === 'object') {
                window.fishDataCache[pref] = fishData;
                const targetSpots = window.prefSpotData?.[pref];
                if (Array.isArray(targetSpots)) applyFishDataToSpots(targetSpots, fishData);
            }
            return fishData;
        })
        .catch(error => {
            delete window.fishDataPromises[pref];
            console.error('魚データ読み込みエラー:', pref, error);
            return null;
        });

    return window.fishDataPromises[pref];
}

function loadFishDataAsync(pref, fishUrl) {
    if (!pref || !fishUrl) return Promise.resolve(null);
    const promise = loadFishDataForPref(pref, fishUrl);
    window.fishDataPromise = promise;
    return promise.then(fishData => {
        if (fishData && window.currentPref === pref) {
            window.fishData = fishData;
            if (window.spotData) applyFishDataToSpots(window.spotData, fishData);
            if (window.currentSpotId && window.spotData) {
                const activeSpot = window.spotData.find(s => String(s.individualId) === String(window.currentSpotId));
                if (activeSpot && activeSpot.URL) {
                    if (typeof showFishMarkers === 'function') showFishMarkers(activeSpot.URL);
                    if (typeof updateSeoMeta === 'function') updateSeoMeta();
                }
            }
        }
        return fishData;
    });
}

const fishDataDictionaryCache = new WeakMap();

function getFishDataDictionary(fishData) {
    if (!fishData || typeof fishData !== 'object') return null;
    if (fishDataDictionaryCache.has(fishData)) return fishDataDictionaryCache.get(fishData);

    const fishDict = {};
    for (const regKey in fishData) {
        const areaSpots = fishData[regKey];
        if (!areaSpots || typeof areaSpots !== 'object') continue;
        for (const spotName in areaSpots) {
            fishDict[spotName] = areaSpots[spotName];
        }
    }

    fishDataDictionaryCache.set(fishData, fishDict);
    return fishDict;
}

function applyFishDataToSpots(spots, fishData) {
    if (!Array.isArray(spots)) return;

    if (!fishData || typeof fishData !== 'object') {
        spots.forEach(spot => {
            spot.URL = "";
        });
        return;
    }

    const fishDict = getFishDataDictionary(fishData);

    spots.forEach(spot => {
        const spotFishData = fishDict[spot.name];
        if (!spotFishData) {
            spot.URL = "";
            return;
        }

        const fishList = [];
        for (const fishName in spotFishData) {
            const info = spotFishData[fishName];
            if (info && typeof info.coords === 'string' && info.coords !== '') {
                const points = info.coords.split('|');
                points.forEach(pt => {
                    const [lat, lng] = pt.split(',');
                    if (lat && lng) fishList.push(`${fishName}|${lat}|${lng}`);
                });
            }
        }
        spot.URL = fishList.join(',');
    });
}


// ==========================================
// SNS釣果ソナー関連一式
// ==========================================
// ==========================================
// ★ SNS釣果データ (integrated_catch.json) 読み込み＆ソナー表示
// （ズーム12以下で表示 ／ 12.5以上で非表示＆ポップアップ対応版）
// ==========================================

const DEFAULT_SNS_SONAR_OPTIONS = {
  targetFish: null,     // 特定魚種のみ表示する場合は魚種名を指定
  maxSonars: 18,        // 表示するソナーの最大数
  minDistanceKm: 10.0,  // ソナー同士の最小間隔（km）
  maxVisibleZoom: 12.0, // ズーム12以下のみ表示
  // ★ ズームレベルごとの基準ソナーサイズ（px）：縮尺に合わせて一回り大きく調整
  sizeByZoom: {
    0: 48,   // 広域（Zoom 8以下）
    9: 64,   // Zoom 9〜10
    11: 82,  // Zoom 11
    12: 96   // Zoom 12
  },
  onSonarClick: null
};

window.snsCatchData = [];
window.isSnsCatchLoaded = false;
window._isSnsCatchLoading = false;
window.snsSonarLayerGroup = null;
window.snsSonarTextLayerGroup = null;
window._snsDisplayPoints = [];
window._currentSnsSonarOptions = { ...DEFAULT_SNS_SONAR_OPTIONS };
window._isSnsSonarOpaque = false;

// 2点間の距離（km）を計算
function calcSnsDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 現在のズームに応じた基準サイズ
function resolveBaseSonarSizeForZoom(zoom, sizeByZoom) {
  if (typeof sizeByZoom === 'number') return sizeByZoom;
  const mapObj = sizeByZoom || DEFAULT_SNS_SONAR_OPTIONS.sizeByZoom;
  const thresholds = Object.keys(mapObj).map(Number).sort((a, b) => a - b);
  let resolvedSize = 60;
  for (const t of thresholds) {
    if (zoom >= t) resolvedSize = mapObj[t];
  }
  return resolvedSize;
}

// 経過日数による縮小倍率（当日〜6日: 1.0 / 7〜13日: 0.5 / 14〜20日: 0.25 / 21日〜: 0.125）
function getSonarAgeScale(dateStr) {
  if (!dateStr) return 0.125;
  const parts = String(dateStr).trim().replace(/-/g, '/').split('/');
  if (parts.length < 3) return 0.125;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const postDate = new Date(year, month, day);
  if (isNaN(postDate.getTime())) return 0.125;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.max(0, Math.floor((today.getTime() - postDate.getTime()) / 86400000));

  if (diffDays <= 6) return 1.0;
  if (diffDays <= 13) return 0.5;
  if (diffDays <= 20) return 0.25;
  return 0.125;
}

// SNS別クラス判定（X:黒, Insta:ピンク, FB:水色, Threads:白）
function getSnsColorClass(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('instagram')) return 'sns-instagram';
  if (s === 'x' || s.includes('twitter')) return 'sns-x';
  if (s.includes('facebook')) return 'sns-facebook';
  if (s.includes('threads')) return 'sns-threads';
  return 'sns-default';
}

// SNS別表示ラベル
function getSnsDisplayName(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('instagram')) return 'Instagram';
  if (s === 'x' || s.includes('twitter')) return 'X';
  if (s.includes('facebook')) return 'Facebook';
  if (s.includes('threads')) return 'Threads';
  return 'SNS';
}

// ソナー非表示化関数
window.hideSnsSonarLayer = function() {
  window._isSnsSonarOpaque = false;
  if (!window.map) return;

  const sonarPane = window.map.getPane('snsSonarPane');
  if (sonarPane) {
    sonarPane.style.opacity = '0';
    sonarPane.style.pointerEvents = 'none';
  }

  const textPane = window.map.getPane('snsSonarTextPane');
  if (textPane) {
    textPane.style.opacity = '0';
    textPane.style.pointerEvents = 'none';
  }

  if (window.snsSonarTextLayerGroup) {
    window.snsSonarTextLayerGroup.eachLayer(marker => {
      const hit = marker.getElement()?.querySelector('.sns-sonar-fish-hit');
      if (hit) hit.classList.add('is-hidden-hit');
      marker.closePopup?.();
    });
  }
};

// JSONデータ取得
window.loadSnsCatchData = async function(regionCode) {
  if (window.isSnsCatchLoaded) return window.snsCatchData;
  if (window._isSnsCatchLoading) return window._snsCatchPromise;

  const targetRegion = regionCode || window.currentRegion || 'KANTO';
  const url = `/${targetRegion}/integrated_catch.json`;

  window._isSnsCatchLoading = true;
  window._snsCatchPromise = fetch(url, { priority: 'low' })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      window.snsCatchData = Array.isArray(data) ? data : [];
      window.isSnsCatchLoaded = true;
      window._isSnsCatchLoading = false;
      return window.snsCatchData;
    })
    .catch(err => {
      console.warn('SNS釣果データの読み込みスキップ:', err);
      window.snsCatchData = [];
      window._isSnsCatchLoading = false;
      return [];
    });

  return window._snsCatchPromise;
};

// ソナー本体描画
window.showSnsSonarLayer = async function(customOptions = {}) {
  if (!window.map) return;

  const existingPane = window.map.getPane('snsSonarPane');
  //if (window._isSnsSonarOpaque || (existingPane && existingPane.style.opacity === '1')) {
  //  window.hideSnsSonarLayer();
  //  return;
  //}

  const opts = {
    ...DEFAULT_SNS_SONAR_OPTIONS,
    ...customOptions,
    sizeByZoom: customOptions.sizeByZoom || DEFAULT_SNS_SONAR_OPTIONS.sizeByZoom
  };
  window._currentSnsSonarOptions = opts;

  if (!window.isSnsCatchLoaded) {
    await window.loadSnsCatchData();
  }
  if (!window.snsCatchData.length) return;

  if (!window.map.getPane('snsSonarPane')) {
    window.map.createPane('snsSonarPane');
    const pane = window.map.getPane('snsSonarPane');
    pane.style.zIndex = 650;
    pane.style.opacity = '0';
    pane.style.pointerEvents = 'none';
    pane.style.transition = 'opacity 0.4s ease';
  }

  if (!window.snsSonarLayerGroup) {
    window.snsSonarLayerGroup = L.layerGroup().addTo(window.map);
    window.map.on('zoomend', updateSnsSonarOnZoom);
  } else {
    window.snsSonarLayerGroup.clearLayers();
    if (!window.map.hasLayer(window.snsSonarLayerGroup)) {
      window.snsSonarLayerGroup.addTo(window.map);
    }
  }

  // 同一座標集計
  const uniqueCoords = new Map();
  window.snsCatchData.forEach(item => {
    if (!item || !item.lat || !item.lng) return;
    if (opts.targetFish && item.fish !== opts.targetFish) return;

    const key = `${Number(item.lat).toFixed(3)}_${Number(item.lng).toFixed(3)}`;
    const existing = uniqueCoords.get(key);
    const itemDate = String(item.date || '');

    if (!existing) {
      uniqueCoords.set(key, {
        lat: Number(item.lat),
        lng: Number(item.lng),
        date: itemDate,
        fish: item.fish || '',
        area_name: item.area_name || '',
        url: item.url || '',
        source: item.source || 'SNS',
        count: 1,
        records: [item]
      });
    } else {
      existing.count += 1;
      existing.records.push(item);
      if (itemDate >= existing.date) {
        existing.date = itemDate;
        if (item.fish) existing.fish = item.fish;
        if (item.area_name) existing.area_name = item.area_name;
        if (item.url) existing.url = item.url;
        if (item.source) existing.source = item.source;
      }
    }
  });

  const sortedCandidates = [...uniqueCoords.values()].sort((a, b) => {
    const scaleA = getSonarAgeScale(a.date);
    const scaleB = getSonarAgeScale(b.date);
    if (scaleB !== scaleA) return scaleB - scaleA;
    if (b.count !== a.count) return b.count - a.count;
    return b.date.localeCompare(a.date);
  });

  const displayPoints = [];
  for (const candidate of sortedCandidates) {
    if (displayPoints.length >= opts.maxSonars) break;
    const isTooClose = displayPoints.some(
      selected => calcSnsDistanceKm(candidate.lat, candidate.lng, selected.lat, selected.lng) < opts.minDistanceKm
    );
    if (!isTooClose) {
      displayPoints.push(candidate);
    }
  }
  window._snsDisplayPoints = displayPoints;

  const currentZoom = window.map.getZoom();
  const baseSize = resolveBaseSonarSizeForZoom(currentZoom, opts.sizeByZoom);

  displayPoints.forEach((pt, idx) => {
    const ageScale = getSonarAgeScale(pt.date);
    const finalSize = Math.max(6, Math.round(baseSize * ageScale * 10) / 10);
    const offsetSec = ((idx * 0.9) % 3.2).toFixed(2);
    const delay2Sec = (Number(offsetSec) + 3.25).toFixed(2);
    const snsClass = getSnsColorClass(pt.source);

    const marker = L.marker([pt.lat, pt.lng], {
      icon: createSnsSonarDivIcon(finalSize, snsClass, offsetSec, delay2Sec),
      pane: 'snsSonarPane',
      interactive: false,
      keyboard: false
    });

    marker._snsMeta = { ageScale, snsClass, offsetSec, delay2Sec };
    marker.addTo(window.snsSonarLayerGroup);
  });

  window._isSnsSonarOpaque = true;

  if (currentZoom <= opts.maxVisibleZoom) {
    window.renderSnsSonarTextLayer(displayPoints, opts);
  }

  updateSnsSonarOnZoom();
};

function createSnsSonarDivIcon(sizePx, snsClass, offsetSec, delay2Sec) {
  const half = sizePx / 2;
  return L.divIcon({
    className: 'sns-sonar-wrapper',
    html: `
      <div class="sns-sonar-emitter ${snsClass}" style="--sonar-size: ${sizePx}px;">
        <div class="sns-sonar-sweep"></div>
        <div class="sns-sonar-wave" style="animation-delay: ${offsetSec}s;"></div>
        <div class="sns-sonar-wave" style="animation-delay: ${delay2Sec}s;"></div>
        <div class="sns-sonar-core"></div>
      </div>
    `,
    iconSize: [sizePx * 1.65, sizePx * 1.65],
    iconAnchor: [half * 1.65, half * 1.65]
  });
}

// ★ テキスト描画＆クリック時ポップアップ
window.renderSnsSonarTextLayer = function(points = [], opts = DEFAULT_SNS_SONAR_OPTIONS) {
  if (!window.map) return;

  if (!window.map.getPane('snsSonarTextPane')) {
    window.map.createPane('snsSonarTextPane');
    const textPane = window.map.getPane('snsSonarTextPane');
    textPane.style.zIndex = 655;
    textPane.style.pointerEvents = 'none';
    textPane.style.transition = 'opacity 0.3s ease';
  }

  if (!window.snsSonarTextLayerGroup) {
    window.snsSonarTextLayerGroup = L.layerGroup().addTo(window.map);
  } else {
    window.snsSonarTextLayerGroup.clearLayers();
    if (!window.map.hasLayer(window.snsSonarTextLayerGroup)) {
      window.snsSonarTextLayerGroup.addTo(window.map);
    }
  }

  const currentZoom = window.map.getZoom();
  const isHiddenHit = currentZoom > opts.maxVisibleZoom;
  const hiddenClass = isHiddenHit ? 'is-hidden-hit' : '';

  points.forEach(pt => {
    const snsClass = getSnsColorClass(pt.source);
    const snsName = getSnsDisplayName(pt.source);
    const safeFish = String(pt.fish || '').replace(/[<>&"']/g, '');
    const safeArea = String(pt.area_name || '釣り場付近').replace(/[<>&"']/g, '');
    const safeDate = String(pt.date || '').replace(/^\d{4}\//, '');

    const textMarker = L.marker([pt.lat, pt.lng], {
      icon: L.divIcon({
        className: 'sns-sonar-text-wrapper',
        html: `<span class="sns-sonar-fish-hit ${snsClass} ${hiddenClass}">${safeFish}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      }),
      pane: 'snsSonarTextPane',
      interactive: true,
      keyboard: false
    });

    textMarker._pointData = pt;

    const popupHtml = `
      <div class="sns-catch-popup">
        <div class="sns-catch-popup-title">${safeArea}</div>
        <div class="sns-catch-popup-fish">${safeFish}<span class="sns-catch-popup-date">(${safeDate})</span></div>
        <div class="sns-catch-popup-footer">
          <a class="sns-catch-btn ${snsClass}" href="${pt.url}" target="_blank" rel="noopener noreferrer">
            <span class="sns-catch-label">${snsName}で釣果を見る</span>
            <span class="sns-catch-arrow">↗</span>
          </a>
        </div>
      </div>
    `;

    textMarker.bindPopup(popupHtml, {
      offset: [0, -6],
      closeButton: true,
      autoPanPadding: [20, 20]
    });

    textMarker.on('click', (e) => {
      if (!window._isSnsSonarOpaque || window.map.getZoom() > opts.maxVisibleZoom) return;
      if (e.originalEvent) e.originalEvent.stopPropagation();
      textMarker.openPopup();
      if (typeof opts.onSonarClick === 'function') {
        opts.onSonarClick(pt, textMarker, e);
      }
    });

    textMarker.addTo(window.snsSonarTextLayerGroup);
  });

  const textPane = window.map.getPane('snsSonarTextPane');
  if (textPane) {
    textPane.style.opacity = isHiddenHit ? '0' : '1';
  }
};

// ズーム変更監視
function updateSnsSonarOnZoom() {
  if (!window.map || !window._isSnsSonarOpaque) return;

  const sonarPane = window.map.getPane('snsSonarPane');
  if (!sonarPane) return;

  const opts = window._currentSnsSonarOptions || DEFAULT_SNS_SONAR_OPTIONS;
  const currentZoom = window.map.getZoom();

  if (currentZoom > opts.maxVisibleZoom) {
    sonarPane.style.opacity = '0';
    const textPane = window.map.getPane('snsSonarTextPane');
    if (textPane) textPane.style.opacity = '0';

    if (window.snsSonarTextLayerGroup) {
      window.snsSonarTextLayerGroup.eachLayer(m => {
        const hit = m.getElement()?.querySelector('.sns-sonar-fish-hit');
        if (hit) hit.classList.add('is-hidden-hit');
        m.closePopup?.();
      });
    }
    return;
  }

  sonarPane.style.opacity = '1';
  const baseSize = resolveBaseSonarSizeForZoom(currentZoom, opts.sizeByZoom);

  if (window.snsSonarLayerGroup) {
    window.snsSonarLayerGroup.eachLayer(marker => {
      if (marker._snsMeta) {
        const { ageScale, snsClass, offsetSec, delay2Sec } = marker._snsMeta;
        const finalSize = Math.max(6, Math.round(baseSize * ageScale * 10) / 10);
        marker.setIcon(createSnsSonarDivIcon(finalSize, snsClass, offsetSec, delay2Sec));
      }
    });
  }

  if (!window.snsSonarTextLayerGroup || window.snsSonarTextLayerGroup.getLayers().length === 0) {
    window.renderSnsSonarTextLayer(window._snsDisplayPoints, opts);
  } else {
    const textPane = window.map.getPane('snsSonarTextPane');
    if (textPane) textPane.style.opacity = '1';

    window.snsSonarTextLayerGroup.eachLayer(m => {
      const hit = m.getElement()?.querySelector('.sns-sonar-fish-hit');
      if (hit) hit.classList.remove('is-hidden-hit');
    });
  }
}
