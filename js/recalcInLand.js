import fs from "fs";
import https from "https";
// Thirdも使えるようにあらかじめインポートしておきます
import { applyFirstStage, applySecondStage, applyThirdStage } from "./whetherNode.js";

// ===== 1. 設定の定義 =====
const region = "KANTO";
const regionCsvPath = `${region}/${region}_region.csv`;
const loadJsonPath = `data/${region}_load.json`; 
const inLandUrl = `https://turiiko.shop/actions/data/${region}_inLand.csv`;
const outCsvPath = `data/${region}_inLand_recalculated.csv`; 

// 簡易CSVパース関数
function parseCsvLine(line) {
    return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v ? v.trim().replace(/^"|"$/g, '') : "");
}

// httpsでURLからテキストを取得
function fetchUrlText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to get page, status code: ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

// whetherNode.js 用の形式変換ツール
function formatForNode(data) {
    if (!data) return undefined;
    return {
        ...data,
        weather: data.weather ? data.weather.map(w => {
            if (Array.isArray(w)) return w.join("|");
            return w !== null && w !== undefined ? String(w) : "";
        }) : []
    };
}

function encodeDaily(dailyArray) {
    if (!dailyArray || !Array.isArray(dailyArray)) return "";
    const parts = [];
    let maxW = 0;
    for (const d of dailyArray) {
        if (d.weather && d.weather.length > maxW) maxW = d.weather.length;
    }
    maxW = Math.max(maxW, 10); 
    
    for (let j = 0; j < maxW; j++) {
        const vals = dailyArray.map(d => {
            if (d.weather && d.weather[j] !== undefined && d.weather[j] !== null) {
                return String(d.weather[j]);
            }
            return "";
        });
        parts.push(vals.join("|"));
    }
    return parts.join(";");
}

// ★ 追加：計算済みのスポット(Spot)を、親ステーション(Station)の形式に擬態させる関数
function spotToStation(spot) {
    if (!spot.whether) return null;
    return {
        stationCode: spot.individualId,
        latlng: `${spot.lat};${spot.lng}`,
        lat: spot.lat,
        lng: spot.lng,
        hourly0: formatForNode(spot.whether.hourly && spot.whether.hourly[0]),
        hourly1: formatForNode(spot.whether.hourly && spot.whether.hourly[1]),
        hourly2: formatForNode(spot.whether.hourly && spot.whether.hourly[2]),
        daily: encodeDaily(spot.whether.daily)
    };
}

