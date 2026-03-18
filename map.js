// map.js
document.addEventListener('DOMContentLoaded', () => {
  const mapDiv = document.getElementById('map');

  // 地域グループID
  const groupPaths = ['Path_1','Path_2','Path_3','Path_4','Path_5','Path_6','Path_7','Path_8'];

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      // SVGを挿入
      mapDiv.innerHTML = svgText;

      // 初期状態：地域グループだけ表示
      groupPaths.forEach(id => {
        const path = document.getElementById(id);
        if(!path) return;

        path.setAttribute('fill', '#cce0ff');       // 薄い青（透明ではない）
        path.setAttribute('stroke', '#191970');     // 枠線残す
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-linejoin', 'round');
        path.style.cursor = 'pointer';

        path.addEventListener('click', (e) => {
          // 当たり判定確認メッセージ
          console.log(`クリック判定: ${id}`, e.target);
          alert(`${id} がクリックされました`);
        });
      });
    })
    .catch(err => console.error('SVG読み込みエラー:', err));
});