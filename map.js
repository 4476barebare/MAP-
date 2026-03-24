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

      const groupSettings = {
        Path_2: { scale:6.7, x:135, y:45, hash:'TOHOKU' },
        Path_3: { scale:15, x:92, y:95, hash:'KANTO' },
        Path_4: { scale:10.2, x:54, y:110, hash:'CHUBU' },
        Path_5: { scale:13.6, x:0, y:140, hash:'KINKI' },
        Path_6: { scale:9.5, x:-51, y:165, hash:'CHUGOKU' },
        Path_7: { scale:11.2, x:-105, y:200, hash:'KYUSHU' }
      };

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

      // ★ 県クリック（ハッシュ対応）
      function gotoPref(prefId){
        alert(`pref clicked: ${prefId} (${prefNames[prefId]})`);
        updateHash(null, prefId);
      }

      // 初期表示
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'inline';
        p.classList.remove('prefecture-selected','prefecture-unselected');
        p.classList.add('prefecture-initial');
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
          if(pos==='top') wrapper = topDummy;
          if(pos==='top2') wrapper = top2Dummy;
          if(pos==='bottom') wrapper = bottomDummy;
          if(pos==='leftTop') wrapper = leftTopDummy;
          if(pos==='rightBottom') wrapper = rightBottomDummy;
          if(pos==='leftBottom') wrapper = leftBottomDummy;
          if(pos==='rightTop') wrapper = rightTopDummy;
          if(!wrapper) return;

          wrapper.style.display='flex';
          setting[pos].forEach((pid,i)=>{
            const box = wrapper.children[i];
            if(box){
              box.style.display='flex';
              box.textContent = prefNames[pid];
            }
          });
        });
      }

      function showRegion(gid){
        currentGroup = gid;

        initialNav.style.display = 'none';
        hideAllBoxes();
        showBoxes(gid);

        allGroups.forEach(g => g.style.display = 'none');

        prefGroup.querySelectorAll('path').forEach(p => {
            if(groupToPrefectures[gid].includes(p.id)) {
                p.classList.remove('prefecture-initial','prefecture-unselected');
                p.classList.add('prefecture-selected');
                p.onclick = e => { e.stopPropagation(); gotoPref(p.id); };
            } else {
                p.classList.remove('prefecture-initial','prefecture-selected');
                p.classList.add('prefecture-unselected');
            }
        });

        applyTransform(gid);
        disableOtherAreas(groupToPrefectures[gid]);

        allGroups.forEach(g => {
            if(g.id !== gid) g.style.display = 'inline';
        });

        const boxWrappers = [topDummy, top2Dummy, bottomDummy, leftTopDummy, rightBottomDummy, leftBottomDummy, rightTopDummy];
        boxWrappers.forEach(wrapper => {
            Array.from(wrapper.children).forEach(box => {
                if(box.textContent.trim() === '') return;
                box.onclick = e => {
                    e.stopPropagation();
                    const prefId = Object.keys(prefNames).find(key => prefNames[key] === box.textContent);
                    if(prefId) gotoPref(prefId);
                };
            });
        });

        if(!location.hash || location.hash === '#'){
            updateHash(gid);
        }
      }

      function updateHash(gid=null,prefId=null,subId=null){
        let parts = location.hash.replace(/^#/, '').split('/');
        if(parts.length===1 && parts[0]==='') parts=[];

        if(gid!==null){
          const h = groupSettings[gid] ? groupSettings[gid].hash : gid;
          parts[0]=h;
        }
        if(prefId!==null) parts[1]=prefId;
        if(subId!==null) parts[2]=subId;

        if(gid!==null && prefId===null) parts=parts.slice(0,1);
        if(prefId!==null && subId===null) parts=parts.slice(0,2);

        parts = parts.filter(Boolean);
        const newHash = parts.join('/');

        if('#'+newHash !== location.hash){
          history.pushState(null,'','#'+newHash);
        }
      }

      function handleHash(){
        const hash = location.hash.replace(/^#/, '');
        if(hash){
          const parts = hash.split('/');
          const gid = Object.keys(groupSettings)
            .find(k => groupSettings[k].hash === parts[0]);

          if(gid) showRegion(gid);
          //if(parts[1]) gotoPref(parts[1]);
        }
      }

      handleHash();
      window.addEventListener('hashchange', handleHash);

    });
});