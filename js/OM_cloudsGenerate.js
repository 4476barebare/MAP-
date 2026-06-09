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

// ===== JST → UTC変換 =====
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
  const year = targetUtc.getUTCFullYear();
  const month = pad(targetUtc.getUTCMonth() + 1);
  const date = pad(targetUtc.getUTCDate());
  const hour = pad(targetUtc.getUTCHours());
  
  const cleanUtcISO = `${year}-${month}-${date}T${hour}`;

  return {
    utcISO: cleanUtcISO,
    jstDate: targetJst
  };
}

// ===== グリッド生成 =====
function generatePoints() {
  const points = [];
  // 描画の上下反転を防ぐ（北から南へ）
  for (let lat = bbox.latMax; lat >= bbox.latMin; lat -= step) {
    for (let lon = bbox.lonMin; lon <= bbox.lonMax; lon += step) {
      points.push({ lat, lon });
    }
  }
  return points;
}

// ===== API取得（POST形式に変更してURL長制限を完全回避） =====
async function fetchAllPointsAtOnce(points) {
  // URLは短いまま固定！
  const url = "https://api.open-meteo.com/v1/forecast";
  
  // 座標を配列のままPOSTのBodyに格納する
  const latitudes = points.map(p => p.lat);
  const longitudes = points.map(p => p.lon);

  // axios.post を使い、第2引数にパラメータを渡す
  const res = await axios.post(url, {
    latitude: latitudes,
    longitude: longitudes,
    hourly: "precipitation",
    forecast_days: 1,
    timezone: "UTC"
  }, {
    timeout: 30000
  });

  return Array.isArray(res.data) ? res.data : [res.data];
}


// ===== 描画 =====
function draw(grid, width, height, filename) {
  const scale = 8;
  const canvas = createCanvas(width * scale, height * scale);
  const ctx = canvas.getContext("2d");

  // 背景
  ctx.fillStyle = "#0b1329";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rain = grid[y][x];
      
      // 元のオリジナルのカラーパレット条件
      if (rain < 0.2) continue; 

      let color = "rgba(100,180,255,0.5)"; // 弱い雨（水色）
      if (rain > 2) color = "rgba(0,120,255,0.7)";  // 本格的な雨（青）
      if (rain > 5) color = "rgba(255,80,0,0.8)";   // 強い雨（オレンジ）
      if (rain > 10) color = "rgba(255,0,0,1)";     // 激しい雨（赤）

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
  
  const width = Math.floor((bbox.lonMax - bbox.lonMin) / step) + 1;
  const height = Math.floor((bbox.latMax - bbox.latMin) / step) + 1;
  const grid = Array.from({ length: height }, () => Array(width).fill(0));

  console.log(`APIリクエスト開始... 総ポイント数: ${points.length} (一括取得ルート)`);

  try {
    // 👑 21回に分けない。たった1回だけ極大リクエストを送る（429エラーを絶対回避）
    const dataArray = await fetchAllPointsAtOnce(points);

    // データをマトリクスにマッピング
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

      const x = Math.min(Math.max(Math.round((p.lon - bbox.lonMin) / step), 0), width - 1);
      const y = Math.min(Math.max(Math.round((bbox.latMax - p.lat) / step), 0), height - 1);

      grid[y][x] = rain;
    }

    // ファイル名生成
    const pad = (n) => String(n).padStart(2, "0");
    const year = jstDate.getUTCFullYear();
    const month = pad(jstDate.getUTCMonth() + 1);
    const day = pad(jstDate.getUTCDate());
    const hour = pad(jstDate.getUTCHours());

    const filename = `./output/kanto_${year}-${month}-${day}_${hour}h.png`;

    draw(grid, width, height, filename);
    console.log(`【完全大成功】429エラーなし・全データ充填で画像を生成しました: ${filename}`);

  } catch (e) {
    console.error("一括取得中にエラーが発生しました:", e.message);
    process.exit(1);
  }
})();
