import fs from 'fs';
import path from 'path';

// 1. 引数を取得
const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
    console.error('❌ エラー: 入力ファイルまたは出力ファイルのパスが指定されていません。');
    process.exit(1);
}

if (!fs.existsSync(inputPath)) {
    console.error(`❌ エラー: 入力ファイルが見つかりません: ${inputPath}`);
    process.exit(1);
}

const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// 2. CSVを読み込む
const csvData = fs.readFileSync(inputPath, 'utf8');
const lines = csvData.trim().split('\n');

if (lines.length < 2) {
    console.error('❌ エラー: データがありません。');
    process.exit(1);
}

// 🌟 改良ポイント: ヘッダーから自動的に列番号を取得する
const headers = lines[0].split(',').map(h => h.trim());
const nameIdx = headers.indexOf('name');
const latIdx = headers.indexOf('lat');
const lngIdx = headers.indexOf('lng');

if (nameIdx === -1 || latIdx === -1 || lngIdx === -1) {
    console.error(`❌ エラー: CSV内に 'name', 'lat', 'lng' のいずれかの列が見つかりません。`);
    console.error(`現在の列: ${headers.join(', ')}`);
    process.exit(1);
}

const fishData = {};

// 3. データ行のループ処理
for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const cols = lines[i].split(',');
    
    // 見つけ出した列番号を使ってデータを取得
    const fishName = cols[nameIdx] ? cols[nameIdx].trim() : '';
    const lat = cols[latIdx] ? Number(cols[latIdx].trim()) : NaN;
    const lng = cols[lngIdx] ? Number(cols[lngIdx].trim()) : NaN;

    // 名前がない、または緯度経度が数値に変換できない(NaN)場合はスキップ
    if (!fishName || isNaN(lat) || isNaN(lng)) continue;

    // 魚種ごとに配列を用意して座標を詰め込む
    if (!fishData[fishName]) {
        fishData[fishName] = [];
    }
    fishData[fishName].push(lat, lng);
}

// --- 前半の読み込み処理などはそのまま ---

// 4. 改行を入れて見やすく出力するための文字列組み立て
let jsonString = '{\n';
const fishNames = Object.keys(fishData);

for (let i = 0; i < fishNames.length; i++) {
    const name = fishNames[i];
    const coordsArray = JSON.stringify(fishData[name]); // 座標配列は1行にする
    
    // "アジ": [35.1, 140.1, 35.2, 140.2], のような形式で改行して追加
    jsonString += `  "${name}": ${coordsArray}`;
    
    // 最後の要素でなければカンマをつける
    if (i < fishNames.length - 1) {
        jsonString += ',\n';
    } else {
        jsonString += '\n';
    }
}
jsonString += '}\n';

// 5. JSONとして出力
fs.writeFileSync(outputPath, jsonString);
console.log(`✅ 変換成功: ${inputPath} -> ${outputPath}`);
console.log(`抽出された魚種: ${fishNames.join(', ')}`);
