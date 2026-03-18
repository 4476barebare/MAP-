// map.js
document.addEventListener('DOMContentLoaded', ()=>{

  const mapDiv = document.getElementById('map');

  // 都道府県データ（Path IDsと名称をグループ単位で管理）
  const regions = {
    Path_1: ['hokkaido'],
    Path_2: ['aomori','iwate','akita','miyagi','yamagata','fukushima'],
    Path_3: ['niigata','gunma','tochigi','chiba','ibaraki','tokyo','saitama','kanagawa'],
    Path_4: ['shizuoka','yamanashi','nagano','ishikawa','toyama','gifu','aichi'],
    Path_5: ['mie','nara','wakayama','osaka','shiga','kyoto','hyogo'],
    Path_6: ['tottori','shimane','okayama','hiroshima','yamaguchi','tokushima','kagawa','kochi','ehime'],
    Path_7: ['fukuoka','saga','nagasaki','oita','kumamoto','miyazaki','kagoshima'],
    Path_8: ['okinawa']
  };

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      mapDiv.innerHTML = svgText;

      // 初期状態：地域グループ塗り透明、枠は青
      Object.keys(regions).forEach(groupId=>{
        const group = document.getElementById(groupId);
        if(group){
          group.setAttribute('fill', 'transparent');   // 塗りなし
          group.setAttribute('stroke', '#191970');     // グループ枠青
          group.setAttribute('stroke-width', '1.5');
        }
      });

      // 都道府県初期状態
      Object.values(regions).flat().forEach(prefId=>{
        const pref = document.getElementById(prefId);
        if(pref){
          pref.setAttribute('fill', 'transparent');   // 塗りなし
          pref.setAttribute('stroke', '#191970');     // 枠青
          pref.setAttribute('stroke-width', '1.5');
          pref.setAttribute('stroke-linejoin', 'round');
          pref.style.cursor = 'pointer';
          pref.style.display = 'none';                // 初期非表示
          pref.addEventListener('click', ()=>{
            alert(`${prefId} がタップされました`);
          });
        }
      });

      // 地域グループクリックで該当県を表示
      Object.keys(regions).forEach(groupId=>{
        const group = document.getElementById(groupId);
        if(group){
          group.style.cursor = 'pointer';
          group.addEventListener('click', ()=>{
            Object.values(regions).flat().forEach(prefId=>{
              const pref = document.getElementById(prefId);
              if(pref) pref.style.display = 'none';
            });
            regions[groupId].forEach(prefId=>{
              const pref = document.getElementById(prefId);
              if(pref) pref.style.display = 'inline';
            });
          });
        }
      });

    })
    .catch(err => console.error('SVG読み込みエラー:', err));

});