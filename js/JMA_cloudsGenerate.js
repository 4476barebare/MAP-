import fetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";

const TILE = 256;

const area = {
  prefName: "CHIBA",
  lat: 35.6,
  lng: 140.1,
  grid: { w: 150, h: 100 },
  zoom: 6
};

function latLngToTile(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor((lng + 180) / 360 * n);
  const y = Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
  );
  return { x, y };
}

// 実行時から「次の3時間区切り」から始まる、6区分（3時間ごと）のJST日時リストを生成
function getForecastTimesJST() {
  const times = [];
  const d = new Date(); // Actions環境では TZ: Asia/Tokyo が効いている前提

  // 現在の時から、次の3時間区切り（0, 3, 6, 9, 12, 15, 18, 21）を計算
  const currentHour = d.getHours();
  const nextTargetHour = Math.ceil((currentHour + 1) / 3) * 3;
  
  // 開始時間にセット（分・秒は00）
  d.setHours(nextTargetHour, 0, 0, 0);

  const pad = (n) => String(n).padStart(2, "0");

  // 3時間ごと、6区分（18時間分）の時間を配列に入れる
  for (let i = 0; i < 6; i++) {
    const targetDate = new Date(d.getTime() + i * 3 * 60 * 60 * 1000);
    const timeStr = 
      targetDate.getFullYear() +
      pad(targetDate.getMonth() + 1) +
      pad(targetDate.getDate()) +
      pad(targetDate.getHours()) +
      "0000";
    times.push(timeStr);
  }

  return times;
}

// 3時間ごとの未来予報URL（validtime自体が YYYYMMDDHH0000 になる）
function get3HourForecastTileUrl(validtime, z, x, y) {
  // 3時間予報などの広域未来予測データは、通常「none」の後に有効時間（予測時間）が入ります
  return `https://www.jma.go.jp/bosai/jmatile/data/rasrf/none/none/${validtime}/${z}/${x}/${y}.png`;
}

async function fetchTile(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });
  if (!res.ok) {
    // 404の時はログを出してスキップできるようにする
    console.error(`Fetch failed: ${res.status} -> ${url}`);
    return null;
  }
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

export async function generateJma3HourForecast(area, validtime) {
  const { x, y } = latLngToTile(area.lat, area.lng, area.zoom);

  const rangeX = Math.ceil(area.grid.w / 2 / 50);
  const rangeY = Math.ceil(area.grid.h / 2 / 50);

  const xMin = x - rangeX;
  const xMax = x + rangeX;
  const yMin = y - rangeY;
  const yMax = y + rangeY;

  const canvas = createCanvas((xMax - xMin + 1) * TILE, (yMax - yMin + 1) * TILE);
  const ctx = canvas.getContext("2d");

  let hasData = false;

  for (let tx = xMin; tx <= xMax; tx++) {
    for (let ty = yMin; ty <= yMax; ty++) {
      const url = get3HourForecastTileUrl(validtime, area.zoom, tx, ty);
      const buf = await fetchTile(url);
      if (!buf) continue;

      hasData = true;
      const img = await loadImage(buf);
      ctx.drawImage(img, (tx - xMin) * TILE, (ty - yMin) * TILE, TILE, TILE);
    }
  }

  return { canvas, hasData };
}

export function saveImage(canvas, name) {
  fs.mkdirSync("./output", { recursive: true });
  const path = `./output/${name}.png`;
  fs.writeFileSync(path, canvas.toBuffer("image/png"));
  return path;
}

async function main() {
  const targetTimes = getForecastTimesJST();
  console.log("取得対象の予報時刻リスト (JST):", targetTimes);

  for (let i = 0; i < targetTimes.length; i++) {
    const validtime = targetTimes[i];
    const displayHour = validtime.substring(8, 10);
    console.log(`[区分 ${i + 1}/6] ${displayHour}時（対象時刻: ${validtime}）の予報を生成中...`);

    const result = await generateJma3HourForecast(area, validtime);

    if (result.hasData) {
      // ファイル名は CHIBA_1_12h.png のように「何番目の区分か」と「対象の時刻」がわかるように
      const fileName = `${area.prefName}_slot${i + 1}_${displayHour}h`;
      saveImage(result.canvas, fileName);
      console.log(`保存完了: ${fileName}.png`);
    } else {
      console.warn(`[Warning] ${displayHour}時のデータがないため、画像をスキップしました。`);
    }
  }
}

main();
