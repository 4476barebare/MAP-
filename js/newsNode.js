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

        // RAW処理（WordPress系）
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

        // 通常（rss2json）
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
// サムネ取得（統合版）
// =========================
function getThumbnail(item) {

  // rss2json
  if (item.thumbnail) {
    return cleanUrl(item.thumbnail);
  }

  // media
  if (item.media?.url) {
    return cleanUrl(item.media.url);
  }

  // enclosure
  if (item.enclosure?.link) {
    return cleanUrl(item.enclosure.link);
  }

  // content（ブンブン）
  let html = pickText(item.content);

  if (!html) {
    html = pickText(item.description);
  }

  if (html) {
    const m = html.match(/<img[^>]*src=["']([^"']+)["']/i);
    if (m) return cleanUrl(m[1]);
  }

  return "";
}

// =========================
// author取得（統合版）
// =========================
function getAuthor(item, link) {
  let author =
    item.author ||
    item.creator ||
    "";

  if (link.includes("fishingjapan.jp")) {
    author = "FISHING JAPAN";
  } else if (link.includes("lurenewsr.com")) {
    author = "ルアーニュース";
  } else if (link.includes("bunbun-fishing.com")) {
    author = author || "釣具のブンブン";
  }

  return author;
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
// メイン
// =========================
async function main() {
  console.log("RSS取得開始");

  const results = await fetchAllRSS(RSS_LIST);

  let items = [];

  results.forEach(data => {
    if (data?.items) {
      items = items.concat(data.items);
    }
  });

  const normalized = items.map(normalizeItem);

  normalized.sort((a, b) =>
    new Date(b.pubDate) - new Date(a.pubDate)
  );

  const finalData = normalized.slice(0, MAX_ITEMS);

  fs.mkdirSync("./data", { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalData, null, 2));

  console.log("完了:", finalData.length);
}

main();