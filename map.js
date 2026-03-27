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
    addLog('前半lf-map offsetWidth: ' + lfDiv.offsetWidth);
    addLog('前半lf-map offsetHeight: ' + lfDiv.offsetHeight);
    addLog('前半container offsetTop: ' + containerDiv.offsetTop);
    addLog('前半container offsetLeft: ' + containerDiv.offsetLeft);
    addLog('前半container clientWidth: ' + containerDiv.clientWidth);
    addLog('前半container clientHeight: ' + containerDiv.clientHeight);

    // --- 既存 Leaflet 削除 ---
    if (leafletBackgroundMap) {
        leafletBackgroundMap.remove();
        leafletBackgroundMap = null;
        addLog('既存 Leaflet 削除');
    }

    
    lfDiv.style.width = '512px';
lfDiv.style.height = '512px';
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
        .addTo(lf-map);

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


      // ★Pref 選択時
      function gotoPref(prefId){
        updateHash(prefId,2);
        addLog('pref clicked: ' + prefId);

        // prefId をそのまま渡す
        prepareLeafletBackground(prefId);

      }


      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'inline';
        p.classList.remove('prefecture-selected','prefecture-unselected');
        p.classList.add('prefecture-initial');
      });

      const allGroups = svg.querySelectorAll('[id^="Path_"]');

      allGroups.forEach(g => {
        const gid = g.id;
        if (groupSettings[gid]) {
          g.style.cursor = 'pointer';
          g.addEventListener('click', () => showRegion(gid));
        }
      });

      const initialNav = createInitialNav();
      const topDummy = createTopDummy();
      const top2Dummy = createTop2Dummy();
      const bottomDummy = createBottomDummy();
      const leftTopDummy = createCornerDummy('leftTop');
      const rightBottomDummy = createCornerDummy('rightBottom');
      const leftBottomDummy = createCornerDummy('leftBottom');
      const rightTopDummy = createCornerDummy('rightTop');

      function hideAllBoxes() {
        [topDummy,top2Dummy,bottomDummy,leftTopDummy,rightBottomDummy,leftBottomDummy,rightTopDummy]
        .forEach(wrapper=>{
          wrapper.style.display='none';
          Array.from(wrapper.querySelectorAll('div')).forEach(c=>{
            c.style.display='none';
            c.textContent='';
          });
        });
      }

      function showBoxes(gid){
        const setting = groupBoxSettings[gid];
        if(!setting) return;

        Object.keys(setting).forEach(pos=>{
          let wrapper;

          if(pos==='top')wrapper=topDummy;
          if(pos==='top2')wrapper=top2Dummy;
          if(pos==='bottom')wrapper=bottomDummy;
          if(pos==='leftTop')wrapper=leftTopDummy;
          if(pos==='rightBottom')wrapper=rightBottomDummy;
          if(pos==='leftBottom')wrapper=leftBottomDummy;
          if(pos==='rightTop')wrapper=rightTopDummy;

          if(!wrapper) return;

          wrapper.style.display='flex';

          setting[pos].forEach((pid,i)=>{
            const box=wrapper.children[i];
            if(box){
              box.style.display='flex';
              box.textContent=prefNames[pid];
            }
          });
        });
      }

      function showRegion(gid){

        currentGroup=gid;

        initialNav.style.display='none';
        hideAllBoxes();
        showBoxes(gid);

        allGroups.forEach(g=>g.style.display='none');

        prefGroup.querySelectorAll('path').forEach(p=>{
          if(groupToPrefectures[gid].includes(p.id)){
            p.style.display='inline';
            p.classList.remove('prefecture-initial','prefecture-unselected');
            p.classList.add('prefecture-selected');

            p.onclick=e=>{
              e.stopPropagation();
              gotoPref(p.id);
            };
          }else{
            p.style.display='inline';
            p.classList.remove('prefecture-initial','prefecture-selected');
            p.classList.add('prefecture-unselected');
          }
        });

        applyTransform(gid);
        disableOtherAreas(groupToPrefectures[gid]);

        if(gid==='Path_6'){
          const topRect=topDummy.getBoundingClientRect();
          const mapRect=mapDiv.getBoundingClientRect();
          const left=topRect.left-mapRect.left;
          top2Dummy.style.left=left+'px';
          top2Dummy.style.transform='none';
        }else{
          top2Dummy.style.left='50%';
          top2Dummy.style.transform='translateX(-50%)';
        }

        allGroups.forEach(g=>{
          if(g.id!==gid)g.style.display='inline';
        });

        const boxWrappers=[topDummy,top2Dummy,bottomDummy,leftTopDummy,rightBottomDummy,leftBottomDummy,rightTopDummy];

        boxWrappers.forEach(wrapper=>{
          Array.from(wrapper.children).forEach(box=>{
            if(box.textContent.trim()==='')return;

            box.onclick=e=>{
              e.stopPropagation();
              const prefId=Object.keys(prefNames)
              .find(key=>prefNames[key]===box.textContent);

              if(prefId)gotoPref(prefId);
            };
          });
        });

        if(!location.hash||location.hash==='#'){
          updateHash(groupSettings[gid].hash,1);
        }
      }

      function applyTransform(gid){
        const group=svg.querySelector('#'+gid);
        const bbox=group.getBBox();
        const s=groupSettings[gid];

        const cx=bbox.x+bbox.width/2+s.x;
        const cy=bbox.y+bbox.height/2+s.y;
        const scale=s.scale;

        const svgDisplayWidth=svg.clientWidth;
        const viewBoxWidth=svg.viewBox.baseVal.width;
        const displayScale=svgDisplayWidth/viewBoxWidth;

        const finalScale=scale*displayScale;

        const tx=(svgDisplayWidth/2)-cx*finalScale;
        const ty=(svg.clientHeight/2)-cy*finalScale;

        svg.style.transform=`translate(${tx}px,${ty}px) scale(${finalScale})`;

        const baseStroke=0.5;

        prefGroup.querySelectorAll('path').forEach(p=>{
          p.style.strokeWidth=(baseStroke/finalScale)+'px';
        });

        allGroups.forEach(g=>{
          g.style.strokeWidth=(baseStroke/finalScale)+'px';
        });
      }

      function disableOtherAreas(activeIds){
        allGroups.forEach(g=>{
          g.style.pointerEvents=(g.id===currentGroup)?'auto':'none';
        });

        prefGroup.querySelectorAll('path').forEach(p=>{
          p.style.pointerEvents=activeIds.includes(p.id)?'auto':'none';
        });
      }

      function createBox(){
        const box=document.createElement('div');
        box.classList.add('pref-box');
        return box;
      }

      function createInitialNav(){
        const names=['北海道','東北地方','関東新潟','中部地方','近畿地方','中国四国','九州地方','沖縄'];

        const nav=document.createElement('div');
        nav.style.position='absolute';
        nav.style.top='5px';
        nav.style.left='5px';
        nav.style.display='flex';
        nav.style.flexDirection='column';
        nav.style.gap='4px';
        nav.style.zIndex='10';

        names.forEach((name,i)=>{
          const box=createBox();
          box.textContent=name;

          if(i!==0&&i!==7){
            box.style.cursor='pointer';
            box.onclick=()=>showRegion(`Path_${i+1}`);
          }else{
            box.style.opacity='0.6';
          }

          nav.appendChild(box);
        });

        mapDiv.appendChild(nav);
        return nav;
      }

      function createTopDummy(){return createCornerDummyWrapper('top',5,50,'X');}
      function createTop2Dummy(){return createCornerDummyWrapper('top',35,50,'X');}
      function createBottomDummy(){return createCornerDummyWrapper('bottom',5,50,'X');}

      function createCornerDummy(position){
        const wrapper=document.createElement('div');
        wrapper.style.position='absolute';
        wrapper.style.display='none';
        wrapper.style.flexDirection='column';
        wrapper.style.gap='4px';
        wrapper.style.zIndex='10';

        if(position==='leftTop'){wrapper.style.top='5px';wrapper.style.left='5px';}
        else if(position==='rightBottom'){wrapper.style.bottom='5px';wrapper.style.right='5px';}
        else if(position==='leftBottom'){wrapper.style.bottom='5px';wrapper.style.left='5px';}
        else if(position==='rightTop'){wrapper.style.top='5px';wrapper.style.right='5px';}

        for(let i=0;i<5;i++){wrapper.appendChild(createBox());}

        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      function createCornerDummyWrapper(vertical,posValue,horPercent,axis){
        const wrapper=document.createElement('div');
        wrapper.style.position='absolute';

        if(vertical==='top'){wrapper.style.top=posValue+'px';}
        else{wrapper.style.bottom=posValue+'px';}

        wrapper.style.left=horPercent+'%';

        if(axis==='X'){wrapper.style.transform='translateX(-50%)';}

        wrapper.style.display='none';
        wrapper.style.gap='6px';
        wrapper.style.zIndex='10';

        for(let i=0;i<4;i++){wrapper.appendChild(createBox());}

        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      function updateHash(value, level = 1){
        let hash = location.hash.replace(/^#/, '');
        let parts = hash ? hash.split('/') : [];

        // ★変更: alert削除（副作用排除）
        parts[level - 1] = value;
        parts = parts.slice(0, level);

        location.hash = '#' + parts.join('/');
      }
      
      
      

      function handleHash(){
        const hash = location.hash.replace(/^#/, '');

        if(hash){
            
            addLog('hash changed: ' + hash); // ←ここに入れる
            
          const parts = hash.split('/');
          const regionHash = parts[0];

          const gid = Object.keys(groupSettings)
            .find(k => groupSettings[k].hash === regionHash);

          if(gid){
            showRegion(gid);
          }

          if(parts[1]){
            // gotoPref(parts[1]);
          }
        }
      }

      handleHash();

      const manualNav = document.getElementById('manual-region-nav');

      if (manualNav) {
        manualNav.querySelectorAll('button').forEach(btn => {
          btn.onclick = () => {
            const hash = btn.dataset.hash;
            location.hash = '#' + hash;
            handleHash();
          };
        });
      }

      window.addEventListener('hashchange', handleHash);

    });
});