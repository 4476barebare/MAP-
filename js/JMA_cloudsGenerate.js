import fetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";

const TILE = 256;

// 関東エリアが綺麗に収まるズームレベル7
const area = {
  prefName: "CHIBA",
  lat: 35.6,
  lng: 140.1,
  grid: { w: 150, h: 100 },
  zoom: 7
};

function latLngToTile(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor((lng + 180) / 360 * n);
  const y = Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
  );
  return { x, y };
}

// 確実に存在する「最新の正時（00分）」のベース時刻（JST）を計算
function getLatestRasfcBasetimeJST() {
  const d = new Date();
  // 配信のラグ（約20〜30分）を考慮し、現在の分が30分未満なら「1時間前の正時」にする
  if (d.getMinutes() < 30) {
    d.setHours(d.getHours() - 1);
  }
  d.setMinutes(0, 0, 0); // 〇時00分00秒に固定

  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    "0000"
  );
}

// 【公式・テレビ予報仕様】降水短時間予報（rasfc）のURL構造
function getRasfcForecastUrl(basetimeStrJST, minutesAhead, z, x, y) {
  // 構造: /rasfc/{発表正時}/none/{経過分数}/{z}/{x}/{y}.png
  return `https://www.jma.go.jp/bosai/jmatile/data/rasfc/${basetimeStrJST}/none/${minutesAhead}/${z}/{x}/{y}.png`;
}

async function fetchTile(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  if (!res.ok) return null; // 雨が降っていない空のエリア（404）は安全にスキップ
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

export async function generateJma3HourForecast(area, basetimeStrJST, minutesAhead) {
  const { x, y } = latLngToTile(area.lat, area.lng, area.zoom);

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
      const url = getRasfcForecastUrl(basetimeStrJST, minutesAhead, area.zoom, tx, ty);
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
  console.log("--- [テレビ天気予報仕様] 3時間ごと・今後の雨雲予測生成 ---");
  
  const basetimeStrJST = getLatestRasfcBasetimeJST();
  console.log(`予報発表ベース時刻 (JST): ${basetimeStrJST}`);

  // 3時間ごと、5区分（3時間後、6時間後、9時間後、12時間後、15時間後）
  const intervals = [180, 360, 540, 720, 900];

  // ベース時刻をパースして、ログに「〇時の予報」と綺麗に出すための準備
  const baseYear = parseInt(basetimeStrJST.substring(0, 4));
  const baseMonth = parseInt(basetimeStrJST.substring(4, 6)) - 1;
  const baseDay = parseInt(basetimeStrJST.substring(6, 8));
  const baseHour = parseInt(basetimeStrJST.substring(8, 10));
  const baseDate = new Date(baseYear, baseMonth, baseDay, baseHour, 0, 0);

  const pad = (n) => String(n).padStart(2, "0");

  for (let i = 0; i < intervals.length; i++) {
    const minutesAhead = intervals[i];
    
    // 予測対象の実際の時刻を計算
    const targetDate = new Date(baseDate.getTime() + minutesAhead * 60 * 1000);
    const displayHour = pad(targetDate.getHours());

    console.log(`[区分 ${i + 1}/${intervals.length}] 日本時間 ${displayHour}時（${minutesAhead / 60}時間先）のテレビ風・雨雲予測を取得中...`);

    const result = await generateJma3HourForecast(area, basetimeStrJST, minutesAhead);

    const fileName = `${area.prefName}_slot${i + 1}_${displayHour}h`;
    saveImage(result.canvas, fileName);
    console.log(`保存完了: ${fileName}.png (雨雲データ検知: ${result.hasData})`);
  }
}

main();
