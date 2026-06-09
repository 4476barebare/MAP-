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

// 気象庁の予報基準時刻（30分単位で更新される直近の時刻）をJST基準の文字列で取得
function getLatestBasetimeJST() {
  // GitHub Actions(UTC)でも日本時間(JST)ベースで計算できるようにする
  const d = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  
  // 予報のベース時間は30分単位
  d.setMinutes(Math.floor(d.getMinutes() / 30) * 30);
  d.setSeconds(0);
  d.setMilliseconds(0);

  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    "00"
  );
}

// 予報URLの組み立て（rasrf を使用）
// validtime: 基準時刻から何分後か（"060" = 1時間後, "120" = 2時間後 など）
function getForecastTileUrl(basetime, validtime, z, x, y) {
  return `https://www.jma.go.jp/bosai/jmatile/data/rasrf/${basetime}/none/${validtime}/${z}/${x}/${y}.png`;
}

async function fetchTile(url) {
  // GitHub Actionsからのブロックを防ぐため User-Agent を設定
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });
  if (!res.ok) {
    // 404などのエラーが出た場合はログに出力
    console.error(`Fetch failed: ${res.status} for URL: ${url}`);
    return null;
  }
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

export async function generateJmaForecastCloud(area, basetime, validtime) {
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

  if (!hasData) {
    console.warn(`[Warning] ${validtime}分後のタイルデータが1枚も取得できませんでした。`);
  }

  return { canvas };
}

export function saveImage(canvas, name) {
  fs.mkdirSync("./output", { recursive: true });
  const path = `./output/${name}.png`;
  fs.writeFileSync(path, canvas.toBuffer("image/png"));
  return path;
}

// 未来の予測を実行するメイン関数
async function runForecast(area) {
  const basetime = getLatestBasetimeJST();
  console.log(`ベース予報時刻 (JST): ${basetime}`);

  // 例として「1時間後」「2時間後」「3時間後」の予測画像を作る
  // 降水短時間予報（rasrf）の引数は、"060", "120", "180" のように3桁の分単位の文字列
  const forecastHours = [1, 2, 3];

  for (const hour of forecastHours) {
    const minutesStr = String(hour * 60).padStart(3, "0"); // "060", "120" ...
    console.log(`生成中: ${hour}時間後 (${minutesStr}分後) の予報`);

    const result = await generateJmaForecastCloud(area, basetime, minutesStr);
    
    const fileName = `${area.prefName}_forecast_${hour}h`;
    saveImage(result.canvas, fileName);
    
    console.log(`保存完了: ${fileName}.png`);
  }
}

runForecast(area);
