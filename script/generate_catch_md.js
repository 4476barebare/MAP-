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

// 県範囲の切り出し距離上限（リージョン内全正規スポットと比較し、最寄りが対象県かつこの距離以内の代表点を採用）
const MAX_ASSIGN_DISTANCE_KM = Number(process.env.MAX_ASSIGN_DISTANCE_KM || 15);
// エリア分割MDリンクの出し分け用閾値（generate_chiba_md.js と同一）
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

function makePrefMapUrl(prefName) {
    return SITE_URL + "/?region=" + encodeURIComponent(REGION_NAME) +
        "&pref=" + encodeURIComponent(prefName);
}

function formatCoord(lat, lng) {
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
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
// （県範囲の境界判定のみに使用し、個別スポットへの紐付けは行わない）
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
    const areaList = areaRows.map(area => {
        const areaKey = area.areaId + "_" + area.individualId;
        return {
            areaKey,
            fileName: `${sanitizeFileSegment(areaKey)}.md`,
            name: cleanText(area.name)
        };
    });

    // 範囲判定用の正規スポット座標群（個別スポット紐付けには使用しない）
    const boundaryPoints = locationData
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
            return {
                prefCode,
                areaKey: spot.areaId,
                lat,
                lng
            };
        })
        .filter(Boolean);

    const activeAreaKeys = new Set(boundaryPoints.map(p => p.areaKey));
    const activeAreas = areaList.filter(a => activeAreaKeys.has(a.areaKey));
    const shouldSplitByArea = boundaryPoints.length >= AREA_SPLIT_THRESHOLD && activeAreas.length > 1;

    return {
        prefCode,
        prefName,
        locationPath,
        areas: activeAreas,
        boundaryPoints,
        shouldSplitByArea
    };
}

