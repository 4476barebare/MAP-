// ================================
// ■ 第一段階：適用エントリ
// ================================
export function applyFirstStage(spots, stations) {

    showDebug("=== FirstStage START ===", true);

    const stationMap = buildStationMap(stations);
    showDebug("stationMap作成: " + Object.keys(stationMap).length + "件");

    let count = 0;

    spots.forEach((spot, idx) => {

        if (spot.icon !== "spot") return;

        const parts = (spot.notes || "").split("/");

        if (parts[0] !== "First") return;

        count++;

        const code1 = parts[1];
        const code2 = parts[2];

        showDebug(`[${idx}] First検出: ${code1}${code2 ? " & " + code2 : ""}`);

        const st1 = stationMap[code1];
        if (!st1) {
            showDebug(`⚠ station未検出: ${code1}`);
            return;
        }

        // =========================
        // ■ パターン①：そのまま
        // =========================
        if (!code2) {
            spot.whether = structuredClone(st1);
            showDebug(`→ 単一適用: ${code1}`);
            return;
        }

        // =========================
        // ■ パターン②：2点補間
        // =========================
        const st2 = stationMap[code2];
        if (!st2) {
            showDebug(`⚠ station未検出: ${code2}`);
            return;
        }

        const d1 = getDistance(spot.lat, spot.lng, st1.lat, st1.lng);
        const d2 = getDistance(spot.lat, spot.lng, st2.lat, st2.lng);

        showDebug(`距離: ${code1}=${d1.toFixed(2)}km / ${code2}=${d2.toFixed(2)}km`);

        spot.whether = interpolateStation(st1, st2, d1, d2);

        showDebug("→ 補間適用");
    });

    showDebug(`=== 完了: ${count}件処理 ===`);

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
// ■ ステーション補間（コア）
// ================================
function interpolateStation(s1, s2, d1, d2) {

    if (d1 === 0) {
        showDebug("距離0 → s1採用");
        return structuredClone(s1);
    }

    if (d2 === 0) {
        showDebug("距離0 → s2採用");
        return structuredClone(s2);
    }

    const w1 = 1 / d1;
    const w2 = 1 / d2;

    function lerp(v1, v2) {
        return (v1 * w1 + v2 * w2) / (w1 + w2);
    }

    return {
        stationCode: "interpolated",

        lat: lerp(s1.lat, s2.lat),
        lng: lerp(s1.lng, s2.lng),

        hourly: s1.hourly.map((h1, i) => {
            const h2 = s2.hourly[i];

            return {
                weather: h1.weather.map((row, j) =>
                    row.map((v, k) => lerp(v, h2.weather[j][k]))
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
// ■ 汎用データローダー
// ================================
function loadAreaData(area) {

    showDebug("データ取得開始: " + area, true);

    if (!area) {
        showDebug("❌ area未指定");
        return Promise.resolve([]);
    }

    const url = `/data/${area}_load.json`;

    return fetch(url)
        .then(res => {

            showDebug("fetch status: " + res.status);

            return res.text();
        })
        .then(text => {

            showDebug("raw取得OK");

            let json;

            try {
                json = JSON.parse(text);
            } catch (e) {
                showDebug("🔥 JSONパース失敗");
                return [];
            }

            if (json.status !== "ok") {
                showDebug("❌ データ取得失敗");
                return [];
            }

            showDebug("取得成功: " + json.data.length + "件");

            return json.data.map(normalizeStation);
        })
        .catch(e => {

            showDebug("🔥 fetchエラー: " + e.message);
            return [];
        });
}
// ================================
// ■ ステーション正規化
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
// ■ hourly整形
// ================================
function normalizeHourly(h) {
    return {
        weather: h.weather.map(w => w.split("|").map(Number)),
        water: Number(h.water),
        tide: h.tide.map(Number)
    };
}


// ================================
// ■ daily整形
// ================================
function normalizeDaily(str) {

    const parts = str.split("|");

    const weather = parts.slice(0, 3).map(Number);
    const tide = parts.slice(3).join("|").split(",").map(Number);

    return { weather, tide };
}


// ================================
// ■ 距離計算（Haversine）
// ================================
function getDistance(lat1, lng1, lat2, lng2) {
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