// グローバル
window.prefData = null;
window.areaData = [];
window.spotData = [];
window.currentHash = '';

function loadLocationCSV(csvUrl, currentFile) {
    return fetch(csvUrl)
        .then(r => r.text())
        .then(text => {

            const lines = text.trim().split('\n');
            const filePref = currentFile.replace('.html', '').toUpperCase();

            let main = null;
            const areas = [];
            const spots = [];

            const allRows = lines.slice(1).map(line => {
                const cols = line.split(',');
                return {
                    name: cols[0].trim(),
                    zoom: parseFloat(cols[1]),
                    maxZoom: cols[2] ? parseFloat(cols[2]) : null,
                    lat: parseFloat(cols[3]),
                    lng: parseFloat(cols[4]),
                    parent: cols[5] ? cols[5].trim() : '',
                    url: cols[6] ? cols[6].trim() : '',
                    notes: cols[7] ? cols[7].trim() : '',
                    icon: cols[8] ? cols[8].trim().toLowerCase() : null
                };
            });

            // -------------------------
            // メイン
            // -------------------------
            allRows.forEach(row => {
                if (!row.parent && row.name.toUpperCase() === filePref) {
                    main = row;
                }
            });

            // -------------------------
            // エリア（★ここでareaId確定）
            // -------------------------
            allRows.forEach(row => {
                if (row.parent.toUpperCase() === filePref) {

                    // ★必ずここでIDを作る（基準軸）
                    row.areaId = filePref + '_' + (row.notes || row.name);

                    areas.push(row);
                }
            });

            // -------------------------
            // スポット（★areaId紐付け）
            // -------------------------
            allRows.forEach(row => {

                const icon = row.icon;
                if (!icon) return;

                if (icon === 'spot' || icon.startsWith('fish')) {

                    // ★親エリアからareaIdを引き継ぐ
                    const parentArea = areas.find(a => a.name === row.parent);

                    row.areaId = parentArea ? parentArea.areaId : null;

                    spots.push(row);
                }
            });

            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;

            return { main, areas, spots };
        });
}// グローバル
window.prefData = null;
window.areaData = [];
window.spotData = [];
window.currentHash = '';

function loadLocationCSV(csvUrl, currentFile) {
    return fetch(csvUrl)
        .then(r => r.text())
        .then(text => {

            const lines = text.trim().split('\n');
            const filePref = currentFile.replace('.html', '').toUpperCase();

            let main = null;
            const areas = [];
            const spots = [];

            const allRows = lines.slice(1).map(line => {
                const cols = line.split(',');
                return {
                    name: cols[0].trim(),
                    zoom: parseFloat(cols[1]),
                    maxZoom: cols[2] ? parseFloat(cols[2]) : null,
                    lat: parseFloat(cols[3]),
                    lng: parseFloat(cols[4]),
                    parent: cols[5] ? cols[5].trim() : '',
                    url: cols[6] ? cols[6].trim() : '',
                    notes: cols[7] ? cols[7].trim() : '',
                    icon: cols[8] ? cols[8].trim().toLowerCase() : null
                };
            });

            // -------------------------
            // メイン
            // -------------------------
            allRows.forEach(row => {
                if (!row.parent && row.name.toUpperCase() === filePref) {
                    main = row;
                }
            });

            // -------------------------
            // エリア（★ここでareaId確定）
            // -------------------------
            allRows.forEach(row => {
                if (row.parent.toUpperCase() === filePref) {

                    // ★必ずここでIDを作る（基準軸）
                    row.areaId = filePref + '_' + (row.notes || row.name);

                    areas.push(row);
                }
            });

            // -------------------------
            // スポット（★areaId紐付け）
            // -------------------------
            allRows.forEach(row => {

                const icon = row.icon;
                if (!icon) return;

                if (icon === 'spot' || icon.startsWith('fish')) {

                    // ★親エリアからareaIdを引き継ぐ
                    const parentArea = areas.find(a => a.name === row.parent);

                    row.areaId = parentArea ? parentArea.areaId : null;

                    spots.push(row);
                }
            });

            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;

            return { main, areas, spots };
        });
}// グローバル
window.prefData = null;
window.areaData = [];
window.spotData = [];
window.currentHash = '';

function loadLocationCSV(csvUrl, currentFile) {
    return fetch(csvUrl)
        .then(r => r.text())
        .then(text => {

            const lines = text.trim().split('\n');
            const filePref = currentFile.replace('.html', '').toUpperCase();

            let main = null;
            const areas = [];
            const spots = [];

            const allRows = lines.slice(1).map(line => {
                const cols = line.split(',');
                return {
                    name: cols[0].trim(),
                    zoom: parseFloat(cols[1]),
                    maxZoom: cols[2] ? parseFloat(cols[2]) : null,
                    lat: parseFloat(cols[3]),
                    lng: parseFloat(cols[4]),
                    parent: cols[5] ? cols[5].trim() : '',
                    url: cols[6] ? cols[6].trim() : '',
                    notes: cols[7] ? cols[7].trim() : '',
                    icon: cols[8] ? cols[8].trim().toLowerCase() : null
                };
            });

            // -------------------------
            // メイン
            // -------------------------
            allRows.forEach(row => {
                if (!row.parent && row.name.toUpperCase() === filePref) {
                    main = row;
                }
            });

            // -------------------------
            // エリア（★ここでareaId確定）
            // -------------------------
            allRows.forEach(row => {
                if (row.parent.toUpperCase() === filePref) {

                    // ★必ずここでIDを作る（基準軸）
                    row.areaId = filePref + '_' + (row.notes || row.name);

                    areas.push(row);
                }
            });

            // -------------------------
            // スポット（★areaId紐付け）
            // -------------------------
            allRows.forEach(row => {

                const icon = row.icon;
                if (!icon) return;

                if (icon === 'spot' || icon.startsWith('fish')) {

                    // ★親エリアからareaIdを引き継ぐ
                    const parentArea = areas.find(a => a.name === row.parent);

                    row.areaId = parentArea ? parentArea.areaId : null;

                    spots.push(row);
                }
            });

            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;

            return { main, areas, spots };
        });
}