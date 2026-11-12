// ==========================================
// ★ SNS釣果データ (integrated_catch.json) 取得＆ヘッダーモーダル一覧表示
// ==========================================
window.snsCatchData = window.snsCatchData || [];
window.isSnsCatchLoaded = window.isSnsCatchLoaded || false;
window._isSnsCatchLoading = window._isSnsCatchLoading || false;
window._snsCatchDataCache = window._snsCatchDataCache || {};
window._snsCatchPromises = window._snsCatchPromises || {};

// SNS釣果データ取得関数（ヘッダー・記事ページ共通）
window.loadSnsCatchData = function(regionCode) {
  const targetRegion = regionCode || window.currentRegion || 'KANTO';

  if (Object.prototype.hasOwnProperty.call(window._snsCatchDataCache, targetRegion)) {
    window.snsCatchData = window._snsCatchDataCache[targetRegion];
    window.isSnsCatchLoaded = true;
    window._isSnsCatchLoading = false;
    window._snsCatchActiveRegion = targetRegion;
    return Promise.resolve(window.snsCatchData);
  }

  if (window._snsCatchPromises[targetRegion]) {
    return window._snsCatchPromises[targetRegion];
  }

  const url = `/${targetRegion}/integrated_catch.json`;
  window._isSnsCatchLoading = true;
  window._snsCatchActiveRegion = targetRegion;

  const promise = fetch(url, { priority: 'low' })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      const items = Array.isArray(data) ? data : [];
      window._snsCatchDataCache[targetRegion] = items;

      if (window._snsCatchActiveRegion === targetRegion) {
        window.snsCatchData = items;
        window.isSnsCatchLoaded = true;
      }
      return items;
    })
    .catch(err => {
      console.warn('SNS釣果データの読み込みスキップ:', err);
      return [];
    })
    .finally(() => {
      delete window._snsCatchPromises[targetRegion];
      if (window._snsCatchActiveRegion === targetRegion) {
        window._isSnsCatchLoading = false;
      }
    });

  window._snsCatchPromises[targetRegion] = promise;
  window._snsCatchPromise = promise;
  return promise;
};

// prefコードや座標から県名（日本語）を取得するヘルパー
const PREF_CODE_NAME_MAP = {
  TOKYO: '東京都',
  KANAGAWA: '神奈川県',
  CHIBA: '千葉県',
  IBARAKI: '茨城県',
  SAITAMA: '埼玉県',
  GUNMA: '群馬県',
  TOCHIGI: '栃木県'
};

function resolveSnsPrefName(item) {
  if (!item) return '-';
  const rawPref = String(item.pref || item.prefecture || item.prefCode || '').trim();
  if (rawPref) {
    const upper = rawPref.toUpperCase();
    if (PREF_CODE_NAME_MAP[upper]) return PREF_CODE_NAME_MAP[upper];
    if (window.regionPrefData && Array.isArray(window.regionPrefData)) {
      const found = window.regionPrefData.find(p => p.prefCode === upper || p.prefName === rawPref);
      if (found && found.prefName) return found.prefName;
    }
    return rawPref;
  }

  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    if (window.allspotData && window.allspotData.length > 0) {
      let nearestSpot = null;
      let minDist = Infinity;
      for (let i = 0; i < window.allspotData.length; i++) {
        const s = window.allspotData[i];
        if (!s || s.type === 'pref' || !s.lat || !s.lng) continue;
        const d = Math.pow(Number(s.lat) - lat, 2) + Math.pow(Number(s.lng) - lng, 2);
        if (d < minDist) {
          minDist = d;
          nearestSpot = s;
        }
      }
      if (nearestSpot && nearestSpot._prefCode) {
        const code = String(nearestSpot._prefCode).toUpperCase();
        if (PREF_CODE_NAME_MAP[code]) return PREF_CODE_NAME_MAP[code];
      }
    }
    if (window.regionPrefData && window.regionPrefData.length > 0) {
      let nearestPref = '';
      let minD = Infinity;
      window.regionPrefData.forEach(p => {
        const d = Math.pow(Number(p.lat) - lat, 2) + Math.pow(Number(p.lng) - lng, 2);
        if (d < minD) {
          minD = d;
          nearestPref = p.prefName;
        }
      });
      if (nearestPref) return nearestPref;
    }
  }

  return window.prefData && window.prefData.notes ? window.prefData.notes : '-';
}

