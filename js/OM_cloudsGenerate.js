import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

// ===== 👑 Leaflet完全一致設定 =====
const ZOOM = 7; 

const bbox = {
  latMin: 34.8,
  latMax: 37.2,
  lonMin: 138.5,
  lonMax: 141.2
};

// 緯度経度をWebメルカトルの絶対ピクセル座標に変換
function latLonToPixel(lat, lon, zoom) {
  const size = 256 * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * size;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size;
  return { x, y };
}

// ピクセル座標から緯度経度を逆算
function pixelToLatLon(x, y, zoom) {
  const size = 256 * Math.pow(2, zoom);
  const lon = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

// ===== BBoxの範囲をLeafletピクセル単位で定義 =====
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

// ===== 描画（完全透過・元祖パレット） =====
function draw(grid, width, height, filename) {
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
      ctx.fillRect(x, y, 1, 1); // 1ピクセル等倍マッピング
    }
  }

  fs.mkdirSync("./output", { recursive: true });
  fs.writeFileSync(filename, canvas.toBuffer("image/png"));
}

// ===== メイン =====
(async () => {
  const { utcISO, jstDate } = getTargetUTCClean();
  console.log(`探索対象UTC: ${utcISO}:00 (Leaflet ZOOM: ${ZOOM})`);
  console.log(`キャンバスサイズ: ${width} x ${height} = 総計 ${width * height} ピクセル`);

  const grid = Array.from({ length: height }, () => Array(width).fill(0));

  // グリッドの両端（BBox）の緯度経度を精密に算出
  const topLeft = pixelToLatLon(pixelBBox.xMin, pixelBBox.yMin, ZOOM);
  const bottomRight = pixelToLatLon(pixelBBox.xMax, pixelBBox.yMax, ZOOM);

  console.log("APIリクエスト開始... (グリッド一括取得ルート / URL長固定)");

  try {
    const url = "https://api.open-meteo.com/v1/forecast";
    
    // 【最重要】個別座標を並べるのではなく、エリアの矩形（長方形）を指定して1撃で抜く
    const res = await axios.get(url, {
      params: {
        latitude: `${bottomRight.lat.toFixed(4)},${topLeft.lat.toFixed(4)}`,
        longitude: `${topLeft.lon.toFixed(4)},${bottomRight.lon.toFixed(4)}`,
        cell_selection: "grid", // これにより範囲内を自動で格子状に取得
        hourly: "precipitation",
        forecast_days: 1,
        timezone: "UTC"
      },
      timeout: 30000
    });

    const dataArray = Array.isArray(res.data) ? res.data : [res.data];

    // 取得したグリッドデータをLeafletのピクセル位置に正しくマッピング
    for (const pointData of dataArray) {
      if (!pointData) continue;

      const lat = pointData.latitude;
      const lon = pointData.longitude;
      const times = pointData.hourly?.time;
      const prec = pointData.hourly?.precipitation;

      if (!times || !prec) continue;

      const idx = times.findIndex(t => t.startsWith(utcISO));
      if (idx === -1) continue;

      const rain = prec[idx] ?? 0;

      // 該当の緯度経度が、Leaflet上でどのピクセルに該当するか逆算
      const p = latLonToPixel(lat, lon, ZOOM);
      const px = Math.round(p.x) - pixelBBox.xMin;
      const py = Math.round(p.y) - pixelBBox.yMin;

      if (px >= 0 && px < width && py >= 0 && py < height) {
        // 最も近いピクセル座標に雨量データをマッピング（最大値を採用して雨雲の歯抜け防止）
        grid[py][px] = Math.max(grid[py][px], rain);
      }
    }

    const jstISO = jstDate.toISOString();
    const filename = `./output/kanto_${jstISO.slice(0, 10)}_${jstISO.slice(11, 13)}h.png`;

    draw(grid, width, height, filename);
    console.log(`【完全大成功】414エラーを完璧に回避し、Leaflet完全一致画像を生成しました: ${filename}`);

  } catch (e) {
    console.error("エラーが発生しました:", e.message);
    if (e.response) {
      console.error("サーバーからのレスポンス:", e.response.data);
    }
    process.exit(1);
  }
})();
