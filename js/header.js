function getAlertText(pref, callback) {
  var messages = [];
  var areaId = pref.url;

  // ---------------------
  // ① 雷
  // ---------------------
  fetch("https://www.jma.go.jp/bosai/warning/data/warning/" + areaId + ".json")
    .then(function(res) { return res.json(); })
    .then(function(data) {

      if (Array.isArray(data)) {
        data.forEach(function(area) {
          if (!area.warnings) return;

          area.warnings.forEach(function(w) {
            if (w.code === "33" && w.status === "issue") {
              messages.push("雷警報");
            }
          });
        });
      }

    })
    .catch(function(){})
    .finally(function() {

      // ---------------------
      // ② 津波
      // ---------------------
      fetch("https://www.jma.go.jp/bosai/tsunami/data/list.json")
        .then(function(res) { return res.json(); })
        .then(function(list) {

          if (Array.isArray(list) && list.length) {

            return fetch("https://www.jma.go.jp/bosai/tsunami/data/" + list[0].id + ".json")
              .then(function(res) { return res.json(); })
              .then(function(detail) {

                if (detail && Array.isArray(detail.areas)) {
                  detail.areas.forEach(function(a) {
                    if (a.code === areaId && a.grade && a.grade !== "None") {
                      messages.push("津波警報");
                    }
                  });
                }

              });
          }

        })
        .catch(function(){})
        .finally(function() {

          // ---------------------
          // ③ 台風
          // ---------------------
          fetch("https://www.jma.go.jp/bosai/typhoon/data/list.json")
            .then(function(res) { return res.json(); })
            .then(function(list) {
              if (Array.isArray(list) && list.length > 0) {
                messages.push("台風接近中");
              }
            })
            .catch(function(){})
            .finally(function() {

              // ---------------------
              // 結果返却
              // ---------------------
              messages = messages.filter(function(v, i, self) {
                return self.indexOf(v) === i;
              });

              if (!callback) return;

              callback(
                messages.length
                  ? messages.join(" / ")
                  : "現在警報はありません"
              );

            });

        });

    });
}

function loadNews() {

  const newsList = document.getElementById("newsList");
  if (!newsList) return;

  newsList.innerHTML = "読み込み中...";

  fetch("../data/news.json")
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(items => {

      if (!Array.isArray(items) || items.length === 0) {
        newsList.innerHTML = "記事がありません";
        return;
      }

      renderNews(items.slice(0, 100));
    })
    .catch(() => {
      newsList.innerHTML = "取得失敗";
    });
}

function renderNews(items) {

  const newsList = document.getElementById("newsList");
  if (!newsList) return;

  newsList.innerHTML = "";

  items.forEach((item, index) => {

    const el = document.createElement("div");
    el.className = "news-item";

    const timeText = formatTimeAgo(item.pubDate);

    const thumb = item.thumbnail || "";

    el.innerHTML = `
      <a href="${item.link}" target="_blank" rel="noopener">
        <div class="news-row">

          <img class="news-thumb" src="${thumb}" loading="lazy">

          <div class="news-text">
            <div class="news-title">${item.title}</div>

            <div class="news-meta">
              <div class="news-source">${item.author || "RSS"}</div>
              <div class="news-date">${timeText}</div>
            </div>
          </div>

        </div>
      </a>
    `;

    const img = el.querySelector(".news-thumb");

    // ★画像死んだら完全に削除（レイアウト維持）
    img.onerror = () => {
      el.classList.add("no-image");
      img.remove();
    };

    newsList.appendChild(el);

    if ((index + 1) % 5 === 0) {
      newsList.appendChild(renderAdBlock());
    }
  });
}

function formatTimeAgo(pubDate) {

  const diff = Date.now() - new Date(pubDate);

  const sec = diff / 1000;
  const min = sec / 60;
  const hour = min / 60;
  const day = hour / 24;
  const month = day / 30;

  if (sec < 60) return "たった今";
  if (min < 60) return `${Math.floor(min)}分前`;
  if (hour < 24) return `${Math.floor(hour)}時間前`;
  if (day < 30) return `${Math.floor(day)}日前`;
  if (month < 12) return `${Math.floor(month)}ヶ月前`;

  return `${Math.floor(month / 12)}年前`;
}

function renderAdBlock() {
  const ad = document.createElement("div");
  ad.className = "ad-block";

  ad.innerHTML = `
    <div style="
      width:100%;
      max-width:320px;
      height:50px;
      display:flex;
      align-items:center;
      justify-content:center;
      background:#f2f2f2;
      margin:10px auto;
      font-size:12px;
      color:#666;
    ">
      広告枠
    </div>
  `;

  return ad;
}

