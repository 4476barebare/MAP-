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

      // =========================
      // 状態管理
      // =========================
      let currentGroup = null;
      let currentLabel = null;

      const labelOffsets = {};

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

      // =========================
      // 地域 → 県
      // =========================
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

      // =========================
      // 県名
      // =========================
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
      // 初期
      // =========================
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'none';
        p.style.fill = '#191970';
        p.style.stroke = '#fff';
        p.style.strokeWidth = '0.5px';
        p.style.vectorEffect = 'non-scaling-stroke';
      });

      Object.keys(groupToPrefectures).forEach(gid => {

        const group = svg.getElementById(gid);
        if (!group) return;

        group.style.fill = '#191970';
        group.style.stroke = '#fff';
        group.style.strokeWidth = '2px';
        group.style.cursor = 'pointer';
        group.style.vectorEffect = 'non-scaling-stroke';

        group.addEventListener('click', () => {

          currentGroup = gid;

          Object.keys(groupToPrefectures).forEach(g => {
            const el = svg.getElementById(g);
            if (el) el.style.display = 'none';
          });

          prefGroup.querySelectorAll('path').forEach(p => {
            p.style.display = groupToPrefectures[gid].includes(p.id) ? 'inline' : 'none';
          });

          applyTransform(gid);
          addPrefLabels(groupToPrefectures[gid]);

        });

      });

      function applyTransform(gid){

        const group = svg.getElementById(gid);
        const bbox = group.getBBox();
        const s = groupSettings[gid];

        let cx = bbox.x + bbox.width/2 + s.x;
        let cy = bbox.y + bbox.height/2 + s.y;

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

          const p = prefGroup.querySelector(`#${pid}`);
          if (!p) return;

          const bbox = p.getBBox();

          let cx = bbox.x + bbox.width / 2;
          let cy = bbox.y + bbox.height / 2;

          const offset = labelOffsets[pid] || {x:0, y:0};
          cx += offset.x;
          cy += offset.y;

          const text = document.createElementNS('http://www.w3.org/2000/svg','text');
          text.setAttribute('x', cx);
          text.setAttribute('y', cy);
          text.setAttribute('text-anchor','middle');
          text.setAttribute('class','pref-label');

          text.addEventListener('click', () => {
            currentLabel = pid;
            updateLabelDisplay();
          });

          const t1 = document.createElementNS('http://www.w3.org/2000/svg','tspan');
          t1.setAttribute('x', cx);
          t1.setAttribute('dy','-0.3em');
          t1.textContent = prefNames[pid] || pid;

          const count = prefCounts[pid] || 0;

          const t2 = document.createElementNS('http://www.w3.org/2000/svg','tspan');
          t2.setAttribute('x', cx);
          t2.setAttribute('dy','1.2em');
          t2.textContent = `(${count})`;

          text.appendChild(t1);
          text.appendChild(t2);
          svg.appendChild(text);

        });
      }

      // =========================
      // 調整UI
      // =========================
      function createLabelController(){

        const ctrl = document.createElement('div');

        ctrl.innerHTML = `
          <div style="position:fixed;bottom:20px;right:20px;z-index:9999;background:#0008;padding:10px;border-radius:10px;color:#fff">
            <div id="labelDisplay">label: none</div>
            <button onclick="labelMove(0,-2)">↑</button><br>
            <button onclick="labelMove(-2,0)">←</button>
            <button onclick="labelMove(2,0)">→</button><br>
            <button onclick="labelMove(0,2)">↓</button>
          </div>
        `;

        document.body.appendChild(ctrl);
      }

      window.labelMove = (x,y)=>{

        if(!currentLabel || !currentGroup) return;

        if(!labelOffsets[currentLabel]){
          labelOffsets[currentLabel] = {x:0,y:0};
        }

        labelOffsets[currentLabel].x += x;
        labelOffsets[currentLabel].y += y;

        addPrefLabels(groupToPrefectures[currentGroup]);

        updateLabelDisplay();

        console.log(currentLabel, labelOffsets[currentLabel]);
      };

      function updateLabelDisplay(){

        const d = document.getElementById('labelDisplay');

        if(!currentLabel){
          d.textContent = 'label: none';
          return;
        }

        const o = labelOffsets[currentLabel] || {x:0,y:0};

        d.textContent = `${currentLabel} x:${o.x} y:${o.y}`;
      }

      createLabelController();

    })
    .catch(err => console.error('SVG読み込みエラー:', err));

});