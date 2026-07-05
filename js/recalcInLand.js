import fs from "fs";
import https from "https";

// ===== 1. 設定の定義 =====
const region = "KANTO";
const regionCsvPath = `${region}/${region}_region.csv`;
const loadJsonPath = `data/${region}_load.json`; 
const inLandUrl = `https://turiiko.shop/actions/data/${region}_inLand.csv`;
const outCsvPath = `data/${region}_inLand_recalculated.csv`; 

// --- ユーティリティ ---
function parseCsvLine(line) {
    return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v ? v.trim().replace(/^"|"$/g, '') : "");
}

function fetchUrlText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) reject(new Error(`Status: ${res.statusCode}`));
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', err => reject(err));
    });
}

// 既存JSONの "1|22" のような文字列を、PHPと同じ純粋な配列 [1, 22] に統一する関数
function normalizeWeather(obj) {
    if (obj == null) return obj;
    if (Array.isArray(obj)) return obj.map(normalizeWeather);
    if (typeof obj === 'object') {
        const res = {};
        for (const key in obj) res[key] = normalizeWeather(obj[key]);
        return res;
    }
    if (typeof obj === 'string') {
        if (obj.includes(';')) return obj.split(';').filter(Boolean).map(s => s.split('|').map(v => v === "" ? null : Number(v)));
        if (obj.includes('|')) return obj.split('|').map(v => v === "" ? null : Number(v));
    }
    return obj;
}

// --- 数学・補間ロジック（whetherNode.jsの代替） ---

// 2点間の距離を計算（ハバシン公式）
function calcGeoDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

// 2つの数値を距離に応じて加重平均する
function lerp(val1, dist1, val2, dist2) {
    const v1 = val1 !== "" && val1 != null ? Number(val1) : NaN;
    const v2 = val2 !== "" && val2 != null ? Number(val2) : NaN;
    if (isNaN(v1) && isNaN(v2)) return val1 !== undefined ? val1 : val2;
    if (isNaN(v1)) return val2;
    if (isNaN(v2)) return v1;
    if (dist1 === 0) return v1;
    if (dist2 === 0) return v2;
    const total = dist1 + dist2;
    return (v1 * (dist2 / total)) + (v2 * (dist1 / total));
}

// 天気JSONオブジェクト全体を再帰的に巡回し、すべての数値を一括で加重平均する強力な関数
function deepLerp(obj1, dist1, obj2, dist2) {
    if (obj1 == null && obj2 == null) return null;
    if (obj1 == null) return JSON.parse(JSON.stringify(obj2));
    if (obj2 == null) return JSON.parse(JSON.stringify(obj1));

    if (Array.isArray(obj1) || Array.isArray(obj2)) {
        const arr1 = Array.isArray(obj1) ? obj1 : [];
        const arr2 = Array.isArray(obj2) ? obj2 : [];
        const maxLen = Math.max(arr1.length, arr2.length);
        const res = [];
        for (let i = 0; i < maxLen; i++) res.push(deepLerp(arr1[i], dist1, arr2[i], dist2));
        return res;
    }

    if (typeof obj1 === 'object' || typeof obj2 === 'object') {
        const o1 = typeof obj1 === 'object' ? obj1 : {};
        const o2 = typeof obj2 === 'object' ? obj2 : {};
        const res = {};
        const keys = new Set([...Object.keys(o1), ...Object.keys(o2)]);
        for (const key of keys) {
            if (key === 'stationCode' || key === 'name') continue; // メタデータは無視
            res[key] = deepLerp(o1[key], dist1, o2[key], dist2);
        }
        return res;
    }

    if (typeof obj1 === 'number' || typeof obj2 === 'number') {
        return lerp(obj1, dist1, obj2, dist2);
    }
    
    return obj1 !== undefined && obj1 !== "" ? obj1 : obj2;
}

