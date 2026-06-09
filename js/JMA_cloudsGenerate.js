import fetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";

const TILE = 256;

// 千葉県周辺を綺麗に捉える座標と、確実なデータが存在するズームレベル7
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

// 気象庁のデータ更新周期（5分刻み）に合わせた最新の基準時刻（JST）を計算
function getLatestNowcBasetimeJST() {
  const d = new Date();
  // 配信ラグ（約5分）を考慮して5分前にずらし、5分刻みに丸める
  d.setMinutes(d.getMinutes() - 5);
  const min = Math.floor(d.getMinutes() / 5) * 5;
  d.setMinutes(min, 0, 0);
  return d;
}

// 【公式実績No.1】高解像度降水ナウキャスト（nowc）タイルURL構造
function getNowcTileUrl(timeStrJST, z, x, y) {
  return `https://www.jma.go.jp/bosai/jmatile/data/nowc/${timeStrJST}/none/nowc/${z}/${x}/{y}.png`;
}

async function fetchTile(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  if (!res.ok) return null; // 404（雨がない空のタイル）は安全にスキップ
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

export async function generateJmaNowcForecast(area, timeStrJST) {
  const { x, y } = latLngToTile(area.lat, area.lng, area.zoom);

  // ズーム7に合わせて周辺を描画
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
      const url = getNowcTileUrl(timeStrJST, area.zoom, tx, ty);
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
  console.log("--- [実績最優先仕様] 高解像度ナウキャスト雨雲データ生成 ---");
  
  const baseDate = getLatestNowcBasetimeJST();
  const pad = (n) => String(n).padStart(2, "0");

  // 未来の予測ステップ（5分後、15分後、30分後、45分後、60分後）の5区分
  const intervals = [5, 15, 30, 45, 60];

  for (let i = 0; i < intervals.length; i++) {
    const minutesAhead = intervals[i];
    const targetTime = new Date(baseDate.getTime() + minutesAhead * 60 * 1000);
    
    const timeStrJST = 
      targetTime.getFullYear() +
      pad(targetTime.getMonth() + 1) +
      pad(targetTime.getDate()) +
      pad(targetTime.getHours()) +
      pad(targetTime.getMinutes()) +
      "00";

    console.log(`[区分 ${i + 1}/${intervals.length}] 現在から ${minutesAhead}分後 の予測画像（対象キー: ${timeStrJST}）を生成中...`);

    const result = await generateJmaNowcForecast(area, timeStrJST);

    // ナウキャストはデータ（雨）がない場所は404を返してくる仕様のため、
    // 画像が1枚も取得できなかった場合は、真っ白（透明）な空のキャンバスをそのまま保存してActionsのコミットエラーを防ぎます
    const fileName = `${area.prefName}_slot${i + 1}_plus${minutesAhead}m`;
    saveImage(result.canvas, fileName);
    console.log(`保存完了: ${fileName}.png (データ有り: ${result.hasData})`);
  }
}

main();
