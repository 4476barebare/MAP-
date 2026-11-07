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
// ★ 都道府県 location.json の共通ロード管理
// mode:
//   select = 選択県のみ
//   other  = 選択県を除く同一地方の全県
//   all    = 同一地方の全県（選択県を含む）
// 県別データは個別に保持し、all の場合だけ全県配列を再構築する。
// ==========================================
window._loadedPrefSet = window._loadedPrefSet || new Set();
window.prefSpotData = window.prefSpotData || {};
window.prefSpotPromises = window.prefSpotPromises || {};
window._isAllRegionLoaded = window._isAllRegionLoaded || false;

function rebuildAllSpotData() {
    window.allspotData = Object.values(window.prefSpotData).flat();
    window.ALL_REGION_SPOTS = window.allspotData;
    return window.allspotData;
}

function fetchAndStorePrefSpots(prefCode) {
    if (!prefCode) return Promise.resolve([]);
    if (Array.isArray(window.prefSpotData[prefCode])) return Promise.resolve(window.prefSpotData[prefCode]);
    if (window.prefSpotPromises[prefCode]) return window.prefSpotPromises[prefCode];

    const regionCode = window.currentRegion || 'KANTO';
    const url = `/${regionCode}/${prefCode}_location.json`;

    const promise = fetch(url, { priority: 'low' })
        .then(res => {
            if (!res.ok) throw new Error("location.json fetch failed: " + res.status);
            return res.json();
        })
        .then(data => {
            if (!Array.isArray(data)) throw new Error("location.json形式エラー: " + prefCode);
            data.forEach(s => { s._prefCode = prefCode; });
            window.prefSpotData[prefCode] = data;
            window._loadedPrefSet.add(prefCode);
            return data;
        })
        .catch(error => {
            delete window.prefSpotPromises[prefCode];
            console.error("都道府県JSON取得エラー:", prefCode, error);
            return [];
        });

    window.prefSpotPromises[prefCode] = promise;
    return promise;
}

window.loadPrefectureSpots = async function(prefCode, mode = 'select') {
    if (!['select', 'other', 'all'].includes(mode)) {
        throw new Error('loadPrefectureSpots: mode は select / other / all のいずれかを指定してください');
    }
    if ((mode === 'select' || mode === 'other') && !prefCode) return [];

    const csvData = await loadRegionCsvData();
    if (!csvData || !Array.isArray(csvData.prefRows)) return [];

    const prefList = [...new Set(
        csvData.prefRows.map(row => row.prefCode).filter(Boolean)
    )];

    let targetList = prefList;
    if (mode === 'select') targetList = [prefCode];
    if (mode === 'other') targetList = prefList.filter(code => code !== prefCode);

    const loadedRows = await Promise.all(targetList.map(fetchAndStorePrefSpots));

    if (mode === 'all') {
        window._isAllRegionLoaded = prefList.every(code => Array.isArray(window.prefSpotData[code]));
        return rebuildAllSpotData();
    }

    if (mode === 'other') {
        window._isAllRegionLoaded = prefList.every(code => Array.isArray(window.prefSpotData[code]));
        return loadedRows.flat();
    }

    return window.prefSpotData[prefCode] || loadedRows[0] || [];
};

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
        await loadPrefectureSpots(window.currentPref, 'all');
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

    await loadPrefectureSpots(null, 'all');

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

// ==========================================
// ★ 魚種データ取得・付与
// ==========================================
window.fishDataCache = window.fishDataCache || {};
window.fishDataPromises = window.fishDataPromises || {};

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
