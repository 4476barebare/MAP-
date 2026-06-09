import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

// ==========================================
// 👑 エリア別プロファイル定義
// ==========================================
const AREA_PROFILES = {
  chiba: { prefname: "chiba", latMin: 34.7, latMax: 36.0, lonMin: 139.6, lonMax: 141.1, step: 0.1, zoom: 9 }
};

const activeArea = AREA_PROFILES.chiba;
const bbox = activeArea;
const step = activeArea.step;
const ZOOM = activeArea.zoom;

// 調整用：降水量レベルリスト（上から順に判定）
const precipitationLevels = [
  { min: 10.0, color: "rgba(255, 0, 0, 1.0)" },    // 激しい雨
  { min: 5.0,  color: "rgba(255, 120, 0, 0.8)" },  // 強い雨
  { min: 2.0,  color: "rgba(0, 120, 255, 0.7)" },  // 中程度の雨
  { min: 0.1,  color: "rgba(100, 180, 255, 0.4)" } // 弱い雨
];

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
  const utcISO = "2026-06-09T21:00"; 
  console.log(`【実行中】UTC: ${utcISO}:00 (エリア: ${bbox.prefname.toUpperCase()})`);

  const points = generatePoints();
  const quarters = splitIntoFour(points);
  const gridData = [];

  try {
    for (let q = 0; q < quarters.length; q++) {
      const dataArray = await fetchQuarterBatch(quarters[q]);
      for (let i = 0; i < quarters[q].length; i++) {
        const p = quarters[q][i];
        const prec = dataArray[i]?.hourly?.precipitation;
        const timeList = dataArray[i]?.hourly?.time;
        const idx = timeList?.findIndex(t => t.startsWith(utcISO));
        if (idx !== -1 && prec) {
          gridData.push({ lat: p.lat, lon: p.lon, rain: prec[idx] ?? 0 });
        }
      }
      if (q < quarters.length - 1) await sleep(1500);
    }

    if (gridData.length === 0) return console.log("データなしのため終了");

    const pMax = latLonToPixel(bbox.latMax, bbox.lonMin, ZOOM);
    const pMin = latLonToPixel(bbox.latMin, bbox.lonMax, ZOOM);
    const outWidth = Math.ceil(pMin.x - pMax.x) + 10;
    const outHeight = Math.ceil(pMin.y - pMax.y) + 10;
    const xOffset = pMax.x;
    const yOffset = pMax.y;

    const finalCanvas = createCanvas(outWidth, outHeight);
    const ctx = finalCanvas.getContext("2d");

    const dotWidth = Math.max(Math.ceil(outWidth / ((bbox.lonMax - bbox.lonMin) / step)), 4);
    const dotHeight = Math.max(Math.ceil(outHeight / ((bbox.latMax - bbox.latMin) / step)), 4);

    // 枠線を確実に排除
    ctx.lineWidth = 0;

    for (const item of gridData) {
      const level = precipitationLevels.find(l => item.rain >= l.min);
      if (!level) continue;

      const p = latLonToPixel(item.lat, item.lon, ZOOM);
      const drawX = Math.round(p.x - xOffset);
      const drawY = Math.round(p.y - yOffset);

      ctx.fillStyle = level.color;
      ctx.fillRect(drawX - dotWidth / 2, drawY - dotHeight / 2, dotWidth, dotHeight);
    }

    fs.mkdirSync("./output", { recursive: true });
    fs.writeFileSync(`./output/${bbox.prefname}_2026-06-10_06h.png`, finalCanvas.toBuffer("image/png"));
    console.log("【成功】画像を生成しました");
  } catch (e) {
    console.error("エラーが発生しました:", e.message);
    process.exit(1);
  }
})();
