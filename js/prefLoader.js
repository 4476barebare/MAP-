// ==========================================
// prefLoader.js : PREF 画面のロード管理
//
// 方針
//  1. 選択県の location.json を loadPrefectureSpots(select) で取得し、drawLocation() を開始。
//  2. 描画と並行して他県データ（other）と選択県の天気・魚種データを取得。
//  3. 描画後に全県データ（all）を集約し、県マーカーを表示。
//  4. 他県の天気・魚種データはマーカー表示の裏で順次付与する。
//
// 依存（regionLoader.js・変更なし）:
//   loadRegionCSV / loadRegionCsvData / loadPrefectureSpots / rebuildAllSpotData
//   window.prefSpotData / window.prefSpotPromises / window._loadedPrefSet
// 依存（dataLoader.js）: drawLocation
// ==========================================

// 取得済みの県データ（location.json の parent 行）を返す
function getPrefParentRow(prefCode) {
    const rows = window.prefSpotData && window.prefSpotData[prefCode];
    if (!Array.isArray(rows)) return null;
    return rows.find(r => r.name === prefCode && r.individualId === 'parent') || null;
}

// drawLocation に渡す値を {name, lat, lng, zoom} で返す。無効なら null
function toDrawTarget(row, fallbackName) {
    if (!row) return null;
    const lat = parseFloat(row.lat);
    const lng = parseFloat(row.lng);
    const zoom = parseFloat(row.zoom);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return null;
    return { name: row.name || fallbackName, lat, lng, zoom };
}

// flyTo の完了待ち（moveend 未発火の同一座標ケース用にタイムアウト付き）
function waitMapSettled(timeoutMs = 1200) {
    return new Promise(resolve => {
        if (!window.map) { resolve(); return; }
        let done = false;
        let timer = null;
        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            window.map.off('moveend', finish);
            requestAnimationFrame(() => resolve());
        };
        window.map.on('moveend', finish);
        timer = setTimeout(finish, timeoutMs);
    });
}

// ==========================================
// pref_management：region_management() の PREF 版
// ==========================================
async function pref_management(prefCode = window.currentPref) {
    if (!prefCode) return false;

    const regionCode = window.currentRegion || 'KANTO';
    window.currentPref = prefCode;
    window.prefLocationUrl = `/${regionCode}/${prefCode}_location.json`;

    const mapExistedBefore = !!window.map;

    // 地図の操作制限を解除（region_management と同じ初期化）
    if (window.map) {
        window.map.setMinZoom(0);
        window.map.setMaxZoom(18);
        window.map.setMaxBounds(null);
        window.map.options.maxBoundsViscosity = 0;
        window.map.stop();
    }

    // ---------- 1. 最優先：選択県の表示準備 ----------
    const isRegionReady = await loadRegionCSV();       // キャッシュがあれば再利用
    if (!isRegionReady) return false;

    await loadPrefectureSpots(prefCode, 'select');      // 選択県だけ先行取得
    const parent = getPrefParentRow(prefCode);
    const target = toDrawTarget(parent, prefCode);     // zoom は必ず location.json から
    if (!target) {
        console.error('pref_management: location.json から drawLocation 用データを確定できません:', prefCode);
        return false;
    }
    window.prefData = parent;

    // ---------- 2. 地図描画を開始し、他県取得・選択県の付帯データを並行開始 ----------
    const drawPromise = drawLocation(target.name, target.lat, target.lng, target.zoom);
    const otherPromise = loadPrefectureSpots(prefCode, 'other');

    const bgGen = (window._prefBgGen = (window._prefBgGen || 0) + 1);
    const selectedBgPromise = window._prefBgDone
        ? Promise.resolve()
        : applyPrefWeatherAndFish(prefCode, regionCode);

    // ---------- 3. 地図描画だけを待って呼び出し元へ戻す ----------
    await drawPromise;
    if (mapExistedBefore && !window.isInitialMapLoad) {
        await waitMapSettled();
    }

    // 他県データの集約・マーカー生成・他県の天気魚種付与は裏で継続する。
    window._prefBackgroundLoad = otherPromise
        .then(() => loadPrefectureSpots(prefCode, 'all'))
        .then(() => {
            const finalParent = getPrefParentRow(prefCode);
            if (finalParent) window.prefData = finalParent;
            return showPrefMarkers();
        })
        .then(() => {
            if (window._prefBgDone) return;
            return runPrefBackgroundLoads(prefCode, Promise.resolve(), bgGen, selectedBgPromise);
        })
        .catch(err => console.error('都道府県バックグラウンド処理エラー:', err));

    return !!window.prefData;
}


