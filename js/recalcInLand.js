import fs from "fs";
import https from "https";

// ========================================================
// ===== 1. 設定の定義（引数受け取り） =====
// ========================================================
const region = process.argv[2] || "KANTO";
const jsonUrl = process.argv[3] || `https://turiiko.shop/actions/data/${region}_load.json`; 

const regionCsvPath = `${region}/${region}_region.csv`;
const inLandUrl = `https://turiiko.shop/actions/data/${region}_inLand.csv`;
const outCsvPath = `data/${region}_inLand_recalculated.csv`; 

// 🌟 新規追加：地域ごとの県リスト定義（他地域を追加する場合はここに追記）
const regionPrefsMap = {
    "KANTO": ["CHIBA", "KANAGAWA"],
    "KANSAI": ["OSAKA", "HYOGO", "WAKAYAMA"]
};
const prefs = regionPrefsMap[region];

if (!prefs) {
    console.error(`❌ エラー: 地域「${region}」の県リストが定義されていません。`);
    process.exit(1);
}

// ========================================================
// URLからJSONを取得
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
// ⚠️ 以下、既存のパース・計算・シリアライズ処理（変更なし）
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
    const res = { hourly: [], daily: [] };
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
            if (arr[6]) dObj.tide = arr[6].split(',').map(v => Number(v) || 0);
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

function findQuadrantStations(spotLat, spotLng, validStations, maxDistKm = 50) {
    let q1 = null, q2 = null, q3 = null, q4 = null;
    let d1 = Infinity, d2 = Infinity, d3 = Infinity, d4 = Infinity;

    for (const s of validStations) {
        const d = calcGeoDistance(spotLat, spotLng, s.lat, s.lng);
        if (d > maxDistKm) continue;
        if (d === 0) return [{ station: s, dist: d }]; 

        const dLat = s.lat - spotLat;
        const dLng = s.lng - spotLng;

        if (dLat >= 0 && dLng >= 0) {
            if (d < d1) { d1 = d; q1 = s; } 
        } else if (dLat >= 0 && dLng < 0) {
            if (d < d2) { d2 = d; q2 = s; } 
        } else if (dLat < 0 && dLng >= 0) {
            if (d < d3) { d3 = d; q3 = s; } 
        } else {
            if (d < d4) { d4 = d; q4 = s; } 
        }
    }

    const res = [];
    if (q1) res.push({ station: q1, dist: d1 });
    if (q2) res.push({ station: q2, dist: d2 });
    if (q3) res.push({ station: q3, dist: d3 });
    if (q4) res.push({ station: q4, dist: d4 });
    return res;
}

function lerpMultiple(vals, dists) {
    let sumWeights = 0, sumVals = 0, validCount = 0;
    let hasString = false, stringVal = "", minDistForStr = Infinity;

    for (let i = 0; i < vals.length; i++) {
        let v = vals[i];
        let d = dists[i];
        if (v === undefined || v === null || v === "") continue;

        if (isNaN(Number(v))) {
            hasString = true;
            if (d < minDistForStr) {
                minDistForStr = d;
                stringVal = v;
            }
            continue;
        }

        v = Number(v);
        if (d === 0) return v;

        const w = 1 / d; 
        sumWeights += w;
        sumVals += v * w;
        validCount++;
    }
    if (hasString && validCount === 0) return stringVal;
    if (validCount === 0) return "";
    return sumVals / sumWeights;
}

function lerpMultipleArray(arrs, dists) {
    const maxLen = Math.max(...arrs.map(a => a ? a.length : 0));
    const res = [];
    for (let i = 0; i < maxLen; i++) {
        const vals = arrs.map(a => (a && a[i] !== undefined ? a[i] : ""));
        const hasTime = vals.some(v => String(v).includes('T') || String(v).includes(':') || String(v).includes(','));
        if (hasTime) {
            let closestVal = "", minDist = Infinity;
            for (let j = 0; j < vals.length; j++) {
                if (vals[j] && dists[j] < minDist) {
                    minDist = dists[j];
                    closestVal = vals[j];
                }
            }
            res.push(closestVal);
        } else {
            const val = lerpMultiple(vals, dists);
            if (val === "") res.push("");
            else res.push(String(Math.round(val * 100) / 100));
        }
    }
    return res;
}

