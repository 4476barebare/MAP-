document.addEventListener('DOMContentLoaded', ()=>{
  const mapDiv = document.getElementById('map');

  // 地域グループ ID と対応する県 ID
  const regionIDs = ['Path_1','Path_2','Path_3','Path_4','Path_5','Path_6','Path_7','Path_8'];
  const groupToPrefectures = {
    'Path_1': ['Hokkaido'],
    'Path_2': ['Aomori','Iwate','Akita','Miyagi','Yamagata','Fukushima'],
    'Path_3': ['Niigata','Gunma','Tochigi','Chiba','Ibaraki','Tokyo','Saitama','Kanagawa'],
    'Path_4': ['Shizuoka','Yamanashi','Nagano','Ishikawa','Toyama','Gifu','Aichi'],
    'Path_5': ['Mie','Nara','Wakayama','Osaka','Shiga','Kyoto','Hyogo'],
    'Path_6': ['Tottori','Shimane','Okayama','Hiroshima','Yamaguchi','Tokushima','Kagawa','Kochi','Ehime'],
    'Path_7': ['Fukuoka','Saga','Nagasaki','Oita','Kumamoto','Miyazaki','Kagoshima'],
    'Path_8': ['Okinawa']
  };

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      mapDiv.innerHTML = svgText;

      // 初期状態：地域グループのみ表示
      regionIDs.forEach(id=>{
        const path = document.getElementById(id);
        if(path){
          path.setAttribute('fill','#888');      // 灰色
          path.setAttribute('stroke','#191970'); // 青いグループ線
          path.setAttribute('stroke-width','1.5');
          path.style.cursor = 'pointer';

          path.addEventListener('click', ()=>{
            // クリック時：全てのグループ非表示
            regionIDs.forEach(gid=>{
              const gpath = document.getElementById(gid);
              if(gpath) gpath.style.display = 'none';
            });

            // クリックしたグループの県のみ赤色で表示
            groupToPrefectures[id].forEach(prefID=>{
              const prefPath = document.getElementById(prefID);
              if(prefPath){
                prefPath.style.display = 'block';
                prefPath.setAttribute('fill','red');
                prefPath.setAttribute('stroke','#191970');
                prefPath.setAttribute('stroke-width','1');
              }
            });
          });
        }
      });

      // 初期状態で県パスは非表示
      Object.values(groupToPrefectures).flat().forEach(prefID=>{
        const prefPath = document.getElementById(prefID);
        if(prefPath) prefPath.style.display = 'none';
      });
    })
    .catch(err => console.error('SVG読み込みエラー:', err));
});