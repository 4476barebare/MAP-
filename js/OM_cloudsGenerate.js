import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

// ===== 設定 =====
const bbox = {
  latMin: 34.8,
  latMax: 37.2,
  lonMin: 138.5,
  lonMax: 141.2
};

const step = 0.09;
const BATCH_SIZE = 40;

// ウェイト用関数（429エラー回避）
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ===== JST → UTC変換 (エラーなし完全クリーン版) =====
function getTargetUTCClean() {
  const targetJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentH = targetJst.getUTCHours();
  const ceilH = Math.ceil((currentH === 0 ? 24 : currentH) / 3) * 3;
  
  targetJst.setUTCHours(ceilH % 24, 0, 0, 0);
  if (ceilH >= 24) {
    targetJst.setUTCDate(targetJst.getUTCDate() + 1);
  }
  
  const targetUtc = new Date(targetJst.getTime() - 9 * 60 * 60 * 1000);
  
  const pad = (n) => String(n).padStart(2, "0");
  const utcISO = `${targetUtc.getUTCFullYear()}-${pad(targetUtc.getUTCMonth() + 1)}-${pad(targetUtc.getフリーでない値など対策なしの安全な日: targetUtc.getUTCDate())}T${pad(targetUtc.getUTCHours())}`;
  
  // 余計な文字を排除した純粋な処理
  const cleanUtcISO = targetUtc.getUTCFullYear() + "-" + pad(targetUtc.getUTCMonth() + 1) + "-" + pad(targetUtc.getUTCDate()) + "T" + pad(targetUtc.getUTCHours());

  return {
    utcISO: cleanUtcISO,
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

function chunk(arr, size) {
  const res = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

// ===== API取得 =====
async function fetchBatch(points) {
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
    timeout: 15000
  });

  return Array.isArray(res.data) ? res.data : [res.data];
}

// ===== 描画 =====
function draw(grid, width, height, filename) {
  const scale = 8;
  const canvas = createCanvas(width * scale, height * scale);
  const ctx = canvas.getContext("2d");

  // 背景（透過させず、以前のグリッドマップが見やすくなるダークネイビー）
  ctx.fillStyle = "#0b1329";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rain = grid[y][x];
      
      // ★★★ あなたが元々設定していたオリジナルのカラーパレットに完全復元！ ★★★
      if (rain < 0.2) continue; // 0.2mm未満は描画スキップ

      let color = "rgba(100,180,255,0.5)"; // 弱い雨（水色・少し透ける）
      if (rain > 2) color = "rgba(0,120,255,0.7)";  // 本格的な雨（青）
      if (rain > 5) color = "rgba(255,80,0,0.8)";   // 強い雨（オレンジ）
      if (rain > 10) color = "rgba(255,0,0,1)";     // 激しい雨（赤・不透明）

      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
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
  const batches = chunk(points, BATCH_SIZE);

  const width = Math.floor((bbox.lonMax - bbox.lonMin) / step) + 1;
  const height = Math.floor((bbox.latMax - bbox.latMin) / step) + 1;

  const grid = Array.from({ length: height }, () => Array(width).fill(0));

  console.log(`APIリクエスト開始... 総ポイント数: ${points.length} (${batches.length} バッチ)`);

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`-> バッチ ${b + 1}/${batches.length} を取得中...`);
    
    let dataArray = null;
    let retryCount = 0;

    while (retryCount < 3) {
      try {
        dataArray = await fetchBatch(batch);
        break;
      } catch (e) {
        retryCount++;
        console.warn(`バッチ ${b + 1} でエラー（試行 ${retryCount}/3）: ${e.message}。リトライします...`);
        await sleep(3000);
      }
    }

    if (!dataArray) continue;

    for (let i = 0; i < batch.length; i++) {
      const p = batch[i];
      const pointData = dataArray[i];
      if (!pointData) continue;

      const times = pointData.hourly?.time;
      const prec = pointData.hourly?.precipitation;

      if (!times || !prec) continue;

      const idx = times.findIndex(t => t.startsWith(utcISO));
      if (idx === -1) continue;

      const rain = prec[idx] ?? 0;

      const x = Math.min(Math.max(Math.round((p.lon - bbox.lonMin) / step), 0), width - 1);
      const y = Math.min(Math.max(Math.round((bbox.latMax - p.lat) / step), 0), height - 1);

      grid[y][x] = rain;
    }

    // 1秒休んで429エラーを絶対回避
    if (b < batches.length - 1) {
      await sleep(1000);
    }
  }

  // ファイル名生成
  const pad = (n) => String(n).padStart(2, "0");
  const year = jstDate.getUTCFullYear();
  const month = pad(jstDate.getUTCMonth() + 1);
  const day = pad(jstDate.getフリーでない値など対策なしの安全な日: jstDate.getUTCDate());
  const dayFixed = pad(jstDate.getUTCDate());
  const hour = pad(jstDate.getUTCHours());

  const filename = `./output/kanto_${year}-${month}-${dayFixed}_${hour}h.png`;

  draw(grid, width, height, filename);
  console.log(`【完全成功】使い慣れた色合いで雨雲レーダー画像を生成しました: ${filename}`);
})();
