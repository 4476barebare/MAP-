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
    // ★重要: パースは今のままですが、保存用データ(raw)を強制的に「最初の5項目」に固定します
    const raw = parts.slice(0, 5).join(",");
    return { filePath: parts[4], raw };
  });

  let fetched = new Set();
  if (fs.existsSync(FETCHED_LOG)) {
    const f = fs.readFileSync(FETCHED_LOG, "utf-8");
    f.split("\n").forEach(l => { if (l.trim()) fetched.add(l.trim()); });
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  let newFetched = [];

  for (const log of logs) {
    if (log.filePath && !log.filePath.includes("ERROR") && !fetched.has(log.raw)) {
      const url = BASE_URL + log.filePath;
      const fileName = path.basename(log.filePath);
      try {
        const imgRes = await fetch(url);
        if (!imgRes.ok) continue;
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        fs.writeFileSync(path.join(outDir, fileName), buffer);
        console.log("saved:", fileName);
        newFetched.push(log.raw);
      } catch (e) {
        console.log("error:", url, e.message);
      }
    }
  }

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
    if (parts.length < 5) continue;
    const fileName = path.basename(parts[4]);
    const m = fileName.match(/_(\d{4}-\d{2}-\d{2})_(\d{2})h\.png$/);
    if (!m) continue;

    const fileTime = new Date(m[1].replace(/-/g, '/') + ' ' + m[2] + ':00:00');
    if (fileTime < currentBlock) {
      const localPath = path.join(outDir, fileName);
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } else {
      newFetched.push(line);
    }
  }
  
  // ★ログが空にならないよう書き込みを制御
  fs.writeFileSync(FETCHED_LOG, newFetched.join("\n") + (newFetched.length > 0 ? "\n" : ""));
}

(async () => {
  await main();
  cleanup();
})();
