import fs from 'fs';
import path from 'path';

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
    console.error('❌ エラー: 入力ファイルまたは出力ファイルのパスが指定されていません。');
    process.exit(1);
}

const csvData = fs.readFileSync(inputPath, 'utf8');
const lines = csvData.trim().split('\n');

const headers = lines[0].split(',').map(h => h.trim());

// 必須カラムのインデックスを取得
const regIdx = headers.indexOf('registration');
const parentIdx = headers.indexOf('parent');
const nameIdx = headers.indexOf('name');
const latIdx = headers.indexOf('lat');
const lngIdx = headers.indexOf('lng');

// 必須カラム以外の「将来拡張されるかもしれない列」のインデックスを抽出
const extraColumns = [];
headers.forEach((h, idx) => {
    if (!['registration', 'parent', 'name', 'lat', 'lng'].includes(h)) {
        extraColumns.push({ name: h, index: idx });
    }
});

const resultData = {};

for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const cols = lines[i].split(',');
    
    const reg = cols[regIdx] ? cols[regIdx].trim() : '';
    const parent = cols[parentIdx] ? cols[parentIdx].trim() : '';
    const fishName = cols[nameIdx] ? cols[nameIdx].trim() : '';
    const lat = cols[latIdx] ? cols[latIdx].trim() : '';
    const lng = cols[lngIdx] ? cols[lngIdx].trim() : '';

    // 必須データが欠けている場合はスキップ
    if (!reg || !parent || !fishName || !lat || !lng) continue;

    // 大分類（registration）の作成
    if (!resultData[reg]) {
        resultData[reg] = {};
    }
    
    // 中分類（parent）の作成
    if (!resultData[reg][parent]) {
        resultData[reg][parent] = {};
    }

    // 小分類（魚種）の作成
    if (!resultData[reg][parent][fishName]) {
        resultData[reg][parent][fishName] = {
            coords: "" // 初期値は空文字列
        };
    }

    // ★座標を「lat,lng」の形でフォーマット
    const coordString = `${lat},${lng}`;

    // 既に座標データが入っている場合は「|」で繋ぎ、初回ならそのまま代入
    if (resultData[reg][parent][fishName].coords === "") {
        resultData[reg][parent][fishName].coords = coordString;
    } else {
        resultData[reg][parent][fishName].coords += `|${coordString}`;
    }

    // 拡張列のデータを格納（空欄でなければ追加）
    extraColumns.forEach(ext => {
        const val = cols[ext.index] ? cols[ext.index].trim() : '';
        if (val !== '') {
            if (resultData[reg][parent][fishName][ext.name] === undefined) {
                // 数値化できるものは数値として、それ以外は文字列として保持
                resultData[reg][parent][fishName][ext.name] = isNaN(val) ? val : Number(val);
            }
        }
    });
}

// 出力先のディレクトリを作成
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// JSON出力
fs.writeFileSync(outputPath, JSON.stringify(resultData, null, 2));
console.log(`✅ 変換成功: ${inputPath} -> ${outputPath}`);
