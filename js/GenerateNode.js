const fs = require('fs');
const path = require('path');
const http = require('https'); // サーバーがHTTPSの場合は 'https' に変更してください

// ==========================================
// 設定項目
// ==========================================
const LOG_FILE_PATH = 'https://turiiko.shop/cloudGenerator/run_log.txt'); // PHP側と共通のログファイルパス
const PHP_API_URL = 'https://turiiko.shop/cloudGenerator/run_v2.php'; // 修正したPHPのURL

// ここに設定データを直書き
const RAW_AREA_DATA = `
CHIBA,34.7/36.0/139.6/141.1/0.15/9
KANAGAWA,35.75/138.9/34.9/139.9/0.15/9.5
`;

// ==========================================
// 1. 固定スロット判定ロジック (JST基準)
// ==========================================
function getActiveSlots() {
    const nowUtc = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const nowJst = new Date(nowUtc.getTime() + jstOffset);

    const currentHour = nowJst.getUTCHours(); // JSTの「時」

    const yyyy = nowJst.getUTCFullYear();
    const mm = String(nowJst.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(nowJst.getUTCDate()).padStart(2, '0');

    let relativeHours = [];

    // 旧PHPの判定ロジック
    if (currentHour >= 0 && currentHour < 6) {
        relativeHours = [9, 12, 15, 18];
    } else if (currentHour >= 6 && currentHour < 18) {
        relativeHours = [21, 24, 27, 30];
    } else {
        relativeHours = [33, 36, 39, 42];
    }

    return relativeHours.map(hours => {
        const slotDate = new Date(Date.UTC(yyyy, nowJst.getUTCMonth(), nowJst.getUTCDate(), 0, 0, 0));
        slotDate.setTime(slotDate.getTime() + (hours * 60 * 60 * 1000));
        
        const sY = slotDate.getUTCFullYear();
        const sM = String(slotDate.getUTCMonth() + 1).padStart(2, '0');
        const sD = String(slotDate.getUTCDate()).padStart(2, '0');
        const sH = String(slotDate.getUTCHours()).padStart(2, '0');
        
        return `${sY}-${sM}-${sD}_${sH}`;
    });
}

// ==========================================
// 2. 直書きテキストデータのパース
// ==========================================
function parseDirectAreaData(rawText) {
    const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '');

    return lines.map(line => {
        // カンマで「県名」と「数値配列部分」に分ける
        const commaParts = line.split(',');
        if (commaParts.length < 2) return null;

        const prefname = commaParts[0].trim().toUpperCase();
        // / 区切りで各パラメータに分ける
        const numParts = commaParts[1].split('/').map(p => p.trim());
        if (numParts.length < 6) return null;

        // 数値に変換
        const v1 = parseFloat(numParts[0]); // lat
        const v2 = parseFloat(numParts[1]); // lat
        const v3 = parseFloat(numParts[2]); // lon
        const v4 = parseFloat(numParts[3]); // lon
        const step = parseFloat(numParts[4]);
        const zoom = parseFloat(numParts[5]);

        // 緯度・経度のMin/Maxが前後していても正しく割り振る
        const latMin = Math.min(v1, v2);
        const latMax = Math.max(v1, v2);
        const lonMin = Math.min(v3, v4);
        const lonMax = Math.max(v3, v4);

        // PHP側が求める「カンマ区切りの7項目」を組み立てる
        const csv7Fields = `${prefname},${latMin},${latMax},${lonMin},${lonMax},${step},${zoom}`;

        return {
            prefname: prefname,
            rawCsvLineWithoutDate: csv7Fields
        };
    }).filter(item => item !== null);
}

// ==========================================
// 3. ログファイルの成否チェック
// ==========================================
function checkLogStatus(identifier) {
    if (!fs.existsSync(LOG_FILE_PATH)) {
        return 'missing';
    }

    const logContent = fs.readFileSync(LOG_FILE_PATH, 'utf-8');
    const lines = logContent.split(/\r?\n/).reverse();

    for (const line of lines) {
        if (line.includes(identifier)) {
            if (line.startsWith('ERROR')) {
                return 'error';
            }
            return 'success';
        }
    }
    return 'missing';
}

// ==========================================
// 4. HTTP GET リクエスト送信
// ==========================================
function sendPhpRequest(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? require('https') : http;
        client.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        }).on('error', (err) => reject(err));
    });
}

// ==========================================
// メイン処理
// ==========================================
async function main() {
    console.log('--- 処理開始 ---');
    
    // 現在必要なターゲット時間枠を取得
    const targetSlots = getActiveSlots();
    console.log(`現在の自動判定スロット: ${targetSlots.join(', ')}`);

    // 直書きテキストから地域リストを取得
    const areas = parseDirectAreaData(RAW_AREA_DATA);
    console.log(`パースされた地域数: ${areas.length}`);

    const queue = [];

    // 全地域 × 全スロット をチェック
    for (const area of areas) {
        for (const slot of targetSlots) {
            const identifier = `${area.prefname}_${slot}`;
            const status = checkLogStatus(identifier);

            if (status === 'missing' || status === 'error') {
                const apiParam = `${area.rawCsvLineWithoutDate},${slot}`;
                queue.push({
                    identifier: identifier,
                    param: apiParam,
                    status: status
                });
            }
        }
    }

    console.log(`不足・エラーが検出された総枠数: ${queue.length}`);

    if (queue.length === 0) {
        console.log('すべての画像が生成済みです。処理を終了します。');
        return;
    }

    // 最大4件を抽出
    const targets = queue.slice(0, 4);
    console.log(`そのうち、最大4件をピックアップしてPHPへリクエストします。`);

    // URLパラメーター（area1=..., area2=...）の組み立て
    const queryParts = targets.map((target, index) => {
        return `area${index + 1}=${encodeURIComponent(target.param)}`;
    });

    const finalUrl = `${PHP_API_URL}?${queryParts.join('&')}`;
    console.log(`送信リクエストURL:\n${finalUrl}\n`);

    try {
        console.log('PHP APIを呼び出しています...');
        const response = await sendPhpRequest(finalUrl);
        console.log(`PHPからのレスポンス (Status: ${response.statusCode}):`);
        console.log(response.body);
    } catch (error) {
        console.error('PHP APIの呼び出し中にエラーが発生しました:', error.message);
    }

    console.log('--- 処理終了 ---');
}

main();
