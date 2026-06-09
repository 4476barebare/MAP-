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

// 確実に存在する最新のGSM発表時刻（UTC）を計算
function getLatestGsmBasetimeDateUTC() {
  const d = new Date(); // 実行時の生の時間（中身はUTC）
  const utcHour = d.getUTCHours();
  
  // GSMのUTC発表タイミングは 00, 06, 12, 18 時の4回（配信ラグを考慮して4時間バッファ）
  let baseHourUTC = 0;
  if (utcHour >= 4 && utcHour < 10) baseHourUTC = 0;
  else if (utcHour >= 10 && utcHour < 16) baseHourUTC = 6;
  else if (utcHour >= 16 && utcHour < 22) baseHourUTC = 12;
  else {
    baseHourUTC = 18;
    if (utcHour < 4) {
      d.setUTCDate(d.getUTCDate() - 1);
    }
  }

  d.setUTCHours(baseHourUTC, 0, 0, 0);
  return d;
}

function formatDateToJMAUTC(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    "0000"
  );
}

// GSM未来予報URL
function getForecastTileUrl(basetimeStr, validtimeStr, z, x, y) {
  return `https://www.jma.go.jp/bosai/jmatile/data/gsm/${basetimeStr}/none/${validtimeStr}/${z}/${x}/${y}.png`;
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
  // すべてUTC基準でベース時刻を作成
  const basetimeDateUTC = getLatestGsmBasetimeDateUTC();
  const basetimeStrUTC = formatDateToJMAUTC(basetimeDateUTC);
  
  // ログ表示用（JST）
  const jstBaseHour = (basetimeDateUTC.getUTCHours() + 9) % 24;
  console.log(`GSMベース予報時刻 (UTC): ${basetimeStrUTC} (JSTの約 ${jstBaseHour}時発表データ)`);

  // ターゲットの開始時間を計算（次の3時間区切りのJST）
  const now = new Date();
  // 現在のJSTの時間を取得
  const currentJstHour = (now.getUTCHours() + 9) % 24;
  const nextTargetJstHour = Math.ceil((currentJstHour + 1) / 3) * 3;

  // 開始となるターゲット日時（UTCで設定）
  const startTargetDateUTC = new Date(now.getTime());
  // JSTの時間から9引いてUTCの時間を算出し、分以下は00に固定
  startTargetDateUTC.setUTCHours(nextTargetJstHour - 9, 0, 0, 0);

  const pad = (n) => String(n).padStart(2, "0");

  // 3時間ごと、6区分を処理
  for (let i = 0; i < 6; i++) {
    const targetDateUTC = new Date(startTargetDateUTC.getTime() + i * 3 * 60 * 60 * 1000);
    
    // UTCのベース時刻から、UTCのターゲット時刻までの差分（分）を計算
    const diffMs = targetDateUTC.getTime() - basetimeDateUTC.getTime();
    const diffMinutes = Math.floor(diffMs / 1000 / 60);

    const validtimeStr = String(diffMinutes);
    // 保存ファイル名用にJSTの時間を計算
    const displayJstHour = pad((targetDateUTC.getUTCHours() + 9) % 24);

    console.log(`[区分 ${i + 1}/6] 日本時間 ${displayJstHour}時（ベースUTCから ${validtimeStr} 分後）の予報を生成中...`);

    const result = await generateJmaForecastCloud(area, basetimeStrUTC, validtimeStr);

    if (result.hasData) {
      const fileName = `${area.prefName}_slot${i + 1}_${displayJstHour}h`;
      saveImage(result.canvas, fileName);
      console.log(`保存完了: ${fileName}.png`);
    } else {
      console.warn(`[Warning] JST ${displayJstHour}時（${validtimeStr}分後）のデータが取得できませんでした。`);
    }
  }
}

main();
