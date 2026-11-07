// ==========================================
// prefLoader.js : PREF 画面のロード管理（regionLoader.js の構造に倣う）
//
// 方針
//  1. 最優先：REGION CSV（キャッシュ再利用）→ 選択県の location.json（取得済みなら再利用）
//             → zoom / lat / lng を location.json から確定 → drawLocation()
//  2. 描画と並行：他県の location.json を「未取得のものだけ」低優先度で並列取得。
//             取得結果は window.prefSpotData へ入れず保留し、描画が落ち着くまで集約しない。
//  3. 描画後：保留データを県ごとに格納 → rebuildAllSpotData() を1回だけ実行 → 呼び出し元の後続処理へ。
//
// 通信の並列化と、メインスレッドの重い処理（集約・再構築）の並列化は分けて扱う。
//
// 依存（regionLoader.js・変更なし）:
//   loadRegionCSV / loadRegionCsvData / fetchSinglePrefSpots / rebuildAllSpotData
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

// 軽い格納のみ（タグ付け＋県別マップへの登録）。全県集約（rebuildAllSpotData）はここでは行わない。
function commitPrefRows(prefCode, data) {
    data.forEach(s => { s._prefCode = prefCode; });
    window.prefSpotData[prefCode] = data;
    window._loadedPrefSet.add(prefCode);
}

// ==========================================
// 他県の location.json を取得（未取得のものだけ・低優先度）
// - 取得済み        : null を返す（何もしない）
// - 他で取得中      : その Promise を共有（二重リクエストしない）
// - 未取得          : fetch → 保留 → ゲートが開いたら格納
// 共有 Promise は window.prefSpotPromises に登録するので、
// fetchSinglePrefSpots / fetchAllRegionSpots からも同じ Promise が使われる。
// ==========================================
function startOtherPrefFetch(prefCode, gate) {
    if (!prefCode) return null;
    if (Array.isArray(window.prefSpotData[prefCode])) return null;
    if (window.prefSpotPromises[prefCode]) return window.prefSpotPromises[prefCode];

    const regionCode = window.currentRegion || 'KANTO';
    const url = `/${regionCode}/${prefCode}_location.json`;

    const promise = fetch(url, { priority: 'low' })
        .then(res => {
            if (!res.ok) throw new Error('location.json fetch failed: ' + res.status);
            return res.json();
        })
        .then(async data => {
            if (!Array.isArray(data)) throw new Error('location.json形式エラー: ' + prefCode);
            await gate;                       // 描画が落ち着くまで保持（通信は完了済み）
            commitPrefRows(prefCode, data);   // 軽い格納のみ
            return data;
        })
        .catch(error => {
            delete window.prefSpotPromises[prefCode];
            console.error('他県JSON取得エラー:', prefCode, error);
            return [];
        });

    window.prefSpotPromises[prefCode] = promise;
    return promise;
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

        await fetchSinglePrefSpots(prefCode);              // 取得済みなら再利用
        const parent = getPrefParentRow(prefCode);
        const target = toDrawTarget(parent, prefCode);     // zoom は必ず location.json から
        if (!target) {
            console.error('pref_management: location.json から drawLocation 用データを確定できません:', prefCode);
            return false;
        }
        window.prefData = parent;

        // ---------- 2. 描画と並行：他県データ取得 ----------
        // drawLocation を先に起動（同期区間でタイル要求が発行される）→ その後に他県の通信を開始
        const drawPromise = drawLocation(target.name, target.lat, target.lng, target.zoom);

        const csvData = await loadRegionCsvData();         // キャッシュ済み
        const otherCodes = (csvData.prefRows || [])
            .map(p => p.prefCode)
            .filter((code, i, arr) => code && code !== prefCode && arr.indexOf(code) === i);
        const otherPromises = otherCodes
            .map(code => startOtherPrefFetch(code, gate))
            .filter(Boolean);

        // ---------- 3. 描画後：既存の後続処理へ接続 ----------
        await drawPromise;
        // 既存マップからの flyTo（非初期ロード）は drawLocation が完了を待たないので、移動完了を待つ
        if (mapExistedBefore && !window.isInitialMapLoad) {
            await waitMapSettled();
        }
        openGate();                                        // ここから格納を許可

        await Promise.all(otherPromises);                  // 取得中なら完了を待つ
        if (typeof rebuildAllSpotData === 'function') rebuildAllSpotData(); // 全県集約は1回だけ

        const finalParent = getPrefParentRow(prefCode);
        if (finalParent) window.prefData = finalParent;

        return !!window.prefData;
    } finally {
        clearTimeout(gateSafetyTimer);
        openGate();
    }
}
