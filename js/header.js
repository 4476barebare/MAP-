function getAlertText(pref, callback) {
  var areaId = pref.url;
  var prefix = (pref && typeof pref.notes === "string") ? pref.notes + ":" : "";
  
  // 気象警報・注意報の名称（夏場に対応）
  var codeMap = {
    "03": "大雨警報", "04": "洪水警報", "05": "暴風警報", "08": "高潮警報",
    "10": "大雨注意報", "14": "雷注意報", "15": "強風注意報", "16": "波浪注意報",
    "18": "洪水注意報", "19": "高潮注意報", "20": "濃霧注意報", "21": "乾燥注意報"
  };

  fetch("https://www.jma.go.jp/bosai/warning/data/r8/" + areaId + ".json")
    .then(function(res) { return res.json(); })
    .then(function(data) {
      // 最新のレポート(配列の最後)を取得
      var latest = data[data.length - 1];
      var warningList = [];
      var advisoryList = [];

      if (latest.warning && latest.warning.class10Items) {
        latest.warning.class10Items.forEach(function(area) {
          area.kinds.forEach(function(kind) {
            if (kind.status === "発表" || kind.status === "継続") {
              var name = codeMap[kind.code];
              if (!name) return; // 定義外は無視

              // 警報(03-08)か注意報(10-)で振り分け
              var c = parseInt(kind.code, 10);
              if (c >= 3 && c <= 8) {
                if (warningList.indexOf(name) === -1) warningList.push(name);
              } else {
                if (advisoryList.indexOf(name) === -1) advisoryList.push(name);
              }
            }
          });
        });
      }

      // 表示ロジック：警報があれば警報のみ、なければ注意報を3つまで
      var finalMsgs = [];
      var color = "#ffffff";

      if (warningList.length > 0) {
        finalMsgs = warningList;
        color = "#ff0000"; // 警報は赤
      } else if (advisoryList.length > 0) {
        finalMsgs = advisoryList.slice(0, 3);
        color = "#ffd400"; // 注意報は黄
      } else {
        finalMsgs = ["現在警報はありません"];
      }

      callback({
        text: prefix + finalMsgs.join(" / "),
        color: color
      });
    })
    .catch(function() {
      callback({ text: prefix + "現在警報はありません", color: "#ffffff" });
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
// ★ ここにソートの一文を追加
      items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

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

// getTideName関数を以下のように修正
function getTideName(moonAge) {
  // 月齢に1を足して、1〜30の「旧暦の日付（目安）」に変換する
  // 30を超えたら1に戻す（1周29.53日なので約30日サイクル）
  let approxKyureki = Math.floor(moonAge) + 1;
  if (approxKyureki > 30) approxKyureki = 1;

  // 旧暦の日付ベースの一般的な潮名判定
  if (approxKyureki >= 1 && approxKyureki <= 3 || approxKyureki >= 15 && approxKyureki <= 18) {
    return "大潮";
  }
  if ((approxKyureki >= 4 && approxKyureki <= 6) || 
      (approxKyureki >= 12 && approxKyureki <= 14) || 
      (approxKyureki >= 19 && approxKyureki <= 22) || 
      approxKyureki === 29 || approxKyureki === 30) {
    return "中潮";
  }
  if ((approxKyureki >= 7 && approxKyureki <= 9) || (approxKyureki >= 23 && approxKyureki <= 25)) {
    return "小潮";
  }
  if (approxKyureki === 10 || approxKyureki === 26) {
    return "長潮";
  }
  if (approxKyureki === 11 || approxKyureki === 27) {
    return "若潮";
  }

  return "中潮"; // 例外処理用（基本はここを通らない）
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


const policyLink = document.getElementById("policyLink");
const policyModal = document.getElementById("policyModal");

const showPolicyBtn = document.getElementById("showPolicy");
const showContactBtn = document.getElementById("showContact");

const policySection = document.getElementById("policySection");
const contactSection = document.getElementById("contactSection");

if (policyLink && policyModal) {

    // 開く
    policyLink.addEventListener("click", (e) => {
        e.preventDefault();
        policyModal.style.display = "block";
    });

    // 背景クリックで閉じる
    policyModal.addEventListener("click", (e) => {
        if (e.target === policyModal) {
            policyModal.style.display = "none";
        }
    });
}

// タブ切替
if (showPolicyBtn && showContactBtn) {

    showPolicyBtn.addEventListener("click", () => {
        policySection.style.display = "block";
        contactSection.style.display = "none";

        showPolicyBtn.classList.add("active");
        showContactBtn.classList.remove("active");
    });

    showContactBtn.addEventListener("click", () => {
        policySection.style.display = "none";
        contactSection.style.display = "block";

        showContactBtn.classList.add("active");
        showPolicyBtn.classList.remove("active");
    });
}