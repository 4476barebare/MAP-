// acquireCrowds.cjs
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://turiiko.shop";
const LOG_URL = "https://turiiko.shop/cloudGenerator/run_log.txt";
const FETCHED_LOG = path.join(__dirname, "fetched_log.txt");

// ★ グローバルに出す（cleanupでも使う）
const outDir = path.join(__dirname, "crowdsimg");

// ==========================================
// メイン取得処理
// ==========================================
async function main() {
  // ログ取得
  const res = await fetch(LOG_URL);
  const text = await res.text();

  const lines = text.trim().split("\n");

  // パース部分を以下のように修正
  const logs = lines.map(line => {
    const parts = line.split(",");
    
    // ★新旧対応: ファイルパスはどちらの形式でもparts[4]に入っている
    const filePath = parts[4]; 
    
    // ★重要: 比較用に「旧形式相当」の文字列をrawとして扱う
    // これにより、fetched_log.txt が旧形式でも新形式でも、パスが同じなら「取得済み」と判定される
    const raw = parts.slice(0, 5).join(","); 
    
    return { filePath, raw };
  });

  // 取得済みログ読み込み
  let fetched = new Set();
  if (fs.existsSync(FETCHED_LOG)) {
    const f = fs.readFileSync(FETCHED_LOG, "utf-8");
    f.split("\n").forEach(l => {
      if (l.trim()) fetched.add(l.trim());
    });
  }

  // 保存先作成
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  let newFetched = [];

  // ファイル名から日付を抽出してソートする
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

  // ログ追記
  if (newFetched.length > 0) {
    fs.appendFileSync(FETCHED_LOG, newFetched.join("\n") + "\n");
  }
}

// ==========================================
// クリーンアップ（過去ブロック削除）
// ==========================================
function cleanup() {
  const now = new Date();

  // 現在時刻を「時」で丸める
  const currentBlock = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    0, 0
  );

  // fetched_log読み込み
  let fetchedLines = [];
  if (fs.existsSync(FETCHED_LOG)) {
    fetchedLines = fs.readFileSync(FETCHED_LOG, "utf-8")
      .split("\n")
      .filter(l => l.trim());
  }

  let newFetched = [];

  for (const line of fetchedLines) {
    const parts = line.split(",");
    if (parts.length < 5) continue; // 5項目あることを確認

    const filePath = parts[4]; // 4番目のインデックスにファイルパス
    const fileName = path.basename(filePath);

    // ファイル名から日時抽出
    const m = fileName.match(/_(\d{4}-\d{2}-\d{2})_(\d{2})h\.png$/);
    if (!m) continue;

    const dateStr = m[1];
    const hour = parseInt(m[2], 10);

    // ★ ローカル時間で確実に生成
    const [y, mo, d] = dateStr.split("-").map(Number);
    const fileTime = new Date(y, mo - 1, d, hour, 0, 0);

    const localPath = path.join(outDir, fileName);

    if (fileTime < currentBlock) {
      // 過去ブロック → 削除
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        console.log("delete:", fileName);
      }
    } else {
      // 残す
      newFetched.push(line);
    }
  }

  // fetched_logを再構築
  fs.writeFileSync(FETCHED_LOG, newFetched.join("\n") + "\n");
}

// ==========================================
// 実行
// ==========================================
(async () => {
  await main();   // ★ 先に取得を確実に終わらせる
  cleanup();      // ★ その後クリーンアップ
})();
