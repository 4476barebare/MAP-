// ==========================================
// prefLoader.js : PREF 画面のロード管理（regionLoader.js の構造に倣う）
//
// 方針
//  1. 最優先：REGION CSV（キャッシュ再利用）→ 選択県の location.json（取得済みなら再利用）
//             → zoom / lat / lng を location.json から確定 → drawLocation()
//  2. 描画と並行：他県の location.json を「未取得のものだけ」低優先度で並列取得。
//             取得結果は window.prefSpotData へ入れず保留し、描画が落ち着くまで集約しない。
//  3. 描画後：保留データを県ごとに格納 → 全県集約を1回だけ実行（fetchAllRegionSpots）。
//  4. 全県データ確定後：全県スポットマーカー表示 ＋ その裏で天気・魚種の付与を開始。
//     呼び出し元（routeUpdate / selectPrefecture）の既存の後続処理には手を入れない。
//
// 通信の並列化と、メインスレッドの重い処理（集約・再構築）の並列化は分けて扱う。
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

    // 集約・格納を保留するゲート（描画が落ち着いたら開く）。呼び出しごとに新規作成。
    let openGate;
    const gate = new Promise(resolve => { openGate = resolve; });
    const gateSafetyTimer = setTimeout(() => openGate(), 6000); // 万一の詰まり防止

    const mapExistedBefore = !!window.map;

    try {
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

        // ---------- 3. 地図移動の完了後に全県データを集約 ----------
        await drawPromise;
        if (mapExistedBefore && !window.isInitialMapLoad) {
            await waitMapSettled();
        }
        openGate();

        await otherPromise;
        await loadPrefectureSpots(prefCode, 'all');

        const finalParent = getPrefParentRow(prefCode);
        if (finalParent) window.prefData = finalParent;

        // ---------- 4. 全県マーカー表示。天気・魚種の取得は既に並行開始済み ----------
        const markersPromise = showPrefMarkers().catch(err => {
            console.error('マーカー表示エラー:', err);
        });
        if (window._prefBgDone) {
            window._prefBackgroundLoad = Promise.resolve();
        } else {
            window._prefBackgroundLoad = runPrefBackgroundLoads(prefCode, markersPromise, bgGen, selectedBgPromise)
                .catch(err => console.error('天気・魚種の付与エラー:', err));
        }

        await markersPromise;

        return !!window.prefData;
    } finally {
        clearTimeout(gateSafetyTimer);
        openGate();
    }
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
