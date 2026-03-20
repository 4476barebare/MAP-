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
      // 地域設定
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
        Aomori:'青森県', Iwate:'岩手県', Akita:'秋田県',
        Miyagi:'宮城県', Yamagata:'山形県', Fukushima:'福島県',
        Niigata:'新潟県', Gunma:'群馬県', Tochigi:'栃木県', Chiba:'千葉県',
        Ibaraki:'茨城県', Tokyo:'東京都', Saitama:'埼玉県', Kanagawa:'神奈川県',
        Shizuoka:'静岡県', Yamanashi:'山梨県', Nagano:'長野県',
        Ishikawa:'石川県', Toyama:'富山県', Gifu:'岐阜県', Aichi:'愛知県',
        Mie:'三重県', Nara:'奈良県', Wakayama:'和歌山県',
        Osaka:'大阪府', Shiga:'滋賀県', Kyoto:'京都府', Hyogo:'兵庫県',
        Tottori:'鳥取県', Shimane:'島根県', Okayama:'岡山県',
        Hiroshima:'広島県', Yamaguchi:'山口県',
        Tokushima:'徳島県', Kagawa:'香川県', Kochi:'高知県', Ehime:'愛媛県',
        Fukuoka:'福岡県', Saga:'佐賀県', Nagasaki:'長崎県',
        Oita:'大分県', Kumamoto:'熊本県', Miyazaki:'宮崎県', Kagoshima:'鹿児島県'
      };

      // =========================
      // 初期：県非表示
      // =========================
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'none';
        p.setAttribute('fill', '#ffffff');
        p.setAttribute('stroke', '#191970');
        p.setAttribute('stroke-width', '1'); // 初
      });

      // =========================
      // 地域クリック
      // =========================
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

      // =========================
      // UI生成
      // =========================
      const initialNav = createInitialNav();

      // 上下ダミー
      const topDummy = createTopDummy();
      const bottomDummy = createBottomDummy();

      // 4隅ダミーBOX
      const leftTopDummy = createCornerDummy('leftTop');
      const rightBottomDummy = createCornerDummy('rightBottom');
      const leftBottomDummy = createCornerDummy('leftBottom');
      const rightTopDummy = createCornerDummy('rightTop');

      // =========================
      // 地域表示
      // =========================
      function showRegion(gid){

        currentGroup = gid;

        initialNav.style.display = 'none';

        topDummy.style.display = 'flex';
        bottomDummy.style.display = 'flex';
        leftTopDummy.style.display = 'flex';
        rightBottomDummy.style.display = 'flex';
        leftBottomDummy.style.display = 'flex';
        rightTopDummy.style.display = 'flex';

        allGroups.forEach(g => g.style.display = 'none');

        prefGroup.querySelectorAll('path').forEach(p => {
          p.style.display = groupToPrefectures[gid].includes(p.id)
            ? 'inline'
            : 'none';
        });

        applyTransform(gid);
        addPrefLabels(groupToPrefectures[gid]);
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

        // 拡大時だけ線幅を細く
        prefGroup.querySelectorAll('path').forEach(p => {
          p.setAttribute('stroke-width', '0.3');
        });

      }

      function addPrefLabels(prefIds){

        svg.querySelectorAll('.pref-label').forEach(e => e.remove());

        prefIds.forEach(pid => {

          const p = prefGroup.querySelector(`#${pid}`);
          if (!p) return;

          const bbox = p.getBBox();

          const cx = bbox.x + bbox.width / 2;
          const cy = bbox.y + bbox.height / 2;

          const text = document.createElementNS('http://www.w3.org/2000/svg','text');

          text.setAttribute('x', cx);
          text.setAttribute('y', cy);
          text.setAttribute('text-anchor','middle');
          text.setAttribute('font-size','10');
          text.setAttribute('fill','#191970');

          text.textContent = prefNames[pid];

          svg.appendChild(text);
        });
      }

      // =========================
      // BOX共通
      // =========================
      function createBox(){
        const box = document.createElement('div');
        box.style.border = '1px solid #191970';
        box.style.background = '#fff';
        box.style.height = '26px';
        box.style.minWidth = '80px';
        box.style.display = 'flex';
        box.style.alignItems = 'center';
        box.style.justifyContent = 'center';
        box.style.fontSize = '13px';
        box.style.color = '#191970';
        box.style.boxShadow = '0 0 4px rgba(0,0,0,0.25)';
        return box;
      }

      // =========================
      // 初期ナビ
      // =========================
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

      // =========================
      // 上ダミー（中央上）
      // =========================
      function createTopDummy(){
        const wrapper = document.createElement('div');
        wrapper.id = 'topDummy';
        wrapper.style.position = 'absolute';
        wrapper.style.top = '5px';
        wrapper.style.left = '50%';
        wrapper.style.transform = 'translateX(-50%)';
        wrapper.style.display = 'none';
        wrapper.style.zIndex = '10';

        const nav = document.createElement('div');
        nav.style.display = 'flex';
        nav.style.flexWrap = 'wrap';
        nav.style.justifyContent = 'flex-start';
        nav.style.width = '340px';
        nav.style.gap = '4px';

        for(let i=0;i<5;i++){
          nav.appendChild(createBox());
        }

        wrapper.appendChild(nav);
        mapDiv.appendChild(wrapper);

        return wrapper;
      }

      // =========================
      // 下ダミー（中央下）
      // =========================
      function createBottomDummy(){
        const wrapper = document.createElement('div');
        wrapper.id = 'bottomDummy';
        wrapper.style.position = 'absolute';
        wrapper.style.bottom = '5px';
        wrapper.style.left = '50%';
        wrapper.style.transform = 'translateX(-50%)';
        wrapper.style.display = 'none';
        wrapper.style.gap = '6px';
        wrapper.style.zIndex = '10';

        for(let i=0;i<4;i++){
          wrapper.appendChild(createBox());
        }

        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      // =========================
      // 4隅ダミーBOX
      // =========================
      function createCornerDummy(position){
        const wrapper = document.createElement('div');
        wrapper.id = position + 'Dummy';
        wrapper.style.position = 'absolute';
        wrapper.style.display = 'none';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '4px';
        wrapper.style.zIndex = '10';

        const boxes = 3;

        if(position === 'leftTop'){
          wrapper.style.top = '5px';
          wrapper.style.left = '5px';
        } else if(position === 'rightBottom'){
          wrapper.style.bottom = '5px';
          wrapper.style.right = '5px';
        } else if(position === 'leftBottom'){
          wrapper.style.bottom = '5px';
          wrapper.style.left = '5px';
        } else if(position === 'rightTop'){
          wrapper.style.top = '5px';
          wrapper.style.right = '5px';
        }

        for(let i=0;i<boxes;i++){
          wrapper.appendChild(createBox());
        }

        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      // =========================
      // ★ ダミーBOXに色とラベル追加
      // =========================
      const colorMap = {
        topDummy:'#e0f7fa',
        bottomDummy:'#fff3e0',
        leftTopDummy:'#f1f8e9',
        rightBottomDummy:'#f1f8e9',
        leftBottomDummy:'#f1f8e9',
        rightTopDummy:'#f1f8e9'
      };

      Object.keys(colorMap).forEach(id => {
        const dummy = document.getElementById(id);
        if(dummy){
          const nav = dummy.querySelector(':scope > div') || dummy;
          nav.querySelectorAll(':scope > div').forEach((box, idx) => {
            box.style.background = colorMap[id];
            const label = document.createElement('span');
            label.textContent = `${id.replace('Dummy','')}-${idx+1}`;
            label.style.fontSize = '10px';
            label.style.marginLeft = '4px';
            box.appendChild(label);
          });
        }
      });

    });

});document.addEventListener('DOMContentLoaded', () => {

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
      // 地域設定
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
        Aomori:'青森県', Iwate:'岩手県', Akita:'秋田県',
        Miyagi:'宮城県', Yamagata:'山形県', Fukushima:'福島県',
        Niigata:'新潟県', Gunma:'群馬県', Tochigi:'栃木県', Chiba:'千葉県',
        Ibaraki:'茨城県', Tokyo:'東京都', Saitama:'埼玉県', Kanagawa:'神奈川県',
        Shizuoka:'静岡県', Yamanashi:'山梨県', Nagano:'長野県',
        Ishikawa:'石川県', Toyama:'富山県', Gifu:'岐阜県', Aichi:'愛知県',
        Mie:'三重県', Nara:'奈良県', Wakayama:'和歌山県',
        Osaka:'大阪府', Shiga:'滋賀県', Kyoto:'京都府', Hyogo:'兵庫県',
        Tottori:'鳥取県', Shimane:'島根県', Okayama:'岡山県',
        Hiroshima:'広島県', Yamaguchi:'山口県',
        Tokushima:'徳島県', Kagawa:'香川県', Kochi:'高知県', Ehime:'愛媛県',
        Fukuoka:'福岡県', Saga:'佐賀県', Nagasaki:'長崎県',
        Oita:'大分県', Kumamoto:'熊本県', Miyazaki:'宮崎県', Kagoshima:'鹿児島県'
      };

      // =========================
      // 初期：県非表示
      // =========================
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'none';
        p.setAttribute('fill', '#ffffff');
        p.setAttribute('stroke', '#191970');
        p.setAttribute('stroke-width', '1'); // 初
      });

      // =========================
      // 地域クリック
      // =========================
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

      // =========================
      // UI生成
      // =========================
      const initialNav = createInitialNav();

      // 上下ダミー
      const topDummy = createTopDummy();
      const bottomDummy = createBottomDummy();

      // 4隅ダミーBOX
      const leftTopDummy = createCornerDummy('leftTop');
      const rightBottomDummy = createCornerDummy('rightBottom');
      const leftBottomDummy = createCornerDummy('leftBottom');
      const rightTopDummy = createCornerDummy('rightTop');

      // =========================
      // 地域表示
      // =========================
      function showRegion(gid){

        currentGroup = gid;

        initialNav.style.display = 'none';

        topDummy.style.display = 'flex';
        bottomDummy.style.display = 'flex';
        leftTopDummy.style.display = 'flex';
        rightBottomDummy.style.display = 'flex';
        leftBottomDummy.style.display = 'flex';
        rightTopDummy.style.display = 'flex';

        allGroups.forEach(g => g.style.display = 'none');

        prefGroup.querySelectorAll('path').forEach(p => {
          p.style.display = groupToPrefectures[gid].includes(p.id)
            ? 'inline'
            : 'none';
        });

        applyTransform(gid);
        addPrefLabels(groupToPrefectures[gid]);
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

        // 拡大時だけ線幅を細く
        prefGroup.querySelectorAll('path').forEach(p => {
          p.setAttribute('stroke-width', '0.3');
        });

      }

      function addPrefLabels(prefIds){

        svg.querySelectorAll('.pref-label').forEach(e => e.remove());

        prefIds.forEach(pid => {

          const p = prefGroup.querySelector(`#${pid}`);
          if (!p) return;

          const bbox = p.getBBox();

          const cx = bbox.x + bbox.width / 2;
          const cy = bbox.y + bbox.height / 2;

          const text = document.createElementNS('http://www.w3.org/2000/svg','text');

          text.setAttribute('x', cx);
          text.setAttribute('y', cy);
          text.setAttribute('text-anchor','middle');
          text.setAttribute('font-size','10');
          text.setAttribute('fill','#191970');

          text.textContent = prefNames[pid];

          svg.appendChild(text);
        });
      }

      // =========================
      // BOX共通
      // =========================
      function createBox(){
        const box = document.createElement('div');
        box.style.border = '1px solid #191970';
        box.style.background = '#fff';
        box.style.height = '26px';
        box.style.minWidth = '80px';
        box.style.display = 'flex';
        box.style.alignItems = 'center';
        box.style.justifyContent = 'center';
        box.style.fontSize = '13px';
        box.style.color = '#191970';
        box.style.boxShadow = '0 0 4px rgba(0,0,0,0.25)';
        return box;
      }

      // =========================
      // 初期ナビ
      // =========================
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

      // =========================
      // 上ダミー（中央上）
      // =========================
      function createTopDummy(){
        const wrapper = document.createElement('div');
        wrapper.id = 'topDummy';
        wrapper.style.position = 'absolute';
        wrapper.style.top = '5px';
        wrapper.style.left = '50%';
        wrapper.style.transform = 'translateX(-50%)';
        wrapper.style.display = 'none';
        wrapper.style.zIndex = '10';

        const nav = document.createElement('div');
        nav.style.display = 'flex';
        nav.style.flexWrap = 'wrap';
        nav.style.justifyContent = 'flex-start';
        nav.style.width = '340px';
        nav.style.gap = '4px';

        for(let i=0;i<5;i++){
          nav.appendChild(createBox());
        }

        wrapper.appendChild(nav);
        mapDiv.appendChild(wrapper);

        return wrapper;
      }

      // =========================
      // 下ダミー（中央下）
      // =========================
      function createBottomDummy(){
        const wrapper = document.createElement('div');
        wrapper.id = 'bottomDummy';
        wrapper.style.position = 'absolute';
        wrapper.style.bottom = '5px';
        wrapper.style.left = '50%';
        wrapper.style.transform = 'translateX(-50%)';
        wrapper.style.display = 'none';
        wrapper.style.gap = '6px';
        wrapper.style.zIndex = '10';

        for(let i=0;i<4;i++){
          wrapper.appendChild(createBox());
        }

        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      // =========================
      // 4隅ダミーBOX
      // =========================
      function createCornerDummy(position){
        const wrapper = document.createElement('div');
        wrapper.id = position + 'Dummy';
        wrapper.style.position = 'absolute';
        wrapper.style.display = 'none';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '4px';
        wrapper.style.zIndex = '10';

        const boxes = 3;

        if(position === 'leftTop'){
          wrapper.style.top = '5px';
          wrapper.style.left = '5px';
        } else if(position === 'rightBottom'){
          wrapper.style.bottom = '5px';
          wrapper.style.right = '5px';
        } else if(position === 'leftBottom'){
          wrapper.style.bottom = '5px';
          wrapper.style.left = '5px';
        } else if(position === 'rightTop'){
          wrapper.style.top = '5px';
          wrapper.style.right = '5px';
        }

        for(let i=0;i<boxes;i++){
          wrapper.appendChild(createBox());
        }

        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      // =========================
      // ★ ダミーBOXに色とラベル追加
      // =========================
      const colorMap = {
        topDummy:'#e0f7fa',
        bottomDummy:'#fff3e0',
        leftTopDummy:'#f1f8e9',
        rightBottomDummy:'#f1f8e9',
        leftBottomDummy:'#f1f8e9',
        rightTopDummy:'#f1f8e9'
      };

      Object.keys(colorMap).forEach(id => {
        const dummy = document.getElementById(id);
        if(dummy){
          const nav = dummy.querySelector(':scope > div') || dummy;
          nav.querySelectorAll(':scope > div').forEach((box, idx) => {
            box.style.background = colorMap[id];
            const label = document.createElement('span');
            label.textContent = `${id.replace('Dummy','')}-${idx+1}`;
            label.style.fontSize = '10px';
            label.style.marginLeft = '4px';
            box.appendChild(label);
          });
        }
      });

    });

});document.addEventListener('DOMContentLoaded', () => {

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
      // 地域設定
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
        Aomori:'青森県', Iwate:'岩手県', Akita:'秋田県',
        Miyagi:'宮城県', Yamagata:'山形県', Fukushima:'福島県',
        Niigata:'新潟県', Gunma:'群馬県', Tochigi:'栃木県', Chiba:'千葉県',
        Ibaraki:'茨城県', Tokyo:'東京都', Saitama:'埼玉県', Kanagawa:'神奈川県',
        Shizuoka:'静岡県', Yamanashi:'山梨県', Nagano:'長野県',
        Ishikawa:'石川県', Toyama:'富山県', Gifu:'岐阜県', Aichi:'愛知県',
        Mie:'三重県', Nara:'奈良県', Wakayama:'和歌山県',
        Osaka:'大阪府', Shiga:'滋賀県', Kyoto:'京都府', Hyogo:'兵庫県',
        Tottori:'鳥取県', Shimane:'島根県', Okayama:'岡山県',
        Hiroshima:'広島県', Yamaguchi:'山口県',
        Tokushima:'徳島県', Kagawa:'香川県', Kochi:'高知県', Ehime:'愛媛県',
        Fukuoka:'福岡県', Saga:'佐賀県', Nagasaki:'長崎県',
        Oita:'大分県', Kumamoto:'熊本県', Miyazaki:'宮崎県', Kagoshima:'鹿児島県'
      };

      // =========================
      // 初期：県非表示
      // =========================
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'none';
        p.setAttribute('fill', '#ffffff');
        p.setAttribute('stroke', '#191970');
        p.setAttribute('stroke-width', '1'); // 初
      });

      // =========================
      // 地域クリック
      // =========================
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

      // =========================
      // UI生成
      // =========================
      const initialNav = createInitialNav();

      // 上下ダミー
      const topDummy = createTopDummy();
      const bottomDummy = createBottomDummy();

      // 4隅ダミーBOX
      const leftTopDummy = createCornerDummy('leftTop');
      const rightBottomDummy = createCornerDummy('rightBottom');
      const leftBottomDummy = createCornerDummy('leftBottom');
      const rightTopDummy = createCornerDummy('rightTop');

      // =========================
      // 地域表示
      // =========================
      function showRegion(gid){

        currentGroup = gid;

        initialNav.style.display = 'none';

        topDummy.style.display = 'flex';
        bottomDummy.style.display = 'flex';
        leftTopDummy.style.display = 'flex';
        rightBottomDummy.style.display = 'flex';
        leftBottomDummy.style.display = 'flex';
        rightTopDummy.style.display = 'flex';

        allGroups.forEach(g => g.style.display = 'none');

        prefGroup.querySelectorAll('path').forEach(p => {
          p.style.display = groupToPrefectures[gid].includes(p.id)
            ? 'inline'
            : 'none';
        });

        applyTransform(gid);
        addPrefLabels(groupToPrefectures[gid]);
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

        // 拡大時だけ線幅を細く
        prefGroup.querySelectorAll('path').forEach(p => {
          p.setAttribute('stroke-width', '0.3');
        });

      }

      function addPrefLabels(prefIds){

        svg.querySelectorAll('.pref-label').forEach(e => e.remove());

        prefIds.forEach(pid => {

          const p = prefGroup.querySelector(`#${pid}`);
          if (!p) return;

          const bbox = p.getBBox();

          const cx = bbox.x + bbox.width / 2;
          const cy = bbox.y + bbox.height / 2;

          const text = document.createElementNS('http://www.w3.org/2000/svg','text');

          text.setAttribute('x', cx);
          text.setAttribute('y', cy);
          text.setAttribute('text-anchor','middle');
          text.setAttribute('font-size','10');
          text.setAttribute('fill','#191970');

          text.textContent = prefNames[pid];

          svg.appendChild(text);
        });
      }

      // =========================
      // BOX共通
      // =========================
      function createBox(){
        const box = document.createElement('div');
        box.style.border = '1px solid #191970';
        box.style.background = '#fff';
        box.style.height = '26px';
        box.style.minWidth = '80px';
        box.style.display = 'flex';
        box.style.alignItems = 'center';
        box.style.justifyContent = 'center';
        box.style.fontSize = '13px';
        box.style.color = '#191970';
        box.style.boxShadow = '0 0 4px rgba(0,0,0,0.25)';
        return box;
      }

      // =========================
      // 初期ナビ
      // =========================
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

      // =========================
      // 上ダミー（中央上）
      // =========================
      function createTopDummy(){
        const wrapper = document.createElement('div');
        wrapper.id = 'topDummy';
        wrapper.style.position = 'absolute';
        wrapper.style.top = '5px';
        wrapper.style.left = '50%';
        wrapper.style.transform = 'translateX(-50%)';
        wrapper.style.display = 'none';
        wrapper.style.zIndex = '10';

        const nav = document.createElement('div');
        nav.style.display = 'flex';
        nav.style.flexWrap = 'wrap';
        nav.style.justifyContent = 'flex-start';
        nav.style.width = '340px';
        nav.style.gap = '4px';

        for(let i=0;i<5;i++){
          nav.appendChild(createBox());
        }

        wrapper.appendChild(nav);
        mapDiv.appendChild(wrapper);

        return wrapper;
      }

      // =========================
      // 下ダミー（中央下）
      // =========================
      function createBottomDummy(){
        const wrapper = document.createElement('div');
        wrapper.id = 'bottomDummy';
        wrapper.style.position = 'absolute';
        wrapper.style.bottom = '5px';
        wrapper.style.left = '50%';
        wrapper.style.transform = 'translateX(-50%)';
        wrapper.style.display = 'none';
        wrapper.style.gap = '6px';
        wrapper.style.zIndex = '10';

        for(let i=0;i<4;i++){
          wrapper.appendChild(createBox());
        }

        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      // =========================
      // 4隅ダミーBOX
      // =========================
      function createCornerDummy(position){
        const wrapper = document.createElement('div');
        wrapper.id = position + 'Dummy';
        wrapper.style.position = 'absolute';
        wrapper.style.display = 'none';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '4px';
        wrapper.style.zIndex = '10';

        const boxes = 3;

        if(position === 'leftTop'){
          wrapper.style.top = '5px';
          wrapper.style.left = '5px';
        } else if(position === 'rightBottom'){
          wrapper.style.bottom = '5px';
          wrapper.style.right = '5px';
        } else if(position === 'leftBottom'){
          wrapper.style.bottom = '5px';
          wrapper.style.left = '5px';
        } else if(position === 'rightTop'){
          wrapper.style.top = '5px';
          wrapper.style.right = '5px';
        }

        for(let i=0;i<boxes;i++){
          wrapper.appendChild(createBox());
        }

        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      // =========================
      // ★ ダミーBOXに色とラベル追加
      // =========================
      const colorMap = {
        topDummy:'#e0f7fa',
        bottomDummy:'#fff3e0',
        leftTopDummy:'#f1f8e9',
        rightBottomDummy:'#f1f8e9',
        leftBottomDummy:'#f1f8e9',
        rightTopDummy:'#f1f8e9'
      };

      Object.keys(colorMap).forEach(id => {
        const dummy = document.getElementById(id);
        if(dummy){
          const nav = dummy.querySelector(':scope > div') || dummy;
          nav.querySelectorAll(':scope > div').forEach((box, idx) => {
            box.style.background = colorMap[id];
            const label = document.createElement('span');
            label.textContent = `${id.replace('Dummy','')}-${idx+1}`;
            label.style.fontSize = '10px';
            label.style.marginLeft = '4px';
            box.appendChild(label);
          });
        }
      });

    });

});