import axios from "axios";
import fs from "fs";
import { createCanvas } from "canvas";

// ==========================================
// 👑 エリア別プロファイル定義
// ==========================================
const AREA_PROFILES = {
  chiba: {
    prefname: "chiba",
    latMin: 34.7,
    latMax: 36.0,
    lonMin: 139.6,
    lonMax: 141.1,
    step: 0.1,    // 千葉専用のデータ粒度
    zoom: 9       // 千葉専用のLeafletズームレベル
  },
  tokyo: {
    prefname: "tokyo",
    latMin: 35.5,
    latMax: 35.9,
    lonMin: 138.9,
    lonMax: 139.9,
    step: 0.05,   // 東京は狭いので細かく
    zoom: 10      // ズームレベルも高めに
  },
  kanto_all: {
    prefname: "kanto",
    latMin: 34.0,
    latMax: 38.0,
    lonMin: 138.0,
    lonMax: 142.0,
    step: 0.15,   // 関東全域はActions節約のため粗め
    zoom: 7       // 広域なのでズームは低め
  }
};

// ★現在アクティブにするエリアを指定（ここを切り替えるだけで設定が全同期します）
const activeArea = AREA_PROFILES.chiba;

// 設定の展開
const bbox = activeArea;
const step = activeArea.step;
const ZOOM = activeArea.zoom;

// 429エラー回避用のウェイト（1.5秒に短縮）
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ===== 緯度経度をWebメルカトルの絶対ピクセル座標に変換 =====
function latLonToPixel(lat, lon, zoom) {
  const size = 256 * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * size;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size;
  return { x, y };
}

// ===== JST → UTC変換 =====
function getTargetUTCClean() {
  const now = new Date();
  const currentJstHour = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 13) * 1;
  const nextJstHour = Math.ceil((currentJstHour === 0 ? 24 : currentJstHour) / 3) * 3;
  
  const targetJst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  targetJst.setUTCHours(nextJstHour % 24, 0, 0, 0);
  if (nextJstHour >= 24) {
    targetJst.setTime(targetJst.getTime() + 24 * 60 * 60 * 1000);
  }
  
  const targetUtc = new Date(targetJst.getTime() - 9 * 60 * 60 * 1000);
  return { utcISO: targetUtc.toISOString().slice(0, 13), jstDate: targetJst };
}

// ===== グリッド生成 =====
function generatePoints() {
  const points = [];
  // 浮動小数点の演算誤差を防ぐため100倍して細かく制御
  const latMinInt = Math.round(bbox.latMin * 100);
  const latMaxInt = Math.round(bbox.latMax * 100);
  const lonMinInt = Math.round(bbox.lonMin * 100);
  const lonMaxInt = Math.round(bbox.lonMax * 100);
  const stepInt = Math.round(step * 100);

  for (let lat = latMaxInt; lat >= latMinInt; lat -= stepInt) {
    for (let lon = lonMinInt; lon <= lonMaxInt; lon += stepInt) {
      points.push({ lat: lat / 100, lon: lon / 100 });
    }
  }
  return points;
}

// 保守された4分割ロジック
function splitIntoFour(arr) {
  const chunkSize = Math.ceil(arr.length / 4);
  return [
    arr.slice(0, chunkSize),
    arr.slice(chunkSize, chunkSize * 2),
    arr.slice(chunkSize * 2, chunkSize * 3),
    arr.slice(chunkSize * 3)
  ];
}

