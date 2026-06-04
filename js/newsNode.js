// newsNode.js
import fs from "fs";
import fetch from "node-fetch";

const RSS_LIST = [
  "https://www.lurenewsr.com/feed/",
  "https://fishingjapan.jp/fishing/rss.php",
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCLhAzbPvfaD7zQE1ybS6kLg",
  "https://www.youtube.com/feeds/videos.xml?channel_id=UChHUhF5bgoeS1Z-uE_HRQfQ",
  "https://www.youtube.com/feeds/videos.xml?user=yoorai0121",
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCwmAyvxNTirU4uaDxwoveDA"
];

const OUTPUT_PATH = "./data/news.json";
const MAX_ITEMS = 100;

// =========================
// RSS取得
// =========================
async function fetchAllRSS(urls) {
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(
          "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(url)
        );
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    })
  );
  return results;
}

// =========================
// 既存JSON読み込み
// =========================
function loadOldData() {
  try {
    if (fs.existsSync(OUTPUT_PATH)) {
      const raw = fs.readFileSync(OUTPUT_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("旧データ読み込み失敗", e);
  }
  return [];
}

// =========================
// 保存
// =========================
function saveData(data) {
  fs.mkdirSync("./data", { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
}

// =========================
// サムネ処理（フロント移植）
// =========================
function extractImg(item) {
  if (!item.description) return "";
  const m = item.description.match(/<img[^>]+src="([^">]+)"/);
  return m ? m[1] : "";
}

function cleanUrl(url) {
  if (!url) return "";
  return url.split("?")[0];
}

function getThumbnail(item) {

  const link = item.link || "";

  // .php系
  if (link.includes(".php")) {
    const url =
      item.media?.content?.[0]?.url ||
      item.enclosure?.link ||
      item.thumbnail ||
      extractImg(item);

    return cleanUrl(url) || null;
  }

  let url = "";

  // 通常
  if (item.thumbnail) {
    url = item.thumbnail;
  }

  // enclosure
  else if (item.enclosure?.link) {
    url = item.enclosure.link;
  }

  // media
  else if (item["media:thumbnail"]?.url) {
    url = item["media:thumbnail"].url;
  }

  // description fallback
  else if (item.description) {
    const match = item.description.match(/https?:\/\/[^"]+\.(jpg|png|jpeg|webp)/);
    if (match) url = match[0];
  }

  url = cleanUrl(url);

  // 最終チェック
  if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(url)) {
    return null;
  }

  return url;
}

// =========================
// 軽量化（必要フィールドだけ）
// =========================
function normalizeItem(item) {

  const link = item.link || "";

  let author = item.author || "";

  // =========================
  // FISHING JAPAN
  // =========================
  if (link.includes("fishingjapan.jp")) {
    author = "FISHING JAPAN";
  }

  // =========================
  // LureNews
  // =========================
  else if (link.includes("lurenewsr.com")) {
    author = "ルアーニュース";
  }

  // =========================
  // YouTube（必要なら）
  // =========================
  else if (link.includes("youtube.com")) {
    // そのまま or チャンネル名維持
  }

  return {
    title: item.title,
    link,
    pubDate: item.pubDate,
    thumbnail: getThumbnail(item),
    author
  };
}

// =========================
// メイン処理
// =========================
async function main() {
  console.log("RSS取得開始");

  const results = await fetchAllRSS(RSS_LIST);

  let fetchedItems = [];

  results.forEach(data => {
    if (data && data.items) {
      fetchedItems = fetchedItems.concat(data.items);
    }
  });

  // 既存
  const oldItems = loadOldData();
  const oldLinks = new Set(oldItems.map(i => i.link));

  // =========================
  // 新着抽出
  // =========================
  const newItemsRaw = fetchedItems.filter(item =>
    item.link && !oldLinks.has(item.link)
  );

  if (newItemsRaw.length === 0) {
    console.log("新着なし → スキップ");
    return;
  }

  console.log("新着:", newItemsRaw.length);

  // 正規化（ここで軽量化＆サムネ確定）
  const newItems = newItemsRaw.map(normalizeItem);

  // =========================
  // マージ
  // =========================
  const map = new Map();

  oldItems.forEach(item => {
    if (item.link) map.set(item.link, item);
  });

  newItems.forEach(item => {
    if (item.link) map.set(item.link, item);
  });

  let merged = Array.from(map.values());

  // =========================
  // ソート
  // =========================
  merged.sort((a, b) =>
    new Date(b.pubDate) - new Date(a.pubDate)
  );

  // =========================
  // 上限
  // =========================
  merged = merged.slice(0, MAX_ITEMS);

  // =========================
  // 保存
  // =========================
  saveData(merged);

  console.log(`完了: ${merged.length}件保存`);
}

main();