import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

// ===== 👑 Leaflet完全一致設定 =====
const ZOOM = 7; // 基準にしたいLeafletのズームレベル（お好みの数字に変更可能）

const bbox = {
  latMin: 34,
  latMax: 38,
  lonMin: 138,
  lonMax: 142
};

// 緯度経度をWebメルカトルの絶対ピクセル座標に変換する関数（Leafletの内部計算と同一）
function latLonToPixel(lat, lon, zoom) {
  const size = 256 * Math.pow(2, zoom); // そのズームレベルでの世界全体のピクセル幅
  
  // X座標（経度）の変換
  const x = ((lon + 180) / 360) * size;
  
  // Y座標（緯度）の変換：メルカトル投影の数式
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size;
  
  return { x, y };
}

// 429エラー回避用
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ===== JST → UTC変換 =====
function getTargetUTCClean() {
  const now = new Date();
  const currentJstHour = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 13) * 1;
  const nextJstHour = Math.ceil((currentJstHour === 0 ? 24 : currentJstHour) / 3) * 3;
  
  const targetJst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  targetJst.setUTCHours(nextJstHour % 24, 0, 0, 0);
  if (nextJstHour >= 24) {
    targetJst.setTime(targetJst.getTime() + 24 * 60 * 60 * 1000);
  }
  
  const targetUtc = new Date(targetJst.getTime() - 9 * 60 * 60 * 1000);
  return { utcISO: targetUtc.toISOString().slice(0, 13), jstDate: targetJst };
}

// ===== グリッド生成（Leafletの1ピクセル単位で拠点を配置） =====
// Bounding Box内の、Leaflet上のピクセル範囲を割り出す
const pMax = latLonToPixel(bbox.latMax, bbox.lonMin, ZOOM);
const pMin = latLonToPixel(bbox.latMin, bbox.lonMax, ZOOM);

const pixelBBox = {
  xMin: Math.floor(pMax.x),
  xMax: Math.floor(pMin.x),
  yMin: Math.floor(pMax.y),
  yMax: Math.floor(pMin.y)
};

const width = pixelBBox.xMax - pixelBBox.xMin + 1;
const height = pixelBBox.yMax - pixelBBox.yMin + 1;

// ピクセル座標から緯度経度を逆算する関数（APIリクエスト用）
function pixelToLatLon(x, y, zoom) {
  const size = 256 * Math.pow(2, zoom);
  const lon = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

function generatePoints() {
  const points = [];
  // 1ピクセル飛ばし（高解像度なら等倍、負荷を減らすなら2ピクセル置きなど調整可）
  const skip = 2; 
  
  for (let y = pixelBBox.yMin; y <= pixelBBox.yMax; y += skip) {
    for (let x = pixelBBox.xMin; x <= pixelBBox.xMax; x += skip) {
      const pos = pixelToLatLon(x, y, ZOOM);
      points.push({ lat: pos.lat, lon: pos.lon, px: x - pixelBBox.xMin, py: y - pixelBBox.yMin });
    }
  }
  return { points, skip };
}

function splitIntoTwo(arr) {
  const half = Math.ceil(arr.length / 2);
  return [arr.slice(0, half), arr.slice(half)];
}

async function fetchHalfBatch(points) {
  const url = "https://api.open-meteo.com/v1/forecast";
  const latitudes = points.map(p => p.lat.toFixed(4)).join(",");
  const longitudes = points.map(p => p.lon.toFixed(4)).join(",");

  const res = await axios.get(url, {
    params: { latitude: latitudes, longitude: longitudes, hourly: "precipitation", forecast_days: 1, timezone: "UTC" },
    timeout: 20000
  });
  return Array.isArray(res.data) ? res.data : [res.data];
}

// ===== 描画（背景透過・Leafletピクセルサイズ） =====
function draw(grid, width, height, skip, filename) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // 背景透過

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rain = grid[y][x];
      if (rain < 0.2) continue;

      let color = "rgba(100,180,255,0.5)";
      if (rain > 2) color = "rgba(0,120,255,0.7)";
      if (rain > 5) color = "rgba(255,80,0,0.8)";
      if (rain > 10) color = "rgba(255,0,0,1)";

      ctx.fillStyle = color;
      // skipサイズに合わせてドットを打つことで隙間を埋める
      ctx.fillRect(x, y, skip, skip);
    }
  }

  fs.mkdirSync("./output", { recursive: true });
  fs.writeFileSync(filename, canvas.toBuffer("image/png"));
}

// ===== メイン =====
(async () => {
  const { utcISO, jstDate } = getTargetUTCClean();
  console.log(`探索対象UTC: ${utcISO}:00 (Leaflet ZOOM: ${ZOOM})`);

  const { points, skip } = generatePoints();
  const halves = splitIntoTwo(points);

  const grid = Array.from({ length: height }, () => Array(width).fill(0));

  console.log(`API開始... 総ポイント数: ${points.length}`);

  try {
    for (let h = 0; h < halves.length; h++) {
      const subBatch = halves[h];
      const dataArray = await fetchHalfBatch(subBatch);

      for (let i = 0; i < subBatch.length; i++) {
        const p = subBatch[i];
        const pointData = dataArray[i];
        if (!pointData) continue;

        const times = pointData.hourly?.time;
        const prec = pointData.hourly?.precipitation;
        if (!times || !prec) continue;

        const idx = times.findIndex(t => t.startsWith(utcISO));
        if (idx === -1) continue;

        const rain = prec[idx] ?? 0;
        
        // 割り出した正確なピクセル位置にデータを格納
        if (p.px >= 0 && p.px < width && p.py >= 0 && p.py < height) {
          grid[p.py][p.px] = rain;
        }
      }

      if (h === 0) await sleep(1500);
    }

    const jstISO = jstDate.toISOString();
    const filename = `./output/kanto_${jstISO.slice(0, 10)}_${jstISO.slice(11, 13)}h.png`;

    draw(grid, width, height, skip, filename);
    console.log(`【完全大成功】Leafletの基準と完全一致した透過画像を書き出しました: ${filename}`);

  } catch (e) {
    console.error("エラーが発生しました:", e.message);
    process.exit(1);
  }
})();