// ===== 2. メイン処理 =====
async function run() {
    console.log(`🚀 [${region}] 完全独立版の再計算処理を開始します。`);

    const stationMap = {}; // すべての親データをここに集約（構造は純粋なJSON）

    // ① JSONから取得
    if (fs.existsSync(loadJsonPath)) {
        const rawJson = JSON.parse(fs.readFileSync(loadJsonPath, "utf-8"));
        const jsonStations = rawJson.data || rawJson;
        jsonStations.forEach(s => {
            if (s.stationCode && s.lat != null) {
                stationMap[s.stationCode] = { lat: parseFloat(s.lat), lng: parseFloat(s.lng), whether: normalizeWeather(s) };
            }
        });
        console.log(`📦 既存JSONから ${Object.keys(stationMap).length} 件の親ステーションを登録`);
    }

    // ② PHP CSVから取得
    let targetDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    try {
        const csvData = await fetchUrlText(inLandUrl);
        const inLandLines = csvData.split("\n").filter(Boolean);
        inLandLines.shift(); 
        let phpCount = 0;

        for (const line of inLandLines) {
            const tokens = line.split(",");
            if (tokens.length < 4) continue;

            const id = tokens[0].trim().replace(/^"|"$/g, '');
            const date = tokens[2].trim().replace(/^"|"$/g, '');
            let whetherStr = tokens.slice(3).join(",").trim();
            
            if (!id || !whetherStr) continue;
            if (date) targetDate = date;

            let prevStr;
            do { prevStr = whetherStr; whetherStr = whetherStr.replace(/,,/g, ',"",'); } while (whetherStr !== prevStr);
            whetherStr = whetherStr.replace(/:\s*,/g, ':"",').replace(/:\s*}/g, ':""}').replace(/\[\s*,/g, '["",').replace(/,\s*\]/g, ']');

            try {
                // 座標は後でマスターから埋めるのでnull
                stationMap[id] = { lat: null, lng: null, whether: normalizeWeather(JSON.parse(whetherStr)) };
                phpCount++;
            } catch (e) {}
        }
        console.log(`📥 内陸CSVから ${phpCount} 件の親ステーションを登録`);
    } catch (error) {
        console.error("❌ リモートCSVの取得失敗:", error.message);
        return;
    }

    // ③ マスターCSV読み込みとターゲット選定
    if (!fs.existsSync(regionCsvPath)) return console.error(`❌ マスターCSV不在: ${regionCsvPath}`);
    const regionLines = fs.readFileSync(regionCsvPath, "utf-8").split("\n").filter(Boolean);
    regionLines.shift(); 

    const finalRows = []; 
    const calcTargets = [];

    for (const line of regionLines) {
        const r = parseCsvLine(line);
        if (r.length < 8) continue;
        const name = r[0], id = r[2], lat = parseFloat(r[3])||0, lng = parseFloat(r[4])||0, notes = r[7]?r[7].trim():"";
        if (!id) continue;

        if (stationMap[id]) {
            stationMap[id].lat = lat;
            stationMap[id].lng = lng;
            finalRows.push({ id, name, date: targetDate, whether: stationMap[id].whether });
        } else {
            const spot = { id, name, date: targetDate, lat, lng, notes, whether: null };
            calcTargets.push(spot);
            finalRows.push(spot);
        }
    }

    // ④ 計算ステージ処理の共通関数
    function processStage(stageName) {
        let count = 0;
        for (const spot of calcTargets) {
            if (spot.notes.startsWith(`${stageName}/`) && !spot.whether) {
                const parts = spot.notes.split("/");
                const p1 = parts[1];
                const p2 = parts[2];

                const s1 = stationMap[p1];
                const s2 = stationMap[p2];

                // 2つの親がいる場合は距離で加重平均
                if (s1 && s2 && s1.lat != null && s2.lat != null) {
                    const d1 = calcGeoDistance(spot.lat, spot.lng, s1.lat, s1.lng);
                    const d2 = calcGeoDistance(spot.lat, spot.lng, s2.lat, s2.lng);
                    spot.whether = deepLerp(s1.whether, d1, s2.whether, d2);
                    stationMap[spot.id] = { lat: spot.lat, lng: spot.lng, whether: spot.whether }; // ★次のステージのために親として登録！
                    count++;
                } 
                // 親が1つだけ指定されている場合はそのままコピー
                else if (s1 && s1.lat != null && !p2) {
                    spot.whether = JSON.parse(JSON.stringify(s1.whether));
                    stationMap[spot.id] = { lat: spot.lat, lng: spot.lng, whether: spot.whether };
                    count++;
                }
            }
        }
        return count;
    }

    // 順番に実行（Firstの結果が自動的にSecondの親になり、SecondがThirdの親になる）
    console.log(`🧮 Firstステージ: ${processStage("First")} 件 計算完了`);
    console.log(`🧮 Secondステージ: ${processStage("Second")} 件 計算完了`);
    console.log(`🧮 Thirdステージ: ${processStage("Third")} 件 計算完了`);

    // ⑤ 出力
    console.log("💾 計算結果をCSVに書き出し中...");
    const outLines = ["individualId,name,date,whether"];
    for (const row of finalRows) {
        const whetherStr = row.whether ? JSON.stringify(row.whether).replace(/""/g, '') : "";
        outLines.push(`${row.id},${row.name},${row.date},${whetherStr}`);
    }

    fs.writeFileSync(outCsvPath, outLines.join("\n") + "\n", "utf-8");
    console.log(`✨ 完了しました！ 保存先: ${outCsvPath}`);
}

run();
