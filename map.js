// map.js
const regionGroups = {
  Path_1: ['hokkaido'],
  Path_2: ['aomori','iwate','akita','miyagi','yamagata','fukushima'],
  Path_3: ['niigata','gunma','tochigi','chiba','ibaraki','tokyo','saitama','kanagawa'],
  Path_4: ['shizuoka','yamanashi','nagano','ishikawa','toyama','gifu','aichi'],
  Path_5: ['mie','nara','wakayama','osaka','shiga','kyoto','hyogo'],
  Path_6: ['tottori','shimane','okayama','hiroshima','yamaguchi','tokushima','kagawa','kochi','ehime'],
  Path_7: ['fukuoka','saga','nagasaki','oita','kumamoto','miyazaki','kagoshima'],
  Path_8: ['okinawa']
};

document.addEventListener('DOMContentLoaded', ()=>{

  const mapDiv = document.getElementById('map');

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      mapDiv.innerHTML = svgText;

      // 地域グループの初期設定
      Object.keys(regionGroups).forEach(groupId => {
        const path = document.getElementById(groupId);
        if(path){
          path.setAttribute('fill', 'transparent');       // 初期は透明
          path.setAttribute('stroke', '#191970');         // 枠線は紺
          path.setAttribute('stroke-width', '1.5');
          path.setAttribute('stroke-linejoin', 'round');
          path.style.cursor = 'pointer';

          // グループクリックで拡大
          path.addEventListener('click', ()=>{
            expandRegionGroup(groupId);
          });
        }
      });

      // 都道府県は非表示にする
      Object.values(regionGroups).flat().forEach(prefId => {
        const prefPath = document.getElementById(prefId);
        if(prefPath){
          prefPath.style.display = 'none';
          prefPath.setAttribute('fill', 'transparent'); // 色分けなし
          prefPath.setAttribute('stroke', '#191970');
          prefPath.setAttribute('stroke-width', '1.2');
        }
      });
    })
    .catch(err => console.error('SVG読み込みエラー:', err));

  function expandRegionGroup(groupId){
    const prefectures = regionGroups[groupId];

    // 一旦全都道府県を非表示に戻す
    Object.values(regionGroups).flat().forEach(prefId=>{
      const prefPath = document.getElementById(prefId);
      if(prefPath){
        prefPath.style.display = 'none';
      }
    });

    // クリックされたグループ内の都道府県のみ表示
    prefectures.forEach(prefId=>{
      const prefPath = document.getElementById(prefId);
      if(prefPath){
        prefPath.style.display = 'inline';
      }
    });
  }

});