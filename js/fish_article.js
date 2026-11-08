// =========================================
// fish_article.js
// 魚種生息マップ生成＆ソナーレーダー演出（compiled_data + SNSソナー重畳）＆SNS最新釣果スポットカード＆リンク自動構築スクリプト
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

// ==========================================
// ★ markerControl.js 流用：SNSソナー用の経過日数スケール・SNSクラス判定・アイコン生成
// ==========================================
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

function getSnsColorClass(source) {
    const s = String(source || '').toLowerCase();
    if (s.includes('instagram')) return 'sns-instagram';
    if (s === 'x' || s.includes('twitter')) return 'sns-x';
    if (s.includes('facebook')) return 'sns-facebook';
    if (s.includes('threads')) return 'sns-threads';
    return 'sns-default';
}

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

    const targetZoom = isSpecial ? 14 : (rawZoom < 14 ? 14 : rawZoom);
    const fetchZoom = Math.min(18, Math.ceil(targetZoom));

    const n = Math.pow(2, fetchZoom);
    const exactX = (lng + 180) / 360 * n;
    const latRad = lat * Math.PI / 180;
    const exactY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;

    const tileX = Math.floor(exactX);
    const tileY = Math.floor(exactY);

    const offsetXPercent = Math.round((exactX - tileX) * 100);
    const offsetYPercent = Math.round((exactY - tileY) * 100);

    const baseUrl = baseTileUrl.replace('{z}', fetchZoom);
    const thumbUrl = baseUrl.replace('{x}', tileX).replace('{y}', tileY);

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