document.addEventListener("DOMContentLoaded", function () {

const newsLink = document.getElementById("newsBtn");
const newsModal = document.getElementById("newsModal");

if (newsLink && newsModal) {
  newsLink.addEventListener("click", (e) => {
    e.preventDefault();
    newsModal.style.display = "block";
    loadNews();
  });

  newsModal.addEventListener("click", (e) => {
    if (e.target === newsModal) {
      newsModal.style.display = "none";
    }
  });
}

const calendarBtn = document.getElementById("calendarBtn");
const calendarOverlay = document.getElementById("calendarOverlay");
const calendarWrapper = document.getElementById("calendarWrapper");

function pad(n){ return n.toString().padStart(2,"0"); }

function toKey(y,m,d){
  return `${y}-${pad(m)}-${pad(d)}`;
}

function calcMoonAge(date) {
  const synodicMonth = 29.53058867;
  const base = new Date(2000, 0, 6);
  const diff = date - base;
  const days = diff / (1000 * 60 * 60 * 24);
  return (days % synodicMonth + synodicMonth) % synodicMonth;
}

function getTideName(moonAge) {
  const age = Math.floor(moonAge);

  if (age === 0 || age === 14 || age === 15) return "大潮";

  if (
    (age >= 1 && age <= 2) ||
    (age >= 12 && age <= 13) ||
    (age === 16) ||
    (age >= 27 && age <= 28)
  ) return "中潮";

  if (
    (age >= 3 && age <= 4) ||
    (age >= 10 && age <= 11) ||
    (age >= 17 && age <= 18) ||
    (age >= 25 && age <= 26)
  ) return "小潮";

  if (
    (age >= 5 && age <= 6) ||
    (age >= 8 && age <= 9) ||
    (age >= 19 && age <= 20) ||
    (age >= 23 && age <= 24)
  ) return "長潮";

  return "若潮";
}

const WEEK_LABELS = ["日","月","火","水","木","金","土"];

function createMonth(year, month) {

  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);

  const startDay = first.getDay();
  const daysInMonth = last.getDate();

  const today = new Date();
  today.setHours(0,0,0,0);

  const todayStr = toKey(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate()
  );

  // ★ 週間潮 初期化（未定義時のみ）
  if (!window.tideWeek) {
    window.tideWeek = [];
  }

  let debugShown = false;

  let html = `<div class="month">`;
  html += `<div class="month-title">${year} ${month}月</div>`;
  html += `<div class="calendar-grid">`;

  html += WEEK_LABELS.map(d => `<div class="cell week-head">${d}</div>`).join("");

  for (let i = 0; i < startDay; i++) {
    html += `<div class="cell empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {

    const date = new Date(year, month - 1, d);
    date.setHours(0,0,0,0);

    const key = toKey(year, month, d);

    const moonAge = calcMoonAge(date);
    const tide = getTideName(moonAge);
    const tideClass = tide === "大潮" ? "tide-big" : "";

    let cls = "cell";
    if (key < todayStr) cls += " past";
    if (key === todayStr) cls += " today";

    // ★ 今日の潮
    if (key === todayStr && !debugShown) {
      debugShown = true;

      window.todayTide = {
        date: key,
        tide: tide
      };
    }

    // ★ 週間潮（今日〜6日後）
    const diff = Math.floor((date - today) / 86400000);

    if (diff >= 0 && diff < 7) {

      // 重複防止（前月・来月ループ対策）
      if (!window.tideWeek.find(v => v.date === key)) {
        window.tideWeek.push({
          date: key,
          tide: tide
        });
      }

    }

    html += `
      <div class="${cls}">
        <div class="day">${d}</div>
        <div class="tide ${tideClass}">${tide}</div>
      </div>
    `;
  }

  html += `</div></div>`;
  return html;
}

function renderCalendar(year, month) {
  if (!calendarWrapper) return;

  calendarWrapper.innerHTML =
    createMonth(year, month - 1) +
    createMonth(year, month) +
    createMonth(year, month + 1);
}

if (calendarBtn && calendarOverlay && calendarWrapper) {

  const today = new Date();
  const baseYear = today.getFullYear();
  const baseMonth = today.getMonth() + 1;

  renderCalendar(baseYear, baseMonth);

  calendarBtn.addEventListener("click", (e) => {
    e.preventDefault();
    calendarOverlay.style.display = "flex";

    requestAnimationFrame(() => {
      calendarWrapper.scrollLeft = calendarWrapper.clientWidth;
    });
  });

calendarOverlay.addEventListener("mousedown", (e) => {
  const rect = calendarWrapper.getBoundingClientRect();

  const inside =
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom;

  if (!inside) {
    calendarOverlay.style.display = "none";
  }
});
  

}

});
