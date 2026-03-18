fetch('japan.svg')
  .then(res => res.text())
  .then(svgText => {
    mapDiv.innerHTML = svgText;

    // 初期：グループパスだけ表示（塗り薄色 + 枠線）
    const groupPaths = ['Path_1','Path_2','Path_3','Path_4','Path_5','Path_6','Path_7','Path_8'];
    groupPaths.forEach(id => {
      const path = document.getElementById(id);
      if(path){
        path.setAttribute('fill', '#cce0ff'); // 薄い青
        path.setAttribute('stroke', '#191970');
        path.setAttribute('stroke-width', '1.5');
        path.style.cursor = 'pointer';

        path.addEventListener('click', ()=>{
          // クリックで県パス表示に切替
          showPrefectures(id);
        });
      }
    });
  });