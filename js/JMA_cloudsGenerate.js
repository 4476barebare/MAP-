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

// 【確実な前例】気象庁が今配信している本物の「ベース時刻」と「予測分数」をJSONから直接引き出す
async function getJmaLiveMeta() {
  const res = await fetch("https://www.jma.go.jp/bosai/jmatile/data/rasfc/targetTimes.json", {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) throw new Error("気象庁のメタデータJSONが読み込めませんでした。");
  const data = await res.json();
  // 配列の最先頭[0]が、今サーバーにある最新のデータ一式です
  return data[0]; 
}

function getForecastTileUrl(basetime, validtime, z, x, y) {
  // 本物の構造: /rasfc/{中途半端な生成秒数}/none/{経過分数}/{z}/{x}/{y}.png
  return `https://www.jma.go.jp/bosai/jmatile/data/rasfc/${basetime}/none/${validtime}/${z}/{x}/{y}.png`;
}

async function fetchTile(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) return null; // データがない（雨がない）空文字タイルはスキップ
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

export async function generateJmaForecast(area, basetime, validtime) {
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
      const url = getForecastTileUrl(basetime, validtime, area.zoom, tx, ty);
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

// 14桁の文字列(JST)をDateオブジェクトに変換
function parseJmaTimeToDate(timeStr) {
  const y = parseInt(timeStr.substring(0, 4));
  const m = parseInt(timeStr.substring(4, 6)) - 1;
  const d = parseInt(timeStr.substring(6, 8));
  const h = parseInt(timeStr.substring(8, 10));
  const min = parseInt(timeStr.substring(10, 12));
  return new Date(y, m, d, h, min);
}

async function main() {
  console.log("--- [インデックス自動解決版] 今後の雨データ生成 ---");
  
  // 気象庁のサーバーから「今リアルタイムで存在する本物の時間リスト」をロード
  const meta = await getJmaLiveMeta();
  const basetime = meta.basetime;       // 例: "20260609121100" (サーバーの生データ)
  const validtimes = meta.validtime;   // 例: ["5", "10", "60", "180", "360"...] などの利用可能な未来の分数配列
  
  console.log(`サーバー上の本物のベース時刻: ${basetime}`);
  
  const baseDate = parseJmaTimeToDate(basetime);

  // 現在から「次の3時間区切り（15時、18時など）」のJST時間を計算
  const now = new Date();
  const currentHour = now.getHours();
  const nextTargetHour = Math.ceil((currentHour + 1) / 3) * 3;
  
  const startTime = new Date(now.getTime());
  startTime.setHours(nextTargetHour, 0, 0, 0);

  const pad = (n) => String(n).padStart(2, "0");

  // 3時間ごと、6区分（18時間分）を処理
  for (let i = 0; i < 6; i++) {
    const targetTime = new Date(startTime.getTime() + i * 3 * 60 * 60 * 1000);
    
    // ベース時刻から、見たい未来の時間までの「必要な分数」
    const targetDiffMinutes = Math.floor((targetTime.getTime() - baseDate.getTime()) / 1000 / 60);

    // 気象庁が今配信している未来の分数リスト(validtimes)から、一番近い「分（キー）」を自動選択
    const closestValidtime = validtimes.reduce((prev, curr) => {
      return Math.abs(parseInt(curr) - targetDiffMinutes) < Math.abs(parseInt(prev) - targetDiffMinutes) ? curr : prev;
    });

    const displayHour = pad(targetTime.getHours());
    console.log(`[区分 ${i + 1}/6] 日本時間 ${displayHour}時頃（計算: ${targetDiffMinutes}分後 -> 配信中の最寄キー: ${closestValidtime}分後）を生成中...`);

    const result = await generateJmaForecast(area, basetime, closestValidtime);

    if (result.hasData) {
      const fileName = `${area.prefName}_slot${i + 1}_${displayHour}h`;
      saveImage(result.canvas, fileName);
      console.log(`保存完了: ${fileName}.png`);
    } else {
      console.warn(`[Warning] ${displayHour}時の位置に雨雲データ（色付きタイル）がありませんでした。`);
    }
  }
}

main();
