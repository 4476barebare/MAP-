import fs from "fs";
import axios from "axios"; // リモートCSV取得用（npm install axios してください）
import { applyFirstStage } from "./whetherNode.js";

// ===== 1. 設定の定義 =====
const region = "KANTO";
const regionCsvPath = `${region}/${region}_region.csv`;
const loadJsonPath = `data/${region}_load.json`; // もし手元が.txtなら適宜リネームか変更してください
const inLandUrl = `https://turiiko.shop/actions/data/${region}_inLand.csv`;
const outCsvPath = `data/${region}_inLand_recalculated.csv`; // 計算結果の出力先

// 簡易CSVパース関数（JSON内のカンマを無視）
function parseCsvLine(line) {
    return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, ''));
}

// ===== 2. データの読み込みと整形 =====
async function run() {
    console.log(`🚀 [${region}] 再計算処理を開始します。`);

    // ① 既存の JSON ステーションデータを読み込み
    let jsonStations = [];
    if (fs.existsSync(loadJsonPath)) {
        const rawJson = JSON.parse(fs.readFileSync(loadJsonPath, "utf-8"));
        jsonStations = rawJson.data || rawJson;
        console.log(`📦 既存JSONから ${jsonStations.length} 件のステーションを読み込みました。`);
    } else {
        console.log(`⚠️ 既存JSONファイルが見つかりません: ${loadJsonPath}`);
    }

    // ② サーバー側の PHP が生成した inLand.csv をダウンロード
    let inLandLines = [];
    try {
        console.log(`🌐 リモートCSVを取得中: ${inLandUrl}`);
        const response = await axios.get(inLandUrl);
        inLandLines = response.data.split("\n").filter(Boolean);
        console.log(`📥 内陸CSVから ${inLandLines.length - 1} 行のデータを取得しました。`);
    } catch (error) {
        console.error("❌ リモートCSVの取得に失敗しました:", error.message);
        return;
    }

    // ③ マスタデータ（KANTO_region.csv）から座標情報を取得
    if (!fs.existsSync(regionCsvPath)) {
        console.error(`❌ リージョンCSVが見つかりません: ${regionCsvPath}`);
        return;
    }
    const regionLines = fs.readFileSync(regionCsvPath, "utf-8").split("\n").filter(Boolean);
    regionLines.shift(); // ヘッダー除去
    
    const geoMap = {};
    for (const line of regionLines) {
        const r = parseCsvLine(line);
        if (r.length >= 8) {
            const id = r[2]; // individualId (F001など)
            geoMap[id] = {
                lat: parseFloat(r[3]),
                lng: parseFloat(r[4]),
                notes: r[7],
                icon: r[8] || "station"
            };
        }
    }

    // ④ すべての「親データ」を whetherNode.js が読めるオブジェクト形式に統合・一元化
    const stationMapForCalc = {};

    // JSON側の親データをマッピング
    jsonStations.forEach(s => {
        if (s.stationCode) {
            stationMapForCalc[s.stationCode] = s;
        }
    });

    // CSV側の「First（取得済み）」の親データをJSON側と同じ構造にエミュレートして追加
    const inLandHeader = inLandLines.shift(); // ヘッダー除去
    const csvSpots = []; // 後で計算結果を詰めるための配列

    for (const line of inLandLines) {
        const [individualId, name, date, whetherStr] = parseCsvLine(line);
        if (!individualId) continue;

        const geo = geoMap[individualId] || {};
        let whether = null;
        if (whetherStr && whetherStr.startsWith("{")) {
            try { whether = JSON.parse(whetherStr); } catch (e) { whether = null; }
        }

        // 既存の「First単体」の行＝すでにAPI取得済みの親ステーション
        if (geo.notes === "First" && whether) {
            stationMapForCalc[individualId] = {
                stationCode: individualId,
                latlng: `${geo.lat};${geo.lng}`, // whetherNodeがバラして使う形式に合わせる
                lat: geo.lat,
                lng: geo.lng,
                // whetherNode.js の normalizeStationToWeather が期待する階層に合わせる
                hourly0: { weather: whether.hourly[0].weather },
                daily: whether.daily
            };
        }

        // すべての地点（計算対象も含めて）を spots リストに保持
        csvSpots.push({
            individualId,
            name,
            date,
            lat: geo.lat,
            lng: geo.lng,
            notes: geo.notes,
            icon: "spot", // whetherNodeの判定を通過させるために一時的に"spot"にする
            whether: whether
        });
    }

    // `applyFirstStage` に渡すための親ステーションの配列化
    const allParentStations = Object.values(stationMapForCalc);
    console.log(`📡 総親ステーション数 (JSON + CSV内陸親): ${allParentStations.length} 件`);

    // ===== 3. whetherNode.js の First処理を実行 =====
    console.log("🧮 残りのステーション（First/ID/ID）の再計算を実行します...");
    applyFirstStage(csvSpots, allParentStations);

    // ===== 4. 計算された結果をCSVに整形して保存 =====
    console.log("💾 計算結果をCSVファイルに書き出しています...");
    const outLines = ["individualId,name,date,whether"];

    for (const spot of csvSpots) {
        // 出力時は元の仕様（本来のアイコン状態など）を想定し、JSON文字列に戻す
        const whetherStr = spot.whether ? JSON.stringify(spot.whether).replace(/""/g, '') : "";
        outLines.push(`${spot.individualId},${spot.name},${spot.date},${whetherStr}`);
    }

    fs.writeFileSync(outCsvPath, outLines.join("\n") + "\n", "utf-8");
    console.log(`✨ 完了しました！ 保存先: ${outCsvPath}`);
}

run();
