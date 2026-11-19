import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ==========================================
// 使い方:
//   node script/generate_pref_md.js CHIBA KANTO
//   node script/generate_pref_md.js TOKYO KANTO
//   node script/generate_pref_md.js KANAGAWA KANTO
//   node script/generate_pref_md.js IBARAKI KANTO
//   node script/generate_pref_md.js CHIBA,TOKYO,KANAGAWA,IBARAKI KANTO
//   node script/generate_pref_md.js ALL KANTO
//   node script/generate_pref_md.js LLMS KANTO   ※ai-data/*.mdから /llms.txt のみ再生成
// ==========================================
const TARGET_ARG = (process.argv[2] || process.env.PREF_CODE || "CHIBA").trim().toUpperCase();
const REGION_CODE = (process.argv[3] || process.env.REGION_CODE || "KANTO").trim().toUpperCase();

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

const REGION_NAME = REGION_NAME_MAP[REGION_CODE] || REGION_CODE;
const SITE_URL = "https://turiiko-navi.com";

// 総スポット数がこの件数以上かつエリアが2つ以上ある場合にエリア別MDへ分割する
const AREA_SPLIT_THRESHOLD = Number(process.env.AREA_SPLIT_THRESHOLD || 15);

const REGION_DIR = path.join(ROOT, REGION_CODE);
const GEO_PATH = path.join(ROOT, "data", `${REGION_CODE}_geo.json`);
const OUTPUT_DIR = path.join(ROOT, "ai-data");
const LLMS_OUTPUT_PATH = path.join(ROOT, "llms.txt");

const PREF_DISPLAY_ORDER = [
    "CHIBA",
    "KANAGAWA",
    "TOKYO",
    "IBARAKI",
    "SAITAMA",
    "GUNMA"
];

function readJsonRequired(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error("必須入力ファイルが見つかりません: " + filePath);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonOptional(filePath, label) {
    if (!fs.existsSync(filePath)) {
        console.warn(`[WARN] ${label}が見つからないためスキップします: ${filePath}`);
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
        console.warn(`[WARN] ${label}のJSON読み込みに失敗したためスキップします: ${filePath} (${err.message})`);
        return null;
    }
}

function discoverPrefCodes(regionDir) {
    if (!fs.existsSync(regionDir)) {
        throw new Error("リージョンディレクトリが見つかりません: " + regionDir);
    }
    return fs.readdirSync(regionDir)
        .filter(name => /_location\.json$/i.test(name))
        .map(name => name.replace(/_location\.json$/i, "").toUpperCase())
        .sort();
}

function hasZoom(value) {
    return value !== undefined &&
        value !== null &&
        String(value).trim() !== "" &&
        Number.isFinite(Number(value));
}

function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sanitizeFileSegment(value) {
    return String(value ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "_");
}

function getJstDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

// ==========================================
// 距離・方位計算（dataLoader.js と同一ロジック）
// ==========================================
function getBearing(lat1, lng1, lat2, lng2) {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const dLng = (lng2 - lng1) * toRad;
    const y = Math.sin(dLng) * Math.cos(lat2 * toRad);
    const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
        Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLng);
    const bearing = Math.atan2(y, x) * toDeg;
    return (bearing + 360) % 360;
}

function getAngleDiff(b1, b2) {
    let diff = Math.abs(b1 - b2);
    if (diff > 180) diff = 360 - diff;
    return diff;
}

