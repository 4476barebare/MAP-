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

  // パース：新形式・旧形式に対応
  const logs = lines.map(line => {
    const parts = line.split(",");
    // ERROR行はパスがないので画像ダウンロード対象外
    if (parts[0] === 'ERROR') return { filePath: null, raw: line };
    
    // パスまでの5項目を比較キーとする（新旧共通）
    const comparisonKey = parts.slice(0, 5).join(",");
    return { filePath: parts[4], raw: line, comparisonKey };
  });

  // 取得済みログ読み込み
  let fetched = new Set();
  if (fs.existsSync(FETCHED_LOG)) {
    const f = fs.readFileSync(FETCHED_LOG, "utf-8");
    f.split("\n").forEach(l => {
      if (l.trim()) {
        const parts = l.trim().split(",");
        // 過去のログもパスまでの5項目をキーとしてセットに登録
        fetched.add(parts.slice(0, 5).join(","));
      }
    });
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  let newFetched = [];
  
  // ソートして重複チェック
  const sorted = logs
    .filter(l => l.filePath)
    .sort((a, b) => {
      // 日付によるソート（ファイル名から抽出）
      const getD = (p) => {
        const m = path.basename(p).match(/_(\d{4}-\d{2}-\d{2})_(\d{2})h\.png$/);
        return m ? new Date(m[1].replace(/-/g, '/') + ' ' + m[2] + ':00:00') : new Date(0);
      };
      return getD(b.filePath) - getD(a.filePath);
    });

  for (const log of sorted) {
    // 比較キーで重複判定
    if (fetched.has(log.comparisonKey)) continue;

    const url = BASE_URL + log.filePath;
    const fileName = path.basename(log.filePath);
    const savePath = path.join(outDir, fileName);

    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) continue;

      const buffer = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(savePath, buffer);
      console.log("saved:", fileName);

      // 最新のraw形式を追記リストへ
      newFetched.push(log.raw);
    } catch (e) {
      console.error("error:", url, e.message);
    }
  }

  // ログ追記（安全にファイルを開く）
  if (newFetched.length > 0) {
    fs.appendFileSync(FETCHED_LOG, newFetched.join("\n") + "\n");
    console.log(`Updated fetched_log with ${newFetched.length} entries.`);
  }
}

// ==========================================
// クリーンアップ
// ==========================================
function cleanup() {
  const now = new Date();
  const currentBlock = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);

  if (!fs.existsSync(FETCHED_LOG)) return;

  const fetchedLines = fs.readFileSync(FETCHED_LOG, "utf-8").split("\n").filter(l => l.trim());
  let newFetched = [];

  for (const line of fetchedLines) {
    const parts = line.split(",");
    
    // ERROR行は保持してスルー
    if (parts[0] === 'ERROR') {
      newFetched.push(line);
      continue;
    }

    if (parts.length < 5) continue;
    const filePath = parts[4];
    const fileName = path.basename(filePath);
    const m = fileName.match(/_(\d{4}-\d{2}-\d{2})_(\d{2})h\.png$/);
    if (!m) continue;

    const [y, mo, d] = m[1].split("-").map(Number);
    const fileTime = new Date(y, mo - 1, d, parseInt(m[2], 10), 0, 0);

    const localPath = path.join(outDir, fileName);
    if (fileTime < currentBlock) {
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } else {
      newFetched.push(line);
    }
  }
  fs.writeFileSync(FETCHED_LOG, newFetched.join("\n") + "\n");
}

(async () => {
  await main();
  cleanup();
})();
