// header.js
document.addEventListener('DOMContentLoaded', ()=>{

  // =========================
  // アコーディオン処理
  // =========================
  const accordionBtn = document.querySelector('.accordion-btn');
  const panel = document.querySelector('.accordion-panel');

  if (accordionBtn && panel) {
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
  }

  // =========================
  // 登録地点操作
  // =========================
  const locationList = document.getElementById('locationList');

  function attachDeleteEvents() {
    if (!locationList) return;

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
    if (!locationList) return;

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
    if (!locationList) return;
    locationList.innerHTML = '<li class="location-none">登録なし</li>';
  }

  // =========================
  // ニュースオーバーレイ
  // =========================
  const newsBtn = document.getElementById("newsBtn");
  const newsOverlay = document.getElementById("newsOverlay");
  const closeNews = document.getElementById("closeNews");

  if (newsBtn && newsOverlay && closeNews) {
    newsBtn.addEventListener("click", e=>{
      e.preventDefault();
      newsOverlay.style.display="flex";
    });

    closeNews.addEventListener("click", ()=>{
      newsOverlay.style.display="none";
    });

    newsOverlay.addEventListener("click", e=>{
      if (e.target === newsOverlay) {
        newsOverlay.style.display = "none";
      }
    });
  }

  // =========================
  // カレンダーオーバーレイ
  // =========================
  const calendarBtn = document.getElementById("calendarBtn");
  const calendarOverlay = document.getElementById("calendarOverlay");
  const closeCalendar = document.getElementById("closeCalendar");
  const calendarWrapper = document.getElementById("calendarWrapper");

  function pad(n){ return n.toString().padStart(2,'0'); }

  function toKey(y,m,d){
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  function createMonth(year, month) {
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);

    const startDay = first.getDay();
    const daysInMonth = last.getDate();

    const today = new Date();
    const todayStr = toKey(
      today.getFullYear(),
      today.getMonth()+1,
      today.getDate()
    );

    let html = `<div class="month">`;
    html += `<div class="month-title">${year}/${month}</div>`;
    html += `<div class="calendar-grid">`;

    for (let i = 0; i < startDay; i++) {
      html += `<div class="cell empty"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const key = toKey(year, month, d);

      let cls = "cell";

      if (key < todayStr) cls += " past";
      if (key === todayStr) cls += " today";

      html += `
        <div class="${cls}">
          <div class="day">${d}</div>
        </div>
      `;
    }

    html += `</div></div>`;
    return html;
  }

  function renderCalendar(baseYear, baseMonth) {
    if (!calendarWrapper) return;

    calendarWrapper.innerHTML =
      createMonth(baseYear, baseMonth - 1) +
      createMonth(baseYear, baseMonth) +
      createMonth(baseYear, baseMonth + 1);
  }

  if (calendarBtn && calendarOverlay && closeCalendar && calendarWrapper) {

    const today = new Date();
    const baseYear = today.getFullYear();
    const baseMonth = today.getMonth() + 1;

    renderCalendar(baseYear, baseMonth);

    calendarBtn.addEventListener("click", (e)=>{
      e.preventDefault();
      calendarOverlay.style.display = "flex";
    });

    closeCalendar.addEventListener("click", ()=>{
      calendarOverlay.style.display = "none";
    });

    calendarOverlay.addEventListener("click", (e)=>{
      if (e.target === calendarOverlay) {
        calendarOverlay.style.display = "none";
      }
    });
  }

});