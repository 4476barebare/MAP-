// ==========================================
// ★ SNS釣果データ (integrated_catch.json) 読み込み＆ソナー表示
// （ズーム12以下で表示 ／ 12.5以上で非表示＆確実ポップアップ表示対応版）
// ==========================================

const DEFAULT_SNS_SONAR_OPTIONS = {
  targetFish: null,     // 特定魚種のみ表示する場合は魚種名を指定
  maxSonars: 18,        // 表示するソナーの最大数
  minDistanceKm: 10.0,  // ソナー同士の最小間隔（km）
  maxVisibleZoom: 12.0, // ズーム12以下のみ表示
  // ★ ズームレベルごとの基準ソナーサイズ（px）：縮尺に合わせて一回り大きく調整
  sizeByZoom: {
    0: 48,   // 広域（Zoom 8以下）
    9: 64,   // Zoom 9〜10
    11: 82,  // Zoom 11
    12: 96   // Zoom 12
  },
  onSonarClick: null
};

window.snsCatchData = window.snsCatchData || [];
window.isSnsCatchLoaded = window.isSnsCatchLoaded || false;
window._isSnsCatchLoading = window._isSnsCatchLoading || false;
window.snsSonarLayerGroup = null;
window.snsSonarTextLayerGroup = null;
window._snsDisplayPoints = [];
window._currentSnsSonarOptions = { ...DEFAULT_SNS_SONAR_OPTIONS };
window._isSnsSonarOpaque = false;
window._activeSnsPopup = null;

// 2点間の距離（km）を計算
function calcSnsDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 現在のズームに応じた基準サイズ
function resolveBaseSonarSizeForZoom(zoom, sizeByZoom) {
  if (typeof sizeByZoom === 'number') return sizeByZoom;
  const mapObj = sizeByZoom || DEFAULT_SNS_SONAR_OPTIONS.sizeByZoom;
  const thresholds = Object.keys(mapObj).map(Number).sort((a, b) => a - b);
  let resolvedSize = 60;
  for (const t of thresholds) {
    if (zoom >= t) resolvedSize = mapObj[t];
  }
  return resolvedSize;
}

// 経過日数による縮小倍率（当日〜6日: 1.0 / 7〜13日: 0.5 / 14〜20日: 0.25 / 21日〜: 0.125）
function getSonarAgeScale(dateStr) {
  if (!dateStr) return 0.125;
  const parts = String(dateStr).trim().replace(/-/g, '/').split('/');
  if (parts.length < 3) return 0.125;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const postDate = new Date(year, month, day);
  if (isNaN(postDate.getTime())) return 0.125;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.max(0, Math.floor((today.getTime() - postDate.getTime()) / 86400000));

  if (diffDays <= 6) return 1.0;
  if (diffDays <= 13) return 0.5;
  if (diffDays <= 20) return 0.25;
  return 0.125;
}

// SNS別クラス判定（X:黒, Insta:ピンク, FB:水色, Threads:白）
function getSnsColorClass(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('instagram')) return 'sns-instagram';
  if (s === 'x' || s.includes('twitter')) return 'sns-x';
  if (s.includes('facebook')) return 'sns-facebook';
  if (s.includes('threads')) return 'sns-threads';
  return 'sns-default';
}

// SNS別表示ラベル
function getSnsDisplayName(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('instagram')) return 'Instagram';
  if (s === 'x' || s.includes('twitter')) return 'X';
  if (s.includes('facebook')) return 'Facebook';
  if (s.includes('threads')) return 'Threads';
  return 'SNS';
}

