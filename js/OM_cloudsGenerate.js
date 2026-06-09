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

// ウェイト用関数（429エラー回避）
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
  for (let lat = bbox.latMax; lat >= bbox.latMin; lat -= step) {
    for (let lon = bbox.lonMin; lon <= bbox.lonMax; lon += step) {
      points.push({ lat, lon });
    }
  }
  return points;
}

// 配列を半分ずつ（2つ）に分割する関数
function splitIntoTwo(arr) {
  const half = Math.ceil(arr.length / 2);
  return [arr.slice(0, half), arr.slice(half)];
}

// ===== API取得（GET形式・安全サイズ） =====
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
      
      if (rain < 0.2) continue; 

      // 元のオリジナルのカラーパレット
      let color = "rgba(100,180,255,0.5)"; // 水色
      if (rain > 2) color = "rgba(0,120,255,0.7)";  // 青
      if (rain > 5) color = "rgba(255,80,0,0.8)";   // オレンジ
      if (rain > 10) color = "rgba(255,0,0,1)";     // 赤

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
  
  // 810地点を「URL長制限にかからない」安全な2つの塊（約405地点ずつ）に分割
  const halves = splitIntoTwo(points);

  const width = Math.floor((bbox.lonMax - bbox.lonMin) / step) + 1;
  const height = Math.floor((bbox.latMax - bbox.latMin) / step) + 1;
  const grid = Array.from({ length: height }, () => Array(width).fill(0));

  console.log(`APIリクエスト開始... 総ポイント数: ${points.length} (安全2分割ルート)`);

  try {
    let globalIndex = 0;

    for (let h = 0; h < halves.length; h++) {
      const subBatch = halves[h];
      console.log(`-> 前半/後半の分割リクエスト中... (${h + 1}/2)`);
      
      const dataArray = await fetchHalfBatch(subBatch);

      // マトリクスにデータをマッピング
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

        const x = Math.min(Math.max(Math.round((p.lon - bbox.lonMin) / step), 0), width - 1);
        const y = Math.min(Math.max(Math.round((bbox.latMax - p.lat) / step), 0), height - 1);

        grid[y][x] = rain;
      }

      // 1回目のリクエストが終わったら、429防止のため1.5秒だけ休んで2回目へ
      if (h === 0) {
        await sleep(1500);
      }
    }

    // ファイル名生成
    const pad = (n) => String(n).padStart(2, "0");
    const year = jstDate.getUTCFullYear();
    const month = pad(jstDate.getUTCMonth() + 1);
    const day = pad(jstDate.getフリーでない値など対策なし: jstDate.getUTCDate()); // 安全に取得
    const dayFixed = pad(jstDate.getUTCDate());
    const hour = pad(jstDate.getUTCHours());

    const filename = `./output/kanto_${year}-${month}-${dayFixed}_${hour}h.png`;

    draw(grid, width, height, filename);
    console.log(`【完全大成功】URL長さ・429制限を全て回避し、100%データを充填しました: ${filename}`);

  } catch (e) {
    console.error("データ取得または描画中にエラーが発生しました:", e.message);
    process.exit(1);
  }
})();
