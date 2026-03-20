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
      // 地域設定（成功テイクそのまま）
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
      // ダミーBOX表示設定（追加）
      // =========================
      const groupBoxSettings = {
        Path_2: {
          leftTop: [0,1,2],
          rightBottom: [0,1,2]
        },
        Path_3: {
          rightTop: [0,1,2],
          leftBottom: [0,1,2,3,4]
        },
        Path_4: {
          rightTop: [0,1,2],
          leftBottom: [0,1,2,3]
        },
        Path_5: {
          rightTop: [0,1],
          leftBottom: [0,1,2,3,4]
        },
        Path_6: {
          top: [0,1,2,3,4],
          bottom: [0,1,2,3]
        },
        Path_7: {
          rightTop: [0,1,2],
          rightBottom: [0,1,2,3]
        }
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
        p.setAttribute('stroke-width', '1');
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
      // UI生成（成功テイクそのまま）
      // =========================
      const initialNav = createInitialNav();

      const topDummy = createTopDummy();
      const bottomDummy = createBottomDummy();
      const leftTopDummy = createCornerDummy('leftTop');
      const rightBottomDummy = createCornerDummy('rightBottom');
      const leftBottomDummy = createCornerDummy('leftBottom');
      const rightTopDummy = createCornerDummy('rightTop');

      // =========================
      // BOX制御（追加）
      // =========================
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
      }

      // =========================
      // 地域表示
      // =========================
      function showRegion(gid){
        currentGroup = gid;

        initialNav.style.display = 'none';

        // ★ここだけ変更
        hideAllBoxes();
        showBoxes(gid);

        allGroups.forEach(g => g.style.display = 'none');

        prefGroup.querySelectorAll('path').forEach(p => {
          p.style.display = groupToPrefectures[gid].includes(p.id) ? 'inline' : 'none';
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

        prefGroup.querySelectorAll('path').forEach(p => {
          p.setAttribute('stroke-width', '0.3');
        });
      }

      function addPrefLabels(prefIds){
        svg.querySelectorAll('.pref-label').forEach(e => e.remove());
        prefIds.forEach(pid => {
          const p = prefGroup.querySelector(`#${pid}`);
          if(!p) return;
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
      // 以下 UI系（完全据え置き）
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
          const box = createBox();
          box.style.background = '#ccf';
          box.textContent = `Top-${i+1}`;
          nav.appendChild(box);
        }

        wrapper.appendChild(nav);
        mapDiv.appendChild(wrapper);
        return wrapper;
      }

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
          const box = createBox();
          box.style.background = '#cfc';
          box.textContent = `Bottom-${i+1}`;
          wrapper.appendChild(box);
        }

        mapDiv.appendChild(wrapper);
        return wrapper;
      }

      function createCornerDummy(position){
        const wrapper = document.createElement('div');
        wrapper.id = position + 'Dummy';
        wrapper.style.position = 'absolute';
        wrapper.style.display = 'none';
        wrapper.style.flexDirection = 'column';
        wrapper.style.gap = '4px';
        wrapper.style.zIndex = '10';

        const boxes = 5;
        let color = '#fff';

        if(position === 'leftTop'){
          wrapper.style.top = '5px';
          wrapper.style.left = '5px';
          color = '#fcc';
        } else if(position === 'rightBottom'){
          wrapper.style.bottom = '5px';
          wrapper.style.right = '5px';
          color = '#fcf';
        } else if(position === 'leftBottom'){
          wrapper.style.bottom = '5px';
          wrapper.style.left = '5px';
          color = '#ffc';
        } else if(position === 'rightTop'){
          wrapper.style.top = '5px';
          wrapper.style.right = '5px';
          color = '#cff';
        }

        for(let i=0;i<boxes;i++){
          const box = createBox();
          box.style.background = color;
          box.textContent = `${position}-${i+1}`;
          wrapper.appendChild(box);
        }

        mapDiv.appendChild(wrapper);
        return wrapper;
      }

    });

});