// map.js
document.addEventListener('DOMContentLoaded', () => {

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

  const mapDiv = document.getElementById('map');

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      mapDiv.innerHTML = svgText;
      const svg = mapDiv.querySelector('svg');

      // 初期表示：地域グループだけ
      Object.keys(groupToPrefectures).forEach(gid => {
        const groupPath = svg.getElementById(gid);
        if(groupPath){
          groupPath.setAttribute('fill', '#888'); // グループは灰色
          groupPath.setAttribute('stroke', '#191970');
          groupPath.setAttribute('stroke-width', '1.5');
          groupPath.style.cursor = 'pointer';

          groupPath.addEventListener('click', () => {
            const targetPref = groupToPrefectures[gid];
            alert(`このグループで赤色にする県: ${targetPref.join(', ')}`);

            // 全グループ非表示
            Object.keys(groupToPrefectures).forEach(hid=>{
              const p = svg.getElementById(hid);
              if(p) p.style.display='none';
            });

            // 対応する県パスだけ赤で表示
            targetPref.forEach(pid=>{
              const prefPath = svg.getElementById(pid);
              if(prefPath){
                prefPath.style.display='inline';
                prefPath.setAttribute('fill','red');
                prefPath.setAttribute('stroke','#191970');
                prefPath.setAttribute('stroke-width','1.5');
                prefPath.style.cursor='pointer';

                prefPath.addEventListener('click', ()=>{
                  alert(`${pid} がクリックされました`);
                });
              }
            });
          });
        }
      });

      // 最初に県パスは非表示
      Object.values(groupToPrefectures).flat().forEach(pid=>{
        const prefPath = svg.getElementById(pid);
        if(prefPath){
          prefPath.style.display='none';
        }
      });
    })
    .catch(err => console.error('SVG読み込みエラー:', err));
});