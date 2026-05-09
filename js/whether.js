// ================================
// ■ 第一段階：適用エントリ（完全修正版）
// ================================

function applyFirstStage(spots, stations) {

    showDebug("=== FirstStage START ===", true);

    if (!Array.isArray(spots) || !Array.isArray(stations)) {
        showDebug("⚠ 入力不正");
        return spots;
    }

    const stationMap = buildStationMap(stations);
    showDebug("stationMap作成: " + Object.keys(stationMap).length + "件");

    let count = 0;

    for (let i = 0; i < spots.length; i++) {

        const spot = spots[i];

        // ■ フィルタ
        if (spot.icon !== "spot") continue;
        if (!spot.lat || !spot.lng) continue;

        const note = spot.notes || "";
        const parts = note.split("/");

        if (parts[0] !== "First") continue;

        count++;

        const code1 = parts[1] || "";
        const code2 = parts[2] || "";

        showDebug(`[${i}] First検出: ${code1}${code2 ? " & " + code2 : ""}`);

        const s1 = stationMap[code1];
        if (!s1) {
            showDebug(`⚠ station未検出: ${code1}`);
            continue;
        }

        const w1 = normalizeStationToWeather(s1);

        // =========================
        // ■ 単一（ここが修正ポイント）
        // =========================
        if (!code2) {

            // ★統一構造にする（重要）
            spot.whether = stripStationMeta(structuredClone(w1));

            showDebug(`→ 単一適用: ${code1}`);
            continue;
        }

        const s2 = stationMap[code2];
        if (!s2) {
            showDebug(`⚠ station未検出: ${code2}`);
            continue;
        }

        const w2 = normalizeStationToWeather(s2);

        const d1 = calcGeoDistance(spot.lat, spot.lng, w1.lat, w1.lng);
        const d2 = calcGeoDistance(spot.lat, spot.lng, w2.lat, w2.lng);

        showDebug(`距離: ${code1}=${d1.toFixed(2)}km / ${code2}=${d2.toFixed(2)}km`);

        // ★補間も統一構造
        spot.whether = stripStationMeta(
            interpolateStation(w1, w2, d1, d2)
        );

        showDebug("→ 補間適用完了");
    }

    showDebug(`=== FirstStage 完了: ${count}件処理 ===`);

    return spots;
}

// ================================
// ■ stationCode → Map化
// ================================
function buildStationMap(stations) {
    const map = {};
    stations.forEach(s => {
        map[s.stationCode] = s;
    });
    return map;
}


// ================================
// ■ station → weather変換
// ================================
function normalizeStationToWeather(st) {

    if (!st || !st.latlng) return null;

    return {
        stationCode: st.stationCode || "",

        lat: Number(st.latlng.split(";")[0]),
        lng: Number(st.latlng.split(";")[1]),

        hourly: [st.hourly0, st.hourly1, st.hourly2].map(h => {

            if (!h) return { weather: [], water: 0, tide: [] };

            return {
                weather: (h.weather || []).map(w => w.split("|").map(Number)),
                water: Number(h.water || 0),
                tide: (h.tide || []).map(Number)
            };
        }),

        daily: (st.daily || "")
            .split(";")
            .filter(Boolean)
            .map(str => {

                const parts = str.split("|");

                return {
                    weather: parts.slice(0, 3).map(Number),
                    tide: parts.slice(3).join("|").split(",").map(Number)
                };
            })
    };
}


// ================================
// ■ メタ削除（統一用）
// ================================
function stripStationMeta(st) {

    if (!st) return null;

    return {
        hourly: st.hourly,
        daily: st.daily
    };
}


// ================================
// ■ 補間処理（共通コア）
// ================================
function interpolateStation(s1, s2, d1, d2) {

    if (d1 === 0) return structuredClone(s1);
    if (d2 === 0) return structuredClone(s2);

    const w1 = 1 / d1;
    const w2 = 1 / d2;

    const lerp = (v1, v2) => (v1 * w1 + v2 * w2) / (w1 + w2);

    return {
        stationCode: "interpolated",

        lat: lerp(s1.lat, s2.lat),
        lng: lerp(s1.lng, s2.lng),

        hourly: s1.hourly.map((h1, i) => {
            const h2 = s2.hourly[i];

            return {
                weather: h1.weather.map((row, j) =>
                    row.map((v, k) => {

                        // 風向きだけ円環
                        if (k === 5) {
                            return lerpWind(v, h2.weather[j][k]);
                        }

                        return lerp(v, h2.weather[j][k]);
                    })
                ),

                water: lerp(h1.water, h2.water),
                tide: h1.tide.map((t, j) => lerp(t, h2.tide[j]))
            };
        }),

        daily: s1.daily.map((d1_, i) => {
            const d2_ = s2.daily[i];

            return {
                weather: d1_.weather.map((v, j) => lerp(v, d2_.weather[j])),
                tide: d1_.tide.map((t, j) => lerp(t, d2_.tide[j]))
            };
        })
    };
}


