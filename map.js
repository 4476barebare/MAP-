// map.js
document.addEventListener('DOMContentLoaded', () => {
  const mapDiv = document.getElementById('map');

  // 初期表示：SVGを読み込み
  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      mapDiv.innerHTML = svgText;

      // 地域グループIDと対応する県IDリスト
      const groups = {
        'Path_1': ['Hokkaido'],
        'Path_2': ['Aomori','Iwate','Akita','Miyagi','Yamagata','Fukushima'],
        'Path_3': ['Niigata','Gunma','Tochigi','Chiba','Ibaraki','Tokyo','Saitama','Kanagawa'],
        'Path_4': ['Shizuoka','Yamanashi','Nagano','Ishikawa','Toyama','Gifu','Aichi'],
        'Path_5': ['Mie','Nara','Wakayama','Osaka','Shiga','Kyoto','Hyogo'],
        'Path_6': ['Tottori','Shimane','Okayama','Hiroshima','Yamaguchi','Tokushima','Kagawa','Kochi','Ehime'],
        'Path_7': ['Fukuoka','Saga','Nagasaki','Oita','Kumamoto','Miyazaki','Kagoshima'],
        'Path_8': ['Okinawa']
      };

      // 地域グループ初期スタイル
      Object.keys(groups).forEach(gid => {
        const group = document.getElementById(gid);
        if(group){
          group.setAttribute('fill', '#191970');    // グループ塗り
          group.setAttribute('stroke', '#ffffff');  // グループ枠線
          group.setAttribute('stroke-width', '1.5');
          group.style.cursor = 'pointer';

          group.addEventListener('click', () => {
            // クリックされたグループを非表示
            group.style.display = 'none';

            // 対応する県パスを表示
            groups[gid].forEach(pid => {
              const p = document.getElementById(pid);
              if(p){
                p.style.display = 'block';
                p.setAttribute('fill', '#000000');      // 県塗り
                p.setAttribute('stroke', '#191970');    // 県枠線
                p.setAttribute('stroke-width', '1');
                p.style.cursor = 'pointer';

                // 簡易クリック判定
                p.addEventListener('click', () => {
                  alert(`${pid} がクリックされました`);
                });
              }
            });
          });
        }
      });

      // 初期表示時、県パスは非表示
      Object.values(groups).flat().forEach(pid => {
        const p = document.getElementById(pid);
        if(p) p.style.display = 'none';
      });

    })
    .catch(err => console.error('SVG読み込みエラー:', err));
});// map.js
document.addEventListener('DOMContentLoaded', () => {
  const mapDiv = document.getElementById('map');

  // 初期表示：SVGを読み込み
  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      mapDiv.innerHTML = svgText;

      // 地域グループIDと対応する県IDリスト
      const groups = {
        'Path_1': ['Hokkaido'],
        'Path_2': ['Aomori','Iwate','Akita','Miyagi','Yamagata','Fukushima'],
        'Path_3': ['Niigata','Gunma','Tochigi','Chiba','Ibaraki','Tokyo','Saitama','Kanagawa'],
        'Path_4': ['Shizuoka','Yamanashi','Nagano','Ishikawa','Toyama','Gifu','Aichi'],
        'Path_5': ['Mie','Nara','Wakayama','Osaka','Shiga','Kyoto','Hyogo'],
        'Path_6': ['Tottori','Shimane','Okayama','Hiroshima','Yamaguchi','Tokushima','Kagawa','Kochi','Ehime'],
        'Path_7': ['Fukuoka','Saga','Nagasaki','Oita','Kumamoto','Miyazaki','Kagoshima'],
        'Path_8': ['Okinawa']
      };

      // 地域グループ初期スタイル
      Object.keys(groups).forEach(gid => {
        const group = document.getElementById(gid);
        if(group){
          group.setAttribute('fill', '#191970');    // グループ塗り
          group.setAttribute('stroke', '#ffffff');  // グループ枠線
          group.setAttribute('stroke-width', '1.5');
          group.style.cursor = 'pointer';

          group.addEventListener('click', () => {
            // クリックされたグループを非表示
            group.style.display = 'none';

            // 対応する県パスを表示
            groups[gid].forEach(pid => {
              const p = document.getElementById(pid);
              if(p){
                p.style.display = 'block';
                p.setAttribute('fill', '#000000');      // 県塗り
                p.setAttribute('stroke', '#191970');    // 県枠線
                p.setAttribute('stroke-width', '1');
                p.style.cursor = 'pointer';

                // 簡易クリック判定
                p.addEventListener('click', () => {
                  alert(`${pid} がクリックされました`);
                });
              }
            });
          });
        }
      });

      // 初期表示時、県パスは非表示
      Object.values(groups).flat().forEach(pid => {
        const p = document.getElementById(pid);
        if(p) p.style.display = 'none';
      });

    })
    .catch(err => console.error('SVG読み込みエラー:', err));
});