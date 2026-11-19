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

// ==========================================
// リージョン内全県のスポット＋天気ロード
// ==========================================
function discoverPrefCodes() {
    if (!fs.existsSync(REGION_DIR)) {
        throw new Error("リージョンディレクトリが見つかりません: " + REGION_DIR);
    }
    const found = fs.readdirSync(REGION_DIR)
        .filter(name => /_location\.json$/i.test(name))
        .map(name => name.replace(/_location\.json$/i, "").toUpperCase());

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
    let maxWind = -Infinity;
    let maxTemp = -Infinity;
    let minTemp = Infinity;
    let maxWave = -Infinity;
    let popTotal = 0;
    let popCount = 0;

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

        if (typeof pop === "number" && hour >= 5 && hour <= 20) {
            maxPop = Math.max(maxPop, pop);
            popTotal += pop;
            popCount++;
        }
        if (typeof wind === "number") maxWind = Math.max(maxWind, wind);
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
    const weatherScore = Math.max(0, 100 - averagePop * 0.7);
    const waterTempAvg = typeof dayData?.oneday?.avg === "number" ? Math.round(dayData.oneday.avg) : null;

    return {
        averagePop,
        weatherScore,
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

        const tomorrowDayData = spot.whether?.hourly?.[1];
        if (!tomorrowDayData || !Array.isArray(tomorrowDayData.weather)) continue;

        const wDetail = extractTomorrowWeatherDetail(tomorrowDayData);
        if (!wDetail) continue;

        const nearbyPosts = getNearbySnsCatchRecords(spot, snsCatchData, todayUtcMs);
        const snsBonus = getSnsCatchBonus(nearbyPosts);
        const totalScore = Math.round(wDetail.weatherScore + snsBonus);

        candidates.push({
            name: spot.name,
            prefCode: spot._prefCode,
            prefName: spot._prefName,
            areaName: spot._areaName,
            areaMdFile: spot._areaMdFile,
            url: buildSpotUrl(spot),
            fullUrl: SITE_URL + buildSpotUrl(spot),
            score: totalScore,
            weatherScore: Math.round(wDetail.weatherScore),
            snsBonus,
            hasSnsBonus: snsBonus > 0,
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
    if (!topItems || topItems.length === 0) return "";

    let html = `<ul data-ssg-ranking="${escapeHtml(scopeTag)}" data-target-date="${escapeHtml(tomorrowIso)}" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;">`;
    for (const item of topItems) {
        const windHtml = item.wind !== null
            ? `<span>風: <strong style="color:#191970;">${item.wind}m</strong></span>`
            : "";
        const snsHtml = item.hasSnsBonus
            ? `<span style="position:absolute; right:12px; bottom:5px; font-size:6px; line-height:1; color:#687386; white-space:nowrap;">SNS釣果あり</span>`
            : "";

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

    lines.push(`- **総合スコア**: ${item.score}点（天候スコア ${item.weatherScore}点 + 直近SNS釣果加点 ${item.snsBonus}点）`);
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
    lines.push("- 天候スコア: 明日5時〜20時の平均降水確率に基づく評価（100点満点）");
    lines.push("- SNS釣果加点: 周辺10km圏内の最新投稿経過日数に応じて加点（1日以内+15点 / 3日以内+12点 / 6日以内+9点 / 10日以内+5点 / 14日以内+2点）");
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
// 原本 template/index.txt から静的HTMLをビルド
// ==========================================
function buildHtmlFromTemplate(templatePath, regionTitle, regionHtml) {
    if (!fs.existsSync(templatePath)) {
        throw new Error(`原本テンプレートが見つかりません: ${templatePath}`);
    }
    let html = fs.readFileSync(templatePath, "utf8");

    const titlePattern = /<!--\s*\{\{RANKING_TITLE\}\}\s*-->[\s\S]*?<!--\s*\{\{\/RANKING_TITLE\}\}\s*-->/;
    const bodyPattern = /<!--\s*\{\{RANKING_HTML\}\}\s*-->[\s\S]*?<!--\s*\{\{\/RANKING_HTML\}\}\s*-->/;

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
    const prefsCacheMap = {};
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

        prefsCacheMap[prefData.prefCode] = {
            prefCode: prefData.prefCode,
            prefName: prefData.prefName,
            title,
            html,
            count: items.length
        };
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // 出力1: フロント差し替え用キャッシュJSON（ai-data/ranking_cache.json）
    const cachePayload = {
        regionCode: REGION_CODE,
        generatedDate: todayInfo.iso,
        targetDate: tomorrowInfo.iso,
        targetLabel: tomorrowInfo.label,
        region: {
            title: regionTitle,
            html: regionHtml,
            count: regionItems.length
        },
        prefs: prefsCacheMap
    };
    fs.writeFileSync(RANKING_CACHE_PATH, JSON.stringify(cachePayload, null, 2), "utf8");

    // 出力2: AI用・根拠付きランキングMD（ai-data/KANTO_tomorrow.md）
    const tomorrowMd = buildTomorrowMarkdown(todayInfo, tomorrowInfo, regionItems, prefResults);
    fs.writeFileSync(TOMORROW_MD_PATH, tomorrowMd, "utf8");

    // 出力3: 原本テンプレートから静的HTMLを生成（テスト時は index2.html、本番時は index.html）
    const builtHtml = buildHtmlFromTemplate(TEMPLATE_PATH, regionTitle, regionHtml);
    fs.writeFileSync(OUTPUT_HTML_PATH, builtHtml, "utf8");

    console.log(`明日のオススメランキング＆静的HTMLの生成が完了しました（対象日: ${tomorrowInfo.iso}）`);
    console.log(`  関東全域トップ: ${regionItems.map(i => `${i.name}(${i.score}点)`).join("、") || "なし"}`);
    for (const pr of prefResults) {
        console.log(`  [${pr.prefCode}] ${pr.items.length}件: ${pr.items.map(i => `${i.name}(${i.score})`).join("、") || "なし"}`);
    }
    console.log(`  出力HTML : ${OUTPUT_HTML_PATH}`);
    console.log(`  出力JSON : ${RANKING_CACHE_PATH}`);
    console.log(`  出力MD   : ${TOMORROW_MD_PATH}`);
} catch (error) {
    console.error("ランキング＆静的HTML生成エラー:", error);
    process.exit(1);
}
