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

(async () => {
  const now = new Date();
  const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  const startTargetJst = new Date(jstNow.getTime() + 4 * 60 * 60 * 1000);
  
  const nextBase = (startTargetJst.getUTCHours() >= 9 && startTargetJst.getUTCHours() < 21) ? 21 : 9;
  const targetJstHours = [nextBase, nextBase + 3, nextBase + 6, nextBase + 9];

  const points = generatePoints();
  
  console.log(`【開始】現在(JST): ${jstNow.toISOString().slice(0, 16)}。フェーズ開始: ${nextBase}時`);

  let data;
  try {
    const url = "https://api.open-meteo.com/v1/forecast";
    const res = await axios.get(url, {
      params: {
        latitude: points.map(p => p.lat).join(","),
        longitude: points.map(p => p.lon).join(","),
        hourly: "precipitation",
        forecast_days: 3,
        timezone: "UTC"
      }
    });
    data = res.data;
  } catch (e) {
    console.error("API取得エラー:", e.message);
    return;
  }

  for (const jstHour of targetJstHours) {
    // 日付をまたぐ計算：JSTの「時」を直接セットすることでDateオブジェクトが日付を自動補正
    const targetJst = new Date(jstNow);
    targetJst.setUTCHours(jstHour, 0, 0, 0); 

    const utcTime = new Date(targetJst.getTime() - (9 * 60 * 60 * 1000));
    const utcISO = utcTime.toISOString().slice(0, 13);
    
    const datePart = targetJst.toISOString().slice(0, 10);
    const hourPart = String(targetJst.getUTCHours()).padStart(2, '0');
    
    console.log(`-> 生成中: ${datePart} ${hourPart}時 (UTC: ${utcISO}:00)`);

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
    const finalCanvas = createCanvas(Math.ceil(pMin.x - pMax.x) + 10, Math.ceil(pMin.y - pMax.y) + 10);
    const ctx = finalCanvas.getContext("2d");
    const blockWidth = finalCanvas.width / Math.round((bbox.lonMax - bbox.lonMin) / step);
    const blockHeight = finalCanvas.height / Math.round((bbox.latMax - bbox.latMin) / step);

    for (const item of gridData) {
      const level = precipitationLevels.find(l => item.rain >= l.min);
      if (!level) continue;
      ctx.fillStyle = level.color;
      ctx.fillRect(
        Math.round(((item.lon - bbox.lonMin) / step) * blockWidth),
        Math.round(((bbox.latMax - item.lat) / step) * blockHeight),
        Math.ceil(blockWidth) + 1, Math.ceil(blockHeight) + 1
      );
    }

    fs.mkdirSync("./output", { recursive: true });
    fs.writeFileSync(`./output/${bbox.prefname}_${datePart}_${hourPart}h.png`, finalCanvas.toBuffer("image/png"));
    
    await sleep(1000);
  }
  console.log("【完了】すべての処理が終了しました。");
})