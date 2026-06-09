import fetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";

const TILE = 256;

const area = {
  prefName: "CHIBA",
  lat: 35.6,
  lng: 140.1,
  grid: { w: 150, h: 100 },
  zoom: 5 // 未来の広域予測が確実に存在するズームレベル
};

function latLngToTile(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor((lng + 180) / 360 * n);
  const y = Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
  );
  return { x, y };
}

// 確実に存在する最新の「予報作成ベース時刻（JST）」を計算
// 気象庁の3時間ごと広域予測データは、毎日 03:00 と 15:00 に一括生成されます
function getLatestOfficialBasetimeJST() {
  const d = new Date(); // Actions (TZ: Asia/Tokyo) のローカル時間
  const hour = d.getHours();

  // 配信のタイムラグを考慮し、5時を過ぎたら3時、17時を過ぎたら15時のデータをベースにする
  if (hour >= 5 && hour < 17) {
    d.setHours(3, 0, 0, 0);
  } else {
    if (hour < 5) {
      d.setDate(d.getDate() - 1); // 日付を昨日に戻す
    }
    d.setHours(15, 0, 0, 0);
  }

  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    "0000"
  );
}

// 気象庁公式の未来予測タイルURL（hrpns = 高解像度降水ナウキャスト予測層）
function getOfficialForecastTileUrl(basetime, validtime, z, x, y) {
  // 構造: /hrpns/{生成されたベース時間}/none/{見たい未来の時間}/{z}/{x}/{y}.png
  return `https://www.jma.go.jp/bosai/jmatile/data/hrpns/${basetime}/none/${validtime}/${z}/${x}/${y}.png`;
}

async function fetchTile(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) {
    // 404の場合のデバッグ用
    console.error(`Fetch failed: ${res.status} -> ${url}`);
    return null;
  }
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

export async function generateJmaOfficialForecast(area, basetime, validtime) {
  const { x, y } = latLngToTile(area.lat, area.lng, area.zoom);

  // zoom:5 なので周辺1マスで十分関東一円をカバー可能
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
      const url = getOfficialForecastTileUrl(basetime, validtime, area.zoom, tx, ty);
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
  console.log("--- 気象庁公式仕様に基づく未来予測イメージ生成 ---");
  
  const basetime = getLatestOfficialBasetimeJST();
  console.log(`データ生成ベース時刻 (JST): ${basetime}`);

  // 現在時刻から「次の3時間区切り」を起点にする
  const now = new Date();
  const currentHour = now.getHours();
  const nextTargetHour = Math.ceil((currentHour + 1) / 3) * 3;
  
  const startTime = new Date(now.getTime());
  startTime.setHours(nextTargetHour, 0, 0, 0);

  const pad = (n) => String(n).padStart(2, "0");

  // 3時間ごと、6区分（18時間分）を正確にローテーション
  for (let i = 0; i < 6; i++) {
    const targetTime = new Date(startTime.getTime() + i * 3 * 60 * 60 * 1000);
    
    // 見たい未来の時間をそのまま YYYYMMDDHH0000 形式にする
    const validtimeStr = 
      targetTime.getFullYear() +
      pad(targetTime.getMonth() + 1) +
      pad(targetTime.getDate()) +
      pad(targetTime.getHours()) +
      "0000";

    const displayHour = pad(targetTime.getHours());
    console.log(`[区分 ${i + 1}/6] 日本時間 ${displayHour}時（対象予測ターゲット: ${validtimeStr}）を生成中...`);

    const result = await generateJmaOfficialForecast(area, basetime, validtimeStr);

    if (result.hasData) {
      const fileName = `${area.prefName}_slot${i + 1}_${displayHour}h`;
      saveImage(result.canvas, fileName);
      console.log(`保存完了: ${fileName}.png`);
    } else {
      console.warn(`[Warning] ${displayHour}時の予報画像が生成できませんでした。`);
    }
  }
}

main();
