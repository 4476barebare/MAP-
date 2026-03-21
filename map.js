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
        Path_2: { scale:6.7, x:145, y:45 },
        Path_3: { scale:12, x:105, y:100 },
        Path_4: { scale:10.1, x:55, y:110 },
        Path_5: { scale:13.6, x:0, y:140 },
        Path_6: { scale:9.5, x:-50, y:165 },
        Path_7: { scale:11.2, x:-105, y:200 }
      };

      const groupBoxSettings = {
        Path_2: { leftTop:['AOMORI','AKITA','YAMAGATA','NIIGATA'], rightBottom:['IWATE','MIYAGI','FUKUSHIMA'] },
        Path_3: { rightTop:['GUNMA','TOCHIGI','IBARAKI'], leftBottom:['SAITAMA','TOKYO','KANAGAWA','CHIBA'] },
        Path_4: { rightTop:['TOYAMA','ISHIKAWA','NAGANO','YAMANASHI'], leftBottom:['FUKUI','GIFU','AICHI','SHIZUOKA'] },
        Path_5: { rightTop:['SHIGA','KYOTO'], leftBottom:['HYOGO','OSAKA','WAKAYAMA','NARA','MIE'] },
        Path_6: { top:['SHIMANE','HIROSHIMA','TOTTORI','OKAYAMA'], top2:['YAMAGUCHI','OKINAWA','OKINAWA','OKINAWA'], bottom:['EHIME','KOCHI','KAGAWA','TOKUSHIMA'] },
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

      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'none';
        p.setAttribute('fill', '#ffffff');
        p.setAttribute('stroke', '#191970');
        p.setAttribute('stroke-width', '0.3');
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
    initialNav.style.display='none';
    hideAllBoxes();
    showBoxes(gid);

    allGroups.forEach(g=>g.style.display='none');

    prefGroup.querySelectorAll('path').forEach(p=>{
      p.style.display = groupToPrefectures[gid].includes(p.id)? 'inline':'none';
    });

    applyTransform(gid);
    addPrefLabels(groupToPrefectures[gid]);

    // ここから追加：選択したグループ以外を再表示
    allGroups.forEach(g => {
        if(g.id !== gid) g.style.display = 'inline';
    });
};

      function applyTransform(gid){
        const group = svg.querySelector('#'+gid);
        const bbox = group.getBBox();
        const s = groupSettings[gid];
        const cx = bbox.x + bbox.width/2 + s.x;
        const cy = bbox.y + bbox.height/2 + s.y;
        const scale = s.scale;

        const svgDisplayWidth = svg.clientWidth;
        const viewBoxWidth = svg.viewBox.baseVal.width;
        const displayScale = svgDisplayWidth / viewBoxWidth;

        const tx = (svgDisplayWidth/2) - cx*scale*displayScale;
        const ty = (svg.clientHeight/2) - cy*scale*displayScale;

        svg.style.transform = `translate(${tx}px,${ty}px) scale(${scale*displayScale})`;
        prefGroup.querySelectorAll('path').forEach(p=>p.setAttribute('stroke-width','0.3'));
      }

      function addPrefLabels(prefIds){
        svg.querySelectorAll('.pref-label').forEach(e=>e.remove());
        prefIds.forEach(pid=>{
          const p = prefGroup.querySelector(`#${pid}`);
          if(!p) return;
          const bbox = p.getBBox();
          const cx = bbox.x+bbox.width/2;
          const cy = bbox.y+bbox.height/2;

          const text = document.createElementNS('http://www.w3.org/2000/svg','text');
          text.setAttribute('x',cx);
          text.setAttribute('y',cy);
          text.setAttribute('text-anchor','middle');
          text.setAttribute('font-size','10');
          text.setAttribute('fill','#191970');
          text.textContent = prefNames[pid];
          svg.appendChild(text);
        });
      }

      function createBox(){
        const box = document.createElement('div');
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
          if(i!==0 && i!==7){
            box.style.cursor='pointer';
            box.onclick=()=>showRegion(`Path_${i+1}`);
          } else {
            box.style.opacity='0.6';
          }
          nav.appendChild(box);
        });
        mapDiv.appendChild(nav);
        return nav;
      }

      function createTopDummy(){
        const wrapper=document.createElement('div');
        wrapper.id='topDummy';
        wrapper.style.position='absolute';
        wrapper.style.top='5px';
        wrapper.style.left='50%';
        wrapper.style.transform='translateX(-50%)';
        wrapper.style.display='none';
        wrapper.style.gap='6px';
        wrapper.style.zIndex='10';
        for(let i=0;i<4;i++) wrapper.appendChild(createBox());
        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      function createTop2Dummy(){
        const wrapper=document.createElement('div');
        wrapper.id='top2Dummy';
        wrapper.style.position='absolute';
        wrapper.style.top='35px';
        wrapper.style.left='50%';
        wrapper.style.transform='translateX(-50%)';
        wrapper.style.display='none';
        wrapper.style.gap='6px';
        wrapper.style.zIndex='10';
        for(let i=0;i<4;i++) wrapper.appendChild(createBox());
        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      function createBottomDummy(){
        const wrapper=document.createElement('div');
        wrapper.id='bottomDummy';
        wrapper.style.position='absolute';
        wrapper.style.bottom='5px';
        wrapper.style.left='50%';
        wrapper.style.transform='translateX(-50%)';
        wrapper.style.display='none';
        wrapper.style.gap='6px';
        wrapper.style.zIndex='10';
        for(let i=0;i<4;i++) wrapper.appendChild(createBox());
        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      function createCornerDummy(position){
        const wrapper=document.createElement('div');
        wrapper.id=position+'Dummy';
        wrapper.style.position='absolute';
        wrapper.style.display='none';
        wrapper.style.flexDirection='column';
        wrapper.style.gap='4px';
        wrapper.style.zIndex='10';

        let color='#fff';
        if(position==='leftTop'){ wrapper.style.top='5px'; wrapper.style.left='5px'; }
        else if(position==='rightBottom'){ wrapper.style.bottom='5px'; wrapper.style.right='5px'; }
        else if(position==='leftBottom'){ wrapper.style.bottom='5px'; wrapper.style.left='5px'; }
        else if(position==='rightTop'){ wrapper.style.top='5px'; wrapper.style.right='5px'; }

        for(let i=0;i<5;i++){
          const box=createBox();
          box.style.background=color;
          wrapper.appendChild(box);
        }

        mapDiv.appendChild(wrapper);
        return wrapper;
      }
      
      
      
      
      // --- 調整コンソール追記（グループ内県まとめ移動版） ---
(function(){
    // コンソール用 div 作成
    const consoleDiv = document.createElement('div');
    consoleDiv.id = 'adjustConsole';
    consoleDiv.style.position = 'fixed';
    consoleDiv.style.bottom = '10px';
    consoleDiv.style.right = '10px';
    consoleDiv.style.padding = '10px';
    consoleDiv.style.background = 'rgba(0,0,0,0.7)';
    consoleDiv.style.color = '#fff';
    consoleDiv.style.fontFamily = 'monospace';
    consoleDiv.style.fontSize = '14px';
    consoleDiv.style.zIndex = 9999;
    consoleDiv.style.borderRadius = '6px';
    consoleDiv.style.userSelect = 'none';
    consoleDiv.style.width = '200px';
    consoleDiv.style.textAlign = 'center';
    consoleDiv.innerHTML = `
        <div id="coordDisplay">x:0 y:0 scale:1</div>
        <div style="margin-top:5px;">
            <button id="leftBtn">←</button>
            <button id="upBtn">↑</button>
            <button id="downBtn">↓</button>
            <button id="rightBtn">→</button>
        </div>
        <div style="margin-top:5px;">
            <button id="plusBtn">+</button>
            <button id="minusBtn">-</button>
        </div>
    `;
    document.body.appendChild(consoleDiv);

    let currentGroup = null; // 現在操作中のグループ
    let tx = 0, ty = 0, scale = 1;
    const moveStep = 5;    // 移動量
    const scaleStep = 0.05; // 拡大縮小倍率

    // 拡大されたグループを自動検知
    const observer = new MutationObserver(() => {
        if(currentGroup) return; // すでにセット済みならスキップ
        const groups = document.querySelectorAll('svg g');
        groups.forEach(g => {
            // クリックで拡大されたグループ（transform に scale があるもの）を検出
            const t = g.getAttribute('transform');
            if(t && t.includes('scale')){
                currentGroup = g;
                // 各 path の元 transform を保持
                currentGroup.querySelectorAll('path').forEach(path=>{
                    if(!path.dataset.originalTransform) path.dataset.originalTransform = path.getAttribute('transform') || '';
                });
                // 初期 transform 抽出
                const match = /translate\(([-\d.]+),([-\d.]+)\) scale\(([\d.]+)\)/.exec(t);
                if(match){
                    tx = parseFloat(match[1]);
                    ty = parseFloat(match[2]);
                    scale = parseFloat(match[3]);
                    updateDisplay();
                }
            }
        });
    });
    observer.observe(document.body, {childList:true, subtree:true});

    function updateDisplay(){
        if(!currentGroup) return;
        currentGroup.querySelectorAll('path').forEach(path=>{
            const original = path.dataset.originalTransform || '';
            path.setAttribute('transform', `${original} translate(${tx},${ty}) scale(${scale})`);
        });
        document.getElementById('coordDisplay').innerText =
            `x:${tx.toFixed(3)} y:${ty.toFixed(3)} scale:${scale.toFixed(3)}`;
    }

    // ボタン操作
    document.getElementById('leftBtn').addEventListener('click',()=>{ tx -= moveStep; updateDisplay(); });
    document.getElementById('rightBtn').addEventListener('click',()=>{ tx += moveStep; updateDisplay(); });
    document.getElementById('upBtn').addEventListener('click',()=>{ ty -= moveStep; updateDisplay(); });
    document.getElementById('downBtn').addEventListener('click',()=>{ ty += moveStep; updateDisplay(); });
    document.getElementById('plusBtn').addEventListener('click',()=>{ scale += scaleStep; updateDisplay(); });
    document.getElementById('minusBtn').addEventListener('click',()=>{ scale = Math.max(0.01, scale - scaleStep); updateDisplay(); });

    // キーボード操作対応
    document.addEventListener('keydown', (e)=>{
        if(!currentGroup) return;
        switch(e.key){
            case 'ArrowLeft': tx -= moveStep; break;
            case 'ArrowRight': tx += moveStep; break;
            case 'ArrowUp': ty -= moveStep; break;
            case 'ArrowDown': ty += moveStep; break;
            case '+': case '=': scale += scaleStep; break;
            case '-': case '_': scale = Math.max(0.01, scale - scaleStep); break;
            default: return;
        }
        e.preventDefault();
        updateDisplay();
    });
})();




      
      

    });
});