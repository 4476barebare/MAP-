document.addEventListener('DOMContentLoaded', ()=>{

  // アコーディオン操作
  const accordionBtn = document.querySelector('.accordion-btn');
  const panel = document.querySelector('.accordion-panel');
  accordionBtn.addEventListener('click', ()=>{
    document.querySelectorAll('.accordion-panel').forEach(p=>{
      if(p!==panel) p.style.display='none';
    });
    panel.style.display = (panel.style.display==='block') ? 'none':'block';
  });
  document.addEventListener('click', e=>{
    if(!e.target.closest('.accordion-wrapper')){
      document.querySelectorAll('.accordion-panel').forEach(p=>p.style.display='none');
    }
  });

  // 登録地点操作
  const locationList = document.getElementById('locationList');
  function attachDeleteEvents() {
    const deleteButtons = locationList.querySelectorAll('.delete-btn');
    deleteButtons.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const li = btn.parentElement;
        li.remove();
        if(locationList.children.length === 0){
          locationList.innerHTML = '<li class="location-none">登録なし</li>';
        }
      });
    });
  }
  attachDeleteEvents();

  function addLocation(name){
    const noneItem = locationList.querySelector('.location-none');
    if(noneItem) noneItem.remove();
    const li = document.createElement('li');
    li.textContent = name + ' ';
    const btn = document.createElement('button');
    btn.textContent = '✖️';
    btn.className = 'delete-btn';
    li.appendChild(btn);
    locationList.appendChild(li);
    attachDeleteEvents();
  }

  function resetLocations(){ locationList.innerHTML = '<li class="location-none">登録なし</li>'; }

  // ニュースオーバーレイ
  const newsBtn = document.getElementById("newsBtn");
  const overlay = document.getElementById("newsOverlay");
  const closeBtn = document.getElementById("closeNews");
  newsBtn.addEventListener("click", e=>{
    e.preventDefault();
    overlay.style.display="flex";
  });
  closeBtn.addEventListener("click", ()=>{ overlay.style.display="none"; });

  // 地図読み込み & 地域クリック
  const regionIDs = ['Path_1','Path_2','Path_3','Path_4','Path_5','Path_6','Path_7','Path_8'];
  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      const mapDiv = document.getElementById('map');
      mapDiv.innerHTML = svgText;

      regionIDs.forEach(id=>{
        const path = document.getElementById(id);
        if(path){
          path.setAttribute('fill', '#191970');       // 色
          path.setAttribute('stroke', '#ffffff');     // 枠線
          path.setAttribute('stroke-width', '1.5');
          path.setAttribute('stroke-linejoin', 'round');
          path.style.cursor = 'pointer';

          path.addEventListener('click', ()=>{
            alert(`${id} がタップされました`);
          });
        }
      });
    })
    .catch(err => console.error('SVG読み込みエラー:', err));

});document.addEventListener('DOMContentLoaded', ()=>{

  // アコーディオン操作
  const accordionBtn = document.querySelector('.accordion-btn');
  const panel = document.querySelector('.accordion-panel');
  accordionBtn.addEventListener('click', ()=>{
    document.querySelectorAll('.accordion-panel').forEach(p=>{
      if(p!==panel) p.style.display='none';
    });
    panel.style.display = (panel.style.display==='block') ? 'none':'block';
  });
  document.addEventListener('click', e=>{
    if(!e.target.closest('.accordion-wrapper')){
      document.querySelectorAll('.accordion-panel').forEach(p=>p.style.display='none');
    }
  });

  // 登録地点操作
  const locationList = document.getElementById('locationList');
  function attachDeleteEvents() {
    const deleteButtons = locationList.querySelectorAll('.delete-btn');
    deleteButtons.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const li = btn.parentElement;
        li.remove();
        if(locationList.children.length === 0){
          locationList.innerHTML = '<li class="location-none">登録なし</li>';
        }
      });
    });
  }
  attachDeleteEvents();

  function addLocation(name){
    const noneItem = locationList.querySelector('.location-none');
    if(noneItem) noneItem.remove();
    const li = document.createElement('li');
    li.textContent = name + ' ';
    const btn = document.createElement('button');
    btn.textContent = '✖️';
    btn.className = 'delete-btn';
    li.appendChild(btn);
    locationList.appendChild(li);
    attachDeleteEvents();
  }

  function resetLocations(){ locationList.innerHTML = '<li class="location-none">登録なし</li>'; }

  // ニュースオーバーレイ
  const newsBtn = document.getElementById("newsBtn");
  const overlay = document.getElementById("newsOverlay");
  const closeBtn = document.getElementById("closeNews");
  newsBtn.addEventListener("click", e=>{
    e.preventDefault();
    overlay.style.display="flex";
  });
  closeBtn.addEventListener("click", ()=>{ overlay.style.display="none"; });

  // 地図読み込み & 地域クリック
  const regionIDs = ['Path_1','Path_2','Path_3','Path_4','Path_5','Path_6','Path_7','Path_8'];
  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {
      const mapDiv = document.getElementById('map');
      mapDiv.innerHTML = svgText;

      regionIDs.forEach(id=>{
        const path = document.getElementById(id);
        if(path){
          path.setAttribute('fill', '#191970');       // 色
          path.setAttribute('stroke', '#ffffff');     // 枠線
          path.setAttribute('stroke-width', '1.5');
          path.setAttribute('stroke-linejoin', 'round');
          path.style.cursor = 'pointer';

          path.addEventListener('click', ()=>{
            alert(`${id} がタップされました`);
          });
        }
      });
    })
    .catch(err => console.error('SVG読み込みエラー:', err));

});