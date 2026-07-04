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

// ===== CSV書き出し（専用形式） =====
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

// ===== API取得（安定版） =====
async function fetchWeather(p) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${p.lat}` +
      `&longitude=${p.lng}` +
      `&hourly=temperature_2m,precipitation,precipitation_probability,windspeed_10m,weathercode` +
      `&daily=weathercode,temperature_2m_max` +
      `&forecast_days=8` +
      `&timezone=Asia/Tokyo`;

    const res = await fetch(url);

    if (!res.ok) {
      return { status: res.status };
    }

    const j = await res.json();

    return {
      status: 200,
      hourly: {
        time: j.hourly?.time ?? [],
        temp: j.hourly?.temperature_2m ?? [],
        rain: j.hourly?.precipitation ?? [],
        pop: j.hourly?.precipitation_probability ?? [],
        wind: j.hourly?.windspeed_10m ?? [],
        code: j.hourly?.weathercode ?? []
      },
      daily: {
        time: j.daily?.time ?? [],
        code: j.daily?.weathercode ?? [],
        tmax: j.daily?.temperature_2m_max ?? []
      }
    };

  } catch (e) {
    console.log("FETCH ERROR:", e.message);
    return { status: "ERR" };
  }
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

// ===== 並列実行（元のまま） =====
async function run(points) {
  const concurrency = 5;
  const delayMs = 100;

  let i = 0;
  const results = [];

  async function worker() {
    while (i < points.length) {
      const idx = i++;
      const p = points[idx];

      try {
        const w = await fetchWeather(p);
        const formatted = formatWeather(w);

        if (!formatted) {
          console.log(`ERR ${idx + 1}/${points.length} ${p.name}`);
        } else {
          results.push({
            name: p.name,
            date: new Date().toISOString().slice(0, 10),
            whether: formatted
          });

          console.log(`OK ${idx + 1}/${points.length} ${p.name}`);
        }

      } catch (e) {
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

  const all = loadCsv(csvPath);
  const targetPoints = all.filter(p => p.notes === "First");

  const results = await run(targetPoints);

  saveCsv(results, outPath);
  console.log("saved:", outPath);
}

// ===== 実行 =====
main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});