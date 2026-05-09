// ================================
// ■ 第一段階：適用エントリ（完全修正版）
// ================================

function applyFirstStage(spots, stations) {

    if (!Array.isArray(spots) || !Array.isArray(stations)) {
        return spots;
    }

    const stationMap = buildStationMap(stations);

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

        const s1 = stationMap[code1];
        if (!s1) continue;

        const w1 = normalizeStationToWeather(s1);

        // =========================
        // ■ 単一
        // =========================
        if (!code2) {

            spot.whether = stripStationMeta(structuredClone(w1));
            continue;
        }

        const s2 = stationMap[code2];
        if (!s2) continue;

        const w2 = normalizeStationToWeather(s2);

        const d1 = calcGeoDistance(spot.lat, spot.lng, w1.lat, w1.lng);
        const d2 = calcGeoDistance(spot.lat, spot.lng, w2.lat, w2.lng);

        // ★補間
        spot.whether = stripStationMeta(
            interpolateStation(w1, w2, d1, d2)
        );
    }

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
// ■ メタ削除
// ================================
function stripStationMeta(st) {

    if (!st) return null;

    return {
        hourly: st.hourly,
        daily: st.daily
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
// ■ 風向き補間
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
// ■ データ取得
// ================================
function loadAreaData(area) {

    if (!area) {
        return Promise.resolve([]);
    }

    const url = `/data/${area}_load.json`;

    return fetch(url)
        .then(res => res.json())
        .then(json => {

            if (!json || !Array.isArray(json.data)) {
                return [];
            }

            return json.data;
        })
        .catch(() => []);
}


// ================================
// ■ 正規化（未使用でも維持）
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

function normalizeHourly(h) {
    return {
        weather: h.weather.map(w => w.split("|").map(Number)),
        water: Number(h.water),
        tide: h.tide.map(Number)
    };
}

function normalizeDaily(str) {

    const parts = str.split("|");

    const weather = parts.slice(0, 3).map(Number);
    const tide = parts.slice(3).join("|").split(",").map(Number);

    return { weather, tide };
}


// ================================
// ■ 距離計算
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