// ===== API取得 =====
async function fetchQuarterBatch(points) {
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

// ===== メイン =====
(async () => {
  const { utcISO, jstDate } = getTargetUTCClean();
  console.log(`探索する対象UTC時間: ${utcISO}:00 (選択エリア: ${bbox.prefname.toUpperCase()})`);

  const points = generatePoints();
  const quarters = splitIntoFour(points); // 4分割構造の維持

  const gridData = [];

  console.log(`APIリクエスト開始... 総ポイント数: ${points.length} (4分割ロジック稼働)`);

  try {
    for (let q = 0; q < quarters.length; q++) {
      const subBatch = quarters[q];
      if (subBatch.length === 0) continue;

      console.log(`-> 分割リクエスト中... (${q + 1}/4) - ${subBatch.length}地点`);
      const dataArray = await fetchQuarterBatch(subBatch);

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
        gridData.push({ lat: p.lat, lon: p.lon, rain });
      }

      // 次のループへ移る前の1.5秒待機（step弄りでの429を保険回避）
      if (q < quarters.length - 1) {
        await sleep(1500);
      }
    }

    // ===== 出力時だけLeaflet基準のピクセルサイズに引き伸ばし配置 =====
    const pMax = latLonToPixel(bbox.latMax, bbox.lonMin, ZOOM);
    const pMin = latLonToPixel(bbox.latMin, bbox.lonMax, ZOOM);

    const pixelBBox = {
      xMin: Math.floor(pMax.x),
      xMax: Math.floor(pMin.x),
      yMin: Math.floor(pMax.y),
      yMax: Math.floor(pMin.y)
    };

    // 北西(pMax)を基点にしてキャンバスサイズを算出
    const outWidth = Math.ceil(pMin.x - pMax.x) + 20; // 余裕を持たせる
    const outHeight = Math.ceil(pMin.y - pMax.y) + 20;
    const xOffset = pMax.x;
    const yOffset = pMax.y;

    
    console.log(`-> 粒度(step: ${step})を維持したまま、Leaflet ZOOM ${ZOOM} サイズ (${outWidth}x${outHeight} px) に引き伸ばし描画中...`);

    const finalCanvas = createCanvas(outWidth, outHeight);
    const finalCtx = finalCanvas.getContext("2d");

    // 現在のBBox幅と現在のstepからドットスタンプサイズを動的計算
    const latSpan = bbox.latMax - bbox.latMin;
    const lonSpan = bbox.lonMax - bbox.lonMin;
    // どんなズームレベルでも最低4pxの太さを保証
    const dotWidth = Math.max(Math.ceil(outWidth / (lonSpan / step)), 4);
    const dotHeight = Math.max(Math.ceil(outHeight / (latSpan / step)), 4);


    for (const item of gridData) {
      if (item.rain < 0.2) continue;

      let color = "rgba(100,180,255,0.5)";
      if (item.rain > 2) color = "rgba(0,120,255,0.7)";
      if (item.rain > 5) color = "rgba(255,80,0,0.8)";
      if (item.rain > 10) color = "rgba(255,0,0,1)";

      const p = latLonToPixel(item.lat, item.lon, ZOOM);
      const drawX = Math.round(p.x - xOffset + 10); // 余裕分を含めてオフセット
      const drawY = Math.round(p.y - yOffset + 10);


      if (drawX >= 0 && drawX < outWidth && drawY >= 0 && drawY < outHeight) {
        finalCtx.fillStyle = color;
        finalCtx.fillRect(
          drawX - Math.floor(dotWidth / 2), 
          drawY - Math.floor(dotHeight / 2), 
          dotWidth + 1, // 隙間埋め補正
          dotHeight + 1
        );
      }
    }

    // ファイル名生成
    const jstISO = jstDate.toISOString();
    const datePart = jstISO.slice(0, 10);
    const hourPart = jstISO.slice(11, 13);
    const filename = `./output/${bbox.prefname}_${datePart}_${hourPart}h.png`;

    fs.mkdirSync("./output", { recursive: true });
    fs.writeFileSync(filename, finalCanvas.toBuffer("image/png"));
    console.log(`【ミッション完了】プロファイル定義に基づき、Leafletサイズ画像を書き出しました: ${filename}`);

  } catch (e) {
    if (e.response) {
      console.error(`データ取得中にエラーが発生しました (Status: ${e.response.status}):`, e.message);
    } else {
      console.error("エラーが発生しました:", e.message);
    }
    process.exit(1);
  }
})();
