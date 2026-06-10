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
  // +4時間後の時刻をベースにフェーズを判定
  const startTarget = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const nextBase = (startTarget.getHours() >= 9 && startTarget.getHours() < 21) ? 21 : 9;
  const targetJstHours = [nextBase, nextBase + 3, nextBase + 6, nextBase + 9];

  console.log(`【本番実行】現在(JST): ${now.toLocaleString()}。次フェーズ(${nextBase}時)の4枚を生成します`);

  const points = generatePoints();
  
  for (const jstTargetHour of targetJstHours) {
    // 1. 日本時間のターゲット日時を厳密に作成
    const targetDate = new Date(now);
    targetDate.setHours(jstTargetHour, 0, 0, 0);
    // 24時/48時をまたぐ場合の日付加算
    if (jstTargetHour >= 24) targetDate.setDate(targetDate.getDate() + Math.floor(jstTargetHour / 24));

    // 2. API用：JSTから9時間引いたUTC時間を計算
    const utcTime = new Date(targetDate.getTime() - (9 * 60 * 60 * 1000));
    const utcISO = utcTime.toISOString().slice(0, 13);
    
    // 3. ファイル名用：日本日付（ISO形式はUTC基準だが、targetDateはJSTの時をセット済み）
    const datePart = targetDate.toISOString().slice(0, 10);
    const hourPart = String(targetDate.getHours()).padStart(2, '0');
    
    console.log(`-> 生成中: JST ${datePart} ${hourPart}時 (API指定: ${utcISO}:00)`);

    try {
      const url = "https://api.open-meteo.com/v1/forecast";
      const { data } = await axios.get(url, {
        params: {
          latitude: points.map(p => p.lat).join(","),
          longitude: points.map(p => p.lon).join(","),
          hourly: "precipitation",
          forecast_days: 3,
          timezone: "UTC"
        }
      });

      const gridData = [];
      const results = Array.isArray(data) ? data : [data];
      
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const res = results[i] || results[0];
        const idx = res.hourly.time.findIndex(t => t.startsWith(utcISO));
        const rain = res.hourly.precipitation[idx] ?? 0;
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
        if (!level) continue;
        const xIdx = Math.round((item.lon - bbox.lonMin) / step);
        const yIdx = Math.round((bbox.latMax - item.lat) / step);
        ctx.fillStyle = level.color;
        ctx.fillRect(Math.round(xIdx * blockWidth), Math.round(yIdx * blockHeight), Math.ceil(blockWidth) + 1, Math.ceil(blockHeight) + 1);
      }

      const filename = `./output/${bbox.prefname}_${datePart}_${hourPart}h.png`;
      fs.mkdirSync("./output", { recursive: true });
      fs.writeFileSync(filename, finalCanvas.toBuffer("image/png"));
      
      console.log(`   書き出し成功: ${filename}`);
      await sleep(3000); // 1枚ごとに休憩
    } catch (e) {
      console.error(`エラー (${hourPart}時):`, e.message);
    }
  }
})();
