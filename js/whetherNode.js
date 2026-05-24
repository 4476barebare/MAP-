// whetherNode.js

// ================================
// ■ 第一段階
// ================================
function applyFirstStage(spots, stations) {

    if (!Array.isArray(spots) || !Array.isArray(stations)) {
        return spots;
    }

    const stationMap = buildStationMap(stations);

    for (let i = 0; i < spots.length; i++) {

        const spot = spots[i];

        if (spot.icon !== "spot") continue;
        if (!spot.lat || !spot.lng) continue;

        const note = spot.notes || "";
        const parts = note.split("/");

        if (parts[0] !== "First") continue;

        const code1 = parts[1] || "";
        const code2 = parts[2] || "";

        const s1 = stationMap[code1];
        if (!s1) continue;

        const w1 = normalizeStationToWeather(s1);

        if (!code2) {
            spot.whether = stripStationMeta(structuredClone(w1));
            continue;
        }

        const s2 = stationMap[code2];
        if (!s2) continue;

        const w2 = normalizeStationToWeather(s2);

        const d1 = calcGeoDistance(spot.lat, spot.lng, w1.lat, w1.lng);
        const d2 = calcGeoDistance(spot.lat, spot.lng, w2.lat, w2.lng);

        spot.whether = stripStationMeta(
            interpolateStation(w1, w2, d1, d2)
        );
    }

    return spots;
}

// ================================
// ■ 第二段階
// ================================
function applySecondStage(spots) {

    if (!Array.isArray(spots)) return spots;

    const usableSpots = spots.filter(s =>
        s.icon === "spot" &&
        s.whether &&
        s.lat != null &&
        s.lng != null
    );

    const spotMap = buildSpotMapByName(spots);

    for (let i = 0; i < spots.length; i++) {

        const spot = spots[i];
        const note = spot.notes || "";

        if (!note.startsWith("Second")) continue;

        const parts = note.split("/");
        const code1 = parts[1] || "";
        const code2 = parts[2] || "";

        if (!code1 && !code2) {

            const nearest = findNearestTwoSpots(spot, usableSpots);
            if (!nearest) continue;

            const r = interpolateStation(
                nearest[0].whether,
                nearest[1].whether,
                calcGeoDistance(spot.lat, spot.lng, nearest[0].lat, nearest[0].lng),
                calcGeoDistance(spot.lat, spot.lng, nearest[1].lat, nearest[1].lng)
            );

            spot.whether = sanitizeWeather(r);
            continue;
        }

        const s1 = spotMap[code1];
        const s2 = spotMap[code2];

        if (!s1 || !s2) continue;
        if (!s1.whether || !s2.whether) continue;

        const r = interpolateStation(
            s1.whether,
            s2.whether,
            calcGeoDistance(spot.lat, spot.lng, s1.lat, s1.lng),
            calcGeoDistance(spot.lat, spot.lng, s2.lat, s2.lng)
        );

        spot.whether = sanitizeWeather(r);
    }

    return spots;
}

// ================================
// ■ 第三段階
// ================================
function applyThirdStage(spots) {

    if (!Array.isArray(spots)) return spots;

    const baseSpots = spots.filter(s =>
        s.icon === "spot" &&
        s.whether &&
        s.lat != null &&
        s.lng != null
    );

    for (let i = 0; i < spots.length; i++) {

        const spot = spots[i];

        if (spot.icon !== "spot") continue;
        if (spot.whether) continue;

        const nearest = findNearestTwoSpots(spot, baseSpots);
        if (!nearest) continue;

        const r = interpolateStation(
            nearest[0].whether,
            nearest[1].whether,
            calcGeoDistance(spot.lat, spot.lng, nearest[0].lat, nearest[0].lng),
            calcGeoDistance(spot.lat, spot.lng, nearest[1].lat, nearest[1].lng)
        );

        spot.whether = sanitizeWeather(r);
    }

    return spots;
}

// ================================
// ■ ユーティリティ
// ================================
function sanitizeWeather(r) {

    if (!r || !r.hourly || !r.daily) return null;

    return {
        hourly: r.hourly.map(h => ({

            weather: h.weather.map(row =>
                row.map(v => Number.isFinite(v) ? v : 0)
            ),

oneday: {
    avg: Number(h.oneday?.avg) || 0,
    sunrise: toMinutes(h.oneday?.sunrise),
    sunset: toMinutes(h.oneday?.sunset)
},

            tide: h.tide.map(v => Number.isFinite(v) ? v : 0)
        })),

        daily: r.daily.map(d => ({
    weather: d.weather.map(v => Number.isFinite(v) ? v : 0),

    tide: d.tide.map(v => Number.isFinite(v) ? v : 0),

dailyEx: {
    avg: Number(d.dailyEx?.avg) || 0,
    wave: Number(d.dailyEx?.wave) || 0,

    sunrise: toMinutes(d.dailyEx?.sunrise),
    sunset: toMinutes(d.dailyEx?.sunset)
}

}))

    };
}

