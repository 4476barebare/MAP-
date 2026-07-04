// testNode.js
import fs from "fs";
import fetch from "node-fetch";

// ===== 設定 =====
const region = process.env.REGION || "KANTO";
const csvPath = `./${region}/${region}_region.csv`;
const outPath = `./${region}/${region}_first_result.csv`;

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

// ===== CSV書き出し =====
function saveCsv(data, file) {
  if (!data || data.length === 0) {
    console.log("no data");
    fs.writeFileSync(file, "", "utf-8");
    return;
  }

  const headers = Object.keys(data[0]);
  const lines = [headers.join(",")];

  for (const row of data) {
    const line = headers.map(h => row[h] ?? "").join(",");
    lines.push(line);
  }

  fs.writeFileSync(file, lines.join("\n"), "utf-8");
}

// ===== API取得 =====
async function fetchWeather(p) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${p.lat}` +
      `&longitude=${p.lng}` +
      `&hourly=temperature_2m,precipitation,precipitation_probability,windspeed_10m,weathercode` +
      `&daily=weathercode,temperature_2m_max` +
      `&forecast_days=8` +
      `&timezone=Asia/Tokyo`;

    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      return { status: res.status };
    }

    const j = await res.json();

    return {
      status: 200,

      // ===== 0〜72時間 =====
      hourly: {
        time: j.hourly?.time ?? [],
        temp: j.hourly?.temperature_2m ?? [],
        rain: j.hourly?.precipitation ?? [],
        pop: j.hourly?.precipitation_probability ?? [],
        wind: j.hourly?.windspeed_10m ?? [],
        code: j.hourly?.weathercode ?? []
      },

      // ===== 日別 =====
      daily: {
        time: j.daily?.time ?? [],
        code: j.daily?.weathercode ?? [],
        tmax: j.daily?.temperature_2m_max ?? []
      }
    };

  } catch (e) {
    return { status: "TIMEOUT" };
  } finally {
    clearTimeout(timeout);
  }
}

// ===== 並列実行 =====
async function run(points) {
  if (!points || !Array.isArray(points)) {
    throw new Error("points is invalid");
  }

  const concurrency = 5;
  const delayMs = 100;

  let i = 0;
  const results = new Array(points.length);

  async function worker() {
    while (i < points.length) {
      const idx = i++;
      const p = points[idx];

      try {
        const w = await fetchWeather(p);

        results[idx] = {
          ...p,
          temp: w.temp,
          status: w.status
        };

        console.log(`OK ${idx + 1}/${points.length} ${p.name}`);
      } catch (e) {
        results[idx] = {
          ...p,
          temp: "ERR",
          status: "ERR"
        };

        console.log(`ERR ${idx + 1}/${points.length} ${p.name}`);
      }

      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker())
  );

  return results;
}

// ===== メイン =====
async function main() {
  console.log("region:", region);

  // 1. CSV読み込み
  const all = loadCsv(csvPath);
  console.log("total:", all.length);

  // 2. First完全一致抽出
  const targetPoints = all.filter(p => p.notes === "First");
  console.log("target (First only):", targetPoints.length);

  if (targetPoints.length === 0) {
    console.log("no target");
    saveCsv([], outPath);
    return;
  }

  // 3. API取得
  const results = await run(targetPoints);

  // 4. 保存
  saveCsv(results, outPath);
  console.log("saved:", outPath);
}

// ===== 実行 =====
main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});