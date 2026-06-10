import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

// ==========================================
// 👑 エリア別プロファイル定義
// ==========================================
const AREA_PROFILES = {
  chiba: { prefname: "CHIBA", latMin: 34.7, latMax: 36.0, lonMin: 139.6, lonMax: 141.1, step: 0.1, zoom: 9 }
};

const activeArea = AREA_PROFILES.chiba;
const bbox = activeArea;
const step = activeArea.step;
const ZOOM = activeArea.zoom;

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

function splitIntoFour(arr) {
  const chunkSize = Math.ceil(arr.length / 4);
  return [arr.slice(0, chunkSize), arr.slice(chunkSize, chunkSize * 2), arr.slice(chunkSize * 2, chunkSize * 3), arr.slice(chunkSize * 3)];
}

async function fetchQuarterBatch(points) {
  const url = "https://api.open-meteo.com/v1/forecast";
  const res = await axios.get(url, {
    params: { latitude: points.map(p => p.lat.toFixed(4)).join(","), longitude: points.map(p => p.lon.toFixed(4)).join(","), hourly: "precipitation", forecast_days: 2, timezone: "UTC" },
    timeout: 20000
  });
  return Array.isArray(res.data) ? res.data : [res.data];
}

// ===== メイン =====
(async () => {
  const now = new Date();
  // +4時間後の時刻を基準にする
  const startTarget = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const startHour = startTarget.getHours();

  // 次の9時または21時のフェーズを判定
  let nextBase = (startHour >= 9 && startHour < 21) ? 21 : 9;
  const targetJstHours = [nextBase, nextBase + 3, nextBase + 6, nextBase + 9];

  console.log(`【本番実行】現在JST: ${now.getHours()}時。+4時間後の基準: ${startTarget.getHours()}時。次フェーズ(${nextBase}時開始)の4枚を生成します`);

  const points = generatePoints();
  const quarters = splitIntoFour(points);

  for (const jstTargetHour of targetJstHours) {

    // 日本時間のターゲット日付オブジェクトを作成
    const targetDate = new Date(now);
    targetDate.setHours(jstTargetHour, 0, 0, 0);
    // 日付またぎ（24時以降）の処理
    if (jstTargetHour >= 24) targetDate.setDate(targetDate.getDate() + 1);

    // ★修正：正しいUTC文字列の生成
    // ISOString()は自動的にUTCに変換してくれます
    // ただし、Dateオブジェクトそのものが「日本時間」を保持しているため、
    // 一旦UTCにずらしてからISO文字列化します
    const utcTime = new Date(targetDate.getTime() - 9 * 60 * 60 * 1000);
    const utcISO = utcTime.toISOString().slice(0, 13);

 
    console.log(`-> 生成中: JST ${targetDate.getHours()}時 (API指定: ${utcISO}:00)`);

    const gridData = [];
    try {
      for (let q = 0; q < quarters.length; q++) {
        const dataArray = await fetchQuarterBatch(quarters[q]);
        for (let i = 0; i < quarters[q].length; i++) {
          const p = quarters[q][i];
          const pointData = Array.isArray(dataArray) ? dataArray[i] : dataArray;
          const idx = pointData?.hourly?.time?.findIndex(t => t.startsWith(utcISO));
          if (idx !== -1 && pointData?.hourly?.precipitation) {
            gridData.push({ lat: p.lat, lon: p.lon, rain: pointData.hourly.precipitation[idx] ?? 0 });
          }
        }
        if (q < quarters.length - 1) await sleep(1500);
      }

      if (gridData.length === 0) continue;

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

      ctx.lineWidth = 0;
      for (const item of gridData) {
        const level = precipitationLevels.find(l => item.rain >= l.min);
        if (!level) continue;
        const xIdx = Math.round((item.lon - bbox.lonMin) / step);
        const yIdx = Math.round((bbox.latMax - item.lat) / step);
        ctx.fillStyle = level.color;
        ctx.fillRect(Math.round(xIdx * blockWidth), Math.round(yIdx * blockHeight), Math.ceil(blockWidth) + 1, Math.ceil(blockHeight) + 1);
      }

      const datePart = targetDate.toISOString().slice(0, 10);
      const hourPart = String(targetDate.getHours()).padStart(2, '0');
      const filename = `./output/${bbox.prefname}_${datePart}_${hourPart}h.png`;
      
      fs.mkdirSync("./output", { recursive: true });
      fs.writeFileSync(filename, finalCanvas.toBuffer("image/png"));
      console.log(`   書き出し完了: ${filename}`);
      
    } catch (e) {
      console.error(`エラー (${jstTargetHour}時):`, e.message);
    }
  }
})();
