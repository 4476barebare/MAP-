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

      // ===== GROUPS 定義 =====
      const GROUPS = {
        Path_2: { hash:'TOHOKU', scale:6.7, x:135, y:45,
                  prefBoxes: { leftTop:['AOMORI','AKITA','YAMAGATA','NIIGATA'], rightBottom:['IWATE','MIYAGI','FUKUSHIMA'] },
                  prefList:['AOMORI','AKITA','YAMAGATA','NIIGATA','IWATE','MIYAGI','FUKUSHIMA'] },
        Path_3: { hash:'KANTO', scale:15, x:92, y:95,
                  prefBoxes: { rightTop:['GUNMA','TOCHIGI','IBARAKI'], leftBottom:['SAITAMA','TOKYO','KANAGAWA','CHIBA'] },
                  prefList:['GUNMA','TOCHIGI','IBARAKI','SAITAMA','TOKYO','KANAGAWA','CHIBA'] },
        Path_4: { hash:'CHUBU', scale:10.2, x:54, y:110,
                  prefBoxes: { rightTop:['TOYAMA','ISHIKAWA','NAGANO','YAMANASHI'], leftBottom:['FUKUI','GIFU','AICHI','SHIZUOKA'] },
                  prefList:['TOYAMA','ISHIKAWA','NAGANO','YAMANASHI','FUKUI','GIFU','AICHI','SHIZUOKA'] },
        Path_5: { hash:'KINKI', scale:13.6, x:0, y:140,
                  prefBoxes: { rightTop:['SHIGA','KYOTO'], leftBottom:['HYOGO','OSAKA','WAKAYAMA','NARA','MIE'] },
                  prefList:['SHIGA','KYOTO','HYOGO','OSAKA','WAKAYAMA','NARA','MIE'] },
        Path_6: { hash:'CHUGOKU', scale:9.5, x:-51, y:165,
                  prefBoxes: { top:['SHIMANE','HIROSHIMA','TOTTORI','OKAYAMA'], top2:['YAMAGUCHI'], bottom:['EHIME','KOCHI','KAGAWA','TOKUSHIMA'] },
                  prefList:['SHIMANE','HIROSHIMA','TOTTORI','OKAYAMA','YAMAGUCHI','EHIME','KOCHI','KAGAWA','TOKUSHIMA'] },
        Path_7: { hash:'KYUSHU', scale:11.2, x:-105, y:200,
                  prefBoxes: { rightTop:['FUKUOKA','SAGA','NAGASAKI'], rightBottom:['OITA','KUMAMOTO','MIYAZAKI','KAGOSHIMA'] },
                  prefList:['FUKUOKA','SAGA','NAGASAKI','OITA','KUMAMOTO','MIYAZAKI','KAGOSHIMA'] }
      };

      // ===== 県名対応 =====
      const prefNames = {
        AOMORI:'青森県',IWATE:'岩手県',AKITA:'秋田県',
        MIYAGI:'宮城県',YAMAGATA:'山形県',FUKUSHIMA:'福島県',
        NIIGATA:'新潟県',GUNMA:'群馬県',TOCHIGI:'栃木県',CHIBA:'千葉県',
        IBARAKI:'茨城県',TOKYO:'東京都',SAITAMA:'埼玉県',KANAGAWA:'神奈川県',
        SHIZUOKA:'静岡県',YAMANASHI:'山梨県',NAGANO:'長野県',
        ISHIKAWA:'石川県',TOYAMA:'富山県',FUKUI:'福井県',
        GIFU:'岐阜県',AICHI:'愛知県',
        MIE:'三重県',NARA:'奈良県',WAKAYAMA:'和歌山県',
        OSAKA:'大阪府',SHIGA:'滋賀県',KYOTO:'京都府',HYOGO:'兵庫県',
        TOTTORI:'鳥取県',SHIMANE:'島根県',OKAYAMA:'岡山県',HIROSHIMA:'広島県',YAMAGUCHI:'山口県',
        TOKUSHIMA:'徳島県',KAGAWA:'香川県',KOCHI:'高知県',EHIME:'愛媛県',
        FUKUOKA:'福岡県',SAGA:'佐賀県',NAGASAKI:'長崎県',
        OITA:'大分県',KUMAMOTO:'熊本県',MIYAZAKI:'宮崎県',KAGOSHIMA:'鹿児島県',
      };

      // ===== 県クリック処理 =====
      function handlePrefClick(prefId){
        alert(`表示予定: ${prefNames[prefId]}`);
      }

      // ===== SVG 初期化 =====
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'inline';
        p.classList.remove('prefecture-selected','prefecture-unselected');
        p.classList.add('prefecture-initial');
        p.addEventListener('click', e => {
          e.stopPropagation();
          handlePrefClick(p.id);
        });
      });

      // ===== グループクリック設定 =====
      const allGroups = svg.querySelectorAll('[id^="Path_"]');
      allGroups.forEach(g => {
        const gid = g.id;
        if(GROUPS[gid]){
          g.style.cursor = 'pointer';
          g.addEventListener('click', () => {
            location.hash = GROUPS[gid].hash;
          });
        }
      });

      // ===== BOX 作成 =====
      function createBox(){ const box=document.createElement('div'); box.classList.add('pref-box'); return box; }

      function createCornerBOX(position){
        const wrapper=document.createElement('div');
        wrapper.style.position='absolute';
        wrapper.style.display='none';
        wrapper.style.flexDirection='column';
        wrapper.style.gap='4px';
        wrapper.style.zIndex='10';
        if(position==='leftTop'){ wrapper.style.top='5px'; wrapper.style.left='5px'; }
        else if(position==='rightBottom'){ wrapper.style.bottom='5px'; wrapper.style.right='5px'; }
        else if(position==='leftBottom'){ wrapper.style.bottom='5px'; wrapper.style.left='5px'; }
        else if(position==='rightTop'){ wrapper.style.top='5px'; wrapper.style.right='5px'; }
        for(let i=0;i<5;i++) wrapper.appendChild(createBox());
        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      function createCornerBOXWrapper(vertical,posValue,horPercent,axis){
        const wrapper=document.createElement('div');
        wrapper.style.position='absolute';
        if(vertical==='top') wrapper.style.top = posValue+'px';
        else wrapper.style.bottom = posValue+'px';
        wrapper.style.left = horPercent+'%';
        if(axis==='X') wrapper.style.transform = 'translateX(-50%)';
        wrapper.style.display='none';
        wrapper.style.gap = '6px';
        wrapper.style.zIndex = '10';
        for(let i=0;i<4;i++) wrapper.appendChild(createBox());
        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      const initialNav = createInitialNav();
      const topBOX = createCornerBOXWrapper('top',5,50,'X');
      const top2BOX = createCornerBOXWrapper('top',35,50,'X');
      const bottomBOX = createCornerBOXWrapper('bottom',5,50,'X');
      const leftTopBOX = createCornerBOX('leftTop');
      const rightBottomBOX = createCornerBOX('rightBottom');
      const leftBottomBOX = createCornerBOX('leftBottom');
      const rightTopBOX = createCornerBOX('rightTop');

      function hideAllBOX(){
        [topBOX, top2BOX, bottomBOX, leftTopBOX, rightBottomBOX, leftBottomBOX, rightTopBOX].forEach(wrapper=>{
          wrapper.style.display='none';
          Array.from(wrapper.children).forEach(c=>{
            c.style.display='none';
            c.textContent='';
          });
        });
      }

      function showBOX(gid){
        const setting = GROUPS[gid].prefBoxes;
        if(!setting) return;
        Object.keys(setting).forEach(pos=>{
          let wrapper;
          if(pos==='top') wrapper = topBOX;
          else if(pos==='top2') wrapper = top2BOX;
          else if(pos==='bottom') wrapper = bottomBOX;
          else if(pos==='leftTop') wrapper = leftTopBOX;
          else if(pos==='rightBottom') wrapper = rightBottomBOX;
          else if(pos==='leftBottom') wrapper = leftBottomBOX;
          else if(pos==='rightTop') wrapper = rightTopBOX;
          if(!wrapper) return;

          wrapper.style.display='flex';
          setting[pos].forEach((pid,i)=>{
            const box = wrapper.children[i];
            if(box){
              box.style.display='flex';
              box.textContent = prefNames[pid];
              box.onclick = (e)=>{
                e.stopPropagation();
                handlePrefClick(pid);
              };
            }
          });
        });
      }

      function showRegion(gid){
        currentGroup = gid;
        initialNav.style.display='none';
        hideAllBOX();
        showBOX(gid);

        allGroups.forEach(g=>g.style.display='none');
        prefGroup.querySelectorAll('path').forEach(p => {
          if(GROUPS[gid].prefList.includes(p.id)) {
            p.style.display = 'inline';
            p.classList.remove('prefecture-initial','prefecture-unselected');
            p.classList.add('prefecture-selected');
          } else {
            p.style.display = 'inline';
            p.classList.remove('prefecture-initial','prefecture-selected');
            p.classList.add('prefecture-unselected');
          }
        });

        applyTransform(gid);
        disableOtherAreas(GROUPS[gid].prefList);
      }

      function applyTransform(gid){
        const group = svg.querySelector('#'+gid);
        const bbox = group.getBBox();
        const s = GROUPS[gid];
        const cx = bbox.x + bbox.width/2 + s.x;
        const cy = bbox.y + bbox.height/2 + s.y;
        const svgDisplayWidth = svg.clientWidth;
        const viewBoxWidth = svg.viewBox.baseVal.width;
        const displayScale = svgDisplayWidth / viewBoxWidth;
        const finalScale = s.scale * displayScale;
        const tx = (svgDisplayWidth/2) - cx * finalScale;
        const ty = (svg.clientHeight/2) - cy * finalScale;
        svg.style.transform = `translate(${tx}px,${ty}px) scale(${finalScale})`;
        const baseStroke = 0.5;
        prefGroup.querySelectorAll('path').forEach(p=>{
          p.style.strokeWidth = (baseStroke / finalScale) + 'px';
        });
        allGroups.forEach(g=>{
          g.style.strokeWidth = (baseStroke / finalScale) + 'px';
        });
      }

      function disableOtherAreas(activeIds){
        allGroups.forEach(g=>{ g.style.pointerEvents = (g.id === currentGroup) ? 'auto' : 'none'; });
        prefGroup.querySelectorAll('path').forEach(p=>{
          p.style.pointerEvents = activeIds.includes(p.id) ? 'auto' : 'none';
        });
      }

      // ===== ハッシュ変更時・ロード時 =====
      function handleHash(){
        const hash = location.hash.replace('#','').toUpperCase();
        if(!hash){
          // 初期画面
          currentGroup = null;
          initialNav.style.display='flex';
          hideAllBOX();
          prefGroup.querySelectorAll('path').forEach(p=>{
            p.style.display='inline';
            p.className='prefecture-initial';
          });
          allGroups.forEach(g=>g.style.display='inline');
          return;
        }

        const groupId = Object.keys(GROUPS).find(g => GROUPS[g].hash === hash);
        if(groupId){
          showRegion(groupId);
        } else if(Object.keys(prefNames).includes(hash)){
          alert("表示予定");
          currentGroup = null;
        } else {
          currentGroup = null;
        }
      }

      window.addEventListener('hashchange', handleHash);
      handleHash(); // ロード時チェック

    });

});