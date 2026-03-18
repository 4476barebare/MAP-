// header.js
document.addEventListener('DOMContentLoaded', ()=>{

  // アコーディオン処理
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
    locationList.querySelectorAll('.delete-btn').forEach(btn=>{
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

  window.addLocation = function(name){
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

  window.resetLocations = function(){
    locationList.innerHTML = '<li class="location-none">登録なし</li>';
  }

  // ニュースオーバーレイ
  const newsBtn = document.getElementById("newsBtn");
  const overlay = document.getElementById("newsOverlay");
  const closeBtn = document.getElementById("closeNews");
  newsBtn.addEventListener("click", e=>{
    e.preventDefault();
    overlay.style.display="flex";
  });
  closeBtn.addEventListener("click", ()=>{ overlay.style.display="none"; });

});