// ソナー非表示化関数
window.hideSnsSonarLayer = function() {
  window._isSnsSonarOpaque = false;
  if (!window.map) return;

  const sonarPane = window.map.getPane('snsSonarPane');
  if (sonarPane) {
    sonarPane.style.opacity = '0';
    sonarPane.style.pointerEvents = 'none';
  }

  const textPane = window.map.getPane('snsSonarTextPane');
  if (textPane) {
    textPane.style.opacity = '0';
    textPane.style.pointerEvents = 'none';
  }

  if (window._activeSnsPopup) {
    window.map.closePopup(window._activeSnsPopup);
    window._activeSnsPopup = null;
  }

  if (window.snsSonarTextLayerGroup) {
    window.snsSonarTextLayerGroup.eachLayer(marker => {
      const hit = marker.getElement()?.querySelector('.sns-sonar-fish-hit');
      if (hit) hit.classList.add('is-hidden-hit');
    });
  }
};

// ソナー本体描画（SNSデータ取得は header.js / routeUpdate 側に一本化）
window.showSnsSonarLayer = async function(customOptions = {}) {
  if (!window.map) return;

  const opts = {
    ...DEFAULT_SNS_SONAR_OPTIONS,
    ...customOptions,
    sizeByZoom: customOptions.sizeByZoom || DEFAULT_SNS_SONAR_OPTIONS.sizeByZoom
  };
  window._currentSnsSonarOptions = opts;

  if (!Array.isArray(window.snsCatchData) || !window.snsCatchData.length) return;

  if (!window.map.getPane('snsSonarPane')) {
    window.map.createPane('snsSonarPane');
    const pane = window.map.getPane('snsSonarPane');
    pane.style.zIndex = 650;
    pane.style.opacity = '0';
    pane.style.pointerEvents = 'none';
    pane.style.transition = 'opacity 0.4s ease';
  }

  if (!window.snsSonarLayerGroup) {
    window.snsSonarLayerGroup = L.layerGroup().addTo(window.map);
    window.map.on('zoomend', updateSnsSonarOnZoom);
  } else {
    window.snsSonarLayerGroup.clearLayers();
    if (!window.map.hasLayer(window.snsSonarLayerGroup)) {
      window.snsSonarLayerGroup.addTo(window.map);
    }
  }

  // 同一座標集計
  const uniqueCoords = new Map();
  window.snsCatchData.forEach(item => {
    if (!item || !item.lat || !item.lng) return;
    if (opts.targetFish && item.fish !== opts.targetFish) return;

    const key = `${Number(item.lat).toFixed(3)}_${Number(item.lng).toFixed(3)}`;
    const existing = uniqueCoords.get(key);
    const itemDate = String(item.date || '');

    if (!existing) {
      uniqueCoords.set(key, {
        lat: Number(item.lat),
        lng: Number(item.lng),
        date: itemDate,
        fish: item.fish || '',
        area_name: item.area_name || '',
        url: item.url || '',
        source: item.source || 'SNS',
        count: 1,
        records: [item]
      });
    } else {
      existing.count += 1;
      existing.records.push(item);
      if (itemDate >= existing.date) {
        existing.date = itemDate;
        if (item.fish) existing.fish = item.fish;
        if (item.area_name) existing.area_name = item.area_name;
        if (item.url) existing.url = item.url;
        if (item.source) existing.source = item.source;
      }
    }
  });

  const sortedCandidates = [...uniqueCoords.values()].sort((a, b) => {
    const scaleA = getSonarAgeScale(a.date);
    const scaleB = getSonarAgeScale(b.date);
    if (scaleB !== scaleA) return scaleB - scaleA;
    if (b.count !== a.count) return b.count - a.count;
    return b.date.localeCompare(a.date);
  });

  const displayPoints = [];
  for (const candidate of sortedCandidates) {
    if (displayPoints.length >= opts.maxSonars) break;
    const isTooClose = displayPoints.some(
      selected => calcSnsDistanceKm(candidate.lat, candidate.lng, selected.lat, selected.lng) < opts.minDistanceKm
    );
    if (!isTooClose) {
      displayPoints.push(candidate);
    }
  }
  window._snsDisplayPoints = displayPoints;

  const currentZoom = window.map.getZoom();
  const baseSize = resolveBaseSonarSizeForZoom(currentZoom, opts.sizeByZoom);

  displayPoints.forEach((pt, idx) => {
    const ageScale = getSonarAgeScale(pt.date);
    const finalSize = Math.max(6, Math.round(baseSize * ageScale * 10) / 10);
    const offsetSec = ((idx * 0.9) % 3.2).toFixed(2);
    const delay2Sec = (Number(offsetSec) + 3.25).toFixed(2);
    const snsClass = getSnsColorClass(pt.source);

    const marker = L.marker([pt.lat, pt.lng], {
      icon: createSnsSonarDivIcon(finalSize, snsClass, offsetSec, delay2Sec),
      pane: 'snsSonarPane',
      interactive: false,
      keyboard: false
    });

    marker._snsMeta = { ageScale, snsClass, offsetSec, delay2Sec };
    marker.addTo(window.snsSonarLayerGroup);
  });

  window._isSnsSonarOpaque = true;

  if (currentZoom <= opts.maxVisibleZoom) {
    window.renderSnsSonarTextLayer(displayPoints, opts);
  }

  updateSnsSonarOnZoom();
};

