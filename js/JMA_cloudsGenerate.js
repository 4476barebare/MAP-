import fetch from "node-fetch";
import { createCanvas, registerFont } from "canvas";
import fs from "fs";

const JMA_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/120000.json";

// 【修正：フォントの登録名とファイル名を完全に一致させる】
async function setupJapaneseFont() {
  // より確実な日本語専用の Noto Sans JP を取得します
  const fontUrl = "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansJP/NotoSansJP-Regular.ttf";
  const fontPath = "./output/NotoSansJP-Regular.ttf";
  
  fs.mkdirSync("./output", { recursive: true });
  
  if (!fs.existsSync(fontPath)) {
    console.log("日本語フォント(NotoSansJP)をダウンロード中...");
    const res = await fetch(fontUrl);
    const buf = await res.arrayBuffer();
    fs.writeFileSync(fontPath, Buffer.from(buf));
  }
  
  // システム内部のフォント名を「Noto Sans JP」として正しく登録
  registerFont(fontPath, { family: "Noto Sans JP" });
}

async function main() {
  console.log("--- [文字化け完全修正版] 千葉県天気予報ボード生成 ---");
  
  try {
    // 1. フォントの準備
    await setupJapaneseFont();

    // 2. 気象庁からデータ取得
    const res = await fetch(JMA_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await res.json();

    const reportDate = data[0].reportDatetime;
    const areaName = data[0].timeSeries[0].areas[0].area.name; 
    const weathers = data[0].timeSeries[0].areas[0].weathers;   

    // 3. 画面の描画
    const canvas = createCanvas(600, 350);
    const ctx = canvas.getContext("2d");

    // 背景：テレビのスタジオ風グラデーション
    const grad = ctx.createLinearGradient(0, 0, 0, 350);
    grad.addColorStop(0, "#1e3a8a"); 
    grad.addColorStop(1, "#0f172a"); 
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 350);

    // 金色の飾り枠
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 3;
    ctx.strokeRect(15, 15, 570, 320);

    // 【修正】font指定を "Noto Sans JP" に一意に統一
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 22px "Noto Sans JP"';
    ctx.fillText(`【テレビ風天気予報】 ${areaName} の今後の予報`, 35, 55);

    ctx.fillStyle = "#94a3b8";
    ctx.font = '14px "Noto Sans JP"';
    ctx.fillText(`発表時刻: ${new Date(reportDate).toLocaleString("ja-JP")}`, 35, 85);

    // 今日の天気ボックス
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(35, 110, 250, 190);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.strokeRect(35, 110, 250, 190);

    ctx.fillStyle = "#38bdf8";
    ctx.font = 'bold 18px "Noto Sans JP"';
    ctx.fillText("■ 今日一日の天気", 50, 145);

    ctx.fillStyle = "#ffffff";
    ctx.font = '15px "Noto Sans JP"';
    const weatherToday = weathers[0] || "データなし";
    ctx.fillText(weatherToday.substring(0, 15), 50, 190);
    if (weatherToday.length > 15) ctx.fillText(weatherToday.substring(15, 30), 50, 215);

    // 明日の天気ボックス
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(315, 110, 250, 190);
    ctx.strokeRect(315, 110, 250, 190);

    ctx.fillStyle = "#f97316";
    ctx.font = 'bold 18px "Noto Sans JP"';
    ctx.fillText("■ 明日の天気予測", 330, 145);

    ctx.fillStyle = "#ffffff";
    ctx.font = '15px "Noto Sans JP"';
    const weatherTomorrow = weathers[1] || "データなし";
    ctx.fillText(weatherTomorrow.substring(0, 15), 330, 190);
    if (weatherTomorrow.length > 15) ctx.fillText(weatherTomorrow.substring(15, 30), 330, 215);

    // 画像書き出し
    const outputPath = "./output/CHIBA_3hour_forecast.png";
    fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
    console.log(`【完了】麻雀牌を消滅させ、正常な画像を生成しました: ${outputPath}`);

  } catch (err) {
    console.error("実行エラー:", err);
  }
}

main();
