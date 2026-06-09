import fetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";

const TILE = 256;

const area = {
  prefName: "CHIBA",
  lat: 35.6,
  lng: 140.1,
  grid: { w: 150, h: 100 },
  zoom: 6 // zoom: 6 で未来データも存在することが確認できました！
};

function latLngToTile(lat, lng, z) {
  const n = 2 ** z;
  const x = Math.floor((lng + 180) / 360 * n);
  const y = Math.floor(
    (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
  );
  return { x, y };
}

// 1. 気象庁のサーバーから、今利用可能な「最新のベース時刻」と「予測分数リスト」を取得する
async function getLatestForecastMeta() {
  const res = await fetch("https://www.jma.go.jp/bosai/jmatile/data/rasrf/targetTimes.json", {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) throw new Error("気象庁のメタデータ(targetTimes.json)を取得できませんでした。");
  
  const json = await res.json();
  // 配列の先頭[0]が常に最新のデータです
  return json[0]; 
}

// 2. 正しいURL組み立て関数
function getForecastTileUrl(basetime, validtime, z, x, y) {
  // 正解は /rasrf/{basetime}/none/{validtime}/{z}/{x}/{y}.png
  return `https://www.jma.go.jp/bosai/jmatile/data/rasrf/${basetime}/none/${validtime}/${z}/${x}/${y}.png`;
}

async function fetchTile(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) return null; // 404の時はnullを返す
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

  return { canvas, hasData };
}

export function saveImage(canvas, name) {
  fs.mkdirSync("./output", { recursive: true });
  const path = `./output/${name}.png`;
  fs.writeFileSync(path, canvas.toBuffer("image/png"));
  return path;
}

// 文字列(YYYYMMDDHHmmss)をDateオブジェクトに変換（JSTとして解釈）
function parseJmaTimeToDate(timeStr) {
  const y = parseInt(timeStr.substring(0, 4));
  const m = parseInt(timeStr.substring(4, 6)) - 1;
  const d = parseInt(timeStr.substring(6, 8));
  const h = parseInt(timeStr.substring(8, 10));
  const min = parseInt(timeStr.substring(10, 12));
  
  // タイムゾーンによるブレを防ぐため、一度UTCでオブジェクトを作ってJST相当に調整
  const date = new Date(Date.UTC(y, m, d, h, min));
  date.setUTCHours(date.getUTCHours() - 9); // 日本時間として扱うためのパース
  return date;
}

async function main() {
  console.log("--- 気象庁から最新の予報スケジュールを取得中 ---");
  
  // 気象庁のデータ状況をロード
  const meta = await getLatestForecastMeta();
  const basetime = meta.basetime; // 例: "20260609022000" など
  const validtimes = meta.validtime; // 利用可能な未来の「分」の配列
  
  console.log(`最新発表ベース時刻 (JST): ${basetime}`);
  
  // ベース時刻を Date オブジェクト化
  const baseDate = parseJmaTimeToDate(basetime);

  // 現在時刻から「次の3時間区切り（0,3,6,9,12,15,18,21時）」の最初の時間を計算
  const now = new Date();
  const currentHour = now.getHours();
  const nextTargetHour = Math.ceil((currentHour + 1) / 3) * 3;
  
  const startTime = new Date(now.getTime());
  startTime.setHours(nextTargetHour, 0, 0, 0);

  const pad = (n) => String(n).padStart(2, "0");

  // 3時間ごと、6区分（18時間分）を処理
  for (let i = 0; i < 6; i++) {
    const targetTime = new Date(startTime.getTime() + i * 3 * 60 * 60 * 1000);
    
    // 予報発表ベース時刻（baseDate）から、ターゲットの未来時刻までの「必要な分数」
    const requiredDiffMinutes = Math.floor((targetTime.getTime() - baseDate.getTime()) / 1000 / 60);

    // 気象庁が提供している未来の「分リスト(validtimes)」の中から、一番近い「分」を探す
    const closestValidtime = validtimes.reduce((prev, curr) => {
      return Math.abs(parseInt(curr) - requiredDiffMinutes) < Math.abs(parseInt(prev) - requiredDiffMinutes) ? curr : prev;
    });

    const displayHour = pad(targetTime.getHours());
    console.log(`[区分 ${i + 1}/6] 日本時間 ${displayHour}時（計算上の差: ${requiredDiffMinutes}分 -> 採用する配信キー: ${closestValidtime}分後）の予報を生成中...`);

    const result = await generateJmaForecastCloud(area, basetime, closestValidtime);

    if (result.hasData) {
      const fileName = `${area.prefName}_slot${i + 1}_${displayHour}h`;
      saveImage(result.canvas, fileName);
      console.log(`保存完了: ${fileName}.png`);
    } else {
      console.warn(`[Warning] ${displayHour}時のタイル画像が1枚も取得できませんでした。`);
    }
  }
}

main();
