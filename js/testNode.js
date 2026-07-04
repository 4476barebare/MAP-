// testNode.js
import fs from "fs";
import fetch from "node-fetch";

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

// ===== CSV書き出し（★専用形式） =====
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

// ===== API取得 =====
async function fetchWeather(p) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

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

    if (!res.ok) return null;

    return await res.json();

  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ===== 整形（★ここが本体） =====
function formatWeather(j) {
  if (!j) return null;

  const hourly = [];
  const h = j.hourly;

  // ===== 3日分 =====
  for (let d = 0; d < 3; d++) {
    const day = [];

    for (let i = 0; i < 24; i += 2) {
      const idx = d * 24 + i;

      day.push([
        h.weathercode?.[idx] ?? "",
        h.temperature_2m?.[idx] ?? "",
        h.precipitation?.[idx] ?? "",
        h.precipitation_probability?.[idx] ?? "",
        h.windspeed_10m?.[idx] ?? "",
        "", // 風向
        ""  // 波高
      ]);
    }

    hourly.push({
      weather: day,
      oneday: {} // 空
    });
  }

  // ===== daily =====
  const daily = [];
  const d = j.daily;

  for (let i = 3; i < 8; i++) {
    daily.push({
      weather: [
        d.weathercode?.[i] ?? "",
        d.temperature_2m_max?.[i] ?? ""
      ],
      dailyEx: {}
    });
  }

  return { hourly, daily };
}

// ===== 並列実行 =====
async function run(points) {
  const results = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];

    const j = await fetchWeather(p);
    const formatted = formatWeather(j);

    if (!formatted) {
      console.log(`ERR ${i + 1}/${points.length} ${p.name}`);
      continue;
    }

    results.push({
      name: p.name,
      date: new Date().toISOString().slice(0, 10),
      whether: formatted
    });

    console.log(`OK ${i + 1}/${points.length} ${p.name}`);
  }

  return results;
}

// ===== メイン =====
async function main() {
  console.log("region:", region);

  const all = loadCsv(csvPath);
  const targetPoints = all.filter(p => p.notes === "First");

  const results = await run(targetPoints);

  saveCsv(results, outPath);
  console.log("saved:", outPath);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});