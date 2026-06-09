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

// ★チューニング
const BATCH_SIZE = 40;   // 1リクエストあたり座標数
const CONCURRENCY = 5;   // 同時リクエスト数

// ===== グリッド生成 =====
function generatePoints() {
  const points = [];

  for (let lat = bbox.latMin; lat <= bbox.latMax; lat += step) {
    for (let lon = bbox.lonMin; lon <= bbox.lonMax; lon += step) {
      points.push({ lat, lon });
    }
  }

  return points;
}

// ===== 分割 =====
function chunk(arr, size) {
  const res = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

// ===== API取得（複数点まとめ）=====
async function fetchBatch(points) {
  const url = "https://api.open-meteo.com/v1/forecast";

  const latitudes = points.map(p => p.lat).join(",");
  const longitudes = points.map(p => p.lon).join(",");

  const res = await axios.get(url, {
    params: {
      latitude: latitudes,
      longitude: longitudes,
      hourly: "precipitation",
      forecast_days: 1,
      timezone: "UTC"
    }
  });

  return res.data;
}

// ===== 並列制御 =====
async function runPool(tasks, limit) {
  const results = [];
  let i = 0;

  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: limit }, worker);
  await Promise.all(workers);

  return results;
}

// ===== 描画 =====
function draw(grid, width, height, filename) {
  const canvas = createCanvas(width * 2, height * 2);
  const ctx = canvas.getContext("2d");

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rain = grid[y][x];
      if (rain < 0.2) continue;

      let color = "rgba(100,180,255,0.5)";
      if (rain > 2) color = "rgba(0,120,255,0.7)";
      if (rain > 5) color = "rgba(255,80,0,0.8)";
      if (rain > 10) color = "rgba(255,0,0,1)";

      ctx.fillStyle = color;
      ctx.fillRect(x * 2, y * 2, 2, 2);
    }
  }

  fs.writeFileSync(filename, canvas.toBuffer("image/png"));
}

// ===== メイン =====
(async () => {
  const points = generatePoints();
  console.log("points:", points.length);

  const batches = chunk(points, BATCH_SIZE);

  const tasks = batches.map(batch => async () => {
    try {
      return await fetchBatch(batch);
    } catch (e) {
      return null;
    }
  });

  const results = await runPool(tasks, CONCURRENCY);

  // ===== グリッド復元 =====
  const width = Math.floor((bbox.lonMax - bbox.lonMin) / step) + 1;
  const height = Math.floor((bbox.latMax - bbox.latMin) / step) + 1;

  const grid = Array.from({ length: height }, () =>
    Array(width).fill(0)
  );

  let idx = 0;

  for (let b = 0; b < results.length; b++) {
    const data = results[b];
    if (!data) continue;

    const batch = batches[b];

    for (let i = 0; i < batch.length; i++) {
      const p = batch[i];

      const x = Math.round((p.lon - bbox.lonMin) / step);
      const y = Math.round((p.lat - bbox.latMin) / step);

      const rain =
        data.hourly?.precipitation?.[0]?.[0] ??
        data.hourly?.precipitation?.[0] ??
        0;

      grid[y][x] = rain;
      idx++;
    }
  }

  draw(grid, width, height, "./output/kanto_fast.png");

  console.log("done");
})();