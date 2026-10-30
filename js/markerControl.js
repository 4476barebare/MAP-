
const GAS_TEMP_PIN_URL = 'https://script.google.com/macros/s/AKfycbzupqGAv-ib_-FXJv7U-Lea4iGL2uaBaqYIB6oKzbpbk2vWGAWMxSBHEPfhuD5IxFJ17g/exec';

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
// ★ スポット詳細画面：釣果ピン投稿モード (doPost専用)
// ==========================================

// 魚種辞書リスト（index.htmlのFISH_DICTIONARYと重複しない名前）
const POST_FISH_LIST = [
  'アジ', 'サバ', 'イワシ', 'シーバス', 'クロダイ', 'マダイ',
  'ヒラメ', 'マゴチ', 'カサゴ', 'メバル', 'アオリイカ', 'タチウオ',
  'ブリ・イナダ', 'カンパチ', 'サワラ', 'カワハギ', 'シロギス', 'ハゼ',
  'カレイ', 'メジナ', 'ブラックバス', 'ヘラブナ', 'コイ', 'ニジマス'
];

let isPostModeActive = false;
let savedNormalBounds = null;
let lastTempPinPostTime = 0; // 10秒連投制限用キャッシュ
let postStatusTimer = null;

// 2. 端末固有UUIDの取得・発行
function getMyUuid() {
  let uuid = localStorage.getItem('fishing_user_uuid');
  if (!uuid) {
    uuid = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('fishing_user_uuid', uuid);
  }
  return uuid;
}

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

// 4. 投稿モード用のDOMを初回のみ生成（.map-ui-sub2 の枠内に収める）
function ensurePostModeDom() {
  const mapEl = document.getElementById('lf-map');
  const sub2 = document.querySelector('.map-ui-sub2');
  if (!mapEl || !sub2 || document.getElementById('post-center-crosshair')) return;

  // ① 画面中心の「＋」照準（マップ直下・中央固定）
  const crosshair = document.createElement('div');
  crosshair.id = 'post-center-crosshair';
  crosshair.className = 'post-center-crosshair';
  mapEl.appendChild(crosshair);

  // ② 投稿用パネル（スポット画面で非表示になっている .map-ui-sub2 の中に格納！）
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

  // パネル操作時に下の地図が誤反応しないよう伝播を止める
  if (typeof L !== 'undefined' && L.DomEvent) {
    L.DomEvent.disableClickPropagation(panel);
    L.DomEvent.disableScrollPropagation(panel);
  }

  sub2.appendChild(panel);

  document.getElementById('post-submit-btn').addEventListener('click', submitCenterTempPin);
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
  const sub2      = document.querySelector('.map-ui-sub2');

  if (isPostModeActive) {
    // ON：現在のboundsを記憶し、＋マークが画面端の釣り場にも届くよう50%広げる
    if (window.map.options.maxBounds && !savedNormalBounds) {
      savedNormalBounds = window.map.options.maxBounds;
      window.map.setMaxBounds(savedNormalBounds.pad(0.5));
    }
    showPostStatus('');
    if (sub2) sub2.style.display = 'inline-flex'; // スポット画面で空いている sub2 を有効化
    if (crosshair) crosshair.classList.add('is-open');
    if (panel) panel.classList.add('is-open');
    if (postBtn) postBtn.classList.add('active');
  } else {
    // OFF：元のboundsに戻し、＋マークとパネルを隠す
    if (savedNormalBounds) {
      window.map.setMaxBounds(savedNormalBounds);
      savedNormalBounds = null;
    }
    showPostStatus('');
    if (sub2) sub2.style.display = 'none'; // sub2 を再度非表示に戻す
    if (crosshair) crosshair.classList.remove('is-open');
    if (panel) panel.classList.remove('is-open');
    if (postBtn) postBtn.classList.remove('active');
  }
}


// 6. 中心座標（＋マークの位置）をGASへPOST送信
async function submitCenterTempPin() {
  if (!window.map) return;

  // ① 先頭で10秒キャッシュを参照して連投ブロック
  const now = Date.now();
  if (now - lastTempPinPostTime < 10000) {
    const remain = Math.ceil((10000 - (now - lastTempPinPostTime)) / 1000);
    showPostStatus(`連投制限中（あと${remain}秒）`, 2000);
    return;
  }

  const selectEl = document.getElementById('post-fish-select');
  const submitBtn = document.getElementById('post-submit-btn');
  const fishName = selectEl ? selectEl.value : POST_FISH_LIST[0];

  const center = window.map.getCenter();
  const myUuid = getMyUuid();

  const payload = {
    action: 'add',
    id: 'p_' + now + '_' + Math.random().toString(36).substring(2, 6),
    fish: fishName,
    lat: Number(center.lat.toFixed(6)),
    lng: Number(center.lng.toFixed(6)),
    uuid: myUuid,
    time: now
  };

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
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.status === 'success') {
      if (submitBtn) submitBtn.textContent = '完了';
      showPostStatus(`${fishName}を投稿しました`, 1000);
      setTimeout(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '投稿';
        }
        togglePostMode(false);
      }, 900);
    } else {
      showPostStatus(result.message || '送信できませんでした', 3000);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '投稿';
      }
    }
  } catch (err) {
    console.error('GAS送信失敗:', err);
    showPostStatus('通信エラーが発生しました', 3000);
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
