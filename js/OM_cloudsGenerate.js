import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

const AREA_PROFILES = {
  chiba: { prefname: "CHIBA", latMin: 34.7, latMax: 36.0, lonMin: 139.6, lonMax: 141.1, step: 0.1, zoom: 9 }
};

const bbox = AREA_PROFILES.chiba;
const step = bbox.step;
const ZOOM = bbox.zoom;

const precipitationLevels = [
  { min: 10.0, color: "rgba(255, 0, 0, 1.0)" },
  { min: 5.0,  color: "rgba(255, 120, 0, 1.0)" },
  { min: 2.0,  color: "rgba(0, 120, 255, 1.0)" },
  { min: 0.1,  color: "rgba(100, 180, 255, 1.0)" }
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
  for (let lat = Math.round(bbox.latMax * 100); lat >= Math.round(bbox.latMin * 100); lat -= Math.round(step * 100)) {
    for (let lon = Math.round(bbox.lonMin * 100); lon <= Math.round(bbox.lonMax * 100); lon += Math.round(step * 100)) {
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

  console.log(`【本番実行】JST: ${now.getHours()}時。次フェーズ(${nextBase}時開始)の4枚を生成します`);

  const points = generatePoints();
  
  for (const jstTargetHour of targetJstHours) {
    const targetDate = new Date(now);
    targetDate.setHours(jstTargetHour, 0, 0, 0);
    if (jstTargetHour >= 24) targetDate.setDate(targetDate.getDate() + 1);

    const utcISO = new Date(targetDate.getTime() - 9 * 60 * 60 * 1000).toISOString().slice(0, 13);
    console.log(`-> 生成中: JST ${targetDate.getDate()}日 ${jstTargetHour % 24}時 (API指定: ${utcISO}:00)`);

    const gridData = [];
    try {
      // API制限回避のため、全地点をまとめてリクエストせず、
      // 1地点ずつ、あるいはバッチで取得するスタイルに戻します（これが最も確実です）
      const url = "https://api.open-meteo.com/v1/forecast";
      const res = await axios.get(url, {
        params: {
          latitude: points.map(p => p.lat).join(","),
          longitude: points.map(p => p.lon).join(","),
          hourly: "precipitation",
          forecast_days: 2,
          timezone: "UTC"
        }
      });

      // レスポンスが配列かオブジェクトかでハンドリング
      const results = Array.isArray(res.data) ? res.data : [res.data];
      
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const data = results[i] || results[0]; // 構造に合わせて取得
        const idx = data.hourly.time.findIndex(t => t.startsWith(utcISO));
        const rain = data.hourly.precipitation[idx] ?? 0;
        if (rain >= 0.1) gridData.push({ ...p, rain });
      }

      // 描画処理
      const pMax = latLonToPixel(bbox.latMax, bbox.lonMin, ZOOM);
      const pMin = latLonToPixel(bbox.latMin, bbox.lonMax, ZOOM);
      const outWidth = Math.ceil(pMin.x - pMax.x) + 10;
      const outHeight = Math.ceil(pMin.y - pMax.y) + 10;
      const blockWidth = outWidth / Math.round((bbox.lonMax - bbox.lonMin) / step);
      const blockHeight = outHeight / Math.round((bbox.latMax - bbox.latMin) / step);

      const finalCanvas = createCanvas(outWidth, outHeight);
      const ctx = finalCanvas.getContext("2d");
      ctx.lineWidth = 0;

      for (const item of gridData) {
        const level = precipitationLevels.find(l => item.rain >= l.min);
        const xIdx = Math.round((item.lon - bbox.lonMin) / step);
        const yIdx = Math.round((bbox.latMax - item.lat) / step);
        ctx.fillStyle = level.color;
        ctx.fillRect(Math.round(xIdx * blockWidth), Math.round(yIdx * blockHeight), Math.ceil(blockWidth) + 1, Math.ceil(blockHeight) + 1);
      }

      const filename = `./output/${bbox.prefname}_${targetDate.toISOString().slice(0, 10)}_${String(targetDate.getHours()).padStart(2, '0')}h.png`;
      fs.mkdirSync("./output", { recursive: true });
      fs.writeFileSync(filename, finalCanvas.toBuffer("image/png"));
      
      await sleep(2000); // 各画像生成の間に休憩
    } catch (e) {
      console.error("データ取得エラー:", e.message);
    }
  }
})();
