document.addEventListener('DOMContentLoaded', () => {

  const mapDiv = document.getElementById('map');
  mapDiv.style.position = 'relative';
  mapDiv.style.zIndex = '50';

  // ★追加: ログ取得
  const logDiv = document.getElementById('log-panel');

  // ★追加: ログ関数
  function addLog(text){
    if(!logDiv) return;
    const line = document.createElement('div');
    line.textContent = text;
    logDiv.appendChild(line);
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {

      mapDiv.innerHTML = svgText;

      const svg = mapDiv.querySelector('svg');
      const prefGroup = svg.querySelector('#pref');

      svg.style.shapeRendering = 'geometricPrecision';
      svg.style.transformOrigin = 'center center';

      let currentGroup = null;
      
const REGION_DB = {
  Path_2: {
    transform: { scale: 6.7, x: 135, y: 45 },
    hash: 'TOHOKU',
    boxes: {
      leftTop: ['AOMORI', 'AKITA', 'YAMAGATA', 'NIIGATA'],
      rightBottom: ['IWATE', 'MIYAGI', 'FUKUSHIMA']
    }
  },
  Path_3: {
    transform: { scale: 15, x: 92, y: 95 },
    hash: 'KANTO',
    boxes: {
      rightTop: ['GUNMA', 'TOCHIGI', 'IBARAKI'],
      leftBottom: ['SAITAMA', 'TOKYO', 'KANAGAWA', 'CHIBA']
    }
  },
  Path_4: {
    transform: { scale: 10.2, x: 54, y: 110 },
    hash: 'CHUBU',
    boxes: {
      rightTop: ['TOYAMA', 'ISHIKAWA', 'NAGANO', 'YAMANASHI'],
      leftBottom: ['FUKUI', 'GIFU', 'AICHI', 'SHIZUOKA']
    }
  },
  Path_5: {
    transform: { scale: 13.6, x: 0, y: 140 },
    hash: 'KINKI',
    boxes: {
      rightTop: ['SHIGA', 'KYOTO'],
      leftBottom: ['HYOGO', 'OSAKA', 'WAKAYAMA', 'NARA', 'MIE']
    }
  },
  Path_6: {
    transform: { scale: 9.5, x: -51, y: 165 },
    hash: 'CHUGOKU',
    boxes: {
      top: ['SHIMANE', 'HIROSHIMA', 'TOTTORI', 'OKAYAMA'],
      top2: ['YAMAGUCHI'],
      bottom: ['EHIME', 'KOCHI', 'KAGAWA', 'TOKUSHIMA']
    }
  },
  Path_7: {
    transform: { scale: 11.2, x: -105, y: 200 },
    hash: 'KYUSHU',
    boxes: {
      rightTop: ['FUKUOKA', 'SAGA', 'NAGASAKI'],
      rightBottom: ['OITA', 'KUMAMOTO', 'MIYAZAKI', 'KAGOSHIMA']
    }
  }
};

const groupSettings = {};
Object.keys(REGION_DB).forEach(gid => {
  groupSettings[gid] = {
    ...REGION_DB[gid].transform,
    hash: REGION_DB[gid].hash
  };
});

const groupBoxSettings = {};
Object.keys(REGION_DB).forEach(gid => {
  groupBoxSettings[gid] = REGION_DB[gid].boxes;
});

const groupToPrefectures = {};
Object.keys(groupBoxSettings).forEach(gid => {
  groupToPrefectures[gid] = Object.values(groupBoxSettings[gid]).flat();
}); 

      const prefNames = {
        AOMORI:'青森県', IWATE:'岩手県', AKITA:'秋田県',
        MIYAGI:'宮城県', YAMAGATA:'山形県', FUKUSHIMA:'福島県',
        NIIGATA:'新潟県', GUNMA:'群馬県', TOCHIGI:'栃木県', CHIBA:'千葉県',
        IBARAKI:'茨城県', TOKYO:'東京都', SAITAMA:'埼玉県', KANAGAWA:'神奈川県',
        SHIZUOKA:'静岡県', YAMANASHI:'山梨県', NAGANO:'長野県',
        ISHIKAWA:'石川県', TOYAMA:'富山県', FUKUI:'福井県',
        GIFU:'岐阜県', AICHI:'愛知県',
        MIE:'三重県', NARA:'奈良県', WAKAYAMA:'和歌山県',
        OSAKA:'大阪府', SHIGA:'滋賀県', KYOTO:'京都府', HYOGO:'兵庫県',
        TOTTORI:'鳥取県', SHIMANE:'島根県', OKAYAMA:'岡山県', HIROSHIMA:'広島県', YAMAGUCHI:'山口県',
        TOKUSHIMA:'徳島県', KAGAWA:'香川県', KOCHI:'高知県', EHIME:'愛媛県',
        FUKUOKA:'福岡県', SAGA:'佐賀県', NAGASAKI:'長崎県',
        OITA:'大分県', KUMAMOTO:'熊本県', MIYAZAKI:'宮崎県', KAGOSHIMA:'鹿児島県'
      };

      

let leafletBackgroundMap = null;

// =========================
// 前半：レイアウト構築 + ログ確認
// =========================
function prepareLeafletBackground(prefId) {
    const mapDiv = document.getElementById('map');
    const lfDiv = document.getElementById('lf-map');
    const containerDiv = document.getElementById('map-container');

    if (!mapDiv || !lfDiv || !containerDiv) {
        addLog('必要な要素が見つからない');
        return;
    }

    addLog('prefId 受け取り: ' + prefId);

    const LF_SIZE = 512;
    const MAP_HEIGHT = 420;

    // --- container（外枠） ---
    containerDiv.style.position = 'relative';
    containerDiv.style.width = '100%';
    containerDiv.style.height = MAP_HEIGHT + 'px';
    containerDiv.style.overflow = 'hidden';

    // --- lf-map（背景） ---
    lfDiv.style.position = 'absolute';
    lfDiv.style.width = LF_SIZE + 'px';
    lfDiv.style.height = LF_SIZE + 'px';
    lfDiv.style.left = '0';
    lfDiv.style.top = '0';
    lfDiv.style.zIndex = '0';
    lfDiv.style.background = 'transparent';
    lfDiv.style.transform = 'none';

    // --- map（前面フレーム） ---
    while (mapDiv.firstChild) mapDiv.removeChild(mapDiv.firstChild);
    mapDiv.style.position = 'absolute';
    mapDiv.style.top = '0';
    mapDiv.style.left = '0';
    mapDiv.style.width = '100%';
    mapDiv.style.height = MAP_HEIGHT + 'px';
    mapDiv.style.background = 'transparent';
    mapDiv.style.zIndex = '50';

    // --- ログ出力（サイズ確認） ---
    addLog('前半終了時のサイズ確認');
    addLog('lf-map offsetWidth: ' + lfDiv.offsetWidth);
    addLog('lf-map offsetHeight: ' + lfDiv.offsetHeight);
    addLog('container offsetTop: ' + containerDiv.offsetTop);
    addLog('container offsetLeft: ' + containerDiv.offsetLeft);
    addLog('container clientWidth: ' + containerDiv.clientWidth);
    addLog('container clientHeight: ' + containerDiv.clientHeight);

    // --- 既存 Leaflet 削除 ---
    if (leafletBackgroundMap) {
        leafletBackgroundMap.remove();
        leafletBackgroundMap = null;
        addLog('既存 Leaflet 削除');
    }

    // --- 後半（Leaflet初期化）発火 ---
    requestAnimationFrame(() => {
        startLeafletBackground(prefId);
    });
}
// =========================
// 後半：Leaflet初期化
// =========================
function startLeafletBackground(prefId) {
    const lfDiv = document.getElementById('lf-map');
    if (!lfDiv) {
        addLog('lf-map が存在しない');
        return;
    }

    // --- Leaflet初期化 ---
    leafletBackgroundMap = L.map(lfDiv, {
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false,
        attributionControl: false,
        preferCanvas: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
        .addTo(leafletBackgroundMap);

    // --- 中心位置 ---
    const prefBounds = {
        CHIBA: [
            [35.15, 140.10],
            [35.95, 140.40]
        ]
    };

    let centerLatLng = [35.5, 140.25];
    const zoomLevel = 10;

    if (prefId && prefBounds[prefId]) {
        centerLatLng = [
            (prefBounds[prefId][0][0] + prefBounds[prefId][1][0]) / 2,
            (prefBounds[prefId][0][1] + prefBounds[prefId][1][1]) / 2
        ];
    }

    leafletBackgroundMap.setView(centerLatLng, zoomLevel);

    // --- サイズログ ---
    addLog('最終 lf-map offsetWidth: ' + lfDiv.offsetWidth);
    addLog('最終 lf-map offsetHeight: ' + lfDiv.offsetHeight);
    addLog('親 container offsetTop: ' + containerDiv.offsetTop);
    addLog('親 container offsetLeft: ' + containerDiv.offsetLeft);
    addLog('親 container clientWidth: ' + containerDiv.clientWidth);
    addLog('親 container clientHeight: ' + containerDiv.clientHeight);

    // --- タイルズレ防止 ---
    setTimeout(() => {
        leafletBackgroundMap.invalidateSize(true);
        addLog('Leaflet invalidateSize() 実行');
        addLog('最終 lf-map offsetWidth: ' + lfDiv.offsetWidth);
        addLog('最終 lf-map offsetHeight: ' + lfDiv.offsetHeight);
        addLog('Leaflet 完全初期化完了');
    }, 50);
}