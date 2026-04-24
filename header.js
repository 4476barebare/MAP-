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
  // カレンダー（オーバーレイ）
  // =========================
  const calendarBtn = document.getElementById("calendarBtn");
  const calendarOverlay = document.getElementById("calendarOverlay");
  const closeCalendar = document.getElementById("closeCalendar");
  const calendarWrapper = document.getElementById("calendarWrapper");

  // -------------------------
  // 日付ユーティリティ
  // -------------------------
  function pad(n){ return n.toString().padStart(2,'0'); }

  function toKey(y,m,d){
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  // -------------------------
  // 月齢（簡易）
  // -------------------------
  function calcMoonAge(date) {
    const synodicMonth = 29.53058867;
    const base = new Date(2000, 0, 6);
    const diff = date - base;
    const days = diff / (1000 * 60 * 60 * 24);

    return (days % synodicMonth + synodicMonth) % synodicMonth;
  }

  // -------------------------
  // 5潮分類
  // -------------------------
function getTideName(moonAge) {
  const age = Math.floor(moonAge);

  // 大潮（新月・満月付近）
  if (age === 0 || age === 14 || age === 15) return "大潮";

  // 中潮
  if (
    (age >= 1 && age <= 2) ||
    (age >= 12 && age <= 13) ||
    (age === 16) ||
    (age >= 27 && age <= 28)
  ) return "中潮";

  // 小潮
  if (
    (age >= 3 && age <= 4) ||
    (age >= 10 && age <= 11) ||
    (age >= 17 && age <= 18) ||
    (age >= 25 && age <= 26)
  ) return "小潮";

  // 長潮
  if (
    (age >= 5 && age <= 6) ||
    (age >= 8 && age <= 9) ||
    (age >= 19 && age <= 20) ||
    (age >= 23 && age <= 24)
  ) return "長潮";

  // 残り
  return "若潮";
}

  // -------------------------
  // 月生成
  // -------------------------
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

    // 空白
    for (let i = 0; i < startDay; i++) {
      html += `<div class="cell empty"></div>`;
    }

    // 日付生成
    for (let d = 1; d <= daysInMonth; d++) {

      const date = new Date(year, month - 1, d);
      const key = toKey(year, month, d);

      const moonAge = calcMoonAge(date);
      const tide = getTideName(moonAge);

      let cls = "cell";

      if (key < todayStr) cls += " past";
      if (key === todayStr) cls += " today";

      html += `
        <div class="${cls}">
          <div class="day">${d}</div>
          <div class="tide">${tide}</div>
        </div>
      `;
    }

    html += `</div></div>`;
    return html;
  }

  // -------------------------
  // カレンダー描画
  // -------------------------
  function renderCalendar(year, month) {
    if (!calendarWrapper) return;

    calendarWrapper.innerHTML =
      createMonth(year, month - 1) +
      createMonth(year, month) +
      createMonth(year, month + 1);
      
      

  }

  // -------------------------
  // 初期化＆イベント
  // -------------------------
  if (calendarBtn && calendarOverlay && closeCalendar && calendarWrapper) {

    const today = new Date();
    const baseYear = today.getFullYear();
    const baseMonth = today.getMonth() + 1;

    renderCalendar(baseYear, baseMonth);

    calendarBtn.addEventListener("click", (e)=>{
      e.preventDefault();
      calendarOverlay.style.display = "flex";
        // ★ここでやる
  requestAnimationFrame(() => {
    calendarWrapper.scrollLeft = calendarWrapper.clientWidth;
  });
      
      
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