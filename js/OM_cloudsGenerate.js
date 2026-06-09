import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

// ==========================================
// 👑 エリア別プロファイル定義
// ==========================================
const AREA_PROFILES = {
  chiba: {
    prefname: "chiba",
    latMin: 34.7,
    latMax: 36.0,
    lonMin: 139.6,
    lonMax: 141.1,
    step: 0.1,
    zoom: 9
  }
};

const activeArea = AREA_PROFILES.chiba;
const bbox = activeArea;
const step = activeArea.step;
const ZOOM = activeArea.zoom;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function latLonToPixel(lat, lon, zoom) {
  const size = 256 * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * size;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size;
  return { x, y };
}

// ★【修正】絶対にポイントを生成する安全なグリッド生成ロジック
function generatePoints() {
  const points = [];
  let lat = bbox.latMax;
  while (lat >= bbox.latMin - 0.001) { // 誤差対策
    let lon = bbox.lonMin;
    while (lon <= bbox.lonMax + 0.001) {
      points.push({ lat: lat, lon: lon });
      lon += step;
    }
    lat -= step;
  }
  return points;
}

function splitIntoFour(arr) {
  const chunkSize = Math.ceil(arr.length / 4);
  return [
    arr.slice(0, chunkSize),
    arr.slice(chunkSize, chunkSize * 2),
    arr.slice(chunkSize * 2, chunkSize * 3),
    arr.slice(chunkSize * 3)
  ];
}

async function fetchQuarterBatch(points) {
  const url = "https://api.open-meteo.com/v1/forecast";
  const latitudes = points.map(p => p.lat.toFixed(4)).join(",");
  const longitudes = points.map(p => p.lon.toFixed(4)).join(",");

  const res = await axios.get(url, {
    params: {
      latitude: latitudes,
      longitude: longitudes,
      hourly: "precipitation",
      forecast_days: 1,
      timezone: "UTC"
    },
    timeout: 20000
  });

  return Array.isArray(res.data) ? res.data : [res.data];
}

(async () => {
  const now = new Date();
  const utcISO = now.toISOString().slice(0, 13); // 現在のUTC時刻で取得
  const points = generatePoints();
  
  console.log(`探索UTC: ${utcISO}:00 | エリア: ${bbox.prefname} | 総ポイント数: ${points.length}`);

  const quarters = splitIntoFour(points);
  const gridData = [];

  try {
    for (const subBatch of quarters) {
      if (subBatch.length === 0) continue;
      const dataArray = await fetchQuarterBatch(subBatch);
      
      for (let i = 0; i < subBatch.length; i++) {
        const p = subBatch[i];
        const pointData = dataArray[i];
        if (!pointData?.hourly) continue;
        
        const idx = pointData.hourly.time.findIndex(t => t.startsWith(utcISO));
        if (idx !== -1) {
          gridData.push({ lat: p.lat, lon: p.lon, rain: pointData.hourly.precipitation[idx] ?? 0 });
        }
      }
      await sleep(1500);
    }

    const pMax = latLonToPixel(bbox.latMax, bbox.lonMin, ZOOM);
    const pMin = latLonToPixel(bbox.latMin, bbox.lonMax, ZOOM);
    const outWidth = Math.floor(pMin.x - pMax.x) + 1;
    const outHeight = Math.floor(pMin.y - pMax.y) + 1;

    const finalCanvas = createCanvas(outWidth, outHeight);
    const ctx = finalCanvas.getContext("2d");

    // テスト描画：データがあれば青、なければ薄いグレーで確実に打つ
    for (const item of gridData) {
      const p = latLonToPixel(item.lat, item.lon, ZOOM);
      ctx.fillStyle = item.rain > 0.2 ? "rgba(0,120,255,0.8)" : "rgba(200,200,200,0.3)";
      ctx.fillRect(Math.round(p.x - pMax.x) - 2, Math.round(p.y - pMax.y) - 2, 4, 4);
    }

    fs.mkdirSync("./output", { recursive: true });
    fs.writeFileSync(`./output/${bbox.prefname}.png`, finalCanvas.toBuffer("image/png"));
    console.log("【成功】ポイントが生成され、描画されました");

  } catch (e) {
    console.error("エラー:", e.message);
    process.exit(1);
  }
})();
