// =========================================
// fish_article.js
// 魚種生息マップ生成＆ソナーレーダー演出＆SNS最新釣果スポットカード＆リンク自動構築スクリプト
// =========================================

// ==========================================
// ★ ソナーレーダーの間引き・表示バランス設定
// ==========================================
const SONAR_CONFIG = {
    default: {
        maxSonars: 12,
        minDistanceKm: 12.0,
        hitRadiusKm: 6.0,
        sonarSizePx: 56
    },
    overrides: {
        "スズキ":       { maxSonars: 10, minDistanceKm: 18.0, sonarSizePx: 48 },
        "シーバス":     { maxSonars: 10, minDistanceKm: 18.0, sonarSizePx: 48 },
        "ブラックバス": { maxSonars: 10, minDistanceKm: 18.0, sonarSizePx: 48 },
        "アジ":         { maxSonars: 12, minDistanceKm: 15.0, sonarSizePx: 50 },
        "クロダイ":     { maxSonars: 10, minDistanceKm: 15.0, sonarSizePx: 50 },
        "タチウオ":     { maxSonars: 10, minDistanceKm: 14.0, sonarSizePx: 52 },
        "ハゼ":         { maxSonars: 12, minDistanceKm: 10.0, sonarSizePx: 56 },
        "マダイ":       { maxSonars: 12, minDistanceKm: 8.0,  sonarSizePx: 60 }
    }
};

// ==========================================
// ★ 魚種名おまとめ辞書（出世魚や別名・compiled_dataの表記ゆれを統一）
// ==========================================
const FISH_DICTIONARY = {
    "ツバス": "ワカシ",
    "ワカシ": "ワカシ",
    "ハマチ": "イナダ",
    "イナダ": "イナダ",
    "メジロ": "ワラサ",
    "ワラサ": "ワラサ",
    "ブリ": "ブリ",
    "セイゴ": "スズキ",
    "フッコ": "スズキ",
    "シーバス": "スズキ",
    "マルスズキ": "スズキ",
    "タイリクスズキ": "スズキ",
    "ヒラスズキ": "スズキ",
    "スズキ": "スズキ",
    "サゴシ": "サワラ",
    "サワラ": "サワラ",
    "カイズ": "クロダイ",
    "チヌ": "クロダイ",
    "クロダイ": "クロダイ",
    "コハダ": "コノシロ",
    "コノシロ": "コノシロ",
    "クチボソ": "モツゴ",
    "モツゴ": "モツゴ",
    "ヤマベ": "オイカワ",
    "オイカワ": "オイカワ",
    "グレ": "メジナ",
    "メジナ": "メジナ",
    "マアジ": "アジ",
    "マハゼ": "ハゼ",
    "ウロハゼ": "ハゼ",
    "ラージマウスバス": "ブラックバス",
    "スモールマウスバス": "ブラックバス",
    "マダコ": "タコ"
};

// ==========================================
// ★ タイルURL定義（dataLoader.js の zoomToSpot 準拠）
// ==========================================
const ARTICLE_TILE_URLS = {
    ort: 'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg',
    airphoto: 'https://cyberjapandata.gsi.go.jp/xyz/airphoto/{z}/{x}/{y}.png',
    rinya: 'https://cyberjapandata.gsi.go.jp/xyz/rinya_m/{z}/{x}/{y}.png',
    photo: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'
};

// ★ 正規化ヘルパー
function normalizeFishName(rawName) {
    if (!rawName) return "";
    const cleaned = String(rawName).replace(/（.*?）|\(.*?\)/g, '').trim();
    return FISH_DICTIONARY[cleaned] || cleaned;
}

// ★ 複合魚種名（「ブリ・イナダ」等）を分割・正規化してターゲット魚種配列と一致するか判定
function isTargetFishMatched(rawFishStr, targetFishArray) {
    if (!rawFishStr || !Array.isArray(targetFishArray) || targetFishArray.length === 0) return false;
    const parts = String(rawFishStr).split(/[・,、／/]/).map(s => normalizeFishName(s)).filter(Boolean);
    return parts.some(p => targetFishArray.includes(p));
}

