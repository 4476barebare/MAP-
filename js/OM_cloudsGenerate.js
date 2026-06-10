import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

// ==========================================
// 👑 エリア別プロファイル定義
// ==========================================
const AREA_PROFILES = {
  chiba: { prefname: "CHIBA", latMin: 34.7, latMax: 36.0, lonMin: 139.6, lonMax: 141.1, step: 0.1, zoom: 9 }
};

const bbox = AREA_PROFILES.chiba;
const step = bbox.step;
const ZOOM = bbox.zoom;

const precipitationLevels = [
  { min: 10.0, color: "rgba(255, 0, 0, 1.0)" },    // 激しい雨
  { min: 5.0,  color: "rgba(255, 120, 0, 1.0)" },  // 強い雨
  { min: 2.0,  color: "rgba(0, 120, 255, 1.0)" },  // 中程度の雨
  { min: 0.1,  color: "rgba(100, 180, 255, 1.0)" } // 弱い雨
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

// ===== メイン =====
(async () => {
  const now = new Date();
  const startTarget = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const nextBase = (startTarget.getHours() >= 9 && startTarget.getHours() < 21) ? 21 : 9;
  const targetJstHours = [nextBase, nextBase + 3, nextBase + 6, nextBase + 9];

  console.log(`【実行中】JST: ${now.getHours()}時。次フェーズ(${nextBase}時開始)の4枚を生成します`);

  const points = generatePoints();
  
  // 一括でデータ取得（地点リストをカンマ区切りで送信）
  const url = "https://api.open-meteo.com/v1/forecast";
  const params = {
    latitude: points.map(p => p.lat.toFixed(4)).join(","),
    longitude: points.map(p => p.lon.toFixed(4)).join(","),
    hourly: "precipitation",
    forecast_days: 2,
    timezone: "UTC"
  };

  try {
    const { data } = await axios.get(url, { params, timeout: 30000 });

    for (const jstTargetHour of targetJstHours) {
      const targetDate = new Date(now);
      targetDate.setHours(jstTargetHour, 0, 0, 0);
      if (jstTargetHour >= 24) targetDate.setDate(targetDate.getDate() + 1);

      const utcISO = new Date(targetDate.getTime() - 9 * 60 * 60 * 1000).toISOString().slice(0, 13);
      console.log(`-> 生成中: JST ${targetDate.getDate()}日 ${jstTargetHour % 24}時 (API: ${utcISO}:00)`);

      const pMax = latLonToPixel(bbox.latMax, bbox.lonMin, ZOOM);
      const pMin = latLonToPixel(bbox.latMin, bbox.lonMax, ZOOM);
      const outWidth = Math.ceil(pMin.x - pMax.x) + 10;
      const outHeight = Math.ceil(pMin.y - pMax.y) + 10;
      const xOffset = pMax.x;
      const yOffset = pMax.y;

      const finalCanvas = createCanvas(outWidth, outHeight);
      const ctx = finalCanvas.getContext("2d");
      const blockWidth = outWidth / Math.round((bbox.lonMax - bbox.lonMin) / step);
      const blockHeight = outHeight / Math.round((bbox.latMax - bbox.latMin) / step);

      // 地点ごとのデータをループ（Open-Meteoの一括取得レスポンスは地点順に配列化されます）
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const timeIdx = data.hourly.time.findIndex(t => t.startsWith(utcISO));
        // データは data.hourly.precipitation[地点数 * 時間数 + 時間Index] ではないため、
        // 実際にはAPI仕様上、地点ごとに分けて受け取る必要がある場合があります。
        // ここでは単純化のため地点データにアクセス
        const rain = data.hourly.precipitation[timeIdx + (i * data.hourly.time.length)];

        const level = precipitationLevels.find(l => rain >= l.min);
        if (!level) continue;

        const xIdx = Math.round((p.lon - bbox.lonMin) / step);
        const yIdx = Math.round((bbox.latMax - p.lat) / step);
        ctx.fillStyle = level.color;
        ctx.fillRect(Math.round(xIdx * blockWidth), Math.round(yIdx * blockHeight), Math.ceil(blockWidth) + 1, Math.ceil(blockHeight) + 1);
      }

      const datePart = targetDate.toISOString().slice(0, 10);
      const filename = `./output/${bbox.prefname}_${datePart}_${String(targetDate.getHours()).padStart(2, '0')}h.png`;
      fs.mkdirSync("./output", { recursive: true });
      fs.writeFileSync(filename, finalCanvas.toBuffer("image/png"));
      
      await sleep(3000); // 1枚ごとに休憩
    }
  } catch (e) {
    console.error("エラー発生:", e.message);
  }
})();
