// ==========================================
// prefLoader.js : PREF 画面のロード管理
//
// 方針
//  1. 選択県の location.json を loadPrefectureSpots(select) で取得し、drawLocation() を開始。
//  2. 描画と並行して他県データ（other）と選択県の天気・魚種データを取得。
//  3. 描画後に全県データ（all）を集約し、県マーカーを表示。
//  4. 他県の天気・魚種データはマーカー表示の裏で順次付与する。
//
// 依存（regionLoader.js・変更なし）:
//   loadRegionCSV / loadRegionCsvData / loadPrefectureSpots / rebuildAllSpotData
//   window.prefSpotData / window.prefSpotPromises / window._loadedPrefSet
// 依存（dataLoader.js）: drawLocation
// ==========================================

// 取得済みの県データ（location.json の parent 行）を返す
function getPrefParentRow(prefCode) {
    const rows = window.prefSpotData && window.prefSpotData[prefCode];
    if (!Array.isArray(rows)) return null;
    return rows.find(r => r.name === prefCode && r.individualId === 'parent') || null;
}

// drawLocation に渡す値を {name, lat, lng, zoom} で返す。無効なら null
function toDrawTarget(row, fallbackName) {
    if (!row) return null;
    const lat = parseFloat(row.lat);
    const lng = parseFloat(row.lng);
    const zoom = parseFloat(row.zoom);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return null;
    return { name: row.name || fallbackName, lat, lng, zoom };
}

// flyTo の完了待ち（moveend 未発火の同一座標ケース用にタイムアウト付き）
function waitMapSettled(timeoutMs = 1200) {
    return new Promise(resolve => {
        if (!window.map) { resolve(); return; }
        let done = false;
        let timer = null;
        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            window.map.off('moveend', finish);
            requestAnimationFrame(() => resolve());
        };
        window.map.on('moveend', finish);
        timer = setTimeout(finish, timeoutMs);
    });
}

// ==========================================
// pref_management：region_management() の PREF 版
// ==========================================
async function pref_management(prefCode = window.currentPref) {
    if (!prefCode) return false;

    const regionCode = window.currentRegion || 'KANTO';
    window.currentPref = prefCode;
    window.prefLocationUrl = `/${regionCode}/${prefCode}_location.json`;

    const mapExistedBefore = !!window.map;

    // 地図の操作制限を解除（region_management と同じ初期化）
    if (window.map) {
        window.map.setMinZoom(0);
        window.map.setMaxZoom(18);
        window.map.setMaxBounds(null);
        window.map.options.maxBoundsViscosity = 0;
        window.map.stop();
    }

    // ---------- 1. 最優先：選択県の表示準備 ----------
    const isRegionReady = await loadRegionCSV();       // キャッシュがあれば再利用
    if (!isRegionReady) return false;

    await loadPrefectureSpots(prefCode, 'select');      // 選択県だけ先行取得
    if (typeof loadLocationJSON === 'function') {
        await loadLocationJSON();                      // areaData / spotData を先に確実に展開
    }
    const parent = getPrefParentRow(prefCode);
    const target = toDrawTarget(parent, prefCode);     // zoom は必ず location.json から
    if (!target) {
        console.error('pref_management: location.json から drawLocation 用データを確定できません:', prefCode);
        return false;
    }
    window.prefData = parent;

    // ---------- 2. 地図描画を開始し、他県取得・選択県の付帯データを並行開始 ----------
    const drawPromise = drawLocation(target.name, target.lat, target.lng, target.zoom);
    const otherPromise = loadPrefectureSpots(prefCode, 'other');

    const bgGen = (window._prefBgGen = (window._prefBgGen || 0) + 1);
    const selectedBgPromise = window._prefBgDone
        ? Promise.resolve()
        : applyPrefWeatherAndFish(prefCode, regionCode);

    // ---------- 3. 地図描画だけを待って呼び出し元へ戻す ----------
    await drawPromise;
    if (mapExistedBefore && !window.isInitialMapLoad) {
        await waitMapSettled();
    }

    // 他県データの集約・マーカー生成・他県の天気魚種付与は裏で継続する。
    window._prefBackgroundLoad = otherPromise
        .then(() => loadPrefectureSpots(prefCode, 'all'))
        .then(() => {
            const finalParent = getPrefParentRow(prefCode);
            if (finalParent) window.prefData = finalParent;
            return showPrefMarkers();
        })
        .then(() => {
            if (window._prefBgDone) {
                if (!window.currentAreaId && !window.currentSpotId) {
                    if (typeof initAreaUI === 'function') initAreaUI();
                    if (typeof renderPrefWeather === 'function') renderPrefWeather();
                }
                return;
            }
            return runPrefBackgroundLoads(prefCode, Promise.resolve(), bgGen, selectedBgPromise);
        })
        .catch(err => {
            console.error('都道府県バックグラウンド処理エラー:', err);
        });

    return !!window.prefData;
}


