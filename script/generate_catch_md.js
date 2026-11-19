import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ==========================================
// 使い方:
//   node script/generate_catch_md.js CHIBA KANTO
//   node script/generate_catch_md.js TOKYO KANTO
//   node script/generate_catch_md.js KANAGAWA KANTO
//   node script/generate_catch_md.js IBARAKI KANTO
//   node script/generate_catch_md.js CHIBA,TOKYO,KANAGAWA,IBARAKI KANTO
//   node script/generate_catch_md.js ALL KANTO
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

// 県範囲の切り出し距離上限（最寄りの正規スポットがこの距離以内の投稿を採用）
const MAX_ASSIGN_DISTANCE_KM = Number(process.env.MAX_ASSIGN_DISTANCE_KM || 15);
// generate_chiba_md.js と同じエリア分割閾値（ナビゲーションリンクの出し分けに使用）
const AREA_SPLIT_THRESHOLD = 30;

const REGION_DIR = path.join(ROOT, REGION_CODE);
const CATCH_JSON_PATH = path.join(REGION_DIR, "integrated_catch.json");
const OUTPUT_DIR = path.join(ROOT, "ai-data");

function readJsonRequired(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error("必須入力ファイルが見つかりません: " + filePath);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
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

function getJstDateString(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);
}

function parseCatchDate(dateStr) {
    const cleaned = cleanText(dateStr).replace(/-/g, "/");
    const match = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const utcMs = Date.UTC(year, month - 1, day);
    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { iso, utcMs };
}

function getTodayJstUtcMs() {
    const [y, m, d] = getJstDateString().split("-").map(Number);
    return Date.UTC(y, m - 1, d);
}

