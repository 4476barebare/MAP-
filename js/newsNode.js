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
  "https://bunbun-fishing.com/feed/",
  "https://tsurinews.jp/feed/",
  "https://castingnet.jp/sp/news/rss.php"
];

const SITE_CONFIG = {
  "bunbun-fishing.com": {
    encoding: "utf-8",
    mode: "raw"
  }
};

const OUTPUT_PATH = "./data/news.json";
const MAX_ITEMS = 100;

// =========================
// RSS取得
// =========================
async function fetchAllRSS(urls) {
  const parser = new XMLParser({ ignoreAttributes: false });

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const config = Object.entries(SITE_CONFIG).find(([d]) =>
          url.includes(d)
        )?.[1];

        if (config?.mode === "raw") {
          const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });

          const buffer = await res.arrayBuffer();
          const text = iconv.decode(Buffer.from(buffer), config.encoding);

          const json = parser.parse(text);
          const items = json.rss?.channel?.item || [];

          return {
            items: items.map(i => ({
              title: i.title,
              link: i.link,
              pubDate: i.pubDate || i["dc:date"] || i.date,
              description: i.description,
              content: i["content:encoded"],
              media: i["media:thumbnail"],
              enclosure: i.enclosure,
              creator: i["dc:creator"]
            }))
          };
        }

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
// ユーティリティ
// =========================
function cleanUrl(url) {
  if (!url) return "";
  return url.split("?")[0];
}

function pickText(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v["#text"] || "";
  return "";
}

// =========================
// サムネ取得
// =========================
function getThumbnail(item) {
  if (item.thumbnail) return cleanUrl(item.thumbnail);
  if (item.media?.url) return cleanUrl(item.media.url);
  if (item.enclosure?.link) return cleanUrl(item.enclosure.link);

  let html = pickText(item.content);
  if (!html) html = pickText(item.description);
  if (html) {
    const m = html.match(/<img[^>]*src=["']([^"']+)["']/i);
    if (m) return cleanUrl(m[1]);
  }
  return "";
}

function getAuthor(item, link) {
  const url = (link || "").toLowerCase();
  if (url.includes("fishingjapan.jp")) return "FISHING JAPAN";
  if (url.includes("lurenewsr.com")) return "ルアーニュース";
  if (url.includes("bunbun-fishing.com")) return "釣具のブンブン";
  if (url.includes("tsurinews.jp")) return "TSURINEWS";
  if (url.includes("castingnet.jp")) return "キャスティング";

  return item.author || item.creator || "RSS";
}

// =========================
// 正規化
// =========================
function normalizeItem(item) {
  const link = item.link || "";
  return {
    title: item.title,
    link,
    pubDate: item.pubDate,
    thumbnail: getThumbnail(item),
    author: getAuthor(item, link)
  };
}

// =========================
// 保存用フィルタリング処理
// =========================
function processData(newItems) {
  let existingItems = [];
  try {
    if (fs.existsSync(OUTPUT_PATH)) {
      existingItems = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
    }
  } catch (e) {
    console.warn("既存データの読み込みに失敗しました。新規作成します。");
  }

  const map = new Map();
  [...existingItems, ...newItems].forEach(item => {
    if (!map.has(item.link)) map.set(item.link, item);
  });
  
  const allItems = Array.from(map.values()).sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const finalData = [];
  const addedAuthors = new Set();
  const remainder = [];

  for (const item of allItems) {
    if (!addedAuthors.has(item.author) && finalData.length < MAX_ITEMS) {
      finalData.push(item);
      addedAuthors.add(item.author);
    } else {
      remainder.push(item);
    }
  }

  for (const item of remainder) {
    if (finalData.length >= MAX_ITEMS) break;
    finalData.push(item);
  }

  return finalData;
}

// =========================
// メイン
// =========================
async function main() {
  console.log("RSS取得開始");

  const results = await fetchAllRSS(RSS_LIST);
  let items = [];
  results.forEach(data => {
    if (data?.items) items = items.concat(data.items.map(normalizeItem));
  });

  const finalData = processData(items);

  fs.mkdirSync("./data", { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalData, null, 2));

  console.log("完了: 保存件数", finalData.length);
}

main();
