import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

// ==========================================
// 👑 エリア別プロファイル定義
// ==========================================
const AREA_PROFILES = {
  chiba: { prefname: "chiba", latMin: 34.7, latMax: 36.0, lonMin: 139.6, lonMax: 141.1, step: 0.1, zoom: 9 },
  tokyo: { prefname: "tokyo", latMin: 35.5, latMax: 35.9, lonMin: 138.9, lonMax: 139.9, step: 0.05, zoom: 10 },
  kanto_all: { prefname: "kanto", latMin: 34.0, latMax: 38.0, lonMin: 138.0, lonMax: 142.0, step: 0.15, zoom: 7 }
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

function generatePoints() {
  const points = [];
  const latMinInt = Math.round(bbox.latMin * 100);
  const latMaxInt = Math.round(bbox.latMax * 100);
  const lonMinInt = Math.round(bbox.lonMin * 100);
  const lonMaxInt = Math.round(bbox.lonMax * 100);
  const stepInt = Math.round(step * 100);
  for (let lat = latMaxInt; lat >= latMinInt; lat -= stepInt) {
    for (let lon = lonMinInt; lon <= lonMaxInt; lon += stepInt) {
      points.push({ lat: lat / 100, lon: lon / 100 });
    }
  }
  return points;
}

function splitIntoFour(arr) {
  const chunkSize = Math.ceil(arr.length / 4);
  return [arr.slice(0, chunkSize), arr.slice(chunkSize, chunkSize * 2), arr.slice(chunkSize * 2, chunkSize * 3), arr.slice(chunkSize * 3)];
}

async function fetchQuarterBatch(points) {
  const url = "https://api.open-meteo.com/v1/forecast";
  const res = await axios.get(url, {
    params: { latitude: points.map(p => p.lat.toFixed(4)).join(","), longitude: points.map(p => p.lon.toFixed(4)).join(","), hourly: "precipitation", forecast_days: 1, timezone: "UTC" },
    timeout: 20000
  });
  return Array.isArray(res.data) ? res.data : [res.data];
}

// ===== メイン =====
(async () => {
  // ★デバッグ用：今日の午前6時 JST = 2026-06-09T21:00 UTC
  const utcISO = "2026-06-09T21:00";
  console.log(`【デバッグ】対象: ${utcISO} (UTC) | エリア: ${bbox.prefname.toUpperCase()}`);

  const points = generatePoints();
  const quarters = splitIntoFour(points);
  const gridData = [];

  try {
    for (let q = 0; q < quarters.length; q++) {
      const subBatch = quarters[q];
      const dataArray = await fetchQuarterBatch(subBatch);
      for (let i = 0; i < subBatch.length; i++) {
        const p = subBatch[i];
        const prec = dataArray[i]?.hourly?.precipitation;
        const timeList = dataArray[i]?.hourly?.time;
        const idx = timeList?.findIndex(t => t.startsWith(utcISO));
        if (idx !== -1 && prec) {
          gridData.push({ lat: p.lat, lon: p.lon, rain: prec[idx] ?? 0 });
        }
      }
      if (q < quarters.length - 1) await sleep(1500);
    }

    if (gridData.length === 0) {
      console.log("-> 降水データなしのため終了します。");
      return;
    }

    // 座標補正
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const pixelPoints = gridData.map(item => {
      const p = latLonToPixel(item.lat, item.lon, ZOOM);
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      return { x: p.x, y: p.y, rain: item.rain };
    });

    const outWidth = Math.ceil(maxX - minX) + 50;
    const outHeight = Math.ceil(maxY - minY) + 50;
    const finalCanvas = createCanvas(outWidth, outHeight);
    const ctx = finalCanvas.getContext("2d");

    for (const item of pixelPoints) {
      // 0.2mm未満でもグレーで描画（デバッグ用）
      let color = item.rain > 0.2 ? (item.rain > 10 ? "red" : (item.rain > 5 ? "orange" : "blue")) : "rgba(200,200,200,0.3)";
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(item.x - minX + 25) - 4, Math.round(item.y - minY + 25) - 4, 8, 8);
    }

    fs.mkdirSync("./output", { recursive: true });
    const filename = `./output/${bbox.prefname}_DEBUG.png`;
    fs.writeFileSync(filename, finalCanvas.toBuffer("image/png"));
    console.log(`【完了】生成しました: ${filename}`);

  } catch (e) {
    console.error("エラー:", e.message);
    process.exit(1);
  }
})();