// ==========================================
// 4-a. 全県スポットマーカー表示（regionLoader.js の既存関数を再利用）
// showAllRegionSpots : 全県のドットを4ms分割で生成
// showPrefSpots      : 対象県を強調（他県は薄く・タップ不可）
// スポット画面（currentSpotId あり）ではドットが非表示になるため生成しない。
// ==========================================
async function showPrefMarkers() {
    if (window.currentSpotId) return;
    if (typeof showAllRegionSpots !== 'function') return;
    await showAllRegionSpots();
    if (typeof showPrefSpots === 'function') showPrefSpots();
}

// ==========================================
// 新JSON天気データ取得・付与
// AddWeather(prefCode, mode)       : 沿岸部
// AddInLandWeather(prefCode, mode) : 内陸部
// mode = select / other
// ==========================================
window.prefWeatherJsonCache = window.prefWeatherJsonCache || {};
window.prefWeatherJsonPromises = window.prefWeatherJsonPromises || {};
window.prefWeatherJsonApplied = window.prefWeatherJsonApplied || {};
window.prefWeatherJsonApplyPromises = window.prefWeatherJsonApplyPromises || {};
window.regionWeatherAllDone = window.regionWeatherAllDone || {};
window.regionWeatherAllPromises = window.regionWeatherAllPromises || {};
window.regionWeatherAllResults = window.regionWeatherAllResults || {};

function loadPrefWeatherJson(prefCode, inland = false) {
    if (!prefCode) return Promise.resolve(null);
    const regionCode = window.currentRegion || 'KANTO';
    const key = regionCode + '_' + (inland ? 'inland_' : 'coastal_') + prefCode;
    if (window.prefWeatherJsonCache[key]) return Promise.resolve(window.prefWeatherJsonCache[key]);
    if (window.prefWeatherJsonPromises[key]) return window.prefWeatherJsonPromises[key];

    const fileName = inland ? prefCode + '_InLandwhether.json' : prefCode + '_whether.json';
    const url = '/data/' + fileName;

    window.prefWeatherJsonPromises[key] = fetch(url)
        .then(res => {
            if (!res.ok) throw new Error("Weather JSON fetch failed: " + res.status);
            return res.json();
        })
        .then(data => {
            if (!data || !data.spots || typeof data.spots !== 'object') {
                throw new Error("Weather JSON の spots が見つかりません: " + url);
            }
            window.prefWeatherJsonCache[key] = data;
            return data;
        })
        .catch(error => {
            delete window.prefWeatherJsonPromises[key];
            console.error("天気JSON取得エラー:", prefCode, inland ? '内陸' : '沿岸', error);
            return null;
        });
    return window.prefWeatherJsonPromises[key];
}

function applyPrefWeatherJson(prefCode, inland = false) {
    if (!prefCode) return Promise.resolve(0);
    const regionCode = window.currentRegion || 'KANTO';
    const applyKey = regionCode + '_' + (inland ? 'inland_' : 'coastal_') + prefCode;

    if (window.prefWeatherJsonApplied[applyKey]) return Promise.resolve(0);
    if (window.prefWeatherJsonApplyPromises[applyKey]) return window.prefWeatherJsonApplyPromises[applyKey];

    const rows = window.prefSpotData && window.prefSpotData[prefCode];
    if (!Array.isArray(rows)) return Promise.resolve(0);

    const applyPromise = loadPrefWeatherJson(prefCode, inland).then(data => {
        if (!data || !data.spots || typeof data.spots !== 'object') return 0;
        let applied = 0;
        for (const spot of rows) {
            if (inland) {
                const spotId = String(spot.individualId || spot.id || "");
                if (!spotId.startsWith("L")) continue;
            }
            const weather = data.spots[spot.name];
            if (!weather) continue;
            spot.whether = weather;
            applied++;
        }
        window.prefWeatherJsonApplied[applyKey] = true;
        return applied;
    });

    window.prefWeatherJsonApplyPromises[applyKey] = applyPromise.then(result => {
        delete window.prefWeatherJsonApplyPromises[applyKey];
        return result;
    }).catch(error => {
        delete window.prefWeatherJsonApplyPromises[applyKey];
        console.error("天気JSON付与エラー:", prefCode, inland ? '内陸' : '沿岸', error);
        return 0;
    });
    return window.prefWeatherJsonApplyPromises[applyKey];
}

