import fs from 'fs';
import path from 'path';

// GitHub Actions（コマンドライン）から渡された引数を受け取る
const inputFile = process.argv[2];
const outputFile = process.argv[3] || 'processed_places.csv';

if (!inputFile) {
    console.error('❌ 入力ファイル名が指定されていません。');
    process.exit(1);
}

// パスの解決
const inputPath = path.resolve(inputFile);
const dataDir = path.resolve('data');
const outputPath = path.join(dataDir, outputFile);

// dataディレクトリが存在しない場合は作成する
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// CSVを読み込む
if (!fs.existsSync(inputPath)) {
    console.error(`❌ 入力ファイルが見つかりません: ${inputPath}`);
    process.exit(1);
}

const csvData = fs.readFileSync(inputPath, 'utf8').trim().split('\n');
// 出力用のヘッダー（フロントエンドの仕様に合わせる）
const results = ['group,name,lat,lng,notes']; 

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function processUrls() {
    console.log(`🚀 処理を開始します... 入力: ${inputFile} -> 出力: data/${outputFile}`);

    // 1行目（ヘッダー）をスキップしてループ
    for (let i = 1; i < csvData.length; i++) {
        const line = csvData[i];
        if (!line.trim()) continue;

        const parts = line.split(',');
        if (parts.length < 3) continue;

        const name = parts[0].trim();
        const url = parts[2].trim();

        if (!url.startsWith('http')) {
            results.push(`shop,${name},,,,`);
            continue;
        }

        try {
            // URLにアクセスしてリダイレクト先を取得
            const response = await fetch(url);
            const finalUrl = decodeURIComponent(response.url);

            let lat = '';
            let lng = '';

            // パターン1: 展開後のURL内に @緯度,経度 が含まれている場合
            const match1 = finalUrl.match(/@([0-9.-]+),([0-9.-]+)/);
            if (match1) {
                lat = match1[1];
                lng = match1[2];
            } else {
                // パターン2: ページ内のHTMLソースコードから座標を抜き出す
                const html = await response.text();
                const match2 = html.match(/\[\[\[([0-9.-]+),([0-9.-]+)\]/);
                if (match2) {
                    lng = match2[1];
                    lat = match2[2];
                }
            }

            // URLはnotes列に入れておく
            results.push(`shop,${name},${lat},${lng},${url}`);
            console.log(`✅ 成功: ${name} (Lat: ${lat}, Lng: ${lng})`);
            
            // サーバー負荷とブロック回避のため少し待機
            await sleep(500); 

        } catch (error) {
            console.error(`❌ エラー: ${name}`, error.message);
            results.push(`shop,${name},,,,${url}`);
        }
    }

    // dataディレクトリに出力
    fs.writeFileSync(outputPath, results.join('\n'), 'utf8');
    console.log(`\n🎉 完了！ ${results.length - 1}件のデータを data/${outputFile} に保存しました。`);
}

processUrls();
