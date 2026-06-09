import fetch from "node-fetch";
import { createCanvas } from "canvas";
import fs from "fs";

// 千葉県のコード: 120000
const JMA_FORECAST_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/120000.json";

async function fetchJmaForecast() {
  const res = await fetch(JMA_FORECAST_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  if (!res.ok) throw new Error(`APIエラー: ${res.status}`);
  return await res.json();
}

function drawForecastBoard(timeSeriesData) {
  const canvas = createCanvas(600, 250);
  const ctx = canvas.getContext("2d");

  // 背景（テレビ風ダークブルー）
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 600, 250);

  try {
    const timeSeries = timeSeriesData[1].timeSeries[0]; // 3時間ごと天気
    const times = timeSeries.timePeriod;
    const weathers = timeSeries.areas[0].weathers; 
    const pops = timeSeriesData[1].timeSeries[1].areas[0].pops; // 降水確率

    const maxDisplay = Math.min(times.length, 5); // 直近5スロット（15時間分）

    for (let i = 0; i < maxDisplay; i++) {
      const x = 30 + i * 110;
      const date = new Date(times[i]);
      const hour = date.getHours();

      // --- 1. 時間のインジケーター（フォント不要の丸型） ---
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(x + 45, 40, 20, 0, Math.PI * 2);
      ctx.fill();
      
      // 中の数字の代わりに線の太さや枠で表現（簡易的に時間の位置を下にバーで補足）
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 10, 75, 70, 4);

      // --- 2. 天気予報の視覚化（文字化け対策：色ブロックで表現） ---
      const weatherText = weathers[i] || "";
      
      // テレビの天気予報カラーに準拠
      if (weatherText.includes("雨")) {
        ctx.fillStyle = "#2563eb"; // 雨：青
      } else if (weatherText.includes("曇")) {
        ctx.fillStyle = "#64748b"; // 曇：グレー
      } else {
        ctx.fillStyle = "#ea580c"; // 晴：オレンジ
      }
      // 大きなカラーブロックを配置（麻雀牌の代わりにこれで天気を識別！）
      ctx.fillRect(x + 10, 90, 70, 70);

      // --- 3. 降水確率の高さゲージ（文字を使わず、縦のメーターで表現） ---
      const pop = pops[i] !== undefined ? parseInt(pops[i]) : 0;
      
      // メーターの背景枠
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.strokeRect(x + 25, 180, 40, 40);
      
      // 確率が高いほど緑色のバーが不透明・高く塗られる
      ctx.fillStyle = `rgba(34, 197, 94, ${0.2 + (pop / 100) * 0.8})`;
      const barHeight = (pop / 100) * 40;
      ctx.fillRect(x + 25, 220 - barHeight, 40, barHeight);
    }
  } catch (err) {
    console.error("パースエラー:", err);
    // エラー時は警告として真っ赤な画面にする
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(10, 10, 580, 230);
  }

  return canvas;
}

async function main() {
  console.log("--- [フォントフリー完全版] テレビ風カラー予測ボード生成 ---");
  try {
    const data = await fetchJmaForecast();
    const canvas = drawForecastBoard(data);

    fs.mkdirSync("./output", { recursive: true });
    const path = "./output/CHIBA_3hour_forecast.png";
    fs.writeFileSync(path, canvas.toBuffer("image/png"));
    
    console.log(`【成功】文字化けなしの画像を出力しました: ${path}`);
  } catch (error) {
    console.error(`実行エラー: ${error.message}`);
  }
}

main();