function runPrefWeatherJson(prefCode, mode, inland) {
    if (!['select', 'other', 'all'].includes(mode) || (mode !== 'all' && !prefCode)) {
        return Promise.reject(new Error("天気JSONの mode は select / other / all を指定してください"));
    }
    const regionCode = window.currentRegion || 'KANTO';
    const allKey = regionCode + '_' + (inland ? 'inland' : 'coastal');

    if (mode === 'all') {
        if (window.regionWeatherAllDone[allKey]) return Promise.resolve(window.regionWeatherAllResults[allKey] || 0);
        if (window.regionWeatherAllPromises[allKey]) return window.regionWeatherAllPromises[allKey];
    }

    const runPromise = (async () => {
        const csvData = await loadRegionCsvData();
        const prefList = [...new Set((csvData && csvData.prefRows || []).map(row => row.prefCode).filter(Boolean))];
        const targetList = mode === 'select'
            ? [prefCode]
            : mode === 'other'
                ? prefList.filter(code => code !== prefCode)
                : prefList;

        let totalApplied = 0;
        let allSucceeded = true;
        for (const code of targetList) {
            if (!Array.isArray(window.prefSpotData && window.prefSpotData[code])) {
                await fetchSinglePrefSpots(code);
            }
            totalApplied += await applyPrefWeatherJson(code, inland);
            const applyKey = regionCode + '_' + (inland ? 'inland_' : 'coastal_') + code;
            if (!window.prefWeatherJsonApplied[applyKey]) allSucceeded = false;
        }
        return { totalApplied, allSucceeded };
    })();

    if (mode !== 'all') return runPromise.then(result => result.totalApplied);

    const allPromise = runPromise.then(result => {
        if (!result.allSucceeded) {
            throw new Error("全県の天気JSON付与が完了していません。失敗した県は再試行できます: " + allKey);
        }
        window.regionWeatherAllDone[allKey] = true;
        window.regionWeatherAllResults[allKey] = result.totalApplied;
        return result.totalApplied;
    }).finally(() => {
        delete window.regionWeatherAllPromises[allKey];
    });
    window.regionWeatherAllPromises[allKey] = allPromise;
    return allPromise;
}

function AddWeather(prefCode, mode = 'select') {
    return runPrefWeatherJson(prefCode, mode, false);
}

function AddInLandWeather(prefCode, mode = 'select') {
    return runPrefWeatherJson(prefCode, mode, true);
}

// ==========================================
// 4-b. 天気・魚種の付与（マーカー表示の裏で実行）
// 付与先は window.prefSpotData[県] の行。window.spotData は同じ行オブジェクトを共有しているため、
// ここで付与しておけば既存の後続処理（loadPrefectureData など）からもそのまま見える。
// 既存処理との重複はそのまま残す（通信は各ローダーのキャッシュで共有される）。
// ==========================================

// 県別天気CSVを取得して、その県の行へ付与（内陸は別）
async function applyPrefWeather(prefCode) {
    const rows = window.prefSpotData && window.prefSpotData[prefCode];
    if (!Array.isArray(rows)) return;
    const csv = await loadWhetherCSV(`/data/${prefCode}_whether.csv`).catch(() => null);
    if (csv) applyWhetherToSpots(csv, rows);
}

// 1県ぶんの天気＋魚種を並列で付与
function applyPrefWeatherAndFish(prefCode, regionCode) {
    const fishUrl = `/${regionCode}/${prefCode}_fish.json`;
    return Promise.all([
        applyPrefWeather(prefCode),
        typeof loadFishDataForPref === 'function'
            ? loadFishDataForPref(prefCode, fishUrl)
            : Promise.resolve(null)
    ]);
}

// 対象県 → （マーカー完了後）内陸CSVを1回だけ取得 → 他県を1県ずつ順番に
async function runPrefBackgroundLoads(prefCode, markersPromise, gen, selectedPromise) {
    const regionCode = window.currentRegion || 'KANTO';
    const isStale = () => window._prefBgGen !== gen;   // 新しい pref_management が走ったら中断
    const yieldFrame = () => (typeof window._yieldFrame === 'function' ? window._yieldFrame() : Promise.resolve());

    // 1. 対象県：天気＋魚種（通信はマーカー描画と並行）
    await (selectedPromise || applyPrefWeatherAndFish(prefCode, regionCode));
    if (isStale()) return;

    // 2. 内陸CSV：一括解析なので、マーカー描画が済んでから1回だけ取得
    await markersPromise;
    const inlandCsv = typeof loadInlandWhetherCSV === 'function'
        ? await loadInlandWhetherCSV(regionCode).catch(() => null)
        : null;
    const applyInland = code => {
        const rows = window.prefSpotData && window.prefSpotData[code];
        if (inlandCsv && Array.isArray(rows)) applyInlandWhetherToSpots(inlandCsv, rows);
    };
    applyInland(prefCode);
    if (isStale()) return;

    // 3. 他県：1県ずつ順番に（県ごとに「県CSV → 内陸（取得済みデータ）」の順で、従来と同じ上書き順）
    const csvData = await loadRegionCsvData();
    const otherCodes = (csvData.prefRows || [])
        .map(p => p.prefCode)
        .filter((code, i, arr) => code && code !== prefCode && arr.indexOf(code) === i);

    for (const code of otherCodes) {
        if (isStale()) return;
        await yieldFrame();
        await applyPrefWeatherAndFish(code, regionCode);
        applyInland(code);
    }

    // 中断されずに全県ぶん終えたら完了フラグを立てる
    if (!isStale()) window._prefBgDone = true;
}