function calcDistanceKm(lat1, lng1, lat2, lng2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function makeMapUrl(prefName, areaName, spotName) {
    return SITE_URL + "/?region=" + encodeURIComponent(REGION_NAME) +
        "&pref=" + encodeURIComponent(prefName) +
        "&area=" + encodeURIComponent(areaName) +
        "&spot=" + encodeURIComponent(spotName);
}

function resolveSnsSourceName(item) {
    const rawSource = cleanText(item?.source);
    if (rawSource) return rawSource;
    const url = String(item?.url || "").toLowerCase();
    if (url.includes("instagram.com")) return "Instagram";
    if (url.includes("x.com") || url.includes("twitter.com")) return "X";
    if (url.includes("threads.net") || url.includes("threads.com")) return "Threads";
    if (url.includes("facebook.com")) return "Facebook";
    return "SNS";
}

function splitFishNames(rawFish) {
    const text = cleanText(rawFish);
    if (!text) return [];
    return [...new Set(
        text.split(/[・,、／/]/).map(cleanText).filter(Boolean)
    )];
}

// ==========================================
// リージョン内の全 *_location.json を自動検出してロード
// （県境の誤判定を防ぐため、他県の正規スポットも含めて最寄り判定を行う）
// ==========================================
function discoverPrefCodes(regionDir) {
    if (!fs.existsSync(regionDir)) {
        throw new Error("リージョンディレクトリが見つかりません: " + regionDir);
    }
    return fs.readdirSync(regionDir)
        .filter(name => /_location\.json$/i.test(name))
        .map(name => name.replace(/_location\.json$/i, "").toUpperCase())
        .sort();
}

function loadPrefLocationMeta(prefCode) {
    const locationPath = path.join(REGION_DIR, `${prefCode}_location.json`);
    const locationData = readJsonRequired(locationPath);
    if (!Array.isArray(locationData)) {
        throw new Error(`location.json の形式が配列ではありません: ${locationPath}`);
    }

    const prefRow = locationData.find(row =>
        row.name === prefCode && row.individualId === "parent"
    );
    const prefName = cleanText(prefRow?.notes) || PREF_NAME_FALLBACK_MAP[prefCode] || prefCode;

    const areaRows = locationData.filter(row =>
        row.areaId === prefCode && row.individualId && row.individualId !== "parent"
    );
    const areaList = [];
    const areaMap = new Map();

    areaRows.forEach(area => {
        const areaKey = area.areaId + "_" + area.individualId;
        const info = {
            areaKey,
            fileName: `${sanitizeFileSegment(areaKey)}.md`,
            name: cleanText(area.name)
        };
        areaList.push(info);
        areaMap.set(areaKey, info);
    });

    // 正規スポット（generate_chiba_md.js と同一条件）
    const spots = locationData
        .filter(row =>
            hasZoom(row.zoom) &&
            row.type !== "pref" &&
            row.type !== "area" &&
            typeof row.areaId === "string" &&
            row.areaId.startsWith(prefCode + "_") &&
            typeof row.icon === "string" &&
            row.icon.trim() !== ""
        )
        .map(spot => {
            const lat = Number(spot.lat);
            const lng = Number(spot.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            const spotName = cleanText(spot.name);
            const areaInfo = areaMap.get(spot.areaId);
            const areaName = areaInfo ? areaInfo.name : spot.areaId;
            const areaFileName = areaInfo ? areaInfo.fileName : `${sanitizeFileSegment(spot.areaId)}.md`;

            return {
                prefCode,
                prefName,
                areaKey: spot.areaId,
                areaName,
                areaFileName,
                spotName,
                lat,
                lng,
                mapUrl: makeMapUrl(prefName, areaName, spot.name)
            };
        })
        .filter(Boolean);

    const activeAreaKeys = new Set(spots.map(s => s.areaKey));
    const activeAreas = areaList.filter(a => activeAreaKeys.has(a.areaKey));
    const shouldSplitByArea = spots.length >= AREA_SPLIT_THRESHOLD && activeAreas.length > 1;

    return {
        prefCode,
        prefName,
        locationPath,
        areas: activeAreas,
        areaMap,
        spots,
        shouldSplitByArea
    };
}

// ==========================================
// 釣果レコードを対象県へ振り分け・投稿URL単位で重複統合
// ==========================================
function extractPrefCatches(catchList, targetPrefMeta, allRegionSpots, todayUtcMs) {
    // 同じ投稿（URL）が複数魚種・複数座標（東京湾や外房堤防など）に展開されているため、
    // 対象県内で投稿単位に統合してAIの二重カウントを防ぐ。
    const postMap = new Map();

    for (const raw of catchList) {
        if (!raw || typeof raw !== "object") continue;

        const lat = Number(raw.lat);
        const lng = Number(raw.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const parsedDate = parseCatchDate(raw.date);
        if (!parsedDate) continue;

        // リージョン内の全正規スポットから最寄り地点を探索
        let nearestSpot = null;
        let minDistKm = Infinity;
        for (const spot of allRegionSpots) {
            const dist = calcDistanceKm(lat, lng, spot.lat, spot.lng);
            if (dist < minDistKm) {
                minDistKm = dist;
                nearestSpot = spot;
            }
        }

        if (!nearestSpot) continue;
        if (minDistKm > MAX_ASSIGN_DISTANCE_KM) continue;
        if (nearestSpot.prefCode !== targetPrefMeta.prefCode) continue;

        const url = cleanText(raw.url);
        const areaLabel = cleanText(raw.area_name) || nearestSpot.spotName;
        const source = resolveSnsSourceName(raw);
        const fishList = splitFishNames(raw.fish);
        if (fishList.length === 0) continue;

        const ageDays = Math.max(0, Math.floor((todayUtcMs - parsedDate.utcMs) / 86400000));

        // 同一URLかつ同一投稿場所ラベルで統合（1投稿が複数地点にまたがる場合は最も近い地点を代表にし、他近隣も保持）
        const postKey = url
            ? `url:${url}|area:${areaLabel}`
            : `fallback:${parsedDate.iso}|${areaLabel}|${lat.toFixed(4)},${lng.toFixed(4)}`;

        let entry = postMap.get(postKey);
        if (!entry) {
            entry = {
                dateIso: parsedDate.iso,
                dateUtcMs: parsedDate.utcMs,
                ageDays,
                areaLabel,
                source,
                url,
                fishSet: new Set(),
                nearestSpot,
                minDistKm,
                matchedSpots: new Map()
            };
            postMap.set(postKey, entry);
        }

        fishList.forEach(f => entry.fishSet.add(f));

        const existingSpotMatch = entry.matchedSpots.get(nearestSpot.spotName);
        if (!existingSpotMatch || minDistKm < existingSpotMatch.distKm) {
            entry.matchedSpots.set(nearestSpot.spotName, {
                spot: nearestSpot,
                distKm: minDistKm
            });
        }

        if (minDistKm < entry.minDistKm) {
            entry.minDistKm = minDistKm;
            entry.nearestSpot = nearestSpot;
        }
        if (parsedDate.utcMs > entry.dateUtcMs) {
            entry.dateUtcMs = parsedDate.utcMs;
            entry.dateIso = parsedDate.iso;
            entry.ageDays = ageDays;
        }
    }

    const posts = [...postMap.values()].map(entry => {
        const fishes = [...entry.fishSet].sort((a, b) => a.localeCompare(b, "ja"));
        const otherSpots = [...entry.matchedSpots.values()]
            .filter(m => m.spot.spotName !== entry.nearestSpot.spotName)
            .sort((a, b) => a.distKm - b.distKm)
            .map(m => m.spot.spotName);

        return {
            dateIso: entry.dateIso,
            dateUtcMs: entry.dateUtcMs,
            ageDays: entry.ageDays,
            areaLabel: entry.areaLabel,
            source: entry.source,
            url: entry.url,
            fishes,
            primarySpot: entry.nearestSpot,
            distanceKm: entry.minDistKm,
            otherSpots
        };
    });

    // 日付降順 → エリア名 → 最寄りスポット名
    posts.sort((a, b) => {
        if (b.dateUtcMs !== a.dateUtcMs) return b.dateUtcMs - a.dateUtcMs;
        const areaCmp = a.primarySpot.areaName.localeCompare(b.primarySpot.areaName, "ja");
        if (areaCmp !== 0) return areaCmp;
        return a.primarySpot.spotName.localeCompare(b.primarySpot.spotName, "ja");
    });

    return posts;
}

// ==========================================
// 集計ヘルパー
// ==========================================
function summarizeByFish(posts) {
    const map = new Map();
    for (const post of posts) {
        for (const fish of post.fishes) {
            let item = map.get(fish);
            if (!item) {
                item = {
                    fish,
                    postCount: 0,
                    latestDate: post.dateIso,
                    areaSpots: new Map()
                };
                map.set(fish, item);
            }
            item.postCount += 1;
            if (post.dateIso > item.latestDate) item.latestDate = post.dateIso;

            const areaName = post.primarySpot.areaName;
            if (!item.areaSpots.has(areaName)) item.areaSpots.set(areaName, new Set());
            item.areaSpots.get(areaName).add(post.primarySpot.spotName);
        }
    }

    return [...map.values()].sort((a, b) => {
        if (b.postCount !== a.postCount) return b.postCount - a.postCount;
        if (b.latestDate !== a.latestDate) return b.latestDate.localeCompare(a.latestDate);
        return a.fish.localeCompare(b.fish, "ja");
    });
}

function summarizeAreaHighlight(areaPosts) {
    const fishCount = new Map();
    const spotCount = new Map();

    for (const post of areaPosts) {
        for (const fish of post.fishes) {
            fishCount.set(fish, (fishCount.get(fish) || 0) + 1);
        }
        const sName = post.primarySpot.spotName;
        spotCount.set(sName, (spotCount.get(sName) || 0) + 1);
    }

    const topFishes = [...fishCount.entries()]
        .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0], "ja")))
        .map(([name, count]) => `${name}（${count}件）`);

    const topSpots = [...spotCount.entries()]
        .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0], "ja")))
        .slice(0, 5)
        .map(([name]) => name);

    return { topFishes, topSpots };
}

