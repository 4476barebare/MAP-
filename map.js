// ==============================
// map.js（倍率固定 + 微調整対応版）
// ==============================

// SVG とグループ・県情報取得
const svg = document.getElementById('japanMap'); // SVG本体のid
const groupLayer = svg.getElementById('Layer_1');
const prefGroup = svg.getElementById('pref'); // 県パスの親要素

// 地域グループと所属県のマッピング
const groupToPrefectures = {
  'Path_1': ['Hokkaido'],
  'Path_2': ['Aomori','Iwate','Akita','Miyagi','Yamagata','Fukushima'],
  'Path_3': ['Niigata','Gunma','Tochigi','Chiba','Ibaraki','Tokyo','Saitama','Kanagawa'],
  'Path_4': ['Shizuoka','Yamanashi','Nagano','Ishikawa','Toyama','Gifu','Aichi'],
  'Path_5': ['Mie','Nara','Wakayama','Osaka','Shiga','Kyoto','Hyogo'],
  'Path_6': ['Tottori','Shimane','Okayama','Hiroshima','Yamaguchi','Tokushima','Kagawa','Kochi','Ehime'],
  'Path_7': ['Fukuoka','Saga','Nagasaki','Oita','Kumamoto','Miyazaki','Kagoshima'],
  'Path_8': ['Okinawa']
};

// =====================================
// 後から微調整可能なオフセット（初期は0、必要に応じて編集）
// =====================================
const groupOffsets = {
  'Path_1': { x:0, y:0 },
  'Path_2': { x:0, y:0 },
  'Path_3': { x:0, y:0 },
  'Path_4': { x:0, y:0 },
  'Path_5': { x:0, y:0 },
  'Path_6': { x:0, y:0 },
  'Path_7': { x:0, y:0 },
  'Path_8': { x:0, y:0 },
};

// =====================================
// グループごとの倍率リスト（固定）
// =====================================
const groupScales = {
  'Path_1': 3,
  'Path_2': 4,
  'Path_3': 4.5,
  'Path_4': 5,
  'Path_5': 6,
  'Path_6': 5,
  'Path_7': 6,
  'Path_8': 6
};

// =====================================
// 地域グループクリック処理
// =====================================
Object.keys(groupToPrefectures).forEach(gid => {
  const group = svg.getElementById(gid);
  if (!group) return;

  group.addEventListener('click', () => {

    // 1. 全地域グループ非表示
    Object.keys(groupToPrefectures).forEach(gid2 => {
      const g2 = svg.getElementById(gid2);
      if (g2) g2.style.display = 'none';
    });

    // 2. 全県非表示
    prefGroup.querySelectorAll('path').forEach(p => p.style.display = 'none');

    // 3. 対象県のみ表示
    groupToPrefectures[gid].forEach(pid => {
      const p = prefGroup.querySelector(`#${pid}`);
      if (p) p.style.display = '';
    });

    // 4. 県クリックイベント（1回だけ）
    groupToPrefectures[gid].forEach(pid => {
      const p = prefGroup.querySelector(`#${pid}`);
      if (p && !p.dataset.eventAttached) {
        p.addEventListener('click', () => {
          alert(`県クリック: ${pid}`);
        });
        p.dataset.eventAttached = 'true';
      }
    });

    // ======================================
    // 拡大表示（固定倍率 + 微調整オフセット）
    // ======================================
    const scale = groupScales[gid] || 3; // デフォルト3倍
    const bbox = group.getBBox();
    let cx = bbox.x + bbox.width/2;
    let cy = bbox.y + bbox.height/2;

    // オフセット補正
    if (groupOffsets[gid]) {
      cx += groupOffsets[gid].x;
      cy += groupOffsets[gid].y;
    }

    const svgWidth = svg.viewBox.baseVal.width;
    const svgHeight = svg.viewBox.baseVal.height;
    const translateX = svgWidth/2 - cx*scale;
    const translateY = svgHeight/2 - cy*scale;

    svg.style.transition = 'transform 0.5s ease';
    svg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  });
});

// ======================================
// 初期表示
// ======================================
Object.keys(groupToPrefectures).forEach(gid => {
  const group = svg.getElementById(gid);
  if (group) {
    group.style.display = '';       // 初期表示
    group.style.fill = '#191970';   // ヘッダーロゴ色
    group.style.stroke = '#fff';    // 枠線白
    group.style.strokeWidth = '4';  // 太め
  }
});

// 県パスは初期非表示
prefGroup.querySelectorAll('path').forEach(p => p.style.display='none');