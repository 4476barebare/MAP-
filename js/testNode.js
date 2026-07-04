// testNode.js
import fs from "fs";
// 💡 import fetch from "node-fetch"; は削除（Node20標準のfetchを使用）

// ===== 設定 =====
const region = process.env.REGION || "KANTO";
const csvPath = `./${region}/${region}_region.csv`;
const outPath = `./data/${region}_inLand.csv`;

// ===== CSV読み込み =====
function loadCsv(file) {
  const text = fs.readFileSync(file, "utf-8").trim();
  const [header, ...rows] = text.split("\n");
  const cols = header.split(",");

  return rows.map(r => {
    const vals = r.split(",");
    const obj = {};
    cols.forEach((c, i) => {
      obj[c] = (vals[i] || "").trim();
    });
    return obj;
  });
}

// ===== CSV書き出し（元の形式のまま変更なし） =====
function saveCsv(data, file) {
  if (!fs.existsSync("data")) {
    fs.mkdirSync("data", { recursive: true });
  }

  const lines = ["name,date,whether"];

  for (const row of data) {
    const json = JSON.stringify(row.whether);
    lines.push(`${row.name},${row.date},${json}`);
  }

  fs.writeFileSync(file, lines.join("\n"), "utf-8");
}

// ===== 整形 =====
function formatWeather(w) {
  if (!w || w.status !== 200) return null;

  const h = w.hourly;
  const d = w.daily;

  const hourly = [];

  for (let day = 0; day < 3; day++) {
    const arr = [];

    for (let i = 0; i < 24; i += 2) {
      const idx = day * 24 + i;

      arr.push([
        h.code[idx] ?? "",
        h.temp[idx] ?? "",
        h.rain[idx] ?? "",
        h.pop[idx] ?? "",
        h.wind[idx] ?? "",
        "",
        ""
      ]);
    }

    hourly.push({
      weather: arr,
      oneday: {}
    });
  }

  const daily = [];

  for (let i = 3; i < 8; i++) {
    daily.push({
      weather: [
        d.code[i] ?? "",
        d.tmax[i] ?? ""
      ],
      dailyEx: {}
    });
  }

  return { hourly, daily };
}

// ===== 一括でAPIを取得して処理する関数 =====
async function runBulk(points) {
  if (points.length === 0) return [];

  // 全地点の緯度・経度をカンマ区切りで結合
  const lats = points.map(p => p.lat).join(",");
  const lngs = points.map(p => p.lng).join(",");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒タイムアウト

  try {
    console.log(`[FETCH START] ${points.length}件のデータを一括取得中...`);
    
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lats}` +
      `&longitude=${lngs}` +
      `&hourly=temperature_2m,precipitation,precipitation_probability,wind_speed_10m,weathercode` +
      `&daily=weathercode,temperature_2m_max` +
      `&forecast_days=8` +
      `&timezone=Asia/Tokyo`;

    // Node.jsのグローバルfetchを使用
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      console.log(`[API_ERROR] Status ${res.status} - ${errText}`);
      return [];
    }

    const jsonResult = await res.json();
    // 1件だとオブジェクト、複数だと配列で返るため配列に統一
    const apiDataArray = Array.isArray(jsonResult) ? jsonResult : [jsonResult];

    const results = [];

    points.forEach((p, idx) => {
      const j = apiDataArray[idx];
      if (!j) {
        console.log(`ERR ${idx + 1}/${points.length} ${p.name}`);
        return;
      }

      // 元の構造を再現
      const mockWeatherResponse = {
        status: 200,
        hourly: {
          time: j.hourly?.time ?? [],
          temp: j.hourly?.temperature_2m ?? [],
          rain: j.hourly?.precipitation ?? [],
          pop: j.hourly?.precipitation_probability ?? [],
          wind: j.hourly?.wind_speed_10m ?? [],
          code: j.hourly?.weathercode ?? []
        },
        daily: {
          time: j.daily?.time ?? [],
          code: j.daily?.weathercode ?? [],
          tmax: j.daily?.temperature_2m_max ?? []
        }
      };

      const formatted = formatWeather(mockWeatherResponse);

      if (formatted) {
        results.push({
          name: p.name,
          date: new Date().toISOString().slice(0, 10),
          whether: formatted
        });
        console.log(`OK ${idx + 1}/${points.length} ${p.name}`);
      } else {
        console.log(`ERR ${idx + 1}/${points.length} ${p.name} (Format Error)`);
      }
    });

    return results;

  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      console.log(`[TIMEOUT] 一括リクエストがタイムアウトしました。`);
    } else {
      console.log(`[FETCH ERROR] ${e.message}`);
    }
    return [];
  }
}

// ===== メイン =====
async function main() {
  console.log("region:", region);

  const all = loadCsv(csvPath);
  const targetPoints = all.filter(p => p.notes === "First");

  console.log(`Target points: ${targetPoints.length}`);

  const results = await runBulk(targetPoints);

  saveCsv(results, outPath);
  console.log("saved:", outPath);
}

// ===== 実行 =====
main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
