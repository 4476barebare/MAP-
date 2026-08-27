import fs from 'fs';

// 引数から入力ファイル2つと出力ファイルを取得
const inputFile1 = process.argv[2] || 'json/TOKYO_jr.geojson';
const inputFile2 = process.argv[3] || 'json/TOKYO_private.geojson';
const outputFile = process.argv[4] || 'json/TOKYO_slim.json';

try {
  // 1. 2つのGeoJSONファイルを読み込む
  const rawData1 = fs.readFileSync(inputFile1, 'utf8');
  const geojsonData1 = JSON.parse(rawData1);
  
  const rawData2 = fs.readFileSync(inputFile2, 'utf8');
  const geojsonData2 = JSON.parse(rawData2);

  // features配列を結合 (スプレッド構文で2つの配列を1つにガッチャンコします)
  const allFeatures = [...geojsonData1.features, ...geojsonData2.features];

  // 2. 必要な要素だけを抽出してスリム化
  const slimmedData = allFeatures.map(feature => {
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
  console.log(`✅ 変換・結合完了！ 合計 ${slimmedData.length} 件のデータをスリム化し、${outputFile} に保存しました。`);

} catch (error) {
  console.error("❌ エラーが発生しました:", error.message);
  process.exit(1);
}
