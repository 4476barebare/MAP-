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

// ==========================================
// クリーンアップ
// ==========================================
function cleanup() {
  const now = new Date();
  const currentBlock = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);

  if (!fs.existsSync(FETCHED_LOG)) return;

  let fetchedLines = fs.readFileSync(FETCHED_LOG, "utf-8")
      .split("\n")
      .filter(l => l.trim());

  let newFetched = [];

  for (const line of fetchedLines) {
    const parts = line.split(",");
    if (parts.length < 5) continue;

    const filePath = parts[4];
    const fileName = path.basename(filePath);
    const m = fileName.match(/_(\d{4}-\d{2}-\d{2})_(\d{2})h\.png$/);
    if (!m) continue;

    const [y, mo, d] = m[1].split("-").map(Number);
    const fileTime = new Date(y, mo - 1, d, parseInt(m[2], 10), 0, 0);

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

  // ★クリーンアップ書き込み：安全にリライトする
  // 内容が空になる場合は、ファイルそのものを削除するか何もしないことで、中身が真っ白になるのを防ぐ
  if (newFetched.length > 0) {
    fs.writeFileSync(FETCHED_LOG, newFetched.join("\n") + "\n");
  } else {
    // データが空ならファイル自体を削除（次回の実行で自動生成される）
    if (fs.existsSync(FETCHED_LOG)) fs.unlinkSync(FETCHED_LOG);
  }
}

(async () => {
  await main();
  cleanup();
})();
