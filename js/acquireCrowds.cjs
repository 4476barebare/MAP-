const fs = require("fs");
const path = require("path");

const BASE_URL = "https://turiiko.shop";
const LOG_URL = "https://turiiko.shop/cloudGenerator/run_log.txt";
const FETCHED_LOG = path.join(__dirname, "fetched_log.txt");
const outDir = path.join(__dirname, "crowdsimg");

async function main() {
  const res = await fetch(LOG_URL);
  const text = await res.text();
  const lines = text.trim().split("\n");

  const logs = lines.map(line => {
    const parts = line.split(",");
    const filePath = parts[4];
    return { filePath, raw: line };
  });

  let fetched = new Set();
  if (fs.existsSync(FETCHED_LOG)) {
    const f = fs.readFileSync(FETCHED_LOG, "utf-8");
    f.split("\n").forEach(l => { if (l.trim()) fetched.add(l.trim()); });
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  let newFetched = [];

  const sorted = logs
    .filter(l => l.filePath && !l.filePath.includes("ERROR"))
    .map(l => {
      const fileName = path.basename(l.filePath);
      const m = fileName.match(/_(\d{4}-\d{2}-\d{2})_(\d{2})h\.png$/);
      const date = m ? new Date(m[1].replace(/-/g, '/') + ' ' + m[2] + ':00:00') : new Date(0);
      return { ...l, date };
    })
    .sort((a, b) => b.date - a.date);

  for (const log of sorted) {
    if (fetched.has(log.raw)) continue;

    const url = BASE_URL + log.filePath;
    const fileName = path.basename(log.filePath);
    const savePath = path.join(outDir, fileName);

    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) continue;
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(savePath, buffer);
      console.log("saved:", fileName);
      newFetched.push(log.raw);
    } catch (e) {
      console.log("error:", url, e.message);
    }
  }

  // 書き込み修正：追記がある場合のみ、空行を避けて末尾に確実に追記する
  if (newFetched.length > 0) {
    fs.appendFileSync(FETCHED_LOG, newFetched.join("\n") + "\n");
  }
}

function cleanup() {
  const now = new Date();
  const currentBlock = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);

  if (!fs.existsSync(FETCHED_LOG)) return;

  const fetchedLines = fs.readFileSync(FETCHED_LOG, "utf-8").split("\n").filter(l => l.trim());
  let newFetched = [];

  for (const line of fetchedLines) {
    const parts = line.split(",");
    // ★修正：parts.length < 5 と判断してスキップしていた箇所を緩和
    // 今回の7項目行も確実に処理対象にするため、単純にパスの有無で判定
    if (!parts[4]) {
      newFetched.push(line);
      continue;
    }

    const filePath = parts[4];
    const fileName = path.basename(filePath);
    const m = fileName.match(/_(\d{4}-\d{2}-\d{2})_(\d{2})h\.png$/);
    if (!m) {
        newFetched.push(line);
        continue;
    }

    const fileTime = new Date(m[1].replace(/-/g, '/') + ' ' + m[2] + ':00:00');
    const localPath = path.join(outDir, fileName);

    if (fileTime < currentBlock) {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        console.log("delete:", fileName);
      }
    } else {
      newFetched.push(line);
    }
  }

  // ★修正：ファイルが空なら書き込まない（既存ファイルを破壊させない）
  if (newFetched.length > 0) {
    fs.writeFileSync(FETCHED_LOG, newFetched.join("\n") + "\n");
  }
}

(async () => {
  await main();
  cleanup();
})();
