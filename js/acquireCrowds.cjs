const fs = require("fs");
const path = require("path");

const BASE_URL = "https://turiiko.shop";
const LOG_URL = "https://turiiko.shop/cloudGenerator/run_log.txt";
const FETCHED_LOG = path.join(__dirname, "fetched_log.txt");

const outDir = path.join(__dirname, "crowdsimg");

// ==========================================
// メイン取得処理
// ==========================================
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
    f.split("\n").forEach(l => {
      if (l.trim()) fetched.add(l.trim());
    });
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

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

  // ★ログ追記：追記がある場合のみ、既存ファイルに追記する
  if (newFetched.length > 0) {
    fs.appendFileSync(FETCHED_LOG, newFetched.join("\n") + "\n");
  }
}

function cleanup() {
  const KEEP_HOURS = 3;

  const now = Date.now();
  const threshold = now - (KEEP_HOURS * 60 * 60 * 1000);

  if (!fs.existsSync(outDir)) return;

  const files = fs.readdirSync(outDir);
  const keptLogs = [];

  for (const fileName of files) {
    const filePath = path.join(outDir, fileName);

    const m = fileName.match(/_(\d{4}-\d{2}-\d{2})_(\d{2})\.png$/);
    if (!m) {
      // 想定外ファイルは触らない
      continue;
    }

    const [y, mo, d] = m[1].split("-").map(Number);
    const hour = Number(m[2]);

    const fileTime = new Date(y, mo - 1, d, hour).getTime();

    if (fileTime < threshold) {
      try {
        fs.unlinkSync(filePath);
        console.log("delete:", fileName);
      } catch (err) {
        console.error("delete error:", fileName, err.message);
      }
    } else {
      // 残すファイル → ログ再構築用に積む
      const fakeLogLine = `,,,,${
        "/cloudGenerator/" + fileName
      }`;
      keptLogs.push(fakeLogLine);
    }
  }

  // ログ再構築（完全上書き）
  if (keptLogs.length > 0) {
    fs.writeFileSync(FETCHED_LOG, keptLogs.join("\n") + "\n");
  } else {
    if (fs.existsSync(FETCHED_LOG)) {
      fs.unlinkSync(FETCHED_LOG);
    }
  }
}

(async () => {
  await main();
  cleanup();
})();
