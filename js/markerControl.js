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

            // ★ 追加: ロード完了時に現在アクティブなエリアがあれば自動でマーカーを描画
            if (window.currentAreaId && window.map) {
                const isSpotMode = window.map.getContainer().classList.contains('is-spot-mode');
                const zoom = window.map.getZoom();

                if (isSpotMode || (window.currentSpotId && zoom === 13)) {
                    showShop02(window.currentAreaId);
                } else if (zoom >= 11) {
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

// ==========================================
// ★ スポット詳細画面：釣果ピン投稿モード (doPost専用・3連続上限＋4件目以降クールタイム待機制＋半径3m重複ガード版)
// ==========================================

// 1. 設定エリア（後からいつでも編集可能）
const GAS_TEMP_PIN_URL = 'https://script.google.com/macros/s/AKfycbzupqGAv-ib_-FXJv7U-Lea4iGL2uaBaqYIB6oKzbpbk2vWGAWMxSBHEPfhuD5IxFJ17g/exec';

// 同じ座標の周囲に同一魚種があるか判定する閾値（メートル）
const DUPLICATE_FISH_RADIUS_M = 3.0;

// 連続投稿できる上限数（3件までは連続投稿可、4件目からは過去3件前＝2件目の+5分クールタイム消化を待つ）
const MAX_BURST_POSTS = 3;

// 魚種辞書リスト（index.htmlのFISH_DICTIONARYと重複しない名前）
const POST_FISH_LIST = [
  'アジ', 'サバ', 'イワシ', 'シーバス', 'クロダイ', 'マダイ',
  'ヒラメ', 'マゴチ', 'カサゴ', 'メバル', 'アオリイカ', 'タチウオ',
  'ブリ・イナダ', 'カンパチ', 'サワラ', 'カワハギ', 'シロギス', 'ハゼ',
  'カレイ', 'メジナ', 'ブラックバス', 'ヘラブナ', 'コイ', 'ニジマス'
];

// ★ ダミーデータ兼ローカルキャッシュ（sessionStorageと連動し、リロードしても自分が投稿したデータを保持して比較可能にする）
const TEMP_PINS_STORAGE_KEY = 'fishing_temp_pins_dummy_cache';

function loadTempPinsCache() {
  if (Array.isArray(window.tempFishPins) && window.tempFishPins.length > 0) {
    return window.tempFishPins;
  }
  try {
    const raw = sessionStorage.getItem(TEMP_PINS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        window.tempFishPins = parsed;
        return window.tempFishPins;
      }
    }
  } catch (e) {}
  window.tempFishPins = [];
  return window.tempFishPins;
}

function saveTempPinsCache(pins) {
  window.tempFishPins = Array.isArray(pins) ? pins : [];
  try {
    sessionStorage.setItem(TEMP_PINS_STORAGE_KEY, JSON.stringify(window.tempFishPins));
  } catch (e) {}
}

// 初期ロード時にキャッシュを展開
loadTempPinsCache();

let isPostModeActive = false;
let savedNormalBounds = null;
let lastTempPinPostTime = 0; // 10秒連打ブロック用キャッシュ
let postStatusTimer = null;

// ★ セッション中の「IP+UUID」メモリキャッシュ＆重複生成防止ガード
window._cachedUserIdentity = null;
window._userIdentityPromise = null;
window._prefetchedAltTileSpots = new Set();

// 2. 端末固有UUIDの取得・発行（LocalStorage永続化）
function getBaseUuid() {
  let uuid = localStorage.getItem('fishing_user_uuid');
  if (!uuid) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      uuid = 'u_' + crypto.randomUUID();
    } else {
      uuid = 'u_' + ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      );
    }
    localStorage.setItem('fishing_user_uuid', uuid);
  }
  return uuid;
}

// 2-2. IPアドレス＋UUIDの非同期生成（生成済みなら通信せず即座にスキップ）
function ensureUserIdentityAsync() {
  if (window._cachedUserIdentity) {
    return Promise.resolve(window._cachedUserIdentity);
  }
  if (window._userIdentityPromise) {
    return window._userIdentityPromise;
  }

  window._userIdentityPromise = (async () => {
    const baseUuid = getBaseUuid();
    let ipStr = sessionStorage.getItem('fishing_user_ip');

    if (!ipStr) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1500);
        const res = await fetch('https://api.ipify.org?format=json', {
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && data.ip) {
            ipStr = String(data.ip).trim();
            sessionStorage.setItem('fishing_user_ip', ipStr);
          }
        }
      } catch (e) {
        ipStr = 'noip';
      }
    }

    window._cachedUserIdentity = `${ipStr || 'noip'}_${baseUuid}`;
    return window._cachedUserIdentity;
  })();

  return window._userIdentityPromise;
}

