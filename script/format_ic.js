import fs from 'fs';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('エラー: 処理対象の入力ファイルと出力ファイルを指定してください。');
  process.exit(1);
}

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

  // 関東周辺のおおよそのバウンディングボックス（緯度・経度）
  const MIN_LAT = 34.8; // 南端（三浦半島・房総半島南端あたり）
  const MAX_LAT = 37.2; // 北端（栃木・群馬の北端あたり）
  const MIN_LNG = 138.3; // 西端（山梨・静岡の県境あたり）
  const MAX_LNG = 141.0; // 東端（千葉・茨城の東端あたり）

  const formattedData = [];

  geojson.features.forEach(feature => {
      const [lng, lat] = feature.geometry.coordinates;

      // 指定した関東エリアの枠内に収まるものだけを抽出
      if (lat >= MIN_LAT && lat <= MAX_LAT && lng >= MIN_LNG && lng <= MAX_LNG) {
          const name = feature.properties.N06_018 || "名称不明";

          formattedData.push({
              name: name,
              category: "IC",
              lat: lat,
              lng: lng
          });
      }
  });

  fs.writeFileSync(outputFile, JSON.stringify(formattedData, null, 2), 'utf-8');

  console.log(`✅ 処理完了`);
  console.log(`- 入力: ${inputFile}`);
  console.log(`- 出力: ${outputFile}`);
  console.log(`- 変換した関東圏のデータ数: ${formattedData.length}件`);

} catch (error) {
  console.error('処理中にエラーが発生しました:', error);
}
