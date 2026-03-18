document.addEventListener('DOMContentLoaded', () => {
  const mapDiv = document.getElementById('map');

  // 地域グループID → 県ID配列
  const regionData = {
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
      mapDiv.innerHTML = svgText;

      // 初期：地域グループだけ表示
      Object.keys(regionData).forEach(groupID => {
        const groupPath = document.getElementById(groupID);
        if(!groupPath) return;

        groupPath.setAttribute('fill', '#cce0ff');       // 塗りあり
        groupPath.setAttribute('stroke', '#191970');     // 枠線
        groupPath.setAttribute('stroke-width', '1.5');
        groupPath.setAttribute('stroke-linejoin', 'round');
        groupPath.style.cursor = 'pointer';

        groupPath.addEventListener('click', e => {
          console.log(`地域クリック: ${groupID}`, e.target);
          alert(`${groupID} を展開`);

          // グループ非表示
          groupPath.style.display = 'none';

          // 県パスを表示
          const prefectures = regionData[groupID];
          prefectures.forEach(prefID => {
            const prefPath = document.getElementById(prefID);
            if(!prefPath) return;

            prefPath.setAttribute('fill', '#99ccff');
            prefPath.setAttribute('stroke', '#191970');
            prefPath.setAttribute('stroke-width', '1');
            prefPath.setAttribute('stroke-linejoin', 'round');
            prefPath.style.cursor = 'pointer';

            prefPath.addEventListener('click', ev => {
              console.log(`県クリック: ${prefID}`, ev.target);
              alert(`${prefID} がクリックされました`);
            });
          });
        });
      });
    })
    .catch(err => console.error('SVG読み込みエラー:', err));
});