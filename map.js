document.addEventListener('DOMContentLoaded', () => {

  const mapDiv = document.getElementById('map');

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {

      mapDiv.innerHTML = svgText;

      const svg = mapDiv.querySelector('svg');
      const prefGroup = svg.querySelector('#pref');

      // 描画改善
      svg.style.shapeRendering = 'geometricPrecision';
      svg.style.transformOrigin = 'center center';

      // 設定統合
      const groupSettings = {
        Path_1: { scale:3.4, x:230, y:0 },
        Path_2: { scale:3.4, x:190, y:110 },
        Path_3: { scale:5.2, x:130, y:130 },
        Path_4: { scale:5.6, x:90, y:140 },
        Path_5: { scale:7, x:30, y:160 },
        Path_6: { scale:4.8, x:0, y:200 },
        Path_7: { scale:5.8, x:-60, y:220 },
        Path_8: { scale:3.4, x:30, y:20 }
      };

      const groupToPrefectures = {
        Path_1:['Hokkaido'],
        Path_2:['Aomori','Iwate','Akita','Miyagi','Yamagata','Fukushima'],
        Path_3:['Niigata','Gunma','Tochigi','Chiba','Ibaraki','Tokyo','Saitama','Kanagawa'],
        Path_4:['Shizuoka','Yamanashi','Nagano','Ishikawa','Toyama','Gifu','Aichi'],
        Path_5:['Mie','Nara','Wakayama','Osaka','Shiga','Kyoto','Hyogo'],
        Path_6:['Tottori','Shimane','Okayama','Hiroshima','Yamaguchi','Tokushima','Kagawa','Kochi','Ehime'],
        Path_7:['Fukuoka','Saga','Nagasaki','Oita','Kumamoto','Miyazaki','Kagoshima'],
        Path_8:['Okinawa']
      };

      // 県パス初期設定
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'none';
        p.style.fill = '#191970';
        p.style.stroke = '#fff';
        p.style.strokeWidth = '0.5px';
        p.style.vectorEffect = 'non-scaling-stroke'; // 重要
      });

      // 地域グループ
      Object.keys(groupToPrefectures).forEach(gid => {
        const group = svg.getElementById(gid);
        if (!group) return;

        group.style.fill = '#191970';
        group.style.stroke = '#fff';
        group.style.strokeWidth = '3px';
        group.style.cursor = 'pointer';
        group.style.vectorEffect = 'non-scaling-stroke'; // 重要

        group.addEventListener('click', () => {

          // 1. 全グループ非表示
          Object.keys(groupToPrefectures).forEach(g => {
            const el = svg.getElementById(g);
            if (el) el.style.display = 'none';
          });

          // 2. 対象県のみ表示
          prefGroup.querySelectorAll('path').forEach(p => {
            p.style.display = groupToPrefectures[gid].includes(p.id) ? 'inline' : 'none';
          });

          // 3. 拡大処理
          applyTransform(gid);

          // 4. 県クリックイベント（1回のみ）
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

      function applyTransform(gid){
        const group = svg.getElementById(gid);
        const bbox = group.getBBox();

        const s = groupSettings[gid];

        let cx = bbox.x + bbox.width/2 + s.x;
        let cy = bbox.y + bbox.height/2 + s.y;

        const scale = s.scale;

        const svgW = svg.viewBox.baseVal.width;
        const svgH = svg.viewBox.baseVal.height;

        const tx = svgW/2 - cx * scale;
        const ty = svgH/2 - cy * scale;

        svg.style.transition = 'transform 0.4s ease';
        svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      }

    })
    .catch(err => console.error('SVG読み込みエラー:', err));

});