function formatPostLine(post) {
    const distText = post.distanceKm < 0.1
        ? "0.1km未満"
        : `約${post.distanceKm.toFixed(1)}km`;

    const spotLink = `[${post.primarySpot.spotName}](${post.primarySpot.mapUrl})`;
    const otherSpotsText = post.otherSpots.length > 0
        ? `（ほか近隣: ${post.otherSpots.slice(0, 3).join("、")}）`
        : "";
    const sourceText = post.url
        ? `[${post.source}](${post.url})`
        : post.source;

    return `- **${post.dateIso}** | 魚種: ${post.fishes.join("、")} | 投稿地: ${post.areaLabel} | 最寄りスポット: ${spotLink}（${distText}）${otherSpotsText} | 出典: ${sourceText}`;
}

// ==========================================
// 県別 SNS釣果Markdown ビルド
// ==========================================
function buildCatchMarkdown(prefMeta, posts, updatedDate) {
    const recent7d = posts.filter(p => p.ageDays <= 7);
    const recent14d = posts.filter(p => p.ageDays <= 14);
    const allFishSummary = summarizeByFish(posts);
    const recent14dFishSummary = summarizeByFish(recent14d);

    const dateRangeEnd = posts.length > 0 ? posts[0].dateIso : "";
    const dateRangeStart = posts.length > 0 ? posts[posts.length - 1].dateIso : "";

    const postsByArea = new Map();
    for (const area of prefMeta.areas) {
        postsByArea.set(area.areaKey, []);
    }
    for (const post of posts) {
        const key = post.primarySpot.areaKey;
        if (!postsByArea.has(key)) postsByArea.set(key, []);
        postsByArea.get(key).push(post);
    }

    const activeAreaCount = [...postsByArea.values()].filter(arr => arr.length > 0).length;

    const lines = [];
    lines.push("---");
    lines.push(`title: "${prefMeta.prefName}の最新SNS釣果情報"`);
    lines.push(`pref_code: "${prefMeta.prefCode}"`);
    lines.push(`pref_name: "${prefMeta.prefName}"`);
    lines.push(`post_count: ${posts.length}`);
    lines.push(`recent_7d_post_count: ${recent7d.length}`);
    lines.push(`recent_14d_post_count: ${recent14d.length}`);
    if (dateRangeStart && dateRangeEnd) {
        lines.push(`date_range_start: "${dateRangeStart}"`);
        lines.push(`date_range_end: "${dateRangeEnd}"`);
    }
    lines.push(`last_updated: "${updatedDate}"`);
    lines.push('timezone: "Asia/Tokyo"');
    lines.push('source: "釣り行こNAVI"');
    lines.push("---");
    lines.push("");
    lines.push(`# ${prefMeta.prefName}の最新SNS釣果情報`);
    lines.push("");
    lines.push(`> 本ファイルは、${REGION_CODE}/integrated_catch.json に収録されたSNS釣果報告から、${prefMeta.prefName}の正規スポットに最も近く（かつ${MAX_ASSIGN_DISTANCE_KM}km以内）に該当する投稿を自動抽出したものです。`);
    lines.push("> 同一投稿URLが複数魚種や広域座標（東京湾・利根川など）に展開されている場合は、都道府県内で1投稿として統合・重複排除しています。");
    lines.push("> SNS釣果は過去の投稿実績を示すものであり、今後の釣果や現地の立入可否・ルールを保証するものではありません。");
    lines.push("");

    lines.push("## 関連データ");
    lines.push("");
    lines.push(`- スポット情報トップ: [${prefMeta.prefName}の釣りスポット一覧（${prefMeta.prefCode}.md）](${prefMeta.prefCode}.md)`);
    lines.push(`- 魚種別の釣り場一覧: [${prefMeta.prefCode}_fish.md](${prefMeta.prefCode}_fish.md)`);
    if (prefMeta.shouldSplitByArea && prefMeta.areas.length > 0) {
        const areaLinks = prefMeta.areas.map(a => `[${a.name}](${a.fileName})`).join(" / ");
        lines.push(`- エリア別スポット詳細: ${areaLinks}`);
    }
    lines.push(`- 地図サイト: ${SITE_URL}/`);
    lines.push("");

    lines.push("## 釣果データ概要");
    lines.push("");
    lines.push(`- 対象都道府県: ${prefMeta.prefName}`);
    lines.push(`- 抽出投稿数（ユニーク投稿）: ${posts.length}件`);
    lines.push(`- 直近7日間の投稿数: ${recent7d.length}件`);
    lines.push(`- 直近14日間の投稿数: ${recent14d.length}件`);
    if (dateRangeStart && dateRangeEnd) {
        lines.push(`- 収録期間: ${dateRangeStart} 〜 ${dateRangeEnd}`);
    }
    lines.push(`- 釣果報告のあった魚種数: ${allFishSummary.length}種`);
    lines.push(`- 釣果報告のあったエリア数: ${activeAreaCount}エリア`);
    lines.push("");

    // ------------------------------------------
    // 冒頭サマリー（直近7日・14日のハイライト）
    // ------------------------------------------
    lines.push("## 直近の釣果ハイライト");
    lines.push("");

    lines.push("### 直近7日間のエリア別状況");
    lines.push("");
    if (recent7d.length === 0) {
        lines.push(`直近7日間（更新日 ${updatedDate} 基準）の${prefMeta.prefName}内SNS釣果投稿はありません。`);
        lines.push("");
    } else {
        for (const area of prefMeta.areas) {
            const areaRecent = recent7d.filter(p => p.primarySpot.areaKey === area.areaKey);
            if (areaRecent.length === 0) continue;
            const { topFishes, topSpots } = summarizeAreaHighlight(areaRecent);
            lines.push(`- **${area.name}**（${areaRecent.length}件）: 主な魚種は ${topFishes.join("、")}。反応のあった周辺スポットは ${topSpots.join("、")}。`);
        }
        lines.push("");
    }

    lines.push("### 直近14日間の魚種別トレンド");
    lines.push("");
    if (recent14dFishSummary.length === 0) {
        lines.push(`直近14日間の${prefMeta.prefName}内SNS釣果投稿はありません。`);
        lines.push("");
    } else {
        for (const item of recent14dFishSummary.slice(0, 15)) {
            const areaDescriptions = [...item.areaSpots.entries()].map(([areaName, spotSet]) => {
                const spotsStr = [...spotSet].slice(0, 3).join("・");
                return `${areaName}（${spotsStr}周辺）`;
            });
            lines.push(`- **${item.fish}**（${item.postCount}件・最新 ${item.latestDate}）: ${areaDescriptions.join("、")}`);
        }
        lines.push("");
    }

    // ------------------------------------------
    // エリア別の釣果投稿一覧（日付降順）
    // ------------------------------------------
    lines.push("## エリア別のSNS釣果一覧");
    lines.push("");

    if (posts.length === 0) {
        lines.push(`現在、${prefMeta.prefName}範囲（正規スポットから${MAX_ASSIGN_DISTANCE_KM}km以内）に該当するSNS釣果データはありません。`);
        lines.push("");
    } else {
        for (const area of prefMeta.areas) {
            const areaPosts = postsByArea.get(area.areaKey) || [];
            lines.push(`### ${area.name}（${areaPosts.length}件）`);
            lines.push("");
            if (prefMeta.shouldSplitByArea) {
                lines.push(`- エリア詳細スポット情報: [${area.name}（${area.fileName}）](${area.fileName})`);
                lines.push("");
            }

            if (areaPosts.length === 0) {
                lines.push("収録期間内のSNS釣果投稿はありません。");
                lines.push("");
                continue;
            }

            const { topFishes } = summarizeAreaHighlight(areaPosts);
            lines.push(`報告魚種まとめ: ${topFishes.join("、")}`);
            lines.push("");

            for (const post of areaPosts) {
                lines.push(formatPostLine(post));
            }
            lines.push("");
        }
    }

    // ------------------------------------------
    // 魚種別の最新釣果逆引き（全収録期間）
    // ------------------------------------------
    lines.push("## 魚種別の最新釣果まとめ（全収録期間）");
    lines.push("");
    if (allFishSummary.length === 0) {
        lines.push("収録期間内の釣果報告はありません。");
        lines.push("");
    } else {
        for (const item of allFishSummary) {
            const areaDescriptions = [...item.areaSpots.entries()].map(([areaName, spotSet]) => {
                const spotsStr = [...spotSet].slice(0, 4).join("・");
                return `${areaName}（${spotsStr}周辺）`;
            });
            lines.push(`- **${item.fish}**（${item.postCount}件・最新 ${item.latestDate}）: ${areaDescriptions.join("、")}`);
        }
        lines.push("");
    }

    lines.push("---");
    lines.push("");
    lines.push(`データ出典: ${REGION_CODE}/integrated_catch.json、${REGION_CODE}/${prefMeta.prefCode}_location.json`);
    lines.push("");

    return {
        markdown: lines.join("\n"),
        stats: {
            postCount: posts.length,
            recent7dCount: recent7d.length,
            recent14dCount: recent14d.length,
            fishSpeciesCount: allFishSummary.length,
            activeAreaCount
        }
    };
}

