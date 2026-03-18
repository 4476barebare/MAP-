// map.js
document.addEventListener('DOMContentLoaded', ()=>{

  const regionGroups = {
    Path_1: ['Hokkaido'],
    Path_2: ['Aomori','Iwate','Akita','Miyagi','Yamagata','Fukushima'],
    Path_3: ['Niigata','Gunma','Tochigi','Chiba','Ibaraki','Tokyo','Saitama','Kanagawa'],
    Path_4: ['Shizuoka','Yamanashi','Nagano','Ishikawa','Toyama','Gifu','Aichi'],
    Path_5: ['Mie','Nara','Wakayama','Osaka','Shiga','Kyoto','Hyogo'],
    Path_6: ['Tottori','Shimane','Okayama','Hiroshima','Yamaguchi','Tokushima','Kagawa','Kochi','Ehime'],
    Path_7: ['Fukuoka','Saga','Nagasaki','Oita','Kumamoto','Miyazaki','Kagoshima'],
    Path_8: ['Okinawa']
  };

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      const mapDiv = document.getElementById('map');
      mapDiv.innerHTML = svgText;
      const allPaths = mapDiv.querySelectorAll('path');

      // 地域グループクリック
      Object.keys(regionGroups).forEach(groupID=>{
        const groupPath = document.getElementById(groupID);
        if(!groupPath) return;

        groupPath.style.cursor = 'pointer';
        groupPath.addEventListener('click', ()=>{
          allPaths.forEach(p=> p.setAttribute('opacity','0.2'));

          regionGroups[groupID].forEach(id=>{
            const path = Array.from(allPaths).find(p=>p.id===id);
            if(path){
              path.setAttribute('opacity','1');
              path.setAttribute('fill','#191970');
              path.setAttribute('stroke','#ffffff');
              path.setAttribute('stroke-width','1.5');
            }
          });

          // 簡易ズーム
          mapDiv.style.transition = 'transform 0.5s';
          mapDiv.style.transformOrigin = 'center center';
          mapDiv.style.transform = 'scale(2)';
        });
      });

      // 都道府県クリック
      allPaths.forEach(path=>{
        path.addEventListener('click', ()=>{
          alert(`${path.id} がタップされました`);
        });
      });

    })
    .catch(err => console.error('SVG読み込みエラー:', err));

});// map.js
document.addEventListener('DOMContentLoaded', ()=>{

  const regionGroups = {
    Path_1: ['Hokkaido'],
    Path_2: ['Aomori','Iwate','Akita','Miyagi','Yamagata','Fukushima'],
    Path_3: ['Niigata','Gunma','Tochigi','Chiba','Ibaraki','Tokyo','Saitama','Kanagawa'],
    Path_4: ['Shizuoka','Yamanashi','Nagano','Ishikawa','Toyama','Gifu','Aichi'],
    Path_5: ['Mie','Nara','Wakayama','Osaka','Shiga','Kyoto','Hyogo'],
    Path_6: ['Tottori','Shimane','Okayama','Hiroshima','Yamaguchi','Tokushima','Kagawa','Kochi','Ehime'],
    Path_7: ['Fukuoka','Saga','Nagasaki','Oita','Kumamoto','Miyazaki','Kagoshima'],
    Path_8: ['Okinawa']
  };

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      const mapDiv = document.getElementById('map');
      mapDiv.innerHTML = svgText;
      const allPaths = mapDiv.querySelectorAll('path');

      // 地域グループクリック
      Object.keys(regionGroups).forEach(groupID=>{
        const groupPath = document.getElementById(groupID);
        if(!groupPath) return;

        groupPath.style.cursor = 'pointer';
        groupPath.addEventListener('click', ()=>{
          allPaths.forEach(p=> p.setAttribute('opacity','0.2'));

          regionGroups[groupID].forEach(id=>{
            const path = Array.from(allPaths).find(p=>p.id===id);
            if(path){
              path.setAttribute('opacity','1');
              path.setAttribute('fill','#191970');
              path.setAttribute('stroke','#ffffff');
              path.setAttribute('stroke-width','1.5');
            }
          });

          // 簡易ズーム
          mapDiv.style.transition = 'transform 0.5s';
          mapDiv.style.transformOrigin = 'center center';
          mapDiv.style.transform = 'scale(2)';
        });
      });

      // 都道府県クリック
      allPaths.forEach(path=>{
        path.addEventListener('click', ()=>{
          alert(`${path.id} がタップされました`);
        });
      });

    })
    .catch(err => console.error('SVG読み込みエラー:', err));

});