function createSnsSonarDivIcon(sizePx, snsClass, offsetSec, delay2Sec) {
  const half = sizePx / 2;
  return L.divIcon({
    className: 'sns-sonar-wrapper',
    html: `
      <div class="sns-sonar-emitter ${snsClass}" style="--sonar-size: ${sizePx}px;">
        <div class="sns-sonar-sweep"></div>
        <div class="sns-sonar-wave" style="animation-delay: ${offsetSec}s;"></div>
        <div class="sns-sonar-wave" style="animation-delay: ${delay2Sec}s;"></div>
        <div class="sns-sonar-core"></div>
      </div>
    `,
    iconSize: [sizePx * 1.65, sizePx * 1.65],
    iconAnchor: [half * 1.65, half * 1.65]
  });
}

// ★ テキスト描画＆クリック時ポップアップ（地図クリック暴発防止・確実表示版）
window.renderSnsSonarTextLayer = function(points = [], opts = DEFAULT_SNS_SONAR_OPTIONS) {
  if (!window.map) return;

  if (!window.map.getPane('snsSonarTextPane')) {
    window.map.createPane('snsSonarTextPane');
    const textPane = window.map.getPane('snsSonarTextPane');
    textPane.style.zIndex = 655;
    textPane.style.pointerEvents = 'none';
    textPane.style.transition = 'opacity 0.3s ease';
  }

  if (!window.snsSonarTextLayerGroup) {
    window.snsSonarTextLayerGroup = L.layerGroup().addTo(window.map);
  } else {
    window.snsSonarTextLayerGroup.clearLayers();
    if (!window.map.hasLayer(window.snsSonarTextLayerGroup)) {
      window.snsSonarTextLayerGroup.addTo(window.map);
    }
  }

  const currentZoom = window.map.getZoom();
  const isHiddenHit = currentZoom > opts.maxVisibleZoom;
  const hiddenClass = isHiddenHit ? 'is-hidden-hit' : '';

  points.forEach(pt => {
    const snsClass = getSnsColorClass(pt.source);
    const snsName = getSnsDisplayName(pt.source);
    const safeFish = String(pt.fish || '').replace(/[<>&"']/g, '');
    const safeArea = String(pt.area_name || '釣り場付近').replace(/[<>&"']/g, '');
    const safeDate = String(pt.date || '').replace(/^\d{4}\//, '');

    const textMarker = L.marker([pt.lat, pt.lng], {
      icon: L.divIcon({
        className: 'sns-sonar-text-wrapper',
        html: `<span class="sns-sonar-fish-hit ${snsClass} ${hiddenClass}">${safeFish}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      }),
      pane: 'snsSonarTextPane',
      interactive: true,
      bubblingMouseEvents: false,
      keyboard: false
    });

    textMarker._pointData = pt;

    const popupHtml = `
      <div class="sns-catch-popup">
        <div class="sns-catch-popup-title">${safeArea}</div>
        <div class="sns-catch-popup-fish">${safeFish}<span class="sns-catch-popup-date">(${safeDate})</span></div>
        <div class="sns-catch-popup-footer">
          <a class="sns-catch-btn ${snsClass}" href="${pt.url}" target="_blank" rel="noopener noreferrer">
            <span class="sns-catch-label">${snsName}で釣果を見る</span>
            <span class="sns-catch-arrow">↗</span>
          </a>
        </div>
      </div>
    `;

    // マーカーがDOMに追加されたタイミングで、内部の <span> 要素に直接クリックイベントをバインド
    textMarker.on('add', () => {
      const el = textMarker.getElement();
      const hitEl = el ? el.querySelector('.sns-sonar-fish-hit') : null;
      if (!hitEl) return;

      // 地図のドラッグや県・エリア選択クリックが発火しないよう完全に止める
      L.DomEvent.disableClickPropagation(hitEl);
      L.DomEvent.disableScrollPropagation(hitEl);

      L.DomEvent.on(hitEl, 'click', (ev) => {
        L.DomEvent.stop(ev);
        if (!window._isSnsSonarOpaque || window.map.getZoom() > opts.maxVisibleZoom) return;

        window._activeSnsPopup = L.popup({
          offset: [0, -6],
          closeButton: true,
          autoPanPadding: [20, 20]
        })
          .setLatLng([pt.lat, pt.lng])
          .setContent(popupHtml)
          .openOn(window.map);

        if (typeof opts.onSonarClick === 'function') {
          opts.onSonarClick(pt, textMarker, ev);
        }
      });
    });

    textMarker.addTo(window.snsSonarTextLayerGroup);
  });

  const textPane = window.map.getPane('snsSonarTextPane');
  if (textPane) {
    textPane.style.opacity = isHiddenHit ? '0' : '1';
  }
};

// ズーム変更監視
function updateSnsSonarOnZoom() {
  if (!window.map || !window._isSnsSonarOpaque) return;

  const sonarPane = window.map.getPane('snsSonarPane');
  if (!sonarPane) return;

  const opts = window._currentSnsSonarOptions || DEFAULT_SNS_SONAR_OPTIONS;
  const currentZoom = window.map.getZoom();

  if (currentZoom > opts.maxVisibleZoom) {
    sonarPane.style.opacity = '0';
    const textPane = window.map.getPane('snsSonarTextPane');
    if (textPane) textPane.style.opacity = '0';

    if (window._activeSnsPopup) {
      window.map.closePopup(window._activeSnsPopup);
      window._activeSnsPopup = null;
    }

    if (window.snsSonarTextLayerGroup) {
      window.snsSonarTextLayerGroup.eachLayer(m => {
        const hit = m.getElement()?.querySelector('.sns-sonar-fish-hit');
        if (hit) hit.classList.add('is-hidden-hit');
      });
    }
    return;
  }

  sonarPane.style.opacity = '1';
  const baseSize = resolveBaseSonarSizeForZoom(currentZoom, opts.sizeByZoom);

  if (window.snsSonarLayerGroup) {
    window.snsSonarLayerGroup.eachLayer(marker => {
      if (marker._snsMeta) {
        const { ageScale, snsClass, offsetSec, delay2Sec } = marker._snsMeta;
        const finalSize = Math.max(6, Math.round(baseSize * ageScale * 10) / 10);
        marker.setIcon(createSnsSonarDivIcon(finalSize, snsClass, offsetSec, delay2Sec));
      }
    });
  }

  if (!window.snsSonarTextLayerGroup || window.snsSonarTextLayerGroup.getLayers().length === 0) {
    window.renderSnsSonarTextLayer(window._snsDisplayPoints, opts);
  } else {
    const textPane = window.map.getPane('snsSonarTextPane');
    if (textPane) {
      textPane.style.opacity = '1';
    }

    window.snsSonarTextLayerGroup.eachLayer(m => {
      const hit = m.getElement()?.querySelector('.sns-sonar-fish-hit');
      if (hit) hit.classList.remove('is-hidden-hit');
    });
  }
}


window.markerControl = {
    shop01Cache: {},
    shop01AreaCache: {},
    allShops: [] // ★ 距離計算用に全店舗をここにプールする
};

function preloadShop01(url) {
    if (markerControl.shop01Cache[url]) return Promise.resolve();

    return fetch(url)
        .then(res => {
            if (!res.ok) throw new Error("fetch失敗: " + res.status);
            return res.json();
        })
        .then(jsonData => {
            const parsed = jsonData.map(shop => {
                return {
                    group: shop.group || '',
                    name: shop.name || '',
                    lat: shop.lat !== undefined ? parseFloat(shop.lat) : NaN,
                    lng: shop.lng !== undefined ? parseFloat(shop.lng) : NaN,
                    notes: shop.notes || '',
                    icon: shop.icon || '',
                    areaId: (shop.areaId || '').toString().trim()
                };
            });

            // パースした店舗データを全店舗リストに合流
            markerControl.allShops = markerControl.allShops.concat(parsed);

            parsed.forEach(r => {
                const key = r.areaId;

                if (!markerControl.shop01AreaCache[key]) {
                    markerControl.shop01AreaCache[key] = [];
                }

                markerControl.shop01AreaCache[key].push(r);
            });

            markerControl.shop01Cache[url] = true;

            // ★ ロード完了時に現在アクティブなエリアがあれば画面状態に応じてマーカーを描画
            //    ※ 個別スポット詳細（zoom > 13 等）ではショップマーカーを描画しない
            if (window.currentAreaId && window.map) {
                const isSpotMode = window.map.getContainer().classList.contains('is-spot-mode');
                const zoom = window.map.getZoom();
                const isSpotDetail = zoom > 13 || (!!window.currentSpotId && zoom !== 13) || !!window.currentSpotBaseTile;

                if (isSpotDetail) {
                    // スポット詳細画面ではショップマーカーを表示しない（アクセス枠の最寄り店舗計算用データのみ保持）
                } else if (zoom === 13 && (isSpotMode || window.phase2Initialized)) {
                    showShop02(window.currentAreaId);
                } else if (!isSpotMode && !window.currentSpotId && zoom >= 11) {
                    showShop01(window.currentAreaId);
                }
            }
        })
        .catch(err => {
            console.error("Shopデータの読み込みエラー:", err);
        });
}

// -----------------------
// phase1
// -----------------------
function showShop01(areaKey) {
    if (!window.map) return;

    const shops = markerControl.shop01AreaCache[areaKey] || [];
    if (!shops.length) return;

    // -------------------------
    // phase1Groupに統合
    // -------------------------
    if (!window.phase1Group) {
        window.phase1Group = L.layerGroup().addTo(window.map);
    }

    // 既存shop01だけ消す
    window.phase1Group.eachLayer(layer => {
        if (layer.options && layer.options._shop01) {
            window.phase1Group.removeLayer(layer);
        }
    });

    // -------------------------
    // 描画（Phase2と同じ .shop-anchor を使用）
    // -------------------------
    for (let i = 0; i < shops.length; i++) {
        const s = shops[i];

        if (isNaN(s.lat) || isNaN(s.lng)) continue;

        // ★ Phase2と同じクラス（custom-shop-marker, shop-anchor）でドットのみ描画
        const marker = L.marker([s.lat, s.lng], {
            icon: L.divIcon({
                className: 'custom-shop-marker',
                html: '<div class="shop-anchor"></div>',
                iconSize: [0, 0],
                iconAnchor: [0, 0]
            }),
            interactive: false // Phase1ではタップ判定をオフにして超軽量化
        });

        // 識別フラグ
        marker.options._shop01 = true;

        window.phase1Group.addLayer(marker);
    }
}

// -----------------------
// phase2
// -----------------------
function showShop02(areaKey) {
    if (!window.map) return;

    // ★ phase2Groupを使う
    if (!window.phase2Group) {
        window.phase2Group = L.layerGroup();
    }

    window.phase2Group.clearLayers();

    const shops = markerControl.shop01AreaCache?.[areaKey] || [];
    if (!shops.length) return;

    // 表示
    window.phase2Group.addTo(window.map);

    // =========================
    // ① 近い座標をグループ化
    // =========================
    const groups = {};

    shops.forEach(shop => {
        if (isNaN(shop.lat) || isNaN(shop.lng)) return;

        const key = `${Math.round(shop.lat * 500)}_${Math.round(shop.lng * 500)}`;

        if (!groups[key]) groups[key] = [];
        groups[key].push(shop);
    });

    // =========================
    // ② 描画
    // =========================
    Object.values(groups).forEach(group => {

        const count = group.length;

        group.forEach((shop, i) => {

            let lat = shop.lat;
            let lng = shop.lng;

            if (count > 1) {
                const angle = (i / count) * Math.PI * 2;
                const offset = 0.001;

                lat += Math.cos(angle) * offset;
                lng += Math.sin(angle) * offset;
            }

            // ★ テキストの判定: group名があればgroup名（個人商店や空欄を除く）、なければ店舗名
            const displayName = shop.group && shop.group !== '個人商店' && shop.group !== 'shop'
                ? shop.group 
                : (shop.name || '');

            const html = `
                <div class="shop-anchor"></div>
                <div class="shop-text">${displayName}</div>
            `;
            
            const marker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'custom-shop-marker',
                    html: html,
                    iconSize: [0, 0],    // 基準点を完全にゼロにする
                    iconAnchor: [0, 0]   // 座標のど真ん中に強制
                })
            });


            // =====================================
            // ★ ポップアップの遅延生成（3大ボタン実装）
            // =====================================
            marker.bindPopup(() => {
                const title = shop.group && shop.group !== '個人商店'
                    ? shop.group + ' ' + (shop.name || '')
                    : (shop.name || '');

                const address = shop.notes || '';

                // 1. Googleマップ ルート案内URL (緯度・経度へダイレクト)
                // 1. Googleマップ ルート案内URL (店舗名と住所を使って確実にセット)
const routeKeyword = `${title} ${address}`.trim();
const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(routeKeyword)}`;


                // 2. Google検索URL (グループ名・店名・住所のみでスッキリ検索)
                const searchKeyword = `${title} ${address}`.trim();
                const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchKeyword)}`;

                // 3. ChatGPT質問URL (?q= パラメータでプロンプトをセット)
                const chatGptPrompt = `${title}（${address}）の営業時間や定休日、取り扱い商品などの詳細情報を教えて`;
                const chatGptUrl = `https://chatgpt.com/?q=${encodeURIComponent(chatGptPrompt)}`;

                return `
                    <div class="shop-popup">
                        <div class="shop-popup-title">${title}</div>
                        <div class="shop-popup-address">${address}</div>
                        <div class="shop-popup-footer">
                            <a class="shop-popup-btn" href="${routeUrl}" target="_blank" rel="noopener noreferrer">
                                ルート案内
                            </a>
                            <a class="shop-popup-btn" href="${googleSearchUrl}" target="_blank" rel="noopener noreferrer">
                                Google検索
                            </a>
                            <a class="shop-popup-btn btn-chatgpt" href="${chatGptUrl}" target="_blank" rel="noopener noreferrer">
                                ChatGPT
                            </a>
                        </div>
                    </div>
                `;
            });


            // ★ここ変更なし（維持）
            window.phase2Group.addLayer(marker);
        });
    });
}

// -----------------------
// icon
// -----------------------
function getIconId(raw) {
    if (!raw) return 'default';

    return raw
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '');
}

markerControl.preloadShop01 = preloadShop01;
markerControl.showShop01 = showShop01;
markerControl.showShop02 = showShop02;
markerControl.getIconId = getIconId;
