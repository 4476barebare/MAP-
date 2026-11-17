import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREF_CODE = "CHIBA";
const PREF_NAME_FALLBACK = "千葉県";
const REGION_NAME = "関東地方";
const SITE_URL = "https://turiiko-navi.com";

const LOCATION_PATH = path.join(ROOT, "KANTO", "CHIBA_location.json");
const FISH_PATH = path.join(ROOT, "KANTO", "CHIBA_fish.json");
const OUTPUT_PATH = path.join(ROOT, "ai-data", "CHIBA.md");

function readJson(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error("入力ファイルが見つかりません: " + filePath);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function makeMapUrl(prefName, areaName, spotName) {
    return SITE_URL + "/?region=" + encodeURIComponent(REGION_NAME) +
        "&pref=" + encodeURIComponent(prefName) +
        "&area=" + encodeURIComponent(areaName) +
        "&spot=" + encodeURIComponent(spotName);
}

function buildMarkdown(locationData, fishData) {
    const prefRow = locationData.find(row =>
        row.name === PREF_CODE && row.individualId === "parent"
    );
    const prefName = cleanText(prefRow?.notes) || PREF_NAME_FALLBACK;

    const areaRows = locationData.filter(row =>
        row.areaId === PREF_CODE && row.individualId && row.individualId !== "parent"
    );
    const areaNames = new Map();
    areaRows.forEach(area => {
        areaNames.set(area.areaId + "_" + area.individualId, cleanText(area.name));
    });

    // 正規スポット: zoom指定あり、エリア所属、アイコンあり。
    // 県・エリア行およびzoom未指定行は含めない。
    const spots = locationData.filter(row =>
        hasZoom(row.zoom) &&
        row.type !== "pref" &&
        row.type !== "area" &&
        typeof row.areaId === "string" &&
        row.areaId.startsWith(PREF_CODE + "_") &&
        typeof row.icon === "string" &&
        row.icon.trim() !== ""
    );

    if (spots.length === 0) {
        throw new Error("正規スポットが0件です。抽出条件とCHIBA_location.jsonを確認してください。");
    }

    const spotRecords = spots.map(spot => {
        const areaName = areaNames.get(spot.areaId) || spot.areaId;
        const fishNames = getRegisteredFish(fishData[spot.areaId]?.[spot.name]);

        return {
            source: spot,
            name: cleanText(spot.name),
            areaName,
            fishNames,
            mapUrl: makeMapUrl(prefName, areaName, spot.name)
        };
    });

    const fishToSpots = new Map();
    spotRecords.forEach(record => {
        record.fishNames.forEach(fishName => {
            if (!fishToSpots.has(fishName)) fishToSpots.set(fishName, []);
            fishToSpots.get(fishName).push(record);
        });
    });

    const fishSpecies = [...fishToSpots.keys()].sort((a, b) => a.localeCompare(b, "ja"));
    const spotsWithFish = spotRecords.filter(record => record.fishNames.length > 0);

    const lines = [];
    lines.push("# " + prefName + "の釣りスポット・登録魚種一覧");
    lines.push("");
    lines.push("> 本ファイルは釣り行こNAVIのスポット情報を、AIが参照しやすいMarkdownにまとめたものです。");
    lines.push("> 正規スポットはCHIBA_location.jsonのうち、zoomが指定され、エリアに所属し、アイコンが設定された行を対象としています。");
    lines.push("> 登録魚種はCHIBA_fish.jsonに記録された魚種名を使用し、別名統合や推測による追加は行っていません。");
    lines.push("> 登録魚種はサイト内データ上の対象魚種を示すもので、現在の釣果や釣獲を保証するものではありません。");
    lines.push("");
    lines.push("## データ概要");
    lines.push("");
    lines.push("- 正規スポット数: " + spotRecords.length + "件");
    lines.push("- 登録魚種があるスポット: " + spotsWithFish.length + "件");
    lines.push("- CHIBA_fish.jsonに登録魚種がないスポット: " + (spotRecords.length - spotsWithFish.length) + "件");
    lines.push("- 登録魚種の種類数: " + fishSpecies.length + "種");
    lines.push("- 対象都道府県: " + prefName);
    lines.push("- 地図サイト: " + SITE_URL + "/");
    lines.push("");
    lines.push("## 魚種から釣り場を探す");
    lines.push("");
    lines.push("各魚種名はCHIBA_fish.jsonの登録名をそのまま使用しています。");
    lines.push("");

    fishSpecies.forEach(fishName => {
        const records = fishToSpots.get(fishName);
        lines.push("### " + fishName + "（" + records.length + "スポット）");
        lines.push("");
        lines.push(records.map(record => record.name + "（" + record.areaName + "）").join("、"));
        lines.push("");
    });

    lines.push("## エリア別スポット情報");
    lines.push("");

    areaRows.forEach(area => {
        const areaKey = area.areaId + "_" + area.individualId;
        const areaRecords = spotRecords.filter(record => record.source.areaId === areaKey);
        if (areaRecords.length === 0) return;

        lines.push("### " + cleanText(area.name));
        lines.push("");
        lines.push("スポット数: " + areaRecords.length + "件");
        lines.push("");

        areaRecords.forEach(record => {
            const spot = record.source;
            lines.push("#### " + record.name);
            lines.push("");

            if (Number.isFinite(Number(spot.lat)) && Number.isFinite(Number(spot.lng))) {
                lines.push("- 座標: " + Number(spot.lat).toFixed(6) + ", " + Number(spot.lng).toFixed(6));
            }

            if (record.fishNames.length > 0) {
                lines.push("- 登録魚種: " + record.fishNames.join("、"));
            } else {
                lines.push("- 登録魚種: CHIBA_fish.jsonに登録なし");
            }

            lines.push("");
            lines.push("- 地図: [" + record.name + "](" + record.mapUrl + ")");
            lines.push("");
        });
    });

    lines.push("---");
    lines.push("");
    lines.push("データ出典: KANTO/CHIBA_location.json、KANTO/CHIBA_fish.json");
    lines.push("");

    return {
        markdown: lines.join("\n"),
        spotCount: spotRecords.length,
        spotsWithFish: spotsWithFish.length,
        fishlessCount: spotRecords.length - spotsWithFish.length,
        speciesCount: fishSpecies.length
    };
}

try {
    const locationData = readJson(LOCATION_PATH);
    const fishData = readJson(FISH_PATH);
    const result = buildMarkdown(locationData, fishData);

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, result.markdown, "utf8");

    console.log("CHIBA.mdを生成しました。");
    console.log("正規スポット: " + result.spotCount + "件");
    console.log("魚種登録あり: " + result.spotsWithFish + "件");
    console.log("魚種登録なし: " + result.fishlessCount + "件");
    console.log("登録魚種: " + result.speciesCount + "種");
    console.log("出力先: " + OUTPUT_PATH);
} catch (error) {
    console.error("CHIBA.md生成エラー:", error);
    process.exit(1);
}