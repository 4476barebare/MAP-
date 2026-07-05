import fs from "fs";
import https from "https";
import { applyFirstStage } from "./whetherNode.js";

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

// httpsでURLからテキストを取得する関数
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

// whetherNode.js 用に hourly 配列をパイプ(|)区切りの文字列に変換
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

// ★ whetherNode.js 用に daily 配列をセミコロン(;)とパイプ(|)区切りの文字列に変換（今回の修正の要）
function encodeDaily(dailyArray) {
    if (!dailyArray || !Array.isArray(dailyArray)) return "";
    const parts = [];
    
    // weather配列の最大長を特定（欠損対策）
    let maxW = 0;
    for (const d of dailyArray) {
        if (d.weather && d.weather.length > maxW) maxW = d.weather.length;
    }
    maxW = Math.max(maxW, 10); // 安全のために最低10項目分は枠を作る
    
    // PHP側の縦のデータ(日ごと)を、横のデータ(項目ごと)に変換(転置)して結合
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

// ===== 2. メイン処理 =====
async function run() {
    console.log(`🚀 [${region}] 再計算処理を開始します。`);

    // ----------------------------------------------------------------
    // 📦 親データ①: 既存の JSON ステーションデータを読み込み
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
        console.log(`🌐 リモートから天気取得済みの内陸CSVを取得中: ${inLandUrl}`);
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

            // JSONの完全復元処理（空文字の復元）
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
                phpWeatherMap[individualId] = whether; // 出力用に元のキレイな配列データを保持

                // whetherNode.js の計算用に構造を完全にエミュレートして登録
                stationMapForCalc[individualId] = {
                    stationCode: individualId,
                    latlng: "", 
                    lat: null, 
                    lng: null,
                    hourly0: formatForNode(whether.hourly && whether.hourly[0]),
                    hourly1: formatForNode(whether.hourly && whether.hourly[1]),
                    hourly2: formatForNode(whether.hourly && whether.hourly[2]),
                    daily: encodeDaily(whether.daily) // ★ここで専用文字列に変換！
                };
                csvParentCount++;
            } catch (e) {
                console.error(`⚠️ [${individualId}] JSONパース失敗: ${e.message}`);
            }
        }
        console.log(`📥 内陸CSVから ${csvParentCount} 件の親ステーション（直接取得分）を登録しました。`);
    } catch (error) {
        console.error("❌ リモートCSVの取得または処理に失敗しました:", error.message);
        return;
    }

    // ----------------------------------------------------------------
    // 🗺 マスターCSV (KANTO_region.csv) を元にターゲットを構築
    // ----------------------------------------------------------------
    if (!fs.existsSync(regionCsvPath)) {
        console.error(`❌ リージョンCSVが見つかりません: ${regionCsvPath}`);
        return;
    }
    const regionLines = fs.readFileSync(regionCsvPath, "utf-8").split("\n").filter(Boolean);
    regionLines.shift(); // ヘッダー除去

    const spotsForCalc = []; 
    const finalAllRows = []; 

    for (const line of regionLines) {
        const r = parseCsvLine(line);
        if (r.length < 8) continue;

        const name = r[0];
        const individualId = r[2];
        const lat = parseFloat(r[3]) || 0;
        const lng = parseFloat(r[4]) || 0;
        const notes = r[7] ? r[7].trim() : "";

        if (!individualId) continue;

        // 親の座標を補完
        if (stationMapForCalc[individualId]) {
            stationMapForCalc[individualId].lat = lat;
            stationMapForCalc[individualId].lng = lng;
            stationMapForCalc[individualId].latlng = `${lat};${lng}`;
        }

        // 既に天気がある直接取得駅は計算を飛ばして結果配列へ入れる
        if (phpWeatherMap[individualId]) {
            finalAllRows.push({
                individualId,
                name,
                date: targetDate,
                whether: phpWeatherMap[individualId]
            });
            continue;
        }

        // 再計算が必要なターゲット駅 (First/ID/ID)
        if (notes.startsWith("First/")) {
            const spotObj = {
                individualId,
                name,
                date: targetDate,
                lat: lat,
                lng: lng,
                notes: notes,
                icon: "spot",
                whether: null
            };
            spotsForCalc.push(spotObj);
            finalAllRows.push(spotObj);
        }
    }

    // latlngがセットされている有効な親ステーションだけを抽出
    const allParentStations = Object.values(stationMapForCalc).filter(s => s.latlng && s.latlng !== "");
    
    console.log(`📡 計算可能な総親ステーション数: ${allParentStations.length} 件`);
    console.log(`🎯 再計算対象ターゲット (First/ID/ID) 数: ${spotsForCalc.length} 件`);

    // ----------------------------------------------------------------
    // 🧮 whetherNode.js の First処理を実行
    // ----------------------------------------------------------------
    if (spotsForCalc.length > 0) {
        console.log("🧮 距離補間（Firstステージ再計算）を実行中...");
        applyFirstStage(spotsForCalc, allParentStations);
    } else {
        console.log("⚠️ 再計算対象のターゲット行が見つかりませんでした。");
    }

    // ----------------------------------------------------------------
    // 💾 計算結果をまとめてCSVファイルに保存
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
