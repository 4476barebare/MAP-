import fs from "fs";
import https from "https";

// ========================================================
// ===== 1. 設定の定義（引数受け取りに変更） =====
// ========================================================
const region = process.argv[2] || "KANTO";
const jsonUrl = process.argv[3] || `https://turiiko.shop/actions/data/${region}_load.json`; 

const regionCsvPath = `${region}/${region}_region.csv`;
const inLandUrl = `https://turiiko.shop/actions/data/${region}_inLand.csv`;
const outCsvPath = `data/${region}_inLand_recalculated.csv`; 

// ========================================================
// 🌟 追加：URLからJSONを取得（15秒タイムアウト・ヘッダー偽装・キャッシュ回避）
// ========================================================
async function fetchJSON(url) {
    const fetchUrl = url.includes("?") ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
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
        if (!response.ok) return null;
        const json = await response.json();
        return json.data || json;
    } catch (error) {
        clearTimeout(timeoutId);
        console.error("❌ 通信エラー:", error.message);
        return null;
    }
}

// ========================================================
// ⚠️ 以下、既存のパース・計算・シリアライズ処理（一切変更なし）
// ========================================================
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

// --- パーサー ---
function parseDailyString(dailyStr) {
    if (!dailyStr) return [];
    return dailyStr.split(';').filter(Boolean).map(day => day.split('|'));
}

function parsePHPDaily(dailyArr) {
    if (!dailyArr) return [];
    return dailyArr.map(day => {
        const w = day.weather || [];
        return [
            w[0] != null ? String(w[0]) : "",
            w[1] != null ? String(w[1]) : "",
            "", "", "", "", "" 
        ];
    });
}

function parseHourlyString(arr) {
    if (!arr) return [];
    return arr.map(str => str.split('|'));
}

function parsePHPHourly(hourlyObj) {
    if (!hourlyObj || !hourlyObj.weather) return [];
    return hourlyObj.weather.map(arr => arr.map(v => v != null ? String(v) : ""));
}

function normalizeCoastalStation(s) {
    const res = {};
    for (const h of ['hourly0', 'hourly1', 'hourly2']) {
        if (s[h]) {
            res[h] = {
                weather: parseHourlyString(s[h].weather),
                water: s[h].water ? s[h].water.split('|') : [],
                tide: s[h].tide || []
            };
        }
    }
    res.daily = parseDailyString(s.daily);
    return res;
}

function normalizeInlandStation(w) {
    const res = {};
    for (const [i, h] of ['hourly0', 'hourly1', 'hourly2'].entries()) {
        if (w.hourly && w.hourly[i]) {
            res[h] = {
                weather: parsePHPHourly(w.hourly[i]),
                water: [], tide: [] 
            };
        }
    }
    res.daily = parsePHPDaily(w.daily);
    return res;
}

// --- シリアライザー ---
function timeToMinutes(tStr) {
    if (!tStr) return null;
    if (!isNaN(Number(tStr))) return Number(tStr); 
    const m = String(tStr).match(/T(\d{2}):(\d{2})/); 
    if (m) {
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    }
    return null;
}

