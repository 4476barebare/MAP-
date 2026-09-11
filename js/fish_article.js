// =========================================
// fish_article.js
// 魚種生息マップ生成＆リンク自動構築スクリプト (汎用版)
// =========================================

document.addEventListener("DOMContentLoaded", function () {
  
  // HTML側で定義されたグローバル変数を読み込み（未定義時のフォールバックも設定）
  const targetFish = window.TARGET_FISH || '対象魚';
  const targetRegionCode = window.TARGET_REGION_CODE || 'KANTO';
  const targetRegionNameJP = window.TARGET_REGION_NAME_JP || '関東地方';

  // ★ 汎用化: fish-map
  const mapContainer = document.getElementById('fish-map');
  if (mapContainer) {
    mapContainer.setAttribute('aria-label', `${targetRegionNameJP}の${targetFish}釣果スポット分布マップ`);
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
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>'
  }).addTo(map);

  // ★ 汎用化: fish-dot-marker
  const dotIcon = L.divIcon({
    className: 'fish-dot-marker',
    html: '',
    iconSize: [3, 3],
    iconAnchor: [1.5, 1.5]
  });

  async function loadFishSpots() {
    const regionUrl = `../${targetRegionCode}/${targetRegionCode}_region.csv`;

    try {
      const res = await fetch(regionUrl);
      if (!res.ok) throw new Error("Region CSV fetch failed");
      
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
                  
                  const locStr = (spot.URL || '') + (spot.notes || '') + (spot.name || '');
                  const fStr = fishMap[spot.name] || fishMap[spot.individualId] || '';
                  const searchStr = locStr + fStr;
                  
                  if (searchStr.includes(targetFish)) {
                      if (spot.lat && spot.lng) {
                          L.marker([spot.lat, spot.lng], { icon: dotIcon }).addTo(map);
                          bounds.extend([spot.lat, spot.lng]);
                      }

                      const spotAreaIdStr = String(spot.areaId || '');
                      const areaIndividualId = spotAreaIdStr.replace(`${prefCode}_`, '');
                      const areaNameJP = areaDict[areaIndividualId] || '';

                      if (areaNameJP) {
                          const href = `https://turiiko-navi.com/?region=${encodeURIComponent(targetRegionNameJP)}&pref=${encodeURIComponent(prefNameJP)}&area=${encodeURIComponent(areaNameJP)}&spot=${encodeURIComponent(spot.name)}`;
                          fishSpotLinks.push({
                              prefName: prefNameJP,
                              spotName: spot.name,
                              href: href
                          });
                      }
                  }
              });
          }
      });
      
      if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [10, 10] });
          map.setZoom(map.getZoom() + 0.5);
      }

      // ★ 汎用化: fish-spot-list
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
                  li.className = 'spot-link-item';
                  li.innerHTML = `<a href="${link.href}" title="${link.prefName} ${link.spotName}の釣り場と天気・潮汐情報を見る">${link.spotName}</a>`;
                  ul.appendChild(li);
              });
              
              listContainer.appendChild(ul);
          }
      }
      
    } catch (e) {
      console.error(`${targetFish}スポットマップの展開エラー:`, e);
    }
  }

  loadFishSpots();
});
