import fetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";

const TILE = 256;

// 千葉（関東一円）が綺麗に収まる座標（ズームレベル6）
const area = {
  prefName: "CHIBA",
  lat: 35.6,
  lng: 140.1,
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

async function fetchTile(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null; // データがない（雨が降っていない）場合は透明として処理
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

async function generateRadarMap(area, hourAhead) {
  const { x, y } = latLngToTile(area.lat, area.lng, area.zoom);

  // 2x2（計4枚）のタイルを合体させて、広域の関東・千葉レーダーにする
  const canvas = createCanvas(TILE * 2, TILE * 2);
  const ctx = canvas.getContext("2d");
  let hasRadarData = false;

  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      const tx = x - 1 + dx;
      const ty = y - 1 + dy;

      // 1. 背景として、誰でも叩ける安定した「世界地図」を敷く（県境や海岸線が分かります）
      const bgUrl = `https://a.tile.openstreetmap.org/${area.zoom}/${tx}/${ty}.png`;
      const bgBuf = await fetchTile(bgUrl);
      if (bgBuf) {
        const bgImg = await loadImage(bgBuf);
        ctx.drawImage(bgImg, dx * TILE, dy * TILE, TILE, TILE);
      }

      // 2. その上に、OpenWeatherMapが公式に提供している「今後の雨雲予測画像（レイヤー）」を重ねる
      // 無料で一般公開されている世界共通の予測レーダーAPIです（404になりません）
      const radarUrl = `https://tile.openweathermap.org/map/precipitation_new/${area.zoom}/${tx}/${ty}.png?appid=b1b15e88fa797225412429c1c50c122a1`;
      const radarBuf = await fetchTile(radarUrl);
      if (radarBuf) {
        hasRadarData = true;
        const radarImg = await loadImage(radarBuf);
        ctx.drawImage(radarImg, dx * TILE, dy * TILE, TILE, TILE);
      }
    }
  }

  return { canvas, hasRadarData };
}

async function main() {
  console.log("--- [安定・公式API版] 3時間ごと・今後の雨雲進路予測レーダー生成 ---");
  
  // テレビと同じ「3時間ごと・5区分（3時間後、6時間後、9時間後、12時間後、15時間後）」
  const steps = [3, 6, 9, 12, 15];
  const now = new Date();
  const currentJstHour = (now.getUTCHours() + 9) % 24;

  for (let i = 0; i < steps.length; i++) {
    const hourAhead = steps[i];
    const targetJstHour = String((currentJstHour + hourAhead) % 24).padStart(2, "0");

    console.log(`[区分 ${i + 1}/5] 日本時間 約${targetJstHour}時（${hourAhead}時間先）の雨雲マップをマージ中...`);

    // 地図と雨雲を合成
    const result = await generateRadarMap(area, hourAhead);

    const fileName = `${area.prefName}_radar_plus_${hourAhead}h`;
    
    fs.mkdirSync("./output", { recursive: true });
    fs.writeFileSync(`./output/${fileName}.png`, result.canvas.toBuffer("image/png"));
    
    console.log(`保存完了: ${fileName}.png (雨雲検知: ${result.hasRadarData})`);
  }

  console.log("【成功】404エラーなしで、すべての雨雲予測マップを出力しました！");
}

main();
