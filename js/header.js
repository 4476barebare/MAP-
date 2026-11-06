// ==========================================
// ★ 気象庁アラート取得関数
// ==========================================
function getAlertText(pref, callback) {
  if (typeof window.showdebug === "function") {
    window.showdebug("[JMA] getAlertText実行 / currentPref=" + (window.currentPref || "null") +
      " / prefData URL=" + (pref ? (pref.url || pref.URL || "なし") : "prefなし"));
  }

  // 古いHTML上のアラート枠が残っていても完全に隠す
  var oldWrap = document.querySelector('.alert-wrap');
  if (oldWrap) oldWrap.style.display = 'none';

  // データが不完全な場合も、県画面ではJNN表示枠を維持する
  if (!pref || (!pref.url && !pref.URL)) {
    if (window.prefData) updateMapAlert("");
    window._currentAlertUrl = null;
    clearMapAlert();
    if (callback) callback({ text: "", color: "" });
    return;
  }

  // 大文字小文字(.url / .URL)の両方の揺れに対応
  var targetUrl = pref.url || pref.URL || "";

  // 同じ県の取得が完了済みなら、表示中の内容を消さずに終了
  if (window._currentAlertUrl === targetUrl) {
    if (callback) callback({ text: "", color: "" });
    return;
  }

  if (window.prefData) updateMapAlert("");
  window._currentAlertUrl = targetUrl;
  var requestId = (window._jmaAlertRequestId || 0) + 1;
  window._jmaAlertRequestId = requestId;
  var requestPrefCode = window.currentPref;

  var areaIds = targetUrl.split('
  
  var codeMap = {
    "03": "大雨警報", "04": "洪水警報", "05": "暴風警報", "07": "波浪警報", "08": "高潮警報",
    "09": "土砂災害警戒情報",
    "10": "大雨注意報", "14": "雷注意報", "15": "強風注意報", "16": "波浪注意報", "20": "濃霧注意報"
  };

  if (areaIds.length === 0) {
    clearMapAlert();
    if (callback) callback({ text: "", color: "" });
    return;
  }

  Promise.all(areaIds.map(function(areaId) {
    if (typeof window.showdebug === "function") window.showdebug("[JMA " + areaId + "] JSON取得開始");
    return fetch("https://www.jma.go.jp/bosai/warning/data/r8/" + areaId + ".json")
      .then(function(res) {
        if (typeof window.showdebug === "function") window.showdebug("[JMA " + areaId + "] HTTP=" + res.status + " / ok=" + res.ok);
        return res.json();
      })
      .then(function(data) {
        if (typeof window.showdebug === "function") window.showdebug("[JMA " + areaId + "] 配列=" + Array.isArray(data) + " / report件数=" + (Array.isArray(data) ? data.length : "N/A"));
        data.sort(function(a, b) { return new Date(a.reportDatetime) - new Date(b.reportDatetime); });

        var statusMap = {};
        data.forEach(function(report, reportIndex) {
          if (report.warning && report.warning.class10Items) {
            if (typeof window.showdebug === "function") window.showdebug("[JMA " + areaId + "] report[" + reportIndex + "] " + (report.reportDatetime || "") + " / class10Items=" + report.warning.class10Items.length);
            report.warning.class10Items.forEach(function(area) {
              (area.kinds || []).forEach(function(kind) {
                if (typeof window.showdebug === "function") window.showdebug("[JMA " + areaId + "] code=" + kind.code + " / status=" + kind.status + " / name=" + (kind.name || ""));
                if (kind.status === "発表" || kind.status === "継続") {
                  statusMap[kind.code] = true;
                } else if (kind.status === "解除") {
                  statusMap[kind.code] = false;
                }
              });
            });
          } else if (typeof window.showdebug === "function") {
            window.showdebug("[JMA " + areaId + "] report[" + reportIndex + "] warning/class10Itemsなし");
          }
        });
        if (typeof window.showdebug === "function") window.showdebug("[JMA " + areaId + "] statusMap=" + JSON.stringify(statusMap));

        var warnings = [];
        var advisories = [];
        
        for (var code in statusMap) {
          if (statusMap[code] === true && codeMap[code]) {
            var name = codeMap[code];
            if (name.indexOf("警報") !== -1 || name.indexOf("警戒") !== -1) {
              warnings.push(name);
            } else {
              advisories.push(name);
            }
          }
        }

        if (typeof window.showdebug === "function") window.showdebug("[JMA " + areaId + "] 警報=" + warnings.join("/") + " / 注意報=" + advisories.join("/"));
        if (warnings.length === 0 && advisories.length === 0) {
          if (typeof window.showdebug === "function") window.showdebug("[JMA " + areaId + "] 表示対象なし");
          return null;
        }

        var finalMsgs = (warnings.length > 0) ? warnings : advisories.slice(0, 3);
        var color = (warnings.length > 0) ? "#ff4d4d" : "#ffea00";
        return { text: finalMsgs.join(" / "), color: color };
      })
      .catch(function(err) {
        if (typeof window.showdebug === "function") window.showdebug("[JMA " + areaId + "] 取得・解析エラー=" + (err && err.message ? err.message : err));
        return null;
      });
  })).then(function(results) {
    if (requestId !== window._jmaAlertRequestId ||
        window.currentPref !== requestPrefCode ||
        !window.prefData ||
        (window.prefData.url || window.prefData.URL || "") !== targetUrl) return;

    var validResults = results.filter(function(r) { return r !== null && r.text !== ""; });
    if (typeof window.showdebug === "function") {
      window.showdebug("[JMA] 全コード処理完了 / 有効結果=" + validResults.length + "件");
      validResults.forEach(function(r, i) { window.showdebug("[JMA] 結果[" + i + "]=" + r.text); });
    }
    
    if (validResults.length > 0) {
      var htmlLines = validResults.map(function(res) {
        return '<span class="jma-alert-message" style="display:inline-block; color: ' + res.color + '; text-shadow: 0 1px 3px rgba(0,0,0,0.8); font-size: 11px; font-weight: bold; letter-spacing: 0.3px; margin-right: 12px;">' + prefix + res.text + '</span>';
      }).join("");
      
      if (typeof window.showdebug === "function") window.showdebug("[JMA] 最終表示文字列=" + htmlLines.replace(/<[^>]*>/g, ""));
      updateMapAlert(htmlLines);
    } else {
      if (typeof window.showdebug === "function") window.showdebug("[JMA] 全コードで表示対象なし");
      clearMapAlert();
    }

    // index.html側がエラーで止まらないように空文字を渡して終了
    if (callback) callback({ text: "", color: "" });
  });
}

// 他ファイルから確実に呼び出せるようwindowへ公開
window.getAlertText = getAlertText;

// ==========================================
// ★ マップ最上部レイヤーにアラートを描画する関数
// ==========================================
function updateMapAlert(html) {
  var alertDiv = document.getElementById('map-jma-alert');
  if (!alertDiv) return;

  if (!window.prefData) {
    alertDiv.style.display = 'none';
    return;
  }

  var viewport = alertDiv.querySelector('.jma-alert-viewport');
  var track = alertDiv.querySelector('.jma-alert-track');
  if (!viewport || !track) return;

  track.innerHTML = html || '';
  track.classList.remove('is-scrolling');
  track.style.animationDuration = '';
  alertDiv.style.display = 'flex';

  if (html) {
    requestAnimationFrame(function() {
      if (track.scrollWidth > viewport.clientWidth) {
        track.style.animationDuration =
          Math.max(24, (track.scrollWidth + viewport.clientWidth) / 12) + 's';
        track.classList.add('is-scrolling');
      }
    });
  }
}

// ==========================================
// ★ 中身を完全にクリアして非表示にする関数
// ==========================================
function clearMapAlert() {
  var alertDiv = document.getElementById('map-jma-alert');
  if (alertDiv) {
    var track = alertDiv.querySelector('.jma-alert-track');
    if (track) {
      track.innerHTML = "";
      track.classList.remove('is-scrolling');
      track.style.animationDuration = '';
    }
    alertDiv.style.display = window.prefData ? 'flex' : 'none';
  }
  if (!window.prefData) {
    window._currentAlertUrl = null;
    window._jmaAlertRequestId = (window._jmaAlertRequestId || 0) + 1;
  }
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
).filter(Boolean);
  var prefix = (typeof pref.notes === "string") ? pref.notes + ": " : "";

  if (typeof window.showdebug === "function") {
    window.showdebug("[JMA] 県=" + (pref.name || window.currentPref || "不明") + " / URL=" + targetUrl);
    window.showdebug("[JMA] 取得対象コード=" + areaIds.join(", ") + " / 件数=" + areaIds.length);
  }
  
  var codeMap = {
    "03": "大雨警報", "04": "洪水警報", "05": "暴風警報", "07": "波浪警報", "08": "高潮警報",
    "09": "土砂災害警戒情報",
    "10": "大雨注意報", "14": "雷注意報", "15": "強風注意報", "16": "波浪注意報", "20": "濃霧注意報"
  };

  if (areaIds.length === 0) {
    clearMapAlert();
    if (callback) callback({ text: "", color: "" });
    return;
  }

  Promise.all(areaIds.map(function(areaId) {
    return fetch("https://www.jma.go.jp/bosai/warning/data/r8/" + areaId + ".json")
      .then(function(res) { return res.json(); })
      .then(function(data) {
        data.sort(function(a, b) { return new Date(a.reportDatetime) - new Date(b.reportDatetime); });

        var statusMap = {};
        data.forEach(function(report) {
          if (report.warning && report.warning.class10Items) {
            report.warning.class10Items.forEach(function(area) {
              area.kinds.forEach(function(kind) {
                if (kind.status === "発表" || kind.status === "継続") {
                  statusMap[kind.code] = true;
                } else if (kind.status === "解除") {
                  statusMap[kind.code] = false;
                }
              });
            });
          }
        });

        var warnings = [];
        var advisories = [];
        
        for (var code in statusMap) {
          if (statusMap[code] === true && codeMap[code]) {
            var name = codeMap[code];
            if (name.indexOf("警報") !== -1 || name.indexOf("警戒") !== -1) {
              warnings.push(name);
            } else {
              advisories.push(name);
            }
          }
        }

        if (warnings.length === 0 && advisories.length === 0) return null;

        var finalMsgs = (warnings.length > 0) ? warnings : advisories.slice(0, 3);
        var color = (warnings.length > 0) ? "#ff4d4d" : "#ffea00";
        return { text: finalMsgs.join(" / "), color: color };
      })
      .catch(function() {
        return null;
      });
  })).then(function(results) {
    if (requestId !== window._jmaAlertRequestId ||
        window.currentPref !== requestPrefCode ||
        !window.prefData ||
        (window.prefData.url || window.prefData.URL || "") !== targetUrl) return;

    var validResults = results.filter(function(r) { return r !== null && r.text !== ""; });
    
    if (validResults.length > 0) {
      var htmlLines = validResults.map(function(res) {
        return '<span class="jma-alert-message" style="display:inline-block; color: ' + res.color + '; text-shadow: 0 1px 3px rgba(0,0,0,0.8); font-size: 11px; font-weight: bold; letter-spacing: 0.3px; margin-right: 12px;">' + prefix + res.text + '</span>';
      }).join("");
      
      updateMapAlert(htmlLines);
    } else {
      clearMapAlert();
    }

    // index.html側がエラーで止まらないように空文字を渡して終了
    if (callback) callback({ text: "", color: "" });
  });
}

