// acquireCrowds.js
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://turiiko.shop";
const LOG_URL = "https://turiiko.shop/cloudGenerator/run_log.txt";
const FETCHED_LOG = "fetched_log.txt";

async function main() {
  // XREAログ取得
  const res = await fetch(LOG_URL);
  const text = await res.text();

  const lines = text.trim().split("\n");

  // ログをパース（time, path）
  const logs = lines.map(line => {
    const [time, filePath] = line.split(",");
    return { time, filePath, raw: line };
  });

  // 取得済みログ読み込み
  let fetched = new Set();
  if (fs.existsSync(FETCHED_LOG)) {
    const f = fs.readFileSync(FETCHED_LOG, "utf-8");
    f.split("\n").forEach(l => {
      if (l.trim()) fetched.add(l.trim());
    });
  }

  // 保存先
  const outDir = path.join(__dirname, "crowdsimg");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  let newFetched = [];

  // 新しい順に処理（無駄なアクセス減らす）
  const sorted = logs
    .filter(l => l.filePath && !l.filePath.includes("ERROR"))
    .map(l => ({
      ...l,
      date: new Date(l.time)
    }))
    .sort((a, b) => b.date - a.date);

  for (const log of sorted) {
    if (fetched.has(log.raw)) continue; // 既取得スキップ

    const url = BASE_URL + log.filePath;
    const fileName = path.basename(log.filePath);
    const savePath = path.join(outDir, fileName);

    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) {
        console.log("skip:", url, imgRes.status);
        continue;
      }

      const buffer = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(savePath, buffer);

      console.log("saved:", fileName);

      newFetched.push(log.raw);

    } catch (e) {
      console.log("error:", url, e.message);
    }
  }

  // 取得ログ更新（追記）
  if (newFetched.length > 0) {
    fs.appendFileSync(FETCHED_LOG, newFetched.join("\n") + "\n");
  }
}

main();