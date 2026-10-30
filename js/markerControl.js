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
// ★ スポット詳細画面：釣果ピン投稿モード (doPost専用)
// ==========================================

// 1. 設定エリア（後からいつでも編集可能）
const GAS_TEMP_PIN_URL = 'ここにデプロイした https://script.google.com/macros/s/.../exec のURLを貼る';

// 魚種辞書リスト（配列の文字を書き換えるだけで選択肢に反映されます）
const FISH_DICTIONARY = [
  'アジ', 'サバ', 'イワシ', 'シーバス', 'クロダイ', 'マダイ',
  'ヒラメ', 'マゴチ', 'カサゴ', 'メバル', 'アオリイカ', 'タチウオ',
  'ブリ・イナダ', 'カンパチ', 'サワラ', 'カワハギ', 'シロギス', 'ハゼ',
  'カレイ', 'メジナ', 'ブラックバス', 'ヘラブナ', 'コイ', 'ニジマス'
];

let isPostModeActive = false;
let savedNormalBounds = null;
let lastTempPinPostTime = 0; // 10秒連投制限用キャッシュ

// 2. 端末固有UUIDの取得・発行
function getMyUuid() {
  let uuid = localStorage.getItem('fishing_user_uuid');
  if (!uuid) {
    uuid = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('fishing_user_uuid', uuid);
  }
  return uuid;
}

// 3. 投稿モード用のDOM（中心の＋マーク ＆ 下部パネル）を初回のみ生成
function ensurePostModeDom() {
  const mapEl = document.getElementById('lf-map');
  if (!mapEl || document.getElementById('post-center-crosshair')) return;

  // ① 画面中心の「＋」マーク（ドラッグを邪魔しない pointer-events: none）
  const crosshair = document.createElement('div');
  crosshair.id = 'post-center-crosshair';
  crosshair.style.cssText = `
    display: none;
    position: absolute;
    top: 50%;
    left: 50%;
    width: 36px;
    height: 36px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 1000;
  `;
  crosshair.innerHTML = `
    <div style="position:absolute;top:50%;left:0;width:100%;height:2px;background:#ff3b30;transform:translateY(-50%);box-shadow:0 0 3px #fff;"></div>
    <div style="position:absolute;left:50%;top:0;width:2px;height:100%;background:#ff3b30;transform:translateX(-50%);box-shadow:0 0 3px #fff;"></div>
    <div style="position:absolute;top:50%;left:50%;width:8px;height:8px;border:2px solid #ff3b30;border-radius:50%;transform:translate(-50%,-50%);background:rgba(255,255,255,0.4);"></div>
  `;
  mapEl.appendChild(crosshair);

  // ② 投稿用UIパネル（魚種選択スイッチ ＋ 投稿ボタン）
  const panel = document.createElement('div');
  panel.id = 'post-mode-panel';
  panel.style.cssText = `
    display: none;
    position: absolute;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.95);
    padding: 10px 12px;
    border-radius: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    z-index: 1001;
    width: calc(100% - 28px);
    max-width: 340px;
    box-sizing: border-box;
    text-align: center;
  `;

  const optionsHtml = FISH_DICTIONARY.map(f => `<option value="${f}">${f}</option>`).join('');
  panel.innerHTML = `
    <div style="font-size:12px;font-weight:bold;color:#191970;margin-bottom:6px;">
      中心の「＋」に釣れた場所を合わせてください
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <select id="post-fish-select" style="flex:1;padding:7px;font-size:13px;border:1px solid #ccc;border-radius:6px;background:#fff;">
        ${optionsHtml}
      </select>
      <button id="post-submit-btn" style="padding:7px 14px;background:#ff6d00;color:#fff;font-size:13px;font-weight:bold;border:none;border-radius:6px;cursor:pointer;white-space:nowrap;">
        投稿する
      </button>
    </div>
  `;

  // パネル操作時に下の地図が誤反応しないよう伝播を止める
  if (typeof L !== 'undefined' && L.DomEvent) {
    L.DomEvent.disableClickPropagation(panel);
    L.DomEvent.disableScrollPropagation(panel);
  }

  mapEl.appendChild(panel);

  // 投稿ボタンのクリックイベント
  document.getElementById('post-submit-btn').addEventListener('click', submitCenterTempPin);
}

// 4. 投稿モードのON / OFF切り替え
function togglePostMode(forceState) {
  if (!window.map) return;
  ensurePostModeDom();

  const nextState = (typeof forceState === 'boolean') ? forceState : !isPostModeActive;
  isPostModeActive = nextState;

  const crosshair = document.getElementById('post-center-crosshair');
  const panel     = document.getElementById('post-mode-panel');
  const postBtn   = document.getElementById('map-post-btn');

  if (isPostModeActive) {
    // ON：現在のboundsを記憶し、＋マークが画面端の釣り場にも届くよう50%広げる
    if (window.map.options.maxBounds) {
      savedNormalBounds = window.map.options.maxBounds;
      window.map.setMaxBounds(savedNormalBounds.pad(0.5));
    }
    if (crosshair) crosshair.style.display = 'block';
    if (panel) panel.style.display = 'block';
    if (postBtn) postBtn.classList.add('active');
  } else {
    // OFF：元のboundsに戻し、＋マークとパネルを隠す
    if (savedNormalBounds) {
      window.map.setMaxBounds(savedNormalBounds);
      savedNormalBounds = null;
    }
    if (crosshair) crosshair.style.display = 'none';
    if (panel) panel.style.display = 'none';
    if (postBtn) postBtn.classList.remove('active');
  }
}

// 5. 中心座標（＋マークの位置）をGASへPOST送信
async function submitCenterTempPin() {
  if (!window.map) return;

  // ① 先頭で10秒キャッシュを参照して連投ブロック
  const now = Date.now();
  if (now - lastTempPinPostTime < 10000) {
    const remain = Math.ceil((10000 - (now - lastTempPinPostTime)) / 1000);
    alert(`連投制限中です。あと ${remain} 秒お待ちください。`);
    return;
  }

  const selectEl = document.getElementById('post-fish-select');
  const submitBtn = document.getElementById('post-submit-btn');
  const fishName = selectEl ? selectEl.value : FISH_DICTIONARY[0];

  // 画面中心（＋マーク）の座標を取得
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
    submitBtn.textContent = '送信中...';
  }

  try {
    const res = await fetch(GAS_TEMP_PIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.status === 'success') {
      alert(`「${fishName}」の釣果ピンを送信しました！`);
      togglePostMode(false); // 送信成功後に投稿モードを閉じる
    } else {
      alert('送信エラー: ' + (result.message || 'しばらくしてからお試しください'));
    }
  } catch (err) {
    console.error('GAS送信失敗:', err);
    alert('通信に失敗しました。');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '投稿する';
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
