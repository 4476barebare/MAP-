document.addEventListener('DOMContentLoaded', () => {

  const mapDiv = document.getElementById('map');

  let svg;
  let currentGroup = null;

  // 🔧 調整値
  const groupOffsets = {
    Path_1:{x:0,y:0}, Path_2:{x:0,y:0}, Path_3:{x:0,y:0}, Path_4:{x:0,y:0},
    Path_5:{x:0,y:0}, Path_6:{x:0,y:0}, Path_7:{x:0,y:0}, Path_8:{x:0,y:0}
  };

  const groupScales = {
    Path_1:1, Path_2:1, Path_3:1, Path_4:1,
    Path_5:1, Path_6:1, Path_7:1, Path_8:1
  };

  fetch('japan.svg')
    .then(res => res.text())
    .then(svgText => {

      mapDiv.innerHTML = svgText;
      svg = mapDiv.querySelector('svg');

      const prefGroup = svg.querySelector('#pref');

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

      // 初期：県非表示
      prefGroup.querySelectorAll('path').forEach(p => {
        p.style.display = 'none';
        p.style.fill = '#191970';
        p.style.stroke = '#fff';
        p.style.strokeWidth = '0.5px';
      });

      // グループ
      Object.keys(groupToPrefectures).forEach(gid => {
        const group = svg.getElementById(gid);
        if (!group) return;

        group.style.fill = '#191970';
        group.style.stroke = '#fff';
        group.style.strokeWidth = '3px';
        group.style.cursor = 'pointer';

        group.addEventListener('click', () => {

          currentGroup = gid;

          // 全グループ非表示
          Object.keys(groupToPrefectures).forEach(g => {
            const el = svg.getElementById(g);
            if (el) el.style.display = 'none';
          });

          // 対象県のみ表示
          prefGroup.querySelectorAll('path').forEach(p => {
            p.style.display = groupToPrefectures[gid].includes(p.id) ? 'inline' : 'none';
          });

          applyTransform(gid);
          updateDisplay();

        });
      });

      // 🔧 transform
      function applyTransform(gid){
        const group = svg.getElementById(gid);
        const bbox = group.getBBox();

        let cx = bbox.x + bbox.width/2 + groupOffsets[gid].x;
        let cy = bbox.y + bbox.height/2 + groupOffsets[gid].y;

        const scale = groupScales[gid];

        const svgW = svg.viewBox.baseVal.width;
        const svgH = svg.viewBox.baseVal.height;

        const tx = svgW/2 - cx * scale;
        const ty = svgH/2 - cy * scale;

        svg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      }

      // 🔧 UI生成
      createController();

      function createController(){

        const ctrl = document.createElement('div');
        ctrl.innerHTML = `
          <div style="position:fixed;bottom:20px;left:20px;z-index:9999;background:#0008;padding:10px;border-radius:10px;color:#fff">
            <div id="posDisplay">x:0 y:0 scale:1</div>
            <button onclick="move(0,-10)">↑</button><br>
            <button onclick="move(-10,0)">←</button>
            <button onclick="move(10,0)">→</button><br>
            <button onclick="move(0,10)">↓</button><br>
            <button onclick="zoom(0.2)">＋</button>
            <button onclick="zoom(-0.2)">－</button>
          </div>
        `;
        document.body.appendChild(ctrl);
      }

      // 🔧 グローバル操作
      window.move = (x,y)=>{
        if(!currentGroup) return;

        groupOffsets[currentGroup].x += x;
        groupOffsets[currentGroup].y += y;

        applyTransform(currentGroup);
        updateDisplay();

        console.log(currentGroup, groupOffsets[currentGroup]);
      };

      window.zoom = (z)=>{
        if(!currentGroup) return;

        groupScales[currentGroup] += z;

        applyTransform(currentGroup);
        updateDisplay();

        console.log(currentGroup, groupScales[currentGroup]);
      };

      function updateDisplay(){
        const d = document.getElementById('posDisplay');
        if(!currentGroup) return;

        d.textContent = `x:${groupOffsets[currentGroup].x} y:${groupOffsets[currentGroup].y} scale:${groupScales[currentGroup].toFixed(2)}`;
      }

    });

});