// ===== 2. メイン処理 =====
async function run() {
    console.log(`🚀 [${region}] 再計算処理を開始します。`);

    // ----------------------------------------------------------------
    // 📦 親データ①: 既存の JSON ステーション
    // ----------------------------------------------------------------
    const stationMapForCalc = {};
    if (fs.existsSync(loadJsonPath)) {
        const rawJson = JSON.parse(fs.readFileSync(loadJsonPath, "utf-8"));
        const jsonStations = rawJson.data || rawJson;
        jsonStations.forEach(s => {
            if (s.stationCode) {
                stationMapForCalc[s.stationCode] = s;
            }
        });
        console.log(`📦 既存JSONから ${Object.keys(stationMapForCalc).length} 件の親ステーションを登録しました。`);
    }

    // ----------------------------------------------------------------
    // 🌐 親データ②: サーバー側 PHP から天気入り内陸CSVを取得
    // ----------------------------------------------------------------
    let targetDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const phpWeatherMap = {}; 

    try {
        console.log(`🌐 リモートから天気取得済みの内陸CSVを取得中...`);
        const csvData = await fetchUrlText(inLandUrl);
        const inLandLines = csvData.split("\n").filter(Boolean);
        inLandLines.shift(); // ヘッダー除去

        let csvParentCount = 0;
        for (const line of inLandLines) {
            const tokens = line.split(",");
            if (tokens.length < 4) continue;

            const individualId = tokens[0].trim().replace(/^"|"$/g, '');
            const name = tokens[1].trim().replace(/^"|"$/g, '');
            const date = tokens[2].trim().replace(/^"|"$/g, '');
            let whetherStr = tokens.slice(3).join(",").trim();
            
            if (!individualId || !whetherStr) continue;
            if (date) targetDate = date;

            let prevStr;
            do {
                prevStr = whetherStr;
                whetherStr = whetherStr.replace(/,,/g, ',"",');
            } while (whetherStr !== prevStr);

            whetherStr = whetherStr
                .replace(/:\s*,/g, ':"",')
                .replace(/:\s*}/g, ':""}')
                .replace(/\[\s*,/g, '["",')
                .replace(/,\s*\]/g, ']');

            try {
                const whether = JSON.parse(whetherStr);
                phpWeatherMap[individualId] = whether; 
                
                // 親ステーションとして登録
                stationMapForCalc[individualId] = {
                    stationCode: individualId,
                    latlng: "", lat: null, lng: null,
                    hourly0: formatForNode(whether.hourly && whether.hourly[0]),
                    hourly1: formatForNode(whether.hourly && whether.hourly[1]),
                    hourly2: formatForNode(whether.hourly && whether.hourly[2]),
                    daily: encodeDaily(whether.daily)
                };
                csvParentCount++;
            } catch (e) {
                console.error(`⚠️ [${individualId}] JSONパース失敗: ${e.message}`);
            }
        }
        console.log(`📥 内陸CSVから ${csvParentCount} 件の親ステーションを登録しました。`);
    } catch (error) {
        console.error("❌ リモートCSVの取得に失敗しました:", error.message);
        return;
    }

    // ----------------------------------------------------------------
    // 🗺 マスターCSV (KANTO_region.csv) を元に全てのスポットを配列化
    // ----------------------------------------------------------------
    if (!fs.existsSync(regionCsvPath)) {
        console.error(`❌ リージョンCSVが見つかりません: ${regionCsvPath}`);
        return;
    }
    const regionLines = fs.readFileSync(regionCsvPath, "utf-8").split("\n").filter(Boolean);
    regionLines.shift(); 

    const finalAllRows = []; 
    let calcTargetCount = 0;

    for (const line of regionLines) {
        const r = parseCsvLine(line);
        if (r.length < 8) continue;

        const name = r[0];
        const individualId = r[2];
        const lat = parseFloat(r[3]) || 0;
        const lng = parseFloat(r[4]) || 0;
        const notes = r[7] ? r[7].trim() : "";

        if (!individualId) continue;

        if (stationMapForCalc[individualId]) {
            stationMapForCalc[individualId].lat = lat;
            stationMapForCalc[individualId].lng = lng;
            stationMapForCalc[individualId].latlng = `${lat};${lng}`;
        }

        const spotObj = {
            individualId, name, date: targetDate, lat, lng, notes, icon: "spot", whether: null
        };

        if (phpWeatherMap[individualId]) {
            spotObj.whether = phpWeatherMap[individualId];
        } else if (notes.includes("/")) {
            calcTargetCount++;
        }

        finalAllRows.push(spotObj);
    }

    let allParentStations = Object.values(stationMapForCalc).filter(s => s.latlng && s.latlng !== "");
    
    console.log(`📡 計算可能な初期親ステーション数: ${allParentStations.length} 件`);

    // ----------------------------------------------------------------
    // 🧮 ステージごとの段階的な再計算
    // ----------------------------------------------------------------
    if (calcTargetCount > 0) {
        // --- 【Firstステージ】 ---
        console.log("🧮 距離補間（Firstステージ再計算）を実行中...");
        applyFirstStage(finalAllRows, allParentStations);

        // ★重要: Firstで計算された結果を親ステーションリストに合流させる！
        let newFirstParents = 0;
        finalAllRows.forEach(spot => {
            if (spot.notes.startsWith("First/") && spot.whether) {
                const newStation = spotToStation(spot);
                if (newStation) {
                    allParentStations.push(newStation);
                    newFirstParents++;
                }
            }
        });
        console.log(`🔄 First結果 ${newFirstParents} 件をSecondのソースとして追加しました。`);

        // --- 【Secondステージ】 ---
        console.log("🧮 距離補間（Secondステージ再計算）を実行中...");
        applySecondStage(finalAllRows, allParentStations);

        // (将来用) Secondで計算された結果も親に合流させてThirdへ
        // finalAllRows.forEach(spot => {
        //     if (spot.notes.startsWith("Second/") && spot.whether) {
        //         const newStation = spotToStation(spot);
        //         if (newStation) allParentStations.push(newStation);
        //     }
        // });
        // console.log("🧮 距離補間（Thirdステージ再計算）を実行中...");
        // applyThirdStage(finalAllRows, allParentStations);

    } else {
        console.log("⚠️ 再計算対象のターゲット行が見つかりませんでした。");
    }

    // ----------------------------------------------------------------
    // 💾 保存
    // ----------------------------------------------------------------
    console.log("💾 計算結果をCSVファイルに書き出しています...");
    const outLines = ["individualId,name,date,whether"];

    for (const row of finalAllRows) {
        const whetherStr = row.whether ? JSON.stringify(row.whether).replace(/""/g, '') : "";
        outLines.push(`${row.individualId},${row.name},${row.date},${whetherStr}`);
    }

    fs.writeFileSync(outCsvPath, outLines.join("\n") + "\n", "utf-8");
    console.log(`✨ 完了しました！ 保存先: ${outCsvPath}`);
}

run();
