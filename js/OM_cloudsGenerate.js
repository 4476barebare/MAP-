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

// ===== Leafletピクセル基準の全座標を生成 =====
function generatePoints() {
  const points = [];
  for (let y = pixelBBox.yMin; y <= pixelBBox.yMax; y++) {
    for (let x = pixelBBox.xMin; x <= pixelBBox.xMax; x++) {
      const pos = pixelToLatLon(x, y, ZOOM);
      points.push({
        lat: pos.lat,
        lon: pos.lon,
        px: x - pixelBBox.xMin,
        py: y - pixelBBox.yMin
      });
    }
  }
  return points;
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
      ctx.fillRect(x, y, 1, 1); // 1ピクセル等倍
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

  const points = generatePoints();
  const grid = Array.from({ length: height }, () => Array(width).fill(0));

  console.log(`APIリクエスト開始... 総ポイント数: ${points.length} (POST形式で一括取得)`);

  try {
    const url = "https://api.open-meteo.com/v1/forecast";
    
    // 緯度と経度の配列をそれぞれ綺麗に分離
    const latitudes = points.map(p => p.lat);
    const longitudes = points.map(p => p.lon);

    // 【完全解決】Open-MeteoのPOST用仕様（URLは短いまま、BodyにJSONとして流し込む）
    const res = await axios.post(url, {
      latitude: latitudes,
      longitude: longitudes,
      hourly: ["precipitation"], // 配列で指定するのがOpen-MeteoのPOSTの厳格ルール
      forecast_days: 1,
      timezone: "UTC"
    }, {
      timeout: 60000 // 量が多いので1分までタイムアウトを緩和
    });

    const dataArray = Array.isArray(res.data) ? res.data : [res.data];

    // 取得した正確な配列データをグリッドにマッピング
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const pointData = dataArray[i];
      if (!pointData) continue;

      const times = pointData.hourly?.time;
      const prec = pointData.hourly?.precipitation;

      if (!times || !prec) continue;

      const idx = times.findIndex(t => t.startsWith(utcISO));
      if (idx === -1) continue;

      const rain = prec[idx] ?? 0;

      if (p.px >= 0 && p.px < width && p.py >= 0 && p.py < height) {
        grid[p.py][p.px] = rain;
      }
    }

    const jstISO = jstDate.toISOString();
    const filename = `./output/kanto_${jstISO.slice(0, 10)}_${jstISO.slice(11, 13)}h.png`;

    draw(grid, width, height, filename);
    console.log(`【完全大成功】すべてのエラーを回避し、Leaflet完全一致の透過画像を書き出しました: ${filename}`);

  } catch (e) {
    console.error("エラーが発生しました:", e.message);
    if (e.response) {
      console.error("サーバーからのレスポンス:", JSON.stringify(e.response.data));
    }
    process.exit(1);
  }
})();