function lerpMultipleDayList(daysListArr, dists) {
    const maxLen = Math.max(...daysListArr.map(d => d ? d.length : 0));
    const res = [];
    for (let i = 0; i < maxLen; i++) {
        const arrs = daysListArr.map(d => d && d[i] ? d[i] : []);
        res.push(lerpMultipleArray(arrs, dists));
    }
    return res;
}

function lerpMultipleStations(stationObjs, dists) {
    const res = {};
    for (const h of ['hourly0', 'hourly1', 'hourly2']) {
        res[h] = {
            weather: lerpMultipleDayList(stationObjs.map(s => s[h] ? s[h].weather : []), dists),
            water: lerpMultipleArray(stationObjs.map(s => s[h] ? s[h].water : []), dists),
            tide: lerpMultipleArray(stationObjs.map(s => s[h] ? s[h].tide : []), dists)
        };
    }
    res.daily = lerpMultipleDayList(stationObjs.map(s => s.daily || []), dists);
    return res;
}

// ========================================================
// ===== 2. メイン処理 =====
// ========================================================
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

    // ① マスターCSV（First, Second 計算用）の読み込み
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

    // 🌟 新規追加：② location.csv から 'L' で始まるスポットを抽出し、Thirdの計算対象とする
    const thirdTargets = [];
    for (const pref of prefs) {
        const locPath = `${region}/${pref}_location.csv`;
        if (fs.existsSync(locPath)) {
            const lines = fs.readFileSync(locPath, "utf-8").split("\n").filter(Boolean);
            if (lines.length < 2) continue;
            
            const headers = lines[0].split(",").map(h => h.trim());
            const idIdx = headers.indexOf("individualId");
            const nameIdx = headers.indexOf("name");
            const latIdx = headers.indexOf("lat");
            const lngIdx = headers.indexOf("lng");
            const notesIdx = headers.indexOf("notes");

            if (idIdx === -1) continue;

            for (let i = 1; i < lines.length; i++) {
                const r = parseCsvLine(lines[i]);
                if (r.length <= idIdx) continue;
                
                const id = r[idIdx];
                if (id && id.startsWith("L")) {
                    const name = nameIdx !== -1 && r[nameIdx] ? r[nameIdx] : "";
                    const lat = latIdx !== -1 ? parseFloat(r[latIdx]) || 0 : 0;
                    const lng = lngIdx !== -1 ? parseFloat(r[lngIdx]) || 0 : 0;
                    const notes = notesIdx !== -1 && r[notesIdx] ? r[notesIdx] : "";

                    const spot = { id, name, date: targetDate, lat, lng, notes, whether: null };
                    thirdTargets.push(spot);
                    finalRows.push(spot); // Thirdの計算結果も最終出力CSVに含める
                }
            }
        }
    }

    // --- First, Second 計算処理（元のロジック） ---
    function processStageFirstSecond(stageName) {
        let count = 0;
        for (const spot of calcTargets) {
            if (spot.notes && spot.notes.startsWith(`${stageName}/`) && !spot.whether) {
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

    // 🌟 新規追加：--- Third 計算処理（4象限 空間自動検索） ---
    function processStageThird() {
        let count = 0;
        // First/Secondで計算された結果も含めるため、実行直前に有効な基準点リストを生成
        const validRefStations = Object.values(stationMap).filter(s => s.lat != null && s.lng != null && s.whether);

        for (const spot of thirdTargets) {
            if (!spot.whether) {
                // notesに数字が含まれていればそれを最大距離（km）とし、無ければデフォルト50km
                let maxDistKm = 50;
                if (spot.notes) {
                    const m = spot.notes.match(/\d+/);
                    if (m) maxDistKm = Number(m[0]);
                }

                // 4方向から最も近い基準点を探す（最大4点）
                const found = findQuadrantStations(spot.lat, spot.lng, validRefStations, maxDistKm);
                
                if (found.length > 0) {
                    const stations = found.map(f => f.station.whether);
                    const dists = found.map(f => f.dist);
                    
                    const lerped = lerpMultipleStations(stations, dists);
                    spot.whether = serializeToChibaFormat(lerped);
                    stationMap[spot.id] = { lat: spot.lat, lng: spot.lng, whether: lerped };
                    count++;
                }
            }
        }
        return count;
    }

    console.log(`🧮 Firstステージ: ${processStageFirstSecond("First")} 件 計算完了`);
    console.log(`🧮 Secondステージ: ${processStageFirstSecond("Second")} 件 計算完了`);
    console.log(`🧮 Thirdステージ: ${processStageThird()} 件 計算完了`);

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
