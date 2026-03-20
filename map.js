document.addEventListener('DOMContentLoaded', () => {

  const mapDiv = document.getElementById('map');

  // 地図基準
  mapDiv.style.position = 'relative';
  mapDiv.style.zIndex = '50';

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
      // 地域設定（そのまま）
      // =========================
      const groupSettings = {
        Path_2: { scale:6.7, x:145, y:45 },
        Path_3: { scale:8.6, x:105, y:100 },
        Path_4: { scale:10.1, x:55, y:110 },
        Path_5: { scale:13.6, x:0, y:140 },
        Path_6: { scale:9.5, x:-50, y:165 },
        Path_7: { scale:11.2, x:-105, y:200 }
      };

      // =========================
      // BOX表示設定（そのまま）
      // =========================
      const groupBoxSettings = {
        Path_2: { leftTop:[0,1,2], rightBottom:[0,1,2] },
        Path_3: { rightTop:[0,1,2], leftBottom:[0,1,2,3,4] },
        Path_4: { rightTop:[0,1,2], leftBottom:[0,1,2,3] },
        Path_5: { rightTop:[0,1], leftBottom:[0,1,2,3,4] },
        Path_6: { top:[0,1,2,3,4], bottom:[0,1,2,3] },
        Path_7: { rightTop:[0,1,2], rightBottom:[0,1,2,3] }
      };

      // =========================
      // ★ BOX → 県（ID＋表示名）
      // =========================
      const boxToPrefecture = {
        Path_2: {
          'leftTop-1': { id:'Aomori', name:'青森県' },
          'leftTop-2': { id:'Akita', name:'秋田県' },
          'leftTop-3': { id:'Yamagata', name:'山形県' },
          'rightBottom-1': { id:'Iwate', name:'岩手県' },
          'rightBottom-2': { id:'Miyagi', name:'宮城県' },
          'rightBottom-3': { id:'Fukushima', name:'福島県' }
        },
        Path_3: {
          'rightTop-1': { id:'Niigata', name:'新潟県' },
          'rightTop-2': { id:'Tochigi', name:'栃木県' },
          'rightTop-3': { id:'Ibaraki', name:'茨城県' },
          'leftBottom-1': { id:'Gunma', name:'群馬県' },
          'leftBottom-2': { id:'Saitama', name:'埼玉県' },
          'leftBottom-3': { id:'Tokyo', name:'東京都' },
          'leftBottom-4': { id:'Kanagawa', name:'神奈川県' },
          'leftBottom-5': { id:'Chiba', name:'千葉県' }
        },
        Path_4: {
          'rightTop-1': { id:'Nagano', name:'長野県' },
          'rightTop-2': { id:'Toyama', name:'富山県' },
          'rightTop-3': { id:'Ishikawa', name:'石川県' },
          'leftBottom-1': { id:'Gifu', name:'岐阜県' },
          'leftBottom-2': { id:'Aichi', name:'愛知県' },
          'leftBottom-3': { id:'Shizuoka', name:'静岡県' },
          'leftBottom-4': { id:'Yamanashi', name:'山梨県' }
        },
        Path_5: {
          'rightTop-1': { id:'Fukui', name:'福井県' },
          'rightTop-2': { id:'Kyoto', name:'京都府' },
          'leftBottom-1': { id:'Hyogo', name:'兵庫県' },
          'leftBottom-2': { id:'Osaka', name:'大阪府' },
          'leftBottom-3': { id:'Wakayama', name:'和歌山県' },
          'leftBottom-4': { id:'Nara', name:'奈良県' },
          'leftBottom-5': { id:'Mie', name:'三重県' }
        },
        Path_6: {
          'top-1': { id:'Shimane', name:'島根県' },
          'top-2': { id:'Hiroshima', name:'広島県' },
          'top-3': { id:'Tottori', name:'鳥取県' },
          'top-4': { id:'Okayama', name:'岡山県' },
          'top-5': { id:'Yamaguchi', name:'山口県' },
          'bottom-1': { id:'Ehime', name:'愛媛県' },
          'bottom-2': { id:'Kochi', name:'高知県' },
          'bottom-3': { id:'Kagawa', name:'香川県' },
          'bottom-4': { id:'Tokushima', name:'徳島県' }
        },
        Path_7: {
          'rightTop-1': { id:'Fukuoka', name:'福岡県' },
          'rightTop-2': { id:'Saga', name:'佐賀県' },
          'rightTop-3': { id:'Nagasaki', name:'長崎県' },
          'rightBottom-1': { id:'Oita', name:'大分県' },
          'rightBottom-2': { id:'Kumamoto', name:'熊本県' },
          'rightBottom-3': { id:'Miyazaki', name:'宮崎県' },
          'rightBottom-4': { id:'Kagoshima', name:'鹿児島県' }
        }
      };

      // =========================
      // 共通処理
      // =========================
      function selectPref(prefId){
        console.log('選択:', prefId);
      }

      // =========================
      // 初期：県非表示
      // =========================
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'none';
        p.setAttribute('fill', '#ffffff');
        p.setAttribute('stroke', '#191970');
        p.setAttribute('stroke-width', '1');

        // ★ 県クリック統一
        p.addEventListener('click', () => {
          selectPref(p.id);
        });
      });

      const allGroups = svg.querySelectorAll('[id^="Path_"]');

      allGroups.forEach(g => {
        const gid = g.id;
        g.setAttribute('fill', '#ffffff');
        g.setAttribute('stroke', '#191970');

        if(groupSettings[gid]){
          g.style.cursor = 'pointer';
          g.addEventListener('click', () => showRegion(gid));
        }
      });

      const initialNav = createInitialNav();

      const topDummy = createTopDummy();
      const bottomDummy = createBottomDummy();
      const leftTopDummy = createCornerDummy('leftTop');
      const rightBottomDummy = createCornerDummy('rightBottom');
      const leftBottomDummy = createCornerDummy('leftBottom');
      const rightTopDummy = createCornerDummy('rightTop');

      function hideAllBoxes(){
        [topDummy, bottomDummy, leftTopDummy, rightBottomDummy, leftBottomDummy, rightTopDummy]
          .forEach(wrapper => {
            wrapper.style.display = 'none';
            Array.from(wrapper.children).forEach(c => c.style.display = 'none');
          });
      }

      function showBoxes(gid){
        const setting = groupBoxSettings[gid];
        if(!setting) return;

        Object.keys(setting).forEach(pos => {
          let wrapper;

          if(pos === 'top') wrapper = topDummy;
          if(pos === 'bottom') wrapper = bottomDummy;
          if(pos === 'leftTop') wrapper = leftTopDummy;
          if(pos === 'rightBottom') wrapper = rightBottomDummy;
          if(pos === 'leftBottom') wrapper = leftBottomDummy;
          if(pos === 'rightTop') wrapper = rightTopDummy;

          if(!wrapper) return;

          wrapper.style.display = 'flex';

          setting[pos].forEach(i => {
            if(wrapper.children[i]){
              wrapper.children[i].style.display = 'flex';
            }
          });
        });

        // ★ BOXに県名セット
        const mapping = boxToPrefecture[gid];
        if(mapping){
          Object.keys(mapping).forEach(boxId => {
            const box = mapDiv.querySelector(`[data-box-id="${boxId}"]`);
            if(box){
              const data = mapping[boxId];
              box.textContent = data.name;
              box.dataset.prefId = data.id;
            }
          });
        }
      }

      function showRegion(gid){
        currentGroup = gid;

        initialNav.style.display = 'none';

        hideAllBoxes();
        showBoxes(gid);

        allGroups.forEach(g => g.style.display = 'none');

        applyTransform(gid);
      }

      function applyTransform(gid) {
        const group = svg.querySelector('#' + gid);
        const bbox = group.getBBox();
        const s = groupSettings[gid];

        const cx = bbox.x + bbox.width / 2 + s.x;
        const cy = bbox.y + bbox.height / 2 + s.y;

        const scale = s.scale;

        const svgDisplayWidth = svg.clientWidth;
        const viewBoxWidth = svg.viewBox.baseVal.width;
        const displayScale = svgDisplayWidth / viewBoxWidth;

        const tx = (svgDisplayWidth / 2) - cx * scale * displayScale;
        const ty = (svg.clientHeight / 2) - cy * scale * displayScale;

        svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale * displayScale})`;
      }

      // =========================
      // UI
      // =========================
      function createBox(){
        const box = document.createElement('div');
        box.style.border = '1px solid #191970';
        box.style.background = '#fff';
        box.style.height = '26px';
        box.style.width = '88px'; // ★固定幅
        box.style.display = 'flex';
        box.style.alignItems = 'center';
        box.style.justifyContent = 'center';
        box.style.fontSize = '13px';
        box.style.color = '#191970';
        box.style.boxShadow = '0 0 4px rgba(0,0,0,0.25)';

        // ★ BOXクリック統一
        box.addEventListener('click', () => {
          const prefId = box.dataset.prefId;
          if(prefId) selectPref(prefId);
        });

        return box;
      }

      function createInitialNav(){
        const names = ['北海道','東北地方','関東新潟','中部地方','近畿地方','中国四国','九州地方','沖縄'];
        const nav = document.createElement('div');
        nav.style.position = 'absolute';
        nav.style.top = '5px';
        nav.style.left = '5px';
        nav.style.display = 'flex';
        nav.style.flexDirection = 'column';
        nav.style.gap = '4px';
        nav.style.zIndex = '10';

        names.forEach((name, i) => {
          const box = createBox();
          box.textContent = name;

          if(i !== 0 && i !== 7){
            box.style.cursor = 'pointer';
            box.onclick = () => showRegion(`Path_${i+1}`);
          } else {
            box.style.opacity = '0.6';
          }

          nav.appendChild(box);
        });

        mapDiv.appendChild(nav);
        return nav;
      }

      function createTopDummy(){
        const wrapper = document.createElement('div');
        wrapper.style.position = 'absolute';
        wrapper.style.top = '5px';
        wrapper.style.left = '50%';
        wrapper.style.transform = 'translateX(-50%)';
        wrapper.style.display = 'none';
        wrapper.style.zIndex = '10';

        const nav = document.createElement('div');
        nav.style.display = 'flex';
        nav.style.flexWrap = 'wrap';
        nav.style.width = '340px';
        nav.style.gap = '4px';

        for(let i=0;i<5;i++){
          const box = createBox();
          box.dataset.boxId = `top-${i+1}`;
          nav.appendChild(box);
        }

        wrapper.appendChild(nav);
        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      function createBottomDummy(){
        const wrapper = document.createElement('div');
        wrapper.style.position = 'absolute';
        wrapper.style.bottom = '5px';
        wrapper.style.left = '50%';
        wrapper.style.transform = 'translateX(-50%)';
        wrapper.style.display = 'none';
        wrapper.style.gap = '6px';
        wrapper.style.zIndex = '10';

        for(let i=0;i<4;i++){
          const box = createBox();
          box.dataset.boxId = `bottom-${i+1}`;
          wrapper.appendChild(box);
        }

        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      function createCornerDummy(position){
        const wrapper = document.createElement('div');
        wrapper.style.position = 'absolute';
        wrapper.style.display = 'none';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '4px';
        wrapper.style.zIndex = '10';

        if(position === 'leftTop'){ wrapper.style.top='5px'; wrapper.style.left='5px'; }
        if(position === 'rightBottom'){ wrapper.style.bottom='5px'; wrapper.style.right='5px'; }
        if(position === 'leftBottom'){ wrapper.style.bottom='5px'; wrapper.style.left='5px'; }
        if(position === 'rightTop'){ wrapper.style.top='5px'; wrapper.style.right='5px'; }

        for(let i=0;i<5;i++){
          const box = createBox();
          box.dataset.boxId = `${position}-${i+1}`;
          wrapper.appendChild(box);
        }

        mapDiv.appendChild(wrapper);
        return wrapper;
      }

    });

});