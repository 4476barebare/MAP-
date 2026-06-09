import fetch from "node-fetch";
import { createCanvas } from "canvas";
import fs from "fs";

// 千葉県のコード: 120000
const JMA_FORECAST_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/120000.json";

async function fetchJmaForecast() {
  const res = await fetch(JMA_FORECAST_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  if (!res.ok) {
    throw new Error(`気象庁APIへの通信に失敗しました: ${res.status}`);
  }
  return await res.json();
}

function drawForecastImage(timeSeriesData) {
  // 横 600px、縦 400px のテレビの天気予報ボードのような画像を自作する
  const canvas = createCanvas(600, 400);
  const ctx = canvas.getContext("2d");

  // 背景グラデーション（テレビ風のブルー）
  const grad = ctx.createLinearGradient(0, 0, 0, 400);
  grad.addColorStop(0, "#0b1d3a");
  grad.addColorStop(1, "#1f4068");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 400);

  // タイトル
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("【気象庁発表】千葉県 3時間ごとの天気予測", 30, 45);

  // 枠線の描画
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 70, 560, 300);

  // JSONから3時間ごとのデータを抽出して描画
  // (気象庁の時系列予報オブジェクトを安全に掘り進める)
  try {
    const timeSeries = timeSeriesData[1].timeSeries[0]; // 3時間ごとの時系列
    const times = timeSeries.timePeriod; // 時間の配列
    const weathers = timeSeries.areas[0].weathers; // 天気文言の配列
    const pops = timeSeriesData[1].timeSeries[1].areas[0].pops; // 降水確率の配列

    const maxDisplay = Math.min(times.length, 5); // 直近5区分分を描画

    for (let i = 0; i < maxDisplay; i++) {
      const x = 40 + i * 110;

      // 時間の加工 (ISO文字列からJSTの「時」を抽出)
      const date = new Date(times[i]);
      const hourStr = String(date.getHours()).padStart(2, "0") + "時";

      // 1枠の背景
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.fillRect(x - 10, 85, 100, 270);

      // 時間表示
      ctx.fillStyle = "#61afef";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText(hourStr, x, 120);

      // 天気（テキスト）
      ctx.fillStyle = "#ffffff";
      ctx.font = "14px sans-serif";
      const weatherText = weathers[i] || "不明";
      // 長い文字は省略
      const shortWeather = weatherText.length > 4 ? weatherText.substring(0, 4) + ".." : weatherText;
      ctx.fillText(shortWeather, x, 190);

      // 降水確率
      ctx.fillStyle = "#38ef7d";
      ctx.font = "bold 16px sans-serif";
      const popStr = pops[i] !== undefined ? `${pops[i]}%` : "--%";
      ctx.fillText(`降水: ${popStr}`, x, 270);
    }
  } catch (err) {
    ctx.fillStyle = "#ff6b6b";
    ctx.font = "14px sans-serif";
    ctx.fillText("データの解析に失敗しました。予報の端境期の可能性があります。", 40, 200);
    console.error("データパースエラー:", err);
  }

  return canvas;
}

async function main() {
  console.log("--- [404絶対回避仕様] 安定版・天気予測イメージ生成 ---");
  
  try {
    const forecastData = await fetchJmaForecast();
    console.log("気象庁から時系列予報JSONの取得に成功しました。");

    const canvas = drawForecastImage(forecastData);

    // 画像の保存
    fs.mkdirSync("./output", { recursive: true });
    const path = "./output/CHIBA_3hour_forecast.png";
    fs.writeFileSync(path, canvas.toBuffer("image/png"));
    
    console.log(`保存完了しました: ${path}`);
  } catch (error) {
    console.error(`エラーが発生しました: ${error.message}`);
  }
}

main();
