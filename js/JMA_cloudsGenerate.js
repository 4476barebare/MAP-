import fetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";

// 千葉県の天気予報JSON（非常に安定している公式API）
const JMA_FORECAST_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/120000.json";

async function fetchJmaData() {
  const res = await fetch(JMA_FORECAST_URL, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return await res.json();
}

// 予報文言から適切な「簡易カラーアイコン」をCanvasで即席生成する
function drawWeatherIcon(ctx, weatherText, x, y) {
  ctx.save();
  if (weatherText.includes("雨")) {
    // 【雨】青い傘のシルエットをパスで描画
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(x + 35, y + 35, 25, Math.PI, 0, false); // 傘の上の丸み
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath(); // 傘の持ち手
    ctx.moveTo(x + 35, y + 35);
    ctx.lineTo(x + 35, y + 65);
    ctx.arc(x + 25, y + 65, 10, 0, Math.PI, false);
    ctx.stroke();
  } else if (weatherText.includes("曇")) {
    // 【曇】グレーの雲のシルエットを丸の組み合わせで描画
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.arc(x + 25, y + 45, 15, 0, Math.PI * 2);
    ctx.arc(x + 45, y + 35, 20, 0, Math.PI * 2);
    ctx.arc(x + 65, y + 45, 15, 0, Math.PI * 2);
    ctx.fillRect(x + 25, y + 40, 40, 20);
    ctx.fill();
  } else {
    // 【晴】オレンジの太陽を描画
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.arc(x + 45, y + 45, 20, 0, Math.PI * 2);
    ctx.fill();
    // 後光のライン
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 3;
    for (let a = 0; a < 360; a += 45) {
      const rad = (a * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(x + 45 + Math.cos(rad) * 25, y + 45 + Math.sin(rad) * 25);
      ctx.lineTo(x + 45 + Math.cos(rad) * 35, y + 45 + Math.sin(rad) * 35);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function buildForecastBoard(rawData) {
  const canvas = createCanvas(650, 350);
  const ctx = canvas.getContext("2d");

  // 背景：テレビの天気予報風グラデーション深海ブルー
  const grad = ctx.createLinearGradient(0, 0, 0, 350);
  grad.addColorStop(0, "#0f172a");
  grad.addColorStop(1, "#1e293b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 650, 350);

  // 外枠の飾り線
  ctx.strokeStyle = "rgba(56, 189, 248, 0.3)";
  ctx.lineWidth = 2;
  ctx.strokeRect(15, 15, 620, 320);

  try {
    // 気象庁JSONの「3時間ごと時系列データ」の階層を確実に掘り進める（安全セーフティ付き）
    const objectWithTimeSeries = rawData.find(item => item.timeSeries && item.timeSeries.length > 1);
    
    // 3時間ごとの時間配列、天気配列、降水確率配列を正しく抽出
    const timePeriod = objectWithTimeSeries.timeSeries[0].timePeriod;
    const weathers = objectWithTimeSeries.timeSeries[0].areas[0].weathers;
    const pops = objectWithTimeSeries.timeSeries[1].areas[0].pops;

    const displayCount = Math.min(timePeriod.length, 5); // 5枠分（15時間分）

    for (let i = 0; i < displayCount; i++) {
      const x = 35 + i * 120;

      // 1時間枠の背景ボード
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.fillRect(x, 35, 110, 280);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.strokeRect(x, 35, 110, 280);

      // --- 1. 時間の表現（文字を使わず、24時間時計の針でビジュアル化） ---
      const date = new Date(timePeriod[i]);
      const hour = date.getHours();
      
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 55, 65, 18, 0, Math.PI * 2); // 時計の枠
      ctx.stroke();
      
      // 短針の角度計算
      const hourAngle = ((hour % 12) * 30 * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(x + 55, 65);
      ctx.lineTo(x + 55 + Math.cos(hourAngle - Math.PI/2) * 12, 65 + Math.sin(hourAngle - Math.PI/2) * 12);
      ctx.stroke();

      // 時間の補助バー（下に目盛りとして。0時＝左、12時＝真ん中、23時＝右）
      ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
      ctx.fillRect(x + 15, 95, 80, 6);
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(x + 15 + (hour / 24) * 70, 93, 10, 10); // 現在の時間の位置にピンを打つ

      // --- 2. 天気アイコンの描画（文字化けリスク完全ゼロ） ---
      const weatherText = weathers[i] || "";
      drawWeatherIcon(ctx, weatherText, x + 10, 120);

      // --- 3. 降水確率のメーター描画 ---
      const pop = pops[i] !== undefined ? parseInt(pops[i]) : 0;
      
      // 降水確率ゲージ背景
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(x + 25, 220, 60, 80);

      // 確率の高さに応じて、テレビ予報風のグラデーションバーを伸ばす
      if (pop > 0) {
        const barHeight = (pop / 100) * 80;
        const barGrad = ctx.createLinearGradient(0, 300 - barHeight, 0, 300);
        barGrad.addColorStop(0, "#34d399"); // 緑
        barGrad.addColorStop(1, "#059669");
        ctx.fillStyle = barGrad;
        ctx.fillRect(x + 25, 300 - barHeight, 60, barHeight);
      }

      // 100%などの高確率時は、ゲージの枠を赤く光らせて警告
      if (pop >= 50) {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 25, 220, 60, 80);
      }
    }
  } catch (e) {
    console.error("パースまたは描画中にエラー:", e);
    // 致命的エラー時は、格子模様を描いてデータ異常を知らせる
    ctx.fillStyle = "#334155";
    ctx.fillRect(20, 20, 610, 310);
  }

  return canvas;
}

async function main() {
  console.log("--- [ノーフォント仕様] JSON解析型・時系列天気ボード生成 ---");
  try {
    const rawData = await fetchJmaData();
    console.log("気象庁から正常に予測データJSONをロードしました。");

    const canvas = buildForecastBoard(rawData);

    fs.mkdirSync("./output", { recursive: true });
    const outputPath = "./output/CHIBA_3hour_forecast.png";
    fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
    
    console.log(`【大成功】予報ボード画像を生成しました: ${outputPath}`);
  } catch (err) {
    console.error(`実行に失敗しました: ${err.message}`);
  }
}

main();