// ★ 2点間の距離（km）を計算
function calcDistanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ★ dataLoader.js の zoomToSpot と完全一致するタイル情報＋タイル内相対座標（%）＋周辺2x2キャッシュ用URLを算出
function buildSpotTileData(spot) {
    const lat = Number(spot.lat);
    const lng = Number(spot.lng);
    const rawZoom = Number(spot.zoom);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(rawZoom)) return null;

    const typeParts = String(spot.type || '').split('$');
    const isSpecial = typeParts.includes('special');

    const tileUrls = window.TILE_URLS || ARTICLE_TILE_URLS;
    let baseTileUrl;
    if (typeParts.includes('ort')) {
        baseTileUrl = tileUrls.ort;
    } else if (typeParts.includes('airphoto')) {
        baseTileUrl = tileUrls.airphoto;
    } else if (typeParts.includes('rinya')) {
        baseTileUrl = tileUrls.rinya;
    } else {
        baseTileUrl = tileUrls.photo;
    }

    // Leafletは小数ズーム（例: 16.5）のとき Math.ceil(16.5) = 17 のタイルを読み込んで縮小表示するため、
    // キャッシュヒット率を100%にするため Math.ceil で実際のズームタイルに合わせる（上限18）
    const targetZoom = isSpecial ? 14 : (rawZoom < 14 ? 14 : rawZoom);
    const fetchZoom = Math.min(18, Math.ceil(targetZoom));

    const n = Math.pow(2, fetchZoom);
    const exactX = (lng + 180) / 360 * n;
    const latRad = lat * Math.PI / 180;
    const exactY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;

    const tileX = Math.floor(exactX);
    const tileY = Math.floor(exactY);

    // タイル内でのスポットの相対位置（0〜100%）を算出し、object-position で中心を合わせる
    const offsetXPercent = Math.round((exactX - tileX) * 100);
    const offsetYPercent = Math.round((exactY - tileY) * 100);

    const baseUrl = baseTileUrl.replace('{z}', fetchZoom);
    const thumbUrl = baseUrl.replace('{x}', tileX).replace('{y}', tileY);

    // 隣接する周囲タイル（2x2）も遷移先スポット画面のキャッシュとして使えるようリスト化
    const stepX = (exactX - tileX) >= 0.5 ? 1 : -1;
    const stepY = (exactY - tileY) >= 0.5 ? 1 : -1;
    const preloadUrls = [];
    for (const dx of [0, stepX]) {
        for (const dy of [0, stepY]) {
            if (dx === 0 && dy === 0) continue;
            preloadUrls.push(
                baseUrl.replace('{x}', tileX + dx).replace('{y}', tileY + dy)
            );
        }
    }

    return {
        thumbUrl,
         objectPosition: `${offsetXPercent}% ${offsetYPercent}%`,
        preloadUrls
    };
}

// ★ 日付文字列を "mm月dd日" に整形
function formatCatchDateJP(dateStr) {
    if (!dateStr) return '';
    const cleaned = String(dateStr).trim().replace(/-/g, '/');
    const parts = cleaned.split('/');
    if (parts.length >= 3) {
        const m = String(parseInt(parts[1], 10)).padStart(2, '0');
        const d = String(parseInt(parts[2], 10)).padStart(2, '0');
        return `${m}月${d}日`;
    }
    if (parts.length === 2) {
        const m = String(parseInt(parts[0], 10)).padStart(2, '0');
        const d = String(parseInt(parts[1], 10)).padStart(2, '0');
        return `${m}月${d}日`;
    }
    return cleaned;
}

// ★ SNSサービス名の取得
function resolveSnsSourceName(item) {
    if (item && item.source) return String(item.source).trim();
    const url = String(item?.url || '').toLowerCase();
    if (url.includes('instagram.com')) return 'Instagram';
    if (url.includes('x.com') || url.includes('twitter.com')) return 'X';
    if (url.includes('threads.net') || url.includes('threads.com')) return 'Threads';
    if (url.includes('facebook.com')) return 'Facebook';
    return 'SNS';
}

