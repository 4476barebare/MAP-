import fs from 'fs';
import path from 'path';

// 1. GitHub Actionsから渡された引数を取得 (入力ファイルのみ)
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('❌ エラー: 入力CSVのパスを指定してください。');
  console.error('使用方法: node script/convert_location.js <入力CSV>');
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
  // 2. CSVを読み込んで処理
  const csvData = fs.readFileSync(inputPath, 'utf8');
  const lines = csvData.trim().split('\n');

  // 1行目(ヘッダー)をスキップしてパース
  const allRows = lines.slice(1).map(line => {
    const cols = line.split(',');
    return {
      name: cols[0]?.trim() || undefined,
      zoom: cols[1]?.trim() ? parseFloat(cols[1]) : undefined,
      individualId: cols[2]?.trim() || undefined,
      lat: cols[3]?.trim() ? parseFloat(cols[3]) : undefined,
      lng: cols[4]?.trim() ? parseFloat(cols[4]) : undefined,
      areaId: cols[5]?.trim() || undefined,
      url: cols[6]?.trim() || undefined,
      notes: cols[7]?.trim() || undefined,
      icon: cols[8]?.trim() ? cols[8].trim().toLowerCase() : undefined,
      whether: cols[9]?.trim() || undefined,
      type: cols[10]?.trim() || undefined
    };
  });

  // 3. 出力先のディレクトリが存在しない場合は作成（今回は同フォルダなので基本存在します）
  if (parsedPath.dir !== '' && !fs.existsSync(parsedPath.dir)) {
    fs.mkdirSync(parsedPath.dir, { recursive: true });
  }

  // 4. JSONとして出力 (すでにファイルが存在する場合は自動で上書きされます)
  fs.writeFileSync(outputPath, JSON.stringify(allRows, null, 2), 'utf8');
  console.log(`✅ 変換成功: ${inputPath} -> ${outputPath} (${allRows.length}件)`);

} catch (error) {
  console.error('処理中にエラーが発生しました:', error);
  process.exit(1);
}
