document.addEventListener('DOMContentLoaded', () => {

  const mapDiv = document.getElementById('map');

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      mapDiv.innerHTML = svgText;

      const svg = mapDiv.querySelector('svg');

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

      // 県パス初期非表示
      Object.values(groupToPrefectures).flat().forEach(pid => {
        const p = svg.getElementById(pid);
        if (p) p.style.display = 'none';
      });

      // 地域グループクリック
      Object.keys(groupToPrefectures).forEach(gid => {
        const group = svg.getElementById(gid);
        if (!group) return;

        group.style.cursor = 'pointer';
        group.addEventListener('click', () => {

          alert(`クリック: ${gid}\n対象県: ${groupToPrefectures[gid].join(', ')}`);

          // 1. 全地域グループパスを非表示
          Object.keys(groupToPrefectures).forEach(gid2 => {
            const gp = svg.getElementById(gid2);
            if (gp) gp.style.display = 'none';
          });

          // 2. 全地域グループ非表示（wrapper等ある場合）
          // 今回はSVG内のパスだけなので1で十分

          // 3. 対象県以外を非表示
          Object.values(groupToPrefectures).flat().forEach(pid => {
            const p = svg.getElementById(pid);
            if (p) {
              if (groupToPrefectures[gid].includes(pid)) {
                p.style.display = 'inline'; // 元色で表示
              } else {
                p.style.display = 'none';
              }
            }
          });

          // 4. 県クリックイベント1回だけ
          groupToPrefectures[gid].forEach(pid => {
            const p = svg.getElementById(pid);
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

});document.addEventListener('DOMContentLoaded', () => {

  const mapDiv = document.getElementById('map');

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      mapDiv.innerHTML = svgText;

      const svg = mapDiv.querySelector('svg');

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

      // 県パス初期非表示
      Object.values(groupToPrefectures).flat().forEach(pid => {
        const p = svg.getElementById(pid);
        if (p) p.style.display = 'none';
      });

      // 地域グループクリック
      Object.keys(groupToPrefectures).forEach(gid => {
        const group = svg.getElementById(gid);
        if (!group) return;

        group.style.cursor = 'pointer';
        group.addEventListener('click', () => {

          alert(`クリック: ${gid}\n対象県: ${groupToPrefectures[gid].join(', ')}`);

          // 1. 全地域グループパスを非表示
          Object.keys(groupToPrefectures).forEach(gid2 => {
            const gp = svg.getElementById(gid2);
            if (gp) gp.style.display = 'none';
          });

          // 2. 全地域グループ非表示（wrapper等ある場合）
          // 今回はSVG内のパスだけなので1で十分

          // 3. 対象県以外を非表示
          Object.values(groupToPrefectures).flat().forEach(pid => {
            const p = svg.getElementById(pid);
            if (p) {
              if (groupToPrefectures[gid].includes(pid)) {
                p.style.display = 'inline'; // 元色で表示
              } else {
                p.style.display = 'none';
              }
            }
          });

          // 4. 県クリックイベント1回だけ
          groupToPrefectures[gid].forEach(pid => {
            const p = svg.getElementById(pid);
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