function toMinutes(v) {

    if (v == null || v === "") return 0;

    // すでに数値（minutes想定）
    if (typeof v === "number") return v;

    // 数値文字列
    if (!isNaN(v)) return Number(v);

    // ★ JST前提 → 文字列は直接パース

    if (typeof v === "string" && v.includes(":")) {

        const [h, m] = v.split(":").map(Number);

        return h * 60 + m;

    }

    return 0;
}

function stripStationMeta(st) {
    if (!st) return null;
    return { hourly: st.hourly, daily: st.daily };
}

function buildStationMap(stations) {
    const map = {};
    stations.forEach(s => map[s.stationCode] = s);
    return map;
}

function buildSpotMapByName(spots) {
    const map = {};
    spots.forEach(s => { if (s.name) map[s.name] = s; });
    return map;
}

function findNearestTwoSpots(target, list) {
    const sorted = list
        .filter(s => s !== target)
        .map(s => ({
            spot: s,
            dist: calcGeoDistance(target.lat, target.lng, s.lat, s.lng)
        }))
        .sort((a, b) => a.dist - b.dist);

    if (sorted.length < 2) return null;
    return [sorted[0].spot, sorted[1].spot];
}

function normalizeStationToWeather(st) {

    if (!st || !st.latlng) return null;

    return {
        stationCode: st.stationCode || "",
        lat: Number(st.latlng.split(";")[0]),
        lng: Number(st.latlng.split(";")[1]),

        hourly: [st.hourly0, st.hourly1, st.hourly2].map(h => {

const raw = h.oneday ?? h.water ?? "";
const waterParts = String(raw).split("|");

return {
    weather: (h.weather || []).map(w =>
        w.split("|").map(Number)
    ),

    oneday: {
        avg: Number(waterParts[0] || 0),
        sunrise: toMinutes(waterParts[1]),
        sunset: toMinutes(waterParts[2])
    },
    tide: (h.tide || []).map(Number),
};

        }),

daily: (st.daily || "")
    .split(";")
    .filter(Boolean)
    .map(str => {

        const p = str.split("|");

        return {
            weather: [
                Number(p[0] || 0),
                Number(p[1] || 0)
            ],

            tide: (p[6] || "")
                .split(",")
                .map(v => Number(v || 0)),

            dailyEx: {
                avg: Number(p[2] || 0),
                wave: Number(p[3] || 0),

                // ★ここで数値化
                sunrise: toMinutes(p[4]),
                sunset: toMinutes(p[5])
            }
        };
    })
    
    };
}

function interpolateStation(s1, s2, d1, d2) {

    if (d1 === 0) return structuredClone(s1);
    if (d2 === 0) return structuredClone(s2);

    const w1 = 1 / d1;
    const w2 = 1 / d2;

    const lerp = (a, b) => {
        const x = (a ?? 0);
        const y = (b ?? 0);
        return (x * w1 + y * w2) / (w1 + w2);
    };

    return {
        stationCode: "interpolated",
        lat: lerp(s1.lat, s2.lat),
        lng: lerp(s1.lng, s2.lng),

        hourly: s1.hourly.map((h1, i) => {

            const h2 = s2.hourly[i];

            return {
                weather: h1.weather.map((row, j) =>
                    row.map((v, k) => {
                        const v2 = h2.weather[j][k];

                        // 風向だけ円形補間
                        if (k === 5) {
                            return lerpWind(v, v2);
                        }

                        return lerp(v, v2);
                    })
                ),

oneday: {
    avg: lerp(h1.oneday?.avg, h2.oneday?.avg),
    sunrise: lerp(h1.oneday?.sunrise, h2.oneday?.sunrise),
    sunset: lerp(h1.oneday?.sunset, h2.oneday?.sunset)
},

                tide: h1.tide.map((t, j) =>
                    lerp(t, h2.tide[j])
                )
            };
        }),

        
        daily: s1.daily.map((d1_, i) => {

    const d2_ = s2.daily[i];

    return {
        weather: d1_.weather.map((v, j) =>
            lerp(v, d2_.weather[j])
        ),

        tide: d1_.tide.map((t, j) =>
            lerp(t, d2_.tide[j])
        ),

dailyEx: {
    avg: lerp(d1_.dailyEx?.avg, d2_.dailyEx?.avg),
    wave: lerp(d1_.dailyEx?.wave, d2_.dailyEx?.wave),

    sunrise: lerp(d1_.dailyEx?.sunrise, d2_.dailyEx?.sunrise),
    sunset: lerp(d1_.dailyEx?.sunset, d2_.dailyEx?.sunset)
}

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
// ■ 実行ラッパー
// ================================
function runWhether(spots, stations) {
    applyFirstStage(spots, stations);
    applySecondStage(spots);
    applyThirdStage(spots);
    return spots;
}

// ================================
// ■ export
// ================================
module.exports = {
    runWhether,
    applyFirstStage,
    applySecondStage,
    applyThirdStage
};