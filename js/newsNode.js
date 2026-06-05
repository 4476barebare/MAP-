import fs from "fs";
import fetch from "node-fetch";
import iconv from "iconv-lite";
import { XMLParser } from "fast-xml-parser";

const RSS_LIST = [
  "https://www.lurenewsr.com/feed/",
  "https://fishingjapan.jp/fishing/rss.php",
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCLhAzbPvfaD7zQE1ybS6kLg",
  "https://www.youtube.com/feeds/videos.xml?channel_id=UChHUhF5bgoeS1Z-uE_HRQfQ",
  "https://www.youtube.com/feeds/videos.xml?user=yoorai0121",
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCwmAyvxNTirU4uaDxwoveDA",
  "https://bunbun-fishing.com/feed/"
];

// サイト別設定
const SITE_CONFIG = {
  "bunbun-fishing.com": {
    encoding: "utf-8",
    mode: "raw"
  },
  "old-site.jp": {
    encoding: "shift_jis",
    mode: "raw"
  }
};

const OUTPUT_PATH = "./data/news.json";
const MAX_ITEMS = 100;

// =========================
// RSS取得
// =========================
async function fetchAllRSS(urls) {
  const parser = new XMLParser({
    ignoreAttributes: false
  });

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const config = Object.entries(SITE_CONFIG).find(([domain]) =>
          url.includes(domain)
        )?.[1];

        // =========================
        // RAW取得（自前パース）
        // =========================
        if (config?.mode === "raw") {

          const res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0"
            }
          });

          const buffer = await res.arrayBuffer();

          // ヘッダから文字コード判定
          const contentType = res.headers.get("content-type") || "";

          let encoding = config?.encoding || "utf-8";

          if (contentType.includes("shift_jis") || contentType.includes("sjis")) {
            encoding = "shift_jis";
          }

          const text = iconv.decode(Buffer.from(buffer), encoding);

          const json = parser.parse(text);

          const items = json.rss?.channel?.item || [];

          return {
            items: items.map(i => ({
              title: i.title,
              link: i.link,
              pubDate: i.pubDate || i["dc:date"] || i.date,
              description: i.description
            }))
          };
        }

        // =========================
        // 通常（rss2json）
        // =========================
        const res = await fetch(
          "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(url)
        );

        if (!res.ok) return null;

        return await res.json();

      } catch (e) {
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
// サムネ抽出
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

  let url = "";

  // ① media系
  if (item["media:thumbnail"]?.url) {
    url = item["media:thumbnail"].url;
  }

  // ② enclosure
  else if (item.enclosure?.link) {
    url = item.enclosure.link;
  }

  // ③ ★ content:encoded（最重要）
  else if (item["content:encoded"]) {
    const html = item["content:encoded"];
    const match = html.match(/<img[^>]+src="([^">]+)"/);
    if (match) url = match[1];
  }

  // ④ description fallback
  else if (item.description) {
    const match = item.description.match(/<img[^>]+src="([^">]+)"/);
    if (match) url = match[1];
  }

  url = cleanUrl(url);

  if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(url)) {
    return null;
  }

  return url;
}

// =========================
// 正規化
// =========================
function normalizeItem(item) {
  const link = item.link || "";

  let author =
    item.author ||
    item["dc:creator"] ||
    item.creator ||
    "";

  // サイト別上書き
  if (link.includes("fishingjapan.jp")) {
    author = "FISHING JAPAN";
  } else if (link.includes("lurenewsr.com")) {
    author = "ルアーニュース";
  } else if (link.includes("bunbun-fishing.com")) {
    author = author || "釣具のブンブン";
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
// 1サイト1件保持
// =========================
function ensureOnePerSite(items) {
  const map = new Map();

  items.forEach(item => {
    try {
      const domain = new URL(item.link).hostname;

      if (!map.has(domain)) {
        map.set(domain, item);
      } else {
        const existing = map.get(domain);
        if (new Date(item.pubDate) < new Date(existing.pubDate)) {
          map.set(domain, item);
        }
      }
    } catch {}
  });

  return Array.from(map.values());
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

  const oldItems = loadOldData();
  const oldLinks = new Set(oldItems.map(i => i.link));

  const newItemsRaw = fetchedItems.filter(item =>
    item.link && !oldLinks.has(item.link)
  );

  if (newItemsRaw.length === 0) {
    console.log("新着なし → スキップ");
    return;
  }

  console.log("新着:", newItemsRaw.length);

  const newItems = newItemsRaw.map(normalizeItem);

  const map = new Map();

  oldItems.forEach(item => {
    if (item.link) map.set(item.link, item);
  });

  newItems.forEach(item => {
    if (item.link) map.set(item.link, item);
  });

  let merged = Array.from(map.values());

  merged.sort((a, b) =>
    new Date(b.pubDate) - new Date(a.pubDate)
  );

  // ★ 各サイト1件保持
  const keepItems = ensureOnePerSite(merged);

  merged = [...merged, ...keepItems];

  // 重複排除
  merged = Array.from(
    new Map(merged.map(i => [i.link, i])).values()
  );

  // 上限
  merged = merged.slice(0, MAX_ITEMS);

  saveData(merged);

  console.log(`完了: ${merged.length}件保存`);
}

main();