import fetch from "node-fetch";
import { createCanvas, registerFont } from "canvas";
import fs from "fs";
import { os } from "os";

// 千葉県の確定天気予報JSON（一番エラーが起きない超安定ルート）
const JMA_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/120000.json";

// 【文字化け対策の決定版】GitHub Actions環境でも確実に日本語を出すため、Googleからフォントを落とす
async function setupJapaneseFont() {
  const fontUrl = "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf";
  const fontPath = "./output/NotoSans-Regular.ttf";
  
  fs.mkdirSync("./output", { recursive: true });
  
  if (!fs.existsSync(fontPath)) {
    console.log("日本語フォントをダウンロード中...");
    const res = await fetch(fontUrl);
    const buf = await res.arrayBuffer();
    fs.writeFileSync(fontPath, Buffer.from(buf));
  }
  // Node-canvasにフォントを登録。これで「sans-serif」を指定すれば日本語が絶対に弾かれない！
  registerFont(fontPath, { family: "NotoSans" });
}

async function main() {
  console.log("--- [フォント動的ロード版] テレビ風・千葉県天気予報ボード生成 ---");
  
  try {
    // 1. フォントの準備
    await setupJapaneseFont();

    // 2. 気象庁からデータ取得
    const res = await fetch(JMA_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await res.json();

    // エラーの起きない最も確実な一般予報レイヤーをパース
    const reportDate = data[0].reportDatetime;
    const areaName = data[0].timeSeries[0].areas[0].area.name; // "千葉県"
    const weathers = data[0].timeSeries[0].areas[0].weathers;   // ["今日の本物の天気", "明日の本物の天気"]

    // 3. 画面の描画（横600px、縦350px）
    const canvas = createCanvas(600, 350);
    const ctx = canvas.getContext("2d");

    // 背景：きれいなテレビのスタジオ風グラデーション
    const grad = ctx.createLinearGradient(0, 0, 0, 350);
    grad.addColorStop(0, "#1e3a8a"); // 深い青
    grad.addColorStop(1, "#0f172a"); // 濃いグレー
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 350);

    // 金色の飾り枠
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 3;
    ctx.strokeRect(15, 15, 570, 320);

    // テキスト描画（フォントをきれいに適用）
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px NotoSans";
    ctx.fillText(`【テレビ風天気予報】 ${areaName} の今後の予報`, 35, 55);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px NotoSans";
    ctx.fillText(`発表時刻: ${new Date(reportDate).toLocaleString("ja-JP")}`, 35, 85);

    // 今日の天気ボックス
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(35, 110, 250, 190);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.strokeRect(35, 110, 250, 190);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 18px NotoSans";
    ctx.fillText("■ 今日一日の天気", 50, 145);

    ctx.fillStyle = "#ffffff";
    ctx.font = "15px NotoSans";
    // 長い天気テキストを綺麗に収めるために折り返し処理
    const weatherToday = weathers[0] || "データなし";
    ctx.fillText(weatherToday.substring(0, 15), 50, 190);
    if (weatherToday.length > 15) ctx.fillText(weatherToday.substring(15, 30), 50, 215);

    // 明日の天気ボックス
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(315, 110, 250, 190);
    ctx.strokeRect(315, 110, 250, 190);

    ctx.fillStyle = "#f97316";
    ctx.font = "bold 18px NotoSans";
    ctx.fillText("■ 明日の天気予測", 330, 145);

    ctx.fillStyle = "#ffffff";
    ctx.font = "15px NotoSans";
    const weatherTomorrow = weathers[1] || "データなし";
    ctx.fillText(weatherTomorrow.substring(0, 15), 330, 190);
    if (weatherTomorrow.length > 15) ctx.fillText(weatherTomorrow.substring(15, 30), 330, 215);

    // 画像書き出し
    const outputPath = "./output/CHIBA_3hour_forecast.png";
    fs.writeFileSync(outputPath, canvas.toBuffer("image/png"));
    console.log(`【完了】きれいな予報ボードを出力しました: ${outputPath}`);

  } catch (err) {
    console.error("実行エラー:", err);
  }
}

main();
