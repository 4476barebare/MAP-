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
      // 地域設定（北海道・沖縄は拡大なし）
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
        Hokkaido:'北海道', Aomori:'青森県', Iwate:'岩手県', Akita:'秋田県',
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
        p.style.vectorEffect = 'non-scaling-stroke';
      });

      // =========================
      // 地域クリック設定
      // =========================
      const allGroups = svg.querySelectorAll('[id^="Path_"]');

      allGroups.forEach(g => {

        const gid = g.id;

        g.setAttribute('fill', '#ffffff');
        g.setAttribute('stroke', '#191970');
        g.style.vectorEffect = 'non-scaling-stroke';

        if(groupSettings[gid]){
          g.style.cursor = 'pointer';
          g.addEventListener('click', () => showRegion(gid));
        } else {
          g.style.cursor = 'default';
          g.addEventListener('click', (e) => e.stopPropagation());
        }

      });

      // =========================
      // UI生成
      // =========================
      const initialNav = createInitialNav();
      const leftDummy = createSideDummy('left');
      const rightDummy = createSideDummy('right');
      const topDummy = createTopDummy();
      const bottomDummy = createBottomDummy();

      // =========================
      // 地域表示
      // =========================
      function showRegion(gid){

        currentGroup = gid;

        // 初期ナビ消す
        initialNav.style.display = 'none';

        // ダミー表示
        leftDummy.style.display = 'flex';
        rightDummy.style.display = 'flex';
        topDummy.style.display = 'flex';
        bottomDummy.style.display = 'flex';

        // 地域非表示
        allGroups.forEach(g => g.style.display = 'none');

        // 県表示
        prefGroup.querySelectorAll('path').forEach(p => {
          p.style.display = groupToPrefectures[gid].includes(p.id)
            ? 'inline'
            : 'none';
        });

        applyTransform(gid);
        addPrefLabels(groupToPrefectures[gid]);
      }

      // =========================
      // 拡大
      // =========================
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

      // =========================
      // 県名ラベル
      // =========================
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
          text.setAttribute('class','pref-label');
          text.setAttribute('font-size', '10');
          text.setAttribute('fill', '#191970');

          const t1 = document.createElementNS('http://www.w3.org/2000/svg','tspan');
          t1.setAttribute('x', cx);
          t1.setAttribute('dy','0.35em');
          t1.textContent = prefNames[pid];

          text.appendChild(t1);
          svg.appendChild(text);
        });
      }

      // =========================
      // 初期ナビ
      // =========================
      function createInitialNav(){

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

        const nav = document.createElement('div');

        nav.style.position = 'fixed';
        nav.style.top = '60px';
        nav.style.left = '28px';
        nav.style.display = 'flex';
        nav.style.flexDirection = 'column';
        nav.style.gap = '4px';
        nav.style.zIndex = '10';

        regionList.forEach(r => {

          const box = createBox();
          box.textContent = r.name;

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
      // 共通BOX
      // =========================
      function createBox(){

        const box = document.createElement('div');

        box.style.border = '1px solid #191970';
        box.style.background = '#ffffff';
        box.style.height = '26px';
        box.style.minWidth = '80px';

        box.style.display = 'flex';
        box.style.alignItems = 'center';
        box.style.justifyContent = 'center';

        box.style.fontSize = '13px';

        return box;
      }

      // =========================
      // 左右ダミー
      // =========================
      function createSideDummy(side){

        const nav = document.createElement('div');

        nav.style.position = 'fixed';
        nav.style.top = '60px';
        nav.style.bottom = '20px';
        nav.style.display = 'none';
        nav.style.flexDirection = 'column';
        nav.style.justifyContent = 'flex-end';
        nav.style.gap = '4px';
        nav.style.zIndex = '10';

        if(side === 'left') nav.style.left = '28px';
        if(side === 'right') nav.style.right = '28px';

        for(let i=0;i<6;i++){
          nav.appendChild(createBox());
        }

        document.body.appendChild(nav);
        return nav;
      }

      // =========================
      // 上ダミー（5個・折り返し）
      // =========================
      function createTopDummy(){

        const nav = document.createElement('div');

        nav.style.position = 'fixed';
        nav.style.top = '60px';
        nav.style.left = '50%';
        nav.style.transform = 'translateX(-50%)';

        nav.style.display = 'none';
        nav.style.flexWrap = 'wrap';
        nav.style.justifyContent = 'center';
        nav.style.width = '340px';
        nav.style.gap = '4px';
        nav.style.zIndex = '10';

        for(let i=0;i<5;i++){
          nav.appendChild(createBox());
        }

        document.body.appendChild(nav);
        return nav;
      }

      // =========================
      // 下ダミー（4個）
      // =========================
      function createBottomDummy(){

        const nav = document.createElement('div');

        nav.style.position = 'fixed';
        nav.style.bottom = '10px';
        nav.style.left = '50%';
        nav.style.transform = 'translateX(-50%)';

        nav.style.display = 'none';
        nav.style.gap = '6px';
        nav.style.zIndex = '10';

        for(let i=0;i<4;i++){
          nav.appendChild(createBox());
        }

        document.body.appendChild(nav);
        return nav;
      }

    });

});