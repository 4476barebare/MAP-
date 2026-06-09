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

// 【公式確定】今利用可能な最新の「今後の雨」のベース時刻と予測ステップを取得
async function getJmaLiveMeta() {
  // 気象庁公式HPが実際にインデックス取得に使っている正確なエンドポイント
  const url = "https://www.jma.go.jp/bosai/jmatile/data/rasfc/targetTimes.json";
  
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  
  if (!res.ok) {
    throw new Error(`気象庁メタデータ取得失敗: ${res.status} -> ${url}`);
  }
  
  const data = await res.json();
  // 最も新しい予報[0]を返す
  return data[0];
}

function getForecastTileUrl(basetime, validtime, z, x, y) {
  return `https://www.jma.go.jp/bosai/jmatile/data/rasfc/${basetime}/none/${validtime}/${z}/${x}/${y}.png`;
}

async function fetchTile(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) return null; // 404（雨がない・空）の場合はスキップ
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

// 14桁の文字列(JST/UTC混在回避)を確実なエポックミリ秒に変換
function parseJmaTimeToMs(timeStr) {
  const y = parseInt(timeStr.substring(0, 4));
  const m = parseInt(timeStr.substring(4, 6)) - 1;
  const d = parseInt(timeStr.substring(6, 8));
  const h = parseInt(timeStr.substring(8, 10));
  const min = parseInt(timeStr.substring(10, 12));
  // タイムゾーンのブレをなくすためUTCとして計算
  return Date.UTC(y, m, d, h, min);
}

async function main() {
  console.log("--- [インデックス自動解決版] 今後の雨データ生成 ---");
  
  let meta;
  try {
    meta = await getJmaLiveMeta();
  } catch (e) {
    console.error(e.message);
    return;
  }

  const basetime = meta.basetime;
  // validtimeが配列か単一文字列か不明なため、一律で配列にキャストしてセーフティをかける
  const validtimes = Array.isArray(meta.validtime) ? meta.validtime : [meta.validtime];
  
  console.log(`サーバー上の最新ベース時刻: ${basetime}`);
  const baseMs = parseJmaTimeToMs(basetime);

  // 現在の次の3時間区切りのJST
  const now = new Date();
  const currentHour = now.getHours();
  const nextTargetHour = Math.ceil((currentHour + 1) / 3) * 3;
  
  const startTime = new Date(now.getTime());
  startTime.setHours(nextTargetHour, 0, 0, 0);

  const pad = (n) => String(n).padStart(2, "0");

  for (let i = 0; i < 6; i++) {
    const targetTime = new Date(startTime.getTime() + i * 3 * 60 * 60 * 1000);
    
    // ターゲット時間までの必要分数（UTCベースでの差分）
    const targetTimeMs = Date.UTC(
      targetTime.getFullYear(),
      targetTime.getMonth(),
      targetTime.getDate(),
      targetTime.getHours(),
      targetTime.getMinutes()
    );
    const targetDiffMinutes = Math.floor((targetTimeMs - baseMs) / 1000 / 60);

    // 有効な分数リストから一番近いものを安全に選択
    let closestValidtime = validtimes[0];
    let minDiff = Math.abs(parseInt(closestValidtime) - targetDiffMinutes);

    for (const vt of validtimes) {
      const diff = Math.abs(parseInt(vt) - targetDiffMinutes);
      if (diff < minDiff) {
        minDiff = diff;
        closestValidtime = vt;
      }
    }

    const displayHour = pad(targetTime.getHours());
    console.log(`[区分 ${i + 1}/6] 日本時間 ${displayHour}時頃 (計算上の差: ${targetDiffMinutes}分 -> 配信中の最寄キー: ${closestValidtime}分後) を生成中...`);

    const result = await generateJmaForecast(area, basetime, closestValidtime);

    if (result.hasData) {
      const fileName = `${area.prefName}_slot${i + 1}_${displayHour}h`;
      saveImage(result.canvas, fileName);
      console.log(`保存完了: ${fileName}.png`);
    } else {
      console.warn(`[Warning] ${displayHour}時の位置に色付きの雨雲データがありませんでした。`);
    }
  }
}

main();
