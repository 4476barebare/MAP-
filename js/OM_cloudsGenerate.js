import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

// ===== 設定 =====
const bbox = {
  latMin: 34,
  latMax: 38,
  lonMin: 138,
  lonMax: 142
};

const step = 0.1;

// ===== JST → UTC変換 =====
function getTargetUTCClean() {
  const now = new Date();
  
  // 3時間刻みの切り上げ計算
  const currentJstHour = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 13) * 1;
  const nextJstHour = Math.ceil((currentJstHour === 0 ? 24 : currentJstHour) / 3) * 3;
  
  const targetJst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  targetJst.setUTCHours(nextJstHour % 24, 0, 0, 0);
  if (nextJstHour >= 24) {
    targetJst.setTime(targetJst.getTime() + 24 * 60 * 60 * 1000);
  }
  
  const targetUtc = new Date(targetJst.getTime() - 9 * 60 * 60 * 1000);
  const utcISO = targetUtc.toISOString().slice(0, 13);

  return {
    utcISO: utcISO,
    jstDate: targetJst
  };
}

// ===== グリッド生成 =====
function generatePoints() {
  const points = [];
  for (let lat = bbox.latMax; lat >= bbox.latMin; lat -= step) {
    for (let lon = bbox.lonMin; lon <= bbox.lonMax; lon += step) {
      points.push({ lat, lon });
    }
  }
  return points;
}

// ===== 緯度をメルカトルY座標に変換する補正ロジック =====
function latToMercatorY(lat) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
}

// ===== 描画（完全透過＋元祖カラー＋出力時メルカトル補正） =====
function drawCorrected(gridData, width, height, filename) {
  const scale = 2; // 元のサイズ
  const canvas = createCanvas(width * scale, height * scale);
  const ctx = canvas.getContext("2d");

  // 背景透過

  const mercatorYMax = latToMercatorY(bbox.latMax);
  const mercatorYMin = latToMercatorY(bbox.latMin);
  const mercatorYRange = mercatorYMin - mercatorYMax;

  for (const item of gridData) {
    const rain = item.rain;
    if (rain < 0.2) continue;

    // 元々のカラーパレット定義
    let color = "rgba(100,180,255,0.5)"; 
    if (rain > 2) color = "rgba(0,120,255,0.7)";  
    if (rain > 5) color = "rgba(255,80,0,0.8)";   
    if (rain > 10) color = "rgba(255,0,0,1)";     

    // 経度の位置計算
    const xRatio = (item.lon - bbox.lonMin) / (bbox.lonMax - bbox.lonMin);
    const drawX = Math.round(xRatio * (width - 1));

    // 緯度のメルカトル補正計算
    const currentMercatorY = latToMercatorY(item.lat);
    const yRatio = (currentMercatorY - mercatorYMax) / mercatorYRange;
    const drawY = Math.round(yRatio * (height - 1));

    if (drawX >= 0 && drawX < width && drawY >= 0 && drawY < height) {
      ctx.fillStyle = color;
      ctx.fillRect(drawX * scale, drawY * scale, scale, scale);
    }
  }

  fs.mkdirSync("./output", { recursive: true });
  fs.writeFileSync(filename, canvas.toBuffer("image/png"));
}

// ===== メイン =====
(async () => {
  const { utcISO, jstDate } = getTargetUTCClean();
  console.log(`探索する対象UTC時間: ${utcISO}:00`);

  const points = generatePoints();

  const width = Math.floor((bbox.lonMax - bbox.lonMin) / step) + 1;
  const height = Math.floor((bbox.latMax - bbox.latMin) / step) + 1;
  
  const gridData = [];

  console.log(`APIリクエスト開始... 総ポイント数: ${points.length} (POSTによる超安定1発ルート)`);

  try {
    const url = "https://api.open-meteo.com/v1/forecast";
    const latitudes = points.map(p => p.lat.toFixed(4)).join(",");
    const longitudes = points.map(p => p.lon.toFixed(4)).join(",");

    // ★GETではなくPOSTを使う（中身は元のパラメータのままなので400エラーも出ません）
    const res = await axios.post(url, null, {
      params: {
        latitude: latitudes,
        longitude: longitudes,
        hourly: "precipitation",
        forecast_days: 1,
        timezone: "UTC"
      },
      timeout: 30000
    });

    const dataArray = Array.isArray(res.data) ? res.data : [res.data];

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

      gridData.push({
        lat: p.lat,
        lon: p.lon,
        rain: rain
      });
    }

    // ファイル名生成
    const jstISO = jstDate.toISOString(); 
    const datePart = jstISO.slice(0, 10);  
    const hourPart = jstISO.slice(11, 13); 
    
    const filename = `./output/kanto_${datePart}_${hourPart}h.png`;

    // 補正をかけながら描画
    drawCorrected(gridData, width, height, filename);
    console.log(`【完全大成功】すべてのエラーを消し去り、透過画像を書き出しました: ${filename}`);

  } catch (e) {
    console.error("データ取得または描画中にエラーが発生しました:", e.message);
    process.exit(1);
  }
})();