// ==========================================
// ★ マップ最上部レイヤーにアラートを描画する関数
// ==========================================
function updateMapAlert(html) {
  var alertDiv = document.getElementById('map-jma-alert');
  if (!alertDiv) return;

  if (!window.prefData) {
    alertDiv.style.display = 'none';
    return;
  }

  var viewport = alertDiv.querySelector('.jma-alert-viewport');
  var track = alertDiv.querySelector('.jma-alert-track');
  if (!viewport || !track) return;

  track.innerHTML = html || '';
  track.classList.remove('is-scrolling');
  track.style.animationDuration = '';
  alertDiv.style.display = 'flex';

  if (html) {
    requestAnimationFrame(function() {
      if (track.scrollWidth > viewport.clientWidth) {
        track.style.animationDuration =
          Math.max(24, (track.scrollWidth + viewport.clientWidth) / 12) + 's';
        track.classList.add('is-scrolling');
      }
    });
  }
}

// ==========================================
// ★ 中身を完全にクリアして非表示にする関数
// ==========================================
function clearMapAlert() {
  var alertDiv = document.getElementById('map-jma-alert');
  if (alertDiv) {
    var track = alertDiv.querySelector('.jma-alert-track');
    if (track) {
      track.innerHTML = "";
      track.classList.remove('is-scrolling');
      track.style.animationDuration = '';
    }
    alertDiv.style.display = window.prefData ? 'flex' : 'none';
  }
  if (!window.prefData) {
    window._currentAlertUrl = null;
    window._jmaAlertRequestId = (window._jmaAlertRequestId || 0) + 1;
  }
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