// ==========================================
// メイン実行
// ==========================================
try {
    const rawCatchData = readJsonRequired(CATCH_JSON_PATH);
    if (!Array.isArray(rawCatchData)) {
        throw new Error("integrated_catch.json の形式が配列ではありません: " + CATCH_JSON_PATH);
    }

    const availablePrefCodes = discoverPrefCodes(REGION_DIR);
    if (availablePrefCodes.length === 0) {
        throw new Error(`*_location.json が見つかりません: ${REGION_DIR}`);
    }

    // 対象県の解決（ALL / 単一県 / カンマ区切り複数県）
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

    // リージョン内の全県 *_location.json をロードして最寄り判定母集団を作る
    const prefMetaMap = new Map();
    const allRegionSpots = [];
    for (const code of availablePrefCodes) {
        const meta = loadPrefLocationMeta(code);
        prefMetaMap.set(code, meta);
        allRegionSpots.push(...meta.spots);
    }

    const updatedDate = getJstDateString();
    const todayUtcMs = getTodayJstUtcMs();
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log(`SNS釣果Markdown生成開始（対象: ${targetPrefCodes.join(", ")} / リージョン: ${REGION_CODE} / 全正規スポット母数: ${allRegionSpots.length}件 / 元レコード: ${rawCatchData.length}件）`);

    for (const prefCode of targetPrefCodes) {
        const prefMeta = prefMetaMap.get(prefCode);
        const posts = extractPrefCatches(rawCatchData, prefMeta, allRegionSpots, todayUtcMs);
        const result = buildCatchMarkdown(prefMeta, posts, updatedDate);

        const outPath = path.join(OUTPUT_DIR, `${prefCode}_catch.md`);
        fs.writeFileSync(outPath, result.markdown, "utf8");

        console.log(
            `[${prefCode}] 生成完了: ${outPath} | 投稿: ${result.stats.postCount}件 (7日以内: ${result.stats.recent7dCount}件 / 14日以内: ${result.stats.recent14dCount}件 / 魚種: ${result.stats.fishSpeciesCount}種)`
        );
    }
} catch (error) {
    console.error("SNS釣果Markdown生成エラー:", error);
    process.exit(1);
}
