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

// 👑 Leafletの解像度基準（ZOOM 7のピクセル幅に画像を合わせる）
const ZOOM = 7;

// 429エラー回避用のウェイト
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ===== 緯度経度をWebメルカトルの絶対ピクセル座標に変換 =====
function latLonToPixel(lat, lon, zoom) {
  const size = 256 * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * size;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size;
  return { x, y };
}

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

// ===== グリッド生成（北から南へ：1640地点の丁度いい粒度） =====
function generatePoints() {
  const points = [];
  for (let lat = bbox.latMax; lat >= bbox.latMin; lat -= step) {
    for (let lon = bbox.lonMin; lon <= bbox.lonMax; lon += step) {
      points.push({ lat, lon });
    }
  }
  return points;
}

// 4分割
function splitIntoFour(arr) {
  const chunkSize = Math.ceil(arr.length / 4);
  return [
    arr.slice(0, chunkSize),
    arr.slice(chunkSize, chunkSize * 2),
    arr.slice(chunkSize * 2, chunkSize * 3),
    arr.slice(chunkSize * 3)
  ];
}

// ===== API取得 =====
async function fetchQuarterBatch(points) {
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

// ===== メイン =====
(async () => {
  const { utcISO, jstDate } = getTargetUTCClean();
  console.log(`探索する対象UTC時間: ${utcISO}:00`);

  const points = generatePoints();
  const quarters = splitIntoFour(points);

  // 1640地点の格子データ（低粒度）を保持する用の配列
  const gridData = [];

  console.log(`APIリクエスト開始... 総ポイント数: ${points.length} (安定4分割・粒度維持ルート)`);

  try {
    for (let q = 0; q < quarters.length; q++) {
      const subBatch = quarters[q];
      if (subBatch.length === 0) continue;

      console.log(`-> 分割リクエスト中... (${q + 1}/4) - ${subBatch.length}地点`);
      const dataArray = await fetchQuarterBatch(subBatch);

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
        
        // データを緯度経度付きで一旦ストック
        gridData.push({ lat: p.lat, lon: p.lon, rain });
      }

      if (q < quarters.length - 1) {
        await sleep(1500);
      }
    }

    // ===== 👑 出力時だけLeaflet基準のピクセルサイズ（大判）に引き伸ばし配置 =====
    const pMax = latLonToPixel(bbox.latMax, bbox.lonMin, ZOOM);
    const pMin = latLonToPixel(bbox.latMin, bbox.lonMax, ZOOM);

    const pixelBBox = {
      xMin: Math.floor(pMax.x),
      xMax: Math.floor(pMin.x),
      yMin: Math.floor(pMax.y),
      yMax: Math.floor(pMin.y)
    };

    const outWidth = pixelBBox.xMax - pixelBBox.xMin + 1;
    const outHeight = pixelBBox.yMax - pixelBBox.yMin + 1;
    
    console.log(`-> 1640点の粒度のまま、Leafletサイズ (${outWidth}x${outHeight} px) に引き伸ばし描画中...`);

    const finalCanvas = createCanvas(outWidth, outHeight);
    const finalCtx = finalCanvas.getContext("2d");

    // Leaflet側の1ピクセルあたりの経度・緯度（メルカトル）の範囲比率を計算
    const mercatorYMax = (0.5 - Math.log((1 + Math.sin((bbox.latMax * Math.PI) / 180))) / (1 - Math.sin((bbox.latMax * Math.PI) / 180))) / (4 * Math.PI));
    const mercatorYMin = (0.5 - Math.log((1 + Math.sin((bbox.latMin * Math.PI) / 180))) / (1 - Math.sin((bbox.latMin * Math.PI) / 180))) / (4 * Math.PI));
    
    // 格子を少し太めにスタンプして、荒いデータの粒度感を表現（隙間が空かないように適正補正）
    const dotWidth = Math.ceil(outWidth / (4 / step));
    const dotHeight = Math.ceil(outHeight / (4 / step));

    for (const item of gridData) {
      if (item.rain < 0.2) continue;

      let color = "rgba(100,180,255,0.5)";
      if (item.rain > 2) color = "rgba(0,120,255,0.7)";
      if (item.rain > 5) color = "rgba(255,80,0,0.8)";
      if (item.rain > 10) color = "rgba(255,0,0,1)";

      // 各地点の経度・緯度から、Leaflet画像内の正確なX, Y（メルカトル位置）を計算
      const p = latLonToPixel(item.lat, item.lon, ZOOM);
      const drawX = Math.round(p.x - pixelBBox.xMin);
      const drawY = Math.round(p.y - pixelBBox.yMin);

      if (drawX >= 0 && drawX < outWidth && drawY >= 0 && drawY < outHeight) {
        finalCtx.fillStyle = color;
        // 荒い粒度（0.1度マス）に応じたサイズで、ピンポイントに配置
        finalCtx.fillRect(
          drawX - Math.floor(dotWidth / 2), 
          drawY - Math.floor(dotHeight / 2), 
          dotWidth, 
          dotHeight
        );
      }
    }

    // ファイル名生成
    const jstISO = jstDate.toISOString();
    const datePart = jstISO.slice(0, 10);
    const hourPart = jstISO.slice(11, 13);
    const filename = `./output/kanto_${datePart}_${hourPart}h.png`;

    fs.mkdirSync("./output", { recursive: true });
    fs.writeFileSync(filename, finalCanvas.toBuffer("image/png"));
    console.log(`【完全大成功】ちょうどいい粒度のまま、Leafletサイズで透過画像を書き出しました: ${filename}`);

  } catch (e) {
    console.error("データ取得または描画中にエラーが発生しました:", e.message);
    process.exit(1);
  }
})();