// ==========================================
// 4-a. 全県スポットマーカー表示（regionLoader.js の既存関数を再利用）
// showAllRegionSpots : 全県のドットを4ms分割で生成
// showPrefSpots      : 対象県を強調（他県は薄く・タップ不可）
// スポット画面（currentSpotId あり）ではドットが非表示になるため生成しない。
// ==========================================
async function showPrefMarkers() {
    if (window.currentSpotId) {
        return;
    }
    if (typeof showAllRegionSpots !== 'function') {
        return;
    }
    await showAllRegionSpots();
    if (typeof showPrefSpots === 'function') {
        showPrefSpots();
    }
}

// ==========================================
// 4-b. 天気・魚種の付与（マーカー表示の裏で実行）
// 付与先は window.prefSpotData[県] の行。window.spotData は同じ行オブジェクトを共有しているため、
// ここで付与しておけば既存の後続処理（loadPrefectureData など）からもそのまま見える。
// 既存処理との重複はそのまま残す（通信は各ローダーのキャッシュで共有される）。
// ==========================================

// 県別の沿岸天気JSONを取得して、その県の行へ付与。
// 内陸天気JSONは従来どおり、マーカー表示後に別途付与する。
function applyPrefWeather(prefCode) {
    return AddWeather(prefCode, 'select');
}

// 1県ぶんの天気＋魚種を並列で付与
function applyPrefWeatherAndFish(prefCode, regionCode) {
    const fishUrl = `/${regionCode}/${prefCode}_fish.json`;
    return Promise.all([
        applyPrefWeather(prefCode),
        typeof loadFishDataForPref === 'function'
            ? loadFishDataForPref(prefCode, fishUrl)
            : Promise.resolve(null)
    ]);
}

// 対象県 → （マーカー完了後）内陸CSVを1回だけ取得 → 他県を1県ずつ順番に
async function runPrefBackgroundLoads(prefCode, markersPromise, gen, selectedPromise) {
    const regionCode = window.currentRegion || 'KANTO';
    const isStale = () => window._prefBgGen !== gen;   // 新しい pref_management が走ったら中断
    const yieldFrame = () => (typeof window._yieldFrame === 'function' ? window._yieldFrame() : Promise.resolve());

    // 1. 対象県：天気＋魚種（通信はマーカー描画と並行）
    await (selectedPromise || applyPrefWeatherAndFish(prefCode, regionCode));
    if (isStale()) return;

    // 2. 内陸天気JSON：マーカー描画完了後に選択県へ付与
    await markersPromise;
    await AddInLandWeather(prefCode, 'select');
    if (isStale()) return;

    // 選択県の沿岸・内陸天気JSONが揃ってからPREF画面UIを初期化する（エリア・スポット画面遷移後は上書きしない）。
    if (!window.currentAreaId && !window.currentSpotId) {
        if (typeof initAreaUI === 'function') initAreaUI();
        if (typeof renderPrefWeather === 'function') renderPrefWeather();
    }

    // 3. 他県：1県ずつ順番に、沿岸JSON → 内陸JSON → 魚種JSONの付与を進める
    const csvData = await loadRegionCsvData();
    const otherCodes = (csvData.prefRows || [])
        .map(p => p.prefCode)
        .filter((code, i, arr) => code && code !== prefCode && arr.indexOf(code) === i);

    for (const code of otherCodes) {
        if (isStale()) return;
        await yieldFrame();
        await applyPrefWeatherAndFish(code, regionCode);
        await AddInLandWeather(code, 'select');
    }

    // 中断されずに全県ぶん終えたら完了フラグを立てる
    if (!isStale()) window._prefBgDone = true;
}

