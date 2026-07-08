// ================================
// ■ coastalArea_control.js
// ================================

import fs from "fs";

import {
    applyFirstStage,
    applySecondStage,
    applyThirdStage
} from "./whetherNode.js";

// ================================
// ■ 設定（ここをYAMLからの引数受け取りに変更）
// ================================
const region = process.argv[2] || "KANTO";
const jsonUrl = process.argv[3] || `https://turiiko.shop/actions/data/${region}_load.json`;

const regionPrefsMap = {
    "KANTO": ["CHIBA", "KANAGAWA"],
    "KANSAI": ["OSAKA", "HYOGO", "WAKAYAMA"]
};
const prefs = regionPrefsMap[region];

if (!prefs) {
    console.error(`❌ エラー: 地域「${region}」の県リストが定義されていません。`);
    process.exit(1);
}

// ================================
// ■ URLからJSON取得（キャッシュ回避・ヘッダー偽装付き）
// ================================
async function fetchJSON(url) {
    const fetchUrl = `${url}?t=${Date.now()}`; // キャッシュ回避
    try {
        const response = await fetch(fetchUrl, { 
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        const json = await response.json();
        return json.data || json;
    } catch (error) {
        console.error("❌ 通信エラー:", error.message);
        return null;
    }
}

// ================================
// ■ 今日の日付（JST）
// ================================
function getToday() {

    return new Date()
        .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// ================================
// ■ 出力CSVの先頭date取得
// ================================
function getFirstCSVDate(filePath) {

    if (!fs.existsSync(filePath)) return null;

    const text = fs.readFileSync(filePath, "utf-8");
    const lines = text.split("\n").filter(Boolean);

    if (lines.length < 2) return null;

    const header = lines[0].split(",");
    const dateIndex = header.indexOf("date");

    if (dateIndex === -1) return null;

    const firstData = lines[1].split(",");

    return firstData[dateIndex] || null;
}

// ================================
// ■ CSV読み込み（⚠️ 元のまま一切変更なし）
// ================================
function loadCSV(filePath) {

    if (!fs.existsSync(filePath)) {
        console.log("⚠ skip (no csv):", filePath);
        return null;
    }

    const text = fs.readFileSync(filePath, "utf-8");

    const lines = text.split("\n").filter(Boolean);

    const header = lines.shift().split(",");

    return lines.map(line => {

        const cols = line.split(",");

        const obj = {};

        header.forEach((h, i) => {
            obj[h] = cols[i];
        });

        obj.lat = Number(obj.lat);
        obj.lng = Number(obj.lng);

        return obj;
    });
}

// ================================
// ■ CSV出力（上書き）（⚠️ 元のまま一切変更なし）
// ================================
function saveCSV(filePath, spots) {

    const today = new Date()
        .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

    let csv = "name,date,whether\n";

    for (const s of spots) {

        // whetherがないものは出さない（前提維持）
        if (!s.whether) continue;

        csv += [
            s.name || "",
            today, // ★ここが重要（出力日固定）
            JSON.stringify(s.whether)
        ].join(",") + "\n";
    }

    fs.writeFileSync(filePath, csv, "utf-8");
}

// ================================
// ■ メイン処理
// ================================
async function run() {

    console.log(`\n=== START [${region}] ===`);
    console.log(`🌐 参照URL: ${jsonUrl}`);

    // ----------------
    // station（共通1回）
    // ----------------
    const stations = await fetchJSON(jsonUrl);

    if (!stations) {
        console.error("❌ 取得失敗");
        process.exit(1);
    }

    console.log("stations:", stations.length);

    const today = getToday();

    // ----------------
    // prefループ
    // ----------------
    for (const pref of prefs) {

        console.log("----", pref, "----");

        const csvPath = `./${region}/${pref}_location.csv`;
        const outPath = `./data/${pref}_whether.csv`;

        // =================================================
        // ■ 最重要：先にスキップ判定（ここで終わる）
        // =================================================
        const savedDate = getFirstCSVDate(outPath);

        if (savedDate === today) {
            console.log("⏭ skip (already up to date):", pref, savedDate);
            continue;
        }

        // ----------------
        // CSV読み込み
        // ----------------
        let spots = loadCSV(csvPath);

        if (!spots) {
            console.log("skip pref (no csv):", pref);
            continue;
        }

        console.log("spots:", spots.length);

        // ----------------
        // 重い処理（ここだけ実行）
        // ----------------
        applyFirstStage(spots, stations);
        applySecondStage(spots);
        applyThirdStage(spots);

        const ok = spots.filter(s => s.whether).length;

        console.log("completed:", ok, "/", spots.length);

        // ----------------
        // 出力
        // ----------------
        saveCSV(outPath, spots);

        console.log("saved:", outPath);
    }

    console.log("=== END ===\n");
}

// ================================
run();