function getHeaderSnsClass(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('instagram')) return 'sns-instagram';
  if (s === 'x' || s.includes('twitter')) return 'sns-x';
  if (s.includes('facebook')) return 'sns-facebook';
  if (s.includes('threads')) return 'sns-threads';
  return 'sns-default';
}

function getHeaderSnsDisplayName(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('instagram')) return 'Instagram';
  if (s === 'x' || s.includes('twitter')) return 'X';
  if (s.includes('facebook')) return 'Facebook';
  if (s.includes('threads')) return 'Threads';
  return source ? String(source) : 'SNS';
}

function loadSnsModalList() {
  const snsList = document.getElementById("snsList");
  if (!snsList) return;

  const renderSorted = (items) => {
    if (!Array.isArray(items) || items.length === 0) {
      snsList.innerHTML = "SNS釣果データがありません";
      return;
    }

    const sorted = [...items].sort((a, b) => {
      const da = new Date(String(a.date || '').replace(/-/g, '/')).getTime() || 0;
      const db = new Date(String(b.date || '').replace(/-/g, '/')).getTime() || 0;
      return db - da;
    });

    renderSnsModalList(sorted);
  };

  snsList.innerHTML = "読み込み中...";
  const targetRegion = window.TARGET_REGION_CODE || window.currentRegion || 'KANTO';
  window.loadSnsCatchData(targetRegion)
    .then(items => renderSorted(items))
    .catch(() => { snsList.innerHTML = "取得失敗"; });
}

