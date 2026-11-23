import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ==========================================
// 使い方:
//   node script/generate_ranking_and_index.js KANTO index2.html
//   node script/generate_ranking_and_index.js KANTO index.html
//
// 環境変数でも指定可能:
//   REGION_CODE=KANTO OUTPUT_HTML=index2.html TEMPLATE_PATH=template/index.txt node script/generate_ranking_and_index.js
// ==========================================
const REGION_CODE = (process.argv[2] || process.env.REGION_CODE || "KANTO").trim().toUpperCase();
const OUTPUT_HTML_NAME = (process.argv[3] || process.env.OUTPUT_HTML || "index2.html").trim();
const TEMPLATE_REL_PATH = (process.env.TEMPLATE_PATH || "template/index.txt").trim();

const REGION_NAME_MAP = {
    KANTO: "関東地方"
};
const PREF_NAME_FALLBACK_MAP = {
    CHIBA: "千葉県",
    KANAGAWA: "神奈川県",
    TOKYO: "東京都",
    IBARAKI: "茨城県栃木県",
    SAITAMA: "埼玉県",
    GUNMA: "群馬県"
};
const PREF_DISPLAY_ORDER = [
    "CHIBA",
    "KANAGAWA",
    "TOKYO",
    "IBARAKI",
    "SAITAMA",
    "GUNMA"
];

const REGION_NAME = REGION_NAME_MAP[REGION_CODE] || REGION_CODE;
const SHORT_REGION_NAME = REGION_NAME.replace("地方", "");
const SITE_URL = "https://turiiko-navi.com";
const SNS_CATCH_RADIUS_KM = 10;
const AREA_SPLIT_THRESHOLD = 15;

const REGION_DIR = path.join(ROOT, REGION_CODE);
const DATA_DIR = path.join(ROOT, "data");
const OUTPUT_DIR = path.join(ROOT, "ai-data");
const TEMPLATE_PATH = path.resolve(ROOT, TEMPLATE_REL_PATH);
const OUTPUT_HTML_PATH = path.resolve(ROOT, OUTPUT_HTML_NAME);
const RANKING_CACHE_PATH = path.join(OUTPUT_DIR, "ranking_cache.json");
const TOMORROW_MD_PATH = path.join(OUTPUT_DIR, `${REGION_CODE}_tomorrow.md`);
const CATCH_JSON_PATH = path.join(REGION_DIR, "integrated_catch.json");

// ==========================================
// 基本ユーティリティ
// ==========================================
function readJsonOptional(filePath, label) {
    if (!fs.existsSync(filePath)) {
        console.warn(`[WARN] ${label}が見つからないためスキップします: ${filePath}`);
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
        console.warn(`[WARN] ${label}の読み込みに失敗しました: ${filePath} (${err.message})`);
        return null;
    }
}

function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function sanitizeFileSegment(value) {
    return String(value ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "_");
}

function hasZoom(value) {
    return value !== undefined &&
        value !== null &&
        String(value).trim() !== "" &&
        Number.isFinite(Number(value));
}

function getJstParts(offsetDays = 0) {
    const now = new Date();
    const jstMs = now.getTime() + (now.getTimezoneOffset() + 540) * 60000 + offsetDays * 86400000;
    const d = new Date(jstMs);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return {
        year,
        month,
        day,
        iso,
        label: `${month}月${day}日`,
        utcMs: Date.UTC(year, month - 1, day)
    };
}

function calcDistanceKm(lat1, lng1, lat2, lng2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 決定論的ハッシュ（同点スポットの並び順を日替わりかつ同日再実行で安定させる）
function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// ==========================================
// 天気アイコン＆テキスト変換（regionLoader.js / dataLoader.js 同一ロジック）
// ==========================================
function toWeatherIcon(code) {
    if (code >= 70) return "☔️";
    if (code >= 60) return "☂️";
    if (code >= 30) return "☁️";
    if (code >= 10) return "⛅";
    if (code === 1) return "🌤";
    if (code === 2) return "⛅";
    return "☀️";
}

function toWeatherLabel(code) {
    if (code >= 70) return "強い雨";
    if (code >= 60) return "雨";
    if (code >= 30) return "曇り";
    if (code >= 10) return "晴れ時々曇り";
    if (code === 1) return "主に晴れ";
    if (code === 2) return "薄曇り";
    return "快晴";
}

function degToDirJa(deg) {
    if (deg == null || Number.isNaN(Number(deg))) return "";
    const d = ((Number(deg) % 360) + 360) % 360;
    const dirs = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
    return dirs[Math.round(d / 45) % 8];
}

function adjustWeatherCode(code, pop) {
    const p = Number(pop);
    if (code >= 60) {
        if (p >= 80) return 70;
        if (p >= 60) return 60;
        return 60;
    }
    if (p >= 70) return 30;
    if (p >= 50) return 10;
    return code;
}

function calcRepresentativeCode(rows) {
    const map = {};
    let maxCount = -1;
    let tied = [];

    for (const r of rows) {
        const code = Number(r?.[0]);
        const pop = Number(r?.[2]);
        if (!Number.isFinite(code)) continue;
        const adjusted = adjustWeatherCode(code, pop);
        map[adjusted] = (map[adjusted] || 0) + 1;
    }

    for (const k of Object.keys(map)) {
        const count = map[k];
        const code = Number(k);
        if (count > maxCount) {
            maxCount = count;
            tied = [code];
        } else if (count === maxCount) {
            tied.push(code);
        }
    }

    if (tied.length === 0) return null;
    return tied.length > 1
        ? Math.round(tied.reduce((a, b) => a + b, 0) / tied.length)
        : tied[0];
}

function calcRepresentativeIcon(rows) {
    const code = calcRepresentativeCode(rows);
    return code != null ? toWeatherIcon(code) : "";
}

// regionLoader.js の normalizeWeatherJsonByDate と同一の日付ズレ補正
function normalizeWeatherJsonByDate(data, todayUtcMs) {
    if (!data || !data.spots || typeof data.spots !== "object") return data;
    const jsonDateStr = String(data.date || "").trim();
    const m = jsonDateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!m) return data;

    const jsonUtcMs = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const diffDays = Math.floor((todayUtcMs - jsonUtcMs) / 86400000);
    if (diffDays <= 0) return data;

    for (const spotName of Object.keys(data.spots)) {
        const w = data.spots[spotName];
        if (!w || typeof w !== "object") continue;
        if (Array.isArray(w.hourly)) {
            const hourlyLen = w.hourly.length;
            if (diffDays < hourlyLen) {
                w.hourly = w.hourly.slice(diffDays);
            } else {
                const dailySkip = diffDays - hourlyLen;
                w.hourly = [];
                if (Array.isArray(w.daily) && dailySkip > 0) {
                    w.daily = w.daily.slice(dailySkip);
                }
            }
        }
    }
    return data;
}

