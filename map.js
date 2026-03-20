document.addEventListener('DOMContentLoaded', () => {

  const mapDiv = document.getElementById('map');

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {

      mapDiv.innerHTML = svgText;

      const svg = mapDiv.querySelector('svg');
      const prefGroup = svg.querySelector('#pref');

      svg.style.shapeRendering = 'geometricPrecision';
      svg.style.transformOrigin = 'center center';

      let currentGroup = null;

      // =========================
      // 地域設定（クリック対象のみ）
      // =========================
      const groupSettings = {
        Path_2: { scale:3.4, x:190, y:110 },
        Path_3: { scale:5.2, x:130, y:130 },
        Path_4: { scale:5.6, x:90, y:140 },
        Path_5: { scale:7, x:30, y:160 },
        Path_6: { scale:4.8, x:0, y:200 },
        Path_7: { scale:5.8, x:-60, y:220 }
      };

      const groupToPrefectures = {
        Path_2:['Aomori','Iwate','Akita','Miyagi','Yamagata','Fukushima'],
        Path_3:['Niigata','Gunma','Tochigi','Chiba','Ibaraki','Tokyo','Saitama','Kanagawa'],
        Path_4:['Shizuoka','Yamanashi','Nagano','Ishikawa','Toyama','Gifu','Aichi'],
        Path_5:['Mie','Nara','Wakayama','Osaka','Shiga','Kyoto','Hyogo'],
        Path_6:['Tottori','Shimane','Okayama','Hiroshima','Yamaguchi','Tokushima','Kagawa','Kochi','Ehime'],
        Path_7:['Fukuoka','Saga','Nagasaki','Oita','Kumamoto','Miyazaki','Kagoshima']
      };

      const prefNames = {
        Osaka:'大阪府',
        Tokyo:'東京都'
      };

      const prefCounts = {
        Tokyo:12,
        Kanagawa:8
      };

      // =========================
      // 初期：県非表示
      // =========================
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'none';
        p.setAttribute('fill', '#ffffff');
        p.setAttribute('stroke', '#191970');
        p.style.strokeWidth = '0.8px';
        p.style.vectorEffect = 'non-scaling-stroke';
      });

      // =========================
      // 地図クリック（地域）
      // =========================
      Object.keys(groupSettings).forEach(gid => {

        const group = svg.querySelector('#' + gid);
        if (!group) return;

        group.setAttribute('fill', '#ffffff');
        group.setAttribute('stroke', '#191970');
        group.style.cursor = 'pointer';
        group.style.vectorEffect = 'non-scaling-stroke';

        group.addEventListener('click', () => {
          showRegion(gid);
        });

      });

      function showRegion(gid){

        currentGroup = gid;

        // 初期BOX消す
        initialNav.style.display = 'none';

        // 地域非表示
        Object.keys(groupSettings).forEach(g => {
          const el = svg.querySelector('#' + g);
          if (el) el.style.display = 'none';
        });

        // 県表示
        prefGroup.querySelectorAll('path').forEach(p => {
          p.style.display = groupToPrefectures[gid].includes(p.id) ? 'inline' : 'none';
        });

        applyTransform(gid);
        addPrefLabels(groupToPrefectures[gid]);

        // ダミー表示
        leftDummy.style.display = 'flex';
        rightDummy.style.display = 'flex';
        bottomDummy.style.display = 'flex';
      }

      function applyTransform(gid){
        const group = svg.querySelector('#' + gid);
        const bbox = group.getBBox();
        const s = groupSettings[gid];

        const cx = bbox.x + bbox.width/2 + s.x;
        const cy = bbox.y + bbox.height/2 + s.y;

        const scale = s.scale;

        const svgW = svg.viewBox.baseVal.width;
        const svgH = svg.viewBox.baseVal.height;

        const tx = svgW/2 - cx * scale;
        const ty = svgH/2 - cy * scale;

        svg.style.transition = 'transform 0.4s ease';
        svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      }

      function addPrefLabels(prefIds){
        svg.querySelectorAll('.pref-label').forEach(e => e.remove());

        prefIds.forEach(pid => {
          const p = prefGroup.querySelector('#' + pid);
          if (!p) return;

          const bbox = p.getBBox();
          const cx = bbox.x + bbox.width/2;
          const cy = bbox.y + bbox.height/2;

          const text = document.createElementNS('http://www.w3.org/2000/svg','text');
          text.setAttribute('x', cx);
          text.setAttribute('y', cy);
          text.setAttribute('text-anchor','middle');
          text.textContent = prefNames[pid] || pid;

          svg.appendChild(text);
        });
      }

      // =========================
      // 初期ナビ（本物）
      // =========================
      const regionList = [
        {gid:'Path_1', name:'北海道', active:false},
        {gid:'Path_2', name:'東北地方', active:true},
        {gid:'Path_3', name:'関東新潟', active:true},
        {gid:'Path_4', name:'中部地方', active:true},
        {gid:'Path_5', name:'近畿地方', active:true},
        {gid:'Path_6', name:'中国四国', active:true},
        {gid:'Path_7', name:'九州地方', active:true},
        {gid:'Path_8', name:'沖縄', active:false}
      ];

      function createInitialNav(){
        const nav = document.createElement('div');
        nav.style.position = 'fixed';
        nav.style.top = '60px';
        nav.style.left = '24px';
        nav.style.display = 'flex';
        nav.style.flexDirection = 'column';
        nav.style.gap = '4px';
        nav.style.zIndex = '1';

        regionList.forEach(r => {
          const box = document.createElement('div');
          box.textContent = r.name;
          box.style.border = '1px solid #191970';
          box.style.padding = '4px';
          box.style.textAlign = 'center';
          box.style.background = '#fff';

          if(r.active){
            box.style.cursor = 'pointer';
            box.onclick = () => showRegion(r.gid);
          } else {
            box.style.opacity = '0.6';
          }

          nav.appendChild(box);
        });

        document.body.appendChild(nav);
        return nav;
      }

      // =========================
      // ダミーBOX
      // =========================
      function createBox(){
        const box = document.createElement('div');
        box.style.border = '1px solid #191970';
        box.style.padding = '4px';
        box.style.minWidth = '80px';
        box.style.background = '#fff';
        return box;
      }

      function createSideDummy(side){
        const nav = document.createElement('div');
        nav.style.position = 'fixed';
        nav.style.top = '60px';
        nav.style.display = 'none';
        nav.style.flexDirection = 'column';
        nav.style.gap = '4px';
        nav.style.zIndex = '1';

        if(side === 'left') nav.style.left = '24px';
        if(side === 'right') nav.style.right = '24px';

        for(let i=0;i<6;i++){
          nav.appendChild(createBox());
        }

        document.body.appendChild(nav);
        return nav;
      }

      function createBottomDummy(){
        const nav = document.createElement('div');
        nav.style.position = 'fixed';
        nav.style.bottom = '20px';
        nav.style.left = '50%';
        nav.style.transform = 'translateX(-50%)';
        nav.style.display = 'none';
        nav.style.gap = '8px';
        nav.style.zIndex = '1';

        for(let i=0;i<5;i++){
          nav.appendChild(createBox());
        }

        document.body.appendChild(nav);
        return nav;
      }

      const initialNav = createInitialNav();
      const leftDummy = createSideDummy('left');
      const rightDummy = createSideDummy('right');
      const bottomDummy = createBottomDummy();

    });

});