// ★ マップ上のソナーレーダー用のCSSを自動注入
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
    `;
    document.head.appendChild(style);
}

// ==========================================
// ★ SNS最新釣果から最寄りスポットカードを生成する関数
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

    const countLimit = singleIdx ? singleIdx : Math.max(1, Number(maxCount) || 1);
    const distLimitKm = Math.max(0.1, Number(maxDistKm) || 15);

    const spots = window._articleAllZoomSpots || [];
    const snsList = window._articleSnsCatches || [];
    const targetFishArray = window._articleTargetFishArray || [];

    if (spots.length === 0 || snsList.length === 0 || targetFishArray.length === 0) {
        container.innerHTML = '';
        return;
    }

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

    const displayCards = singleIdx
        ? (selectedCards[singleIdx - 1] ? [selectedCards[singleIdx - 1]] : [])
        : selectedCards;

    if (displayCards.length === 0) {
        container.innerHTML = '';
        return;
    }

    displayCards.forEach(card => {
        (card.preloadUrls || []).forEach(u => {
            if (!window._preloadedArticleTiles.has(u)) {
                window._preloadedArticleTiles.add(u);
                const img = new Image();
                img.src = u;
            }
        });
    });

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
<div class="sns-spot-wrap">
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

    // 見出し：既定は「最近の釣果情報」。data-heading="任意の文言" で変更、data-heading="none" で非表示
    const headingAttr = container.getAttribute('data-heading');
    const headingText = headingAttr === null ? '🎣 最近の釣果情報' : String(headingAttr).trim();
    const safeHeading = headingText.replace(/[<>&"']/g, '');
    const headingHtml = safeHeading && safeHeading !== 'none'
        ? `<h3 class="sns-heading">${safeHeading}</h3>`
        : '';

    container.innerHTML = headingHtml + cardsHtml;
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

  // 既存ソナーPane（背面: 650）と SNSソナーPane（前面: 655）を重ねて配置
  map.createPane('sonarPane');
  map.getPane('sonarPane').style.zIndex = 650;
  map.getPane('sonarPane').style.pointerEvents = 'none';

  map.createPane('snsSonarPane');
  map.getPane('snsSonarPane').style.zIndex = 655;
  map.getPane('snsSonarPane').style.pointerEvents = 'none';

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
      
      // 1-A. compiled_data.json から対象魚種の既存ソナー座標を抽出
      const allMatchedCatchPoints = [];
      const displaySonarPoints = [];

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

      // 1-B. SNSデータから対象魚種のSNSソナーを抽出
      const snsUniqueCoords = new Map();
      window._articleSnsCatches.forEach(item => {
        if (!item || !item.lat || !item.lng || !item.fish) return;
        if (!isTargetFishMatched(item.fish, targetFishArray)) return;

        const key = `${Number(item.lat).toFixed(3)}_${Number(item.lng).toFixed(3)}`;
        const existing = snsUniqueCoords.get(key);
        const itemDate = String(item.date || '');

        if (!existing) {
          snsUniqueCoords.set(key, {
            lat: Number(item.lat),
            lng: Number(item.lng),
            date: itemDate,
            fish: item.fish || '',
            source: item.source || 'SNS',
            count: 1
          });
        } else {
          existing.count += 1;
          if (itemDate >= existing.date) {
            existing.date = itemDate;
            if (item.fish) existing.fish = item.fish;
            if (item.source) existing.source = item.source;
          }
        }
      });

      const sortedSnsCandidates = [...snsUniqueCoords.values()].sort((a, b) => {
        const scaleA = getSonarAgeScale(a.date);
        const scaleB = getSonarAgeScale(b.date);
        if (scaleB !== scaleA) return scaleB - scaleA;
        if (b.count !== a.count) return b.count - a.count;
        return b.date.localeCompare(a.date);
      });

      const displaySnsSonarPoints = [];
      for (const candidate of sortedSnsCandidates) {
        if (displaySnsSonarPoints.length >= sonarSettings.maxSonars) break;
        const isTooClose = displaySnsSonarPoints.some(
          selected => calcDistanceKm(candidate.lat, candidate.lng, selected.lat, selected.lng) < sonarSettings.minDistanceKm
        );
        if (!isTooClose) {
          displaySnsSonarPoints.push(candidate);
        }
      }

      // 2. 各都道府県のスポットデータを取得
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
          if (pCode && !prefCodes.includes(pCode)) {
            prefCodes.push(pCode);
          }
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
                  // JSONのparent行のnotes（例: "茨城県栃木県"）をそのまま取得
                  if ((s.name === prefCode || s.individualId === 'parent') && s.individualId === 'parent' && s.notes) {
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
                  if (spot.type === 'pref' || spot.type === 'area' || spot.individualId === 'parent') return;

                  const sLat = Number(spot.lat);
                  const sLng = Number(spot.lng);
                  const hasValidCoord = Number.isFinite(sLat) && Number.isFinite(sLng);

                  const spotAreaIdStr = String(spot.areaId || '');
                  const areaIndividualId = spotAreaIdStr.replace(`${prefCode}_`, '');
                  const areaNameJP = areaDict[areaIndividualId] || '';

                  // JSONから取得した prefNameJP（"茨城県栃木県" 等）をそのままURL・見出し・カードに使用
                  const spotHref = areaNameJP
                      ? `https://turiiko-navi.com/?region=${encodeURIComponent(targetRegionNameJP)}&pref=${encodeURIComponent(prefNameJP)}&area=${encodeURIComponent(areaNameJP)}&spot=${encodeURIComponent(spot.name)}`
                      : '';

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
                      if (hasValidCoord) {
                          L.marker([sLat, sLng], { icon: dotIcon }).addTo(map);
                          bounds.extend([sLat, sLng]);
                      }

                      if (spotHref) {
                          fishSpotLinks.push({
                              prefName: prefNameJP,
                              spotName: spot.name,
                              href: spotHref
                          });
                      }
                  }
              });
          }
      });

      window._articleAllZoomSpots = allZoomSpots;

      document.querySelectorAll('.sns-nearest-spots').forEach(el => {
          const countAttr = el.getAttribute('data-count');
          const indexAttr = el.getAttribute('data-index');
          const maxKmAttr = el.getAttribute('data-max-km');
          const count = countAttr != null && countAttr !== '' ? Number(countAttr) : 1;
          const targetIdx = indexAttr != null && indexAttr !== '' ? Number(indexAttr) : null;
          const maxKm = maxKmAttr != null && maxKmAttr !== '' ? Number(maxKmAttr) : 15;
          window.renderSnsNearestSpotCards(el, count, targetIdx, maxKm);
      });

      // 3-A. 既存ソナーレーダーを描画
      displaySonarPoints.forEach(sp => {
          L.marker([sp.lat, sp.lng], {
              icon: sonarIcon,
              pane: 'sonarPane',
              interactive: false
          }).addTo(map);
          bounds.extend([sp.lat, sp.lng]);
      });

      // 3-B. 既存ソナーの上にSNSデータ由来のソナーを重ねて描画
      const snsBaseSize = 48;
      displaySnsSonarPoints.forEach((pt, idx) => {
          const ageScale = getSonarAgeScale(pt.date);
          const finalSize = Math.max(6, Math.round(snsBaseSize * ageScale * 10) / 10);
          const offsetSec = ((idx * 0.9) % 3.2).toFixed(2);
          const delay2Sec = (Number(offsetSec) + 3.25).toFixed(2);
          const snsClass = getSnsColorClass(pt.source);

          L.marker([pt.lat, pt.lng], {
              icon: createSnsSonarDivIcon(finalSize, snsClass, offsetSec, delay2Sec),
              pane: 'snsSonarPane',
              interactive: false,
              keyboard: false
          }).addTo(map);
          bounds.extend([pt.lat, pt.lng]);
      });
      
      if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [15, 15] });
          map.setZoom(map.getZoom() + 0.5);
      }

      // 4. スポットリストの描画（釣果反応の水色エフェクト廃止・JSONのnotesである「茨城県栃木県」等をそのまま見出しに出力）
      const listContainer = document.getElementById('fish-spot-list');
      if (listContainer && fishSpotLinks.length > 0) {
          listContainer.innerHTML = '';
          const groupedLinks = {};
          fishSpotLinks.forEach(link => {
              if (!groupedLinks[link.prefName]) {
                  groupedLinks[link.prefName] = [];
              }
              groupedLinks[link.prefName].push(link);
          });

          for (const [pref, links] of Object.entries(groupedLinks)) {
              // 県ごとの折りたたみ（最初の1県だけ開いた状態で出力）
              const details = document.createElement('details');
              details.className = 'pref-fold';
              if (!listContainer.querySelector('details')) details.open = true;

              const summary = document.createElement('summary');
              summary.className = 'pref-link-heading';
              const nameSpan = document.createElement('span');
              nameSpan.textContent = pref;
              const countSpan = document.createElement('span');
              countSpan.className = 'pref-count';
              countSpan.textContent = `${links.length}か所`;
              summary.appendChild(nameSpan);
              summary.appendChild(countSpan);
              details.appendChild(summary);

              const ul = document.createElement('ul');
              ul.style.listStyleType = 'none';
              ul.style.paddingLeft = '0';
              ul.style.display = 'flex';
              ul.style.flexWrap = 'wrap';
              ul.style.gap = '8px';
              ul.style.margin = '12px 0 15px 0';

              links.forEach(link => {
                  const li = document.createElement('li');
                  li.className = 'spot-link-item';
                  li.innerHTML = `<a href="${link.href}" title="${link.prefName} ${link.spotName}の釣り場と天気・潮汐情報を見る">${link.spotName}</a>`;
                  ul.appendChild(li);
              });
              
              details.appendChild(ul);
              listContainer.appendChild(details);
          }
      }
      
    } catch (e) {
      console.error(`${targetFishStr}スポットマップの展開エラー:`, e);
    }
  }

  loadFishSpots();
});