function renderSnsModalList(items) {
  const snsList = document.getElementById("snsList");
  if (!snsList) return;

  snsList.innerHTML = "";

  let prevDateKey = null; // 日付が切り替わる位置に区切り線を入れるための記憶

  items.forEach(item => {
    const el = document.createElement("div");
    el.className = "sns-modal-row";

    const dateText = String(item.date || '').trim() || '-';

    // 日付（YYYY/MM/DD）が前の行と変わったら、区切り線を挿入
    const dateKey = dateText.replace(/-/g, '/').slice(0, 10);
    if (prevDateKey !== null && dateKey !== prevDateKey) {
      const divider = document.createElement("div");
      divider.className = "modal-date-divider";
      divider.setAttribute("aria-hidden", "true");
      snsList.appendChild(divider);
    }
    prevDateKey = dateKey;
    const prefName = resolveSnsPrefName(item);
    const placeName = String(item.area_name || item.place || item.location || '釣り場付近').replace(/[<>&"']/g, '');
    const fishName = String(item.fish || '-').replace(/[<>&"']/g, '');
    const snsName = getHeaderSnsDisplayName(item.source);
    const snsClass = getHeaderSnsClass(item.source);
    const linkUrl = item.url || '#';

    el.innerHTML = `
      <span class="sns-col-date">${dateText}</span>
      <span class="sns-col-pref">${prefName}</span>
      <span class="sns-col-place" title="${placeName}">${placeName}</span>
      <span class="sns-col-fish" title="${fishName}">${fishName}</span>
      <span class="sns-col-source ${snsClass}">${snsName}</span>
      <a class="sns-col-link ${snsClass}" href="${linkUrl}" target="_blank" rel="noopener noreferrer">リンク↗</a>
    `;

    snsList.appendChild(el);
  });
}

// ==========================================
// ニュース一覧（data/newslist.json）
//  ・MAIN_CATEGORY（釣りニュース）：サムネ付きカード
//  ・その他カテゴリ：favicon + タイトル + サイト名のシンプルなリンク
//  ・未来の日付（イベント予告など）は先頭に表示
// ==========================================
const NEWS_JSON_URL = "../data/newslist.json";
const NEWS_MAIN_CATEGORY = "釣りニュース";
const NEWS_MAX_ITEMS = 200;
const NEWS_WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

// Date を "YYYY-MM-DD" にする（端末ローカル日付）
function formatDateKey(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

// 端末ローカルの今日を "YYYY-MM-DD" で返す
function getTodayDateKey() {
  return formatDateKey(new Date());
}

// ---- イベント記事（カテゴリ名に「イベント」を含むもの）----
const NEWS_EVENT_KEYWORD = "イベント";

function isEventNewsItem(item) {
  return !!item && String(item.category || "").includes(NEWS_EVENT_KEYWORD);
}

function toHalfWidthDigits(str) {
  return String(str).replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

// 記事の「日付キー」を返す。
//  ・イベント記事：タイトル先頭の【11月15日開催】から開催日を読み取る（年は掲載日から補完）
//  ・それ以外／読み取れない場合：JSONの date（掲載日）
function getNewsDateKey(item) {
  const baseKey = String((item && item.date) || "");
  if (!isEventNewsItem(item)) return baseKey;

  const m = toHalfWidthDigits(item.title).match(/^\s*【\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  const b = baseKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || !b) return baseKey;

  const month = Number(m[1]);
  const day = Number(m[2]);
  const pub = new Date(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  let event = new Date(pub.getFullYear(), month - 1, day);

  // 存在しない日付（13月・2/31など）は採用しない
  if (event.getMonth() !== month - 1 || event.getDate() !== day) return baseKey;

  // 掲載日より2か月以上前になる場合は翌年（12月掲載の1月開催など）
  if (pub - event > 60 * 86400000) {
    event = new Date(pub.getFullYear() + 1, month - 1, day);
  }
  return formatDateKey(event);
}

// カレンダーに載せる文言：タイトル先頭の【…】を除いた残り（【】が無ければタイトル全体）
function getEventCalendarLabel(title) {
  const t = String(title || "").trim();
  return t.replace(/^【[^】]*】\s*/, "") || t;
}

// ニュースJSONの取得（ニュース一覧・カレンダー共通。成功時はキャッシュ、失敗時は次回再取得）
let _newsItemsPromise = null;

function fetchNewsItems() {
  if (_newsItemsPromise) return _newsItemsPromise;

  _newsItemsPromise = fetch(NEWS_JSON_URL)
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(data => {
      const rawItems = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
      return rawItems.filter(item => item && item.title && item.source_url);
    })
    .catch(err => {
      _newsItemsPromise = null;
      throw err;
    });

  return _newsItemsPromise;
}

// 並び順：① 未来日付を先頭（近い順） ② 過去は新しい順 ③ 同日は釣りニュースを先に、その後はJSON順
function sortNewsItems(items) {
  const todayKey = getTodayDateKey();

  return items
    .map((item, index) => ({ item, index, dateKey: getNewsDateKey(item) }))
    .sort((a, b) => {
      const da = a.dateKey;
      const db = b.dateKey;
      const futureA = da > todayKey;
      const futureB = db > todayKey;

      if (futureA !== futureB) return futureA ? -1 : 1;

      if (da !== db) {
        if (futureA) return da < db ? -1 : 1;
        return da < db ? 1 : -1;
      }

      const mainA = a.item.category === NEWS_MAIN_CATEGORY ? 0 : 1;
      const mainB = b.item.category === NEWS_MAIN_CATEGORY ? 0 : 1;
      if (mainA !== mainB) return mainA - mainB;

      return a.index - b.index;
    })
    .map(x => x.item);
}

// 日付のみのデータ用の表示：未来は「11/21（土）」、過去は「今日／昨日／N日前」
function formatNewsDate(dateStr) {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";

  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target - today) / 86400000);

  if (diffDays > 0) {
    return Number(m[2]) + "/" + Number(m[3]) + "（" + NEWS_WEEK_LABELS[target.getDay()] + "）";
  }
  if (diffDays === 0) return "今日";
  if (diffDays === -1) return "昨日";
  if (diffDays > -30) return Math.abs(diffDays) + "日前";
  if (diffDays > -365) return Math.floor(Math.abs(diffDays) / 30) + "ヶ月前";
  return Math.floor(Math.abs(diffDays) / 365) + "年前";
}

function loadNews() {

  const newsList = document.getElementById("newsList");
  if (!newsList) return;

  newsList.innerHTML = "読み込み中...";

  fetchNewsItems()
    .then(items => {
      if (items.length === 0) {
        newsList.innerHTML = "記事がありません";
        return;
      }

      renderNews(sortNewsItems(items).slice(0, NEWS_MAX_ITEMS));
    })
    .catch(() => {
      newsList.innerHTML = "取得失敗";
    });
}

function renderNews(items) {

  const newsList = document.getElementById("newsList");
  if (!newsList) return;

  newsList.innerHTML = "";

  const todayKey = getTodayDateKey();
  let prevDateKey = null; // 日付が切り替わる位置に区切り線を入れるための記憶

  items.forEach((item, index) => {

    const dateKey = getNewsDateKey(item);
    if (prevDateKey !== null && dateKey !== prevDateKey) {
      const divider = document.createElement("div");
      divider.className = "modal-date-divider";
      divider.setAttribute("aria-hidden", "true");
      newsList.appendChild(divider);
    }
    prevDateKey = dateKey;

    const link = escapeHtml(item.source_url);
    const title = escapeHtml(item.title);
    const source = escapeHtml(item.source_name || "");
    const dateText = escapeHtml(formatNewsDate(dateKey));
    const isUpcoming = dateKey > todayKey;
    const dateClass = isUpcoming ? "news-date is-upcoming" : "news-date";

    const sourceHtml = source ? `<div class="news-source">${source}</div>` : "";
    const dateHtml = dateText ? `<div class="${dateClass}">${dateText}</div>` : "";

    const el = document.createElement("div");

    if (item.category === NEWS_MAIN_CATEGORY) {
      // ---- 釣りニュース：サムネ付きカード ----
      const thumb = item.thumbnail ? escapeHtml(item.thumbnail) : "";
      el.className = thumb ? "news-item" : "news-item no-image";

      el.innerHTML = `
        <a href="${link}" target="_blank" rel="noopener">
          <div class="news-row">
            ${thumb ? `<img class="news-thumb" src="${thumb}" loading="lazy" alt="">` : ""}
            <div class="news-text">
              <div class="news-title">${title}</div>
              <div class="news-meta">${sourceHtml}${dateHtml}</div>
            </div>
          </div>
        </a>
      `;

      // 画像が死んだら削除（レイアウト維持）
      const img = el.querySelector(".news-thumb");
      if (img) {
        img.onerror = () => {
          el.classList.add("no-image");
          img.remove();
        };
      }
    } else {
      // ---- その他カテゴリ：タイトル / [favicon サイト名] 日付 ----
      const favicon = item.favicon ? escapeHtml(item.favicon) : "";
      const faviconHtml = favicon
        ? `<img class="news-favicon" src="${favicon}" width="12" height="12" loading="lazy" alt="">`
        : "";
      const siteHtml = (faviconHtml || sourceHtml)
        ? `<div class="news-site">${faviconHtml}${sourceHtml}</div>`
        : "";
      el.className = "news-item news-link-item";

      el.innerHTML = `
        <a href="${link}" target="_blank" rel="noopener">
          <div class="news-row">
            <div class="news-text">
              <div class="news-title">${title}</div>
              <div class="news-meta">${siteHtml}${dateHtml}</div>
            </div>
          </div>
        </a>
      `;

      // faviconが取れなければ消す
      const icon = el.querySelector(".news-favicon");
      if (icon) icon.onerror = () => icon.remove();
    }

    newsList.appendChild(el);

    if ((index + 1) % 5 === 0) {
      newsList.appendChild(renderAdBlock());
    }
  });
}

// カレンダーの各日付セルに、その日のイベント記事を書き込む
function renderCalendarEvents(items) {
  const cells = document.querySelectorAll("#calendarWrapper .cell[data-date]");
  if (!cells.length) return;

  const byDate = {};
  items.filter(isEventNewsItem).forEach(item => {
    const key = getNewsDateKey(item);
    (byDate[key] = byDate[key] || []).push(item);
  });

  cells.forEach(cell => {
    const slot = cell.querySelector(".cal-events");
    if (!slot) return;

    const list = byDate[cell.dataset.date] || [];
    slot.innerHTML = list.map(item => {
      const label = escapeHtml(getEventCalendarLabel(item.title));
      const fullTitle = escapeHtml(item.title);
      const href = escapeHtml(item.source_url);
      return `<a class="cal-event" href="${href}" target="_blank" rel="noopener" title="${fullTitle}">${label}</a>`;
    }).join("");
  });
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

// 共通：モーダルの開閉（開いている間は背景スクロールを止める）
function openOverlayModal(modal, display = "block") {
  modal.style.display = display;
  document.documentElement.classList.add("is-modal-open");
}

function closeOverlayModal(modal) {
  modal.style.display = "none";
  document.documentElement.classList.remove("is-modal-open");
}

const newsLink = document.getElementById("newsBtn");
const newsModal = document.getElementById("newsModal");

if (newsLink && newsModal) {
  newsLink.addEventListener("click", (e) => {
    e.preventDefault();
    openOverlayModal(newsModal);
    loadNews();
  });

  // 暗幕（外側）タップで閉じる
  newsModal.addEventListener("click", (e) => {
    if (e.target === newsModal) closeOverlayModal(newsModal);
  });
}

const snsLink = document.getElementById("snsBtn");
const snsModal = document.getElementById("snsModal");

if (snsLink && snsModal) {
  snsLink.addEventListener("click", (e) => {
    e.preventDefault();
    openOverlayModal(snsModal);
    loadSnsModalList();
  });

  // 暗幕（外側）タップで閉じる
  snsModal.addEventListener("click", (e) => {
    if (e.target === snsModal) closeOverlayModal(snsModal);
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

  // 月の繰り上がり・繰り下がり（0月・13月）を正規化
  const base = new Date(year, month - 1, 1);
  year = base.getFullYear();
  month = base.getMonth() + 1;

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
      <div class="${cls}" data-date="${key}">
        <div class="cell-head">
          <div class="day">${d}</div>
          <div class="tide ${tideClass}">${tide}</div>
        </div>
        <div class="cal-events"></div>
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

  // イベント記事は初回にカレンダーを開いたときだけ取得する
  let calendarEventsLoaded = false;
  const loadCalendarEvents = () => {
    if (calendarEventsLoaded) return;
    fetchNewsItems()
      .then(items => {
        renderCalendarEvents(items);
        calendarEventsLoaded = true;
      })
      .catch(() => {});
  };

  calendarBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openOverlayModal(calendarOverlay, "flex");

    requestAnimationFrame(() => {
      calendarWrapper.scrollLeft = calendarWrapper.clientWidth;
    });

    loadCalendarEvents();
  });

  // 暗幕（外側）タップで閉じる
  calendarOverlay.addEventListener("click", (e) => {
    if (e.target === calendarOverlay) closeOverlayModal(calendarOverlay);
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
