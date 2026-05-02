const RSS_LIST = [
  "https://www.lurenewsr.com/feed/",
//  "https://fishingjapan.jp/fishing/rss.php",
  "https://www.youtube.com/feeds/videos.xml?channel_id=UChHUhF5bgoeS1Z-uE_HRQfQ",
  "https://www.youtube.com/feeds/videos.xml?user=yoorai0121"
];



// =========================
// RSS取得
// =========================
function fetchAllRSS(urls) {
  return Promise.all(
    urls.map(url =>
      fetch("https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(url))
        .then(res => {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .catch(() => null) // 1つ死んでも全体は止めない
    )
  );
}


// =========================
// ニュース読み込み
// =========================
function loadNews() {

  const newsList = document.getElementById("newsList");
  if (!newsList) return;

  newsList.innerHTML = "読み込み中...";

  fetchAllRSS(RSS_LIST)
    .then(results => {

      let items = [];

      results.forEach(data => {
        if (data && data.items) {
          items = items.concat(data.items);
        }
      });

      if (items.length === 0) {
        newsList.innerHTML = "記事がありません";
        return;
      }

      // 日付順ソート（統合後）
      items.sort((a, b) =>
        new Date(b.pubDate) - new Date(a.pubDate)
      );

      renderNews(items.slice(0, 30));
    })
    .catch(() => {
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

//const date = new Date(item.pubDate);
//const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
const timeText = formatTimeAgo(item.pubDate);

el.innerHTML = `
  <a href="${item.link}" target="_blank">
    <div class="news-row">
      <img src="${thumb}">
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


    newsList.appendChild(el);
  });
}



function getThumbnail(item) {

  let url = "";

  // RSS2JSON（通常RSS）
  if (item.thumbnail) {
    url = item.thumbnail;
  }

  // YouTube RSS2JSON
  else if (item.enclosure && item.enclosure.link) {
    url = item.enclosure.link;
  }

  // YouTube系で一番確実
  else if (item["media:thumbnail"] && item["media:thumbnail"].url) {
    url = item["media:thumbnail"].url;
  }

  // descriptionから最終救済
  else if (item.description) {
    const match = item.description.match(/https?:\/\/[^"]+\.(jpg|png|jpeg)/);
    if (match) url = match[0];
  }

  return url || "https://placehold.jp/90x60.png";
}

function formatTimeAgo(pubDate) {
  const now = new Date();
  const date = new Date(pubDate);
  const diff = now - date;

  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);
  const month = Math.floor(day / 30);

  if (sec < 60) return "たった今";
  if (min < 60) return `${min}分前`;
  if (hour < 24) return `${hour}時間前`;
  if (day === 1) return "昨日";
  if (day < 30) return `${day}日前`;
  if (month < 12) return `${month}ヶ月前`;

  return `${Math.floor(month / 12)}年前`;
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



