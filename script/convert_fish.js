const fs = require('fs');
const path = require('path');

// 1. GitHub Actionsから渡された引数を取得
// process.argv[2] が入力ファイル、process.argv[3] が出力ファイル
const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
    console.error('❌ エラー: 入力ファイルまたは出力ファイルのパスが指定されていません。');
    process.exit(1);
}

// 2. 入力ファイルが存在するかチェック
if (!fs.existsSync(inputPath)) {
    console.error(`❌ エラー: 入力ファイルが見つかりません: ${inputPath}`);
    process.exit(1);
}

// 3. 出力先のディレクトリが存在しない場合は作成
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// 4. CSVを読み込んで処理
const csvData = fs.readFileSync(inputPath, 'utf8');
const lines = csvData.trim().split('\n');

const fishData = {};

for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const cols = lines[i].split(',');
    
    // ※ 列番号は実際の IBARAKI_fish.csv に合わせて調整してください
    // ここでは 0列目=名前, 1列目=lat, 2列目=lng と仮定しています
    const fishName = cols[0] ? cols[0].trim() : '';
    const lat = cols[1] ? Number(cols[1].trim()) : null;
    const lng = cols[2] ? Number(cols[2].trim()) : null;

    if (!fishName || !lat || !lng) continue;

    if (!fishData[fishName]) {
        fishData[fishName] = [];
    }

    fishData[fishName].push(lat, lng);
}

// 5. JSONとして出力
fs.writeFileSync(outputPath, JSON.stringify(fishData));
console.log(`✅ 変換成功: ${inputPath} -> ${outputPath}`);
