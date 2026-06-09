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

// 確実に存在する最新の予報発表時刻（JST）を取得（1時間前の正時）
function getLatestBasetimeDate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - 45); // 反映ラグ考慮
  d.setMinutes(0, 0, 0);
  return d;
}

function formatDateToJMA(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    "0000"
  );
}

// 正しい未来予報URL（basetime は最新の発表時、validtime はそこからの総経過分数）
function getForecastTileUrl(basetimeStr, validtimeStr, z, x, y) {
  return `https://www.jma.go.jp/bosai/jmatile/data/rasrf/${basetimeStr}/none/${validtimeStr}/${z}/${x}/${y}.png`;
}

async function fetchTile(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });
  if (!res.ok) {
    console.error(`Fetch failed: ${res.status} -> ${url}`);
    return null;
  }
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

export async function generateJmaForecastCloud(area, basetimeStr, validtimeStr) {
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
      const url = getForecastTileUrl(basetimeStr, validtimeStr, area.zoom, tx, ty);
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
  const basetimeDate = getLatestBasetimeDate();
  const basetimeStr = formatDateToJMA(basetimeDate);
  console.log(`ベース予報時刻 (JST): ${basetimeStr}`);

  // 現在時刻から「次の3時間区切り」の時間を計算
  const now = new Date();
  const currentHour = now.getHours();
  const nextTargetHour = Math.ceil((currentHour + 1) / 3) * 3;
  
  const startTime = new Date(now.getTime());
  startTime.setHours(nextTargetHour, 0, 0, 0);

  const pad = (n) => String(n).padStart(2, "0");

  // 3時間ごと、6区分を処理
  for (let i = 0; i < 6; i++) {
    const targetTime = new Date(startTime.getTime() + i * 3 * 60 * 60 * 1000);
    
    // ベース時刻（予報発表時間）から、ターゲット時刻（未来）までの差分（分）を計算
    const diffMs = targetTime.getTime() - basetimeDate.getTime();
    const diffMinutes = Math.floor(diffMs / 1000 / 60);

    // 気象庁URL用のパラメータ（例: "180", "360"）
    const validtimeStr = String(diffMinutes);
    const displayHour = pad(targetTime.getHours());

    console.log(`[区分 ${i + 1}/6] ${displayHour}時（ベースから ${validtimeStr} 分後）の予報を生成中...`);

    const result = await generateJmaForecastCloud(area, basetimeStr, validtimeStr);

    if (result.hasData) {
      const fileName = `${area.prefName}_slot${i + 1}_${displayHour}h`;
      saveImage(result.canvas, fileName);
      console.log(`保存完了: ${fileName}.png`);
    } else {
      console.warn(`[Warning] ${displayHour}時（${validtimeStr}分後）のデータが取得できませんでした。`);
    }
  }
}

main();
