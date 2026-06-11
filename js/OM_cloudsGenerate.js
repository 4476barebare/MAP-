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
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  
  // 次の基準時間を決定 (現在の時間が9時未満なら9時、9〜21時なら21時、21時以降なら翌日9時)
  const currentHour = jstNow.getUTCHours();
  let nextBase = (currentHour >= 9 && currentHour < 21) ? 21 : 9;
  
  // 基準時間が現在より過去なら翌日にする
  let baseDate = new Date(jstNow);
  baseDate.setUTCHours(nextBase, 0, 0, 0);
  if (baseDate <= jstNow) {
    baseDate.setUTCDate(baseDate.getUTCDate() + 1);
  }

  console.log(`【本番実行】現在(JST): ${jstNow.toISOString().replace('T', ' ').slice(0, 16)}。${baseDate.toISOString().slice(0, 10)} ${nextBase}時からの4枚を生成します`);

  const points = generatePoints();
  
  for (let i = 0; i < 4; i++) {
    // 3時間ずつ加算（24時、27時、30時と進む）
    const targetJst = new Date(baseDate);
    targetJst.setUTCHours(nextBase + (i * 3));

    // API送信用：日本時間から9時間引いたUTC時間
    const utcTime = new Date(targetJst.getTime() - jstOffset);
    const utcISO = utcTime.toISOString().slice(0, 13);
    
    // ファイル名用：自動的に翌日などを反映した日付を取得
    const datePart = targetJst.toISOString().slice(0, 10);
    const hourPart = String(targetJst.getUTCHours()).padStart(2, '0');
    
    console.log(`-> 生成中: JST ${datePart} ${hourPart}時 (API指定: ${utcISO}:00)`);

    try {
      const url = "https://api.open-meteo.com/v1/forecast";
      const { data } = await axios.get(url, {
        params: {
          latitude: points.map(p => p.lat).join(","),
          longitude: points.map(p => p.lon).join(","),
          hourly: "precipitation",
          forecast_days: 7, // 日付またぎに対応するため余裕を持つ
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

      const pMax = latLonToPixel(bbox.latMax, bbox.lonMin, ZOOM);
      const pMin = latLonToPixel(bbox.latMin, bbox.lonMax, ZOOM);
      const outWidth = Math.ceil(pMin.x - pMax.x) + 10;
      const outHeight = Math.ceil(pMin.y - pMax.y) + 10;
      const blockWidth = outWidth / Math.round((bbox.lonMax - bbox.lonMin) / step);
      const blockHeight = outHeight / Math.round((bbox.latMax - bbox.latMin) / step);

      const finalCanvas = createCanvas(outWidth, outHeight);
      const ctx = finalCanvas.getContext("2d");

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
      await sleep(3000); 
    } catch (e) {
      console.error(`エラー (${hourPart}時):`, e.message);
    }
  }
})();
