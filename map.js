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
      // ★ 統合データ
      // =========================
      const GROUPS = {
        TOHOKU: {
          id:'Path_2', scale:6.7, x:135, y:45,
          prefectures:['AOMORI','AKITA','YAMAGATA','NIIGATA','IWATE','MIYAGI','FUKUSHIMA']
        },
        KANTO: {
          id:'Path_3', scale:15, x:92, y:95,
          prefectures:['GUNMA','TOCHIGI','IBARAKI','SAITAMA','TOKYO','KANAGAWA','CHIBA']
        },
        CHUBU: {
          id:'Path_4', scale:10.2, x:54, y:110,
          prefectures:['TOYAMA','ISHIKAWA','NAGANO','YAMANASHI','FUKUI','GIFU','AICHI','SHIZUOKA']
        },
        KINKI: {
          id:'Path_5', scale:13.6, x:0, y:140,
          prefectures:['SHIGA','KYOTO','HYOGO','OSAKA','WAKAYAMA','NARA','MIE']
        },
        CHUGOKU: {
          id:'Path_6', scale:9.5, x:-51, y:165,
          prefectures:['SHIMANE','HIROSHIMA','TOTTORI','OKAYAMA','YAMAGUCHI','EHIME','KOCHI','KAGAWA','TOKUSHIMA']
        },
        KYUSHU: {
          id:'Path_7', scale:11.2, x:-105, y:200,
          prefectures:['FUKUOKA','SAGA','NAGASAKI','OITA','KUMAMOTO','MIYAZAKI','KAGOSHIMA']
        }
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

      // =========================
      // ★ 共通クリック
      // =========================
      function handlePrefClick(prefId){
        alert(`ハッシュ ${prefId} を追加します`);
      }

      function getGroupById(gid){
        return Object.entries(GROUPS).find(([k,v]) => v.id === gid);
      }

      // =========================
      // ★ BOX分割（位置復活）
      // =========================
      function splitBoxes(key){
        const pref = GROUPS[key].prefectures;

        if(key === 'TOHOKU'){
          return {
            leftTop: pref.slice(0,4),
            rightBottom: pref.slice(4)
          };
        }

        if(key === 'KANTO'){
          return {
            rightTop: pref.slice(0,3),
            leftBottom: pref.slice(3)
          };
        }

        if(key === 'CHUBU'){
          return {
            rightTop: pref.slice(0,4),
            leftBottom: pref.slice(4)
          };
        }

        if(key === 'KINKI'){
          return {
            rightTop: pref.slice(0,2),
            leftBottom: pref.slice(2)
          };
        }

        if(key === 'CHUGOKU'){
          return {
            top: pref.slice(0,4),
            top2: pref.slice(4,5),
            bottom: pref.slice(5)
          };
        }

        if(key === 'KYUSHU'){
          return {
            rightTop: pref.slice(0,3),
            rightBottom: pref.slice(3)
          };
        }
      }

      // =========================
      // ★ 県クリック
      // =========================
      prefGroup.querySelectorAll('path').forEach(p => {
        p.classList.add('prefecture-initial');

        p.addEventListener('click', (e) => {
          e.stopPropagation();
          handlePrefClick(p.id);
        });
      });

      // =========================
      // ★ グループクリック
      // =========================
      const allGroups = svg.querySelectorAll('[id^="Path_"]');

      allGroups.forEach(g => {
        g.addEventListener('click', () => {
          const found = getGroupById(g.id);
          if(found){
            const [key] = found;
            location.hash = key;
          }
        });
      });

      // =========================
      // ★ ダミーBOX生成（元構造維持）
      // =========================
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
          .forEach(w=>{
            w.style.display='none';
            Array.from(w.children).forEach(c=>{
              c.style.display='none';
              c.textContent='';
            });
          });
      }

      function showBoxes(key){
        const split = splitBoxes(key);

        Object.entries(split).forEach(([pos,list])=>{
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

          list.forEach((pid,i)=>{
            const box = wrapper.children[i];
            if(box){
              box.style.display='flex';
              box.textContent = prefNames[pid]; // ★漢字復元
              box.onclick = (e)=>{
                e.stopPropagation();
                handlePrefClick(pid);
              };
            }
          });
        });
      }

      function showRegion(key){
        const group = GROUPS[key];
        currentGroup = key;

        initialNav.style.display='none';
        hideAllBoxes();
        showBoxes(key);

        allGroups.forEach(g=>g.style.display='none');

        prefGroup.querySelectorAll('path').forEach(p => {
          if(group.prefectures.includes(p.id)){
            p.classList.add('prefecture-selected');
            p.classList.remove('prefecture-unselected');
          } else {
            p.classList.add('prefecture-unselected');
            p.classList.remove('prefecture-selected');
          }
        });

        applyTransform(group);
      }

      function applyTransform(group){
        const target = svg.querySelector('#'+group.id);
        const bbox = target.getBBox();

        const cx = bbox.x + bbox.width/2 + group.x;
        const cy = bbox.y + bbox.height/2 + group.y;

        const scale = group.scale;

        svg.style.transform = `translate(${-cx}px,${-cy}px) scale(${scale})`;

        const baseStroke = 0.5;
        prefGroup.querySelectorAll('path').forEach(p=>{
          p.style.strokeWidth = (baseStroke / scale) + 'px';
        });
      }

      function createBox(){
        const box = document.createElement('div');
        box.classList.add('pref-box');
        return box;
      }

      function createInitialNav(){
        const nav=document.createElement('div');
        nav.style.position='absolute';
        nav.style.top='5px';
        nav.style.left='5px';
        nav.style.display='flex';
        nav.style.flexDirection='column';
        nav.style.gap='4px';

        Object.keys(GROUPS).forEach(key=>{
          const box=createBox();
          box.textContent=key;
          box.onclick=()=> location.hash = key;
          nav.appendChild(box);
        });

        mapDiv.appendChild(nav);
        return nav;
      }

      function createTopDummy(){ return createRow('top',5); }
      function createTop2Dummy(){ return createRow('top',35); }
      function createBottomDummy(){ return createRow('bottom',5); }

      function createRow(pos,val){
        const w=document.createElement('div');
        w.style.position='absolute';
        w.style[pos]=val+'px';
        w.style.left='50%';
        w.style.transform='translateX(-50%)';
        w.style.display='none';
        w.style.gap='6px';
        for(let i=0;i<5;i++) w.appendChild(createBox());
        mapDiv.appendChild(w);
        return w;
      }

      function createCornerDummy(pos){
        const w=document.createElement('div');
        w.style.position='absolute';
        w.style[pos.includes('top')?'top':'bottom']='5px';
        w.style[pos.includes('left')?'left':'right']='5px';
        w.style.display='none';
        w.style.flexDirection='column';
        for(let i=0;i<5;i++) w.appendChild(createBox());
        mapDiv.appendChild(w);
        return w;
      }

      window.addEventListener('hashchange', () => {
        const key = location.hash.replace('#','').toUpperCase();
        if(GROUPS[key]){
          showRegion(key);
        }
      });

      if(location.hash){
        window.dispatchEvent(new Event('hashchange'));
      }

    });
});