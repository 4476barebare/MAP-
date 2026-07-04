// testNode.js
import fs from "fs";
import fetch from "node-fetch";

// ===== 設定 =====
const region = process.env.REGION || "KANTO";
const csvPath = `./${region}/${region}_region.csv`;
const outPath = `./data/${region}_inLand.csv`;

// ===== フォルダ作成 =====
function ensureDir(path) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true });
  }
}

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
  ensureDir("data");

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

// ===== データ整形 =====
function formatWeather(w) {
  if (w.status !== 200) return {};

  const result = {};

  // ===== 今日〜3日（72時間）=====
  for (let d = 0; d < 3; d++) {
    const base = d * 24;

    result[`day${d}_temp`] =
      w.hourly.temp.slice(base, base + 24).join("|");

    result[`day${d}_rain`] =
      w.hourly.rain.slice(base, base + 24).join("|");

    result[`day${d}_pop`] =
      w.hourly.pop.slice(base, base + 24).join("|");

    result[`day${d}_wind`] =
      w.hourly.wind.slice(base, base + 24).join("|");

    result[`day${d}_code`] =
      w.hourly.code.slice(base, base + 24).join("|");
  }

  // ===== 3日後〜8日後 =====
  for (let d = 3; d < 8; d++) {
    result[`day${d}_code`] = w.daily.code[d] ?? "";
    result[`day${d}_tmax`] = w.daily.tmax[d] ?? "";
  }

  return result;
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

    if (!res.ok) return { status: res.status };

    const j = await res.json();

    return {
      status: 200,
      hourly: {
        temp: j.hourly?.temperature_2m ?? [],
        rain: j.hourly?.precipitation ?? [],
        pop: j.hourly?.precipitation_probability ?? [],
        wind: j.hourly?.windspeed_10m ?? [],
        code: j.hourly?.weathercode ?? []
      },
      daily: {
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
          ...formatWeather(w),
          status: w.status
        };

        console.log(`OK ${idx + 1}/${points.length} ${p.name}`);
      } catch {
        results[idx] = {
          ...p,
          status: "ERR"
        };
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

  if (targetPoints.length === 0) {
    saveCsv([], outPath);
    return;
  }

  const results = await run(targetPoints);

  saveCsv(results, outPath);
  console.log("saved:", outPath);
}

main();