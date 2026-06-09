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

// 10km ≒ 0.09度
const step = 0.09;

// ===== 時刻計算 =====
function getNextBaseTime() {
  const now = new Date();
  const d = new Date(now);
  const h = d.getUTCHours();

  const next = Math.ceil(h / 3) * 3;
  d.setUTCHours(next, 0, 0, 0);

  return d;
}

// ===== グリッド生成 =====
function generateGridPoints() {
  const lats = [];
  const lons = [];

  for (let lat = bbox.latMin; lat <= bbox.latMax; lat += step) {
    lats.push(lat);
  }

  for (let lon = bbox.lonMin; lon <= bbox.lonMax; lon += step) {
    lons.push(lon);
  }

  return { lats, lons };
}

// ===== API取得（1点ずつ・まずは確実に）=====
async function fetchRain(lat, lon) {
  const url = "https://api.open-meteo.com/v1/forecast";

  const res = await axios.get(url, {
    params: {
      latitude: lat,
      longitude: lon,
      hourly: "precipitation",
      forecast_days: 1,
      timezone: "UTC"
    }
  });

  return res.data.hourly;
}

// ===== 描画 =====
function draw(grid, width, height, filename) {
  const canvas = createCanvas(width * 2, height * 2); // 2倍拡大
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
  const base = getNextBaseTime();

  const targets = Array.from({ length: 5 }, (_, i) => {
    const t = new Date(base);
    t.setUTCHours(base.getUTCHours() + i * 3);
    return t.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  });

  const { lats, lons } = generateGridPoints();

  const width = lons.length;
  const height = lats.length;

  console.log("grid:", width, height);

  // 全地点のデータ取得
  const gridData = [];

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const lat = lats[y];
      const lon = lons[x];

      try {
        const data = await fetchRain(lat, lon);

        // 対象時刻に一番近いindex
        const idx = data.time.findIndex(t =>
          targets[0].startsWith(t.slice(0, 13))
        );

        row.push(data.precipitation[idx] || 0);
      } catch (e) {
        row.push(0);
      }
    }
    gridData.push(row);
  }

  // とりあえず1枚だけ生成（まず確認）
  draw(gridData, width, height, "./output/kanto_0.png");

  console.log("done");
})();