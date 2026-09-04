import fs from 'fs';
import path from 'path';

// 1. GitHub Actionsから渡された引数を取得
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('❌ エラー: 入力CSVと出力JSONのパスを指定してください。');
  console.error('使用方法: node script/convert_location.js <入力CSV> <出力JSON>');
  process.exit(1);
}

const inputPath = args[0];
const outputPath = args[1];

if (!fs.existsSync(inputPath)) {
  console.error(`❌ エラー: 入力ファイルが見つかりません: ${inputPath}`);
  process.exit(1);
}

try {
  // 2. CSVを読み込んで処理
  const csvData = fs.readFileSync(inputPath, 'utf8');
  const lines = csvData.trim().split('\n');

  // 1行目(ヘッダー)をスキップしてパース
  const allRows = lines.slice(1).map(line => {
    const cols = line.split(',');

    return {
      name: cols[0] ? cols[0].trim() : '',
      // ★ zoomが空欄の場合は "" にする（フロントが空文字列チェックをしているため）
      zoom: cols[1] && cols[1].trim() !== '' ? parseFloat(cols[1]) : '',
      individualId: cols[2] ? cols[2].trim() : '',
      lat: cols[3] && cols[3].trim() !== '' ? parseFloat(cols[3]) : null,
      lng: cols[4] && cols[4].trim() !== '' ? parseFloat(cols[4]) : null,
      areaId: cols[5] ? cols[5].trim() : '',
      url: cols[6] ? cols[6].trim() : '',
      notes: cols[7] ? cols[7].trim() : '',
      icon: cols[8] ? cols[8].trim().toLowerCase() : null,
      whether: cols[9] ? cols[9].trim() : '',
      // ★ type が無い場合は確実に空文字列（""）にする
      type: cols[10] ? cols[10].trim() : ''
    };
  });


  // 3. 出力先のディレクトリが存在しない場合は作成
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 4. JSONとして出力
  fs.writeFileSync(outputPath, JSON.stringify(allRows, null, 2), 'utf8');
  console.log(`✅ 変換成功: ${inputPath} -> ${outputPath} (${allRows.length}件)`);

} catch (error) {
  console.error('処理中にエラーが発生しました:', error);
  process.exit(1);
}