// ==========================================
// 周辺10kmのSNS釣果抽出＆加点（index.html 同一ロジック）
// ==========================================
function parseCatchDateUtcMs(dateStr) {
    const parts = cleanText(dateStr).replace(/-/g, "/").split("/");
    if (parts.length < 3) return null;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return {
        utcMs: Date.UTC(y, m - 1, d),
        iso: `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    };
}

function getNearbySnsCatchRecords(spot, snsCatchData, todayUtcMs, radiusKm = SNS_CATCH_RADIUS_KM) {
    if (!spot || !Array.isArray(snsCatchData) || snsCatchData.length === 0) return [];
    const spotLat = Number(spot.lat);
    const spotLng = Number(spot.lng);
    if (!Number.isFinite(spotLat) || !Number.isFinite(spotLng)) return [];

    const uniquePosts = new Map();

    for (const record of snsCatchData) {
        if (!record) continue;
        const lat = Number(record.lat);
        const lng = Number(record.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const distance = calcDistanceKm(spotLat, spotLng, lat, lng);
        if (distance > radiusKm) continue;

        const parsedDate = parseCatchDateUtcMs(record.date);
        if (!parsedDate) continue;

        const ageDays = Math.max(0, Math.floor((todayUtcMs - parsedDate.utcMs) / 86400000));
        const url = cleanText(record.url);
        const fish = cleanText(record.fish);
        const areaName = cleanText(record.area_name);
        const source = cleanText(record.source) || "SNS";

        const key = url
            ? `url:${url}`
            : `record:${lat.toFixed(5)}_${lng.toFixed(5)}_${parsedDate.iso}_${fish}`;

        const existing = uniquePosts.get(key);
        if (!existing) {
            uniquePosts.set(key, {
                dateIso: parsedDate.iso,
                ageDays,
                distanceKm: distance,
                areaName,
                source,
                url,
                fishSet: new Set(fish ? [fish] : [])
            });
        } else {
            if (fish) existing.fishSet.add(fish);
            if (distance < existing.distanceKm) {
                existing.distanceKm = distance;
                if (areaName) existing.areaName = areaName;
            }
            if (ageDays < existing.ageDays) {
                existing.ageDays = ageDays;
                existing.dateIso = parsedDate.iso;
            }
        }
    }

    return [...uniquePosts.values()]
        .map(p => ({
            dateIso: p.dateIso,
            ageDays: p.ageDays,
            distanceKm: p.distanceKm,
            areaName: p.areaName,
            source: p.source,
            url: p.url,
            fishes: [...p.fishSet].sort((a, b) => a.localeCompare(b, "ja"))
        }))
        .sort((a, b) => (a.ageDays !== b.ageDays ? a.ageDays - b.ageDays : a.distanceKm - b.distanceKm));
}

function getSnsCatchBonus(posts) {
    if (!posts || posts.length === 0) return 0;
    const days = posts[0].ageDays;
    if (days <= 1) return 15;
    if (days <= 3) return 12;
    if (days <= 6) return 9;
    if (days <= 10) return 5;
    if (days <= 14) return 2;
    return 0;
}

// 周辺10km・直近14日以内のSNS釣果から表示用の魚種名を抽出（重複排除・最新/最寄り優先・最大3魚種）
function extractRecentSnsFishes(posts, maxCount = 3) {
    if (!Array.isArray(posts) || posts.length === 0) return [];
    const seen = new Set();
    const fishes = [];
    for (const post of posts) {
        if (!post || post.ageDays > 14 || !Array.isArray(post.fishes)) continue;
        for (const rawFish of post.fishes) {
            const fish = cleanText(rawFish);
            if (!fish || seen.has(fish)) continue;
            seen.add(fish);
            fishes.push(fish);
            if (fishes.length >= maxCount) return fishes;
        }
    }
    return fishes;
}

// ==========================================
// リージョン内全県のスポット＋天気ロード
// ==========================================
function discoverPrefCodes() {
    if (!fs.existsSync(REGION_DIR)) {
        throw new Error("リージョンディレクトリが見つかりません: " + REGION_DIR);
    }

    // 現行フロント（regionLoader.js）と同じく {REGION}_region.csv の定義県を優先採用
    const csvPath = path.join(REGION_DIR, `${REGION_CODE}_region.csv`);
    let found = [];
    if (fs.existsSync(csvPath)) {
        const lines = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
        if (lines.length >= 2) {
            const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
            const typeIdx = headers.indexOf("type");
            const urlIdx = headers.indexOf("url");
            if (typeIdx !== -1 && urlIdx !== -1) {
                const seen = new Set();
                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i]) continue;
                    const cols = lines[i].split(",").map(c => c.trim());
                    if (cols[typeIdx] !== "pref" || !cols[urlIdx]) continue;
                    const parts = cols[urlIdx].split("/");
                    let code = "";
                    if (parts.length >= 4) code = parts[1].split("_")[0];
                    else if (parts.length === 3) code = parts[0].split("_")[0];
                    code = code.trim().toUpperCase();
                    if (code && !seen.has(code) && fs.existsSync(path.join(REGION_DIR, `${code}_location.json`))) {
                        seen.add(code);
                        found.push(code);
                    }
                }
            }
        }
    }

    if (found.length === 0) {
        found = fs.readdirSync(REGION_DIR)
            .filter(name => /_location\.json$/i.test(name))
            .map(name => name.replace(/_location\.json$/i, "").toUpperCase());
    }

    return found.sort((a, b) => {
        const ia = PREF_DISPLAY_ORDER.indexOf(a);
        const ib = PREF_DISPLAY_ORDER.indexOf(b);
        const oa = ia === -1 ? PREF_DISPLAY_ORDER.length : ia;
        const ob = ib === -1 ? PREF_DISPLAY_ORDER.length : ib;
        if (oa !== ob) return oa - ob;
        return a.localeCompare(b, "en");
    });
}

function loadPrefDataWithWeather(prefCode, todayUtcMs) {
    const locPath = path.join(REGION_DIR, `${prefCode}_location.json`);
    const rows = readJsonOptional(locPath, `${prefCode} location JSON`);
    if (!Array.isArray(rows)) return null;

    const prefRow = rows.find(r => r.name === prefCode && r.individualId === "parent");
    const prefName = cleanText(prefRow?.notes) || PREF_NAME_FALLBACK_MAP[prefCode] || prefCode;

    const areaRows = rows.filter(r => r.areaId === prefCode && r.individualId && r.individualId !== "parent");
    const areaMap = new Map();
    for (const a of areaRows) {
        const areaKey = `${a.areaId}_${a.individualId}`;
        areaMap.set(areaKey, {
            areaKey,
            name: cleanText(a.name),
            fileName: `${sanitizeFileSegment(areaKey)}.md`
        });
    }

    const coastalRaw = readJsonOptional(path.join(DATA_DIR, `${prefCode}_whether.json`), `${prefCode} 沿岸天気JSON`);
    const inlandRaw = readJsonOptional(path.join(DATA_DIR, `${prefCode}_InLandwhether.json`), `${prefCode} 内陸天気JSON`);
    const coastalWeather = coastalRaw ? normalizeWeatherJsonByDate(coastalRaw, todayUtcMs) : null;
    const inlandWeather = inlandRaw ? normalizeWeatherJsonByDate(inlandRaw, todayUtcMs) : null;

    const regularSpots = rows.filter(r =>
        hasZoom(r.zoom) &&
        r.type !== "pref" &&
        r.type !== "area" &&
        typeof r.areaId === "string" &&
        r.areaId.startsWith(prefCode + "_") &&
        typeof r.icon === "string" &&
        r.icon.trim() !== ""
    );

    const activeAreaKeys = new Set(regularSpots.map(s => s.areaId));
    const hasSplitAreaMd = regularSpots.length >= AREA_SPLIT_THRESHOLD && activeAreaKeys.size > 1;

    const spots = [];
    for (const row of rows) {
        if (row.type === "pref" || row.type === "area") continue;
        const spot = { ...row, _prefCode: prefCode, _prefName: prefName };

        // regionLoader.js と同じ優先順：沿岸を適用後、IDがL始まりのスポットは内陸天気で上書き
        if (coastalWeather && coastalWeather.spots && coastalWeather.spots[spot.name]) {
            spot.whether = coastalWeather.spots[spot.name];
        }
        const spotId = String(spot.individualId || spot.id || "");
        if (spotId.startsWith("L") && inlandWeather && inlandWeather.spots && inlandWeather.spots[spot.name]) {
            spot.whether = inlandWeather.spots[spot.name];
        }

        const areaInfo = areaMap.get(spot.areaId);
        spot._areaName = areaInfo ? areaInfo.name : "";
        spot._areaMdFile = hasSplitAreaMd && areaInfo ? areaInfo.fileName : `${prefCode}.md`;
        spots.push(spot);
    }

    return {
        prefCode,
        prefName,
        spots,
        regularSpotCount: regularSpots.length,
        hasSplitAreaMd
    };
}

// ==========================================
// ランキング採点＆天気詳細抽出（index.html renderSpotRanking と同一基準）
// ==========================================
function extractTomorrowWeatherDetail(dayData) {
    const weatherRows = Array.isArray(dayData?.weather) ? dayData.weather : [];
    const morningRows = [];
    const afternoonRows = [];

    let maxPop = -Infinity;
    let maxPopAll = -Infinity;
    let maxWind = -Infinity;
    let maxTemp = -Infinity;
    let minTemp = Infinity;
    let maxWave = -Infinity;
    let popTotal = 0;
    let popCount = 0;

    // 2時間別12ブロックの風速減点集計（4m/s以上で1ブロックあたり 8% + (風速-4)*1% 減点、12ブロック全て4m以上で最小96%減点）
    let windPenaltyPctRaw = 0;
    let windStrongBlocks = 0;

    // 2時間刻み(0,2,4,...,22時)から代表的な時間帯スロット（朝6時/昼12時/夕18時）を拾う
    const timeSlots = [];
    const targetHours = [6, 12, 18];

    for (let i = 0; i < weatherRows.length; i++) {
        const row = weatherRows[i];
        if (!Array.isArray(row)) continue;

        const hour = i * 2;
        if (hour >= 5 && hour <= 12) morningRows.push(row);
        else if (hour >= 13 && hour <= 20) afternoonRows.push(row);

        const code = row[0];
        const temp = row[1];
        const pop = row[2];
        const rain = row[3];
        const wind = row[4];
        const windDir = row[5];
        const wave = row[6];

        if (typeof pop === "number") {
            maxPopAll = Math.max(maxPopAll, pop);
            if (hour >= 5 && hour <= 20) {
                maxPop = Math.max(maxPop, pop);
                popTotal += pop;
                popCount++;
            }
        }
        if (typeof wind === "number") {
            maxWind = Math.max(maxWind, wind);
            if (wind >= 4) {
                windStrongBlocks++;
                windPenaltyPctRaw += 8 + (wind - 4);
            }
        }
        if (typeof temp === "number") {
            maxTemp = Math.max(maxTemp, temp);
            minTemp = Math.min(minTemp, temp);
        }
        if (typeof wave === "number") maxWave = Math.max(maxWave, wave);

        if (targetHours.includes(hour)) {
            const adjCode = Number.isFinite(Number(code))
                ? adjustWeatherCode(Number(code), Number(pop ?? 0))
                : null;
            const parts = [];
            if (adjCode != null) parts.push(`${toWeatherIcon(adjCode)}${toWeatherLabel(adjCode)}`);
            if (typeof temp === "number") parts.push(`${Math.round(temp)}°C`);
            if (typeof pop === "number") parts.push(`降水${Math.round(pop)}%`);
            if (typeof rain === "number" && rain > 0) parts.push(`雨量${rain.toFixed(1)}mm`);
            if (typeof wind === "number") {
                const dirStr = degToDirJa(windDir);
                parts.push(`風${dirStr ? dirStr : ""}${Math.round(wind)}m/s`);
            }
            if (typeof wave === "number") parts.push(`波${wave.toFixed(1)}m`);
            if (parts.length > 0) {
                timeSlots.push(`${hour}時: ${parts.join(" / ")}`);
            }
        }
    }

    if (popCount === 0) return null;

    const displayPop = maxPop < 5 ? 0 : Math.round(maxPop / 10) * 10;
    const morningCode = calcRepresentativeCode(morningRows);
    const afternoonCode = calcRepresentativeCode(afternoonRows);
    const iconMorning = morningCode != null ? toWeatherIcon(morningCode) : "";
    const iconAfternoon = afternoonCode != null ? toWeatherIcon(afternoonCode) : "";
    const labelMorning = morningCode != null ? toWeatherLabel(morningCode) : "";
    const labelAfternoon = afternoonCode != null ? toWeatherLabel(afternoonCode) : "";

    let iconHtml = "";
    let iconText = "";
    let weatherSummaryText = "";

    if (iconMorning && iconAfternoon) {
        iconHtml = iconMorning === iconAfternoon
            ? iconMorning
            : `${iconMorning}<span style="font-size:0.8em; margin:0 2px;">→</span>${iconAfternoon}`;
        iconText = iconMorning === iconAfternoon ? iconMorning : `${iconMorning}→${iconAfternoon}`;
        weatherSummaryText = labelMorning === labelAfternoon ? labelMorning : `${labelMorning}のち${labelAfternoon}`;
    } else {
        iconHtml = iconMorning || iconAfternoon || "";
        iconText = iconHtml;
        weatherSummaryText = labelMorning || labelAfternoon || "";
    }

    const averagePop = popTotal / popCount;
    const popPenaltyPct = Math.min(100, Math.max(0, averagePop));
    const popMultiplier = Math.max(0, 1 - popPenaltyPct / 100);

    const windPenaltyPct = Math.min(100, Math.max(0, windPenaltyPctRaw));
    const windMultiplier = Math.max(0, 1 - windPenaltyPct / 100);

    // 降水確率100%のスポット、または風速減点96%以上（12ブロック全て4m/s以上相当）のスポットは問答無用でランキング外
    const isExcludedByWeather = (
        displayPop >= 100 ||
        maxPop >= 100 ||
        maxPopAll >= 100 ||
        windPenaltyPct >= 96
    );

    const waterTempAvg = typeof dayData?.oneday?.avg === "number" ? Math.round(dayData.oneday.avg) : null;

    return {
        averagePop,
        popPenaltyPct: Math.round(popPenaltyPct),
        popMultiplier,
        windPenaltyPct: Math.round(windPenaltyPct),
        windStrongBlocks,
        windMultiplier,
        isExcludedByWeather,
        displayPop,
        maxWind: maxWind !== -Infinity ? Math.round(maxWind) : null,
        maxTemp: maxTemp !== -Infinity ? Math.round(maxTemp) : null,
        minTemp: minTemp !== Infinity ? Math.round(minTemp) : null,
        maxWave: maxWave !== -Infinity ? Number(maxWave.toFixed(1)) : null,
        waterTempAvg,
        iconHtml,
        iconText,
        weatherSummaryText,
        timeSlots
    };
}

function buildSpotUrl(spot) {
    return "/?region=" + encodeURIComponent(REGION_NAME) +
        "&pref=" + encodeURIComponent(spot._prefName || "") +
        "&area=" + encodeURIComponent(spot._areaName || "") +
        "&spot=" + encodeURIComponent(spot.name || "");
}

function buildRankingForSpots(targetSpots, snsCatchData, todayUtcMs, tomorrowIso, maxItems) {
    const candidates = [];

    for (const spot of targetSpots) {
        if (spot.type === "pref" || spot.type === "area") continue;
        const typeParts = String(spot.type || "").split("$");
        if (typeParts.includes("representative") ||
            typeParts.includes("assistant") ||
            typeParts.includes("substitute")) continue;

        if (!hasZoom(spot.zoom)) continue;
        if (!spot.icon || String(spot.icon).trim() === "") continue;

        const tomorrowDayData = spot.whether?.hourly?.[1];
        if (!tomorrowDayData || !Array.isArray(tomorrowDayData.weather)) continue;

        const wDetail = extractTomorrowWeatherDetail(tomorrowDayData);
        if (!wDetail) continue;

        // 降水確率100% または 2時間別風速減点96%以上（全ブロック4m以上相当）は問答無用でランキング外
        if (wDetail.isExcludedByWeather) continue;

        const nearbyPosts = getNearbySnsCatchRecords(spot, snsCatchData, todayUtcMs);
        const snsBonus = getSnsCatchBonus(nearbyPosts);

        // 基礎点(100点 + SNS釣果加点) に対し、降水確率減点率・2時間別風速減点率を乗算
        const baseScore = 100 + snsBonus;
        const totalScore = Math.round(baseScore * wDetail.popMultiplier * wDetail.windMultiplier);
        if (totalScore <= 0) continue;

        candidates.push({
            name: spot.name,
            prefCode: spot._prefCode,
            prefName: spot._prefName,
            areaName: spot._areaName,
            areaMdFile: spot._areaMdFile,
            url: buildSpotUrl(spot),
            fullUrl: SITE_URL + buildSpotUrl(spot),
            score: totalScore,
            baseScore,
            popPenaltyPct: wDetail.popPenaltyPct,
            windPenaltyPct: wDetail.windPenaltyPct,
            windStrongBlocks: wDetail.windStrongBlocks,
            snsBonus,
            hasSnsBonus: snsBonus > 0,
            snsFishes: snsBonus > 0 ? extractRecentSnsFishes(nearbyPosts, 3) : [],
            pop: wDetail.displayPop,
            wind: wDetail.maxWind,
            maxTemp: wDetail.maxTemp,
            minTemp: wDetail.minTemp,
            maxWave: wDetail.maxWave,
            waterTempAvg: wDetail.waterTempAvg,
            iconHtml: wDetail.iconHtml,
            iconText: wDetail.iconText,
            weatherSummaryText: wDetail.weatherSummaryText,
            timeSlots: wDetail.timeSlots,
            nearbyPosts: nearbyPosts.slice(0, 5),
            tieSeed: hashSeed(`${tomorrowIso}:${spot._prefCode}:${spot.name}`)
        });
    }

    if (candidates.length === 0) return [];

    // スコア降順、同点は日付＋スポット名の決定論的シードで均等分散
    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.tieSeed - b.tieSeed;
    });

    // 既存仕様と同じく上位3順位まで（REGION最大5件、PREF最大6件）
    const topItems = [];
    let currentRank = 1;
    let currentScore = candidates[0].score;

    for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].score < currentScore) {
            currentRank++;
            currentScore = candidates[i].score;
        }
        if (currentRank > 3 || topItems.length >= maxItems) break;
        topItems.push({ ...candidates[i], rank: currentRank });
    }

    return topItems;
}

// ==========================================
// 既存デザインと完全一致するHTMLリスト生成
// ==========================================
function renderRankingListHtml(topItems, scopeTag, tomorrowIso) {
    if (!topItems || topItems.length === 0) {
        return `<div data-ssg-ranking="${escapeHtml(scopeTag)}" data-target-date="${escapeHtml(tomorrowIso)}" style="background:#ffffff; padding:12px; border-radius:6px; border:1px solid #c8d6e5; font-size:13px; color:#191970; line-height:1.6;">` +
            `明日は降水確率100%や強風（4m/s以上が終日継続）の予報となっているため、安全を優先しおすすめ釣り場の選出を見送りました。` +
            `</div>`;
    }

    let html = `<ul data-ssg-ranking="${escapeHtml(scopeTag)}" data-target-date="${escapeHtml(tomorrowIso)}" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;">`;
    for (const item of topItems) {
        const windHtml = item.wind !== null
            ? `<span>風: <strong style="color:#191970;">${item.wind}m</strong></span>`
            : "";
        let snsHtml = "";
        if (item.hasSnsBonus) {
            const fishText = Array.isArray(item.snsFishes) && item.snsFishes.length > 0
                ? item.snsFishes.slice(0, 3).join("・")
                : "";
            const fishHtml = fishText
                ? `<span class="recommend-sns-fish">${escapeHtml(fishText)}</span>`
                : "";
            snsHtml = `<span class="recommend-sns-badge">${fishHtml}<span class="recommend-sns-label">SNS釣果あり</span></span>`;
        }

        html += `<li>` +
            `<a href="${escapeHtml(item.url)}" class="recommend-spot-link" style="position:relative; display:flex; flex-direction:column; background:#ffffff; padding:12px; border-radius:6px; border:1px solid #c8d6e5; box-shadow:0 1px 3px rgba(0,0,0,0.05); text-decoration:none; color:#333;">` +
                `<span style="display:flex; justify-content:space-between; align-items:center; width:100%;">` +
                    `<span style="font-weight:bold; color:#191970; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:8px;">${escapeHtml(item.name)}</span>` +
                    `<span style="font-size:12px; color:#555; white-space:nowrap; display:flex; align-items:center; gap:8px;">` +
                        `<span style="width:48px; min-width:48px; flex:0 0 48px; display:inline-flex; justify-content:center; align-items:center; text-align:center; font-size:1.3em;">${item.iconHtml}</span>` +
                        `<span>降水: <strong style="color:#191970;">${item.pop}%</strong></span>` +
                        windHtml +
                    `</span>` +
                `</span>` +
                snsHtml +
            `</a>` +
        `</li>`;
    }
    html += `</ul>`;
    return html;
}

// ==========================================
// AI用・根拠付きランキングMD生成（天気詳細＋周辺SNS釣果備考欄）
// ==========================================
function renderMdSpotBlock(item, index) {
    const lines = [];
    const locationTag = [item.prefName, item.areaName].filter(Boolean).join(" / ");
    lines.push(`#### ${index + 1}. ${item.name}（${locationTag}）`);
    lines.push("");

    const condParts = [];
    if (item.iconText || item.weatherSummaryText) {
        condParts.push(`${item.iconText} ${item.weatherSummaryText}`.trim());
    }
    if (item.maxTemp != null && item.minTemp != null) {
        condParts.push(`気温 ${item.minTemp}〜${item.maxTemp}°C`);
    } else if (item.maxTemp != null) {
        condParts.push(`最高気温 ${item.maxTemp}°C`);
    }
    condParts.push(`最大降水確率 ${item.pop}%`);
    if (item.wind != null) condParts.push(`最大風速 ${item.wind}m/s`);
    if (item.maxWave != null) condParts.push(`最大波高 ${item.maxWave}m`);
    if (item.waterTempAvg != null) condParts.push(`平均水温 ${item.waterTempAvg}°C`);

    lines.push(`- **総合スコア**: ${item.score}点（基礎点 ${item.baseScore}点 [基本100+SNS釣果${item.snsBonus}] × 降水減点-${item.popPenaltyPct}% × 風速減点-${item.windPenaltyPct}%[4m以上:${item.windStrongBlocks}/12コマ]）`);
    lines.push(`- **明日の天気予報（根拠）**: ${condParts.join(" / ")}`);
    if (item.timeSlots.length > 0) {
        lines.push(`- **時間帯別の予報詳細**: ${item.timeSlots.join(" ｜ ")}`);
    }

    // 備考欄：周辺10km圏内の直近SNS釣果
    if (item.nearbyPosts.length > 0) {
        const recentWithin14d = item.nearbyPosts.filter(p => p.ageDays <= 14);
        const targetPosts = recentWithin14d.length > 0 ? recentWithin14d : item.nearbyPosts;
        const notes = targetPosts.slice(0, 4).map(p => {
            const distStr = p.distanceKm < 0.1 ? "0.1km未満" : `約${p.distanceKm.toFixed(1)}km`;
            const fishStr = p.fishes.length > 0 ? p.fishes.join("・") : "釣果あり";
            const placeStr = p.areaName || "周辺";
            const srcStr = p.url ? `[${p.source}](${p.url})` : p.source;
            return `${p.dateIso} ${fishStr}（投稿地: ${placeStr} / ${distStr} / ${srcStr}）`;
        });
        lines.push(`- **備考（周辺10km圏内の直近SNS釣果）**: ${notes.join("； ")}`);
    } else {
        lines.push(`- **備考（周辺10km圏内の直近SNS釣果）**: 周辺10km圏内に直近SNS釣果報告なし（明日の天候条件により上位選出）`);
    }

    lines.push(`- **スポット詳細MD / 地図**: [${item.areaName || item.prefName}詳細（${item.areaMdFile}）](${item.areaMdFile}) / [地図を見る](${item.fullUrl})`);
    lines.push("");
    return lines;
}

function buildTomorrowMarkdown(todayInfo, tomorrowInfo, regionItems, prefResults) {
    const lines = [];
    lines.push("---");
    lines.push(`title: "明日（${tomorrowInfo.label}）${SHORT_REGION_NAME}のおすすめ釣り場ランキングと天気・釣果根拠"`);
    lines.push(`pref_code: "${REGION_CODE}"`);
    lines.push(`pref_name: "${SHORT_REGION_NAME}全域"`);
    lines.push(`target_date: "${tomorrowInfo.iso}"`);
    lines.push(`last_updated: "${todayInfo.iso}"`);
    lines.push('timezone: "Asia/Tokyo"');
    lines.push('source: "釣り行こNAVI"');
    lines.push("---");
    lines.push("");
    lines.push(`# 明日（${tomorrowInfo.label}）${SHORT_REGION_NAME}で釣りに行くんだけど良い場所ある？`);
    lines.push("");

    // 見出し直下にAIがそのまま引用できる結論パッセージを配置
    if (regionItems.length > 0) {
        const spotSummaries = regionItems.map(item => {
            const snsNote = item.hasSnsBonus ? "・直近SNS釣果あり" : "";
            return `${item.name}（${item.prefName}／降水${item.pop}%${item.wind != null ? `・風${item.wind}m/s` : ""}${snsNote}）`;
        });
        lines.push(
            `明日（${tomorrowInfo.iso}）の${SHORT_REGION_NAME}で天候条件と直近SNS釣果のバランスが良いおすすめ釣り場は、${spotSummaries.join("、")}です。各スポットは明日の5時〜20時の降水傾向と周辺10km圏内の最新SNS釣果実績から自動採点しています。`
        );
        lines.push("");
    }

    lines.push("> 本ファイルは釣り行こNAVIの「明日のオススメ釣り場ランキング」の算出結果と、その根拠となる明日の天気予報詳細および周辺10km圏内の直近SNS釣果を備考としてまとめたものです。");
    lines.push("> 天気・風・波の状況は急変する場合があり、SNS釣果は過去の投稿実績のため今後の釣果や現地の立入可否を保証するものではありません。釣行前に必ず現地の最新規制・気象情報をご確認ください。");
    lines.push("");

    lines.push("## 算出基準");
    lines.push("");
    lines.push(`- 対象日: ${tomorrowInfo.iso}（${tomorrowInfo.label}）`);
    lines.push("- 基礎点: 基本100点に周辺10km圏内の最新SNS釣果ボーナスを加算（1日以内+15点 / 3日以内+12点 / 6日以内+9点 / 10日以内+5点 / 14日以内+2点）");
    lines.push("- 降水確率の乗算減点: 降水確率100%のスポットは除外し、100%未満は日中平均降水確率の割合で乗算減点");
    lines.push("- 風速の乗算減点: 2時間別12コマのうち風速4m/s以上の時間帯ごとに8%＋超過1m/sあたり1%を合計して乗算減点（減点率96%以上は除外）");
    lines.push("- 関連データ: [AI向け全データ目次（llms.txt）](../llms.txt) / [釣り行こNAVIトップ](https://turiiko-navi.com/)");
    lines.push("");

    lines.push(`## ${SHORT_REGION_NAME}全域のおすすめ釣り場（上位${regionItems.length}件）`);
    lines.push("");
    if (regionItems.length === 0) {
        lines.push("明日の天気データが揃っているスポットがありません。");
        lines.push("");
    } else {
        regionItems.forEach((item, idx) => {
            lines.push(...renderMdSpotBlock(item, idx));
        });
    }

    lines.push("## 都道府県別のおすすめ釣り場");
    lines.push("");
    for (const pr of prefResults) {
        lines.push(`### ${pr.prefName}（${pr.items.length}件）`);
        lines.push("");
        lines.push(`- 関連データ: [${pr.prefName}スポット一覧（${pr.prefCode}.md）](${pr.prefCode}.md) / [最新SNS釣果（${pr.prefCode}_catch.md）](${pr.prefCode}_catch.md)`);
        lines.push("");
        if (pr.items.length === 0) {
            lines.push("現在、明日のランキング対象となるスポットデータがありません。");
            lines.push("");
            continue;
        }
        pr.items.forEach((item, idx) => {
            lines.push(...renderMdSpotBlock(item, idx));
        });
    }

    lines.push("---");
    lines.push("");
    lines.push(`データ出典: data/*_whether.json、data/*_InLandwhether.json、${REGION_CODE}/integrated_catch.json、${REGION_CODE}/*_location.json`);
    lines.push("");

    return lines.join("\n");
}

// ==========================================
// ai-data/*.md → 超軽量静的HTML（*.html）＆ ai-data/index.html 一括変換
// ==========================================
function parseMdFrontmatter(mdText) {
    const match = String(mdText || "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return { meta: {}, body: String(mdText || "") };

    const meta = {};
    for (const line of match[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
        if (!kv) continue;
        let val = kv[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        meta[kv[1]] = val;
    }
    return {
        meta,
        body: String(mdText || "").slice(match[0].length)
    };
}

function extractFirstMdHeading(mdBody) {
    const m = String(mdBody || "").match(/^#\s+(.+)$/m);
    return m ? cleanText(m[1]) : "";
}

function rewriteMdHrefToHtml(rawHref) {
    const href = String(rawHref || "").trim();
    if (!href) return "#";

    // llms.txt は軽量HTML目次へ誘導
    if (/^(?:\.\.\/|\/|https:\/\/turiiko-navi\.com\/)?llms\.txt(?:$|[?#])/i.test(href)) {
        return "/ai-data/index.html";
    }

    // 同一サイト / 相対パスの .md リンクを .html 版へ書き換え
    if (/^https:\/\/turiiko-navi\.com\/ai-data\/[^?#]+\.md(?:$|[?#])/i.test(href)) {
        return href.replace(/\.md(?=$|[?#])/i, ".html");
    }
    if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href) && /\.md(?:$|[?#])/i.test(href)) {
        return href.replace(/\.md(?=$|[?#])/i, ".html");
    }

    return href;
}

function renderInlineMdToHtml(text) {
    // 先にHTMLエスケープした上でリンク・太字・コードを安全に変換
    const tokens = [];
    const placeholder = idx => `\u0000TOK${idx}\u0000`;

    // 1. Markdownリンク [label](url) を退避
    let work = String(text || "").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, rawUrl) => {
        const idx = tokens.length;
        const href = rewriteMdHrefToHtml(rawUrl);
        const isExternal = /^https?:\/\//i.test(href) && !href.startsWith(SITE_URL);
        const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : "";
        tokens.push(`<a href="${escapeHtml(href)}"${attrs}>${escapeHtml(label)}</a>`);
        return placeholder(idx);
    });

    // 2. インラインコード `...` を退避
    work = work.replace(/`([^`]+)`/g, (_, code) => {
        const idx = tokens.length;
        tokens.push(`<code>${escapeHtml(code)}</code>`);
        return placeholder(idx);
    });

    // 3. 残りをエスケープ
    work = escapeHtml(work);

    // 4. 太字 **...**
    work = work.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // 5. 退避トークンを復元
    work = work.replace(/\u0000TOK(\d+)\u0000/g, (_, i) => tokens[Number(i)] || "");
    return work;
}

function splitMdTableRow(line) {
    let trimmed = line.trim();
    if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
    if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
    return trimmed.split("|").map(cell => cell.trim());
}

function isMdTableSeparator(line) {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) return false;
    const cells = splitMdTableRow(trimmed);
    return cells.length > 0 && cells.every(c => /^:?-{3,}:?$/.test(c));
}

function convertMarkdownBodyToHtml(mdBody) {
    const lines = String(mdBody || "").split(/\r?\n/);
    const out = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            i++;
            continue;
        }

        // 水平線
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            out.push("<hr>");
            i++;
            continue;
        }

        // 見出し (#〜####)
        const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
        if (hMatch) {
            const level = hMatch[1].length;
            out.push(`<h${level}>${renderInlineMdToHtml(hMatch[2])}</h${level}>`);
            i++;
            continue;
        }

        // 引用ブロック (>)
        if (trimmed.startsWith(">")) {
            const quoteLines = [];
            while (i < lines.length && lines[i].trim().startsWith(">")) {
                quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
                i++;
            }
            const inner = quoteLines.filter(Boolean).map(q => `<p>${renderInlineMdToHtml(q)}</p>`).join("");
            if (inner) out.push(`<blockquote>${inner}</blockquote>`);
            continue;
        }

        // テーブル
        if (trimmed.includes("|") && i + 1 < lines.length && isMdTableSeparator(lines[i + 1])) {
            const headerCells = splitMdTableRow(trimmed);
            i += 2;
            const bodyRows = [];
            while (i < lines.length && lines[i].trim().includes("|") && !lines[i].trim().startsWith("#")) {
                bodyRows.push(splitMdTableRow(lines[i]));
                i++;
            }
            let tbl = '<div class="table-wrap"><table><thead><tr>';
            for (const hc of headerCells) {
                tbl += `<th>${renderInlineMdToHtml(hc)}</th>`;
            }
            tbl += "</tr></thead><tbody>";
            for (const row of bodyRows) {
                tbl += "<tr>";
                for (let c = 0; c < headerCells.length; c++) {
                    tbl += `<td>${renderInlineMdToHtml(row[c] ?? "")}</td>`;
                }
                tbl += "</tr>";
            }
            tbl += "</tbody></table></div>";
            out.push(tbl);
            continue;
        }

        // 箇条書き (- / *)
        if (/^[-*]\s+/.test(trimmed)) {
            const items = [];
            while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
                items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
                i++;
            }
            out.push("<ul>" + items.map(it => `<li>${renderInlineMdToHtml(it)}</li>`).join("") + "</ul>");
            continue;
        }

        // 番号付きリスト (1. )
        if (/^\d+\.\s+/.test(trimmed)) {
            const items = [];
            while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
                items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
                i++;
            }
            out.push("<ol>" + items.map(it => `<li>${renderInlineMdToHtml(it)}</li>`).join("") + "</ol>");
            continue;
        }

        // 通常段落
        const paraLines = [];
        while (
            i < lines.length &&
            lines[i].trim() &&
            !/^(#{1,4}\s+|>\s?|[-*]\s+|\d+\.\s+|-{3,}$)/.test(lines[i].trim()) &&
            !(lines[i].trim().includes("|") && i + 1 < lines.length && isMdTableSeparator(lines[i + 1]))
        ) {
            paraLines.push(lines[i].trim());
            i++;
        }
        if (paraLines.length > 0) {
            out.push(`<p>${paraLines.map(renderInlineMdToHtml).join("<br>")}</p>`);
        }
    }

    return out.join("\n");
}

function wrapLightweightHtmlPage({ title, description, updatedDate, bodyHtml, mdFileName }) {
    const safeTitle = escapeHtml(title || "釣り行こNAVI データ");
    const safeDesc = escapeHtml(description || `${title || "釣り行こNAVI"}のテキスト・構造化データページです。`);
    const mdLinkHtml = mdFileName
        ? ` ｜ <a href="${escapeHtml(mdFileName)}">Markdown原本</a>`
        : "";
    const metaInfo = updatedDate ? `最終更新: ${escapeHtml(updatedDate)} (JST)` : "";

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}｜釣り行こNAVI</title>
  <meta name="description" content="${safeDesc}">
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="${SITE_URL}/">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif; line-height: 1.7; color: #222; background: #f8fafc; margin: 0; padding: 0; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 16px 16px 40px; background: #fff; min-height: 100vh; box-sizing: border-box; }
    .top-nav { font-size: 12px; color: #555; padding-bottom: 10px; margin-bottom: 14px; border-bottom: 1px solid #dce4ee; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
    .top-nav a { color: #191970; text-decoration: none; font-weight: bold; }
    .top-nav a:hover { text-decoration: underline; }
    h1 { font-size: 20px; color: #191970; margin: 0 0 12px; line-height: 1.4; }
    h2 { font-size: 16px; color: #191970; border-left: 4px solid #191970; padding-left: 8px; margin: 22px 0 10px; }
    h3 { font-size: 15px; color: #243b6b; margin: 18px 0 8px; }
    h4 { font-size: 14px; color: #191970; margin: 14px 0 6px; }
    p { margin: 0 0 10px; font-size: 14px; }
    ul, ol { margin: 0 0 12px; padding-left: 20px; font-size: 14px; }
    li { margin-bottom: 4px; }
    blockquote { margin: 0 0 14px; padding: 10px 12px; background: #eef3f8; border-left: 3px solid #191970; font-size: 13px; color: #333; }
    blockquote p:last-child { margin-bottom: 0; }
    a { color: #191970; }
    code { background: #eef3f8; padding: 1px 4px; border-radius: 3px; font-size: 0.92em; }
    hr { border: none; border-top: 1px solid #dce4ee; margin: 20px 0; }
    .table-wrap { overflow-x: auto; margin: 0 0 14px; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { border: 1px solid #d5dfec; padding: 6px 8px; text-align: left; }
    th { background: #eef3f8; color: #191970; }
    .foot-nav { margin-top: 28px; padding-top: 12px; border-top: 1px solid #dce4ee; font-size: 12px; color: #555; }
  </style>
</head>
<body>
  <main class="wrap">
    <nav class="top-nav" aria-label="データナビゲーション">
      <div><a href="/">← 釣り行こNAVI 地図トップ</a> ｜ <a href="/ai-data/index.html">データ目次</a> ｜ <a href="/ai-data/${escapeHtml(REGION_CODE)}_tomorrow.html">明日のオススメ根拠</a>${mdLinkHtml}</div>
      <div>${metaInfo}</div>
    </nav>
    ${bodyHtml}
    <footer class="foot-nav">
      <a href="/">釣り行こNAVI（関東の釣り場マップ・最新釣果さかな地図）</a> ｜ <a href="/ai-data/index.html">全県データ目次（HTML）</a> ｜ <a href="/llms.txt">llms.txt</a>
    </footer>
  </main>
</body>
</html>
`;
}

function syncAiDataHtmlPages(aiDataDir, todayInfo) {
    if (!fs.existsSync(aiDataDir)) {
        return { tomorrowFiles: [], groups: [], generatedHtmlCount: 0, htmlFileSet: new Set() };
    }

    const mdFiles = fs.readdirSync(aiDataDir)
        .filter(name => /\.md$/i.test(name))
        .sort((a, b) => a.localeCompare(b, "en"));

    const tomorrowFiles = [];
    const groupsMap = new Map();
    const htmlFileSet = new Set();
    let generatedHtmlCount = 0;

    for (const mdFileName of mdFiles) {
        const mdPath = path.join(aiDataDir, mdFileName);
        const mdContent = fs.readFileSync(mdPath, "utf8");
        const { meta, body } = parseMdFrontmatter(mdContent);
        const baseName = mdFileName.replace(/\.md$/i, "");
        const upperBase = baseName.toUpperCase();
        const htmlFileName = `${baseName}.html`;
        const htmlPath = path.join(aiDataDir, htmlFileName);

        const inferredPref = baseName.split("_")[0].toUpperCase();
        const prefCode = cleanText(meta.pref_code).toUpperCase() || inferredPref;
        const prefName = cleanText(meta.pref_name) || PREF_NAME_FALLBACK_MAP[prefCode] || prefCode;
        const title = cleanText(meta.title) || extractFirstMdHeading(body) || baseName;
        const updatedDate = cleanText(meta.last_updated) || todayInfo.iso;

        const bodyHtml = convertMarkdownBodyToHtml(body);
        const pageHtml = wrapLightweightHtmlPage({
            title,
            description: `${title}（${prefName}）。釣り行こNAVIの構造化データ・テキスト版ページ。`,
            updatedDate,
            bodyHtml,
            mdFileName
        });

        fs.writeFileSync(htmlPath, pageHtml, "utf8");
        htmlFileSet.add(htmlFileName);
        generatedHtmlCount++;

        const entry = {
            mdFileName,
            htmlFileName,
            htmlUrl: `/ai-data/${encodeURIComponent(htmlFileName)}`,
            prefCode,
            prefName,
            title,
            meta
        };

        if (/_TOMORROW$/.test(upperBase)) {
            tomorrowFiles.push(entry);
            continue;
        }

        if (!groupsMap.has(prefCode)) {
            groupsMap.set(prefCode, {
                prefCode,
                prefName,
                main: null,
                catchFile: null,
                fishFile: null,
                areas: []
            });
        }
        const group = groupsMap.get(prefCode);
        if (prefName && prefName !== prefCode) group.prefName = prefName;

        if (upperBase === prefCode) group.main = entry;
        else if (upperBase === `${prefCode}_CATCH`) group.catchFile = entry;
        else if (upperBase === `${prefCode}_FISH`) group.fishFile = entry;
        else group.areas.push(entry);
    }

    const sortedGroups = [...groupsMap.values()].sort((a, b) => {
        const ia = PREF_DISPLAY_ORDER.indexOf(a.prefCode);
        const ib = PREF_DISPLAY_ORDER.indexOf(b.prefCode);
        const oa = ia === -1 ? PREF_DISPLAY_ORDER.length : ia;
        const ob = ib === -1 ? PREF_DISPLAY_ORDER.length : ib;
        if (oa !== ob) return oa - ob;
        return a.prefCode.localeCompare(b.prefCode, "en");
    });

    // ai-data/index.html（全県データ目次の軽量HTML版）を生成
    const idxParts = [];
    idxParts.push("<h1>釣り行こNAVI 関東の釣り場・最新釣果データ目次</h1>");
    idxParts.push(`<p>関東全域の釣り場スポット詳細（解説・駐車場・ルール・最寄りIC/釣具店）、魚種逆引き、最新SNS釣果、明日のオススメ釣り場選出根拠を、軽量なテキストHTMLページで閲覧できるデータ目次です。</p>`);

    if (tomorrowFiles.length > 0) {
        idxParts.push("<h2>明日のオススメ釣り場ランキング（天気・SNS釣果根拠）</h2><ul>");
        for (const tf of tomorrowFiles) {
            const targetDate = cleanText(tf.meta.target_date);
            const suffix = targetDate ? `（対象日: ${escapeHtml(targetDate)}）` : "";
            idxParts.push(`<li><a href="${escapeHtml(tf.htmlUrl)}">${escapeHtml(tf.title)}</a>${suffix}</li>`);
        }
        idxParts.push("</ul>");
    }

    for (const g of sortedGroups) {
        idxParts.push(`<h2>${escapeHtml(g.prefName)}</h2><ul>`);
        if (g.main) {
            idxParts.push(`<li><a href="${escapeHtml(g.main.htmlUrl)}">${escapeHtml(g.main.title)}</a>（スポット概要・一覧）</li>`);
        }
        if (g.catchFile) {
            idxParts.push(`<li><a href="${escapeHtml(g.catchFile.htmlUrl)}">${escapeHtml(g.catchFile.title)}</a>（周辺最新SNS釣果まとめ）</li>`);
        }
        if (g.fishFile) {
            idxParts.push(`<li><a href="${escapeHtml(g.fishFile.htmlUrl)}">${escapeHtml(g.fishFile.title)}</a>（魚種別スポット逆引き）</li>`);
        }
        const sortedAreas = [...g.areas].sort((a, b) => a.htmlFileName.localeCompare(b.htmlFileName, "en"));
        for (const a of sortedAreas) {
            const spotCount = cleanText(a.meta.spot_count);
            const suffix = spotCount ? `（${escapeHtml(spotCount)}スポット）` : "";
            idxParts.push(`<li><a href="${escapeHtml(a.htmlUrl)}">${escapeHtml(a.title)}</a>${suffix}</li>`);
        }
        idxParts.push("</ul>");
    }

    const indexHtml = wrapLightweightHtmlPage({
        title: "関東の釣り場・最新釣果データ目次",
        description: "釣り行こNAVIの関東全域釣り場スポット詳細・魚種逆引き・最新SNS釣果・明日のオススメ根拠データ目次。",
        updatedDate: todayInfo.iso,
        bodyHtml: idxParts.join("\n"),
        mdFileName: "../llms.txt"
    });
    fs.writeFileSync(path.join(aiDataDir, "index.html"), indexHtml, "utf8");
    htmlFileSet.add("index.html");
    generatedHtmlCount++;

    return {
        tomorrowFiles,
        groups: sortedGroups,
        generatedHtmlCount,
        htmlFileSet
    };
}

// ==========================================
// 静的ポップアップ（#rankingBasisModal）用HTMLの生成
// ==========================================
function buildBasisPopupHtml({ scopeLabel, tomorrowInfo, items, dataCatalog, currentPrefCode }) {
    const parts = [];

    // サマリー＋算出基準カード
    parts.push('<div class="basis-summary-card">');
    if (items.length > 0) {
        const summarySpots = items.map(it => {
            const snsNote = it.hasSnsBonus ? "・直近SNS釣果あり" : "";
            return `${it.name}（${it.prefName}／降水${it.pop}%${it.wind != null ? `・風${it.wind}m/s` : ""}${snsNote}）`;
        });
        parts.push(
            `<div class="basis-summary-text">明日（${escapeHtml(tomorrowInfo.iso)}）の${escapeHtml(scopeLabel)}で天候条件と周辺10km圏内の直近SNS釣果から上位選出された釣り場は、${escapeHtml(summarySpots.join("、"))}です。</div>`
        );
    } else {
        parts.push(`<div class="basis-summary-text">明日（${escapeHtml(tomorrowInfo.iso)}）の${escapeHtml(scopeLabel)}における算出対象スポットはありません。</div>`);
    }
    parts.push(
        `<div class="basis-criteria">` +
        `算出基準: 基礎点（100点＋周辺10km圏内の直近SNS釣果ボーナス）に対し、明日の降水確率と2時間別風速（4m/s以上の時間帯ごとに減点）を乗算減点して算出しています（降水100%・終日強風は除外）。` +
        `</div>`
    );
    parts.push("</div>");

    // 各スポットの天気根拠・周辺SNS釣果カード
    if (items.length > 0) {
        parts.push('<div class="basis-spot-list">');
        items.forEach((item, idx) => {
            const locText = [item.prefName, item.areaName].filter(Boolean).join(" / ");
            const condParts = [];
            if (item.iconText || item.weatherSummaryText) {
                condParts.push(`${item.iconText} ${item.weatherSummaryText}`.trim());
            }
            if (item.maxTemp != null && item.minTemp != null) {
                condParts.push(`気温 ${item.minTemp}〜${item.maxTemp}°C`);
            } else if (item.maxTemp != null) {
                condParts.push(`最高気温 ${item.maxTemp}°C`);
            }
            condParts.push(`最大降水 ${item.pop}%`);
            if (item.wind != null) condParts.push(`最大風速 ${item.wind}m/s`);
            if (item.maxWave != null) condParts.push(`最大波高 ${item.maxWave}m`);
            if (item.waterTempAvg != null) condParts.push(`平均水温 ${item.waterTempAvg}°C`);

            let snsHtml = "周辺10km圏内に直近SNS釣果報告なし（明日の天候条件により選出）";
            if (item.nearbyPosts.length > 0) {
                const within14d = item.nearbyPosts.filter(p => p.ageDays <= 14);
                const list = (within14d.length > 0 ? within14d : item.nearbyPosts).slice(0, 3);
                snsHtml = list.map(p => {
                    const distStr = p.distanceKm < 0.1 ? "0.1km未満" : `約${p.distanceKm.toFixed(1)}km`;
                    const fishStr = p.fishes.length > 0 ? p.fishes.join("・") : "釣果あり";
                    const placeStr = p.areaName || "周辺";
                    const srcHtml = p.url
                        ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.source)}↗</a>`
                        : escapeHtml(p.source);
                    return `${escapeHtml(p.dateIso)} ${escapeHtml(fishStr)}（${escapeHtml(placeStr)}・${escapeHtml(distStr)}・${srcHtml}）`;
                }).join(" ／ ");
            }

            const areaHtmlFile = String(item.areaMdFile || "").replace(/\.md$/i, ".html");
            const detailLinkHtml = dataCatalog && dataCatalog.htmlFileSet.has(areaHtmlFile)
                ? `<a href="/ai-data/${encodeURIComponent(areaHtmlFile)}" class="basis-action-pill">${escapeHtml(item.areaName || item.prefName)}のスポット詳細一覧</a>`
                : "";

            parts.push(
                `<div class="basis-spot-card">` +
                `<h3 class="basis-spot-title">${idx + 1}. ${escapeHtml(item.name)} <span class="basis-spot-loc">（${escapeHtml(locText)}）</span></h3>` +
                `<ul class="basis-spot-meta">` +
                `<li><strong>スコア:</strong> ${item.score}点（基礎 ${item.baseScore}点 × 降水-${item.popPenaltyPct}% × 風速-${item.windPenaltyPct}%）</li>` +
                `<li><strong>明日の天気根拠:</strong> ${escapeHtml(condParts.join(" / "))}</li>` +
                (item.timeSlots.length > 0 ? `<li><strong>時間帯別予報:</strong> ${escapeHtml(item.timeSlots.join(" ｜ "))}</li>` : "") +
                `<li><strong>周辺10kmの直近SNS釣果:</strong> ${snsHtml}</li>` +
                `</ul>` +
                `<div class="basis-spot-actions">` +
                `<a href="${escapeHtml(item.url)}" class="basis-action-pill">地図でポイントを見る</a>` +
                detailLinkHtml +
                `</div>` +
                `</div>`
            );
        });
        parts.push("</div>");
    }

    // 各県の軽量HTMLデータページへの通常リンク一覧
    parts.push('<div class="basis-links-card">');
    parts.push('<h3>各県の釣り場詳細・最新SNS釣果データ一覧（テキストHTML版）</h3>');
    parts.push('<ul class="basis-links-list">');

    const tomorrowHtmlName = `${REGION_CODE}_tomorrow.html`;
    if (dataCatalog && dataCatalog.htmlFileSet.has(tomorrowHtmlName)) {
        parts.push(
            `<li><a href="/ai-data/${encodeURIComponent(tomorrowHtmlName)}"><strong>明日（${escapeHtml(tomorrowInfo.label)}）の${escapeHtml(SHORT_REGION_NAME)}おすすめ釣り場・全県詳細根拠</strong></a></li>`
        );
    }

    if (dataCatalog && dataCatalog.groups.length > 0) {
        const orderedGroups = currentPrefCode
            ? [
                ...dataCatalog.groups.filter(g => g.prefCode === currentPrefCode),
                ...dataCatalog.groups.filter(g => g.prefCode !== currentPrefCode)
              ]
            : dataCatalog.groups;

        for (const g of orderedGroups) {
            const links = [];
            if (g.main) links.push(`<a href="${escapeHtml(g.main.htmlUrl)}">スポット一覧</a>`);
            if (g.catchFile) links.push(`<a href="${escapeHtml(g.catchFile.htmlUrl)}">最新SNS釣果</a>`);
            if (g.fishFile) links.push(`<a href="${escapeHtml(g.fishFile.htmlUrl)}">魚種逆引き</a>`);
            if (links.length > 0) {
                parts.push(`<li><strong>${escapeHtml(g.prefName)}:</strong> ${links.join(" / ")}</li>`);
            }
        }
    }

    if (dataCatalog && dataCatalog.htmlFileSet.has("index.html")) {
        parts.push(`<li><a href="/ai-data/index.html">関東全域の釣り場・釣果データ目次を見る</a></li>`);
    }

    parts.push("</ul></div>");
    return parts.join("\n");
}

// ==========================================
// 原本 template/index.txt から静的HTMLをビルド
// ==========================================
function buildHtmlFromTemplate(templatePath, regionTitle, regionHtml, basisTitle, basisHtml) {
    if (!fs.existsSync(templatePath)) {
        throw new Error(`原本テンプレートが見つかりません: ${templatePath}`);
    }
    let html = fs.readFileSync(templatePath, "utf8");

    const titlePattern = /<!--\s*\{\{RANKING_TITLE\}\}\s*-->[\s\S]*?<!--\s*\{\{\/RANKING_TITLE\}\}\s*-->/;
    const bodyPattern = /<!--\s*\{\{RANKING_HTML\}\}\s*-->[\s\S]*?<!--\s*\{\{\/RANKING_HTML\}\}\s*-->/;
    const basisTitlePattern = /<!--\s*\{\{RANKING_BASIS_TITLE\}\}\s*-->[\s\S]*?<!--\s*\{\{\/RANKING_BASIS_TITLE\}\}\s*-->/;
    const basisBodyPattern = /<!--\s*\{\{RANKING_BASIS_HTML\}\}\s*-->[\s\S]*?<!--\s*\{\{\/RANKING_BASIS_HTML\}\}\s*-->/;

    if (!titlePattern.test(html)) {
        throw new Error("原本テンプレート内に <!-- {{RANKING_TITLE}} --> プレースホルダーが見つかりません。");
    }
    if (!bodyPattern.test(html)) {
        throw new Error("原本テンプレート内に <!-- {{RANKING_HTML}} --> プレースホルダーが見つかりません。");
    }

    const safeTitle = regionTitle ? escapeHtml(regionTitle) : "明日釣りに行くんだけど良い場所ある？";
    const safeBody = regionHtml || "おすすめスポットを分析中...";

    html = html.replace(titlePattern, () => safeTitle);
    html = html.replace(bodyPattern, () => safeBody);

    if (basisTitlePattern.test(html)) {
        html = html.replace(basisTitlePattern, () => escapeHtml(basisTitle || "明日のオススメ釣り場 選出根拠・データ一覧"));
    }
    if (basisBodyPattern.test(html)) {
        html = html.replace(basisBodyPattern, () => basisHtml || "");
    }

    return html;
}

// ==========================================
// メイン実行
// ==========================================
try {
    const todayInfo = getJstParts(0);
    const tomorrowInfo = getJstParts(1);

    const prefCodes = discoverPrefCodes();
    if (prefCodes.length === 0) {
        throw new Error(`*_location.json が見つかりません: ${REGION_DIR}`);
    }

    const snsCatchData = readJsonOptional(CATCH_JSON_PATH, "統合SNS釣果JSON") || [];

    const prefDataList = [];
    const allRegionSpots = [];
    for (const prefCode of prefCodes) {
        const prefData = loadPrefDataWithWeather(prefCode, todayInfo.utcMs);
        if (!prefData) continue;
        prefDataList.push(prefData);
        allRegionSpots.push(...prefData.spots);
    }

    // 1. 関東全域ランキング算出（最大5件）
    const regionItems = buildRankingForSpots(allRegionSpots, snsCatchData, todayInfo.utcMs, tomorrowInfo.iso, 5);
    const regionTitle = `明日（${tomorrowInfo.label}）${SHORT_REGION_NAME}で釣りに行くんだけど良い場所ある？`;
    const regionHtml = renderRankingListHtml(regionItems, "REGION", tomorrowInfo.iso);

    // 2. 各県別ランキング算出（最大6件）
    const prefResults = [];
    for (const prefData of prefDataList) {
        const items = buildRankingForSpots(prefData.spots, snsCatchData, todayInfo.utcMs, tomorrowInfo.iso, 6);
        const title = `明日（${tomorrowInfo.label}）${prefData.prefName}で釣りに行くんだけど良い場所ある？`;
        const html = renderRankingListHtml(items, prefData.prefCode, tomorrowInfo.iso);

        prefResults.push({
            prefCode: prefData.prefCode,
            prefName: prefData.prefName,
            title,
            html,
            items
        });
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // 出力1: AI用・根拠付きランキングMD（ai-data/KANTO_tomorrow.md）
    const tomorrowMd = buildTomorrowMarkdown(todayInfo, tomorrowInfo, regionItems, prefResults);
    fs.writeFileSync(TOMORROW_MD_PATH, tomorrowMd, "utf8");

    // 出力2: ai-data/*.md 全件を超軽量静的HTML（ai-data/*.html）＋目次（ai-data/index.html）へ一括変換
    const dataCatalog = syncAiDataHtmlPages(OUTPUT_DIR, todayInfo);

    // 出力3: 静的ポップアップ用HTML（関東全域＋各県別）を生成し、ranking_cache.json へ格納
    const regionBasisTitle = `明日（${tomorrowInfo.label}）${SHORT_REGION_NAME}のおすすめ選出根拠・データ一覧`;
    const regionBasisHtml = buildBasisPopupHtml({
        scopeLabel: SHORT_REGION_NAME,
        tomorrowInfo,
        items: regionItems,
        dataCatalog,
        currentPrefCode: null
    });

    const prefsCacheMap = {};
    for (const pr of prefResults) {
        const prefBasisTitle = `明日（${tomorrowInfo.label}）${pr.prefName}のおすすめ選出根拠・データ一覧`;
        const prefBasisHtml = buildBasisPopupHtml({
            scopeLabel: pr.prefName,
            tomorrowInfo,
            items: pr.items,
            dataCatalog,
            currentPrefCode: pr.prefCode
        });

        prefsCacheMap[pr.prefCode] = {
            prefCode: pr.prefCode,
            prefName: pr.prefName,
            title: pr.title,
            html: pr.html,
            basisTitle: prefBasisTitle,
            basisHtml: prefBasisHtml,
            count: pr.items.length
        };
    }

    const cachePayload = {
        regionCode: REGION_CODE,
        generatedDate: todayInfo.iso,
        targetDate: tomorrowInfo.iso,
        targetLabel: tomorrowInfo.label,
        region: {
            title: regionTitle,
            html: regionHtml,
            basisTitle: regionBasisTitle,
            basisHtml: regionBasisHtml,
            count: regionItems.length
        },
        prefs: prefsCacheMap
    };
    fs.writeFileSync(RANKING_CACHE_PATH, JSON.stringify(cachePayload, null, 2), "utf8");

    // 出力4: 原本テンプレートから静的HTMLを生成（テスト時は index2.html、本番時は index.html）
    const builtHtml = buildHtmlFromTemplate(TEMPLATE_PATH, regionTitle, regionHtml, regionBasisTitle, regionBasisHtml);
    fs.writeFileSync(OUTPUT_HTML_PATH, builtHtml, "utf8");

    console.log(`明日のオススメランキング・静的ポップアップ・軽量HTMLの生成が完了しました（対象日: ${tomorrowInfo.iso}）`);
    console.log(`  対象県(${prefCodes.length}): ${prefCodes.join(", ")}`);
    console.log(`  関東全域トップ: ${regionItems.map(i => `${i.name}(${i.score}点/基礎${i.baseScore}/降水-${i.popPenaltyPct}%/風-${i.windPenaltyPct}%)`).join("、") || "なし"}`);
    for (const pr of prefResults) {
        console.log(`  [${pr.prefCode}] ${pr.items.length}件: ${pr.items.map(i => `${i.name}(${i.score})`).join("、") || "なし"}`);
    }
    console.log(`  出力HTML     : ${OUTPUT_HTML_PATH}`);
    console.log(`  出力JSON     : ${RANKING_CACHE_PATH}`);
    console.log(`  出力MD       : ${TOMORROW_MD_PATH}`);
    console.log(`  軽量HTML生成 : ${dataCatalog.generatedHtmlCount}ファイル（ai-data/*.html + index.html）`);
} catch (error) {
    console.error("ランキング＆静的HTML生成エラー:", error);
    process.exit(1);
}
