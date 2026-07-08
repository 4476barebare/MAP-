// ========================================================
// ■ coastalArea_control.js
// ========================================================

import fs from "fs";
import {
    applyFirstStage,
    applySecondStage,
    applyThirdStage
} from "./whetherNode.js"; 

// ========================================================
// 🌟 YAMLからの引数受け取り（第2引数にURLを直接指定）
// ========================================================
const region = process.argv[2] || "KANTO";
// 引数がない場合はデフォルトのURLを自動生成
const jsonUrl = process.argv[3] || `https://turiiko.shop/actions/data/${region}_load.json`;

console.log(`\n==============================================`);
console.log(`🤖 処理地域  : ${region}`);
console.log(`🌐 参照URL   : ${jsonUrl}`);
console.log(`==============================================\n`);

const regionPrefsMap = {
    "KANTO": ["CHIBA", "KANAGAWA"],
    "KANSAI": ["OSAKA", "HYOGO", "WAKAYAMA"],
};

const prefs = regionPrefsMap[region];
if (!prefs) {
    console.error(`❌ エラー: 地域「${region}」の県リストが定義されていません。`);
    process.exit(1);
}

// ========================================================
// 🌟 変更：URLから直接JSONを取得（15秒タイムアウト付き）
// ========================================================
// ========================================================
// 🌟 変更：URLから直接JSONを取得（ヘッダー偽装 ＆ 15秒タイムアウト付き）
// ========================================================
async function fetchJSON(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(url, { 
            signal: controller.signal,
            // 🌟 追加：普通のPCブラウザ（Chrome）のフリをしてXREAのセキュリティをすり抜ける
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
            }
        });
        
        clearTimeout(timeoutId); // 成功したらタイマー解除

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
            console.error(`💡 ヒント: XREAサーバー側でNode.jsからのアクセスが強制遮断されている可能性があります。`);
        }
        return null;
    }
}

// ========================================================
// ■ 今日の日付（JST）
// ========================================================
function getToday() {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

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
// ■ CSV読み込み（🌟JSONデータを破壊しない安全なパース仕様）
// ========================================================
function loadCSV(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, "utf-8");
    const lines = text.split("\n").filter(Boolean);
    if (lines.length === 0) return null;

    // ヘッダーをカンマで分割
    const headers = lines[0].split(",").map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // 🌟 正規表現を使って、ダブルクォーテーションで囲まれたJSONデータ（whether列）を1つの塊として安全に切り分ける
        const matches = line.match(/(".*?"|[^,]+|(Prefectures|County))/g) || [];
        const cols = matches.map(col => {
            let val = col.trim();
            // 前後の余計なダブルクォーテーションを綺麗に剥ぎ取る
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

// ========================================================
// ■ CSV書き出し（🌟元の正しい出力形式へ完全復元）
// ========================================================
function saveCSV(filePath, data) {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const headerLine = headers.join(",");

    const rows = data.map(obj => {
        return headers.map(h => {
            let val = obj[h] !== undefined ? String(obj[h]) : "";
            
            // 🌟 whether列などの複雑なJSON文字列、またはカンマを含むデータの場合
            //    前後にダブルクォーテーションをつけて安全にエスケープする
            if (val.includes(",") || val.startsWith("{") || val.startsWith("[")) {
                // すでに囲まれていない場合のみ囲む
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
// 🌟 メイン実行処理（async化）
// ========================================================
async function run() {
    // URLからフェッチ
    const stations = await fetchJSON(jsonUrl);

    if (!stations) {
        console.error("❌ ステーションデータの取得に失敗したため、処理を中断します。");
        process.exit(1);
    }

    console.log("stations:", stations.length);
    const today = getToday();

    for (const pref of prefs) {
        console.log("----", pref, "----");

        const csvPath = `./${region}/${pref}_location.csv`;
        const outPath = `./data/${pref}_whether.csv`;

        const savedDate = getFirstCSVDate(outPath);

        if (savedDate === today) {
            console.log("⏭ skip (already up to date):", pref, savedDate);
            continue;
        }

        let spots = loadCSV(csvPath);

        if (!spots) {
            console.log("skip pref (no csv):", csvPath);
            continue;
        }

        console.log("spots:", spots.length);

        applyFirstStage(spots, stations);
        applySecondStage(spots);
        applyThirdStage(spots);

        const ok = spots.filter(s => s.whether).length;
        console.log("completed:", ok, "/", spots.length);

        saveCSV(outPath, spots);
        console.log("saved:", outPath);
    }

    console.log("\n🎉 === ALL PROCESS COMPLETED END ===");
}

// 実行
run();