function serializeToChibaFormat(s) {
    const res = {
        hourly: [],
        daily: []
    };

    for (const h of ['hourly0', 'hourly1', 'hourly2']) {
        if (s[h]) {
            const hourObj = { weather: [] };
            
            if (s[h].weather && s[h].weather.length > 0) {
                hourObj.weather = s[h].weather.map(arr => arr.map(v => v === "" || v == null ? null : Number(v)));
            }
            
            hourObj.oneday = { avg: null, sunrise: null, sunset: null };
            if (s[h].water && s[h].water.length >= 3) {
                hourObj.oneday = {
                    avg: s[h].water[0] === "" || s[h].water[0] == null ? null : Number(s[h].water[0]),
                    sunrise: timeToMinutes(s[h].water[1]),
                    sunset: timeToMinutes(s[h].water[2])
                };
            } else if (s[h].water && s[h].water.length > 0) {
                hourObj.oneday.avg = s[h].water[0] === "" || s[h].water[0] == null ? null : Number(s[h].water[0]);
            }
            
            hourObj.tide = [];
            if (s[h].tide && s[h].tide.length > 0) {
                hourObj.tide = s[h].tide.map(v => Number(v) || 0);
            }

            res.hourly.push(hourObj);
        }
    }

    if (s.daily && s.daily.length > 0) {
        res.daily = s.daily.map(arr => {
            const dObj = { weather: [], tide: [], dailyEx: { avg: null, wave: null, sunrise: null, sunset: null } };
            
            dObj.weather.push(arr[0] === "" || arr[0] == null ? null : Number(arr[0]));
            dObj.weather.push(arr[1] === "" || arr[1] == null ? null : Number(arr[1]));
            
            if (arr[6]) {
                dObj.tide = arr[6].split(',').map(v => Number(v) || 0);
            }
            
            dObj.dailyEx = {
                avg: arr[2] === "" || arr[2] == null ? null : Number(arr[2]),
                wave: arr[3] === "" || arr[3] == null ? null : Number(arr[3]),
                sunrise: timeToMinutes(arr[4]),
                sunset: timeToMinutes(arr[5])
            };
            
            return dObj;
        });
    }

    return res;
}

// --- 数学・補間ロジック ---
function calcGeoDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function lerp(val1, dist1, val2, dist2) {
    const v1 = val1 !== "" && val1 != null && !isNaN(Number(val1)) ? Number(val1) : NaN;
    const v2 = val2 !== "" && val2 != null && !isNaN(Number(val2)) ? Number(val2) : NaN;
    if (isNaN(v1) && isNaN(v2)) {
        if (val1 !== undefined && val1 !== "") return val1;
        return val2 !== undefined && val2 !== "" ? val2 : "";
    }
    if (isNaN(v1)) return v2;
    if (isNaN(v2)) return v1;
    if (dist1 === 0) return v1;
    if (dist2 === 0) return v2;
    const total = dist1 + dist2;
    return (v1 * (dist2 / total)) + (v2 * (dist1 / total));
}

function lerpArray(arr1, dist1, arr2, dist2) {
    const len = Math.max(arr1.length, arr2.length);
    const res = [];
    for (let i = 0; i < len; i++) {
        const el1 = arr1[i] !== undefined && arr1[i] !== null ? String(arr1[i]) : "";
        const el2 = arr2[i] !== undefined && arr2[i] !== null ? String(arr2[i]) : "";

        if (el1.includes('T') || el1.includes(',') || el1.includes(':') ||
            el2.includes('T') || el2.includes(',') || el2.includes(':')) {
            res.push(dist1 <= dist2 ? el1 : el2);
        } else {
            const val = lerp(el1, dist1, el2, dist2);
            if (val === "" || Number.isNaN(val)) res.push("");
            else res.push(String(Math.round(val * 100) / 100)); 
        }
    }
    return res;
}

function lerpDayList(days1, dist1, days2, dist2) {
    const len = Math.max(days1.length, days2.length);
    const res = [];
    for (let i = 0; i < len; i++) {
        res.push(lerpArray(days1[i] || [], dist1, days2[i] || [], dist2));
    }
    return res;
}

function lerpStation(s1, d1, s2, d2) {
    const res = {};
    for (const h of ['hourly0', 'hourly1', 'hourly2']) {
        const h1 = s1[h] || {weather:[], water:[], tide:[]};
        const h2 = s2[h] || {weather:[], water:[], tide:[]};
        res[h] = {
            weather: lerpDayList(h1.weather, d1, h2.weather, d2),
            water: lerpArray(h1.water, d1, h2.water, d2),
            tide: lerpArray(h1.tide, d1, h2.tide, d2)
        };
    }
    res.daily = lerpDayList(s1.daily || [], d1, s2.daily || [], d2);
    return res;
}

