// =========================================
// fish_article.js
// 魚種生息マップ生成＆ソナーレーダー演出＆リンク自動構築スクリプト
// =========================================

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

// ★ 正規化ヘルパー（「セイゴ（マルスズキ）」などのカッコを除去して辞書変換）
function normalizeFishName(rawName) {
    if (!rawName) return "";
    const cleaned = String(rawName).replace(/（.*?）|\(.*?\)/g, '').trim();
    return FISH_DICTIONARY[cleaned] || cleaned;
}

// ★ 2点間の距離（km）を計算（ソナー圏内のスポット判定用）
function calcDistanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ★ ソナーレーダー＆ハイライト用のCSSを自動注入
function injectSonarStyles() {
    if (document.getElementById('sonar-radar-styles')) return;
    const style = document.createElement('style');
    style.id = 'sonar-radar-styles';
    style.textContent = `
        /* ソナーマーカー全体 */
        .sonar-marker-wrapper {
            background: transparent;
            border: none;
            pointer-events: none;
        }
        .sonar-emitter {
            position: relative;
            width: 64px;
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        /* 中心の輝点 */
        .sonar-core {
            width: 6px;
            height: 6px;
            background-color: #00ffcc;
            border-radius: 50%;
            box-shadow: 0 0 8px #00ffcc, 0 0 14px #00ffcc;
            z-index: 3;
        }
        /* 広がるソナー波紋（3重リング） */
        .sonar-wave {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 8px;
            height: 8px;
            transform: translate(-50%, -50%);
            border-radius: 50%;
            border: 1.5px solid rgba(0, 255, 204, 0.9);
            background: radial-gradient(circle, rgba(0, 255, 204, 0.28) 0%, rgba(0, 255, 204, 0) 70%);
            box-shadow: 0 0 8px rgba(0, 255, 204, 0.5);
            opacity: 0;
            animation: sonar-ping 3.2s cubic-bezier(0.1, 0.4, 0.3, 1) infinite;
        }
        .sonar-wave.delay-1 { animation-delay: 1.06s; }
        .sonar-wave.delay-2 { animation-delay: 2.12s; }

        /* 回転するレーダースイープ（潜水艦計器風の走査線） */
        .sonar-sweep {
            position: absolute;
            top: 4px;
            left: 4px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: conic-gradient(from 0deg, rgba(0, 255, 204, 0) 0deg, rgba(0, 255, 204, 0.02) 260deg, rgba(0, 255, 204, 0.45) 360deg);
            animation: sonar-rotate 4s linear infinite;
            border: 1px dashed rgba(0, 255, 204, 0.35);
            box-sizing: border-box;
        }

        @keyframes sonar-ping {
            0% {
                width: 6px;
                height: 6px;
                opacity: 1;
            }
            100% {
                width: 64px;
                height: 64px;
                opacity: 0;
            }
        }
        @keyframes sonar-rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        /* マップ上部のソナー稼働ステータスバー */
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

        /* ソナー圏内スポットリンクの特別強調スタイル */
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

document.addEventListener("DOMContentLoaded", function () {
  injectSonarStyles();
  
  // HTML側で定義されたグローバル変数を読み込み（未定義時のフォールバックも設定）
  const targetFishStr = window.TARGET_FISH || '対象魚';
  const targetRegionCode = window.TARGET_REGION_CODE || 'KANTO';
  const targetRegionNameJP = window.TARGET_REGION_NAME_JP || '関東地方';

  // ★ 複数検索対応＆辞書正規化: カンマで分割して配列化
  const targetFishArray = targetFishStr
    .split(',')
    .map(f => normalizeFishName(f))
    .filter(Boolean);

  // ★ 見出しの「対象魚」バグ自動補正（HTML側のスクリプト実行順による表示漏れをカバー）
  const mapContainer = document.getElementById('fish-map');
  if (mapContainer) {
    mapContainer.setAttribute('aria-label', `${targetRegionNameJP}の${targetFishStr}釣果スポット分布マップ`);
    const parentSection = mapContainer.closest('section');
    if (parentSection) {
      const h3 = parentSection.querySelector('h3');
      if (h3 && h3.textContent.includes('対象魚') && targetFishStr !== '対象魚') {
        h3.textContent = h3.textContent.replace('対象魚', targetFishStr);
      }
    }
  }

  // ★ 汎用化: fish-map
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

  // ★ 通常の生息ドット（赤）とソナーアイコン（エメラルドグリーン）のPane分け（ソナーを最前面に）
  map.createPane('sonarPane');
  map.getPane('sonarPane').style.zIndex = 650;

  const dotIcon = L.divIcon({
    className: 'fish-dot-marker',
    html: '',
    iconSize: [3, 3],
    iconAnchor: [1.5, 1.5]
  });

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
    iconSize: [64, 64],
    iconAnchor: [32, 32]
  });

  async function loadFishSpots() {
    const regionUrl = `../${targetRegionCode}/${targetRegionCode}_region.csv`;
    const compiledDataUrl = `../data/compiled_data.json`;

    try {
      // ★ Region CSV と compiled_data.json を並列取得
      const [res, compiledRes] = await Promise.all([
        fetch(regionUrl),
        fetch(compiledDataUrl).catch(() => null)
      ]);

      if (!res.ok) throw new Error("Region CSV fetch failed");
      
      // 1. compiled_data.json から対象魚種の釣果座標（ソナー発信源）を抽出
      const sonarPoints = [];
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
            // 小数点第3位で丸めて同一ポイントの重複ソナーを統合
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
        sonarPoints.push(...uniqueCoords.values());
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

                      if (spot.lat && spot.lng) {
                          const sLat = Number(spot.lat);
                          const sLng = Number(spot.lng);
                          L.marker([sLat, sLng], { icon: dotIcon }).addTo(map);
                          bounds.extend([sLat, sLng]);

                          // ★ ソナー発信源から半径6km以内にあるスポットを「ソナー反応あり」と判定
                          sonarPoints.forEach(sp => {
                              if (calcDistanceKm(sLat, sLng, sp.lat, sp.lng) <= 6.0) {
                                  isSonarHit = true;
                                  if (sp.date > latestCatchDate) {
                                      latestCatchDate = sp.date;
                                  }
                              }
                          });
                      }

                      const spotAreaIdStr = String(spot.areaId || '');
                      const areaIndividualId = spotAreaIdStr.replace(`${prefCode}_`, '');
                      const areaNameJP = areaDict[areaIndividualId] || '';

                      if (areaNameJP) {
                          const href = `https://turiiko-navi.com/?region=${encodeURIComponent(targetRegionNameJP)}&pref=${encodeURIComponent(prefNameJP)}&area=${encodeURIComponent(areaNameJP)}&spot=${encodeURIComponent(spot.name)}`;
                          fishSpotLinks.push({
                              prefName: prefNameJP,
                              spotName: spot.name,
                              href: href,
                              isSonarHit: isSonarHit,
                              latestCatchDate: latestCatchDate
                          });
                      }
                  }
              });
          }
      });

      // 3. ソナーレーダーをマップに描画
      sonarPoints.forEach(sp => {
          L.marker([sp.lat, sp.lng], {
              icon: sonarIcon,
              pane: 'sonarPane',
              interactive: false
          }).addTo(map);
          bounds.extend([sp.lat, sp.lng]);
      });

      // ソナー反応がある場合、マップ直上に潜水艦ソナー風のステータスバーを表示
      if (sonarPoints.length > 0 && mapContainer) {
          const banner = document.createElement('div');
          banner.className = 'sonar-status-banner';
          banner.innerHTML = `
            <span class="sonar-status-dot"></span>
            <span>SONAR ACTIVE：直近の釣果反応を <strong>${sonarPoints.length}地点</strong> でキャッチ！下の「🔥釣果反応」リンクから詳細マップへ飛べます</span>
          `;
          mapContainer.parentNode.insertBefore(banner, mapContainer);
      }
      
      if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [15, 15] });
          map.setZoom(map.getZoom() + 0.5);
      }

      // 4. スポットリストの描画（ソナー反応があるスポットを各都道府県の先頭に浮上＆強調）
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
              // ソナー反応ありを先頭にソート
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
