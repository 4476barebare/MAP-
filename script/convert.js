const fs = require('fs');

// 引数から入力ファイルと出力ファイルを取得 (デフォルト値も設定)
const inputFile = process.argv[2] || 'json/input.geojson';
const outputFile = process.argv[3] || 'json/slimmed_landmarks.json';

try {
  // 1. 元のGeoJSONファイルを読み込む
  const rawData = fs.readFileSync(inputFile, 'utf8');
  const geojsonData = JSON.parse(rawData);

  // 2. 必要な要素だけを抽出してスリム化
  const slimmedData = geojsonData.features.map(feature => {
      const props = feature.properties;
      const coords = feature.geometry.coordinates; // [lng, lat]の順

      // カテゴリの判別ロジック
      let category = "その他";
      if (props.highway === "motorway_junction") {
          category = "IC";
      } else if (props.railway === "station" || props.station === "subway" || props.monorail === "yes") {
          category = "駅";
      } else if (props.highway === "services" || props.highway === "rest_area") {
          category = "道の駅";
      } else if (props.shop || props.building === "retail") {
          category = "商業施設";
      }

      return {
          name: props["name:ja"] || props.name || "名称不明",
          category: category,
          lat: coords[1], // 緯度
          lng: coords[0]  // 経度
      };
  });

  // 3. 新しいJSONファイルとして書き出し
  fs.writeFileSync(outputFile, JSON.stringify(slimmedData, null, 2));
  console.log(`✅ 変換完了！ ${slimmedData.length}件のデータをスリム化し、${outputFile} に保存しました。`);

} catch (error) {
  console.error(`❌ エラーが発生しました (${inputFile}):`, error.message);
  process.exit(1);
}