// ================================
// ■ 風向き補間（円環）
// ================================
function lerpWind(a, b) {

    const radA = a * Math.PI / 180;
    const radB = b * Math.PI / 180;

    const x = Math.cos(radA) + Math.cos(radB);
    const y = Math.sin(radA) + Math.sin(radB);

    let deg = Math.atan2(y, x) * 180 / Math.PI;

    if (deg < 0) deg += 360;

    return deg;
}
// ================================
// ■ stationCode → Map化
// ================================
function buildStationMap(stations) {
    const map = {};
    stations.forEach(s => {
        map[s.stationCode] = s;
    });
    return map;
}

function normalizeStationToWeather(st) {

    if (!st || !st.latlng) return null;

    return {
        stationCode: st.stationCode || "",

        lat: Number(st.latlng.split(";")[0]),
        lng: Number(st.latlng.split(";")[1]),

        hourly: [st.hourly0, st.hourly1, st.hourly2].map(h => ({
            weather: (h.weather || []).map(w => w.split("|").map(Number)),
            water: Number(h.water || 0),
            tide: (h.tide || []).map(Number)
        })),

        daily: (st.daily || "").split(";").filter(Boolean).map(str => {
            const parts = str.split("|");

            return {
                weather: parts.slice(0, 3).map(Number),
                tide: parts.slice(3).join("|").split(",").map(Number)
            };
        })
    };
}
// ================================
// ■ 補間処理
// ================================
function interpolateStation(s1, s2, d1, d2) {

    if (d1 === 0) return structuredClone(s1);
    if (d2 === 0) return structuredClone(s2);

    const w1 = 1 / d1;
    const w2 = 1 / d2;

    const lerp = (v1, v2) => (v1 * w1 + v2 * w2) / (w1 + w2);

    return {
        stationCode: "interpolated",

        lat: lerp(s1.lat, s2.lat),
        lng: lerp(s1.lng, s2.lng),

        hourly: s1.hourly.map((h1, i) => {
            const h2 = s2.hourly[i];

            return {
                weather: h1.weather.map((row, j) =>
                    row.map((v, k) => {

                        // ★ 風向きだけ円環
                        if (k === 5) {
                            return lerpWind(v, h2.weather[j][k]);
                        }

                        return lerp(v, h2.weather[j][k]);
                    })
                ),

                water: lerp(h1.water, h2.water),
                tide: h1.tide.map((t, j) => lerp(t, h2.tide[j]))
            };
        }),

        daily: s1.daily.map((d1_, i) => {
            const d2_ = s2.daily[i];

            return {
                weather: d1_.weather.map((v, j) => lerp(v, d2_.weather[j])),
                tide: d1_.tide.map((t, j) => lerp(t, d2_.tide[j]))
            };
        })
    };
}

