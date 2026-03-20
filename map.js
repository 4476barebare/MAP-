document.addEventListener('DOMContentLoaded', () => {

  const mapDiv = document.getElementById('map');

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
      // ★ 県表示（復活）
      // =========================
      const groupToPrefectures = {
        Path_2:['Aomori','Iwate','Akita','Miyagi','Yamagata','Fukushima'],
        Path_3:['Niigata','Gunma','Tochigi','Chiba','Ibaraki','Tokyo','Saitama','Kanagawa'],
        Path_4:['Shizuoka','Yamanashi','Nagano','Ishikawa','Toyama','Gifu','Aichi'],
        Path_5:['Mie','Nara','Wakayama','Osaka','Shiga','Kyoto','Hyogo'],
        Path_6:['Tottori','Shimane','Okayama','Hiroshima','Yamaguchi','Tokushima','Kagawa','Kochi','Ehime'],
        Path_7:['Fukuoka','Saga','Nagasaki','Oita','Kumamoto','Miyazaki','Kagoshima']
      };

      // =========================
      // BOX設定（そのまま）
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
      // BOX→県
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

      function selectPref(prefId){
        console.log('選択:', prefId);
      }

      // 初期
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'none';
        p.setAttribute('fill', '#ffffff');
        p.setAttribute('stroke', '#191970');

        p.addEventListener('click', () => selectPref(p.id));
      });

      const allGroups = svg.querySelectorAll('[id^="Path_"]');

      allGroups.forEach(g => {
        const gid = g.id;
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
        [topDummy,bottomDummy,leftTopDummy,rightBottomDummy,leftBottomDummy,rightTopDummy]
        .forEach(w=>{
          w.style.display='none';
          Array.from(w.children).forEach(c=>c.style.display='none');
        });
      }

      function showBoxes(gid){
        const setting = groupBoxSettings[gid];
        if(!setting) return;

        Object.keys(setting).forEach(pos=>{
          let wrapper;
          if(pos==='top') wrapper=topDummy;
          if(pos==='bottom') wrapper=bottomDummy;
          if(pos==='leftTop') wrapper=leftTopDummy;
          if(pos==='rightBottom') wrapper=rightBottomDummy;
          if(pos==='leftBottom') wrapper=leftBottomDummy;
          if(pos==='rightTop') wrapper=rightTopDummy;

          wrapper.style.display='flex';

          setting[pos].forEach(i=>{
            wrapper.children[i].style.display='flex';
          });
        });

        const mapping = boxToPrefecture[gid];
        if(mapping){
          Object.keys(mapping).forEach(boxId=>{
            const box = mapDiv.querySelector(`[data-box-id="${boxId}"]`);
            if(box){
              box.textContent = mapping[boxId].name;
              box.dataset.prefId = mapping[boxId].id;
            }
          });
        }
      }

      function showRegion(gid){
        currentGroup = gid;

        initialNav.style.display = 'none';

        hideAllBoxes();
        showBoxes(gid);

        allGroups.forEach(g=>g.style.display='none');

        // ★復活
        prefGroup.querySelectorAll('path').forEach(p=>{
          p.style.display = groupToPrefectures[gid].includes(p.id) ? 'inline':'none';
        });

        applyTransform(gid);
      }

      function applyTransform(gid){
        const group = svg.querySelector('#'+gid);
        const bbox = group.getBBox();
        const s = groupSettings[gid];

        const cx = bbox.x + bbox.width/2 + s.x;
        const cy = bbox.y + bbox.height/2 + s.y;

        const scale = s.scale;
        const displayScale = svg.clientWidth / svg.viewBox.baseVal.width;

        const tx = (svg.clientWidth/2) - cx*scale*displayScale;
        const ty = (svg.clientHeight/2) - cy*scale*displayScale;

        svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale*displayScale})`;
      }

      function createBox(){
        const box=document.createElement('div');
        box.style.border='1px solid #191970';
        box.style.height='26px';
        box.style.width='88px';
        box.style.display='flex';
        box.style.alignItems='center';
        box.style.justifyContent='center';

        box.addEventListener('click',()=>{
          if(box.dataset.prefId) selectPref(box.dataset.prefId);
        });

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

        names.forEach((name,i)=>{
          const box=createBox();
          box.textContent=name;
          if(i!==0&&i!==7) box.onclick=()=>showRegion(`Path_${i+1}`);
          nav.appendChild(box);
        });

        mapDiv.appendChild(nav);
        return nav;
      }

      function createTopDummy(){
        const w=document.createElement('div');
        w.style.position='absolute';
        w.style.top='5px';
        w.style.left='50%';
        w.style.transform='translateX(-50%)';
        w.style.display='none';

        const nav=document.createElement('div');
        nav.style.display='flex';
        nav.style.flexWrap='wrap';
        nav.style.width='340px';

        for(let i=0;i<5;i++){
          const b=createBox();
          b.dataset.boxId=`top-${i+1}`;
          nav.appendChild(b);
        }

        w.appendChild(nav);
        mapDiv.appendChild(w);
        return w;
      }

      function createBottomDummy(){
        const w=document.createElement('div');
        w.style.position='absolute';
        w.style.bottom='5px';
        w.style.left='50%';
        w.style.transform='translateX(-50%)';
        w.style.display='none';

        for(let i=0;i<4;i++){
          const b=createBox();
          b.dataset.boxId=`bottom-${i+1}`;
          w.appendChild(b);
        }

        mapDiv.appendChild(w);
        return w;
      }

      function createCornerDummy(pos){
        const w=document.createElement('div');
        w.style.position='absolute';
        w.style.display='none';
        w.style.flexDirection='column';

        if(pos==='leftTop'){ w.style.top='5px'; w.style.left='5px'; }
        if(pos==='rightBottom'){ w.style.bottom='5px'; w.style.right='5px'; }
        if(pos==='leftBottom'){ w.style.bottom='5px'; w.style.left='5px'; }
        if(pos==='rightTop'){ w.style.top='5px'; w.style.right='5px'; }

        for(let i=0;i<5;i++){
          const b=createBox();
          b.dataset.boxId=`${pos}-${i+1}`;
          w.appendChild(b);
        }

        mapDiv.appendChild(w);
        return w;
      }

    });

});