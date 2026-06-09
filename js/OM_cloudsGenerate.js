import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

// ===== 設定 =====
const bbox = {
  latMin: 34.8,
  latMax: 37.2,
  lonMin: 138.5,
  lonMax: 141.2
};

const step = 0.09;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ===== JST → UTC変換（システムの誤作動を100%回避する新ロジック） =====
function getTargetUTCClean() {
  const now = new Date();
  
  // 3時間刻みの切り上げ計算
  const currentJstHour = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 13) * 1;
  const nextJstHour = Math.ceil((currentJstHour === 0 ? 24 : currentJstHour) / 3) * 3;
  
  // ターゲットとなるJSTのベース時刻を作成
  const targetJst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  targetJst.setUTCHours(nextJstHour % 24, 0, 0, 0);
  if (nextJstHour >= 24) {
    targetJst.setTime(targetJst.getTime() + 24 * 60 * 60 * 1000);
  }
  
  // そこから9時間引いてUTCを確定
  const targetUtc = new Date(targetJst.getTime() - 9 * 60 * 60 * 1000);
  
  // API比較用の文字列 (YYYY-MM-DDTHH)
  const utcISO = targetUtc.toISOString().slice(0, 13);

  return {
    utcISO: utcISO,
    jstDate: targetJst
  };
}

// ===== グリッド生成 =====
function generatePoints() {
  const points = [];
  for (let lat = bbox.latMax; lat >= bbox.latMin; lat -= step) {
    for (let lon = bbox.lonMin; lon <= bbox.lonMax; lon += step) {
      points.push({ lat, lon });
    }
  }
  return points;
}

// 2分割
function splitIntoTwo(arr) {
  const half = Math.ceil(arr.length / 2);
  return [arr.slice(0, half), arr.slice(half)];
}

// ===== API取得 =====
async function fetchHalfBatch(points) {
  const url = "https://api.open-meteo.com/v1/forecast";
  const latitudes = points.map(p => p.lat.toFixed(4)).join(",");
  const longitudes = points.map(p => p.lon.toFixed(4)).join(",");

  const res = await axios.get(url, {
    params: {
      latitude: latitudes,
      longitude: longitudes,
      hourly: "precipitation",
      forecast_days: 1,
      timezone: "UTC"
    },
    timeout: 20000
  });

  return Array.isArray(res.data) ? res.data : [res.data];
}

// ===== 描画 =====
function draw(grid, width, height, filename) {
  const scale = 8;
  const canvas = createCanvas(width * scale, height * scale);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0b1329";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rain = grid[y][x];
      
      if (rain < 0.2) continue; 

      // あなたのオリジナルのカラーパレット
      let color = "rgba(100,180,255,0.5)"; 
      if (rain > 2) color = "rgba(0,120,255,0.7)";  
      if (rain > 5) color = "rgba(255,80,0,0.8)";   
      if (rain > 10) color = "rgba(255,0,0,1)";     

      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }

  fs.mkdirSync("./output", { recursive: true });
  fs.writeFileSync(filename, canvas.toBuffer("image/png"));
}

// ===== メイン =====
(async () => {
  const { utcISO, jstDate } = getTargetUTCClean();
  console.log(`探索する対象UTC時間: ${utcISO}:00`);

  const points = generatePoints();
  const halves = splitIntoTwo(points);

  const width = Math.floor((bbox.lonMax - bbox.lonMin) / step) + 1;
  const height = Math.floor((bbox.latMax - bbox.latMin) / step) + 1;
  const grid = Array.from({ length: height }, () => Array(width).fill(0));

  console.log(`APIリクエスト開始... 総ポイント数: ${points.length} (安全2分割ルート)`);

  try {
    for (let h = 0; h < halves.length; h++) {
      const subBatch = halves[h];
      console.log(`-> 分割リクエスト中... (${h + 1}/2)`);
      
      const dataArray = await fetchHalfBatch(subBatch);

      for (let i = 0; i < subBatch.length; i++) {
        const p = subBatch[i];
        const pointData = dataArray[i];
        if (!pointData) continue;

        const times = pointData.hourly?.time;
        const prec = pointData.hourly?.precipitation;

        if (!times || !prec) continue;

        const idx = times.findIndex(t => t.startsWith(utcISO));
        if (idx === -1) continue;

        const rain = prec[idx] ?? 0;

        const x = Math.min(Math.max(Math.round((p.lon - bbox.lonMin) / step), 0), width - 1);
        const y = Math.min(Math.max(Math.round((bbox.latMax - p.lat) / step), 0), height - 1);

        grid[y][x] = rain;
      }

      if (h === 0) {
        await sleep(1500);
      }
    }

    // ファイル名生成（誤作動するメソッドを徹底排除したクリーンな実装）
    const jstISO = jstDate.toISOString(); // "YYYY-MM-DDTHH:mm:ss..." の形を取得
    const datePart = jstISO.slice(0, 10);  // "YYYY-MM-DD" を切り出し
    const hourPart = jstISO.slice(11, 13); // "HH" を切り出し
    
    const filename = `./output/kanto_${datePart}_${hourPart}h.png`;

    draw(grid, width, height, filename);
    console.log(`【完全大成功】正常に画像を書き出しました: ${filename}`);

  } catch (e) {
    console.error("データ取得または描画中にエラーが発生しました:", e.message);
    process.exit(1);
  }
})();
