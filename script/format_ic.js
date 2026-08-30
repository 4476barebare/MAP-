import fs from 'fs';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('エラー: 処理対象の入力ファイルと出力ファイルを指定してください。');
  process.exit(1);
}

// YAMLから渡された引数を受け取る
const inputFile = args[0];
const outputFile = args[1];

if (!fs.existsSync(inputFile)) {
    console.error(`エラー: 指定されたファイルが見つかりません: ${inputFile}`);
    process.exit(1);
}

try {
  const rawData = fs.readFileSync(inputFile, 'utf-8');
  const geojson = JSON.parse(rawData);

  if (!geojson.features || !Array.isArray(geojson.features)) {
      console.error('エラー: 有効なGeoJSON形式（features配列）が見つかりません。');
      process.exit(1);
  }

  // 国交省データのプロパティ「N06_018」を名前として抽出
  const formattedData = geojson.features.map(feature => {
      const [lng, lat] = feature.geometry.coordinates;
      const name = feature.properties.N06_018 || "名称不明";

      return {
          name: name,
          category: "IC",
          lat: lat,
          lng: lng
      };
  });

  // 指定された出力パスに保存
  fs.writeFileSync(outputFile, JSON.stringify(formattedData, null, 2), 'utf-8');

  console.log(`✅ 処理完了`);
  console.log(`- 入力: ${inputFile}`);
  console.log(`- 出力: ${outputFile}`);
  console.log(`- 変換したデータ数: ${formattedData.length}件`);

} catch (error) {
  console.error('処理中にエラーが発生しました:', error);
}
