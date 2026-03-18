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

      // グループごとの倍率とオフセット
      const groupScales = {
        'Path_1': 3,
        'Path_2': 4,
        'Path_3': 1,
        'Path_4': 5,
        'Path_5': 6,
        'Path_6': 5,
        'Path_7': 6,
        'Path_8': 6
      };
      const groupOffsets = {
        'Path_1': {x:-600, y:0},
        'Path_2': {x:-600, y:-50},
        'Path_3': {x:-100, y:0},
        'Path_4': {x:-50, y:200},
        'Path_5': {x:100, y:250},
        'Path_6': {x:200, y:250},
        'Path_7': {x:300, y:250},
        'Path_8': {x:-25, y:-25}
      };

      // 初期状態: 県パス非表示、塗りはヘッダーロゴ色、枠線白で細め
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'none';
        p.style.fill = '#191970';
        p.style.stroke = '#fff';
        p.style.strokeWidth = '0.5px';
      });

      // 地域グループ初期表示：塗りヘッダーロゴ色、枠線白で太め
      Object.keys(groupToPrefectures).forEach(gid => {
        const group = svg.getElementById(gid);
        if (!group) return;
        group.style.display = 'inline';
        group.style.fill = '#191970';
        group.style.stroke = '#fff';
        group.style.strokeWidth = '3px';
        group.style.cursor = 'pointer';

        // 地域グループクリック
        group.addEventListener('click', () => {

          // 確認アラート
          alert(`クリック: ${gid}\n対象県: ${groupToPrefectures[gid].join(', ')}`);

          // 1. 全地域グループ非表示
          Object.keys(groupToPrefectures).forEach(gid2 => {
            const g2 = svg.getElementById(gid2);
            if (g2) g2.style.display = 'none';
          });

          // 2. 対象県以外を非表示、対象県は表示
          prefGroup.querySelectorAll('path').forEach(p => {
            if (groupToPrefectures[gid].includes(p.id)) {
              p.style.display = 'inline';
            } else {
              p.style.display = 'none';
            }
          });

          // 3. 拡大表示（縦横同時に倍率）
          const bbox = group.getBBox();
          let cx = bbox.x + bbox.width/2;
          let cy = bbox.y + bbox.height/2;

          // オフセット補正
          if (groupOffsets[gid]) {
            cx += groupOffsets[gid].x;
            cy += groupOffsets[gid].y;
          }

          const svgWidth = svg.viewBox.baseVal.width;
          const svgHeight = svg.viewBox.baseVal.height;
          const scale = groupScales[gid] || 3;
          const translateX = svgWidth/2 - cx*scale;
          const translateY = svgHeight/2 - cy*scale;

          // 縦横同時拡大
          svg.style.transition = 'transform 0.5s ease';
          svg.style.transformOrigin = 'center center';
          svg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;

          // 4. 県クリックイベント（1回だけ）
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