// ==========================================
// PREF画面UI・天気・気象警報
// ※ 初回移動では関数の記述内容を変更しない
// ==========================================

function initAreaUI() {

    const menu = document.getElementById('map-menu');
    if (!menu) return;

    menu.style.display = 'block';

    const ul = menu.querySelector('ul');
    if (!ul) return;

    // =====================
    // ■ リスト削除（スッキリ書き換え）
    // =====================
    const oldItems = ul.querySelectorAll('li'); 
    oldItems.forEach(el => el.remove());

    // =====================
    // ■ エリアリスト
    // =====================
    window.areaData.forEach(area => {

        const li = document.createElement('li');

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.width = '100%';
        row.style.cursor = 'pointer';

        row.onclick = () => {
            // 1. クエリを更新（日本語名notesを使用）
            if (window.prefData) setIdealQuery('pref', window.prefData.notes);
            setIdealQuery('area', area.name);
            setIdealQuery('spot', null);

            // 2. システム変数を直接更新
            window.currentAreaId = area.areaId + '_' + area.individualId;
            window.currentSpotId = null;

            destroyAreaUI();
            
            // 3. 直接個別描画関数を呼び出して即座にマーカーを描画する
            selectArea(area);
        };

        const left = document.createElement('div');
        left.style.flex = '1';

        const btn = document.createElement('button');
        btn.textContent = area.name;
        btn.style.width = '100%';

        left.appendChild(btn);

        const right = document.createElement('div');
        right.id = area.areaId + '_' + area.individualId;
        right.className = 'pref-weather';
        right.textContent = "loading…";

        row.appendChild(left);
        row.appendChild(right);
        li.appendChild(row);
        ul.appendChild(li);
    });

    // =====================
    // ■ handler再設定
    // =====================
    if (window.nearestClickHandler) {
        window.map.off('click', window.nearestClickHandler);
    }

    window.nearestClickHandler = function(e) {

        if (!window.nearestClickEnabled) return;

        const rect = menu.getBoundingClientRect();
        const x = e.originalEvent.clientX;
        const y = e.originalEvent.clientY;

        if (
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom
        ) return;

        let nearest = null;
        let minDist = Infinity;

        for (const area of window.areaData) {

            const dLat = e.latlng.lat - area.lat;
            const dLng = e.latlng.lng - area.lng;
            const dist = dLat * dLat + dLng * dLng;

            if (dist < minDist) {
                minDist = dist;
                nearest = area;
            }
        }

        if (!nearest) return;

        // 1. クエリを更新（日本語名notesを使用）
        if (window.prefData) setIdealQuery('pref', window.prefData.notes);
        setIdealQuery('area', nearest.name);
        setIdealQuery('spot', null);

        // 2. システム変数を直接更新
        window.currentAreaId = nearest.areaId + '_' + nearest.individualId;
        window.currentSpotId = null;

        destroyAreaUI();
        
        // 3. 直接個別描画関数を呼び出して即座にマーカーを描画する
        selectArea(nearest);
    };

    window.nearestClickEnabled = true;
    window.map.on('click', window.nearestClickHandler);
}

function destroyAreaUI() {
    const menuUl = document.querySelector('#map-menu ul');

    // ★ headerを強制的に none にしていた古い記述を完全に削除しました

    // ★ リストだけ削除
    if (menuUl) {
        const items = menuUl.querySelectorAll('li'); // headerが外に出たので、単純に li を全部消すだけでOK
        items.forEach(el => el.remove());
    }

    if (window.nearestClickHandler) {
        window.map.off('click', window.nearestClickHandler);
        window.nearestClickHandler = null;
    }

    window.nearestClickEnabled = false;
    document.getElementById('map-menu').style.display = 'none';
}