// 同期取得ヘルパー
function getMyUuid() {
  return window._cachedUserIdentity || `noip_${getBaseUuid()}`;
}

// 2-3. 魚種名の比較用正規化ヘルパー（出世魚辞書や「シーバス⇔スズキ」「シロギス⇔キス」の表記ゆれを完全吸収）
const EXTRA_FISH_SYNONYMS = {
  'シーバス': 'スズキ',
  'スズキ': 'スズキ',
  'セイゴ': 'スズキ',
  'フッコ': 'スズキ',
  'シロギス': 'シロギス',
  'キス': 'シロギス',
  'ピンギス': 'シロギス',
  'ブリ': 'ブリ',
  'イナダ': 'ブリ',
  'ワカシ': 'ブリ',
  'ワラサ': 'ブリ',
  'ハマチ': 'ブリ',
  'メジロ': 'ブリ',
  'ツバス': 'ブリ',
  'クロダイ': 'クロダイ',
  'チヌ': 'クロダイ',
  'カイズ': 'クロダイ',
  'メジナ': 'メジナ',
  'グレ': 'メジナ',
  'サワラ': 'サワラ',
  'サゴシ': 'サワラ'
};

function normalizeFishForCheck(name) {
  if (!name) return '';
  const raw = String(name).trim();
  if (EXTRA_FISH_SYNONYMS[raw]) {
    return EXTRA_FISH_SYNONYMS[raw];
  }
  if (typeof FISH_DICTIONARY === 'object' && FISH_DICTIONARY !== null && FISH_DICTIONARY[raw]) {
    const dictMapped = FISH_DICTIONARY[raw];
    return EXTRA_FISH_SYNONYMS[dictMapped] || dictMapped;
  }
  return raw;
}

