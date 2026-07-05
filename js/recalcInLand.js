import fs from "fs";
import https from "https";
import { applyFirstStage } from "./whetherNode.js";

// ===== 1. 設定の定義 =====
const region = "KANTO";
const regionCsvPath = `${region}/${region}_region.csv`;
const loadJsonPath = `data/${region}_load.json`; 
const inLandUrl = `https://turiiko.shop/actions/data/${region}_inLand.csv`;
const outCsvPath = `data/${region}_inLand_recalculated.csv`; 

// 簡易CSVパース関数（マスター用）
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
    // 🌐 親データ②: サーバー側 PHP から天気入り内陸CSVを取得 (残りの列を全て結合)
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
            // カンマで細かく分割せず、最初の3つのカンマ位置から前方を抜き出す
            const tokens = line.split(",");
            if (tokens.length < 4) continue;

            const individualId = tokens[0].trim().replace(/^"|"$/g, '');
            const name = tokens[1].trim().replace(/^"|"$/g, '');
            const date = tokens[2].trim().replace(/^"|"$/g, '');
            
            // ★ご提案の通り、残りの要素をすべて結合して一つのJSONにする
            let whetherStr = tokens.slice(3).join(",").trim();
            
            if (!individualId || !whetherStr) continue;
            if (date) targetDate = date;

            // JSON内の不正な空カンマをパース可能な形式（null）に一括置換
            whetherStr = whetherStr
                .replace(/,+(?=\s*\])/g, '')   // 末尾の余分なカンマを除去
                .replace(/,+(?=,)/g, ',null')   // 空カンマをnullに置換
                .replace(/\[\s*,/g, '[null,');  // 配列直後の空カンマをケア

            try {
                const whether = JSON.parse(whetherStr);
                phpWeatherMap[individualId] = whether;

                // whetherNode.js が読める構造にエミュレート
                stationMapForCalc[individualId] = {
                    stationCode: individualId,
                    latlng: "", 
                    lat: null, // 後でマスターCSVから紐付け
                    lng: null,
                    hourly0: { weather: whether.hourly[0].weather },
                    daily: whether.daily
                };
                csvParentCount++;
            } catch (e) {
                console.error(`⚠️ [${individualId}] JSONパース失敗: ${e.message}`);
            }
        }
        console.log(`📥 内陸CSVから ${csvParentCount} 件の親ステーション（直接取得分）を正しくパースして登録しました。`);
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
        }

        // 既に天気がある直接取得駅
        if (phpWeatherMap[individualId]) {
            finalAllRows.push({
                individualId,
                name,
                date: targetDate,
                whether: phpWeatherMap[individualId]
            });
            continue;
        }

        // 再計算が必要なターゲット駅
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

    const allParentStations = Object.values(stationMapForCalc);
    console.log(`📡 総親ステーション数 (JSON + 内陸CSV親): ${allParentStations.length} 件`);
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