function renderPrefWeather() {

    const elements = document.getElementsByClassName('pref-weather');

    for (let i = 0; i < elements.length; i++) {

        const el = elements[i];
        const areaId = el.id;

        const rep = window.spotData.find(s => {
            if (s.areaId !== areaId) return false;
            const typeParts = (s.type || '').split('$');
            return typeParts.includes('representative');
        });

        if (!rep || !rep.whether) {
            el.textContent = 'no data';
            continue;
        }

        const w = formatPrefWeather(rep.whether);
        const rows = rep.whether?.hourly?.[0]?.weather || [];

        const startHour = 0;

        const morningRows = [];
        const afternoonRows = [];

        for (let i = 0; i < rows.length; i++) {

            const hour = startHour + i * 2;

            if (hour >= 5 && hour <= 12) {
                morningRows.push(rows[i]);
            } else if (hour >= 13 && hour <= 20) {
                afternoonRows.push(rows[i]);
            }
        }

        const getIconSafe = (r) => {
            if (!Array.isArray(r) || r.length === 0) return null;
            return calcRepresentativeIcon(r);
        };

        const iconMorning = getIconSafe(morningRows);
        const iconAfternoon = getIconSafe(afternoonRows);

        let icon = '';

        if (iconMorning && iconAfternoon) {
            icon = iconMorning === iconAfternoon
                ? iconMorning
                : `${iconMorning}<span class="unit-text">→</span>${iconAfternoon}`;
        } else {
            icon = iconMorning || iconAfternoon || '';
        }

        const temp = w.temp;
        const pop = Math.min(99, Math.round(w.pop));
        const wind = w.wind;
        const name = rep.name;

el.innerHTML = `
    <span class="col-icon">${icon}</span>

<div class="col-temp">
    <span class="num-fixed">${temp}</span><span class="unit-text">°C</span>
</div>

<div class="col-label">
    <span class="unit-text">降水</span>
</div>

<div class="col-pop">
    <span class="num-fixed">${Math.min(pop, 99)}</span><span class="unit-text">%</span>
</div>

<div class="col-wind">
    <span class="num-fixed">${wind}</span><span class="unit-text">m/s</span>
</div>

    <span class="pref-name">${name}</span>
`;

    }
}

function formatPrefWeather(whether) {

    const today = whether?.hourly?.[0];
    if (!today || !Array.isArray(today.weather)) {
        return null;
    }

    let maxTemp = -Infinity;
    let maxPop = -Infinity;
    let maxWind = -Infinity;

    let codeSum = 0;
    let codeCount = 0;

    for (const row of today.weather) {

        if (!Array.isArray(row)) continue;

        const code = row[0];
        const temp = row[1];
        const pop = row[2];
        const wind = row[4];

        // 天気コード（補間対応で平均化）
        if (typeof code === "number") {
            codeSum += code;
            codeCount++;
        }

        // 気温（最大）
        if (typeof temp === "number") {
            maxTemp = Math.max(maxTemp, temp);
        }

        // 降水確率（最大）
        if (typeof pop === "number") {
            maxPop = Math.max(maxPop, pop);
        }

        // 風速（最大）
        if (typeof wind === "number") {
            maxWind = Math.max(maxWind, wind);
        }
    }

    if (codeCount === 0) return null;

    // ===== ここから追加 =====

    let displayPop = null;

    if (maxPop !== -Infinity) {

        // ★ ノイズカット（微小な確率は0扱い）
        if (maxPop < 5) {
            displayPop = 0;
        } else {
            // ★ 10%刻みに丸め（気象庁フォーマット）
            displayPop = Math.round(maxPop / 10) * 10;
        }
    }

    // ===== ここまで追加 =====

    return {
        icon: Math.round(codeSum / codeCount),
        temp: Math.round(maxTemp),
        pop: displayPop, // ★ 修正：maxPop → displayPop
        wind: Math.round(maxWind)
    };
}

