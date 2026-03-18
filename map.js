document.addEventListener('DOMContentLoaded', () => {
  const mapDiv = document.getElementById('map');

  // 地域グループSVG読み込み
  fetch('japan_group.svg')
    .then(res => res.text())
    .then(svgText => {
      mapDiv.innerHTML = svgText;

      // 初期状態：薄い塗りと枠線
      mapDiv.querySelectorAll('.region-group').forEach(group => {
        group.setAttribute('fill', '#cce0ff'); // 薄い青
        group.setAttribute('stroke', '#191970'); 
        group.setAttribute('stroke-width', '1.5');
        group.style.cursor = 'pointer';

        // クリックで県レイヤー読み込み
        group.addEventListener('click', () => {
          mapDiv.innerHTML = '';
          fetch('japan_pref.svg')
            .then(r => r.text())
            .then(prefText => {
              mapDiv.innerHTML = prefText;

              // 県パスに塗りと枠線設定
              mapDiv.querySelectorAll('.pref').forEach(path => {
                path.setAttribute('fill', '#e6f0ff'); // 薄色
                path.setAttribute('stroke', '#191970');
                path.setAttribute('stroke-width', '1');
                path.setAttribute('stroke-linejoin', 'round');
                path.style.cursor = 'pointer';

                path.addEventListener('click', () => {
                  alert(`${path.getAttribute('data-name')} がタップされました`);
                });
              });
            })
            .catch(err => console.error('県SVG読み込みエラー:', err));
        });
      });
    })
    .catch(err => console.error('地域グループSVG読み込みエラー:', err));
});