// 2-4. 周囲3m以内に同じ魚種が既に存在するかチェックするガード関数
function hasSameFishNearby(centerLatLng, fishName, radiusMeters = DUPLICATE_FISH_RADIUS_M) {
  if (!centerLatLng || !fishName || typeof L === 'undefined') return false;

  const cLat = Number(centerLatLng.lat.toFixed(6));
  const cLng = Number(centerLatLng.lng.toFixed(6));
  const targetPoint = L.latLng(cLat, cLng);

  const targetNorm = normalizeFishForCheck(fishName);
  const targetVariants = new Set([
    fishName,
    targetNorm,
    ...fishName.split('・').map(s => normalizeFishForCheck(s))
  ]);

  const isSameFish = (otherName) => {
    if (!otherName) return false;
    const rawOther = String(otherName).trim();
    const otherNorm = normalizeFishForCheck(rawOther);
    if (targetVariants.has(rawOther) || targetVariants.has(otherNorm)) return true;
    const parts = rawOther.split('・');
    return parts.some(p => targetVariants.has(p) || targetVariants.has(normalizeFishForCheck(p)));
  };

  // ① ダミーデータ兼仮ピン配列（window.tempFishPins）を最優先でチェック
  const tempPins = loadTempPinsCache();
  for (let i = 0; i < tempPins.length; i++) {
    const pin = tempPins[i];
    if (!pin) continue;
    if (Array.isArray(pin.bad) && pin.bad.length >= 10) continue;

    const lat = Number(pin.lat);
    const lng = Number(pin.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && isSameFish(pin.fish)) {
      const dist = targetPoint.distanceTo(L.latLng(lat, lng));
      if (dist <= radiusMeters) {
        return true;
      }
    }
  }

  // ② 現在マップ上に表示されている既存魚種マーカー（window.fishLayer）をチェック
  if (window.fishLayer && typeof window.fishLayer.eachLayer === 'function') {
    let foundInLayer = false;
    window.fishLayer.eachLayer(layer => {
      if (foundInLayer || typeof layer.getLatLng !== 'function') return;
      const ll = layer.getLatLng();
      if (!ll || targetPoint.distanceTo(ll) > radiusMeters) return;

      const html = layer.options?.icon?.options?.html || '';
      const textName = html.replace(/<[^>]*>/g, '').trim();
      if (isSameFish(textName)) {
        foundInLayer = true;
      }
    });
    if (foundInLayer) return true;
  }

  // ③ 現在選択中のスポットデータ（spot.URL）に紐づく魚種座標もチェック
  if (window.currentSpotId && Array.isArray(window.spotData)) {
    const parts = String(window.currentSpotId).split('_');
    const spotKey = parts[parts.length - 1];
    const activeSpot = window.spotData.find(s => String(s.individualId) === String(spotKey));
    if (activeSpot && typeof activeSpot.URL === 'string' && activeSpot.URL.trim() !== '') {
      const items = activeSpot.URL.split(',');
      for (let i = 0; i < items.length; i++) {
        const [fName, latStr, lngStr] = items[i].split('|');
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (!isNaN(lat) && !isNaN(lng) && isSameFish(fName)) {
          if (targetPoint.distanceTo(L.latLng(lat, lng)) <= radiusMeters) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

// 2-5. IP+UUID / IP一致による「3連続投稿上限チェック」＆「投稿時間（time）のペナルティ加算計算」
function evaluatePostCooldownAndTime(myIdentity, nowMs) {
  const pins = loadTempPinsCache();

  const splitIdx = myIdentity.indexOf('_u_');
  const myIp = splitIdx !== -1 ? myIdentity.slice(0, splitIdx) : 'noip';
  const myUuidPart = splitIdx !== -1 ? myIdentity.slice(splitIdx + 1) : myIdentity;

  const userMatchedPins = [];
  let exactMatchCount = 0;
  let ipOnlyMatchCount = 0;

  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    const pUuid = String(pin?.uuid || '');
    if (!pUuid) continue;

    const pSplitIdx = pUuid.indexOf('_u_');
    const pIp = pSplitIdx !== -1 ? pUuid.slice(0, pSplitIdx) : 'noip';
    const pUuidPart = pSplitIdx !== -1 ? pUuid.slice(pSplitIdx + 1) : pUuid;

    const isExactMatch = (pUuid === myIdentity) || (pUuidPart === myUuidPart);
    const isIpMatch = (myIp !== 'noip' && pIp !== 'noip' && pIp === myIp);

    if (isExactMatch) {
      exactMatchCount++;
      userMatchedPins.push(pin);
    } else if (isIpMatch) {
      ipOnlyMatchCount++;
      userMatchedPins.push(pin);
    }
  }

  // 投稿時刻(time)の昇順でソート
  userMatchedPins.sort((a, b) => Number(a.time || 0) - Number(b.time || 0));

  // ★ 3件までは連続で投稿でき、4件目からは「2件目（直近から2つ前＝後ろから2番目）の +5分クールタイム」が経過するまで投稿不可にする
  // 例: 1件目(t+0)、2件目(t+5分)、3件目(t+10分) → 4件目を打つには2件目の time (t+5分) を過ぎている必要がある
  //     4件目(t+15分)を打った後、5件目を打つには3件目の time (t+10分) を過ぎている必要がある
  if (userMatchedPins.length >= MAX_BURST_POSTS) {
    const gatePinIndex = userMatchedPins.length - (MAX_BURST_POSTS - 1); // 4件目なら index=1 (2件目のピン)
    const gatePin = userMatchedPins[gatePinIndex];
    const unlockTimeMs = Number(gatePin?.time || 0);

    if (nowMs < unlockTimeMs) {
      const waitSec = Math.ceil((unlockTimeMs - nowMs) / 1000);
      return {
        blocked: true,
        waitSeconds: waitSec,
        unlockTimeMs: unlockTimeMs
      };
    }
  }

  // クールタイムを通過した場合、今回の投稿時間（time）を計算
  let delayMinutes = 0;
  if (exactMatchCount > 0) {
    // IP+UUID全一致が既にあれば、1件あるごとに +5分 × 件数
    delayMinutes += exactMatchCount * 5;
  }
  if (ipOnlyMatchCount > 0) {
    // IPだけ一致があれば +5分
    delayMinutes += 5;
  }

  return {
    blocked: false,
    waitSeconds: 0,
    adjustedTime: nowMs + (delayMinutes * 60 * 1000),
    delayMinutes: delayMinutes,
    exactMatchCount: exactMatchCount,
    ipOnlyMatchCount: ipOnlyMatchCount
  };
}

// 2-6. タイル切り替えボタン用の代替タイル（OSM等）をバックグラウンドでプリフェッチ
function prefetchAlternateSpotTiles(spot, targetZoom) {
  if (!spot || !window.TILE_URLS) return Promise.resolve();

  const spotKey = `${spot.individualId || spot.name}_${targetZoom}`;
  if (window._prefetchedAltTileSpots.has(spotKey)) {
    return Promise.resolve();
  }
  window._prefetchedAltTileSpots.add(spotKey);

  const lat = Number(spot.lat);
  const lng = Number(spot.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve();

  const fetchZoom = Math.floor(targetZoom || 14);
  const n = Math.pow(2, fetchZoom);
  const tileX = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const tileY = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );

  const altTemplate = window.TILE_URLS.osm || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const subdomains = ['a', 'b', 'c'];
  const promises = [];

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      const sub = subdomains[Math.abs(tx + ty) % subdomains.length];
      const url = altTemplate
        .replace('{s}', sub)
        .replace('{z}', fetchZoom)
        .replace('{x}', tx)
        .replace('{y}', ty);

      promises.push(
        new Promise(resolve => {
          const img = new Image();
          const timer = setTimeout(resolve, 1200);
          img.onload = img.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
          img.src = url;
        })
      );
    }
  }

  return Promise.all(promises);
}

// 2-7. スポット画面用の「IP+UUID生成」と「切り替え用タイル先読み」を一括実行する準備関数
window.prepareSpotActionButtons = function(spot, targetZoom) {
  return Promise.all([
    ensureUserIdentityAsync(),
    prefetchAlternateSpotTiles(spot, targetZoom)
  ]);
};

// 3. パネル内のステータスメッセージ表示（alert廃止）
function showPostStatus(message, autoHideMs = 2500) {
  const msgEl = document.getElementById('post-status-msg');
  if (!msgEl) return;

  if (postStatusTimer) {
    clearTimeout(postStatusTimer);
    postStatusTimer = null;
  }

  if (!message) {
    msgEl.textContent = '';
    msgEl.classList.remove('is-visible');
    return;
  }

  msgEl.textContent = message;
  msgEl.classList.add('is-visible');

  if (autoHideMs > 0) {
    postStatusTimer = setTimeout(() => {
      msgEl.classList.remove('is-visible');
    }, autoHideMs);
  }
}

// 4. 投稿モード用のDOM（中心照準 ＆ 投稿ボタン左横パネル）を生成
function ensurePostModeDom() {
  const mapEl = document.getElementById('lf-map');
  const postBtnRow = document.getElementById('post-btn-row');
  if (!mapEl || document.getElementById('post-center-crosshair')) return;

  // ① 画面中心の「＋」照準（白線＋濃紺シャドウ）
  const crosshair = document.createElement('div');
  crosshair.id = 'post-center-crosshair';
  crosshair.className = 'post-center-crosshair';
  mapEl.appendChild(crosshair);

  // ② 投稿ボタンのすぐ左に展開するコンパクトパネル
  if (postBtnRow && !document.getElementById('post-mode-panel')) {
    const panel = document.createElement('div');
    panel.id = 'post-mode-panel';
    panel.className = 'post-mode-panel';

    const optionsHtml = POST_FISH_LIST.map(f => `<option value="${f}">${f}</option>`).join('');

    panel.innerHTML = `
      <select id="post-fish-select" class="post-fish-select">
        ${optionsHtml}
      </select>
      <button id="post-submit-btn" class="post-submit-btn">投稿</button>
      <span id="post-status-msg" class="post-status-msg"></span>
    `;

    if (typeof L !== 'undefined' && L.DomEvent) {
      L.DomEvent.disableClickPropagation(panel);
      L.DomEvent.disableScrollPropagation(panel);
    }

    postBtnRow.insertBefore(panel, postBtnRow.firstChild);

    document.getElementById('post-submit-btn').addEventListener('click', submitCenterTempPin);
  }
}

// 5. 投稿モードのON / OFF切り替え
function togglePostMode(forceState) {
  if (!window.map) return;
  ensurePostModeDom();

  const nextState = (typeof forceState === 'boolean') ? forceState : !isPostModeActive;
  isPostModeActive = nextState;

  const crosshair = document.getElementById('post-center-crosshair');
  const panel     = document.getElementById('post-mode-panel');
  const postBtn   = document.getElementById('map-post-btn');

  if (isPostModeActive) {
    if (window.map.options.maxBounds && !savedNormalBounds) {
      savedNormalBounds = window.map.options.maxBounds;
      window.map.setMaxBounds(savedNormalBounds.pad(0.5));
    }
    showPostStatus('');
    if (crosshair) crosshair.classList.add('is-open');
    if (panel) panel.classList.add('is-open');
    if (postBtn) postBtn.classList.add('active');
  } else {
    if (savedNormalBounds) {
      window.map.setMaxBounds(savedNormalBounds);
      savedNormalBounds = null;
    }
    showPostStatus('');
    if (crosshair) crosshair.classList.remove('is-open');
    if (panel) panel.classList.remove('is-open');
    if (postBtn) postBtn.classList.remove('active');
  }
}

// 6. 中心座標（＋マークの位置）をGASへPOST送信（3連続上限＋4件目クールタイム待機 ＆ 半径3m重複ガード）
async function submitCenterTempPin() {
  if (!window.map) return;

  const selectEl = document.getElementById('post-fish-select');
  const submitBtn = document.getElementById('post-submit-btn');
  const fishName = selectEl ? selectEl.value : POST_FISH_LIST[0];
  const center = window.map.getCenter();

  // ★ ガード①：半径3m以内に同じ魚種が既に存在する場合は送信前にブロック
  if (hasSameFishNearby(center, fishName, DUPLICATE_FISH_RADIUS_M)) {
    showPostStatus('付近に同魚種あり', 2500);
    return;
  }

  // ★ ガード②：物理的な誤連打ガード（10秒）
  const now = Date.now();
  if (now - lastTempPinPostTime < 10000) {
    const remain = Math.ceil((10000 - (now - lastTempPinPostTime)) / 1000);
    showPostStatus(`あと${remain}秒`, 2000);
    return;
  }

  const myUuid = window._cachedUserIdentity || (await ensureUserIdentityAsync());

  // ★ ガード③：3件までは連続投稿可、4件目からは「2件目の+5分クールタイム」が経過するまで投稿自体をブロック
  const evalResult = evaluatePostCooldownAndTime(myUuid, now);
  if (evalResult.blocked) {
    const min = Math.floor(evalResult.waitSeconds / 60);
    const sec = evalResult.waitSeconds % 60;
    const waitLabel = min > 0 ? `あと${min}分${sec}秒` : `あと${sec}秒`;
    showPostStatus(`連投制限(${waitLabel})`, 3000);
    return;
  }

  const { adjustedTime, delayMinutes } = evalResult;

  const newPin = {
    id: 'p_' + now + '_' + Math.random().toString(36).substring(2, 6),
    fish: fishName,
    lat: Number(center.lat.toFixed(6)),
    lng: Number(center.lng.toFixed(6)),
    uuid: myUuid,
    time: adjustedTime,
    good: [],
    bad: []
  };

  // 送信開始の瞬間にダミーデータ（window.tempFishPins ＆ sessionStorage）へ即座に格納
  const currentPins = loadTempPinsCache();
  currentPins.push(newPin);
  saveTempPinsCache(currentPins);

  lastTempPinPostTime = now;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '送信中';
  }
  showPostStatus('');

  try {
    const res = await fetch(GAS_TEMP_PIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'add', ...newPin })
    });
    const result = await res.json();

    if (result.status === 'success') {
      if (submitBtn) submitBtn.textContent = '完了';
      const msg = delayMinutes > 0 ? `投稿完了(+${delayMinutes}分)` : '投稿完了';
      showPostStatus(msg, 1200);
      setTimeout(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '投稿';
        }
        togglePostMode(false);
      }, 900);
    } else {
      const rolledBack = loadTempPinsCache().filter(p => p.id !== newPin.id);
      saveTempPinsCache(rolledBack);

      showPostStatus(result.message || '送信失敗', 3000);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '投稿';
      }
    }
  } catch (err) {
    console.error('GAS送信失敗:', err);
    showPostStatus('通信エラー', 3000);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '投稿';
    }
  }
}

// 専用アイコンのクリックイベント登録
document.addEventListener('DOMContentLoaded', () => {
  const postBtn = document.getElementById('map-post-btn');
  if (postBtn) {
    postBtn.addEventListener('click', () => togglePostMode());
  }
});