function updateMapAlert(html) {
  var alertDiv = document.getElementById('map-jma-alert');
  if (!alertDiv) return;

  if (!window.currentPref) {
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

function clearMapAlert() {
  var alertDiv = document.getElementById('map-jma-alert');
  if (alertDiv) {
    var track = alertDiv.querySelector('.jma-alert-track');
    if (track) {
      track.innerHTML = "";
      track.classList.remove('is-scrolling');
      track.style.animationDuration = '';
    }
    alertDiv.style.display = window.currentPref ? 'flex' : 'none';
  }
  if (!window.currentPref) {
    window._currentAlertUrl = null;
    window._jmaAlertRequestId = (window._jmaAlertRequestId || 0) + 1;
  }
}

function getAlertText(pref, callback) {
  var oldWrap = document.querySelector('.alert-wrap');
  if (oldWrap) oldWrap.style.display = 'none';

  if (!pref || (!pref.url && !pref.URL)) {
    window._currentAlertUrl = null;
    clearMapAlert();
    if (callback) callback({ text: "", color: "" });
    return;
  }

  var targetUrl = pref.url || pref.URL || "";
  if (window._currentAlertUrl === targetUrl) {
    if (callback) callback({ text: "", color: "" });
    return;
  }

  updateMapAlert("");
  window._currentAlertUrl = targetUrl;
  var requestId = (window._jmaAlertRequestId || 0) + 1;
  window._jmaAlertRequestId = requestId;
  var requestPrefCode = window.currentPref;
  var areaIds = targetUrl.split('$').map(function(id) {
    return String(id).trim();
  }).filter(Boolean).map(function(id) {
    return id.padStart(6, '0');
  });
  var prefix = (typeof pref.notes === "string") ? pref.notes + ": " : "";

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
      .then(function(res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function(data) {
        if (!Array.isArray(data)) return { state: "error" };
        data.sort(function(a, b) { return new Date(a.reportDatetime) - new Date(b.reportDatetime); });

        var statusMap = {};
        var hasWarningData = false;
        data.forEach(function(report) {
          if (report.warning && report.warning.class10Items) {
            hasWarningData = true;
            report.warning.class10Items.forEach(function(area) {
              (area.kinds || []).forEach(function(kind) {
                if (kind.status === "発表" || kind.status === "継続") {
                  statusMap[kind.code] = true;
                } else if (kind.status === "解除") {
                  statusMap[kind.code] = false;
                }
              });
            });
          }
        });

        // どのreportにも警報データの構造がない場合は、正常に処理できていないと判断する
        if (!hasWarningData) return { state: "error" };

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

        if (warnings.length === 0 && advisories.length === 0) {
          return { state: "none" };
        }

        var finalMsgs = (warnings.length > 0) ? warnings : advisories.slice(0, 3);
        var color = (warnings.length > 0) ? "#ff4d4d" : "#ffea00";
        return { state: "alert", text: finalMsgs.join(" / "), color: color };
      })
      .catch(function() {
        return { state: "error" };
      });
  })).then(function(results) {
    if (requestId !== window._jmaAlertRequestId ||
        window.currentPref !== requestPrefCode ||
        !window.currentPref ||
        (window.prefData && (window.prefData.url || window.prefData.URL || "") !== targetUrl)) return;

    var validResults = results.filter(function(r) { return r && r.state === "alert"; });
    var errorCount = results.filter(function(r) { return !r || r.state === "error"; }).length;

    var buildMessage = function(text, color) {
      return '<span class="jma-alert-message" style="display:inline-block; color: ' + color + '; text-shadow: 0 1px 3px rgba(0,0,0,0.8); font-size: 11px; font-weight: bold; letter-spacing: 0.3px; margin-right: 12px;">' + prefix + text + '</span>';
    };

    if (validResults.length > 0) {
      // 一部の地域で取得に失敗していても、取得できた警報・注意報は表示する
      updateMapAlert(validResults.map(function(res) {
        return buildMessage(res.text, res.color);
      }).join(""));
    } else if (errorCount > 0) {
      // データ処理に失敗した場合はエラーメッセージを表示し、次回の呼び出しで再取得できるようにする
      window._currentAlertUrl = null;
      updateMapAlert(buildMessage("警報・注意報の取得に失敗しました", "#ffa940"));
    } else {
      updateMapAlert(buildMessage("現在警報注意報はありません", "#ffffff"));
    }

    if (callback) callback({ text: "", color: "" });
  });
}
window.getAlertText = getAlertText;
window.updateMapAlert = updateMapAlert;
window.clearMapAlert = clearMapAlert;
