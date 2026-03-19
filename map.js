document.addEventListener('DOMContentLoaded', () => {

  const mapDiv = document.getElementById('map');

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {

      mapDiv.innerHTML = svgText;

      const svg = mapDiv.querySelector('svg');
      if (!svg) return;

      const prefGroup = svg.querySelector('#pref');
      if (!prefGroup) return;

      svg.style.shapeRendering = 'geometricPrecision';
      svg.style.transformOrigin = 'center center';

      let currentGroup = null;

      // =========================
      // 地域拡大設定
      // =========================
      const groupSettings = {
        Path_1: { scale:3.4, x:230, y:0 },
        Path_2: { scale:3.4, x:190, y:110 },
        Path_3: { scale:5.2, x:130, y:130 },
        Path_4: { scale:5.6, x:90, y:140 },
        Path_5: { scale:7, x:30, y:160 },
        Path_6: { scale:4.8, x:0, y:200 },
        Path_7: { scale:5.8, x:-60, y:220 },
        Path_8: { scale:3.4, x:30, y:20 }
      };

      const groupToPrefectures = {
        Path_1:['Hokkaido'],
        Path_2:['Aomori','Iwate','Akita','Miyagi','Yamagata','Fukushima'],
        Path_3:['Niigata','Gunma','Tochigi','Chiba','Ibaraki','Tokyo','Saitama','Kanagawa'],
        Path_4:['Shizuoka','Yamanashi','Nagano','Ishikawa','Toyama','Gifu','Aichi'],
        Path_5:['Mie','Nara','Wakayama','Osaka','Shiga','Kyoto','Hyogo'],
        Path_6:['Tottori','Shimane','Okayama','Hiroshima','Yamaguchi','Tokushima','Kagawa','Kochi','Ehime'],
        Path_7:['Fukuoka','Saga','Nagasaki','Oita','Kumamoto','Miyazaki','Kagoshima'],
        Path_8:['Okinawa']
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
        Oita:'大分県', Kumamoto:'熊本県', Miyazaki:'宮崎県', Kagoshima:'鹿児島県',
        Okinawa:'沖縄県'
      };

      const prefCounts = {
        Tokyo:12,
        Kanagawa:8
      };

      // =========================
      // 初期：県非表示
      // =========================
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'none';
        p.style.fill = '#ffffff';
        p.style.stroke = '#191970';
        p.style.strokeWidth = '0.8px';
        p.style.vectorEffect = 'non-scaling-stroke';
      });

      // =========================
      // 地域クリック
      // =========================
      Object.keys(groupToPrefectures).forEach(gid => {

        const group = svg.querySelector('#' + gid);
        if (!group) return;

        group.style.fill = '#ffffff';
        group.style.stroke = '#191970';
        group.style.strokeWidth = '1.5px';
        group.style.cursor = 'pointer';
        group.style.vectorEffect = 'non-scaling-stroke';

        group.addEventListener('click', () => {
          showRegion(gid);
        });

      });

      function showRegion(gid){
        currentGroup = gid;

        Object.keys(groupToPrefectures).forEach(g => {
          const el = svg.querySelector('#' + g);
          if (el) el.style.display = 'none';
        });

        prefGroup.querySelectorAll('path').forEach(p => {
          p.style.display = groupToPrefectures[gid].includes(p.id) ? 'inline' : 'none';
        });

        applyTransform(gid);
        addPrefLabels(groupToPrefectures[gid]);
      }

      function applyTransform(gid){
        const group = svg.querySelector('#' + gid);
        if (!group) return;

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

      function addPrefLabels(prefIds){
        svg.querySelectorAll('.pref-label').forEach(e => e.remove());

        prefIds.forEach(pid => {
          const p = prefGroup.querySelector('#' + pid);
          if (!p) return;

          const bbox = p.getBBox();
          const cx = bbox.x + bbox.width/2;
          const cy = bbox.y + bbox.height/2;

          const text = document.createElementNS('http://www.w3.org/2000/svg','text');
          text.setAttribute('x', cx);
          text.setAttribute('y', cy);
          text.setAttribute('text-anchor','middle');
          text.setAttribute('class','pref-label');
          text.setAttribute('fill','#191970');
          text.style.fontSize = '12px';

          const t1 = document.createElementNS('http://www.w3.org/2000/svg','tspan');
          t1.setAttribute('x', cx);
          t1.setAttribute('dy','-0.3em');
          t1.textContent = prefNames[pid];

          const t2 = document.createElementNS('http://www.w3.org/2000/svg','tspan');
          t2.setAttribute('x', cx);
          t2.setAttribute('dy','1.2em');
          t2.textContent = `(${prefCounts[pid] || 0})`;

          text.appendChild(t1);
          text.appendChild(t2);
          svg.appendChild(text);
        });
      }

      // =========================
      // 左上ナビ（安定版）
      // =========================
      const regionNames = [
        {gid:'Path_1', name:'北海道'},
        {gid:'Path_2', name:'東北地方'},
        {gid:'Path_3', name:'関東新潟'},
        {gid:'Path_4', name:'中部地方'},
        {gid:'Path_5', name:'近畿地方'},
        {gid:'Path_6', name:'中国四国'},
        {gid:'Path_7', name:'九州地方'},
        {gid:'Path_8', name:'沖縄'}
      ];

      const navDiv = document.createElement('div');

      navDiv.style.position = 'fixed';
      navDiv.style.top = '60px';
      navDiv.style.left = '10px';
      navDiv.style.zIndex = '1';

      navDiv.style.display = 'inline-flex';
      navDiv.style.flexDirection = 'column';
      navDiv.style.gap = '2px';

      navDiv.style.pointerEvents = 'none';

      regionNames.forEach(r => {

        const btn = document.createElement('div');

        btn.textContent = r.name;
        btn.style.cursor = 'pointer';
        btn.style.padding = '2px 6px';
        btn.style.color = '#191970';
        btn.style.textAlign = 'center';
        btn.style.fontSize = '14px';

        btn.style.background = '#ffffff';
        btn.style.border = '1px solid #191970';
        btn.style.borderRadius = '4px';

        btn.style.pointerEvents = 'auto';

        btn.onclick = () => {
          const group = svg.querySelector('#' + r.gid);
          if (group) group.dispatchEvent(new Event('click'));
          navDiv.style.display = 'none';
        };

        navDiv.appendChild(btn);
      });

      document.body.appendChild(navDiv);

    });

});