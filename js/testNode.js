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
      obj[c] = (vals[i] || "").trim(); // ←ここ重要
    });
    return obj;
  });
}

// ===== CSV書き出し =====
function saveCsv(data, file) {
  if (data.length === 0) {
    console.log("no data");
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
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${p.lat}` +
    `&longitude=${p.lng}` +
    `&hourly=temperature_2m` +
    `&forecast_days=3`;

  const res = await fetch(url);

  if (!res.ok) {
    return { temp: "", status: res.status };
  }

  const json = await res.json();

  return {
    temp: json.hourly?.temperature_2m?.[0] ?? "",
    status: 200
  };
}

// ===== 実行 =====
async function run() {
  console.log(`region: ${region}`);

  const allPoints = loadCsv(csvPath);

  // notes 完全一致で First のみ
  const targetPoints = allPoints.filter(
    p => (p.notes || "") === "First"
  );

  console.log(`total: ${allPoints.length}`);
  console.log(`target (First only): ${targetPoints.length}`);

  const results = [];

  for (let i = 0; i < targetPoints.length; i++) {
    const p = targetPoints[i];

    try {
      const w = await fetchWeather(p);

      results.push({
        ...p,
        temp: w.temp,
        status: w.status
      });

      console.log(`OK ${i + 1}/${targetPoints.length} ${p.name}`);

    } catch (e) {
      results.push({
        ...p,
        temp: "ERR",
        status: "ERR"
      });

      console.log(`ERR ${i + 1}/${targetPoints.length} ${p.name}`);
    }

    // レート制御（200ms間隔）
    await new Promise(r => setTimeout(r, 200));
  }

  saveCsv(results, outPath);

  console.log(`saved: ${outPath}`);
}

// ===== 実行開始 =====
run();