// ★ 対象魚種に応じたソナー設定を取得
function getSonarSettings(targetFishArray) {
    let settings = { ...SONAR_CONFIG.default };
    for (const fish of targetFishArray) {
        if (SONAR_CONFIG.overrides[fish]) {
            settings = { ...settings, ...SONAR_CONFIG.overrides[fish] };
            break;
        }
    }
    if (typeof window.SONAR_MAX_COUNT === 'number') settings.maxSonars = window.SONAR_MAX_COUNT;
    if (typeof window.SONAR_MIN_DIST_KM === 'number') settings.minDistanceKm = window.SONAR_MIN_DIST_KM;
    if (typeof window.SONAR_SIZE_PX === 'number') settings.sonarSizePx = window.SONAR_SIZE_PX;
    return settings;
}

// ★ ソナーレーダー＆ハイライト用のCSSを自動注入
function injectSonarStyles(sizePx) {
    const existing = document.getElementById('sonar-radar-styles');
    if (existing) existing.remove();

    const sweepSize = Math.max(20, sizePx - 8);
    const style = document.createElement('style');
    style.id = 'sonar-radar-styles';
    style.textContent = `
        .sonar-marker-wrapper {
            background: transparent;
            border: none;
            pointer-events: none;
        }
        .sonar-emitter {
            position: relative;
            width: ${sizePx}px;
            height: ${sizePx}px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .sonar-core {
            width: 5px;
            height: 5px;
            background-color: #00ffcc;
            border-radius: 50%;
            box-shadow: 0 0 6px #00ffcc, 0 0 12px #00ffcc;
            z-index: 3;
        }
        .sonar-wave {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 6px;
            height: 6px;
            transform: translate(-50%, -50%);
            border-radius: 50%;
            border: 1.5px solid rgba(0, 255, 204, 0.85);
            background: radial-gradient(circle, rgba(0, 255, 204, 0.22) 0%, rgba(0, 255, 204, 0) 70%);
            box-shadow: 0 0 6px rgba(0, 255, 204, 0.4);
            opacity: 0;
            animation: sonar-ping 3.2s cubic-bezier(0.1, 0.4, 0.3, 1) infinite;
        }
        .sonar-wave.delay-1 { animation-delay: 1.06s; }
        .sonar-wave.delay-2 { animation-delay: 2.12s; }

        .sonar-sweep {
            position: absolute;
            top: 4px;
            left: 4px;
            width: ${sweepSize}px;
            height: ${sweepSize}px;
            border-radius: 50%;
            background: conic-gradient(from 0deg, rgba(0, 255, 204, 0) 0deg, rgba(0, 255, 204, 0.02) 260deg, rgba(0, 255, 204, 0.4) 360deg);
            animation: sonar-rotate 4s linear infinite;
            border: 1px dashed rgba(0, 255, 204, 0.3);
            box-sizing: border-box;
        }

        @keyframes sonar-ping {
            0% { width: 6px; height: 6px; opacity: 1; }
            100% { width: ${sizePx}px; height: ${sizePx}px; opacity: 0; }
        }
        @keyframes sonar-rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .sonar-status-banner {
            display: flex;
            align-items: center;
            gap: 8px;
            background: #0b192c;
            color: #00ffcc;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 8px;
            border: 1px solid rgba(0, 255, 204, 0.4);
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
            line-height: 1.4;
        }
        .sonar-status-dot {
            width: 8px;
            height: 8px;
            background: #00ffcc;
            border-radius: 50%;
            box-shadow: 0 0 8px #00ffcc;
            animation: sonar-blink 1.2s infinite alternate;
            flex-shrink: 0;
        }
        @keyframes sonar-blink {
            from { opacity: 0.3; }
            to { opacity: 1; }
        }

        .spot-link-item.sonar-hit a {
            background: linear-gradient(135deg, #0b192c 0%, #16325b 100%) !important;
            color: #00ffcc !important;
            border: 1px solid #00ffcc !important;
            font-weight: bold;
            box-shadow: 0 0 8px rgba(0, 255, 204, 0.35);
            position: relative;
        }
        .sonar-badge {
            display: inline-block;
            background: #00ffcc;
            color: #0b192c;
            font-size: 10px;
            font-weight: 800;
            padding: 1px 5px;
            border-radius: 3px;
            margin-right: 4px;
            vertical-align: text-bottom;
        }
    `;
    document.head.appendChild(style);
}

