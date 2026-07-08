// ========================================================
// ■ coastalArea_control.js
// ========================================================

import fs from "fs";

import {
    applyFirstStage,
    applySecondStage,
    applyThirdStage
} from "./whetherNode.js"; // 既存の処理モジュール

// ========================================================
// 🌟 最重要：YAMLからの引数（Args）の受け取り
// コマンド例: node js/coastalArea_control.js [地域名] [JSONパス]
// ========================================================
const region = process.argv[2] || "KANTO";
const jsonPath = process.argv[3] || `./data/${region}_load.json`;

console.log(`\n==============================================`);
console.log(`🤖 処理地域  : ${region}`);
console.log(`📁 読込JSON  : ${jsonPath}`);
console.log(`==============================================\n`);

// 🌟 地域ごとの対象県マップ（将来別地域を増やす時はここに1行足すだけ！）
const regionPrefsMap = {
    "KANTO": ["CHIBA", "KANAGAWA"],
    "KANSAI": ["OSAKA", "HYOGO", "WAKAYAMA"], // 例: 関西用
};

const prefs = regionPrefsMap[region];
if (!prefs) {
    console.error(`❌ エラー: 地域「${region}」の県リストが定義されていません。`);
    process.exit(1);
}

// ========================================================
// ■ JSON読み込み
// ========================================================
function loadJSON(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ エラー: JSONファイルが見つかりません (${filePath})`);
        return null;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw);
    return json.data || json;
}

// ========================================================
// ■ 今日の日付（JST）
// ========================================================
function getToday() {
    return new Date()
        .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// ========================================================
// ■ 出力CSVの先頭date取得
// ========================================================
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

// ========================================================
// ■ CSV読み込み（オブジェクトの配列にパース）
// ========================================================
function loadCSV(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, "utf-8");
    const lines = text.split("\n").filter(Boolean);
    if (lines.length === 0) return null;

    const headers = lines[0].split(",").map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = cols[index] ? cols[index].trim() : "";
        });
        data.push(obj);
    }
    return data;
}

// ========================================================
// ■ CSV書き出し
// ========================================================
function saveCSV(filePath, data) {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const headerLine = headers.join(",");
    const rows = data.map(obj => headers.map(h => obj[h]).join(","));
    fs.writeFileSync(filePath, [headerLine, ...rows].join("\n"), "utf-8");
}

// ========================================================
// ■ メイン実行処理
// ========================================================
function run() {
    // XREAからフェッチした最新のJSONデータを読み込む
    const stations = loadJSON(jsonPath);

    if (!stations) {
        console.error("❌ ステーションデータの読み込みに失敗したため、処理を中断します。");
        process.exit(1);
    }

    console.log("stations:", stations.length);
    const today = getToday();

    // ----------------
    // prefループ
    // ----------------
    for (const pref of prefs) {

        console.log("----", pref, "----");

        // 引数の region（KANTO 等）をパスに自動結合
        const csvPath = `./${region}/${pref}_location.csv`;
        const outPath = `./data/${pref}_whether.csv`;

        // =================================================
        // ■ 先にスキップ判定
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
            console.log("skip pref (no csv):", csvPath);
            continue;
        }

        console.log("spots:", spots.length);

        // ----------------
        // 計算処理（既存ロジック）
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

    console.log("\n🎉 === ALL PROCESS COMPLETED END ===");
}

// 実行
run();
