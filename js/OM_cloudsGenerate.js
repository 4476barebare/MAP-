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
    step: 0.1,    // 0.1度刻みのちょうどいい粒度
    zoom: 9       // Leafletの大きなZOOMサイズ
  },
  // 他のエリアは設定のみ維持
  tokyo: { latMin: 35.5, latMax: 35.9, lonMin: 138.9, lonMax: 139.9, step: 0.05, zoom: 10, prefname: "tokyo" },
  kanto_all: { latMin: 34.0, latMax: 38.0, lonMin: 138.0, lonMax: 142.0, step: 0.15, zoom: 7, prefname: "kanto" }
};

// 現在アクティブにするエリアを指定
const activeArea = AREA_PROFILES.chiba;

// 設定の展開
const bbox = activeArea;
const step = activeArea.step;
const ZOOM = activeArea.zoom;

// 429エラー回避用のウェイト
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ===== 緯度経度をWebメルカトルの絶対ピクセル座標に変換 =====
function latLonToPixel(lat, lon, zoom) {
  const size = 256 * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * size;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size;
  return { x, y };
}

// ===== グリッド生成 =====
function generatePoints() {
  const points = [];
  // 浮動小数点の演算誤差を防ぐため100倍して制御
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

// ===== メメイン =====
(async () => {
  // ★デバッグ用：今日の午前6時 JST = 2026-06-09T21:00 UTC
  const utcISO = "2026-06-09T21:00"; 
  console.log(`探索する対象UTC時間: ${utcISO}:00 (エリア: ${bbox.prefname.toUpperCase()})`);

  const points = generatePoints();
  const quarters = splitIntoFour(points);

  const gridData = [];

  console.log(`APIリクエスト開始... 総ポイント数: ${points.length} (4分割ロジック稼働)`);

  try {
    for (let q = 0; q < quarters.length; q++) {
      const subBatch = quarters[q];
      if (subBatch.length === 0) continue;

      const dataArray = await fetchQuarterBatch(subBatch);

      for (let i = 0; i < subBatch.length; i++) {
        const p = subBatch[i];
        const pointData = dataArray[i];
        if (!pointData?.hourly) continue;

        const idx = pointData.hourly.time.findIndex(t => t.startsWith(utcISO));
        if (idx === -1) continue;

        const rain = pointData.hourly.precipitation[idx] ?? 0;
        gridData.push({ lat: p.lat, lon: p.lon, rain });
      }

      if (q < quarters.length - 1) {
        await sleep(1500);
      }
    }

    // ===== 出力時だけLeaflet基準のピクセルサイズ（大判）に引き伸ばし配置 =====
    // 本番用の座標補正計算に戻す
    const pMax = latLonToPixel(bbox.latMax, bbox.lonMin, ZOOM);
    const pMin = latLonToPixel(bbox.latMin, bbox.lonMax, ZOOM);

    const xOffset = pMax.x;
    const yOffset = pMax.y;
    const outWidth = Math.ceil(pMin.x - xOffset) + 1;
    const outHeight = Math.ceil(pMin.y - yOffset) + 1;
    
    console.log(`-> 粒度(0.1度)を維持したまま、Leaflet ZOOM ${ZOOM} サイズ (${outWidth}x${outHeight} px) のマス目画像に描画中...`);

    const finalCanvas = createCanvas(outWidth, outHeight);
    const finalCtx = finalCanvas.getContext("2d");

    // ★【本番復活】以前のように、0.1度マスに合わせた適切なドット（マス）の太さを動的計算
    const latSpan = bbox.latMax - bbox.latMin;
    const lonSpan = bbox.lonMax - bbox.lonMin;
    // どんなZOOMレベルでもマスが潰れないよう、最低サイズ（4px）を保証
    const dotWidth = Math.max(Math.ceil(outWidth / (lonSpan / step)), 4);
    const dotHeight = Math.max(Math.ceil(outHeight / (latSpan / step)), 4);

    for (const item of gridData) {
      // 本番：0.2mm未満（晴れ）はスキップして透過にする
      if (item.rain < 0.2) continue;

      let color = "rgba(100,180,255,0.5)";
      if (item.rain > 2) color = "rgba(0,120,255,0.7)";
      if (item.rain > 5) color = "rgba(255,80,0,0.8)";
      if (item.rain > 10) color = "rgba(255,0,0,1)";

      // 正しいメルカトル座標からピクセルへ
      const p = latLonToPixel(item.lat, item.lon, ZOOM);
      const drawX = Math.round(p.x - xOffset);
      const drawY = Math.round(p.y - pixelBBox.yMin);

      // マスの中心がズレないようにスタンプ
      if (drawX >= 0 && drawX < outWidth && drawY >= 0 && drawY < outHeight) {
        finalCtx.fillStyle = color;
        // マス目（ブロック）として描画
        finalCtx.fillRect(
          drawX - Math.floor(dotWidth / 2), 
          drawY - Math.floor(dotHeight / 2), 
          dotWidth, 
          dotHeight
        );
      }
    }

    // ファイル名生成（JSTの日付と時間を反映）
    const jstISO = new Date(new Date("2026-06-09T21:00Z").getTime()).toISOString(); // 今日6時に固定
    const datePart = jstISO.slice(0, 10);
    const hourPart = new Date(new Date("2026-06-09T21:00Z").getTime() + 9 * 60 * 60 * 1000).getHours().toString().padStart(2, '0');
    const filename = `./output/${bbox.prefname}_${datePart}_${hourPart}h.png`;

    fs.mkdirSync("./output", { recursive: true });
    fs.writeFileSync(filename, finalCanvas.toBuffer("image/png"));
    console.log(`【完全大成功】ちょうどいい粒度でマス目をスタンプした透過画像を書き出しました: ${filename}`);

  } catch (e) {
    if (e.response) {
      console.error(`データ取得中にエラーが発生しました (Status: ${e.response.status}):`, e.message);
    } else {
      console.error("エラーが発生しました:", e.message);
    }
    process.exit(1);
  }
})();
