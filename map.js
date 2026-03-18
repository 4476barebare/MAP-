document.addEventListener('DOMContentLoaded', () => {

  const mapDiv = document.getElementById('map');

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      mapDiv.innerHTML = svgText;

      const svg = mapDiv.querySelector('svg');
      const prefGroup = svg.querySelector('#pref'); // 県パスまとめ

      // 地域グループと対応する県
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

      // 初期状態: 県パス非表示
      prefGroup.querySelectorAll('path').forEach(p => p.style.display = 'none');

      // 地域グループクリック
      Object.keys(groupToPrefectures).forEach(gid => {
        const group = svg.getElementById(gid);
        if (!group) return;

        group.style.cursor = 'pointer';
        group.addEventListener('click', () => {

          // 確認アラート
          alert(`クリック: ${gid}\n対象県: ${groupToPrefectures[gid].join(', ')}`);

          // 1. 全地域グループ非表示
          Object.keys(groupToPrefectures).forEach(gid2 => {
            const g = svg.getElementById(gid2);
            if (g) g.style.display = 'none';
          });

          // 2. 対象県以外を非表示
          prefGroup.querySelectorAll('path').forEach(p => {
            if (groupToPrefectures[gid].includes(p.id)) {
              p.style.display = 'inline'; // 元の色で表示
            } else {
              p.style.display = 'none';
            }
          });

          // 3. 県クリックイベント（1回だけ）
          groupToPrefectures[gid].forEach(pid => {
            const p = prefGroup.querySelector(`#${pid}`);
            if (p && !p.dataset.eventAttached) {
              p.addEventListener('click', () => {
                alert(`県クリック: ${pid}`);
              });
              p.dataset.eventAttached = 'true';
            }
          });

        });
      });

    })
    .catch(err => console.error('SVG読み込みエラー:', err));

});