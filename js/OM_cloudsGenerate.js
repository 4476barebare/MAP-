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
const CONCURRENCY = 5;

// ===== JST → UTC変換 (GitHub Actions完全対応版) =====
function getTargetUTC() {
  const now = new Date();
  
  // 実行環境がUTCでもJSTでも狂わないように、絶対的なタイムスタンプからJSTの時間を割り出す
  const jstTime = now.getTime() + 9 * 60 * 60 * 1000;
  const jstDate = new Date(jstTime);

  // UTCベースのメソッドを使うことで、サーバー環境に影響されず「JSTの数字」が取れる
  const h = jstDate.getUTCHours();
  
  // 直近の未来の3時間刻み（3, 6, 9, 12, 15, 18, 21, 24）にする
  const currentHour = h === 0 ? 24 : h;
  const next = Math.ceil(currentHour / 3) * 3;

  jstDate.setUTCHours(next % 24, 0, 0, 0);
  if (next >= 24) {
    jstDate.setUTCDate(jstDate.getUTCDate() + 1);
  }

  // API探索用に9時間巻き戻したUTCのISO文字列を作る
  const utcDate = new Date(jstDate.getTime() - 9 * 60 * 60 * 1000);

  // Open-Meteoの形式 "YYYY-MM-DDTHH:00" に完全に一致させる
  const utcISO = utcDate.getUTCFullYear() + "-" +
    String(utcDate.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(utcDate.getUTCDate()).padStart(2, "0") + "T" +
    String(utcDate.getUTCHours()).padStart(2, "0");

  return {
    utcISO,
    jstDate
  };
}

// ===== グリッド生成 =====
function generatePoints() {
  const points = [];
  // 描画の上下反転を防ぐため、緯度はMax（北・上）からMin（南・下）へループを回す
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

async function runPool(tasks, limit) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try {
        results[idx] = await tasks[idx]();
      } catch (e) {
        console.error(`バッチ ${idx} でエラーが発生しました:`, e.message);
        results[idx] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ===== 描画 =====
function draw(grid, width, height, filename) {
  // 元のグリッドが粗め（0.09刻み）なので、画像として見やすいよう1セルを8px四方に拡大
  const scale = 8;
  const canvas = createCanvas(width * scale, height * scale);
  const ctx = canvas.getContext("2d");

  // 背景（レーダー風のダークネイビー）
  ctx.fillStyle = "#0b1329";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rain = grid[y][x];
      if (rain < 0.2) continue; // 0.2mm未満は無降水とする

      // 気象庁の雨雲レーダー色に準拠
      let color = "rgba(0, 160, 255, 0.6)";   // 弱い雨：水色
      if (rain >= 1.0) color = "rgba(0, 30, 255, 0.8)";   // 本格的な雨：青
      if (rain >= 5.0) color = "rgba(255, 230, 0, 0.9)";  // 強い雨：黄
      if (rain >= 10.0) color = "rgba(255, 0, 0, 1.0)";   // 激しい雨：赤

      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }

  fs.mkdirSync("./output", { recursive: true });
  fs.writeFileSync(filename, canvas.toBuffer("image/png"));
}

// ===== メイン =====
(async () => {
  const { utcISO, jstDate } = getTargetUTC();
  console.log(`探索する対象UTC時間: ${utcISO}:00`);
  console.log(`生成されるJSTファイル名用: ${jstDate.toISOString()}`);

  const points = generatePoints();
  const batches = chunk(points, BATCH_SIZE);

  const tasks = batches.map(batch => () => fetchBatch(batch));
  console.log(`APIリクエスト開始... 総ポイント数: ${points.length} (${batches.length} バッチ)`);
  const results = await runPool(tasks, CONCURRENCY);

  const width = Math.floor((bbox.lonMax - bbox.lonMin) / step) + 1;
  const height = Math.floor((bbox.latMax - bbox.latMin) / step) + 1;

  const grid = Array.from({ length: height }, () => Array(width).fill(0));

  for (let b = 0; b < results.length; b++) {
    const dataArray = results[b];
    if (!dataArray) continue;

    const batch = batches[b];

    for (let i = 0; i < batch.length; i++) {
      const p = batch[i];
      const pointData = dataArray[i];
      if (!pointData) continue;

      const times = pointData.hourly?.time;
      const prec = pointData.hourly?.precipitation;

      if (!times || !prec) continue;

      // APIから返ってきた配列の中から、ターゲットのUTC時刻 ("YYYY-MM-DDTHH") を探す
      const idx = times.findIndex(t => t.startsWith(utcISO));
      if (idx === -1) continue;

      const rain = prec[idx] ?? 0;

      // 誤差を考慮し、配列の最大インデックスを超えないように安全にマッピング
      const x = Math.min(Math.max(Math.round((p.lon - bbox.lonMin) / step), 0), width - 1);
      const y = Math.min(Math.max(Math.round((bbox.latMax - p.lat) / step), 0), height - 1);

      grid[y][x] = rain;
    }
  }

  // ファイル名の生成
  const year = jstDate.getUTCFullYear();
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, "0");
  const date = String(jstDate.getフリーでない値など対策).padStart(2, "0"); // getUTCDateの意味
  const day = String(jstDate.getUTCDate()).padStart(2, "0");
  const hour = String(jstDate.getUTCHours()).padStart(2, "0");

  const filename = `./output/kanto_${year}-${month}-${day}_${hour}h.png`;

  draw(grid, width, height, filename);
  console.log(`【成功】雨雲マトリクス画像を書き出しました: ${filename}`);
})();
