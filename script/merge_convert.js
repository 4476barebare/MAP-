import fs from 'fs';

// 引数の最後を出力ファイル、それ以外すべてを入力ファイルとして扱う
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("❌ エラー: 結合する入力ファイルと出力ファイルを指定してください。");
  process.exit(1);
}

const outputFile = args.pop(); // 一番最後の引数を出力ファイル名とする
const inputFiles = args;       // 残りの引数をすべて入力ファイルとする

try {
  let mergedData = [];

  // 各入力ファイルを読み込んで結合
  for (const file of inputFiles) {
    if (!fs.existsSync(file)) {
      console.warn(`⚠️ 警告: ファイルが見つかりませんスキップします: ${file}`);
      continue;
    }
    const rawData = fs.readFileSync(file, 'utf8');
    const parsedData = JSON.parse(rawData);

    // 既にスリム化済みのJSON（配列）であることを前提として結合
    if (Array.isArray(parsedData)) {
      mergedData.push(...parsedData);
    } else {
       console.error(`❌ エラー: ${file} は配列形式のJSON（スリム化済み）ではありません。`);
       process.exit(1);
    }
  }

  // 新しいJSONファイルとして書き出し
  fs.writeFileSync(outputFile, JSON.stringify(mergedData, null, 2));
  console.log(`✅ 結合完了！ 合計 ${mergedData.length} 件のデータを ${outputFile} に保存しました。`);

} catch (error) {
  console.error("❌ エラーが発生しました:", error.message);
  process.exit(1);
}