function lerpWind(a, b) {

    const radA = a * Math.PI / 180;
    const radB = b * Math.PI / 180;

    const x = Math.cos(radA) + Math.cos(radB);
    const y = Math.sin(radA) + Math.sin(radB);

    let deg = Math.atan2(y, x) * 180 / Math.PI;

    if (deg < 0) deg += 360;

    return deg;
}
// ================================
// ■ データ取得
// ================================
function loadAreaData(area) {

    showDebug("データ取得開始");

    if (!area) {
        showDebug("❌ area未指定");
        return Promise.resolve([]);
    }

    const url = `/data/${area}_load.json`;

    return fetch(url)
        .then(res => {
            showDebug("fetch status: " + res.status);
            return res.json(); // ★text完全廃止
        })
        .then(json => {

            if (!json || !Array.isArray(json.data)) {
                showDebug("❌ dataなし");
                return [];
            }

            showDebug("取得成功: " + json.data.length + "件");

            return json.data; // ★ここはrawのまま渡す

        })
        .catch(e => {
            showDebug("🔥 fetchエラー: " + e.message);
            return [];
        });
}
// ================================
// ■ 正規化
// ================================
function normalizeStation(st) {

    const [lat, lng] = st.latlng.split(";").map(Number);

    return {
        stationCode: st.stationCode,
        date: st.date,
        lat,
        lng,

        hourly: [0, 1, 2].map(i => normalizeHourly(st[`hourly${i}`])),
        daily: st.daily.split(";").map(normalizeDaily)
    };
}
// ================================
function normalizeHourly(h) {
    return {
        weather: h.weather.map(w => w.split("|").map(Number)),
        water: Number(h.water),
        tide: h.tide.map(Number)
    };
}
// ================================
function normalizeDaily(str) {

    const parts = str.split("|");

    const weather = parts.slice(0, 3).map(Number);
    const tide = parts.slice(3).join("|").split(",").map(Number);

    return { weather, tide };
}
// ================================
// ■ 距離計算（名前変更済み）
// ================================
function calcGeoDistance(lat1, lng1, lat2, lng2) {

    const R = 6371;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// ================================
// ■ グローバル公開
// ================================
window.applyFirstStage = applyFirstStage;
window.loadAreaData = loadAreaData;



function applySecondStage(spots) {

    showDebug("=== SecondStage START ===", true);

    if (!Array.isArray(spots)) {
        showDebug("⚠ spots不正");
        return spots;
    }

    const usableSpots = spots.filter(s =>
        s.icon === "spot" &&
        s.whether &&
        s.lat != null &&
        s.lng != null
    );

    showDebug(
        "spot総数=" + spots.length +
        " usable=" + usableSpots.length
    );

    const spotMap = buildSpotMapByName(spots);

    let count = 0;

    for (let i = 0; i < spots.length; i++) {

        const spot = spots[i];
        const note = spot.notes || "";

        if (!note.startsWith("Second")) continue;

        count++;

        const parts = note.split("/");
        const code1 = parts[1] || "";
        const code2 = parts[2] || "";

        // =====================
        // ■ Second//（近傍）
        // =====================
        if (!code1 && !code2) {

            const nearest = findNearestTwoSpots(spot, usableSpots);
            if (!nearest) continue;

            const wA = nearest[0].whether;
            const wB = nearest[1].whether;

            spot.whether = interpolateStation(
                wA.hourly,
                wB.hourly,
                calcGeoDistance(spot.lat, spot.lng, nearest[0].lat, nearest[0].lng),
                calcGeoDistance(spot.lat, spot.lng, nearest[1].lat, nearest[1].lng)
            );

            continue;
        }

        // =====================
        // ■ Second/A/B
        // =====================
        const s1 = spotMap[code1];
        const s2 = spotMap[code2];

        if (!s1 || !s2) continue;
        if (!s1.whether || !s2.whether) continue;

        spot.whether = interpolateStation(
            s1.whether.hourly,
            s2.whether.hourly,
            calcGeoDistance(spot.lat, spot.lng, s1.lat, s1.lng),
            calcGeoDistance(spot.lat, spot.lng, s2.lat, s2.lng)
        );
    }

    showDebug(`=== SecondStage 完了: ${count}件 ===`);

    return spots;
}


function buildSpotMapByName(spots) {

    const map = {};

    spots.forEach(s => {
        if (s.name) {
            map[s.name] = s;
        }
    });

    return map;
}

function findNearestTwoSpots(target, list) {

    const sorted = list
        .filter(s => s !== target)
        .map(s => ({
            spot: s,
            dist: calcGeoDistance(
                target.lat,
                target.lng,
                s.lat,
                s.lng
            )
        }))
        .sort((a, b) => a.dist - b.dist);

    if (sorted.length < 2) return null;

    return [sorted[0].spot, sorted[1].spot];
}

function applyThirdStage(spots) {

    showDebug("=== ThirdStage START ===", true);

    if (!Array.isArray(spots)) {
        showDebug("⚠ spots不正");
        return spots;
    }

    const baseSpots = spots.filter(s =>
        s.icon === "spot" &&
        s.whether &&
        s.lat != null &&
        s.lng != null
    );

    let count = 0;

    for (let i = 0; i < spots.length; i++) {

        const spot = spots[i];

        if (spot.icon !== "spot") continue;
        if (spot.whether) continue;

        count++;

        const nearest = findNearestTwoSpots(spot, baseSpots);
        if (!nearest) continue;

        const wA = nearest[0].whether;
        const wB = nearest[1].whether;

        spot.whether = interpolateStation(
            wA.hourly,
            wB.hourly,
            calcGeoDistance(spot.lat, spot.lng, nearest[0].lat, nearest[0].lng),
            calcGeoDistance(spot.lat, spot.lng, nearest[1].lat, nearest[1].lng)
        );
    }

    showDebug(`=== ThirdStage 完了: ${count}件 ===`);

    return spots;
}


function downloadSpotCSV(spots) {

    let csv = "name,icon,whether\n";

    for (const s of spots) {

        const w = s.whether;

        csv += [
            s.name || "",
            s.icon || "",
            w ? JSON.stringify(w) : ""
        ].join(",") + "\n";
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "spot_weather_dump.csv";

    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}