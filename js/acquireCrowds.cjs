// acquireCrowds.cjs
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://turiiko.shop";
const LOG_URL = "https://turiiko.shop/cloudGenerator2/run_log.txt";
const FETCHED_LOG = path.join(__dirname, "fetched_log.txt");

const outDir = path.join(__dirname, "crowdsimg");

// ==========================================
// メイン取得処理
// ==========================================
async function main() {
    const res = await fetch(LOG_URL);
    if (!res.ok) {
        console.error(`ログの取得に失敗しました HTTP: ${res.status}`);
        return;
    }
    const text = await res.text();
    const lines = text.trim().split("\n");

    const logs = lines.map(line => {
        const parts = line.split(",");
        const filePath = parts[4];
        const comparisonKey = parts.slice(0, 5).join(",");
        return { filePath, raw: line, comparisonKey };
    });

    let fetched = new Set();
    if (fs.existsSync(FETCHED_LOG)) {
        const f = fs.readFileSync(FETCHED_LOG, "utf-8");
        f.split("\n").forEach(l => {
            if (l.trim()) {
                const parts = l.split(",");
                fetched.add(parts.slice(0, 5).join(","));
            }
        });
    }

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    let newFetched = [];

    // ★ 日本時間(JST)の現在時刻を厳密に取得して「時」で丸める
    const nowJST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    nowJST.setMinutes(0, 0, 0);
    const currentJstTime = nowJST.getTime();

    const sorted = logs
        .filter(l => l.filePath && !l.filePath.includes("ERROR"))
        .map(l => {
            const fileName = path.basename(l.filePath);
            const m = fileName.match(/_(\d{4}-\d{2}-\d{2})_(\d{2})/);
            // ★ JSTとして明示的にパース（ISO形式 +09:00を付与）
            const date = m ? new Date(`${m[1]}T${m[2]}:00:00+09:00`) : new Date(0);
            return { ...l, date };
        })
        // ★ ここが超重要: 現在時刻(JST)より過去の画像は、ログにあっても弾く！
        .filter(l => l.date.getTime() >= currentJstTime)
        .sort((a, b) => b.date - a.date);

    for (const log of sorted) {
        if (fetched.has(log.comparisonKey)) continue;

        const fileName = path.basename(log.filePath);
        const imgUrl = log.filePath.replace('./', `${BASE_URL}/cloudGenerator2/`);
        const localPath = path.join(outDir, fileName);

        try {
            const imgRes = await fetch(imgUrl);
            if (imgRes.ok) {
                const buffer = await imgRes.arrayBuffer();
                fs.writeFileSync(localPath, Buffer.from(buffer));
                console.log(`✅ 保存成功: ${fileName}`);

                newFetched.push(log.raw.trim());
                fetched.add(log.comparisonKey);
            } else {
                console.error(`❌ 画像DL失敗 HTTP ${imgRes.status}: ${imgUrl}`);
            }
        } catch (err) {
            console.error(`❌ 通信エラー: ${err.message}`);
        }
    }

    if (newFetched.length > 0) {
        fs.appendFileSync(FETCHED_LOG, newFetched.join("\n") + "\n");
    }
}

// ==========================================
// クリーンアップ（過去ブロック削除）
// ==========================================
function cleanup() {
    // ★ ここでも日本時間(JST)で計算する
    const nowJST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    nowJST.setMinutes(0, 0, 0);
    const currentJstTime = nowJST.getTime();

    let fetchedLines = [];
    if (fs.existsSync(FETCHED_LOG)) {
        fetchedLines = fs.readFileSync(FETCHED_LOG, "utf-8")
            .split("\n")
            .filter(l => l.trim());
    }

    let newFetched = [];

    for (const line of fetchedLines) {
        const parts = line.split(",");
        if (parts.length < 5) continue;

        const filePath = parts[4];
        const fileName = path.basename(filePath);
        const m = fileName.match(/_(\d{4}-\d{2}-\d{2})_(\d{2})/);

        if (m) {
            // JSTとしてパース
            const fileDate = new Date(`${m[1]}T${m[2]}:00:00+09:00`);

            // ★ 現在時刻より過去の画像なら無慈悲に削除
            if (fileDate.getTime() < currentJstTime) {
                const localPath = path.join(outDir, fileName);
                if (fs.existsSync(localPath)) {
                    try {
                        fs.unlinkSync(localPath);
                        console.log(`🗑️ 古い画像を削除: ${fileName}`);
                    } catch (e) {
                        console.error(`削除失敗: ${fileName}`, e.message);
                    }
                }
                continue; 
            }
        }
        newFetched.push(line);
    }

    if (newFetched.length > 0) {
        fs.writeFileSync(FETCHED_LOG, newFetched.join("\n") + "\n");
    }
}

// ==========================================
// 実行
// ==========================================
(async () => {
    await main();
    cleanup();
})();