// ==========================================
// 対象県とその周辺範囲の代表点レコードを切り出し・投稿単位で統合
// （個別スポットへの紐付けは一切行わず、元の area_name と代表点座標をそのまま保持）
// ==========================================
function extractPrefCatches(catchList, targetPrefMeta, allRegionBoundaryPoints, todayUtcMs) {
    const postMap = new Map();

    for (const raw of catchList) {
        if (!raw || typeof raw !== "object") continue;

        const lat = Number(raw.lat);
        const lng = Number(raw.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const parsedDate = parseCatchDate(raw.date);
        if (!parsedDate) continue;

        // リージョン内の全正規スポット座標から最も近い県を判定し、対象県かつ上限距離以内なら採用
        let nearestPrefCode = null;
        let minDistKm = Infinity;
        for (const pt of allRegionBoundaryPoints) {
            const dist = calcDistanceKm(lat, lng, pt.lat, pt.lng);
            if (dist < minDistKm) {
                minDistKm = dist;
                nearestPrefCode = pt.prefCode;
            }
        }

        if (nearestPrefCode !== targetPrefMeta.prefCode) continue;
        if (minDistKm > MAX_ASSIGN_DISTANCE_KM) continue;

        const url = cleanText(raw.url);
        const areaName = cleanText(raw.area_name);
        if (!areaName) continue;

        const source = resolveSnsSourceName(raw);
        const fishList = splitFishNames(raw.fish);
        if (fishList.length === 0) continue;

        const ageDays = Math.max(0, Math.floor((todayUtcMs - parsedDate.utcMs) / 86400000));
        const coordKey = formatCoord(lat, lng);

        // 同一投稿URLかつ同一エリア名で統合（複数魚種・複数代表点の重複展開をまとめる）
        const postKey = url
            ? `url:${url}|area:${areaName}`
            : `fallback:${parsedDate.iso}|${areaName}|${coordKey}`;

        let entry = postMap.get(postKey);
        if (!entry) {
            entry = {
                dateIso: parsedDate.iso,
                dateUtcMs: parsedDate.utcMs,
                ageDays,
                areaName,
                source,
                url,
                fishSet: new Set(),
                coordsMap: new Map()
            };
            postMap.set(postKey, entry);
        }

        fishList.forEach(f => entry.fishSet.add(f));
        if (!entry.coordsMap.has(coordKey)) {
            entry.coordsMap.set(coordKey, { lat, lng, label: coordKey });
        }

        if (parsedDate.utcMs > entry.dateUtcMs) {
            entry.dateUtcMs = parsedDate.utcMs;
            entry.dateIso = parsedDate.iso;
            entry.ageDays = ageDays;
        }
    }

    const posts = [...postMap.values()].map(entry => {
        const fishes = [...entry.fishSet].sort((a, b) => a.localeCompare(b, "ja"));
        const coords = [...entry.coordsMap.values()];

        return {
            dateIso: entry.dateIso,
            dateUtcMs: entry.dateUtcMs,
            ageDays: entry.ageDays,
            areaName: entry.areaName,
            source: entry.source,
            url: entry.url,
            fishes,
            coords
        };
    });

    // 日付降順 → 投稿地名 → 魚種
    posts.sort((a, b) => {
        if (b.dateUtcMs !== a.dateUtcMs) return b.dateUtcMs - a.dateUtcMs;
        const areaCmp = a.areaName.localeCompare(b.areaName, "ja");
        if (areaCmp !== 0) return areaCmp;
        return a.fishes.join("、").localeCompare(b.fishes.join("、"), "ja");
    });

    return posts;
}

// ==========================================
// 集計ヘルパー（すべて投稿の area_name ベース）
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
                    areaNames: new Map()
                };
                map.set(fish, item);
            }
            item.postCount += 1;
            if (post.dateIso > item.latestDate) item.latestDate = post.dateIso;
            item.areaNames.set(post.areaName, (item.areaNames.get(post.areaName) || 0) + 1);
        }
    }

    return [...map.values()].sort((a, b) => {
        if (b.postCount !== a.postCount) return b.postCount - a.postCount;
        if (b.latestDate !== a.latestDate) return b.latestDate.localeCompare(a.latestDate);
        return a.fish.localeCompare(b.fish, "ja");
    });
}

function summarizeByAreaName(posts) {
    const map = new Map();
    for (const post of posts) {
        let item = map.get(post.areaName);
        if (!item) {
            item = {
                areaName: post.areaName,
                postCount: 0,
                latestDate: post.dateIso,
                fishCount: new Map(),
                coordSet: new Set()
            };
            map.set(post.areaName, item);
        }
        item.postCount += 1;
        if (post.dateIso > item.latestDate) item.latestDate = post.dateIso;
        for (const fish of post.fishes) {
            item.fishCount.set(fish, (item.fishCount.get(fish) || 0) + 1);
        }
        for (const coord of post.coords) {
            item.coordSet.add(coord.label);
        }
    }

    return [...map.values()].sort((a, b) => {
        if (b.postCount !== a.postCount) return b.postCount - a.postCount;
        if (b.latestDate !== a.latestDate) return b.latestDate.localeCompare(a.latestDate);
        return a.areaName.localeCompare(b.areaName, "ja");
    });
}

function formatFishCounts(fishCountMap) {
    return [...fishCountMap.entries()]
        .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0], "ja")))
        .map(([name, count]) => `${name}（${count}件）`)
        .join("、");
}

function formatAreaCounts(areaCountMap, limit = 8) {
    return [...areaCountMap.entries()]
        .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0], "ja")))
        .slice(0, limit)
        .map(([name]) => name)
        .join("、");
}

function formatPostLine(post) {
    const coordLabels = post.coords.map(c => c.label).join(" / ");
    const sourceText = post.url
        ? `[${post.source}](${post.url})`
        : post.source;

    return `- **${post.dateIso}** | 投稿地: ${post.areaName} | 魚種: ${post.fishes.join("、")} | 代表点: ${coordLabels} | 出典: ${sourceText}`;
}

