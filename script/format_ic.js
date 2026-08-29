const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('エラー: 処理対象のGeoJSONファイルを指定してください。');
  console.error('使用方法: node script/format_ic.js <ファイル名>');
  process.exit(1);
}

const inputFile = args[0];

if (!fs.existsSync(inputFile)) {
    console.error(`エラー: 指定されたファイルが見つかりません: ${inputFile}`);
    process.exit(1);
}

// 出力ファイル名を生成 (例: input.geojson -> input_formatted.json)
const parsedPath = path.parse(inputFile);
const outputFile = path.join(parsedPath.dir, `${parsedPath.name}_formatted.json`);

try {
  const rawData = fs.readFileSync(inputFile, 'utf-8');
  const geojson = JSON.parse(rawData);

  if (!geojson.features || !Array.isArray(geojson.features)) {
      console.error('エラー: 有効なGeoJSON形式（features配列）が見つかりません。');
      process.exit(1);
  }

  // N06_018(施設名) と coordinates(座標) を抽出
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

  fs.writeFileSync(outputFile, JSON.stringify(formattedData, null, 2), 'utf-8');

  console.log(`✅ スリム化処理完了`);
  console.log(`- 元ファイル: ${inputFile}`);
  console.log(`- 出力ファイル: ${outputFile}`);
  console.log(`- 変換したデータ数: ${formattedData.length}件`);

} catch (error) {
  console.error('処理中にエラーが発生しました:', error);
}
