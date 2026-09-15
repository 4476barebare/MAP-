import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const inputFile = process.argv[2];
const outputFile = process.argv[3] || 'processed_places.csv';

if (!inputFile) {
    console.error('❌ 入力ファイル名が指定されていません。');
    process.exit(1);
}

const inputPath = path.resolve(inputFile);
const dataDir = path.resolve('data');
const outputPath = path.join(dataDir, outputFile);

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(inputPath)) {
    console.error(`❌ 入力ファイルが見つかりません: ${inputPath}`);
    process.exit(1);
}

const csvData = fs.readFileSync(inputPath, 'utf8').trim().split('\n');
const results = ['group,name,lat,lng,notes']; 

async function processUrls() {
    console.log(`🚀 ブラウザ(Puppeteer)を起動して処理を開始します...`);
    
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    for (let i = 1; i < csvData.length; i++) {
        const line = csvData[i];
        if (!line.trim()) continue;

        const parts = line.split(',');
        if (parts.length < 3) continue;

        // 元のCSVにある名前（念のため保持）
        const originalName = parts[0].trim(); 
        const url = parts[2].trim();

        if (!url.startsWith('http')) {
            results.push(`shop,${originalName},,,,`);
            continue;
        }

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            
            // リダイレクトとJSの実行を待つ
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // デコードして日本語化された最終URLを取得
            const finalUrl = decodeURIComponent(page.url());
            let lat = '';
            let lng = '';
            let address = '';

            // ★ 新しい抽出ロジック ★
            // 例: /maps/place/〒341-0003+埼玉県三郷市彦成２丁目９６−２+ビーズブーン/@35.8520839,139.8484391
            const match = finalUrl.match(/place\/([^\/]+)\/@([0-9.-]+),([0-9.-]+)/);
            
            if (match) {
                // "+" を半角スペースに変換
                const extractedText = match[1].replace(/\+/g, ' '); 
                
                // 抽出したテキストから郵便番号や「日本、」といった不要な文字を掃除
                address = extractedText
                    .replace(/^日本、\s*/, '') // 先頭の「日本、」を削除
                    .replace(/〒[0-9]{3}-[0-9]{4}\s*/, ''); // 郵便番号を削除
                
                lat = match[2];
                lng = match[3];
            } else {
                // フォールバック（座標だけはHTMLから探す）
                const content = await page.content();
                const metaMatch = content.match(/center=([0-9.-]+)(?:,|%2C)([0-9.-]+)/);
                if (metaMatch) {
                    lat = metaMatch[1];
                    lng = metaMatch[2];
                }
            }

            // notes列に抽出した住所を入れる
            results.push(`shop,${originalName},${lat},${lng},${address}`);
            
            if (lat && lng) {
                console.log(`✅ 成功: ${originalName} -> 住所: ${address} (Lat: ${lat}, Lng: ${lng})`);
            } else {
                console.log(`⚠️ 抽出失敗: ${originalName}`);
            }
            
        } catch (error) {
            console.error(`❌ エラー: ${originalName}`, error.message);
            results.push(`shop,${originalName},,,,${url}`);
        }
    }

    await browser.close();

    fs.writeFileSync(outputPath, results.join('\n'), 'utf8');
    console.log(`\n🎉 完了！ ${results.length - 1}件のデータを data/${outputFile} に保存しました。`);
}

processUrls();