function calcDistanceMeters(lat1, lng1, lat2, lng2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ==========================================
// アクセス情報算出（dataLoader.js calcAccessInfo と同一ロジック）
// ==========================================
function calcAccessInfo(spotLat, spotLng, icData) {
    if (!Array.isArray(icData) || icData.length === 0) return [];
    const baseLat = Number(spotLat);
    const baseLng = Number(spotLng);
    if (!Number.isFinite(baseLat) || !Number.isFinite(baseLng)) return [];

    const mappedData = [];
    for (const item of icData) {
        if (!item) continue;
        const iLat = Number(item.lat);
        const iLng = Number(item.lng);
        if (!Number.isFinite(iLat) || !Number.isFinite(iLng)) continue;
        const distance = calcDistanceMeters(baseLat, baseLng, iLat, iLng);
        const bearing = getBearing(baseLat, baseLng, iLat, iLng);
        mappedData.push({ ...item, lat: iLat, lng: iLng, distance, bearing });
    }

    mappedData.sort((a, b) => a.distance - b.distance);

    const icList = mappedData.filter(d => d.category && d.category.includes("IC"));
    const stationList = mappedData.filter(d => d.category && d.category.includes("駅"));
    const mallList = mappedData.filter(d => d.category && (d.category.includes("商業") || d.category.includes("道の駅")));

    const results = [];
    const firstIC = icList[0];

    if (firstIC) {
        results.push(firstIC);

        if (firstIC.distance <= 15000) {
            const secondIC = icList.find(ic => getAngleDiff(firstIC.bearing, ic.bearing) >= 90);

            // 20km以上の対岸IC弾き処理
            if (secondIC && (secondIC.distance - firstIC.distance) < 20000) {
                results.push(secondIC);
            } else if (mallList.length > 0) {
                results.push(mallList[0]);
            }
        } else if (mallList.length > 0) {
            results.push(mallList[0]);
        }
    }

    // 徒歩15分以内の駅のみ追加
    if (stationList.length > 0) {
        const nearestStation = stationList[0];
        const realDistKm = (nearestStation.distance * 1.35) / 1000;
        const walkTime = Math.round(realDistKm * 15);

        if (walkTime <= 15) {
            results.push(nearestStation);
        }
    }

    return results.map(item => {
        const realDistKm = (item.distance * 1.35) / 1000;
        let displayName = cleanText(item.name);

        if (item.category === "駅" && !displayName.endsWith("駅")) {
            displayName += "駅";
        } else if (item.category === "IC" && !displayName.includes("IC") && !displayName.includes("JCT")) {
            displayName += "IC";
        }

        if (item.category === "駅") {
            const time = Math.round(realDistKm * 15);
            return `${displayName}から徒歩 約${time}分`;
        } else if (item.category === "商業施設" || item.category === "道の駅") {
            const time = Math.round(realDistKm * 1.5);
            return `${displayName}から車で 約${time}分 (${realDistKm.toFixed(1)}km)`;
        } else {
            const time = Math.round(realDistKm * 1.5);
            return `${displayName}から約${time}分 (${realDistKm.toFixed(1)}km)`;
        }
    });
}

// ==========================================
// 最寄り釣具店算出（dataLoader.js renderShopSection と同一ロジック）
// ==========================================
function normalizeShopList(rawShopData) {
    if (!rawShopData) return [];

    const rawList = [];
    if (Array.isArray(rawShopData)) {
        rawList.push(...rawShopData);
    } else if (Array.isArray(rawShopData.shops)) {
        rawList.push(...rawShopData.shops);
    } else if (typeof rawShopData === "object") {
        for (const val of Object.values(rawShopData)) {
            if (Array.isArray(val)) rawList.push(...val);
        }
    }

    const seen = new Set();
    const valid = [];
    for (const shop of rawList) {
        if (!shop || typeof shop !== "object") continue;
        const lat = Number(shop.lat);
        const lng = Number(shop.lng);
        const name = cleanText(shop.name);
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const key = `${name}_${lat}_${lng}`;
        if (seen.has(key)) continue;
        seen.add(key);

        valid.push({
            ...shop,
            name,
            lat,
            lng
        });
    }
    return valid;
}

function calcNearestShops(spot, allValidShops) {
    if (!Array.isArray(allValidShops) || allValidShops.length === 0) return [];
    const spotLat = Number(spot.lat);
    const spotLng = Number(spot.lng);
    if (!Number.isFinite(spotLat) || !Number.isFinite(spotLng)) return [];

    const sortedShops = allValidShops
        .map(s => ({
            ...s,
            distance: calcDistanceMeters(spotLat, spotLng, s.lat, s.lng)
        }))
        .sort((a, b) => a.distance - b.distance);

    if (sortedShops.length === 0) return [];

    const displayShops = [];

    // 1. ショップicon縛り(shop4以外)の最寄り1件を追加
    const firstShop = sortedShops.find(s => s.icon !== "shop4");
    if (firstShop) {
        displayShops.push(firstShop);
    }

    // 2. representative / assistant / substitute の場合は icon 縛りなしで2件追加
    const typeParts = String(spot.type || "").split("$");
    const isMainSpot = typeParts.includes("representative") ||
        typeParts.includes("assistant") ||
        typeParts.includes("substitute");

    if (isMainSpot) {
        let addedCount = 0;
        for (const shop of sortedShops) {
            if (addedCount >= 2) break;
            if (displayShops.some(s => s.name === shop.name && s.lat === shop.lat && s.lng === shop.lng)) {
                continue;
            }
            displayShops.push(shop);
            addedCount++;
        }
    }

    return displayShops.map(shop => {
        const realDistKm = (shop.distance * 1.35) / 1000;
        const time = Math.round(realDistKm * 1.5);
        const group = cleanText(shop.group);
        const shopName = group && group !== "個人商店" && group !== "shop"
            ? `${group} ${shop.name}`
            : shop.name;

        return `${shopName} まで車で 約${time}分 (${realDistKm.toFixed(1)}km)`;
    });
}

// ==========================================
// 逆引き辞書・魚種データ抽出
// ==========================================
function buildFishFlatDict(fishData) {
    const flat = new Map();
    if (!fishData || typeof fishData !== "object") return flat;
    for (const areaSpots of Object.values(fishData)) {
        if (!areaSpots || typeof areaSpots !== "object") continue;
        for (const [spotName, spotFishObj] of Object.entries(areaSpots)) {
            if (!flat.has(spotName)) flat.set(spotName, spotFishObj);
        }
    }
    return flat;
}

function getRegisteredFish(spotFishData) {
    if (!spotFishData || typeof spotFishData !== "object") return [];

    const names = [];

    for (const [fishName, info] of Object.entries(spotFishData)) {
        // フロントの対象魚種表示と同様、施設名などを除外する。
        if (!/^[ァ-ヴー]+$/.test(fishName)) continue;
        if (!info || typeof info.coords !== "string" || info.coords === "") continue;

        const hasValidPoint = info.coords.split("|").some(point => {
            const parts = point.split(",");
            return Boolean(parts[0] && parts[1]);
        });

        if (hasValidPoint) names.push(fishName);
    }

    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ja"));
}

function normalizeDictionaryEntry(entry) {
    if (!entry || typeof entry !== "object") return null;

    const addressRegion = cleanText(entry.addressRegion);
    const addressLocality = cleanText(entry.addressLocality);
    const address = `${addressRegion}${addressLocality}`;

    const regionalName = cleanText(entry.regionalName);
    const waterName = cleanText(entry.waterName);
    const fishingCooperative = cleanText(entry.fishingCooperative);
    const description = cleanText(entry.description);

    let alternateNames = [];
    if (Array.isArray(entry.alternateName)) {
        alternateNames = entry.alternateName.map(cleanText).filter(Boolean);
    } else if (typeof entry.alternateName === "string") {
        alternateNames = entry.alternateName.split(/[,、・]/).map(cleanText).filter(Boolean);
    }

    return {
        address,
        addressRegion,
        addressLocality,
        regionalName,
        waterName,
        alternateNames,
        fishingCooperative,
        description
    };
}

function makePrefMapUrl(prefName) {
    return SITE_URL + "/?region=" + encodeURIComponent(REGION_NAME) +
        "&pref=" + encodeURIComponent(prefName);
}

function makeSpotMapUrl(prefName, areaName, spotName) {
    return SITE_URL + "/?region=" + encodeURIComponent(REGION_NAME) +
        "&pref=" + encodeURIComponent(prefName) +
        "&area=" + encodeURIComponent(areaName) +
        "&spot=" + encodeURIComponent(spotName);
}

// ==========================================
// 1スポット分のMarkdownブロック整形
// ==========================================
function renderSpotLines(record, prefCode, headingLevel = "###") {
    const lines = [];
    const spot = record.source;
    const dict = record.dict;

    lines.push(`${headingLevel} ${record.name}`);
    lines.push("");

    // 見出し直下に解説文（逆引き辞書 description）を配置してAIのパッセージ抽出精度を高める
    if (dict && dict.description) {
        lines.push(dict.description);
        lines.push("");
    }

    if (dict) {
        if (dict.address) {
            lines.push(`- 所在地: ${dict.address}`);
        }
        const geoTags = [dict.waterName, dict.regionalName].filter(Boolean);
        if (geoTags.length > 0) {
            lines.push(`- 水域・地域呼称: ${geoTags.join(" / ")}`);
        }
        if (dict.alternateNames.length > 0) {
            lines.push(`- 別名・通称: ${dict.alternateNames.join("、")}`);
        }
        if (dict.fishingCooperative) {
            lines.push(`- 管轄・関係漁協: ${dict.fishingCooperative}`);
        }
    }

    if (Number.isFinite(Number(spot.lat)) && Number.isFinite(Number(spot.lng))) {
        lines.push(`- 座標: ${Number(spot.lat).toFixed(6)}, ${Number(spot.lng).toFixed(6)}`);
    }

    if (record.fishNames.length > 0) {
        lines.push(`- 登録魚種: ${record.fishNames.join("、")}`);
    } else {
        lines.push(`- 登録魚種: ${prefCode}_fish.jsonに登録なし`);
    }

    if (record.accessTexts.length > 0) {
        lines.push(`- アクセス: ${record.accessTexts.join(" / ")}`);
    }

    if (record.shopTexts.length > 0) {
        lines.push(`- 最寄りの釣具店: ${record.shopTexts.join(" / ")}`);
    }

    lines.push(`- 地図: [${record.name}](${record.mapUrl})`);
    lines.push("");

    return lines;
}

// ==========================================
// 1県分のMarkdown一式ビルド
// ==========================================
function buildPrefMarkdown({ prefCode, locationData, fishData, dictionaryData, icData, shopList, updatedDate }) {
    const prefNameFallback = PREF_NAME_FALLBACK_MAP[prefCode] || prefCode;

    const prefRow = locationData.find(row =>
        row.name === prefCode && row.individualId === "parent"
    );
    const prefName = cleanText(prefRow?.notes) || prefNameFallback;

    const areaRows = locationData.filter(row =>
        row.areaId === prefCode && row.individualId && row.individualId !== "parent"
    );
    const areaMap = new Map();
    areaRows.forEach(area => {
        const areaKey = area.areaId + "_" + area.individualId;
        areaMap.set(areaKey, {
            areaKey,
            fileName: `${sanitizeFileSegment(areaKey)}.md`,
            name: cleanText(area.name),
            notes: cleanText(area.notes),
            source: area
        });
    });

    // 正規スポット: zoom指定あり、エリア所属、アイコンあり。
    const spots = locationData.filter(row =>
        hasZoom(row.zoom) &&
        row.type !== "pref" &&
        row.type !== "area" &&
        typeof row.areaId === "string" &&
        row.areaId.startsWith(prefCode + "_") &&
        typeof row.icon === "string" &&
        row.icon.trim() !== ""
    );

    if (spots.length === 0) {
        throw new Error(`正規スポットが0件です。抽出条件と${prefCode}_location.jsonを確認してください。`);
    }

    const fishFlatDict = buildFishFlatDict(fishData);

    const spotRecords = spots.map(spot => {
        const spotName = cleanText(spot.name);
        const areaInfo = areaMap.get(spot.areaId);
        const areaName = areaInfo ? areaInfo.name : spot.areaId;
        const areaFileName = areaInfo ? areaInfo.fileName : `${sanitizeFileSegment(spot.areaId)}.md`;

        const spotFishObj = fishData?.[spot.areaId]?.[spot.name] ?? fishFlatDict.get(spot.name);
        const fishNames = getRegisteredFish(spotFishObj);

        const rawDictEntry = dictionaryData && typeof dictionaryData === "object"
            ? (dictionaryData[spotName] || dictionaryData[spot.name] || null)
            : null;
        const dict = normalizeDictionaryEntry(rawDictEntry);

        const accessTexts = calcAccessInfo(spot.lat, spot.lng, icData);
        const shopTexts = calcNearestShops(spot, shopList);

        return {
            source: spot,
            name: spotName,
            areaKey: spot.areaId,
            areaName,
            areaFileName,
            fishNames,
            dict,
            accessTexts,
            shopTexts,
            mapUrl: makeSpotMapUrl(prefName, areaName, spot.name)
        };
    });

    const activeAreas = [];
    for (const areaInfo of areaMap.values()) {
        const records = spotRecords.filter(r => r.areaKey === areaInfo.areaKey);
        if (records.length > 0) {
            activeAreas.push({ ...areaInfo, records });
        }
    }

    const shouldSplitByArea = spotRecords.length >= AREA_SPLIT_THRESHOLD && activeAreas.length > 1;

    const fishToSpots = new Map();
    spotRecords.forEach(record => {
        record.fishNames.forEach(fishName => {
            if (!fishToSpots.has(fishName)) fishToSpots.set(fishName, []);
            fishToSpots.get(fishName).push(record);
        });
    });

    const fishSpecies = [...fishToSpots.keys()].sort((a, b) => a.localeCompare(b, "ja"));
    const spotsWithFish = spotRecords.filter(r => r.fishNames.length > 0);
    const spotsWithDict = spotRecords.filter(r => r.dict && r.dict.description);
    const spotsWithoutDict = spotRecords.filter(r => !r.dict || !r.dict.description);
    const spotsWithAccess = spotRecords.filter(r => r.accessTexts.length > 0);
    const spotsWithShops = spotRecords.filter(r => r.shopTexts.length > 0);

    const sourcesList = [`${REGION_CODE}/${prefCode}_location.json`];
    if (fishData) sourcesList.push(`${REGION_CODE}/${prefCode}_fish.json`);
    if (dictionaryData) sourcesList.push(`${REGION_CODE}/${prefCode}_dictionary.json`);
    if (Array.isArray(icData) && icData.length > 0) sourcesList.push(`data/${REGION_CODE}_geo.json`);
    if (shopList.length > 0) sourcesList.push(`${REGION_CODE}/${prefCode}_shop.json`);
    const sourceFooter = "データ出典: " + sourcesList.join("、");
    const prefMapUrl = makePrefMapUrl(prefName);

    // ------------------------------------------
    // 1. 親ハブMD（{PREF}.md）
    // ------------------------------------------
    const mainLines = [];
    mainLines.push("---");
    mainLines.push(`title: "${prefName}の釣りスポット情報"`);
    mainLines.push(`pref_code: "${prefCode}"`);
    mainLines.push(`pref_name: "${prefName}"`);
    mainLines.push(`split_by_area: ${shouldSplitByArea}`);
    mainLines.push(`last_updated: "${updatedDate}"`);
    mainLines.push('timezone: "Asia/Tokyo"');
    mainLines.push('source: "釣り行こNAVI"');
    mainLines.push("---");
    mainLines.push("");
    mainLines.push(`# ${prefName}の釣りスポット一覧`);
    mainLines.push("");
    mainLines.push("> 本ファイルは釣り行こNAVIのスポット情報を、AIが参照しやすいMarkdownにまとめたものです。");
    mainLines.push(`> 正規スポットは${prefCode}_location.jsonのうち、zoomが指定され、エリアに所属し、アイコンが設定された行を対象としています。`);
    mainLines.push(`> 登録魚種は${prefCode}_fish.jsonに記録された魚種名を使用し、別名統合や推測による追加は行っていません。`);
    mainLines.push("> 登録魚種はサイト内データ上の対象魚種を示すもので、現在の釣果や釣獲を保証するものではありません。");
    mainLines.push("> アクセス時間・距離は直線距離に道路係数（1.35倍）を掛けた概算値です。現地の最新規制・駐車ルールは必ず現地表示をご確認ください。");
    mainLines.push("");
    mainLines.push("## データ概要");
    mainLines.push("");
    mainLines.push(`- 対象都道府県: ${prefName}`);
    mainLines.push(`- 正規スポット数: ${spotRecords.length}件（${activeAreas.length}エリア）`);
    mainLines.push(`- 解説・逆引き辞書登録スポット: ${spotsWithDict.length}件`);
    mainLines.push(`- 登録魚種があるスポット: ${spotsWithFish.length}件`);
    mainLines.push(`- 登録魚種の種類数: ${fishSpecies.length}種`);
    mainLines.push(`- 地図サイト（${prefName}）: ${prefMapUrl}`);
    mainLines.push("");
    mainLines.push("## 関連データ");
    mainLines.push("");
    mainLines.push(`- 魚種別の釣り場一覧: [${prefCode}_fish.md](${prefCode}_fish.md)`);
    mainLines.push(`- 最新SNS釣果データ: [${prefCode}_catch.md](${prefCode}_catch.md)`);
    mainLines.push("");

    const areaFiles = [];

    if (shouldSplitByArea) {
        mainLines.push("## エリア別スポット詳細ファイル");
        mainLines.push("");
        mainLines.push("情報量が多いため、各スポットの詳細（解説文・所在地・漁協・登録魚種・アクセス・最寄り釣具店）はエリア別のMarkdownファイルに分割しています。");
        mainLines.push("");

        activeAreas.forEach(area => {
            mainLines.push(`### ${area.name}（${area.records.length}スポット）`);
            mainLines.push("");
            if (area.notes) {
                mainLines.push(area.notes);
                mainLines.push("");
            }
            mainLines.push(`- 詳細ファイル: [${area.fileName}](${area.fileName})`);
            mainLines.push(`- 掲載スポット: ${area.records.map(r => r.name).join("、")}`);
            mainLines.push("");

            // ------------------------------------------
            // 2. エリア別MD（{PREF}_{AREA}.md）
            // ------------------------------------------
            const areaLines = [];
            areaLines.push("---");
            areaLines.push(`title: "${prefName} ${area.name}の釣りスポット情報"`);
            areaLines.push(`pref_code: "${prefCode}"`);
            areaLines.push(`pref_name: "${prefName}"`);
            areaLines.push(`area_id: "${area.areaKey}"`);
            areaLines.push(`area_name: "${area.name}"`);
            areaLines.push(`spot_count: ${area.records.length}`);
            areaLines.push(`last_updated: "${updatedDate}"`);
            areaLines.push('timezone: "Asia/Tokyo"');
            areaLines.push('source: "釣り行こNAVI"');
            areaLines.push("---");
            areaLines.push("");
            areaLines.push(`# ${prefName} ${area.name}の釣りスポット一覧`);
            areaLines.push("");
            areaLines.push(`> 本ファイルは釣り行こNAVIの「${prefName}・${area.name}」に所属する正規スポット${area.records.length}件の詳細情報をまとめたものです。`);
            areaLines.push("> 登録魚種はサイト内データ上の対象魚種を示すもので、現在の釣果や釣獲を保証するものではありません。");
            areaLines.push("> アクセス時間・距離は直線距離に道路係数（1.35倍）を掛けた概算値です。");
            areaLines.push("");

            if (area.notes) {
                areaLines.push("## エリア概要");
                areaLines.push("");
                areaLines.push(area.notes);
                areaLines.push("");
            }

            areaLines.push("## ナビゲーション");
            areaLines.push("");
            areaLines.push(`- 都道府県トップ: [${prefName}の釣りスポット一覧（${prefCode}.md）](${prefCode}.md)`);
            areaLines.push(`- 魚種別の釣り場一覧: [${prefCode}_fish.md](${prefCode}_fish.md)`);
            areaLines.push(`- 最新SNS釣果データ: [${prefCode}_catch.md](${prefCode}_catch.md)`);
            const siblingLinks = activeAreas
                .filter(other => other.areaKey !== area.areaKey)
                .map(other => `[${other.name}](${other.fileName})`);
            if (siblingLinks.length > 0) {
                areaLines.push(`- 同県の他エリア: ${siblingLinks.join(" / ")}`);
            }
            areaLines.push("");

            areaLines.push("## 掲載スポット一覧");
            areaLines.push("");
            areaLines.push(area.records.map(r => r.name).join("、"));
            areaLines.push("");

            areaLines.push("## スポット詳細");
            areaLines.push("");

            area.records.forEach(record => {
                areaLines.push(...renderSpotLines(record, prefCode, "###"));
            });

            areaLines.push("---");
            areaLines.push("");
            areaLines.push(sourceFooter);
            areaLines.push("");

            areaFiles.push({
                areaKey: area.areaKey,
                areaName: area.name,
                fileName: area.fileName,
                filePath: path.join(OUTPUT_DIR, area.fileName),
                spotCount: area.records.length,
                content: areaLines.join("\n")
            });
        });
    } else {
        // 閾値未満の県は1ファイルに統合出力
        mainLines.push("## エリア別スポット情報");
        mainLines.push("");

        activeAreas.forEach(area => {
            mainLines.push(`### ${area.name}`);
            mainLines.push("");
            mainLines.push(`スポット数: ${area.records.length}件`);
            mainLines.push("");
            if (area.notes) {
                mainLines.push(area.notes);
                mainLines.push("");
            }
            area.records.forEach(record => {
                mainLines.push(...renderSpotLines(record, prefCode, "####"));
            });
        });
    }

    mainLines.push("---");
    mainLines.push("");
    mainLines.push(sourceFooter);
    mainLines.push("");

    // ------------------------------------------
    // 3. 魚種逆引きMD（{PREF}_fish.md）
    // ------------------------------------------
    const fishLines = [];
    fishLines.push("---");
    fishLines.push(`title: "${prefName}の魚種別釣り場一覧"`);
    fishLines.push(`pref_code: "${prefCode}"`);
    fishLines.push(`pref_name: "${prefName}"`);
    fishLines.push(`last_updated: "${updatedDate}"`);
    fishLines.push('timezone: "Asia/Tokyo"');
    fishLines.push('source: "釣り行こNAVI"');
    fishLines.push("---");
    fishLines.push("");
    fishLines.push(`# ${prefName}の魚種別釣り場一覧`);
    fishLines.push("");
    fishLines.push("> 本ファイルは、魚種名から対象スポットを逆引きするための一覧です。");
    fishLines.push(`> 魚種名は${prefCode}_fish.jsonの登録名をそのまま使用し、別名統合や推測による追加は行っていません。`);
    fishLines.push("> 登録はサイト内データ上の対象魚種を示すもので、現在の釣果や釣獲を保証するものではありません。");
    fishLines.push("");
    fishLines.push(`- スポット情報トップ: [${prefCode}.md](${prefCode}.md)`);
    if (shouldSplitByArea) {
        fishLines.push(`- エリア別詳細: ${activeAreas.map(a => `[${a.name}](${a.fileName})`).join(" / ")}`);
    }
    fishLines.push(`- 最新SNS釣果データ: [${prefCode}_catch.md](${prefCode}_catch.md)`);
    fishLines.push("");
    fishLines.push("## 魚種から釣り場を探す");
    fishLines.push("");
    fishLines.push(`各魚種名は${prefCode}_fish.jsonの登録名をそのまま使用しています。`);
    fishLines.push("");

    if (fishSpecies.length === 0) {
        fishLines.push("現在登録されている魚種データはありません。");
        fishLines.push("");
    } else {
        fishSpecies.forEach(fishName => {
            const records = fishToSpots.get(fishName);
            fishLines.push(`### ${fishName}（${records.length}スポット）`);
            fishLines.push("");
            fishLines.push(records.map(record => `${record.name}（${record.areaName}）`).join("、"));
            fishLines.push("");
        });
    }

    fishLines.push("---");
    fishLines.push("");
    fishLines.push(`データ出典: ${REGION_CODE}/${prefCode}_location.json${fishData ? `、${REGION_CODE}/${prefCode}_fish.json` : ""}`);
    fishLines.push("");

    return {
        mainMarkdown: mainLines.join("\n"),
        fishMarkdown: fishLines.join("\n"),
        areaFiles,
        shouldSplitByArea,
        stats: {
            spotCount: spotRecords.length,
            areaCount: activeAreas.length,
            spotsWithFish: spotsWithFish.length,
            fishlessCount: spotRecords.length - spotsWithFish.length,
            speciesCount: fishSpecies.length,
            spotsWithDict: spotsWithDict.length,
            spotsWithoutDictNames: spotsWithoutDict.map(r => r.name),
            spotsWithAccess: spotsWithAccess.length,
            spotsWithShops: spotsWithShops.length
        }
    };
}


// ==========================================
// /llms.txt 自動生成（ai-data/*.md のフロントマターを自動収集）
// ==========================================
function parseFrontmatter(markdownText) {
    const meta = {};
    if (typeof markdownText !== "string") return meta;
    const match = markdownText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return meta;

    const lines = match[1].split(/\r?\n/);
    for (const line of lines) {
        const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!kv) continue;
        const key = kv[1].trim();
        let val = kv[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        meta[key] = val;
    }
    return meta;
}

function extractFirstHeading(markdownText) {
    if (typeof markdownText !== "string") return "";
    const match = markdownText.match(/^#\s+(.+)$/m);
    return match ? cleanText(match[1]) : "";
}

function getPrefOrderIndex(prefCode) {
    const idx = PREF_DISPLAY_ORDER.indexOf(prefCode);
    return idx === -1 ? PREF_DISPLAY_ORDER.length : idx;
}

function buildLlmsTxt(aiDataDir, updatedDate) {
    if (!fs.existsSync(aiDataDir)) {
        throw new Error("ai-data ディレクトリが見つかりません: " + aiDataDir);
    }

    const mdFiles = fs.readdirSync(aiDataDir)
        .filter(name => /\.md$/i.test(name))
        .sort((a, b) => a.localeCompare(b, "en"));

    const tomorrowFiles = [];
    const groups = new Map();
    const otherFiles = [];
    let latestUpdated = updatedDate;

    for (const fileName of mdFiles) {
        const fullPath = path.join(aiDataDir, fileName);
        const content = fs.readFileSync(fullPath, "utf8");
        const meta = parseFrontmatter(content);
        const baseName = fileName.replace(/\.md$/i, "");
        const upperBase = baseName.toUpperCase();

        const inferredPref = baseName.split("_")[0].toUpperCase();
        const prefCode = cleanText(meta.pref_code).toUpperCase() || inferredPref;
        const prefName = cleanText(meta.pref_name) || PREF_NAME_FALLBACK_MAP[prefCode] || prefCode;
        const title = cleanText(meta.title) || extractFirstHeading(content) || baseName;
        const fileUpdated = cleanText(meta.last_updated);
        if (fileUpdated && fileUpdated > latestUpdated) {
            latestUpdated = fileUpdated;
        }

        const entry = {
            fileName,
            url: `${SITE_URL}/ai-data/${encodeURIComponent(fileName)}`,
            prefCode,
            prefName,
            title,
            meta
        };

        // 明日のオススメランキングMD（*_tomorrow.md）は最上部の専用セクションへ振り分ける
        if (/_TOMORROW$/.test(upperBase)) {
            tomorrowFiles.push(entry);
            continue;
        }

        if (!prefCode) {
            otherFiles.push(entry);
            continue;
        }

        if (!groups.has(prefCode)) {
            groups.set(prefCode, {
                prefCode,
                prefName,
                main: null,
                catchFile: null,
                fishFile: null,
                areas: []
            });
        }

        const group = groups.get(prefCode);
        if (prefName && prefName !== prefCode) {
            group.prefName = prefName;
        }

        if (upperBase === prefCode) {
            group.main = entry;
        } else if (upperBase === `${prefCode}_CATCH`) {
            group.catchFile = entry;
        } else if (upperBase === `${prefCode}_FISH`) {
            group.fishFile = entry;
        } else {
            group.areas.push(entry);
        }
    }

    const sortedGroups = [...groups.values()].sort((a, b) => {
        const oa = getPrefOrderIndex(a.prefCode);
        const ob = getPrefOrderIndex(b.prefCode);
        if (oa !== ob) return oa - ob;
        return a.prefCode.localeCompare(b.prefCode, "en");
    });

    const lines = [];
    lines.push("# 釣り行こNAVI");
    lines.push("");
    lines.push("> 関東全域（千葉・神奈川・東京・茨城・栃木・埼玉・群馬）の海釣り・堤防・河川・湖沼スポットを網羅するリアルタイム釣果さかな地図サイト「釣り行こNAVI」（https://turiiko-navi.com/）のAI向け構造化Markdownデータ目次です。");
    lines.push("");
    lines.push("## 利用ガイド・データ方針");
    lines.push("");
    lines.push(`- サイトURL: ${SITE_URL}/`);
    lines.push(`- 最終更新日: ${latestUpdated} (Asia/Tokyo)`);
    lines.push(`- 収録都道府県グループ数: ${sortedGroups.length}件 / 収録Markdownファイル数: ${mdFiles.length}件`);
    lines.push("- 各スポットの登録魚種（`*_fish.md` および各スポット詳細）はサイト内データ上の対象魚種を示すものであり、現在の釣果や釣獲を保証するものではありません。");
    lines.push("- 最新SNS釣果（`*_catch.md`）の座標は元のSNS投稿地名（area_name）をもとに設定した代表点であり、特定の釣り場スポットへの紐付けではありません。");
    lines.push("- アクセス時間・距離は直線距離に道路係数（1.35倍）を掛けた概算値です。現地の立入禁止区域・駐車ルールは必ず現地表示をご確認ください。");
    lines.push("- 「明日釣りに行くんだけどいい場所ある？」等の質問には、まず下の「明日のオススメ釣り場ランキング（`*_tomorrow.md`）」で明日の天気予報詳細と周辺SNS釣果の根拠を確認し、必要に応じて各県の `*_catch.md` や該当エリアの詳細スポットMD（解説・駐車場/トイレ・ルール・アクセス・最寄り釣具店）を参照してください。");
    lines.push("");

    if (tomorrowFiles.length > 0) {
        lines.push("## 明日のオススメ釣り場ランキング（天気・釣果根拠付き）");
        lines.push("");
        const sortedTomorrow = [...tomorrowFiles].sort((a, b) => a.fileName.localeCompare(b.fileName, "en"));
        for (const item of sortedTomorrow) {
            const targetDate = cleanText(item.meta.target_date);
            const itemUpdated = cleanText(item.meta.last_updated);
            const details = [];
            if (targetDate) details.push(`対象日 ${targetDate}`);
            if (itemUpdated) details.push(`更新 ${itemUpdated}`);
            const suffix = details.length > 0 ? `（${details.join(" / ")}）` : "";
            lines.push(`- [${item.title}](${item.url}): 明日の天気予報詳細（時間帯別の天気・気温・降水・風速・波高）と周辺10km圏内の直近SNS釣果を備考としてまとめた最新おすすめランキング${suffix}`);
        }
        lines.push("");
    }

    for (const group of sortedGroups) {
        lines.push(`## ${group.prefName} (${group.prefCode})`);
        lines.push("");

        if (group.main) {
            const splitFlag = String(group.main.meta.split_by_area || "").toLowerCase() === "true";
            const desc = splitFlag
                ? `${group.prefName}のスポット概要・エリア別詳細ファイルへのハブ`
                : `${group.prefName}の正規スポット詳細一覧（解説・所在地・魚種・アクセス・釣具店）`;
            lines.push(`- [${group.main.title}](${group.main.url}): ${desc}`);
        }

        if (group.catchFile) {
            const postCount = cleanText(group.catchFile.meta.post_count);
            const recent7d = cleanText(group.catchFile.meta.recent_7d_post_count);
            const rangeStart = cleanText(group.catchFile.meta.date_range_start);
            const rangeEnd = cleanText(group.catchFile.meta.date_range_end);

            const details = [];
            if (postCount !== "") details.push(`投稿${postCount}件`);
            if (recent7d !== "") details.push(`直近7日${recent7d}件`);
            if (rangeStart && rangeEnd) details.push(`${rangeStart}〜${rangeEnd}`);
            const suffix = details.length > 0 ? `（${details.join(" / ")}）` : "";
            lines.push(`- [${group.catchFile.title}](${group.catchFile.url}): ${group.prefName}および周辺の最新SNS釣果まとめ${suffix}`);
        }

        if (group.fishFile) {
            lines.push(`- [${group.fishFile.title}](${group.fishFile.url}): 魚種名から${group.prefName}の対象スポットを逆引き`);
        }

        if (group.areas.length > 0) {
            const sortedAreas = [...group.areas].sort((a, b) => a.fileName.localeCompare(b.fileName, "en"));
            for (const area of sortedAreas) {
                const areaName = cleanText(area.meta.area_name) || area.title;
                const spotCount = cleanText(area.meta.spot_count);
                const countSuffix = spotCount !== "" ? `（${spotCount}スポット）` : "";
                lines.push(`- [${area.title}](${area.url}): ${areaName}の個別スポット詳細${countSuffix}`);
            }
        }

        lines.push("");
    }

    if (otherFiles.length > 0) {
        lines.push("## その他のデータ");
        lines.push("");
        for (const item of otherFiles) {
            lines.push(`- [${item.title}](${item.url})`);
        }
        lines.push("");
    }

    return {
        content: lines.join("\n"),
        prefGroupCount: sortedGroups.length,
        fileCount: mdFiles.length
    };
}

// ==========================================
// メイン実行（単県 / 複数県 / ALL / LLMS 対応）
// ==========================================
try {
    const updatedDate = getJstDate();
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    if (TARGET_ARG !== "LLMS") {
        const availablePrefCodes = discoverPrefCodes(REGION_DIR);
        if (availablePrefCodes.length === 0) {
            throw new Error(`*_location.json が見つかりません: ${REGION_DIR}`);
        }

        let targetPrefCodes;
        if (TARGET_ARG === "ALL") {
            targetPrefCodes = availablePrefCodes;
        } else {
            targetPrefCodes = [...new Set(
                TARGET_ARG.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
            )];
            const missing = targetPrefCodes.filter(code => !availablePrefCodes.includes(code));
            if (missing.length > 0) {
                throw new Error(
                    `指定された県のlocation.jsonが見つかりません: ${missing.join(", ")}（利用可能: ${availablePrefCodes.join(", ")}）`
                );
            }
        }

        const icData = readJsonOptional(GEO_PATH, "地理・アクセスJSON");
        console.log(`スポットAI向けMarkdown生成開始（対象: ${targetPrefCodes.join(", ")} / リージョン: ${REGION_CODE}）`);

        for (const prefCode of targetPrefCodes) {
            const locationPath = path.join(REGION_DIR, `${prefCode}_location.json`);
            const fishPath = path.join(REGION_DIR, `${prefCode}_fish.json`);
            const dictionaryPath = path.join(REGION_DIR, `${prefCode}_dictionary.json`);
            const shopPath = path.join(REGION_DIR, `${prefCode}_shop.json`);

            const locationData = readJsonRequired(locationPath);
            const fishData = readJsonOptional(fishPath, `${prefCode} 魚種JSON`);
            const dictionaryData = readJsonOptional(dictionaryPath, `${prefCode} 逆引き辞書JSON`);
            const rawShopData = readJsonOptional(shopPath, `${prefCode} 釣具店JSON`);
            const shopList = normalizeShopList(rawShopData);

            const result = buildPrefMarkdown({
                prefCode,
                locationData,
                fishData,
                dictionaryData,
                icData,
                shopList,
                updatedDate
            });

            const outputPath = path.join(OUTPUT_DIR, `${prefCode}.md`);
            const fishOutputPath = path.join(OUTPUT_DIR, `${prefCode}_fish.md`);

            fs.writeFileSync(outputPath, result.mainMarkdown, "utf8");
            fs.writeFileSync(fishOutputPath, result.fishMarkdown, "utf8");

            for (const areaFile of result.areaFiles) {
                fs.writeFileSync(areaFile.filePath, areaFile.content, "utf8");
            }

            console.log(`[${prefCode}] 生成完了（エリア分割: ${result.shouldSplitByArea ? "ON" : "OFF"}）`);
            console.log(`  正規スポット: ${result.stats.spotCount}件（${result.stats.areaCount}エリア） / 辞書紐付け: ${result.stats.spotsWithDict}件 / 未登録: ${result.stats.spotsWithoutDictNames.length}件`);
            if (result.stats.spotsWithoutDictNames.length > 0) {
                console.log(`  辞書未登録(先頭10件): ${result.stats.spotsWithoutDictNames.slice(0, 10).join("、")}`);
            }
            console.log(`  魚種登録あり: ${result.stats.spotsWithFish}件（全${result.stats.speciesCount}種） / アクセス: ${result.stats.spotsWithAccess}件 / 釣具店: ${result.stats.spotsWithShops}件`);
            console.log(`  出力: ${outputPath}, ${fishOutputPath}${result.areaFiles.length > 0 ? `, エリア別 ${result.areaFiles.length}ファイル` : ""}`);
        }
    }

    // 実在する ai-data/*.md をスキャンしてルート直下の /llms.txt を自動更新
    const llmsResult = buildLlmsTxt(OUTPUT_DIR, updatedDate);
    fs.writeFileSync(LLMS_OUTPUT_PATH, llmsResult.content, "utf8");
    console.log(`[LLMS] 生成完了: ${LLMS_OUTPUT_PATH}（${llmsResult.prefGroupCount}都道府県グループ / 計${llmsResult.fileCount}ファイル収録）`);
} catch (error) {
    console.error("スポットAI向けMarkdown生成エラー:", error);
    process.exit(1);
}