// ===== 2. メイン処理 =====
async function run() {
    console.log(`🚀 [${region}] 共通フォーマット版・再計算処理を開始します。`);
    console.log(`🌐 参照JSON URL: ${jsonUrl}`);

    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    if (fs.existsSync(outCsvPath)) {
        const existingLines = fs.readFileSync(outCsvPath, "utf-8").split("\n").filter(Boolean);
        if (existingLines.length > 1) {
            const firstRowDate = existingLines[1].split(",")[2].replace(/^"|"$/g, '').trim();
            if (firstRowDate === todayStr) {
                console.log(`✅ すでに本日（${todayStr}）のデータで計算済みです。処理をスキップします。`);
                return; 
            }
        }
    }

    const stationMap = {}; 

    // ========================================================
    // 🌟 変更箇所：fs.readFileSync を URLからの fetchJSON に置き換え
    // ========================================================
    const jsonStations = await fetchJSON(jsonUrl);
    if (jsonStations) {
        let jsonCount = 0;
        jsonStations.forEach(s => {
            if (s.stationCode) {
                let lat = null, lng = null;
                if (s.latlng) {
                    const pts = s.latlng.split(";");
                    if (pts.length >= 2) {
                        lat = parseFloat(pts[0]);
                        lng = parseFloat(pts[1]);
                    }
                }
                stationMap[s.stationCode] = { lat, lng, whether: normalizeCoastalStation(s) };
                jsonCount++;
            }
        });
        console.log(`📦 リモートJSONから ${jsonCount} 件の親ステーションを登録`);
    } else {
        console.error(`❌ リモートJSONの取得に失敗しました。処理を続行しますがデータが不足する可能性があります。`);
    }

    let targetDate = todayStr; 
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
                stationMap[id] = { lat: null, lng: null, whether: normalizeInlandStation(JSON.parse(whetherStr)) };
                phpCount++;
            } catch (e) {}
        }
        console.log(`📥 内陸CSVから ${phpCount} 件の親ステーションを登録`);
    } catch (error) {
        console.error("❌ リモートCSVの取得失敗:", error.message);
        return;
    }

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
            finalRows.push({ id, name, date: targetDate, whether: serializeToChibaFormat(stationMap[id].whether) });
        } else {
            const spot = { id, name, date: targetDate, lat, lng, notes, whether: null };
            calcTargets.push(spot);
            finalRows.push(spot);
        }
    }

    function processStage(stageName) {
        let count = 0;
        for (const spot of calcTargets) {
            if (spot.notes.startsWith(`${stageName}/`) && !spot.whether) {
                const parts = spot.notes.split("/");
                const p1 = parts[1];
                const p2 = parts[2];

                const s1 = stationMap[p1];
                const s2 = stationMap[p2];

                if (s1 && s2 && s1.lat != null && s2.lat != null) {
                    const d1 = calcGeoDistance(spot.lat, spot.lng, s1.lat, s1.lng);
                    const d2 = calcGeoDistance(spot.lat, spot.lng, s2.lat, s2.lng);
                    
                    const lerped = lerpStation(s1.whether, d1, s2.whether, d2);
                    spot.whether = serializeToChibaFormat(lerped);
                    stationMap[spot.id] = { lat: spot.lat, lng: spot.lng, whether: lerped }; 
                    count++;
                } 
                else if (s1 && s1.lat != null && !p2) {
                    const cloned = JSON.parse(JSON.stringify(s1.whether));
                    spot.whether = serializeToChibaFormat(cloned);
                    stationMap[spot.id] = { lat: spot.lat, lng: spot.lng, whether: cloned };
                    count++;
                }
            }
        }
        return count;
    }

    console.log(`🧮 Firstステージ: ${processStage("First")} 件 計算完了`);
    console.log(`🧮 Secondステージ: ${processStage("Second")} 件 計算完了`);
    console.log(`🧮 Thirdステージ: ${processStage("Third")} 件 計算完了`);

    console.log("💾 計算結果をCSVに書き出し中...");
    const outLines = ["individualId,name,date,whether"];
    for (const row of finalRows) {
        const whetherStr = row.whether ? JSON.stringify(row.whether) : "";
        outLines.push(`${row.id},${row.name},${row.date},${whetherStr}`);
    }

    fs.writeFileSync(outCsvPath, outLines.join("\n") + "\n", "utf-8");
    console.log(`✨ 完了しました！ 保存先: ${outCsvPath}`);
}

run();
