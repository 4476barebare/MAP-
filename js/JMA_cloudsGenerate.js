import fetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";

const TILE = 256;

const area = {
  prefName: "CHIBA",
  lat: 35.6,
  lng: 140.1,
  grid: { w: 150, h: 100 },
  // 未来予測データが確実に存在するズームレベル5に設定
  zoom: 5 
};

function latLngToTile(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor((lng + 180) / 360 * n);
  const y = Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
  );
  return { x, y };
}

// 完全に正しい気象庁の未来予測タイルURL構造
// 欲しい予報時刻（YYYYMMDDHH0000）をそのままリクエストします
function getForecastTileUrl(targetTimeStr, z, x, y) {
  return `https://www.jma.go.jp/bosai/jmatile/data/rasrf/${targetTimeStr}/none/none/${z}/${x}/${y}.png`;
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

export async function generateJmaForecastCloud(area, targetTimeStr) {
  // zoom: 5 に応じた X, Y 座標を自動計算
  const { x, y } = latLngToTile(area.lat, area.lng, area.zoom);

  // ズームレベル5に合わせた周辺タイルの描画範囲
  const rangeX = 1;
  const rangeY = 1;

  const xMin = x - rangeX;
  const xMax = x + rangeX;
  const yMin = y - rangeY;
  const yMax = y + rangeY;

  const canvas = createCanvas((xMax - xMin + 1) * TILE, (yMax - yMin + 1) * TILE);
  const ctx = canvas.getContext("2d");

  let hasData = false;

  for (let tx = xMin; tx <= xMax; tx++) {
    for (let ty = yMin; ty <= yMax; ty++) {
      const url = getForecastTileUrl(targetTimeStr, area.zoom, tx, ty);
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
  console.log("--- 未来の雨雲予測イメージ生成を開始します ---");

  // 現在のJST時刻をベースに「次の3時間区切り」を計算
  const now = new Date();
  const currentHour = now.getHours();
  const nextTargetHour = Math.ceil((currentHour + 1) / 3) * 3;
  
  const startTime = new Date(now.getTime());
  startTime.setHours(nextTargetHour, 0, 0, 0);

  const pad = (n) => String(n).padStart(2, "0");

  // 3時間ごと、6区分（18時間先まで）をループ処理
  for (let i = 0; i < 6; i++) {
    const targetTime = new Date(startTime.getTime() + i * 3 * 60 * 60 * 1000);
    
    // 気象庁のURLに渡す文字列を作成（例: 20260609150000）
    const targetTimeStr = 
      targetTime.getFullYear() +
      pad(targetTime.getMonth() + 1) +
      pad(targetTime.getDate()) +
      pad(targetTime.getHours()) +
      "0000";

    const displayHour = pad(targetTime.getHours());
    console.log(`[区分 ${i + 1}/6] 日本時間 ${displayHour}時（対象URLキー: ${targetTimeStr}）の予報を生成中...`);

    const result = await generateJmaForecastCloud(area, targetTimeStr);

    if (result.hasData) {
      const fileName = `${area.prefName}_slot${i + 1}_${displayHour}h`;
      saveImage(result.canvas, fileName);
      console.log(`保存完了: ${fileName}.png`);
    } else {
      console.warn(`[Warning] JST ${displayHour}時のデータが取得できませんでした。`);
    }
  }
}

main();
