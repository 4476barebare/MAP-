import fs from 'fs';
import path from 'path';

// 1. GitHub Actionsから渡された引数を取得 (入力ファイルのみ)
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('❌ エラー: 入力CSVのパスを指定してください。');
  console.error('使用方法: node script/convert_shop.js <入力CSV>');
  process.exit(1);
}

const inputPath = args[0];

if (!fs.existsSync(inputPath)) {
  console.error(`❌ エラー: 入力ファイルが見つかりません: ${inputPath}`);
  process.exit(1);
}

// 💡 入力パスから出力ファイルパスを自動生成（同フォルダ、同名の.json）
const parsedPath = path.parse(inputPath);
const outputPath = path.join(parsedPath.dir, `${parsedPath.name}.json`);

try {
  // 2. CSVを読み込んで処理 (BOMなどの不要な文字も除去)
  const csvData = fs.readFileSync(inputPath, 'utf8');
  const lines = csvData.replace(/^\uFEFF/, '').trim().split(/\r?\n/);

  if (lines.length < 2) {
    console.error('❌ エラー: データがありません。');
    process.exit(1);
  }

  // 1行目(ヘッダー)から列名と列数を完全自動取得
  const headers = lines[0].split(',').map(h => h.trim());
  const allRows = [];

  // 3. データ行の処理
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = lines[i].split(',');
    
    const rowObj = {};

    // 取得したヘッダーの数だけループしてデータを格納
    headers.forEach((header, index) => {
      if (header && cols[index] && cols[index].trim() !== '') {
        const val = cols[index].trim();
        
        // latとlngは自動的に数値(Float)に変換
        if (header === 'lat' || header === 'lng') {
          const num = parseFloat(val);
          if (!isNaN(num)) {
            rowObj[header] = num;
          }
        } else {
          // それ以外の列は文字列として格納
          rowObj[header] = val;
        }
      }
    });

    if (Object.keys(rowObj).length > 0) {
      allRows.push(rowObj);
    }
  }

  // 4. 出力先のディレクトリが存在しない場合は作成
  if (parsedPath.dir !== '' && !fs.existsSync(parsedPath.dir)) {
    fs.mkdirSync(parsedPath.dir, { recursive: true });
  }

  // 5. JSONとして出力 (すでにファイルが存在する場合は自動で上書きされます)
  fs.writeFileSync(outputPath, JSON.stringify(allRows, null, 2), 'utf8');
  console.log(`✅ 変換成功: ${inputPath} -> ${outputPath} (${allRows.length}件)`);
  console.log(`抽出された列: ${headers.join(', ')}`);

} catch (error) {
  console.error('処理中にエラーが発生しました:', error);
  process.exit(1);
}