// ==========================================
// ★ SNS最新釣果から最寄りスポットカードを生成する関数
//    引数:
//      targetContainer: DOM要素またはセレクタ文字列
//      maxCount: 連続生成する最大件数（デフォルト 1）
//      targetIndex: 複数検索の「◯件目（1始まり）」だけを単品表示する場合に指定（未指定・0なら maxCount 件を連続表示）
//      maxDistKm: 最寄りスポットとして許容する最大直線距離km（デフォルト 15）
// ==========================================
window._articleAllZoomSpots = [];
window._articleSnsCatches = [];
window._articleTargetFishArray = [];
window._preloadedArticleTiles = new Set();

window.renderSnsNearestSpotCards = function(targetContainer, maxCount = 1, targetIndex = null, maxDistKm = 15) {
    const container = typeof targetContainer === 'string'
        ? document.querySelector(targetContainer)
        : targetContainer;
    if (!container) return;

    const singleIdx = targetIndex != null && targetIndex !== '' && Number(targetIndex) >= 1
        ? Math.floor(Number(targetIndex))
        : null;

    // 単品指定（例: 3件目のみ）の場合は最低でも3件目まで探索する
    const countLimit = singleIdx ? singleIdx : Math.max(1, Number(maxCount) || 1);
    const distLimitKm = Math.max(0.1, Number(maxDistKm) || 15);

    const spots = window._articleAllZoomSpots || [];
    const snsList = window._articleSnsCatches || [];
    const targetFishArray = window._articleTargetFishArray || [];

    if (spots.length === 0 || snsList.length === 0 || targetFishArray.length === 0) {
        container.innerHTML = '';
        return;
    }

    // 1. 対象魚種に一致するSNS投稿を抽出し、日付の最新順（降順）にソート
    const matchedPosts = snsList
        .filter(item => {
            if (!item || item.lat == null || item.lng == null || !item.fish) return false;
            const lat = Number(item.lat);
            const lng = Number(item.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
            return isTargetFishMatched(item.fish, targetFishArray);
        })
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    if (matchedPosts.length === 0) {
        container.innerHTML = '';
        return;
    }

    // 2. 最新投稿から順に、maxDistKm 以内で最も近い「未出のスポット」を countLimit 件まで探索
    const selectedCards = [];
    const usedSpotKeys = new Set();

    for (const post of matchedPosts) {
        if (selectedCards.length >= countLimit) break;

        const pLat = Number(post.lat);
        const pLng = Number(post.lng);

        let nearestSpot = null;
        let minDistance = Infinity;

        for (const spot of spots) {
            const spotKey = `${spot.prefName}_${spot.spotName}`;
            if (usedSpotKeys.has(spotKey)) continue;

            const d = calcDistanceKm(pLat, pLng, spot.lat, spot.lng);
            if (d <= distLimitKm && d < minDistance) {
                minDistance = d;
                nearestSpot = spot;
            }
        }

        if (nearestSpot) {
            const spotKey = `${nearestSpot.prefName}_${nearestSpot.spotName}`;
            usedSpotKeys.add(spotKey);

            selectedCards.push({
                prefName: nearestSpot.prefName,
                spotName: nearestSpot.spotName,
                href: nearestSpot.href,
                thumbUrl: nearestSpot.thumbUrl,
                fallbackThumbUrl: nearestSpot.fallbackThumbUrl,
                objectPosition: nearestSpot.objectPosition,
                preloadUrls: nearestSpot.preloadUrls || [],
                dateText: formatCatchDateJP(post.date),
                sourceName: resolveSnsSourceName(post)
            });
        }
    }

    // 第3引数（targetIndex）が指定されている場合は、その「◯件目」の1件だけを抽出（届かなければ空）
    const displayCards = singleIdx
        ? (selectedCards[singleIdx - 1] ? [selectedCards[singleIdx - 1]] : [])
        : selectedCards;

    if (displayCards.length === 0) {
        container.innerHTML = '';
        return;
    }

    // 周囲タイル（2x2）も裏側でプリロードして遷移時のキャッシュヒット率を高める
    displayCards.forEach(card => {
        (card.preloadUrls || []).forEach(u => {
            if (!window._preloadedArticleTiles.has(u)) {
                window._preloadedArticleTiles.add(u);
                const img = new Image();
                img.src = u;
            }
        });
    });

    // 3. アジ記事の関連リンクと同一の .menu-card 構造でDOM生成（県名・ALT・地理院&Leaflet署名付き）
    const cardsHtml = displayCards.map(item => {
        const safePref = String(item.prefName || '').replace(/[<>&"']/g, '');
        const safeSpot = String(item.spotName || '').replace(/[<>&"']/g, '');
        const fullSpotTitle = safePref ? `${safePref} ${safeSpot}` : safeSpot;
        const altText = `${safeSpot}の画像`;
        const safeDate = String(item.dateText).replace(/[<>&"']/g, '');
        const safeSource = String(item.sourceName).replace(/[<>&"']/g, '');
        const posStyle = item.objectPosition ? ` style="object-position: ${item.objectPosition};"` : '';
        const onErrorAttr = item.fallbackThumbUrl
            ? ` onerror="this.onerror=null;this.src='${item.fallbackThumbUrl}';"`
            : '';

        return `
<div style="margin: 30px 0;">
  <a href="${item.href}" class="menu-card">
    <div class="menu-thumb">
      <img src="${item.thumbUrl}" alt="${altText}" loading="lazy" decoding="async"${posStyle}${onErrorAttr}>
      <span class="thumb-attribution">Leaflet | © 国土地理院</span>
    </div>
    <div class="menu-text">
      <h2>${fullSpotTitle}<br>この付近で${safeDate} ${safeSource}で投稿あり</h2>
    </div>
  </a>
</div>`;
    }).join('');

    container.innerHTML = cardsHtml;
};

document.addEventListener("DOMContentLoaded", function () {
  const targetFishStr = window.TARGET_FISH || '対象魚';
  const targetRegionCode = window.TARGET_REGION_CODE || 'KANTO';
  const targetRegionNameJP = window.TARGET_REGION_NAME_JP || '関東地方';

  const displayFishStr = targetFishStr.split(',').map(f => f.trim()).filter(Boolean).join('・');

  const targetFishArray = targetFishStr
    .split(',')
    .map(f => normalizeFishName(f))
    .filter(Boolean);
  window._articleTargetFishArray = targetFishArray;

  const sonarSettings = getSonarSettings(targetFishArray);
  injectSonarStyles(sonarSettings.sonarSizePx);

  const mapContainer = document.getElementById('fish-map');
  if (mapContainer) {
    mapContainer.setAttribute('aria-label', `${targetRegionNameJP}の${displayFishStr}釣果スポット分布マップ`);
    const parentSection = mapContainer.closest('section');
    if (parentSection) {
      const h3 = parentSection.querySelector('h3');
      if (h3) {
        const shortRegion = targetRegionNameJP.replace('地方', '');
        h3.textContent = `📍 ${shortRegion}の${displayFishStr}生息・釣果スポット`;
      }
    }
  }

  const map = L.map('fish-map', {
    zoomControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    zoomSnap: 0.5,
    zoomDelta: 0.5
  }).setView([35.6, 140.0], 7);

  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg', {
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">© 国土地理院</a>'
  }).addTo(map);

  map.createPane('sonarPane');
  map.getPane('sonarPane').style.zIndex = 650;

  const dotIcon = L.divIcon({
    className: 'fish-dot-marker',
    html: '',
    iconSize: [3, 3],
    iconAnchor: [1.5, 1.5]
  });

  const halfSize = sonarSettings.sonarSizePx / 2;
  const sonarIcon = L.divIcon({
    className: 'sonar-marker-wrapper',
    html: `
      <div class="sonar-emitter">
        <div class="sonar-sweep"></div>
        <div class="sonar-wave"></div>
        <div class="sonar-wave delay-1"></div>
        <div class="sonar-wave delay-2"></div>
        <div class="sonar-core"></div>
      </div>
    `,
    iconSize: [sonarSettings.sonarSizePx, sonarSettings.sonarSizePx],
    iconAnchor: [halfSize, halfSize]
  });

  async function loadFishSpots() {
    const regionUrl = `../${targetRegionCode}/${targetRegionCode}_region.csv`;
    const compiledDataUrl = `../data/compiled_data.json`;
    const snsCatchUrl = `../${targetRegionCode}/integrated_catch.json`;

    try {
      const [res, compiledRes, snsRes] = await Promise.all([
        fetch(regionUrl),
        fetch(compiledDataUrl).catch(() => null),
        fetch(snsCatchUrl).catch(() => null)
      ]);

      if (!res.ok) throw new Error("Region CSV fetch failed");

      if (snsRes && snsRes.ok) {
        const snsJson = await snsRes.json().catch(() => []);
        window._articleSnsCatches = Array.isArray(snsJson) ? snsJson : [];
      } else {
        window._articleSnsCatches = [];
      }
      
      const allMatchedCatchPoints = [];
      const displaySonarPoints = [];
      let totalCatchReports = 0;

      if (compiledRes && compiledRes.ok) {
        const compiledJson = await compiledRes.json();
        const rawList = [
          ...(compiledJson.map_data || []),
          ...(compiledJson.blog_data || [])
        ];

        const uniqueCoords = new Map();
        rawList.forEach(item => {
          if (!item || !item.fish || !item.lat || !item.lng) return;
          const normFish = normalizeFishName(item.fish);
          if (targetFishArray.includes(normFish)) {
            totalCatchReports++;
            const key = `${Number(item.lat).toFixed(3)}_${Number(item.lng).toFixed(3)}`;
            const existing = uniqueCoords.get(key);
            if (!existing || item.date > existing.date) {
              uniqueCoords.set(key, {
                lat: Number(item.lat),
                lng: Number(item.lng),
                date: item.date || '',
                count: (existing ? existing.count : 0) + 1
              });
            } else {
              existing.count += 1;
            }
          }
        });

        allMatchedCatchPoints.push(...uniqueCoords.values());

        const sortedCandidates = [...allMatchedCatchPoints].sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return b.date.localeCompare(a.date);
        });

        for (const candidate of sortedCandidates) {
          if (displaySonarPoints.length >= sonarSettings.maxSonars) break;
          const isTooClose = displaySonarPoints.some(
            selected => calcDistanceKm(candidate.lat, candidate.lng, selected.lat, selected.lng) < sonarSettings.minDistanceKm
          );
          if (!isTooClose) {
            displaySonarPoints.push(candidate);
          }
        }
      }

      const text = await res.text();
      const lines = text.trim().split('\n');
      if (lines.length < 2) return;
      
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const typeIdx = headers.indexOf('type');
      const urlIdx = headers.indexOf('url');
      
      if (typeIdx === -1 || urlIdx === -1) return;

      const prefCodes = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols[typeIdx] === 'pref' && cols[urlIdx]) {
          const urlVal = cols[urlIdx];
          const pCode = urlVal.split('/')[1]?.split('_')[0] || urlVal.split('/')[0].split('_')[0];
          if (pCode) prefCodes.push(pCode);
        }
      }
      
      const fetchPromises = prefCodes.map(async (prefCode) => {
          const locUrl = `../${targetRegionCode}/${prefCode}_location.json`;
          const fishUrl = `../${targetRegionCode}/${prefCode}_fish.json`;
          
          const [locRes, fishRes] = await Promise.all([
              fetch(locUrl).catch(() => null),
              fetch(fishUrl).catch(() => null)
          ]);
          
          const locData = locRes && locRes.ok ? await locRes.json() : [];
          const fishData = fishRes && fishRes.ok ? await fishRes.json() : {};
          
          return { locData, fishData, prefCode };
      });
      
      const results = await Promise.all(fetchPromises);
      const bounds = L.latLngBounds();
      const fishSpotLinks = [];
      const allZoomSpots = [];
      
      results.forEach(({ locData, fishData, prefCode }) => {
          const fishMap = {};
          let prefNameJP = prefCode;
          const areaDict = {};

          if (Array.isArray(locData)) {
              locData.forEach(s => {
                  if (s.name === prefCode && s.individualId === 'parent' && s.notes) {
                      prefNameJP = s.notes;
                  }
                  if (s.areaId === prefCode && s.individualId && s.individualId !== 'parent') {
                      areaDict[s.individualId] = s.name;
                  }
              });
          }
          
          if (fishData && typeof fishData === 'object' && !Array.isArray(fishData)) {
              Object.values(fishData).forEach(areaData => {
                  if (areaData && typeof areaData === 'object') {
                      Object.entries(areaData).forEach(([spotName, fishes]) => {
                          if (fishes && typeof fishes === 'object') {
                              fishMap[spotName] = Object.keys(fishes).join(',');
                          }
                      });
                  }
              });
          }
          
          if (Array.isArray(locData)) {
              locData.forEach(spot => {
                  if (spot.type === 'pref' || spot.type === 'area') return;

                  const sLat = Number(spot.lat);
                  const sLng = Number(spot.lng);
                  const hasValidCoord = Number.isFinite(sLat) && Number.isFinite(sLng);

                  const spotAreaIdStr = String(spot.areaId || '');
                  const areaIndividualId = spotAreaIdStr.replace(`${prefCode}_`, '');
                  const areaNameJP = areaDict[areaIndividualId] || '';
                  const spotHref = areaNameJP
                      ? `https://turiiko-navi.com/?region=${encodeURIComponent(targetRegionNameJP)}&pref=${encodeURIComponent(prefNameJP)}&area=${encodeURIComponent(areaNameJP)}&spot=${encodeURIComponent(spot.name)}`
                      : '';

                  // ★ 全登録スポットのうち zoom 値があるスポットを SNS最寄りカード候補としてプール
                  if (hasValidCoord && spot.zoom != null && String(spot.zoom).trim() !== '' && spotHref) {
                      const tileInfo = buildSpotTileData(spot);
                      const fallbackInfo = buildSpotTileData({ ...spot, type: 'ort' });
                      if (tileInfo && tileInfo.thumbUrl) {
                          allZoomSpots.push({
                              prefName: prefNameJP,
                              areaName: areaNameJP,
                              spotName: spot.name,
                              lat: sLat,
                              lng: sLng,
                              zoom: spot.zoom,
                              type: spot.type || '',
                              href: spotHref,
                              thumbUrl: tileInfo.thumbUrl,
                              fallbackThumbUrl: fallbackInfo ? fallbackInfo.thumbUrl : '',
                              objectPosition: tileInfo.objectPosition,
                              preloadUrls: tileInfo.preloadUrls
                          });
                      }
                  }
                  
                  const fStr = fishMap[spot.name] || fishMap[spot.individualId] || '';
                  const fishArrayFromJSON = fStr ? fStr.split(',') : [];
                  
                  const fishArrayFromURL = [];
                  if (spot.URL) {
                      spot.URL.split(',').forEach(item => {
                          fishArrayFromURL.push(item.split('|')[0]); 
                      });
                  }

                  const otherArray = [spot.notes, spot.name];
                  const allSearchWordsRaw = [...fishArrayFromJSON, ...fishArrayFromURL, ...otherArray].filter(Boolean);
                  const mappedSearchWords = allSearchWordsRaw.map(word => normalizeFishName(word));
                  
                  const isMatch = targetFishArray.some(targetFish => mappedSearchWords.includes(targetFish));
                  
                  if (isMatch) {
                      let isSonarHit = false;
                      let latestCatchDate = '';

                      if (hasValidCoord) {
                          L.marker([sLat, sLng], { icon: dotIcon }).addTo(map);
                          bounds.extend([sLat, sLng]);

                          displaySonarPoints.forEach(sp => {
                              if (calcDistanceKm(sLat, sLng, sp.lat, sp.lng) <= sonarSettings.hitRadiusKm) {
                                  isSonarHit = true;
                                  if (sp.date > latestCatchDate) {
                                      latestCatchDate = sp.date;
                                  }
                              }
                          });
                      }

                      if (spotHref) {
                          fishSpotLinks.push({
                              prefName: prefNameJP,
                              spotName: spot.name,
                              href: spotHref,
                              isSonarHit: isSonarHit,
                              latestCatchDate: latestCatchDate
                          });
                      }
                  }
              });
          }
      });

      window._articleAllZoomSpots = allZoomSpots;

      // ★ 記事内の .sns-nearest-spots コンテナを自動検出してカードを生成
      //    data-count: 連続表示件数（デフォルト 1）
      //    data-index: ◯件目を単品表示（指定時はその順位の1件のみ描画）
      //    data-max-km: 最大距離km（デフォルト 15）
      document.querySelectorAll('.sns-nearest-spots').forEach(el => {
          const countAttr = el.getAttribute('data-count');
          const indexAttr = el.getAttribute('data-index');
          const maxKmAttr = el.getAttribute('data-max-km');
          const count = countAttr != null && countAttr !== '' ? Number(countAttr) : 1;
          const targetIdx = indexAttr != null && indexAttr !== '' ? Number(indexAttr) : null;
          const maxKm = maxKmAttr != null && maxKmAttr !== '' ? Number(maxKmAttr) : 15;
          window.renderSnsNearestSpotCards(el, count, targetIdx, maxKm);
      });

      displaySonarPoints.forEach(sp => {
          L.marker([sp.lat, sp.lng], {
              icon: sonarIcon,
              pane: 'sonarPane',
              interactive: false
          }).addTo(map);
          bounds.extend([sp.lat, sp.lng]);
      });

      if (displaySonarPoints.length > 0 && mapContainer) {
          const banner = document.createElement('div');
          banner.className = 'sonar-status-banner';
          const countText = allMatchedCatchPoints.length > displaySonarPoints.length
            ? `直近の釣果反応（計${totalCatchReports}件）から主要 <strong>${displaySonarPoints.length}エリア</strong> をソナー表示中！`
            : `直近の釣果反応を <strong>${displaySonarPoints.length}地点</strong> でキャッチ！`;

          banner.innerHTML = `
            <span class="sonar-status-dot"></span>
            <span>SONAR ACTIVE：${countText}下の「📡釣果反応」から詳細マップへ飛べます</span>
          `;
          mapContainer.parentNode.insertBefore(banner, mapContainer);
      }
      
      if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [15, 15] });
          map.setZoom(map.getZoom() + 0.5);
      }

      const listContainer = document.getElementById('fish-spot-list');
      if (listContainer && fishSpotLinks.length > 0) {
          const groupedLinks = {};
          fishSpotLinks.forEach(link => {
              if (!groupedLinks[link.prefName]) {
                  groupedLinks[link.prefName] = [];
              }
              groupedLinks[link.prefName].push(link);
          });

          for (const [pref, links] of Object.entries(groupedLinks)) {
              links.sort((a, b) => (b.isSonarHit ? 1 : 0) - (a.isSonarHit ? 1 : 0));

              const heading = document.createElement('h4');
              heading.className = 'pref-link-heading';
              heading.textContent = pref;
              listContainer.appendChild(heading);

              const ul = document.createElement('ul');
              ul.style.listStyleType = 'none';
              ul.style.paddingLeft = '0';
              ul.style.display = 'flex';
              ul.style.flexWrap = 'wrap';
              ul.style.gap = '8px';
              ul.style.margin = '0 0 15px 0';

              links.forEach(link => {
                  const li = document.createElement('li');
                  li.className = link.isSonarHit ? 'spot-link-item sonar-hit' : 'spot-link-item';
                  const badgeHtml = link.isSonarHit
                      ? `<span class="sonar-badge">📡釣果反応</span>`
                      : '';
                  li.innerHTML = `<a href="${link.href}" title="${link.prefName} ${link.spotName}の釣り場と天気・潮汐情報を見る">${badgeHtml}${link.spotName}</a>`;
                  ul.appendChild(li);
              });
              
              listContainer.appendChild(ul);
          }
      }
      
    } catch (e) {
      console.error(`${targetFishStr}スポットマップの展開エラー:`, e);
    }
  }

  loadFishSpots();
});