// ==========================================
// 県別 SNS釣果Markdown ビルド
// ==========================================
function buildCatchMarkdown(prefMeta, posts, updatedDate) {
    const recent7d = posts.filter(p => p.ageDays <= 7);
    const recent14d = posts.filter(p => p.ageDays <= 14);

    const recent7dByArea = summarizeByAreaName(recent7d);
    const recent14dByFish = summarizeByFish(recent14d);
    const allByFish = summarizeByFish(posts);
    const allByArea = summarizeByAreaName(posts);

    const dateRangeEnd = posts.length > 0 ? posts[0].dateIso : "";
    const dateRangeStart = posts.length > 0 ? posts[posts.length - 1].dateIso : "";
    const prefMapUrl = makePrefMapUrl(prefMeta.prefName);

    const lines = [];
    lines.push("---");
    lines.push(`title: "${prefMeta.prefName}および周辺の最新SNS釣果情報"`);
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
    lines.push(`# ${prefMeta.prefName}および周辺の最新SNS釣果情報`);
    lines.push("");
    lines.push(`> 本ファイルは、${REGION_CODE}/integrated_catch.json に収録されたSNS釣果報告のうち、${prefMeta.prefName}およびその周辺範囲に代表点座標が位置する投稿を自動抽出したものです。`);
    lines.push("> 記載の座標は元のSNS投稿のエリア・地名（area_name）をもとに設定した代表点であり、特定の釣り場スポットへの紐付けではありません。");
    lines.push("> 同一投稿URLが複数魚種や広域代表点（東京湾・利根川など）に展開されている場合は、1投稿として統合・重複排除しています。");
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
    lines.push(`- 地図サイト（${prefMeta.prefName}）: ${prefMapUrl}`);
    lines.push("");

    lines.push("## 釣果データ概要");
    lines.push("");
    lines.push(`- 対象範囲: ${prefMeta.prefName}および周辺`);
    lines.push(`- 抽出投稿数（ユニーク投稿）: ${posts.length}件`);
    lines.push(`- 直近7日間の投稿数: ${recent7d.length}件`);
    lines.push(`- 直近14日間の投稿数: ${recent14d.length}件`);
    if (dateRangeStart && dateRangeEnd) {
        lines.push(`- 収録期間: ${dateRangeStart} 〜 ${dateRangeEnd}`);
    }
    lines.push(`- 釣果報告のあった魚種数: ${allByFish.length}種`);
    lines.push(`- 投稿地（エリア名）数: ${allByArea.length}件`);
    lines.push("");

    // ------------------------------------------
    // 冒頭サマリー（直近7日・14日）
    // ------------------------------------------
    lines.push("## 直近の釣果ハイライト");
    lines.push("");

    lines.push("### 直近7日間の投稿地別まとめ");
    lines.push("");
    if (recent7dByArea.length === 0) {
        lines.push(`直近7日間（更新日 ${updatedDate} 基準）の${prefMeta.prefName}および周辺のSNS釣果投稿はありません。`);
        lines.push("");
    } else {
        for (const item of recent7dByArea) {
            lines.push(`- **${item.areaName}**（${item.postCount}件・最新 ${item.latestDate}）: ${formatFishCounts(item.fishCount)}`);
        }
        lines.push("");
    }

    lines.push("### 直近14日間の魚種別トレンド");
    lines.push("");
    if (recent14dByFish.length === 0) {
        lines.push(`直近14日間の${prefMeta.prefName}および周辺のSNS釣果投稿はありません。`);
        lines.push("");
    } else {
        for (const item of recent14dByFish.slice(0, 15)) {
            lines.push(`- **${item.fish}**（${item.postCount}件・最新 ${item.latestDate}）: ${formatAreaCounts(item.areaNames)}`);
        }
        lines.push("");
    }

    // ------------------------------------------
    // 最新SNS釣果一覧（日付降順・代表点そのまま）
    // ------------------------------------------
    lines.push("## 最新SNS釣果一覧（日付降順）");
    lines.push("");
    if (posts.length === 0) {
        lines.push(`現在、${prefMeta.prefName}および周辺範囲に該当するSNS釣果データはありません。`);
        lines.push("");
    } else {
        for (const post of posts) {
            lines.push(formatPostLine(post));
        }
        lines.push("");
    }

    // ------------------------------------------
    // 投稿地別の最新釣果まとめ（全収録期間）
    // ------------------------------------------
    lines.push("## 投稿地別の最新釣果まとめ（全収録期間）");
    lines.push("");
    if (allByArea.length === 0) {
        lines.push("収録期間内の釣果報告はありません。");
        lines.push("");
    } else {
        for (const item of allByArea) {
            const coordsStr = [...item.coordSet].slice(0, 4).join(" / ");
            lines.push(`- **${item.areaName}**（${item.postCount}件・最新 ${item.latestDate}）: ${formatFishCounts(item.fishCount)} | 代表点: ${coordsStr}`);
        }
        lines.push("");
    }

    // ------------------------------------------
    // 魚種別の最新釣果まとめ（全収録期間）
    // ------------------------------------------
    lines.push("## 魚種別の最新釣果まとめ（全収録期間）");
    lines.push("");
    if (allByFish.length === 0) {
        lines.push("収録期間内の釣果報告はありません。");
        lines.push("");
    } else {
        for (const item of allByFish) {
            lines.push(`- **${item.fish}**（${item.postCount}件・最新 ${item.latestDate}）: ${formatAreaCounts(item.areaNames, 12)}`);
        }
        lines.push("");
    }

    lines.push("---");
    lines.push("");
    lines.push(`データ出典: ${REGION_CODE}/integrated_catch.json（範囲判定参照: ${REGION_CODE}/*_location.json）`);
    lines.push("");

    return {
        markdown: lines.join("\n"),
        stats: {
            postCount: posts.length,
            recent7dCount: recent7d.length,
            recent14dCount: recent14d.length,
            fishSpeciesCount: allByFish.length,
            areaNameCount: allByArea.length
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

    const prefMetaMap = new Map();
    const allRegionBoundaryPoints = [];
    for (const code of availablePrefCodes) {
        const meta = loadPrefLocationMeta(code);
        prefMetaMap.set(code, meta);
        allRegionBoundaryPoints.push(...meta.boundaryPoints);
    }

    const updatedDate = getJstDateString();
    const todayUtcMs = getTodayJstUtcMs();
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log(`SNS釣果Markdown生成開始（対象: ${targetPrefCodes.join(", ")} / リージョン: ${REGION_CODE} / 範囲判定参照点数: ${allRegionBoundaryPoints.length}件 / 元レコード: ${rawCatchData.length}件）`);

    for (const prefCode of targetPrefCodes) {
        const prefMeta = prefMetaMap.get(prefCode);
        const posts = extractPrefCatches(rawCatchData, prefMeta, allRegionBoundaryPoints, todayUtcMs);
        const result = buildCatchMarkdown(prefMeta, posts, updatedDate);

        const outPath = path.join(OUTPUT_DIR, `${prefCode}_catch.md`);
        fs.writeFileSync(outPath, result.markdown, "utf8");

        console.log(
            `[${prefCode}] 生成完了: ${outPath} | 投稿: ${result.stats.postCount}件 (7日以内: ${result.stats.recent7dCount}件 / 14日以内: ${result.stats.recent14dCount}件 / 投稿地: ${result.stats.areaNameCount}件 / 魚種: ${result.stats.fishSpeciesCount}種)`
        );
    }
} catch (error) {
    console.error("SNS釣果Markdown生成エラー:", error);
    process.exit(1);
}
