import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

const bbox = {

  latMin: 34,

  latMax: 38,

  lonMin: 138,

  lonMax: 142

};

const step = 0.1;

// 429エラー回避用のウェイト
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// ===== グリッド生成（北から南へ） =====
function generatePoints() {
  const points = [];
  for (let lat = bbox.latMax; lat >= bbox.latMin; lat -= step) {
    for (let lon = bbox.lonMin; lon <= bbox.lonMax; lon += step) {
      points.push({ lat, lon });
    }
  }
  return points;
}

// 2分割
function splitIntoTwo(arr) {
  const half = Math.ceil(arr.length / 2);
  return [arr.slice(0, half), arr.slice(half)];
}

// ===== API取得 =====
async function fetchHalfBatch(points) {
  const url = "https://api.open-meteo.com/v1/forecast";
  const latitudes = points.map(p => p.lat.toFixed(4)).join(",");
  const longitudes = points.map(p => p.lon.toFixed(4)).join(",");

  const res = await axios.get(url, {
    params: {
      latitude: latitudes,
      longitude: longitudes,
      hourly: "precipitation",
      forecast_days: 1,
      timezone: "UTC"
    },
    timeout: 20000
  });

  return Array.isArray(res.data) ? res.data : [res.data];
}

// ===== 緯度をメルカトルY座標（比率0〜1）に変換する補正ロジック =====
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

  // 描画時にWeb地図（メルカトル）の歪みを補正するための基準値を計算
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

    // 経度は直線的（そのままでOK）
    const xRatio = (item.lon - bbox.lonMin) / (bbox.lonMax - bbox.lonMin);
    const drawX = Math.round(xRatio * (width - 1));

    // ★緯度はメルカトル歪みを補正してY座標を決定（これで地図と完全一致します）
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
  const halves = splitIntoTwo(points);

  const width = Math.floor((bbox.lonMax - bbox.lonMin) / step) + 1;
  const height = Math.floor((bbox.latMax - bbox.latMin) / step) + 1;
  
  // 描画時に精密な位置補正を行うため、配列データとして rain, lat, lon を保持する形に変更
  const gridData = [];

  console.log(`APIリクエスト開始... 総ポイント数: ${points.length} (安全2分割ルート)`);

  try {
    for (let h = 0; h < halves.length; h++) {
      const subBatch = halves[h];
      console.log(`-> 分割リクエスト中... (${h + 1}/2)`);
      
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

        // 座標情報と一緒にデータをストック
        gridData.push({
          lat: p.lat,
          lon: p.lon,
          rain: rain
        });
      }

      if (h === 0) {
        await sleep(1500);
      }
    }

    // ファイル名生成
    const jstISO = jstDate.toISOString(); 
    const datePart = jstISO.slice(0, 10);  
    const hourPart = jstISO.slice(11, 13); 
    
    const filename = `./output/kanto_${datePart}_${hourPart}h.png`;

    // 補正をかけながら描画
    drawCorrected(gridData, width, height, filename);
    console.log(`【完全大成功】安定ルートのまま、位置補正された画像を透過で書き出しました: ${filename}`);

  } catch (e) {
    console.error("データ取得または描画中にエラーが発生しました:", e.message);
    process.exit(1);
  }
})();
