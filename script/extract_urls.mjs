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
const results = ['group,name,lat,lng,notes']; // ヘッダー

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
            // URLにアクセスしてHTMLを取得
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const html = await response.text();
            
            let lat = '';
            let lng = '';

            // 修正ポイント: HTMLの中から [経度, 緯度] または [緯度, 経度] のペアをすべて抽出する
            const matches = [...html.matchAll(/\[([0-9]+\.[0-9]+),([0-9]+\.[0-9]+)\]/g)];
            
            for (const match of matches) {
                const v1 = parseFloat(match[1]);
                const v2 = parseFloat(match[2]);

                // 日本の緯度・経度の範囲（緯度: 30〜45 / 経度: 130〜150）に合致するペアを探す
                if (v1 >= 30 && v1 <= 45 && v2 >= 130 && v2 <= 150) {
                    lat = v1.toString();
                    lng = v2.toString();
                    break;
                } else if (v2 >= 30 && v2 <= 45 && v1 >= 130 && v1 <= 150) {
                    lat = v2.toString();
                    lng = v1.toString();
                    break;
                }
            }

            // URLはnotes列に入れておく
            results.push(`shop,${name},${lat},${lng},${url}`);
            
            if (lat && lng) {
                console.log(`✅ 成功: ${name} (Lat: ${lat}, Lng: ${lng})`);
            } else {
                console.log(`⚠️ 座標の取得に失敗: ${name}`);
            }
            
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
