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
// RSS取得（安全化）
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
  // 新着だけ抽出（ここが重要）
  // =========================
  const newItems = fetchedItems.filter(item =>
    item.link && !oldLinks.has(item.link)
  );

  // 新着なしなら終了（高速化）
  if (newItems.length === 0) {
    console.log("新着なし → スキップ");
    return;
  }

  console.log("新着:", newItems.length);

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
  // ソート（新しい順）
  // =========================
  merged.sort((a, b) =>
    new Date(b.pubDate) - new Date(a.pubDate)
  );

  // =========================
  // 100件制限
  // =========================
  merged = merged.slice(0, MAX_ITEMS);

  // =========================
  // 保存
  // =========================
  saveData(merged);

  console.log(`完了: ${merged.length}件保存`);
}

main();