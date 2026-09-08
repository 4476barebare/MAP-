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
    if (!res.ok) {
        console.error(`ログの取得に失敗しました HTTP: ${res.status}`);
        return;
    }
    const text = await res.text();

    const lines = text.trim().split("\n");

    // パース（インデックス4がファイルパス）
    const logs = lines.map(line => {
        const parts = line.split(",");
        const filePath = parts[4];
        // 7項目形式・5項目形式どちらであっても同一判定ができるよう前5要素をキーにする
        const comparisonKey = parts.slice(0, 5).join(",");
        return { filePath, raw: line, comparisonKey };
    });

    // 取得済みログ読み込み
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

    // 保存先作成
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    let newFetched = [];

    // ファイル名から日付を抽出してソートする
    const sorted = logs
        .filter(l => l.filePath && !l.filePath.includes("ERROR"))
        .map(l => {
            const fileName = path.basename(l.filePath);
            const m = fileName.match(/_(\d{4}-\d{2}-\d{2})_(\d{2})/);
            const date = m ? new Date(m[1].replace(/-/g, '/') + ' ' + m[2] + ':00:00') : new Date(0);
            return { ...l, date };
        })
        .sort((a, b) => b.date - a.date);

    for (const log of sorted) {
        if (fetched.has(log.comparisonKey)) continue;

        const fileName = path.basename(log.filePath);
        const imgUrl = log.filePath.replace('./', `${BASE_URL}/cloudGenerator/`);
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
        0,
        0
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
        if (parts.length < 5) continue; // 5項目以上あることを確認

        const filePath = parts[4];
        const fileName = path.basename(filePath);
        const m = fileName.match(/_(\d{4}-\d{2}-\d{2})_(\d{2})/);

        if (m) {
            const fileDate = new Date(m[1].replace(/-/g, '/') + ' ' + m[2] + ':00:00');

            // 現在時刻より3時間以上古い画像は削除対象
            if (fileDate.getTime() < currentBlock.getTime() - (3 * 60 * 60 * 1000)) {
                const localPath = path.join(outDir, fileName);
                if (fs.existsSync(localPath)) {
                    try {
                        fs.unlinkSync(localPath);
                        console.log(`🗑️ 古い画像を削除: ${fileName}`);
                    } catch (e) {
                        console.error(`削除失敗: ${fileName}`, e.message);
                    }
                }
                continue; // ログに残さずスキップ
            }
        }

        newFetched.push(line);
    }

    // ログの安全ガード（空配列による誤消去を防止）
    if (newFetched.length > 0) {
        fs.writeFileSync(FETCHED_LOG, newFetched.join("\n") + "\n");
    }
}

// ==========================================
// 実行
// ==========================================
(async () => {
    await main();   // ★ 先に取得を確実に終わらせる
    cleanup();      // ★ その後クリーンアップ
})();
