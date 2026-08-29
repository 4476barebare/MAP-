import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('エラー: 処理対象のJSONファイルを指定してください。');
  process.exit(1);
}

const inputFile = args[0];

if (!fs.existsSync(inputFile)) {
    console.error(`エラー: 指定されたファイルが見つかりません: ${inputFile}`);
    process.exit(1);
}

const parsedPath = path.parse(inputFile);
const outputFile = path.join(parsedPath.dir, `${parsedPath.name}_no_ic${parsedPath.ext}`);

try {
  const rawData = fs.readFileSync(inputFile, 'utf-8');
  const data = JSON.parse(rawData);

  const filteredData = data.filter(item => item.category !== 'IC');

  fs.writeFileSync(outputFile, JSON.stringify(filteredData, null, 2), 'utf-8');

  console.log(`✅ 処理完了`);
  console.log(`- 元ファイル: ${inputFile}`);
  console.log(`- 出力ファイル: ${outputFile}`);
  console.log(`- 元のデータ数: ${data.length}件`);
  console.log(`- 処理後のデータ数: ${filteredData.length}件`);
  console.log(`- 🗑️ 削除されたICの数: ${data.length - filteredData.length}件`);
} catch (error) {
  console.error('処理中にエラーが発生しました:', error);
}
