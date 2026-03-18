// map.js - japan.svg 読み込み＋地域グループ → 県表示
document.addEventListener('DOMContentLoaded', () => {

  // 地域グループと対応県のマッピング
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

  // SVG読み込み
  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      const mapDiv = document.getElementById('map');
      mapDiv.innerHTML = svgText;

      // 初期で県パスを非表示
      Object.values(regionGroups).flat().forEach(pid => {
        const p = document.getElementById(pid);
        if(p){
          p.style.display = 'none';
        }
      });

      // 初期表示：地域グループのみ
      Object.keys(regionGroups).forEach(gid => {
        const group = document.getElementById(gid);
        if(!group) return;

        group.style.display = 'block';
        group.style.fill = '#cccccc';       // 初期塗り
        group.style.stroke = '#191970';     // 枠線
        group.style.strokeWidth = '1';
        group.style.cursor = 'pointer';

        // グループクリックで県パス表示
        group.addEventListener('click', () => {
          // クリックしたグループ非表示
          group.style.display = 'none';

          // 対応県パスを表示
          regionGroups[gid].forEach(pid => {
            const p = document.getElementById(pid);
            if(p){
              p.style.display = 'block';
              p.style.fill = '#000000';
              p.style.stroke = '#191970';
              p.style.strokeWidth = '1';
              p.style.cursor = 'pointer';

              // 県クリック判定
              p.addEventListener('click', () => {
                alert(`${pid} がクリックされました`);
              });
            }
          });
        });
      });

    })
    .catch(err => console.error('SVG読み込みエラー:', err));

});