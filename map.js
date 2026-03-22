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

      // グループごとの拡大・位置設定
      const groupSettings = {
        Path_2: { scale:6.7, x:145, y:45 },
        Path_3: { scale:15, x:90, y:95 },
        Path_4: { scale:10.1, x:55, y:110 },
        Path_5: { scale:13.6, x:0, y:140 },
        Path_6: { scale:9.5, x:-50, y:165 },
        Path_7: { scale:11.2, x:-105, y:200 }
      };

      // ダミーBOX配置
      const groupBoxSettings = {
        Path_2: { leftTop:['AOMORI','AKITA','YAMAGATA','NIIGATA'], rightBottom:['IWATE','MIYAGI','FUKUSHIMA'] },
        Path_3: { rightTop:['GUNMA','TOCHIGI','IBARAKI'], leftBottom:['SAITAMA','TOKYO','KANAGAWA','CHIBA'] },
        Path_4: { rightTop:['TOYAMA','ISHIKAWA','NAGANO','YAMANASHI'], leftBottom:['FUKUI','GIFU','AICHI','SHIZUOKA'] },
        Path_5: { rightTop:['SHIGA','KYOTO'], leftBottom:['HYOGO','OSAKA','WAKAYAMA','NARA','MIE'] },
        Path_6: { top:['SHIMANE','HIROSHIMA','TOTTORI','OKAYAMA'], top2:['YAMAGUCHI'], bottom:['EHIME','KOCHI','KAGAWA','TOKUSHIMA'] },
        Path_7: { rightTop:['FUKUOKA','SAGA','NAGASAKI'], rightBottom:['OITA','KUMAMOTO','MIYAZAKI','KAGOSHIMA'] }
      };

      const groupToPrefectures = {
        Path_2:['AOMORI','AKITA','YAMAGATA','NIIGATA','IWATE','MIYAGI','FUKUSHIMA'],
        Path_3:['GUNMA','TOCHIGI','IBARAKI','SAITAMA','TOKYO','KANAGAWA','CHIBA'],
        Path_4:['TOYAMA','ISHIKAWA','NAGANO','YAMANASHI','FUKUI','GIFU','AICHI','SHIZUOKA'],
        Path_5:['SHIGA','KYOTO','HYOGO','OSAKA','WAKAYAMA','NARA','MIE'],
        Path_6:['SHIMANE','HIROSHIMA','TOTTORI','OKAYAMA','YAMAGUCHI','EHIME','KOCHI','KAGAWA','TOKUSHIMA'],
        Path_7:['FUKUOKA','SAGA','NAGASAKI','OITA','KUMAMOTO','MIYAZAKI','KAGOSHIMA'],
      };

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

      // 初期：県非表示
      prefGroup.querySelectorAll('path').forEach(p=>{
        p.style.display='none';
        p.setAttribute('fill','#ffffff');
        p.setAttribute('stroke','#191970');
        p.setAttribute('stroke-width','0.3');
      });

      const allGroups = svg.querySelectorAll('[id^="Path_"]');

      allGroups.forEach(g=>{
        const gid=g.id;
        g.setAttribute('fill','#ffffff');
        g.setAttribute('stroke','#191970');
        if(groupSettings[gid]){
          g.style.cursor='pointer';
          g.addEventListener('click',()=>showRegion(gid));
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

      function hideAllBoxes(){
        [topDummy, top2Dummy, bottomDummy, leftTopDummy, rightBottomDummy, leftBottomDummy, rightTopDummy]
          .forEach(wrapper=>{
            wrapper.style.display='none';
            Array.from(wrapper.children).forEach(c=>{
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
          if(pos==='top') wrapper=topDummy;
          if(pos==='top2') wrapper=top2Dummy;
          if(pos==='bottom') wrapper=bottomDummy;
          if(pos==='leftTop') wrapper=leftTopDummy;
          if(pos==='rightBottom') wrapper=rightBottomDummy;
          if(pos==='leftBottom') wrapper=leftBottomDummy;
          if(pos==='rightTop') wrapper=rightTopDummy;
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
        initialNav.style.display='none'; // ★初期ナビを隠す
        hideAllBoxes();
        showBoxes(gid);

        allGroups.forEach(g=>g.style.display='none');
        prefGroup.querySelectorAll('path').forEach(p=>{
          p.style.display=groupToPrefectures[gid].includes(p.id)?'inline':'none';
        });

        applyTransform(gid);
        addPrefLabels(groupToPrefectures[gid]);
        disableOtherAreas(groupToPrefectures[gid]);

        if(gid==='Path_6'){
          const left=topDummy.getBoundingClientRect().left-mapDiv.getBoundingClientRect().left;
          top2Dummy.style.left=left+'px';
          top2Dummy.style.transform='none';
        } else {
          top2Dummy.style.left='50%';
          top2Dummy.style.transform='translateX(-50%)';
        }

        allGroups.forEach(g=>{
          if(g.id!==gid) g.style.display='inline';
          g.setAttribute('stroke-width','0.3');
        });
      }

      function applyTransform(gid){
        const group=svg.querySelector('#'+gid);
        const bbox=group.getBBox();
        const s=groupSettings[gid];
        const cx=bbox.x+bbox.width/2+s.x;
        const cy=bbox.y+bbox.height/2+s.y;
        const scale=s.scale;
        const displayScale=svg.clientWidth/svg.viewBox.baseVal.width;
        const tx=(svg.clientWidth/2)-cx*scale*displayScale;
        const ty=(svg.clientHeight/2)-cy*scale*displayScale;
        svg.style.transform=`translate(${tx}px,${ty}px) scale(${scale*displayScale})`;
        prefGroup.querySelectorAll('path').forEach(p=>p.setAttribute('stroke-width','0.3'));
      }

      function disableOtherAreas(activeIds){
        allGroups.forEach(g=>g.style.pointerEvents=(g.id===currentGroup)?'auto':'none');
        prefGroup.querySelectorAll('path').forEach(p=>p.style.pointerEvents=activeIds.includes(p.id)?'auto':'none');
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
          if(i!==0&&i!==7) box.style.cursor='pointer', box.onclick=()=>showRegion(`Path_${i+1}`);
          else box.style.opacity='0.6';
          nav.appendChild(box);
        });
        mapDiv.appendChild(nav);
        return nav;
      }

      function createTopDummy(){return createCornerDummyBase('top',5,4);}
      function createTop2Dummy(){return createCornerDummyBase('top',35,4);}
      function createBottomDummy(){return createCornerDummyBase('bottom',5,4);}
      function createCornerDummy(position){
        let top=0,bottom=0,left=0,right=0;
        if(position==='leftTop'){top=5; left=5;}
        else if(position==='rightBottom'){bottom=5; right=5;}
        else if(position==='leftBottom'){bottom=5; left=5;}
        else if(position==='rightTop'){top=5; right=5;}
        return createCornerDummyBase(position==='bottom'? 'bottom':'top', top||bottom, 5);
      }
      function createCornerDummyBase(pos, offset, count){
        const wrapper=document.createElement('div');
        wrapper.style.position='absolute';
        if(pos==='top') wrapper.style.top=offset+'px';
        else wrapper.style.bottom=offset+'px';
        wrapper.style.left='50%';
        wrapper.style.transform='translateX(-50%)';
        wrapper.style.display='none';
        wrapper.style.gap='6px';
        wrapper.style.zIndex='10';
        for(let i=0;i<count;i++) wrapper.appendChild(createBox());
        mapDiv.appendChild(wrapper);
        return wrapper;
      }

    });

});document.addEventListener('DOMContentLoaded', () => {

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

      // グループごとの拡大・位置設定
      const groupSettings = {
        Path_2: { scale:6.7, x:145, y:45 },
        Path_3: { scale:15, x:90, y:95 },
        Path_4: { scale:10.1, x:55, y:110 },
        Path_5: { scale:13.6, x:0, y:140 },
        Path_6: { scale:9.5, x:-50, y:165 },
        Path_7: { scale:11.2, x:-105, y:200 }
      };

      // ダミーBOX配置
      const groupBoxSettings = {
        Path_2: { leftTop:['AOMORI','AKITA','YAMAGATA','NIIGATA'], rightBottom:['IWATE','MIYAGI','FUKUSHIMA'] },
        Path_3: { rightTop:['GUNMA','TOCHIGI','IBARAKI'], leftBottom:['SAITAMA','TOKYO','KANAGAWA','CHIBA'] },
        Path_4: { rightTop:['TOYAMA','ISHIKAWA','NAGANO','YAMANASHI'], leftBottom:['FUKUI','GIFU','AICHI','SHIZUOKA'] },
        Path_5: { rightTop:['SHIGA','KYOTO'], leftBottom:['HYOGO','OSAKA','WAKAYAMA','NARA','MIE'] },
        Path_6: { top:['SHIMANE','HIROSHIMA','TOTTORI','OKAYAMA'], top2:['YAMAGUCHI'], bottom:['EHIME','KOCHI','KAGAWA','TOKUSHIMA'] },
        Path_7: { rightTop:['FUKUOKA','SAGA','NAGASAKI'], rightBottom:['OITA','KUMAMOTO','MIYAZAKI','KAGOSHIMA'] }
      };

      const groupToPrefectures = {
        Path_2:['AOMORI','AKITA','YAMAGATA','NIIGATA','IWATE','MIYAGI','FUKUSHIMA'],
        Path_3:['GUNMA','TOCHIGI','IBARAKI','SAITAMA','TOKYO','KANAGAWA','CHIBA'],
        Path_4:['TOYAMA','ISHIKAWA','NAGANO','YAMANASHI','FUKUI','GIFU','AICHI','SHIZUOKA'],
        Path_5:['SHIGA','KYOTO','HYOGO','OSAKA','WAKAYAMA','NARA','MIE'],
        Path_6:['SHIMANE','HIROSHIMA','TOTTORI','OKAYAMA','YAMAGUCHI','EHIME','KOCHI','KAGAWA','TOKUSHIMA'],
        Path_7:['FUKUOKA','SAGA','NAGASAKI','OITA','KUMAMOTO','MIYAZAKI','KAGOSHIMA'],
      };

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

      // 初期：県非表示
      prefGroup.querySelectorAll('path').forEach(p=>{
        p.style.display='none';
        p.setAttribute('fill','#ffffff');
        p.setAttribute('stroke','#191970');
        p.setAttribute('stroke-width','0.3');
      });

      const allGroups = svg.querySelectorAll('[id^="Path_"]');

      allGroups.forEach(g=>{
        const gid=g.id;
        g.setAttribute('fill','#ffffff');
        g.setAttribute('stroke','#191970');
        if(groupSettings[gid]){
          g.style.cursor='pointer';
          g.addEventListener('click',()=>showRegion(gid));
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

      function hideAllBoxes(){
        [topDummy, top2Dummy, bottomDummy, leftTopDummy, rightBottomDummy, leftBottomDummy, rightTopDummy]
          .forEach(wrapper=>{
            wrapper.style.display='none';
            Array.from(wrapper.children).forEach(c=>{
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
          if(pos==='top') wrapper=topDummy;
          if(pos==='top2') wrapper=top2Dummy;
          if(pos==='bottom') wrapper=bottomDummy;
          if(pos==='leftTop') wrapper=leftTopDummy;
          if(pos==='rightBottom') wrapper=rightBottomDummy;
          if(pos==='leftBottom') wrapper=leftBottomDummy;
          if(pos==='rightTop') wrapper=rightTopDummy;
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
        initialNav.style.display='none'; // ★初期ナビを隠す
        hideAllBoxes();
        showBoxes(gid);

        allGroups.forEach(g=>g.style.display='none');
        prefGroup.querySelectorAll('path').forEach(p=>{
          p.style.display=groupToPrefectures[gid].includes(p.id)?'inline':'none';
        });

        applyTransform(gid);
        addPrefLabels(groupToPrefectures[gid]);
        disableOtherAreas(groupToPrefectures[gid]);

        if(gid==='Path_6'){
          const left=topDummy.getBoundingClientRect().left-mapDiv.getBoundingClientRect().left;
          top2Dummy.style.left=left+'px';
          top2Dummy.style.transform='none';
        } else {
          top2Dummy.style.left='50%';
          top2Dummy.style.transform='translateX(-50%)';
        }

        allGroups.forEach(g=>{
          if(g.id!==gid) g.style.display='inline';
          g.setAttribute('stroke-width','0.3');
        });
      }

      function applyTransform(gid){
        const group=svg.querySelector('#'+gid);
        const bbox=group.getBBox();
        const s=groupSettings[gid];
        const cx=bbox.x+bbox.width/2+s.x;
        const cy=bbox.y+bbox.height/2+s.y;
        const scale=s.scale;
        const displayScale=svg.clientWidth/svg.viewBox.baseVal.width;
        const tx=(svg.clientWidth/2)-cx*scale*displayScale;
        const ty=(svg.clientHeight/2)-cy*scale*displayScale;
        svg.style.transform=`translate(${tx}px,${ty}px) scale(${scale*displayScale})`;
        prefGroup.querySelectorAll('path').forEach(p=>p.setAttribute('stroke-width','0.3'));
      }

      function disableOtherAreas(activeIds){
        allGroups.forEach(g=>g.style.pointerEvents=(g.id===currentGroup)?'auto':'none');
        prefGroup.querySelectorAll('path').forEach(p=>p.style.pointerEvents=activeIds.includes(p.id)?'auto':'none');
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
          if(i!==0&&i!==7) box.style.cursor='pointer', box.onclick=()=>showRegion(`Path_${i+1}`);
          else box.style.opacity='0.6';
          nav.appendChild(box);
        });
        mapDiv.appendChild(nav);
        return nav;
      }

      function createTopDummy(){return createCornerDummyBase('top',5,4);}
      function createTop2Dummy(){return createCornerDummyBase('top',35,4);}
      function createBottomDummy(){return createCornerDummyBase('bottom',5,4);}
      function createCornerDummy(position){
        let top=0,bottom=0,left=0,right=0;
        if(position==='leftTop'){top=5; left=5;}
        else if(position==='rightBottom'){bottom=5; right=5;}
        else if(position==='leftBottom'){bottom=5; left=5;}
        else if(position==='rightTop'){top=5; right=5;}
        return createCornerDummyBase(position==='bottom'? 'bottom':'top', top||bottom, 5);
      }
      function createCornerDummyBase(pos, offset, count){
        const wrapper=document.createElement('div');
        wrapper.style.position='absolute';
        if(pos==='top') wrapper.style.top=offset+'px';
        else wrapper.style.bottom=offset+'px';
        wrapper.style.left='50%';
        wrapper.style.transform='translateX(-50%)';
        wrapper.style.display='none';
        wrapper.style.gap='6px';
        wrapper.style.zIndex='10';
        for(let i=0;i<count;i++) wrapper.appendChild(createBox());
        mapDiv.appendChild(wrapper);
        return wrapper;
      }

    });

});