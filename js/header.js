


// =========================
// RSS取得
// =========================
function fetchRSS(url) {
  const api = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(url);

  return fetch(api)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
}


// =========================
// ニュース読み込み
// =========================
function loadNews() {
  //  alert("呼び出し");

  const newsList = document.getElementById("newsList");
  if (!newsList) return;
  //alert("呼び出し2");

  newsList.innerHTML = "読み込み中...";

  const RSS_URL = "https://www.lurenewsr.com/feed/";
  let items = [];

  fetchRSS(RSS_URL)
    .then(function (data) {

      if (!data.items || data.items.length === 0) {
        newsList.innerHTML = "記事がありません";
        return;
      }

      items = data.items;

      // 日付順ソート
      items.sort(function (a, b) {
        return new Date(b.pubDate) - new Date(a.pubDate);
      });

      renderNews(items.slice(0, 20));
    })
    .catch(function () {
      newsList.innerHTML = "取得失敗";
    });
}


// =========================
// 描画
// =========================
function renderNews(items) {

  const newsList = document.getElementById("newsList");
  if (!newsList) return;

  newsList.innerHTML = "";

  items.forEach(function (item) {

    const thumb = getThumbnail(item);
    
    const el = document.createElement("div");
    el.className = "news-item";

el.innerHTML = `
  <a href="${item.link}" target="_blank">
    <div class="news-row">
      <img src="${thumb}">
      <div class="news-text">
        <div class="news-title">${item.title}</div>
        <div class="news-source">${item.author || "RSS"}</div>
      </div>
    </div>
  </a>
`;


    newsList.appendChild(el);
  });
}




function getThumbnail(item) {

  // ① media.content（最重要）
  if (item.media && item.media.content && item.media.content.length > 0) {
    return item.media.content[0].url;
  }

  // ② enclosure
  if (item.enclosure && item.enclosure.link) {
    return item.enclosure.link;
  }

  // ③ thumbnail
  if (item.thumbnail) {
    return item.thumbnail;
  }

  // ④ description
  if (item.description) {
    const match = item.description.match(/<img[^>]+src="([^">]+)"/);
    if (match) return match[1];
  }

  // fallback
  return "https://placehold.jp/90x60.png";
}


// =========================
// HTMLタグ除去
// =========================
function stripHTML(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || "";
}


// =========================
// DOM読み込み後に1回だけ実行
// =========================
document.addEventListener("DOMContentLoaded", function () {

// ===== ニュースモーダル =====

const newsLink = document.getElementById("newsBtn");
const newsModal = document.getElementById("newsModal");

if (newsLink && newsModal) {

  // 開く
  newsLink.addEventListener("click", (e) => {
    e.preventDefault();
    newsModal.style.display = "block";

    // ★開いたタイミングで読み込む
    loadNews();
  });

  // 背景クリックで閉じる
  newsModal.addEventListener("click", (e) => {
    if (e.target === newsModal) {
      newsModal.style.display = "none";
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
const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function createMonth(year, month) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);

  const startDay = first.getDay();
  const daysInMonth = last.getDate();

  const today = new Date();
  const todayStr = toKey(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate()
  );

  let html = `<div class="month">`;
  html += `<div class="month-title">${year} ${month}月</div>`;
  html += `<div class="calendar-grid">`;

  // ★曜日ヘッダー（ここだけ追加）
  html += WEEK_LABELS.map(d => `<div class="cell week-head">${d}</div>`).join("");

  // 空白
  for (let i = 0; i < startDay; i++) {
    html += `<div class="cell empty"></div>`;
  }

  // 日付
  for (let d = 1; d <= daysInMonth; d++) {

    const date = new Date(year, month - 1, d);
    const key = toKey(year, month, d);

    const moonAge = calcMoonAge(date);
    const tide = getTideName(moonAge);
    const tideClass = tide === "大潮" ? "tide-big" : "";

    let cls = "cell";
    if (key < todayStr) cls += " past";
    if (key === todayStr) cls += " today";

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



