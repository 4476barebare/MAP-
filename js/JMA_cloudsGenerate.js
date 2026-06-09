import fetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";

const TILE = 256;

export const RAIN_CONFIG = {
  palette: [
    { min: 0, max: 0, alpha: 0 },
    { min: 0.1, max: 1, alpha: 0.2, color: "#a6d8ff" },
    { min: 1, max: 3, alpha: 0.4, color: "#4db3ff" },
    { min: 3, max: 5, alpha: 0.6, color: "#1f7cff" },
    { min: 5, max: 10, alpha: 0.8, color: "#004cff" },
    { min: 10, max: 20, alpha: 1.0, color: "#ff3b30" }
  ]
};

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
    (1 -
      Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) /
        Math.PI) /
      2 *
      n
  );

  return { x, y };
}

function latLngToPixel(lat, lng, z, xMin, yMin) {
  const worldSize = 2 ** z * TILE;

  const worldX = ((lng + 180) / 360) * worldSize;

  const worldY =
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) +
          1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
    worldSize;

  return {
    x: worldX - xMin * TILE,
    y: worldY - yMin * TILE
  };
}

function getLatestTime() {
  const d = new Date();

  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
  d.setSeconds(0);
  d.setMilliseconds(0);

  const pad = (n) => String(n).padStart(2, "0");

  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    "00"
  );
}

function getNext3HourSlot(date = new Date()) {
  const d = new Date(date);
  const h = d.getHours();
  const next = Math.ceil((h + 1) / 3) * 3;
  d.setHours(next, 0, 0, 0);
  return d;
}

function addHours(date, h) {
  const d = new Date(date);
  d.setHours(d.getHours() + h);
  return d;
}

function formatJMA(date) {
  const pad = (n) => String(n).padStart(2, "0");

  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    "0000"
  );
}

function getTileUrl(time, z, x, y) {
  return `https://www.jma.go.jp/bosai/jmatile/data/nowc/${time}/none/${z}/${x}/${y}.png`;
}

async function fetchTile(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  if (!res.ok) {
    console.error(`Fetch failed: ${res.status} for ${url}`); // エラーログを出して追跡しやすくする
    return null;
  }

  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}


export async function generateJmaCloud(area) {
  const time = area.time ?? getLatestTime();

  const { x, y } = latLngToTile(area.lat, area.lng, area.zoom);

  const rangeX = Math.ceil(area.grid.w / 2 / 50);
  const rangeY = Math.ceil(area.grid.h / 2 / 50);

  const xMin = x - rangeX;
  const xMax = x + rangeX;
  const yMin = y - rangeY;
  const yMax = y + rangeY;

  const canvas = createCanvas(
    (xMax - xMin + 1) * TILE,
    (yMax - yMin + 1) * TILE
  );

  const ctx = canvas.getContext("2d");

  for (let tx = xMin; tx <= xMax; tx++) {
    for (let ty = yMin; ty <= yMax; ty++) {
      const url = getTileUrl(time, area.zoom, tx, ty);
      const buf = await fetchTile(url);
      if (!buf) continue;

      const img = await loadImage(buf);

      ctx.drawImage(
        img,
        (tx - xMin) * TILE,
        (ty - yMin) * TILE,
        TILE,
        TILE
      );
    }
  }

  const center = latLngToPixel(area.lat, area.lng, area.zoom, xMin, yMin);

  const imageData = ctx.getImageData(
    center.x - area.grid.w / 2,
    center.y - area.grid.h / 2,
    area.grid.w,
    area.grid.h
  );

  return { canvas, imageData };
}

export function saveImage(canvas, prefName) {
  fs.mkdirSync("./output", { recursive: true });

  const fileName = `${prefName}_clouds.png`;
  const path = `./output/${fileName}`;

  fs.writeFileSync(path, canvas.toBuffer("image/png"));

  return path;
}

export async function runForecast(area) {
  const start = getNext3HourSlot();

  for (let i = 0; i < 6; i++) {
    const time = addHours(start, i * 3);
    const jmaTime = formatJMA(time);

    console.log("generate:", jmaTime);

    const result = await generateJmaCloud({
      ...area,
      time: jmaTime
    });

    saveImage(result.canvas, `${area.prefName}_${i}`);

    console.log("done:", i);
  }
}

runForecast(area);