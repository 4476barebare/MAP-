// ========================================================
// ■ coastalArea_control.js (全文決定版)
// ========================================================

import fs from "fs";
import {
    applyFirstStage,
    applySecondStage,
    applyThirdStage
} from "./whetherNode.js"; // 既存の処理モジュール

// ========================================================
// ■ YAMLからの引数受け取り
// コマンド例: node js/coastalArea_control.js [地域名] [JSONのURL]
// ========================================================
const region = process.argv[2] || "KANTO";
const jsonUrl = process.argv[3] || `https://turiiko.shop/actions/data/${region}_load.json`;

console.log(`\n==============================================`);
console.log(`🤖 処理地域  : ${region}`);
console.log(`🌐 参照URL   : ${jsonUrl}`);
console.log(`==============================================\n`);

// 地域ごとの対象県マップ
const regionPrefsMap = {
    "KANTO": ["CHIBA", "KANAGAWA"],
    "KANSAI": ["OSAKA", "HYOGO", "WAKAYAMA"], // 今後増やす場合はここに追加可能
};

const prefs = regionPrefsMap[region];
if (!prefs) {
    console.error(`❌ エラー: 地域「${region}」の県リストが定義されていません。`);
    process.exit(1);
}

// ========================================================
// ■ URLから最新のJSONを取得（15秒タイムアウト ＆ ヘッダー偽装）
// ========================================================
async function fetchJSON(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    // キャッシュ突破用のタイムスタンプを付与
    const fetchUrl = url.includes("?") ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;

    try {
        const response = await fetch(fetchUrl, { 
            signal: controller.signal,
            cache: "no-store",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                "Pragma": "no-cache",
                "Cache-Control": "no-cache"
            }
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`❌ HTTPエラー: ${response.status} ${response.statusText}`);
            return null;
        }

        const json = await response.json();
        return json.data || json;

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error(`❌ エラー: リクエストがタイムアウトしました (15秒)`);
        } else {
            console.error(`❌ 通信エラー:`, error.message);
        }
        return null;
    }
}

// ========================================================
// ■ 今日の日付（JST）
// ========================================================
function getToday() {
    return new Date()
        .toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// ========================================================
// ■ 出力CSVの先頭date取得（元の堅牢な仕様をそのまま維持）
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
// ■ 元のKANTO_control.jsに記述されていた、
//   CSVの列を絶対に崩さないオリジナルのパース＆保存ロジック
// ========================================================
function loadCSV(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, "utf-8");
    const lines = text.split("\r\n").join("\n").split("\n").filter(Boolean);
    if (lines.length === 0) return null;

    const headers = lines[0].split(",").map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // 元の正規表現パース仕様：ダブルクォーテーションに囲まれたJSONを安全に保持
        const matches = line.match(/(".*?"|[^,]+|(Prefectures|County))/g) || [];
        const cols = matches.map(col => {
            let val = col.trim();
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
            }
            return val;
        });

        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = cols[index] !== undefined ? cols[index] : "";
        });
        data.push(obj);
    }
    return data;
}

function saveCSV(filePath, data) {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const headerLine = headers.join(",");

    const rows = data.map(obj => {
        return headers.map(h => {
            let val = obj[h] !== undefined ? String(obj[h]) : "";
            // whether列などのJSON文字列、またはカンマを含むデータのみを安全にダブルクォーテーションでエスケープ
            if (val.includes(",") || val.startsWith("{") || val.startsWith("[")) {
                if (!val.startsWith('"') || !val.endsWith('"')) {
                    val = `"${val}"`;
                }
            }
            return val;
        }).join(",");
    });

    fs.writeFileSync(filePath, [headerLine, ...rows].join("\n"), "utf-8");
}

// ========================================================
// ■ メイン実行処理（元の実行仕様に完全復元）
// ========================================================
async function run() {
    // XREAから非同期でフェッチ
    const stations = await fetchJSON(jsonUrl);

    if (!stations) {
        console.error("❌ ステーションデータの取得に失敗したため、処理を中断します。");
        process.exit(1);
    }

    console.log("stations:", stations.length);
    const today = getToday();

    // prefループ
    for (const pref of prefs) {
        console.log("----", pref, "----");

        // 引数の region（KANTOなど）をフォルダ名に自動適応
        const csvPath = `./${region}/${pref}_location.csv`;
        const outPath = `./data/${pref}_whether.csv`;

        // 先にスキップ判定
        const savedDate = getFirstCSVDate(outPath);

        if (savedDate === today) {
            console.log("⏭ skip (already up to date):", pref, savedDate);
            continue;
        }

        // CSV読み込み
        let spots = loadCSV(csvPath);

        if (!spots) {
            console.log("skip pref (no csv):", csvPath);
            continue;
        }

        console.log("spots:", spots.length);

        // 重い計算処理の実行（元のwhetherNode.jsのロジックへそのまま引き渡す）
        applyFirstStage(spots, stations);
        applySecondStage(spots);
        applyThirdStage(spots);

        const ok = spots.filter(s => s.whether).length;
        console.log("completed:", ok, "/", spots.length);

        // 元の正しい出力形式へ安全に書き出し
        saveCSV(outPath, spots);
        console.log("saved:", outPath);
    }

    console.log("\n🎉 === ALL PROCESS COMPLETED END ===");
}

// 実行
run();
